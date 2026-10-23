<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';

	let {
		vesselName = '-',
		reportDate = $bindable(''),
		timezoneMode = $bindable('auto'),
		timezoneOffset = $bindable('+07:00'),
		autoTimezoneLabel = '',
		loading = false,
		exporting = false,
		exportingPdf = false,
		canExport = true,
		onLoad,
		onExportExcel,
		onExportPdf,
		onFilterChange
	} = $props();
</script>

<section class="daily-header-card">
	<div class="daily-header-copy">
		<div class="page-kicker">Daily Report</div>
		<h1>{vesselName}</h1>
		<p>Daily vessel operation report, runtime, speed, RPM range, and fuel usage.</p>
	</div>

	<div class="daily-header-filters">
		<div class="filter-card">
			<label>
				<span>Date</span>
				<input
					type="date"
					use:fourDigitDateYear
					bind:value={reportDate}
					onchange={() => onFilterChange?.()}
				/>
			</label>

			<label>
				<span class="field-label-row">
					Timezone Mode
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
					disabled={loading || !reportDate}
				>
					{loading ? 'Loading...' : 'Load Data'}
				</button>

				<button
					type="button"
					class="export-btn excel"
					onclick={() => onExportExcel?.()}
					disabled={exporting || !canExport}
				>
					{exporting ? 'Exporting...' : 'Export Excel'}
				</button>

				<button
					type="button"
					class="export-btn pdf"
					onclick={() => onExportPdf?.()}
					disabled={exportingPdf || !canExport}
				>
					{exportingPdf ? 'Exporting PDF...' : 'Export PDF'}
				</button>
			</div>
		</div>
	</div>
</section>
