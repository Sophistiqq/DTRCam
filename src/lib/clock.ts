/**
 * Trusted Clock mechanism
 * Fetches server time when online and uses browser monotonic clock (performance.now())
 * to compute tamper-resistant local timestamps while offline or online.
 */

interface ClockSyncData {
	server_time: number; // Server timestamp in ms
	monotonic_start: number; // performance.now() at sync
	synced_at: number; // Date.now() when sync happened
}

const STORAGE_KEY = 'dtrcam_trusted_clock';
let _lastSync: ClockSyncData | null = null;
let _syncing = false;
let _initListeners = false;

function loadStoredSync(): ClockSyncData | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as ClockSyncData;
	} catch {
		return null;
	}
}

function saveStoredSync(data: ClockSyncData) {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// Ignore storage quota errors
	}
}

/**
 * Synchronize clock with the server.
 * Measures round-trip time and offsets for half of latency.
 */
export async function syncServerTime(): Promise<ClockSyncData | null> {
	if (typeof window === 'undefined' || !navigator.onLine || _syncing) {
		return _lastSync || loadStoredSync();
	}

	_syncing = true;
	const t0 = performance.now();

	try {
		const response = await fetch('/api/time', {
			cache: 'no-store',
			headers: { 'Cache-Control': 'no-cache' }
		});

		if (!response.ok) throw new Error('Time sync failed');

		const t1 = performance.now();
		const rtt = t1 - t0;
		const { server_time } = (await response.json()) as { server_time: number };

		// Approximate server time at monotonic t1: server_time + rtt / 2
		const adjustedServerTime = server_time + Math.round(rtt / 2);

		_lastSync = {
			server_time: adjustedServerTime,
			monotonic_start: t1,
			synced_at: Date.now()
		};

		saveStoredSync(_lastSync);
		return _lastSync;
	} catch (err) {
		console.warn('[Clock] Time sync failed, using fallback:', err);
		return _lastSync || loadStoredSync();
	} finally {
		_syncing = false;
	}
}

/**
 * Initialize event listeners for trusted clock.
 */
export function initTrustedClock() {
	if (typeof window === 'undefined' || _initListeners) return;
	_initListeners = true;

	_lastSync = loadStoredSync();
	syncServerTime();

	window.addEventListener('online', () => {
		syncServerTime();
	});

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			syncServerTime();
		}
	});

	// Sync every 5 minutes when active
	setInterval(() => {
		syncServerTime();
	}, 5 * 60 * 1000);
}

/**
 * Get the current trusted date & time.
 * Calculates `server_time + (performance.now() - monotonic_start)`.
 * Falls back to device clock if no sync data exists.
 */
export function getTrustedTime(): { date: Date; epochMs: number; isTrusted: boolean } {
	if (typeof window === 'undefined') {
		const now = Date.now();
		return { date: new Date(now), epochMs: now, isTrusted: false };
	}

	if (!_lastSync) {
		_lastSync = loadStoredSync();
	}

	if (_lastSync) {
		const elapsed = performance.now() - _lastSync.monotonic_start;
		// If elapsed is negative or suspiciously massive (> 30 days without browser restart), clamp
		if (elapsed >= 0 && elapsed < 30 * 24 * 60 * 60 * 1000) {
			const trustedEpoch = _lastSync.server_time + elapsed;
			return {
				date: new Date(trustedEpoch),
				epochMs: Math.round(trustedEpoch),
				isTrusted: true
			};
		}
	}

	const fallback = Date.now();
	return {
		date: new Date(fallback),
		epochMs: fallback,
		isTrusted: false
	};
}

/**
 * Helper to format date in YYYY-MM-DD (calendar work date)
 */
export function formatWorkDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Helper to format date & time for overlay and display: YYYY-MM-DD h:mm:ss AM/PM
 */
export function formatDateTimeDisplay(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	const rawH = date.getHours();
	const ampm = rawH >= 12 ? 'PM' : 'AM';
	const h = rawH % 12 || 12;
	const mm = String(date.getMinutes()).padStart(2, '0');
	const ss = String(date.getSeconds()).padStart(2, '0');
	return `${y}-${m}-${d} ${h}:${mm}:${ss} ${ampm}`;
}
