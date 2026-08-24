<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { getTrustedTime, formatDateTimeDisplay, getClockSyncState, type ClockSyncState } from '$lib/clock';
	import { getGpsPosition, formatCoordinates, type GpsResult, type GpsError } from '$lib/gps';
	import { renderPunchOverlay } from '$lib/camera/overlay';
	import { injectExif } from '$lib/camera/exif';
	import { computeBlobSha256 } from '$lib/crypto';
	import type { PunchType, LocationSource } from '$lib/types/database';
	import { X, SwitchCamera, MapPin, MapPinOff, AlertTriangle, Lock, RefreshCw, Camera } from 'lucide-svelte';

	interface CapturePayload {
		blob: Blob;
		dataUrl: string;
		thumbDataUrl: string;
		sha256: string;
		captured_at: string;
		trusted_clock_epoch: number;
		lat: number | null;
		lng: number | null;
		gps_accuracy_m: number | null;
		location_source: LocationSource;
		location_text: string | null;
	}

	interface Props {
		punchType: PunchType;
		employeeName: string;
		employeeNo: string;
		oncapture: (payload: CapturePayload) => void;
		oncancel: () => void;
	}

	let { punchType, employeeName, employeeNo, oncapture, oncancel }: Props = $props();

	// Elements
	let videoEl = $state<HTMLVideoElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);

	// State
	let stream = $state<MediaStream | null>(null);
	let facingMode = $state<'user' | 'environment'>('user');
	let cameraError = $state<string | null>(null);
	let isCapturing = $state(false);
	let showFlash = $state(false);

	// ── Location gate state machine ──────────────────────────────────────────
	// acquiring        – determining location availability (shutter locked)
	// ready            – real GPS fix acquired (shutter unlocked)
	// blocked_permission – site permission denied → must allow in browser
	// blocked_service    – device location toggle is OFF → must toggle it on
	// weak_signal        – location ON but no fix (indoor/weak) → photo allowed,
	//                      manual location asked AFTER the shutter
	// unsupported        – browser has no geolocation at all
	type LocationGate = 'acquiring' | 'ready' | 'blocked_permission' | 'blocked_service' | 'weak_signal' | 'unsupported';
	let gpsStatus = $state<LocationGate>('acquiring');
	let gpsCoords = $state<GpsResult | null>(null);
	let gpsErrorMsg = $state<string | null>(null);

	const isBlocked = $derived(
		gpsStatus === 'blocked_permission' || gpsStatus === 'blocked_service' || gpsStatus === 'unsupported'
	);

	// Post-capture manual location dialog (weak signal only — never a bypass)
	let showManualModal = $state(false);
	let manualLocationInput = $state('');
	// Frame frozen at shutter time while waiting for the manual location entry
	let pendingFrame: { canvas: HTMLCanvasElement; mirror: boolean } | null = null;

	// Live trusted clock ticker & sync state
	let currentDisplayTime = $state(formatDateTimeDisplay(getTrustedTime().date));
	let clockSyncState = $state<ClockSyncState>(getClockSyncState());
	let clockInterval: ReturnType<typeof setInterval> | null = null;

	let permissionWatch: PermissionStatus | null = null;

	onMount(() => {
		startCamera();
		acquireGps();

		// Tick clock every second and check drift
		clockInterval = setInterval(() => {
			currentDisplayTime = formatDateTimeDisplay(getTrustedTime().date);
			clockSyncState = getClockSyncState();
		}, 1000);

		// Re-check location when the user returns from system/browser settings
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		stopCamera();
		if (clockInterval) clearInterval(clockInterval);
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		detachPermissionWatch();
	});

	function handleVisibilityChange() {
		if (document.visibilityState !== 'visible') return;
		if (gpsStatus === 'blocked_permission' || gpsStatus === 'blocked_service' || gpsStatus === 'weak_signal') {
			acquireGps();
		}
	}

	function detachPermissionWatch() {
		if (permissionWatch) {
			permissionWatch.removeEventListener('change', onPermissionChange);
			permissionWatch = null;
		}
	}

	function onPermissionChange() {
		if (gpsStatus === 'blocked_permission') acquireGps();
	}

	async function startCamera() {
		stopCamera();
		cameraError = null;

		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			cameraError = 'Live camera stream is not supported in this browser. You can take a photo via file upload.';
			return;
		}

		try {
			const constraints: MediaStreamConstraints = {
				audio: false,
				video: {
					facingMode: { ideal: facingMode },
					width: { ideal: 1920 },
					height: { ideal: 1080 }
				}
			};

			const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
			stream = mediaStream;
			if (videoEl) {
				videoEl.srcObject = mediaStream;
				await videoEl.play();
			}
		} catch (err: unknown) {
			console.warn('[Camera] getUserMedia failed:', err);
			// If front camera failed, try fallback without specific facingMode or prompt file input
			if (facingMode === 'user') {
				try {
					const fallbackStream = await navigator.mediaDevices.getUserMedia({
						audio: false,
						video: true
					});
					stream = fallbackStream;
					if (videoEl) {
						videoEl.srcObject = fallbackStream;
						await videoEl.play();
					}
					return;
				} catch {
					// Fallthrough
				}
			}
			cameraError = 'Could not access camera. Please allow camera permissions or take a photo using the shutter button.';
		}
	}

	function stopCamera() {
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
	}

	function toggleCamera() {
		facingMode = facingMode === 'user' ? 'environment' : 'user';
		startCamera();
	}

	async function acquireGps() {
		gpsStatus = 'acquiring';
		gpsErrorMsg = null;

		// Fast-path: if site permission is already denied, asking again is pointless —
		// show the unblock instructions immediately.
		try {
			if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
				const st = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
				detachPermissionWatch();
				permissionWatch = st;
				st.addEventListener('change', onPermissionChange);
				if (st.state === 'denied') {
					gpsStatus = 'blocked_permission';
					return;
				}
			}
		} catch {
			// Safari / unsupported — fall through to a real position attempt
		}

		try {
			gpsCoords = await getGpsPosition(10000);
			gpsStatus = 'ready';
		} catch (err: unknown) {
			const error = err as GpsError;
			gpsErrorMsg = error.message || 'Location unavailable';

			switch (error.code) {
				case 'PERMISSION_DENIED':
					gpsStatus = 'blocked_permission';
					break;
				case 'POSITION_UNAVAILABLE':
					// Device location services are off (no provider available)
					gpsStatus = 'blocked_service';
					break;
				case 'TIMEOUT':
					// Location is likely ON but no fix (indoor / weak signal)
					gpsStatus = 'weak_signal';
					break;
				default:
					gpsStatus = 'unsupported';
			}
		}
	}

	/** Freeze the current video frame into an offscreen canvas for later processing */
	function freezeVideoFrame(): { canvas: HTMLCanvasElement; mirror: boolean } | null {
		if (!videoEl || !videoEl.videoWidth) return null;
		const canvas = document.createElement('canvas');
		canvas.width = videoEl.videoWidth;
		canvas.height = videoEl.videoHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
		return { canvas, mirror: facingMode === 'user' };
	}

	async function emitPayload(
		source: CanvasImageSource,
		sourceWidth: number,
		sourceHeight: number,
		mirror: boolean,
		manualText: string | null
	) {
		const trusted = getTrustedTime();
		const locationSource: LocationSource = manualText ? 'manual' : 'gps';
		const coords =
			locationSource === 'gps' && gpsCoords
				? { lat: gpsCoords.lat, lng: gpsCoords.lng, accuracy: gpsCoords.accuracy }
				: undefined;

		// 1. Render canvas burn-in overlay
		const overlay = await renderPunchOverlay({
			source,
			sourceWidth,
			sourceHeight,
			punchType,
			date: trusted.date,
			employeeName,
			employeeNo,
			locationSource,
			coords,
			locationText: manualText ?? undefined,
			mirrorX: mirror,
			targetSize: 1080,
			quality: 0.85
		});

		// 2. Inject EXIF metadata
		const finalBlob = await injectExif(overlay.blob, {
			date: trusted.date,
			employeeName,
			employeeNo,
			punchType,
			coords,
			locationText: manualText ?? undefined
		});

		// 3. Compute SHA-256 hash of final image bytes
		const sha256 = await computeBlobSha256(finalBlob);

		// 4. Return complete payload
		oncapture({
			blob: finalBlob,
			dataUrl: overlay.dataUrl,
			thumbDataUrl: overlay.thumbDataUrl,
			sha256,
			captured_at: trusted.date.toISOString(),
			trusted_clock_epoch: trusted.epochMs,
			lat: coords?.lat ?? null,
			lng: coords?.lng ?? null,
			gps_accuracy_m: coords?.accuracy ?? null,
			location_source: locationSource,
			location_text: locationSource === 'manual' ? manualText : null
		});
	}

	async function takeSnapshot() {
		if (isCapturing) return;

		// Hard block: location must be verifiably ON (permission granted + service enabled)
		if (isBlocked || gpsStatus === 'acquiring') return;

		if (cameraError || !videoEl) {
			// Trigger file capture fallback (same location rules apply there)
			if (fileInputEl) fileInputEl.click();
			return;
		}

		isCapturing = true;
		showFlash = true;
		setTimeout(() => (showFlash = false), 200);

		try {
			const frame = freezeVideoFrame();
			if (!frame) throw new Error('Could not read camera frame');

			if (gpsStatus === 'ready' && gpsCoords) {
				await emitPayload(frame.canvas, frame.canvas.width, frame.canvas.height, frame.mirror, null);
			} else {
				// Weak signal: photo taken — ask for location AFTER capture
				pendingFrame = frame;
				showManualModal = true;
			}
		} catch (err) {
			console.error('[Camera] Capture error:', err);
			alert('Failed to process punch photo. Please try again.');
		} finally {
			isCapturing = false;
		}
	}

	async function handleFileInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = '';

		if (isBlocked || gpsStatus === 'acquiring') return;

		isCapturing = true;
		try {
			const img = new Image();
			const objectUrl = URL.createObjectURL(file);
			img.src = objectUrl;
			await new Promise((res) => (img.onload = res));

			const canvas = document.createElement('canvas');
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas unavailable');
			ctx.drawImage(img, 0, 0);
			URL.revokeObjectURL(objectUrl);

			if (gpsStatus === 'ready' && gpsCoords) {
				await emitPayload(canvas, canvas.width, canvas.height, false, null);
			} else {
				pendingFrame = { canvas, mirror: false };
				showManualModal = true;
			}
		} catch (err) {
			console.error('[Camera] File input process error:', err);
			alert('Failed to process photo.');
		} finally {
			isCapturing = false;
		}
	}

	function confirmManualLocation() {
		const trimmed = manualLocationInput.trim();
		if (!trimmed || !pendingFrame) return;

		const frame = pendingFrame;
		pendingFrame = null;
		showManualModal = false;
		manualLocationInput = '';

		emitPayload(frame.canvas, frame.canvas.width, frame.canvas.height, frame.mirror, trimmed).catch(
			(err) => {
				console.error('[Camera] Manual-location finalize error:', err);
				alert('Failed to process punch photo. Please take another.');
			}
		);
	}

	function cancelManualLocation() {
		pendingFrame = null;
		showManualModal = false;
		manualLocationInput = '';
	}

	function gpsPillOnClick() {
		if (gpsStatus !== 'ready' && gpsStatus !== 'acquiring') acquireGps();
	}
