<script>
	import { onMount } from 'svelte';
	import VesselMap from '$lib/VesselMap.svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { getVesselCctvSnapshots, getVesselTrace } from '$lib/api/traceApi.js';
	import { fade, fly, scale } from 'svelte/transition';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';

	let { active = false } = $props();

	let loading = $state(false);
	let error = $state('');
	let traceData = $state(null);

	let isPlaying = $state(false);
	let activeIndex = $state(0);
	let loadedKeys = $state({});

	let startDateTime = $state('');
	let endDateTime = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');

	let cctvItems = $state([]);
	let cctvSnapshotsError = $state('');
	let cctvSnapshotsTotal = $state(0);
	let selectedCctvIndex = $state(0);
	let cctvAnimationKey = $state(0);
	const CCTV_SNAPSHOT_PAGE_SIZE = 12;

	let selectedCctv = $derived(cctvItems[selectedCctvIndex] || cctvItems[0] || null);

	let miniCctvItems = $derived(
		cctvItems
			.map((item, index) => ({ ...item, index }))
			.filter((item) => item.index !== selectedCctvIndex)
	);

	function selectCctv(index) {
		if (index === selectedCctvIndex) return;

		selectedCctvIndex = index;
		cctvAnimationKey += 1;
	}

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function toLocalInputValue(date) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
			date.getDate()
		)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function toApiDateTime(value) {
		if (!value) return '';

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) return value;

		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
			date.getDate()
		)} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
	}

	function toSnapshotApiDateTime(value) {
		if (!value) return '';

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) return value;

		return date.toISOString();
	}

	function toNumber(value, fallback = 0) {
		const number = Number(value);
		return Number.isFinite(number) ? number : fallback;
	}

	function formatNumber(value, digits = 1, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;
		return number.toFixed(digits);
	}

	function formatDateTime(value) {
		if (!value) return '-';

		if (/^\d+$/.test(String(value))) {
			const date = new Date(Number(value));

			if (!Number.isNaN(date.getTime())) {
				return date.toLocaleString('en-US', {
					day: '2-digit',
					month: 'short',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit'
				});
			}
		}

		const date = new Date(value);

		if (!Number.isNaN(date.getTime())) {
			return date.toLocaleString('en-US', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
			});
		}

		return value;
	}

	function formatFileSize(value) {
		const bytes = Number(value);
		if (!Number.isFinite(bytes) || bytes <= 0) return '';

		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex += 1;
		}

		return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
	}

	function getCameraNameFromPath(filePath = '') {
		const match = String(filePath).match(/camera_([^/]+)/i);
		if (!match?.[1]) return '';

		return decodeURIComponent(match[1]).replace(/[-_]+/g, ' ').trim();
	}

	function normalizeCctvSnapshots(value) {
		const payload = value?.items ? value : value?.data?.items ? value.data : value?.data || value;
		const items = Array.isArray(payload?.items)
			? payload.items
			: Array.isArray(value)
				? value
				: [];

		cctvSnapshotsTotal = Number(payload?.total ?? items.length) || 0;

		return items.map((item, index) => {
			const filePath = item?.file_path || item?.filePath || '';
			const capturedAt = item?.captured_at || item?.capturedAt || '';
			const url = item?.presigned_url || item?.presignedUrl || item?.url || '';
			const cameraName =
				item?.camera_name ||
				item?.cameraName ||
				item?.name ||
				getCameraNameFromPath(filePath) ||
				`Snapshot ${index + 1}`;

			return {
				name: cameraName,
				status: url ? 'Captured' : 'No image',
				url,
				filePath,
				fileSizeText: formatFileSize(item?.file_size ?? item?.fileSize),
				capturedAt,
				capturedAtText: formatDateTime(capturedAt),
				online: Boolean(url)
			};
		});
	}

	function normalizeRpm(value) {
		if (!value) return {};

		if (typeof value === 'object' && !Array.isArray(value)) {
			return Object.fromEntries(
				Object.entries(value).map(([engineName, rpmValue]) => [engineName, toNumber(rpmValue, 0)])
			);
		}

		return {
			RPM: toNumber(value, 0)
		};
	}

	function getMaxRpm(rpmObject = {}) {
		const values = Object.values(rpmObject)
			.map((value) => toNumber(value, 0))
			.filter((value) => Number.isFinite(value));

		if (!values.length) return 0;

		return Math.max(...values);
	}

	function getAvgRpm(rpmObject = {}) {
		const values = Object.values(rpmObject)
			.map((value) => toNumber(value, 0))
			.filter((value) => Number.isFinite(value));

		if (!values.length) return 0;

		return values.reduce((sum, value) => sum + value, 0) / values.length;
	}

	function getTracePoints(data) {
		const candidates =
			data?.points ||
			data?.trace ||
			data?.traces ||
			data?.coordinates ||
			data?.path ||
			data?.rows ||
			data?.items ||
			data?.result ||
			data?.data?.points ||
			data?.data?.trace ||
			data?.data?.coordinates ||
			data?.data?.path ||
			data?.data?.rows ||
			data?.data ||
			data ||
			[];

		if (!Array.isArray(candidates)) {
			console.warn('[TRACE_POINTS_NOT_ARRAY]', data);
			return [];
		}

		const points = candidates
			.map((item, index) => {
				const lat = toNumber(
					item.latitude ??
						item.lat ??
						item.gps_lat ??
						item.gpsLatitude ??
						item.latitude_deg ??
						item.position?.latitude ??
						item.position?.lat,
					NaN
				);

				const lng = toNumber(
					item.longitude ??
						item.lng ??
						item.lon ??
						item.gps_lng ??
						item.gps_lon ??
						item.gpsLongitude ??
						item.longitude_deg ??
						item.position?.longitude ??
						item.position?.lng ??
						item.position?.lon,
					NaN
				);

				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
				if (lat === 0 && lng === 0) return null;

				const rpm = normalizeRpm(item.rpm ?? item.me_rpm ?? item.mePortRpm ?? item.me_port_rpm);

				return {
					index,
					latitude: lat,
					longitude: lng,
					heading: toNumber(item.heading ?? item.course ?? item.bearing, 0),
					speed: toNumber(item.speed ?? item.sog ?? item.speedOverGround, 0),
					rpm,
					maxRpm: getMaxRpm(rpm),
					avgRpm: getAvgRpm(rpm),
					fuelPerMinute: toNumber(
						item.fuelPerMinute ??
							item.fuel_per_minute ??
							item.fuelRate ??
							item.fuel_rate ??
							item.f_rate,
						0
					),
					weather: item.weather || item.weatherForecast || item.condition || '-',
					queue: toNumber(item.queue, 0),
					sdCard: toNumber(item.sdCard ?? item.sd_card, 0),
					online: Boolean(item.online),
					timestampRaw:
						item.timestamp ||
						item.ts ||
						item.time ||
						item.datetime ||
						item.createdAt ||
						item.created_at ||
						'',
					timestamp: formatDateTime(
						item.timestamp ||
							item.ts ||
							item.time ||
							item.datetime ||
							item.createdAt ||
							item.created_at ||
							'-'
					)
				};
			})
			.filter(Boolean);

		console.log('[TRACE_POINTS_PARSED]', points.length, points.slice(0, 3));

		return points;
	}

	let tracePoints = $derived(getTracePoints(traceData));

	let activePoint = $derived(
		tracePoints[activeIndex] ||
			tracePoints[0] || {
				latitude: toNumber($selectedVesselInfo?.latitude ?? $selectedVesselInfo?.lat, 0),
				longitude: toNumber($selectedVesselInfo?.longitude ?? $selectedVesselInfo?.lng, 0),
				heading: toNumber($selectedVesselInfo?.heading, 0),
				speed: toNumber($selectedVesselInfo?.speed, 0),
				rpm: {},
				maxRpm: 0,
				avgRpm: 0,
				fuelPerMinute: 0,
				weather: $selectedVesselInfo?.weather?.current?.condition || '-',
				queue: 0,
				sdCard: 0,
				online: false,
				timestamp: formatDateTime($selectedVesselInfo?.lastUpdated || '-')
			}
	);

	let vesselName = $derived(
		traceData?.vesselName ||
			traceData?.data?.vesselName ||
			$selectedVesselInfo?.name ||
			$selectedVesselInfo?.vesselName ||
			'Selected Vessel'
	);

	let activeRpmEntries = $derived(Object.entries(activePoint.rpm || {}));

	let timelineProgress = $derived(
		tracePoints.length > 1
			? Math.min(100, Math.max(0, (activeIndex / (tracePoints.length - 1)) * 100))
			: 0
	);

	let vesselInfo = $derived({
		vesselName,
		latitude: activePoint.latitude,
		longitude: activePoint.longitude,
		heading: activePoint.heading,
		currentSpeed: `${formatNumber(activePoint.speed, 1, '0.0')} knot`,
		maxRpm: `${formatNumber(activePoint.maxRpm, 0, '0')} RPM`,
		avgRpm: `${formatNumber(activePoint.avgRpm, 0, '0')} RPM`,
		fuelPerMinute: `${formatNumber(activePoint.fuelPerMinute, 2, '0.00')} L/min`,
		weatherForecast: activePoint.weather || $selectedVesselInfo?.weather?.current?.condition || '-',
		lastUpdate: activePoint.timestamp || '-',
		onlineStatus: activePoint.online ? 'Online' : 'Offline'
	});

	async function loadTrace() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			traceData = null;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			return;
		}

		loading = true;
		error = '';
		cctvSnapshotsError = '';

		try {
			const [result, snapshotResult] = await Promise.all([
				getVesselTrace({
					vesselId: $selectedVesselId,
					start: toApiDateTime(startDateTime),
					end: toApiDateTime(endDateTime),
					timezoneMode,
					timezoneOffset: timezoneMode === 'manual' ? timezoneOffset : ''
				}),
				getVesselCctvSnapshots({
					vesselId: $selectedVesselId,
					startTime: toSnapshotApiDateTime(startDateTime),
					endTime: toSnapshotApiDateTime(endDateTime),
					page: 1,
					pageSize: CCTV_SNAPSHOT_PAGE_SIZE
				}).catch((snapshotErr) => {
					console.error('[VESSEL_TRACE_CCTV_SNAPSHOTS_ERROR]', snapshotErr);
					cctvSnapshotsError =
						snapshotErr?.message || 'Failed to load CCTV snapshots for this trace range.';
					return null;
				})
			]);

			traceData = result;
			cctvItems = snapshotResult ? normalizeCctvSnapshots(snapshotResult) : [];
			selectedCctvIndex = 0;
			activeIndex = 0;
			cctvAnimationKey += 1;

			console.log('[VESSEL_TRACE_RAW]', result);
			console.log('[VESSEL_TRACE_POINTS_COUNT]', getTracePoints(result).length);
			console.log('[VESSEL_TRACE_CCTV_SNAPSHOTS_COUNT]', cctvItems.length);
		} catch (err) {
			console.error('[VESSEL_TRACE_ERROR]', err);
			error = err?.message || 'Failed to load vessel trace.';
			traceData = null;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
		} finally {
			loading = false;
		}
	}

	function togglePlayback() {
		if (!tracePoints.length) return;
		isPlaying = !isPlaying;
	}

	let isDraggingTimeline = $state(false);

	function updateTimelineFromPointer(event) {
		if (!tracePoints.length) return;

		const target = event.currentTarget;
		const rect = target.getBoundingClientRect();
		const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
		const x = clientX - rect.left;
		const ratio = Math.min(1, Math.max(0, x / rect.width));

		activeIndex = Math.round(ratio * (tracePoints.length - 1));
	}

	function moveTimeline(event) {
		updateTimelineFromPointer(event);
	}

	function startTimelineDrag(event) {
		if (!tracePoints.length) return;

		isDraggingTimeline = true;
		isPlaying = false;

		event.currentTarget.setPointerCapture?.(event.pointerId);
		updateTimelineFromPointer(event);
	}

	function dragTimeline(event) {
		if (!isDraggingTimeline) return;

		updateTimelineFromPointer(event);
	}

	function stopTimelineDrag(event) {
		if (!isDraggingTimeline) return;

		isDraggingTimeline = false;
		event.currentTarget.releasePointerCapture?.(event.pointerId);
	}

	function moveStep(direction) {
		if (!tracePoints.length) return;

		activeIndex = Math.min(tracePoints.length - 1, Math.max(0, activeIndex + direction));
	}

	onMount(() => {
		const now = new Date();
		const start = new Date(now);

		start.setHours(0, 0, 0, 0);

		startDateTime = toLocalInputValue(start);
		endDateTime = toLocalInputValue(now);
	});

	$effect(() => {
		if (!active) {
			isPlaying = false;
		}
	});

	$effect(() => {
		if (!isPlaying) return;
		if (!tracePoints.length) return;

		const interval = setInterval(() => {
			if (activeIndex >= tracePoints.length - 1) {
				isPlaying = false;
				return;
			}

			activeIndex += 1;
		}, 900);

		return () => clearInterval(interval);
	});

	$effect(() => {
		if (!active) return;
		if (!$selectedVesselId) return;
		if (!startDateTime || !endDateTime) return;

		const key = `${$selectedVesselId}|${startDateTime}|${endDateTime}|${timezoneMode}|${timezoneOffset}`;

		if (loadedKeys[key]) return;

		loadedKeys = {
			...loadedKeys,
			[key]: true
		};

		loadTrace();
	});
