<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DailyReportPage from './DailyReportPage.svelte';
	import DailyReportHeader from './DailyReportHeader.svelte';
	import DailyReportSummary from './DailyReportSummary.svelte';
	import DailyReportTrip from './DailyReportTrip.svelte';

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
					component:
						'Daily report: ringkasan operasi harian, trip summary, runtime engine, event status, fuel, dan statistik RPM.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data daily report.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />

<Story name="Header">
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

<Story name="Summary">
	<div class="daily-page" style="min-height: 100vh;">
		<DailyReportSummary cards={summaryCards} {speedCards} />
	</div>
</Story>

<Story name="Trip Summary">
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
