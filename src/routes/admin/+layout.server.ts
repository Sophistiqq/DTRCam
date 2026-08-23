import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const { profile } = locals;

	if (!profile || profile.role !== 'admin') {
		redirect(302, '/login');
	}

	return { profile };
};
