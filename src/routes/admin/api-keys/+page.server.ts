import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin, writeAuditLog } from '$lib/server/supabase';
import { createApiKey } from '$lib/server/api-auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.profile || locals.profile.role !== 'admin') {
		redirect(302, '/login');
	}

	const { data: keys, error: dbError } = await supabaseAdmin
		.from('api_keys')
		.select('id, label, is_active, last_used_at, created_at')
		.order('created_at', { ascending: false });

	if (dbError) {
		console.error('[Admin] Error loading API keys:', dbError);
	}

	return {
		keys: (keys || []) as Array<{
			id: string;
			label: string;
			is_active: boolean;
			last_used_at: string | null;
			created_at: string;
		}>
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		const label = String(formData.get('label') ?? '').trim();

		if (!label) {
			return fail(400, { error: 'A descriptive label is required (e.g. VFP Production Payroll).' });
		}

		try {
			const result = await createApiKey(label);
			await writeAuditLog(locals.profile?.id || null, 'create_api_key', 'api_key', result.id, { label });

			return {
				success: true,
				newKey: result
			};
		} catch (err: unknown) {
			const error = err as { message?: string };
			return fail(400, { error: error.message || 'Failed to create API key' });
		}
	},

	revoke: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		if (!id) return fail(400, { error: 'Missing key ID' });

		const { error: dbError } = await supabaseAdmin
			.from('api_keys')
			.update({ is_active: false })
			.eq('id', id);

		if (dbError) return fail(400, { error: dbError.message });

		await writeAuditLog(locals.profile?.id || null, 'revoke_api_key', 'api_key', id, {});

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		if (!id) return fail(400, { error: 'Missing key ID' });

		const { error: dbError } = await supabaseAdmin
			.from('api_keys')
			.delete()
			.eq('id', id);

		if (dbError) return fail(400, { error: dbError.message });

		await writeAuditLog(locals.profile?.id || null, 'delete_api_key', 'api_key', id, {});

		return { success: true };
	}
};
