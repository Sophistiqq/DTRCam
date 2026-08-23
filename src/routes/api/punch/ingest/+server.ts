import { json, type RequestHandler } from '@sveltejs/kit';
import crypto from 'node:crypto';
import { supabaseAdmin } from '$lib/server/supabase';
import { debugEmit, debugLog } from '$lib/server/debug';
import type { LocationSource, PunchStatus, PunchType } from '$lib/types/database';

// Tolerances
const FUTURE_TOLERANCE_MS = (parseInt(process.env.FUTURE_TOLERANCE_MINUTES || '2', 10) || 2) * 60 * 1000;
const LATE_SYNC_MS = (parseInt(process.env.LATE_SYNC_HOURS || '12', 10) || 12) * 60 * 60 * 1000;
const CLOCK_DRIFT_MS = (parseInt(process.env.CLOCK_DRIFT_TOLERANCE_MINUTES || '2', 10) || 2) * 60 * 1000;

interface IngestMetadata {
	id: string;
	employee_id?: string;
	work_date: string;
	punch_type: PunchType;
	captured_at: string;
	trusted_clock_epoch?: number;
	clock_offset_ms?: number | null;
	lat?: number | null;
	lng?: number | null;
	gps_accuracy_m?: number | null;
	location_source: LocationSource;
	location_text?: string | null;
	payload_sha256: string;
	prev_hash?: string | null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const receivedAt = new Date();

