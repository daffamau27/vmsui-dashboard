<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AlarmPage from './AlarmPage.svelte';
	import AlarmMonitorSection from './AlarmMonitorSection.svelte';
	import AlarmEventsSection from './AlarmEventsSection.svelte';
	import AlarmDeviationOverlay from './AlarmDeviationOverlay.svelte';

	const monitorRows = [
		{
			vesselId: 101,
			vesselName: 'MV Nusantara Jaya',
			status: 'ACTIVE',
			type: 'DEVICE_OFFLINE',
			lastUpdateTs: 1735689600000,
			isNew: true
		},
		{
			vesselId: 102,
			vesselName: 'MT Samudra Biru',
			status: 'ACTIVE',
			type: 'SPIKE_RPM',
			lastUpdate: '22 Okt 2026, 09:42:10',
			isNew: false
		},
		{
			vesselId: 103,
			vesselName: 'MV Bahari Indah',
			status: 'CLEARED',
			type: 'OUTRANGE_RPM',
			lastUpdate: '22 Okt 2026, 08:15:44',
			isNew: false
		}
	];

	const eventRows = [
		{
			vesselName: 'MV Nusantara Jaya',
			alarmType: 'DEVICE_OFFLINE',
			status: 'ACTIVE',
			eventTs: 1735689300000,
			startTs: 1735689300000,
			endTs: null
		},
		{
			vesselName: 'MT Samudra Biru',
			alarmType: 'SPIKE_RPM',
			status: 'ACTIVE',
			eventTs: 1735688400000,
			startTs: 1735688400000,
			endTs: null
		},
		{
			vesselName: 'MV Bahari Indah',
			alarmType: 'OUTRANGE_RPM',
			status: 'CLEARED',
			eventTs: 1735682400000,
			startTs: 1735682400000,
			endTs: 1735686000000
		},
		{
			vesselName: 'MV Nusantara Jaya',
			alarmType: 'RPM_BLANK',
			status: 'CLEARED',
			eventTs: 1735678800000,
			startTs: 1735678800000,
			endTs: 1735680600000
		}
	];

	const vesselOptions = [
		{ vesselId: 101, vesselName: 'MV Nusantara Jaya' },
		{ vesselId: 102, vesselName: 'MT Samudra Biru' },
		{ vesselId: 103, vesselName: 'MV Bahari Indah' }
	];

	const alarmTypeOptions = [
		{ value: 'DEVICE_OFFLINE', label: 'Device Offline' },
		{ value: 'SPIKE_RPM', label: 'Spike RPM' },
		{ value: 'OUTRANGE_RPM', label: 'Outrange RPM' },
		{ value: 'RPM_BLANK', label: 'RPM Blank' }
	];

	const deviationRows = [
		{
			alarmId: 'dev-1',
			vesselId: 101,
			vesselName: 'MV Nusantara Jaya',
			type: 'JUMPING_DATA',
			start: '22 Okt 2026, 09:12:00',
			duration: '18m 42s',
			deviceId: 'DEV-101-A'
		},
		{
			alarmId: 'dev-2',
			vesselId: 102,
			vesselName: 'MT Samudra Biru',
			type: 'SPIKE_RPM',
			start: '22 Okt 2026, 08:55:10',
			duration: '6m 05s',
			deviceId: 'DEV-102-B'
		}
	];

	const { Story } = defineMeta({
		title: 'Pages/App/AlarmPage',
		component: AlarmPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Halaman monitoring alarm: monitor status kapal, daftar event historis, dan overlay deviasi telemetri. Halaman memuat data dari API saat aktif; komponen section di bawah dirender dengan data dummy.'
				}
			}
		},
		argTypes: {
			active: {
				control: 'boolean',
				description: 'Mengaktifkan pemuatan data alarm dari API dan auto-refresh.'
			}
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />

<Story
	name="Monitor"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Grid status alarm per kapal yang ditugaskan, termasuk badge NEW dan status ACTIVE/CLEARED.'
			}
		}
	}}
>
	<div style="background: var(--color-base); padding: 14px; min-height: 100vh;">
		<AlarmMonitorSection rows={monitorRows} />
	</div>
</Story>

<Story
	name="Events"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Filter dan tabel event alarm dengan pagination. Filter memakai data dummy dan tidak memanggil API.'
			}
		}
	}}
>
	<div style="background: var(--color-base); padding: 14px; min-height: 100vh;">
		<AlarmEventsSection
			rows={eventRows}
			{vesselOptions}
			{alarmTypeOptions}
			pagination={{
				page: 1,
				pageSize: 20,
				totalItems: 42,
				totalPages: 3,
				hasNext: true,
				hasPrevious: false
			}}
		/>
	</div>
</Story>

<Story
	name="Deviation"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Overlay peringatan deviasi telemetri yang muncul otomatis saat ada data deviasi belum dibaca.'
			}
		}
	}}
>
	<AlarmDeviationOverlay rows={deviationRows} totalItems={2} />
</Story>
