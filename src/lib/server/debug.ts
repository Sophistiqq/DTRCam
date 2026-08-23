/**
 * Debug Bridge — server-side SSE hub.
 *
 * Usage:
 *   import { debugEmit, debugLog } from '$lib/server/debug';
 *   debugLog('Punch received', { employee_id, punch_type });
 *   debugEmit('punch_validated', { status: 'accepted', id: punch.id });
 *
 * Connect from a browser (or phone on local network) at:
 *   http://<dev-machine-ip>:5173/debug
 */

import { dev } from '$app/environment';

type Controller = ReadableStreamDefaultController<Uint8Array>;

const clients = new Set<Controller>();

const IS_DEV = dev;

// ── SSE helpers ────────────────────────────────────────────────────────────

function encode(event: string, data: unknown): Uint8Array {
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	return new TextEncoder().encode(payload);
}

function push(controller: Controller, chunk: Uint8Array): void {
	try {
		controller.enqueue(chunk);
	} catch {
		// Stream was already closed; silently remove the stale client.
		clients.delete(controller);
	}
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Broadcast a named SSE event to all connected debug clients.
 * No-op in production.
 */
export function debugEmit(event: string, data: unknown): void {
	if (!IS_DEV || clients.size === 0) return;
	const chunk = encode(event, data);
	for (const controller of clients) {
		push(controller, chunk);
	}
}

/**
 * Convenience wrapper — emits a `log` event with a message and optional detail.
 */
export function debugLog(message: string, detail?: unknown): void {
	debugEmit('log', { message, detail, at: new Date().toISOString() });
}

/**
 * Register a new SSE client controller.
 * Called by the /api/debug/stream endpoint on stream start.
 */
export function addDebugClient(controller: Controller): void {
	if (!IS_DEV) return;
	clients.add(controller);
	startPingInterval();
}

/**
 * Remove a disconnected SSE client controller.
 * Called by the /api/debug/stream endpoint on stream cancel.
 */
export function removeDebugClient(controller: Controller): void {
	clients.delete(controller);
}

// ── Keep-alive ping ────────────────────────────────────────────────────────

let pingStarted = false;

function startPingInterval(): void {
	if (pingStarted || !IS_DEV) return;
	pingStarted = true;

	setInterval(() => {
		debugEmit('ping', { at: new Date().toISOString() });
	}, 30_000);
}
