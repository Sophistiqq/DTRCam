/**
 * IndexedDB Queue for Offline Attendance Punches
 * Stores captured punches securely on-device until successfully synchronized with the backend.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LocationSource, PunchType } from '$lib/types/database';

export interface QueuedPunchItem {
	id: string; // UUID
	employee_id: string;
	work_date: string;
	punch_type: PunchType;
	captured_at: string; // ISO string from trusted clock
	trusted_clock_epoch: number;
	/** Device timezone offset at capture (minutes east of UTC); absent on legacy queued items */
	timezone_offset_min?: number;
	lat: number | null;
	lng: number | null;
	gps_accuracy_m: number | null;
	location_source: LocationSource;
	location_text: string | null;
	photo_blob: Blob;
	payload_sha256: string;
	prev_hash: string | null;
	attempts: number;
	last_attempt_at: string | null;
	error_message: string | null;
	created_at: number; // Client timestamp
}

interface DTRCamDB extends DBSchema {
	punch_queue: {
		key: string;
		value: QueuedPunchItem;
		indexes: {
			'by-created': number;
			'by-employee': string;
		};
	};
	photo_cache: {
		key: string; // punch ID
		value: {
			id: string;
			blob: Blob;
			data_url?: string;
			cached_at: number;
		};
	};
}

const DB_NAME = 'dtrcam_offline_db';
const DB_VERSION = 2;

let _dbPromise: Promise<IDBPDatabase<DTRCamDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<DTRCamDB>> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('IndexedDB is not available on the server'));
	}

	if (!_dbPromise) {
		_dbPromise = openDB<DTRCamDB>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion) {
				if (!db.objectStoreNames.contains('punch_queue')) {
					const store = db.createObjectStore('punch_queue', { keyPath: 'id' });
					store.createIndex('by-created', 'created_at');
					store.createIndex('by-employee', 'employee_id');
				}
				if (!db.objectStoreNames.contains('photo_cache')) {
					db.createObjectStore('photo_cache', { keyPath: 'id' });
				}
			}
		});
	}
	return _dbPromise;
}

/**
 * Add a new captured punch to the offline IndexedDB queue.
 */
export async function enqueuePunch(punch: Omit<QueuedPunchItem, 'attempts' | 'last_attempt_at' | 'error_message' | 'created_at'>): Promise<void> {
	const db = await getDb();
	const item: QueuedPunchItem = {
		...punch,
		attempts: 0,
		last_attempt_at: null,
		error_message: null,
		created_at: Date.now()
	};
	await db.put('punch_queue', item);
}

/**
 * Get all queued punches sorted by capture time (oldest first for FIFO sync).
 */
export async function getQueuedPunches(): Promise<QueuedPunchItem[]> {
	const db = await getDb();
	const all = await db.getAllFromIndex('punch_queue', 'by-created');
	return all;
}

/**
 * Get count of pending punches in queue.
 */
export async function getQueueCount(): Promise<number> {
	const db = await getDb();
	return db.count('punch_queue');
}

/**
 * Delete a punch from the queue after successful server sync.
 */
export async function removeQueuedPunch(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('punch_queue', id);
}

/**
 * Update attempt count and last error message for a punch in queue.
 */
export async function recordPunchAttemptError(id: string, errorMessage: string): Promise<void> {
	const db = await getDb();
	const item = await db.get('punch_queue', id);
	if (item) {
		item.attempts += 1;
		item.last_attempt_at = new Date().toISOString();
		item.error_message = errorMessage;
		await db.put('punch_queue', item);
	}
}

/**
 * Get the most recent punch record hash for a given employee (used for chain building).
 */
export async function getLatestQueuedHashForEmployee(employeeId: string): Promise<string | null> {
	const db = await getDb();
	const employeeItems = await db.getAllFromIndex('punch_queue', 'by-employee', employeeId);
	if (employeeItems.length === 0) return null;
	// Sort by captured_at descending
	employeeItems.sort((a, b) => b.created_at - a.created_at);
	return employeeItems[0].payload_sha256;
}

/**
 * Cache full-resolution punch photo in IndexedDB.
 */
export async function cachePunchPhoto(id: string, blob: Blob, dataUrl?: string): Promise<void> {
	try {
		const db = await getDb();
		await db.put('photo_cache', {
			id,
			blob,
			data_url: dataUrl,
			cached_at: Date.now()
		});
	} catch (err) {
		console.warn('[DB] Failed to cache punch photo:', err);
	}
}

/**
 * Retrieve cached full-resolution punch photo from IndexedDB.
 */
export async function getCachedPunchPhoto(id: string): Promise<string | null> {
	try {
		const db = await getDb();
		const item = await db.get('photo_cache', id);
		if (!item) return null;
		if (item.data_url) return item.data_url;
		return URL.createObjectURL(item.blob);
	} catch (err) {
		console.warn('[DB] Failed to get cached punch photo:', err);
		return null;
	}
}

/**
 * Retrieve punch photo from local IndexedDB cache, or fetch it once from
 * the server/storage and save it locally in IndexedDB for subsequent views.
 */
export async function getOrFetchPunchPhoto(id: string): Promise<string | null> {
	try {
		// 1. Check local IndexedDB first
		const localUrl = await getCachedPunchPhoto(id);
		if (localUrl) return localUrl;

		if (typeof window === 'undefined') return null;

		// 2. Fetch from server endpoint
		const response = await fetch(`/api/punch/photo?id=${encodeURIComponent(id)}`);
		if (!response.ok) return null;

		const blob = await response.blob();
		if (!blob || blob.size === 0) return null;

		// 3. Cache it in IndexedDB so we don't fetch it again
		await cachePunchPhoto(id, blob);

		// 4. Return object URL
		return URL.createObjectURL(blob);
	} catch (err) {
		console.warn('[Photo] Error getting or fetching punch photo:', err);
		return null;
	}
}

