import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.profile || locals.profile.role !== 'admin') {
		redirect(302, '/login');
	}

	const actionFilter = url.searchParams.get('action');

	let query = supabaseAdmin
		.from('audit_log')
		.select(
			`
			id,
			actor,
			action,
			entity,
			entity_id,
			detail,
			at,
			profiles (
				full_name,
				employee_no
			)
		`
		)
		.order('at', { ascending: false })
		.limit(100);

	if (actionFilter) {
		query = query.eq('action', actionFilter);
	}

	const { data: logs, error: dbError } = await query;

	if (dbError) {
		console.error('[Admin] Error loading audit logs:', dbError);
	}

	return {
		logs: (logs || []).map((l) => {
			const profile = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
			return {
				id: l.id,
				actor_name: profile?.full_name || 'System / Auto',
				actor_emp_no: profile?.employee_no || null,
				action: l.action,
				entity: l.entity,
				entity_id: l.entity_id,
				detail: l.detail,
				at: l.at
			};
		}),
		currentAction: actionFilter || ''
	};
};
