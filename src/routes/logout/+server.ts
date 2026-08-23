import { redirect } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/types/database';

export const GET: RequestHandler = async (event) => {
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

	await supabase.auth.signOut();

	redirect(302, '/login');
};
