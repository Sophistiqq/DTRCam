import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

let _supabaseAdmin: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
	if (!_supabaseAdmin) {
		const url = PUBLIC_SUPABASE_URL || publicEnv.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
		const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
		_supabaseAdmin = createClient<Database>(url, key, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});
	}
	return _supabaseAdmin;
}

/**
 * Service-role Supabase client — bypasses RLS.
 * ONLY use in server-side code (+server.ts, hooks.server.ts).
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
	get(_target, prop, receiver) {
		const client = getSupabaseAdmin();
		const value = Reflect.get(client, prop, receiver);
		return typeof value === 'function' ? value.bind(client) : value;
	}
});

/** Write an audit log entry (fire-and-forget safe). */
export async function writeAuditLog(
	actor: string | null,
	action: string,
	entity: string,
	entity_id: string | null,
	detail: Record<string, unknown> = {}
) {
	await supabaseAdmin.from('audit_log').insert({ actor, action, entity, entity_id, detail });
}

