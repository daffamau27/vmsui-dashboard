<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MonthlyReportPage from './MonthlyReportPage.svelte';
	import MonthlyReportHeader from './MonthlyReportHeader.svelte';
	import MonthlyReportColumnOptions from './MonthlyReportColumnOptions.svelte';
	import MonthlyReportSummary from './MonthlyReportSummary.svelte';
	import MonthlyReportTable from './MonthlyReportTable.svelte';
	import MonthlyReportLoadOverlay from './MonthlyReportLoadOverlay.svelte';

	const engines = [
		{ key: 'me-port', name: 'ME PORT' },
		{ key: 'me-stbd', name: 'ME STBD' },
		{ key: 'ae-1', name: 'AE 1' }
	];

	const fuelSources = [
		{ key: 'ecu', label: 'ECU' },
		{ key: 'fms', label: 'FMS' }
	];

	const globalFuelGroups = [
		{
			key: 'fod',
			label: 'FOD',
			columns: [
				{ key: 'fod_port_l', label: 'FOD PORT' },
				{ key: 'fod_stbd_l', label: 'FOD STBD' }
			],
			collapsed: false
		},
		{
			key: 'fuel_bunker',
			label: 'Bunker',
			columns: [{ key: 'bunker_l', label: 'Bunker' }],
			collapsed: true
		}
	];

	const highRpmEngines = [
		{ key: 'me-port', name: 'ME PORT' },
		{ key: 'me-stbd', name: 'ME STBD' }
	];

	const tableRows = [
		{
			key: '2026-10-01',
			dateLabel: '01',
			isFuture: false,
			dataReceived: '1,380 / 1,440 (95.8%)',
			runtimes: ['18h 20m', '17h 45m', '4h 10m'],
			fuelSourceCells: [
				{ key: 'ecu', engineValues: ['620.5', '598.2', '96.4'], total: '1,315.1' },
				{ key: 'fms', engineValues: ['610.2', '590.8', '94.1'], total: '1,295.1' }
			],
			globalFuelValues: ['820.0', '790.5', '2,450.0'],
			speedAvg: '8.42',
			speedMax: '12.80',
			highRpmDurations: ['0h 45m', '0h 30m'],
			highRpmFuelUsed: ['95.0', '82.5'],
			highRpmTotalFuel: '177.5'
		},
		{
			key: '2026-10-02',
			dateLabel: '02',
			isFuture: false,
			dataReceived: '1,410 / 1,440 (97.9%)',
			runtimes: ['19h 05m', '18h 30m', '3h 55m'],
			fuelSourceCells: [
				{ key: 'ecu', engineValues: ['640.1', '612.7', '90.2'], total: '1,343.0' },
				{ key: 'fms', engineValues: ['632.4', '605.5', '88.7'], total: '1,326.6' }
			],
			globalFuelValues: ['810.5', '785.2', '2,420.0'],
			speedAvg: '8.61',
			speedMax: '13.10',
			highRpmDurations: ['0h 50m', '0h 35m'],
			highRpmFuelUsed: ['102.0', '88.0'],
			highRpmTotalFuel: '190.0'
		},
		{
			key: '2026-10-03',
			dateLabel: '03',
			isFuture: true,
			dataReceived: '-',
			runtimes: ['-', '-', '-'],
			fuelSourceCells: [
				{ key: 'ecu', engineValues: ['-', '-', '-'], total: '-' },
				{ key: 'fms', engineValues: ['-', '-', '-'], total: '-' }
			],
			globalFuelValues: ['-', '-', '-'],
			speedAvg: '-',
			speedMax: '-',
			highRpmDurations: ['-', '-'],
			highRpmFuelUsed: ['-', '-'],
			highRpmTotalFuel: '-'
		}
	];

	const columnOptions = [
		{ key: 'data_received', label: 'Data Received', selected: true },
		{ key: 'runtimes', label: 'Engine Runtimes', selected: true },
		{ key: 'fuel', label: 'Fuel Consumption', selected: true },
		{ key: 'speed', label: 'Speed', selected: true },
		{ key: 'high_rpm_low_speed', label: 'High RPM Low Speed', selected: false }
	];

	const fuelSourceOptions = [
		{ key: 'ecu', label: 'ECU', selected: true },
		{ key: 'fms', label: 'FMS', selected: true },
		{ key: 'fod', label: 'FOD', selected: true },
		{ key: 'fuel_bunker', label: 'Bunker', selected: false }
	];

	const engineRuntimeEntries = [
		{ key: 'me-port', label: 'ME PORT', value: '18h 20m' },
		{ key: 'me-stbd', label: 'ME STBD', value: '17h 45m' },
		{ key: 'ae-1', label: 'AE 1', value: '4h 10m' }
	];

	const { Story } = defineMeta({
		title: 'Pages/Vessel/MonthlyReportPage',
		component: MonthlyReportPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Laporan bulanan vessel: filter bulan dan rentang tanggal, pilihan kolom, ringkasan operasi, dan tabel agregasi harian. Halaman memuat data dari API; section di bawah dirender dengan data dummy.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan laporan bulanan.' }
		}
	});
