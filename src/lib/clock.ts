/**
 * Trusted Clock mechanism
 * Fetches server time when online and uses browser monotonic clock (performance.now())
 * to compute tamper-resistant local timestamps while offline or online.
 */

interface ClockSyncData {
	server_time: number; // Server timestamp in ms
	device_time_at_sync: number; // Date.now() at sync
	offset: number; // server_time - device_time_at_sync
	session_id: string; // Session identifier
	monotonic_start: number; // performance.now() at sync
	synced_at: number; // Date.now() when sync happened
}

const STORAGE_KEY = 'dtrcam_trusted_clock';
const LAST_TRUSTED_KEY = 'dtrcam_last_known_trusted_time';
const SESSION_ID = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

let _lastSync: ClockSyncData | null = null;
let _sessionBaseEpoch: number | null = null;
let _sessionMonotonicStart = typeof performance !== 'undefined' ? performance.now() : 0;
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

function getLastKnownTrustedTime(): number {
	if (typeof window === 'undefined') return 0;
	try {
		const raw = localStorage.getItem(LAST_TRUSTED_KEY);
		return raw ? parseInt(raw, 10) || 0 : 0;
	} catch {
		return 0;
	}
}

function updateLastKnownTrustedTime(epochMs: number) {
	if (typeof window === 'undefined') return;
	try {
		const currentMax = getLastKnownTrustedTime();
		if (epochMs > currentMax) {
			localStorage.setItem(LAST_TRUSTED_KEY, String(Math.round(epochMs)));
		}
	} catch {}
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
	if (typeof window === 'undefined' || _syncing) {
		return _lastSync || loadStoredSync();
	}

	_syncing = true;
	const t0 = performance.now();

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6000);

		const response = await fetch('/api/time', {
			cache: 'no-store',
			headers: { 'Cache-Control': 'no-cache' },
			signal: controller.signal
		});
		clearTimeout(timeoutId);

		if (!response.ok) throw new Error('Time sync failed');

		const t1 = performance.now();
		const rtt = t1 - t0;
		const { server_time } = (await response.json()) as { server_time: number };

		// Approximate server time at monotonic t1: server_time + rtt / 2
		const adjustedServerTime = server_time + Math.round(rtt / 2);
		const deviceNow = Date.now();

		_lastSync = {
			server_time: adjustedServerTime,
			device_time_at_sync: deviceNow,
			offset: adjustedServerTime - deviceNow,
			session_id: SESSION_ID,
			monotonic_start: t1,
			synced_at: deviceNow
		};

		_sessionMonotonicStart = t1;
		_sessionBaseEpoch = adjustedServerTime;

		saveStoredSync(_lastSync);
		updateLastKnownTrustedTime(adjustedServerTime);
		return _lastSync;
	} catch (err) {
		console.warn('[Clock] Time sync attempt:', err);
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

	// Sync every 3 minutes when active
	setInterval(() => {
		syncServerTime();
	}, 3 * 60 * 1000);
}

/**
 * Get the current trusted date & time.
 * Calculates server_time + monotonic elapsed time within the active session.
 * Prevents clock rollback across page refreshes.
 */
export function getTrustedTime(): { date: Date; epochMs: number; isTrusted: boolean } {
	if (typeof window === 'undefined') {
		const now = Date.now();
		return { date: new Date(now), epochMs: now, isTrusted: false };
	}

	if (!_lastSync) {
		_lastSync = loadStoredSync();
	}

	// Calculate session base epoch if not yet established
	if (_sessionBaseEpoch === null) {
		_sessionMonotonicStart = performance.now();
		if (_lastSync) {
			if (_lastSync.session_id === SESSION_ID && _lastSync.monotonic_start <= _sessionMonotonicStart) {
				_sessionBaseEpoch = _lastSync.server_time + (_sessionMonotonicStart - _lastSync.monotonic_start);
			} else {
				// Across page reloads: compute using offset or server_time
				const offset = _lastSync.offset ?? (_lastSync.server_time - (_lastSync.synced_at || _lastSync.device_time_at_sync || Date.now()));
				_sessionBaseEpoch = Date.now() + offset;
			}
		} else {
			_sessionBaseEpoch = Date.now();
		}

		// Prevent clock backward tamper across reloads
		const lastKnown = getLastKnownTrustedTime();
		if (lastKnown && _sessionBaseEpoch < lastKnown) {
			_sessionBaseEpoch = lastKnown + 1000;
		}
	}

	const elapsedInSession = Math.max(0, performance.now() - _sessionMonotonicStart);
	let currentTrustedEpoch = _sessionBaseEpoch + elapsedInSession;

	const lastKnown = getLastKnownTrustedTime();
	if (lastKnown && currentTrustedEpoch < lastKnown) {
		currentTrustedEpoch = lastKnown + 1000;
	}

	updateLastKnownTrustedTime(currentTrustedEpoch);

	return {
		date: new Date(currentTrustedEpoch),
		epochMs: Math.round(currentTrustedEpoch),
		isTrusted: !!_lastSync
	};
}

/**
 * Helper to format date & time for overlay and display: YYYY-MM-DD h:mm:ss AM/PM (Philippine time)
 */
export function formatDateTimeDisplay(date: Date): string {
	const parts = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
		hour12: true
	}).formatToParts(date);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} ${get('dayPeriod')}`;
}

/**
 * Helper to format date in YYYY-MM-DD (calendar work date), always in Philippine time
 */
export function formatWorkDate(date: Date): string {
	const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
	return d; // en-CA yields YYYY-MM-DD
}

export interface ClockSyncState {
	isSynced: boolean;
	offsetMs: number;
	driftSeconds: number;
	isDrifted: boolean; // Flagged when device phone time deviates by > 60s
	driftDescription: string | null;
}

/**
 * Check if the phone's hardware time is out of sync with DTRCam server time.
 */
export function getClockSyncState(): ClockSyncState {
	if (typeof window === 'undefined') {
		return { isSynced: false, offsetMs: 0, driftSeconds: 0, isDrifted: false, driftDescription: null };
	}

	const syncData = _lastSync || loadStoredSync();
	if (!syncData) {
		return { isSynced: false, offsetMs: 0, driftSeconds: 0, isDrifted: false, driftDescription: null };
	}

	const currentTrusted = getTrustedTime().epochMs;
	const deviceNow = Date.now();
	const diffMs = currentTrusted - deviceNow; // positive if phone is behind, negative if phone is ahead
	const driftSeconds = Math.round(Math.abs(diffMs) / 1000);
	const isDrifted = driftSeconds >= 60; // 60s threshold for warning and reporting

	let driftDescription: string | null = null;
	if (isDrifted) {
		if (driftSeconds < 3600) {
			const mins = Math.round(driftSeconds / 60);
			driftDescription = `${mins} min${mins > 1 ? 's' : ''} ${diffMs > 0 ? 'behind' : 'ahead'}`;
		} else {
			const hours = (driftSeconds / 3600).toFixed(1);
			driftDescription = `${hours} hrs ${diffMs > 0 ? 'behind' : 'ahead'}`;
		}
	}

	return {
		isSynced: true,
		offsetMs: diffMs,
		driftSeconds,
		isDrifted,
		driftDescription
	};
}

