<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AllVesselSummaryPage from './AllVesselSummaryPage.svelte';
	import AvsHeader from './AvsHeader.svelte';
	import AvsSummaryGrid from './AvsSummaryGrid.svelte';
	import AvsVesselPanel from './AvsVesselPanel.svelte';
	import AvsRequestPanel from './AvsRequestPanel.svelte';
	import AvsColumnsPanel from './AvsColumnsPanel.svelte';
	import AvsProgressSection from './AvsProgressSection.svelte';
	import AvsReportTable from './AvsReportTable.svelte';

	const devices = [
		{ id: '101', name: 'MV Nusantara Jaya', companyName: 'Nusantara Shipping' },
		{ id: '102', name: 'MT Samudra Biru', companyName: 'Samudra Lines' },
		{ id: '103', name: 'MV Bahari Indah', companyName: 'Bahari Marine' }
	];

	const timePresets = [
		{ id: 'midnight', label: '00:00 - 06:00', startTime: '00:00', endTime: '06:00' },
		{ id: 'day', label: '06:00 - 18:00', startTime: '06:00', endTime: '18:00' },
		{ id: 'night', label: '18:00 - 24:00', startTime: '18:00', endTime: '23:59' }
	];

	const columnGroups = [
		{
			label: 'Main Engine',
			columns: [
				{ id: 'me1_runtime', label: 'ME1 Runtime', defaultVisible: true },
				{ id: 'me1_fuel', label: 'ME1 Fuel', defaultVisible: true },
				{ id: 'me2_runtime', label: 'ME2 Runtime', defaultVisible: false }
			]
		},
		{
			label: 'Vessel',
			columns: [
				{ id: 'speed', label: 'Speed', defaultVisible: true },
				{ id: 'distance', label: 'Distance', defaultVisible: true },
				{ id: 'data_received', label: 'Data Received', defaultVisible: true }
			]
		}
	];

	const reportColumns = [
		{ id: 'me1_runtime', label: 'ME1 Runtime', type: 'metric' },
		{ id: 'me1_fuel', label: 'ME1 Fuel', type: 'metric' },
		{ id: 'speed', label: 'Speed', type: 'metric' },
		{ id: 'distance', label: 'Distance', type: 'total' }
	];

	const tableLayout = {
		headerRows: [
			[
				{ id: 'group-me', label: 'Main Engine', colspan: 2, rowspan: 1 },
				{ id: 'group-vessel', label: 'Vessel', colspan: 2, rowspan: 1 }
			],
			[
				{
					id: 'me1_runtime',
					label: 'ME1 Runtime',
					colspan: 1,
					rowspan: 1,
					column: reportColumns[0]
				},
				{ id: 'me1_fuel', label: 'ME1 Fuel', colspan: 1, rowspan: 1, column: reportColumns[1] },
				{ id: 'speed', label: 'Speed', colspan: 1, rowspan: 1, column: reportColumns[2] },
				{ id: 'distance', label: 'Distance', colspan: 1, rowspan: 2, column: reportColumns[3] }
			]
		],
		columns: reportColumns
	};

	const rows = [
		{
			id: '101',
			vessel_name: 'MV Nusantara Jaya',
			range: { start: '22/10/2026 00:00', end: '22/10/2026 09:42' },
			values: {
				me1_runtime: '184h 20m',
				me1_fuel: '312.5 L',
				speed: '8.4 kn',
				distance: '82.4 nm'
			}
		},
		{
			id: '102',
			vessel_name: 'MT Samudra Biru',
			range: { start: '22/10/2026 00:00', end: '22/10/2026 09:42' },
			values: {
				me1_runtime: '176h 02m',
				me1_fuel: '298.1 L',
				speed: '7.9 kn',
				distance: '74.1 nm'
			}
		}
	];

	const vesselRanges = {
		101: { start: '2026-10-22T00:00', end: '2026-10-22T09:42' },
		102: { start: '2026-10-22T00:00', end: '2026-10-22T09:42' }
	};

	const vesselTimezones = {
		101: { mode: 'auto', offset: '+07:00' },
		102: { mode: 'manual', offset: '+08:00' }
	};

	const getVesselRange = (deviceId) =>
		vesselRanges[deviceId] || { start: '2026-10-22T00:00', end: '2026-10-22T09:42' };

	const getVesselTimezone = (deviceId) =>
		vesselTimezones[deviceId] || { mode: 'manual', offset: '+07:00' };

	const getDeviceAutoTimezoneLabel = () => 'UTC+07:00';

	const formatRangeLabel = (row) => `${row?.range?.start || '-'} → ${row?.range?.end || '-'}`;

	const isTotalColumn = (col) => col.type === 'total' || col.id.includes('total');

	const getCellValue = (row, col) => row?.values?.[col.id] || '-';

	const { Story } = defineMeta({
		title: 'Pages/App/AllVesselSummaryPage',
		component: AllVesselSummaryPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Ringkasan seluruh vessel: pilih vessel, atur rentang waktu dan UTC per vessel, pilih kolom, lalu muat tabel ringkasan. Halaman memuat data dari API; komponen section di bawah dirender dengan data dummy.'
				}
			}
		}
	});
