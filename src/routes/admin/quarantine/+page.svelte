<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { ShieldCheck, AlertTriangle, MapPin, FileText, Trash2, CheckCircle, X } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let selectedPunch = $state<any | null>(null);
	let modalMode = $state<'accept' | 'discard' | null>(null);
	let adminNote = $state('');
	let isSubmitting = $state(false);

	function openModal(punch: any, mode: 'accept' | 'discard') {
		selectedPunch = punch;
		modalMode = mode;
		adminNote = '';
	}

	function closeModal() {
		selectedPunch = null;
		modalMode = null;
		adminNote = '';
	}
</script>

<div class="quarantine-page">
	<div class="header-row">
		<div>
			<h1 class="page-title">Quarantine Queue</h1>
			<p class="page-subtitle">Review flagged or suspect attendance punches requiring manual resolution</p>
		</div>
		<span class="count-pill">
			<strong>{data.quarantined.length}</strong> Pending Review
		</span>
	</div>

	{#if data.quarantined.length === 0}
		<div class="card empty-card">
			<span class="empty-icon"><ShieldCheck size={48} /></span>
			<h3>Queue is Clean!</h3>
			<p>There are no quarantined attendance records awaiting review.</p>
		</div>
	{:else}
		<div class="grid-list">
			{#each data.quarantined as item}
				<div class="card punch-card">
					<div class="punch-photo-box">
						{#if item.photo_url}
							<img src={item.photo_url} alt="Quarantined selfie" class="punch-photo" />
						{:else}
							<div class="no-photo">No photo available</div>
						{/if}
						<span
							class="badge-type"
							class:type-in={item.punch_type === 'in'}
							class:type-out={item.punch_type === 'out'}
						>
							{item.punch_type === 'in' ? 'TIME IN' : 'TIME OUT'}
						</span>
					</div>

					<div class="punch-body">
						<div class="punch-top">
							<h3 class="emp-name">{item.full_name} <span class="emp-no">(#{item.employee_no})</span></h3>
							<span class="date-tag">{item.work_date}</span>
						</div>

						<!-- Anomaly Tags -->
						<div class="anomaly-tags">
							{#if item.quarantine_reason?.toLowerCase().includes('clock') || item.quarantine_reason?.toLowerCase().includes('future')}
								<span class="tag-anomaly tag-clock">🕒 Clock Desync</span>
							{/if}
							{#if item.quarantine_reason?.toLowerCase().includes('duplicate')}
								<span class="tag-anomaly tag-duplicate">👥 Duplicate Record</span>
							{/if}
							{#if item.quarantine_reason?.toLowerCase().includes('sha-256') || item.quarantine_reason?.toLowerCase().includes('mismatch')}
								<span class="tag-anomaly tag-hash">🔐 Integrity Tamper</span>
							{/if}
						</div>

						<div class="reason-banner">
							<span class="reason-icon"><AlertTriangle size={15} /></span>
							<span class="reason-text">{item.quarantine_reason}</span>
						</div>

						<div class="meta-grid">
							<div class="meta-item">
								<span class="meta-label">Captured:</span>
								<span class="meta-val">{new Date(item.captured_at).toLocaleTimeString()}</span>
							</div>
							<div class="meta-item">
								<span class="meta-label">Received:</span>
								<span class="meta-val">{new Date(item.received_at).toLocaleTimeString()}</span>
							</div>
							<div class="meta-item">
								<span class="meta-label">Location:</span>
								<span class="meta-val">
									{#if item.location_source === 'gps' && item.coords}
										<MapPin size={12} class="inline-icon" /> {item.coords}
									{:else}
										<FileText size={12} class="inline-icon" /> {item.location_text || 'Manual'}
									{/if}
								</span>
							</div>
						</div>

						<div class="card-actions">
							<button class="btn-sm btn-outline-danger" onclick={() => openModal(item, 'discard')}>
								<Trash2 size={14} class="inline-icon" /> Discard
							</button>
							<button class="btn-sm btn-primary" onclick={() => openModal(item, 'accept')}>
								<CheckCircle size={14} class="inline-icon" /> Force Accept
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Modal for Force Accept or Discard -->
{#if selectedPunch && modalMode}
	<div class="modal-backdrop">
		<div class="modal-card">
			<div class="modal-header">
				<h3>
					{modalMode === 'accept' ? 'Force Accept Record' : 'Discard Quarantined Record'}
				</h3>
				<button class="btn-close" onclick={closeModal}><X size={18} /></button>
			</div>

			<p class="modal-desc">
				{#if modalMode === 'accept'}
					Are you sure you want to approve this attendance record for <strong>{selectedPunch.full_name}</strong>? It will be marked as valid attendance.
				{:else}
					Discarding will supersede this attendance record for <strong>{selectedPunch.full_name}</strong> and exclude it from payroll.
				{/if}
			</p>

			<form
				method="POST"
				action={modalMode === 'accept' ? '?/forceAccept' : '?/discard'}
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
						closeModal();
					};
				}}
				class="form-col"
			>
				<input type="hidden" name="id" value={selectedPunch.id} />

				<div class="field">
					<label for="note">Admin Reason / Audit Note</label>
					<input
						id="note"
						name={modalMode === 'accept' ? 'note' : 'reason'}
						type="text"
						bind:value={adminNote}
						placeholder={modalMode === 'accept' ? 'e.g. Employee called in, verified offline site' : 'e.g. Test upload / corrupted time'}
						required
					/>
				</div>

				<div class="modal-actions">
					<button type="button" class="btn-outline" onclick={closeModal}>Cancel</button>
					<button
						type="submit"
						class={modalMode === 'accept' ? 'btn-primary' : 'btn-danger-solid'}
						disabled={isSubmitting}
					>
						{isSubmitting ? 'Processing…' : modalMode === 'accept' ? 'Confirm Acceptance' : 'Confirm Discard'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.quarantine-page {
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

	.count-pill {
		padding: 0.4rem 0.85rem;
		border-radius: 20px;
		background: rgba(251, 146, 60, 0.15);
		border: 1px solid rgba(251, 146, 60, 0.4);
		color: #fb923c;
		font-size: 0.85rem;
	}

	.card {
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 12px;
		overflow: hidden;
	}

	.empty-card {
		padding: 3rem 1.5rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		color: var(--muted, #888);
	}

	.empty-icon {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}

	.grid-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	.punch-card {
		display: flex;
		flex-direction: column;
	}

	.punch-photo-box {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 1;
		background: #0d0d0d;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.punch-photo {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.no-photo {
		color: var(--muted, #888);
		font-size: 0.85rem;
	}

	.badge-type {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		font-size: 0.75rem;
		font-weight: 800;
		padding: 0.25rem 0.6rem;
		border-radius: 6px;
		letter-spacing: 0.04em;
	}

	.type-in {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.45);
	}

	.type-out {
		background: rgba(222, 77, 20, 0.25);
		color: #de4d14;
		border: 1px solid rgba(222, 77, 20, 0.4);
	}

	.punch-body {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		flex: 1;
	}

	.punch-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.emp-name {
		font-size: 1.05rem;
		font-weight: 700;
		color: #ffffff;
	}

	.emp-no {
		font-size: 0.85rem;
		color: var(--text-muted, #b8abdd);
		font-family: monospace;
	}

	.date-tag {
		font-size: 0.8rem;
		font-family: monospace;
		color: var(--text-muted, #b8abdd);
	}

	.anomaly-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: -0.25rem 0 0.15rem;
	}

	.tag-anomaly {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		letter-spacing: 0.02em;
	}

	.tag-clock {
		background: rgba(222, 77, 20, 0.2);
		border: 1px solid rgba(222, 77, 20, 0.5);
		color: #ff9d66;
	}

	.tag-duplicate {
		background: rgba(219, 70, 62, 0.2);
		border: 1px solid rgba(219, 70, 62, 0.5);
		color: #ff8c85;
	}

	.tag-hash {
		background: rgba(237, 233, 71, 0.15);
		border: 1px solid rgba(237, 233, 71, 0.4);
		color: #ede947;
	}

	.reason-banner {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		background: rgba(219, 70, 62, 0.15);
		border: 1px solid rgba(219, 70, 62, 0.3);
		color: #db463e;
		padding: 0.6rem 0.75rem;
		border-radius: 8px;
		font-size: 0.82rem;
		line-height: 1.4;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		font-size: 0.8rem;
		background: #140d2b;
		border: 1px solid var(--border, #3f2776);
		padding: 0.75rem;
		border-radius: 8px;
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.meta-label {
		color: var(--text-muted, #b8abdd);
	}

	.meta-val {
		color: #ffffff;
		font-weight: 600;
	}

	.card-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: auto;
		padding-top: 0.5rem;
	}

	.btn-sm {
		flex: 1;
		padding: 0.6rem;
		font-size: 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 800;
		text-align: center;
	}

	.btn-primary {
		background: var(--accent, #ede947);
		color: #160d33;
		border: none;
	}

	.btn-outline-danger {
		background: transparent;
		border: 1px solid rgba(219, 70, 62, 0.4);
		color: #db463e;
	}

	.btn-danger-solid {
		background: #db463e;
		color: #ffffff;
		border: none;
		border-radius: 8px;
		font-weight: 700;
		padding: 0.65rem 1.1rem;
		cursor: pointer;
	}

	.btn-outline {
		padding: 0.65rem 1rem;
		background: transparent;
		border: 1px solid var(--border, #3f2776);
		color: var(--text, #ffffff);
		border-radius: 8px;
		font-size: 0.85rem;
		cursor: pointer;
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(14, 7, 31, 0.85);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
	}

	.modal-card {
		background: var(--surface, #24154a);
		border: 1px solid var(--border, #3f2776);
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
		background: #140d2b;
		border: 1px solid var(--border, #3f2776);
		color: #ffffff;
		cursor: pointer;
	}

	.modal-desc {
		font-size: 0.9rem;
		color: var(--text-muted, #b8abdd);
		line-height: 1.4;
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
		color: var(--text-muted, #b8abdd);
		font-weight: 500;
	}

	.field input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: #140d2b;
		border: 1px solid var(--border, #3f2776);
		border-radius: 8px;
		color: #ffffff;
		font-size: 0.95rem;
		outline: none;
	}

	.field input:focus {
		border-color: var(--accent, #ede947);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
</style>
