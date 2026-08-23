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

	// 2. Dark gradient banner at the bottom
	const bannerHeight = canvasH * 0.28;
	const bannerY = canvasH - bannerHeight;

	const gradient = ctx.createLinearGradient(0, bannerY - 30, 0, canvasH);
	gradient.addColorStop(0, 'rgba(10, 10, 10, 0)');
	gradient.addColorStop(0.25, 'rgba(10, 10, 10, 0.75)');
	gradient.addColorStop(0.6, 'rgba(10, 10, 10, 0.92)');
	gradient.addColorStop(1, 'rgba(10, 10, 10, 0.98)');

	ctx.fillStyle = gradient;
	ctx.fillRect(0, bannerY - 30, canvasW, bannerHeight + 30);



	// 3. Overlay text — font sizes scale with canvas width
	const fs = canvasW / 1080;
	const paddingX = canvasW * 0.045;
	let currentY = bannerY + 65 * fs;

	// Line 1: Punch Badge + Date & Time
	const badgeText = punchType === 'in' ? 'TIME IN' : 'TIME OUT';
	const badgeBg = punchType === 'in' ? '#166534' : '#9a3412';
	const badgeBorder = punchType === 'in' ? '#4ade80' : '#fb923c';

	ctx.font = `bold ${Math.round(34 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	const badgeWidth = ctx.measureText(badgeText).width + 36 * fs;
	const badgeHeight = 44 * fs;

	ctx.fillStyle = badgeBg;
	ctx.strokeStyle = badgeBorder;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.roundRect(paddingX, currentY - 32 * fs, badgeWidth, badgeHeight, 8);
	ctx.fill();
	ctx.stroke();

	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'left';
	ctx.fillText(badgeText, paddingX + 18 * fs, currentY);

	const timeStr = formatDateTimeDisplay(date);
	ctx.font = `bold ${Math.round(36 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
	ctx.fillStyle = '#ffffff';
	ctx.fillText(timeStr, paddingX + badgeWidth + 24 * fs, currentY);

	// Line 2: Employee Name and No
	currentY += 56 * fs;
	ctx.font = `bold ${Math.round(38 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	ctx.fillStyle = '#f3f4f6';
	ctx.fillText(`${employeeName} (#${employeeNo})`, paddingX, currentY);

	// Line 3: Location
	currentY += 52 * fs;
	ctx.font = `500 ${Math.round(30 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;

	if (locationSource === 'gps' && coords) {
		ctx.fillStyle = '#60a5fa';
		ctx.fillText(`📍 GPS: ${formatCoordinates(coords.lat, coords.lng, coords.accuracy)}`, paddingX, currentY);
	} else {
		ctx.fillStyle = '#fbbf24';
		ctx.fillText(`📝 MANUAL: ${locationText || 'No location provided'}`, paddingX, currentY);
	}

	// Line 4: Watermark
	currentY += 46 * fs;
	ctx.font = `400 ${Math.round(20 * fs)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
	ctx.fillStyle = '#9ca3af';
	ctx.fillText('DTRCam Official Punch Record • Verified Capture', paddingX, currentY);

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
