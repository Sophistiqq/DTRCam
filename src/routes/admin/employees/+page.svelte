<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { Plus, CheckCircle, Key, X } from 'lucide-svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showAddModal = $state(false);
	let resetModalUser = $state<{ id: string; name: string; empNo: string } | null>(null);
	let newPasswordInput = $state('');

	let isSubmitting = $state(false);
</script>

<div class="employees-page">
	<div class="header-row">
		<div>
			<h1 class="page-title">Employees</h1>
			<p class="page-subtitle">Manage field employee accounts and credentials</p>
		</div>
		<button class="btn-primary" onclick={() => (showAddModal = true)}>
			<Plus size={16} class="inline-icon" /> Add Employee
		</button>
	</div>

	<!-- Flash Success / Error message -->
	{#if form?.error}
		<div class="alert-box error">{form.error}</div>
	{/if}

	{#if form?.createdEmployee}
		<div class="alert-box success">
			<h4><CheckCircle size={18} class="inline-icon" /> Employee Created Successfully!</h4>
			<p><strong>Employee No:</strong> {form.createdEmployee.employee_no}</p>
			<p><strong>Full Name:</strong> {form.createdEmployee.full_name}</p>
			<p><strong>Initial Password:</strong> <code>{form.createdEmployee.temp_password}</code></p>
			<small>Please share these credentials with the employee.</small>
		</div>
	{/if}

	<!-- Employee Table / Cards -->
	<div class="card table-container">
		<table class="data-table">
			<thead>
				<tr>
					<th>Emp No</th>
					<th>Full Name</th>
					<th>Role</th>
					<th>Status</th>
					<th>Created</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.employees as emp}
					<tr>
						<td class="font-mono font-bold">{emp.employee_no}</td>
						<td>{emp.full_name}</td>
						<td>
							<span class="badge" class:badge-admin={emp.role === 'admin'}>
								{emp.role}
							</span>
						</td>
						<td>
							<span class="status-pill" class:active={emp.is_active}>
								{emp.is_active ? 'Active' : 'Inactive'}
							</span>
						</td>
						<td class="text-muted text-sm">
							{new Date(emp.created_at).toLocaleDateString()}
						</td>
						<td class="text-right actions-cell">
							<button
								class="btn-sm btn-outline"
								onclick={() =>
									(resetModalUser = {
										id: emp.id,
										name: emp.full_name,
										empNo: emp.employee_no
									})}
							>
								<Key size={13} class="inline-icon" /> Reset Password
							</button>

							<form method="POST" action="?/toggleActive" use:enhance class="inline-form">
								<input type="hidden" name="id" value={emp.id} />
								<input type="hidden" name="is_active" value={String(emp.is_active)} />
								<button
									type="submit"
									class="btn-sm"
									class:btn-danger={emp.is_active}
									class:btn-success={!emp.is_active}
								>
									{emp.is_active ? 'Deactivate' : 'Activate'}
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- Add Employee Modal -->
{#if showAddModal}
	<div class="modal-backdrop">
		<div class="modal-card">
			<div class="modal-header">
				<h3>Add New Employee</h3>
				<button class="btn-close" onclick={() => (showAddModal = false)}><X size={18} /></button>
			</div>

			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
						showAddModal = false;
					};
				}}
				class="form-col"
			>
				<div class="field">
					<label for="employee_no">Employee Number</label>
					<input
						id="employee_no"
						name="employee_no"
						type="text"
						placeholder="e.g. 2522"
						required
						autofocus
					/>
				</div>

				<div class="field">
					<label for="full_name">Full Name</label>
					<input
						id="full_name"
						name="full_name"
						type="text"
						placeholder="e.g. Juan S. Macaraeg"
						required
					/>
				</div>

				<div class="field">
					<label for="role">Role</label>
					<select id="role" name="role" class="select-input">
						<option value="employee">Employee (Punch screen only)</option>
						<option value="admin">Admin (HR management)</option>
					</select>
				</div>

				<div class="field">
					<label for="password">Custom Password (optional)</label>
					<input
						id="password"
						name="password"
						type="text"
						placeholder="Leave blank for auto initials@empno (e.g. jsm@2522)"
					/>
				</div>

				<div class="modal-actions">
					<button type="button" class="btn-outline" onclick={() => (showAddModal = false)}>
						Cancel
					</button>
					<button type="submit" class="btn-primary" disabled={isSubmitting}>
						{isSubmitting ? 'Creating…' : 'Create Account'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Reset Password Modal -->
{#if resetModalUser}
	<div class="modal-backdrop">
		<div class="modal-card">
			<div class="modal-header">
				<h3>Reset Password for {resetModalUser.name}</h3>
				<button class="btn-close" onclick={() => (resetModalUser = null)}><X size={18} /></button>
			</div>

			<form
				method="POST"
				action="?/resetPassword"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
						resetModalUser = null;
						newPasswordInput = '';
					};
				}}
				class="form-col"
			>
				<input type="hidden" name="id" value={resetModalUser.id} />

				<div class="field">
					<label for="new_password">New Temporary Password</label>
					<input
						id="new_password"
						name="new_password"
						type="text"
						bind:value={newPasswordInput}
						placeholder="e.g. tempPass2026!"
						required
						autofocus
					/>
				</div>

				<div class="modal-actions">
					<button type="button" class="btn-outline" onclick={() => (resetModalUser = null)}>
						Cancel
					</button>
					<button type="submit" class="btn-primary" disabled={isSubmitting || !newPasswordInput.trim()}>
						{isSubmitting ? 'Saving…' : 'Set New Password'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.employees-page {
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

	.text-right {
		text-align: right;
	}

	.text-muted {
		color: var(--muted, #888);
	}

	.text-sm {
		font-size: 0.8rem;
	}

	.font-mono {
		font-family: monospace;
	}

	.font-bold {
		font-weight: 700;
	}

	.badge {
		font-size: 0.75rem;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
		background: #262626;
		color: #9ca3af;
		text-transform: uppercase;
	}

	.badge-admin {
		background: color-mix(in srgb, var(--accent, #4ade80) 20%, transparent);
		color: var(--accent, #4ade80);
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

	.btn-danger {
		background: rgba(248, 113, 113, 0.15);
		border: 1px solid rgba(248, 113, 113, 0.4);
		color: #f87171;
	}

	.btn-success {
		background: rgba(74, 222, 128, 0.15);
		border: 1px solid rgba(74, 222, 128, 0.4);
		color: #4ade80;
	}

	.alert-box {
		padding: 1rem 1.25rem;
		border-radius: 10px;
		font-size: 0.9rem;
	}

	.alert-box.error {
		background: rgba(248, 113, 113, 0.15);
		border: 1px solid rgba(248, 113, 113, 0.4);
		color: #f87171;
	}

	.alert-box.success {
		background: rgba(74, 222, 128, 0.15);
		border: 1px solid rgba(74, 222, 128, 0.4);
		color: #4ade80;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.alert-box.success code {
		background: #000000;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		color: #ffffff;
		font-family: monospace;
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

	.field input,
	.select-input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: #0d0d0d;
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 8px;
		color: #ffffff;
		font-size: 0.95rem;
		font-family: inherit;
		outline: none;
	}

	.field input:focus,
	.select-input:focus {
		border-color: var(--accent, #4ade80);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
</style>