	try {
		const formData = await request.formData();
		const photoFile = formData.get('photo') as File | null;
		const rawMetadata = formData.get('metadata') as string | null;

		if (!photoFile || !rawMetadata) {
			return json({ error: 'Missing required photo or metadata in upload' }, { status: 400 });
		}

		const metadata: IngestMetadata = JSON.parse(rawMetadata);

		// Determine employee_id: prefer authenticated session, fallback to metadata if authorized
		const employeeId = locals.user?.id || metadata.employee_id;
		if (!employeeId) {
			return json({ error: 'Unauthenticated punch upload' }, { status: 401 });
		}

		debugLog(`Ingest received for employee: ${employeeId}`, {
			type: metadata.punch_type,
			captured_at: metadata.captured_at
		});

		// 1. Read Photo Buffer & Verify Payload SHA-256
		const arrayBuffer = await photoFile.arrayBuffer();
		const photoBuffer = Buffer.from(arrayBuffer);
		const computedSha256 = crypto.createHash('sha256').update(photoBuffer).digest('hex');

		let status: PunchStatus = 'accepted';
		let quarantineReason: string | null = null;
		const anomalyFlags: Record<string, unknown> = {};

		// Validation A: Hash Check
		if (computedSha256.toLowerCase() !== metadata.payload_sha256.toLowerCase()) {
			status = 'quarantined';
			quarantineReason = `Payload SHA-256 mismatch (client: ${metadata.payload_sha256.slice(0, 8)}, server: ${computedSha256.slice(0, 8)})`;
			anomalyFlags.hash_mismatch = true;
		}

		// Validation B: Clock / Future Drift & Late Sync Checks
		const capturedDate = new Date(metadata.captured_at);
		const captureEpoch = capturedDate.getTime();
		const receivedEpoch = receivedAt.getTime();

		if (isNaN(captureEpoch)) {
			return json({ error: 'Invalid captured_at timestamp' }, { status: 400 });
		}

		// Check for future time tampering or extreme clock desync
		if (captureEpoch > receivedEpoch + FUTURE_TOLERANCE_MS) {
			status = 'quarantined';
			const aheadSec = Math.round((captureEpoch - receivedEpoch) / 1000);
			quarantineReason = `Phone clock is out of sync with DTRCam server (${aheadSec}s in future)`;
			anomalyFlags.future_clock_drift = true;
			anomalyFlags.clock_desync = true;
		} else if (metadata.clock_offset_ms && Math.abs(metadata.clock_offset_ms) > CLOCK_DRIFT_MS) {
			status = 'quarantined';
			const driftSec = Math.round(Math.abs(metadata.clock_offset_ms) / 1000);
			quarantineReason = `Phone clock is out of sync with DTRCam trusted clock (${driftSec}s ${metadata.clock_offset_ms > 0 ? 'behind' : 'ahead'})`;
			anomalyFlags.clock_desync = true;
		} else if (receivedEpoch - captureEpoch > LATE_SYNC_MS) {
			if (status !== 'quarantined') {
				status = 'late_sync';
			}
			anomalyFlags.late_sync = true;
		}

		// Validation C: Location completeness
		if (metadata.location_source === 'gps') {
			if (metadata.lat == null || metadata.lng == null) {
				return json({ error: 'GPS location source selected but coordinates are missing' }, { status: 400 });
			}
			if (metadata.gps_accuracy_m != null && metadata.gps_accuracy_m > 100) {
				anomalyFlags.poor_gps_accuracy = true;
			}
		} else if (metadata.location_source === 'manual') {
			if (!metadata.location_text?.trim()) {
				return json({ error: 'Manual location text is required' }, { status: 400 });
			}
			anomalyFlags.manual_location = true;
		} else {
			return json({ error: 'Invalid location source' }, { status: 400 });
		}

		// Validation D: Missing TIME IN check on TIME OUT
		if (metadata.punch_type === 'out') {
			const { data: existingIn } = await supabaseAdmin
				.from('punches')
				.select('id')
				.eq('employee_id', employeeId)
				.eq('work_date', metadata.work_date)
				.eq('punch_type', 'in')
				.in('status', ['accepted', 'late_sync'])
				.limit(1);

			if (!existingIn || existingIn.length === 0) {
				anomalyFlags.missing_in = true;
			}
		}

		// Validation E: Duplicate check — any existing record of the same type on
		// the same work date rejects this punch (kept on-device only, not stored)
		const { data: existingPunches } = await supabaseAdmin
			.from('punches')
			.select('id')
			.eq('employee_id', employeeId)
			.eq('work_date', metadata.work_date)
			.eq('punch_type', metadata.punch_type)
			.neq('status', 'superseded')
			.limit(1);

		if (existingPunches && existingPunches.length > 0) {
			debugLog(`Duplicate ${metadata.punch_type.toUpperCase()} rejected for employee ${employeeId} on ${metadata.work_date}`);
			return json(
				{
					error: `Duplicate ${metadata.punch_type.toUpperCase()} record on ${metadata.work_date}`,
					duplicate: true
				},
				{ status: 409 }
			);
		}

		// 2. Hash Chaining
		const { data: lastPunch } = await supabaseAdmin
			.from('punches')
			.select('row_hash')
			.eq('employee_id', employeeId)
			.neq('status', 'quarantined')
			.order('captured_at', { ascending: false })
			.limit(1);

		const prevHash = lastPunch?.[0]?.row_hash || 'genesis';
		const rowHash = crypto
			.createHash('sha256')
			.update(`${prevHash}:${computedSha256}:${metadata.captured_at}:${employeeId}:${metadata.punch_type}`)
			.digest('hex');

		// 3. Upload Photo to Supabase Storage
		const punchId = metadata.id || crypto.randomUUID();
		const dateObj = new Date(metadata.captured_at);
		const yyyyMm = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
		const photoPath = `punches/${employeeId}/${yyyyMm}/${punchId}.jpg`;

		const { error: uploadError } = await supabaseAdmin.storage
			.from('punch-media')
			.upload(photoPath, photoBuffer, {
				contentType: 'image/jpeg',
				upsert: true
			});

		if (uploadError) {
			console.warn('[Storage] Supabase storage upload warning:', uploadError.message);
		}

		// 4. Device registration / offset tracking
		let syncedDeviceId: string | null = null;
		try {
			const userAgent = request.headers.get('user-agent') || 'Unknown';
			const clockOffsetMs = receivedEpoch - captureEpoch;

			const { data: deviceData } = await supabaseAdmin
				.from('devices')
				.upsert(
					{
						employee_id: employeeId,
						model: userAgent.slice(0, 100),
						os: userAgent.includes('iPhone') ? 'iOS' : userAgent.includes('Android') ? 'Android' : 'Web',
						last_seen_at: receivedAt.toISOString(),
						clock_offset_ms: clockOffsetMs
					},
					{ onConflict: 'employee_id' }
				)
				.select('id')
				.single();

			if (deviceData) syncedDeviceId = deviceData.id;
		} catch (deviceErr) {
			console.warn('[Device] Device tracking error:', deviceErr);
		}

		// 5. Insert Record into Punches Table
		const punchRecord = {
			id: punchId,
			employee_id: employeeId,
			work_date: metadata.work_date,
			punch_type: metadata.punch_type,
			captured_at: metadata.captured_at,
			received_at: receivedAt.toISOString(),
			trusted_clock_epoch: metadata.trusted_clock_epoch || captureEpoch,
			lat: metadata.lat ?? null,
			lng: metadata.lng ?? null,
			gps_accuracy_m: metadata.gps_accuracy_m ?? null,
			location_source: metadata.location_source,
			location_text: metadata.location_text ?? null,
			address_enriched: null,
			photo_path: photoPath,
			thumb_path: null,
			payload_sha256: computedSha256,
			prev_hash: prevHash,
			row_hash: rowHash,
			status,
			anomaly_flags: anomalyFlags,
			quarantine_reason: quarantineReason,
			synced_device_id: syncedDeviceId
		};

		const { error: insertError } = await supabaseAdmin
			.from('punches')
			.insert(punchRecord);

		if (insertError) {
			console.error('[DB] Insert punch error:', insertError);
			return json({ error: `Database insertion error: ${insertError.message}` }, { status: 500 });
		}

		// 6. Emit Debug Events
		debugEmit('punch_received', {
			id: punchId,
			employee_id: employeeId,
			status,
			punch_type: metadata.punch_type,
			anomalies: anomalyFlags
		});

		return json({
			success: true,
			id: punchId,
			status,
			anomaly_flags: anomalyFlags,
			quarantine_reason: quarantineReason
		});
	} catch (err: unknown) {
		console.error('[Ingest] Ingest handler error:', err);
		const error = err as { message?: string };
		return json({ error: error.message || 'Internal server error processing punch' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ locals, url }) => {
	const { profile } = locals;
	if (!profile || !profile.is_active) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const sinceDays = parseInt(url.searchParams.get('days') || '7', 10);
	const since = new Date();
	since.setDate(since.getDate() - sinceDays);

	const { data, error } = await supabaseAdmin
		.from('punches')
		.select(
			'id, work_date, punch_type, captured_at, trusted_clock_epoch, lat, lng, gps_accuracy_m, location_source, location_text, payload_sha256, photo_path, status, quarantine_reason'
		)
		.eq('employee_id', profile.id)
		.gte('work_date', since.toISOString().slice(0, 10))
		.order('captured_at', { ascending: false });

	if (error) {
		console.error('[API /punch/ingest GET] DB error:', error);
		return json({ error: 'Failed to fetch history' }, { status: 500 });
	}

	return json({ records: data || [] });
};

