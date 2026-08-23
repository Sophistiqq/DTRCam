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
		--bg: #140d2b;
		--surface: #24154a;
		--surface-alt: #2e1b62;
		--surface-hover: #361f73;
		--border: #3f2776;
		--text: #ffffff;
		--text-muted: #b8abdd;
		--muted: #8e7db9;
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
	}
</style>
