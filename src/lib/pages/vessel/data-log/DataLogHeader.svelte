<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';
	import './data-log-page.css';

	let {
		vesselName = 'Selected Vessel',
		startDateTime = $bindable(''),
		endDateTime = $bindable(''),
		timezoneMode = $bindable('auto'),
		timezoneOffset = $bindable('+07:00'),
		activeTimePreset = '',
		timePresets = [],
		autoTimezoneLabel = '',
		loading = false,
		loadingMore = false,
		exporting = false,
		rangeLocked = false,
		onStartInput,
		onEndInput,
		onTimezoneChange,
		onLoad,
		onExport,
		onPreset
	} = $props();
</script>

<section class="data-log-header-card">
	<div class="data-log-header-copy">
		<div class="page-kicker">Data Log</div>
		<h1>{vesselName}</h1>
		<p>Granular 1-minute telemetry log with position, speed, runtime, RPM, load, and fuel data.</p>
	</div>

	<div class="data-log-header-filters">
		<div class="filter-card">
			<label>
				<span>Start</span>
				<input
					type="datetime-local"
					use:fourDigitDateYear
					bind:value={startDateTime}
					oninput={() => onStartInput?.()}
				/>
			</label>

			<label>
				<span>End</span>
				<input
					type="datetime-local"
					use:fourDigitDateYear
					bind:value={endDateTime}
					oninput={() => onEndInput?.()}
				/>
			</label>

			<label>
				<span class="field-label-row">
					Timezone Mode
					{#if timezoneMode === 'auto'}
						<small class="timezone-auto-pill">Auto • {autoTimezoneLabel}</small>
					{/if}
				</span>
				<select bind:value={timezoneMode} onchange={() => onTimezoneChange?.()}>
					{#each TIMEZONE_MODE_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>

			{#if timezoneMode === 'manual'}
				<label>
					<span>Timezone Offset</span>
					<select bind:value={timezoneOffset} onchange={() => onTimezoneChange?.()}>
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
					disabled={loading || loadingMore || !startDateTime || !endDateTime}
				>
					{loading ? 'Loading...' : 'Load Data'}
				</button>

				<button
					type="button"
					class="export-btn"
					onclick={() => onExport?.()}
					disabled={exporting || loading || rangeLocked}
				>
					{exporting ? 'Exporting...' : 'Export Excel'}
				</button>
			</div>

			<div class="time-preset-row" aria-label="Data log time presets">
				<span>Preset</span>
				<div class="time-preset-list">
					{#each timePresets as preset (preset.id)}
						<button
							type="button"
							class:active={activeTimePreset === preset.id}
							onclick={() => onPreset?.(preset.id)}
						>
							{preset.label}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>
