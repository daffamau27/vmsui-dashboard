<script>
	import { onMount } from 'svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let {
		rows = [],
		loading = false,
		vesselOptions = [],
		alarmTypeOptions = [],
		pagination = { page: 1, totalItems: 0, totalPages: 1, hasNext: false, hasPrevious: false },
		selectedVesselId = $bindable(''),
		selectedStatus = $bindable(''),
		selectedAlarmTypes = $bindable([]),
		pageSize = $bindable(20),
		onApply = async () => {},
		onReset = async () => {},
		onPrevious = async () => {},
		onNext = async () => {}
	} = $props();

	let alarmTypeFilterElement = $state(null);

	function formatDateTime(value) {
		if (!value && value !== 0) return '-';

		if (typeof value === 'string' && Number.isNaN(Number(value))) {
			return value;
		}

		const timestamp = Number(value);
		if (!Number.isFinite(timestamp)) return String(value);

		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) return '-';

		return date.toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatAlarmType(value) {
		return String(value || '-')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function getVesselName(row) {
		return (
			row?.vesselName ||
			row?.vessel_name ||
			row?.assetName ||
			row?.deviceName ||
			(row?.vesselId ? `Vessel ${row.vesselId}` : '-')
		);
	}

	function getStatusClass(status) {
		const normalized = String(status || '').toUpperCase();

		if (normalized === 'ACTIVE') return 'status-active';
		if (normalized === 'CLEARED') return 'status-cleared';

		return 'status-neutral';
	}

	function closeAlarmTypeDropdown() {
		alarmTypeFilterElement?.removeAttribute?.('open');
	}

	function handleAlarmTypeOutsidePointerDown(event) {
		if (event.target?.closest?.('.alarm-type-filter')) return;
		closeAlarmTypeDropdown();
	}

	function handleAlarmTypeKeydown(event) {
		if (event.key === 'Escape') closeAlarmTypeDropdown();
	}

	function toggleAlarmType(alarmType, checked) {
		const normalizedType = String(alarmType || '')
			.trim()
			.toUpperCase();
		if (!normalizedType) return;

		selectedAlarmTypes = checked
			? [...new Set([...selectedAlarmTypes, normalizedType])]
			: selectedAlarmTypes.filter((type) => type !== normalizedType);
	}

	async function handleApplyFilter() {
		closeAlarmTypeDropdown();
		await onApply();
	}

	async function handleResetFilter() {
		closeAlarmTypeDropdown();
		await onReset();
	}

	onMount(() => {
		document.addEventListener('pointerdown', handleAlarmTypeOutsidePointerDown);
		document.addEventListener('keydown', handleAlarmTypeKeydown);

		return () => {
			document.removeEventListener('pointerdown', handleAlarmTypeOutsidePointerDown);
			document.removeEventListener('keydown', handleAlarmTypeKeydown);
		};
	});
</script>

<section class="table-section alarm-events-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">History</span>
			<h2>Alarm Events</h2>
		</div>

		<strong>{pagination.totalItems || 0} events</strong>
	</div>

	<div class="event-filter-card">
		<label>
			<span>Vessel</span>
			<select bind:value={selectedVesselId}>
				<option value="">All Vessels</option>
				{#each vesselOptions as vessel (vessel.vesselId)}
					<option value={vessel.vesselId}>{vessel.vesselName}</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Status</span>
			<select bind:value={selectedStatus}>
				<option value="">All Status</option>
				<option value="ACTIVE">ACTIVE</option>
				<option value="CLEARED">CLEARED</option>
			</select>
		</label>

		<label>
			<span>Page Size</span>
			<select bind:value={pageSize}>
				<option value={10}>10</option>
				<option value={20}>20</option>
				<option value={50}>50</option>
				<option value={100}>100</option>
			</select>
		</label>

		<details class="alarm-type-filter" bind:this={alarmTypeFilterElement}>
			<summary>
				<span>
					<small>Alarm Type</small>
					<strong>
						{selectedAlarmTypes.length
							? `${selectedAlarmTypes.length} types selected`
							: 'All types'}
					</strong>
				</span>
				<span class="alarm-type-chevron" aria-hidden="true">&#8964;</span>
			</summary>

			<div class="alarm-type-dropdown">
				<div class="alarm-type-dropdown-head">
					<span>Select alarm types</span>
					{#if selectedAlarmTypes.length}
						<button type="button" onclick={() => (selectedAlarmTypes = [])}>Clear</button>
					{/if}
				</div>

				<div class="alarm-type-checkboxes">
					{#each alarmTypeOptions as alarmType (alarmType.value)}
						<label class:checked={selectedAlarmTypes.includes(alarmType.value)}>
							<input
								type="checkbox"
								checked={selectedAlarmTypes.includes(alarmType.value)}
								onchange={(event) => toggleAlarmType(alarmType.value, event.currentTarget.checked)}
							/>
							<span class="alarm-type-checkbox-mark" aria-hidden="true"></span>
							<span class="alarm-type-checkbox-label">{alarmType.label}</span>
						</label>
					{/each}
				</div>
			</div>
		</details>

		<div class="filter-actions">
			<button type="button" class="primary-btn" onclick={handleApplyFilter} disabled={loading}>
				Apply
			</button>

			<button type="button" class="secondary-btn" onclick={handleResetFilter} disabled={loading}>
				Reset
			</button>
		</div>
	</div>

	{#if loading}
		<LoadingSkeleton
			label="Loading alarm events"
			variant="alarm-events-table"
			rows={6}
			columns={7}
		/>
	{:else if rows.length}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>Vessel Name</th>
						<th>Alarm Type</th>
						<th>Status</th>
						<th>Event Time</th>
						<th>Start Time</th>
						<th>End Time</th>
					</tr>
				</thead>

				<tbody>
					{#each rows as row, index (row.id || row.eventTs || index)}
						<tr>
							<td>{getVesselName(row)}</td>
							<td>{formatAlarmType(row.alarmType)}</td>
							<td>
								<span class={`status-pill ${getStatusClass(row.status)}`}>{row.status || '-'}</span>
							</td>
							<td>{formatDateTime(row.eventTs)}</td>
							<td>{formatDateTime(row.startTs)}</td>
							<td>{row.endTs ? formatDateTime(row.endTs) : '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="pagination-bar">
			<button
				type="button"
				class="secondary-btn"
				onclick={onPrevious}
				disabled={!pagination.hasPrevious || loading}
			>
				Previous
			</button>

			<span>Page {pagination.page || 1} of {pagination.totalPages || 1}</span>

			<button
				type="button"
				class="secondary-btn"
				onclick={onNext}
				disabled={!pagination.hasNext || loading}
			>
				Next
			</button>
		</div>
	{:else}
		<div class="empty-box">No alarm events match the selected filters.</div>
	{/if}
</section>

<style>
	.table-section {
		margin-top: 14px;
		overflow: visible;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.section-kicker {
		display: inline-flex;
		width: fit-content;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.section-header h2 {
		margin: 7px 0 0;
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 900;
	}

	.section-header > strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.event-filter-card {
		padding: 12px;
		display: flex;
		align-items: end;
		gap: 10px;
		flex-wrap: wrap;
		background: var(--color-elevated);
		border-bottom: 1px solid #e2e8f0;
	}

	.event-filter-card > label {
		display: grid;
		gap: 5px;
	}

	.event-filter-card > label > span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.event-filter-card > label > select {
		height: 32px;
		min-width: 150px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 9px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		outline: none;
		color-scheme: dark;
	}

	.event-filter-card > label > select option {
		background: #111827;
		color: #f1f5f9;
		font-size: 12px;
		font-weight: 700;
	}

	.event-filter-card > label > select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
	}

	.alarm-type-filter {
		position: relative;
		flex: 1 1 250px;
		max-width: 340px;
		min-width: 0;
		align-self: flex-end;
	}

	.alarm-type-filter summary {
		height: 32px;
		padding: 0 9px;
		border: 1px solid #cbd5e1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		background: var(--color-surface);
		color: var(--text-primary);
		cursor: pointer;
		list-style: none;
		box-sizing: border-box;
	}

	.alarm-type-filter summary::-webkit-details-marker {
		display: none;
	}

	.alarm-type-filter summary:focus-visible,
	.alarm-type-filter[open] summary {
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
		outline: none;
	}

	.alarm-type-filter summary > span:first-child {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.alarm-type-filter summary small {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.alarm-type-filter summary strong {
		min-width: 0;
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 800;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.alarm-type-chevron {
		flex: 0 0 auto;
		color: var(--text-secondary);
		font-size: 15px;
		line-height: 1;
		transition: transform 140ms ease;
	}

	.alarm-type-filter[open] .alarm-type-chevron {
		transform: rotate(180deg);
	}

	.alarm-type-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 120;
		width: min(360px, calc(100vw - 48px));
		padding: 8px;
		border: 1px solid rgba(96, 165, 250, 0.42);
		border-radius: 10px;
		background: var(--color-surface);
		box-shadow: 0 18px 42px rgba(2, 6, 23, 0.34);
	}

	.alarm-type-dropdown-head {
		min-height: 28px;
		padding: 0 3px 7px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.alarm-type-dropdown-head > span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.alarm-type-dropdown-head button {
		padding: 3px 7px;
		border: 0;
		border-radius: 6px;
		background: rgba(37, 99, 235, 0.14);
		color: #60a5fa;
		font-size: 9px;
		font-weight: 900;
		cursor: pointer;
	}

	.alarm-type-checkboxes {
		max-height: 285px;
		margin-top: 7px;
		overflow-y: auto;
		display: grid;
		gap: 5px;
	}

	.alarm-type-checkboxes label {
		width: 100%;
		min-height: 32px;
		padding: 6px 8px;
		border: 1px solid rgba(148, 163, 184, 0.26);
		border-radius: 8px;
		display: flex;
		align-items: center;
		gap: 7px;
		background: var(--color-elevated);
		color: var(--text-secondary);
		cursor: pointer;
		box-sizing: border-box;
		transition:
			border-color 140ms ease,
			background 140ms ease,
			color 140ms ease;
	}

	.alarm-type-checkboxes label:hover {
		border-color: rgba(96, 165, 250, 0.58);
	}

	.alarm-type-checkboxes label.checked {
		border-color: rgba(37, 99, 235, 0.78);
		background: rgba(37, 99, 235, 0.15);
		color: var(--text-primary);
	}

	.alarm-type-checkboxes input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.alarm-type-checkbox-mark {
		position: relative;
		width: 16px;
		height: 16px;
		min-width: 16px;
		border: 1px solid #64748b;
		border-radius: 4px;
		display: grid;
		place-items: center;
		background: #0f172a;
		box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.42);
		box-sizing: border-box;
		transition:
			border-color 140ms ease,
			background 140ms ease,
			box-shadow 140ms ease;
	}

	.alarm-type-checkbox-mark::after {
		content: '';
		width: 4px;
		height: 8px;
		margin-top: -2px;
		border: solid #ffffff;
		border-width: 0 2px 2px 0;
		opacity: 0;
		transform: rotate(45deg) scale(0.65);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.alarm-type-checkboxes input:checked + .alarm-type-checkbox-mark {
		border-color: #60a5fa;
		background: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
	}

	.alarm-type-checkboxes input:checked + .alarm-type-checkbox-mark::after {
		opacity: 1;
		transform: rotate(45deg) scale(1);
	}

	.alarm-type-checkboxes input:focus-visible + .alarm-type-checkbox-mark {
		border-color: #93c5fd;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.32);
	}

	.alarm-type-checkbox-label {
		color: inherit;
		font-size: 10px;
		line-height: 1.2;
		font-weight: 800;
		text-transform: none;
	}

	.filter-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.primary-btn,
	.secondary-btn {
		height: 32px;
		padding: 0 12px;
		border: none;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		white-space: nowrap;
	}

	.primary-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.secondary-btn {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.primary-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.secondary-btn:hover:not(:disabled) {
		background: #cbd5e1;
	}

	.primary-btn:disabled,
	.secondary-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.table-wrapper {
		width: 100%;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	th {
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
		padding: 10px 12px;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	td {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		padding: 10px 12px;
		border-bottom: 1px solid #eef2f7;
		white-space: nowrap;
	}

	tr:hover td {
		background: var(--color-elevated);
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 70px;
		padding: 4px 8px;
		border-radius: 999px;
		font-size: 10px;
		line-height: 1.2;
		font-weight: 900;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.status-active {
		background: var(--color-danger-muted);
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.status-cleared {
		background: var(--color-success-muted);
		border: 1px solid #bbf7d0;
		color: #047857;
	}

	.status-neutral {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid #cbd5e1;
		color: var(--text-secondary);
	}

	.pagination-bar {
		padding: 12px 14px;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 10px;
		background: var(--color-elevated);
		border-top: 1px solid #e5edf5;
	}

	.pagination-bar span {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 900;
		white-space: nowrap;
	}

	.empty-box {
		padding: 18px 14px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
		background: var(--color-surface);
	}

	@media (max-width: 760px) {
		.alarm-type-filter {
			width: 100%;
			max-width: none;
			align-self: stretch;
		}

		.alarm-type-dropdown {
			width: 100%;
			box-sizing: border-box;
		}

		.event-filter-card,
		.filter-actions {
			width: 100%;
			flex-direction: column;
			align-items: stretch;
		}

		.event-filter-card > label > select,
		.primary-btn,
		.secondary-btn {
			width: 100%;
			min-width: 0;
		}

		.section-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.pagination-bar {
			justify-content: stretch;
			flex-direction: column;
			align-items: stretch;
		}

		.pagination-bar span {
			text-align: center;
		}
	}
</style>
