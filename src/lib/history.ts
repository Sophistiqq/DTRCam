/**
 * Local record history storage and server-cache for on-device display.
 */

import type { LocationSource, PunchType } from './types/database';

export interface LocalPunchRecord {
	id: string;
	work_date: string;
	punch_type: PunchType;
	captured_at: string;
	trusted_clock_epoch: number;
	lat: number | null;
	lng: number | null;
	gps_accuracy_m: number | null;
	location_source: LocationSource;
	location_text: string | null;
	payload_sha256: string;
	thumb_url?: string;
	photo_data_url?: string;
	photo_path?: string | null;
	synced: boolean;
}

const STORAGE_KEY = 'dtrcam_local_punches';
const CACHE_META_KEY = 'dtrcam_records_cache_meta';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Local Storage ───────────────────────────────────────────────────────────

export function getLocalPunches(): LocalPunchRecord[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as LocalPunchRecord[];
	} catch {
		return [];
	}
}

export function saveLocalPunch(punch: LocalPunchRecord): void {
	if (typeof window === 'undefined') return;
	try {
		const existing = getLocalPunches();
		// Strip heavy photo_data_url from localStorage entry if thumb_url is present to prevent quota error
		const sanitizedPunch: LocalPunchRecord = {
			...punch,
			photo_data_url: undefined // Kept in IndexedDB photo_cache
		};
		// Add to start, deduplicate by id, keep last 100 records
		const updated = [sanitizedPunch, ...existing.filter((p) => p.id !== punch.id)].slice(0, 100);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
	} catch (err) {
		console.warn('[Records] Could not save local record:', err);
	}
}

export function getTodayPunches(workDate: string): LocalPunchRecord[] {
	return getLocalPunches().filter((p) => p.work_date === workDate);
}

const ACTIVE_EMP_KEY = 'dtrcam_active_emp_id';

export function clearLocalHistory(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(STORAGE_KEY);
		localStorage.removeItem(CACHE_META_KEY);
		localStorage.removeItem(ACTIVE_EMP_KEY);
	} catch {}
}

// ─── Server Cache ─────────────────────────────────────────────────────────────

function getCacheAge(): number {
	try {
		const raw = localStorage.getItem(CACHE_META_KEY);
		if (!raw) return Infinity;
		return Date.now() - (JSON.parse(raw).fetchedAt as number);
	} catch {
		return Infinity;
	}
}

function markCacheFresh() {
	try {
		localStorage.setItem(CACHE_META_KEY, JSON.stringify({ fetchedAt: Date.now() }));
	} catch {}
}

/**
 * Fetch the last 7 days of records from server and merge into local cache.
 * Skips the fetch if the cache is still fresh (< 5 min old) unless force is true.
 * Local unsynced records always take precedence.
 */
export async function refreshRecordsFromServer(force = false, employeeId?: string): Promise<void> {
	if (typeof window === 'undefined') return;

	if (employeeId) {
		const prevEmpId = localStorage.getItem(ACTIVE_EMP_KEY);
		if (prevEmpId && prevEmpId !== employeeId) {
			// Switched account - purge previous user's cached records
			localStorage.removeItem(STORAGE_KEY);
			localStorage.removeItem(CACHE_META_KEY);
		}
		localStorage.setItem(ACTIVE_EMP_KEY, employeeId);
	}

	if (!force && getCacheAge() < CACHE_TTL_MS) return;

	try {
		const response = await fetch('/api/punch/ingest?days=7', {
			cache: 'no-store'
		});

		if (!response.ok) return;

		const { records: data } = (await response.json()) as { records: any[] };
		if (!data || !Array.isArray(data)) return;

		const existing = getLocalPunches();
		const existingMap = new Map(existing.map((p) => [p.id, p]));

		// Convert server rows to LocalPunchRecord, preserving local thumb/dataUrl if present
		const serverRecords: LocalPunchRecord[] = data.map((row) => {
			const local = existingMap.get(row.id);
			return {
				id: row.id,
				work_date: row.work_date,
				punch_type: row.punch_type as PunchType,
				captured_at: row.captured_at,
				trusted_clock_epoch: row.trusted_clock_epoch ?? 0,
				lat: row.lat ?? null,
				lng: row.lng ?? null,
				gps_accuracy_m: row.gps_accuracy_m ?? null,
				location_source: (row.location_source ?? 'gps') as LocationSource,
				location_text: row.location_text ?? null,
				payload_sha256: row.payload_sha256 ?? '',
				photo_path: row.photo_path,
				thumb_url: local?.thumb_url,
				synced: true
			};
		});

		// Keep any local unsynced punches that haven't landed on server yet
		const serverIds = new Set(data.map((r) => r.id));
		const localUnsynced = existing.filter((p) => !p.synced && !serverIds.has(p.id));

		// Merge: local unsynced first, then all server records (including other devices)
		const merged = [...localUnsynced, ...serverRecords];
		merged.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());

		localStorage.setItem(STORAGE_KEY, JSON.stringify(merged.slice(0, 200)));
		markCacheFresh();
	} catch (err) {
		console.warn('[Records] Server refresh failed:', err);
	}
}


