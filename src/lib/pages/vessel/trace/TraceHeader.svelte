<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';

	let {
		vesselName = '-',
		startDateTime = $bindable(''),
		endDateTime = $bindable(''),
		timezoneMode = $bindable('auto'),
		timezoneOffset = $bindable('+07:00'),
		autoTimezoneLabel = '',
		activeTimePreset = '',
		presets = [],
		loading = false,
		canLoad = false,
		onLoad,
		onPreset,
		onDateTimeInput,
		onTimezoneChange
	} = $props();
</script>

<section class="trace-header-card">
	<div class="trace-header-copy">
		<div class="page-kicker">Trace Playback</div>
		<h1>{vesselName}</h1>
		<p>
			Replay vessel position, route trail, telemetry, engine RPM, and CCTV snapshots by time range.
		</p>
	</div>

	<div class="trace-header-filters">
		<div class="filter-controls">
			<label>
				<span>Start</span>
				<input
					type="datetime-local"
					use:fourDigitDateYear
					bind:value={startDateTime}
					oninput={() => onDateTimeInput?.()}
				/>
			</label>

			<label>
				<span>End</span>
				<input
					type="datetime-local"
					use:fourDigitDateYear
					bind:value={endDateTime}
					oninput={() => onDateTimeInput?.()}
				/>
			</label>

			<label>
				<span class="field-label-row">
					Timezone
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
					<span>Offset</span>
					<select bind:value={timezoneOffset} onchange={() => onTimezoneChange?.()}>
						{#each TIMEZONE_OFFSET_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			{/if}

			<button
				type="button"
				class="primary-btn"
				onclick={() => onLoad?.()}
				disabled={loading || !canLoad}
			>
				{loading ? 'Loading...' : 'Load Trace'}
			</button>
		</div>

		<div class="time-preset-row" aria-label="Trace time presets">
			<span>Preset</span>
			<div class="time-preset-list">
				{#each presets as preset (preset.id)}
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
</section>
