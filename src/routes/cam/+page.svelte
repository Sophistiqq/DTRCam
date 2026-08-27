<script lang="ts">
	import { onMount } from 'svelte';
	import CameraCapture from '$lib/components/CameraCapture.svelte';
	import { initTrustedClock, getTrustedTime, formatWorkDate } from '$lib/clock';
	import { enqueuePunch, cachePunchPhoto } from '$lib/queue/db';
	import { initSyncEngine, triggerSync, subscribeSyncStatus, type SyncStatus } from '$lib/queue/sync';
	import { requestStoragePersistence } from '$lib/storage';
	import { Camera, LogIn, LogOut, HardDrive, RefreshCw, CircleCheckBig, User } from 'lucide-svelte';
	import type { PunchType } from '$lib/types/database';

	const STORAGE_KEY = 'dtrcam_pending_employee_no';

	let activePunchType = $state<PunchType | null>(null);
	let successToast = $state<string | null>(null);
	let syncStatus = $state<SyncStatus>({
		isSyncing: false,
		pendingCount: 0,
		lastSyncAt: null,
		lastError: null
	});
	let unsubscribeSync: (() => void) | null = null;
	let queuedCount = $state(0);

	// Employee ID prompt state
	let employeeNo = $state('');
	let showIdPrompt = $state(true);
	let idInput = $state('');

	onMount(() => {
		initTrustedClock();
		initSyncEngine();
		requestStoragePersistence();

		// Restore cached employee number
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				employeeNo = saved;
				showIdPrompt = false;
			}
		} catch {}

		unsubscribeSync = subscribeSyncStatus((status) => {
			syncStatus = status;
			queuedCount = status.pendingCount;
		});

		return () => {
			if (unsubscribeSync) unsubscribeSync();
		};
	});

	function saveEmployeeId() {
		const trimmed = idInput.trim();
		if (!trimmed) return;
		employeeNo = trimmed;
		showIdPrompt = false;
		try {
			localStorage.setItem(STORAGE_KEY, trimmed);
		} catch {}
	}

	function changeEmployeeId() {
		showIdPrompt = true;
		idInput = '';
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
		const workDate = formatWorkDate(getTrustedTime().date);
		const timezoneOffsetMin = -new Date(payload.captured_at).getTimezoneOffset();
		const punchType = activePunchType || 'in';

		await cachePunchPhoto(recordId, payload.blob, payload.dataUrl);

		await enqueuePunch({
			id: recordId,
			employee_id: employeeNo,
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
			payload_sha256: payload.sha256
		});

		closeCamera();
		queuedCount++;

		successToast = `Photo saved! Will sync as #${employeeNo} when online.`;
		setTimeout(() => { successToast = null; }, 4000);

		triggerSync();
	}
</script>

