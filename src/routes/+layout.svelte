<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		--bg: #000000;
		--surface: #1a1a1a;
		--surface-alt: #222222;
		--surface-hover: #2a2a2a;
		--border: #333333;
		--text: #ffffff;
		--text-muted: #b3b3b3;
		--muted: #888888;
		--accent: #ede947;
		--accent-orange: #de4d14;
		--in: #22c55e;
		--out: #de4d14;
		--success: #22c55e;
		--danger: #db463e;
		--warning: #de4d14;
	}

	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		background: var(--bg);
		color: var(--text);
		font-family: system-ui, sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	:global(button),
	:global(a),
	:global(input),
	:global(select) {
		-webkit-tap-highlight-color: transparent;
	}

	:global(button:focus-visible),
	:global(a:focus-visible),
	:global(input:focus-visible),
	:global(select:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}
</style>
