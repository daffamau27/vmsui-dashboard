<script>
	import { onDestroy, tick, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { getLatestCctvSnapshots, getVesselDashboard } from '$lib/api/dashboardApi.js';
	import { getFleetAssets } from '$lib/api/fleetApi.js';
	import { apiRequest } from '$lib/api/authApi.js';
	import { addMapTileLayer } from '$lib/utils/mapStyle.js';
	import { addLeafletZoomAndScale } from '$lib/utils/leafletControls.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import VesselDashboardHeader from './VesselDashboardHeader.svelte';
	import VesselDashboardCctv from './VesselDashboardCctv.svelte';
	import VesselDashboardMap from './VesselDashboardMap.svelte';
	import VesselDashboardInfoPanel from './VesselDashboardInfoPanel.svelte';
	import VesselDashboardRpmPanel from './VesselDashboardRpmPanel.svelte';
	import VesselDashboardSummary from './VesselDashboardSummary.svelte';
	import VesselDashboardEnvironment from './VesselDashboardEnvironment.svelte';
	import VesselDashboardFuel from './VesselDashboardFuel.svelte';
	import './vessel-dashboard-page.css';
	import { getAssetIconUrl, getAssetTypeLabel, getAssetTypeValue } from '$lib/utils/assetIcons.js';
	import {
		addMapZonesToLeafletMap,
		isZoneAsset,
		normalizeMapZonesFromAssets
	} from '$lib/utils/mapZones.js';
	import {
		createCopyableCoordinateHtml,
		handleCoordinateCopyClick
	} from '$lib/utils/coordinateClipboard.js';
	import { sortByAlpha } from '$lib/utils/alphaSort.js';

	let loading = $state(false);
	let error = $state('');
	let dashboardData = $state(null);
	let cctvSnapshots = $state([]);
	let cctvSnapshotsLoading = $state(false);
	let cctvSnapshotsError = $state('');
	let selectedDashboardCctvKey = $state('');
	let dashboardAssets = $state([]);
	let dashboardZones = $state([]);
	let dashboardAssetsLoading = $state(false);
	let dashboardAssetsError = $state('');

	let currentUser = $state(null);
	let currentUserLoading = $state(false);
	let currentUserError = $state('');

	let { active = false } = $props();
	let lastDashboardLoadKey = $state('');
	let dashboardRequestId = 0;
	let dashboardRequestInFlight = false;
	const DASHBOARD_POLL_INTERVAL_MS = 60_000;

	let dashboardMapContainer = $state(null);
	let dashboardMap = null;
	let L = null;
	let dashboardMapInitializing = false;
	let vesselMarker = null;
	let dashboardAssetMarkers = new Map();
	let dashboardAssetBoundaryCircles = new Map();
	let dashboardZoneLayerGroup = null;
	let lastDashboardMapVesselId = null;

	let showWindParticles = $state(true);
	let windParticleLayer = null;
	let windCanvas = null;
	let windContext = null;
	let windParticles = [];
	let windFrame = null;
	let windLastFrameAt = 0;

	let showCurrentParticles = $state(true);
	let currentParticleLayer = null;
	let currentCanvas = null;
	let currentContext = null;
	let currentParticles = [];
	let currentFrame = null;
	let currentLastFrameAt = 0;

	const WIND_PARTICLE_MIN_COUNT = 130;
	const WIND_PARTICLE_MAX_COUNT = 460;
	const WIND_PARTICLE_MAX_AGE = 90;
	const WIND_PARTICLE_FRAME_INTERVAL_MS = 28;
	const WIND_CANVAS_BUFFER_PX = 320;
	const WIND_PARTICLE_STEP_MULTIPLIER = 1.55;
	const WIND_PARTICLE_TRAIL_FADE_ALPHA = 0.16;
	const WIND_PARTICLE_LINE_WIDTH = 1.15;

	let windCanvasWidth = 0;
	let windCanvasHeight = 0;
	let windCanvasBuffer = 0;

	const CURRENT_INFLUENCE_RADIUS_METERS = 120000;
	const CURRENT_PARTICLE_MIN_COUNT = 120;
	const CURRENT_PARTICLE_MAX_COUNT = 420;
	const CURRENT_PARTICLE_MAX_AGE = 140;
	const CURRENT_PARTICLE_FRAME_INTERVAL_MS = 32;
	const CURRENT_CANVAS_BUFFER_PX = 320;
	const CURRENT_PARTICLE_STEP_MULTIPLIER = 1.18;
	const CURRENT_PARTICLE_TRAIL_FADE_ALPHA = 0.08;
	const CURRENT_PARTICLE_LINE_WIDTH = 1.25;

	let currentCanvasWidth = 0;
	let currentCanvasHeight = 0;
	let currentCanvasBuffer = 0;

	const CARDINAL_WIND_DEGREES = {
		N: 0,
		NNE: 22.5,
		NE: 45,
		ENE: 67.5,
		E: 90,
		ESE: 112.5,
		SE: 135,
		SSE: 157.5,
		S: 180,
		SSW: 202.5,
		SW: 225,
		WSW: 247.5,
		W: 270,
		WNW: 292.5,
		NW: 315,
		NNW: 337.5
	};

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;
		currentUserError = '';

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			currentUser = response?.data || response?.user || response || null;

			console.log('[CURRENT_USER_PERMISSION_DASHBOARD]', currentUser);

			return currentUser;
		} catch (err) {
			console.error('[CURRENT_USER_PERMISSION_DASHBOARD_ERROR]', err);
			currentUserError = err?.message || 'Failed to load user permissions.';
			currentUser = null;
			return null;
		} finally {
			currentUserLoading = false;
		}
	}

	function hasPermissionForUser(user, permissionKey) {
		if (!permissionKey) return true;

		const permissionAccess = user?.permissionAccess || {};
		const mode = permissionAccess?.mode;

		if (mode === 'all') return true;

		if (mode === 'selected') {
			const permissions = Array.isArray(permissionAccess?.permissions)
				? permissionAccess.permissions
				: [];

			return permissions.includes(permissionKey);
		}

		return false;
	}

	function hasPermission(permissionKey) {
		return hasPermissionForUser(currentUser, permissionKey);
	}

	function normalizeEngineName(value) {
		return String(value || '')
			.replace(/RPM/gi, '')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function getLiveEnginesFromVessel(vessel) {
		if (Array.isArray(vessel?.liveEngines)) return vessel.liveEngines;
		if (Array.isArray(vessel?.rawLive?.engines)) return vessel.rawLive.engines;

		return [];
	}

	function getConfigEnginesFromVessel(vessel) {
		if (Array.isArray(vessel?.engines)) return vessel.engines;
		if (Array.isArray($selectedVesselInfo?.engines)) return $selectedVesselInfo.engines;

		return [];
	}

	function getLiveRpmByConfigEngine(vessel, configEngine) {
		const liveEngines = getLiveEnginesFromVessel(vessel);

		const configName = normalizeEngineName(
			configEngine?.engineName ||
				configEngine?.name ||
				configEngine?.engineKeyThingsboard ||
				configEngine?.key
		);

		const found = liveEngines.find((item) => {
			const liveName = normalizeEngineName(item?.name || item?.engineName);
			if (!configName || !liveName) return false;
			return (
				liveName === configName || liveName.includes(configName) || configName.includes(liveName)
			);
		});

		const rpm = Number(found?.rpm ?? found?.value ?? found?.latestRpm);

		return Number.isFinite(rpm) ? rpm : null;
	}

	function isMissingValue(value) {
		return value === null || value === undefined || value === '' || value === '-';
	}

	function formatOnlineStatus(value, fallbackData = null) {
		if (value === true) return true;
		if (value === false) return false;

		const receivedMinutes = Number(fallbackData?.dataReceivedStats?.received_minutes);
		if (Number.isFinite(receivedMinutes) && receivedMinutes > 0) return true;

		return Boolean(
			fallbackData?.updatedAt || fallbackData?.localTime || fallbackData?.vesselLocalTime
		);
	}

	function normalizeCctvList(value) {
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
			const statusText = String(item?.status || (item?.online === false ? 'Offline' : 'Live'));
			const snapshotUrl =
				item?.presigned_url ||
				item?.presignedUrl ||
				item?.snapshotUrl ||
				item?.snapshot_url ||
				item?.url ||
				item?.streamUrl ||
				'';
			const capturedAt = item?.captured_at || item?.capturedAt || item?.updatedAt || '';
			const fileSize = Number(item?.file_size ?? item?.fileSize);

			return {
				key:
					item?.camera_token ||
					item?.cameraToken ||
					item?.camera_name ||
					item?.cameraName ||
					item?.name ||
					`${snapshotUrl || item?.file_path || item?.filePath || 'cctv'}-${capturedAt || index}`,
				name: item?.camera_name || item?.cameraName || item?.name || `CCTV ${index + 1}`,
				status: statusText,
				location: item?.location || item?.position || item?.file_path || item?.filePath || '-',
				url: snapshotUrl,
				capturedAt,
				capturedAtText: formatCctvSnapshotTime(capturedAt),
				fileSize: Number.isFinite(fileSize) ? fileSize : null,
				fileSizeText: formatFileSize(fileSize),
				online:
					item?.online !== false && statusText.toLowerCase() !== 'offline' && Boolean(snapshotUrl)
			};
		});
	}

	function padCctvDatePart(value) {
		return String(value).padStart(2, '0');
	}

	function formatCctvDateParts(year, month, day, hour, minute, second) {
		const datePart = `${padCctvDatePart(day)}/${padCctvDatePart(month)}/${year}`;

		if (hour === undefined || hour === null || hour === '') {
			return datePart;
		}

		const timePart = `${padCctvDatePart(hour)}:${padCctvDatePart(minute)}:${padCctvDatePart(second ?? '00')}`;

		return `${datePart} ${timePart}`;
	}

	function normalizeCctvUtcLabel(value) {
		if (!value) return '';

		const match = String(value).match(/UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i);
		if (!match) return '';

		const [, sign, hours, minutes] = match;
		const hourPart = String(Number(hours));
		const minutePart = minutes ? `:${minutes}` : '';

		return `UTC${sign}${hourPart}${minutePart}`;
	}

	function formatCctvSnapshotTime(value) {
		if (!value) return '';

		if (typeof value === 'string') {
			const text = value.trim();

			// API sends "DD/MM/YYYY HH:MM:SS (UTC+X)". Parse it explicitly so the
			// day/month are never swapped by the runtime's MM/DD/YYYY default.
			const localMatch = text.match(
				/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
			);

			if (localMatch) {
				const [, day, month, year, hour, minute, second] = localMatch;
				const formatted = formatCctvDateParts(year, month, day, hour, minute, second);
				const utcLabel = normalizeCctvUtcLabel(text);

				return utcLabel ? `${formatted} (${utcLabel})` : formatted;
			}
		}

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return String(value);

		return formatCctvDateParts(
			date.getFullYear(),
			date.getMonth() + 1,
			date.getDate(),
			date.getHours(),
			date.getMinutes(),
			date.getSeconds()
		);
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

	function toNumber(value, fallback = 0) {
		const number = Number(value);
		return Number.isFinite(number) ? number : fallback;
	}

	function formatNumber(value, digits = 1, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;
		return number.toFixed(digits);
	}

	function getVesselHeading(data, vessel) {
		return toNumber(data?.course ?? data?.heading ?? vessel?.course ?? vessel?.heading, null);
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function normalizeDashboardAsset(asset = {}) {
		if (isZoneAsset(asset)) return null;

		const latitude = Number(asset.latitude ?? asset.lat);
		const longitude = Number(asset.longitude ?? asset.lng);

		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
		if (latitude === 0 && longitude === 0) return null;

		const id = asset.id ?? asset.assetId ?? `${latitude},${longitude}`;

		return {
			...asset,
			id,
			assetId: asset.assetId ?? asset.asset_id ?? String(id),
			name: asset.assetName ?? asset.name ?? asset.thingsboardName ?? `Asset ${id}`,
			assetName: asset.assetName ?? asset.name ?? asset.thingsboardName ?? `Asset ${id}`,
			assetType: getAssetTypeValue(asset),
			latitude,
			longitude
		};
	}

	function rebuildDashboardZoneLayer() {
		if (!dashboardMap || !L) return;

		if (dashboardZoneLayerGroup) {
			dashboardZoneLayerGroup.clearLayers();
			dashboardZoneLayerGroup.remove();
			dashboardZoneLayerGroup = null;
		}

		dashboardZoneLayerGroup = addMapZonesToLeafletMap(L, dashboardMap, dashboardZones, {
			paneName: 'dashboardZonePane',
			zIndex: 355
		});
	}

	function formatLiter(value, digits = 2) {
		const number = Number(value);
		if (!Number.isFinite(number)) return '0.00 L';
		return `${number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		})} L`;
	}

	function normalizeFuelConsumptionSource(value) {
		const normalized = String(value || '')
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '_');

		if (['fm', 'fms'].includes(normalized)) return 'fm';
		if (['ecu'].includes(normalized)) return 'ecu';
		if (['ems_internal', 'vms'].includes(normalized)) return 'ems_internal';
		if (['ems_external', 'ems'].includes(normalized)) return 'ems_external';

		return normalized || '';
	}

	function getFuelSourceLabel(source) {
		const normalized = normalizeFuelConsumptionSource(source);

		if (normalized === 'fm') return 'FM';
		if (normalized === 'ecu') return 'ECU';
		if (normalized === 'ems_internal') return shouldShowVmsFuelLabel ? 'VMS' : 'EMS';
		if (normalized === 'ems_external') return 'EMS';

		return normalized ? normalized.toUpperCase() : 'Fuel';
	}

	function getDashboardConsumptionForSource(source, legacyValue = null) {
		const normalized = normalizeFuelConsumptionSource(source);
		const activeSource = normalizeFuelConsumptionSource(dashboardData?.consumptionSource);
		const sourceValue =
			activeSource && activeSource === normalized ? dashboardData?.consumptionLiter : null;

		if (!isMissingValue(sourceValue)) return sourceValue;
		return legacyValue;
	}

	function normalizeStatus(value) {
		return value ? 'online' : 'offline';
	}

	function findEngineRpm(configEngine) {
		const rpm = getLiveRpmByConfigEngine(currentVessel, configEngine);

		return {
			value: Number.isFinite(rpm) ? rpm : null,
			status: Number.isFinite(rpm) && rpm > 0 ? 'online' : 'offline',
			lastData: currentVessel?.lastUpdated || currentVessel?.lastConnectTime || '-'
		};
	}

	let currentVessel = $derived({
		...($selectedVesselInfo || {}),
		...(dashboardData || {}),

		// engine configuration remains from selected vessel
		engines: Array.isArray($selectedVesselInfo?.engines)
			? $selectedVesselInfo.engines
			: Array.isArray(dashboardData?.engines)
				? dashboardData.engines
				: [],

		liveEngines: Array.isArray(dashboardData?.engines) ? dashboardData.engines : []
	});

	let vesselInfo = $derived({
		vesselId: $selectedVesselId,
		vesselName:
			dashboardData?.vesselName ||
			dashboardData?.vessel_name ||
			currentVessel?.name ||
			currentVessel?.vesselName ||
			'Selected Vessel',

		companyName: currentVessel?.companyName || '-',
		deviceId: dashboardData?.deviceId || currentVessel?.deviceId || currentVessel?.device_id || '-',
		timezone: dashboardData?.timezone || currentVessel?.timezone || '-',

		latitude: toNumber(
			dashboardData?.latitude ?? currentVessel?.lat ?? currentVessel?.latitude,
			null
		),

		longitude: toNumber(
			dashboardData?.longitude ?? currentVessel?.lng ?? currentVessel?.longitude,
			null
		),
		heading: getVesselHeading(dashboardData, currentVessel),

		online: formatOnlineStatus(dashboardData?.online ?? currentVessel?.online, dashboardData),

		vesselLocalTime:
			dashboardData?.vesselLocalTime ||
			currentVessel?.lastUpdated ||
			currentVessel?.lastConnectTime ||
			'-',

		localTime:
			dashboardData?.localTime ||
			currentVessel?.lastUpdated ||
			currentVessel?.lastConnectTime ||
			'-',

		currentSpeed:
			dashboardData?.currentSpeed !== null && dashboardData?.currentSpeed !== undefined
				? `${formatNumber(dashboardData.currentSpeed, 1, '-')} knot`
				: currentVessel?.speed !== null && currentVessel?.speed !== undefined
					? `${formatNumber(currentVessel.speed, 1, '-')} knot`
					: '-',

		weatherForecast: dashboardData?.weatherForecast?.current
			? `${formatNumber(dashboardData.weatherForecast.current.temp_c, 1)}°C · ${dashboardData.weatherForecast.current.condition || '-'}`
			: currentVessel?.weather?.current
				? `${formatNumber(currentVessel.weather.current.temp_c, 1)}°C · ${currentVessel.weather.current.condition || '-'}`
				: '-',

		weatherDetail:
			dashboardData?.weatherForecast?.current || currentVessel?.weather?.current || null,
		weatherTomorrow: dashboardData?.weatherForecast?.tomorrow || null,
		weatherDayAfter: dashboardData?.weatherForecast?.day_after || null,
		dataReceivedStats:
			dashboardData?.dataReceivedStats || dashboardData?.data_received_stats || null,
		oceanCurrent: dashboardData?.oceanCurrent || null
	});

	let rpmCards = $derived(
		(getConfigEnginesFromVessel(currentVessel).length
			? getConfigEnginesFromVessel(currentVessel)
			: Array.isArray(dashboardData?.engines)
				? dashboardData.engines
				: []
		).map((engine) => {
			const dashboardEngine = getDashboardEngineByConfig(engine) || engine;
			const liveRpm = getLiveRpmByConfigEngine(currentVessel, engine);

			const lastRpm = Number(
				dashboardEngine?.last_rpm ?? dashboardEngine?.lastRpm ?? dashboardEngine?.rpm ?? liveRpm
			);

			const avgRpm = Number(dashboardEngine?.avg_rpm ?? dashboardEngine?.avgRpm);

			const topRpm = Number(dashboardEngine?.top_rpm ?? dashboardEngine?.topRpm);

			return {
				title: `${engine.engineName || engine.name || engine.key || '-'} RPM`,
				value: Number.isFinite(lastRpm) ? lastRpm : null,
				status: Number.isFinite(lastRpm) && lastRpm > 0 ? 'online' : 'offline',
				lastData:
					dashboardData?.updatedAt ||
					currentVessel?.lastUpdated ||
					currentVessel?.lastConnectTime ||
					'-',
				avg: Number.isFinite(avgRpm) ? formatNumber(avgRpm, 0, '-') : '-',
				top: Number.isFinite(topRpm) ? formatNumber(topRpm, 0, '-') : '-'
			};
		})
	);

	let fodUsage = $derived(dashboardData?.fodUsage || {});
	let cctvItems = $derived(
		normalizeCctvList(cctvSnapshots.length ? cctvSnapshots : dashboardData?.cctv)
	);
	let mainDashboardCctv = $derived(
		cctvItems.find((item) => item.key === selectedDashboardCctvKey) || cctvItems[0] || null
	);
	let miniDashboardCctvItems = $derived(
		mainDashboardCctv ? cctvItems.filter((item) => item.key !== mainDashboardCctv.key) : []
	);

	function selectDashboardCctv(cctv) {
		if (!cctv?.key) return;
		selectedDashboardCctvKey = cctv.key;
	}

	let dataReceivedSummary = $derived({
		receivedMinutes:
			dashboardData?.dataReceivedStats?.received_minutes ??
			dashboardData?.dataReceivedStats?.receivedMinutes ??
			dashboardData?.data_received_stats?.received_minutes ??
			dashboardData?.data_received_stats?.receivedMinutes ??
			0,
		totalMinutes:
			dashboardData?.dataReceivedStats?.total_minutes ??
			dashboardData?.dataReceivedStats?.totalMinutes ??
			dashboardData?.data_received_stats?.total_minutes ??
			dashboardData?.data_received_stats?.totalMinutes ??
			1440,
		percentage:
			dashboardData?.dataReceivedStats?.percentage ??
			dashboardData?.data_received_stats?.percentage ??
			0
	});

	let weatherSummary = $derived({
		current: dashboardData?.weatherForecast?.current || null,
		tomorrow: dashboardData?.weatherForecast?.tomorrow || null,
		dayAfter: dashboardData?.weatherForecast?.day_after || null
	});

	let oceanCurrentSummary = $derived({
		current: dashboardData?.oceanCurrent?.current || null,
		tomorrow: dashboardData?.oceanCurrent?.tomorrow || null,
		dayAfter: dashboardData?.oceanCurrent?.day_after || null
	});

	let environmentForecastDays = $derived([
		{
			key: 'today',
			label: weatherSummary.current?.label || oceanCurrentSummary.current?.label || 'Today',
			weather: weatherSummary.current,
			current: oceanCurrentSummary.current
		},
		{
			key: 'tomorrow',
			label: weatherSummary.tomorrow?.label || oceanCurrentSummary.tomorrow?.label || 'Tomorrow',
			weather: weatherSummary.tomorrow,
			current: oceanCurrentSummary.tomorrow
		},
		{
			key: 'day-after',
			label: weatherSummary.dayAfter?.label || oceanCurrentSummary.dayAfter?.label || 'Day After',
			weather: weatherSummary.dayAfter,
			current: oceanCurrentSummary.dayAfter
		}
	]);

	let speedSummary = $derived({
		topSpeed:
			dashboardData?.topSpeed !== null && dashboardData?.topSpeed !== undefined
				? `${formatNumber(dashboardData.topSpeed, 1, '0.0')} knot`
				: '-',

		averageSpeed:
			dashboardData?.avgSpeed !== null && dashboardData?.avgSpeed !== undefined
				? `${formatNumber(dashboardData.avgSpeed, 1, '0.0')} knot`
				: vesselInfo.currentSpeed,

		totalDistance:
			dashboardData?.totalDistance !== null && dashboardData?.totalDistance !== undefined
				? `${formatNumber(dashboardData.totalDistance, 2, '0.00')} NM`
				: '-'
	});

	let dashboardInfoCards = $derived([
		{
			key: 'latitude',
			label: 'Latitude',
			coordinate: {
				value: vesselInfo.latitude === null ? '-' : formatNumber(vesselInfo.latitude, 6),
				display: vesselInfo.latitude === null ? '-' : `${formatNumber(vesselInfo.latitude, 6)}°`
			}
		},
		{
			key: 'longitude',
			label: 'Longitude',
			coordinate: {
				value: vesselInfo.longitude === null ? '-' : formatNumber(vesselInfo.longitude, 6),
				display: vesselInfo.longitude === null ? '-' : `${formatNumber(vesselInfo.longitude, 6)}°`
			}
		},
		{
			key: 'vessel-time',
			label: 'Vessel Time',
			value: vesselInfo.vesselLocalTime === null ? '-' : vesselInfo.vesselLocalTime
		},
		{ key: 'local-time', label: 'Local Time', value: vesselInfo.localTime },
		{
			key: 'current-speed',
			label: 'Current Speed',
			value: vesselInfo.currentSpeed,
			highlight: true
		},
		{
			key: 'heading',
			label: 'Heading',
			value: vesselInfo.heading === null ? '-' : `${formatNumber(vesselInfo.heading, 1, '-')}°`
		},
		{ key: 'weather', label: 'Weather', value: vesselInfo.weatherForecast },
		{
			key: 'data-received',
			label: 'Data Received',
			value: `${dataReceivedSummary.receivedMinutes}/${dataReceivedSummary.totalMinutes} min · ${formatNumber(
				dataReceivedSummary.percentage,
				1,
				'0.0'
			)}%`
		},
		{
			key: 'ocean-current',
			label: 'Ocean Current',
			value: oceanCurrentSummary.current
				? `${formatNumber(oceanCurrentSummary.current.speed_kph, 1, '0.0')} kph · ${formatCurrentDirectionAngle(
						oceanCurrentSummary.current
					)}`
				: '-'
		}
	]);

	let canViewSpeedStatsTable = $derived(hasPermission('view_speed_stats_table'));

	let canViewTravelDistanceTable = $derived(hasPermission('view_travel_distance_table'));

	let dashboardSummaryCards = $derived([
		...(canViewSpeedStatsTable
			? [
					{ key: 'top-speed', label: 'Top Speed', value: speedSummary.topSpeed },
					{ key: 'average-speed', label: 'Average Speed', value: speedSummary.averageSpeed }
				]
			: []),
		...(canViewTravelDistanceTable
			? [{ key: 'total-distance', label: 'Total Distance', value: speedSummary.totalDistance }]
			: [])
	]);

	let dashboardForecastDays = $derived(
		environmentForecastDays.map((day) => ({
			key: day.key,
			label: day.label,
			weatherLabel: day.weather
				? day.key === 'today'
					? `${formatNumber(day.weather.temp_c, 1)}°C`
					: `${formatNumber(day.weather.temp_min_c, 1)}–${formatNumber(day.weather.temp_max_c, 1)}°C`
				: '-',
			weatherCondition: day.weather?.condition || '-',
			currentLabel: day.current ? `${formatNumber(day.current.speed_kph, 1)} kph` : '-',
			currentDirection: day.current ? formatCurrentDirectionAngle(day.current) : '-'
		}))
	);

	let dashboardWeatherCards = $derived([
		{
			key: 'current',
			label: 'Current',
			value: weatherSummary.current ? `${formatNumber(weatherSummary.current.temp_c, 1)}°C` : '-',
			condition: weatherSummary.current?.condition || '-'
		},
		{
			key: 'tomorrow',
			label: 'Tomorrow',
			value: weatherSummary.tomorrow
				? `${formatNumber(weatherSummary.tomorrow.temp_min_c, 1)}–${formatNumber(weatherSummary.tomorrow.temp_max_c, 1)}°C`
				: '-',
			condition: weatherSummary.tomorrow?.condition || '-'
		},
		{
			key: 'day-after',
			label: 'Day After',
			value: weatherSummary.dayAfter
				? `${formatNumber(weatherSummary.dayAfter.temp_min_c, 1)}–${formatNumber(weatherSummary.dayAfter.temp_max_c, 1)}°C`
				: '-',
			condition: weatherSummary.dayAfter?.condition || '-'
		}
	]);

	let dashboardCurrentCards = $derived(
		[
			{ key: 'current', fallbackLabel: 'Today', current: oceanCurrentSummary.current },
			{ key: 'tomorrow', fallbackLabel: 'Tomorrow', current: oceanCurrentSummary.tomorrow },
			{ key: 'day-after', fallbackLabel: 'Day After', current: oceanCurrentSummary.dayAfter }
		].map((item) => ({
			key: item.key,
			label: item.current?.label || item.fallbackLabel,
			value: item.current ? `${formatNumber(item.current.speed_kph, 1)} kph` : '-',
			direction: item.current ? formatCurrentDirectionAngle(item.current) : '-'
		}))
	);

	function getDashboardEngineByConfig(configEngine) {
		const dashboardEngines = Array.isArray(dashboardData?.engines) ? dashboardData.engines : [];

		const configName = normalizeEngineName(
			configEngine?.engineName ||
				configEngine?.name ||
				configEngine?.engineKeyThingsboard ||
				configEngine?.key
		);

		return dashboardEngines.find((item) => {
			const dashboardName = normalizeEngineName(item?.name || item?.engineName);
			if (!configName || !dashboardName) return false;
			return (
				dashboardName === configName ||
				dashboardName.includes(configName) ||
				configName.includes(dashboardName)
			);
		});
	}

	function normalizeWindDirectionDegrees(value) {
		if (value === null || value === undefined || value === '') return null;

		const numeric = Number(value);
		if (Number.isFinite(numeric)) {
			return ((numeric % 360) + 360) % 360;
		}

		const text = String(value).trim().toUpperCase().replace(/\s+/g, '');
		const numericMatch = text.match(/-?\d+(\.\d+)?/);

		if (numericMatch) {
			const parsed = Number(numericMatch[0]);
			return Number.isFinite(parsed) ? ((parsed % 360) + 360) % 360 : null;
		}

		return CARDINAL_WIND_DEGREES[text] ?? null;
	}

	function getCurrentDirectionDegrees(current = {}) {
		return normalizeWindDirectionDegrees(
			current?.direction_to_deg ??
				current?.directionToDeg ??
				current?.direction_deg ??
				current?.directionDegree ??
				current?.direction_to_degree ??
				current?.direction_to ??
				current?.direction
		);
	}

	function formatCurrentDirectionAngle(current = {}) {
		const degrees = getCurrentDirectionDegrees(current);

		if (degrees === null) return '-';

		return `${formatNumber(degrees, Number.isInteger(degrees) ? 0 : 1, '0')}°`;
	}

	function getDashboardMapCoordinates() {
		const lat = Number(vesselInfo?.latitude ?? currentVessel?.lat ?? currentVessel?.latitude);
		const lng = Number(vesselInfo?.longitude ?? currentVessel?.lng ?? currentVessel?.longitude);

		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
		if (lat === 0 && lng === 0) return null;

		return { lat, lng };
	}

	function getDashboardWeatherData() {
		return dashboardData?.weatherForecast?.current || currentVessel?.weather?.current || null;
	}

	function getDashboardOceanCurrentData() {
		return dashboardData?.oceanCurrent?.current || currentVessel?.oceanCurrent?.current || null;
	}

	function getWeatherWindSpeedKt(weather = {}) {
		const directKt = Number(
			weather?.wind_speed_kt ??
				weather?.windSpeedKt ??
				weather?.wind_kt ??
				weather?.wind_kts ??
				weather?.wind_knots
		);

		if (Number.isFinite(directKt)) return Math.max(0, Math.min(80, directKt));

		const kph = Number(weather?.wind_kph ?? weather?.windSpeedKph);
		if (Number.isFinite(kph)) return Math.max(0, Math.min(80, kph / 1.852));

		const mph = Number(weather?.wind_mph ?? weather?.windSpeedMph);
		if (Number.isFinite(mph)) return Math.max(0, Math.min(80, mph * 0.868976));

		const ms = Number(weather?.wind_ms ?? weather?.wind_mps ?? weather?.windSpeedMs);
		if (Number.isFinite(ms)) return Math.max(0, Math.min(80, ms * 1.94384));

		const fallback = Number(weather?.wind_speed ?? weather?.windSpeed);
		return Number.isFinite(fallback) ? Math.max(0, Math.min(80, fallback)) : 8;
	}

	function getSeaCurrentSpeedKt(current = {}) {
		const speedKph = Number(current?.speed_kph);

		if (!Number.isFinite(speedKph)) return 1.2;

		return Math.max(0.1, Math.min(12, speedKph / 1.852));
	}

	function getDashboardWindSourcePoints() {
		const coords = getDashboardMapCoordinates();
		const currentWeather = getDashboardWeatherData();

		if (!coords || !currentWeather) return [];

		const windFromDeg = normalizeWindDirectionDegrees(
			currentWeather.wind_degree ??
				currentWeather.wind_deg ??
				currentWeather.wind_dir_degree ??
				currentWeather.windDirectionDeg ??
				currentWeather.wind_dir ??
				currentWeather.windDirection
		);

		if (windFromDeg === null) return [];

		return [
			{
				lat: coords.lat,
				lng: coords.lng,
				directionToDeg: (windFromDeg + 180) % 360,
				speedKt: getWeatherWindSpeedKt(currentWeather)
			}
		];
	}

	function getDashboardCurrentSourcePoints() {
		const coords = getDashboardMapCoordinates();
		const current = getDashboardOceanCurrentData();

		if (!coords || !current) return [];

		const directionToDeg = normalizeWindDirectionDegrees(
			current.direction_to_deg ?? current.direction_to
		);

		if (directionToDeg === null) return [];

		return [
			{
				lat: coords.lat,
				lng: coords.lng,
				directionToDeg,
				speedKt: getSeaCurrentSpeedKt(current)
			}
		];
	}

	function setupDashboardMapPanes() {
		if (!dashboardMap) return;

		if (!dashboardMap.getPane('dashboardWindPane')) {
			dashboardMap.createPane('dashboardWindPane');
			dashboardMap.getPane('dashboardWindPane').style.zIndex = '420';
			dashboardMap.getPane('dashboardWindPane').style.pointerEvents = 'none';
		}

		if (!dashboardMap.getPane('dashboardCurrentPane')) {
			dashboardMap.createPane('dashboardCurrentPane');
			dashboardMap.getPane('dashboardCurrentPane').style.zIndex = '430';
			dashboardMap.getPane('dashboardCurrentPane').style.pointerEvents = 'none';
		}

		if (!dashboardMap.getPane('dashboardAssetBoundaryPane')) {
			dashboardMap.createPane('dashboardAssetBoundaryPane');
			dashboardMap.getPane('dashboardAssetBoundaryPane').style.zIndex = '440';
			dashboardMap.getPane('dashboardAssetBoundaryPane').style.pointerEvents = 'none';
		}

		if (!dashboardMap.getPane('dashboardAssetPane')) {
			dashboardMap.createPane('dashboardAssetPane');
			dashboardMap.getPane('dashboardAssetPane').style.zIndex = '450';
			dashboardMap.getPane('dashboardAssetPane').style.pointerEvents = 'auto';
		}

		if (!dashboardMap.getPane('dashboardVesselPane')) {
			dashboardMap.createPane('dashboardVesselPane');
			dashboardMap.getPane('dashboardVesselPane').style.zIndex = '760';
			dashboardMap.getPane('dashboardVesselPane').style.pointerEvents = 'auto';
		}
	}

	function createDashboardVesselIcon() {
		if (!L) return null;

		const isOnline = vesselInfo.online !== false;

		return L.divIcon({
			className: `dashboard-vessel-leaflet-icon ${isOnline ? 'online' : 'offline'}`,
			html: `
        <img
          class="dashboard-vessel-marker-icon"
          src="/assets/vessel.png"
          alt="${vesselInfo.vesselName || 'Vessel'}"
          style="transform: rotate(${Number(vesselInfo.heading || 0)}deg) scaleX(1.16);"
        />
      `,
			iconSize: [28, 60],
			iconAnchor: [14, 30],
			popupAnchor: [0, -32]
		});
	}

	function createDashboardAssetIcon(asset) {
		if (!L) return null;

		const iconUrl = getAssetIconUrl(asset);
		const typeLabel = getAssetTypeLabel(asset);

		return L.divIcon({
			className: `dashboard-asset-leaflet-icon asset-type-${String(typeLabel).toLowerCase()}`,
			html: `
        <img
          class="dashboard-asset-marker-icon"
          src="${iconUrl}"
          alt="${escapeHtml(typeLabel)} asset"
          title="${escapeHtml(asset.assetName || asset.name)}"
        />
      `,
			iconSize: [32, 32],
			iconAnchor: [16, 16],
			popupAnchor: [0, -16]
		});
	}

	function createDashboardAssetPopupHtml(asset) {
		const typeLabel = getAssetTypeLabel(asset);
		const formattedLatitude = formatNumber(asset.latitude, 6);
		const formattedLongitude = formatNumber(asset.longitude, 6);

		return `
      <div class="dashboard-asset-popup">
        <div class="dashboard-asset-popup-hero">
          <div class="dashboard-asset-popup-icon" aria-hidden="true">
            <img src="${getAssetIconUrl(asset)}" alt="" />
          </div>
          <div class="dashboard-asset-popup-heading">
            <span>${escapeHtml(typeLabel)}</span>
            <strong>${escapeHtml(asset.assetName || asset.name || 'Asset')}</strong>
          </div>
          <em>${escapeHtml(typeLabel)}</em>
        </div>
        <div class="dashboard-asset-popup-grid">
          <div>
            <span>Asset ID</span>
            <strong>${escapeHtml(asset.id ?? asset.assetId ?? '-')}</strong>
          </div>
          <div>
            <span>Latitude</span>
            ${createCopyableCoordinateHtml(formattedLatitude, 'asset latitude')}
          </div>
          <div>
            <span>Longitude</span>
            ${createCopyableCoordinateHtml(formattedLongitude, 'asset longitude')}
          </div>
        </div>
      </div>
    `;
	}

	function clearDashboardAssetMarkers() {
		dashboardAssetMarkers.forEach((marker) => marker.remove());
		dashboardAssetMarkers = new Map();

		dashboardAssetBoundaryCircles.forEach((circle) => circle.remove());
		dashboardAssetBoundaryCircles = new Map();
	}

	function buildDashboardAssetMarkers() {
		if (!dashboardMap || !L) return;

		clearDashboardAssetMarkers();

		dashboardAssets.forEach((asset) => {
			const lat = Number(asset.latitude);
			const lng = Number(asset.longitude);

			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
			if (lat === 0 && lng === 0) return;

			const assetId = String(asset.id ?? `${lat},${lng}`);

			const boundaryCircle = L.circle([lat, lng], {
				radius: 1000,
				pane: 'dashboardAssetBoundaryPane',
				interactive: false,
				stroke: true,
				color: '#f59e0b',
				weight: 2,
				opacity: 0.9,
				fill: true,
				fillColor: '#f59e0b',
				fillOpacity: 0.12,
				dashArray: '8 8',
				className: 'dashboard-asset-boundary-circle'
			}).addTo(dashboardMap);

			const marker = L.marker([lat, lng], {
				icon: createDashboardAssetIcon(asset),
				pane: 'dashboardAssetPane',
				zIndexOffset: 0,
				riseOnHover: true
			}).addTo(dashboardMap);

			marker.bindPopup(createDashboardAssetPopupHtml(asset), {
				closeButton: true,
				autoPan: true,
				maxWidth: 300,
				className: 'dashboard-asset-leaflet-popup'
			});

			dashboardAssetMarkers.set(assetId, marker);
			dashboardAssetBoundaryCircles.set(assetId, boundaryCircle);
		});
	}

	function createDashboardVesselPopupHtml() {
		const current = getDashboardOceanCurrentData();
		const weather = getDashboardWeatherData();

		return `
      <div class="dashboard-map-popup">
        <div class="dashboard-map-popup-title">${vesselInfo.vesselName || 'Vessel'}</div>
        <div class="dashboard-map-popup-row"><span>Status</span><strong>${vesselInfo.online ? 'Online' : 'Offline'}</strong></div>
        <div class="dashboard-map-popup-row"><span>Speed</span><strong>${vesselInfo.currentSpeed || '-'}</strong></div>
        <div class="dashboard-map-popup-row"><span>Heading</span><strong>${formatNumber(vesselInfo.heading, 1, '-')}°</strong></div>
        <div class="dashboard-map-popup-row"><span>Wind</span><strong>${weather?.wind_dir || '-'} ${weather?.wind_speed_kt || '-'} kt</strong></div>
        <div class="dashboard-map-popup-row"><span>Current</span><strong>${current ? `${formatNumber(current.speed_kph, 1, '0.0')} kph · ${formatCurrentDirectionAngle(current)}` : '-'}</strong></div>
      </div>
    `;
	}

	function updateDashboardMapMarker({ center = false } = {}) {
		if (!dashboardMap || !L) return;

		const coords = getDashboardMapCoordinates();
		if (!coords) return;

		const latLng = [coords.lat, coords.lng];
		const icon = createDashboardVesselIcon();

		if (!vesselMarker) {
			vesselMarker = L.marker(latLng, {
				icon,
				pane: 'dashboardVesselPane',
				zIndexOffset: 2000,
				riseOnHover: true
			}).addTo(dashboardMap);

			vesselMarker.bindPopup(createDashboardVesselPopupHtml(), {
				closeButton: true,
				autoPan: true,
				maxWidth: 260,
				className: 'dashboard-leaflet-popup'
			});

			dashboardMap.setView(latLng, 12);
			lastDashboardMapVesselId = String($selectedVesselId || '');
			return;
		}

		vesselMarker.setLatLng(latLng);
		vesselMarker.setIcon(icon);
		vesselMarker.setZIndexOffset(2000);
		vesselMarker.setPopupContent(createDashboardVesselPopupHtml());

		const vesselKey = String($selectedVesselId || '');
		if (center || vesselKey !== lastDashboardMapVesselId) {
			dashboardMap.setView(latLng, 12);
			lastDashboardMapVesselId = vesselKey;
		}
	}

	async function ensureDashboardMap() {
		if (!browser || dashboardMap || dashboardMapInitializing) return;

		dashboardMapInitializing = true;

		try {
			await tick();

			if (!dashboardMapContainer) return;

			if (!L) {
				L = await import('leaflet');
				await import('leaflet/dist/leaflet.css');
			}

			const coords = getDashboardMapCoordinates();
			const center = coords ? [coords.lat, coords.lng] : [-2.8, 114.5];

			dashboardMap = L.map(dashboardMapContainer, {
				zoomControl: false,
				attributionControl: true,
				preferCanvas: true
			}).setView(center, coords ? 12 : 5);

			addMapTileLayer(L, dashboardMap);
			addLeafletZoomAndScale(L, dashboardMap);

			setupDashboardMapPanes();
			rebuildDashboardZoneLayer();
			dashboardMapContainer.addEventListener('click', handleCoordinateCopyClick, true);
			buildDashboardAssetMarkers();

			if (active && showCurrentParticles) {
				addCurrentParticleLayer();
			}

			if (active && showWindParticles) {
				addWindParticleLayer();
			}

			updateDashboardMapMarker({ center: Boolean(coords) });

			setTimeout(() => {
				dashboardMap?.invalidateSize();
			}, 100);
		} finally {
			dashboardMapInitializing = false;
		}
	}

	function scheduleDashboardMapRefresh({ recreate = false, center = false } = {}) {
		if (!browser) return;

		setTimeout(async () => {
			if (!active || !canViewDailyPathMap) return;

			if (recreate && dashboardMap) {
				destroyDashboardMap();
			}

			await tick();

			if (!dashboardMapContainer) return;

			await ensureDashboardMap();

			if (!dashboardMap) return;

			dashboardMap.invalidateSize();
			updateDashboardMapMarker({ center });

			setTimeout(() => {
				if (!dashboardMap) return;

				dashboardMap.invalidateSize();
				updateDashboardMapMarker({ center });
			}, 120);
		}, 0);
	}

	function destroyDashboardMap() {
		removeCurrentParticleLayer();
		removeWindParticleLayer();
		clearDashboardAssetMarkers();

		if (dashboardZoneLayerGroup) {
			dashboardZoneLayerGroup.clearLayers();
			dashboardZoneLayerGroup.remove();
			dashboardZoneLayerGroup = null;
		}

		if (vesselMarker) {
			vesselMarker.remove();
			vesselMarker = null;
		}

		dashboardMapContainer?.removeEventListener?.('click', handleCoordinateCopyClick, true);

		if (dashboardMap) {
			dashboardMap.remove();
			dashboardMap = null;
		}

		lastDashboardMapVesselId = null;
	}

	function getWindParticleCount() {
		if (!dashboardMap) return WIND_PARTICLE_MIN_COUNT;

		const size = dashboardMap.getSize();
		const width = Math.max(size.x, windCanvasWidth || size.x);
		const height = Math.max(size.y, windCanvasHeight || size.y);
		const count = Math.round((width * height) / 7200);

		return Math.max(WIND_PARTICLE_MIN_COUNT, Math.min(WIND_PARTICLE_MAX_COUNT, count));
	}

	function resetWindParticle(particle = {}, randomAge = true) {
		if (!dashboardMap) return particle;

		const size = dashboardMap.getSize();
		const width = windCanvasWidth || size.x;
		const height = windCanvasHeight || size.y;

		particle.x = Math.random() * Math.max(1, width);
		particle.y = Math.random() * Math.max(1, height);
		particle.age = randomAge ? Math.floor(Math.random() * WIND_PARTICLE_MAX_AGE) : 0;
		particle.maxAge = WIND_PARTICLE_MAX_AGE + Math.floor(Math.random() * 44);
		particle.speedJitter = 0.82 + Math.random() * 0.78;
		particle.trailLength = 2.8 + Math.random() * 3.8;
		particle.alpha = 0.34 + Math.random() * 0.34;

		return particle;
	}

	function positionWindCanvas() {
		if (!dashboardMap || !L || !windCanvas) return;

		const topLeft = dashboardMap.containerPointToLayerPoint([-windCanvasBuffer, -windCanvasBuffer]);

		L.DomUtil.setPosition(windCanvas, topLeft);
	}

	function seedWindParticles(keepExisting = true) {
		const targetCount = getWindParticleCount();
		const nextParticles = keepExisting ? windParticles.slice(0, targetCount) : [];

		while (nextParticles.length < targetCount) {
			nextParticles.push(resetWindParticle({}, true));
		}

		windParticles = nextParticles;
	}

	function resizeWindCanvas({ reseed = true } = {}) {
		if (!browser || !dashboardMap || !windCanvas || !windContext) return;

		const size = dashboardMap.getSize();
		const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

		windCanvasBuffer = WIND_CANVAS_BUFFER_PX;
		windCanvasWidth = size.x + windCanvasBuffer * 2;
		windCanvasHeight = size.y + windCanvasBuffer * 2;

		positionWindCanvas();

		windCanvas.width = Math.max(1, Math.floor(windCanvasWidth * pixelRatio));
		windCanvas.height = Math.max(1, Math.floor(windCanvasHeight * pixelRatio));
		windCanvas.style.width = `${windCanvasWidth}px`;
		windCanvas.style.height = `${windCanvasHeight}px`;

		windContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

		if (reseed) {
			seedWindParticles(false);
		}
	}

	function getFallbackWindVector() {
		return {
			x: 0.94,
			y: -0.34,
			speed: 8
		};
	}

	function getWindVectorAtContainerPoint(point, sources = []) {
		if (!dashboardMap || !sources.length) return getFallbackWindVector();

		const latLng = dashboardMap.containerPointToLatLng([point.x, point.y]);
		let totalWeight = 0;
		let weightedX = 0;
		let weightedY = 0;
		let weightedSpeed = 0;

		sources.forEach((source) => {
			const distance = Math.max(18000, dashboardMap.distance(latLng, [source.lat, source.lng]));
			const weight = 1 / Math.pow(distance / 1000, 1.8);
			const angleRad = (source.directionToDeg * Math.PI) / 180;
			const speed = Math.max(1, source.speedKt || 8);

			weightedX += Math.sin(angleRad) * weight * speed;
			weightedY += -Math.cos(angleRad) * weight * speed;
			weightedSpeed += speed * weight;
			totalWeight += weight;
		});

		const magnitude = Math.hypot(weightedX, weightedY);

		if (!totalWeight || !magnitude) return getFallbackWindVector();

		return {
			x: weightedX / magnitude,
			y: weightedY / magnitude,
			speed: weightedSpeed / totalWeight
		};
	}

	function drawWindParticles() {
		if (
			!active ||
			!canViewDailyPathMap ||
			!dashboardMap ||
			!windCanvas ||
			!windContext ||
			!showWindParticles
		) {
			stopWindAnimation();
			return;
		}

		const size = dashboardMap.getSize();
		const canvasWidth = windCanvasWidth || size.x;
		const canvasHeight = windCanvasHeight || size.y;
		const sources = getDashboardWindSourcePoints();

		windContext.globalCompositeOperation = 'destination-out';
		windContext.fillStyle = `rgba(0, 0, 0, ${WIND_PARTICLE_TRAIL_FADE_ALPHA})`;
		windContext.fillRect(0, 0, canvasWidth, canvasHeight);

		windContext.globalCompositeOperation = 'source-over';

		if (!sources.length) return;

		windContext.lineCap = 'round';
		windContext.lineJoin = 'round';
		windContext.lineWidth = WIND_PARTICLE_LINE_WIDTH;
		windContext.shadowBlur = 2;
		windContext.shadowColor = 'rgba(255, 255, 255, 0.35)';

		windParticles.forEach((particle) => {
			const containerPoint = {
				x: particle.x - windCanvasBuffer,
				y: particle.y - windCanvasBuffer
			};

			const vector = getWindVectorAtContainerPoint(containerPoint, sources);
			const speed = Math.max(2, Math.min(34, vector.speed || 8));

			const velocity =
				(0.42 + speed * 0.045) * particle.speedJitter * WIND_PARTICLE_STEP_MULTIPLIER;

			const stepX = vector.x * velocity;
			const stepY = vector.y * velocity;
			const previousX = particle.x;
			const previousY = particle.y;
			const nextX = previousX + stepX;
			const nextY = previousY + stepY;
			const tailX = previousX - stepX * particle.trailLength;
			const tailY = previousY - stepY * particle.trailLength;

			particle.x = nextX;
			particle.y = nextY;
			particle.age += 1;

			const headAlpha = particle.alpha;
			const tailAlpha = Math.max(0.06, particle.alpha * 0.22);
			const gradient = windContext.createLinearGradient(tailX, tailY, nextX, nextY);

			gradient.addColorStop(0, `rgba(0, 0, 0, ${tailAlpha})`);
			gradient.addColorStop(0.55, `rgba(0, 0, 0, ${particle.alpha * 0.58})`);
			gradient.addColorStop(1, `rgba(0, 0, 0, ${headAlpha})`);

			windContext.beginPath();
			windContext.moveTo(tailX, tailY);
			windContext.lineTo(nextX, nextY);
			windContext.strokeStyle = gradient;
			windContext.stroke();

			if (
				particle.age > particle.maxAge ||
				particle.x < -40 ||
				particle.x > canvasWidth + 40 ||
				particle.y < -40 ||
				particle.y > canvasHeight + 40
			) {
				resetWindParticle(particle, false);
			}
		});

		windContext.shadowBlur = 0;
		windContext.globalCompositeOperation = 'source-over';
	}

	function handleWindMapMove() {
		positionWindCanvas();
	}

	function handleWindMapChange() {
		resizeWindCanvas({ reseed: true });
		drawWindParticles();
	}

	function startWindAnimation() {
		if (!browser || windFrame || !active || !canViewDailyPathMap || !showWindParticles) return;

		const animate = (timestamp) => {
			windFrame = requestAnimationFrame(animate);

			if (timestamp - windLastFrameAt < WIND_PARTICLE_FRAME_INTERVAL_MS) return;

			windLastFrameAt = timestamp;
			drawWindParticles();
		};

		windFrame = requestAnimationFrame(animate);
	}

	function stopWindAnimation() {
		if (!browser || !windFrame) return;

		cancelAnimationFrame(windFrame);
		windFrame = null;
		windLastFrameAt = 0;
	}

	function addWindParticleLayer() {
		if (
			!active ||
			!canViewDailyPathMap ||
			!showWindParticles ||
			!dashboardMap ||
			!L ||
			windParticleLayer
		)
			return;

		windParticleLayer = new L.Layer();

		windParticleLayer.onAdd = (targetMap) => {
			const pane = targetMap.getPane('dashboardWindPane') || targetMap.getPanes().overlayPane;

			windCanvas = L.DomUtil.create('canvas', 'wind-particle-canvas');
			windCanvas.setAttribute('aria-hidden', 'true');
			pane.appendChild(windCanvas);

			windContext = windCanvas.getContext('2d');

			targetMap.on('move zoom', handleWindMapMove);
			targetMap.on('dragend resize moveend zoomend viewreset', handleWindMapChange);

			resizeWindCanvas();
			startWindAnimation();
		};

		windParticleLayer.onRemove = (targetMap) => {
			targetMap.off('move zoom', handleWindMapMove);
			targetMap.off('dragend resize moveend zoomend viewreset', handleWindMapChange);
			stopWindAnimation();

			if (windCanvas?.parentNode) {
				windCanvas.parentNode.removeChild(windCanvas);
			}

			windCanvas = null;
			windContext = null;
			windParticles = [];
		};

		windParticleLayer.addTo(dashboardMap);
	}

	function removeWindParticleLayer() {
		if (windParticleLayer && dashboardMap) {
			dashboardMap.removeLayer(windParticleLayer);
		}

		windParticleLayer = null;
		stopWindAnimation();
	}

	function getCurrentParticleCount() {
		if (!dashboardMap) return CURRENT_PARTICLE_MIN_COUNT;

		const size = dashboardMap.getSize();
		const width = Math.max(size.x, currentCanvasWidth || size.x);
		const height = Math.max(size.y, currentCanvasHeight || size.y);
		const count = Math.round((width * height) / 10500);

		return Math.max(CURRENT_PARTICLE_MIN_COUNT, Math.min(CURRENT_PARTICLE_MAX_COUNT, count));
	}

	function resetCurrentParticle(particle = {}, randomAge = true) {
		if (!dashboardMap) return particle;

		const size = dashboardMap.getSize();
		const width = currentCanvasWidth || size.x;
		const height = currentCanvasHeight || size.y;

		particle.x = Math.random() * Math.max(1, width);
		particle.y = Math.random() * Math.max(1, height);
		particle.age = randomAge ? Math.floor(Math.random() * CURRENT_PARTICLE_MAX_AGE) : 0;
		particle.maxAge = CURRENT_PARTICLE_MAX_AGE + Math.floor(Math.random() * 60);
		particle.speedJitter = 0.72 + Math.random() * 0.56;
		particle.trailLength = 4.5 + Math.random() * 5.5;
		particle.alpha = 0.34 + Math.random() * 0.28;

		return particle;
	}

	function positionCurrentCanvas() {
		if (!dashboardMap || !L || !currentCanvas) return;

		const topLeft = dashboardMap.containerPointToLayerPoint([
			-currentCanvasBuffer,
			-currentCanvasBuffer
		]);

		L.DomUtil.setPosition(currentCanvas, topLeft);
	}

	function seedCurrentParticles(keepExisting = true) {
		const targetCount = getCurrentParticleCount();
		const nextParticles = keepExisting ? currentParticles.slice(0, targetCount) : [];

		while (nextParticles.length < targetCount) {
			nextParticles.push(resetCurrentParticle({}, true));
		}

		currentParticles = nextParticles;
	}

	function resizeCurrentCanvas({ reseed = true } = {}) {
		if (!browser || !dashboardMap || !currentCanvas || !currentContext) return;

		const size = dashboardMap.getSize();
		const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

		currentCanvasBuffer = CURRENT_CANVAS_BUFFER_PX;
		currentCanvasWidth = size.x + currentCanvasBuffer * 2;
		currentCanvasHeight = size.y + currentCanvasBuffer * 2;

		positionCurrentCanvas();

		currentCanvas.width = Math.max(1, Math.floor(currentCanvasWidth * pixelRatio));
		currentCanvas.height = Math.max(1, Math.floor(currentCanvasHeight * pixelRatio));
		currentCanvas.style.width = `${currentCanvasWidth}px`;
		currentCanvas.style.height = `${currentCanvasHeight}px`;

		currentContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

		if (reseed) {
			seedCurrentParticles(false);
		}
	}

	function getCurrentVectorAtContainerPoint(point, sources = []) {
		if (!dashboardMap || !sources.length) return null;

		const latLng = dashboardMap.containerPointToLatLng([point.x, point.y]);
		let totalWeight = 0;
		let weightedX = 0;
		let weightedY = 0;
		let weightedSpeed = 0;

		sources.forEach((source) => {
			const rawDistance = dashboardMap.distance(latLng, [source.lat, source.lng]);

			if (rawDistance > CURRENT_INFLUENCE_RADIUS_METERS) {
				return;
			}

			const distance = Math.max(25000, rawDistance);
			const weight = 1 / Math.pow(distance / 1000, 1.65);
			const angleRad = (source.directionToDeg * Math.PI) / 180;
			const speed = Math.max(0.1, source.speedKt || 1.2);

			weightedX += Math.sin(angleRad) * weight * speed;
			weightedY += -Math.cos(angleRad) * weight * speed;
			weightedSpeed += speed * weight;
			totalWeight += weight;
		});

		const magnitude = Math.hypot(weightedX, weightedY);

		if (!totalWeight || !magnitude) return null;

		return {
			x: weightedX / magnitude,
			y: weightedY / magnitude,
			speed: weightedSpeed / totalWeight
		};
	}

	function drawCurrentParticles() {
		if (
			!active ||
			!canViewDailyPathMap ||
			!dashboardMap ||
			!currentCanvas ||
			!currentContext ||
			!showCurrentParticles
		) {
			stopCurrentAnimation();
			return;
		}

		const size = dashboardMap.getSize();
		const canvasWidth = currentCanvasWidth || size.x;
		const canvasHeight = currentCanvasHeight || size.y;
		const sources = getDashboardCurrentSourcePoints();

		currentContext.globalCompositeOperation = 'destination-out';
		currentContext.fillStyle = `rgba(0, 0, 0, ${CURRENT_PARTICLE_TRAIL_FADE_ALPHA})`;
		currentContext.fillRect(0, 0, canvasWidth, canvasHeight);

		currentContext.globalCompositeOperation = 'source-over';

		if (!sources.length) return;

		currentContext.lineCap = 'round';
		currentContext.lineJoin = 'round';
		currentContext.lineWidth = CURRENT_PARTICLE_LINE_WIDTH;
		currentContext.shadowBlur = 2;
		currentContext.shadowColor = 'rgba(80, 190, 255, 0.22)';

		currentParticles.forEach((particle) => {
			const containerPoint = {
				x: particle.x - currentCanvasBuffer,
				y: particle.y - currentCanvasBuffer
			};

			const vector = getCurrentVectorAtContainerPoint(containerPoint, sources);

			if (!vector) {
				resetCurrentParticle(particle, false);
				return;
			}

			const speed = Math.max(0.2, Math.min(12, vector.speed || 1.2));
			const velocity =
				(0.18 + speed * 0.08) * particle.speedJitter * CURRENT_PARTICLE_STEP_MULTIPLIER;

			const stepX = vector.x * velocity;
			const stepY = vector.y * velocity;
			const previousX = particle.x;
			const previousY = particle.y;
			const nextX = previousX + stepX;
			const nextY = previousY + stepY;
			const tailX = previousX - stepX * particle.trailLength;
			const tailY = previousY - stepY * particle.trailLength;

			particle.x = nextX;
			particle.y = nextY;
			particle.age += 1;

			const headAlpha = particle.alpha;
			const tailAlpha = Math.max(0.04, particle.alpha * 0.2);
			const gradient = currentContext.createLinearGradient(tailX, tailY, nextX, nextY);

			gradient.addColorStop(0, `rgba(75, 190, 255, ${tailAlpha})`);
			gradient.addColorStop(0.55, `rgba(90, 205, 255, ${particle.alpha * 0.42})`);
			gradient.addColorStop(1, `rgba(125, 220, 255, ${headAlpha})`);

			currentContext.beginPath();
			currentContext.moveTo(tailX, tailY);
			currentContext.lineTo(nextX, nextY);
			currentContext.strokeStyle = gradient;
			currentContext.stroke();

			if (
				particle.age > particle.maxAge ||
				particle.x < -40 ||
				particle.x > canvasWidth + 40 ||
				particle.y < -40 ||
				particle.y > canvasHeight + 40
			) {
				resetCurrentParticle(particle, false);
			}
		});

		currentContext.shadowBlur = 0;
		currentContext.globalCompositeOperation = 'source-over';
	}

	function handleCurrentMapMove() {
		positionCurrentCanvas();
	}

	function handleCurrentMapChange() {
		resizeCurrentCanvas({ reseed: true });
		drawCurrentParticles();
	}

	function startCurrentAnimation() {
		if (!browser || currentFrame || !active || !canViewDailyPathMap || !showCurrentParticles)
			return;

		const animate = (timestamp) => {
			currentFrame = requestAnimationFrame(animate);

			if (timestamp - currentLastFrameAt < CURRENT_PARTICLE_FRAME_INTERVAL_MS) return;

			currentLastFrameAt = timestamp;
			drawCurrentParticles();
		};

		currentFrame = requestAnimationFrame(animate);
	}

	function stopCurrentAnimation() {
		if (!browser || !currentFrame) return;

		cancelAnimationFrame(currentFrame);
		currentFrame = null;
		currentLastFrameAt = 0;
	}

	function addCurrentParticleLayer() {
		if (
			!active ||
			!canViewDailyPathMap ||
			!showCurrentParticles ||
			!dashboardMap ||
			!L ||
			currentParticleLayer
		)
			return;

		currentParticleLayer = new L.Layer();

		currentParticleLayer.onAdd = (targetMap) => {
			const pane = targetMap.getPane('dashboardCurrentPane') || targetMap.getPanes().overlayPane;

			currentCanvas = L.DomUtil.create('canvas', 'current-particle-canvas');
			currentCanvas.setAttribute('aria-hidden', 'true');
			pane.appendChild(currentCanvas);

			currentContext = currentCanvas.getContext('2d');

			targetMap.on('move zoom', handleCurrentMapMove);
			targetMap.on('dragend resize moveend zoomend viewreset', handleCurrentMapChange);

			resizeCurrentCanvas();
			startCurrentAnimation();
		};

		currentParticleLayer.onRemove = (targetMap) => {
			targetMap.off('move zoom', handleCurrentMapMove);
			targetMap.off('dragend resize moveend zoomend viewreset', handleCurrentMapChange);
			stopCurrentAnimation();

			if (currentCanvas?.parentNode) {
				currentCanvas.parentNode.removeChild(currentCanvas);
			}

			currentCanvas = null;
			currentContext = null;
			currentParticles = [];
		};

		currentParticleLayer.addTo(dashboardMap);
	}

	function removeCurrentParticleLayer() {
		if (currentParticleLayer && dashboardMap) {
			dashboardMap.removeLayer(currentParticleLayer);
		}

		currentParticleLayer = null;
		stopCurrentAnimation();
	}

	let canAccessDashboard = $derived(
		hasPermission('access_dashboard') || hasPermission('access_daily_report')
	);

	let canViewDailyPathMap = $derived(hasPermission('view_daily_path_map'));

	let canViewEngineRpmStatsTable = $derived(hasPermission('view_engine_rpm_stats_table'));

	let canViewFuelConsumptionTable = $derived(hasPermission('view_fuel_consumption_table'));

	let canViewFuelEcu = $derived(hasPermission('view_fuel_ecu'));

	let canViewFuelFms = $derived(hasPermission('view_fuel_fms'));

	let canViewFuelFod = $derived(hasPermission('view_fuel_fod'));

	let canViewFuelEmsInternal = $derived(hasPermission('view_fuel_ems_internal'));

	let canViewFuelEmsExternal = $derived(hasPermission('view_fuel_ems_external'));

	let canViewFuelEngineMaker = $derived(hasPermission('view_fuel_engine_maker'));

	let activeConsumptionSource = $derived(
		normalizeFuelConsumptionSource(dashboardData?.consumptionSource)
	);
	let activeConsumptionLiter = $derived(dashboardData?.consumptionLiter);

	let canShowFuelEmsInternal = $derived(
		canViewFuelEmsInternal &&
			!isMissingValue(
				getDashboardConsumptionForSource(
					'ems_internal',
					dashboardData?.consumptionEmsInternal ?? dashboardData?.consumptionEms
				)
			)
	);

	let canShowFuelEmsExternal = $derived(
		canViewFuelEmsExternal &&
			!isMissingValue(
				getDashboardConsumptionForSource('ems_external', dashboardData?.consumptionEmsExternal)
			)
	);

	let canShowFuelFms = $derived(
		canViewFuelFms &&
			!isMissingValue(getDashboardConsumptionForSource('fm', dashboardData?.consumptionFms))
	);

	let canShowFuelEcu = $derived(
		canViewFuelEcu &&
			!isMissingValue(getDashboardConsumptionForSource('ecu', dashboardData?.consumptionEcu))
	);

	let hasVisibleFuelSource = $derived(
		canShowFuelEmsInternal || canShowFuelEmsExternal || canShowFuelFms || canShowFuelEcu
	);

	let shouldShowVmsFuelLabel = $derived(canShowFuelEmsInternal && canShowFuelEmsExternal);

	let canShowFodUsage = $derived(canViewFuelFod && Boolean(dashboardData?.fodUsage));

	let canShowRob = $derived(
		canViewFuelEngineMaker || canViewFuelFod || canViewFuelConsumptionTable
	);

	let fuelSummary = $derived({
		source: activeConsumptionSource,
		sourceLabel: getFuelSourceLabel(activeConsumptionSource),
		sourceValue: isMissingValue(activeConsumptionLiter) ? '-' : formatLiter(activeConsumptionLiter),
		emsInternal: formatLiter(
			getDashboardConsumptionForSource(
				'ems_internal',
				dashboardData?.consumptionEmsInternal ?? dashboardData?.consumptionEms ?? 0
			)
		),
		emsExternal: formatLiter(
			getDashboardConsumptionForSource('ems_external', dashboardData?.consumptionEmsExternal ?? 0)
		),
		fms: isMissingValue(getDashboardConsumptionForSource('fm', dashboardData?.consumptionFms))
			? '-'
			: formatLiter(getDashboardConsumptionForSource('fm', dashboardData?.consumptionFms)),
		ecu: isMissingValue(getDashboardConsumptionForSource('ecu', dashboardData?.consumptionEcu))
			? '-'
			: formatLiter(getDashboardConsumptionForSource('ecu', dashboardData?.consumptionEcu)),
		latestRob:
			dashboardData?.latestRob !== null && dashboardData?.latestRob !== undefined
				? formatLiter(dashboardData.latestRob)
				: '-'
	});

	function resetDashboardStateForVessel() {
		dashboardData = null;
		cctvSnapshots = [];
		cctvSnapshotsError = '';
		selectedDashboardCctvKey = '';
		error = '';
	}

	function isDashboardRequestCurrent(vesselId, requestId) {
		return (
			requestId === dashboardRequestId && String(vesselId || '') === String($selectedVesselId || '')
		);
	}

	async function loadDashboard(vesselId = $selectedVesselId, { background = false } = {}) {
		const targetVesselId = vesselId || $selectedVesselId;
		if (background && dashboardRequestInFlight) return;

		const requestId = ++dashboardRequestId;

		if (!targetVesselId) {
			dashboardRequestInFlight = false;
			loading = false;
			cctvSnapshotsLoading = false;
			dashboardData = null;
			cctvSnapshots = [];
			error = 'No vessel has been selected from Fleet View.';
			return;
		}

		const keepCurrentData = background && dashboardData !== null;
		dashboardRequestInFlight = true;
		if (!keepCurrentData) loading = true;
		error = '';

		try {
			// Wait for the entire refresh, including CCTV, before allowing the next poll.
			const [dashboardResult] = await Promise.allSettled([
				getVesselDashboard(targetVesselId),
				background ? Promise.resolve() : loadDashboardAssets(),
				loadLatestCctvSnapshots(targetVesselId, requestId, { background }),
				loadCurrentUser()
			]);

			if (!isDashboardRequestCurrent(targetVesselId, requestId)) return;
			if (dashboardResult.status === 'rejected') throw dashboardResult.reason;

			dashboardData = dashboardResult.value?.data || dashboardResult.value || null;

			console.log('[VESSEL_DASHBOARD_DATA]', { vesselId: targetVesselId, data: dashboardData });

			scheduleDashboardMapRefresh({ center: !background });
		} catch (err) {
			if (!isDashboardRequestCurrent(targetVesselId, requestId)) return;

			console.error('[VESSEL_DASHBOARD_ERROR]', err);
			if (!keepCurrentData || err?.status === 401 || err?.status === 403) {
				error = err?.message || 'Failed to load vessel dashboard.';
				dashboardData = null;
				cctvSnapshots = [];
			}
		} finally {
			if (isDashboardRequestCurrent(targetVesselId, requestId)) {
				dashboardRequestInFlight = false;
				loading = false;
			}
		}
	}

	async function loadDashboardAssets() {
		dashboardAssetsLoading = true;
		dashboardAssetsError = '';

		try {
			const assets = await getFleetAssets();
			dashboardZones = normalizeMapZonesFromAssets(assets);
			dashboardAssets = sortByAlpha(
				assets.map(normalizeDashboardAsset).filter(Boolean),
				(asset) => asset.assetName,
				(asset) => asset.assetType
			);
			rebuildDashboardZoneLayer();
			buildDashboardAssetMarkers();
			return dashboardAssets;
		} catch (err) {
			console.error('[VESSEL_DASHBOARD_ASSETS_ERROR]', err);
			dashboardAssets = [];
			dashboardZones = [];
			dashboardAssetsError = err?.message || 'Failed to load asset data.';
			rebuildDashboardZoneLayer();
			clearDashboardAssetMarkers();
			return [];
		} finally {
			dashboardAssetsLoading = false;
		}
	}

	async function loadLatestCctvSnapshots(
		vesselId = $selectedVesselId,
		requestId = dashboardRequestId,
		{ background = false } = {}
	) {
		if (!vesselId) {
			cctvSnapshots = [];
			return [];
		}

		if (!background) cctvSnapshotsLoading = true;
		cctvSnapshotsError = '';

		try {
			const result = await getLatestCctvSnapshots(vesselId);
			const snapshots = Array.isArray(result)
				? result
				: Array.isArray(result?.items)
					? result.items
					: Array.isArray(result?.snapshots)
						? result.snapshots
						: Array.isArray(result?.data)
							? result.data
							: [];

			if (!isDashboardRequestCurrent(vesselId, requestId)) return snapshots;

			cctvSnapshots = snapshots;
			return snapshots;
		} catch (err) {
			if (!isDashboardRequestCurrent(vesselId, requestId)) return [];

			console.error('[VESSEL_CCTV_SNAPSHOTS_ERROR]', err);
			if (!background || err?.status === 401 || err?.status === 403) cctvSnapshots = [];
			cctvSnapshotsError = err?.message || 'Failed to load latest CCTV snapshots.';
			return [];
		} finally {
			if (isDashboardRequestCurrent(vesselId, requestId)) {
				cctvSnapshotsLoading = false;
			}
		}
	}

	$effect(() => {
		if (!cctvItems.length) {
			if (selectedDashboardCctvKey) selectedDashboardCctvKey = '';
			return;
		}

		if (!cctvItems.some((item) => item.key === selectedDashboardCctvKey)) {
			selectedDashboardCctvKey = cctvItems[0]?.key || '';
		}
	});

	$effect(() => {
		const isActive = active;
		const vesselId = $selectedVesselId;
		const key = `${vesselId || ''}`;

		if (!isActive) return;

		if (!vesselId) {
			if (lastDashboardLoadKey) lastDashboardLoadKey = '';
			untrack(() => {
				resetDashboardStateForVessel();
				loadDashboard(null);
			});
			return;
		}

		if (key === lastDashboardLoadKey) return;

		lastDashboardLoadKey = key;

		untrack(() => {
			resetDashboardStateForVessel();
			scheduleDashboardMapRefresh({ recreate: true, center: true });
			loadDashboard(vesselId);
		});
	});

	$effect(() => {
		active;

		if (!active && dashboardMap) {
			destroyDashboardMap();
		}
	});

	$effect(() => {
		const vesselId = $selectedVesselId;
		if (!browser || !active || !vesselId) return;

		const interval = setInterval(() => {
			if (!active || String(vesselId) !== String($selectedVesselId)) return;
			if (currentUser && !canAccessDashboard) return;
			void loadDashboard(vesselId, { background: true });
		}, DASHBOARD_POLL_INTERVAL_MS);

		return () => clearInterval(interval);
	});

	$effect(() => {
		active;
		canViewDailyPathMap;
		vesselInfo.latitude;
		vesselInfo.longitude;

		if (!active || !canViewDailyPathMap) return;

		ensureDashboardMap();
	});

	$effect(() => {
		active;
		canViewDailyPathMap;
		dashboardAssets;

		if (!active || !canViewDailyPathMap || !dashboardMap || !L) return;

		buildDashboardAssetMarkers();
	});

	$effect(() => {
		active;
		canViewDailyPathMap;
		showWindParticles;
		showCurrentParticles;
		dashboardData;
		vesselInfo.latitude;
		vesselInfo.longitude;
		vesselInfo.heading;
		vesselInfo.vesselName;

		if (!dashboardMap || !L) return;

		if (!active || !canViewDailyPathMap) {
			removeWindParticleLayer();
			removeCurrentParticleLayer();
			return;
		}

		dashboardMap.invalidateSize();
		updateDashboardMapMarker();

		if (showWindParticles) {
			addWindParticleLayer();
			seedWindParticles(true);
		} else {
			removeWindParticleLayer();
		}

		if (showCurrentParticles) {
			addCurrentParticleLayer();
			seedCurrentParticles(true);
		} else {
			removeCurrentParticleLayer();
		}
	});

	onDestroy(() => {
		dashboardRequestId += 1;
		destroyDashboardMap();
	});
</script>

<section class="dashboard-content">
	<VesselDashboardHeader vesselName={vesselInfo.vesselName} />

	{#if loading || currentUserLoading}
		<LoadingSkeleton label="Loading vessel dashboard data" variant="vessel-dashboard" />
	{:else if error}
		<div class="status-box error-box">
			{error}
		</div>
	{:else if currentUserError}
		<div class="status-box error-box">
			{currentUserError}
		</div>
	{:else if !canAccessDashboard}
		<div class="status-box error-box">
			The user does not have the access_dashboard or access_daily_report permission.
		</div>
	{:else}
		<section class="hero-grid">
			<VesselDashboardCctv
				items={cctvItems}
				main={mainDashboardCctv}
				miniItems={miniDashboardCctvItems}
				loading={cctvSnapshotsLoading}
				error={cctvSnapshotsError}
				onSelect={selectDashboardCctv}
			/>
			<VesselDashboardMap
				{active}
				canViewMap={canViewDailyPathMap}
				{vesselInfo}
				zones={dashboardZones}
				bind:showWindParticles
				bind:showCurrentParticles
				bind:mapContainer={dashboardMapContainer}
			/>
		</section>

		<section class="info-rpm-section">
			<VesselDashboardInfoPanel
				vesselName={vesselInfo.vesselName}
				online={vesselInfo.online}
				cards={dashboardInfoCards}
			/>
			<VesselDashboardRpmPanel visible={canViewEngineRpmStatsTable} cards={rpmCards} />
		</section>

		<VesselDashboardSummary cards={dashboardSummaryCards} />

		<VesselDashboardEnvironment
			forecastDays={dashboardForecastDays}
			weatherCards={dashboardWeatherCards}
			currentCards={dashboardCurrentCards}
		/>

		<VesselDashboardFuel
			canViewFuel={canViewFuelConsumptionTable}
			{hasVisibleFuelSource}
			canShowEmsInternal={canShowFuelEmsInternal}
			canShowEmsExternal={canShowFuelEmsExternal}
			canShowFms={canShowFuelFms}
			canShowEcu={canShowFuelEcu}
			vmsLabel={shouldShowVmsFuelLabel ? 'VMS' : 'EMS'}
			{fuelSummary}
			{canShowFodUsage}
			fodLabel={formatLiter(fodUsage?.accumulatedLiters || 0)}
			{canShowRob}
		/>
	{/if}
</section>
