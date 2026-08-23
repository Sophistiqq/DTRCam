import { json, type RequestHandler } from '@sveltejs/kit';
import { requireApiKey, generateEtag } from '$lib/server/api-auth';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ request, url }) => {
	await requireApiKey(request);

	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const employeeNo = url.searchParams.get('employee_no');

	let query = supabaseAdmin
		.from('punches')
		.select(
			`
			id,
			work_date,
			punch_type,
			captured_at,
			received_at,
			lat,
			lng,
			gps_accuracy_m,
			location_source,
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
		.or('status.eq.quarantined,status.eq.late_sync,anomaly_flags.neq.{}')
		.order('captured_at', { ascending: false });

	if (from) query = query.gte('work_date', from);
	if (to) query = query.lte('work_date', to);
	if (employeeNo) query = query.eq('profiles.employee_no', employeeNo);

	const { data: rows, error: dbError } = await query;

	if (dbError) {
		return json({ error: `Failed to fetch anomalies: ${dbError.message}` }, { status: 500 });
	}

	const items = await Promise.all(
		(rows || []).map(async (row) => {
			let signedPhotoUrl: string | null = null;
			if (row.photo_path) {
				const { data: signedData } = await supabaseAdmin.storage
					.from('punch-media')
					.createSignedUrl(row.photo_path, 3600);
				signedPhotoUrl = signedData?.signedUrl || null;
			}

			const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

			return {
				id: row.id,
				employee_no: profile?.employee_no ?? null,
				full_name: profile?.full_name ?? null,
				work_date: row.work_date,
				punch_type: row.punch_type,
				captured_at: row.captured_at,
				received_at: row.received_at,
				status: row.status,
				quarantine_reason: row.quarantine_reason,
				anomaly_flags: row.anomaly_flags,
				location: {
					source: row.location_source,
					lat: row.lat,
					lng: row.lng,
					accuracy_m: row.gps_accuracy_m,
					manual_text: row.location_text
				},
				photo_url: signedPhotoUrl
			};
		})
	);

	const responsePayload = {
		data: items,
		total: items.length
	};

	const etag = generateEtag(responsePayload);
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { ETag: etag } });
	}

	return json(responsePayload, {
		headers: {
			ETag: etag,
			'Cache-Control': 'private, no-cache'
		}
	});
};