</script>

<Story name="Default" args={{ active: false }} />

<Story
	name="Header"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Header laporan dengan filter bulan, rentang tanggal (kalender), timezone, serta tombol Load Data dan Export Excel.'
			}
		}
	}}
>
	<div class="monthly-page" style="min-height: 100vh;">
		<MonthlyReportHeader
			vesselName="MV Nusantara Jaya"
			reportMonth="2026-10"
			startDate="01"
			endDate="23"
			timezoneMode="auto"
			timezoneOffset="+07:00"
			autoTimezoneLabel="UTC+07:00"
			rangeLimitText="Available until day 23 because the selected month is current month."
			onLoad={() => {}}
			onExport={() => {}}
			onRangeChange={() => {}}
		/>
	</div>
</Story>

<Story
	name="Visible Columns"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Panel pilihan kolom tabel dan sumber fuel, dengan status loading/error dan aksi reset.'
			}
		}
	}}
>
	<div class="monthly-page" style="min-height: 100vh;">
		<MonthlyReportColumnOptions
			columns={columnOptions}
			fuelSources={fuelSourceOptions}
			selectedCount={4}
			showFuelSources
			onToggleColumn={() => {}}
			onResetColumns={() => {}}
			onToggleFuelSource={() => {}}
			onResetFuelSources={() => {}}
		/>
	</div>
</Story>

<Story
	name="Summary"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Ringkasan data received, total fuel, jarak, kecepatan rata-rata, jam operasi, dan running hours per engine.'
			}
		}
	}}
>
	<div class="monthly-page" style="min-height: 100vh;">
		<MonthlyReportSummary
			dataReceivedLabel="1,410 / 1,440 (97.9%)"
			totalFuelLabel="2,668.1"
			totalDistanceLabel="2,842.60 NM"
			averageSpeedLabel="8.61 knot"
			totalOperationHoursLabel="41h 30m"
			{engineRuntimeEntries}
		/>
	</div>
</Story>

<Story
	name="Monthly Table"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Tabel agregasi harian dengan grouped header runtime, fuel per sumber, speed, dan high RPM low speed.'
			}
		}
	}}
>
	<div class="monthly-page" style="min-height: 100vh;">
		<MonthlyReportTable
			rows={tableRows}
			{engines}
			{fuelSources}
			{globalFuelGroups}
			{highRpmEngines}
			showDataReceived
			showRuntime
			showFuel
			showSpeed
			showHighRpm
			fuelColspan={11}
			highRpmColspan={5}
			highRpmEngineColspan={2}
			headerRowspan={3}
			hasGroupedHeaderRows
		/>
	</div>
</Story>

<Story
	name="Load Overlay"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Overlay yang tampil saat bulan atau rentang tanggal belum dipilih.'
			}
		}
	}}
>
	<div class="monthly-page" style="min-height: 100vh; position: relative;">
		<div class="load-required-area is-locked" style="min-height: 420px; position: relative;">
			<MonthlyReportLoadOverlay visible />
		</div>
	</div>
</Story>
