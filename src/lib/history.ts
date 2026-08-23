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
 * Skips the fetch if the cache is still fresh (< 5 min old).
 * Local unsynced records always take precedence.
 */
export async function refreshRecordsFromServer(force = false): Promise<void> {
	if (!force && getCacheAge() < CACHE_TTL_MS) return;

	try {
		const response = await fetch('/api/punch/ingest?days=7', {
			cache: 'no-store'
		});

		if (!response.ok) return;

		const { records: data } = (await response.json()) as { records: any[] };
		if (!data || !Array.isArray(data)) return;

		const existing = getLocalPunches();
		const existingIds = new Set(existing.map((p) => p.id));

		// Convert server rows to LocalPunchRecord, skip any already in local
		const serverRecords: LocalPunchRecord[] = data
			.filter((row) => !existingIds.has(row.id))
			.map((row) => ({
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
				synced: true
			}));

		if (serverRecords.length > 0) {
			// Merge: local records first (preserve unsynced state and local thumbs), server records fill the gaps
			const merged = [...existing, ...serverRecords].slice(0, 200);
			localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
		}

		markCacheFresh();
	} catch (err) {
		console.warn('[Records] Server refresh failed:', err);
	}
}

