<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DailyReportPage from './DailyReportPage.svelte';
	import DailyReportHeader from './DailyReportHeader.svelte';
	import DailyReportSummary from './DailyReportSummary.svelte';
	import DailyReportTrip from './DailyReportTrip.svelte';
	import DailyReportRuntime from './DailyReportRuntime.svelte';
	import DailyReportStatusHistory from './DailyReportStatusHistory.svelte';
	import DailyReportActivityTimeline from './DailyReportActivityTimeline.svelte';
	import DailyReportFuelTable from './DailyReportFuelTable.svelte';
	import DailyReportHourlySpeed from './DailyReportHourlySpeed.svelte';
	import DailyReportRpmStats from './DailyReportRpmStats.svelte';
	import DailyReportRpmRanges from './DailyReportRpmRanges.svelte';
	import DailyReportRpmFuelCurve from './DailyReportRpmFuelCurve.svelte';
	import DailyReportFodChart from './DailyReportFodChart.svelte';
	import DailyReportHighRpmOutside from './DailyReportHighRpmOutside.svelte';
	import DailyReportRpmLowSpeed from './DailyReportRpmLowSpeed.svelte';

	const sampleFuelLabel = (sourceKey) =>
		({
			ecu: 'ECU',
			fms: 'FMS',
			ems_internal: 'VMS',
			ems_external: 'EMS',
			engine_maker: 'Engine Maker'
		})[sourceKey] || sourceKey;

	const runtimeRows = [
		{ engine_name: 'Main Engine 1', runtime_formatted: '18.50 h', runtime_hours: 18.5 },
		{ engine_name: 'Main Engine 2', runtime_formatted: '17.20 h', runtime_hours: 17.2 },
		{ engine_name: 'Auxiliary Engine 1', runtime_formatted: '12.00 h', runtime_hours: 12 }
	];

	const statusHistoryGroups = [
		{
			engineName: 'Main Engine 1',
			rows: [
				{ start: '06:12', end: '12:40', duration: '6h 28m', status: 'ON' },
				{ start: '12:40', end: '14:10', duration: '1h 30m', status: 'OFF' },
				{ start: '14:10', end: '18:40', duration: '4h 30m', status: 'ON' }
			]
		},
		{
			engineName: 'Main Engine 2',
			rows: [
				{ start: '06:12', end: '11:05', duration: '4h 53m', status: 'ON' },
				{ start: '11:05', end: '18:40', duration: '7h 35m', status: 'OFF' }
			]
		}
	];

	const timelineGroups = [
		{
			engineName: 'Main Engine 1',
			totalSeconds: 39600,
			transitionLabels: [
				{ leftPercent: 0, time: '06:12', status: 'ON' },
				{ leftPercent: 60, time: '12:40', status: 'OFF' },
				{ leftPercent: 72, time: '14:10', status: 'ON' }
			],
			segments: [
				{ widthPercent: 60, status: 'ON', start: '06:12', end: '12:40', duration: '6h 28m' },
				{ widthPercent: 12, status: 'OFF', start: '12:40', end: '14:10', duration: '1h 30m' },
				{ widthPercent: 28, status: 'ON', start: '14:10', end: '18:40', duration: '4h 30m' }
			]
		},
		{
			engineName: 'Main Engine 2',
			totalSeconds: 27000,
			transitionLabels: [
				{ leftPercent: 0, time: '06:12', status: 'ON' },
				{ leftPercent: 35, time: '11:05', status: 'OFF' }
			],
			segments: [
				{ widthPercent: 35, status: 'ON', start: '06:12', end: '11:05', duration: '4h 53m' },
				{ widthPercent: 65, status: 'OFF', start: '11:05', end: '18:40', duration: '7h 35m' }
			]
		}
	];

	const clutchGroups = [
		{
			engineName: 'Main Engine 1',
			transitionLabels: [
				{ leftPercent: 0, time: '06:12', status: 'ON' },
				{ leftPercent: 60, time: '12:40', status: 'OFF' }
			],
			segments: [
				{ widthPercent: 60, status: 'ON', start: '06:12', end: '12:40', duration: '6h 28m' },
				{ widthPercent: 55, status: 'OFF', start: '12:40', end: '18:40', duration: '6h 00m' }
			]
		}
	];

	const fuelRows = [
		{
			engine_name: 'Main Engine 1',
			is_main: true,
			ecu: 2057.5,
			fms: 2040.2,
			ems_internal: 2032.8,
			ems_external: 2045.1,
			engine_maker: 2060.4
		},
		{
			engine_name: 'Auxiliary Engine 1',
			is_main: false,
			ecu: 620.5,
			fms: 615.8,
			ems_internal: 612.4,
			ems_external: 618.2,
			engine_maker: 622.7
		}
	];

	const fuelSummary = {
		ecu: 2678,
		fms: 2656,
		ems_internal: 2645.2,
		ems_external: 2663.3,
		engine_maker: 2683.1
	};

	const hourlySpeedTables = [
		[
			{ hour: '00:00 - 01:00', averageSpeed: 8.1 },
			{ hour: '01:00 - 02:00', averageSpeed: 8.4 },
			{ hour: '02:00 - 03:00', averageSpeed: null }
		],
		[
			{ hour: '12:00 - 13:00', averageSpeed: 9.2 },
			{ hour: '13:00 - 14:00', averageSpeed: 8.8 },
			{ hour: '14:00 - 15:00', averageSpeed: 8.6 }
		]
	];

	const rpmStatsRows = [
		{ engine_name: 'Main Engine 1', top_rpm: 1420, avg_rpm: 1180.5 },
		{ engine_name: 'Main Engine 2', top_rpm: 1395, avg_rpm: 1150.2 },
		{ engine_name: 'Auxiliary Engine 1', top_rpm: 1500, avg_rpm: 1480.7 }
	];

	const rpmMatrixMetrics = [
		{ key: 'runtime', label: 'Runtime' },
		{ key: 'lh', label: 'L/H' }
	];

	const rpmCurveTable = {
		key: 'ems_internal',
		label: 'VMS',
		sourceKeys: ['ems_internal'],
		rowKeys: [],
		grandTotal: { runtime_seconds: 36000, fuel_ems_internal: 1500 }
	};

	const rpmMatrices = [
		{
			key: 'main',
			label: 'Main Engine',
			engines: [
				{ key: 'me1', label: 'ME 1', engineName: 'Main Engine 1', rows: [] },
				{ key: 'me2', label: 'ME 2', engineName: 'Main Engine 2', rows: [] }
			],
			rows: [
				{
					key: 'rpm-0-200',
					label: '0 – 200',
					cells: [{}, {}],
					isTotal: false
				},
				{
					key: 'rpm-600-800',
					label: '600 – 800',
					cells: [{}, {}],
					isTotal: false
				},
				{ key: 'rpm-total', label: 'Total', cells: [{}, {}], isTotal: true }
			]
		}
	];

	const rpmCurveGroups = [
		{
			engineName: 'Main Engine 1',
			hasSpeed: true,
			hasEcu: true,
			hasFms: true,
			hasInternal: true,
			hasExternal: true,
			hasEngineMaker: true
		},
		{
			engineName: 'Main Engine 2',
			hasSpeed: true,
			hasEcu: true,
			hasFms: true,
			hasInternal: true,
			hasExternal: false,
			hasEngineMaker: true
		}
	];

	const fodGroup = {
		points: 24,
		hasSingle: false,
		hasPort: true,
		hasStbd: true
	};

	const highRpmOutsideGroups = [
		{
			rule: '15% Threshold',
			rows: [
				{
					engine: 'Main Engine 1',
					duration: '1h 12m',
					percentageRh: 6.5,
					avgSpeed: 10.4,
					highestSpeed: 12.6,
					lowestSpeed: 8.1
				}
			]
		},
		{
			rule: '20% Threshold',
			rows: [
				{
					engine: 'Main Engine 2',
					duration: '0h 48m',
					percentageRh: 4.3,
					avgSpeed: 10.1,
					highestSpeed: 11.9,
					lowestSpeed: 8.4
				}
			]
		}
	];

	const highRpmLowSpeedGroups = [
		{
			engineName: 'Main Engine 1',
			totalFuel: 320.5,
			rows: [
				{
					startTime: '07:10:00',
					endTime: '07:52:00',
					duration: '42m',
					fuelUsedL: 180.2,
					isLongDuration: true
				},
				{
					startTime: '15:05:00',
					endTime: '15:20:00',
					duration: '15m',
					fuelUsedL: 140.3,
					isLongDuration: false
				}
			]
		}
	];

	const highRpmLowSpeedTotals = [{ engineName: 'Main Engine 1', fuelUsedL: 320.5 }];

	const sampleRpmFormatters = {
		getRpmCurveTableLabel: (table) => table?.label || '-',
		getRpmSourceLabel: (sourceKey) => sampleFuelLabel(sourceKey),
		formatRpmRangeLabel: (label) => label || '-',
		formatRpmMatrixCell: (_cell, metric) => (metric?.key === 'runtime' ? '10h 00m' : '125.00 L')
	};

	const summaryCards = [
		{ key: 'operation-hours', label: 'Total Operation Hours', value: '18.5 h' },
		{ key: 'top-speed', label: 'Top Speed', value: '12.60 knot' },
		{ key: 'average-speed', label: 'Average Speed', value: '8.20 knot' },
		{ key: 'ecu-nm', label: 'ECU Fuel per NM', value: '2.30 L/NM' },
		{ key: 'fms-nm', label: 'FMS Fuel per NM', value: '2.28 L/NM' },
		{ key: 'ems-internal-nm', label: 'VMS Fuel per NM', value: '2.25 L/NM' },
		{ key: 'ems-external-nm', label: 'EMS Fuel per NM', value: '2.26 L/NM' },
		{ key: 'engine-maker-nm', label: 'Engine Maker Fuel per NM', value: '2.31 L/NM' }
	];

	const speedCards = [
		{ key: 'total-distance', label: 'Total Distance', value: '184.200 NM' },
		{ key: 'outside-zone', label: 'Outside Safety Zone', value: '4.750 NM' }
	];

	const tripSummary = {
		totalPoints: 420,
		startTime: '23 Oct 2026 06:12',
		endTime: '23 Oct 2026 18:40',
		totalDistanceLabel: '184.200',
		outsideDistanceLabel: '4.750',
		outsidePoints: 12
	};

	const legendTypes = [
		{ label: 'Buoy', icon: '/assets/asset-icons/buoy.png' },
		{ label: 'Platform', icon: '/assets/asset-icons/platform.png' }
	];

	const zones = [
		{ name: 'Anchorage', color: '#2563eb', fillColor: 'rgba(37, 99, 235, 0.12)' },
		{ name: 'Restricted', color: '#dc2626', fillColor: 'rgba(220, 38, 38, 0.12)' }
	];

	const { Story } = defineMeta({
		title: 'Pages/Vessel/DailyReportPage',
		component: DailyReportPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component: `Daily report operasi kapal per tanggal: ringkasan, trip, runtime engine, event status, fuel, dan statistik RPM.

**Section:**

- **Header & Filter** — pilih tanggal dan mode timezone, lalu tombol **Load Data** memuat laporan. **Export Excel** / **Export PDF** mengunduh laporan.
- **Summary Cards** — Total Operation Hours, Top Speed, Average Speed, Fuel per NM (ECU/FMS/VMS/EMS/Engine Maker), Total Distance, dan Outside Safety Zone.
- **Trip Summary** — peta rute harian, titik start/end, jumlah titik di luar safety zone, total jarak, dan fuel per nautical mile.
- **Engine Running Hour** — total jam operasi per engine.
- **Engine Event Status History** — periode ON/OFF per engine beserta durasinya.
- **Engine Activity Timeline** — timeline status engine dan clutch-in dalam bentuk bar.
- **Fuel Consumption** — konsumsi per engine untuk setiap sumber fuel (ECU, FMS, VMS, EMS, Engine Maker) beserta grand total.
- **Hourly Average Speed** — kecepatan rata-rata per jam dalam dua tabel (00–11 dan 12–23).
- **Engine RPM Statistics** — nilai top RPM dan average RPM per engine.
- **RPM Range Runtime & Fuel** — runtime dan konsumsi bahan bakar per rentang RPM untuk sumber VMS, EMS, Engine Maker, dan FMS/ECU.
- **RPM vs Fuel Curve** — grafik hubungan RPM terhadap konsumsi fuel per engine.
- **FOD Fuel Chart** — utilisasi Fuel Oil Day Tank (port/starboard) beserta ringkasan FOD Usage.
- **High RPM Outside Safety Zone** — durasi RPM tinggi di luar safety zone (ambang 15% dan 20% RPM tertinggi).
- **High RPM Low Speed** — durasi RPM tinggi dengan kecepatan rendah beserta fuel yang terpakai.`
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data daily report.' },
			autoLoad: {
				control: 'boolean',
				description: 'Memuat data daily report otomatis saat komponen dipasang.'
			}
		}
	});
