<script>
	let { group = null, chartAction } = $props();
</script>

<section class="table-section rpm-fuel-curve-section fod-chart-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">FOD</span>
			<h2>FOD Fuel Chart</h2>
		</div>

		<strong>{group?.points || 0} points</strong>
	</div>

	{#if group}
		<div class="rpm-fuel-chart-grid fod-chart-grid">
			<article class="rpm-fuel-chart-card fod-chart-card">
				<div class="rpm-fuel-chart-header">
					<div>
						<span>Fuel oil day tank</span>
						<strong>
							{#if group.hasPort || group.hasStbd}
								FOD Port / FOD STBD
							{:else}
								FOD
							{/if}
						</strong>
					</div>

					<div class="rpm-fuel-chart-badges">
						{#if group.hasSingle}<span>FOD</span>{/if}
						{#if group.hasPort}<span>FOD Port</span>{/if}
						{#if group.hasStbd}<span>FOD STBD</span>{/if}
					</div>
				</div>

				<div class="rpm-fuel-chart-canvas fod-chart-canvas">
					<canvas use:chartAction={group}></canvas>
				</div>

				<div class="rpm-fuel-chart-hint">
					Scroll to zoom in/out, drag to select a zoom area, Shift + drag to pan, double click to
					reset.
				</div>
			</article>
		</div>
	{:else}
		<div class="empty-box">FOD fuel curve chart is not available yet.</div>
	{/if}
</section>
