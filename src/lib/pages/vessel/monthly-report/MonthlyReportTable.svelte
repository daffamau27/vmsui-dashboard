<script>
	let {
		rows = [],
		engines = [],
		fuelSources = [],
		globalFuelGroups = [],
		highRpmEngines = [],
		showDataReceived = false,
		showRuntime = false,
		showFuel = false,
		showSpeed = false,
		showHighRpm = false,
		fuelColspan = 1,
		highRpmColspan = 1,
		highRpmEngineColspan = 1,
		headerRowspan = 1,
		hasGroupedHeaderRows = false
	} = $props();
</script>

<section class="table-section monthly-main-table">
	<div class="section-header">
		<div>
			<span class="section-kicker">Daily Aggregation</span>
			<h2>Monthly Report by Date</h2>
		</div>

		<div class="section-header-actions">
			<strong>{rows.length} rows</strong>
		</div>
	</div>

	{#if rows.length}
		<div class="monthly-table-wrapper">
			<table class="monthly-report-table">
				<thead>
					<tr>
						<th rowspan={headerRowspan} class="sticky-col">DATE</th>
						{#if showDataReceived}
							<th rowspan={headerRowspan}>DATA RECEIVED</th>
						{/if}

						{#if showRuntime}
							<th colspan={engines.length || 1}>RUNTIME</th>
						{/if}

						{#if showFuel}
							<th colspan={fuelColspan}>FUEL CONSUMPTION (L)</th>
						{/if}

						{#if showSpeed}
							<th colspan="2">SPEED (KNOT)</th>
						{/if}

						{#if showHighRpm}
							<th colspan={highRpmColspan}>HIGH RPM LOW SPEED</th>
						{/if}
					</tr>

					{#if hasGroupedHeaderRows}
						<tr>
							{#if showRuntime}
								{#if engines.length}
									{#each engines as engine (engine.key)}
										<th rowspan="2">{engine.name}</th>
									{/each}
								{:else}
									<th rowspan="2">-</th>
								{/if}
							{/if}

							{#if showFuel}
								{#if fuelSources.length || globalFuelGroups.length}
									{#each fuelSources as source (source.key)}
										<th colspan={engines.length + 1}>{source.label}</th>
									{/each}

									{#each globalFuelGroups as group (group.key)}
										{#if group.collapsed}
											<th rowspan="2">{group.label}</th>
										{:else}
											<th colspan={group.columns.length}>{group.label}</th>
										{/if}
									{/each}
								{:else}
									<th rowspan="2">-</th>
								{/if}
							{/if}

							{#if showSpeed}
								<th rowspan="2">AVG</th>
								<th rowspan="2">MAX</th>
							{/if}

							{#if showHighRpm}
								<th colspan={highRpmEngineColspan}>DURATION (HH:MM)</th>
								<th colspan={highRpmEngineColspan}>FUEL USED (L)</th>
								<th rowspan="2">TOTAL FUEL (L)</th>
							{/if}
						</tr>

						<tr>
							{#if showFuel && (fuelSources.length || globalFuelGroups.length)}
								{#each fuelSources as source (source.key)}
									{#each engines as engine (engine.key)}
										<th>{engine.name}</th>
									{/each}
									<th>TOTAL</th>
								{/each}

								{#each globalFuelGroups as group (group.key)}
									{#if !group.collapsed}
										{#each group.columns as column (column.key)}
											<th>{column.label}</th>
										{/each}
									{/if}
								{/each}
							{/if}

							{#if showHighRpm}
								{#if highRpmEngines.length}
									{#each highRpmEngines as engine (engine.key)}
										<th>{engine.name}</th>
									{/each}
									{#each highRpmEngines as engine (engine.key)}
										<th>{engine.name}</th>
									{/each}
								{:else}
									<th>-</th>
									<th>-</th>
								{/if}
							{/if}
						</tr>
					{/if}
				</thead>

				<tbody>
					{#each rows as row (row.key)}
						<tr class:future-row={row.isFuture}>
							<td class="sticky-col date-cell">{row.dateLabel}</td>
							{#if showDataReceived}
								<td>{row.isFuture ? '-' : row.dataReceived}</td>
							{/if}

							{#if showRuntime}
								{#if engines.length}
									{#each row.runtimes as value, index (engines[index]?.key || index)}
										<td>{row.isFuture ? '-' : value}</td>
									{/each}
								{:else}
									<td>-</td>
								{/if}
							{/if}

							{#if showFuel}
								{#if fuelSources.length || globalFuelGroups.length}
									{#each row.fuelSourceCells as source (source.key)}
										{#each source.engineValues as value, index (engines[index]?.key || index)}
											<td>{row.isFuture ? '-' : value}</td>
										{/each}
										<td class="total-col">{row.isFuture ? '-' : source.total}</td>
									{/each}

									{#each row.globalFuelValues as value, index (index)}
										<td>{row.isFuture ? '-' : value}</td>
									{/each}
								{:else}
									<td>-</td>
								{/if}
							{/if}

							{#if showSpeed}
								<td>{row.isFuture ? '-' : row.speedAvg}</td>
								<td>{row.isFuture ? '-' : row.speedMax}</td>
							{/if}

							{#if showHighRpm}
								{#if highRpmEngines.length}
									{#each row.highRpmDurations as value, index (highRpmEngines[index]?.key || index)}
										<td>{row.isFuture ? '-' : value}</td>
									{/each}
									{#each row.highRpmFuelUsed as value, index (highRpmEngines[index]?.key || index)}
										<td>{row.isFuture ? '-' : value}</td>
									{/each}
								{:else}
									<td>-</td>
									<td>-</td>
								{/if}
								<td class="total-col">{row.isFuture ? '-' : row.highRpmTotalFuel}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-box">Monthly report by date is not available yet.</div>
	{/if}
</section>
