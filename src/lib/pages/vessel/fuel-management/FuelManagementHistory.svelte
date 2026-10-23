<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';

	let {
		startDate = $bindable(''),
		endDate = $bindable(''),
		timezoneMode = $bindable('auto'),
		timezoneOffset = $bindable('+07:00'),
		autoTimezoneLabel = '',
		error = '',
		loading = false,
		rows = [],
		page = 1,
		totalPages = 1,
		shouldShowDateRangeOverlay = true,
		onLoad,
		onPage,
		onOpenOperations,
		onOpenNote,
		onFilterChange
	} = $props();
</script>

<section class="panel history-panel">
	<div class="panel-header">
		<div>
			<h2>Fuel History Timeline</h2>
			<p>ROB transactions, carry over, daily consumption, and deletable bunkering logs.</p>
		</div>

		<div class="history-toolbar">
			<div class="history-filters">
				<label>
					<span>Start Date</span>
					<input
						type="date"
						use:fourDigitDateYear
						bind:value={startDate}
						onchange={() => onFilterChange?.()}
					/>
				</label>

				<label>
					<span>End Date</span>
					<input
						type="date"
						use:fourDigitDateYear
						bind:value={endDate}
						onchange={() => onFilterChange?.()}
					/>
				</label>

				<label>
					<span class="field-label-row">
						Timezone
						{#if timezoneMode === 'auto'}
							<small class="timezone-auto-pill">Auto • {autoTimezoneLabel}</small>
						{/if}
					</span>
					<select bind:value={timezoneMode} onchange={() => onFilterChange?.()}>
						{#each TIMEZONE_MODE_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				{#if timezoneMode === 'manual'}
					<label class="offset-field">
						<span>Offset</span>
						<select bind:value={timezoneOffset} onchange={() => onFilterChange?.()}>
							{#each TIMEZONE_OFFSET_OPTIONS as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
				{/if}
			</div>

			<button
				class="primary-button history-load-button"
				type="button"
				onclick={() => onLoad?.()}
				disabled={loading || !startDate || !endDate}
			>
				{loading ? 'Loading...' : 'Load History'}
			</button>

			<button
				class="secondary-button history-operation-button"
				type="button"
				onclick={() => onOpenOperations?.()}
			>
				Fuel Operations
			</button>
		</div>
	</div>

	<div class="history-load-area load-required-area" class:is-locked={shouldShowDateRangeOverlay}>
		{#if error}
			<div class="alert danger compact">{error}</div>
		{/if}

		{#if loading}
			<LoadingSkeleton label="Loading fuel history" variant="fuel-history" rows={6} columns={7} />
		{:else if rows.length}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Date</th>
							<th>Action</th>
							<th>User</th>
							<th class="right">Fuel Movement</th>
							<th class="right">ROB After</th>
							<th>Note</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as item (item.key)}
							<tr>
								<td>
									<div class="history-date-cell">
										<strong>{item.dateLabel}</strong>
										{#if item.periodLabel}
											<small>{item.periodLabel}</small>
										{/if}
									</div>
								</td>
								<td>
									<span
										class="action-chip"
										class:has-source={item.source}
										class:is-source-change={item.isSourceChange}
									>
										<strong>{item.action}</strong>
										{#if item.source}
											<small>{item.source}</small>
										{/if}
									</span>
								</td>
								<td>{item.user}</td>
								<td class="right">
									{#if item.receivedLabel}
										<div class="fuel-movement-chip received">
											<span>Received</span>
											<strong>{item.receivedLabel}</strong>
										</div>
									{:else if item.consumptionLabel}
										<div class="fuel-movement-chip consumption">
											<span>Consumption</span>
											<strong>{item.consumptionLabel}</strong>
										</div>
									{:else}
										<span class="muted">-</span>
									{/if}
								</td>
								<td class="right"><strong>{item.robAfter}</strong></td>
								<td>
									{#if item.hasNote}
										<button
											type="button"
											class="note-view-button"
											onclick={() => onOpenNote?.(item.raw)}
										>
											View note
										</button>
									{:else}
										<span class="muted">-</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="history-control history-control-bottom">
				<button type="button" onclick={() => onPage?.(page - 1)} disabled={loading || page <= 1}>
					Prev
				</button>
				<span>Page {page} / {totalPages}</span>
				<button
					type="button"
					onclick={() => onPage?.(page + 1)}
					disabled={loading || page >= totalPages}
				>
					Next
				</button>
			</div>
		{:else}
			<div class="empty-state">History is not available for this date range.</div>
		{/if}

		{#if shouldShowDateRangeOverlay}
			<div class="load-required-overlay">
				<div class="load-required-card">
					<div class="load-required-icon">!</div>
					<span class="section-kicker">Waiting for date</span>
					<h2>Choose a fuel history range first</h2>
					<p>
						Select the fuel history range and timezone in the history header, then click
						<strong>Load History</strong>
						to display the timeline.
					</p>
				</div>
			</div>
		{/if}
	</div>
</section>