</script>

<div class="camera-modal">
	<!-- Hidden file input fallback for iOS / unsupported browsers -->
	<input
		bind:this={fileInputEl}
		type="file"
		accept="image/*"
		capture="user"
		class="hidden-file-input"
		onchange={handleFileInputChange}
	/>

	<!-- Flash effect -->
	<div class="flash-screen" class:active={showFlash}></div>

	<!-- Top Controls -->
	<div class="top-bar">
		<button class="icon-btn" onclick={oncancel} aria-label="Cancel">
			<X size={22} />
		</button>

		<!-- Location Status Pill -->
		<button
			class="gps-pill"
			class:gps-ready={gpsStatus === 'ready'}
			class:gps-acquiring={gpsStatus === 'acquiring'}
			class:gps-blocked={isBlocked}
			class:gps-weak={gpsStatus === 'weak_signal'}
			onclick={gpsPillOnClick}
		>
			{#if gpsStatus === 'acquiring'}
				<span class="pulse-dot"></span> Checking location…
			{:else if gpsStatus === 'ready' && gpsCoords}
				<MapPin size={13} /> GPS: {formatCoordinates(gpsCoords.lat, gpsCoords.lng, gpsCoords.accuracy)}
			{:else if gpsStatus === 'weak_signal'}
				<AlertTriangle size={13} /> Weak GPS — allowed, will ask after
			{:else if gpsStatus === 'blocked_permission'}
				<MapPinOff size={13} /> Permission blocked — tap to fix
			{:else if gpsStatus === 'blocked_service'}
				<MapPinOff size={13} /> Location is OFF — tap to fix
			{:else}
				<MapPinOff size={13} /> No location support
			{/if}
		</button>

		<button class="icon-btn" onclick={toggleCamera} aria-label="Flip camera">
			<SwitchCamera size={20} />
		</button>
	</div>

	<!-- Live Viewfinder -->
	<div class="viewfinder-container">
		{#if cameraError}
			<div class="camera-error-box">
				<p>{cameraError}</p>
				<button class="btn-fallback" disabled={isBlocked || gpsStatus === 'acquiring'} onclick={() => fileInputEl?.click()}>
					<Camera size={18} class="inline-icon" /> Take Photo with Device Camera
				</button>
			</div>
		{:else}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoEl}
				autoplay
				playsinline
				muted
				class="camera-video"
				class:mirrored={facingMode === 'user'}
				class:dimmed={isBlocked}
			></video>
		{/if}

		<!-- Framing guide -->
		<div class="framing-guide"></div>

		{#if clockSyncState.isDrifted && !isBlocked}
			<div class="clock-desync-chip" role="alert">
				<AlertTriangle size={13} class="inline-icon" />
				<span>Phone time out of sync ({clockSyncState.driftDescription})</span>
			</div>
		{/if}

		<!-- Location Blocked Overlay — photo taking is locked until resolved -->
		{#if isBlocked}
			<div class="loc-block-overlay" role="alertdialog" aria-live="assertive">
				<div class="loc-block-card">
					<span class="loc-block-icon"><MapPinOff size={34} /></span>

					<h3 class="loc-block-title">
						{gpsStatus === 'blocked_permission'
							? 'Location Permission Blocked'
							: gpsStatus === 'blocked_service'
								? 'Device Location Is Turned Off'
								: 'Location Not Supported'}
					</h3>

					<p class="loc-block-desc">
						DTRCam requires your location to be <strong>ON</strong> for every time in / time out photo.
						Photo taking is locked until location is enabled.
					</p>

					{#if gpsStatus === 'blocked_permission'}
						<ol class="loc-block-steps">
							<li>Tap the <strong>lock 🔒 / ⓘ icon</strong> beside the site address in your browser.</li>
							<li>Go to <strong>Permissions → Location</strong> and set it to <strong>Allow</strong>.</li>
							<li>Come back here and press <strong>Retry</strong>.</li>
						</ol>
					{:else if gpsStatus === 'blocked_service'}
						<ol class="loc-block-steps">
							<li>Swipe down from the top of your screen to open <strong>Quick Settings</strong>.</li>
							<li>Toggle <strong>Location</strong> ON.</li>
							<li>Come back here and press <strong>Retry</strong>.</li>
						</ol>
					{:else}
						<p class="loc-block-desc">This browser does not support location. Please use Chrome or Safari on your phone.</p>
					{/if}

					{#if gpsErrorMsg && gpsStatus !== 'unsupported'}
						<p class="loc-block-err">({gpsErrorMsg})</p>
					{/if}

					<button class="btn-retry" onclick={acquireGps}>
						<RefreshCw size={16} /> Retry Location Check
					</button>
				</div>
			</div>
		{/if}

		<!-- Live Timestamp / Overlay Preview Pill -->
		<div class="live-overlay-preview">
			<span class="preview-badge" class:badge-in={punchType === 'in'} class:badge-out={punchType === 'out'}>
				{punchType === 'in' ? 'TIME IN' : 'TIME OUT'}
			</span>
			<span class="preview-time">{currentDisplayTime}</span>
		</div>
	</div>

	<!-- Bottom Shutter Bar -->
	<div class="bottom-bar">
		<button
			class="shutter-btn"
			class:capturing={isCapturing}
			class:locked={isBlocked || gpsStatus === 'acquiring'}
			disabled={isBlocked || gpsStatus === 'acquiring' || isCapturing}
			onclick={takeSnapshot}
			aria-label={isBlocked ? 'Location required before taking photo' : 'Capture attendance selfie'}
		>
			<div class="shutter-inner" class:inner-in={punchType === 'in'} class:inner-out={punchType === 'out'}>
				{#if isBlocked}
					<span class="lock-badge"><Lock size={22} /></span>
				{/if}
			</div>
		</button>
		<p class="shutter-hint">
			{#if isBlocked}
				Photo locked — enable location first
			{:else if gpsStatus === 'acquiring'}
				Locating…
			{:else if gpsStatus === 'weak_signal'}
				Weak GPS signal — you'll confirm your location after the photo
			{:else}
				Position yourself and tap the shutter
			{/if}
		</p>
	</div>

	<!-- Post-Capture Manual Location Modal (weak GPS signal only) -->
	{#if showManualModal}
		<div class="modal-backdrop">
			<div class="modal-card">
				<h3 class="modal-title">Confirm Your Location</h3>
				<p class="modal-subtitle">
					Your photo was captured, but we couldn't get a GPS fix (weak signal indoors).
					Please type your current location to attach it to this record.
				</p>

				<input
					type="text"
					bind:value={manualLocationInput}
					placeholder="e.g. Makati Branch, 2nd Floor"
					class="manual-input"
					autofocus
				/>

				<div class="modal-actions">
					<button class="btn-cancel" onclick={cancelManualLocation}>Discard Photo</button>
					<button
						class="btn-confirm"
						disabled={!manualLocationInput.trim()}
						onclick={confirmManualLocation}
					>
						Attach & Submit
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.camera-modal {
		position: fixed;
		inset: 0;
		background: #000000;
		z-index: 100;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		user-select: none;
		touch-action: manipulation;
	}

	.hidden-file-input {
		display: none;
	}

	.flash-screen {
		position: fixed;
		inset: 0;
		background: #ffffff;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease-out;
		z-index: 200;
	}

	.flash-screen.active {
		opacity: 0.9;
	}

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		z-index: 10;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent);
		gap: 0.5rem;
	}

	.icon-btn {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(26, 26, 26, 0.75);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #ffffff;
		font-size: 1.2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	.gps-pill {
		flex: 1;
		max-width: 280px;
		padding: 0.45rem 0.75rem;
		border-radius: 20px;
		font-size: 0.72rem;
		font-family: inherit;
		font-weight: 600;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(20, 20, 20, 0.85);
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	.gps-ready {
		border-color: rgba(34, 197, 94, 0.5);
		color: #22c55e;
	}

	.gps-blocked {
		border-color: rgba(219, 70, 62, 0.6);
		color: #ff8c85;
		animation: blockedPulse 1.4s ease-in-out infinite alternate;
	}

	.gps-weak {
		border-color: rgba(237, 233, 71, 0.55);
		color: #ede947;
	}

	@keyframes blockedPulse {
		from {
			box-shadow: 0 0 0 0 rgba(219, 70, 62, 0.45);
		}
		to {
			box-shadow: 0 0 0 6px rgba(219, 70, 62, 0);
		}
	}

	.pulse-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ede947;
		animation: pulse 1s infinite alternate;
	}

	@keyframes pulse {
		from {
			opacity: 0.3;
		}
		to {
			opacity: 1;
		}
	}

	.viewfinder-container {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: #0d0d0d;
	}

	.camera-video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.camera-video.mirrored {
		transform: scaleX(-1);
	}

	.camera-video.dimmed {
		filter: brightness(0.35) grayscale(0.6);
	}

	.framing-guide {
		position: absolute;
		width: min(85vw, 85vh);
		height: min(85vw, 85vh);
		border: 2px dashed rgba(255, 255, 255, 0.3);
		border-radius: 12px;
		pointer-events: none;
	}

	.clock-desync-chip {
		position: absolute;
		top: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(219, 70, 62, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.3);
		color: #ffffff;
		padding: 0.35rem 0.75rem;
		border-radius: 20px;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		font-weight: 700;
		backdrop-filter: blur(8px);
		z-index: 6;
		white-space: nowrap;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.live-overlay-preview {
		position: absolute;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(22, 13, 51, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.15);
		padding: 0.4rem 0.85rem;
		border-radius: 20px;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		backdrop-filter: blur(8px);
		z-index: 5;
	}

	.preview-badge {
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
		text-transform: uppercase;
	}

	.badge-in {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.45);
	}

	.badge-out {
		background: rgba(222, 77, 20, 0.25);
		color: #de4d14;
		border: 1px solid rgba(222, 77, 20, 0.4);
	}

	.preview-time {
		font-size: 0.8rem;
		font-family: monospace;
		color: #ffffff;
	}

	/* Location blocked overlay */
	.loc-block-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.25rem;
		z-index: 8;
		background: rgba(10, 5, 24, 0.45);
	}

	.loc-block-card {
		background: #24154a;
		border: 1px solid rgba(219, 70, 62, 0.6);
		border-radius: 14px;
		padding: 1.4rem 1.3rem;
		max-width: 380px;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.7rem;
		text-align: center;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
		animation: cardIn 0.25s ease-out;
	}

	@keyframes cardIn {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.loc-block-icon {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		background: rgba(219, 70, 62, 0.18);
		border: 1px solid rgba(219, 70, 62, 0.5);
		color: #ff8c85;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.loc-block-title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 800;
		color: #ffffff;
	}

	.loc-block-desc {
		margin: 0;
		font-size: 0.84rem;
		line-height: 1.45;
		color: #d9cffa;
	}

	.loc-block-desc strong {
		color: #ffffff;
	}

	.loc-block-steps {
		margin: 0;
		padding-left: 1.2rem;
		text-align: left;
		font-size: 0.82rem;
		line-height: 1.5;
		color: #b8abdd;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.loc-block-steps strong {
		color: #ede947;
	}

	.loc-block-err {
		margin: 0;
		font-size: 0.72rem;
		color: #8f80bd;
		word-break: break-word;
	}

	.btn-retry {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		width: 100%;
		padding: 0.75rem 1rem;
		background: #ede947;
		color: #160d33;
		border: none;
		border-radius: 8px;
		font-weight: 800;
		font-size: 0.92rem;
		cursor: pointer;
		margin-top: 0.25rem;
	}

	.bottom-bar {
		padding: 1.25rem 1rem 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		background: linear-gradient(to top, rgba(14, 7, 31, 0.95), transparent);
		z-index: 10;
	}

	.shutter-btn {
		width: 76px;
		height: 76px;
		border-radius: 50%;
		background: transparent;
		border: 4px solid #ffffff;
		padding: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.1s, border-color 0.2s;
	}

	.shutter-btn:active:not(:disabled) {
		transform: scale(0.92);
	}

	.shutter-inner {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		transition: transform 0.15s, background-color 0.2s;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.inner-in {
		background: #22c55e;
	}

	.inner-out {
		background: #de4d14;
	}

	.shutter-btn.locked {
		cursor: not-allowed;
		border-color: rgba(255, 255, 255, 0.4);
	}

	.shutter-btn.locked .shutter-inner {
		background: #3a3a3a;
		opacity: 0.85;
	}

	.lock-badge {
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.shutter-btn.capturing .shutter-inner {
		transform: scale(0.75);
		opacity: 0.7;
	}

	.shutter-hint {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.75);
		text-align: center;
	}

	.camera-error-box {
		padding: 2rem;
		text-align: center;
		color: #db463e;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		align-items: center;
	}

	.btn-fallback {
		padding: 0.8rem 1.25rem;
		background: #ede947;
		color: #160d33;
		border: none;
		border-radius: 8px;
		font-weight: 800;
		font-size: 0.95rem;
		cursor: pointer;
	}

	.btn-fallback:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Manual Location Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(14, 7, 31, 0.85);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		z-index: 300;
	}

	.modal-card {
		background: #24154a;
		border: 1px solid #3f2776;
		border-radius: 12px;
		padding: 1.5rem;
		width: 100%;
		max-width: 380px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.modal-title {
		font-size: 1.15rem;
		font-weight: 700;
		color: #ffffff;
	}

	.modal-subtitle {
		font-size: 0.85rem;
		color: #b8abdd;
		line-height: 1.4;
	}

	.manual-input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: #140d2b;
		border: 1px solid #3f2776;
		border-radius: 8px;
		color: #ffffff;
		font-size: 0.95rem;
		outline: none;
	}

	.manual-input:focus {
		border-color: #ede947;
	}

	.modal-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	.btn-cancel {
		padding: 0.65rem 1rem;
		background: transparent;
		border: 1px solid #3f2776;
		color: #b8abdd;
		border-radius: 6px;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.btn-confirm {
		padding: 0.65rem 1.2rem;
		background: #ede947;
		border: none;
		color: #160d33;
		font-weight: 800;
		border-radius: 6px;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.btn-confirm:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
