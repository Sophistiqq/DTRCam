import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.profile || locals.profile.role !== 'admin') {
		redirect(302, '/login');
	}

	const [employeesRes, keysRes, quarantineRes, punchesRes] = await Promise.all([
		supabaseAdmin.from('profiles').select('id, is_active', { count: 'exact' }).eq('role', 'employee'),
		supabaseAdmin.from('api_keys').select('id', { count: 'exact' }).eq('is_active', true),
		supabaseAdmin.from('punches').select('id', { count: 'exact' }).eq('status', 'quarantined'),
		supabaseAdmin.from('punches').select('id', { count: 'exact' })
	]);

	return {
		stats: {
			totalEmployees: employeesRes.count || 0,
			activeApiKeys: keysRes.count || 0,
			quarantinePending: quarantineRes.count || 0,
			totalPunches: punchesRes.count || 0
		}
	};
};
