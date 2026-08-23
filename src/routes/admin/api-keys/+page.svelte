<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { Plus, Key, Copy, Check, X } from 'lucide-svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateModal = $state(false);
	let isSubmitting = $state(false);
	let copied = $state(false);

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 3000);
	}
</script>

<div class="api-keys-page">
	<div class="header-row">
		<div>
			<h1 class="page-title">API Keys</h1>
			<p class="page-subtitle">Manage integration keys for the Visual FoxPro payroll system</p>
		</div>
		<button class="btn-primary" onclick={() => (showCreateModal = true)}>
			<Plus size={16} class="inline-icon" /> Generate API Key
		</button>
	</div>

	<!-- Flash Key Display on Creation -->
	{#if form?.newKey}
		<div class="alert-box key-alert">
			<div class="key-alert-header">
				<h4><Key size={18} class="inline-icon" /> New API Key Generated</h4>
				<span class="warning-tag">Copy now — will never be shown again!</span>
			</div>
			<p class="key-label-text"><strong>Label:</strong> {form.newKey.label}</p>
			<div class="key-copy-box">
				<code class="key-code">{form.newKey.key}</code>
				<button class="btn-copy" onclick={() => copyToClipboard(form?.newKey?.key || '')}>
					{#if copied}
						<Check size={14} class="inline-icon" /> Copied!
					{:else}
						<Copy size={14} class="inline-icon" /> Copy
					{/if}
				</button>
			</div>
		</div>
	{/if}

	{#if form?.error}
		<div class="alert-box error">{form.error}</div>
	{/if}

	<!-- Keys Table -->
	<div class="card table-container">
		<table class="data-table">
			<thead>
				<tr>
					<th>Label</th>
					<th>Status</th>
					<th>Last Used</th>
					<th>Created</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if data.keys.length === 0}
					<tr>
						<td colspan="5" class="empty-cell">No API keys created yet. Generate one for your payroll integration.</td>
					</tr>
				{/if}

				{#each data.keys as k}
					<tr>
						<td class="font-bold">{k.label}</td>
						<td>
							<span class="status-pill" class:active={k.is_active}>
								{k.is_active ? 'Active' : 'Revoked'}
							</span>
						</td>
						<td class="text-muted text-sm">
							{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never used'}
						</td>
						<td class="text-muted text-sm">
							{new Date(k.created_at).toLocaleDateString()}
						</td>
						<td class="text-right actions-cell">
							{#if k.is_active}
								<form method="POST" action="?/revoke" use:enhance class="inline-form">
									<input type="hidden" name="id" value={k.id} />
									<button type="submit" class="btn-sm btn-warning">Revoke</button>
								</form>
							{/if}

							<form method="POST" action="?/delete" use:enhance class="inline-form">
								<input type="hidden" name="id" value={k.id} />
								<button type="submit" class="btn-sm btn-danger">Delete</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- Create Modal -->
{#if showCreateModal}
	<div class="modal-backdrop">
		<div class="modal-card">
			<div class="modal-header">
				<h3>Generate New API Key</h3>
				<button class="btn-close" onclick={() => (showCreateModal = false)}><X size={18} /></button>
			</div>

			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
						showCreateModal = false;
					};
				}}
				class="form-col"
			>
				<div class="field">
					<label for="label">Key Description / Label</label>
					<input
						id="label"
						name="label"
						type="text"
						placeholder="e.g. Visual FoxPro Payroll Sync - Head Office"
						required
						autofocus
					/>
				</div>

				<div class="modal-actions">
					<button type="button" class="btn-outline" onclick={() => (showCreateModal = false)}>
						Cancel
					</button>
					<button type="submit" class="btn-primary" disabled={isSubmitting}>
						{isSubmitting ? 'Generating…' : 'Generate Key'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.api-keys-page {
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

	.text-right {
		text-align: right;
	}

	.text-muted {
		color: var(--muted, #888);
	}

	.text-sm {
		font-size: 0.8rem;
	}

	.font-bold {
		font-weight: 700;
	}

	.status-pill {
		font-size: 0.75rem;
		padding: 0.15rem 0.5rem;
		border-radius: 20px;
		background: rgba(248, 113, 113, 0.2);
		color: #f87171;
	}

	.status-pill.active {
		background: rgba(74, 222, 128, 0.2);
		color: #4ade80;
	}

	.actions-cell {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		align-items: center;
	}

	.inline-form {
		display: inline;
	}

	.btn-primary {
		padding: 0.65rem 1.1rem;
		background: var(--accent, #4ade80);
		color: #000000;
		border: none;
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.btn-outline {
		padding: 0.65rem 1rem;
		background: transparent;
		border: 1px solid var(--border, #2a2a2a);
		color: var(--text, #f0f0f0);
		border-radius: 8px;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.btn-sm {
		padding: 0.35rem 0.65rem;
		font-size: 0.8rem;
		border-radius: 6px;
		cursor: pointer;
		font-family: inherit;
	}

	.btn-warning {
		background: rgba(251, 146, 60, 0.15);
		border: 1px solid rgba(251, 146, 60, 0.4);
		color: #fb923c;
	}

	.btn-danger {
		background: rgba(248, 113, 113, 0.15);
		border: 1px solid rgba(248, 113, 113, 0.4);
		color: #f87171;
	}

	/* Alert Box */
	.alert-box {
		padding: 1.25rem;
		border-radius: 12px;
	}

	.key-alert {
		background: color-mix(in srgb, #4ade80 15%, #1a1a1a);
		border: 1px solid #4ade80;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.key-alert-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.warning-tag {
		background: #ef4444;
		color: #ffffff;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		text-transform: uppercase;
	}

	.key-copy-box {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: #000000;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		border: 1px solid #333333;
	}

	.key-code {
		font-family: monospace;
		font-size: 0.95rem;
		color: #4ade80;
		word-break: break-all;
		flex: 1;
	}

	.btn-copy {
		padding: 0.45rem 0.85rem;
		background: #262626;
		border: 1px solid #444444;
		color: #ffffff;
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
		white-space: nowrap;
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
		max-width: 440px;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.modal-header h3 {
		font-size: 1.15rem;
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

	.form-col {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.field label {
		font-size: 0.8rem;
		color: var(--muted, #888);
		font-weight: 500;
	}

	.field input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: #0d0d0d;
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 8px;
		color: #ffffff;
		font-size: 0.95rem;
		outline: none;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
</style>
