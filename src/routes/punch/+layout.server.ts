import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const { profile } = locals;

	if (!profile || profile.role !== 'employee' || !profile.is_active) {
		redirect(302, `${base}/login`);
	}

	return { profile };
};
