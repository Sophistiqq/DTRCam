<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import CameraCapture from '$lib/components/CameraCapture.svelte';
	import {
		initTrustedClock,
		getTrustedTime,
		formatWorkDate,
		formatDateTimeDisplay,
		getClockSyncState,
		type ClockSyncState
	} from '$lib/clock';
	import { formatCoordinates, getGoogleMapsUrl } from '$lib/gps';
	import {
		getLocalPunches,
		saveLocalPunch,
		refreshRecordsFromServer,
		findOpenTimeIn,
		type LocalPunchRecord
	} from '$lib/history';
	import { enqueuePunch, getLatestQueuedHashForEmployee } from '$lib/queue/db';
	import { initSyncEngine, triggerSync, subscribeSyncStatus, type SyncStatus } from '$lib/queue/sync';
	import type { PunchType } from '$lib/types/database';
	import {
		CircleCheckBig,
		RefreshCw,
		Clock,
		LogIn,
		LogOut,
		MapPin,
		FileText,
		Cloud,
		HardDrive,
		Camera,
		ExternalLink,
		ArrowLeft,
		TriangleAlert,
		ShieldAlert
	} from 'lucide-svelte';

	import { cachePunchPhoto, getCachedPunchPhoto, getOrFetchPunchPhoto } from '$lib/queue/db';

	const profile = $derived($page.data.profile);

	let activePunchType = $state<PunchType | null>(null);
	let todayRecords = $state<LocalPunchRecord[]>([]);
	let allRecords = $state<LocalPunchRecord[]>([]);
	let selectedRecord = $state<LocalPunchRecord | null>(null);
	let selectedRecordPhoto = $state<string | null>(null);
	let isLoadingPhoto = $state(false);
	let isRefreshing = $state(false);
	let successToast = $state<string | null>(null);
	let clockState = $state<ClockSyncState>(getClockSyncState());

	let syncStatus = $state<SyncStatus>({
		isSyncing: false,
		pendingCount: 0,
		lastSyncAt: null,
		lastError: null
	});

	let unsubscribeSync: (() => void) | null = null;
	const todayWorkDate = $derived(formatWorkDate(getTrustedTime().date));

	// ── Session / Button-lock logic ──────────────────────────────────────────
	// Duplicates are device-only backups rejected by the server (409) —
	// hidden from the records list, but still counted to lock the buttons
	const isDuplicate = (r: LocalPunchRecord) => !!r.duplicate;

	// Visible records exclude device-only duplicates
	const visibleTodayRecords = $derived(todayRecords.filter((r) => !isDuplicate(r)));

	// Open session = a TIME IN (from any day) that has no matching TIME OUT yet.
	// Enforced sequencing: TIME IN is locked while a shift is open, TIME OUT is
	// locked until an open shift exists — forcing proper time out discipline.
	const openTimeIn = $derived(findOpenTimeIn(allRecords));
	const openIsToday = $derived(openTimeIn?.work_date === todayWorkDate);
	const todayHasOut = $derived(todayRecords.some((r) => r.punch_type === 'out' && !isDuplicate(r)));

	const timeInDisabled  = $derived(openTimeIn !== null);
	const timeOutDisabled = $derived(openTimeIn === null);

	// Records are displayed for the current work date plus the work date of the
	// most recent punch — so overnight TIME OUTs (logged under yesterday's date)
	// stay visible until the next activity.
	const displayContextDate = $derived(allRecords[0]?.work_date ?? todayWorkDate);

	// Only non-duplicate quarantined records are "real" quarantines to warn about
	const quarantinedRecords = $derived(todayRecords.filter(r => r.status === 'quarantined' && !isDuplicate(r)));

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

	let clockCheckInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		initTrustedClock();
		initSyncEngine();
		refreshRecords();

		// Initial server data fetch upon login/load to pull any records from other devices
		syncAndRefresh(true);

		// Periodically refresh clock sync state
		clockCheckInterval = setInterval(() => {
			clockState = getClockSyncState();
		}, 3000);

		unsubscribeSync = subscribeSyncStatus((status) => {
			syncStatus = status;
			refreshRecords();
			clockState = getClockSyncState();
		});

		window.addEventListener('popstate', handlePopState);
	});

	onDestroy(() => {
		if (unsubscribeSync) unsubscribeSync();
		if (clockCheckInterval) clearInterval(clockCheckInterval);
		if (typeof window !== 'undefined') {
			window.removeEventListener('popstate', handlePopState);
		}
	});

	async function refreshRecords() {
		const all = getLocalPunches();
		all.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
		allRecords = all;

		const currentWorkDate = formatWorkDate(getTrustedTime().date);
		// Show today's punches, pending unsynced punches, and the most recent
		// session's work date (covers overnight TIME OUTs logged under yesterday)
		const filtered = all.filter(
			(p) => p.work_date === currentWorkDate || p.work_date === displayContextDate || !p.synced
		);

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

		const punchType = activePunchType || 'in';

		// A TIME OUT always closes the open session: it inherits the work date of
		// its TIME IN. Overnight overtime (e.g. IN Mon 8:30 AM → OUT Tue 10:00 AM)
		// is logged under Monday's date with Tuesday's actual capture time; the
		// server quarantines cross-date punches for admin review.
		const workDate =
			punchType === 'out' ? openTimeIn?.work_date ?? todayWorkDate : todayWorkDate;

		// Device timezone offset at capture (minutes east of UTC) so the server
		// can verify the work date against the capture timestamp.
		const timezoneOffsetMin = -new Date(payload.captured_at).getTimezoneOffset();

		// 1. Cache full-resolution photo in IndexedDB (no 5MB storage limit)
		await cachePunchPhoto(recordId, payload.blob, payload.dataUrl);

		// 2. Add to IndexedDB offline queue for synchronization
		await enqueuePunch({
			id: recordId,
			employee_id: employeeId,
			work_date: workDate,
			punch_type: punchType,
			captured_at: payload.captured_at,
			trusted_clock_epoch: payload.trusted_clock_epoch,
			timezone_offset_min: timezoneOffsetMin,
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
			work_date: workDate,
			punch_type: punchType,
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

		// 5. Save photo to device gallery
		await saveToGallery(payload.blob, record.punch_type, record.captured_at);

		if (punchType === 'out' && workDate !== todayWorkDate) {
			successToast = `Overnight TIME OUT recorded for ${workDate} — queued for admin review.`;
		} else {
			successToast = `${punchType === 'in' ? 'TIME IN' : 'TIME OUT'} recorded! Attendance record saved locally & queued for sync.`;
		}
		setTimeout(() => { successToast = null; }, 4500);
	}

	/**
	 * Attempt to save the captured selfie to the device gallery.
	 * Uses Web Share API (Android/iOS 15+) with fallback to programmatic download.
	 */
	async function saveToGallery(blob: Blob, punchType: string, capturedAt: string) {
		const label = punchType === 'in' ? 'TIME-IN' : 'TIME-OUT';
		const dateStr = new Date(capturedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const filename = `DTRCam_${label}_${dateStr}.jpg`;
		const file = new File([blob], filename, { type: 'image/jpeg' });

		// Try Web Share API (saves to gallery on Android Chrome & iOS 15+)
		if (navigator.canShare && navigator.canShare({ files: [file] })) {
			try {
				await navigator.share({ files: [file], title: `DTRCam ${label}` });
				return;
			} catch {
				// User cancelled share or browser denied — fall through to download
			}
		}

		// Fallback: trigger a download (goes to Downloads folder on most platforms)
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(url), 5000);
	}
</script>

<div class="punch-page">
	{#if successToast}
		<div class="toast-success" role="status">
			<CircleCheckBig size={18} />
			<span>{successToast}</span>
		</div>
	{/if}

	<!-- Clock Desync Warning Banner -->
	{#if clockState.isDrifted}
		<div class="alert-banner clock-skew-banner" role="alert">
			<TriangleAlert size={20} class="alert-icon" />
			<div class="alert-content">
				<strong class="alert-title">Phone Clock Out of Sync</strong>
				<p class="alert-msg">
					Your phone time is {clockState.driftDescription} from DTRCam server time. Please enable <em>Set Time Automatically</em> in phone settings to avoid attendance records being quarantined.
				</p>
			</div>
		</div>
	{/if}

	<!-- Quarantined Records Warning Banner -->
	{#if quarantinedRecords.length > 0}
		<div class="alert-banner quarantine-notice-banner" role="alert">
			<ShieldAlert size={20} class="alert-icon" />
			<div class="alert-content">
				<strong class="alert-title">Quarantined Record Notice ({quarantinedRecords.length})</strong>
				<p class="alert-msg">
					{quarantinedRecords.length === 1 ? 'An attendance record has been' : 'Attendance records have been'} quarantined for administrator review: <strong>{quarantinedRecords[0].quarantine_reason || 'Flagged for verification'}</strong>.
				</p>
			</div>
		</div>
	{/if}

	<!-- Offline / Sync Queue Status Bar -->
	{#if syncStatus.pendingCount > 0 || syncStatus.isSyncing}
		<div class="sync-banner" class:syncing={syncStatus.isSyncing}>
			<div class="sync-banner-info">
				{#if syncStatus.isSyncing}
					<span class="spin-icon"><RefreshCw size={16} /></span>
					<span>Syncing with server…</span>
				{:else}
					<Clock size={16} />
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
		<button
			class="punch-btn time-in"
			class:btn-disabled={timeInDisabled}
			disabled={timeInDisabled}
			onclick={() => openCamera('in')}
		>
			<span class="punch-icon"><LogIn size={28} /></span>
			<span class="punch-label">TIME IN</span>
			<span class="punch-caption">
				{#if timeInDisabled}
					{#if openIsToday}Already timed in — backup saved{:else}Previous shift still open — time out first{/if}
				{:else}Record arrival selfie{/if}
			</span>
		</button>

		<button
			class="punch-btn time-out"
			class:btn-disabled={timeOutDisabled}
			disabled={timeOutDisabled}
			onclick={() => openCamera('out')}
		>
			<span class="punch-icon"><LogOut size={28} /></span>
			<span class="punch-label">TIME OUT</span>
			<span class="punch-caption">
				{#if timeOutDisabled}
					{#if todayHasOut}Already timed out — backup saved{:else}Time In required first{/if}
				{:else if !openIsToday && openTimeIn}Close {openTimeIn.work_date} shift{:else}Record departure selfie{/if}
			</span>
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
				<span class="refresh-icon" class:spin-icon={isRefreshing}><RefreshCw size={13} /></span>
				<span class="refresh-label">{isRefreshing ? 'Syncing…' : 'Refresh'}</span>
			</button>
		</div>

		{#if visibleTodayRecords.length === 0}
			<p class="empty-state">No records yet — tap TIME IN when you arrive.</p>
		{:else}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			{#each visibleTodayRecords as record}
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
						{#if record.work_date !== todayWorkDate}
							<span class="wd-chip" title="Logged under work date {record.work_date}">
								<Clock size={10} class="inline-icon" /> {record.work_date}
							</span>
						{/if}
						<span class="loc-sub">
							{#if record.location_source === 'gps' && record.lat && record.lng}
								<MapPin size={12} class="inline-icon" /> {formatCoordinates(record.lat, record.lng, record.gps_accuracy_m)}
							{:else}
								<FileText size={12} class="inline-icon" /> {record.location_text || 'Manual'}
							{/if}
						</span>
						{#if record.status === 'quarantined'}
							<div class="quarantine-pill-wrap">
								<span class="pill-quarantined" title={record.quarantine_reason || 'Quarantined for review'}>
									<TriangleAlert size={11} class="inline-icon" /> QUARANTINED
								</span>
							</div>
						{/if}
					</div>

					<div class="punch-item-right">
						{#if record.synced}
							<span class="synced-badge" title="Synced to server"><Cloud size={16} /></span>
						{:else}
							<span class="queued-badge" title="Saved locally"><HardDrive size={16} /></span>
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
			<button class="btn-back" onclick={() => history.back()}><ArrowLeft size={18} class="inline-icon" /> Back</button>
			<span class="detail-topbar-title">
				{selectedRecord.punch_type === 'in' ? 'TIME IN' : 'TIME OUT'} Record
			</span>
		</div>

		{#if selectedRecordPhoto}
			<img src={selectedRecordPhoto} alt="Record capture" class="detail-photo" />
		{:else if isLoadingPhoto}
			<div class="detail-photo-state">
				<span class="spin-icon"><RefreshCw size={24} /></span>
				<span>Loading verified photo from storage…</span>
			</div>
		{:else}
			<div class="detail-photo-state empty">
				<Camera size={24} />
				<span>Photo stored on server (unavailable offline)</span>
			</div>
		{/if}

		{#if selectedRecord.status === 'quarantined'}
			<div class="detail-quarantine-card">
				<div class="detail-quarantine-header">
					<ShieldAlert size={18} class="inline-icon" />
					<strong>Record Quarantined for Admin Review</strong>
				</div>
				<p class="detail-quarantine-reason">
					{selectedRecord.quarantine_reason || 'Flagged for administrator review (clock skew or verification check)'}
				</p>
			</div>
		{/if}

		<div class="detail-info">
			<div class="info-row">
				<span class="info-label">Verification Status</span>
				{#if selectedRecord.status === 'quarantined'}
					<span class="info-value status-quarantined">
						<TriangleAlert size={14} class="inline-icon" /> Quarantined (Pending Review)
					</span>
				{:else if selectedRecord.status === 'late_sync'}
					<span class="info-value status-late">
						<Clock size={14} class="inline-icon" /> Late Sync (Accepted)
					</span>
				{:else}
					<span class="info-value status-accepted">
						<CircleCheckBig size={14} class="inline-icon" /> Verified & Accepted
					</span>
				{/if}
			</div>

			<div class="info-row">
				<span class="info-label">Captured At</span>
				<span class="info-value">
					{formatDateTimeDisplay(new Date(selectedRecord.captured_at))}
				</span>
			</div>

			<div class="info-row">
				<span class="info-label">Sync Status</span>
				<span class="info-value sync-value" class:synced={selectedRecord.synced}>
					{#if selectedRecord.synced}
						<CircleCheckBig size={14} class="inline-icon" /> Synced to Server
					{:else}
						<Clock size={14} class="inline-icon" /> Queued on Device
					{/if}
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
					<ExternalLink size={16} /> Open in Google Maps
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
		background: color-mix(in srgb, var(--accent, #ede947) 15%, #1a1a1a);
		border: 1px solid var(--accent, #ede947);
		color: #ffffff;
		padding: 0.75rem 1rem;
		border-radius: 10px;
		font-weight: 600;
		font-size: 0.95rem;
		animation: fadeIn 0.2s ease-out;
	}

	.alert-banner {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		border-radius: 12px;
		animation: fadeIn 0.25s ease-out;
	}

	.alert-icon {
		flex-shrink: 0;
		margin-top: 0.1rem;
	}

	.alert-content {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.alert-title {
		font-weight: 700;
		font-size: 0.9rem;
	}

	.alert-msg {
		opacity: 0.92;
	}

	.clock-skew-banner {
		background: rgba(222, 77, 20, 0.15);
		border: 1px solid rgba(222, 77, 20, 0.45);
		color: #ff9d66;
	}

	.clock-skew-banner .alert-title {
		color: #ffffff;
	}

	.quarantine-notice-banner {
		background: rgba(219, 70, 62, 0.18);
		border: 1px solid rgba(219, 70, 62, 0.5);
		color: #ff8c85;
	}

	.quarantine-notice-banner .alert-title {
		color: #ffffff;
	}

	.sync-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		border-radius: 10px;
		background: rgba(222, 77, 20, 0.15);
		border: 1px solid rgba(222, 77, 20, 0.4);
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

	/* Disabled (backup duplicate already saved) — clearly greyed out */
	.punch-btn:disabled {
		filter: grayscale(1);
		opacity: 0.4;
		cursor: not-allowed;
		border-style: dashed;
	}

	.punch-btn:disabled .punch-icon,
	.punch-btn:disabled .punch-label {
		color: var(--muted, #888);
	}

	.punch-btn:disabled .punch-caption {
		color: var(--muted, #888);
		font-weight: 700;
	}

	.time-in {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.22) 0%, rgba(237, 233, 71, 0.08) 50%, rgba(36, 21, 74, 0.9) 100%);
		border: 2px solid #22c55e;
		color: #22c55e;
	}

	.time-out {
		background: linear-gradient(135deg, rgba(222, 77, 20, 0.2) 0%, rgba(219, 70, 62, 0.15) 50%, rgba(36, 21, 74, 0.9) 100%);
		border: 2px solid var(--accent-orange, #de4d14);
		color: var(--accent-orange, #de4d14);
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
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.45);
	}

	.pill-out {
		background: rgba(222, 77, 20, 0.2);
		color: var(--accent-orange, #de4d14);
		border: 1px solid rgba(222, 77, 20, 0.4);
	}

	.punch-meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		overflow: hidden;
		flex: 1;
	}

	.pill-quarantined {
		font-size: 0.68rem;
		font-weight: 800;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
		background: rgba(219, 70, 62, 0.2);
		border: 1px solid rgba(219, 70, 62, 0.5);
		color: #ff8c85;
		letter-spacing: 0.03em;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.quarantine-pill-wrap {
		margin-top: 0.2rem;
	}

	.time-text {
		font-size: 0.95rem;
		font-weight: 700;
		color: #ffffff;
		font-family: monospace;
	}

	.wd-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		width: fit-content;
		font-size: 0.65rem;
		font-weight: 700;
		font-family: monospace;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		background: rgba(59, 130, 246, 0.15);
		border: 1px solid rgba(59, 130, 246, 0.45);
		color: #93c5fd;
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
		background: var(--bg, #140d2b);
		display: flex;
		flex-direction: column;
		z-index: 100;
		overflow-y: auto;
	}

	.detail-quarantine-card {
		margin: 1rem 1rem 0;
		padding: 0.85rem 1rem;
		background: rgba(219, 70, 62, 0.2);
		border: 1px solid rgba(219, 70, 62, 0.5);
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.detail-quarantine-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: #ff8c85;
		font-size: 0.9rem;
	}

	.detail-quarantine-reason {
		font-size: 0.82rem;
		color: #fca5a5;
		line-height: 1.4;
	}

	.status-quarantined {
		color: #ff8c85 !important;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.status-accepted {
		color: #22c55e !important;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.status-late {
		color: #de4d14 !important;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
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
		gap: 0.4rem;
		padding: 0.75rem;
		background: var(--accent-orange, #de4d14);
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

	.sync-value {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.sync-value.synced {
		color: var(--accent, #ede947);
	}

	:global(.inline-icon) {
		display: inline-block;
		vertical-align: middle;
	}
</style>
