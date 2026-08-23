<script lang="ts">
	let { children } = $props();
</script>

<div class="shell">
	<header class="topbar">
		<span class="app-name">DTRCam <span class="admin-badge">Admin</span></span>
		<a href="/logout" class="btn-logout">Logout</a>
	</header>

	<nav class="nav">
		<a href="/admin" class="nav-link">Dashboard</a>
		<a href="/admin/employees" class="nav-link">Employees</a>
		<a href="/admin/api-keys" class="nav-link">API Keys</a>
		<a href="/admin/quarantine" class="nav-link">Quarantine</a>
		<a href="/admin/audit" class="nav-link">Audit Log</a>
	</nav>

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

	.app-name {
		font-weight: 800;
		font-size: 1.1rem;
		color: var(--accent, #4ade80);
		letter-spacing: -0.02em;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.admin-badge {
		font-size: 0.7rem;
		font-weight: 600;
		background: color-mix(in srgb, var(--accent, #4ade80) 20%, transparent);
		color: var(--accent, #4ade80);
		border: 1px solid color-mix(in srgb, var(--accent, #4ade80) 40%, transparent);
		border-radius: 4px;
		padding: 0.15rem 0.45rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
		border-color: var(--danger, #f87171);
		color: var(--danger, #f87171);
	}

	.nav {
		display: flex;
		gap: 0;
		overflow-x: auto;
		background: var(--surface, #1a1a1a);
		border-bottom: 1px solid var(--border, #2a2a2a);
		scrollbar-width: none;
	}

	.nav::-webkit-scrollbar {
		display: none;
	}

	.nav-link {
		flex-shrink: 0;
		padding: 0.65rem 1rem;
		font-size: 0.875rem;
		color: var(--muted, #888);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}

	.nav-link:hover {
		color: var(--text, #f0f0f0);
		border-bottom-color: var(--border, #2a2a2a);
	}

	/* Active link — SvelteKit adds aria-current="page" automatically */
	.nav-link[aria-current='page'] {
		color: var(--accent, #4ade80);
		border-bottom-color: var(--accent, #4ade80);
	}

	.content {
		flex: 1;
		padding: 1.25rem 1rem;
		max-width: 960px;
		width: 100%;
		margin: 0 auto;
	}
</style>
