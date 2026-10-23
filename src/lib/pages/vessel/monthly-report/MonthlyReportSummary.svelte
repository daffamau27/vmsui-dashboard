<script>
	let {
		dataReceivedLabel = '',
		totalFuelLabel = '',
		totalDistanceLabel = '',
		averageSpeedLabel = '',
		totalOperationHoursLabel = '',
		engineRuntimeEntries = []
	} = $props();
</script>

<section class="summary-grid">
	{#if dataReceivedLabel}
		<article class="summary-card">
			<span>Data Received</span>
			<strong>{dataReceivedLabel}</strong>
		</article>
	{/if}

	{#if totalFuelLabel}
		<article class="summary-card">
			<span>Total Fuel</span>
			<strong>{totalFuelLabel} L</strong>
		</article>
	{/if}

	{#if totalDistanceLabel}
		<article class="summary-card">
			<span>Total Distance</span>
			<strong>{totalDistanceLabel}</strong>
		</article>
	{/if}

	{#if averageSpeedLabel}
		<article class="summary-card">
			<span>Average Speed</span>
			<strong>{averageSpeedLabel}</strong>
		</article>
	{/if}

	{#if totalOperationHoursLabel}
		<article class="summary-card">
			<span>Total Operation Hours</span>
			<strong>{totalOperationHoursLabel}</strong>
		</article>
	{/if}

	{#if engineRuntimeEntries.length}
		<article class="summary-card engine-runtime-summary-card">
			<span>Engine Running Hours</span>
			<div class="engine-runtime-summary-list">
				{#each engineRuntimeEntries as runtime (runtime.key || runtime.label)}
					<div class="engine-runtime-summary-item">
						<small>{runtime.label}</small>
						<strong>{runtime.value}</strong>
					</div>
				{/each}
			</div>
		</article>
	{/if}
</section>
