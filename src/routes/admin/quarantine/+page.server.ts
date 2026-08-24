import { fail, redirect } from '@sveltejs/kit';
import crypto from 'node:crypto';
import type { PageServerLoad, Actions } from './$types';
import type { Json } from '$lib/types/database';
import { supabaseAdmin, writeAuditLog } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.profile || locals.profile.role !== 'admin') {
		redirect(302, '/login');
	}

	const { data: rows, error: dbError } = await supabaseAdmin
		.from('punches')
		.select(
			`
			id,
			employee_id,
			work_date,
			punch_type,
			captured_at,
			received_at,
			location_source,
			lat,
			lng,
			location_text,
			photo_path,
			payload_sha256,
			status,
			anomaly_flags,
			quarantine_reason,
			profiles!inner (
				employee_no,
				full_name
			)
		`
		)
		.eq('status', 'quarantined')
		// Duplicates are device-only backups — never shown in admin view
		.not('quarantine_reason', 'ilike', '%duplicate%')
		.order('captured_at', { ascending: false });

	if (dbError) {
		console.error('[Admin] Error loading quarantine queue:', dbError);
	}

	// Generate signed URLs for photos
	const items = await Promise.all(
		(rows || []).map(async (row) => {
			let photoUrl: string | null = null;
			if (row.photo_path) {
				const { data: signedData } = await supabaseAdmin.storage
					.from('punch-media')
					.createSignedUrl(row.photo_path, 3600);
				photoUrl = signedData?.signedUrl || null;
			}

			const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

			return {
				id: row.id,
				employee_no: profile?.employee_no ?? 'Unknown',
				full_name: profile?.full_name ?? 'Unknown',
				work_date: row.work_date,
				punch_type: row.punch_type,
				captured_at: row.captured_at,
				received_at: row.received_at,
				location_source: row.location_source,
				coords: row.lat && row.lng ? `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}` : null,
				location_text: row.location_text,
				photo_url: photoUrl,
				quarantine_reason: row.quarantine_reason || 'Unknown quarantine flag',
				anomaly_flags: row.anomaly_flags
			};
		})
	);

	return {
		quarantined: items
	};
};

export const actions: Actions = {
	forceAccept: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		const note = String(formData.get('note') ?? '').trim();

		if (!id) return fail(400, { error: 'Missing punch ID' });

		const { data: punch } = await supabaseAdmin
			.from('punches')
			.select('anomaly_flags, employee_id, captured_at, punch_type, payload_sha256')
			.eq('id', id)
			.single();

		if (!punch) return fail(400, { error: 'Punch not found' });

		// Recompute hash chain: find the chain head before this punch
		const { data: prevPunch } = await supabaseAdmin
			.from('punches')
			.select('row_hash')
			.eq('employee_id', punch.employee_id)
			.neq('status', 'quarantined')
			.neq('id', id)
			.lt('captured_at', punch.captured_at)
			.order('captured_at', { ascending: false })
			.limit(1);

		const prevHash = prevPunch?.[0]?.row_hash || 'genesis';
		const rowHash = crypto
			.createHash('sha256')
			.update(`${prevHash}:${punch.payload_sha256}:${punch.captured_at}:${punch.employee_id}:${punch.punch_type}`)
			.digest('hex');

		const updatedFlags = {
			...((punch?.anomaly_flags as Record<string, unknown>) || {}),
			force_accepted_by: locals.profile?.full_name,
			force_accepted_at: new Date().toISOString(),
			admin_note: note || 'Manually accepted by HR administrator'
		};

		const { error: updateError } = await supabaseAdmin
			.from('punches')
			.update({
				status: 'accepted',
				prev_hash: prevHash,
				row_hash: rowHash,
				anomaly_flags: updatedFlags
			})
			.eq('id', id);

		if (updateError) {
			return fail(400, { error: updateError.message });
		}

		await writeAuditLog(locals.profile?.id || null, 'quarantine_force_accept', 'punch', id, { note });

		return { success: true };
	},

	discard: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		const reason = String(formData.get('reason') ?? '').trim();

		if (!id) return fail(400, { error: 'Missing punch ID' });

		const { error: updateError } = await supabaseAdmin
			.from('punches')
			.update({
				status: 'superseded',
				quarantine_reason: `Discarded by admin: ${reason || 'Invalid record'}`
			})
			.eq('id', id);

		if (updateError) {
			return fail(400, { error: updateError.message });
		}

		await writeAuditLog(locals.profile?.id || null, 'quarantine_discard', 'punch', id, { reason });

		return { success: true };
	}
};
