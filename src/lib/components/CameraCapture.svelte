<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { getTrustedTime, formatDateTimeDisplay } from '$lib/clock';
	import { getGpsPosition, formatCoordinates, type GpsResult } from '$lib/gps';
	import { renderPunchOverlay } from '$lib/camera/overlay';
	import { injectExif } from '$lib/camera/exif';
	import { computeBlobSha256 } from '$lib/crypto';
	import type { PunchType, LocationSource } from '$lib/types/database';
	import { X, SwitchCamera, MapPin, AlertTriangle, FileText, Camera } from 'lucide-svelte';

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

	// GPS State
	let gpsStatus = $state<'acquiring' | 'ready' | 'failed' | 'manual'>('acquiring');
	let gpsCoords = $state<GpsResult | null>(null);
	let gpsErrorMsg = $state<string | null>(null);

	// Manual Location Dialog
	let showManualModal = $state(false);
	let manualLocationInput = $state('');
	let manualLocationSaved = $state<string | null>(null);

	// Live trusted clock ticker
	let currentDisplayTime = $state(formatDateTimeDisplay(getTrustedTime().date));
	let clockInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		startCamera();
		acquireGps();

		// Tick clock every second
		clockInterval = setInterval(() => {
			currentDisplayTime = formatDateTimeDisplay(getTrustedTime().date);
		}, 1000);
	});

	onDestroy(() => {
		stopCamera();
		if (clockInterval) clearInterval(clockInterval);
	});

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

		try {
			const pos = await getGpsPosition(10000);
			gpsCoords = pos;
			gpsStatus = 'ready';
		} catch (err: unknown) {
			const error = err as { message?: string };
			gpsErrorMsg = error.message || 'GPS location not available';
			gpsStatus = 'failed';
			showManualModal = true;
		}
	}

	function saveManualLocation() {
		const trimmed = manualLocationInput.trim();
		if (!trimmed) return;
		manualLocationSaved = trimmed;
		gpsStatus = 'manual';
		showManualModal = false;
	}

	async function takeSnapshot() {
		if (isCapturing) return;

		// Ensure we have GPS or manual location
		if (gpsStatus === 'failed' && !manualLocationSaved) {
			showManualModal = true;
			return;
		}

		if (cameraError || !videoEl) {
			// Trigger file capture fallback
			if (fileInputEl) fileInputEl.click();
			return;
		}

		isCapturing = true;
		showFlash = true;
		setTimeout(() => (showFlash = false), 200);

		try {
			const trusted = getTrustedTime();
			const locationSource: LocationSource =
				gpsStatus === 'ready' && gpsCoords ? 'gps' : 'manual';

			// 1. Render canvas burn-in overlay
			const overlay = await renderPunchOverlay({
				source: videoEl,
				sourceWidth: videoEl.videoWidth || 1080,
				sourceHeight: videoEl.videoHeight || 1080,
				punchType,
				date: trusted.date,
				employeeName,
				employeeNo,
				locationSource,
				coords:
					locationSource === 'gps' && gpsCoords
						? { lat: gpsCoords.lat, lng: gpsCoords.lng, accuracy: gpsCoords.accuracy }
						: undefined,
				locationText: manualLocationSaved || undefined,
				mirrorX: facingMode === 'user',
				targetSize: 1080,
				quality: 0.85
			});

			// 2. Inject EXIF metadata
			const finalBlob = await injectExif(overlay.blob, {
				date: trusted.date,
				employeeName,
				employeeNo,
				punchType,
				coords:
					locationSource === 'gps' && gpsCoords
						? { lat: gpsCoords.lat, lng: gpsCoords.lng, accuracy: gpsCoords.accuracy }
						: undefined,
				locationText: manualLocationSaved || undefined
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
				lat: locationSource === 'gps' && gpsCoords ? gpsCoords.lat : null,
				lng: locationSource === 'gps' && gpsCoords ? gpsCoords.lng : null,
				gps_accuracy_m: locationSource === 'gps' && gpsCoords ? gpsCoords.accuracy : null,
				location_source: locationSource,
				location_text: locationSource === 'manual' ? manualLocationSaved : null
			});
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

		isCapturing = true;
		try {
			const img = new Image();
			const objectUrl = URL.createObjectURL(file);
			img.src = objectUrl;
			await new Promise((res) => (img.onload = res));

			const trusted = getTrustedTime();
			const locationSource: LocationSource =
				gpsStatus === 'ready' && gpsCoords ? 'gps' : 'manual';

			const overlay = await renderPunchOverlay({
				source: img,
				sourceWidth: img.naturalWidth,
				sourceHeight: img.naturalHeight,
				punchType,
				date: trusted.date,
				employeeName,
				employeeNo,
				locationSource,
				coords:
					locationSource === 'gps' && gpsCoords
						? { lat: gpsCoords.lat, lng: gpsCoords.lng, accuracy: gpsCoords.accuracy }
						: undefined,
				locationText: manualLocationSaved || undefined,
				mirrorX: false,
				targetSize: 1080,
				quality: 0.85
			});

			URL.revokeObjectURL(objectUrl);

			const finalBlob = await injectExif(overlay.blob, {
				date: trusted.date,
				employeeName,
				employeeNo,
				punchType,
				coords:
					locationSource === 'gps' && gpsCoords
						? { lat: gpsCoords.lat, lng: gpsCoords.lng, accuracy: gpsCoords.accuracy }
						: undefined,
				locationText: manualLocationSaved || undefined
			});

			const sha256 = await computeBlobSha256(finalBlob);

			oncapture({
				blob: finalBlob,
				dataUrl: overlay.dataUrl,
				thumbDataUrl: overlay.thumbDataUrl,
				sha256,
				captured_at: trusted.date.toISOString(),
				trusted_clock_epoch: trusted.epochMs,
				lat: locationSource === 'gps' && gpsCoords ? gpsCoords.lat : null,
				lng: locationSource === 'gps' && gpsCoords ? gpsCoords.lng : null,
				gps_accuracy_m: locationSource === 'gps' && gpsCoords ? gpsCoords.accuracy : null,
				location_source: locationSource,
				location_text: locationSource === 'manual' ? manualLocationSaved : null
			});
		} catch (err) {
			console.error('[Camera] File input process error:', err);
			alert('Failed to process photo.');
		} finally {
			isCapturing = false;
		}
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

		<!-- GPS Status Pill -->
		<button
			class="gps-pill"
			class:gps-ready={gpsStatus === 'ready'}
			class:gps-acquiring={gpsStatus === 'acquiring'}
			class:gps-failed={gpsStatus === 'failed'}
			class:gps-manual={gpsStatus === 'manual'}
			onclick={() => (showManualModal = true)}
		>
			{#if gpsStatus === 'acquiring'}
				<span class="pulse-dot"></span> Acquiring GPS…
			{:else if gpsStatus === 'ready' && gpsCoords}
				<MapPin size={13} /> GPS: {formatCoordinates(gpsCoords.lat, gpsCoords.lng, gpsCoords.accuracy)}
			{:else if gpsStatus === 'manual'}
				<FileText size={13} /> {manualLocationSaved}
			{:else}
				<AlertTriangle size={13} /> No GPS (Tap to enter)
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
				<button class="btn-fallback" onclick={() => fileInputEl?.click()}>
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
			></video>
		{/if}

		<!-- Square Framing Guide Overlay -->
		<div class="framing-guide"></div>

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
			disabled={isCapturing}
			onclick={takeSnapshot}
			aria-label="Capture attendance selfie"
		>
			<div class="shutter-inner" class:inner-in={punchType === 'in'} class:inner-out={punchType === 'out'}></div>
		</button>
	</div>

	<!-- Manual Location Modal -->
	{#if showManualModal}
		<div class="modal-backdrop">
			<div class="modal-card">
				<h3 class="modal-title">Enter Your Location</h3>
				<p class="modal-subtitle">
					{#if gpsStatus === 'failed'}
						GPS fix could not be acquired. Please type your location to proceed.
					{:else}
						You can manually specify your current work location:
					{/if}
				</p>

				<input
					type="text"
					bind:value={manualLocationInput}
					placeholder="e.g. Makati Branch, 2nd Floor"
					class="manual-input"
					autofocus
				/>

				<div class="modal-actions">
					{#if gpsStatus === 'ready' || manualLocationSaved}
						<button class="btn-cancel" onclick={() => (showManualModal = false)}>Cancel</button>
					{/if}
					<button
						class="btn-confirm"
						disabled={!manualLocationInput.trim()}
						onclick={saveManualLocation}
					>
						Save Location
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
		max-width: 260px;
		padding: 0.45rem 0.75rem;
		border-radius: 20px;
		font-size: 0.75rem;
		font-family: inherit;
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
		border-color: rgba(74, 222, 128, 0.5);
		color: #4ade80;
	}

	.gps-failed {
		border-color: rgba(248, 113, 113, 0.5);
		color: #f87171;
	}

	.gps-manual {
		border-color: rgba(251, 191, 36, 0.5);
		color: #fbbf24;
	}

	.pulse-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #fbbf24;
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

	.framing-guide {
		position: absolute;
		width: min(85vw, 85vh);
		height: min(85vw, 85vh);
		border: 2px dashed rgba(255, 255, 255, 0.3);
		border-radius: 12px;
		pointer-events: none;
	}

	.live-overlay-preview {
		position: absolute;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(10, 10, 10, 0.85);
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
		background: #166534;
		color: #4ade80;
	}

	.badge-out {
		background: #9a3412;
		color: #fb923c;
	}

	.preview-time {
		font-size: 0.8rem;
		font-family: monospace;
		color: #ffffff;
	}

	.bottom-bar {
		padding: 1.5rem 1rem 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
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
		transition: transform 0.1s;
	}

	.shutter-btn:active {
		transform: scale(0.92);
	}

	.shutter-inner {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		transition: transform 0.15s, background-color 0.2s;
	}

	.inner-in {
		background: #4ade80;
	}

	.inner-out {
		background: #fb923c;
	}

	.shutter-btn.capturing .shutter-inner {
		transform: scale(0.75);
		opacity: 0.7;
	}

	.camera-error-box {
		padding: 2rem;
		text-align: center;
		color: #f87171;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		align-items: center;
	}

	.btn-fallback {
		padding: 0.8rem 1.25rem;
		background: #4ade80;
		color: #000000;
		border: none;
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.95rem;
		cursor: pointer;
	}

	/* Manual Location Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		z-index: 300;
	}

	.modal-card {
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
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
		color: #9ca3af;
		line-height: 1.4;
	}

	.manual-input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: #0d0d0d;
		border: 1px solid #333333;
		border-radius: 8px;
		color: #ffffff;
		font-size: 0.95rem;
		outline: none;
	}

	.manual-input:focus {
		border-color: #4ade80;
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
		border: 1px solid #333333;
		color: #9ca3af;
		border-radius: 6px;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.btn-confirm {
		padding: 0.65rem 1.2rem;
		background: #4ade80;
		border: none;
		color: #000000;
		font-weight: 700;
		border-radius: 6px;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.btn-confirm:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
