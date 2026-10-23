<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VoyagePlanPage from './VoyagePlanPage.svelte';
	import VoyagePlanHeader from './VoyagePlanHeader.svelte';
	import VoyagePlanSummary from './VoyagePlanSummary.svelte';
	import VoyagePlanMapPanel from './VoyagePlanMapPanel.svelte';
	import VoyagePlanDetailPanel from './VoyagePlanDetailPanel.svelte';
	import VoyagePlanRouteTable from './VoyagePlanRouteTable.svelte';
	import VoyagePlanHistoryTable from './VoyagePlanHistoryTable.svelte';

	const zones = [
		{ key: 'zone-port', name: 'Port Area', color: '#2563eb', fillColor: 'rgba(37, 99, 235, 0.12)' },
		{
			key: 'zone-anchorage',
			name: 'Anchorage',
			color: '#d97706',
			fillColor: 'rgba(217, 119, 6, 0.12)'
		}
	];

	const detailRows = [
		{ key: 'assignment-id', label: 'Assignment ID', value: '#284' },
		{ key: 'voyage-plan-id', label: 'Voyage Plan ID', value: '#57' },
		{ key: 'start-date', label: 'Start Date', value: '23 Oct 2026, 08:00' },
		{ key: 'end-date', label: 'End Date', value: '24 Oct 2026, 08:00' },
		{ key: 'assigned-at', label: 'Assigned At', value: '22 Oct 2026, 16:35' },
		{ key: 'assigned-by', label: 'Assigned By', value: 'Capt. Arief Wibowo' },
		{ key: 'progress', label: 'Progress', value: '62.50%' },
		{ key: 'checkpoints', label: 'Checkpoints', value: '5 completed · 0 skipped · 3 pending' }
	];

	const routeRows = [
		{
			key: 1,
			order: 1,
			statusLabel: 'Completed',
			statusClass: 'completed',
			latitude: '-6.10234',
			longitude: '106.88112',
			speedLabel: '8 kn',
			averageSpeedLabel: '7.84 kn',
			reachedAtLabel: '23 Oct 2026, 08:12',
			actionable: false
		},
		{
			key: 2,
			order: 2,
			statusLabel: 'Completed',
			statusClass: 'completed',
			latitude: '-6.04127',
			longitude: '106.90254',
			speedLabel: '9 kn',
			averageSpeedLabel: '8.75 kn',
			reachedAtLabel: '23 Oct 2026, 09:40',
			actionable: false
		},
		{
			key: 3,
			order: 3,
			statusLabel: 'Manual Completion',
			statusClass: 'manual',
			latitude: '-5.98871',
			longitude: '106.94502',
			speedLabel: '10 kn',
			averageSpeedLabel: '9.51 kn',
			reachedAtLabel: '23 Oct 2026, 11:05',
			actionable: false
		},
		{
			key: 4,
			order: 4,
			statusLabel: 'Pending',
			statusClass: 'pending',
			latitude: '-5.93102',
			longitude: '107.01244',
			speedLabel: '9 kn',
			averageSpeedLabel: '-',
			reachedAtLabel: null,
			actionable: true
		},
		{
			key: 5,
			order: 5,
			statusLabel: 'Skipped',
			statusClass: 'skipped',
			latitude: '-5.87450',
			longitude: '107.08812',
			speedLabel: '7 kn',
			averageSpeedLabel: '-',
			reachedAtLabel: null,
			actionable: true
		}
	];

	const historyRows = [
		{
			key: 284,
			id: 284,
			voyagePlanId: 57,
			startDateLabel: '23 Oct 2026, 08:00',
			endDateLabel: '24 Oct 2026, 08:00',
			assignedAtLabel: '22 Oct 2026, 16:35',
			userLabel: 'Capt. Arief Wibowo'
		},
		{
			key: 271,
			id: 271,
			voyagePlanId: 51,
			startDateLabel: '18 Oct 2026, 06:00',
			endDateLabel: '19 Oct 2026, 06:00',
			assignedAtLabel: '17 Oct 2026, 14:10',
			userLabel: 'Capt. Dewi Lestari'
		},
		{
			key: 263,
			id: 263,
			voyagePlanId: 49,
			startDateLabel: '12 Oct 2026, 07:30',
			endDateLabel: '13 Oct 2026, 07:30',
			assignedAtLabel: '11 Oct 2026, 19:55',
			userLabel: 'Capt. Rudi Hartono'
		}
	];

	const historyPagination = {
		totalItems: 18,
		page: 1,
		totalPages: 6,
		hasPrevious: false,
		hasNext: true
	};

	const { Story } = defineMeta({
		title: 'Pages/Vessel/VoyagePlanPage',
		component: VoyagePlanPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Voyage plan vessel: peta rute, detail assignment, checkpoint, dan riwayat voyage. Halaman memuat data dari API; section di bawah dirender dengan data dummy.'
				}
			}
		},
		argTypes: {
			vesselId: { control: 'text', description: 'ID vessel yang dipantau.' },
			active: { control: 'boolean', description: 'Mengaktifkan peta dan pemuatan data voyage.' }
		}
	});
