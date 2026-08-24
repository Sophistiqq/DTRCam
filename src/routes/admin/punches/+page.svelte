<script lang="ts">
	import type { PageData } from './$types';
	import { MapPin, FileText, ChevronLeft, ChevronRight } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const statusOptions = ['', 'accepted', 'late_sync', 'quarantined', 'superseded'];
	const totalPages = $derived(Math.ceil(data.totalCount / data.pageSize));
</script>

<div class="punches-page">
	<div class="header-row">
		<div>
			<h1 class="page-title">Punch Records</h1>
			<p class="page-subtitle">Read-only view of all attendance punch records</p>
		</div>
		<span class="count-pill">
			<strong>{data.totalCount}</strong> Records
		</span>
	</div>

	<!-- Filters -->
	<form method="GET" class="filters-bar">
		<input
			type="text"
			name="employee"
			placeholder="Employee name or #"
			value={data.filters.employee}
			class="filter-input"
		/>
		<input type="date" name="from" value={data.filters.from} class="filter-input" title="From date" />
		<input type="date" name="to" value={data.filters.to} class="filter-input" title="To date" />
		<select name="status" class="filter-input">
			<option value="">All Status</option>
			{#each statusOptions as s}
				<option value={s} selected={data.filters.status === s}>{s || 'All'}</option>
			{/each}
		</select>
		<button type="submit" class="btn-filter">Filter</button>
	</form>

	<div class="card table-container">
		<table class="data-table">
			<thead>
				<tr>
					<th>Employee</th>
					<th>Date</th>
					<th>Type</th>
					<th>Captured</th>
					<th>Received</th>
					<th>Location</th>
					<th>Status</th>
					<th>Flags</th>
				</tr>
			</thead>
			<tbody>
				{#if data.punches.length === 0}
					<tr>
						<td colspan="8" class="empty-cell">No punch records found.</td>
					</tr>
				{/if}

				{#each data.punches as punch}
					<tr>
						<td>
							<strong>{punch.full_name}</strong>
							<span class="text-muted text-xs"> (#{punch.employee_no})</span>
						</td>
						<td class="font-mono text-sm">{punch.work_date}</td>
						<td>
							<span class="badge-type" class:type-in={punch.punch_type === 'in'} class:type-out={punch.punch_type === 'out'}>
								{punch.punch_type === 'in' ? 'IN' : 'OUT'}
							</span>
						</td>
						<td class="text-sm">{new Date(punch.captured_at).toLocaleString()}</td>
						<td class="text-sm">{new Date(punch.received_at).toLocaleString()}</td>
						<td class="text-sm">
							{#if punch.location_source === 'gps' && punch.coords}
								<span class="loc-gps"><MapPin size={11} class="inline-icon" /> {punch.coords}</span>
							{:else}
								<span class="loc-manual"><FileText size={11} class="inline-icon" /> {punch.location_text || 'Manual'}</span>
							{/if}
						</td>
						<td>
							<span class="badge-status" class:st-accepted={punch.status === 'accepted'} class:st-late={punch.status === 'late_sync'} class:st-quarantined={punch.status === 'quarantined'} class:st-superseded={punch.status === 'superseded'}>
								{punch.status}
							</span>
						</td>
						<td class="text-sm">
							{#if punch.quarantine_reason}
								<span class="flag-text" title={punch.quarantine_reason}>!</span>
							{:else}
								<span class="text-muted">—</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="pagination">
			<a
				href="?page={data.page - 1}&status={data.filters.status}&employee={data.filters.employee}&from={data.filters.from}&to={data.filters.to}"
				class="page-btn"
				class:disabled={data.page <= 1}
			>
				<ChevronLeft size={16} /> Prev
			</a>
			<span class="page-info">Page {data.page} of {totalPages}</span>
			<a
				href="?page={data.page + 1}&status={data.filters.status}&employee={data.filters.employee}&from={data.filters.from}&to={data.filters.to}"
				class="page-btn"
				class:disabled={data.page >= totalPages}
			>
				Next <ChevronRight size={16} />
			</a>
		</div>
	{/if}
</div>

<style>
	.punches-page {
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
		border-radius: 2px;
		background: rgba(96, 165, 250, 0.12);
		border: 1px solid rgba(96, 165, 250, 0.35);
		color: #60a5fa;
		font-size: 0.85rem;
	}

	.filters-bar {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.filter-input {
		padding: 0.55rem 0.75rem;
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 4px;
		color: #ffffff;
		font-size: 0.85rem;
		outline: none;
		min-width: 0;
	}

	.filter-input:focus {
		border-color: var(--accent, #ede947);
	}

	.btn-filter {
		padding: 0.55rem 1rem;
		background: var(--accent, #ede947);
		color: #160d33;
		border: none;
		border-radius: 4px;
		font-weight: 700;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.card {
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 4px;
		overflow: hidden;
	}

	.table-container {
		overflow-x: auto;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
		font-size: 0.85rem;
	}

	.data-table th,
	.data-table td {
		padding: 0.75rem 0.85rem;
		border-bottom: 1px solid var(--border, #2a2a2a);
	}

	.data-table th {
		background: #141414;
		color: var(--muted, #888);
		font-weight: 600;
		font-size: 0.75rem;
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

	.badge-type {
		font-size: 0.7rem;
		font-weight: 800;
		padding: 0.2rem 0.45rem;
		border-radius: 3px;
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

	.badge-status {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		letter-spacing: 0.02em;
	}

	.st-accepted {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.35);
	}

	.st-late {
		background: rgba(251, 146, 60, 0.15);
		color: #fb923c;
		border: 1px solid rgba(251, 146, 60, 0.35);
	}

	.st-quarantined {
		background: rgba(219, 70, 62, 0.15);
		color: #db463e;
		border: 1px solid rgba(219, 70, 62, 0.35);
	}

	.st-superseded {
		background: rgba(136, 136, 136, 0.15);
		color: #888;
		border: 1px solid rgba(136, 136, 136, 0.3);
	}

	.loc-gps {
		color: #22c55e;
		font-family: monospace;
		font-size: 0.78rem;
	}

	.loc-manual {
		color: var(--muted, #888);
		font-size: 0.78rem;
	}

	.flag-text {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: rgba(219, 70, 62, 0.2);
		color: #db463e;
		font-size: 0.7rem;
		font-weight: 800;
		cursor: help;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}

	.page-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.45rem 0.85rem;
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 4px;
		color: var(--text, #ffffff);
		text-decoration: none;
		font-size: 0.85rem;
	}

	.page-btn:hover {
		border-color: var(--accent, #ede947);
	}

	.page-btn.disabled {
		opacity: 0.35;
		pointer-events: none;
	}

	.page-info {
		font-size: 0.85rem;
		color: var(--muted, #888);
	}
</style>
