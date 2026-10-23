<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';

	let {
		vesselName = 'Selected Vessel',
		startDateTime = $bindable(''),
		endDateTime = $bindable(''),
		timezoneMode = $bindable('auto'),
		timezoneOffset = $bindable('+07:00'),
		autoTimezoneLabel = 'UTC+07:00',
		loading = false,
		exporting = false,
		exportDisabled = false,
		onLoad,
		onExport,
		onFilterChange
	} = $props();
</script>

<section class="periodical-header-card">
	<div class="periodical-header-copy">
		<div class="page-kicker">Periodical Report</div>
		<h1>{vesselName}</h1>
		<p>
			Periodical operation report for custom date-time ranges with runtime, fuel consumption, data
			received, and telemetry summary.
		</p>
	</div>

	<div class="periodical-header-filters">
		<div class="filter-card">
			<label>
				<span>Start</span>
				<input
					type="datetime-local"
					use:fourDigitDateYear
					bind:value={startDateTime}
					oninput={() => onFilterChange?.()}
				/>
			</label>

			<label>
				<span>End</span>
				<input
					type="datetime-local"
					use:fourDigitDateYear
					bind:value={endDateTime}
					oninput={() => onFilterChange?.()}
				/>
			</label>

			<label>
				<span class="field-label-row">
					Timezone Mode
					{#if timezoneMode === 'auto'}
						<small class="timezone-auto-pill">Auto · {autoTimezoneLabel}</small>
					{/if}
				</span>
				<select bind:value={timezoneMode} onchange={() => onFilterChange?.()}>
					{#each TIMEZONE_MODE_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>

			{#if timezoneMode === 'manual'}
				<label>
					<span>Timezone Offset</span>
					<select bind:value={timezoneOffset} onchange={() => onFilterChange?.()}>
						{#each TIMEZONE_OFFSET_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			{/if}

			<div class="filter-actions">
				<button
					type="button"
					class="primary-btn"
					onclick={() => onLoad?.()}
					disabled={loading || !startDateTime || !endDateTime}
				>
					{loading ? 'Loading...' : 'Load Data'}
				</button>

				<button
					type="button"
					class="export-btn"
					onclick={() => onExport?.()}
					disabled={exporting || exportDisabled}
				>
					{exporting ? 'Exporting...' : 'Export Excel'}
				</button>
			</div>
		</div>
	</div>
</section>