<div class="cam-page">
	<header class="cam-header">
		<div class="cam-brand">
			<Camera size={22} />
			<span class="cam-title">DTRCam</span>
		</div>
		<div class="header-right">
			{#if !showIdPrompt}
			<button class="btn-id" onclick={changeEmployeeId}>
				<User size={14} /> #{employeeNo}
			</button>
			{/if}
			<a href="/login" class="btn-login">
				<LogIn size={14} /> Login
			</a>
		</div>
	</header>

	{#if showIdPrompt}
		<div class="id-prompt">
			<div class="id-card">
				<User size={32} class="id-icon" />
				<h2 class="id-title">Enter Your Employee ID</h2>
				<p class="id-desc">Your photos will be linked to this ID when synced.</p>
				<form class="id-form" onsubmit={(e) => { e.preventDefault(); saveEmployeeId(); }}>
					<input
						type="text"
						inputmode="numeric"
						class="id-input"
						placeholder="e.g. 1001"
						bind:value={idInput}
						autofocus
					/>
					<button type="submit" class="id-submit" disabled={!idInput.trim()}>
						Continue
					</button>
				</form>
			</div>
		</div>
	{:else}
		{#if successToast}
			<div class="toast" role="status">
				<CircleCheckBig size={16} />
				<span>{successToast}</span>
			</div>
		{/if}

		{#if queuedCount > 0}
			<div class="queue-bar">
				<div class="queue-info">
					{#if syncStatus.isSyncing}
						<span class="spin-icon"><RefreshCw size={14} /></span>
						<span>Syncing...</span>
					{:else}
						<HardDrive size={14} />
						<span><strong>{queuedCount}</strong> photo{queuedCount !== 1 ? 's' : ''} queued</span>
					{/if}
				</div>
				<button
					class="btn-sync"
					disabled={syncStatus.isSyncing}
					onclick={() => triggerSync(true)}
				>
					Sync Now
				</button>
			</div>
		{/if}

		<section class="cam-actions">
			<button class="cam-btn time-in" onclick={() => openCamera('in')}>
				<span class="cam-btn-icon"><LogIn size={32} /></span>
				<span class="cam-btn-label">TIME IN</span>
				<span class="cam-btn-sub">Record arrival</span>
			</button>

			<button class="cam-btn time-out" onclick={() => openCamera('out')}>
				<span class="cam-btn-icon"><LogOut size={32} /></span>
				<span class="cam-btn-label">TIME OUT</span>
				<span class="cam-btn-sub">Record departure</span>
			</button>
		</section>

		<div class="offline-notice">
			Photos are saved locally as <strong>#{employeeNo}</strong>. Login to sync with server.
		</div>
	{/if}
</div>

{#if activePunchType}
	<CameraCapture
		punchType={activePunchType}
		employeeName="Employee"
		employeeNo={employeeNo}
		oncapture={handleCapture}
		oncancel={closeCamera}
	/>
{/if}

<style>
	.cam-page {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		background: var(--bg, #000000);
		color: var(--text, #f0f0f0);
	}

	.cam-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: var(--surface, #1a1a1a);
		border-bottom: 1px solid var(--border, #2a2a2a);
	}

	.cam-brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--accent, #ede947);
	}

	.cam-title {
		font-weight: 800;
		font-size: 1.1rem;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-id, .btn-login {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.65rem;
		background: transparent;
		border: 1px solid var(--border, #333);
		border-radius: 4px;
		color: var(--muted, #888);
		text-decoration: none;
		font-size: 0.75rem;
		font-family: inherit;
		cursor: pointer;
	}

	.btn-id {
		border-color: rgba(237, 233, 71, 0.3);
		color: var(--accent, #ede947);
	}

	.btn-login:hover, .btn-id:hover {
		border-color: var(--accent, #ede947);
		color: var(--accent, #ede947);
	}

	/* Employee ID prompt */
	.id-prompt {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}

	.id-card {
		width: 100%;
		max-width: 340px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	:global(.id-icon) {
		color: var(--accent, #ede947);
	}

	.id-title {
		font-size: 1.3rem;
		font-weight: 800;
	}

	.id-desc {
		font-size: 0.85rem;
		color: var(--muted, #888);
		margin-top: -0.25rem;
	}

	.id-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		margin-top: 0.5rem;
	}

	.id-input {
		width: 100%;
		padding: 0.85rem 1rem;
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #333);
		border-radius: 4px;
		color: var(--text, #fff);
		font-size: 1.2rem;
		font-family: monospace;
		text-align: center;
		letter-spacing: 0.08em;
		outline: none;
	}

	.id-input:focus {
		border-color: var(--accent, #ede947);
	}

	.id-submit {
		padding: 0.85rem;
		background: var(--accent, #ede947);
		color: #1b0d38;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 800;
		cursor: pointer;
		font-family: inherit;
	}

	.id-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.7rem 1rem;
		margin: 0.75rem 1rem 0;
		background: rgba(34, 197, 94, 0.15);
		border: 1px solid rgba(34, 197, 94, 0.4);
		color: #22c55e;
		border-radius: 4px;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.queue-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 1rem;
		margin: 0.5rem 1rem 0;
		background: rgba(222, 77, 20, 0.12);
		border: 1px solid rgba(222, 77, 20, 0.35);
		border-radius: 4px;
		font-size: 0.85rem;
		color: #ffffff;
	}

	.queue-info {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.spin-icon {
		display: inline-block;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.btn-sync {
		padding: 0.3rem 0.65rem;
		background: #ffffff;
		color: #000000;
		border: none;
		border-radius: 4px;
		font-weight: 700;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.btn-sync:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cam-actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.5rem 1rem;
		flex: 1;
		justify-content: center;
	}

	.cam-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-family: inherit;
		transition: opacity 0.15s;
	}

	.cam-btn:active {
		opacity: 0.85;
	}

	.time-in {
		background: rgba(34, 197, 94, 0.2);
		border: 2px solid #22c55e;
		color: #22c55e;
	}

	.time-out {
		background: rgba(222, 77, 20, 0.15);
		border: 2px solid var(--accent-orange, #de4d14);
		color: var(--accent-orange, #de4d14);
	}

	.cam-btn-icon {
		font-size: 1.8rem;
	}

	.cam-btn-label {
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: 0.04em;
	}

	.cam-btn-sub {
		font-size: 0.8rem;
		opacity: 0.8;
	}

	.offline-notice {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.75rem 1rem;
		color: var(--muted, #666);
		font-size: 0.75rem;
		text-align: center;
	}

	.offline-notice strong {
		color: var(--accent, #ede947);
		font-family: monospace;
	}
</style>