</script>

<Story name="Default" args={{ active: false }} />

<Story
	name="Header"
	asChild
	parameters={{
		docs: {
			description: { story: 'Header vessel dengan judul halaman dan tombol Refresh Data.' }
		}
	}}
>
	<div class="voyage-vessel-page" style="min-height: 100vh;">
		<VoyagePlanHeader vesselName="MV Nusantara Jaya" onRefresh={() => {}} />
	</div>
</Story>

<Story
	name="Summary"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Ringkasan status voyage, jumlah route point, progress, jarak, dan kecepatan rata-rata.'
			}
		}
	}}
>
	<div class="voyage-vessel-page" style="min-height: 100vh;">
		<VoyagePlanSummary
			statusLabel="On Voyage"
			routePointCount={8}
			progress={62.5}
			progressLabel="62.50%"
			distanceLabel="184.32 NM"
			averageSpeedLabel="8.64 kn"
		/>
	</div>
</Story>

<Story
	name="Map Panel"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Peta rute Leaflet beserta legenda status checkpoint, tipe asset, dan zona.'
			}
		}
	}}
>
	<div class="voyage-vessel-page" style="min-height: 100vh;">
		<VoyagePlanMapPanel
			planName="Jakarta - Panjang"
			routePointCount={8}
			assetsCount={12}
			activeAssignment
			{zones}
			onFit={() => {}}
			onShowActivePlan={() => {}}
		/>
	</div>
</Story>

<Story
	name="Assignment Detail"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Detail assignment aktif beserta ringkasan checkpoint dan aksi cancel/end voyage.'
			}
		}
	}}
>
	<div class="voyage-vessel-page" style="min-height: 100vh;">
		<VoyagePlanDetailPanel
			voyageName="Jakarta - Panjang"
			rows={detailRows}
			isSelectedActiveAssignment
			canEndActiveVoyage={false}
			onCancel={() => {}}
			onEnd={() => {}}
		/>
	</div>
</Story>

<Story
	name="Route Table"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Tabel checkpoint dengan koordinat, planned speed, kecepatan aktual, dan aksi Complete.'
			}
		}
	}}
>
	<div class="voyage-vessel-page" style="min-height: 100vh;">
		<VoyagePlanRouteTable rows={routeRows} onComplete={() => {}} />
	</div>
</Story>

<Story
	name="History Table"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Riwayat assignment voyage dengan kolom tanggal, user, aksi View, dan pagination.'
			}
		}
	}}
>
	<div class="voyage-vessel-page" style="min-height: 100vh;">
		<VoyagePlanHistoryTable
			rows={historyRows}
			pagination={historyPagination}
			selectedHistoryId={284}
			onView={() => {}}
			onPrev={() => {}}
			onNext={() => {}}
		/>
	</div>
</Story>
