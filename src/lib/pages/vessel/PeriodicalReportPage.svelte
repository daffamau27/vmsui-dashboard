<script>
	import { onMount } from 'svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import {
		getPeriodicalReportData,
		getPeriodicalReportExcelUrl
	} from '$lib/api/periodicalReportApi.js';
	import { downloadApiFile } from '$lib/api/authApi.js';
	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';

	let loading = $state(false);
	let exporting = $state(false);
	let error = $state('');
	let reportData = $state(null);

	let startDateTime = $state('');
	let endDateTime = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');

	let { active = false } = $props();

	let loadedKeys = $state({});
	let lastLoadedVesselId = $state(null);

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function toLocalInputValue(date) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	function toApiDateTime(value) {
		if (!value) return '';

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;

		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}:00`;
	}

	function formatNumber(value, digits = 1, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;

		return number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}

	function toFuelNumber(value) {
		if (value === undefined || value === null || value === '' || value === '-') {
			return 0;
		}

		const number = Number(value);
		return Number.isFinite(number) ? number : 0;
	}

	function formatLiter(value) {
		return `${formatNumber(toFuelNumber(value), 1)} L`;
	}

	function formatRuntimeHours(hours) {
		const runtimeHours = Number(hours);

		if (!Number.isFinite(runtimeHours) || runtimeHours <= 0) {
			return '0h 0m';
		}

		const totalMinutes = runtimeHours * 60;
		const h = Math.floor(totalMinutes / 60);
		const m = Math.round(totalMinutes % 60);

		return `${h}h ${m}m`;
	}

	function formatRuntimeFromMinutes(minutes) {
		const totalMinutes = Number(minutes);

		if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
			return '0h 0m';
		}

		const h = Math.floor(totalMinutes / 60);
		const m = Math.round(totalMinutes % 60);

		return `${h}h ${m}m`;
	}

	function normalizeEngineName(value) {
		return String(value || '')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function normalizeFuelSourceLabel(sourceKey, visibleSources = []) {
		const key = String(sourceKey || '').toLowerCase();

		const hasInternal = visibleSources.some((source) => source.key === 'ems_internal');

		const hasExternal = visibleSources.some((source) => source.key === 'ems_external');

		if (key === 'ecu') return 'ECU';
		if (key === 'fms') return 'FMS';

		if (key === 'ems_internal') {
			return hasInternal && hasExternal ? 'EMS Internal' : 'EMS';
		}

		if (key === 'ems_external') {
			return hasInternal && hasExternal ? 'EMS External' : 'EMS';
		}

		if (key === 'engine_maker') return 'Engine Maker';

		return sourceKey || '-';
	}

	let vesselName = $derived(
		normalizedData?.vessel_name ||
			normalizedData?.vesselName ||
			$selectedVesselInfo?.name ||
			$selectedVesselInfo?.vesselName ||
			'Selected Vessel'
	);

	let normalizedData = $derived(reportData?.data || reportData || {});

	let hasRawData = $derived(Boolean(reportData));

	let dataReceivedStats = $derived(
		normalizedData?.data_received_stats || normalizedData?.dataReceivedStats || {}
	);

	let engineRuntimeRows = $derived(
		Array.isArray(normalizedData?.engine_runtimes)
			? normalizedData.engine_runtimes
			: Array.isArray(normalizedData?.engineRuntimes)
				? normalizedData.engineRuntimes
				: []
	);

	let fuelConsumption = $derived(
		normalizedData?.fuel_consumption || normalizedData?.fuelConsumption || {}
	);

	let robBunker = $derived(fuelConsumption?.rob_bunker || fuelConsumption?.robBunker || {});

	const engineFuelSourceKeys = ['ecu', 'fms', 'ems_internal', 'ems_external', 'engine_maker'];

	function getFuelSourceObject(sourceKey) {
		return fuelConsumption?.[sourceKey] || {};
	}

	function getFuelSourceEngines(sourceKey) {
		const source = getFuelSourceObject(sourceKey);

		return Array.isArray(source?.engines)
			? source.engines
			: Array.isArray(source?.engine_details)
				? source.engine_details
				: Array.isArray(source?.engineDetails)
					? source.engineDetails
					: [];
	}

	function getFuelSourceTotal(sourceKey) {
		const source = getFuelSourceObject(sourceKey);

		return toFuelNumber(
			source?.total_l ??
				source?.totalL ??
				source?.total ??
				source?.grand_total ??
				source?.grandTotal
		);
	}

	function hasFuelSourceValue(sourceKey) {
		const total = getFuelSourceTotal(sourceKey);
		const engines = getFuelSourceEngines(sourceKey);

		return (
			total > 0 ||
			engines.some((engine) => {
				return toFuelNumber(engine?.fuel_l ?? engine?.fuelL ?? engine?.fuel) > 0;
			})
		);
	}

	let rawVisibleFuelSources = $derived(
		engineFuelSourceKeys
			.filter((key) => hasFuelSourceValue(key))
			.map((key) => ({
				key,
				total: getFuelSourceTotal(key),
				engines: getFuelSourceEngines(key)
			}))
	);

	let visibleFuelSources = $derived(
		rawVisibleFuelSources.map((source) => ({
			...source,
			label: normalizeFuelSourceLabel(source.key, rawVisibleFuelSources)
		}))
	);

	function getFuelForEngine(source, engineName) {
		const engines = Array.isArray(source?.engines) ? source.engines : [];
		const target = normalizeEngineName(engineName);

		const found = engines.find((item) => {
			return normalizeEngineName(item?.engine_name || item?.engineName) === target;
		});

		return toFuelNumber(found?.fuel_l ?? found?.fuelL ?? found?.fuel);
	}

	function getEngineTotalFuel(engineName) {
		return visibleFuelSources.reduce((sum, source) => {
			return sum + getFuelForEngine(source, engineName);
		}, 0);
	}

	let totalRuntimeHours = $derived(
		engineRuntimeRows.reduce((sum, row) => {
			return sum + toFuelNumber(row?.runtime_hours ?? row?.runtimeHours);
		}, 0)
	);

	let totalRuntimeMinutes = $derived(totalRuntimeHours * 60);

	let totalEngineFuel = $derived(
		visibleFuelSources.reduce((sum, source) => {
			return sum + toFuelNumber(source.total);
		}, 0)
	);

	let totalRobBunkerFuel = $derived(
		toFuelNumber(robBunker?.total_fod_l ?? robBunker?.totalFodL) +
			toFuelNumber(robBunker?.bunker_l ?? robBunker?.bunkerL)
	);

	let totalFuel = $derived(totalEngineFuel + totalRobBunkerFuel);

	let hasRobBunkerData = $derived(
		toFuelNumber(robBunker?.fod_port_l ?? robBunker?.fodPortL) > 0 ||
			toFuelNumber(robBunker?.fod_stbd_l ?? robBunker?.fodStbdL) > 0 ||
			toFuelNumber(robBunker?.fod_single_l ?? robBunker?.fodSingleL) > 0 ||
			toFuelNumber(robBunker?.total_fod_l ?? robBunker?.totalFodL) > 0 ||
			toFuelNumber(robBunker?.bunker_l ?? robBunker?.bunkerL) > 0
	);

	let robBunkerCards = $derived([
		...(robBunker?.fod_port_l !== undefined || robBunker?.fodPortL !== undefined
			? [
					{
						label: 'FOD Port',
						value: robBunker?.fod_port_l ?? robBunker?.fodPortL,
						total: false
					}
				]
			: []),
		...(robBunker?.fod_stbd_l !== undefined || robBunker?.fodStbdL !== undefined
			? [
					{
						label: 'FOD STBD',
						value: robBunker?.fod_stbd_l ?? robBunker?.fodStbdL,
						total: false
					}
				]
			: []),
		...(robBunker?.fod_single_l !== undefined || robBunker?.fodSingleL !== undefined
			? [
					{
						label: 'FOD Single',
						value: robBunker?.fod_single_l ?? robBunker?.fodSingleL,
						total: false
					}
				]
			: []),
		...(robBunker?.total_fod_l !== undefined || robBunker?.totalFodL !== undefined
			? [
					{
						label: 'Total FOD',
						value: robBunker?.total_fod_l ?? robBunker?.totalFodL,
						total: true
					}
				]
			: []),
		...(robBunker?.bunker_l !== undefined || robBunker?.bunkerL !== undefined
			? [
					{
						label: 'Bunker',
						value: robBunker?.bunker_l ?? robBunker?.bunkerL,
						total: false
					}
				]
			: [])
	]);

	let averageSpeed = $derived(
		Number(
			normalizedData?.speed_statistics?.average_speed ??
				normalizedData?.speedStatistics?.averageSpeed ??
				normalizedData?.speed_stats?.average_speed ??
				normalizedData?.speedStats?.averageSpeed ??
				normalizedData?.average_speed ??
				normalizedData?.averageSpeed
		)
	);

	let maxSpeed = $derived(
		Number(
			normalizedData?.speed_statistics?.max_speed ??
				normalizedData?.speedStatistics?.maxSpeed ??
				normalizedData?.speed_stats?.max_speed ??
				normalizedData?.speedStats?.maxSpeed ??
				normalizedData?.max_speed ??
				normalizedData?.maxSpeed
		)
	);

	let hasAverageSpeed = $derived(Number.isFinite(averageSpeed));
	let hasMaxSpeed = $derived(Number.isFinite(maxSpeed));

	async function loadPeriodicalReport() {
		if (!$selectedVesselId) {
			error = 'Belum ada vessel yang dipilih dari Fleet View.';
			reportData = null;
			return;
		}

		if (!startDateTime || !endDateTime) {
			error = 'Start dan End wajib diisi.';
			reportData = null;
			return;
		}

		loading = true;
		error = '';

		try {
			const result = await getPeriodicalReportData({
				vesselId: $selectedVesselId,
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				timezoneOffset
			});

			reportData = result;

			const payload = result?.data || result || {};
			const stats = payload?.data_received_stats || payload?.dataReceivedStats || {};

			setPageStatus({
				dataReceived:
					stats?.received_minutes !== undefined && stats?.total_minutes !== undefined
						? `${stats.received_minutes} of ${stats.total_minutes} (${stats.percentage ?? '-'}%)`
						: '-',
				queue: payload?.queue ?? '-',
				sdcard: payload?.sdcard ?? '-',
				online: Boolean($selectedVesselInfo?.online),
				sourcePage: 'Periodical Report'
			});

			console.log('[PERIODICAL_REPORT_DATA]', result);
		} catch (err) {
			console.error('[PERIODICAL_REPORT_ERROR]', err);
			error = err?.message || 'Gagal memuat periodical report.';
			reportData = null;
		} finally {
			loading = false;
		}
	}

	async function handleExportExcel() {
		if (!$selectedVesselId) {
			error = 'Belum ada vessel yang dipilih.';
			return;
		}

		if (!startDateTime || !endDateTime) {
			error = 'Start dan End wajib diisi.';
			return;
		}

		exporting = true;
		error = '';

		try {
			const url = getPeriodicalReportExcelUrl({
				vesselId: $selectedVesselId,
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				timezoneOffset
			});

			const safeVesselName = String(vesselName || 'vessel')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_');

			const safeStart = toApiDateTime(startDateTime).replace(/[:\s]/g, '-');
			const safeEnd = toApiDateTime(endDateTime).replace(/[:\s]/g, '-');

			await downloadApiFile(
				url,
				`Periodical_Report_${safeVesselName}_${safeStart}_${safeEnd}.xlsx`
			);
		} catch (err) {
			console.error('[PERIODICAL_EXPORT_ERROR]', err);
			error = err?.message || 'Gagal export Excel periodical report.';
		} finally {
			exporting = false;
		}
	}

	onMount(() => {
		const now = new Date();

		const start = new Date(now);
		start.setHours(8, 0, 0, 0);

		const end = new Date(now);
		end.setHours(17, 0, 0, 0);

		startDateTime = toLocalInputValue(start);
		endDateTime = toLocalInputValue(end);
	});

	$effect(() => {
		const vesselId = $selectedVesselId;

		if (!vesselId) return;
		if (vesselId === lastLoadedVesselId) return;

		lastLoadedVesselId = vesselId;

		if (startDateTime && endDateTime) {
			loadPeriodicalReport();
		}
	});

	$effect(() => {
		if (!active) return;
		if (!$selectedVesselId) return;
		if (!startDateTime || !endDateTime) return;

		const key = `${$selectedVesselId}|${startDateTime}|${endDateTime}|${timezoneMode}|${timezoneOffset}`;

		if (loadedKeys[key]) return;

		loadedKeys = {
			...loadedKeys,
			[key]: true
		};

		loadPeriodicalReport();
	});
</script>

<section class="periodical-page">
	<section class="periodical-header-card">
		<div>
			<div class="page-kicker">Periodical Report</div>
			<h1>{vesselName}</h1>
			<p>
				Periodical operation report for custom date-time ranges with runtime, fuel consumption, data
				received, and telemetry summary.
			</p>
		</div>
	</section>

	<section class="filter-card">
		<label>
			<span>Start</span>
			<input type="datetime-local" bind:value={startDateTime} />
		</label>

		<label>
			<span>End</span>
			<input type="datetime-local" bind:value={endDateTime} />
		</label>

		<label>
			<span>Timezone Mode</span>
			<select bind:value={timezoneMode}>
				<option value="auto">Auto</option>
				<option value="manual">Manual</option>
			</select>
		</label>

		{#if timezoneMode === 'manual'}
			<label>
				<span>Timezone Offset</span>
				<input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
			</label>
		{/if}

		<div class="filter-actions">
			<button type="button" class="primary-btn" onclick={loadPeriodicalReport} disabled={loading}>
				{loading ? 'Loading...' : 'Load Data'}
			</button>

			<button type="button" class="export-btn" onclick={handleExportExcel} disabled={exporting}>
				{exporting ? 'Exporting...' : 'Export Excel'}
			</button>
		</div>
	</section>

	{#if error}
		<div class="status-box error-box">
			{error}
		</div>
	{/if}

	<section class="data-received-card">
		<span>Data Received</span>
		<strong>
			{dataReceivedStats?.received_minutes !== undefined &&
			dataReceivedStats?.total_minutes !== undefined
				? `${dataReceivedStats.received_minutes} of ${dataReceivedStats.total_minutes} (${dataReceivedStats.percentage ?? '-'}%)`
				: '-'}
		</strong>
	</section>

	<section class="summary-grid">
		<article class="summary-card">
			<span>Total Runtime</span>
			<strong>{formatRuntimeHours(totalRuntimeHours)}</strong>
		</article>

		<article class="summary-card">
			<span>Total Engine Fuel</span>
			<strong>{formatLiter(totalEngineFuel)}</strong>
		</article>

		<article class="summary-card">
			<span>ROB / Bunker Fuel</span>
			<strong>{formatLiter(totalRobBunkerFuel)}</strong>
		</article>

		<article class="summary-card">
			<span>Total Fuel</span>
			<strong>{formatLiter(totalFuel)}</strong>
		</article>

		{#if hasAverageSpeed}
			<article class="summary-card">
				<span>Average Speed</span>
				<strong>{formatNumber(averageSpeed, 2)} knot</strong>
			</article>
		{/if}

		{#if hasMaxSpeed}
			<article class="summary-card">
				<span>Max Speed</span>
				<strong>{formatNumber(maxSpeed, 2)} knot</strong>
			</article>
		{/if}

		<article class="summary-card">
			<span>Timezone</span>
			<strong>{normalizedData?.timezone || '-'}</strong>
		</article>
	</section>

	<section class="table-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">Runtime</span>
				<h2>Engine Runtime</h2>
			</div>

			<strong>{engineRuntimeRows.length} engines</strong>
		</div>

		{#if engineRuntimeRows.length}
			<div class="table-wrapper">
				<table>
					<thead>
						<tr>
							<th>Engine</th>
							<th>Running Hour</th>
							<th>Runtime Hours</th>
						</tr>
					</thead>

					<tbody>
						{#each engineRuntimeRows as row}
							<tr>
								<td>{row.engine_name || row.engineName || '-'}</td>
								<td>{row.runtime_formatted || row.runtimeFormatted || '-'}</td>
								<td>{formatNumber(row.runtime_hours ?? row.runtimeHours, 2)}</td>
							</tr>
						{/each}

						<tr class="total-row">
							<td>Total</td>
							<td>{formatRuntimeHours(totalRuntimeHours)}</td>
							<td>{formatNumber(totalRuntimeHours, 2)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty-box">Engine runtime belum tersedia.</div>
		{/if}
	</section>

	<section class="table-section fuel-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">Fuel</span>
				<h2>Fuel Consumption</h2>
			</div>

			<strong>{visibleFuelSources.length} sources</strong>
		</div>

		{#if hasRobBunkerData}
			<div class="fod-usage-summary">
				{#each robBunkerCards as card}
					<article class:fod-total-card={card.total}>
						<span>{card.label}</span>
						<strong>{formatLiter(card.value)}</strong>
					</article>
				{/each}
			</div>
		{/if}

		{#if visibleFuelSources.length}
			<div class="table-wrapper">
				<table>
					<thead>
						<tr>
							<th>Engine</th>

							{#each visibleFuelSources as source}
								<th>{source.label}</th>
							{/each}

							<th>Total Used</th>
						</tr>
					</thead>

					<tbody>
						{#each engineRuntimeRows as engine}
							{@const engineName = engine.engine_name || engine.engineName}

							<tr>
								<td>{engineName || '-'}</td>

								{#each visibleFuelSources as source}
									<td>{formatLiter(getFuelForEngine(source, engineName))}</td>
								{/each}

								<td>{formatLiter(getEngineTotalFuel(engineName))}</td>
							</tr>
						{/each}

						<tr class="total-row">
							<td>Grand Total</td>

							{#each visibleFuelSources as source}
								<td>{formatLiter(source.total)}</td>
							{/each}

							<td>{formatLiter(totalEngineFuel)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty-box">Fuel consumption belum tersedia.</div>
		{/if}
	</section>

	{#if hasAverageSpeed || hasMaxSpeed}
		<section class="table-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Speed</span>
					<h2>Speed Statistics</h2>
				</div>
			</div>

			<div class="speed-detail-grid">
				{#if hasAverageSpeed}
					<article>
						<span>Average Speed</span>
						<strong>{formatNumber(averageSpeed, 2)} knot</strong>
					</article>
				{/if}

				{#if hasMaxSpeed}
					<article>
						<span>Max Speed</span>
						<strong>{formatNumber(maxSpeed, 2)} knot</strong>
					</article>
				{/if}
			</div>
		</section>
	{/if}

	{#if hasRawData}
		<details class="raw-box">
			<summary>Raw Periodical Report Response</summary>
			<pre>{JSON.stringify(reportData, null, 2)}</pre>
		</details>
	{/if}
</section>

<style>
	.periodical-page {
		min-height: 100vh;
		padding: 16px;
		background: #f3f6fa;
		color: #0f172a;
		display: grid;
		gap: 14px;
	}

	.periodical-header-card,
	.filter-card,
	.table-section,
	.raw-box,
	.data-received-card {
		background: #ffffff;
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
	}

	.periodical-header-card {
		padding: 18px 22px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
	}

	.page-kicker,
	.section-kicker {
		display: inline-flex;
		padding: 4px 10px;
		border-radius: 999px;
		background: #dbeafe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.periodical-header-card h1 {
		margin: 10px 0 4px;
		font-size: 24px;
		font-weight: 900;
	}

	.periodical-header-card p {
		margin: 0;
		color: #64748b;
		font-size: 13px;
		font-weight: 700;
	}

	.header-meta {
		min-width: 120px;
		padding: 10px 14px;
		border-radius: 12px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		text-align: right;
	}

	.header-meta span {
		display: block;
		color: #64748b;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.header-meta strong {
		display: block;
		margin-top: 4px;
		font-size: 16px;
		font-weight: 900;
	}

	.filter-card {
		padding: 14px 18px;
		display: flex;
		align-items: end;
		gap: 12px;
		flex-wrap: wrap;
	}

	.filter-card label {
		display: grid;
		gap: 6px;
	}

	.filter-card label span {
		color: #475569;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.filter-card input,
	.filter-card select {
		height: 42px;
		min-width: 180px;
		padding: 0 12px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		font-size: 14px;
		font-weight: 800;
	}

	.filter-actions {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.primary-btn,
	.export-btn {
		height: 42px;
		padding: 0 18px;
		border: none;
		color: #ffffff;
		font-size: 14px;
		font-weight: 900;
		cursor: pointer;
	}

	.primary-btn {
		background: #2563eb;
	}

	.export-btn {
		background: #16a34a;
	}

	.primary-btn:disabled,
	.export-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status-box {
		padding: 14px 18px;
		font-weight: 900;
	}

	.error-box {
		color: #b91c1c;
		background: #fef2f2;
		border: 1px solid #fecaca;
	}

	.data-received-card {
		min-height: 62px;
		padding: 14px 18px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.data-received-card span {
		color: #64748b;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.data-received-card strong {
		font-size: 20px;
		font-weight: 900;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.summary-card {
		min-height: 92px;
		padding: 16px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.summary-card span {
		color: #64748b;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.summary-card strong {
		margin-top: 8px;
		font-size: 22px;
		font-weight: 900;
	}

	.section-header {
		min-height: 58px;
		padding: 12px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #e2e8f0;
	}

	.section-header h2 {
		margin: 6px 0 0;
		font-size: 18px;
		font-weight: 900;
	}

	.section-header strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.table-wrapper {
		width: 100%;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	th {
		padding: 10px 12px;
		background: #f1f5f9;
		border-bottom: 1px solid #d9e2ec;
		color: #334155;
		font-size: 11px;
		font-weight: 900;
		text-align: left;
		text-transform: uppercase;
	}

	td {
		padding: 10px 12px;
		border-bottom: 1px solid #edf2f7;
		color: #0f172a;
		font-weight: 800;
	}

	.total-row td {
		background: #eff6ff;
		font-weight: 900;
	}

	.empty-box {
		padding: 18px;
		color: #64748b;
		font-weight: 800;
	}

	.fod-usage-summary {
		padding: 12px 14px 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 10px;
		background: #f8fafc;
	}

	.fod-usage-summary article {
		min-height: 68px;
		padding: 12px 14px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.fod-usage-summary span,
	.speed-detail-grid span {
		color: #64748b;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.fod-usage-summary strong,
	.speed-detail-grid strong {
		margin-top: 6px;
		color: #0f172a;
		font-size: 18px;
		font-weight: 900;
	}

	.fod-total-card {
		background: #eff6ff !important;
		border-color: #bfdbfe !important;
	}

	.fod-total-card strong {
		color: #1d4ed8;
	}

	.speed-detail-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		background: #f8fafc;
	}

	.speed-detail-grid article {
		min-height: 68px;
		padding: 12px 14px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		border-radius: 10px;
		display: grid;
	}

	.raw-box {
		padding: 12px 16px;
	}

	.raw-box summary {
		cursor: pointer;
		color: #2563eb;
		font-weight: 900;
	}

	.raw-box pre {
		max-height: 360px;
		overflow: auto;
		padding: 12px;
		background: #0f172a;
		color: #e2e8f0;
		font-size: 11px;
	}

	@media (max-width: 900px) {
		.periodical-header-card,
		.data-received-card {
			flex-direction: column;
			align-items: stretch;
		}

		.summary-grid,
		.fod-usage-summary,
		.speed-detail-grid {
			grid-template-columns: 1fr;
		}

		.filter-card {
			display: grid;
		}

		.filter-card input,
		.filter-card select {
			width: 100%;
		}
	}
</style>
