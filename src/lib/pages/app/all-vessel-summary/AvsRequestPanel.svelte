<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';
	import './avs-page.css';

	let {
		presets = [],
		activeDefaultPresetId = 'custom',
		activeDefaultPresetLabel = 'Custom',
		defaultStartDate = $bindable(''),
		defaultEndDate = $bindable(''),
		defaultTimezoneMode = $bindable('manual'),
		defaultTimezoneOffset = $bindable('+07:00'),
		autoTimezoneLabel = 'UTC+07:00',
		selectedRangeSummary = '',
		selectedDevicesCount = 0,
		selectedDevices = [],
		getVesselRange,
		getVesselTimezone,
		getDeviceAutoTimezoneLabel,
		onDefaultDateChange,
		onApplyPreset,
		onApplyRange,
		onApplyTimezone,
		onSetVesselRange,
		onSetVesselTimezone
	} = $props();
</script>

<section class="table-section summary-request-section">
	<div class="section-header summary-request-header">
		<div>
			<span class="section-kicker">Range & UTC</span>
			<h2>Summary Request</h2>
		</div>

		<strong>{activeDefaultPresetLabel}</strong>
	</div>

	<div class="summary-request-body">
		<div class="request-config-card">
			<div class="request-config-head">
				<div class="request-title-block">
					<div class="request-icon">↔</div>

					<div>
						<h3>Default Request</h3>
						<p>Set the main range and UTC, then apply them to the selected vessels.</p>
					</div>
				</div>

				<span class="request-badge">
					{defaultTimezoneMode === 'auto' ? `Auto • ${autoTimezoneLabel}` : defaultTimezoneOffset}
				</span>
			</div>

			<div class="request-config-grid">
				<label class="request-field">
					<span>Start</span>
					<input
						type="datetime-local"
						use:fourDigitDateYear
						bind:value={defaultStartDate}
						onchange={() => onDefaultDateChange?.()}
					/>
				</label>

				<label class="request-field">
					<span>End</span>
					<input
						type="datetime-local"
						use:fourDigitDateYear
						bind:value={defaultEndDate}
						onchange={() => onDefaultDateChange?.()}
					/>
				</label>

				<label class="request-field">
					<span class="field-label-row">
						Default UTC Mode
						{#if defaultTimezoneMode === 'auto'}
							<small class="timezone-auto-pill">Auto • {autoTimezoneLabel}</small>
						{/if}
					</span>
					<select bind:value={defaultTimezoneMode}>
						{#each TIMEZONE_MODE_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				{#if defaultTimezoneMode === 'manual'}
					<label class="request-field">
						<span>Default UTC</span>
						<select bind:value={defaultTimezoneOffset}>
							{#each TIMEZONE_OFFSET_OPTIONS as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
				{/if}
			</div>

			<div class="request-presets">
				<span>Quick range</span>

				<div class="request-preset-buttons">
					{#each presets as preset (preset.id)}
						<button
							type="button"
							class:active-preset={activeDefaultPresetId === preset.id}
							onclick={() => onApplyPreset?.(preset)}
						>
							{preset.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="request-actions">
				<button
					type="button"
					class="secondary-btn"
					onclick={() => onApplyRange?.()}
					disabled={!selectedDevicesCount}
				>
					Apply Range
				</button>

				<button
					type="button"
					class="secondary-btn"
					onclick={() => onApplyTimezone?.()}
					disabled={!selectedDevicesCount}
				>
					Apply UTC
				</button>
			</div>
		</div>

		<div class="request-summary-strip">
			<div class="request-summary-item">
				<span>Default Range</span>
				<strong>{selectedRangeSummary}</strong>
			</div>

			<div class="request-summary-item">
				<span>Default UTC</span>
				<strong>
					{defaultTimezoneMode === 'auto' ? `Auto • ${autoTimezoneLabel}` : defaultTimezoneOffset}
				</strong>
			</div>

			<div class="request-summary-item">
				<span>Selected Vessel</span>
				<strong>{selectedDevicesCount}</strong>
			</div>

			<div class="request-summary-item">
				<span>Preset</span>
				<strong>{activeDefaultPresetLabel}</strong>
			</div>
		</div>

		<div class="vessel-request-panel">
			<div class="vessel-request-head">
				<div>
					<h3>Request per Vessel</h3>
					<p>Each vessel can use a different range and UTC setting.</p>
				</div>

				<strong>{selectedDevicesCount} selected</strong>
			</div>

			{#if selectedDevices.length}
				<div class="vessel-request-list">
					{#each selectedDevices as device (device.id)}
						{@const vesselRange = getVesselRange?.(device.id)}
						{@const vesselTimezone = getVesselTimezone?.(device.id)}
						<article class="vessel-request-card">
							<div class="vessel-request-title">
								<div class="vessel-avatar">
									{device.name?.slice(0, 1).toUpperCase() || 'V'}
								</div>

								<div class="vessel-request-name">
									<strong>{device.name}</strong>
								</div>

								<span class="vessel-utc-pill">
									{vesselTimezone?.mode === 'auto'
										? `Auto • ${getDeviceAutoTimezoneLabel?.(device)}`
										: vesselTimezone?.offset}
								</span>
							</div>

							<div class="vessel-request-fields">
								<label class="request-field">
									<span>Start</span>
									<input
										type="datetime-local"
										use:fourDigitDateYear
										value={vesselRange?.start}
										onchange={(event) =>
											onSetVesselRange?.(device.id, 'start', event.currentTarget.value)}
									/>
								</label>

								<label class="request-field">
									<span>End</span>
									<input
										type="datetime-local"
										use:fourDigitDateYear
										value={vesselRange?.end}
										onchange={(event) =>
											onSetVesselRange?.(device.id, 'end', event.currentTarget.value)}
									/>
								</label>

								<label class="request-field">
									<span class="field-label-row">
										UTC Mode
										{#if vesselTimezone?.mode === 'auto'}
											<small class="timezone-auto-pill">
												Auto • {getDeviceAutoTimezoneLabel?.(device)}
											</small>
										{/if}
									</span>
									<select
										value={vesselTimezone?.mode}
										onchange={(event) =>
											onSetVesselTimezone?.(device.id, 'mode', event.currentTarget.value)}
									>
										{#each TIMEZONE_MODE_OPTIONS as option (option.value)}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
								</label>

								{#if vesselTimezone?.mode === 'manual'}
									<label class="request-field">
										<span>UTC</span>
										<select
											value={vesselTimezone?.offset}
											onchange={(event) =>
												onSetVesselTimezone?.(device.id, 'offset', event.currentTarget.value)}
										>
											{#each TIMEZONE_OFFSET_OPTIONS as option (option.value)}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
									</label>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<div class="empty-box">Select a vessel first.</div>
			{/if}
		</div>
	</div>
</section>
