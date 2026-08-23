import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

/**
 * Service-role Supabase client — bypasses RLS.
 * ONLY use in server-side code (+server.ts, hooks.server.ts).
 */
export const supabaseAdmin = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
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
