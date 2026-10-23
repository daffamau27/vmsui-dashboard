<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getFleetVessels, getFleetVesselLiveDetail, getFleetAssets } from '$lib/api/fleetApi.js';
	import { setSelectedVessel } from '$lib/stores/selectedVessel.svelte.js';
	import { activeMenu, setActiveMenu } from '$lib/stores/appNavigation.svelte.js';
	import { addMapTileLayer } from '$lib/utils/mapStyle.js';
	import { addLeafletZoomAndScale } from '$lib/utils/leafletControls.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import FleetViewSidebarHeader from './FleetViewSidebarHeader.svelte';
	import './fleet-view-page.css';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import CctvSnapshotImage from '$lib/components/CctvSnapshotImage.svelte';
	import { getLatestCctvSnapshots } from '$lib/api/dashboardApi.js';
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
	import { slideScale, panelEnter } from '$lib/utils/modalTransition.js';
	import { enableFleetPopupTransition } from '$lib/utils/leafletPopupTransition.js';

	let { active = false } = $props();

	const vesselMarkerUrl = '/assets/vessel.png';

	let vesselData = $state([]);
	let fleetLoading = $state(false);
	let fleetError = $state('');

	let search = $state('');
	let statusFilter = $state('all');
	let selectedVesselId = $state(null);
	let selectedVesselDetail = $state(null);
	let showDetailPanel = $state(false);
	let detailEntryPoint = $state(null);
	let detailSwitchFrom = $state(null);
	// Counter yang HANYA naik saat panel ganti vessel (bukan buka/tutup). Dipakai
	// sebagai {#key} agar remount hanya terjadi saat switch, sehingga intro saat
	// buka pertama dan outro saat tutup (ke kanan) tetap dapat dimainkan.
	let detailSwitchSeq = $state(0);
	let detailCctvSnapshots = $state([]);
	let detailCctvLoading = $state(false);
	let detailCctvError = $state('');
	let detailCctvLoadedVesselId = $state(null);
	let selectedDetailCctvKey = $state('');

	let voyageProgress = $derived(getVoyageProgress(selectedVessel));
	let detailCctvItems = $derived(normalizeDetailCctvList(detailCctvSnapshots));
	let mainDetailCctv = $derived(
		detailCctvItems.find((item) => item.key === selectedDetailCctvKey) || detailCctvItems[0] || null
	);
	let detailCctvThumbnails = $derived(
		mainDetailCctv ? detailCctvItems.filter((item) => item.key !== mainDetailCctv.key) : []
	);

	let assetData = $state([]);
	let assetLoading = $state(false);
	let assetError = $state('');
	let showAssets = $state(true);
	let visibleAssetTypes = $state({});
	let zoneData = $state([]);
	let isMapLegendOpen = $state(false);
	let assetMarkers = new Map();
	let assetBoundaryCircles = new Map();

	let ignoreNextPopupCloseForVesselId = null;
	let openingDetailFromPopupForVesselId = null;

	let isSidebarOpen = $state(true);
	let mapStageContainer;
	let sidebarToggleButton;
	let mapLegendElement;
	let isFleetFullscreen = $state(false);
	let sidebarToggleOverlapsLegend = $state(false);
	let sidebarToggleSafeTop = $state(0);
	let sidebarToggleOverlapFrame = null;

	let mapContainer;
	let vesselListContainer;
	let map = null;
	let L = null;
	let markers = new Map();
	let vesselHoverTooltip = null;
	let vesselHoverTooltipVesselId = null;
	let zoneLayerGroup = null;
	let isFleetMounted = false;
	let mapInitializing = false;

	let showWindParticles = $state(false);
	let windParticleLayer = null;
	let windCanvas = null;
	let windContext = null;
	let windParticles = [];
	let windFrame = null;
	let windLastFrameAt = 0;

	let showCurrentParticles = $state(false);
	let currentParticleLayer = null;
	let currentCanvas = null;
	let currentContext = null;
	let currentParticles = [];
	let currentFrame = null;
	let currentLastFrameAt = 0;

	let isFleetPageActive = $derived(active && $activeMenu === 'fleet-view');

	const CURRENT_INFLUENCE_RADIUS_METERS = 120000;

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

	let fleetRefreshTimer = null;
	let fleetRefreshInProgress = false;

	const FLEET_REFRESH_INTERVAL_MS = 30000;

	let measureActive = $state(false);
	let measureUnit = $state('NM');
	let measurePoints = $state([]);

	let measureLayerGroup = null;
	let measureContextPopup = null;

	const measureUnits = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'NM', label: 'NM' },
		{ value: 'km', label: 'km' },
		{ value: 'mi', label: 'mi' },
		{ value: 'm', label: 'm' }
	];

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

	function normalizeFleetVessel(vessel = {}) {
		const id = vessel.vesselId ?? vessel.id;

		return {
			...vessel,
			id,
			vesselId: id,
			name: vessel.vesselName ?? vessel.name ?? '-',
			vesselName: vessel.vesselName ?? vessel.name ?? '-',
			lat: vessel.latitude ?? vessel.lat,
			lng: vessel.longitude ?? vessel.lng,
			fleetLatitude: vessel.fleetLatitude ?? vessel.latitude ?? vessel.lat,
			fleetLongitude: vessel.fleetLongitude ?? vessel.longitude ?? vessel.lng,
			speed: vessel.speed ?? '-',
			heading: vessel.heading ?? 0,
			online: Boolean(vessel.online),
			hireStatus: vessel.hireStatus ?? vessel.hire_status ?? vessel.onHire ?? vessel.on_hire ?? '-',
			companyName: vessel.companyName ?? '-',
			timezone:
				vessel.timezone ??
				vessel.timeZone ??
				vessel.timezoneMode ??
				vessel.utc ??
				vessel.utcOffset ??
				vessel.utc_offset ??
				'UTC+07:00',
			engines: Array.isArray(vessel.engines) ? vessel.engines : [],
			liveEngines: Array.isArray(vessel.engines) ? vessel.engines : []
		};
	}

	function normalizeFleetAsset(asset = {}) {
		if (isZoneAsset(asset)) return null;

		const id = asset.id ?? asset.assetId;

		return {
			...asset,
			id,
			name: asset.assetName ?? asset.name ?? '-',
			assetName: asset.assetName ?? asset.name ?? '-',
			assetType: getAssetTypeValue(asset),
			type: getAssetTypeValue(asset) || 'Asset',
			lat: asset.latitude ?? asset.lat,
			lng: asset.longitude ?? asset.lng
		};
	}

	function rebuildZoneLayer() {
		if (!map || !L) return;

		if (zoneLayerGroup) {
			zoneLayerGroup.clearLayers();
			zoneLayerGroup.remove();
			zoneLayerGroup = null;
		}

		zoneLayerGroup = addMapZonesToLeafletMap(L, map, zoneData, {
			paneName: 'fleetZonePane',
			zIndex: 355
		});
	}

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
		selectedDetailCctvKey = cctv.key;
	}

	let onlineCount = $derived(vesselData.filter((v) => v.online).length);
	let offlineCount = $derived(vesselData.filter((v) => !v.online).length);
	let assetLegendItems = $derived.by(() => {
		const items = new Map();

		for (const asset of assetData) {
			const rawType = getAssetTypeValue(asset);
			if (!String(rawType || '').trim()) continue;

			const label = getAssetTypeLabel(asset);
			const key = String(rawType).trim().toLowerCase();

			if (!items.has(key)) {
				items.set(key, {
					key,
					label,
					iconUrl: getAssetIconUrl(asset)
				});
			}
		}

		return Array.from(items.values()).sort((a, b) => a.label.localeCompare(b.label));
	});

	function getAssetTypeKey(assetOrItem = {}) {
		return String(
			assetOrItem.key || getAssetTypeValue(assetOrItem) || getAssetTypeLabel(assetOrItem) || 'asset'
		)
			.trim()
			.toLowerCase();
	}

	function isAssetTypeVisible(assetOrItem = {}) {
		if (!showAssets) return false;

		const key = getAssetTypeKey(assetOrItem);
		return visibleAssetTypes[key] !== false;
	}

	function toggleAssetType(item = {}) {
		const key = getAssetTypeKey(item);

		visibleAssetTypes = {
			...visibleAssetTypes,
			[key]: visibleAssetTypes[key] === false
		};
	}

	function mergeVesselWithLiveDetail(vessel, liveDetail) {
		if (!vessel && !liveDetail) return null;

		const normalizedVessel = normalizeFleetVessel(vessel || {});
		const normalizedLiveDetail = normalizeFleetVessel(liveDetail || {});

		const liveEngines = Array.isArray(liveDetail?.liveEngines)
			? liveDetail.liveEngines
			: Array.isArray(liveDetail?.engines)
				? liveDetail.engines
				: [];

		return {
			...normalizedVessel,
			...normalizedLiveDetail,
			id: normalizedLiveDetail.id ?? normalizedVessel.id,
			vesselId: normalizedLiveDetail.vesselId ?? normalizedVessel.vesselId,
			name: normalizedLiveDetail.name ?? normalizedVessel.name,
			vesselName: normalizedLiveDetail.vesselName ?? normalizedVessel.vesselName,
			fleetLatitude: normalizedVessel.fleetLatitude ?? normalizedLiveDetail.fleetLatitude,
			fleetLongitude: normalizedVessel.fleetLongitude ?? normalizedLiveDetail.fleetLongitude,
			engines: liveEngines,
			liveEngines
		};
	}

	function getFleetVesselLatLng(vessel = {}) {
		const lat = Number(vessel.fleetLatitude ?? vessel.latitude ?? vessel.lat);
		const lng = Number(vessel.fleetLongitude ?? vessel.longitude ?? vessel.lng);

		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
		if (lat === 0 && lng === 0) return null;

		return { lat, lng };
	}

	function mergeFleetRefreshVessel(previousVessel, incomingVessel) {
		const previous = normalizeFleetVessel(previousVessel || {});
		const incoming = normalizeFleetVessel(incomingVessel || {});
		const hasIncomingEngines = Array.isArray(incoming.engines) && incoming.engines.length > 0;
		const previousLiveEngines = Array.isArray(previous.liveEngines) ? previous.liveEngines : [];

		return {
			...previous,
			...incoming,
			weather: incoming.weather ?? previous.weather,
			oceanCurrent: incoming.oceanCurrent ?? previous.oceanCurrent,
			voyageProgress: incoming.voyageProgress ?? previous.voyageProgress,
			fleetLatitude: incoming.fleetLatitude ?? previous.fleetLatitude,
			fleetLongitude: incoming.fleetLongitude ?? previous.fleetLongitude,
			engines: hasIncomingEngines ? incoming.engines : previous.engines,
			liveEngines: hasIncomingEngines ? incoming.engines : previousLiveEngines
		};
	}

	function normalizeEngineName(value) {
		return String(value || '')
			.replace(/RPM/gi, '')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
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

	function normalizeHireStatus(value) {
		if (value === true) return 'On Hire';
		if (value === false) return 'Off Hire';

		const text = String(value ?? '').trim();

		if (!text || text === '-') return 'Hire unknown';

		const normalized = text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

		if (normalized.includes('off')) return 'Off Hire';
		if (normalized.includes('on')) return 'On Hire';
		if (['true', '1', 'active'].includes(normalized)) return 'On Hire';
		if (['false', '0', 'inactive'].includes(normalized)) return 'Off Hire';

		return text;
	}

	function isOnHireStatus(value) {
		return normalizeHireStatus(value).toLowerCase() === 'on hire';
	}

	function isOffHireStatus(value) {
		return normalizeHireStatus(value).toLowerCase() === 'off hire';
	}

	async function openVesselDashboard(vessel) {
		if (!vessel) return;

		let finalVessel = vessel;

		try {
			const liveDetail = await getFleetVesselLiveDetail(vessel.vesselId || vessel.id);

			finalVessel = mergeVesselWithLiveDetail(vessel, liveDetail);

			vesselData = vesselData.map((item) =>
				String(item.id) === String(finalVessel.id) ? finalVessel : item
			);

			selectedVesselDetail = finalVessel;
		} catch (error) {
			console.error('[FLEET_VIEW_DASHBOARD_LIVE_DETAIL_ERROR]', error);
		}

		setSelectedVessel(finalVessel);
		setActiveMenu('vessel');
	}

	let filteredVessels = $derived(
		sortByAlpha(
			vesselData.filter((v) => {
				const keyword = search.toLowerCase().trim();
				const name = String(v.name || '').toLowerCase();
				const company = String(v.companyName || '').toLowerCase();

				const matchSearch = !keyword || name.includes(keyword) || company.includes(keyword);

				if (statusFilter === 'online') return matchSearch && v.online;
				if (statusFilter === 'offline') return matchSearch && !v.online;

				return matchSearch;
			}),
			(vessel) => vessel.name || vessel.vesselName,
			(vessel) => vessel.companyName
		)
	);

	let selectedVessel = $derived(
		selectedVesselDetail ||
			vesselData.find((v) => String(v.id) === String(selectedVesselId)) ||
			null
	);
	let sortedDetailEngines = $derived(sortVesselEngines(selectedVessel?.engines || []));

	let totalMeasureMeters = $derived(getTotalMeasureDistance(measurePoints));

	function formatValue(value, fallback = '-') {
		if (value === null || value === undefined || value === '') return fallback;
		return value;
	}

	function formatNumber(value, digits = 1, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;
		return number.toFixed(digits);
	}

	function formatDmsCoordinate(value, axis = 'lat') {
		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		const direction = axis === 'lng' ? (number >= 0 ? 'E' : 'W') : number >= 0 ? 'N' : 'S';
		let absolute = Math.abs(number);
		let degrees = Math.floor(absolute);
		let minutesFloat = (absolute - degrees) * 60;
		let minutes = Math.floor(minutesFloat);
		let seconds = Number(((minutesFloat - minutes) * 60).toFixed(2));

		if (seconds >= 60) {
			seconds = 0;
			minutes += 1;
		}

		if (minutes >= 60) {
			minutes = 0;
			degrees += 1;
		}

		const paddedMinutes = String(minutes).padStart(2, '0');
		const paddedSeconds = seconds.toFixed(2).padStart(5, '0');

		return `${degrees}\u00b0 ${paddedMinutes}' ${paddedSeconds}" ${direction}`;
	}

	function formatDmsPair(latitude, longitude) {
		const latDms = formatDmsCoordinate(latitude, 'lat');
		const lngDms = formatDmsCoordinate(longitude, 'lng');

		if (latDms === '-' || lngDms === '-') return '-';

		return `${latDms} \u2022 ${lngDms}`;
	}

	function hasValidVesselCoordinate(vessel) {
		const lat = Number(vessel?.lat ?? vessel?.latitude);
		const lng = Number(vessel?.lng ?? vessel?.longitude);

		return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
	}

	function parseVesselDateTime(value, timezoneHint = null) {
		if (!value || value === '-') return null;

		const text = String(value).trim();
		const timezoneText = `${text} ${timezoneHint || ''}`;
		const timezoneMatch = timezoneText.match(/\(?\bUTC\s*([+-])(\d{1,2})(?::?(\d{2}))?\)?/i);
		const timezoneOffsetMinutes = timezoneMatch
			? (timezoneMatch[1] === '-' ? -1 : 1) *
				(Number(timezoneMatch[2]) * 60 + Number(timezoneMatch[3] || 0))
			: null;

		function buildDateWithOptionalTimezone({ year, month, day, hour, minute, second }) {
			if (Number.isFinite(timezoneOffsetMinutes)) {
				const utcTime =
					Date.UTC(year, month - 1, day, hour, minute, second) - timezoneOffsetMinutes * 60 * 1000;

				const date = new Date(utcTime);
				return Number.isNaN(date.getTime()) ? null : date;
			}

			const date = new Date(year, month - 1, day, hour, minute, second);
			return Number.isNaN(date.getTime()) ? null : date;
		}

		const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);

		if (match) {
			const [, dd, mm, yyyy, hh, min, ss] = match;

			const date = buildDateWithOptionalTimezone({
				year: Number(yyyy),
				month: Number(mm),
				day: Number(dd),
				hour: Number(hh),
				minute: Number(min),
				second: Number(ss)
			});

			if (date) return date;
		}

		const isoLikeMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?/);

		if (isoLikeMatch) {
			const [, yyyy, mm, dd, hh, min, ss = '0'] = isoLikeMatch;
			const date = buildDateWithOptionalTimezone({
				year: Number(yyyy),
				month: Number(mm),
				day: Number(dd),
				hour: Number(hh),
				minute: Number(min),
				second: Number(ss)
			});

			if (date) return date;
		}

		const fallbackDate = new Date(text);
		if (!Number.isNaN(fallbackDate.getTime())) return fallbackDate;

		return null;
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

	function formatLastUpdated(value, timezoneHint = null) {
		if (!value || value === '-') return '-';

		const date = parseVesselDateTime(value, timezoneHint);
		if (!date) return value;

		const diffMs = Date.now() - date.getTime();
		const diffMinutes = Math.floor(diffMs / 60000);

		if (diffMinutes < 0) return value;

		if (diffMinutes < 1) {
			return 'Just now';
		}

		if (diffMinutes < 10) {
			return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
		}

		return value;
	}

	function stripUtcLabel(value) {
		if (!value || value === '-') return '-';

		const cleaned = String(value)
			.replace(/\s*\(?\bUTC\s*[+-]\d{1,2}(?::?\d{2})?\)?\s*/gi, ' ')
			.replace(/\s{2,}/g, ' ')
			.trim();

		return cleaned || '-';
	}

	function getUtcLabel(value) {
		if (!value || value === '-') return null;

		const text = String(value).trim();

		if (/^Asia\/Jakarta$/i.test(text) || /^WIB$/i.test(text)) return 'UTC+07:00';
		if (/^Asia\/Makassar$/i.test(text) || /^WITA$/i.test(text)) return 'UTC+08:00';
		if (/^Asia\/Jayapura$/i.test(text) || /^WIT$/i.test(text)) return 'UTC+09:00';

		const match =
			text.match(/\bUTC\s*([+-]\d{1,2})(?::?(\d{2}))?/i) ||
			text.match(/^([+-]\d{1,2})(?::?(\d{2}))?$/);
		if (!match) return null;

		const rawHour = match[1];
		const sign = rawHour.startsWith('-') ? '-' : '+';
		const hour = rawHour.replace(/^[+-]/, '').padStart(2, '0');
		const minute = (match[2] || '00').padStart(2, '0');

		return `UTC${sign}${hour}:${minute}`;
	}

	function getTelemetryUtcLabel(vessel) {
		return (
			getUtcLabel(vessel?.lastUpdated) ||
			getUtcLabel(vessel?.lastConnectTime) ||
			getUtcLabel(vessel?.lastDisconnectTime) ||
			getUtcLabel(vessel?.timezone) ||
			getUtcLabel(vessel?.timeZone) ||
			getUtcLabel(vessel?.timezoneMode) ||
			getUtcLabel(vessel?.utc) ||
			getUtcLabel(vessel?.utcOffset) ||
			getUtcLabel(vessel?.utc_offset) ||
			'UTC+07:00'
		);
	}

	function formatTelemetryTime(value) {
		return stripUtcLabel(formatValue(value, '-'));
	}

	function formatLastUpdatedBadge(value, timezoneHint = null) {
		return stripUtcLabel(formatLastUpdated(value, timezoneHint));
	}

	function formatActualLastUpdated(value) {
		if (!value || value === '-') return '-';

		const cleanedValue = stripUtcLabel(formatValue(value, '-'));
		if (!cleanedValue || cleanedValue === '-') return '-';

		if (/^(just now|\d+\s+minutes?\s+ago)$/i.test(cleanedValue)) {
			const parsedDate = parseVesselDateTime(value);
			if (!parsedDate) return cleanedValue;

			return parsedDate.toLocaleString('en-GB', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			});
		}

		return cleanedValue;
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

	function getEngineRpm(vessel, keyword) {
		const engines = Array.isArray(vessel?.engines) ? vessel.engines : [];
		const key = String(keyword || '')
			.toLowerCase()
			.replace(/\s+/g, '_');

		const engine = engines.find((item) => {
			const name = String(item?.name || item?.engineName || '').toLowerCase();
			const engineKey = String(item?.key || item?.engineKeyThingsboard || '').toLowerCase();

			return name.includes(key.replace(/_/g, ' ')) || engineKey === key || engineKey.includes(key);
		});

		return formatValue(engine?.rpm ?? engine?.rpmValue ?? engine?.latestRpm ?? engine?.value, '-');
	}

	function getCurrentWeather(vessel) {
		return vessel?.weather?.current || null;
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

	function getTotalMeasureDistance(points) {
		if (!map || !points || points.length < 2) return 0;

		let total = 0;

		for (let i = 1; i < points.length; i += 1) {
			total += map.distance(points[i - 1], points[i]);
		}

		return total;
	}

	function formatMeasureDistance(meters) {
		const value = Number(meters || 0);

		if (measureUnit === 'NM') {
			return `${(value / 1852).toFixed(2)} NM`;
		}

		if (measureUnit === 'km') {
			return `${(value / 1000).toFixed(2)} km`;
		}

		if (measureUnit === 'mi') {
			return `${(value / 1609.344).toFixed(2)} mi`;
		}

		if (measureUnit === 'm') {
			return `${value.toFixed(0)} m`;
		}

		if (value >= 1852) {
			return `${(value / 1852).toFixed(2)} NM`;
		}

		if (value >= 1000) {
			return `${(value / 1000).toFixed(2)} km`;
		}

		return `${value.toFixed(0)} m`;
	}

	function openMeasureStartPopup(latlng) {
		if (!map || !L) return;
		if (measureActive) return;

		const popupHtml = `
      <div class="measure-start-popup">
        <div class="measure-start-top">
          <div class="measure-icon">↔</div>

          <div class="measure-title-group">
            <strong>Measure distance</strong>
            <span>Click Start, then select points on map</span>
          </div>

          <button type="button" class="measure-start-close" aria-label="Close measure popup">
            ×
          </button>
        </div>

        <div class="measure-start-info">
          <div>
            <span>Mode</span>
            <strong>Manual route</strong>
          </div>

          <div>
            <span>Default unit</span>
            <strong>${measureUnit}</strong>
          </div>
        </div>

        <button type="button" class="measure-start-btn">
          Start measuring
        </button>
      </div>
    `;

		measureContextPopup = L.popup({
			closeButton: false,
			autoPan: true,
			className: 'measure-context-popup',
			offset: [0, -8]
		})
			.setLatLng(latlng)
			.setContent(popupHtml)
			.openOn(map);

		setTimeout(() => {
			const popupElement = measureContextPopup?.getElement?.();
			if (!popupElement) return;

			const startButton = popupElement.querySelector('.measure-start-btn');
			const closeButton = popupElement.querySelector('.measure-start-close');

			if (startButton) {
				startButton.onclick = () => {
					startMeasure(latlng);
				};
			}

			if (closeButton) {
				closeButton.onclick = () => {
					map.closePopup(measureContextPopup);
				};
			}
		}, 0);
	}

	function startMeasure(startLatLng) {
		if (!map || !L) return;

		measureActive = true;
		measurePoints = [startLatLng];

		if (!measureLayerGroup) {
			measureLayerGroup = L.layerGroup().addTo(map);
		}

		map.closePopup(measureContextPopup);
		map.getContainer().classList.add('is-measuring');

		drawMeasureLayer();
	}

	function cancelMeasure() {
		measureActive = false;
		measurePoints = [];

		if (measureLayerGroup) {
			measureLayerGroup.clearLayers();
		}

		if (map) {
			map.getContainer().classList.remove('is-measuring');
		}
	}

	function handleMapRightClick(event) {
		if (!map || !L) return;
		if (measureActive) return;

		openMeasureStartPopup(event.latlng);
	}

	function handleMapMeasureClick(event) {
		if (!measureActive) return;

		measurePoints = [...measurePoints, event.latlng];
		drawMeasureLayer();
	}

	function drawMeasureLayer() {
		if (!map || !L || !measureLayerGroup) return;

		measureLayerGroup.clearLayers();

		if (!measurePoints.length) return;

		measurePoints.forEach((point, index) => {
			const pointMarker = L.circleMarker(point, {
				radius: index === 0 ? 5 : 4,
				color: '#3b82f6',
				weight: 2,
				fillColor: '#3b82f6',
				fillOpacity: 0.9
			});

			pointMarker.addTo(measureLayerGroup);
		});

		if (measurePoints.length < 2) return;

		const line = L.polyline(measurePoints, {
			color: '#3b82f6',
			weight: 2,
			opacity: 0.9,
			dashArray: '7 6'
		});

		line.addTo(measureLayerGroup);

		for (let i = 1; i < measurePoints.length; i += 1) {
			const previousPoint = measurePoints[i - 1];
			const currentPoint = measurePoints[i];

			const segmentDistance = map.distance(previousPoint, currentPoint);

			const midPoint = L.latLng(
				(previousPoint.lat + currentPoint.lat) / 2,
				(previousPoint.lng + currentPoint.lng) / 2
			);

			const labelIcon = L.divIcon({
				className: 'measure-label-icon',
				html: `<div class="measure-distance-label">${formatMeasureDistance(segmentDistance)}</div>`,
				iconSize: [90, 24],
				iconAnchor: [45, 12]
			});

			L.marker(midPoint, {
				icon: labelIcon,
				interactive: false
			}).addTo(measureLayerGroup);
		}
	}

	$effect(() => {
		measureUnit;

		if (measureActive && measureLayerGroup && measurePoints.length > 1) {
			drawMeasureLayer();
		}
	});

	function openSidebar() {
		isSidebarOpen = true;

		if (browser) {
			window.dispatchEvent(
				new CustomEvent('mobile-panel-open', {
					detail: 'vessel-list'
				})
			);
		}
	}

	function closeSidebar() {
		isSidebarOpen = false;
	}

	function openMobileSidebar() {
		openSidebar();
	}

	function closeMobileSidebar() {
		closeSidebar();
	}

	function toggleSidebar() {
		if (isSidebarOpen) {
			closeSidebar();
			return;
		}

		openSidebar();
	}

	function getFullscreenElement() {
		if (!browser) return null;
		return (
			document.fullscreenElement ||
			document.webkitFullscreenElement ||
			document.mozFullScreenElement ||
			document.msFullscreenElement ||
			null
		);
	}

	async function toggleFleetFullscreen() {
		if (!browser || !mapStageContainer) return;

		try {
			if (getFullscreenElement() === mapStageContainer) {
				const exitFullscreen =
					document.exitFullscreen ||
					document.webkitExitFullscreen ||
					document.mozCancelFullScreen ||
					document.msExitFullscreen;
				await exitFullscreen?.call(document);
				return;
			}

			const requestFullscreen =
				mapStageContainer.requestFullscreen ||
				mapStageContainer.webkitRequestFullscreen ||
				mapStageContainer.mozRequestFullScreen ||
				mapStageContainer.msRequestFullscreen;
			await requestFullscreen?.call(mapStageContainer);
		} catch (error) {
			console.warn('[FLEET_FULLSCREEN_ERROR]', error);
		}
	}

	function handleFleetFullscreenChange() {
		isFleetFullscreen = getFullscreenElement() === mapStageContainer;

		setTimeout(() => {
			map?.invalidateSize?.();
		}, 80);

		setTimeout(() => {
			map?.invalidateSize?.();
		}, 280);
	}

	function handleMobilePanelOpen(event) {
		if (event.detail !== 'vessel-list') {
			isSidebarOpen = false;
		}
	}

	function createPopupHtml(vessel) {
		const latitude = vessel.latitude ?? vessel.lat;
		const longitude = vessel.longitude ?? vessel.lng;
		const formattedLatitude = formatNumber(latitude, 6, '-');
		const formattedLongitude = formatNumber(longitude, 6, '-');
		const formattedLatitudeDms = formatDmsCoordinate(latitude, 'lat');
		const formattedLongitudeDms = formatDmsCoordinate(longitude, 'lng');

		return `
      <div class="fleet-popup">
        <div class="fleet-popup-hero">
          <div class="fleet-popup-heading">
            <span class="fleet-popup-eyebrow">Vessel overview</span>
            <strong>${formatValue(vessel.name)}</strong>
            <small>${formatValue(vessel.companyName)}</small>
          </div>
          <span class="fleet-popup-status ${vessel.online ? 'is-online' : 'is-offline'}">
            ${vessel.online ? 'Online' : 'Offline'}
          </span>
        </div>

        <div class="fleet-popup-metrics">
          <div class="fleet-popup-metric">
          <span>Speed</span>
          <strong>${formatNumber(vessel.speed, 1, '0.0')} <small>kt</small></strong>
          </div>

          <div class="fleet-popup-metric">
          <span>Heading</span>
          <strong>${formatNumber(vessel.heading, 1, '0.0')}<small>°</small></strong>
          </div>
        </div>

        <div class="fleet-popup-coordinates">
          <div>
            <span>Latitude</span>
            ${createCopyableCoordinateHtml(formattedLatitude, 'latitude')}
            <small class="coordinate-dms">${formattedLatitudeDms}</small>
          </div>
          <div>
            <span>Longitude</span>
            ${createCopyableCoordinateHtml(formattedLongitude, 'longitude')}
            <small class="coordinate-dms">${formattedLongitudeDms}</small>
          </div>
        </div>

        <div class="fleet-popup-meta">
          <div class="fleet-popup-row">
            <span>Last updated</span>
            <strong>${formatActualLastUpdated(vessel.lastUpdated)}</strong>
          </div>
        </div>

        <div class="fleet-popup-actions">
        <button
            type="button"
            class="fleet-popup-detail-btn"
            data-action="detail"
            data-vessel-id="${vessel.id}"
        >
            View detail
        </button>

        <button
            type="button"
            class="fleet-popup-dashboard-btn"
            data-action="dashboard"
            data-vessel-id="${vessel.id}"
        >
            Dashboard
        </button>
        </div>
      </div>
    `;
	}

	function createVesselTooltipHtml(vessel) {
		return `
      <div class="fleet-vessel-tooltip">
        <strong>${formatValue(vessel.name)}</strong>
        <span>Speed: ${formatNumber(vessel.speed, 1, '0.0')} kt</span>
        <span>Hire: ${normalizeHireStatus(vessel.hireStatus)}</span>
      </div>
    `;
	}

	function removeStaleVesselTooltipElements() {
		if (!browser) return;

		document.querySelectorAll('.fleet-vessel-tooltip-wrapper').forEach((element) => {
			element.remove();
		});
	}

	function closeVesselTooltips(vesselId = null) {
		if (vesselId && String(vesselHoverTooltipVesselId) !== String(vesselId)) return;

		markers.forEach((marker) => {
			marker.closeTooltip?.();
		});

		if (vesselHoverTooltip) {
			if (map?.hasLayer?.(vesselHoverTooltip)) {
				map.removeLayer(vesselHoverTooltip);
			}

			vesselHoverTooltip.remove?.();
			vesselHoverTooltip = null;
		}

		vesselHoverTooltipVesselId = null;
		removeStaleVesselTooltipElements();
	}

	function openVesselHoverTooltip(vessel, marker) {
		if (!map || !L || !vessel || !marker) return;

		closeVesselTooltips();

		vesselHoverTooltipVesselId = String(vessel.id);
		vesselHoverTooltip = L.tooltip({
			direction: 'top',
			offset: [0, -28],
			opacity: 1,
			permanent: false,
			interactive: false,
			className: 'fleet-vessel-tooltip-wrapper'
		})
			.setLatLng(marker.getLatLng())
			.setContent(createVesselTooltipHtml(vessel));

		vesselHoverTooltip.addTo(map);
	}

	function createAssetPopupHtml(asset) {
		const iconUrl = getAssetIconUrl(asset);
		const typeLabel = getAssetTypeLabel(asset);
		const formattedLatitude = formatNumber(asset.latitude, 6);
		const formattedLongitude = formatNumber(asset.longitude, 6);

		return `
    <div class="fleet-asset-popup">
      <div class="fleet-asset-popup-hero">
        <div class="fleet-asset-popup-icon" aria-hidden="true">
          <img src="${iconUrl}" alt="" />
        </div>
        <div class="fleet-asset-popup-heading">
          <span class="fleet-asset-popup-eyebrow">${formatValue(typeLabel)}</span>
          <strong>${formatValue(asset.name)}</strong>
        </div>
        <span class="fleet-asset-popup-badge">${formatValue(typeLabel)}</span>
      </div>
      <div class="fleet-asset-popup-coordinates">
        <div>
          <span>Latitude</span>
          ${createCopyableCoordinateHtml(formattedLatitude, 'asset latitude')}
          <small class="coordinate-dms">${formatDmsCoordinate(asset.latitude, 'lat')}</small>
        </div>
        <div>
          <span>Longitude</span>
          ${createCopyableCoordinateHtml(formattedLongitude, 'asset longitude')}
          <small class="coordinate-dms">${formatDmsCoordinate(asset.longitude, 'lng')}</small>
        </div>
      </div>
    </div>
  `;
	}

	function createVesselIcon(vessel) {
		const isSelected = String(selectedVesselId) === String(vessel.id);
		const iconWidth = isSelected ? 28 : 24;
		const iconHeight = isSelected ? 60 : 52;

		return L.divIcon({
			className: `vessel-leaflet-icon ${vessel.online ? 'online' : 'offline'} ${isSelected ? 'selected' : ''}`,
			html: `
        <img
          class="fleet-vessel-marker-icon"
          src="${vesselMarkerUrl}"
          alt="${formatValue(vessel.name)}"
          style="transform: rotate(${Number(vessel.heading || 0)}deg) scaleX(1.16);"
        />
      `,
			iconSize: [iconWidth, iconHeight],
			iconAnchor: [iconWidth / 2, iconHeight / 2],
			popupAnchor: [0, -(iconHeight / 2 + 2)]
		});
	}

	function createAssetIcon(asset) {
		const iconUrl = getAssetIconUrl(asset);
		const typeLabel = getAssetTypeLabel(asset);

		return L.divIcon({
			className: `asset-leaflet-icon asset-type-${String(typeLabel).toLowerCase()}`,
			html: `
        <img class="asset-type-marker-icon" src="${iconUrl}" alt="${formatValue(typeLabel)} asset" title="${formatValue(asset.name)}" />
        `,
			iconSize: [32, 32],
			iconAnchor: [16, 16],
			popupAnchor: [0, -16]
		});
	}

	function refreshMarkerSelection() {
		if (!L || !markers) return;

		markers.forEach((marker, vesselId) => {
			const vessel = vesselData.find((item) => String(item.id) === String(vesselId));
			if (!vessel) return;

			const isSelected = String(vesselId) === String(selectedVesselId);

			marker.setIcon(createVesselIcon(vessel));
			marker.options.pane = isSelected ? 'selectedVesselPane' : 'vesselPane';
			marker.setZIndexOffset(isSelected ? 1000 : 600);
		});
	}

	async function scrollSidebarToVessel(id, { behavior = 'smooth' } = {}) {
		const normalizedId = String(id);

		await tick();

		if (!vesselListContainer) return;

		const target = Array.from(vesselListContainer.querySelectorAll('[data-vessel-id]')).find(
			(element) => String(element.dataset.vesselId) === normalizedId
		);

		if (!target) return;

		const listRect = vesselListContainer.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		const targetOffset =
			targetRect.top -
			listRect.top +
			vesselListContainer.scrollTop -
			(vesselListContainer.clientHeight - targetRect.height) / 2;

		vesselListContainer.scrollTo({
			top: Math.max(0, targetOffset),
			behavior
		});
	}

	function clearSelectedVessel({ closePopup = true } = {}) {
		if (closePopup && selectedVesselId) {
			const marker = markers.get(String(selectedVesselId));

			if (marker && marker.isPopupOpen?.()) {
				ignoreNextPopupCloseForVesselId = String(selectedVesselId);
				marker.closePopup();
			}
		}

		selectedVesselId = null;
		selectedVesselDetail = null;
		showDetailPanel = false;
		detailSwitchFrom = null;
		detailEntryPoint = null;

		refreshMarkerSelection();
	}

	function getMarkerClientPoint(id) {
		const marker = markers.get(String(id));

		if (!map || !mapContainer || !marker?.getLatLng) return null;

		try {
			const point = map.latLngToContainerPoint(marker.getLatLng());
			const rect = mapContainer.getBoundingClientRect();

			return { x: rect.left + point.x, y: rect.top + point.y };
		} catch {
			return null;
		}
	}

	function getVesselListIndex(id) {
		return filteredVessels.findIndex((vessel) => String(vessel.id) === String(id));
	}

	function resolveDetailSwitchFrom(previousId, nextId) {
		if (!previousId || String(previousId) === String(nextId)) return null;

		const previousIndex = getVesselListIndex(previousId);
		const nextIndex = getVesselListIndex(nextId);

		if (previousIndex === -1 || nextIndex === -1) return null;

		return nextIndex < previousIndex ? 'top' : 'bottom';
	}

	function detailIntro(node) {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { duration: 0 };

		if (detailSwitchFrom) {
			// Simpan arah di elemen ini agar outro-nya konsisten walau state global
			// sudah dioverwrite oleh switch berikutnya.
			const sign = detailSwitchFrom === 'top' ? -1 : 1;
			node.dataset.detailSwitchSign = String(sign);

			return slideScale(node, {
				intro: true,
				axis: 'y',
				sign,
				distance: 200,
				start: 0.85,
				duration: 220
			});
		}

		if (node.dataset) {
			delete node.dataset.detailSwitchSign;
		}

		// Buka pertama: masuk dari titik kapal (fallback ke kanan).
		return panelEnter(node, { from: detailEntryPoint, start: 0.15, duration: 380 });
	}

	function detailOutro(node) {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { duration: 0 };

		const switchSign = Number(node?.dataset?.detailSwitchSign);
		const isSwitch = showDetailPanel && Number.isFinite(switchSign) && switchSign !== 0;

		if (isSwitch) {
			// Ganti vessel: panel lama keluar ke arah berlawanan dengan sisi masuk.
			return slideScale(node, {
				intro: false,
				axis: 'y',
				sign: -switchSign,
				distance: 200,
				start: 0.85,
				fadeAt: 0.3,
				duration: 220
			});
		}

		// Tutup panel: geser melewati sisi kanan sambil memudar dan mengecil.
		return slideScale(node, {
			intro: false,
			axis: 'x',
			sign: 1,
			distance: node.getBoundingClientRect().width + 32,
			start: 0.55,
			fadeAt: 1,
			duration: 280
		});
	}

	async function openVesselDetail(id) {
		const normalizedId = String(id);
		const previousId = selectedVesselId;
		const wasPanelOpen = showDetailPanel;

		detailSwitchFrom = wasPanelOpen ? resolveDetailSwitchFrom(previousId, normalizedId) : null;

		selectedVesselId = normalizedId;
		selectedVesselDetail = null;
		detailEntryPoint = getMarkerClientPoint(normalizedId);

		if (wasPanelOpen) {
			detailSwitchSeq += 1;
		}

		showDetailPanel = true;

		refreshMarkerSelection();

		await loadVesselDetail(normalizedId);
	}

	async function openVesselDetailFromPopup(id, marker) {
		const normalizedId = String(id);
		const wasPanelOpen = showDetailPanel;

		ignoreNextPopupCloseForVesselId = normalizedId;
		openingDetailFromPopupForVesselId = normalizedId;

		detailSwitchFrom = wasPanelOpen
			? resolveDetailSwitchFrom(selectedVesselId, normalizedId)
			: null;

		// Set state panel lebih dulu agar popup ditutup tanpa animasi outro
		// (lihat shouldSkipClosing pada enableFleetPopupTransition).
		selectedVesselId = normalizedId;
		selectedVesselDetail = null;
		detailEntryPoint = getMarkerClientPoint(normalizedId);

		if (wasPanelOpen) {
			detailSwitchSeq += 1;
		}

		showDetailPanel = true;
		isSidebarOpen = false;

		marker?.closePopup?.();

		refreshMarkerSelection();

		await loadVesselDetail(normalizedId);

		if (String(openingDetailFromPopupForVesselId) === normalizedId) {
			openingDetailFromPopupForVesselId = null;
		}
	}

	function handleFleetPopupAction(event) {
		if (handleCoordinateCopyClick(event)) return;

		const actionButton = event.target?.closest?.('[data-action][data-vessel-id]');

		if (!actionButton || !mapContainer?.contains?.(actionButton)) return;

		const action = actionButton.dataset.action;
		const vesselId = String(actionButton.dataset.vesselId || '');

		if (!vesselId || (action !== 'detail' && action !== 'dashboard')) return;

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation?.();

		const marker = markers.get(vesselId);

		if (action === 'detail') {
			void openVesselDetailFromPopup(vesselId, marker);
			return;
		}

		const vessel = vesselData.find((item) => String(item.id) === vesselId);

		if (!vessel) return;

		ignoreNextPopupCloseForVesselId = vesselId;

		void (async () => {
			await openVesselDashboard(vessel);
			marker?.closePopup?.();
		})();
	}

	async function openVesselPopupFromInteraction(id, { zoom = 7, keepSidebarOpen = false } = {}) {
		const normalizedId = String(id);
		const previousId = selectedVesselId ? String(selectedVesselId) : null;
		const keepDetailPanelOpen = showDetailPanel;
		const isVesselSwitch = keepDetailPanelOpen && previousId !== normalizedId;

		// Hitung arah SEBELUM state apa pun berubah, selama urutan list masih stabil.
		// Saat panel sudah terbuka dan user memilih vessel lain: animasi ganti
		// mengikuti urutan list (dari atas / ke bawah).
		detailSwitchFrom = isVesselSwitch ? resolveDetailSwitchFrom(previousId, normalizedId) : null;

		if (previousId && previousId !== normalizedId) {
			const previousMarker = markers.get(previousId);

			if (previousMarker?.isPopupOpen?.()) {
				ignoreNextPopupCloseForVesselId = previousId;
				previousMarker.closePopup();
			}
		}

		selectedVesselId = normalizedId;
		selectedVesselDetail = null;
		showDetailPanel = keepDetailPanelOpen;
		detailEntryPoint = getMarkerClientPoint(normalizedId);

		// Remount panel hanya saat benar-benar ganti vessel (key switch naik).
		if (isVesselSwitch) {
			detailSwitchSeq += 1;
		}

		if (!keepSidebarOpen) {
			isSidebarOpen = false;
		}

		refreshMarkerSelection();
		focusVessel(normalizedId, zoom, !keepDetailPanelOpen);
		setTimeout(() => {
			const marker = markers.get(normalizedId);

			if (keepDetailPanelOpen) {
				if (marker?.isPopupOpen?.()) {
					ignoreNextPopupCloseForVesselId = normalizedId;
					marker.closePopup?.();
				}

				return;
			}

			marker?.openPopup?.();
		}, 0);
		void scrollSidebarToVessel(normalizedId);

		const detail = await loadVesselDetail(normalizedId);

		if (detail && String(selectedVesselId) === normalizedId && !showDetailPanel) {
			const marker = markers.get(normalizedId);
			marker?.setPopupContent?.(createPopupHtml(detail));
			marker?.openPopup?.();
		}
	}

	function closeVesselDetail() {
		clearSelectedVessel();
	}

	function changeSelectedVessel(id, { openPopup = true, zoom = 7 } = {}) {
		const normalizedId = String(id);
		const isDifferentVessel = String(selectedVesselId) !== normalizedId;

		selectedVesselId = normalizedId;
		selectedVesselDetail = null;

		if (isDifferentVessel) {
			showDetailPanel = false;
			detailSwitchFrom = null;
		}

		refreshMarkerSelection();
		focusVessel(normalizedId, zoom, openPopup);
	}

	function buildMarkers() {
		if (!map || !L) return;

		closeVesselTooltips();

		markers.forEach((marker) => {
			marker.off();
			marker.closePopup?.();
			marker.closeTooltip?.();
			marker.unbindPopup?.();
			marker.unbindTooltip?.();

			if (map?.hasLayer?.(marker)) {
				map.removeLayer(marker);
			} else {
				marker.remove();
			}
		});

		markers.clear();
		markers = new Map();

		vesselData.forEach((vessel) => {
			const lat = Number(vessel.lat ?? vessel.latitude);
			const lng = Number(vessel.lng ?? vessel.longitude);

			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
			if (lat === 0 && lng === 0) return;

			const vesselId = String(vessel.id);

			const marker = L.marker([lat, lng], {
				icon: createVesselIcon(vessel),
				pane: String(vesselId) === String(selectedVesselId) ? 'selectedVesselPane' : 'vesselPane',
				zIndexOffset: String(vesselId) === String(selectedVesselId) ? 1000 : 600
			}).addTo(map);

			marker.bindPopup(createPopupHtml(vessel), {
				closeButton: true,
				autoPan: true,
				autoClose: true,
				closeOnClick: false,
				maxWidth: 360,
				className: 'fleet-leaflet-popup'
			});

			marker.on('mouseover', () => {
				openVesselHoverTooltip(vessel, marker);
			});

			marker.on('mouseout', () => {
				closeVesselTooltips(vesselId);
			});

			marker.on('click', () => {
				closeVesselTooltips();
				void openVesselPopupFromInteraction(vesselId, { zoom: map?.getZoom?.() ?? 7 });
			});

			marker.on('popupclose', () => {
				if (
					String(ignoreNextPopupCloseForVesselId) === vesselId ||
					String(openingDetailFromPopupForVesselId) === vesselId
				) {
					ignoreNextPopupCloseForVesselId = null;
					return;
				}

				if (String(selectedVesselId) === vesselId && !showDetailPanel) {
					selectedVesselId = null;
					selectedVesselDetail = null;
					refreshMarkerSelection();
				}
			});

			markers.set(vesselId, marker);
		});

		refreshMarkerSelection();
	}

	function setupMapPanes() {
		if (!map) return;

		if (!map.getPane('currentPane')) {
			map.createPane('currentPane');
			map.getPane('currentPane').style.zIndex = '430';
			map.getPane('currentPane').style.pointerEvents = 'none';
		}

		if (!map.getPane('windPane')) {
			map.createPane('windPane');
			map.getPane('windPane').style.zIndex = '420';
			map.getPane('windPane').style.pointerEvents = 'none';
		}

		if (!map.getPane('assetPane')) {
			map.createPane('assetPane');
			map.getPane('assetPane').style.zIndex = '450';
		}

		if (!map.getPane('assetBoundaryPane')) {
			map.createPane('assetBoundaryPane');
			map.getPane('assetBoundaryPane').style.zIndex = '440';
			map.getPane('assetBoundaryPane').style.pointerEvents = 'none';
		}

		if (!map.getPane('vesselPane')) {
			map.createPane('vesselPane');
			map.getPane('vesselPane').style.zIndex = '650';
		}

		if (!map.getPane('selectedVesselPane')) {
			map.createPane('selectedVesselPane');
			map.getPane('selectedVesselPane').style.zIndex = '750';
		}
	}

	function updateSingleVesselMarker(vessel) {
		if (!map || !L || !vessel) return;

		const vesselId = String(vessel.id);
		const marker = markers.get(vesselId);

		const lat = Number(vessel.lat ?? vessel.latitude);
		const lng = Number(vessel.lng ?? vessel.longitude);

		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
		if (lat === 0 && lng === 0) return;

		if (!marker) {
			buildMarkers();
			return;
		}

		marker.setLatLng([lat, lng]);
		marker.setIcon(createVesselIcon(vessel));
		marker.setPopupContent(createPopupHtml(vessel));
		const isSelected = String(vesselId) === String(selectedVesselId);

		marker.options.pane = isSelected ? 'selectedVesselPane' : 'vesselPane';
		marker.setZIndexOffset(isSelected ? 1000 : 600);
	}

	function buildAssetMarkers() {
		if (!map || !L) return;

		assetMarkers.forEach((marker) => marker.remove());
		assetMarkers = new Map();
		assetBoundaryCircles.forEach((circle) => circle.remove());
		assetBoundaryCircles = new Map();

		if (!showAssets) return;

		assetData.forEach((asset) => {
			if (!isAssetTypeVisible(asset)) return;

			const lat = Number(asset.lat ?? asset.latitude);
			const lng = Number(asset.lng ?? asset.longitude);

			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
			if (lat === 0 && lng === 0) return;

			const assetId = String(asset.id);

			const boundaryCircle = L.circle([lat, lng], {
				radius: 1000,
				pane: 'assetBoundaryPane',
				interactive: false,
				stroke: true,
				color: '#f59e0b',
				weight: 2,
				opacity: 0.9,
				fill: true,
				fillColor: '#f59e0b',
				fillOpacity: 0.12,
				dashArray: '8 8',
				className: 'asset-boundary-circle'
			}).addTo(map);

			const marker = L.marker([lat, lng], {
				icon: createAssetIcon(asset),
				pane: 'assetPane',
				zIndexOffset: 0
			}).addTo(map);

			marker.bindPopup(createAssetPopupHtml(asset), {
				closeButton: true,
				autoPan: true,
				maxWidth: 300,
				className: 'asset-leaflet-popup'
			});

			assetMarkers.set(assetId, marker);
			assetBoundaryCircles.set(assetId, boundaryCircle);
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

	function getWeatherWindSpeedKt(weather = {}) {
		const directKt = Number(
			weather.wind_speed_kt ??
				weather.windSpeedKt ??
				weather.wind_kt ??
				weather.wind_kts ??
				weather.wind_knots
		);

		if (Number.isFinite(directKt)) return Math.max(0, Math.min(80, directKt));

		const kph = Number(weather.wind_kph ?? weather.windSpeedKph);
		if (Number.isFinite(kph)) return Math.max(0, Math.min(80, kph / 1.852));

		const mph = Number(weather.wind_mph ?? weather.windSpeedMph);
		if (Number.isFinite(mph)) return Math.max(0, Math.min(80, mph * 0.868976));

		const ms = Number(weather.wind_ms ?? weather.wind_mps ?? weather.windSpeedMs);
		if (Number.isFinite(ms)) return Math.max(0, Math.min(80, ms * 1.94384));

		const fallback = Number(weather.wind_speed ?? weather.windSpeed);
		return Number.isFinite(fallback) ? Math.max(0, Math.min(80, fallback)) : 8;
	}

	function getWindSourcePoints() {
		const sourceVessels = [...vesselData];

		if (
			selectedVessel &&
			!sourceVessels.some((item) => String(item.id) === String(selectedVessel.id))
		) {
			sourceVessels.push(selectedVessel);
		}

		return sourceVessels
			.map((vessel) => {
				const currentWeather = getCurrentWeather(vessel) || vessel?.weather || {};
				const fleetPosition = getFleetVesselLatLng(vessel);

				if (!fleetPosition) return null;

				const windFromDeg =
					normalizeWindDirectionDegrees(
						currentWeather.wind_degree ??
							currentWeather.wind_deg ??
							currentWeather.wind_dir_degree ??
							currentWeather.windDirectionDeg ??
							currentWeather.wind_dir ??
							currentWeather.windDirection ??
							vessel.wind_degree ??
							vessel.wind_deg ??
							vessel.wind_dir
					) ?? 110;

				return {
					lat: fleetPosition.lat,
					lng: fleetPosition.lng,
					// weather wind direction umumnya menunjukkan arah asal angin.
					// Particles move toward the wind direction.
					directionToDeg: (windFromDeg + 180) % 360,
					speedKt: getWeatherWindSpeedKt(currentWeather)
				};
			})
			.filter(Boolean);
	}

	function getSeaCurrentData(vessel) {
		return vessel?.oceanCurrent?.current || null;
	}

	function getSeaCurrentSpeedKt(current = {}) {
		const speedKph = Number(current?.speed_kph);

		if (!Number.isFinite(speedKph)) return 1.2;

		return Math.max(0.1, Math.min(12, speedKph / 1.852));
	}

	function getSeaCurrentSourcePoints() {
		const sourceVessels = [...vesselData];

		if (
			selectedVessel &&
			!sourceVessels.some((item) => String(item.id) === String(selectedVessel.id))
		) {
			sourceVessels.push(selectedVessel);
		}

		return sourceVessels
			.map((vessel) => {
				const current = getSeaCurrentData(vessel) || {};
				const fleetPosition = getFleetVesselLatLng(vessel);

				if (!fleetPosition) return null;

				const directionToDeg =
					normalizeWindDirectionDegrees(
						current.direction_to_deg ??
							current.directionToDeg ??
							current.current_direction_to_deg ??
							current.direction_to ??
							current.directionTo ??
							vessel.current_direction_to_deg ??
							vessel.currentDirectionToDeg ??
							vessel.current_direction_to ??
							vessel.currentDirectionTo
					) ?? 105;

				return {
					lat: fleetPosition.lat,
					lng: fleetPosition.lng,
					directionToDeg,
					speedKt: getSeaCurrentSpeedKt(current)
				};
			})
			.filter(Boolean);
	}

	function getWindParticleCount() {
		if (!map) return WIND_PARTICLE_MIN_COUNT;

		const size = map.getSize();
		const width = Math.max(size.x, windCanvasWidth || size.x);
		const height = Math.max(size.y, windCanvasHeight || size.y);
		const count = Math.round((width * height) / 7200);

		return Math.max(WIND_PARTICLE_MIN_COUNT, Math.min(WIND_PARTICLE_MAX_COUNT, count));
	}

	function resetWindParticle(particle = {}, randomAge = true) {
		if (!map) return particle;

		const size = map.getSize();
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
		if (!map || !L || !windCanvas) return;

		const topLeft = map.containerPointToLayerPoint([-windCanvasBuffer, -windCanvasBuffer]);

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
		if (!browser || !map || !windCanvas || !windContext) return;

		const size = map.getSize();
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
		if (!map || !sources.length) return getFallbackWindVector();

		const latLng = map.containerPointToLatLng([point.x, point.y]);
		let totalWeight = 0;
		let weightedX = 0;
		let weightedY = 0;
		let weightedSpeed = 0;

		sources.forEach((source) => {
			const distance = Math.max(18000, map.distance(latLng, [source.lat, source.lng]));
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
		if (!map || !windCanvas || !windContext || !showWindParticles) return;

		const size = map.getSize();
		const canvasWidth = windCanvasWidth || size.x;
		const canvasHeight = windCanvasHeight || size.y;
		const sources = getWindSourcePoints();

		windContext.globalCompositeOperation = 'destination-out';
		windContext.fillStyle = `rgba(0, 0, 0, ${WIND_PARTICLE_TRAIL_FADE_ALPHA})`;
		windContext.fillRect(0, 0, canvasWidth, canvasHeight);

		windContext.globalCompositeOperation = 'source-over';

		if (!sources.length) return;

		windContext.lineCap = 'round';
		windContext.lineJoin = 'round';
		windContext.lineWidth = WIND_PARTICLE_LINE_WIDTH;
		windContext.shadowBlur = 1.5;
		windContext.shadowColor = 'rgba(15, 23, 42, 0.18)';

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
			gradient.addColorStop(0, `rgba(15, 23, 42, ${tailAlpha})`);
			gradient.addColorStop(0.55, `rgba(15, 23, 42, ${particle.alpha * 0.42})`);
			gradient.addColorStop(1, `rgba(15, 23, 42, ${headAlpha})`);

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
		if (!browser || windFrame) return;

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
		if (!map || !L || windParticleLayer) return;

		windParticleLayer = new L.Layer();

		windParticleLayer.onAdd = (targetMap) => {
			const pane = targetMap.getPane('windPane') || targetMap.getPanes().overlayPane;

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

		windParticleLayer.addTo(map);
	}

	function removeWindParticleLayer() {
		if (windParticleLayer && map) {
			map.removeLayer(windParticleLayer);
		}

		windParticleLayer = null;
		stopWindAnimation();
	}

	function getCurrentParticleCount() {
		if (!map) return CURRENT_PARTICLE_MIN_COUNT;

		const size = map.getSize();
		const width = Math.max(size.x, currentCanvasWidth || size.x);
		const height = Math.max(size.y, currentCanvasHeight || size.y);
		const count = Math.round((width * height) / 10500);

		return Math.max(CURRENT_PARTICLE_MIN_COUNT, Math.min(CURRENT_PARTICLE_MAX_COUNT, count));
	}

	function resetCurrentParticle(particle = {}, randomAge = true) {
		if (!map) return particle;

		const size = map.getSize();
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
		if (!map || !L || !currentCanvas) return;

		const topLeft = map.containerPointToLayerPoint([-currentCanvasBuffer, -currentCanvasBuffer]);

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
		if (!browser || !map || !currentCanvas || !currentContext) return;

		const size = map.getSize();
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

	function getFallbackCurrentVector() {
		return {
			x: 0.6,
			y: 0.18,
			speed: 1.2
		};
	}

	function getCurrentVectorAtContainerPoint(point, sources = []) {
		if (!map || !sources.length) return null;

		const latLng = map.containerPointToLatLng([point.x, point.y]);
		let totalWeight = 0;
		let weightedX = 0;
		let weightedY = 0;
		let weightedSpeed = 0;

		sources.forEach((source) => {
			const rawDistance = map.distance(latLng, [source.lat, source.lng]);

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
		if (!map || !currentCanvas || !currentContext || !showCurrentParticles) return;

		const size = map.getSize();
		const canvasWidth = currentCanvasWidth || size.x;
		const canvasHeight = currentCanvasHeight || size.y;
		const sources = getSeaCurrentSourcePoints();

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
		if (!browser || currentFrame) return;

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
		if (!map || !L || currentParticleLayer) return;

		currentParticleLayer = new L.Layer();

		currentParticleLayer.onAdd = (targetMap) => {
			const pane = targetMap.getPane('currentPane') || targetMap.getPanes().overlayPane;

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

		currentParticleLayer.addTo(map);
	}

	function removeCurrentParticleLayer() {
		if (currentParticleLayer && map) {
			map.removeLayer(currentParticleLayer);
		}

		currentParticleLayer = null;
		stopCurrentAnimation();
	}

	function focusVessel(vesselId, zoom = 7, openPopup = true) {
		if (!map) return;

		const normalizedId = String(vesselId);
		const vessel = vesselData.find((item) => String(item.id) === normalizedId);
		const marker = markers.get(normalizedId);

		if (!vessel || !marker) return;

		const lat = Number(vessel.lat ?? vessel.latitude);
		const lng = Number(vessel.lng ?? vessel.longitude);

		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

		map.flyTo([lat, lng], zoom, {
			animate: true,
			duration: 0.65
		});

		if (openPopup) {
			marker.openPopup();
		}
	}

	function selectVessel(id) {
		const normalizedId = String(id);

		void openVesselPopupFromInteraction(normalizedId, { keepSidebarOpen: true });
	}

	async function waitForMapContainer(maxRetry = 20) {
		for (let i = 0; i < maxRetry; i += 1) {
			await tick();

			if (mapContainer) {
				return mapContainer;
			}

			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		return null;
	}

	async function loadFleetVessels({ silent = false } = {}) {
		if (fleetRefreshInProgress) return;

		fleetRefreshInProgress = true;
		const activePopupVesselId = selectedVesselId ? String(selectedVesselId) : null;
		const shouldRestoreActivePopup = Boolean(
			activePopupVesselId && !showDetailPanel && markers.get(activePopupVesselId)?.isPopupOpen?.()
		);

		if (!silent) {
			fleetLoading = true;
			fleetError = '';
		}

		try {
			const vessels = await getFleetVessels({});
			const previousVesselMap = new Map(
				vesselData.map((item) => [String(item.id ?? item.vesselId), item])
			);

			const normalizedVessels = sortByAlpha(
				Array.isArray(vessels)
					? vessels.map((vessel) => {
							const normalized = normalizeFleetVessel(vessel);
							const previous = previousVesselMap.get(String(normalized.id ?? normalized.vesselId));
							return previous ? mergeFleetRefreshVessel(previous, normalized) : normalized;
						})
					: [],
				(vessel) => vessel.name || vessel.vesselName,
				(vessel) => vessel.companyName
			);

			vesselData = normalizedVessels;
			fleetError = '';

			if (selectedVesselId) {
				const refreshedSelected = vesselData.find(
					(item) => String(item.id) === String(selectedVesselId)
				);

				if (refreshedSelected) {
					selectedVesselDetail = selectedVesselDetail
						? mergeVesselWithLiveDetail(selectedVesselDetail, refreshedSelected)
						: refreshedSelected;
				} else {
					selectedVesselId = null;
					selectedVesselDetail = null;
					showDetailPanel = false;
					detailSwitchFrom = null;
				}
			}

			if (map && L) {
				buildMarkers();

				if (showWindParticles) {
					seedWindParticles(true);
					drawWindParticles();
				}

				if (showCurrentParticles) {
					seedCurrentParticles(true);
					drawCurrentParticles();
				}

				if (shouldRestoreActivePopup) {
					setTimeout(() => {
						const marker = markers.get(activePopupVesselId);
						if (marker && String(selectedVesselId) === activePopupVesselId && !showDetailPanel) {
							marker.openPopup?.();
						}
					}, 0);
				}
			}
		} catch (error) {
			console.error('[FLEET_VIEW_LOAD_ERROR]', error);

			if (!silent) {
				fleetError = error?.message || 'Failed to load fleet data.';
				vesselData = [];
			}
		} finally {
			if (!silent) {
				fleetLoading = false;
			}

			fleetRefreshInProgress = false;
		}
	}

	let vesselsWithCoordinate = $derived(
		vesselData.filter((vessel) => {
			const lat = Number(vessel.lat ?? vessel.latitude);
			const lng = Number(vessel.lng ?? vessel.longitude);

			return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
		})
	);

	async function loadFleetAssets() {
		assetLoading = true;
		assetError = '';

		try {
			const assets = await getFleetAssets();

			zoneData = normalizeMapZonesFromAssets(assets);
			assetData = sortByAlpha(
				assets.map(normalizeFleetAsset).filter((asset) => {
					if (!asset) return false;

					const lat = Number(asset.lat ?? asset.latitude);
					const lng = Number(asset.lng ?? asset.longitude);

					if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
					if (lat === 0 && lng === 0) return false;

					return true;
				}),
				(asset) => asset.assetName || asset.name,
				(asset) => asset.assetType
			);

			if (map && L) {
				rebuildZoneLayer();
				buildAssetMarkers();
			}
		} catch (error) {
			console.error('[FLEET_ASSET_LOAD_ERROR]', error);

			assetError = error?.message || 'Failed to load asset data.';
			assetData = [];
			zoneData = [];
		} finally {
			assetLoading = false;
		}
	}

	async function loadDetailCctvSnapshots(vesselId) {
		if (!vesselId) {
			detailCctvSnapshots = [];
			detailCctvLoadedVesselId = null;
			selectedDetailCctvKey = '';
			return [];
		}

		detailCctvLoading = true;
		detailCctvError = '';

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

			detailCctvSnapshots = snapshots;
			detailCctvLoadedVesselId = String(vesselId);
			selectedDetailCctvKey = '';
			return snapshots;
		} catch (error) {
			console.error('[FLEET_DETAIL_CCTV_ERROR]', error);
			detailCctvSnapshots = [];
			detailCctvError = error?.message || 'Failed to load CCTV snapshots.';
			detailCctvLoadedVesselId = String(vesselId);
			selectedDetailCctvKey = '';
			return [];
		} finally {
			detailCctvLoading = false;
		}
	}

	async function loadVesselDetail(id) {
		if (!id) return null;

		const normalizedId = String(id);

		try {
			const existing = vesselData.find((item) => String(item.id) === normalizedId);

			const liveDetail = await getFleetVesselLiveDetail(normalizedId);

			const mergedDetail = mergeVesselWithLiveDetail(existing, liveDetail);

			if (String(selectedVesselId) === normalizedId) {
				selectedVesselDetail = mergedDetail;
			}

			vesselData = vesselData.map((item) => {
				if (String(item.id) !== normalizedId) return item;
				return mergedDetail;
			});

			console.log('[FLEET_VIEW][VESSEL_LIVE_DETAIL]', mergedDetail);

			updateSingleVesselMarker(mergedDetail);
			refreshMarkerSelection();

			return mergedDetail;
		} catch (error) {
			console.error('[FLEET_VIEW_LIVE_DETAIL_ERROR]', error);
			return null;
		}
	}

	function startFleetAutoRefresh() {
		if (!browser) return;

		if (fleetRefreshTimer) {
			clearInterval(fleetRefreshTimer);
		}

		fleetRefreshTimer = setInterval(() => {
			if (!isFleetMounted) return;

			loadFleetVessels({
				silent: true
			});
		}, FLEET_REFRESH_INTERVAL_MS);
	}

	async function initializeFleetMap() {
		if (!browser || !isFleetMounted || !isFleetPageActive || map || mapInitializing) return;

		mapInitializing = true;

		try {
			const container = await waitForMapContainer();

			if (!isFleetMounted || !isFleetPageActive) return;

			if (!container) {
				console.warn('[FLEET_MAP] mapContainer still not ready after retry');
				return;
			}

			L = await import('leaflet');
			await import('leaflet/dist/leaflet.css');

			enableFleetPopupTransition(L, { shouldSkipClosing: () => showDetailPanel });

			if (!isFleetMounted || !isFleetPageActive || !container) return;

			map = L.map(container, {
				zoomControl: false,
				attributionControl: true,
				preferCanvas: true,
				closePopupOnClick: false
			}).setView([-2.8, 114.5], 5);

			addMapTileLayer(L, map);
			addLeafletZoomAndScale(L, map);

			setupMapPanes();
			rebuildZoneLayer();
			buildMarkers();
			buildAssetMarkers();

			if (isFleetPageActive && showCurrentParticles) {
				addCurrentParticleLayer();
			}

			if (isFleetPageActive && showWindParticles) {
				addWindParticleLayer();
			}

			map.on('contextmenu', handleMapRightClick);
			map.on('click', handleMapMeasureClick);
			container.addEventListener('click', handleFleetPopupAction, true);

			setTimeout(() => {
				if (!map) return;

				map.invalidateSize();

				if (selectedVesselId) {
					focusVessel(selectedVesselId, 6, true);
				}
			}, 250);
		} finally {
			mapInitializing = false;
		}
	}

	function destroyFleetMap() {
		mapContainer?.removeEventListener?.('click', handleFleetPopupAction, true);

		closeVesselTooltips();
		cancelMeasure();
		removeCurrentParticleLayer();
		removeWindParticleLayer();

		markers.forEach((marker) => {
			marker.off?.();
			marker.closePopup?.();
			marker.closeTooltip?.();
			marker.unbindPopup?.();
			marker.unbindTooltip?.();
			marker.remove?.();
		});
		markers.clear();
		markers = new Map();

		assetMarkers.forEach((marker) => marker.remove());
		assetMarkers.clear();
		assetMarkers = new Map();

		assetBoundaryCircles.forEach((circle) => circle.remove());
		assetBoundaryCircles.clear();
		assetBoundaryCircles = new Map();

		if (zoneLayerGroup) {
			zoneLayerGroup.clearLayers();
			zoneLayerGroup.remove();
			zoneLayerGroup = null;
		}

		if (map) {
			map.off('contextmenu', handleMapRightClick);
			map.off('click', handleMapMeasureClick);
			map.remove();
			map = null;
		}
	}

	function doRectsOverlap(rectA, rectB, padding = 0) {
		if (!rectA || !rectB) return false;

		return !(
			rectA.right + padding < rectB.left ||
			rectA.left - padding > rectB.right ||
			rectA.bottom + padding < rectB.top ||
			rectA.top - padding > rectB.bottom
		);
	}

	function updateSidebarToggleLegendOverlap() {
		if (!browser) return;

		if (sidebarToggleOverlapFrame) {
			cancelAnimationFrame(sidebarToggleOverlapFrame);
		}

		sidebarToggleOverlapFrame = requestAnimationFrame(() => {
			sidebarToggleOverlapFrame = null;

			if (!isMapLegendOpen || !sidebarToggleButton || !mapLegendElement) {
				sidebarToggleOverlapsLegend = false;
				sidebarToggleSafeTop = 0;
				return;
			}

			const toggleRect = sidebarToggleButton.getBoundingClientRect();
			const legendRect = mapLegendElement.getBoundingClientRect();
			const overlaps = doRectsOverlap(toggleRect, legendRect, 6);

			sidebarToggleOverlapsLegend = overlaps;

			if (!overlaps) {
				sidebarToggleSafeTop = 0;
				return;
			}

			sidebarToggleSafeTop = Math.max(50, Math.round(legendRect.top - toggleRect.height / 2 - 10));
		});
	}

	onMount(async () => {
		if (!browser) return;

		isFleetMounted = true;
		isSidebarOpen = window.innerWidth > 760;

		window.addEventListener('mobile-panel-open', handleMobilePanelOpen);
		window.addEventListener('resize', updateSidebarToggleLegendOverlap);
		document.addEventListener('fullscreenchange', handleFleetFullscreenChange);
		document.addEventListener('webkitfullscreenchange', handleFleetFullscreenChange);
		document.addEventListener('mozfullscreenchange', handleFleetFullscreenChange);
		document.addEventListener('MSFullscreenChange', handleFleetFullscreenChange);

		await initializeFleetMap();

		await loadFleetVessels();

		await loadFleetAssets();

		startFleetAutoRefresh();
	});

	onDestroy(() => {
		isFleetMounted = false;

		if (fleetRefreshTimer) {
			clearInterval(fleetRefreshTimer);
			fleetRefreshTimer = null;
		}

		if (browser) {
			window.removeEventListener('mobile-panel-open', handleMobilePanelOpen);
			window.removeEventListener('resize', updateSidebarToggleLegendOverlap);
			document.removeEventListener('fullscreenchange', handleFleetFullscreenChange);
			document.removeEventListener('webkitfullscreenchange', handleFleetFullscreenChange);
			document.removeEventListener('mozfullscreenchange', handleFleetFullscreenChange);
			document.removeEventListener('MSFullscreenChange', handleFleetFullscreenChange);
		}

		if (sidebarToggleOverlapFrame) {
			cancelAnimationFrame(sidebarToggleOverlapFrame);
			sidebarToggleOverlapFrame = null;
		}

		destroyFleetMap();
	});

	$effect(() => {
		isMapLegendOpen;
		isSidebarOpen;
		isFleetFullscreen;

		if (!browser || !isFleetMounted) return;

		tick().then(updateSidebarToggleLegendOverlap);
	});

	$effect(() => {
		isFleetPageActive;

		if (!browser || !isFleetMounted) return;

		if (isFleetPageActive) {
			initializeFleetMap();
		} else {
			destroyFleetMap();
		}
	});

	$effect(() => {
		if (!map) return;

		setTimeout(() => {
			if (!map) return;
			map.invalidateSize();
		}, 100);
	});

	$effect(() => {
		isSidebarOpen;

		if (!map) return;

		setTimeout(() => {
			map?.invalidateSize?.({
				pan: false
			});
		}, 260);
	});

	$effect(() => {
		showAssets;
		visibleAssetTypes;
		assetData;

		if (!map || !L) return;

		buildAssetMarkers();
	});

	$effect(() => {
		showDetailPanel;
		selectedVesselId;

		if (!showDetailPanel || !selectedVesselId) {
			detailCctvSnapshots = [];
			detailCctvError = '';
			detailCctvLoading = false;
			detailCctvLoadedVesselId = null;
			selectedDetailCctvKey = '';
			return;
		}

		if (String(detailCctvLoadedVesselId) === String(selectedVesselId) || detailCctvLoading) return;

		loadDetailCctvSnapshots(selectedVesselId);
	});

	$effect(() => {
		if (!detailCctvItems.length) {
			if (selectedDetailCctvKey) selectedDetailCctvKey = '';
			return;
		}

		if (!detailCctvItems.some((item) => item.key === selectedDetailCctvKey)) {
			selectedDetailCctvKey = detailCctvItems[0]?.key || '';
		}
	});

	$effect(() => {
		isFleetPageActive;
		showCurrentParticles;
		vesselData;

		if (!map || !L) return;

		if (isFleetPageActive && showCurrentParticles) {
			addCurrentParticleLayer();
			seedCurrentParticles(true);
		} else {
			removeCurrentParticleLayer();
		}
	});

	$effect(() => {
		isFleetPageActive;
		showWindParticles;
		vesselData;

		if (!map || !L) return;

		if (isFleetPageActive && showWindParticles) {
			addWindParticleLayer();
			seedWindParticles(true);
		} else {
			removeWindParticleLayer();
		}
	});
</script>

<section class="fleet-page">
	<button
		type="button"
		class:sidebar-open-toggle={isSidebarOpen}
		class:legend-overlap-toggle={sidebarToggleOverlapsLegend}
		class="sidebar-toggle-btn"
		style={sidebarToggleOverlapsLegend
			? `--sidebar-toggle-safe-top: ${sidebarToggleSafeTop}px;`
			: ''}
		bind:this={sidebarToggleButton}
		aria-expanded={isSidebarOpen}
		aria-label={isSidebarOpen ? 'Close vessel sidebar' : 'Open vessel sidebar'}
		title={isSidebarOpen ? 'Hide vessels' : 'Show vessels'}
		onclick={toggleSidebar}
	>
		<span class="sidebar-toggle-icon" aria-hidden="true">{isSidebarOpen ? '<' : '>'}</span>
	</button>

	{#if isSidebarOpen}
		<button
			type="button"
			class="mobile-sidebar-backdrop"
			aria-label="Close vessel sidebar"
			onclick={closeSidebar}
		></button>
	{/if}

	<div class:sidebar-collapsed={!isSidebarOpen} class="fleet-layout">
		<aside
			class:sidebar-open={isSidebarOpen}
			class:sidebar-collapsed={!isSidebarOpen}
			class="fleet-sidebar"
		>
			<div class="sidebar-fixed">
				<FleetViewSidebarHeader
					{statusFilter}
					{onlineCount}
					{offlineCount}
					totalCount={vesselData.length}
					bind:search
					onFilter={(value) => (statusFilter = value)}
					onCloseMobile={closeMobileSidebar}
				/>

				<div class="vessel-list" bind:this={vesselListContainer}>
					{#if fleetLoading && !vesselData.length}
						<LoadingSkeleton label="Loading fleet vessels" variant="fleet-list" rows={7} compact />
					{:else}
						{#each filteredVessels as vessel}
							<article
								data-vessel-id={String(vessel.id)}
								class:selected-card={String(selectedVesselId) === String(vessel.id)}
								class:offline-card={!vessel.online}
								class="vessel-card"
							>
								<button
									type="button"
									class:selected-select={String(selectedVesselId) === String(vessel.id)}
									class:offline-select={!vessel.online}
									class="vessel-select"
									aria-pressed={String(selectedVesselId) === String(vessel.id)}
									onclick={() => selectVessel(vessel.id)}
								>
									<div class="vessel-main-row">
										<div class="vessel-identity">
											<span
												class:online={vessel.online}
												class:offline={!vessel.online}
												class="status-dot"
											></span>

											<div class="vessel-name-block">
												<h3>{vessel.name}</h3>
												<p>Last Updated:</p>
												<p>
													{formatLastUpdatedBadge(vessel.lastUpdated, vessel.timezone)}
												</p>
											</div>
										</div>

										<div class="vessel-card-tools">
											<span class="vessel-utc-badge">{getTelemetryUtcLabel(vessel)}</span>
											<div
												class="location-button"
												class:has-coordinate={hasValidVesselCoordinate(vessel)}
												title={hasValidVesselCoordinate(vessel)
													? 'Coordinate available'
													: 'Coordinate unavailable'}
												aria-label={hasValidVesselCoordinate(vessel)
													? 'Coordinate available'
													: 'Coordinate unavailable'}
											></div>
											<span
												class:on-hire={isOnHireStatus(vessel.hireStatus)}
												class:off-hire={isOffHireStatus(vessel.hireStatus)}
												class:unknown-hire={!isOnHireStatus(vessel.hireStatus) &&
													!isOffHireStatus(vessel.hireStatus)}
												class="vessel-hire-badge"
											>
												{normalizeHireStatus(vessel.hireStatus)}
											</span>
										</div>
									</div>
								</button>
							</article>
						{/each}
					{/if}
				</div>
			</div>
		</aside>

		<section class="fleet-map-panel">
			<div class:is-fullscreen={isFleetFullscreen} class="map-stage" bind:this={mapStageContainer}>
				{#if fleetError}
					<div class="fleet-api-error">
						{fleetError}
					</div>
				{/if}

				{#if assetError}
					<div class="asset-api-error">
						{assetError}
					</div>
				{/if}
				{#if isFleetPageActive}
					<div class="leaflet-map" bind:this={mapContainer}></div>
				{/if}

				{#if !fleetLoading && !fleetError && vesselData.length && !vesselsWithCoordinate.length}
					<div class="fleet-api-status">
						Vessels were loaded, but coordinates are not available from the API.
					</div>
				{/if}

				{#if measureActive}
					<div class="measure-toolbar">
						<div class="measure-total">
							<span>Measure:</span>
							<strong>{formatMeasureDistance(totalMeasureMeters)}</strong>
						</div>

						<select bind:value={measureUnit} class="measure-unit-select">
							{#each measureUnits as unit}
								<option value={unit.value}>{unit.label}</option>
							{/each}
						</select>

						<button type="button" class="measure-cancel-btn" onclick={cancelMeasure}>
							Cancel
						</button>
					</div>
				{/if}

				<button
					type="button"
					class:is-fullscreen={isFleetFullscreen}
					class="fleet-fullscreen-btn"
					aria-pressed={isFleetFullscreen}
					aria-label={isFleetFullscreen ? 'Exit fullscreen map' : 'Open fullscreen map'}
					title={isFleetFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
					onclick={toggleFleetFullscreen}
				>
					<span aria-hidden="true">{isFleetFullscreen ? '↙' : '⛶'}</span>
				</button>

				{#if showDetailPanel && selectedVessel}
					{#key detailSwitchSeq}
						<!-- Global juga menjalankan transisi ketika blok if luar dibuka/ditutup. -->
						<aside
							class="vessel-detail-panel"
							class:detail-offline={!selectedVessel.online}
							in:detailIntro|global
							out:detailOutro|global
						>
							<div class="detail-panel-header">
								<div class="detail-title-wrap">
									<span
										class="detail-status-dot"
										class:online={selectedVessel.online}
										class:offline={!selectedVessel.online}
									></span>

									<div class="detail-title-group">
										<span class="detail-eyebrow">Live vessel</span>
										<h2>{selectedVessel.name}</h2>
										<p>{selectedVessel.companyName || 'Company information unavailable'}</p>
									</div>

									<button type="button" class="detail-close-btn" onclick={closeVesselDetail}>
										×
									</button>
								</div>

								<div class="detail-header-actions">
									<span
										class="detail-hire-pill"
										class:on-hire={isOnHireStatus(selectedVessel.hireStatus)}
										class:off-hire={isOffHireStatus(selectedVessel.hireStatus)}
										class:unknown-hire={!isOnHireStatus(selectedVessel.hireStatus) &&
											!isOffHireStatus(selectedVessel.hireStatus)}
									>
										{normalizeHireStatus(selectedVessel.hireStatus)}
									</span>

									<span
										class="detail-status-pill"
										class:online-pill={selectedVessel.online}
										class:offline-pill={!selectedVessel.online}
									>
										{formatOnlineStatus(selectedVessel.online)}
									</span>

									<button
										type="button"
										class="detail-dashboard-btn"
										onclick={() => openVesselDashboard(selectedVessel)}
										title="Open vessel dashboard"
									>
										<span>Dashboard</span>
										<span aria-hidden="true">↗</span>
									</button>

									<button type="button" class="detail-close-btn" onclick={closeVesselDetail}>
										×
									</button>
								</div>
							</div>

							<div class="detail-panel-body">
								<button
									type="button"
									class="detail-dashboard-cta"
									onclick={() => openVesselDashboard(selectedVessel)}
								>
									<span>Open dashboard</span>
									<span aria-hidden="true">↗</span>
								</button>

								<section class="detail-section detail-cctv-section">
									<div class="detail-section-heading">
										<div>
											<span class="detail-section-kicker">CCTV</span>
											<h3>Latest camera snapshot</h3>
										</div>
										<strong class="detail-cctv-count">
											{detailCctvLoading ? 'Loading...' : `${detailCctvItems.length} cameras`}
										</strong>
									</div>

									{#if detailCctvLoading}
										<div class="detail-cctv-layout">
											<div
												class="detail-cctv-box detail-cctv-main detail-cctv-skeleton"
												aria-hidden="true"
											>
												<span></span>
												<strong></strong>
												<small></small>
											</div>
											<div class="detail-cctv-thumb-row" aria-hidden="true">
												{#each Array(3) as _}
													<div class="detail-cctv-box detail-cctv-thumb detail-cctv-skeleton">
														<strong></strong>
													</div>
												{/each}
											</div>
										</div>
									{:else if !detailCctvItems.length}
										<div class="detail-cctv-empty">
											{detailCctvError || 'Latest CCTV snapshot is not available for this vessel.'}
										</div>
									{:else}
										<div class="detail-cctv-layout">
											{#if mainDetailCctv}
												<div
													class="detail-cctv-box detail-cctv-main"
													class:has-snapshot={Boolean(mainDetailCctv.url)}
													class:offline={!mainDetailCctv.online}
												>
													{#if mainDetailCctv.url}
														<CctvSnapshotImage
															class="detail-cctv-img"
															src={mainDetailCctv.url}
															filePath={mainDetailCctv.location}
															alt={`${mainDetailCctv.name} latest snapshot`}
															loading="eager"
														/>
													{/if}

													<div class="detail-cctv-content">
														<strong>{mainDetailCctv.name}</strong>
														{#if mainDetailCctv.capturedAtText}
															<span>{mainDetailCctv.capturedAtText}</span>
														{/if}
														{#if mainDetailCctv.fileSizeText}
															<small>{mainDetailCctv.fileSizeText}</small>
														{/if}
													</div>
												</div>
											{/if}

											{#if detailCctvThumbnails.length}
												<div class="detail-cctv-thumb-row" aria-label="CCTV camera list">
													{#each detailCctvThumbnails as cctv (cctv.key)}
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

								<section class="detail-section">
									<div class="detail-section-heading">
										<div>
											<span class="detail-section-kicker">Telemetry</span>
											<h3>Operational snapshot</h3>
										</div>
										<div class="detail-time-stack">
											<span class="detail-utc-badge">
												{getTelemetryUtcLabel(selectedVessel)}
											</span>
										</div>
									</div>

									<div class="detail-hero-metrics">
										<div class="detail-hero-metric">
											<span>Speed</span>
											<strong>{formatMissingValue(selectedVessel.speed)}</strong>
											<small>knots</small>
										</div>
										<div class="detail-hero-metric">
											<span>Heading</span>
											<strong>{formatMissingValue(selectedVessel.heading, '°')}</strong>
											<small>course</small>
										</div>
									</div>

									<div class="detail-grid two-col">
										<div class="detail-item detail-updated-item">
											<span>Last Updated</span>
											<strong>{formatActualLastUpdated(selectedVessel.lastUpdated)}</strong>
										</div>

										<div
											class="detail-item connection-time-item"
											class:latest-connected={getLatestConnectionEvent(selectedVessel) ===
												'connected'}
										>
											<span>Last Connect</span>
											<strong>{formatTelemetryTime(selectedVessel.lastConnectTime)}</strong>
										</div>

										<div
											class="detail-item connection-time-item"
											class:latest-disconnected={getLatestConnectionEvent(selectedVessel) ===
												'disconnected'}
										>
											<span>Last Disconnect</span>
											<strong>{formatTelemetryTime(selectedVessel.lastDisconnectTime)}</strong>
										</div>

										<div class="detail-item coordinates-detail-item">
											<span>Coordinates</span>
											<strong>
												<CopyableCoordinate
													value={`${formatMissingValue(selectedVessel.latitude ?? selectedVessel.lat)}, ${formatMissingValue(selectedVessel.longitude ?? selectedVessel.lng)}`}
													display={`${formatMissingValue(selectedVessel.latitude ?? selectedVessel.lat)}, ${formatMissingValue(selectedVessel.longitude ?? selectedVessel.lng)}`}
													label="latitude and longitude"
													compact
													class="coordinate-pair-copy"
												/>
											</strong>
											<small class="coordinate-dms">
												{formatDmsPair(
													selectedVessel.latitude ?? selectedVessel.lat,
													selectedVessel.longitude ?? selectedVessel.lng
												)}
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
										<div class="empty-voyage">
											No voyage plan / progress available for this vessel.
										</div>
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
											{#each sortedDetailEngines as engine}
												<div class="simple-row">
													<span>{getEngineDisplayName(engine)}</span>
													<strong>
														{getLiveEngineRpm(selectedVessel, engine)}
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

									{#if selectedVessel.weather?.current}
										<div class="weather-current">
											<div class="weather-icon">🌤️</div>

											<div>
												<strong>{selectedVessel.weather.current.temp_c}°C</strong>
												<span>{selectedVessel.weather.current.condition || '-'}</span>
											</div>

											<div class="weather-meta">
												<strong
													>{selectedVessel.weather.current.wind_dir || '-'}
													{selectedVessel.weather.current.wind_speed_kt || '-'} kt</strong
												>
												<span
													>{selectedVessel.weather.current.humidity || '-'}% · {selectedVessel
														.weather.current.pressure_hpa || '-'} hPa</span
												>
											</div>
										</div>
									{:else}
										<div class="empty-voyage">Weather is not available.</div>
									{/if}
									<div class="environment-divider"></div>

									{#if selectedVessel.oceanCurrent?.current}
										<div class="simple-table ocean-current-card">
											<div class="simple-row">
												<span>Speed</span>
												<strong>{selectedVessel.oceanCurrent.current.speed_kph} kph</strong>
											</div>

											<div class="simple-row">
												<span>Direction</span>
												<strong>
													{selectedVessel.oceanCurrent.current.direction_to}
													{selectedVessel.oceanCurrent.current.direction_to_deg}°
												</strong>
											</div>

											<div class="simple-row ocean-observed-row">
												<span>Observed At</span>
												<strong
													>{formatObservedAt(
														selectedVessel.oceanCurrent.current.observed_at
													)}</strong
												>
											</div>
										</div>
									{:else}
										<div class="empty-voyage">Ocean current is not available.</div>
									{/if}
								</section>
							</div>
						</aside>
					{/key}
				{/if}

				<div
					class:legend-collapsed={!isMapLegendOpen}
					class="map-legend"
					bind:this={mapLegendElement}
				>
					<div class="legend-header">
						<div>
							<span class="legend-title">Map Legend</span>
							<span class="legend-subtitle">Fleet overlays</span>
						</div>
						<button
							type="button"
							class="legend-toggle-btn"
							aria-expanded={isMapLegendOpen}
							aria-label={isMapLegendOpen ? 'Hide map legend' : 'Show map legend'}
							title={isMapLegendOpen ? 'Hide legend' : 'Show legend'}
							onclick={() => (isMapLegendOpen = !isMapLegendOpen)}
						>
							{isMapLegendOpen ? '−' : '+'}
						</button>
					</div>

					{#if isMapLegendOpen}
						<div class="legend-body">
							<div class="legend-scroll-area">
								<div class="legend-section">
									<div class="legend-item">
										<span class="legend-vessel-marker online" aria-hidden="true"></span>
										<span>Vessel online</span>
									</div>

									<div class="legend-item">
										<span class="legend-vessel-marker offline" aria-hidden="true"></span>
										<span>Vessel offline</span>
									</div>

									<div class="legend-item">
										<span class="legend-vessel-marker selected" aria-hidden="true"></span>
										<span>Selected vessel</span>
									</div>
								</div>

								<div class="legend-section">
									<div class="legend-item">
										<span class="asset-boundary-legend" aria-hidden="true"></span>
										<span>Boundary 1 km</span>
									</div>

									{#if assetLegendItems.length}
										<div class="legend-asset-list" aria-label="Asset types on map">
											{#each assetLegendItems as item}
												<button
													type="button"
													class:asset-type-visible={isAssetTypeVisible(item)}
													class="legend-asset-toggle-row"
													title={`${isAssetTypeVisible(item) ? 'Hide' : 'Show'} ${item.label}`}
													onclick={() => toggleAssetType(item)}
												>
													<img src={item.iconUrl} alt="" />
													<span>{item.label}</span>
													<i aria-hidden="true"></i>
												</button>
											{/each}
										</div>
									{/if}
								</div>

								{#if zoneData.length}
									<div class="legend-section">
										{#each zoneData as zone}
											<div class="legend-item">
												<span
													class="zone-boundary-legend"
													style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
													aria-hidden="true"
												></span>
												<span>{zone.name}</span>
											</div>
										{/each}
									</div>
								{/if}
							</div>

							<div class="legend-actions">
								<button
									type="button"
									class:active-wind-toggle={showWindParticles}
									class="wind-toggle-btn"
									onclick={() => (showWindParticles = !showWindParticles)}
								>
									<span class="wind-legend-line"></span>
									Wind: {showWindParticles ? 'On' : 'Off'}
								</button>

								<button
									type="button"
									class:active-current-toggle={showCurrentParticles}
									class="current-toggle-btn"
									onclick={() => (showCurrentParticles = !showCurrentParticles)}
								>
									<span class="current-legend-line"></span>
									Current: {showCurrentParticles ? 'On' : 'Off'}
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</section>
	</div>
</section>
