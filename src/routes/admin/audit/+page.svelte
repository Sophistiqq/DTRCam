<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let selectedDetail = $state<any | null>(null);

	const actionsList = [
		'create_employee',
		'toggle_active',
		'reset_password',
		'create_api_key',
		'revoke_api_key',
		'delete_api_key',
		'quarantine_force_accept',
		'quarantine_discard'
	];
</script>

<div class="audit-page">
	<div class="header-row">
		<div>
			<h1 class="page-title">Audit Log</h1>
			<p class="page-subtitle">Immutable trail of administrative changes and system actions</p>
		</div>

		<!-- Action Filter -->
		<form method="GET" class="filter-form">
			<select name="action" onchange={(e) => e.currentTarget.form?.submit()} class="select-filter">
				<option value="">All Actions</option>
				{#each actionsList as act}
					<option value={act} selected={data.currentAction === act}>{act}</option>
				{/each}
			</select>
		</form>
	</div>

	<div class="card table-container">
		<table class="data-table">
			<thead>
				<tr>
					<th>Timestamp</th>
					<th>Actor</th>
					<th>Action</th>
					<th>Entity</th>
					<th>Details</th>
				</tr>
			</thead>
			<tbody>
				{#if data.logs.length === 0}
					<tr>
						<td colspan="5" class="empty-cell">No audit log entries recorded yet.</td>
					</tr>
				{/if}

				{#each data.logs as log}
					<tr>
						<td class="text-muted text-sm font-mono">
							{new Date(log.at).toLocaleString()}
						</td>
						<td>
							<strong>{log.actor_name}</strong>
							{#if log.actor_emp_no}
								<span class="text-muted text-xs"> (#{log.actor_emp_no})</span>
							{/if}
						</td>
						<td>
							<span class="badge-action">{log.action}</span>
						</td>
						<td class="font-mono text-sm">{log.entity}</td>
						<td>
							<button class="btn-detail" onclick={() => (selectedDetail = log)}>
								🔍 View JSON
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- JSON Detail Modal -->
{#if selectedDetail}
	<div class="modal-backdrop">
		<div class="modal-card">
			<div class="modal-header">
				<h3>Audit Detail — {selectedDetail.action}</h3>
				<button class="btn-close" onclick={() => (selectedDetail = null)}>✕</button>
			</div>

			<pre class="json-box">{JSON.stringify(selectedDetail, null, 2)}</pre>

			<div class="modal-actions">
				<button class="btn-primary" onclick={() => (selectedDetail = null)}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.audit-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 800;
		color: #ffffff;
	}

	.page-subtitle {
		font-size: 0.85rem;
		color: var(--muted, #888);
	}

	.select-filter {
		padding: 0.55rem 0.85rem;
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 8px;
		color: #ffffff;
		font-size: 0.85rem;
		outline: none;
	}

	.card {
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 12px;
		overflow: hidden;
	}

	.table-container {
		overflow-x: auto;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
		font-size: 0.9rem;
	}

	.data-table th,
	.data-table td {
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--border, #2a2a2a);
	}

	.data-table th {
		background: #141414;
		color: var(--muted, #888);
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.empty-cell {
		text-align: center;
		padding: 2rem;
		color: var(--muted, #888);
	}

	.font-mono {
		font-family: monospace;
	}

	.text-muted {
		color: var(--muted, #888);
	}

	.text-sm {
		font-size: 0.8rem;
	}

	.text-xs {
		font-size: 0.75rem;
	}

	.badge-action {
		font-size: 0.75rem;
		font-family: monospace;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		border: 1px solid rgba(96, 165, 250, 0.3);
	}

	.btn-detail {
		padding: 0.35rem 0.65rem;
		background: #262626;
		border: 1px solid #333333;
		color: #ffffff;
		border-radius: 6px;
		font-size: 0.8rem;
		cursor: pointer;
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
	}

	.modal-card {
		background: #1a1a1a;
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 14px;
		padding: 1.5rem;
		width: 100%;
		max-width: 520px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.modal-header h3 {
		font-size: 1.1rem;
		font-weight: 700;
		color: #ffffff;
	}

	.btn-close {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: #262626;
		border: 1px solid #333333;
		color: #ffffff;
		cursor: pointer;
	}

	.json-box {
		background: #0d0d0d;
		border: 1px solid #2a2a2a;
		border-radius: 8px;
		padding: 1rem;
		font-family: monospace;
		font-size: 0.8rem;
		color: #4ade80;
		max-height: 300px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
	}

	.btn-primary {
		padding: 0.6rem 1.2rem;
		background: var(--accent, #4ade80);
		color: #000000;
		border: none;
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
	}
</style>
