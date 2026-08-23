import { json, type RequestHandler } from '@sveltejs/kit';
import { requireApiKey, generateEtag } from '$lib/server/api-auth';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ request, url }) => {
	await requireApiKey(request);

	const activeOnly = url.searchParams.get('active_only') !== 'false';

	let query = supabaseAdmin
		.from('profiles')
		.select('id, employee_no, full_name, role, is_active, created_at')
		.eq('role', 'employee')
		.order('employee_no', { ascending: true });

	if (activeOnly) {
		query = query.eq('is_active', true);
	}

	const { data: employees, error: dbError } = await query;

	if (dbError) {
		return json({ error: `Failed to fetch employee roster: ${dbError.message}` }, { status: 500 });
	}

	const responsePayload = {
		data: (employees || []).map((emp) => ({
			id: emp.id,
			employee_no: emp.employee_no,
			full_name: emp.full_name,
			is_active: emp.is_active,
			created_at: emp.created_at
		})),
		total: employees?.length || 0
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