</script>

<Story
	name="Aktif"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Komponen aktif dengan data dummy: report otomatis dimuat saat mount sehingga semua section terisi (summary, trip, runtime, status, timeline, fuel, speed, RPM, dan high RPM).'
			}
		}
	}}
>
	<div class="app-content" style="height: 100vh; min-height: 100vh;">
		<DailyReportPage active={true} autoLoad={true} />
	</div>
</Story>

<Story
	name="Nonaktif"
	args={{ active: false }}
	parameters={{
		docs: {
			description: {
				story:
					'Kondisi awal sebelum data dimuat: area report terkunci overlay "Choose a date first" sampai tombol Load Data ditekan.'
			}
		}
	}}
/>

<Story
	name="Header"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Header dan filter daily report: input tanggal, mode timezone (Auto/Manual), tombol Load Data, serta Export Excel dan Export PDF.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportHeader
			vesselName="MV Nusantara Jaya"
			reportDate="2026-10-23"
			timezoneMode="auto"
			timezoneOffset="+07:00"
			autoTimezoneLabel="UTC+07:00"
			loading={false}
			exporting={false}
			exportingPdf={false}
			canExport={true}
			onLoad={() => {}}
			onExportExcel={() => {}}
			onExportPdf={() => {}}
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
					'Summary cards: Total Operation Hours, Top Speed, Average Speed, Fuel per NM per sumber, Total Distance, dan Outside Safety Zone.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportSummary cards={summaryCards} {speedCards} />
	</div>
