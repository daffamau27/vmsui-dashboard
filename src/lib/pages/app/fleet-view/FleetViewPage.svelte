<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getFleetVessels, getFleetVesselLiveDetail, getFleetAssets } from '$lib/api/fleetApi.js';
	import { setSelectedVessel } from '$lib/stores/selectedVessel.svelte.js';
	import { activeMenu, setActiveMenu } from '$lib/stores/appNavigation.svelte.js';
	import { addMapTileLayer } from '$lib/utils/mapStyle.js';
	import { addLeafletZoomAndScale } from '$lib/utils/leafletControls.js';
	import FleetViewSidebar from './FleetViewSidebar.svelte';
	import FleetViewDetailPanel from './FleetViewDetailPanel.svelte';
	import FleetViewMapLegend from './FleetViewMapLegend.svelte';
	import './fleet-view-page.css';
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
	import {
		formatDmsCoordinate,
		formatNumber,
		formatValue,
		normalizeHireStatus
	} from './fleetViewFormat.js';
	import { createFleetPopupHtml } from './fleetViewPopup.js';
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
	let totalMeasureMeters = $derived(getTotalMeasureDistance(measurePoints));

	function getCurrentWeather(vessel) {
		return vessel?.weather?.current || null;
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
			marker?.setPopupContent?.(createFleetPopupHtml(detail));
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

			marker.bindPopup(createFleetPopupHtml(vessel), {
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
		marker.setPopupContent(createFleetPopupHtml(vessel));
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
			return snapshots;
		} catch (error) {
			console.error('[FLEET_DETAIL_CCTV_ERROR]', error);
			detailCctvSnapshots = [];
			detailCctvError = error?.message || 'Failed to load CCTV snapshots.';
			detailCctvLoadedVesselId = String(vesselId);
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
			return;
		}

		if (String(detailCctvLoadedVesselId) === String(selectedVesselId) || detailCctvLoading) return;

		loadDetailCctvSnapshots(selectedVesselId);
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
		<FleetViewSidebar
			bind:search
			bind:statusFilter
			vessels={filteredVessels}
			loading={fleetLoading}
			selectedId={selectedVesselId}
			{onlineCount}
			{offlineCount}
			totalCount={vesselData.length}
			open={isSidebarOpen}
			onSelect={selectVessel}
			onCloseMobile={closeMobileSidebar}
			bind:listElement={vesselListContainer}
		/>

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
							{#each measureUnits as unit (unit.value)}
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
							<FleetViewDetailPanel
								vessel={selectedVessel}
								cctvSnapshots={detailCctvSnapshots}
								cctvLoading={detailCctvLoading}
								cctvError={detailCctvError}
								onClose={closeVesselDetail}
								onDashboard={() => openVesselDashboard(selectedVessel)}
							/>
						</aside>
					{/key}
				{/if}

				<FleetViewMapLegend
					bind:element={mapLegendElement}
					bind:open={isMapLegendOpen}
					{assetLegendItems}
					{zoneData}
					isAssetVisible={isAssetTypeVisible}
					onToggleAssetType={toggleAssetType}
					bind:showWind={showWindParticles}
					bind:showCurrent={showCurrentParticles}
				/>
			</div>
		</section>
	</div>
</section>
