<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { SvelteMap } from 'svelte/reactivity';
	import DataLogPage from './DataLogPage.svelte';
	import DataLogHeader from './DataLogHeader.svelte';
	import DataLogOverrideCard from './DataLogOverrideCard.svelte';
	import DataLogColumnsCard from './DataLogColumnsCard.svelte';
	import DataLogDeviationCard from './DataLogDeviationCard.svelte';
	import DataLogTableSection from './DataLogTableSection.svelte';

	const timePresets = [
		{ id: 'today', label: 'Today' },
		{ id: 'yesterday', label: 'Yesterday' },
		{ id: 'two-days-before', label: '2 Days Before' },
		{ id: 'last-7-days', label: 'Last 7 Days' },
		{ id: 'last-30-days', label: 'Last 30 Days' }
	];

	const columns = [
		'timestamp',
		'latitude',
		'longitude',
		'course',
		'speed',
		'speed_over_ground',
		'me1_rpm',
		'me2_rpm',
		'fuel_ecu',
		'runtime_total'
	];

	const columnLabels = {
		timestamp: 'Timestamp',
		latitude: 'Latitude',
		longitude: 'Longitude',
		course: 'Course',
		speed: 'Speed',
		speed_over_ground: 'SOG',
		me1_rpm: 'ME1 RPM',
		me2_rpm: 'ME2 RPM',
		fuel_ecu: 'Fuel ECU',
		runtime_total: 'Runtime Total'
	};

	const getColumnLabel = (column) => columnLabels[column] || column;

	const rows = [
		{
			timestamp: '22 Okt 2026, 09:42:00',
			latitude: -6.1023,
			longitude: 106.8812,
			course: 12,
			speed: 8.4,
			speed_over_ground: 8.1,
			me1_rpm: 1420,
			me2_rpm: 1418,
			fuel_ecu: 312.5,
			runtime_total: 18420
		},
		{
			timestamp: '22 Okt 2026, 09:41:00',
			latitude: -6.1031,
			longitude: 106.8808,
			course: 11,
			speed: 8.6,
			speed_over_ground: 8.2,
			me1_rpm: 1435,
			me2_rpm: 1429,
			fuel_ecu: 314.1,
			runtime_total: 18419
		},
		{
			timestamp: '22 Okt 2026, 09:40:00',
			latitude: -6.1039,
			longitude: 106.8803,
			course: 10,
			speed: 8.2,
			speed_over_ground: 7.9,
			me1_rpm: 1410,
			me2_rpm: 1408,
			fuel_ecu: 309.8,
			runtime_total: 18418
		},
		{
			timestamp: '22 Okt 2026, 09:39:00',
			latitude: -6.1048,
			longitude: 106.8799,
			course: 9,
			speed: 7.8,
			speed_over_ground: 7.5,
			me1_rpm: 1398,
			me2_rpm: 1402,
			fuel_ecu: 307.2,
			runtime_total: 18417
		}
	];

	const rowHighlights = new SvelteMap();
	rowHighlights.set(rows[2], {
		level: 'warning',
		durationMinutes: 6,
		engines: ['ME1', 'ME2']
	});

	const deviationCategories = [
		{
			key: 'jumping_data',
			label: 'Jumping Data',
			description: 'Nilai telemetri melonjak tidak wajar antar menit.',
			count: 3,
			totalDurationMinutes: 14
		},
		{
			key: 'spike_rpm',
			label: 'Spike RPM',
			description: 'RPM melonjak sesaat di luar pola operasi normal.',
			count: 2,
			totalDurationMinutes: 8
		},
		{
			key: 'outrange_rpm',
			label: 'Outrange RPM',
			description: 'RPM berada di luar batas bawah atau atas.',
			count: 1,
			totalDurationMinutes: 22
		},
		{
			key: 'rpm_blank',
			label: 'RPM Blank',
			description: 'Data RPM tidak terekam pada interval tertentu.',
			count: 1,
			totalDurationMinutes: 5
		}
	];

	const deviationRows = [
		{
			key: 'jumping_data',
			type: 'Jumping Data',
			start: '22 Okt 2026, 09:12:00',
			end: '22 Okt 2026, 09:18:00',
			duration_minutes: 6
		},
		{
			key: 'spike_rpm',
			type: 'Spike RPM',
			start: '22 Okt 2026, 08:55:00',
			end: '22 Okt 2026, 08:57:00',
			duration_minutes: 2
		},
		{
			key: 'rpm_blank',
			type: 'RPM Blank',
			start: '22 Okt 2026, 08:30:00',
			end: '22 Okt 2026, 08:35:00',
			duration_minutes: 5
		}
	];

	const overrideImports = [
		{
			source_file_path: 'C:\\overrides\\data_log_override_22-10-2026.xlsx',
			override_count: 148,
			start: '22 Okt 2026, 00:00:00',
			end: '22 Okt 2026, 23:59:00',
			date_iso: ['2026-10-22']
		},
		{
			source_file_path: 'C:\\overrides\\data_log_override_21-10-2026.xlsx',
			override_count: 92,
			start: '21 Okt 2026, 00:00:00',
			end: '21 Okt 2026, 23:59:00',
			date_iso: ['2026-10-21']
		}
	];

	const { Story } = defineMeta({
		title: 'Pages/Vessel/DataLogPage',
		component: DataLogPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Log data vessel: filter rentang waktu, override Excel, pemilihan kolom, ringkasan deviasi, dan tabel telemetri 1 menit dengan pagination. Halaman memuat data dari API; komponen section di bawah dirender dengan data dummy.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data log.' }
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
				story: 'Filter rentang waktu, timezone, tombol load/export, dan preset waktu.'
			}
		}
	}}
