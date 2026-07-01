<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getFleetVessels, getFleetVesselLiveDetail, getFleetAssets } from '$lib/api/fleetApi.js';
	import { setSelectedVessel } from '$lib/stores/selectedVessel.svelte.js';
	import { activeMenu, setActiveMenu } from '$lib/stores/appNavigation.svelte.js';
	import { VMS_TILE_URL, VMS_TILE_OPTIONS } from '$lib/mapStyle.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import { getAssetIconUrl, getAssetTypeLabel, getAssetTypeValue } from '$lib/utils/assetIcons.js';
	import {
		createCopyableCoordinateHtml,
		handleCoordinateCopyClick
	} from '$lib/utils/coordinateClipboard.js';

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

	let voyageProgress = $derived(getVoyageProgress(selectedVessel));

	let assetData = $state([]);
	let assetLoading = $state(false);
	let assetError = $state('');
	let showAssets = $state(true);
	let isMapLegendOpen = $state(true);
	let assetMarkers = new Map();
	let assetBoundaryCircles = new Map();

	let ignoreNextPopupCloseForVesselId = null;
	let openingDetailFromPopupForVesselId = null;

	let isSidebarOpen = $state(true);

	let mapContainer;
	let vesselListContainer;
	let map = null;
	let L = null;
	let markers = new Map();
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
			speed: vessel.speed ?? '-',
			heading: vessel.heading ?? 0,
			online: Boolean(vessel.online),
			hireStatus: vessel.hireStatus ?? '-',
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

	let onlineCount = $derived(vesselData.filter((v) => v.online).length);
	let offlineCount = $derived(vesselData.filter((v) => !v.online).length);
	let assetLegendItems = $derived.by(() => {
		const items = new Map();

		for (const asset of assetData) {
			const label = getAssetTypeLabel(asset);
			const key = String(label || 'Asset').toLowerCase();

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
			engines: liveEngines,
			liveEngines
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

		return `${rpm} RPM`;
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
		const text = String(value ?? '').trim();

		if (!text || text === '-') return 'Hire unknown';

		const normalized = text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

		if (normalized.includes('off')) return 'Off Hire';
		if (normalized.includes('on')) return 'On Hire';

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
		vesselData.filter((v) => {
			const keyword = search.toLowerCase().trim();
			const name = String(v.name || '').toLowerCase();
			const company = String(v.companyName || '').toLowerCase();

			const matchSearch = !keyword || name.includes(keyword) || company.includes(keyword);

			if (statusFilter === 'online') return matchSearch && v.online;
			if (statusFilter === 'offline') return matchSearch && !v.online;

			return matchSearch;
		})
	);

	let selectedVessel = $derived(
		selectedVesselDetail ||
			vesselData.find((v) => String(v.id) === String(selectedVesselId)) ||
			null
	);

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

	function hasValidVesselCoordinate(vessel) {
		const lat = Number(vessel?.lat ?? vessel?.latitude);
		const lng = Number(vessel?.lng ?? vessel?.longitude);

		return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
	}

	function parseVesselDateTime(value) {
		if (!value || value === '-') return null;

		const text = String(value).trim();

		// Format contoh: "03/06/2026 16:34:00 (UTC+07:00)"
		const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);

		if (match) {
			const [, dd, mm, yyyy, hh, min, ss] = match;

			// Created using the browser local time
			const date = new Date(
				Number(yyyy),
				Number(mm) - 1,
				Number(dd),
				Number(hh),
				Number(min),
				Number(ss)
			);

			if (!Number.isNaN(date.getTime())) return date;
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

	function formatLastUpdated(value) {
		if (!value || value === '-') return '-';

		const date = parseVesselDateTime(value);
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

	function formatLastUpdatedBadge(value) {
		return stripUtcLabel(formatLastUpdated(value));
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
          </div>
          <div>
            <span>Longitude</span>
            ${createCopyableCoordinateHtml(formattedLongitude, 'longitude')}
          </div>
        </div>

        <div class="fleet-popup-meta">
          <div class="fleet-popup-row">
            <span>Hire status</span>
            <strong>${formatValue(vessel.hireStatus)}</strong>
          </div>
          <div class="fleet-popup-row">
            <span>Last updated</span>
            <strong>${formatLastUpdatedBadge(vessel.lastUpdated)}</strong>
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
        </div>
        <div>
          <span>Longitude</span>
          ${createCopyableCoordinateHtml(formattedLongitude, 'asset longitude')}
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

		refreshMarkerSelection();
	}

	async function openVesselDetail(id) {
		selectedVesselId = String(id);
		selectedVesselDetail = null;
		showDetailPanel = true;

		refreshMarkerSelection();

		await loadVesselDetail(id);
	}

	async function openVesselDetailFromPopup(id, marker) {
		const normalizedId = String(id);

		ignoreNextPopupCloseForVesselId = normalizedId;
		openingDetailFromPopupForVesselId = normalizedId;

		marker?.closePopup?.();

		selectedVesselId = normalizedId;
		selectedVesselDetail = null;
		showDetailPanel = true;
		isSidebarOpen = false;

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

	function openVesselPopupFromInteraction(id, { zoom = 7, keepSidebarOpen = false } = {}) {
		const normalizedId = String(id);
		const previousId = selectedVesselId ? String(selectedVesselId) : null;

		if (previousId && previousId !== normalizedId) {
			const previousMarker = markers.get(previousId);

			if (previousMarker?.isPopupOpen?.()) {
				ignoreNextPopupCloseForVesselId = previousId;
				previousMarker.closePopup();
			}
		}

		selectedVesselId = normalizedId;
		selectedVesselDetail = null;
		showDetailPanel = false;
		if (!keepSidebarOpen) {
			isSidebarOpen = false;
		}

		refreshMarkerSelection();
		focusVessel(normalizedId, zoom, true);
		setTimeout(() => {
			const marker = markers.get(normalizedId);
			marker?.openPopup?.();
		}, 0);
		void scrollSidebarToVessel(normalizedId);
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
		}

		refreshMarkerSelection();
		focusVessel(normalizedId, zoom, openPopup);
	}

	function buildMarkers() {
		if (!map || !L) return;

		markers.forEach((marker) => {
			marker.off();
			marker.closePopup?.();
			marker.unbindPopup?.();

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
				maxWidth: 320,
				className: 'fleet-leaflet-popup'
			});

			marker.on('click', () => {
				openVesselPopupFromInteraction(vesselId, { zoom: map?.getZoom?.() ?? 7 });
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
			const lat = Number(asset.lat ?? asset.latitude);
			const lng = Number(asset.lng ?? asset.longitude);

			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
			if (lat === 0 && lng === 0) return;

			const assetId = String(asset.id);

			const boundaryCircle = L.circle([lat, lng], {
				radius: 500,
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
				maxWidth: 280,
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

		if (selectedVessel && !sourceVessels.some((item) => String(item.id) === String(selectedVessel.id))) {
			sourceVessels.push(selectedVessel);
		}

		return sourceVessels
			.map((vessel) => {
				const currentWeather = getCurrentWeather(vessel) || vessel?.weather || {};
				const lat = Number(vessel.lat ?? vessel.latitude);
				const lng = Number(vessel.lng ?? vessel.longitude);

				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
				if (lat === 0 && lng === 0) return null;

				const windFromDeg = normalizeWindDirectionDegrees(
					currentWeather.wind_degree ??
						currentWeather.wind_deg ??
						currentWeather.wind_dir_degree ??
						currentWeather.windDirectionDeg ??
						currentWeather.wind_dir ??
						currentWeather.windDirection ??
						vessel.wind_degree ??
						vessel.wind_deg ??
						vessel.wind_dir
				);

				if (windFromDeg === null) return null;

				return {
					lat,
					lng,
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

		if (selectedVessel && !sourceVessels.some((item) => String(item.id) === String(selectedVessel.id))) {
			sourceVessels.push(selectedVessel);
		}

		return sourceVessels
			.map((vessel) => {
				const current = getSeaCurrentData(vessel);
				const lat = Number(vessel.lat ?? vessel.latitude);
				const lng = Number(vessel.lng ?? vessel.longitude);

				if (!current) return null;
				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
				if (lat === 0 && lng === 0) return null;

				const directionToDeg = normalizeWindDirectionDegrees(
					current.direction_to_deg ?? current.direction_to
				);

				if (directionToDeg === null) return null;

				return {
					lat,
					lng,
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

		const topLeft = map.containerPointToLayerPoint([
			-windCanvasBuffer,
			-windCanvasBuffer
		]);

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
				(0.42 + speed * 0.045) *
				particle.speedJitter *
				WIND_PARTICLE_STEP_MULTIPLIER;

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

		const topLeft = map.containerPointToLayerPoint([
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
				(0.18 + speed * 0.08) *
				particle.speedJitter *
				CURRENT_PARTICLE_STEP_MULTIPLIER;

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

		openVesselPopupFromInteraction(normalizedId, { keepSidebarOpen: true });
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

	async function loadFleetVessels({ silent = false, includeLiveDetails = false } = {}) {
		if (fleetRefreshInProgress) return;

		fleetRefreshInProgress = true;

		if (!silent) {
			fleetLoading = true;
			fleetError = '';
		}

		try {
			const vessels = await getFleetVessels({});

			let normalizedVessels = Array.isArray(vessels) ? vessels.map(normalizeFleetVessel) : [];

			if (includeLiveDetails) {
				normalizedVessels = await loadLiveDetailsForAllVessels(normalizedVessels);
			}

			console.log('[FLEET_VIEW][VESSELS_REFRESHED]', normalizedVessels);

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
				}
			}

			if (map && L) {
				buildMarkers();
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

			assetData = assets.map(normalizeFleetAsset).filter((asset) => {
				const lat = Number(asset.lat ?? asset.latitude);
				const lng = Number(asset.lng ?? asset.longitude);

				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
				if (lat === 0 && lng === 0) return false;

				return true;
			});

			if (map && L) {
				buildAssetMarkers();
			}
		} catch (error) {
			console.error('[FLEET_ASSET_LOAD_ERROR]', error);

			assetError = error?.message || 'Failed to load asset data.';
			assetData = [];
		} finally {
			assetLoading = false;
		}
	}

	async function loadVesselDetail(id) {
		if (!id) return null;

		try {
			const existing = vesselData.find((item) => String(item.id) === String(id));

			const liveDetail = await getFleetVesselLiveDetail(id);

			const mergedDetail = mergeVesselWithLiveDetail(existing, liveDetail);

			selectedVesselDetail = mergedDetail;

			vesselData = vesselData.map((item) => {
				if (String(item.id) !== String(id)) return item;
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

	async function loadLiveDetailsForAllVessels(vessels = [], batchSize = 5) {
		if (!Array.isArray(vessels) || !vessels.length) return vessels;

		const results = [];

		for (let i = 0; i < vessels.length; i += batchSize) {
			const batch = vessels.slice(i, i + batchSize);

			const batchResults = await Promise.all(
				batch.map(async (vessel) => {
					try {
						const liveDetail = await getFleetVesselLiveDetail(vessel.vesselId || vessel.id);

						return mergeVesselWithLiveDetail(vessel, liveDetail);
					} catch (error) {
						console.error('[FLEET_VIEW][LIVE_DETAIL_PRELOAD_ERROR]', vessel, error);
						return vessel;
					}
				})
			);

			results.push(...batchResults);
		}

		return results;
	}

	function startFleetAutoRefresh() {
		if (!browser) return;

		if (fleetRefreshTimer) {
			clearInterval(fleetRefreshTimer);
		}

		fleetRefreshTimer = setInterval(() => {
			if (!isFleetMounted) return;

			loadFleetVessels({
				silent: true,
				includeLiveDetails: true
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

			if (!isFleetMounted || !isFleetPageActive || !container) return;

			map = L.map(container, {
				zoomControl: false,
				attributionControl: true,
				preferCanvas: true,
				closePopupOnClick: false
			}).setView([-2.8, 114.5], 5);

			L.tileLayer(VMS_TILE_URL, VMS_TILE_OPTIONS).addTo(map);

			setupMapPanes();
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

		cancelMeasure();
		removeCurrentParticleLayer();
		removeWindParticleLayer();

		markers.forEach((marker) => {
			marker.off?.();
			marker.closePopup?.();
			marker.unbindPopup?.();
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

		if (map) {
			map.off('contextmenu', handleMapRightClick);
			map.off('click', handleMapMeasureClick);
			map.remove();
			map = null;
		}
	}

	onMount(async () => {
		if (!browser) return;

		isFleetMounted = true;
		isSidebarOpen = window.innerWidth > 760;

		window.addEventListener('mobile-panel-open', handleMobilePanelOpen);

		await initializeFleetMap();

		await loadFleetVessels({
			includeLiveDetails: true
		});

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
		}

		destroyFleetMap();
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
		assetData;

		if (!map || !L) return;

		buildAssetMarkers();
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
		class="sidebar-toggle-btn"
		aria-expanded={isSidebarOpen}
		aria-label={isSidebarOpen ? 'Close vessel sidebar' : 'Open vessel sidebar'}
		title={isSidebarOpen ? 'Hide vessels' : 'Show vessels'}
		onclick={toggleSidebar}
	>
		<span aria-hidden="true">☰</span>
		<span>{isSidebarOpen ? 'Hide Vessels' : 'Show Vessels'}</span>
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
		<aside class:sidebar-open={isSidebarOpen} class:sidebar-collapsed={!isSidebarOpen} class="fleet-sidebar">
			<div class="sidebar-fixed">
				<div class="sidebar-header">
					<div class="sidebar-title-wrap">
						<div class="sidebar-icon">🚢</div>
						<div>
							<h1>Vessels</h1>
							<p>Fleet monitoring</p>
						</div>
					</div>

					<button type="button" class="sidebar-close-btn" onclick={closeMobileSidebar}> × </button>
				</div>

				<div class="fleet-stats">
					<button
						type="button"
						class:active-filter={statusFilter === 'online'}
						class="stat-chip"
						onclick={() => (statusFilter = 'online')}
					>
						<span class="chip-dot online"></span>
						{onlineCount}
					</button>

					<button
						type="button"
						class:active-filter={statusFilter === 'offline'}
						class="stat-chip"
						onclick={() => (statusFilter = 'offline')}
					>
						<span class="chip-dot offline"></span>
						{offlineCount}
					</button>

					<button
						type="button"
						class:active-filter={statusFilter === 'all'}
						class="stat-chip total-chip"
						onclick={() => (statusFilter = 'all')}
					>
						Total: {vesselData.length}
					</button>
				</div>

				<div class="search-box">
					<input type="text" placeholder="Search vessel..." bind:value={search} />
				</div>
			</div>

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
										<p>
											Last Updated: 
										</p>
										<p>
											{formatLastUpdatedBadge(vessel.lastUpdated)}
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
								</div>
							</div>
						</button>
					</article>
					{/each}
				{/if}
			</div>
		</aside>

		<section class="fleet-map-panel">
			<div class="map-stage">
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

				{#if showDetailPanel && selectedVessel}
					<aside class="vessel-detail-panel" class:detail-offline={!selectedVessel.online}>
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
										<span class="detail-updated-badge">
											{formatLastUpdatedBadge(selectedVessel.lastUpdated)}
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
									<div
										class="detail-item connection-time-item"
										class:latest-connected={getLatestConnectionEvent(selectedVessel) === 'connected'}
									>
										<span>Last Connect</span>
										<strong>{formatTelemetryTime(selectedVessel.lastConnectTime)}</strong>
									</div>

									<div
										class="detail-item connection-time-item"
										class:latest-disconnected={getLatestConnectionEvent(selectedVessel) === 'disconnected'}
									>
										<span>Last Disconnect</span>
										<strong>{formatTelemetryTime(selectedVessel.lastDisconnectTime)}</strong>
									</div>

									<div class="detail-item">
										<span>Latitude</span>
										<strong>
											<CopyableCoordinate
												value={formatMissingValue(selectedVessel.latitude)}
												display={formatMissingValue(selectedVessel.latitude)}
												label="latitude"
												compact
											/>
										</strong>
									</div>

									<div class="detail-item">
										<span>Longitude</span>
										<strong>
											<CopyableCoordinate
												value={formatMissingValue(selectedVessel.longitude)}
												display={formatMissingValue(selectedVessel.longitude)}
												label="longitude"
												compact
											/>
										</strong>
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
									{#if selectedVessel.engines?.length}
										{#each selectedVessel.engines as engine}
											<div class="simple-row">
												<span>{engine.engineName || engine.name || '-'}</span>
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
										<h3>Weather</h3>
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
												>{selectedVessel.weather.current.humidity || '-'}% · {selectedVessel.weather
													.current.pressure_hpa || '-'} hPa</span
											>
										</div>
									</div>
								{:else}
									<div class="empty-voyage">Weather is not available.</div>
								{/if}
							</section>

							<section class="detail-section">
								<div class="detail-section-heading">
									<div>
										<span class="detail-section-kicker">Environment</span>
										<h3>Ocean current</h3>
									</div>
								</div>

								{#if selectedVessel.oceanCurrent?.current}
									<div class="simple-table">
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
												>{formatObservedAt(selectedVessel.oceanCurrent.current.observed_at)}</strong
											>
										</div>
									</div>
								{:else}
									<div class="empty-voyage">Ocean current is not available.</div>
								{/if}
							</section>
						</div>
					</aside>
				{/if}

				<div class:legend-collapsed={!isMapLegendOpen} class="map-legend">
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
									<span>Boundary 500 m</span>
								</div>

								{#if assetLegendItems.length}
									<div class="legend-asset-icons" aria-label="Asset types on map">
										{#each assetLegendItems as item}
											<span class="legend-asset-item" title={item.label}>
												<img src={item.iconUrl} alt="" />
												<span>{item.label}</span>
											</span>
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

								<button
									type="button"
									class:active-asset-toggle={showAssets}
									class="asset-toggle-btn"
									onclick={() => (showAssets = !showAssets)}
								>
									<span class="asset-toggle-icon"></span>
									Assets: {showAssets ? 'On' : 'Off'}
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</section>
	</div>
</section>

<style>
	:global(.current-particle-canvas) {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		mix-blend-mode: screen;
		opacity: 0.86;
	}
	:global(.fleet-popup-actions) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		padding: 6px 9px 8px;
	}

	:global(.fleet-popup-actions .fleet-popup-detail-btn),
	:global(.fleet-popup-actions .fleet-popup-dashboard-btn) {
		width: 100%;
		height: 24px;
		margin: 0;
		border: none;
		border-radius: 7px;
		color: #ffffff;
		font-size: 8.8px;
		font-weight: 900;
		cursor: pointer;
	}

	:global(.fleet-popup-actions .fleet-popup-detail-btn) {
		background: #2563eb;
	}

	:global(.fleet-popup-actions .fleet-popup-detail-btn:hover) {
		background: #1d4ed8;
	}

	:global(.fleet-popup-actions .fleet-popup-dashboard-btn) {
		background: #0f172a;
	}

	:global(.fleet-popup-actions .fleet-popup-dashboard-btn:hover) {
		background: #334155;
	}
	.fleet-page {
		--fleet-sidebar-width: 280px;
		--fleet-gap: 5px;
		--fleet-main-sidebar-offset: 0px;
		position: relative;
		height: 100%;
		min-height: 0;
		max-height: 100%;
		background: var(--color-base);
		padding: 5px;
		color: var(--text-primary);
		overflow: hidden;
		font-size: 9.5px;
		box-sizing: border-box;
	}

	:global(.app-shell.fleet-floating-shell:has(.sidebar.fleet-floating-sidebar.sidebar-open)) .fleet-page {
		--fleet-main-sidebar-offset: 74px;
	}

	@media (max-width: 760px) {
		:global(.app-shell.fleet-floating-shell:has(.sidebar.fleet-floating-sidebar.sidebar-open)) .fleet-page {
			--fleet-main-sidebar-offset: 0px;
		}
	}

	.fleet-layout {
		position: relative;
		height: 100%;
		min-height: 0;
		max-height: 100%;
		display: block;
		overflow: hidden;
	}

	.fleet-layout.sidebar-collapsed {
		display: block;
	}

	@media (min-width: 1280px) and (max-height: 1080px) {
		.fleet-page {
			--fleet-sidebar-width: 340px;
		}
	}

	.fleet-sidebar,
	.fleet-map-panel {
		position: relative;
		height: 100%;
		min-height: 0;
		max-height: 100%;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
		overflow: hidden;
	}

	.fleet-api-status,
	.fleet-api-error {
		position: absolute;
		top: 10px;
		left: 50%;
		z-index: 900;
		transform: translateX(-50%);
		min-height: 28px;
		display: inline-flex;
		align-items: center;
		padding: 0 12px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 900;
		box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
	}

	.fleet-api-status {
		background: var(--color-surface);
		color: #1d4ed8;
		border: 1px solid #bfdbfe;
	}

	.fleet-api-error {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	/* =========================
   ASSET / POI MARKER
   ========================= */

	:global(.asset-leaflet-icon) {
		background: transparent;
		border: none;
	}

	:global(.asset-type-marker-icon) {
		width: 32px;
		height: 32px;
		object-fit: contain;
		filter: drop-shadow(0 4px 8px rgba(15, 23, 42, 0.35));
	}

	/* =========================
   ASSET / POI POPUP
   ========================= */

	:global(.asset-leaflet-popup) {
		margin-bottom: 9px;
	}

	:global(.asset-leaflet-popup .leaflet-popup-content-wrapper) {
		background: rgba(10, 14, 26, 0.97);
		color: var(--text-primary);
		border-radius: 16px;
		border: 1px solid rgba(245, 158, 11, 0.32);
		box-shadow:
			0 24px 56px rgba(0, 0, 0, 0.48),
			0 0 0 1px rgba(255, 255, 255, 0.035);
		backdrop-filter: blur(18px) saturate(1.3);
		overflow: hidden;
	}

	:global(.asset-leaflet-popup .leaflet-popup-content) {
		margin: 0;
		width: 224px !important;
	}

	:global(.asset-leaflet-popup .leaflet-popup-tip) {
		background: #0a0e1a;
		border: none;
		box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.24);
	}

	:global(.asset-leaflet-popup .leaflet-popup-tip-container),
	:global(.fleet-leaflet-popup .leaflet-popup-tip-container) {
		display: block !important;
		width: 40px !important;
		height: 20px !important;
		left: 50% !important;
		margin-left: -20px !important;
		overflow: hidden !important;
		pointer-events: none;
	}

	:global(.asset-leaflet-popup .leaflet-popup-tip),
	:global(.fleet-leaflet-popup .leaflet-popup-tip) {
		display: block !important;
		width: 17px !important;
		height: 17px !important;
		margin: -10px auto 0 !important;
		transform: rotate(45deg) !important;
	}

	:global(.asset-leaflet-popup .leaflet-popup-tip) {
		border-right: 1px solid rgba(245, 158, 11, 0.28);
		border-bottom: 1px solid rgba(245, 158, 11, 0.28);
	}

	:global(.asset-leaflet-popup .leaflet-popup-close-button) {
		top: 10px !important;
		right: 10px !important;
		width: 26px !important;
		height: 26px !important;
		border: 1px solid rgba(255, 255, 255, 0.08) !important;
		border-radius: 8px !important;
		background: rgba(255, 255, 255, 0.055) !important;
		color: var(--text-secondary) !important;
		font-size: 17px !important;
		line-height: 23px !important;
		padding: 0 !important;
	}

	:global(.asset-leaflet-popup .leaflet-popup-close-button:hover) {
		border-color: rgba(245, 158, 11, 0.3) !important;
		background: var(--color-warning-muted) !important;
		color: #fbbf24 !important;
	}

	:global(.fleet-asset-popup) {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		overflow: hidden;
		background:
			radial-gradient(circle at 4% 0%, rgba(245, 158, 11, 0.14), transparent 42%),
			#0a0e1a;
	}

	:global(.fleet-asset-popup-hero) {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr) auto;
		align-items: center;
		gap: 7px;
		padding: 10px 38px 9px 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
	}

	:global(.fleet-asset-popup-icon) {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(245, 158, 11, 0.26);
		border-radius: 11px;
		background: var(--color-warning-muted);
	}

	:global(.fleet-asset-popup-icon img) {
		width: 21px;
		height: 21px;
		object-fit: contain;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.28));
	}

	:global(.fleet-asset-popup-heading) {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	:global(.fleet-asset-popup-eyebrow) {
		color: #fbbf24;
		font-size: 8px;
		font-weight: 900;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	:global(.fleet-asset-popup-heading > strong) {
		overflow: hidden;
		color: var(--text-primary);
		font-size: 11px;
		line-height: 1.2;
		font-weight: 900;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.fleet-asset-popup-heading > small) {
		overflow: hidden;
		color: var(--text-secondary);
		font-size: 8px;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.fleet-asset-popup-badge) {
		padding: 3px 6px;
		border: 1px solid rgba(245, 158, 11, 0.24);
		border-radius: 999px;
		background: var(--color-warning-muted);
		color: #fbbf24;
		font-size: 7.5px;
		font-weight: 900;
		letter-spacing: 0.08em;
	}

	:global(.asset-popup-location) {
		padding: 9px 11px 7px;
	}

	:global(.asset-popup-location > span) {
		display: block;
		margin-bottom: 4px;
		color: var(--text-muted);
		font-size: 7px;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	:global(.asset-popup-location > strong) {
		display: block;
		overflow: hidden;
		color: var(--text-primary);
		font-size: 7px;
		font-weight: 800;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.fleet-asset-popup-coordinates) {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
		padding: 9px 10px 10px;
	}

	:global(.fleet-asset-popup-coordinates > div) {
		min-width: 0;
		padding: 8px;
		border: 1px solid rgba(255, 255, 255, 0.065);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.03);
	}

	:global(.fleet-asset-popup-coordinates span) {
		display: block;
		margin-bottom: 4px;
		color: var(--text-muted);
		font-size: 7.5px;
		font-weight: 900;
		text-transform: uppercase;
	}

	:global(.fleet-asset-popup-coordinates strong) {
		display: block;
		overflow: hidden;
		color: var(--text-primary);
		font-size: 9px;
		font-weight: 900;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.asset-toggle-icon {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
		flex-shrink: 0;
	}

	.asset-toggle-btn {
		height: 25px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0 9px;
		border: 1px solid rgba(245, 158, 11, 0.34);
		border-radius: 999px;
		background: rgba(245, 158, 11, 0.1);
		color: #fed7aa;
		font-size: 9px;
		line-height: 1;
		font-weight: 800;
		cursor: pointer;
	}

	.asset-toggle-btn.active-asset-toggle {
		background: rgba(245, 158, 11, 0.18);
		border-color: #f59e0b;
	}

	.asset-toggle-btn:hover {
		background: rgba(245, 158, 11, 0.22);
	}

	:global(.wind-particle-canvas) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		opacity: 0.62;
		mix-blend-mode: multiply;
	}

	.wind-legend-line {
		width: 15px;
		height: 2px;
		border-radius: 999px;
		background: linear-gradient(90deg, rgba(15, 23, 42, 0.16), #0f172a);
		box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.1);
		flex-shrink: 0;
	}

	.wind-toggle-btn {
		height: 25px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0 9px;
		border: 1px solid rgba(147, 197, 253, 0.34);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.2);
		color: #bfdbfe;
		font-size: 9px;
		line-height: 1;
		font-weight: 800;
		cursor: pointer;
	}

	.wind-toggle-btn.active-wind-toggle {
		background: rgba(37, 99, 235, 0.2);
		border-color: #0ea5e9;
	}

	.wind-toggle-btn:hover {
		background: rgba(37, 99, 235, 0.25);
	}

	.current-legend-line {
		width: 15px;
		height: 2px;
		border-radius: 999px;
		background: linear-gradient(90deg, rgba(56, 189, 248, 0.14), #38bdf8);
		box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.14);
		flex-shrink: 0;
	}

	.current-toggle-btn {
		height: 25px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0 9px;
		border: 1px solid rgba(56, 189, 248, 0.34);
		border-radius: 999px;
		background: rgba(8, 47, 73, 0.24);
		color: #bae6fd;
		font-size: 9px;
		line-height: 1;
		font-weight: 800;
		cursor: pointer;
	}

	.current-toggle-btn.active-current-toggle {
		background: rgba(14, 165, 233, 0.18);
		border-color: #38bdf8;
	}

	.current-toggle-btn:hover {
		background: rgba(14, 165, 233, 0.22);
	}

	.asset-api-status,
	.asset-api-error {
		position: absolute;
		top: 44px;
		left: 50%;
		z-index: 900;
		transform: translateX(-50%);
		min-height: 26px;
		display: inline-flex;
		align-items: center;
		padding: 0 11px;
		border-radius: 999px;
		font-size: 9.5px;
		font-weight: 900;
		box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
	}

	.asset-api-status {
		background: var(--color-warning-muted);
		color: #92400e;
		border: 1px solid #fed7aa;
	}

	.asset-api-error {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	/* =========================
     MEASURE TOOL
     ========================= */

	:global(.leaflet-container.is-measuring) {
		cursor: crosshair;
	}

	:global(.measure-context-popup) {
		margin-bottom: 10px;
	}

	:global(.measure-context-popup .leaflet-popup-content-wrapper) {
		background: var(--color-surface);
		color: var(--text-primary);
		border-radius: 12px;
		border: 1px solid #dbe4ef;
		box-shadow:
			0 16px 36px rgba(15, 23, 42, 0.2),
			0 3px 10px rgba(15, 23, 42, 0.1);
		overflow: hidden;
	}

	:global(.measure-context-popup .leaflet-popup-content) {
		margin: 0;
		width: 300px !important;
	}

	:global(.measure-context-popup .leaflet-popup-tip) {
		background: var(--color-surface);
		border: 1px solid #dbe4ef;
		box-shadow: 0 7px 16px rgba(15, 23, 42, 0.12);
	}

	:global(.measure-start-popup) {
		padding: 0;
		background: var(--color-surface);
	}

	:global(.measure-start-top) {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) 26px;
		gap: 8px;
		align-items: start;
		padding: 12px;
		background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(37, 99, 235, 0)), var(--color-elevated);
		border-bottom: 1px solid #e2e8f0;
	}

	:global(.measure-icon) {
		width: 34px;
		height: 34px;
		border-radius: 9px;
		display: grid;
		place-items: center;
		background: #2563eb;
		color: #ffffff;
		font-size: 13px;
		font-weight: 900;
		box-shadow: 0 5px 12px rgba(37, 99, 235, 0.22);
	}

	:global(.measure-title-group) {
		min-width: 0;
	}

	:global(.measure-title-group strong) {
		display: block;
		color: var(--text-primary);
		font-size: 12px;
		line-height: 1.1;
		font-weight: 900;
	}

	:global(.measure-title-group span) {
		display: block;
		margin-top: 3px;
		color: var(--text-secondary);
		max-width: 190px;
		font-size: 9px;
		line-height: 1.35;
		font-weight: 700;
	}

	:global(.measure-start-close) {
		width: 26px;
		height: 26px;
		border: none;
		border-radius: 7px;
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 14px;
		font-weight: 900;
		line-height: 1;
		cursor: pointer;
	}

	:global(.measure-start-close:hover) {
		background: var(--color-danger-muted);
		color: #dc2626;
	}

	:global(.measure-start-info) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		padding: 10px 12px 0;
	}

	:global(.measure-start-info div) {
		min-width: 0;
		min-height: 46px;
		padding: 8px;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		background: var(--color-elevated);
	}

	:global(.measure-start-info span) {
		display: block;
		color: var(--text-secondary);
		font-size: 7.6px;
		line-height: 1;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	:global(.measure-start-info strong) {
		display: block;
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 10px;
		line-height: 1.25;
		font-weight: 900;
		overflow-wrap: normal;
		word-break: normal;
		white-space: nowrap;
	}

	:global(.measure-start-btn) {
		width: calc(100% - 24px);
		height: 34px;
		margin: 10px 12px 12px;
		border: none;
		border-radius: 8px;
		background: #2563eb;
		color: #ffffff;
		font-size: 9.5px;
		line-height: 1;
		font-weight: 900;
		cursor: pointer;
		box-shadow: 0 7px 16px rgba(37, 99, 235, 0.22);
	}

	:global(.measure-start-btn:hover) {
		background: #1d4ed8;
	}

	:global(.measure-start-btn:active) {
		transform: translateY(1px);
	}

	.measure-toolbar {
		position: absolute;
		top: 9px;
		left: 50%;
		z-index: 850;
		transform: translateX(-50%);
		min-height: 29px;
		display: inline-flex;
		align-items: center;
		overflow: visible;
		border-radius: 7px;
		background: #111827 !important;
		color: #ffffff;
		box-shadow:
			0 9px 20px rgba(15, 23, 42, 0.2),
			0 2px 7px rgba(15, 23, 42, 0.1);
	}

	.measure-total {
		height: 29px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0 8px;
		border-right: 1px solid rgba(255, 255, 255, 0.12);
		white-space: nowrap;
	}

	.measure-total span,
	.measure-total strong,
	.measure-unit-select,
	.measure-cancel-btn {
		font-size: 9.5px;
	}

	.measure-total span {
		color: #d1d5db;
		font-weight: 800;
	}

	.measure-total strong {
		color: #ffffff;
		font-weight: 900;
	}

	.measure-unit-select {
		height: 29px;
		min-width: 52px;
		border: none;
		border-right: 1px solid rgba(255, 255, 255, 0.12);
		background: #111827;
		color: #ffffff;
		padding: 0 7px;
		font-weight: 800;
		outline: none;
		cursor: pointer;
	}

	.measure-cancel-btn {
		height: 29px;
		padding: 0 9px;
		border: none;
		border-radius: 0 7px 7px 0;
		background: #ef4444;
		color: #ffffff;
		font-weight: 900;
		cursor: pointer;
	}

	.measure-cancel-btn:hover {
		background: #dc2626;
	}

	:global(.measure-label-icon) {
		background: transparent;
		border: none;
		pointer-events: none;
	}

	:global(.measure-distance-label) {
		width: max-content;
		min-width: 38px;
		padding: 2px 5px;
		border-radius: 5px;
		background: rgba(17, 24, 39, 0.94);
		color: var(--text-primary);
		font-size: 8.8px;
		line-height: 1.1;
		font-weight: 900;
		text-align: center;
		text-shadow:
			0 1px 0 rgba(255, 255, 255, 0.9),
			0 0 2px rgba(255, 255, 255, 0.8);
		box-shadow: 0 2px 6px rgba(15, 23, 42, 0.16);
	}

	/* =========================
     MOBILE TOGGLE DEFAULT
     ========================= */

	.mobile-sidebar-backdrop,
	.mobile-vessel-toggle {
		display: none;
	}

	.sidebar-toggle-btn {
		position: absolute;
		top: 50%;
		left: calc(var(--fleet-main-sidebar-offset) + 14px);
		z-index: 950;
		width: 42px;
		min-height: 92px;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 7px;
		border: 1px solid rgba(147, 197, 253, 0.42);
		border-radius: 18px;
		background:
			linear-gradient(180deg, rgba(30, 64, 175, 0.28), rgba(15, 23, 42, 0.08)),
			rgba(15, 23, 42, 0.9);
		color: #dbeafe;
		padding: 8px 5px;
		font-size: 0;
		font-weight: 800;
		box-shadow:
			0 12px 28px rgba(15, 23, 42, 0.22),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(12px) saturate(1.15);
		cursor: pointer;
		transform: translateY(-50%);
		transition:
			left 0.22s ease,
			background 0.18s ease,
			border-color 0.18s ease,
			box-shadow 0.18s ease,
			transform 0.18s ease;
	}

	.sidebar-toggle-btn span {
		color: inherit;
		font-size: 10px;
		line-height: 1;
	}

	.sidebar-toggle-btn span:first-of-type {
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.55);
		border: 1px solid rgba(191, 219, 254, 0.28);
		font-size: 0;
		font-weight: 900;
		box-shadow: 0 6px 14px rgba(37, 99, 235, 0.22);
	}

	.sidebar-toggle-btn span:first-of-type::before {
		content: '☰';
		font-size: 14px;
		line-height: 1;
	}

	.sidebar-toggle-btn:hover {
		border-color: rgba(147, 197, 253, 0.8);
		background: rgba(30, 41, 59, 0.96);
		transform: translateY(-1px);
	}

	.sidebar-toggle-btn.sidebar-open-toggle {
		left: calc(var(--fleet-main-sidebar-offset) + 10px + var(--fleet-sidebar-width));
	}

	.sidebar-toggle-btn span:first-of-type::before {
		content: '>';
		font-size: 15px;
		line-height: 1;
	}

	.sidebar-toggle-btn.sidebar-open-toggle span:first-of-type::before {
		content: '<';
	}

	.sidebar-toggle-btn span:last-of-type {
		writing-mode: vertical-rl;
		text-orientation: mixed;
		letter-spacing: 0.03em;
		font-size: 9px;
		font-weight: 800;
		text-transform: uppercase;
	}

	.sidebar-toggle-btn:hover {
		border-color: rgba(147, 197, 253, 0.8);
		background:
			linear-gradient(180deg, rgba(37, 99, 235, 0.36), rgba(15, 23, 42, 0.12)),
			rgba(15, 23, 42, 0.96);
		box-shadow:
			0 16px 34px rgba(15, 23, 42, 0.28),
			0 0 0 4px rgba(37, 99, 235, 0.09),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
		transform: translateY(-50%) translateX(1px);
	}

	/* =========================
     SIDEBAR - NORMAL SIZE
     ========================= */

	.fleet-sidebar {
		position: absolute;
		top: 0;
		left: var(--fleet-main-sidebar-offset);
		z-index: 900;
		width: var(--fleet-sidebar-width);
		display: flex;
		flex-direction: column;
		background: rgba(15, 23, 42, 0.94);
		backdrop-filter: blur(16px) saturate(1.18);
		transition:
			opacity 0.18s ease,
			transform 0.22s ease;
	}

	.fleet-sidebar.sidebar-collapsed {
		opacity: 0;
		pointer-events: none;
		transform: translateX(calc(-100% - 12px));
	}

	.sidebar-fixed {
		flex: 0 0 auto;
		border-bottom: 1px solid #eef2f7;
		z-index: 2;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px 5px;
	}

	.sidebar-title-wrap {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.sidebar-icon {
		width: 28px;
		height: 28px;
		border-radius: 9px;
		background: var(--color-accent-muted);
		display: grid;
		place-items: center;
		font-size: 13px;
		flex-shrink: 0;
	}

	.sidebar-header h1 {
		margin: 0;
		font-size: 14px;
		line-height: 1.05;
		font-weight: 900;
	}

	.sidebar-header p {
		margin: 2px 0 0;
		color: var(--text-secondary);
		font-size: 9px;
		line-height: 1.15;
		font-weight: 700;
	}

	.fleet-stats {
		display: flex;
		gap: 5px;
		padding: 10px 6px;
		flex-wrap: wrap;
	}

	.stat-chip {
		height: 23px;
		padding: 0 7px;
		border-radius: 999px;
		border: 1px solid #dbe4ef;
		background: var(--color-surface);
		color: var(--text-secondary);
		font-size: 9.5px;
		font-weight: 800;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		cursor: pointer;
	}

	.stat-chip.active-filter {
		box-shadow: inset 0 0 0 1px #2563eb;
		color: #1d4ed8;
		background: var(--color-accent-muted);
	}

	.chip-dot,
	.legend-dot,
	.status-dot {
		border-radius: 999px;
		flex-shrink: 0;
	}

	.chip-dot,
	.legend-dot {
		width: 6px;
		height: 6px;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		margin-top: 3px;
	}

	.online {
		background: #22c55e;
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
	}

	.offline {
		background: #94a3b8;
		box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.1);
	}

	.search-box {
		padding: 0 10px 7px;
	}

	.search-box input {
		width: 100%;
		height: 28px;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		padding: 0 9px;
		font-size: 10.5px;
		color: var(--text-primary);
		background: var(--color-elevated);
		outline: none;
	}

	.search-box input:focus {
		border-color: #60a5fa;
		background: var(--color-surface);
	}

	/* =========================
     VESSEL LIST - NORMAL SIZE
     ========================= */

	.vessel-list {
		flex: 1 1 auto;
		min-height: 0;
		max-height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 6px 7px 7px;
		display: grid;
		grid-auto-rows: max-content;
		gap: 6px;
		align-content: start;
	}

	.vessel-list::-webkit-scrollbar,
	.detail-panel-body::-webkit-scrollbar {
		width: 6px;
	}

	.vessel-list::-webkit-scrollbar-track,
	.detail-panel-body::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.06);
		border-radius: 999px;
	}

	.vessel-list::-webkit-scrollbar-thumb,
	.detail-panel-body::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 999px;
	}

	.vessel-list::-webkit-scrollbar-thumb:hover,
	.detail-panel-body::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}

	/* =========================
     VESSEL CARD - NORMAL SIZE
     ========================= */

	.vessel-card {
		position: relative;
		min-height: 0;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		background: var(--color-surface);
		overflow: hidden;
		box-shadow: none;
		transition:
			border-color 0.15s ease,
			background 0.15s ease,
			box-shadow 0.15s ease;
	}

	.vessel-card:hover {
		border-color: #bfdbfe;
		box-shadow: 0 4px 10px rgba(15, 23, 42, 0.06);
	}

	.vessel-card.selected-card {
		border-color: #60a5fa;
		background:
			linear-gradient(135deg, rgba(59, 130, 246, 0.24), rgba(125, 211, 252, 0.1) 58%),
			#1f2a44;
		box-shadow:
			0 0 0 2px rgba(96, 165, 250, 0.22),
			0 12px 26px rgba(15, 23, 42, 0.2);
	}

	.vessel-card.selected-card::before {
		content: '';
		position: absolute;
		inset: 8px auto 8px 0;
		width: 4px;
		border-radius: 0 999px 999px 0;
		background: #3b82f6;
		box-shadow: 0 0 14px rgba(59, 130, 246, 0.7);
	}

	.vessel-card.offline-card {
		border-color: rgba(71, 85, 105, 0.75);
		background:
			linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(30, 41, 59, 0.88)),
			var(--color-elevated);
		opacity: 0.72;
		filter: saturate(0.72);
	}

	.vessel-card.offline-card:hover {
		opacity: 0.86;
		border-color: rgba(148, 163, 184, 0.72);
	}

	.vessel-card.selected-card.offline-card {
		opacity: 1;
		filter: saturate(0.9);
		border-color: #60a5fa;
		background:
			linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(30, 41, 59, 0.9)),
			#1d2740;
	}

	.vessel-select {
		position: relative;
		z-index: 1;
		width: 100%;
		border: none;
		background: transparent;
		padding: 7px;
		text-align: left;
		cursor: pointer;
		transition:
			background 0.15s ease,
			box-shadow 0.15s ease;
	}

	.vessel-select.selected-select {
		background:
			linear-gradient(135deg, rgba(96, 165, 250, 0.16), rgba(14, 165, 233, 0.08)),
			rgba(30, 64, 175, 0.2);
		box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.2);
	}

	.vessel-select.offline-select {
		color: rgba(226, 232, 240, 0.78);
	}

	.vessel-main-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 6px;
	}

	.vessel-identity {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		min-width: 0;
	}

	.vessel-name-block {
		min-width: 0;
	}

	.vessel-name-block h3 {
		margin: 0;
		color: var(--text-primary);
		font-size: 11.5px;
		line-height: 1.1;
		font-weight: 900;
		letter-spacing: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vessel-card.offline-card .vessel-name-block h3 {
		color: rgba(226, 232, 240, 0.78);
	}

	.vessel-name-block p {
		margin: 3px 0 0;
		color: var(--text-secondary);
		font-size: 8.8px;
		line-height: 1.15;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sidebar-close-btn {
		width: 24px;
		height: 24px;
		display: none;
		place-items: center;
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 9px;
		background: rgba(15, 23, 42, 0.04);
		color: var(--text-secondary);
		font-size: 16px;
		font-weight: 900;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
	}

	.sidebar-close-btn:hover {
		border-color: rgba(248, 113, 113, 0.36);
		background: var(--color-danger-muted);
		color: #dc2626;
	}

	.vessel-card.offline-card .vessel-name-block p,
	.vessel-card.offline-card .mini-metric span {
		color: rgba(148, 163, 184, 0.78);
	}

	.vessel-card-tools {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		flex: 0 0 auto;
		max-width: 128px;
	}

	.vessel-utc-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		max-width: 88px;
		height: 24px;
		padding: 0 8px;
		overflow: hidden;
		border: 1px solid rgba(96, 165, 250, 0.22);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.13);
		color: #bfdbfe;
		font-size: 9.4px;
		font-weight: 800;
		letter-spacing: 0.04em;
		line-height: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vessel-card.offline-card .vessel-utc-badge {
		border-color: rgba(148, 163, 184, 0.2);
		background: rgba(100, 116, 139, 0.12);
		color: rgba(203, 213, 225, 0.78);
	}

	.location-button {
		width: 23px;
		height: 23px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		display: grid;
		place-items: center;
		flex-shrink: 0;
		border: 1px solid #e2e8f0;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72);
	}

	.location-button::before {
		content: '';
		width: 13px;
		height: 13px;
		display: block;
		background: #94a3b8;
		-webkit-mask: url('/assets/gps.svg') center / contain no-repeat;
		mask: url('/assets/gps.svg') center / contain no-repeat;
	}

	.location-button.has-coordinate {
		background: var(--color-success-muted);
		border-color: #bbf7d0;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.72),
			0 0 0 3px rgba(34, 197, 94, 0.08);
	}

	.location-button.has-coordinate::before {
		background: #22c55e;
	}

	.vessel-card.selected-card .location-button {
		background: var(--color-accent-muted);
		border-color: #bfdbfe;
	}

	.vessel-card.selected-card .location-button.has-coordinate {
		background: #dcfce7;
		border-color: #86efac;
	}
	.vessel-metric-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 5px;
		margin-top: 6px;
	}

	.mini-metric {
		min-height: 32px;
		padding: 5px 6px;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		background: var(--color-elevated);
	}

	.vessel-card.offline-card .mini-metric {
		border-color: rgba(71, 85, 105, 0.8);
		background: rgba(15, 23, 42, 0.62);
	}

	.vessel-card.selected-card .mini-metric {
		background: rgba(96, 165, 250, 0.12);
		border-color: rgba(147, 197, 253, 0.42);
	}

	.mini-metric span {
		display: block;
		color: var(--text-secondary);
		font-size: 7.8px;
		line-height: 1.1;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.mini-metric strong {
		display: block;
		margin-top: 3px;
		color: var(--text-primary);
		font-size: 10px;
		line-height: 1.05;
		font-weight: 900;
	}

	.vessel-card.offline-card .mini-metric strong {
		color: rgba(241, 245, 249, 0.84);
	}

	.vessel-top,
	.vessel-name-group,
	.vessel-meta,
	.pin-badge,
	.card-actions,
	.detail-btn,
	.trace-btn,
	.filter-row,
	.mini-filter,
	.toolbar-left,
	.toolbar-badge,
	.map-toolbar {
		display: none !important;
	}

	.ocean-observed-row strong {
		max-width: 130px;
		text-align: right;
		line-height: 1.25;
		white-space: normal;
	}

	/* =========================
     MAP PANEL - COMPACT
     ========================= */

	.fleet-map-panel {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		padding: 0;
		background: transparent;
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}

	:global(.leaflet-control-attribution) {

		display: none;
	}

	.map-stage {
		position: relative;
		flex: 1 1 auto;
		height: 100%;
		min-height: 0;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid #e2e8f0;
		background: var(--color-elevated);
		box-shadow:
			0 1px 2px rgba(15, 23, 42, 0.04),
			0 8px 24px rgba(15, 23, 42, 0.06);
	}

	.leaflet-map {
		position: relative;
		isolation: isolate;
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: var(--color-elevated);
	}

	/* Explicit Leaflet pane layout and stacking.
	   The package stylesheet is loaded dynamically, so these rules keep the
	   map stable before and after that stylesheet resolves. */
	:global(.fleet-page .leaflet-map-pane),
	:global(.fleet-page .leaflet-pane) {
		position: absolute;
		top: 0;
		left: 0;
	}

	:global(.fleet-page .leaflet-map-pane) {
		z-index: 1;
	}

	:global(.fleet-page .leaflet-tile-pane) {
		z-index: 200;
	}

	:global(.fleet-page .leaflet-overlay-pane) {
		z-index: 400;
	}

	:global(.fleet-page .leaflet-wind-pane) {
		z-index: 420;
		pointer-events: none;
	}

	:global(.fleet-page .leaflet-current-pane) {
		z-index: 430;
		pointer-events: none;
	}

	:global(.fleet-page .leaflet-assetBoundary-pane) {
		z-index: 440;
		pointer-events: none;
	}

	:global(.fleet-page .leaflet-asset-pane) {
		z-index: 450;
	}

	:global(.fleet-page .asset-boundary-circle) {
		filter: drop-shadow(0 0 7px rgba(245, 158, 11, 0.5));
	}

	:global(.fleet-page .leaflet-shadow-pane) {
		z-index: 500;
		pointer-events: none;
	}

	:global(.fleet-page .leaflet-marker-pane) {
		z-index: 600;
	}

	:global(.fleet-page .leaflet-vessel-pane) {
		z-index: 650;
	}

	:global(.fleet-page .leaflet-tooltip-pane) {
		z-index: 700;
		pointer-events: none;
	}

	:global(.fleet-page .leaflet-selected-vessel-pane) {
		z-index: 750;
	}

	:global(.fleet-page .leaflet-popup-pane) {
		z-index: 800;
	}

	:global(.fleet-page .leaflet-control-container) {
		position: relative;
		z-index: 900;
	}

	.map-legend {
		position: absolute;
		top: 12px;
		right: 12px;
		display: grid;
		gap: 9px;
		width: min(310px, calc(100% - 24px));
		max-height: calc(100% - 24px);
		overflow: auto;
		padding: 11px;
		border-radius: 14px;
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.84)),
			rgba(15, 23, 42, 0.88);
		border: 1px solid rgba(147, 197, 253, 0.24);
		box-shadow:
			0 18px 40px rgba(15, 23, 42, 0.24),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(14px) saturate(1.12);
		z-index: 700;
		transition:
			width 0.2s ease,
			padding 0.2s ease,
			background 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.map-legend.legend-collapsed {
		width: auto;
		min-width: 0;
		padding: 8px 9px;
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.78)),
			rgba(15, 23, 42, 0.82);
	}

	.legend-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		padding-bottom: 2px;
	}

	.map-legend.legend-collapsed .legend-header {
		align-items: center;
		padding-bottom: 0;
	}

	.legend-header > div {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.legend-title {
		color: #dbeafe;
		font-size: 12px;
		line-height: 1.1;
		font-weight: 800;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.legend-subtitle {
		color: rgba(203, 213, 225, 0.78);
		font-size: 10px;
		line-height: 1.1;
		font-weight: 600;
		white-space: nowrap;
	}

	.map-legend.legend-collapsed .legend-subtitle {
		display: none;
	}

	.legend-toggle-btn {
		width: 28px;
		height: 28px;
		min-width: 28px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(147, 197, 253, 0.35);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.18);
		color: #dbeafe;
		font-size: 18px;
		line-height: 1;
		font-weight: 800;
		cursor: pointer;
		transition:
			transform 0.16s ease,
			background 0.16s ease,
			border-color 0.16s ease;
	}

	.legend-toggle-btn:hover {
		transform: translateY(-1px);
		border-color: rgba(147, 197, 253, 0.72);
		background: rgba(37, 99, 235, 0.3);
	}

	.legend-body {
		display: grid;
		gap: 9px;
	}

	.legend-section {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 7px;
		padding: 0;
		border: 0;
		background: transparent !important;
		box-shadow: none;
	}

	.legend-section + .legend-section {
		padding-top: 0;
		border-top: 0;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		color: rgba(226, 232, 240, 0.9);
		font-size: 10px;
		line-height: 1.15;
		font-weight: 650;
	}

	.legend-vessel-marker {
		position: relative;
		width: 20px;
		height: 36px;
		display: inline-grid;
		place-items: center;
		flex: 0 0 auto;
		border-radius: 0;
		background: transparent;
		border: 0;
		box-shadow:
			0 0 0 5px rgba(34, 197, 94, 0.16),
			0 0 14px rgba(34, 197, 94, 0.38),
			0 6px 12px rgba(15, 23, 42, 0.2);
	}

	.legend-vessel-marker::before {
		content: '';
		width: 20px;
		height: 36px;
		background-image: url('/assets/vessel.png');
		background-size: contain;
		background-repeat: no-repeat;
		background-position: center;
		transform: scaleX(1.16);
		filter:
			drop-shadow(0 0 4px rgba(255, 255, 255, 0.92))
			drop-shadow(0 5px 8px rgba(15, 23, 42, 0.28));
	}

	.legend-vessel-marker::after {
		content: '';
		position: absolute;
		right: -7px;
		top: 50%;
		transform: translateY(-50%);
		width: 7px;
		height: 7px;
		border: 2px solid #ffffff;
		border-radius: 999px;
		background: #22c55e;
	}

	.legend-vessel-marker.offline {
		box-shadow:
			0 0 0 5px rgba(239, 68, 68, 0.14),
			0 0 14px rgba(239, 68, 68, 0.34),
			0 6px 12px rgba(15, 23, 42, 0.24);
	}

	.legend-vessel-marker.offline::before {
		opacity: 0.66;
		filter:
			grayscale(1)
			brightness(0.78)
			drop-shadow(0 0 4px rgba(15, 23, 42, 0.7))
			drop-shadow(0 5px 8px rgba(15, 23, 42, 0.34));
	}

	.legend-vessel-marker.offline::after {
		background: #ef4444;
		border-color: #1e293b;
	}

	.legend-vessel-marker.selected {
		width: 23px;
		height: 40px;
		box-shadow:
			0 0 0 6px rgba(59, 130, 246, 0.18),
			0 0 16px rgba(37, 99, 235, 0.48),
			0 6px 12px rgba(15, 23, 42, 0.22);
	}

	.legend-vessel-marker.selected::before {
		width: 23px;
		height: 40px;
		filter:
			drop-shadow(0 0 5px rgba(59, 130, 246, 0.98))
			drop-shadow(0 0 10px rgba(37, 99, 235, 0.5))
			drop-shadow(0 6px 12px rgba(15, 23, 42, 0.28));
	}

	.legend-vessel-marker.selected::after {
		background: #22c55e;
	}

	.asset-boundary-legend {
		width: 22px;
		height: 22px;
		border: 2px dashed #f59e0b;
		border-radius: 999px;
		background: rgba(245, 158, 11, 0.14);
		box-shadow: 0 0 10px rgba(245, 158, 11, 0.24);
		flex: 0 0 auto;
	}

	.legend-asset-icons {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		min-width: 0;
	}

	.legend-asset-item {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 26px;
		padding: 4px 7px;
		border: 1px solid rgba(245, 158, 11, 0.22);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.36);
		color: rgba(226, 232, 240, 0.92);
		font-size: 9.5px;
		font-weight: 650;
	}

	.legend-asset-item img {
		width: 18px;
		height: 18px;
		object-fit: contain;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.34));
	}

	.legend-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		padding-top: 8px;
		border-top: 1px solid rgba(148, 163, 184, 0.14);
	}

	/* =========================
     LEAFLET MARKER - COMPACT
     ========================= */

	:global(.vessel-leaflet-icon) {
		position: relative;
		display: block;
		background: transparent;
		border: none;
		overflow: visible !important;
	}

	:global(.vessel-leaflet-icon::before) {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		z-index: 0;
		width: 34px;
		height: 34px;
		border-radius: 999px;
		transform: translate(-50%, -50%);
		background: rgba(34, 197, 94, 0.18);
		box-shadow:
			0 0 0 8px rgba(34, 197, 94, 0.12),
			0 0 18px rgba(34, 197, 94, 0.44);
	}

	:global(.vessel-leaflet-icon::after) {
		content: '';
		position: absolute;
		right: -5px;
		top: 50%;
		z-index: 2;
		width: 9px;
		height: 9px;
		transform: translateY(-50%);
		border: 2px solid rgba(15, 23, 42, 0.82);
		border-radius: 999px;
		background: #22c55e;
		box-shadow: 0 0 9px rgba(34, 197, 94, 0.72);
	}

	:global(.fleet-vessel-marker-icon) {
		position: relative;
		z-index: 1;
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		margin: 0;
		transform-origin: center center;
		filter:
			drop-shadow(0 0 4px rgba(255, 255, 255, 0.95))
			drop-shadow(0 7px 13px rgba(15, 23, 42, 0.32));
		transition:
			filter 0.18s ease,
			opacity 0.18s ease;
	}

	:global(.vessel-leaflet-icon.selected .fleet-vessel-marker-icon) {
		width: 100%;
		margin: 0;
		filter:
			drop-shadow(0 0 5px rgba(59, 130, 246, 0.98))
			drop-shadow(0 0 12px rgba(37, 99, 235, 0.62))
			drop-shadow(0 10px 18px rgba(15, 23, 42, 0.3));
	}

	:global(.vessel-leaflet-icon.selected::before) {
		width: 40px;
		height: 40px;
		background: rgba(59, 130, 246, 0.2);
		box-shadow:
			0 0 0 9px rgba(59, 130, 246, 0.14),
			0 0 22px rgba(37, 99, 235, 0.54);
	}

	:global(.vessel-leaflet-icon.offline .fleet-vessel-marker-icon) {
		opacity: 0.66;
		filter:
			grayscale(1)
			brightness(0.78)
			drop-shadow(0 0 4px rgba(15, 23, 42, 0.7))
			drop-shadow(0 7px 13px rgba(15, 23, 42, 0.34));
	}

	:global(.vessel-leaflet-icon.offline::before) {
		background: rgba(239, 68, 68, 0.17);
		box-shadow:
			0 0 0 8px rgba(239, 68, 68, 0.11),
			0 0 18px rgba(239, 68, 68, 0.4);
	}

	:global(.vessel-leaflet-icon.offline::after) {
		background: #ef4444;
		box-shadow: 0 0 9px rgba(239, 68, 68, 0.72);
	}

	:global(.vessel-leaflet-icon.offline.selected .fleet-vessel-marker-icon) {
		opacity: 0.82;
		filter:
			grayscale(0.7)
			brightness(0.82)
			drop-shadow(0 0 5px rgba(248, 113, 113, 0.88))
			drop-shadow(0 0 12px rgba(239, 68, 68, 0.5))
			drop-shadow(0 10px 18px rgba(15, 23, 42, 0.3));
	}

	/* =========================
     LEAFLET POPUP - COMPACT
     ========================= */

	:global(.fleet-leaflet-popup) {
		margin-bottom: 9px;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-content-wrapper) {
		background: var(--color-surface);
		color: var(--text-primary);
		border-radius: 10px;
		border: 1px solid #dbe4ef;
		box-shadow:
			0 9px 20px rgba(15, 23, 42, 0.14),
			0 1px 4px rgba(15, 23, 42, 0.08);
		overflow: hidden;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-content) {
		margin: 0;
		width: 150px !important;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-tip) {
		background: var(--color-surface);
		border: 1px solid #dbe4ef;
		box-shadow: 0 7px 16px rgba(15, 23, 42, 0.12);
	}

	:global(.fleet-leaflet-popup .leaflet-popup-close-button) {
		top: 5px !important;
		right: 5px !important;
		width: 20px !important;
		height: 20px !important;
		border-radius: 6px !important;
		background: rgba(15, 23, 42, 0.08) !important;
		color: var(--text-secondary) !important;
		font-size: 14px !important;
		line-height: 18px !important;
		font-weight: 800 !important;
		padding: 0 !important;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-close-button:hover) {
		background: rgba(239, 68, 68, 0.12) !important;
		color: #dc2626 !important;
	}

	:global(.fleet-popup) {
		overflow: hidden;
		background: var(--color-surface);
		width: 250px;
	}

	:global(.fleet-popup-title) {
		position: relative;
		padding: 8px 30px 7px 9px;
		background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(37, 99, 235, 0)), var(--color-elevated);
		color: var(--text-primary);
		font-size: 11.5px;
		font-weight: 900;
		line-height: 1.1;
		border-bottom: 1px solid #e2e8f0;
	}

	:global(.fleet-popup-title::before) {
		content: '';
		display: inline-block;
		width: 5px;
		height: 5px;
		margin-right: 5px;
		border-radius: 999px;
		background: #22c55e;
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
		vertical-align: middle;
	}

	:global(.fleet-popup-title.is-offline::before) {
		background: #94a3b8;
		box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.1);
	}

	:global(.fleet-popup-row) {
		display: grid;
		grid-template-columns: 56px 1fr;
		gap: 5px;
		align-items: start;
		padding: 4px 9px;
		border-bottom: 1px solid #eef2f7;
	}

	:global(.fleet-popup-row span) {
		color: var(--text-secondary);
		font-size: 8px;
		font-weight: 800;
	}

	:global(.fleet-popup-row strong) {
		color: var(--text-primary);
		font-size: 8.8px;
		line-height: 1.25;
		font-weight: 900;
		text-align: right;
	}

	:global(.fleet-popup-sub) {
		margin: -3px 9px 0 65px;
		padding: 0 0 4px;
		color: #2563eb;
		font-size: 7.8px;
		line-height: 1.15;
		font-weight: 800;
		text-align: right;
		border-bottom: 1px solid #eef2f7;
	}

	:global(.fleet-popup-row:last-of-type) {
		border-bottom: none;
		background: var(--color-elevated);
	}

	:global(.fleet-popup-row:last-of-type strong) {
		color: #1d4ed8;
	}

	:global(.fleet-popup-detail-btn) {
		width: calc(100% - 18px);
		height: 24px;
		margin: 6px 9px 8px;
		border: none;
		border-radius: 7px;
		background: #2563eb;
		color: #ffffff;
		font-size: 8.8px;
		font-weight: 900;
		cursor: pointer;
	}

	:global(.fleet-popup-detail-btn:hover) {
		background: #1d4ed8;
	}

	/* =========================
     DETAIL PANEL - COMPACT
     ========================= */

	.vessel-detail-panel {
		position: absolute;
		right: 8px;
		bottom: 8px;
		width: 258px;
		max-width: calc(100% - 16px);
		max-height: calc(100% - 16px);
		border: 1px solid #dbe4ef;
		border-radius: 10px;
		box-shadow:
			0 11px 24px rgba(15, 23, 42, 0.17),
			0 1px 4px rgba(15, 23, 42, 0.08);
		z-index: 800;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.detail-panel-header {
		flex: 0 0 auto;
		padding: 7px 9px;
		border-bottom: 1px solid #e2e8f0;
		background: var(--color-surface);
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 7px;
	}

	.detail-panel-header h2 {
		margin: 0;
		color: var(--text-secondary);
		font-size: 11.3px;
		line-height: 1.1;
		font-weight: 900;
	}

	.detail-panel-header p {
		margin: 2px 0 0;
		color: var(--text-secondary);
		font-size: 8px;
		font-weight: 700;
	}

	.detail-close-btn {
		width: 20px;
		height: 20px;
		border: none;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-secondary);
		font-size: 13px;
		font-weight: 800;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
	}

	.detail-close-btn:hover {
		background: var(--color-danger-muted);
		color: #dc2626;
	}

	.detail-panel-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: 0 9px 9px;
	}

	.detail-section {
		padding: 6px 0;
		border-bottom: 1px solid #eef2f7;
	}

	.detail-section:last-child {
		border-bottom: none;
	}

	.detail-section h3 {
		margin: 0 0 4px;
		color: var(--text-secondary);
		font-size: 8.7px;
		line-height: 1.1;
		font-weight: 800;
	}

	.detail-grid {
		display: grid;
		gap: 4px;
	}

	.detail-grid.two-col {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.detail-item {
		min-width: 0;
	}

	.detail-item span {
		display: block;
		color: #7c8797;
		font-size: 8px;
		line-height: 1.1;
		font-weight: 700;
	}

	.detail-item strong {
		display: block;
		margin-top: 2px;
		color: var(--text-secondary);
		font-size: 8.8px;
		line-height: 1.25;
		font-weight: 800;
		word-break: break-word;
	}

	.voyage-progress-card {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 7px 9px;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		background: var(--color-surface);
	}

	.voyage-progress-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.voyage-progress-head span,
	.voyage-progress-meta span {
		display: block;
		margin-bottom: 1px;
		font-size: 8.5px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.voyage-progress-head strong,
	.voyage-progress-meta strong {
		display: block;
		font-size: 11px;
		font-weight: 800;
		line-height: 1.15;
		color: var(--text-primary);
	}

	.voyage-progress-value {
		flex: 0 0 auto;
		padding: 3px 7px;
		border-radius: 999px;
		background: #2563eb;
		color: #ffffff;
		font-size: 10.5px;
		font-weight: 900;
		line-height: 1.1;
		box-shadow: none;
	}

  .compact-voyage-section {
    gap: 6px;
  }

  .voyage-progress-mini {
    padding: 7px 9px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: var(--color-surface);
  }

  .voyage-progress-mini-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }

  .voyage-progress-mini-top strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .voyage-progress-mini-top span {
    flex: 0 0 auto;
    padding: 2px 7px;
    border-radius: 999px;
    background: #2563eb;
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 900;
    line-height: 1.2;
  }

  .voyage-progress-mini-bottom {
    margin-top: 5px;
    font-size: 10px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .voyage-progress-track {
    position: relative;
    width: 100%;
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
  }

  .voyage-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #2563eb, #06b6d4);
    transition: width 0.35s ease;
  }

	.voyage-progress-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding-top: 0;
	}

	.online-text {
		color: #008000 !important;
	}

	.offline-text {
		color: var(--text-secondary) !important;
	}

	.empty-voyage {
		color: #374151;
		font-size: 8.8px;
		line-height: 1.3;
		font-weight: 900;
		text-align: center;
	}

	.simple-table {
		display: grid;
		gap: 3px;
	}

	.simple-row {
		display: grid;
		grid-template-columns: 1fr 52px;
		gap: 5px;
		color: var(--text-secondary);
		font-size: 8.7px;
		line-height: 1.2;
	}

	.simple-row.table-head {
		color: #7c8797;
	}

	.simple-row strong {
		text-align: right;
		font-weight: 800;
	}

	.weather-current {
		display: grid;
		grid-template-columns: 22px 1fr 1fr;
		gap: 4px;
		align-items: center;
		margin-bottom: 5px;
	}

	.weather-icon {
		font-size: 15px;
	}

	.weather-current strong,
	.weather-card strong,
	.ocean-current strong {
		display: block;
		color: var(--text-primary);
		font-size: 8.8px;
		font-weight: 900;
	}

	.weather-current span,
	.weather-card span,
	.ocean-current span {
		display: block;
		color: var(--text-secondary);
		font-size: 7.8px;
		font-weight: 700;
	}

	.weather-current span {
		margin-top: 1px;
	}

	.weather-meta {
		text-align: right;
	}

	.weather-cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px;
	}

	.weather-card {
		min-height: 44px;
		padding: 4px;
		border: 1px solid #e2e8f0;
		border-radius: 7px;
		background: var(--color-elevated);
		text-align: center;
	}

	.weather-card small {
		display: block;
		margin-top: 2px;
		color: #2563eb;
		font-size: 7.6px;
		font-weight: 800;
	}

	.ocean-current {
		display: grid;
		grid-template-columns: 56px 1fr;
		gap: 4px;
		margin-bottom: 5px;
	}

	/* =========================
	   FLEET POPUP — DARK MARITIME
	   ========================= */

	:global(.fleet-leaflet-popup .leaflet-popup-content-wrapper) {
		border: 1px solid rgba(59, 130, 246, 0.24);
		border-radius: 16px;
		background: rgba(10, 14, 26, 0.96);
		box-shadow:
			0 24px 60px rgba(0, 0, 0, 0.48),
			0 0 0 1px rgba(255, 255, 255, 0.04);
		backdrop-filter: blur(18px) saturate(1.3);
	}

	:global(.fleet-leaflet-popup .leaflet-popup-content) {
		width: 300px !important;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-tip) {
		border: none;
		background: #0a0e1a;
		box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.25);
	}

	:global(.fleet-leaflet-popup .leaflet-popup-close-button) {
		top: 10px !important;
		right: 10px !important;
		width: 26px !important;
		height: 26px !important;
		border: 1px solid rgba(255, 255, 255, 0.08) !important;
		border-radius: 8px !important;
		background: rgba(255, 255, 255, 0.06) !important;
		color: var(--text-secondary) !important;
		font-size: 17px !important;
		line-height: 23px !important;
		transition: all 120ms ease;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-close-button:hover) {
		border-color: rgba(239, 68, 68, 0.28) !important;
		background: var(--color-danger-muted) !important;
		color: #fca5a5 !important;
	}

	:global(.fleet-popup) {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		background:
			radial-gradient(circle at 5% 0%, rgba(59, 130, 246, 0.16), transparent 36%),
			linear-gradient(180deg, rgba(30, 41, 59, 0.25), rgba(10, 14, 26, 0)),
			#0a0e1a;
	}

	:global(.fleet-popup-hero) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 44px 11px 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
	}

	:global(.fleet-popup-heading) {
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	:global(.fleet-popup-eyebrow) {
		color: #60a5fa;
		font-size: 8px;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	:global(.fleet-popup-heading > strong) {
		display: -webkit-box;
		overflow: hidden;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 900;
		line-height: 1.2;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		white-space: normal;
	}

	:global(.fleet-popup-heading > small) {
		overflow: hidden;
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.fleet-popup-status) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 7px;
		border-radius: 999px;
		font-size: 8px;
		font-weight: 900;
		white-space: nowrap;
	}

	:global(.fleet-popup-status::before) {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		box-shadow: 0 0 8px currentColor;
	}

	:global(.fleet-popup-status.is-online) {
		background: var(--color-success-muted);
		color: #34d399;
	}

	:global(.fleet-popup-status.is-offline) {
		background: rgba(100, 116, 139, 0.16);
		color: #94a3b8;
	}

	:global(.fleet-popup-metrics) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 7px;
		padding: 9px 12px 7px;
	}

	:global(.fleet-popup-metric) {
		min-width: 0;
		padding: 9px 10px;
		border: 1px solid rgba(96, 165, 250, 0.13);
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.72);
	}

	:global(.fleet-popup-metric > span) {
		display: block;
		margin-bottom: 4px;
		color: var(--text-secondary);
		font-size: 8px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	:global(.fleet-popup-metric > strong) {
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
		line-height: 1;
	}

	:global(.fleet-popup-metric > strong small) {
		color: var(--text-secondary);
		font-size: 8px;
		font-weight: 800;
	}

	:global(.fleet-popup-meta) {
		padding: 3px 12px 7px;
	}

	:global(.fleet-popup-coordinates) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 7px;
		padding: 0 12px 8px;
	}

	:global(.fleet-popup-coordinates > div) {
		min-width: 0;
		padding: 8px 9px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 11px;
		background: rgba(255, 255, 255, 0.028);
	}

	:global(.fleet-popup-coordinates span) {
		display: block;
		margin-bottom: 4px;
		color: var(--text-muted);
		font-size: 8px;
		font-weight: 900;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	:global(.fleet-popup-coordinates strong) {
		display: block;
		overflow: hidden;
		color: var(--text-primary);
		font-size: 10px;
		font-weight: 900;
		line-height: 1.1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.fleet-popup-meta .fleet-popup-row) {
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 10px;
		padding: 6px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	:global(.fleet-popup-meta .fleet-popup-row:last-child) {
		border-bottom: none;
		background: transparent;
	}

	:global(.fleet-popup-meta .fleet-popup-row span) {
		color: var(--text-muted);
		font-size: 8px;
		font-weight: 800;
		text-transform: uppercase;
	}

	:global(.fleet-popup-meta .fleet-popup-row strong) {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 800;
		text-align: right;
	}

	:global(.fleet-popup-actions) {
		gap: 7px;
		padding: 8px 12px 12px;
	}

	:global(.fleet-popup-actions .fleet-popup-detail-btn),
	:global(.fleet-popup-actions .fleet-popup-dashboard-btn) {
		min-width: 0;
		height: 30px;
		border: 1px solid transparent;
		border-radius: 10px;
		font-size: 9px;
		letter-spacing: 0.01em;
		transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
	}

	:global(.fleet-popup-actions .fleet-popup-detail-btn) {
		background: linear-gradient(135deg, #3b82f6, #2563eb);
		box-shadow: 0 8px 18px rgba(37, 99, 235, 0.24);
	}

	:global(.fleet-popup-actions .fleet-popup-dashboard-btn) {
		border-color: rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.055);
		color: var(--text-primary);
	}

	:global(.fleet-popup-actions button:hover) {
		transform: translateY(-1px);
	}

	:global(.fleet-popup-hero),
	:global(.fleet-popup-metrics),
	:global(.fleet-popup-coordinates),
	:global(.fleet-popup-meta),
	:global(.fleet-popup-actions) {
		width: 100%;
		box-sizing: border-box;
	}

	/* =========================
	   DETAIL PANEL — GLASS DRAWER
	   ========================= */

	.vessel-detail-panel {
		top: 20px;
		right: 14px;
		bottom: 20px;
		width: 360px;
		max-width: calc(100% - 28px);
		max-height: none;
		border: 1px solid rgba(59, 130, 246, 0.2);
		border-radius: 16px;
		background: rgba(10, 14, 26, 0.94);
		box-shadow:
			0 24px 64px rgba(0, 0, 0, 0.5),
			0 0 0 1px rgba(255, 255, 255, 0.035);
		backdrop-filter: blur(22px) saturate(1.35);
		animation: detailPanelIn 220ms var(--ease-spring);
	}

	.vessel-detail-panel.detail-offline {
		border-color: rgba(100, 116, 139, 0.25);
	}

	.detail-panel-header {
		padding: 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
		background:
			radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.16), transparent 48%),
			rgba(17, 24, 39, 0.88);
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.detail-title-wrap,
	.detail-header-actions {
		display: flex;
		align-items: center;
	}

	.detail-title-wrap {
		flex: 1 1 180px;
		min-width: 0;
		gap: 8px;
	}

	.detail-title-wrap .detail-close-btn {
		margin-left: auto;
	}

	.detail-title-group {
		flex: 1 1 auto;
		min-width: 0;
	}

	.detail-status-dot {
		width: 11px;
		height: 11px;
		flex: 0 0 auto;
		border: 2px solid rgba(255, 255, 255, 0.7);
		border-radius: 50%;
	}

	.detail-status-dot.online {
		background: var(--color-success);
		box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.13), 0 0 14px rgba(16, 185, 129, 0.45);
	}

	.detail-status-dot.offline {
		background: #64748b;
		box-shadow: 0 0 0 5px rgba(100, 116, 139, 0.14);
	}

	.detail-eyebrow,
	.detail-section-kicker {
		display: block;
		color: #60a5fa;
		font-size: 8px;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.detail-panel-header h2 {
		max-width: 210px;
		margin-top: 3px;
		overflow: hidden;
		color: var(--text-primary);
		font-size: 16px;
		line-height: 1.15;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail-panel-header p {
		max-width: 210px;
		margin-top: 4px;
		overflow: hidden;
		color: var(--text-secondary);
		font-size: 9px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail-header-actions {
		flex: 1 1 100%;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: flex-start;
		max-width: none;
		padding-left: 19px;
	}

	.detail-header-actions .detail-close-btn {
		display: none;
	}

	.detail-header-actions .detail-dashboard-btn {
		display: none;
	}

	.detail-hire-pill,
	.detail-status-pill {
		display: inline-flex;
		align-items: center;
		padding: 5px 8px;
		border-radius: 999px;
		font-size: 8px;
		font-weight: 900;
	}

	.detail-hire-pill {
		border: 1px solid rgba(255, 255, 255, 0.08);
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.detail-hire-pill.on-hire {
		background: rgba(16, 185, 129, 0.14);
		color: #5eead4;
		border-color: rgba(45, 212, 191, 0.25);
	}

	.detail-hire-pill.off-hire {
		background: rgba(245, 158, 11, 0.14);
		color: #fbbf24;
		border-color: rgba(251, 191, 36, 0.28);
	}

	.detail-hire-pill.unknown-hire {
		background: rgba(100, 116, 139, 0.14);
		color: #cbd5e1;
		border-color: rgba(148, 163, 184, 0.2);
	}

	.detail-status-pill.online-pill {
		background: var(--color-success-muted);
		color: #34d399;
	}

	.detail-status-pill.offline-pill {
		background: rgba(100, 116, 139, 0.16);
		color: #94a3b8;
	}

	.detail-dashboard-btn,
	.detail-close-btn {
		height: 28px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 9px;
	}

	.detail-dashboard-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0 7px;
		background: var(--color-accent-muted);
		color: var(--text-accent);
		font-size: 8px;
		font-weight: 900;
	}

	.detail-dashboard-btn:hover {
		border-color: rgba(59, 130, 246, 0.4);
		background: rgba(59, 130, 246, 0.2);
	}

	.detail-dashboard-cta {
		width: 100%;
		min-height: 34px;
		margin: 0 0 8px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 0 12px;
		border: 1px solid rgba(96, 165, 250, 0.22);
		border-radius: 11px;
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(14, 165, 233, 0.08)),
			rgba(15, 23, 42, 0.74);
		color: #bfdbfe;
		font-size: 10px;
		font-weight: 900;
		cursor: pointer;
	}

	.detail-dashboard-cta:hover {
		border-color: rgba(147, 197, 253, 0.42);
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.28), rgba(14, 165, 233, 0.12)),
			rgba(15, 23, 42, 0.86);
		color: #eff6ff;
	}

	.detail-close-btn {
		width: 28px;
		background: rgba(255, 255, 255, 0.05);
		color: var(--text-secondary);
		font-size: 17px;
	}

	.detail-panel-body {
		padding: 8px;
		background: rgba(5, 9, 18, 0.32);
	}

	.detail-section {
		margin-bottom: 7px;
		padding: 10px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.025);
	}

	.detail-section:last-child {
		margin-bottom: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
	}

	.detail-section-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 7px;
	}

	.detail-time-stack {
		display: flex;
		flex: 0 0 auto;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		min-width: 0;
	}

	.detail-section h3 {
		margin: 3px 0 0;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.detail-updated-badge {
		max-width: 150px;
		overflow: hidden;
		padding: 4px 7px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-secondary);
		font-size: 8px;
		font-weight: 800;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail-utc-badge {
		padding: 5px 10px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.18);
		color: #bfdbfe;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.08em;
		line-height: 1;
		text-transform: uppercase;
		white-space: nowrap;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}

	.detail-hero-metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
		margin-bottom: 6px;
	}

	.detail-hero-metric {
		padding: 8px;
		border: 1px solid rgba(59, 130, 246, 0.16);
		border-radius: 12px;
		background: linear-gradient(145deg, rgba(59, 130, 246, 0.11), rgba(255, 255, 255, 0.02));
	}

	.detail-hero-metric > span,
	.detail-hero-metric > small {
		display: block;
		color: var(--text-secondary);
		font-size: 8px;
		font-weight: 800;
		text-transform: uppercase;
	}

	.detail-hero-metric > strong {
		display: block;
		margin: 5px 0 3px;
		color: var(--text-primary);
		font-size: 20px;
		font-weight: 900;
		line-height: 1;
	}

	.detail-grid {
		gap: 5px;
	}

	.detail-item {
		padding: 7px 8px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.025);
	}

	.detail-item span {
		color: var(--text-muted);
		font-size: 8px;
		font-weight: 800;
		text-transform: uppercase;
	}

	.detail-item strong {
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 10px;
	}

	.connection-time-item.latest-connected {
		border-color: rgba(34, 197, 94, 0.42);
		background:
			linear-gradient(145deg, rgba(34, 197, 94, 0.16), rgba(34, 197, 94, 0.045)),
			rgba(255, 255, 255, 0.025);
		box-shadow: inset 3px 0 0 rgba(34, 197, 94, 0.86);
	}

	.connection-time-item.latest-connected span,
	.connection-time-item.latest-connected strong {
		color: #bbf7d0;
	}

	.connection-time-item.latest-disconnected {
		border-color: rgba(248, 113, 113, 0.44);
		background:
			linear-gradient(145deg, rgba(239, 68, 68, 0.16), rgba(239, 68, 68, 0.045)),
			rgba(255, 255, 255, 0.025);
		box-shadow: inset 3px 0 0 rgba(239, 68, 68, 0.88);
	}

	.connection-time-item.latest-disconnected span,
	.connection-time-item.latest-disconnected strong {
		color: #fecaca;
	}

	.voyage-progress-mini {
		padding: 8px;
		border-color: rgba(59, 130, 246, 0.15);
		background: rgba(59, 130, 246, 0.055);
	}

	.simple-table {
		gap: 4px;
	}

	.simple-row {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		padding: 6px 8px;
		border: 1px solid rgba(255, 255, 255, 0.055);
		border-radius: 9px;
		background: rgba(255, 255, 255, 0.025);
		font-size: 9px;
	}

	.simple-row strong {
		color: var(--text-primary);
	}

	.weather-current {
		margin-bottom: 0;
		padding: 8px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 11px;
		background: rgba(255, 255, 255, 0.025);
	}

	.weather-icon {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: var(--color-accent-muted);
		font-size: 16px;
	}

	.empty-voyage {
		padding: 11px;
		border: 1px dashed rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.02);
		color: var(--text-secondary);
		font-size: 9px;
	}

	@keyframes detailPanelIn {
		from {
			opacity: 0;
			transform: translateX(14px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}

	.leaflet-control-zoom-in,
	.leaflet-control-zoom-out,
	:global(.leaflet-control-zoom) {
		display: none !important;
	}

	/* =========================
     TABLET
     ========================= */

	@media (max-width: 1100px) {
		.fleet-page {
			height: 100%;
			min-height: 0;
			max-height: 100%;
			overflow: hidden;
		}

		.fleet-layout {
			display: block;
			height: 100%;
		}

		.fleet-sidebar {
			width: min(var(--fleet-sidebar-width), calc(100% - 58px));
		}

		.fleet-map-panel {
			height: 100%;
			min-height: 0;
		}
	}

	/* =========================
     MOBILE OFFCANVAS SIDEBAR
     ========================= */

	@media (max-width: 760px) {
		.fleet-page {
			position: relative;
			height: 100%;
			min-height: 0;
			max-height: 100%;
			padding: 4px;
			overflow: hidden;
			font-size: 9px;
		}

		.fleet-layout {
			height: 100%;
			min-height: 0;
			max-height: 100%;
			display: block;
			gap: 0;
		}

		.fleet-sidebar {
			position: absolute;
			top: 0;
			left: var(--fleet-main-sidebar-offset);
			bottom: 0;
			width: 260px;
			max-width: calc(100% - 54px);
			height: auto;
			max-height: none;
			border-radius: 12px;
			z-index: 900;
			transform: translateX(calc(-100% - 16px));
			opacity: 0;
			pointer-events: none;
			transition:
				transform 0.22s ease,
				opacity 0.22s ease;
		}

		.fleet-sidebar.sidebar-open {
			transform: translateX(0);
			opacity: 1;
			pointer-events: auto;
		}

		.mobile-sidebar-backdrop {
			display: block;
			position: absolute;
			inset: 0;
			z-index: 850;
			border: none;
			background: rgba(15, 23, 42, 0.36);
			backdrop-filter: blur(2px);
			cursor: pointer;
		}

		.sidebar-toggle-btn {
			position: absolute;
			top: 50%;
			left: calc(var(--fleet-main-sidebar-offset) + 10px);
			z-index: 950;
			width: 38px;
			height: auto;
			min-height: 82px;
			flex-direction: column;
			gap: 6px;
			padding: 7px 4px;
			border-radius: 16px;
			border: 1px solid #bfdbfe;
			background: rgba(17, 24, 39, 0.94);
			color: #dbeafe;
			font-size: 0;
			font-weight: 900;
			box-shadow: 0 8px 18px rgba(15, 23, 42, 0.2);
			transform: translateY(-50%);
		}

		.sidebar-toggle-btn.sidebar-open-toggle {
			left: min(
				calc(var(--fleet-main-sidebar-offset) + 274px),
				calc(100vw - 50px)
			);
		}

		.sidebar-toggle-btn span {
			font-size: 10px;
		}

		.sidebar-toggle-btn span:first-of-type {
			width: 18px;
			height: 18px;
		}

		.sidebar-toggle-btn span:first-of-type::before {
			font-size: 12px;
		}

		.sidebar-toggle-btn span:last-of-type {
			writing-mode: vertical-rl;
			font-size: 8px;
			letter-spacing: 0.03em;
		}

		.sidebar-toggle-btn:hover {
			transform: translateY(-50%) translateX(1px);
		}

		.measure-toolbar {
			top: 44px;
			left: 8px;
			right: 8px;
			transform: none;
			width: auto;
		}

		.measure-total {
			flex: 1;
			min-width: 0;
			padding: 0 8px;
		}

		.measure-total span,
		.measure-total strong,
		.measure-unit-select,
		.measure-cancel-btn {
			font-size: 9px;
		}

		.measure-unit-select {
			min-width: 50px;
		}

		.measure-cancel-btn {
			padding: 0 8px;
		}

		:global(.measure-context-popup .leaflet-popup-content) {
			width: min(280px, calc(100vw - 42px)) !important;
		}

		:global(.measure-start-top) {
			grid-template-columns: 30px minmax(0, 1fr) 24px;
			gap: 7px;
			padding: 10px;
		}

		:global(.measure-icon) {
			width: 30px;
			height: 30px;
			border-radius: 8px;
			font-size: 12px;
		}

		:global(.measure-title-group strong) {
			font-size: 10.8px;
		}

		:global(.measure-title-group span) {
			font-size: 8.2px;
		}

		:global(.measure-start-close) {
			width: 24px;
			height: 24px;
			font-size: 13px;
		}

		:global(.measure-start-info) {
			gap: 7px;
			padding: 8px 10px 0;
		}

		:global(.measure-start-info div) {
			min-height: 42px;
			padding: 7px;
		}

		:global(.measure-start-btn) {
			width: calc(100% - 20px);
			height: 32px;
			margin: 9px 10px 10px;
			font-size: 9px;
		}

		.sidebar-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}

		.sidebar-close-btn {
			display: none !important;
			width: 23px;
			height: 23px;
			place-items: center;
			border: none;
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text-secondary);
			font-size: 15px;
			font-weight: 900;
			line-height: 1;
			cursor: pointer;
			flex-shrink: 0;
		}

		.sidebar-close-btn:hover {
			background: var(--color-danger-muted);
			color: #dc2626;
		}

		.fleet-map-panel {
			height: 100%;
			min-height: 0;
			max-height: 100%;
			padding: 0;
			border-radius: 12px;
		}

		.map-stage {
			height: 100%;
			min-height: 0;
			border-radius: 12px;
		}

		.map-legend {
			top: 8px;
			right: 8px;
			width: min(238px, calc(100% - 72px));
			max-height: min(52vh, 360px);
			padding: 7px;
			border-radius: 14px;
			overflow: hidden;
		}

		.map-legend.legend-collapsed {
			width: auto;
			min-width: 42px;
			padding: 5px;
		}

		.legend-header {
			gap: 7px;
		}

		.legend-title {
			font-size: 10px;
			line-height: 1.1;
		}

		.legend-subtitle {
			font-size: 8.5px;
			line-height: 1.1;
		}

		.legend-toggle-btn {
			width: 28px;
			height: 28px;
			min-width: 28px;
		}

		.legend-body {
			max-height: calc(min(52vh, 360px) - 42px);
			gap: 7px;
			overflow-y: auto;
			padding-right: 2px;
		}

		.legend-section {
			gap: 7px;
			padding: 0;
		}

		.legend-section + .legend-section {
			padding-top: 7px;
		}

		.legend-item {
			gap: 7px;
			font-size: 9px;
			line-height: 1.15;
		}

		.legend-vessel-marker {
			width: 16px;
			height: 28px;
		}

		.legend-vessel-marker::before {
			width: 16px;
			height: 28px;
		}

		.legend-vessel-marker.selected {
			width: 18px;
			height: 31px;
		}

		.legend-vessel-marker.selected::before {
			width: 18px;
			height: 31px;
		}

		.asset-boundary-legend {
			width: 20px;
			height: 20px;
		}

		.legend-asset-icons {
			gap: 5px;
		}

		.legend-asset-item {
			min-height: 25px;
			padding: 4px 7px;
			gap: 5px;
			font-size: 8px;
		}

		.legend-asset-item img {
			width: 15px;
			height: 15px;
		}

		.legend-actions {
			gap: 5px;
			flex-wrap: wrap;
		}

		.legend-actions .wind-toggle-btn,
		.legend-actions .current-toggle-btn,
		.legend-actions .asset-toggle-btn {
			min-height: 26px;
			padding: 0 8px;
			font-size: 9px;
		}

		:global(.fleet-leaflet-popup .leaflet-popup-content) {
			width: min(238px, calc(100vw - 54px)) !important;
		}

		:global(.asset-leaflet-popup .leaflet-popup-content) {
			width: min(230px, calc(100vw - 54px)) !important;
		}

		:global(.fleet-leaflet-popup .leaflet-popup-close-button),
		:global(.asset-leaflet-popup .leaflet-popup-close-button) {
			top: 7px !important;
			right: 7px !important;
			width: 23px !important;
			height: 23px !important;
			font-size: 15px !important;
			line-height: 20px !important;
		}

		:global(.fleet-popup-hero) {
			gap: 8px;
			padding: 9px 34px 8px 9px;
		}

		:global(.fleet-popup-heading > strong) {
			font-size: 12px;
			line-height: 1.12;
			-webkit-line-clamp: 2;
		}

		:global(.fleet-popup-heading > small),
		:global(.fleet-popup-eyebrow) {
			font-size: 7.5px;
		}

		:global(.fleet-popup-status) {
			padding: 3px 6px;
			font-size: 7.2px;
		}

		:global(.fleet-popup-metrics) {
			gap: 5px;
			padding: 7px 9px 5px;
		}

		:global(.fleet-popup-metric) {
			padding: 7px;
			border-radius: 10px;
		}

		:global(.fleet-popup-metric > span) {
			font-size: 7px;
		}

		:global(.fleet-popup-metric > strong) {
			font-size: 14px;
		}

		:global(.fleet-popup-coordinates) {
			gap: 5px;
			padding-inline: 9px;
		}

		:global(.fleet-popup-coordinates > div) {
			padding: 7px;
			border-radius: 9px;
		}

		:global(.fleet-popup-coordinates span),
		:global(.fleet-popup-meta .fleet-popup-row span) {
			font-size: 7px;
		}

		:global(.fleet-popup-coordinates strong),
		:global(.fleet-popup-meta .fleet-popup-row strong) {
			font-size: 8px;
		}

		:global(.fleet-popup-meta) {
			padding-inline: 9px;
		}

		:global(.fleet-popup-meta .fleet-popup-row) {
			padding: 6px 0;
		}

		:global(.fleet-popup-actions) {
			gap: 7px;
			padding: 9px;
		}

		:global(.fleet-popup-actions .fleet-popup-detail-btn),
		:global(.fleet-popup-actions .fleet-popup-dashboard-btn) {
			min-height: 32px;
			padding: 0 9px;
			border-radius: 10px;
			font-size: 9px;
		}

		:global(.fleet-asset-popup-hero) {
			gap: 7px;
			padding: 8px 32px 8px 8px;
		}

		:global(.fleet-asset-popup-icon) {
			width: 32px;
			height: 32px;
			border-radius: 10px;
		}

		:global(.fleet-asset-popup-icon img) {
			width: 20px;
			height: 20px;
		}

		:global(.fleet-asset-popup-heading > strong) {
			font-size: 11px;
		}

		:global(.fleet-asset-popup-eyebrow),
		:global(.fleet-asset-popup-badge) {
			font-size: 7px;
		}

		:global(.fleet-asset-popup-coordinates) {
			gap: 5px;
			padding: 8px;
		}

		:global(.fleet-asset-popup-coordinates > div) {
			min-height: 44px;
			padding: 7px;
			border-radius: 9px;
		}

		:global(.fleet-asset-popup-coordinates span) {
			font-size: 7px;
		}

		:global(.fleet-asset-popup-coordinates strong) {
			font-size: 8px;
		}

		.vessel-detail-panel {
			left: 10px;
			right: 10px;
			top: auto;
			bottom: 10px;
			width: auto;
			max-width: none;
			max-height: min(62dvh, 520px);
			border-radius: 15px;
		}

		.detail-panel-header {
			padding: 10px;
		}

		.detail-title-wrap {
			gap: 7px;
		}

		.detail-title-group h2 {
			font-size: 14px;
			line-height: 1.12;
		}

		.detail-title-group p {
			font-size: 9px;
		}

		.detail-eyebrow {
			font-size: 7.5px;
		}

		.detail-status-dot {
			width: 10px;
			height: 10px;
		}

		.detail-status-pill {
			display: none;
		}

		.detail-dashboard-btn span:first-child {
			display: none;
		}

		.detail-dashboard-btn {
			width: 28px;
			height: 28px;
			min-height: 28px;
			justify-content: center;
			padding: 0;
		}

		.detail-dashboard-cta {
			min-height: 30px;
			margin-top: 7px;
			font-size: 9px;
		}

		.detail-panel-body {
			padding: 8px;
		}

		.detail-section {
			padding: 9px;
			border-radius: 12px;
		}

		.detail-section-heading {
			gap: 8px;
			margin-bottom: 8px;
		}

		.detail-section-heading h3 {
			font-size: 10.5px;
		}

		.detail-section-kicker {
			font-size: 8px;
		}

		.detail-hero-metrics {
			gap: 6px;
		}

		.detail-hero-metric {
			padding: 8px;
			border-radius: 11px;
		}

		.detail-hero-metric strong {
			font-size: 16px;
		}

		.detail-hero-metric span,
		.detail-hero-metric small {
			font-size: 8px;
		}

		.detail-grid {
			gap: 6px;
		}

		.detail-grid.two-col {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.detail-item {
			min-height: 48px;
			padding: 8px;
			border-radius: 10px;
		}

		.detail-item span {
			font-size: 8px;
		}

		.detail-item strong {
			font-size: 8px;
		}

		.simple-row {
			font-size: 8px;
			grid-template-columns: 1fr 48px;
		}

		.weather-current {
			grid-template-columns: 20px 1fr;
		}

		.weather-meta {
			grid-column: 1 / -1;
			text-align: left;
		}
	}
</style>
