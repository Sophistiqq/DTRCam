/**
 * Request persistent browser storage to prevent iOS Safari & Android from evicting
 * IndexedDB punch queues and trusted clock offsets during storage pressure.
 */

export async function requestStoragePersistence(): Promise<boolean> {
	if (typeof window === 'undefined' || !navigator.storage || !navigator.storage.persist) {
		return false;
	}

	try {
		const isAlreadyPersisted = await navigator.storage.persisted();
		if (isAlreadyPersisted) {
			return true;
		}

		const isGranted = await navigator.storage.persist();
		console.log(`[Storage] Persistent storage granted: ${isGranted}`);
		return isGranted;
	} catch (err) {
		console.warn('[Storage] Error requesting persistent storage:', err);
		return false;
	}
}
