<script>
	let {
		active = false,
		canViewMap = true,
		vesselInfo = {},
		zones = [],
		showWindParticles = $bindable(true),
		showCurrentParticles = $bindable(true),
		mapContainer = $bindable(null)
	} = $props();
</script>

{#if canViewMap}
	<div class="monitoring-card map-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">Position</span>
				<h2>Current Vessel Location</h2>
			</div>

			<strong>{vesselInfo.currentSpeed}</strong>
		</div>

		<div class="map-box">
			{#if active}
				<div class="dashboard-leaflet-map" bind:this={mapContainer}></div>
			{/if}

			{#if vesselInfo.latitude === null || vesselInfo.longitude === null}
				<div class="dashboard-map-status">Vessel coordinates are not available yet.</div>
			{/if}

			<div class="dashboard-map-legend">
				{#each zones as zone (zone.key || zone.name)}
					<span class="dashboard-zone-legend-item">
						<i
							class="dashboard-zone-legend-swatch"
							style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
							aria-hidden="true"
						></i>
						{zone.name}
					</span>
				{/each}

				<button
					type="button"
					class:active-wind-toggle={showWindParticles}
					class="wind-toggle-btn"
					onclick={() => (showWindParticles = !showWindParticles)}
				>
					<span class="wind-legend-line"></span>
					Wind: {showWindParticles ? 'On' : 'Off'}
				</button>

				<button
					type="button"
					class:active-current-toggle={showCurrentParticles}
					class="current-toggle-btn"
					onclick={() => (showCurrentParticles = !showCurrentParticles)}
				>
					<span class="current-legend-line"></span>
					Current: {showCurrentParticles ? 'On' : 'Off'}
				</button>
			</div>
		</div>
	</div>
{:else}
	<div class="monitoring-card permission-empty">
		<strong>Map is not displayed</strong>
		<span>The user does not have the view_daily_path_map permission.</span>
	</div>
{/if}
