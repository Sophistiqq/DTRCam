<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import CameraCapture from '$lib/components/CameraCapture.svelte';
	import { initTrustedClock, getTrustedTime, formatWorkDate, formatDateTimeDisplay } from '$lib/clock';
	import { formatCoordinates, getGoogleMapsUrl } from '$lib/gps';
	import { getLocalPunches, saveLocalPunch, refreshRecordsFromServer, type LocalPunchRecord } from '$lib/history';
	import { enqueuePunch, getLatestQueuedHashForEmployee } from '$lib/queue/db';
	import { initSyncEngine, triggerSync, subscribeSyncStatus, type SyncStatus } from '$lib/queue/sync';
	import { getSupabaseClient } from '$lib/supabase';
	import type { PunchType } from '$lib/types/database';

	import { cachePunchPhoto, getCachedPunchPhoto, getOrFetchPunchPhoto } from '$lib/queue/db';

	const profile = $derived($page.data.profile);

	let activePunchType = $state<PunchType | null>(null);
	let todayRecords = $state<LocalPunchRecord[]>([]);
	let selectedRecord = $state<LocalPunchRecord | null>(null);
	let selectedRecordPhoto = $state<string | null>(null);
	let isLoadingPhoto = $state(false);
	let isRefreshing = $state(false);
	let successToast = $state<string | null>(null);

	let syncStatus = $state<SyncStatus>({
		isSyncing: false,
		pendingCount: 0,
		lastSyncAt: null,
		lastError: null
	});

	let unsubscribeSync: (() => void) | null = null;
	const todayWorkDate = $derived(formatWorkDate(getTrustedTime().date));

	// ── Browser back button support & IndexedDB Photo Loading ────────────────
	async function openRecord(record: LocalPunchRecord) {
		selectedRecord = record;
		selectedRecordPhoto = record.thumb_url || null; // Instant low-res fallback
		history.pushState({ detail: true }, '');

		// Retrieve from IndexedDB cache or fetch from storage & save locally
		isLoadingPhoto = !selectedRecordPhoto;
		try {
			const fullPhoto = await getOrFetchPunchPhoto(record.id);
			if (fullPhoto) {
				selectedRecordPhoto = fullPhoto;
			}
		} finally {
			isLoadingPhoto = false;
		}
	}

	function closeRecord() {
		selectedRecord = null;
		selectedRecordPhoto = null;
		isLoadingPhoto = false;
	}

	function handlePopState() {
		if (selectedRecord) closeRecord();
	}

	async function syncAndRefresh(force = true) {
		if (isRefreshing) return;
		isRefreshing = true;
		try {
			if (profile?.id) {
				await refreshRecordsFromServer(force, profile.id);
			}
			refreshRecords();
		} finally {
			isRefreshing = false;
		}
	}

	function handleVisibilityOrFocus() {
		if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
			syncAndRefresh(true);
		}
	}

	onMount(() => {
		initTrustedClock();
		initSyncEngine();
		refreshRecords();

		// Immediate server data fetch upon login/load to pull any records from other devices
		syncAndRefresh(true);

		unsubscribeSync = subscribeSyncStatus((status) => {
			syncStatus = status;
			refreshRecords();
		});

		window.addEventListener('popstate', handlePopState);
		document.addEventListener('visibilitychange', handleVisibilityOrFocus);
		window.addEventListener('focus', handleVisibilityOrFocus);
	});

	onDestroy(() => {
		if (unsubscribeSync) unsubscribeSync();
		if (typeof window !== 'undefined') {
			window.removeEventListener('popstate', handlePopState);
			document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
			window.removeEventListener('focus', handleVisibilityOrFocus);
		}
	});

	async function refreshRecords() {
		const all = getLocalPunches();
		const currentWorkDate = formatWorkDate(getTrustedTime().date);
		// Show today's punches as well as any pending unsynced punches
		const filtered = all.filter((p) => p.work_date === currentWorkDate || !p.synced);

		// Enrich any records that have photos in IndexedDB cache
		const enriched = await Promise.all(
			filtered.map(async (rec) => {
				if (rec.thumb_url || rec.photo_data_url) return rec;
				const cached = await getCachedPunchPhoto(rec.id);
				if (cached) {
					return { ...rec, thumb_url: cached };
				}
				return rec;
			})
		);

		todayRecords = enriched;
	}

	function openCamera(type: PunchType) {
		activePunchType = type;
	}

	function closeCamera() {
		activePunchType = null;
	}

	async function handleCapture(payload: {
		blob: Blob;
		dataUrl: string;
		thumbDataUrl: string;
		sha256: string;
		captured_at: string;
		trusted_clock_epoch: number;
		lat: number | null;
		lng: number | null;
		gps_accuracy_m: number | null;
		location_source: 'gps' | 'manual';
		location_text: string | null;
	}) {
		const recordId = crypto.randomUUID();
		const employeeId = profile?.id || 'anonymous';
		const prevHash = await getLatestQueuedHashForEmployee(employeeId);

		// 1. Cache full-resolution photo in IndexedDB (no 5MB storage limit)
		await cachePunchPhoto(recordId, payload.blob, payload.dataUrl);

		// 2. Add to IndexedDB offline queue for synchronization
		await enqueuePunch({
			id: recordId,
			employee_id: employeeId,
			work_date: todayWorkDate,
			punch_type: activePunchType || 'in',
			captured_at: payload.captured_at,
			trusted_clock_epoch: payload.trusted_clock_epoch,
			lat: payload.lat,
			lng: payload.lng,
			gps_accuracy_m: payload.gps_accuracy_m,
			location_source: payload.location_source,
			location_text: payload.location_text,
			photo_blob: payload.blob,
			payload_sha256: payload.sha256,
			prev_hash: prevHash
		});

		// 3. Save lightweight record in local storage (instant UI, no quota overflow)
		const record: LocalPunchRecord = {
			id: recordId,
			work_date: todayWorkDate,
			punch_type: activePunchType || 'in',
			captured_at: payload.captured_at,
			trusted_clock_epoch: payload.trusted_clock_epoch,
			lat: payload.lat,
			lng: payload.lng,
			gps_accuracy_m: payload.gps_accuracy_m,
			location_source: payload.location_source,
			location_text: payload.location_text,
			payload_sha256: payload.sha256,
			thumb_url: payload.thumbDataUrl,
			synced: false
		};

		saveLocalPunch(record);
		refreshRecords();
		closeCamera();

		// 4. Attempt immediate sync
		triggerSync();

		successToast = `${record.punch_type === 'in' ? 'TIME IN' : 'TIME OUT'} recorded! Saved locally & queued for sync.`;
		setTimeout(() => { successToast = null; }, 4500);
	}
