/**
 * Sync Engine for DTRCam Offline Queue
 * Automatically processes queued punches and transmits them to the server ingest endpoint.
 */

import {
	getQueuedPunches,
	removeQueuedPunch,
	recordPunchAttemptError,
	getQueueCount,
	type QueuedPunchItem
} from './db';
import { getLocalPunches, saveLocalPunch } from '$lib/history';
import { getClockSyncState } from '$lib/clock';

export interface SyncStatus {
	isSyncing: boolean;
	pendingCount: number;
	lastSyncAt: Date | null;
	lastError: string | null;
}

type SyncListener = (status: SyncStatus) => void;

let _isSyncing = false;
let _pendingCount = 0;
let _lastSyncAt: Date | null = null;
let _lastError: string | null = null;
const _listeners = new Set<SyncListener>();
let _initialized = false;

function notifyListeners() {
	const current: SyncStatus = {
		isSyncing: _isSyncing,
		pendingCount: _pendingCount,
		lastSyncAt: _lastSyncAt,
		lastError: _lastError
	};
	_listeners.forEach((fn) => fn(current));
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
	_listeners.add(listener);
	listener({
		isSyncing: _isSyncing,
		pendingCount: _pendingCount,
		lastSyncAt: _lastSyncAt,
		lastError: _lastError
	});
	return () => {
		_listeners.delete(listener);
	};
}

/**
 * Initialize sync listeners and background interval
 */
export function initSyncEngine() {
	if (typeof window === 'undefined' || _initialized) return;
	_initialized = true;

	// Initial count refresh
	getQueueCount().then((count) => {
		_pendingCount = count;
		notifyListeners();
		if (count > 0 && navigator.onLine) {
			triggerSync();
		}
	});

	// Reconnect trigger
	window.addEventListener('online', () => {
		console.log('[Sync] Network reconnected, triggering sync...');
		triggerSync();
	});

	// Visibility change trigger
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && navigator.onLine) {
			triggerSync();
		}
	});

	// Periodic timer (every 30 seconds while app is open)
	setInterval(() => {
		if (navigator.onLine && !_isSyncing) {
			triggerSync();
		}
	}, 30 * 1000);
}

/**
 * Upload a single queued punch item to the server
 */
async function uploadPunchItem(item: QueuedPunchItem): Promise<boolean> {
	try {
		const formData = new FormData();
		formData.append('photo', item.photo_blob, `punch_${item.id}.jpg`);

		const clockState = getClockSyncState();

		const metadata = {
			id: item.id,
			employee_id: item.employee_id,
			work_date: item.work_date,
			punch_type: item.punch_type,
			captured_at: item.captured_at,
			trusted_clock_epoch: item.trusted_clock_epoch,
			clock_offset_ms: clockState.offsetMs,
			lat: item.lat,
			lng: item.lng,
			gps_accuracy_m: item.gps_accuracy_m,
			location_source: item.location_source,
			location_text: item.location_text,
			payload_sha256: item.payload_sha256,
			prev_hash: item.prev_hash
		};

		formData.append('metadata', JSON.stringify(metadata));

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15000);

		const response = await fetch('/api/punch/ingest', {
			method: 'POST',
			body: formData,
			signal: controller.signal
		});
		clearTimeout(timeoutId);

		if (response.ok) {
			const result = await response.json();
			console.log('[Sync] Punch ingested successfully:', result);

			// Remove from IndexedDB
			await removeQueuedPunch(item.id);

			// Update local history synced flag and quarantine status
			const localPunches = getLocalPunches();
			const match = localPunches.find((p) => p.id === item.id);
			if (match) {
				match.synced = true;
				match.status = result.status;
				match.quarantine_reason = result.quarantine_reason ?? null;
				saveLocalPunch(match);
			}

			return true;
		} else {
			let errMsg = `Server returned status ${response.status}`;
			try {
				const errJson = await response.json();
				if (errJson.error) errMsg = errJson.error;
			} catch {
				// Fallback
			}

			console.warn(`[Sync] Ingest failed for punch ${item.id}:`, errMsg);
			await recordPunchAttemptError(item.id, errMsg);
			_lastError = errMsg;
			return false;
		}
	} catch (err: unknown) {
		const error = err as { message?: string };
		const errMsg = error.message || 'Network connection failed during punch sync';
		console.warn(`[Sync] Network failure uploading punch ${item.id}:`, errMsg);
		await recordPunchAttemptError(item.id, errMsg);
		_lastError = errMsg;
		return false;
	}
}

/**
 * Trigger immediate execution of offline sync
 */
export async function triggerSync(force = false): Promise<void> {
	if (typeof window === 'undefined' || _isSyncing) {
		return;
	}

	// For background automatic ticks, skip if clearly offline; for explicit clicks (force=true), always attempt
	if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) {
		return;
	}

	_isSyncing = true;
	_lastError = null;
	notifyListeners();

	try {
		const queued = await getQueuedPunches();
		_pendingCount = queued.length;
		notifyListeners();

		for (const item of queued) {
			const success = await uploadPunchItem(item);
			if (success) {
				_lastSyncAt = new Date();
				_pendingCount = Math.max(0, _pendingCount - 1);
				notifyListeners();
			} else {
				// If a network error or server error occurs, stop batch processing to prevent request flooding
				break;
			}
		}
	} catch (err: unknown) {
		const error = err as { message?: string };
		_lastError = error.message || 'Sync failed';
		console.warn('[Sync] Sync engine loop error:', err);
	} finally {
		_isSyncing = false;
		_pendingCount = await getQueueCount();
		notifyListeners();
	}
}
