<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { logout } from '$lib/auth';
	import { requestStoragePersistence } from '$lib/storage';
	import AppLogo from '$lib/components/AppLogo.svelte';
	import type { Profile } from '$lib/types/database';

	let { children } = $props();

	let cachedProfile = $state<Profile | null>(null);

	onMount(() => {
		requestStoragePersistence();

		// Save profile to localStorage for offline reload
		if ($page.data.profile) {
			try {
				localStorage.setItem('dtrcam_cached_profile', JSON.stringify($page.data.profile));
				cachedProfile = $page.data.profile;
			} catch {}
		} else {
			try {
				const saved = localStorage.getItem('dtrcam_cached_profile');
				if (saved) {
					cachedProfile = JSON.parse(saved);
				}
			} catch {}
		}
	});

	const profile = $derived($page.data.profile ?? cachedProfile);
</script>

<div class="shell">
	<header class="topbar">
		<div class="app-brand">
			<AppLogo size={28} />
			<span class="app-name">DTRCam</span>
		</div>
		<div class="topbar-right">
			<span class="employee-name">{profile?.full_name ?? ''}</span>
			<button type="button" class="btn-logout" onclick={() => logout()}>Logout</button>
		</div>
	</header>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		background: var(--bg, #0d0d0d);
		color: var(--text, #f0f0f0);
		font-family: system-ui, sans-serif;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: var(--surface, #1a1a1a);
		border-bottom: 1px solid var(--border, #2a2a2a);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.app-brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.app-name {
		font-weight: 800;
		font-size: 1.15rem;
		color: #ffffff;
		letter-spacing: -0.02em;
	}

	.topbar-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.employee-name {
		font-size: 0.85rem;
		color: var(--muted, #888);
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.btn-logout {
		font-size: 0.8rem;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		border: 1px solid var(--border, #2a2a2a);
		background: transparent;
		color: var(--muted, #888);
		cursor: pointer;
		text-decoration: none;
		font-family: inherit;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-logout:hover {
		border-color: var(--danger, #db463e);
		color: var(--danger, #db463e);
	}

	.content {
		flex: 1;
		padding: 0;
	}
</style>