>
	<div class="data-log-page" style="min-height: 100vh;">
		<DataLogHeader
			vesselName="MV Nusantara Jaya"
			startDateTime="2026-10-22T00:00"
			endDateTime="2026-10-22T09:42"
			activeTimePreset="today"
			{timePresets}
			autoTimezoneLabel="UTC+07:00"
		/>
	</div>
</Story>

<Story
	name="Override"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Kartu import override Excel beserta daftar file override yang sudah diimpor dan pagination-nya.'
			}
		}
	}}
>
	<div class="data-log-page" style="min-height: 100vh;">
		<DataLogOverrideCard
			imports={overrideImports}
			pagination={{
				page: 1,
				pageSize: 20,
				totalItems: 2,
				totalPages: 1,
				hasNext: false,
				hasPrevious: false
			}}
		/>
	</div>
</Story>

<Story
	name="Columns"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Pemilihan kolom yang ditampilkan pada tabel telemetri.'
			}
		}
	}}
>
	<div class="data-log-page" style="min-height: 100vh;">
		<DataLogColumnsCard
			{columns}
			selectedColumns={['timestamp', 'latitude', 'longitude', 'speed', 'me1_rpm']}
			{getColumnLabel}
		/>
	</div>
</Story>

<Story
	name="Deviation"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Ringkasan deviasi telemetri per kategori beserta tabel detail kejadian.'
			}
		}
	}}
>
	<div class="data-log-page" style="min-height: 100vh;">
		<DataLogDeviationCard
			deviation={{}}
			categories={deviationCategories}
			rows={deviationRows}
			totalCount={7}
			totalDuration={49}
			rpmLimits={{ low: 300, high: 1800, lower_limit: 250, upper_limit: 1900 }}
		/>
	</div>
</Story>

<Story
	name="Table"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Tabel telemetri 1 menit dengan sticky header, highlight baris RPM tinggi, dan tombol load more.'
			}
		}
	}}
>
	<div class="data-log-page" style="min-height: 100vh;">
		<DataLogTableSection
			{rows}
			{columns}
			{rowHighlights}
			{getColumnLabel}
			formatCellValue={(value) => (value === null || value === undefined ? '-' : String(value))}
			getRowColumnValue={(row, column) => row[column]}
			pagination={{
				page: 1,
				pageSize: 100,
				totalItems: 240,
				totalPages: 3,
				hasNext: true,
				hasPrevious: false
			}}
			page={1}
			hasNext
			showLegend
		/>
	</div>
</Story>
