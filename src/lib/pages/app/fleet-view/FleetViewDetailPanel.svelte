<script>
	import CctvSnapshotImage from '$lib/components/CctvSnapshotImage.svelte';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import {
		formatActualLastUpdated,
		formatDmsPair,
		formatValue,
		getTelemetryUtcLabel,
		isOffHireStatus,
		isOnHireStatus,
		normalizeHireStatus,
		parseVesselDateTime,
		stripUtcLabel
	} from './fleetViewFormat.js';

	let {
		vessel,
		cctvSnapshots = [],
		cctvLoading = false,
		cctvError = '',
		canViewCctv = true,
		onClose = () => {},
		onDashboard = () => {}
	} = $props();

	let selectedCctvKey = $state('');

	let cctvItems = $derived(normalizeDetailCctvList(cctvSnapshots));
	let mainCctv = $derived(
		cctvItems.find((item) => item.key === selectedCctvKey) || cctvItems[0] || null
	);
	let cctvThumbnails = $derived(
		mainCctv ? cctvItems.filter((item) => item.key !== mainCctv.key) : []
	);
	let voyageProgress = $derived(getVoyageProgress(vessel));
	let sortedDetailEngines = $derived(sortVesselEngines(vessel?.engines || []));

	$effect(() => {
		if (!cctvItems.some((item) => item.key === selectedCctvKey)) {
			selectedCctvKey = cctvItems[0]?.key || '';
		}
	});

	function padDatePart(value) {
		return String(value ?? '').padStart(2, '0');
	}

	function normalizeUtcOffsetLabel(value) {
		const match = String(value ?? '').match(/UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i);
		if (!match) return '';

		const sign = match[1];
		const hour = Number(match[2]);
		const minute = Number(match[3] || 0);

		if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
		return minute > 0 ? `UTC${sign}${hour}:${padDatePart(minute)}` : `UTC${sign}${hour}`;
	}

	function formatCctvSnapshotTime(value, timestampValue = null) {
		if (!value) return '';

		if (typeof value === 'string') {
			const text = value.trim();
			const localMatch = text.match(
				/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?.*?(UTC\s*[+-]\s*\d{1,2}(?::?\d{2})?)/i
			);

			if (localMatch) {
				const [, day, month, year, hour, minute, second = '00', utcText] = localMatch;
				const utcLabel = normalizeUtcOffsetLabel(utcText);

				return `${padDatePart(day)}/${padDatePart(month)}/${year} ${padDatePart(hour)}:${padDatePart(minute)}:${padDatePart(second)}${utcLabel ? ` (${utcLabel})` : ''}`;
			}
		}

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			const timestamp = Number(timestampValue);
			if (!Number.isFinite(timestamp)) return String(value);

			const timestampDate = new Date(timestamp);
			if (Number.isNaN(timestampDate.getTime())) return String(value);

			return timestampDate.toLocaleString('id-ID', {
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
			});
		}

		return date.toLocaleString('id-ID', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatCctvFileSize(value) {
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

	function normalizeDetailCctvList(value) {
		const rawList = Array.isArray(value)
			? value
			: Array.isArray(value?.items)
				? value.items
				: Array.isArray(value?.cameras)
					? value.cameras
					: [];

		const flattenedList = rawList.flatMap((item) => {
			if (!Array.isArray(item?.cameras)) return [item];

			return item.cameras.flatMap((camera) => {
				const snapshots = Array.isArray(camera?.snapshots) ? camera.snapshots : [];

				if (!snapshots.length) {
					return [
						{
							...camera,
							vesselId: item?.vesselId,
							vesselName: item?.vesselName
						}
					];
				}

				return snapshots.map((snapshot) => ({
					...snapshot,
					camera_name: camera?.camera_name,
					cameraName: camera?.cameraName,
					camera_token: camera?.camera_token,
					vesselId: item?.vesselId,
					vesselName: item?.vesselName
				}));
			});
		});

		return flattenedList.map((item, index) => {
			const snapshotUrl =
				item?.presigned_url ||
				item?.presignedUrl ||
				item?.snapshotUrl ||
				item?.snapshot_url ||
				item?.url ||
				item?.streamUrl ||
				'';
			const capturedAt =
				item?.captured_at || item?.capturedAt || item?.updatedAt || item?.timestamp || '';
			const fileSize = Number(item?.file_size ?? item?.fileSize);
			const name = item?.camera_name || item?.cameraName || item?.name || `CCTV ${index + 1}`;

			return {
				key:
					item?.camera_token ||
					item?.cameraToken ||
					name ||
					`${snapshotUrl || item?.file_path || item?.filePath || 'cctv'}-${capturedAt || index}`,
				name,
				location: item?.location || item?.position || item?.file_path || item?.filePath || '-',
				url: snapshotUrl,
				capturedAt,
				capturedAtText: formatCctvSnapshotTime(capturedAt, item?.timestamp),
				fileSizeText: formatCctvFileSize(fileSize),
				online: Boolean(snapshotUrl)
			};
		});
	}

	function selectDetailCctv(cctv) {
		if (!cctv?.key) return;
		selectedCctvKey = cctv.key;
	}

	function formatMissingValue(value, suffix = '') {
		if (value === null || value === undefined || value === '' || value === '-') {
			return '-';
		}

		const number = Number(value);

		if (!Number.isFinite(number)) {
			return `${value}${suffix}`;
		}

		return `${number}${suffix}`;
	}

	function formatOnlineStatus(value) {
		if (value === true) return 'Online';
		if (value === false) return 'Offline';
		return '-';
	}

	function formatTelemetryTime(value) {
		return stripUtcLabel(formatValue(value, '-'));
	}

	function getLatestConnectionEvent(vessel) {
		const connectedAt = parseVesselDateTime(vessel?.lastConnectTime);
		const disconnectedAt = parseVesselDateTime(vessel?.lastDisconnectTime);

		if (!connectedAt && !disconnectedAt) return null;
		if (connectedAt && !disconnectedAt) return 'connected';
		if (!connectedAt && disconnectedAt) return 'disconnected';

		if (connectedAt.getTime() === disconnectedAt.getTime()) return null;
		return connectedAt > disconnectedAt ? 'connected' : 'disconnected';
	}

	function formatObservedAt(value) {
		if (!value || value === '-') return '-';

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) {
			return value;
		}

		return date.toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	function getVoyageProgress(vessel) {
		const progress = vessel?.voyageProgress;

		if (!progress) return null;

		const percentage = Number(progress.voyagePercentage ?? 0);

		return {
			voyageName: progress.voyageName ?? '-',
			voyagePercentage: Number.isFinite(percentage) ? percentage : 0,
			assignedBy: progress.assignedBy ?? '-'
		};
	}

	function formatVoyagePercentage(value) {
		const number = Number(value);

		if (!Number.isFinite(number)) return '0%';

		return `${Math.max(0, Math.min(100, number)).toFixed(1)}%`;
	}

	function clampPercentage(value) {
		const number = Number(value);

		if (!Number.isFinite(number)) return 0;

		return Math.max(0, Math.min(100, number));
	}

	function normalizeEngineName(value) {
		return String(value || '')
			.replace(/RPM/gi, '')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function getEngineDisplayName(engine = {}) {
		return engine?.engineName || engine?.name || engine?.engineKeyThingsboard || engine?.key || '-';
	}

	function getEngineSortRank(engine = {}) {
		const name = normalizeEngineName(getEngineDisplayName(engine));

		if (/^ME\b|MAIN ENGINE|\bME PORT\b|\bME STBD\b|\bME CENTER\b/.test(name)) return 0;
		if (/^AE\b|AUX|GENSET/.test(name)) return 1;
		return 2;
	}

	function sortVesselEngines(engines = []) {
		if (!Array.isArray(engines)) return [];

		return [...engines].sort((left, right) => {
			const rankDiff = getEngineSortRank(left) - getEngineSortRank(right);
			if (rankDiff !== 0) return rankDiff;

			return getEngineDisplayName(left).localeCompare(getEngineDisplayName(right), undefined, {
				numeric: true,
				sensitivity: 'base'
			});
		});
	}

	function getLiveEngineRpm(vessel, configEngine) {
		const liveEngines = Array.isArray(vessel?.liveEngines) ? vessel.liveEngines : [];

		const configName = normalizeEngineName(
			configEngine?.engineName ||
				configEngine?.name ||
				configEngine?.engineKeyThingsboard ||
				configEngine?.key
		);

		const found = liveEngines.find((item) => {
			const liveName = normalizeEngineName(item?.name || item?.engineName);
			return liveName === configName || liveName.includes(configName);
		});

		const rpm = found?.rpm ?? found?.value ?? found?.latestRpm;

		if (rpm === null || rpm === undefined || rpm === '') return '-';

		return `${rpm}`;
	}
</script>

<div class="detail-panel-header">
	<div class="detail-title-wrap">
		<span class="detail-status-dot" class:online={vessel.online} class:offline={!vessel.online}
		></span>

		<div class="detail-title-group">
			<span class="detail-eyebrow">Live vessel</span>
			<h2>{vessel.name}</h2>
			<p>{vessel.companyName || 'Company information unavailable'}</p>
		</div>

		<button type="button" class="detail-close-btn" onclick={onClose}>×</button>
	</div>

	<div class="detail-header-actions">
		<span
			class="detail-hire-pill"
			class:on-hire={isOnHireStatus(vessel.hireStatus)}
			class:off-hire={isOffHireStatus(vessel.hireStatus)}
			class:unknown-hire={!isOnHireStatus(vessel.hireStatus) && !isOffHireStatus(vessel.hireStatus)}
		>
			{normalizeHireStatus(vessel.hireStatus)}
		</span>

		<span
			class="detail-status-pill"
			class:online-pill={vessel.online}
			class:offline-pill={!vessel.online}
		>
			{formatOnlineStatus(vessel.online)}
		</span>

		<button
			type="button"
			class="detail-dashboard-btn"
			onclick={onDashboard}
			title="Open vessel dashboard"
		>
			<span>Dashboard</span>
			<span aria-hidden="true">↗</span>
		</button>

		<button type="button" class="detail-close-btn" onclick={onClose}>×</button>
	</div>
</div>

<div class="detail-panel-body">
	<button type="button" class="detail-dashboard-cta" onclick={onDashboard}>
		<span>Open dashboard</span>
		<span aria-hidden="true">↗</span>
	</button>

	{#if canViewCctv}
		<section class="detail-section detail-cctv-section">
			<div class="detail-section-heading">
				<div>
					<span class="detail-section-kicker">CCTV</span>
					<h3>Latest camera snapshot</h3>
				</div>
				<strong class="detail-cctv-count">
					{cctvLoading ? 'Loading...' : `${cctvItems.length} cameras`}
				</strong>
			</div>

			{#if cctvLoading}
				<div class="detail-cctv-layout">
					<div class="detail-cctv-box detail-cctv-main detail-cctv-skeleton" aria-hidden="true">
						<span></span>
						<strong></strong>
						<small></small>
					</div>
					<div class="detail-cctv-thumb-row" aria-hidden="true">
						{#each Array(3).keys() as index (index)}
							<div class="detail-cctv-box detail-cctv-thumb detail-cctv-skeleton">
								<strong></strong>
							</div>
						{/each}
					</div>
				</div>
			{:else if !cctvItems.length}
				<div class="detail-cctv-empty">
					{cctvError || 'Latest CCTV snapshot is not available for this vessel.'}
				</div>
			{:else}
				<div class="detail-cctv-layout">
					{#if mainCctv}
						<div
							class="detail-cctv-box detail-cctv-main"
							class:has-snapshot={Boolean(mainCctv.url)}
							class:offline={!mainCctv.online}
						>
							{#if mainCctv.url}
								<CctvSnapshotImage
									class="detail-cctv-img"
									src={mainCctv.url}
									filePath={mainCctv.location}
									alt={`${mainCctv.name} latest snapshot`}
									loading="eager"
								/>
							{/if}

							<div class="detail-cctv-content">
								<strong>{mainCctv.name}</strong>
								{#if mainCctv.capturedAtText}
									<span>{mainCctv.capturedAtText}</span>
								{/if}
								{#if mainCctv.fileSizeText}
									<small>{mainCctv.fileSizeText}</small>
								{/if}
							</div>
						</div>
					{/if}

					{#if cctvThumbnails.length}
						<div class="detail-cctv-thumb-row" aria-label="CCTV camera list">
							{#each cctvThumbnails as cctv (cctv.key)}
								<button
									type="button"
									class="detail-cctv-box detail-cctv-thumb"
									class:has-snapshot={Boolean(cctv.url)}
									class:offline={!cctv.online}
									onclick={() => selectDetailCctv(cctv)}
									title={`Show ${cctv.name}`}
								>
									{#if cctv.url}
										<CctvSnapshotImage
											class="detail-cctv-img"
											src={cctv.url}
											filePath={cctv.location}
											alt={`${cctv.name} latest snapshot`}
											loading="lazy"
										/>
									{/if}

									<div class="detail-cctv-content">
										<strong>{cctv.name}</strong>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<section class="detail-section">
		<div class="detail-section-heading">
			<div>
				<span class="detail-section-kicker">Telemetry</span>
				<h3>Operational snapshot</h3>
			</div>
			<div class="detail-time-stack">
				<span class="detail-utc-badge">{getTelemetryUtcLabel(vessel)}</span>
			</div>
		</div>

		<div class="detail-hero-metrics">
			<div class="detail-hero-metric">
				<span>Speed</span>
				<strong>{formatMissingValue(vessel.speed)}</strong>
				<small>knots</small>
			</div>
			<div class="detail-hero-metric">
				<span>Heading</span>
				<strong>{formatMissingValue(vessel.heading, '°')}</strong>
				<small>course</small>
			</div>
		</div>

		<div class="detail-grid two-col">
			<div class="detail-item detail-updated-item">
				<span>Last Updated</span>
				<strong>{formatActualLastUpdated(vessel.lastUpdated)}</strong>
			</div>

			<div
				class="detail-item connection-time-item"
				class:latest-connected={getLatestConnectionEvent(vessel) === 'connected'}
			>
				<span>Last Connect</span>
				<strong>{formatTelemetryTime(vessel.lastConnectTime)}</strong>
			</div>

			<div
				class="detail-item connection-time-item"
				class:latest-disconnected={getLatestConnectionEvent(vessel) === 'disconnected'}
			>
				<span>Last Disconnect</span>
				<strong>{formatTelemetryTime(vessel.lastDisconnectTime)}</strong>
			</div>

			<div class="detail-item coordinates-detail-item">
				<span>Coordinates</span>
				<strong>
					<CopyableCoordinate
						value={`${formatMissingValue(vessel.latitude ?? vessel.lat)}, ${formatMissingValue(vessel.longitude ?? vessel.lng)}`}
						display={`${formatMissingValue(vessel.latitude ?? vessel.lat)}, ${formatMissingValue(vessel.longitude ?? vessel.lng)}`}
						label="latitude and longitude"
						compact
						class="coordinate-pair-copy"
					/>
				</strong>
				<small class="coordinate-dms">
					{formatDmsPair(vessel.latitude ?? vessel.lat, vessel.longitude ?? vessel.lng)}
				</small>
			</div>
		</div>
	</section>

	<section class="detail-section compact-voyage-section">
		<div class="detail-section-heading">
			<div>
				<span class="detail-section-kicker">Route</span>
				<h3>Voyage progress</h3>
			</div>
		</div>

		{#if voyageProgress}
			<div class="voyage-progress-mini">
				<div class="voyage-progress-mini-top">
					<strong>{voyageProgress.voyageName}</strong>
					<span>{formatVoyagePercentage(voyageProgress.voyagePercentage)}</span>
				</div>

				<div class="voyage-progress-track">
					<div
						class="voyage-progress-fill"
						style={`width: ${clampPercentage(voyageProgress.voyagePercentage)}%`}
					></div>
				</div>

				<div class="voyage-progress-mini-bottom">
					Assigned by {voyageProgress.assignedBy}
				</div>
			</div>
		{:else}
			<div class="empty-voyage">No voyage plan / progress available for this vessel.</div>
		{/if}
	</section>

	<section class="detail-section">
		<div class="detail-section-heading">
			<div>
				<span class="detail-section-kicker">Machinery</span>
				<h3>Engine RPM</h3>
			</div>
		</div>

		<div class="simple-table">
			{#if sortedDetailEngines.length}
				{#each sortedDetailEngines as engine, index (engine.key ?? engine.name ?? index)}
					<div class="simple-row">
						<span>{getEngineDisplayName(engine)}</span>
						<strong>
							{getLiveEngineRpm(vessel, engine)}
						</strong>
					</div>
				{/each}
			{:else}
				<div class="empty-voyage">Engine list is not available.</div>
			{/if}
		</div>
	</section>

	<section class="detail-section">
		<div class="detail-section-heading">
			<div>
				<span class="detail-section-kicker">Environment</span>
				<h3>Weather & ocean current</h3>
			</div>
		</div>

		{#if vessel.weather?.current}
			<div class="weather-current">
				<div class="weather-icon">🌤️</div>

				<div>
					<strong>{vessel.weather.current.temp_c}°C</strong>
					<span>{vessel.weather.current.condition || '-'}</span>
				</div>

				<div class="weather-meta">
					<strong
						>{vessel.weather.current.wind_dir || '-'}
						{vessel.weather.current.wind_speed_kt || '-'} kt</strong
					>
					<span
						>{vessel.weather.current.humidity || '-'}% · {vessel.weather.current.pressure_hpa ||
							'-'} hPa</span
					>
				</div>
			</div>
		{:else}
			<div class="empty-voyage">Weather is not available.</div>
		{/if}
		<div class="environment-divider"></div>

		{#if vessel.oceanCurrent?.current}
			<div class="simple-table ocean-current-card">
				<div class="simple-row">
					<span>Speed</span>
					<strong>{vessel.oceanCurrent.current.speed_kph} kph</strong>
				</div>

				<div class="simple-row">
					<span>Direction</span>
					<strong>
						{vessel.oceanCurrent.current.direction_to}
						{vessel.oceanCurrent.current.direction_to_deg}°
					</strong>
				</div>

				<div class="simple-row ocean-observed-row">
					<span>Observed At</span>
					<strong>{formatObservedAt(vessel.oceanCurrent.current.observed_at)}</strong>
				</div>
			</div>
		{:else}
			<div class="empty-voyage">Ocean current is not available.</div>
		{/if}
	</section>
</div>