</script>

<Story name="Default" />

<Story
	name="Header"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Header halaman dengan aksi reload daftar vessel dan muat ringkasan.'
			}
		}
	}}
>
	<div class="avs-page" style="min-height: 100vh;">
		<AvsHeader selectedDevicesCount={2} />
	</div>
</Story>

<Story
	name="Summary Grid"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Kartu ringkasan jumlah vessel terpilih dan jumlah baris hasil yang dimuat.'
			}
		}
	}}
>
	<div class="avs-page" style="min-height: 100vh;">
		<AvsSummaryGrid selectedDevicesCount={2} loadedRows={2} />
	</div>
</Story>

<Story
	name="Vessel Panel"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Panel pencarian dan pemilihan vessel, termasuk select all.'
			}
		}
	}}
>
	<div class="avs-page" style="min-height: 100vh;">
		<AvsVesselPanel
			{devices}
			filteredDevices={devices}
			selectedDeviceIds={['101', '102']}
			search=""
			onToggleAll={() => {}}
			onToggleSingle={() => {}}
		/>
	</div>
</Story>

<Story
	name="Request Panel"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Pengaturan rentang dan UTC default, preset cepat, serta pengaturan rentang/UTC per vessel.'
			}
		}
	}}
>
	<div class="avs-page" style="min-height: 100vh;">
		<AvsRequestPanel
			presets={timePresets}
			activeDefaultPresetLabel="Custom"
			defaultStartDate="2026-10-22T00:00"
			defaultEndDate="2026-10-22T09:42"
			defaultTimezoneMode="auto"
			defaultTimezoneOffset="+07:00"
			autoTimezoneLabel="UTC+07:00"
			selectedRangeSummary="2026-10-22 00:00 → 2026-10-22 09:42"
			selectedDevicesCount={2}
			selectedDevices={devices.slice(0, 2)}
			{getVesselRange}
			{getVesselTimezone}
			{getDeviceAutoTimezoneLabel}
			onApplyPreset={() => {}}
			onApplyRange={() => {}}
			onApplyTimezone={() => {}}
			onSetVesselRange={() => {}}
			onSetVesselTimezone={() => {}}
		/>
	</div>
</Story>

<Story
	name="Columns Panel"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Pemilihan kolom tabel yang dikelompokkan per kategori metrik.'
			}
		}
	}}
>
	<div class="avs-page" style="min-height: 100vh;">
		<AvsColumnsPanel
			{columnGroups}
			visibleColumnIds={['me1_runtime', 'me1_fuel', 'speed', 'distance', 'data_received']}
			selectedColumnCount={4}
			showColumnSelector
			getGroupVisibleCount={(columns) =>
				columns.filter((col) =>
					['me1_runtime', 'me1_fuel', 'speed', 'distance', 'data_received'].includes(col.id)
				).length}
			onToggleColumn={() => {}}
			onSelectAll={() => {}}
			onClear={() => {}}
			onReset={() => {}}
		/>
	</div>
</Story>

<Story
	name="Progress"
	asChild
	parameters={{
		docs: {
			description: { story: 'Indikator progres saat ringkasan vessel sedang dimuat.' }
		}
	}}
>
	<div class="avs-page" style="min-height: 100vh;">
		<AvsProgressSection
			loading
			loadingStatus="Loading 3 vessel summary"
			completed={2}
			selectedDevicesCount={3}
			progress={66}
		/>
	</div>
</Story>

<Story
	name="Report Table"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Tabel ringkasan dengan header multi-level, kolom beku, dan highlight kolom total.'
			}
		}
	}}
>
	<div class="avs-page" style="min-height: 100vh;">
		<AvsReportTable
			hasLoadedReport
			{rows}
			{tableLayout}
			visibleDataColumns={reportColumns}
			{formatRangeLabel}
			{isTotalColumn}
			{getCellValue}
		/>
	</div>
</Story>
