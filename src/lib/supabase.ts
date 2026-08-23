import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/database';
import { env } from '$env/dynamic/public';
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';

// Browser-side singleton
let _browserClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient() {
	if (_browserClient) return _browserClient;
	const url = env.PUBLIC_SUPABASE_URL || PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY;
	_browserClient = createClient<Database>(url, key, {
		auth: {
			persistSession: true,
			storageKey: 'dtrcam_session',
			autoRefreshToken: true,
			detectSessionInUrl: false
		}
	});
	return _browserClient;
}

