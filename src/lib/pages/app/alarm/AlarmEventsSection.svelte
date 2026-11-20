<script>
	import { onMount } from 'svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let {
		rows = [],
		loading = false,
		vesselOptions = [],
		alarmTypeOptions = [],
		pagination = { page: 1, totalItems: 0, totalPages: 1, hasNext: false, hasPrevious: false },
		selectedVesselIds = $bindable([]),
		selectedStatus = $bindable(''),
		selectedAlarmTypes = $bindable([]),
		pageSize = $bindable(20),
		onApply = async () => {},
		onReset = async () => {},
		onPrevious = async () => {},
		onNext = async () => {}
	} = $props();

	const filterId = $props.id();
	let alarmTypeFilterElement = $state(null);
	let vesselFilterElement = $state(null);
	let vesselSearchInput = $state(null);
	let vesselSearch = $state('');
	let selectedVesselKeys = $derived(selectedVesselIds.map(String));
	let vesselSearchKeyword = $derived(vesselSearch.trim().toLowerCase());
	let filteredVesselOptions = $derived(
		vesselOptions.filter((vessel) =>
			`${vessel.vesselName || ''} ${vessel.vesselId}`.toLowerCase().includes(vesselSearchKeyword)
		)
	);
	let vesselSelectionLabel = $derived(
		selectedVesselKeys.length === 1
			? vesselOptions.find((vessel) => String(vessel.vesselId) === selectedVesselKeys[0])
					?.vesselName || '1 vessel selected'
			: selectedVesselKeys.length
				? `${selectedVesselKeys.length} vessels selected`
				: 'All Vessels'
	);

	function toggleVessel(vesselId, checked) {
		const key = String(vesselId);
		selectedVesselIds = checked
			? selectedVesselKeys.includes(key)
				? selectedVesselIds
				: [...selectedVesselIds, vesselId]
			: selectedVesselIds.filter((id) => String(id) !== key);
	}

	function closeVesselDropdown() {
		vesselFilterElement?.removeAttribute('open');
		vesselSearch = '';
	}

	function handleVesselDropdownToggle(event) {
		if (event.currentTarget.open) {
			closeAlarmTypeDropdown();
			vesselSearchInput?.focus();
		} else {
			vesselSearch = '';
		}
	}

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

	function handleFilterOutsideClick(event) {
		if (!alarmTypeFilterElement?.contains(event.target)) closeAlarmTypeDropdown();
		if (!vesselFilterElement?.contains(event.target)) closeVesselDropdown();
	}

	function handleFilterKeydown(event) {
		if (event.key !== 'Escape') return;
		const openFilter = vesselFilterElement?.open
			? vesselFilterElement
			: alarmTypeFilterElement?.open
				? alarmTypeFilterElement
				: null;
		if (!openFilter) return;
		event.preventDefault();
		closeAlarmTypeDropdown();
		closeVesselDropdown();
		openFilter.querySelector('summary')?.focus();
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
		closeVesselDropdown();
		await onApply();
	}

	async function handleResetFilter() {
		closeAlarmTypeDropdown();
		closeVesselDropdown();
		await onReset();
	}

	onMount(() => {
		document.addEventListener('click', handleFilterOutsideClick);
		document.addEventListener('keydown', handleFilterKeydown);

		return () => {
			document.removeEventListener('click', handleFilterOutsideClick);
			document.removeEventListener('keydown', handleFilterKeydown);
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
		<div class="event-dropdown-field">
			<span id={`${filterId}-vessels-label`}>Vessels</span>
			<details
				class="vessel-filter"
				bind:this={vesselFilterElement}
				ontoggle={handleVesselDropdownToggle}
			>
				<summary aria-labelledby={`${filterId}-vessels-label ${filterId}-vessels-value`}>
					<span>
						<strong id={`${filterId}-vessels-value`} title={vesselSelectionLabel}
							>{vesselSelectionLabel}</strong
						>
					</span>
					<span class="alarm-type-chevron" aria-hidden="true">&#8964;</span>
				</summary>

				<div class="vessel-dropdown">
					<div class="alarm-type-dropdown-head">
						<span>Select vessels</span>
						<button
							type="button"
							onclick={() => (selectedVesselIds = [])}
							disabled={!selectedVesselKeys.length}>Clear</button
						>
					</div>
					<label class="vessel-search">
						<span>Search vessel</span>
						<input
							type="search"
							bind:this={vesselSearchInput}
							bind:value={vesselSearch}
							placeholder="Search vessel name or ID..."
							autocomplete="off"
						/>
					</label>
					<div class="vessel-filter-info">
						<span>{selectedVesselKeys.length} selected</span>
						<span>{filteredVesselOptions.length} of {vesselOptions.length} vessels</span>
					</div>
					<div class="vessel-options" role="group" aria-label="Vessel selection">
						{#each filteredVesselOptions as vessel (String(vessel.vesselId))}
							<label class="vessel-option filter-option">
								<input
									type="checkbox"
									value={vessel.vesselId}
									checked={selectedVesselKeys.includes(String(vessel.vesselId))}
									onchange={(event) => toggleVessel(vessel.vesselId, event.currentTarget.checked)}
								/>
								<span class="vessel-option-tile filter-option-tile">
									<span class="filter-option-name">{vessel.vesselName}</span>
									<span class="vessel-option-corner filter-option-corner" aria-hidden="true">
										<svg viewBox="0 0 16 16" fill="none">
											<path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="2" />
										</svg>
									</span>
								</span>
							</label>
						{:else}
							<p class="vessel-search-empty" role="status">
								{vesselOptions.length ? 'No vessels match your search.' : 'No vessels available.'}
							</p>
						{/each}
					</div>
					<p class="vessel-filter-hint">No selection includes all vessels.</p>
				</div>
			</details>
		</div>

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

		<div class="event-dropdown-field">
			<span id={`${filterId}-alarm-types-label`}>Alarm Type</span>
			<details
				class="alarm-type-filter"
				bind:this={alarmTypeFilterElement}
				ontoggle={(event) => {
					if (event.currentTarget.open) closeVesselDropdown();
				}}
			>
				<summary aria-labelledby={`${filterId}-alarm-types-label ${filterId}-alarm-types-value`}>
					<span>
						<strong id={`${filterId}-alarm-types-value`}>
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

					<div class="alarm-type-checkboxes" role="group" aria-label="Alarm type selection">
						{#each alarmTypeOptions as alarmType (alarmType.value)}
							<label class="filter-option">
								<input
									type="checkbox"
									value={alarmType.value}
									checked={selectedAlarmTypes.includes(alarmType.value)}
									onchange={(event) =>
										toggleAlarmType(alarmType.value, event.currentTarget.checked)}
								/>
								<span class="filter-option-tile">
									<span class="filter-option-name">{alarmType.label}</span>
									<span class="filter-option-corner" aria-hidden="true">
										<svg viewBox="0 0 16 16" fill="none">
											<path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="2" />
										</svg>
									</span>
								</span>
							</label>
						{/each}
					</div>
				</div>
			</details>
		</div>

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

	.event-filter-card > label,
	.event-dropdown-field {
		display: grid;
		gap: 5px;
	}

	.event-filter-card > label > span,
	.event-dropdown-field > span {
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

	.event-dropdown-field {
		flex: 1 1 250px;
		max-width: 340px;
		min-width: 0;
		align-self: flex-end;
	}

	.alarm-type-filter,
	.vessel-filter {
		position: relative;
		min-width: 0;
	}

	:is(.alarm-type-filter, .vessel-filter) summary {
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

	:is(.alarm-type-filter, .vessel-filter) summary::-webkit-details-marker {
		display: none;
	}

	:is(.alarm-type-filter, .vessel-filter) summary:focus-visible,
	:is(.alarm-type-filter, .vessel-filter)[open] summary {
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
		outline: none;
	}

	:is(.alarm-type-filter, .vessel-filter) summary > span:first-child {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 7px;
	}

	:is(.alarm-type-filter, .vessel-filter) summary strong {
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

	:is(.alarm-type-filter, .vessel-filter)[open] .alarm-type-chevron {
		transform: rotate(180deg);
	}

	.alarm-type-dropdown,
	.vessel-dropdown {
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

	.alarm-type-dropdown-head button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.vessel-dropdown {
		width: min(420px, calc(100vw - 56px));
		padding: 12px;
		box-sizing: border-box;
	}

	.vessel-search {
		display: grid;
		gap: 6px;
		margin-top: 10px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 700;
	}

	.vessel-search input {
		width: 100%;
		min-width: 0;
		height: 36px;
		padding: 0 10px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-elevated);
		color: var(--text-primary);
		font: inherit;
		box-sizing: border-box;
		outline: none;
	}

	.vessel-search input::placeholder {
		color: var(--text-secondary);
		font-weight: 400;
	}

	.vessel-search input:focus-visible {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 2px var(--color-accent-muted);
	}

	.vessel-filter-info {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin: 10px 0 8px;
		color: var(--text-secondary);
		font-size: 10px;
	}

	.vessel-options,
	.alarm-type-checkboxes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 6px;
		max-height: min(300px, 45vh);
		padding: 3px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.filter-option {
		position: relative;
		display: flex;
		min-width: 0;
		cursor: pointer;
	}

	.filter-option input {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.filter-option-tile {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-width: 0;
		min-height: 36px;
		padding: 6px 18px 6px 8px;
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 4px;
		background: var(--color-elevated);
		color: var(--text-secondary);
		box-sizing: border-box;
		overflow: hidden;
		transition:
			border-color 140ms ease,
			background 140ms ease,
			color 140ms ease;
	}

	.filter-option-name {
		font-size: 11px;
		line-height: 1.3;
		font-weight: 700;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.filter-option:hover .filter-option-tile {
		border-color: var(--color-accent);
		color: var(--text-primary);
	}

	.filter-option input:checked + .filter-option-tile {
		border-color: var(--color-accent);
		background: var(--color-accent-muted);
		color: var(--text-accent);
	}

	.filter-option input:focus-visible + .filter-option-tile {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}

	.filter-option-corner {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 20px;
		height: 20px;
		background: var(--color-accent);
		color: #ffffff;
		clip-path: polygon(100% 0, 100% 100%, 0 100%);
		opacity: 0;
	}

	.filter-option-corner svg {
		position: absolute;
		right: 1px;
		bottom: 1px;
		width: 11px;
		height: 11px;
	}

	.filter-option input:checked + .filter-option-tile .filter-option-corner {
		opacity: 1;
	}

	.vessel-search-empty {
		grid-column: 1 / -1;
		margin: 0;
		padding: 18px 8px;
		color: var(--text-secondary);
		font-size: 12px;
		text-align: center;
	}

	.vessel-filter-hint {
		margin: 10px 0 0;
		color: var(--text-secondary);
		font-size: 10px;
	}

	.alarm-type-checkboxes {
		margin-top: 7px;
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
		.event-dropdown-field {
			width: 100%;
			max-width: none;
			flex: 0 0 auto;
			align-self: stretch;
		}

		.alarm-type-dropdown,
		.vessel-dropdown {
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
