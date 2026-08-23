<script lang="ts">
	import { onMount } from 'svelte';

	// ── Types ──────────────────────────────────────────────────────────────

	interface LogEntry {
		id: number;
		ts: Date;
		event: string;
		data: unknown;
	}

	// ── State ──────────────────────────────────────────────────────────────

	let entries = $state<LogEntry[]>([]);
	let connected = $state(false);
	let reconnecting = $state(false);
	let totalReceived = $state(0);

	let nextId = 0;
	const MAX_ENTRIES = 200;

	// ── Helpers ────────────────────────────────────────────────────────────

	function formatTime(d: Date): string {
		const hh = String(d.getHours()).padStart(2, '0');
		const mm = String(d.getMinutes()).padStart(2, '0');
		const ss = String(d.getSeconds()).padStart(2, '0');
		const ms = String(d.getMilliseconds()).padStart(3, '0');
		return `${hh}:${mm}:${ss}.${ms}`;
	}

	function formatData(data: unknown): string {
		try {
			const str = JSON.stringify(data, null, 2);
			// Collapse small payloads to one line for readability.
			return str.length <= 120 ? JSON.stringify(data) : str;
		} catch {
			return String(data);
		}
	}

	/**
	 * Colour-code event type badges.
	 * Returns a Tailwind-style inline colour object so we stay dependency-free.
	 */
	function badgeStyle(event: string): string {
		const map: Record<string, string> = {
			connected: 'color:#4ade80;border-color:#4ade80',       // green
			ping: 'color:#4b5563;border-color:#4b5563',            // dim gray
			log: 'color:#9ca3af;border-color:#6b7280',             // gray
			punch_received: 'color:#60a5fa;border-color:#3b82f6',  // blue
			punch_validated: 'color:#34d399;border-color:#10b981', // emerald
			punch_rejected: 'color:#f87171;border-color:#ef4444',  // red
			error: 'color:#f87171;border-color:#ef4444',           // red
			warn: 'color:#fbbf24;border-color:#f59e0b',            // amber
		};
		return map[event] ?? 'color:#a78bfa;border-color:#8b5cf6'; // purple fallback
	}

	function addEntry(event: string, raw: string): void {
		let data: unknown;
		try { data = JSON.parse(raw); } catch { data = raw; }

		totalReceived += 1;

		// Prepend so newest is at top; trim overflow.
		entries = [
			{ id: nextId++, ts: new Date(), event, data },
			...entries.slice(0, MAX_ENTRIES - 1)
		];
	}

	function clearLog(): void {
		entries = [];
	}

	// ── EventSource lifecycle ──────────────────────────────────────────────

	$effect(() => {
		let es: EventSource | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let destroyed = false;

		function connect() {
			if (destroyed) return;

			reconnecting = false;
			es = new EventSource('/api/debug/stream');

			// Named events we care about explicitly:
			const namedEvents = [
				'connected', 'ping', 'log',
				'punch_received', 'punch_validated', 'punch_rejected',
				'error', 'warn'
			];

			function handleNamed(event: MessageEvent, name: string) {
				if (name === 'connected') connected = true;
				addEntry(name, event.data as string);
			}

			for (const name of namedEvents) {
				es.addEventListener(name, (ev) => handleNamed(ev, name));
			}

			// Catch-all for any unnamed / unlisted named events.
			es.onmessage = (ev) => {
				addEntry('message', ev.data as string);
			};

			es.onerror = () => {
				connected = false;
				es?.close();
				es = null;

				if (!destroyed) {
					reconnecting = true;
					reconnectTimer = setTimeout(connect, 3000);
				}
			};
		}

		connect();

		return () => {
			destroyed = true;
			if (reconnectTimer !== null) clearTimeout(reconnectTimer);
			es?.close();
			connected = false;
			reconnecting = false;
		};
	});
</script>

<!-- ── Page ──────────────────────────────────────────────────────────────── -->

<div class="shell">
	<!-- Title bar -->
	<header class="titlebar">
		<span class="title">🛰 DTRCam Debug Bridge</span>

		<span class="status-group">
			{#if reconnecting}
				<span class="status-dot disconnected"></span>
				<span class="status-label reconnecting">Reconnecting…</span>
			{:else if connected}
				<span class="status-dot connected"></span>
				<span class="status-label">Connected</span>
			{:else}
				<span class="status-dot disconnected"></span>
				<span class="status-label">Disconnected</span>
			{/if}
		</span>

		<span class="meta">
			{totalReceived} events received
		</span>

		<button class="clear-btn" onclick={clearLog}>Clear</button>
	</header>

	<!-- Event log -->
	<main class="log">
		{#if entries.length === 0}
			<div class="empty">Waiting for events…</div>
		{/if}

		{#each entries as entry (entry.id)}
			<div class="row">
				<span class="ts">{formatTime(entry.ts)}</span>
				<span class="badge" style={badgeStyle(entry.event)}>{entry.event}</span>
				<span class="payload">{formatData(entry.data)}</span>
			</div>
		{/each}
	</main>
</div>

<!-- ── Styles ─────────────────────────────────────────────────────────────── -->

<style>
	:global(body) {
		margin: 0;
		background: #0a0a0a;
	}

	.shell {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		font-family: 'Fira Code', 'Cascadia Code', 'Menlo', 'Consolas', monospace;
		font-size: 13px;
		background: #0a0a0a;
		color: #d1d5db;
	}

	/* ── Title bar ── */

	.titlebar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1rem;
		background: #111827;
		border-bottom: 1px solid #1f2937;
		flex-shrink: 0;
	}

	.title {
		font-size: 14px;
		font-weight: 600;
		color: #f9fafb;
		flex: 1;
	}

	.status-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.status-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-dot.connected {
		background: #22c55e;
		box-shadow: 0 0 6px #22c55e;
	}

	.status-dot.disconnected {
		background: #ef4444;
		box-shadow: 0 0 6px #ef4444;
	}

	.status-label {
		font-size: 12px;
		color: #9ca3af;
	}

	.status-label.reconnecting {
		color: #fbbf24;
		animation: blink 1s step-end infinite;
	}

	@keyframes blink {
		50% { opacity: 0.3; }
	}

	.meta {
		font-size: 11px;
		color: #4b5563;
	}

	.clear-btn {
		padding: 0.2rem 0.7rem;
		font-size: 12px;
		font-family: inherit;
		background: transparent;
		border: 1px solid #374151;
		border-radius: 4px;
		color: #9ca3af;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.clear-btn:hover {
		border-color: #6b7280;
		color: #f3f4f6;
	}

	/* ── Log ── */

	.log {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 0;
	}

	.empty {
		padding: 1.5rem 1rem;
		color: #374151;
		font-style: italic;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.22rem 1rem;
		border-bottom: 1px solid #111827;
		line-height: 1.5;
	}

	.row:hover {
		background: #111827;
	}

	.ts {
		flex-shrink: 0;
		color: #4b5563;
		font-size: 11px;
		letter-spacing: 0.02em;
	}

	.badge {
		flex-shrink: 0;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border: 1px solid currentColor;
		border-radius: 3px;
		padding: 0 4px;
		line-height: 1.6;
	}

	.payload {
		color: #d1d5db;
		white-space: pre-wrap;
		word-break: break-all;
		flex: 1;
	}
</style>