</Story>

<Story
	name="Trip Summary"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Trip summary: rute harian di peta, koordinat start/end, total jarak, jarak di luar safety zone, jumlah point, dan fuel per nautical mile.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportTrip
			summary={tripSummary}
			startCoordinate="-6.104512, 106.886321"
			endCoordinate="-6.098100, 106.879000"
			literPerNauticalMile="2.25"
			fuelSourceLabel="VMS"
			canViewFuelPerNm={true}
			canViewMap={false}
			active={false}
			mapPoints={[]}
			mapZones={zones}
			mapAssets={[]}
			{legendTypes}
		/>
	</div>
</Story>

<Story
	name="Engine Running Hour"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Engine Running Hour: total jam operasi per engine dalam bentuk tabel.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportRuntime rows={runtimeRows} />
	</div>
</Story>

<Story
	name="Engine Event Status History"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Engine Event Status History: kartu per engine berisi periode ON/OFF, waktu mulai/selesai, dan durasi.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportStatusHistory groups={statusHistoryGroups} />
	</div>
</Story>

<Story
	name="Engine Activity Timeline"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Engine Activity Timeline: bar status ON/OFF per engine beserta label transisi waktu dan total durasi.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportActivityTimeline
			statusGroups={timelineGroups}
			{clutchGroups}
			canViewClutchInChart={true}
		/>
	</div>
