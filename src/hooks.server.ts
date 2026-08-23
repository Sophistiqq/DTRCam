import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handleErrorWithSentry, sentryHandle } from '@sentry/sveltekit';
import type { Database } from '$lib/types/database';
import { env } from '$env/dynamic/public';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { supabaseAdmin } from '$lib/server/supabase';
import { initCronScheduler } from '$lib/server/cron';

// Start server background cron tasks
initCronScheduler();

const authHandle: Handle = async ({ event, resolve }) => {
	const supabaseUrl = env.PUBLIC_SUPABASE_URL || PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY;

	// Create a per-request Supabase client that reads/writes cookies.
	const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return event.cookies.getAll();
			},
			setAll(cookiesToSet) {
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

	const {
		data: { user }
	} = await supabase.auth.getUser();

	event.locals.session = user ? (await supabase.auth.getSession()).data.session : null;
	event.locals.user = user;

	if (user) {
		const { data: profile } = await supabaseAdmin
			.from('profiles')
			.select('*')
			.eq('id', user.id)
			.single();
		event.locals.profile = profile;
	} else {
		event.locals.profile = null;
	}

	return resolve(event);
};

export const handle = sequence(sentryHandle(), authHandle);
export const handleError = handleErrorWithSentry();
