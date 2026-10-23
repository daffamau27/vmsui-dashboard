<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TracePage from './TracePage.svelte';
	import TraceHeader from './TraceHeader.svelte';
	import TraceCctv from './TraceCctv.svelte';
	import TraceMap from './TraceMap.svelte';
	import TracePlayback from './TracePlayback.svelte';
	import TraceData from './TraceData.svelte';

	const presets = [
		{ id: '1h', label: '1H' },
		{ id: '6h', label: '6H' },
		{ id: '24h', label: '24H' },
		{ id: '7d', label: '7D' }
	];

	const vesselInfo = {
		vesselName: 'MV Nusantara Jaya',
		latitude: -6.104512,
		longitude: 106.886321,
		heading: 124,
		currentSpeed: '8.4 knot',
		distance: '184.20 NM',
		fuelPerHour: '42.50 L/h',
		weatherForecast: 'Partly cloudy',
		oceanCurrent: '1.8 kph · 118°',
		lastUpdate: '23 Oct 2026 09:42'
	};

	const tracePoints = [
		{ latitude: -6.1045, longitude: 106.8863, timestamp: '23 Oct 2026 09:42' },
		{ latitude: -6.0981, longitude: 106.879, timestamp: '23 Oct 2026 09:32' }
	];

	const cctvMain = {
		key: 'bridge',
		name: 'Bridge',
		loadedCount: 42,
		pending: false,
		failed: false,
		frame: null
	};

	const cctvMini = [
		{
			key: 'engine-room',
			name: 'Engine Room',
			loadedCount: 40,
			pending: false,
			failed: false,
			frame: null
		},
		{ key: 'stern', name: 'Stern', loadedCount: 0, pending: false, failed: true, frame: null }
	];

	const cameraOptions = [
		{
			key: 'bridge',
			name: 'Bridge',
			optionStyle: '--camera-color: #f97316; --camera-hover-color: #fb923c;'
		},
		{
			key: 'engine-room',
			name: 'Engine Room',
			optionStyle: '--camera-color: #06b6d4; --camera-hover-color: #22d3ee;'
		}
	];

	const marks = [
		{
			key: 'mark-1',
			left: 38,
			pinStyle: '--camera-color: #f97316;',
			startedAtText: '09:36',
			cameraCount: 1,
			recordings: [
				{
					key: 'rec-1',
					cameraName: 'Bridge',
					startedAtText: '09:36',
					thumbnailUrl: '',
					style: '--camera-color: #f97316; --camera-hover-color: #fb923c;'
				}
			]
		}
	];

	const bufferSegments = [
		{ key: 'seg-1', left: 0, width: 48, startPage: 1, endPage: 2 },
		{ key: 'seg-2', left: 52, width: 30, startPage: 3, endPage: 4 }
	];

	const infoCards = [
		{ key: 'speed', label: 'Speed', value: '8.4 knot' },
		{ key: 'distance', label: 'Distance', value: '184.20 NM' },
		{ key: 'heading', label: 'Heading', value: '124.0°' },
		{ key: 'fuel', label: 'L/h', value: '42.50 L/h' },
		{ key: 'weather', label: 'Weather', value: 'Partly cloudy' },
		{ key: 'ocean', label: 'Ocean current', value: '1.8 kph · 118°' },
		{ key: 'points', label: 'Points', value: 420 }
	];

	const rpmEntries = [
		{ key: 'me-port', label: 'ME PORT', value: '1,450 RPM' },
		{ key: 'me-stbd', label: 'ME STBD', value: '1,420 RPM' },
		{ key: 'ae-1', label: 'AE 1', value: '1,200 RPM' }
	];

	const { Story } = defineMeta({
		title: 'Pages/Vessel/TracePage',
		component: TracePage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Trace playback: replay posisi kapal, jejak rute, telemetri, RPM engine, dan snapshot CCTV berdasarkan rentang waktu.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data trace.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />

<Story name="Header">
	<div class="trace-root page-content" style="min-height: 100vh;">
		<section class="trace-viewport">
			<TraceHeader
				vesselName="MV Nusantara Jaya"
				startDateTime="2026-10-23T08:00"
				endDateTime="2026-10-23T10:00"
				timezoneMode="auto"
				timezoneOffset="+07:00"
				autoTimezoneLabel="UTC+07:00"
				activeTimePreset="1h"
				{presets}
				loading={false}
				canLoad={true}
				onLoad={() => {}}
				onPreset={() => {}}
				onDateTimeInput={() => {}}
				onTimezoneChange={() => {}}
			/>
		</section>
	</div>
</Story>

<Story name="CCTV Monitoring">
	<div class="trace-root page-content" style="min-height: 100vh;">
		<section class="trace-viewport">
			<section class="main-monitor-grid">
				<TraceCctv
					mainPanel={cctvMain}
					miniPanels={cctvMini}
					error=""
					loadedCount={82}
					total={84}
					buffering={false}
					playbackBuffering={false}
					renderTick={1}
					onSelect={() => {}}
				/>
			</section>
		</section>
	</div>
</Story>

<Story name="Map & Posisi">
	<div class="trace-root page-content" style="min-height: 100vh;">
		<section class="trace-viewport">
			<section class="main-monitor-grid">
				<TraceMap
					active={false}
					{vesselInfo}
					{tracePoints}
					activeTraceIndex={0}
					renderTick={1}
					gpsUnavailable={false}
					usingPreviousPosition={false}
				/>
			</section>
		</section>
	</div>
</Story>

<Story name="Playback Timeline">
	<div class="trace-root page-content" style="min-height: 100vh;">
		<section class="trace-viewport">
			<section class="bottom-panel">
				<TracePlayback
					isPlaying={false}
					direction={1}
					speedOptions={[0.5, 1, 2, 5, 10]}
					speed={1}
					activeIndex={3}
					eventCount={20}
					{bufferSegments}
					{marks}
					activeMarkKey="mark-1"
					{cameraOptions}
					selectedCameraKeys={['bridge', 'engine-room']}
					progress={38}
					timeLabel="23 Oct 2026 09:42"
					sourceLabel="Trace timeline"
					marksError=""
					onStep={() => {}}
					onToggle={() => {}}
					onSpeed={() => {}}
					onTimelinePointerDown={() => {}}
					onTimelinePointerMove={() => {}}
					onTimelinePointerUp={() => {}}
					onTimelineClick={() => {}}
					onToggleMark={() => {}}
					onOpenRecording={() => {}}
					onToggleAllCameras={() => {}}
					onToggleCamera={() => {}}
				/>
			</section>
		</section>
	</div>
</Story>

<Story name="Telemetry & RPM">
	<div class="trace-root page-content" style="min-height: 100vh;">
		<section class="trace-viewport">
			<section class="bottom-panel">
				<TraceData cards={infoCards} {rpmEntries} />
			</section>
		</section>
	</div>
</Story>
