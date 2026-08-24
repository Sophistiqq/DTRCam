import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, PunchType, PunchStatus, LocationSource } from '$lib/types/database';
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
	detail: Json = {}
) {
	await supabaseAdmin.from('audit_log').insert({ actor, action, entity, entity_id, detail });
}

/** Write a punch audit trail entry — immutable record of a punch event. */
export async function writePunchAudit(entry: {
	punch_id: string;
	employee_id: string;
	employee_no: string;
	employee_name: string;
	punch_type: PunchType;
	work_date: string;
	captured_at: string;
	received_at: string;
	location_source?: LocationSource | null;
	lat?: number | null;
	lng?: number | null;
	gps_accuracy_m?: number | null;
	location_text?: string | null;
	photo_path?: string | null;
	payload_sha256: string;
	prev_hash?: string | null;
	row_hash?: string | null;
	status: PunchStatus;
	anomaly_flags?: Json;
	quarantine_reason?: string | null;
	source?: 'ingest' | 'admin_force_accept' | 'admin_discard';
	admin_actor_id?: string | null;
	admin_note?: string | null;
}) {
	await supabaseAdmin.from('punch_audit').insert(entry);
}

