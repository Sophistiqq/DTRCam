import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const { profile } = locals;

	if (!profile || profile.role !== 'employee' || !profile.is_active) {
		redirect(302, '/login');
	}

	return { profile };
};
