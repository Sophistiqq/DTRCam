import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin, writeAuditLog } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.profile || locals.profile.role !== 'admin') {
		redirect(302, '/login');
	}

	const { data: employees, error: dbError } = await supabaseAdmin
		.from('profiles')
		.select('*')
		.order('employee_no', { ascending: true });

	if (dbError) {
		console.error('[Admin] Error loading employees:', dbError);
	}

	return {
		employees: (employees || []) as Array<{
			id: string;
			employee_no: string;
			full_name: string;
			role: 'employee' | 'admin';
			is_active: boolean;
			created_at: string;
		}>
	};
};

function generateDefaultPassword(fullName: string, empNo: string): string {
	const initials = fullName
		.trim()
		.split(/\s+/)
		.map((w) => w[0]?.toLowerCase() || '')
		.join('');
	return `${initials || 'emp'}@${empNo.trim()}`;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		const employeeNo = String(formData.get('employee_no') ?? '').trim();
		const fullName = String(formData.get('full_name') ?? '').trim();
		const role = String(formData.get('role') ?? 'employee').trim() as 'employee' | 'admin';
		const customPassword = String(formData.get('password') ?? '').trim();

		if (!employeeNo || !fullName) {
			return fail(400, { error: 'Employee number and full name are required.' });
		}

		const email = `${employeeNo.toLowerCase()}@dtrcam.internal`;
		const password = customPassword || generateDefaultPassword(fullName, employeeNo);

		// 1. Create Auth user
		const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
			user_metadata: { employee_no: employeeNo, full_name: fullName, role }
		});

		if (authError) {
			return fail(400, { error: `Auth user creation failed: ${authError.message}` });
		}

		const userId = authData.user.id;

		// 2. Insert Profile
		const { error: profileError } = await supabaseAdmin.from('profiles').insert({
			id: userId,
			employee_no: employeeNo,
			full_name: fullName,
			role,
			is_active: true,
			created_by: locals.profile?.id || null
		});

		if (profileError) {
			// Rollback auth user
			await supabaseAdmin.auth.admin.deleteUser(userId);
			return fail(400, { error: `Profile creation failed: ${profileError.message}` });
		}

		await writeAuditLog(locals.profile?.id || null, 'create_employee', 'profile', userId, {
			employee_no: employeeNo,
			full_name: fullName,
			role
		});

		return {
			success: true,
			createdEmployee: {
				employee_no: employeeNo,
				full_name: fullName,
				temp_password: password
			}
		};
	},

	toggleActive: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		const isActive = formData.get('is_active') === 'true';

		if (!id) return fail(400, { error: 'Missing employee ID' });

		const { error: updateError } = await supabaseAdmin
			.from('profiles')
			.update({ is_active: !isActive })
			.eq('id', id);

		if (updateError) {
			return fail(400, { error: updateError.message });
		}

		await writeAuditLog(locals.profile?.id || null, 'toggle_active', 'profile', id, {
			new_status: !isActive
		});

		return { success: true };
	},

	resetPassword: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		const newPassword = String(formData.get('new_password') ?? '').trim();

		if (!id || !newPassword) {
			return fail(400, { error: 'Employee ID and new password are required' });
		}

		const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
			password: newPassword
		});

		if (authError) {
			return fail(400, { error: `Failed to reset password: ${authError.message}` });
		}

		await writeAuditLog(locals.profile?.id || null, 'reset_password', 'profile', id, {});

		return { success: true, resetSuccess: true };
	}
};
