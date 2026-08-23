import { json, type RequestHandler } from '@sveltejs/kit';
import { requireApiKey, generateEtag } from '$lib/server/api-auth';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ request, url }) => {
	await requireApiKey(request);

	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const employeeNo = url.searchParams.get('employee_no');
	const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 200);
	const cursor = url.searchParams.get('cursor');

	// Build query
	let query = supabaseAdmin
		.from('punches')
		.select(
			`
			id,
			work_date,
			punch_type,
			captured_at,
			received_at,
			trusted_clock_epoch,
			lat,
			lng,
			gps_accuracy_m,
			location_source,
			location_text,
			address_enriched,
			photo_path,
			payload_sha256,
			row_hash,
			status,
			anomaly_flags,
			created_at,
			profiles!inner (
				employee_no,
				full_name
			)
		`
		)
		.in('status', ['accepted', 'late_sync'])
		.order('captured_at', { ascending: true })
		.limit(limit + 1);

	if (from) query = query.gte('work_date', from);
	if (to) query = query.lte('work_date', to);
	if (employeeNo) query = query.eq('profiles.employee_no', employeeNo);
	if (cursor) query = query.gt('captured_at', cursor);

	const { data: rows, error: dbError } = await query;

	if (dbError) {
		return json({ error: `Database query failed: ${dbError.message}` }, { status: 500 });
	}

	const hasMore = (rows?.length || 0) > limit;
	const items = hasMore ? rows.slice(0, limit) : rows || [];
	const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].captured_at : null;

	// Generate signed URLs for photo paths in parallel
	const normalizedItems = await Promise.all(
		items.map(async (row) => {
			let signedPhotoUrl: string | null = null;
			if (row.photo_path) {
				const { data: signedData } = await supabaseAdmin.storage
					.from('punch-media')
					.createSignedUrl(row.photo_path, 3600); // 1 hour TTL
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
				location: {
					source: row.location_source,
					lat: row.lat,
					lng: row.lng,
					accuracy_m: row.gps_accuracy_m,
					manual_text: row.location_text,
					address: row.address_enriched
				},
				photo_url: signedPhotoUrl,
				payload_sha256: row.payload_sha256,
				row_hash: row.row_hash,
				status: row.status,
				anomaly_flags: row.anomaly_flags
			};
		})
	);

	const responsePayload = {
		data: normalizedItems,
		pagination: {
			limit,
			has_more: hasMore,
			next_cursor: nextCursor
		}
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
