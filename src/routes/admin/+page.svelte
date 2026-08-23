<script lang="ts">
	import type { PageData } from './$types';
	import { Users, ShieldAlert, Key, ClipboardList } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="dashboard">
	<div class="hero-card">
		<h1 class="title">Admin Overview</h1>
		<p class="subtitle">System operations and field employee administration</p>

		<div class="stats-row">
			<a href="/admin/employees" class="stat-box">
				<span class="stat-num">{data.stats.totalEmployees}</span>
				<span class="stat-label">Employees</span>
			</a>

			<a href="/admin/quarantine" class="stat-box" class:alert={data.stats.quarantinePending > 0}>
				<span class="stat-num">{data.stats.quarantinePending}</span>
				<span class="stat-label">Quarantine Pending</span>
			</a>

			<a href="/admin/api-keys" class="stat-box">
				<span class="stat-num">{data.stats.activeApiKeys}</span>
				<span class="stat-label">Active API Keys</span>
			</a>
		</div>
	</div>

	<div class="sections-grid">
		<a href="/admin/employees" class="section-card">
			<span class="section-icon"><Users size={28} /></span>
			<div>
				<div class="section-name">Employees</div>
				<div class="section-desc">Create accounts, reset passwords, and toggle active status</div>
			</div>
		</a>

		<a href="/admin/quarantine" class="section-card">
			<span class="section-icon"><ShieldAlert size={28} /></span>
			<div>
				<div class="section-name">Quarantine Queue</div>
				<div class="section-desc">Review and resolve flagged or suspicious punch records</div>
			</div>
		</a>

		<a href="/admin/api-keys" class="section-card">
			<span class="section-icon"><Key size={28} /></span>
			<div>
				<div class="section-name">API Keys</div>
				<div class="section-desc">Generate and manage HMAC keys for the Visual FoxPro integration</div>
			</div>
		</a>

		<a href="/admin/audit" class="section-card">
			<span class="section-icon"><ClipboardList size={28} /></span>
			<div>
				<div class="section-name">Audit Log</div>
				<div class="section-desc">Inspect all administrative actions and security events</div>
			</div>
		</a>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.hero-card {
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 14px;
		padding: 1.75rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.title {
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--accent, #4ade80);
	}

	.subtitle {
		color: var(--muted, #888);
		font-size: 0.95rem;
		margin-top: -0.75rem;
	}

	.stats-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.stat-box {
		background: #121212;
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 10px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s;
	}

	.stat-box:hover {
		border-color: var(--accent, #4ade80);
	}

	.stat-box.alert {
		border-color: rgba(251, 146, 60, 0.4);
		background: rgba(251, 146, 60, 0.05);
	}

	.stat-num {
		font-size: 1.75rem;
		font-weight: 800;
		color: #ffffff;
		font-family: monospace;
	}

	.stat-box.alert .stat-num {
		color: #fb923c;
	}

	.stat-label {
		font-size: 0.8rem;
		color: var(--muted, #888);
		margin-top: 0.25rem;
	}

	.sections-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.75rem;
	}

	.section-card {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 12px;
		padding: 1.1rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s;
	}

	.section-card:hover {
		border-color: var(--accent, #4ade80);
	}

	.section-icon {
		font-size: 1.75rem;
		flex-shrink: 0;
	}

	.section-name {
		font-weight: 700;
		font-size: 1rem;
		margin-bottom: 0.2rem;
		color: #ffffff;
	}

	.section-desc {
		font-size: 0.8rem;
		color: var(--muted, #888);
		line-height: 1.4;
	}
</style>
