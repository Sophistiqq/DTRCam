/**
 * Geolocation helper for DTRCam.
 * Obtains high-accuracy GPS coordinates with a configurable timeout.
 */

export interface GpsResult {
	lat: number;
	lng: number;
	accuracy: number;
}

export interface GpsError {
	code: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'NOT_SUPPORTED';
	message: string;
}

/**
 * Acquire the current GPS position.
 * @param timeoutMs Timeout in milliseconds (default 10,000 ms)
 */
export function getGpsPosition(timeoutMs = 10000): Promise<GpsResult> {
	return new Promise((resolve, reject) => {
		if (typeof window === 'undefined' || !navigator.geolocation) {
			reject({
				code: 'NOT_SUPPORTED',
				message: 'Geolocation is not supported by your browser.'
			} as GpsError);
			return;
		}

		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			reject({
				code: 'TIMEOUT',
				message: 'GPS fix timed out after 10 seconds.'
			} as GpsError);
		}, timeoutMs);

		navigator.geolocation.getCurrentPosition(
			(position) => {
				if (timedOut) return;
				clearTimeout(timer);
				resolve({
					lat: position.coords.latitude,
					lng: position.coords.longitude,
					accuracy: Math.round(position.coords.accuracy * 10) / 10
				});
			},
			(err) => {
				if (timedOut) return;
				clearTimeout(timer);
				let code: GpsError['code'] = 'POSITION_UNAVAILABLE';
				if (err.code === 1) code = 'PERMISSION_DENIED';
				else if (err.code === 2) code = 'POSITION_UNAVAILABLE';
				else if (err.code === 3) code = 'TIMEOUT';

				reject({
					code,
					message: err.message || 'Unable to retrieve GPS position.'
				} as GpsError);
			},
			{
				enableHighAccuracy: true,
				timeout: timeoutMs,
				maximumAge: 0
			}
		);
	});
}

/**
 * Format coordinates for display and overlay (e.g. "14.599512, 120.984222 (±8m)")
 */
export function formatCoordinates(lat: number, lng: number, accuracy?: number | null): string {
	const latStr = lat.toFixed(6);
	const lngStr = lng.toFixed(6);
	if (accuracy !== undefined && accuracy !== null) {
		return `${latStr}, ${lngStr} (±${Math.round(accuracy)}m)`;
	}
	return `${latStr}, ${lngStr}`;
}

/**
 * Generate Google Maps URL for given coordinates
 */
export function getGoogleMapsUrl(lat: number, lng: number): string {
	return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
