<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PeriodicalReportPage from './PeriodicalReportPage.svelte';
	import PeriodicalHeader from './PeriodicalHeader.svelte';
	import PeriodicalSummary from './PeriodicalSummary.svelte';
	import PeriodicalTravelDistance from './PeriodicalTravelDistance.svelte';
	import PeriodicalRuntimeTable from './PeriodicalRuntimeTable.svelte';
	import PeriodicalRpmTable from './PeriodicalRpmTable.svelte';
	import PeriodicalFuelTable from './PeriodicalFuelTable.svelte';
	import PeriodicalHighRpmTable from './PeriodicalHighRpmTable.svelte';
	import PeriodicalSpeedStats from './PeriodicalSpeedStats.svelte';
	import PeriodicalLoadOverlay from './PeriodicalLoadOverlay.svelte';

	const engineFuelCards = [
		{
			key: 'me-port',
			engineName: 'ME PORT',
			fuelLabel: '1,240.5 L',
			sourceLabel: 'EMS'
		},
		{
			key: 'me-stbd',
			engineName: 'ME STBD',
			fuelLabel: '1,180.0 L',
			sourceLabel: 'EMS'
		},
		{
			key: 'ae-1',
			engineName: 'AE 1',
			fuelLabel: '-',
			sourceLabel: null
		}
	];

	const runtimeRows = [
		{
			key: 'me-port',
			engineName: 'ME PORT',
			runtimeFormatted: '08h 30m',
			runtimeHoursLabel: '8.50'
		},
		{
			key: 'me-stbd',
			engineName: 'ME STBD',
			runtimeFormatted: '07h 45m',
			runtimeHoursLabel: '7.75'
		},
		{
			key: 'ae-1',
			engineName: 'AE 1',
			runtimeFormatted: '02h 15m',
			runtimeHoursLabel: '2.25'
		}
	];

	const rpmTables = [
		{
			key: 'ems_internal',
			label: 'VMS',
			sourceKeys: ['ems_internal'],
			showLh: true,
			details: [
				{
					engine_name: 'ME PORT',
					rpm_range: '600-800',
					runtime_minutes: 120,
					fuel_estimated_l: 300
				},
				{
					engine_name: 'ME STBD',
					rpm_range: '600-800',
					runtime_minutes: 90,
					fuel_estimated_l: 250
				},
				{
					engine_name: 'ME PORT',
					rpm_range: '800-1000',
					runtime_minutes: 60,
					fuel_estimated_l: 200
				},
				{
					engine_name: 'ME STBD',
					rpm_range: '800-1000',
					runtime_minutes: 40,
					fuel_estimated_l: 180
				}
			],
			grandTotal: { runtime_minutes: 310, fuel_estimated_l: 930 }
		}
	];

	const fuelSources = [
		{ key: 'ems_internal', label: 'VMS', totalLabel: '2,420.5 L' },
		{ key: 'fms', label: 'FMS', totalLabel: '2,380.0 L' }
	];

	const fuelRows = [
		{
			key: 'me-port',
			engineName: 'ME PORT',
			values: [
				{ key: 'ems_internal', label: '1,240.5 L' },
				{ key: 'fms', label: '1,220.0 L' }
			]
		},
		{
			key: 'me-stbd',
			engineName: 'ME STBD',
			values: [
				{ key: 'ems_internal', label: '1,180.0 L' },
				{ key: 'fms', label: '1,160.0 L' }
			]
		}
	];

	const robBunkerCards = [
		{ key: 'fod-port', label: 'FOD Port', valueLabel: '1,500.0 L', total: false },
		{ key: 'fod-stbd', label: 'FOD STBD', valueLabel: '1,450.0 L', total: false },
		{ key: 'total-fod', label: 'Total FOD', valueLabel: '2,950.0 L', total: true },
		{ key: 'bunker', label: 'Bunker', valueLabel: '8,200.0 L', total: false }
	];

	const highRpmRows = [
		{
			key: 'me-port',
			engineName: 'ME PORT',
			durationLabel: '1h 20m',
			fuelLabel: '210.0 L'
		},
		{
			key: 'me-stbd',
			engineName: 'ME STBD',
			durationLabel: '0h 55m',
			fuelLabel: '180.0 L'
		}
	];

	const { Story } = defineMeta({
		title: 'Pages/Vessel/PeriodicalReportPage',
		component: PeriodicalReportPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Laporan periodik vessel: rekap runtime, konsumsi fuel, jarak, kecepatan, dan data received pada rentang periode tertentu. Halaman memuat data dari API; section di bawah dirender dengan data dummy.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan laporan periodik.' }
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
					'Header laporan dengan filter Start, End, timezone, tombol Load Data dan Export Excel.'
			}
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh;">
		<PeriodicalHeader
			vesselName="MV Nusantara Jaya"
			startDateTime="2026-10-23T08:00"
			endDateTime="2026-10-23T17:00"
			timezoneMode="auto"
			timezoneOffset="+07:00"
			autoTimezoneLabel="UTC+07:00"
			onLoad={() => {}}
			onExport={() => {}}
			onFilterChange={() => {}}
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
					'Kartu data received dan ringkasan fuel per engine, bunker, total fuel, jarak, serta kecepatan.'
			}
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh;">
		<PeriodicalSummary
			dataReceivedLabel="1,332 of 1,440 (92.5%)"
			{engineFuelCards}
			bunkerFuelLabel="2,950.0 L"
			totalFuelLabel="2,420.5 L"
			totalDistanceLabel="184.320 NM"
			outsideSafetyZoneLabel="152.100 NM"
			averageSpeedLabel="9.80 knot"
			maxSpeedLabel="14.20 knot"
		/>
	</div>
