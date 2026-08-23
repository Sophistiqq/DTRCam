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
		--bg: #0d0d0d;
		--surface: #1a1a1a;
		--border: #2a2a2a;
		--text: #f0f0f0;
		--muted: #888;
		--accent: #4ade80;
		--danger: #f87171;
		--warning: #fb923c;
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
	}
</style>
