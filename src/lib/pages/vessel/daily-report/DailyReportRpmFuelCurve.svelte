<script>
	let {
		groups = [],
		canViewFuelEcu = false,
		canViewFuelFms = false,
		canViewFuelEmsInternal = false,
		canViewFuelEmsExternal = false,
		canViewFuelEngineMaker = false,
		chartAction,
		getFuelSourceLabel = (sourceKey) => sourceKey || '-'
	} = $props();
</script>

<section class="table-section rpm-fuel-curve-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Chart</span>
			<h2>RPM vs Fuel Curve</h2>
		</div>

		<strong>{groups.length} engines</strong>
	</div>

	{#if groups.length}
		<div class="rpm-fuel-chart-grid">
			{#each groups as group, groupIndex (groupIndex)}
				<article class="rpm-fuel-chart-card">
					<div class="rpm-fuel-chart-header">
						<div>
							<span>Engine</span>
							<strong>{group.engineName}</strong>
						</div>

						<div class="rpm-fuel-chart-badges">
							{#if group.hasSpeed}
								<span>Speed</span>
							{/if}

							{#if group.hasEcu && canViewFuelEcu}
								<span>{getFuelSourceLabel('ecu', group)}</span>
							{/if}

							{#if group.hasFms && canViewFuelFms}
								<span>{getFuelSourceLabel('fms', group)}</span>
							{/if}

							{#if group.hasInternal && canViewFuelEmsInternal}
								<span>{getFuelSourceLabel('ems_internal', group)}</span>
							{/if}

							{#if group.hasExternal && canViewFuelEmsExternal}
								<span>{getFuelSourceLabel('ems_external', group)}</span>
							{/if}

							{#if group.hasEngineMaker && canViewFuelEngineMaker}
								<span>{getFuelSourceLabel('engine_maker', group)}</span>
							{/if}
						</div>
					</div>

					<div class="rpm-fuel-chart-canvas">
						<canvas use:chartAction={group}></canvas>
					</div>

					<div class="rpm-fuel-chart-hint">
						Scroll to zoom in/out, drag to select a zoom area, Shift + drag to pan, double click to
						reset.
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="empty-box">RPM vs fuel curve chart is not available yet.</div>
	{/if}
</section>
