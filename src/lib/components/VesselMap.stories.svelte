<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VesselMap from './VesselMap.svelte';
	import 'leaflet/dist/leaflet.css';

	const { Story } = defineMeta({
		title: 'Map/VesselMap',
		component: VesselMap,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component: [
						'Peta Leaflet vessel dengan beberapa bagian:',
						'**Map tiles & controls** - tile dari server peta runtime, tombol zoom in/out, scale ganda kilometer (km) dan nautical mile (NM), serta switcher sumber peta (Map) dengan tombol pilihan sumber.',
						'**Vessel marker** - marker kapal berputar sesuai heading. Popup berisi nama vessel, status, kecepatan, heading, koordinat desimal + DMS yang bisa disalin, dan last updated.',
						'**Trace line** - jalur perjalanan dengan segmen berwarna sesuai kecepatan, marker start (S) dan finish (E), serta titik per posisi. Legenda kecepatan hanya tampil saat `showTraceLine` aktif.',
						'**Legend** - tombol Legend di kiri bawah untuk membuka/menutup legenda Speed, Assets (ikon per tipe aset), dan Zones (warna batas zona).',
						'**Assets & zones** - marker aset (boundary, anchor, buoy, FSO, jetty, mess, office, rig, whp) dengan tooltip/popup, poligon zona operasi, dan tombol fullscreen trace jika `onToggleFullscreen` diberikan.',
						'Data aset dan zona di Storybook memakai mock `/assets` sehingga legenda dan marker langsung tampil tanpa API produksi. Style map control mengikuti halaman asli lewat wrapper `.app-content`.'
					].join('\n\n')
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

<Story
	name="Default"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'**Marker & popup** - marker vessel di koordinat utama dengan popup info saat diklik (nama, status, kecepatan, heading, koordinat copyable, last updated).\n\n**Map controls** - zoom in/out, scale ganda km/NM, dan switcher sumber peta di kiri atas, sudah memakai style website.\n\n**Legend & assets** - tombol Legend membuka legenda Assets dan Zones; marker aset dan poligon zona dimuat dari mock `/assets`.'
			}
		}
	}}
>
	<div class="app-content" style="height: 520px; width: 100%;">
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

<Story
	name="With trace line"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'**Trace line** - jalur 4 titik dengan warna per kecepatan, marker start (S) dan finish (E), serta legenda Speed otomatis tampil. Peta mengikuti titik aktif karena `followActivePoint` aktif.\n\n**Map controls** - zoom, scale ganda km/NM, dan switcher sumber peta tampil dengan style website.'
			}
		}
	}}
>
	<div class="app-content" style="height: 520px; width: 100%;">
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

<Story
	name="Map controls"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'**Map controls** - peta di-zoom lebih dekat agar kontrol kiri atas terlihat jelas: tombol zoom in/out, scale ganda kilometer (km) dan nautical mile (NM) yang ikut berubah saat peta di-zoom, serta switcher sumber peta (Map) dengan thumb dan tombol sumber aktif. Style identik dengan halaman website karena memakai rule `body .app-content .vms-map-controls`.'
			}
		}
	}}
>
	<div class="app-content" style="height: 520px; width: 100%;">
		<VesselMap
			latitude={-6.2088}
			longitude={106.8456}
			heading={45}
			vesselName="MV Nusantara"
			speed="12.4 kn"
			lastUpdate="22 Oct 2026 10:30"
			zoom={15}
		/>
	</div>
</Story>
