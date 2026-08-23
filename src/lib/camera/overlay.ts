/**
 * Canvas burn-in overlay generator for DTRCam.
 * Renders date/time, employee identity, punch type, and GPS/manual location
 * directly into the image pixels. Preserves original aspect ratio — no cropping.
 */

import { formatDateTimeDisplay } from '$lib/clock';
import { formatCoordinates } from '$lib/gps';
import type { PunchType, LocationSource } from '$lib/types/database';

export interface OverlayOptions {
	source: CanvasImageSource; // HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap
	sourceWidth: number;
	sourceHeight: number;
	punchType: PunchType;
	date: Date;
	employeeName: string;
	employeeNo: string;
	locationSource: LocationSource;
	coords?: { lat: number; lng: number; accuracy?: number | null };
	locationText?: string;
	mirrorX?: boolean; // Mirror video for front-facing camera preview match
	targetSize?: number; // Max dimension cap (default 1080)
	quality?: number; // JPEG compression quality (default 0.82)
}

export interface OverlayResult {
	blob: Blob;
	dataUrl: string;
	thumbDataUrl: string;
	width: number;
	height: number;
}

/**
 * Render image with burned-in attendance stamp preserving original aspect ratio.
 * Width and height are both capped at targetSize; aspect ratio is maintained.
 */
export async function renderPunchOverlay(options: OverlayOptions): Promise<OverlayResult> {
	const {
		source,
		sourceWidth,
		sourceHeight,
		punchType,
		date,
		employeeName,
		employeeNo,
		locationSource,
		coords,
		locationText,
		mirrorX = false,
		targetSize = 1080,
		quality = 0.82
	} = options;

	// Preserve aspect ratio — scale down if needed but never upscale
	const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight, 1);
	const canvasW = Math.round(sourceWidth * scale);
	const canvasH = Math.round(sourceHeight * scale);

	const canvas = document.createElement('canvas');
	canvas.width = canvasW;
	canvas.height = canvasH;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });

	if (!ctx) {
		throw new Error('Failed to create 2D canvas context');
	}

	// 1. Draw full image (no crop) onto canvas
	ctx.save();
	if (mirrorX) {
		ctx.translate(canvasW, 0);
		ctx.scale(-1, 1);
	}
	ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, canvasW, canvasH);
	ctx.restore();

	// 2. Scale factor based on canvas resolution (1080 reference)
	const fs = canvasW / 1080;
	const paddingX = canvasW * 0.045;
	const bottomPadding = 32 * fs;

	// Calculate vertical positions from the bottom upwards so it always sits at bottom
	const watermarkY = canvasH - bottomPadding;
	const locationY = watermarkY - 46 * fs;
	const nameY = locationY - 52 * fs;
	const badgeRowY = nameY - 56 * fs;

	// 3. Dark gradient banner at the bottom (starts just above the badge)
	const gradientFadeTop = 45 * fs;
	const gradientStartY = Math.max(0, badgeRowY - 32 * fs - gradientFadeTop);
	const gradientHeight = canvasH - gradientStartY;

	const gradient = ctx.createLinearGradient(0, gradientStartY, 0, canvasH);
	gradient.addColorStop(0, 'rgba(10, 10, 10, 0)');
	gradient.addColorStop(0.2, 'rgba(10, 10, 10, 0.65)');
	gradient.addColorStop(0.55, 'rgba(10, 10, 10, 0.88)');
	gradient.addColorStop(1, 'rgba(10, 10, 10, 0.98)');

	ctx.fillStyle = gradient;
	ctx.fillRect(0, gradientStartY, canvasW, gradientHeight);

	// 4. Overlay text
	// Line 1: Punch Badge + Date & Time
	const badgeText = punchType === 'in' ? 'TIME IN' : 'TIME OUT';
	const badgeBg = punchType === 'in' ? '#0f392b' : '#7C2607';
	const badgeBorder = punchType === 'in' ? '#22c55e' : '#DE4D14';
	const badgeTextColor = punchType === 'in' ? '#4ade80' : '#FFFFFF';

	ctx.font = `bold ${Math.round(34 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	const badgeWidth = ctx.measureText(badgeText).width + 36 * fs;
	const badgeHeight = 44 * fs;

	ctx.fillStyle = badgeBg;
	ctx.strokeStyle = badgeBorder;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.roundRect(paddingX, badgeRowY - 32 * fs, badgeWidth, badgeHeight, 8);
	ctx.fill();
	ctx.stroke();

	ctx.fillStyle = badgeTextColor;
	ctx.textAlign = 'left';
	ctx.fillText(badgeText, paddingX + 18 * fs, badgeRowY);

	const timeStr = formatDateTimeDisplay(date);
	ctx.font = `bold ${Math.round(36 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
	ctx.fillStyle = '#ffffff';
	ctx.fillText(timeStr, paddingX + badgeWidth + 24 * fs, badgeRowY);

	// Line 2: Employee Name and No
	ctx.font = `bold ${Math.round(38 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	ctx.fillStyle = '#f3f4f6';
	ctx.fillText(`${employeeName} (#${employeeNo})`, paddingX, nameY);

	// Line 3: Location
	ctx.font = `500 ${Math.round(30 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;

	if (locationSource === 'gps' && coords) {
		ctx.fillStyle = '#60a5fa';
		ctx.fillText(`📍 GPS: ${formatCoordinates(coords.lat, coords.lng, coords.accuracy)}`, paddingX, locationY);
	} else {
		ctx.fillStyle = '#fbbf24';
		ctx.fillText(`📝 MANUAL: ${locationText || 'No location provided'}`, paddingX, locationY);
	}

	// Line 4: Watermark
	ctx.font = `400 ${Math.round(20 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
	ctx.fillStyle = '#9ca3af';
	ctx.fillText('DTRCam Official Punch Record • Verified Capture', paddingX, watermarkY);

	// 4. Generate thumbnail (~120px max dimension, ~3-5KB) for fast offline list display
	const thumbScale = Math.min(120 / canvasW, 120 / canvasH, 1);
	const thumbW = Math.round(canvasW * thumbScale);
	const thumbH = Math.round(canvasH * thumbScale);
	const thumbCanvas = document.createElement('canvas');
	thumbCanvas.width = thumbW;
	thumbCanvas.height = thumbH;
	const thumbCtx = thumbCanvas.getContext('2d');
	if (thumbCtx) {
		thumbCtx.drawImage(canvas, 0, 0, thumbW, thumbH);
	}
	const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

	// 5. Convert full canvas to Blob & Data URL
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('Canvas blob generation failed'));
					return;
				}
				const dataUrl = canvas.toDataURL('image/jpeg', quality);
				resolve({ blob, dataUrl, thumbDataUrl, width: canvasW, height: canvasH });
			},
			'image/jpeg',
			quality
		);
	});
}
