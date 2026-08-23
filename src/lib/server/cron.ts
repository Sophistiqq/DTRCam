/**
 * Scheduled Cron Jobs for DTRCam
 * Runs inside the server process to rebuild daily summaries, prune stale devices, and verify hash chains.
 */

import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase';
import { debugEmit, debugLog } from './debug';
import type { SummaryStatus } from '$lib/types/database';

let _cronStarted = false;

/**
 * Rebuild daily attendance summary for a given work date (YYYY-MM-DD)
 */
export async function rebuildDailySummary(targetDate?: string): Promise<void> {
	// Default to yesterday if not specified
	if (!targetDate) {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		const y = yesterday.getFullYear();
		const m = String(yesterday.getMonth() + 1).padStart(2, '0');
		const d = String(yesterday.getDate()).padStart(2, '0');
		targetDate = `${y}-${m}-${d}`;
	}

	debugLog(`Running daily summary rollup for ${targetDate}`);

	// 1. Fetch all active employees
	const { data: employees, error: empError } = await supabaseAdmin
		.from('profiles')
		.select('id, employee_no')
		.eq('role', 'employee')
		.eq('is_active', true);

	if (empError || !employees) {
		console.error('[Cron] Failed to fetch employees for summary:', empError);
		return;
	}

	// 2. Fetch all accepted/late_sync punches for targetDate
	const { data: punches, error: punchError } = await supabaseAdmin
		.from('punches')
		.select('employee_id, punch_type, captured_at, lat, lng, location_source, location_text, address_enriched')
		.eq('work_date', targetDate)
		.in('status', ['accepted', 'late_sync'])
		.order('captured_at', { ascending: true });

	if (punchError) {
		console.error('[Cron] Failed to fetch punches for summary:', punchError);
		return;
	}

	// 3. Aggregate per employee
	const punchMap = new Map<string, typeof punches>();
	for (const p of punches || []) {
		const list = punchMap.get(p.employee_id) || [];
		list.push(p);
		punchMap.set(p.employee_id, list);
	}

	const summariesToUpsert = [];

	for (const emp of employees) {
		const empPunches = punchMap.get(emp.id) || [];
		const inPunches = empPunches.filter((p) => p.punch_type === 'in');
		const outPunches = empPunches.filter((p) => p.punch_type === 'out');

		const firstIn = inPunches[0] || null;
		const lastOut = outPunches[outPunches.length - 1] || null;

		let status: SummaryStatus = 'absent';
		if (firstIn && lastOut) {
			status = 'complete';
		} else if (firstIn && !lastOut) {
			status = 'missing_out';
		}

		function formatLoc(p: typeof firstIn) {
			if (!p) return null;
			if (p.location_source === 'gps' && p.lat && p.lng) {
				return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
			}
			return p.location_text || null;
		}

		summariesToUpsert.push({
			employee_id: emp.id,
			work_date: targetDate,
			first_in_at: firstIn ? firstIn.captured_at : null,
			last_out_at: lastOut ? lastOut.captured_at : null,
			location_in: formatLoc(firstIn),
			location_out: formatLoc(lastOut),
			status,
			built_at: new Date().toISOString()
		});
	}

	if (summariesToUpsert.length > 0) {
		const { error: upsertError } = await supabaseAdmin
			.from('daily_summary')
			.upsert(summariesToUpsert, { onConflict: 'employee_id,work_date' });

		if (upsertError) {
			console.error('[Cron] Failed to upsert daily summaries:', upsertError);
		} else {
			debugLog(`Successfully built daily summary for ${summariesToUpsert.length} employees on ${targetDate}`);
			debugEmit('cron_daily_summary_completed', { date: targetDate, count: summariesToUpsert.length });
		}
	}
}

/**
 * Housekeeping: prune old devices not seen in > 90 days
 */
export async function runHousekeeping(): Promise<void> {
	debugLog('Running system housekeeping');
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 90);

	await supabaseAdmin
		.from('devices')
		.delete()
		.lt('last_seen_at', cutoff.toISOString());
}

/**
 * Hash chain integrity sweep for all employees
 */
export async function runIntegritySweep(): Promise<void> {
	debugLog('Running hash chain integrity sweep');

	const { data: employees } = await supabaseAdmin
		.from('profiles')
		.select('id, employee_no')
		.eq('role', 'employee');

	for (const emp of employees || []) {
		const { data: punches } = await supabaseAdmin
			.from('punches')
			.select('id, punch_type, captured_at, payload_sha256, prev_hash, row_hash')
			.eq('employee_id', emp.id)
			.neq('status', 'quarantined')
			.order('captured_at', { ascending: true });

		let expectedPrev = 'genesis';
		let broken = false;

		for (const p of punches || []) {
			if (p.prev_hash && p.prev_hash !== expectedPrev) {
				console.warn(`[Integrity] Chain break detected on employee ${emp.employee_no}, punch ${p.id}`);
				broken = true;
				break;
			}

			const expectedRowHash = crypto
				.createHash('sha256')
				.update(`${expectedPrev}:${p.payload_sha256}:${p.captured_at}:${emp.id}:${p.punch_type}`)
				.digest('hex');

			if (p.row_hash !== expectedRowHash) {
				console.warn(`[Integrity] Row hash mismatch on employee ${emp.employee_no}, punch ${p.id}`);
				broken = true;
				break;
			}

			expectedPrev = p.row_hash;
		}

		if (!broken && (punches?.length || 0) > 0) {
			debugLog(`Hash chain verified intact for employee ${emp.employee_no} (${punches?.length} punches)`);
		}
	}
}

/**
 * Start the background cron scheduler
 */
export function initCronScheduler() {
	if (_cronStarted) return;
	_cronStarted = true;

	console.log('[Cron] Initialized background scheduler');

	// Check every minute if it's 02:00 or 03:00 UTC/Local
	let lastDailyRun = '';

	setInterval(() => {
		const now = new Date();
		const hours = now.getHours();
		const minutes = now.getMinutes();
		const dateStr = now.toISOString().split('T')[0];

		// 02:00 Daily Summary Run
		if (hours === 2 && minutes === 0 && lastDailyRun !== dateStr) {
			lastDailyRun = dateStr;
			rebuildDailySummary().catch(console.error);
		}

		// 03:00 Housekeeping Run
		if (hours === 3 && minutes === 0) {
			runHousekeeping().catch(console.error);
			runIntegritySweep().catch(console.error);
		}
	}, 60 * 1000);
}
