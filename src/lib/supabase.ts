import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/database';

import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';

// Browser-side singleton
let _browserClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient() {
	if (_browserClient) return _browserClient;
	_browserClient = createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: {
			persistSession: true,
			storageKey: 'dtrcam_session',
			autoRefreshToken: true,
			detectSessionInUrl: false
		}
	});
	return _browserClient;
}
