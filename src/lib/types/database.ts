export type Role = 'employee' | 'admin';
export type PunchType = 'in' | 'out';
export type PunchStatus = 'accepted' | 'late_sync' | 'quarantined' | 'superseded';
export type LocationSource = 'gps' | 'manual';
export type SummaryStatus = 'complete' | 'missing_out' | 'absent';

export interface Profile {
	id: string;
	employee_no: string;
	full_name: string;
	role: Role;
	is_active: boolean;
	created_by: string | null;
	created_at: string;
}

export interface Punch {
	id: string;
	employee_id: string;
	work_date: string;
	punch_type: PunchType;
	captured_at: string;
	received_at: string;
	trusted_clock_epoch: number | null;
	lat: number | null;
	lng: number | null;
	gps_accuracy_m: number | null;
	location_source: LocationSource;
	location_text: string | null;
	address_enriched: string | null;
	photo_path: string | null;
	thumb_path: string | null;
	payload_sha256: string;
	prev_hash: string | null;
	row_hash: string | null;
	status: PunchStatus;
	anomaly_flags: Json;
	quarantine_reason: string | null;
	synced_device_id: string | null;
	created_at: string;
}

export interface Device {
	id: string;
	employee_id: string;
	model: string | null;
	os: string | null;
	last_seen_at: string;
	clock_offset_ms: number;
}

export interface ApiKey {
	id: string;
	label: string;
	key_hash: string;
	is_active: boolean;
	last_used_at: string | null;
	created_at: string;
}

export interface AuditLog {
	id: string;
	actor: string | null;
	action: string;
	entity: string;
	entity_id: string | null;
	detail: Json;
	at: string;
}

export interface DailySummary {
	employee_id: string;
	work_date: string;
	first_in_at: string | null;
	last_out_at: string | null;
	location_in: string | null;
	location_out: string | null;
	status: SummaryStatus;
	built_at: string;
}

export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

// Supabase Database type shape for createClient<Database>
export interface Database {
	public: {
		Tables: {
			profiles: {
				Row: Profile;
				Insert: {
					id: string;
					employee_no: string;
					full_name: string;
					role?: Role;
					is_active?: boolean;
					created_by?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					employee_no?: string;
					full_name?: string;
					role?: Role;
					is_active?: boolean;
					created_by?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
			punches: {
				Row: Punch;
				Insert: {
					id?: string;
					employee_id: string;
					work_date: string;
					punch_type: PunchType;
					captured_at: string;
					received_at?: string;
					trusted_clock_epoch?: number | null;
					lat?: number | null;
					lng?: number | null;
					gps_accuracy_m?: number | null;
					location_source?: LocationSource;
					location_text?: string | null;
					address_enriched?: string | null;
					photo_path?: string | null;
					thumb_path?: string | null;
					payload_sha256: string;
					prev_hash?: string | null;
					row_hash?: string | null;
					status?: PunchStatus;
					anomaly_flags?: Json;
					quarantine_reason?: string | null;
					synced_device_id?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					employee_id?: string;
					work_date?: string;
					punch_type?: PunchType;
					captured_at?: string;
					received_at?: string;
					trusted_clock_epoch?: number | null;
					lat?: number | null;
					lng?: number | null;
					gps_accuracy_m?: number | null;
					location_source?: LocationSource;
					location_text?: string | null;
					address_enriched?: string | null;
					photo_path?: string | null;
					thumb_path?: string | null;
					payload_sha256?: string;
					prev_hash?: string | null;
					row_hash?: string | null;
					status?: PunchStatus;
					anomaly_flags?: Json;
					quarantine_reason?: string | null;
					synced_device_id?: string | null;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'punches_employee_id_fkey';
						columns: ['employee_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
			devices: {
				Row: Device;
				Insert: {
					id?: string;
					employee_id: string;
					model?: string | null;
					os?: string | null;
					last_seen_at?: string;
					clock_offset_ms?: number;
				};
				Update: {
					id?: string;
					employee_id?: string;
					model?: string | null;
					os?: string | null;
					last_seen_at?: string;
					clock_offset_ms?: number;
				};
				Relationships: [];
			};
			api_keys: {
				Row: ApiKey;
				Insert: {
					id?: string;
					label: string;
					key_hash: string;
					is_active?: boolean;
					last_used_at?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					label?: string;
					key_hash?: string;
					is_active?: boolean;
					last_used_at?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
			audit_log: {
				Row: AuditLog;
				Insert: {
					id?: string;
					actor?: string | null;
					action: string;
					entity: string;
					entity_id?: string | null;
					detail?: Json;
					at?: string;
				};
				Update: {
					id?: string;
					actor?: string | null;
					action?: string;
					entity?: string;
					entity_id?: string | null;
					detail?: Json;
					at?: string;
				};
				Relationships: [];
			};
			daily_summary: {
				Row: DailySummary;
				Insert: {
					employee_id: string;
					work_date: string;
					first_in_at?: string | null;
					last_out_at?: string | null;
					location_in?: string | null;
					location_out?: string | null;
					status?: SummaryStatus;
					built_at?: string;
				};
				Update: {
					employee_id?: string;
					work_date?: string;
					first_in_at?: string | null;
					last_out_at?: string | null;
					location_in?: string | null;
					location_out?: string | null;
					status?: SummaryStatus;
					built_at?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			role: Role;
			punch_type: PunchType;
			punch_status: PunchStatus;
			location_source: LocationSource;
			summary_status: SummaryStatus;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
}
