<script>
	let {
		element = $bindable(),
		open = $bindable(false),
		assetLegendItems = [],
		zoneData = [],
		isAssetVisible = () => true,
		onToggleAssetType = () => {},
		showWind = $bindable(false),
		showCurrent = $bindable(false)
	} = $props();
</script>

<div class:legend-collapsed={!open} class="map-legend" bind:this={element}>
	<div class="legend-header">
		<div>
			<span class="legend-title">Map Legend</span>
			<span class="legend-subtitle">Fleet overlays</span>
		</div>
		<button
			type="button"
			class="legend-toggle-btn"
			aria-expanded={open}
			aria-label={open ? 'Hide map legend' : 'Show map legend'}
			title={open ? 'Hide legend' : 'Show legend'}
			onclick={() => (open = !open)}
		>
			{open ? '−' : '+'}
		</button>
	</div>

	{#if open}
		<div class="legend-body">
			<div class="legend-scroll-area">
				<div class="legend-section">
					<div class="legend-item">
						<span class="legend-vessel-marker online" aria-hidden="true"></span>
						<span>Vessel online</span>
					</div>

					<div class="legend-item">
						<span class="legend-vessel-marker offline" aria-hidden="true"></span>
						<span>Vessel offline</span>
					</div>

					<div class="legend-item">
						<span class="legend-vessel-marker selected" aria-hidden="true"></span>
						<span>Selected vessel</span>
					</div>
				</div>

				<div class="legend-section">
					<div class="legend-item">
						<span class="asset-boundary-legend" aria-hidden="true"></span>
						<span>Boundary 1 km</span>
					</div>

					{#if assetLegendItems.length}
						<div class="legend-asset-list" aria-label="Asset types on map">
							{#each assetLegendItems as item (item.key)}
								<button
									type="button"
									class:asset-type-visible={isAssetVisible(item)}
									class="legend-asset-toggle-row"
									title={`${isAssetVisible(item) ? 'Hide' : 'Show'} ${item.label}`}
									onclick={() => onToggleAssetType(item)}
								>
									<img src={item.iconUrl} alt="" />
									<span>{item.label}</span>
									<i aria-hidden="true"></i>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				{#if zoneData.length}
					<div class="legend-section">
						{#each zoneData as zone (zone.id ?? zone.name)}
							<div class="legend-item">
								<span
									class="zone-boundary-legend"
									style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
									aria-hidden="true"
								></span>
								<span>{zone.name}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="legend-actions">
				<button
					type="button"
					class:active-wind-toggle={showWind}
					class="wind-toggle-btn"
					onclick={() => (showWind = !showWind)}
				>
					<span class="wind-legend-line"></span>
					Wind: {showWind ? 'On' : 'Off'}
				</button>

				<button
					type="button"
					class:active-current-toggle={showCurrent}
					class="current-toggle-btn"
					onclick={() => (showCurrent = !showCurrent)}
				>
					<span class="current-legend-line"></span>
					Current: {showCurrent ? 'On' : 'Off'}
				</button>
			</div>
		</div>
	{/if}
</div>
