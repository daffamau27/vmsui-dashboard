<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FleetViewPage from './FleetViewPage.svelte';
	import FleetViewSidebar from './FleetViewSidebar.svelte';
	import FleetViewDetailPanel from './FleetViewDetailPanel.svelte';
	import FleetViewMapLegend from './FleetViewMapLegend.svelte';
	import { createFleetPopupHtml } from './fleetViewPopup.js';
	import 'leaflet/dist/leaflet.css';
	import {
		fleetAssetsMock,
		fleetVesselsMock
	} from '../../../../../.storybook/dummy-data/fleetViewMock.js';
	import { vesselDashboardCctvLatestMock } from '../../../../../.storybook/dummy-data/vesselDashboardMock.js';
	import { getAssetIconUrl, getAssetTypeLabel, getAssetTypeValue } from '$lib/utils/assetIcons.js';
	import { normalizeMapZonesFromAssets } from '$lib/utils/mapZones.js';

	const normalizedVessels = fleetVesselsMock.map((vessel) => ({
		...vessel,
		id: vessel.vesselId,
		name: vessel.vesselName,
		liveEngines: vessel.engines
	}));
	const sidebarOnlineCount = normalizedVessels.filter((vessel) => vessel.online).length;
	const sidebarOfflineCount = normalizedVessels.length - sidebarOnlineCount;
	const detailCctvSnapshots = vesselDashboardCctvLatestMock.data;
	const legendAssetItems = Array.from(
		new Map(
			fleetAssetsMock
				.filter((asset) => String(getAssetTypeValue(asset)).toLowerCase() !== 'zone')
				.map((asset) => {
					const key = String(getAssetTypeValue(asset)).toLowerCase();
					return [key, { key, label: getAssetTypeLabel(asset), iconUrl: getAssetIconUrl(asset) }];
				})
		).values()
	).sort((left, right) => left.label.localeCompare(right.label));
	const legendZoneData = normalizeMapZonesFromAssets(fleetAssetsMock);

	const { Story } = defineMeta({
		title: 'Pages/App/FleetViewPage',
		component: FleetViewPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Fleet view: peta armada, ringkasan status vessel, dan panel dashboard. Data dummy Storybook sudah mencakup 6 vessel, aset, zona, dan snapshot CCTV sehingga halaman tampil penuh tanpa memanggil API produksi.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data dan peta.' }
		}
	});
</script>

<Story
	name="Aktif"
	asChild
	parameters={{
		docs: {
			description: {
				story: [
					'**Sidebar header** — pencarian nama vessel/perusahaan, filter status (All/Online/Offline), serta hitungan total, online, dan offline. Data diambil dari `/fleet/vessels` (mock 6 vessel).',
					'**Vessel list** — kartu per vessel: status dot online/offline, nama, "Last Updated" relatif, badge zona waktu telemetri (UTC), indikator ketersediaan koordinat, dan badge hire (On Hire/Off Hire). Klik kartu memilih vessel dan membuka popup di peta.',
					'**Peta armada** — Leaflet dengan tile Esri. Marker vessel berputar sesuai heading (online/offline/selected), marker aset per tipe (buoy, whp, fso, jetty, rig, anchor, mess, office), boundary 1 km di sekitar aset, dan poligon zona operasi.',
					'**Popup vessel** — ringkasan saat marker diklik: kecepatan, heading, koordinat desimal + DMS yang bisa disalin, last updated, serta tombol "View detail" dan "Dashboard".',
					'**Detail panel** — panel samping berisi CCTV snapshot terbaru (dapat berganti kamera lewat thumbnail), Operational snapshot (speed, heading, last updated, last connect/disconnect, koordinat), Voyage progress, Engine RPM per mesin, serta Weather & ocean current.',
					'**Map legend** — legenda status vessel, boundary, daftar tipe aset yang bisa di-toggle, daftar zona, dan tombol Wind/Current particle. Panel dapat diciutkan.',
					'**Kontrol peta** — toggle sidebar, tombol fullscreen, dan alat ukur jarak (measure) di peta.'
				].join('\n\n')
			}
		}
	}}
>
	<div class="app-content" style="height: 100vh; min-height: 100vh;">
		<FleetViewPage active={true} />
	</div>
</Story>

<Story
	name="Sidebar & Vessel List"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'**Sidebar header** — judul, hitungan total/online/offline, filter status, dan pencarian vessel (nama atau perusahaan).\n\n**Vessel list** — kartu vessel dari mock `fleetVesselsMock` (6 vessel): status dot, nama, last updated relatif, badge zona waktu, indikator koordinat, dan badge hire. Klik kartu memilih vessel.'
			}
		}
	}}
>
	<div class="fleet-page" style="height: 100vh; min-height: 100vh;">
		<FleetViewSidebar
			vessels={normalizedVessels}
			onlineCount={sidebarOnlineCount}
			offlineCount={sidebarOfflineCount}
			totalCount={normalizedVessels.length}
			open={true}
			search=""
			statusFilter="all"
			onSelect={() => {}}
			onCloseMobile={() => {}}
		/>
	</div>
</Story>

<Story
	name="Popup Vessel"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'**Popup vessel** — ringkasan saat marker kapal diklik: status online, kecepatan, heading, koordinat desimal dan DMS yang dapat disalin, last updated, serta tombol "View detail" dan "Dashboard". Markup dihasilkan oleh `createFleetPopupHtml()` dan dipasang Leaflet sebagai popup.'
			}
		}
	}}
>
	<div
		class="fleet-page"
		style="height: 100vh; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 40%, #1e293b, #0f172a);"
	>
		<div class="leaflet-popup fleet-leaflet-popup" style="position: relative; margin: 0;">
			<div class="leaflet-popup-content-wrapper">
				<div class="leaflet-popup-content">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html createFleetPopupHtml(normalizedVessels[0])}
				</div>
			</div>
		</div>
	</div>
</Story>

<Story
	name="Detail Panel"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'**Detail panel** — panel samping vessel terpilih: CCTV snapshot (main + thumbnail), Operational snapshot (speed, heading, last updated, last connect/disconnect, koordinat copyable), Voyage progress, Engine RPM, serta Weather & ocean current. Data memakai `fleetVesselsMock` dan `vesselDashboardCctvLatestMock`.'
			}
		}
	}}
>
	<div
		class="fleet-page"
		style="height: 100vh; min-height: 100vh; background: radial-gradient(circle at 60% 30%, #1e293b, #0f172a);"
	>
		<aside
			class="vessel-detail-panel"
			style="position: absolute; right: 24px; top: 24px; bottom: 24px; max-height: none;"
		>
			<FleetViewDetailPanel
				vessel={normalizedVessels[0]}
				cctvSnapshots={detailCctvSnapshots}
				onClose={() => {}}
				onDashboard={() => {}}
			/>
		</aside>
	</div>
</Story>

<Story
	name="Map Legend"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'**Map legend** — legenda status vessel, boundary 1 km, daftar tipe aset yang dapat di-toggle, daftar zona operasi, serta tombol Wind/Current particle. Tombol "−" di header menciutkan panel.'
			}
		}
	}}
>
	<div
		class="fleet-page"
		style="height: 100vh; min-height: 100vh; background: radial-gradient(circle at 40% 60%, #1e293b, #0f172a);"
	>
		<FleetViewMapLegend
			open={true}
			assetLegendItems={legendAssetItems}
			zoneData={legendZoneData}
			showWind={true}
			showCurrent={false}
		/>
	</div>
</Story>

<Story name="Nonaktif" args={{ active: false }} />