</script>

<section class="trace-root page-content">
	<section class="trace-viewport">
		<section class="compact-filter-card">
			<div class="filter-title">
				<strong>Trace Playback</strong>
				<span>{vesselInfo.vesselName}</span>
			</div>

			<div class="filter-controls">
				<label>
					<span>Start</span>
					<input type="datetime-local" bind:value={startDateTime} />
				</label>

				<label>
					<span>End</span>
					<input type="datetime-local" bind:value={endDateTime} />
				</label>

				<label>
					<span>Timezone</span>
					<select bind:value={timezoneMode}>
						<option value="auto">Auto</option>
						<option value="manual">Manual</option>
					</select>
				</label>

				{#if timezoneMode === 'manual'}
					<label>
						<span>Offset</span>
						<input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
					</label>
				{/if}

				<button type="button" onclick={loadTrace} disabled={loading}>
					{loading ? 'Loading...' : 'Load Trace'}
				</button>
			</div>
		</section>

		{#if error}
			<div class="status-box error-box">{error}</div>
		{/if}

	{#if loading}
		<section class="trace-loading-shell">
			<LoadingSkeleton
				label="Loading trace playback"
				variant="trace-playback"
				class="trace-page-skeleton"
			/>
		</section>
	{:else}
		<section class="main-monitor-grid">
			<section class="monitor-card cctv-card">
				<div class="card-header">
					<div>
						<div class="card-title">CCTV Monitoring</div>
						<div class="card-subtitle" class:cctv-error-text={Boolean(cctvSnapshotsError)}>
							{cctvSnapshotsError || `${cctvSnapshotsTotal || cctvItems.length} snapshots in selected range`}
						</div>
					</div>
				</div>

				<div class="cctv-layout">
					<div class="cctv-main-shell">
						{#key cctvAnimationKey}
							{#if selectedCctv}
								<div
									class="cctv-main"
									class:offline={!selectedCctv.online}
									class:has-snapshot={Boolean(selectedCctv.url)}
									in:fly={{ y: 10, duration: 180 }}
									out:fade={{ duration: 90 }}
								>
									{#if selectedCctv.url}
										<img class="cctv-snapshot-image" src={selectedCctv.url} alt={`${selectedCctv.name} snapshot`} loading="lazy" />
									{/if}

									<div class="cctv-scanline"></div>

									<div class="cctv-overlay">
										<span class="camera-name">{selectedCctv.name}</span>
										<span class="camera-status">{selectedCctv.capturedAtText || selectedCctv.status}</span>
										{#if selectedCctv.fileSizeText}
											<span class="camera-file-size">{selectedCctv.fileSizeText}</span>
										{/if}
									</div>
								</div>
							{:else}
								<div class="cctv-main offline cctv-empty-main" in:fade={{ duration: 150 }}>
									<div class="cctv-overlay">
										<span class="camera-name">No CCTV snapshot</span>
										<span class="camera-status">Choose a range and load trace</span>
									</div>
								</div>
							{/if}
						{/key}
					</div>

					<div class="cctv-mini-row">
						{#each miniCctvItems as cctv (cctv.index)}
							<button
								type="button"
								class="cctv-mini"
								class:offline={!cctv.online}
								class:has-snapshot={Boolean(cctv.url)}
								onclick={() => selectCctv(cctv.index)}
								title={`Show ${cctv.name}`}
								in:scale={{ start: 0.96, duration: 150 }}
								out:fade={{ duration: 80 }}
							>
								{#if cctv.url}
									<img src={cctv.url} alt={`${cctv.name} thumbnail`} loading="lazy" />
								{/if}
								<span>{cctv.name}</span>
								<small>{cctv.capturedAtText || cctv.status}</small>
							</button>
						{/each}
					</div>
				</div>
			</section>

			<section class="monitor-card map-card">
				<div class="card-header map-header">
					<div>
						<div class="card-title">Vessel Position</div>
						<div class="card-subtitle">
							{vesselInfo.lastUpdate}
						</div>
					</div>

					<div class="coordinate-badge">
						<CopyableCoordinate
							value={formatNumber(vesselInfo.latitude, 6, '0.000000')}
							display={formatNumber(vesselInfo.latitude, 6, '0.000000')}
							label="latitude"
							compact
						/>
						<span class="coordinate-separator">,</span>
						<CopyableCoordinate
							value={formatNumber(vesselInfo.longitude, 6, '0.000000')}
							display={formatNumber(vesselInfo.longitude, 6, '0.000000')}
							label="longitude"
							compact
						/>
					</div>
				</div>

				<div class="map-panel">
					{#if active}
						<VesselMap
							latitude={vesselInfo.latitude}
							longitude={vesselInfo.longitude}
							heading={vesselInfo.heading}
							vesselName={vesselInfo.vesselName}
							speed={vesselInfo.currentSpeed}
							lastUpdate={vesselInfo.lastUpdate}
							iconUrl="/assets/vessel.png"
							zoom={12}
							{tracePoints}
							{activeIndex}
							showTraceLine={true}
						/>
					{/if}
				</div>
			</section>
		</section>

		<section class="bottom-panel">
			<div class="playback-card">
				<div class="playback-controls">
					<button
						type="button"
						class="step-btn"
						onclick={() => moveStep(-1)}
						disabled={!tracePoints.length || activeIndex <= 0}
					>
						‹
					</button>

					<button
						type="button"
						class="play-button"
						onclick={togglePlayback}
						disabled={!tracePoints.length}
					>
						{isPlaying ? 'Pause' : 'Play'}
					</button>

					<button
						type="button"
						class="step-btn"
						onclick={() => moveStep(1)}
						disabled={!tracePoints.length || activeIndex >= tracePoints.length - 1}
					>
						›
					</button>
				</div>

				<div
					class="timeline"
					role="slider"
					tabindex="0"
					aria-label="Trace playback timeline"
					aria-valuemin="0"
					aria-valuemax={Math.max(tracePoints.length - 1, 0)}
					aria-valuenow={activeIndex}
					onpointerdown={startTimelineDrag}
					onpointermove={dragTimeline}
					onpointerup={stopTimelineDrag}
					onpointercancel={stopTimelineDrag}
					onclick={moveTimeline}
				>
					<div class="timeline-track"></div>
					<div class="timeline-progress" style={`width: ${timelineProgress}%`}></div>
					<div class="timeline-dot" style={`left: ${timelineProgress}%`}></div>
				</div>

				<div class="timeline-time">
					<span>{activeIndex + 1}/{tracePoints.length || 0}</span>
					<strong>{vesselInfo.lastUpdate}</strong>
				</div>
			</div>

			<section class="bottom-data-grid">
				<div class="compact-info-grid">
					<article class="info-card">
						<span>Speed</span>
						<strong>{vesselInfo.currentSpeed}</strong>
					</article>

					<article class="info-card">
						<span>Heading</span>
						<strong>{formatNumber(vesselInfo.heading, 1, '0.0')}°</strong>
					</article>

					<article class="info-card">
						<span>Fuel / Min</span>
						<strong>{vesselInfo.fuelPerMinute}</strong>
					</article>

					<article class="info-card">
						<span>Weather</span>
						<strong>{vesselInfo.weatherForecast}</strong>
					</article>

					<article class="info-card">
						<span>Points</span>
						<strong>{tracePoints.length}</strong>
					</article>
				</div>

				<section class="rpm-panel">
					<div class="rpm-header">
						<span>Engine RPM</span>
						<strong>{activeRpmEntries.length} engines</strong>
					</div>

					{#if activeRpmEntries.length}
						<div class="rpm-grid">
							{#each activeRpmEntries as [engineName, rpmValue]}
								<article class="rpm-card">
									<span>{engineName}</span>
									<strong>{formatNumber(rpmValue, 0, '0')} RPM</strong>
								</article>
							{/each}
						</div>
					{:else}
						<div class="rpm-empty">RPM data is not available.</div>
					{/if}
				</section>
			</section>
		</section>
		{/if}
	</section>

	{#if traceData && !loading}
		<details class="raw-box">
			<summary>Raw Trace Response</summary>
			<pre>{JSON.stringify(traceData, null, 2)}</pre>
		</details>
	{/if}
</section>

<style>
	.trace-root {
		width: 100%;
		height: 100%;
		min-height: 0;
		background: var(--color-base);
		color: var(--text-primary);
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.trace-viewport {
		padding: 10px;
		box-sizing: border-box;
		display: grid;
		grid-template-rows: auto auto auto auto;
		gap: 10px;
		overflow: visible;
	}

	.compact-filter-card {
		min-height: 64px;
		padding: 10px 18px;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		align-items: center;
		gap: 16px;
	}

	.filter-title {
		display: grid;
		align-content: center;
		gap: 4px;
		min-height: 42px;
	}

	.filter-title strong {
		display: block;
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 950;
		line-height: 1.1;
	}

	.filter-title span {
		display: block;
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 800;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.filter-controls {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		flex-wrap: wrap;
	}

	.filter-controls label {
		display: grid;
		gap: 4px;
	}

	.filter-controls label span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 950;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.filter-controls input,
	.filter-controls select {
		height: 28px;
		min-width: 135px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 8px;
		color: var(--text-primary);
		font-size: 10px;
		font-weight: 750;
		outline: none;
		box-sizing: border-box;
	}

	.filter-controls input:focus,
	.filter-controls select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.filter-controls button {
		height: 28px;
		padding: 0 12px;
		border: none;
		background: #2563eb;
		color: #ffffff;
		font-size: 10px;
		font-weight: 950;
		cursor: pointer;
	}

	.filter-controls button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.status-box {
		padding: 8px 10px;
		font-size: 11px;
		font-weight: 850;
	}

	.error-box {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.trace-loading-shell {
		grid-row: 2 / -1;
		min-height: 620px;
		display: grid;
		overflow: visible;
	}

	.trace-loading-shell :global(.loading-skeleton.trace-playback),
	.trace-loading-shell :global(.trace-skeleton-playback) {
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	.main-monitor-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(420px, 1fr) minmax(0, 1.75fr);
		align-items: stretch;
		gap: 10px;
	}

	.monitor-card,
	.playback-card,
	.info-card,
	.rpm-panel {
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
	}

	.monitor-card {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.map-card {
		height: auto;
		min-height: 0;
	}

	.card-header {
		height: 46px;
		min-height: 46px;
		padding: 8px 12px;
		border-bottom: 1px solid #e2e8f0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		box-sizing: border-box;
	}

	.card-title {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 950;
		line-height: 1.15;
	}

	.card-subtitle {
		margin-top: 2px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 750;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.coordinate-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 7px;
		background: var(--color-elevated);
		border: 1px solid #e2e8f0;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 850;
		white-space: nowrap;
	}

	.coordinate-separator {
		color: var(--text-muted);
	}

	.cctv-layout {
		flex: 0 0 auto;
		min-height: 0;
		padding: 8px;
		display: grid;
		grid-template-rows: auto auto;
		align-content: start;
		gap: 8px;
	}

	.cctv-main-shell {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		min-height: 0;
		max-height: 100%;
		overflow: hidden;
		background: #4f5658;
	}

  .cctv-main {
    position: absolute;
    inset: 0;
    min-height: 0;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0)),
      #4f5658;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    will-change: transform, opacity;
  }

  .cctv-main.offline {
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0)),
      #6b7280;
  }

  .cctv-main.has-snapshot {
    background: #111827;
  }

  .cctv-main::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: 22px 22px;
    opacity: 0.25;
    z-index: 1;
  }

  .cctv-main.has-snapshot::before {
    background:
      linear-gradient(180deg, rgba(15, 23, 42, 0.58), rgba(15, 23, 42, 0.1) 42%, rgba(15, 23, 42, 0.82));
    opacity: 1;
  }

  .cctv-snapshot-image {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cctv-empty-main {
    text-align: center;
  }

  .cctv-scanline {
    position: absolute;
    left: 0;
    right: 0;
    top: -40%;
    height: 40%;
    background: linear-gradient(
      to bottom,
      transparent,
      rgba(255, 255, 255, 0.08),
      transparent
    );
    animation: cctvScan 1.4s ease-out;
    pointer-events: none;
    z-index: 2;
  }

  @keyframes cctvScan {
    from {
      top: -40%;
      opacity: 0.75;
    }

    to {
      top: 100%;
      opacity: 0;
    }
  }

  .cctv-overlay {
    position: relative;
    z-index: 3;
    display: grid;
    place-items: center;
    gap: 5px;
    color: #ffffff;
    animation: cctvTextPop 0.18s ease-out;
  }

  @keyframes cctvTextPop {
    from {
      transform: translateY(5px) scale(0.98);
      opacity: 0;
    }

    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  .camera-name {
    font-size: 15px;
    font-weight: 950;
  }

  .camera-status {
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    font-size: 10px;
    font-weight: 850;
  }

  .camera-file-size {
    color: #bfdbfe;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .cctv-error-text {
    color: #fca5a5;
  }

  .cctv-mini-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .cctv-mini {
    min-width: 0;
    width: 100%;
    aspect-ratio: 4 / 3;
    border: none;
    background: #53595b;
    color: #ffffff;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    cursor: pointer;
    transform: translateY(0) scale(1);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease,
    opacity 0.18s ease;
    will-change: transform, opacity;
    position: relative;
    overflow: hidden;
  }

  .cctv-mini::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.24), rgba(15, 23, 42, 0.78));
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .cctv-mini.has-snapshot::before {
    opacity: 1;
  }

  .cctv-mini img {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cctv-mini:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 5px 12px rgba(15, 23, 42, 0.24);
    background: #3f4648;
  }

  .cctv-mini:active {
    transform: translateY(0) scale(0.97);
  }

  .cctv-mini span {
    position: relative;
    z-index: 2;
    font-size: 11px;
    font-weight: 950;
  }

  .cctv-mini small {
    position: relative;
    z-index: 2;
    color: #d8dee4;
    font-size: 8px;
    font-weight: 750;
  }

  .cctv-mini.offline {
    background: #7a7f82;
  }

	.map-panel {
		flex: 1;
		height: auto;
		min-height: 0;
		position: relative;
		overflow: hidden;
		background: #d9d9d9;
	}

	.map-panel :global(.vessel-map-root) {
		height: 100%;
		min-height: 0;
	}

	.bottom-panel {
		min-height: 0;
		display: grid;
		grid-template-rows: auto auto;
		gap: 10px;
		overflow: visible;
	}

	.bottom-data-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: 1.15fr 1.35fr;
		gap: 10px;
		overflow: hidden;
	}

	.playback-card {
		min-width: 0;
		min-height: 52px;
		padding: 8px 10px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) 190px;
		align-items: center;
		gap: 10px;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.playback-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
	}

	.play-button,
	.step-btn {
		height: 28px;
		border: 1px solid #93b4ec;
		background: #2563eb;
		color: #ffffff;
		font-size: 11px;
		font-weight: 950;
		cursor: pointer;
	}

	.play-button {
		min-width: 64px;
		padding: 0 10px;
	}

	.step-btn {
		width: 30px;
		font-size: 18px;
		line-height: 1;
	}

	.play-button:disabled,
	.step-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.timeline {
		position: relative;
		height: 22px;
		border: none;
		background: transparent;
		padding: 0;
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.timeline:active {
		cursor: grabbing;
	}

	.timeline-track,
	.timeline-progress,
	.timeline-dot {
		pointer-events: none;
	}

	.timeline-track {
		position: absolute;
		left: 0;
		right: 0;
		top: 9px;
		height: 3px;
		background: #d5dbe3;
	}

	.timeline-progress {
		position: absolute;
		left: 0;
		top: 9px;
		height: 3px;
		background: #2563eb;
	}

	.timeline-dot {
		position: absolute;
		top: 4px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #2563eb;
		border: 2px solid #ffffff;
		box-shadow: 0 0 0 1px #2563eb;
		transform: translateX(-50%);
	}

	.timeline-time {
		display: grid;
		gap: 3px;
		text-align: right;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 850;
		white-space: nowrap;
	}

	.timeline-time strong {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 850;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.compact-info-grid {
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 8px;
		overflow: hidden;
	}

	.info-card {
		min-width: 0;
		min-height: 0;
		padding: 8px 6px;
		display: grid;
		align-content: center;
		gap: 5px;
		text-align: center;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		box-sizing: border-box;
	}

	.info-card span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 950;
		text-transform: uppercase;
	}

	.info-card strong {
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 950;
		line-height: 1.1;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rpm-panel {
		min-width: 0;
		min-height: 0;
		padding: 8px;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 7px;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.rpm-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.rpm-header span {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 950;
	}

	.rpm-header strong {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
	}

	.rpm-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
		overflow: hidden;
	}

	.rpm-card {
		min-width: 0;
		min-height: 0;
		padding: 6px 8px;
		background: var(--color-elevated);
		border: 1px solid #e2e8f0;
		display: grid;
		align-content: center;
		gap: 4px;
		text-align: center;
		box-sizing: border-box;
	}

	.rpm-card span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 900;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rpm-card strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 950;
		white-space: nowrap;
	}

	.rpm-empty {
		padding: 12px;
		background: var(--color-elevated);
		border: 1px dashed #cbd5e1;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 850;
		text-align: center;
	}

	.raw-box {
		margin: 10px;
		background: #0f172a;
		color: #e5e7eb;
		border: 1px solid #1e293b;
	}

	.raw-box summary {
		padding: 10px 12px;
		cursor: pointer;
		font-size: 11px;
		font-weight: 900;
	}

	.raw-box pre {
		max-height: 420px;
		margin: 0;
		padding: 12px;
		overflow: auto;
		border-top: 1px solid #1e293b;
		font-size: 11px;
		line-height: 1.45;
	}

	@media (max-width: 1200px) {
		.trace-viewport {
			height: auto;
			max-height: none;
			min-height: 100vh;
			overflow: visible;
		}

		.main-monitor-grid {
			grid-template-columns: 1fr;
		}

		.map-card {
			height: auto;
			min-height: 0;
		}

		.cctv-layout {
			min-height: 0;
		}

		.cctv-main-shell {
			max-width: min(100%, 680px);
			margin: 0 auto;
		}

		.map-panel {
			height: auto;
			min-height: 440px;
		}

		.map-panel :global(.vessel-map-root) {
			min-height: 440px;
		}

		.bottom-panel {
			height: auto;
			min-height: 0;
			max-height: none;
			grid-template-rows: auto auto;
			grid-template-columns: 1fr;
			overflow: visible;
		}

		.trace-loading-shell {
			grid-row: auto;
			display: block;
			overflow: visible;
		}
	}

	@media (max-width: 760px) {
		.trace-viewport {
			padding: 8px;
		}

		.map-panel {
			min-height: 360px;
		}

		.map-panel :global(.vessel-map-root) {
			min-height: 360px;
		}

		.compact-filter-card {
			grid-template-columns: 1fr;
		}

		.filter-controls {
			justify-content: flex-start;
		}

		.filter-controls label,
		.filter-controls input,
		.filter-controls select,
		.filter-controls button {
			width: 100%;
			min-width: 0;
		}

		.compact-info-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.rpm-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.coordinate-badge {
			display: none;
		}
	}
</style>
