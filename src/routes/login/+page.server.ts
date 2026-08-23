import { fail, redirect } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { supabaseAdmin } from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';
import type { Database } from '$lib/types/database';

export const load: PageServerLoad = async ({ locals }) => {
	const { profile } = locals;
	if (profile && profile.is_active) {
		redirect(302, profile.role === 'admin' ? '/admin' : '/punch');
	}
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const username = String(formData.get('username') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		if (!username || !password) {
			return fail(400, { error: 'Employee number and password are required.' });
		}

		const supabaseUrl = env.PUBLIC_SUPABASE_URL || PUBLIC_SUPABASE_URL;
		const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY;

		const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
			cookies: {
				getAll() {
					return event.cookies.getAll();
				},
				setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, {
							...options,
							path: '/',
							secure: event.url.protocol === 'https:',
							sameSite: 'lax'
						});
					});
				}
			}
		});

		const email = `${username.toLowerCase()}@dtrcam.internal`;
		const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

		if (error || !authData.user) {
			return fail(400, { error: error?.message || 'Invalid employee number or password.' });
		}

		// Fetch profile using service role
		let { data: profile } = await supabaseAdmin
			.from('profiles')
			.select('*')
			.eq('id', authData.user.id)
			.single();

		// Auto-provision profile if auth user exists but profile record is missing
		if (!profile) {
			const meta = authData.user.user_metadata || {};
			const empNo = meta.employee_no || username;
			const fullName = meta.full_name || (username === '9999' ? 'System Admin' : `Employee ${username}`);
			const role = (meta.role as 'employee' | 'admin') || (username === '9999' ? 'admin' : 'employee');

			const { data: newProfile, error: upsertErr } = await supabaseAdmin
				.from('profiles')
				.upsert(
					{
						id: authData.user.id,
						employee_no: empNo,
						full_name: fullName,
						role,
						is_active: true
					},
					{ onConflict: 'id' }
				)
				.select('*')
				.single();

			if (!upsertErr && newProfile) {
				profile = newProfile;
			}
		}

		if (!profile || !profile.is_active) {
			await supabase.auth.signOut();
			return fail(403, { error: 'Your account is inactive. Contact your administrator.' });
		}

		redirect(302, profile.role === 'admin' ? '/admin' : '/punch');
	}
};
