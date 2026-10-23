<script>
	import {
		buildPeriodicalRpmMatrices,
		formatRpmRuntime,
		getPeriodicalRpmRuntimePercent
	} from '$lib/utils/periodicalReport.js';
	import { formatLiter, formatNumber } from '$lib/utils/periodicalFormat.js';

	let { tables = [], selectedKey = $bindable(''), show = true } = $props();

	function formatRpmRangeLabel(value) {
		if (value === undefined || value === null || value === '') return '-';

		const text = String(value).trim();
		if (!text || text === '-') return '-';

		return text.replace(/-?\d+(?:[.,]\d+)?/g, (match) => {
			const number = Number(match.replace(',', '.'));
			return Number.isFinite(number) ? String(Math.round(number)) : match;
		});
	}

	function getRpmFuelValue(row, sourceKey) {
		if (sourceKey === 'fms') return row?.fuel_fms ?? row?.fuelFms ?? row?.fms;
		if (sourceKey === 'ecu') return row?.fuel_ecu ?? row?.fuelEcu ?? row?.ecu;

		return row?.fuel_estimated_l ?? row?.fuelEstimatedL ?? row?.fuel ?? row?.fuelUsed;
	}

	function getRpmSourceLabel(sourceKey) {
		if (sourceKey === 'ems_internal') return 'VMS';
		if (sourceKey === 'ems_external') return 'EMS';
		if (sourceKey === 'engine_maker') return 'Engine Maker';
		if (sourceKey === 'fms') return 'FMS';
		if (sourceKey === 'ecu') return 'ECU';

		return sourceKey || '-';
	}

	function getRpmTableLabel(table) {
		const sourceKeys = Array.isArray(table?.sourceKeys) ? table.sourceKeys : [];

		if (sourceKeys.length === 2 && sourceKeys.includes('fms') && sourceKeys.includes('ecu')) {
			return 'FMS / ECU';
		}

		if (sourceKeys.length === 1) return getRpmSourceLabel(sourceKeys[0]);

		return table?.label || '-';
	}

	function formatRpmMatrixCell(row, metric, engineRows) {
		if (!row) return '-';
		if (metric.key === 'runtime') return formatRpmRuntime(row);
		if (metric.key === 'runtime_percent') {
			const percent = getPeriodicalRpmRuntimePercent(row, engineRows);
			return percent === null ? '-' : `${formatNumber(percent, 1)}%`;
		}
		const value =
			metric.key === 'lh'
				? (row.lh_ems ?? row.lhEms ?? row.lh_maker ?? row.lhMaker ?? row.lh)
				: getRpmFuelValue(row, metric.sourceKey);
		if (
			(typeof value !== 'number' && typeof value !== 'string') ||
			String(value).trim() === '' ||
			!Number.isFinite(Number(value))
		)
			return '-';
		return metric.key === 'lh' ? formatNumber(value, 2) : formatLiter(value);
	}

	let selectedTable = $derived(
		tables.find((table) => table.key === selectedKey) || tables[0] || null
	);
	let matrices = $derived(buildPeriodicalRpmMatrices(selectedTable?.details || []));
	let metrics = $derived([
		{ key: 'runtime', label: 'Runtime' },
		{ key: 'runtime_percent', label: 'Runtime %' },
		{ key: 'lh', label: 'L/H' },
		...(selectedTable?.sourceKeys || []).map((sourceKey) => ({
			key: `fuel_${sourceKey}`,
			sourceKey,
			label:
				selectedTable.sourceKeys.length === 1
					? 'Fuel (L)'
					: `${getRpmSourceLabel(sourceKey)} Fuel (L)`
		}))
	]);

	$effect(() => {
		const keys = tables.map((table) => table.key);

		if (!keys.length) {
			selectedKey = '';
			return;
		}

		if (!keys.includes(selectedKey)) {
			selectedKey = keys[0];
		}
	});
</script>

{#if show}
	<section class="table-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">RPM</span>
				<h2>RPM Range Runtime &amp; Fuel</h2>
			</div>

			<div class="rpm-source-control">
				<label for="periodical-rpm-source">Table Source</label>
				<select id="periodical-rpm-source" bind:value={selectedKey}>
					{#each tables as table (table.key)}
						<option value={table.key}>{getRpmTableLabel(table)}</option>
					{/each}
				</select>
			</div>
		</div>

		{#if selectedTable}
			<div class="periodical-rpm-table-list">
				{#each matrices as matrix (matrix.key)}
					<article class="periodical-rpm-card">
						<div class="periodical-rpm-card-header">
							<div>
								<span>{getRpmTableLabel(selectedTable)}</span>
								<strong>{matrix.label}</strong>
							</div>
							<small>{matrix.engines.length} engines</small>
						</div>

						<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable table region needs keyboard access.) -->
						<div
							class="table-wrapper periodical-rpm-matrix-wrap"
							role="region"
							aria-label={`${matrix.label} RPM range comparison`}
							tabindex="0"
						>
							<table class="periodical-rpm-matrix">
								<thead>
									<tr>
										<th rowspan="2" scope="col" class="rpm-range-column">RPM Range</th>
										{#each metrics as metric (metric.key)}
											<th colspan={matrix.engines.length} scope="colgroup" class="rpm-metric-start"
												>{metric.label}</th
											>
										{/each}
									</tr>
									<tr>
										{#each metrics as metric (metric.key)}
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
											{#each metrics as metric (metric.key)}
												{#if row.isTotal && metric.key === 'lh'}
													<td
														colspan={matrix.engines.length}
														class="rpm-total-spacer rpm-metric-start"
														aria-label="Not applicable"
													></td>
												{:else}
													{#each matrix.engines as engine, engineIndex (engine.key)}
														<td class:rpm-metric-start={engineIndex === 0}
															>{formatRpmMatrixCell(
																row.cells[engineIndex],
																metric,
																engine.rows
															)}</td
														>
													{/each}
												{/if}
											{/each}
										</tr>
									{:else}
										<tr>
											<td colspan={1 + metrics.length * matrix.engines.length}
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

			{#if selectedTable.grandTotal && Object.keys(selectedTable.grandTotal).length}
				<div class="table-wrapper periodical-rpm-grand-total">
					<table>
						<thead>
							<tr>
								<th>Summary</th>
								<th>Runtime</th>
								{#each selectedTable.sourceKeys as sourceKey (sourceKey)}
									<th>{getRpmSourceLabel(sourceKey)} Fuel</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							<tr class="total-row">
								<td>Grand Total</td>
								<td>{formatRpmRuntime(selectedTable.grandTotal)}</td>
								{#each selectedTable.sourceKeys as sourceKey (sourceKey)}
									<td>{formatLiter(getRpmFuelValue(selectedTable.grandTotal, sourceKey))}</td>
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
{/if}