</Story>

<Story
	name="Fuel Consumption"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Fuel Consumption: konsumsi per engine untuk setiap sumber fuel (ECU, FMS, VMS, EMS, Engine Maker), ringkasan FOD, dan grand total.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportFuelTable
			rows={fuelRows}
			summary={fuelSummary}
			canViewFuelFod={true}
			hasFodUsage={true}
			fodPortValue={210.5}
			fodStbdValue={198.4}
			fodTotalValue={408.9}
			canShowFuelEcu={true}
			canShowFuelFms={true}
			canShowFuelEmsInternal={true}
			canShowFuelEmsExternal={true}
			canShowFuelEngineMaker={true}
			getFuelSourceLabel={sampleFuelLabel}
		/>
	</div>
</Story>

<Story
	name="Hourly Average Speed"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Hourly Average Speed: dua tabel kecepatan rata-rata per jam (00–11 dan 12–23) ditampilkan berdampingan; nilai kosong tampil sebagai "-".'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportHourlySpeed tables={hourlySpeedTables} timezone="UTC+07:00" />
	</div>
</Story>

<Story
	name="Engine RPM Statistics"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Engine RPM Statistics: nilai top RPM dan average RPM per engine.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportRpmStats rows={rpmStatsRows} />
	</div>
</Story>