</Story>

<Story
	name="Travel Distance"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Ringkasan jarak tempuh, jarak di luar safety zone, dan fuel per nautical mile.'
			}
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh;">
		<PeriodicalTravelDistance
			totalDistanceLabel="184.320 NM"
			outsideSafetyZoneLabel="152.100 NM"
			literPerNmCards={[
				{ key: 'ems', label: 'EMS', valueLabel: '13.13 L/NM' },
				{ key: 'fms', label: 'FMS', valueLabel: '12.91 L/NM' }
			]}
		/>
	</div>
</Story>

<Story
	name="Runtime Table"
	asChild
	parameters={{
		docs: {
			description: { story: 'Tabel running hour dan runtime hours per engine.' }
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh;">
		<PeriodicalRuntimeTable rows={runtimeRows} />
	</div>
</Story>

<Story
	name="RPM Table"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Matriks runtime dan fuel per RPM range dengan pemilih sumber data serta grand total.'
			}
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh;">
		<PeriodicalRpmTable tables={rpmTables} />
	</div>
</Story>

<Story
	name="Fuel Consumption"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Kartu FOD/bunker dan tabel konsumsi fuel per engine untuk setiap sumber data.'
			}
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh;">
		<PeriodicalFuelTable sources={fuelSources} rows={fuelRows} {robBunkerCards} hasRobBunkerData />
	</div>
</Story>

<Story
	name="High RPM Low Speed"
	asChild
	parameters={{
		docs: {
			description: { story: 'Tabel event high RPM low speed per engine beserta grand total.' }
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh;">
		<PeriodicalHighRpmTable
			rows={highRpmRows}
			total={{ durationLabel: '2h 15m', fuelLabel: '390.0 L' }}
		/>
	</div>
</Story>

<Story
	name="Speed Statistics"
	asChild
	parameters={{
		docs: {
			description: { story: 'Ringkasan kecepatan rata-rata dan maksimum.' }
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh;">
		<PeriodicalSpeedStats averageSpeedLabel="9.80 knot" maxSpeedLabel="14.20 knot" />
	</div>
</Story>

<Story
	name="Load Overlay"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Overlay yang tampil saat rentang tanggal belum dipilih atau data belum dimuat.'
			}
		}
	}}
>
	<div class="periodical-page" style="min-height: 100vh; position: relative;">
		<div class="load-required-area is-locked" style="min-height: 420px; position: relative;">
			<PeriodicalLoadOverlay />
		</div>
	</div>
</Story>
