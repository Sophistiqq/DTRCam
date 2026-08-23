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

	let query = supabaseAdmin
		.from('daily_summary')
		.select(
			`
			employee_id,
			work_date,
			first_in_at,
			last_out_at,
			location_in,
			location_out,
			status,
			built_at,
			profiles!inner (
				employee_no,
				full_name
			)
		`
		)
		.order('work_date', { ascending: true })
		.limit(limit + 1);

	if (from) query = query.gte('work_date', from);
	if (to) query = query.lte('work_date', to);
	if (employeeNo) query = query.eq('profiles.employee_no', employeeNo);
	if (cursor) query = query.gt('work_date', cursor);

	const { data: rows, error: dbError } = await query;

	if (dbError) {
		return json({ error: `Database query failed: ${dbError.message}` }, { status: 500 });
	}

	const hasMore = (rows?.length || 0) > limit;
	const items = hasMore ? rows.slice(0, limit) : rows || [];
	const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].work_date : null;

	const normalizedItems = items.map((row) => {
		const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
		return {
			employee_no: profile?.employee_no ?? null,
			full_name: profile?.full_name ?? null,
			work_date: row.work_date,
			time_in: row.first_in_at,
			time_out: row.last_out_at,
			location_in: row.location_in,
			location_out: row.location_out,
			status: row.status,
			updated_at: row.built_at
		};
	});

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