<Story
	name="RPM Range Runtime & Fuel"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'RPM Range Runtime & Fuel: pilih sumber tabel (VMS/EMS/Engine Maker/FMS) lalu bandingkan runtime dan fuel per rentang RPM antar engine.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportRpmRanges
			selectedRpmCurveTable={rpmCurveTable}
			selectedRpmMatrices={rpmMatrices}
			visibleRpmCurveTables={[
				{ key: 'ems_internal', label: 'VMS' },
				{ key: 'ems_external', label: 'EMS' }
			]}
			{rpmMatrixMetrics}
			selectedRpmRuntimeFuelTableKey="ems_internal"
			{...sampleRpmFormatters}
		/>
	</div>
</Story>

<Story
	name="RPM vs Fuel Curve"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'RPM vs Fuel Curve: kartu grafik per engine dengan badge sumber fuel yang tersedia. Pada halaman penuh grafik mendukung zoom dan pan.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportRpmFuelCurve
			groups={rpmCurveGroups}
			canViewFuelEcu={true}
			canViewFuelFms={true}
			canViewFuelEmsInternal={true}
			canViewFuelEmsExternal={true}
			canViewFuelEngineMaker={true}
			chartAction={() => {}}
			getFuelSourceLabel={sampleFuelLabel}
		/>
	</div>
</Story>

<Story
	name="FOD Fuel Chart"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'FOD Fuel Chart: kartu grafik utilisasi Fuel Oil Day Tank (port/starboard atau single tank).'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportFodChart group={fodGroup} chartAction={() => {}} />
	</div>
</Story>

<Story
	name="High RPM Outside Safety Zone"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'High RPM Outside Safety Zone: durasi RPM tinggi di luar safety zone untuk ambang 15% dan 20% RPM tertinggi.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportHighRpmOutside
			rows={highRpmOutsideGroups.flatMap((group) => group.rows)}
			groups={highRpmOutsideGroups}
		/>
	</div>
</Story>

<Story
	name="High RPM Low Speed"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'High RPM Low Speed: durasi RPM tinggi pada kecepatan rendah per engine, baris merah untuk durasi di atas 30 menit, beserta total fuel dan grand total.'
			}
		}
	}}
>
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportRpmLowSpeed
			groups={highRpmLowSpeedGroups}
			totals={highRpmLowSpeedTotals}
			grandTotal={320.5}
		/>
	</div>
</Story>
