import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const { profile } = locals;

	if (!profile || profile.role !== 'admin') {
		redirect(302, `${base}/login`);
	}

	return { profile };
};
