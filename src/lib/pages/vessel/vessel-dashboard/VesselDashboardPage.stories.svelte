<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VesselDashboardPage from './VesselDashboardPage.svelte';
	import VesselDashboardHeader from './VesselDashboardHeader.svelte';
	import VesselDashboardCctv from './VesselDashboardCctv.svelte';
	import VesselDashboardMap from './VesselDashboardMap.svelte';
	import VesselDashboardInfoPanel from './VesselDashboardInfoPanel.svelte';
	import VesselDashboardRpmPanel from './VesselDashboardRpmPanel.svelte';
	import VesselDashboardSummary from './VesselDashboardSummary.svelte';
	import VesselDashboardEnvironment from './VesselDashboardEnvironment.svelte';
	import VesselDashboardFuel from './VesselDashboardFuel.svelte';

	const cctvItems = [
		{
			key: 'bridge',
			name: 'Bridge',
			online: true,
			url: '',
			location: 'Bridge deck',
			status: 'online',
			capturedAtText: '23 Oct 2026 09:42',
			fileSizeText: '184 KB'
		},
		{
			key: 'engine-room',
			name: 'Engine Room',
			online: true,
			url: '',
			location: 'Engine room',
			status: 'online',
			capturedAtText: '23 Oct 2026 09:41',
			fileSizeText: '201 KB'
		},
		{
			key: 'stern',
			name: 'Stern',
			online: false,
			url: '',
			location: 'Stern deck',
			status: 'offline',
			capturedAtText: '',
			fileSizeText: ''
		}
	];

	const zones = [
		{ key: 'anchorage', name: 'Anchorage', color: '#2563eb', fillColor: 'rgba(37, 99, 235, 0.12)' },
		{
			key: 'restricted',
			name: 'Restricted',
			color: '#dc2626',
			fillColor: 'rgba(220, 38, 38, 0.12)'
		}
	];

	const vesselInfo = {
		vesselName: 'MV Nusantara Jaya',
		online: true,
		latitude: -6.104512,
		longitude: 106.886321,
		currentSpeed: '8.4 knot'
	};

	const infoCards = [
		{
			key: 'latitude',
			label: 'Latitude',
			coordinate: { value: '-6.104512', display: '-6.104512°' }
		},
		{
			key: 'longitude',
			label: 'Longitude',
			coordinate: { value: '106.886321', display: '106.886321°' }
		},
		{ key: 'vessel-time', label: 'Vessel Time', value: '23 Oct 2026 16:42' },
		{ key: 'local-time', label: 'Local Time', value: '23 Oct 2026 09:42' },
		{ key: 'current-speed', label: 'Current Speed', value: '8.4 knot', highlight: true },
		{ key: 'heading', label: 'Heading', value: '124.0°' },
		{ key: 'weather', label: 'Weather', value: '29.4°C · Partly cloudy' },
		{ key: 'data-received', label: 'Data Received', value: '1380/1440 min · 95.8%' },
		{ key: 'ocean-current', label: 'Ocean Current', value: '1.8 kph · 118°' }
	];

	const rpmCards = [
		{
			title: 'ME PORT RPM',
			status: 'online',
			lastData: '23 Oct 2026 09:42',
			value: 1450,
			avg: '1,320',
			top: '1,780'
		},
		{
			title: 'ME STBD RPM',
			status: 'online',
			lastData: '23 Oct 2026 09:42',
			value: 1420,
			avg: '1,290',
			top: '1,760'
		},
		{
			title: 'AE 1 RPM',
			status: 'offline',
			lastData: '23 Oct 2026 08:10',
			value: 0,
			avg: '-',
			top: '-'
		}
	];

	const summaryCards = [
		{ key: 'top-speed', label: 'Top Speed', value: '12.6 knot' },
		{ key: 'average-speed', label: 'Average Speed', value: '7.8 knot' },
		{ key: 'total-distance', label: 'Total Distance', value: '184.20 NM' }
	];

	const forecastDays = [
		{
			key: 'today',
			label: 'Today',
			weatherLabel: '29.4°C',
			weatherCondition: 'Partly cloudy',
			currentLabel: '1.8 kph',
			currentDirection: '118°'
		},
		{
			key: 'tomorrow',
			label: 'Tomorrow',
			weatherLabel: '26.1–31.0°C',
			weatherCondition: 'Light rain',
			currentLabel: '2.1 kph',
			currentDirection: '102°'
		},
		{
			key: 'day-after',
			label: 'Day After',
			weatherLabel: '25.8–30.4°C',
			weatherCondition: 'Cloudy',
			currentLabel: '1.6 kph',
			currentDirection: '96°'
		}
	];

	const weatherCards = [
		{ key: 'current', label: 'Current', value: '29.4°C', condition: 'Partly cloudy' },
		{ key: 'tomorrow', label: 'Tomorrow', value: '26.1–31.0°C', condition: 'Light rain' },
		{ key: 'day-after', label: 'Day After', value: '25.8–30.4°C', condition: 'Cloudy' }
	];

	const currentCards = [
		{ key: 'current', label: 'Today', value: '1.8 kph', direction: '118°' },
		{ key: 'tomorrow', label: 'Tomorrow', value: '2.1 kph', direction: '102°' },
		{ key: 'day-after', label: 'Day After', value: '1.6 kph', direction: '96°' }
	];

	const fuelSummary = {
		emsInternal: '1,240.5 L',
		emsExternal: '1,198.2 L',
		fms: '1,150.0 L',
		ecu: '1,132.7 L',
		latestRob: '18,420.0 L'
	};

	const { Story } = defineMeta({
		title: 'Pages/Vessel/VesselDashboardPage',
		component: VesselDashboardPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Dashboard vessel: ringkasan status kapal, snapshot CCTV, peta posisi, RPM engine, prakiraan cuaca/arus, dan konsumsi bahan bakar harian.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data dashboard.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />

<Story name="Header">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardHeader vesselName="MV Nusantara Jaya" />
	</div>
</Story>

<Story name="CCTV Monitoring">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardCctv
			items={cctvItems}
			main={cctvItems[0]}
			miniItems={cctvItems.slice(1)}
			loading={false}
			error=""
			onSelect={() => {}}
		/>
	</div>
</Story>

<Story name="CCTV Loading">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardCctv items={[]} main={null} miniItems={[]} loading={true} error="" />
	</div>
</Story>

<Story name="Map & Posisi">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardMap
			active={false}
			canViewMap={true}
			{vesselInfo}
			{zones}
			showWindParticles={true}
			showCurrentParticles={true}
		/>
	</div>
</Story>

<Story name="Vessel Info">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardInfoPanel vesselName="MV Nusantara Jaya" online={true} cards={infoCards} />
	</div>
</Story>

<Story name="RPM Overview">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardRpmPanel visible={true} cards={rpmCards} />
	</div>
</Story>

<Story name="Summary Kecepatan">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardSummary cards={summaryCards} />
	</div>
</Story>

<Story name="Environment Forecast">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardEnvironment {forecastDays} {weatherCards} {currentCards} />
	</div>
</Story>

<Story name="Fuel Summary">
	<div class="dashboard-content" style="min-height: 100vh;">
		<VesselDashboardFuel
			canViewFuel={true}
			hasVisibleFuelSource={true}
			canShowEmsInternal={true}
			canShowEmsExternal={true}
			canShowFms={true}
			canShowEcu={true}
			vmsLabel="VMS"
			{fuelSummary}
			canShowFodUsage={true}
			fodLabel="320.4 L"
			canShowRob={true}
		/>
	</div>
</Story>