</script>

<div class="punch-page">
	{#if successToast}
		<div class="toast-success" role="status">
			<span>✅</span>
			<span>{successToast}</span>
		</div>
	{/if}

	<!-- Offline / Sync Queue Status Bar -->
	{#if syncStatus.pendingCount > 0 || syncStatus.isSyncing}
		<div class="sync-banner" class:syncing={syncStatus.isSyncing}>
			<div class="sync-banner-info">
				{#if syncStatus.isSyncing}
					<span class="spin-icon">🔄</span>
					<span>Syncing with server…</span>
				{:else}
					<span>⏳</span>
					<span><strong>{syncStatus.pendingCount}</strong> record{syncStatus.pendingCount > 1 ? 's' : ''} queued (offline)</span>
				{/if}
			</div>

			<button
				class="btn-sync-action"
				disabled={syncStatus.isSyncing}
				onclick={() => triggerSync(true)}
			>
				{syncStatus.isSyncing ? 'Syncing' : 'Sync Now'}
			</button>
		</div>
	{/if}

	<!-- TIME IN / TIME OUT Action Buttons -->
	<section class="actions">
		<button class="punch-btn time-in" onclick={() => openCamera('in')}>
			<span class="punch-icon">⏱</span>
			<span class="punch-label">TIME IN</span>
			<span class="punch-caption">Record arrival selfie</span>
		</button>

		<button class="punch-btn time-out" onclick={() => openCamera('out')}>
			<span class="punch-icon">🏁</span>
			<span class="punch-label">TIME OUT</span>
			<span class="punch-caption">Record departure selfie</span>
		</button>
	</section>

	<!-- Today's Records -->
	<section class="history-section">
		<div class="history-header">
			<div class="history-header-left">
				<span class="history-title">Today's Records</span>
				<span class="work-date-badge">{todayWorkDate}</span>
			</div>
			<button
				class="btn-refresh"
				onclick={() => syncAndRefresh(true)}
				disabled={isRefreshing}
				title="Refresh and sync latest records from server"
				aria-label="Refresh records"
			>
				<span class="refresh-icon" class:spin-icon={isRefreshing}>🔄</span>
				<span class="refresh-label">{isRefreshing ? 'Syncing…' : 'Refresh'}</span>
			</button>
		</div>

		{#if todayRecords.length === 0}
			<p class="empty-state">No records yet — tap TIME IN when you arrive.</p>
		{:else}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			{#each todayRecords as record}
				<div class="punch-item" onclick={() => openRecord(record)}>
					<span
						class="type-pill"
						class:pill-in={record.punch_type === 'in'}
						class:pill-out={record.punch_type === 'out'}
					>
						{record.punch_type === 'in' ? 'IN' : 'OUT'}
					</span>

					<div class="punch-meta">
						<span class="time-text">
							{new Date(record.captured_at).toLocaleTimeString([], {
								hour: 'numeric',
								minute: '2-digit',
								second: '2-digit',
								hour12: true
							})}
						</span>
						<span class="loc-sub">
							{#if record.location_source === 'gps' && record.lat && record.lng}
								📍 {formatCoordinates(record.lat, record.lng, record.gps_accuracy_m)}
							{:else}
								📝 {record.location_text || 'Manual'}
							{/if}
						</span>
					</div>

					<div class="punch-item-right">
						{#if record.synced}
							<span class="synced-badge">☁️</span>
						{:else}
							<span class="queued-badge">💾</span>
						{/if}
						{#if record.thumb_url || record.photo_data_url}
							<img src={record.thumb_url || record.photo_data_url} alt="thumb" class="thumb-img" />
						{:else if record.photo_path || record.synced}
							<img src="/api/punch/photo?id={record.id}" alt="thumb" class="thumb-img" loading="lazy" />
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</section>
</div>

<!-- Camera Viewfinder -->
{#if activePunchType}
	<CameraCapture
		punchType={activePunchType}
		employeeName={profile?.full_name ?? 'Employee'}
		employeeNo={profile?.employee_no ?? '0000'}
		oncapture={handleCapture}
		oncancel={closeCamera}
	/>
{/if}

<!-- Record Detail — Full Page -->
{#if selectedRecord}
	<div class="detail-page">
		<div class="detail-topbar">
			<button class="btn-back" onclick={() => history.back()}>← Back</button>
			<span class="detail-topbar-title">
				{selectedRecord.punch_type === 'in' ? 'TIME IN' : 'TIME OUT'} Record
			</span>
		</div>

		{#if selectedRecordPhoto}
			<img src={selectedRecordPhoto} alt="Record capture" class="detail-photo" />
		{:else if isLoadingPhoto}
			<div class="detail-photo-state">
				<span class="spin-icon">🔄</span>
				<span>Loading verified photo from storage…</span>
			</div>
		{:else}
			<div class="detail-photo-state empty">
				<span>📷 Photo stored on server (unavailable offline)</span>
			</div>
		{/if}

		<div class="detail-info">
			<div class="info-row">
				<span class="info-label">Captured At</span>
				<span class="info-value">
					{formatDateTimeDisplay(new Date(selectedRecord.captured_at))}
				</span>
			</div>

			<div class="info-row">
				<span class="info-label">Sync Status</span>
				<span class="info-value">
					{selectedRecord.synced ? '✅ Synced' : '⏳ Queued on Device'}
				</span>
			</div>

			<div class="info-row">
				<span class="info-label">Location Source</span>
				<span class="info-value uppercase">{selectedRecord.location_source}</span>
			</div>

			{#if selectedRecord.location_source === 'gps' && selectedRecord.lat && selectedRecord.lng}
				<div class="info-row">
					<span class="info-label">GPS Coords</span>
					<span class="info-value">
						{formatCoordinates(
							selectedRecord.lat,
							selectedRecord.lng,
							selectedRecord.gps_accuracy_m
						)}
					</span>
				</div>

				<a
					href={getGoogleMapsUrl(selectedRecord.lat, selectedRecord.lng)}
					target="_blank"
					rel="noopener noreferrer"
					class="btn-maps"
				>
					🗺 Open in Google Maps
				</a>
			{:else if selectedRecord.location_text}
				<div class="info-row">
					<span class="info-label">Manual Location</span>
					<span class="info-value">{selectedRecord.location_text}</span>
				</div>
			{/if}

			<div class="info-row sha-row">
				<span class="info-label">SHA-256</span>
				<span class="info-value sha-code">{selectedRecord.payload_sha256.slice(0, 16)}…</span>
			</div>
		</div>
	</div>
{/if}


<style>
	.punch-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
	}

	.toast-success {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: color-mix(in srgb, var(--accent, #4ade80) 15%, #1a1a1a);
		border: 1px solid var(--accent, #4ade80);
		color: #ffffff;
		padding: 0.75rem 1rem;
		border-radius: 10px;
		font-weight: 600;
		font-size: 0.95rem;
		animation: fadeIn 0.2s ease-out;
	}

	.sync-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		border-radius: 10px;
		background: color-mix(in srgb, var(--warning, #fb923c) 15%, #1a1a1a);
		border: 1px solid var(--warning, #fb923c);
		color: #ffffff;
		font-size: 0.85rem;
	}

	.sync-banner.syncing {
		background: color-mix(in srgb, #3b82f6 15%, #1a1a1a);
		border-color: #3b82f6;
	}

	.sync-banner-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.spin-icon {
		display: inline-block;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.btn-sync-action {
		padding: 0.35rem 0.75rem;
		background: #ffffff;
		color: #000000;
		border: none;
		border-radius: 6px;
		font-weight: 700;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.btn-sync-action:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.punch-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		min-height: 90px;
		border-radius: 14px;
		cursor: pointer;
		font-family: inherit;
		transition: opacity 0.15s, transform 0.1s;
		padding: 1rem;
	}

	.punch-btn:active {
		transform: scale(0.98);
		opacity: 0.85;
	}

	.time-in {
		background: color-mix(in srgb, #4ade80 18%, #1a1a1a);
		border: 2px solid #4ade80;
		color: #4ade80;
	}

	.time-out {
		background: color-mix(in srgb, #fb923c 18%, #1a1a1a);
		border: 2px solid #fb923c;
		color: #fb923c;
	}

	.punch-icon {
		font-size: 1.6rem;
	}

	.punch-label {
		font-size: 1.4rem;
		font-weight: 800;
		letter-spacing: 0.04em;
	}

	.punch-caption {
		font-size: 0.78rem;
		opacity: 0.8;
	}

	.history-section {
		display: flex;
		flex-direction: column;
	}

	.history-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0 0.5rem;
		border-bottom: 1px solid var(--border, #2a2a2a);
		margin-bottom: 0.25rem;
	}

	.history-header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.history-title {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted, #888);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.work-date-badge {
		font-size: 0.75rem;
		font-family: monospace;
		color: var(--muted, #888);
	}

	.btn-refresh {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--border, #2a2a2a);
		color: var(--muted, #888);
		border-radius: 6px;
		padding: 0.2rem 0.5rem;
		font-size: 0.75rem;
		cursor: pointer;
		font-family: inherit;
		transition: all 0.15s;
	}

	.btn-refresh:hover:not(:disabled) {
		color: var(--text, #f0f0f0);
		border-color: #444;
		background: rgba(255, 255, 255, 0.1);
	}

	.btn-refresh:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.refresh-icon {
		font-size: 0.75rem;
		display: inline-block;
	}

	.refresh-label {
		font-weight: 500;
	}

	.empty-state {
		font-size: 0.85rem;
		color: var(--muted, #888);
		padding: 1rem 0;
	}

	.punch-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--border, #2a2a2a);
		cursor: pointer;
	}

	.punch-item:last-child {
		border-bottom: none;
	}

	.type-pill {
		display: inline-block;
		width: 44px;
		text-align: center;
		font-size: 0.7rem;
		font-weight: 800;
		padding: 0.25rem 0;
		border-radius: 5px;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.pill-in {
		background: #166534;
		color: #4ade80;
	}

	.pill-out {
		background: #9a3412;
		color: #fb923c;
	}

	.punch-meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		overflow: hidden;
		flex: 1;
	}

	.time-text {
		font-size: 0.95rem;
		font-weight: 700;
		color: #ffffff;
		font-family: monospace;
	}

	.synced-badge {
		font-size: 0.85rem;
		opacity: 0.7;
	}

	.queued-badge {
		font-size: 0.85rem;
		opacity: 0.5;
	}

	.loc-sub {
		font-size: 0.72rem;
		color: var(--muted, #888);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.punch-item-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.thumb-img {
		width: 40px;
		height: 40px;
		border-radius: 5px;
		object-fit: cover;
		opacity: 0.85;
	}


	/* Full-page Detail */
	.detail-page {
		position: fixed;
		inset: 0;
		background: #0d0d0d;
		display: flex;
		flex-direction: column;
		z-index: 100;
		overflow-y: auto;
	}

	.detail-topbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--surface, #1a1a1a);
		border-bottom: 1px solid var(--border, #2a2a2a);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.btn-back {
		background: none;
		border: none;
		color: var(--accent, #4ade80);
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		font-family: inherit;
		padding: 0;
	}

	.detail-topbar-title {
		font-size: 0.95rem;
		font-weight: 800;
		color: #ffffff;
	}

	.detail-photo {
		width: 100%;
		height: auto;
		display: block;
	}

	.detail-photo-state {
		width: 100%;
		min-height: 240px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		background: #161616;
		color: #9ca3af;
		font-size: 0.9rem;
		padding: 2rem;
		text-align: center;
	}

	.detail-photo-state.empty {
		color: #6b7280;
	}

	.detail-info {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0.5rem 1rem 2rem;
	}

	.info-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		font-size: 0.9rem;
		gap: 0.5rem;
		padding: 0.7rem 0;
		border-bottom: 1px solid var(--border, #2a2a2a);
	}

	.info-row:last-child {
		border-bottom: none;
	}

	.info-label {
		color: var(--muted, #888);
		flex-shrink: 0;
	}

	.info-value {
		color: #ffffff;
		font-weight: 500;
		text-align: right;
		word-break: break-all;
	}

	.uppercase {
		text-transform: uppercase;
	}

	.sha-code {
		font-family: monospace;
		font-size: 0.8rem;
		color: #9ca3af;
	}

	.btn-maps {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem;
		background: #2563eb;
		color: #ffffff;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 700;
		font-size: 0.9rem;
		margin-top: 0.5rem;
		transition: opacity 0.15s;
	}

	.btn-maps:hover {
		opacity: 0.9;
	}
</style>
