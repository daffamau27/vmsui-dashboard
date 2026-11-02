<script>
	let {
		selectedRpmCurveTable = null,
		selectedRpmMatrices = [],
		visibleRpmCurveTables = [],
		rpmMatrixMetrics = [],
		selectedRpmRuntimeFuelTableKey = $bindable(''),
		getRpmCurveTableLabel,
		getRpmSourceLabel,
		formatRpmRangeLabel,
		formatRpmMatrixCell
	} = $props();
</script>

<section class="table-section rpm-curve-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">RPM</span>
			<h2>RPM Range Runtime & Fuel</h2>
		</div>

		<div class="rpm-curve-source-control">
			<label for="rpm-runtime-fuel-source">Table Source</label>
			<select id="rpm-runtime-fuel-source" bind:value={selectedRpmRuntimeFuelTableKey}>
				{#each visibleRpmCurveTables as table (table.key)}
					<option value={table.key}>{getRpmCurveTableLabel(table)}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if selectedRpmCurveTable}
		<div class="rpm-curve-table-list">
			{#each selectedRpmMatrices as matrix (matrix.key)}
				<article class="rpm-curve-table-card">
					<div class="rpm-curve-table-header">
						<div>
							<span>{getRpmCurveTableLabel(selectedRpmCurveTable)}</span>
							<strong>{matrix.label}</strong>
						</div>

						<div class="rpm-curve-table-count">
							{matrix.engines.length} engines
						</div>
					</div>

					<!-- Scrollable comparison is keyboard accessible. -->
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						class="table-wrapper rpm-matrix-wrap"
						role="region"
						aria-label={`${matrix.label} RPM range comparison`}
						tabindex="0"
					>
						<table class="rpm-matrix">
							<thead>
								<tr>
									<th rowspan="2" scope="col" class="rpm-range-column">RPM Range</th>
									{#each rpmMatrixMetrics as metric (metric.key)}
										<th colspan={matrix.engines.length} scope="colgroup" class="rpm-metric-start"
											>{metric.label}</th
										>
									{/each}
								</tr>
								<tr>
									{#each rpmMatrixMetrics as metric (metric.key)}
										{#each matrix.engines as engine, engineIndex (engine.key)}
											<th
												scope="col"
												title={engine.engineName}
												class:rpm-metric-start={engineIndex === 0}>{engine.label}</th
											>
										{/each}
									{/each}
								</tr>
							</thead>

							<tbody>
								{#each matrix.rows as row (row.key)}
									<tr class:total-row={row.isTotal}>
										<th scope="row" class="rpm-range-column"
											>{row.isTotal ? 'Total' : formatRpmRangeLabel(row.label)}</th
										>
										{#each rpmMatrixMetrics as metric (metric.key)}
											{#if row.isTotal && metric.key === 'lh'}
												<td
													colspan={matrix.engines.length}
													class="rpm-total-spacer rpm-metric-start"
													aria-label="Not applicable"
												></td>
											{:else}
												{#each matrix.engines as engine, engineIndex (engine.key)}
													<td class:rpm-metric-start={engineIndex === 0}
														>{formatRpmMatrixCell(row.cells[engineIndex], metric, engine.rows)}</td
													>
												{/each}
											{/if}
										{/each}
									</tr>
								{:else}
									<tr>
										<td colspan={1 + rpmMatrixMetrics.length * matrix.engines.length}
											>All RPM ranges have zero runtime.</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</article>
			{/each}
		</div>
		{#if selectedRpmCurveTable.grandTotal && Object.keys(selectedRpmCurveTable.grandTotal).length}
			<div class="table-wrapper rpm-grand-total">
				<table>
					<thead>
						<tr>
							<th scope="col">Summary</th>
							<th scope="col">Runtime</th>
							{#each selectedRpmCurveTable.sourceKeys as sourceKey (sourceKey)}
								<th scope="col">{getRpmSourceLabel(sourceKey)} Fuel</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						<tr class="total-row">
							<td>Grand Total</td>
							<td
								>{formatRpmMatrixCell(selectedRpmCurveTable.grandTotal, {
									key: 'runtime'
								})}</td
							>
							{#each selectedRpmCurveTable.sourceKeys as sourceKey (sourceKey)}
								<td
									>{formatRpmMatrixCell(selectedRpmCurveTable.grandTotal, {
										key: `fuel_${sourceKey}`,
										sourceKey
									})}</td
								>
							{/each}
						</tr>
					</tbody>
				</table>
			</div>
		{/if}
	{:else}
		<div class="empty-box">RPM range data is not available yet.</div>
	{/if}
</section>
