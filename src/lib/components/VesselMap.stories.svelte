<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VesselMap from './VesselMap.svelte';
	import 'leaflet/dist/leaflet.css';

	const { Story } = defineMeta({
		title: 'Map/VesselMap',
		component: VesselMap,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Peta Leaflet vessel dengan marker, trace line, dan legenda. Tile peta diambil dari server peta yang dikonfigurasi runtime.'
				}
			}
		},
		args: {
			latitude: -6.2088,
			longitude: 106.8456,
			heading: 45,
			vesselName: 'MV Nusantara',
			speed: '12.4 kn',
			lastUpdate: '22 Oct 2026 10:30',
			zoom: 12,
			showTraceLine: false,
			followActivePoint: false
		},
		argTypes: {
			latitude: { control: 'number' },
			longitude: { control: 'number' },
			heading: { control: { type: 'range', min: 0, max: 360 } },
			vesselName: { control: 'text' },
			speed: { control: 'text' },
			lastUpdate: { control: 'text' },
			iconUrl: { control: 'text' },
			zoom: { control: { type: 'number', min: 1, max: 19 } },
			tracePoints: { control: 'object' },
			activeIndex: { control: 'number' },
			showTraceLine: { control: 'boolean' },
			followActivePoint: { control: 'boolean' }
		}
	});

	const tracePoints = [
		{ latitude: -6.24, longitude: 106.81, speed: 8 },
		{ latitude: -6.23, longitude: 106.82, speed: 10 },
		{ latitude: -6.22, longitude: 106.83, speed: 11 },
		{ latitude: -6.21, longitude: 106.84, speed: 12.4 }
	];
</script>

<Story name="Default" asChild>
	<div style="height: 520px; width: 100%;">
		<VesselMap
			latitude={-6.2088}
			longitude={106.8456}
			heading={45}
			vesselName="MV Nusantara"
			speed="12.4 kn"
			lastUpdate="22 Oct 2026 10:30"
			zoom={12}
		/>
	</div>
</Story>

<Story name="With trace line" asChild>
	<div style="height: 520px; width: 100%;">
		<VesselMap
			latitude={-6.21}
			longitude={106.84}
			heading={45}
			vesselName="MV Nusantara"
			speed="12.4 kn"
			lastUpdate="22 Oct 2026 10:30"
			zoom={12}
			{tracePoints}
			activeIndex={tracePoints.length - 1}
			showTraceLine={true}
			followActivePoint={true}
		/>
	</div>
</Story>
