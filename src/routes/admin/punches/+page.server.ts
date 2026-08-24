import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PunchStatus } from '$lib/types/database';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.profile || locals.profile.role !== 'admin') {
		redirect(302, '/login');
	}

	const statusFilter = url.searchParams.get('status') || '';
	const employeeFilter = url.searchParams.get('employee') || '';
	const dateFrom = url.searchParams.get('from') || '';
	const dateTo = url.searchParams.get('to') || '';
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));

	let query = supabaseAdmin
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
			gps_accuracy_m,
			location_text,
			photo_path,
			status,
			anomaly_flags,
			quarantine_reason,
			profiles!inner (
				employee_no,
				full_name
			)
		`,
			{ count: 'exact' }
		)
		.order('captured_at', { ascending: false });

	if (statusFilter) {
		query = query.eq('status', statusFilter as PunchStatus);
	}
	if (employeeFilter) {
		query = query.or(`profiles.employee_no.ilike.%${employeeFilter}%,profiles.full_name.ilike.%${employeeFilter}%`);
	}
	if (dateFrom) {
		query = query.gte('work_date', dateFrom);
	}
	if (dateTo) {
		query = query.lte('work_date', dateTo);
	}

	const from = (page - 1) * PAGE_SIZE;
	query = query.range(from, from + PAGE_SIZE - 1);

	const { data: rows, count, error: dbError } = await query;

	if (dbError) {
		console.error('[Admin] Error loading punches:', dbError);
	}

	const items = (rows || []).map((row) => {
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
			gps_accuracy_m: row.gps_accuracy_m,
			location_text: row.location_text,
			status: row.status,
			anomaly_flags: row.anomaly_flags,
			quarantine_reason: row.quarantine_reason
		};
	});

	return {
		punches: items,
		totalCount: count || 0,
		page,
		pageSize: PAGE_SIZE,
		filters: { status: statusFilter, employee: employeeFilter, from: dateFrom, to: dateTo }
	};
};
