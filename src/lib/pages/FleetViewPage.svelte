<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getFleetVessels, getFleetVesselLiveDetail, getFleetAssets } from '$lib/api/fleetApi.js';
	import { setSelectedVessel } from '$lib/stores/selectedVessel.svelte.js';
	import { setActiveMenu } from '$lib/stores/appNavigation.svelte.js';

	const vesselMarkerUrl = '/assets/vessel-marker.svg';

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
	let assetMarkers = new Map();

	let ignoreNextPopupCloseForVesselId = null;

	let isMobileSidebarOpen = $state(false);

	let mapContainer;
	let map = null;
	let L = null;
	let markers = new Map();
	let isFleetMounted = false;

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
			type: asset.type ?? 'Asset',
			lat: asset.latitude ?? asset.lat,
			lng: asset.longitude ?? asset.lng
		};
	}

	let onlineCount = $derived(vesselData.filter((v) => v.online).length);
	let offlineCount = $derived(vesselData.filter((v) => !v.online).length);

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

	function parseVesselDateTime(value) {
		if (!value || value === '-') return null;

		const text = String(value).trim();

		// Format contoh: "03/06/2026 16:34:00 (UTC+07:00)"
		const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);

		if (match) {
			const [, dd, mm, yyyy, hh, min, ss] = match;

			// Dibuat sebagai local time browser
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

	function openMobileSidebar() {
		isMobileSidebarOpen = true;

		if (browser) {
			window.dispatchEvent(
				new CustomEvent('mobile-panel-open', {
					detail: 'vessel-list'
				})
			);
		}
	}

	function closeMobileSidebar() {
		isMobileSidebarOpen = false;
	}

	function handleMobilePanelOpen(event) {
		if (event.detail !== 'vessel-list') {
			isMobileSidebarOpen = false;
		}
	}

	function createPopupHtml(vessel) {
		return `
      <div class="fleet-popup">
        <div class="fleet-popup-title ${vessel.online ? '' : 'is-offline'}">
          ${formatValue(vessel.name)}
        </div>

        <div class="fleet-popup-row">
          <span>Company</span>
          <strong>${formatValue(vessel.companyName)}</strong>
        </div>

        <div class="fleet-popup-row">
          <span>Status</span>
          <strong>${vessel.online ? 'Online' : 'Offline'}</strong>
        </div>

        <div class="fleet-popup-row">
          <span>Hire</span>
          <strong>${formatValue(vessel.hireStatus)}</strong>
        </div>

        <div class="fleet-popup-row">
          <span>Speed</span>
          <strong>${formatNumber(vessel.speed, 1, '0.0')} kt</strong>
        </div>

        <div class="fleet-popup-row">
          <span>Heading</span>
          <strong>${formatNumber(vessel.heading, 1, '0.0')}°</strong>
        </div>

        <div class="fleet-popup-row">
          <span>Updated</span>
          <strong>${formatLastUpdated(vessel.lastUpdated)}</strong>
        </div>

        <div class="fleet-popup-actions">
        <button
            type="button"
            class="fleet-popup-detail-btn"
            data-action="detail"
            data-vessel-id="${vessel.id}"
        >
            View Detail
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
		return `
    <div class="asset-popup">
      <div class="asset-popup-title">
        ${formatValue(asset.name)}
      </div>

      <div class="asset-popup-row">
        <span>Type</span>
        <strong>${formatValue(asset.type)}</strong>
      </div>

      <div class="asset-popup-row">
        <span>Asset ID</span>
        <strong>${formatValue(asset.assetId)}</strong>
      </div>

      <div class="asset-popup-row">
        <span>Latitude</span>
        <strong>${formatNumber(asset.latitude, 6)}</strong>
      </div>

      <div class="asset-popup-row">
        <span>Longitude</span>
        <strong>${formatNumber(asset.longitude, 6)}</strong>
      </div>
    </div>
  `;
	}

	function createVesselIcon(vessel) {
		const isSelected = String(selectedVesselId) === String(vessel.id);

		return L.divIcon({
			className: `vessel-leaflet-icon ${vessel.online ? 'online' : 'offline'} ${isSelected ? 'selected' : ''}`,
			html: `
        <div class="vessel-marker-shell">
          <img
            src="${vesselMarkerUrl}"
            alt="${formatValue(vessel.name)}"
            style="transform: rotate(${Number(vessel.heading || 0)}deg);"
          />
        </div>
      `,
			iconSize: isSelected ? [31, 31] : [25, 25],
			iconAnchor: isSelected ? [15.5, 15.5] : [12.5, 12.5],
			popupAnchor: [0, -14]
		});
	}

	function createAssetIcon(asset) {
		return L.divIcon({
			className: 'asset-leaflet-icon',
			html: `
        <div class="asset-marker-shell">
            <div class="asset-marker-core">●</div>
        </div>
        `,
			iconSize: [24, 24],
			iconAnchor: [12, 12],
			popupAnchor: [0, -10]
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
				maxWidth: 320,
				className: 'fleet-leaflet-popup'
			});

			marker.on('click', () => {
				const isDifferentVessel = String(selectedVesselId) !== vesselId;

				selectedVesselId = vesselId;
				selectedVesselDetail = null;

				if (isDifferentVessel) {
					showDetailPanel = false;
				}

				refreshMarkerSelection();
			});

			marker.on('popupopen', () => {
				const popupElement = marker.getPopup()?.getElement();
				if (!popupElement) return;

				const detailButton = popupElement.querySelector('[data-action="detail"]');
				const dashboardButton = popupElement.querySelector('[data-action="dashboard"]');

				if (detailButton) {
					detailButton.onclick = async (event) => {
						event.preventDefault();
						event.stopPropagation();

						ignoreNextPopupCloseForVesselId = vesselId;

						await openVesselDetail(vesselId);

						marker.closePopup();
					};
				}

				if (dashboardButton) {
					dashboardButton.onclick = async (event) => {
						event.preventDefault();
						event.stopPropagation();

						ignoreNextPopupCloseForVesselId = vesselId;

						await openVesselDashboard(vessel);

						marker.closePopup();
					};
				}
			});

			marker.on('popupclose', () => {
				if (String(ignoreNextPopupCloseForVesselId) === vesselId) {
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

		if (!map.getPane('assetPane')) {
			map.createPane('assetPane');
			map.getPane('assetPane').style.zIndex = '450';
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

		if (!showAssets) return;

		assetData.forEach((asset) => {
			const lat = Number(asset.lat ?? asset.latitude);
			const lng = Number(asset.lng ?? asset.longitude);

			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
			if (lat === 0 && lng === 0) return;

			const assetId = String(asset.id);

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
		});
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

	async function selectVessel(id) {
		const normalizedId = String(id);

		selectedVesselId = normalizedId;
		selectedVesselDetail = null;
		showDetailPanel = true;
		isMobileSidebarOpen = false;

		refreshMarkerSelection();

		await loadVesselDetail(normalizedId);

		focusVessel(normalizedId, 7, false);
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

	async function loadFleetVessels() {
		fleetLoading = true;
		fleetError = '';

		try {
			const vessels = await getFleetVessels({
				search,
				status: statusFilter === 'all' ? '' : statusFilter
			});

			const normalizedVessels = Array.isArray(vessels) ? vessels.map(normalizeFleetVessel) : [];

			console.log('[FLEET_VIEW][VESSELS_FROM_FLEET_ENDPOINT]', normalizedVessels);

			vesselData = normalizedVessels;

			if (!selectedVesselId && vesselData.length > 0) {
				selectedVesselId = String(vesselData[0].id);
				selectedVesselDetail = vesselData[0];
			}

			if (map && L) {
				buildMarkers();
			}
		} catch (error) {
			console.error('[FLEET_VIEW_LOAD_ERROR]', error);

			fleetError = error?.message || 'Gagal memuat data fleet.';
			vesselData = [];
		} finally {
			fleetLoading = false;
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

			assetError = error?.message || 'Gagal memuat data asset.';
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

	async function loadLiveDetailsForAllVessels(vessels = []) {
		if (!Array.isArray(vessels) || !vessels.length) return vessels;

		const results = await Promise.all(
			vessels.map(async (vessel) => {
				try {
					const liveDetail = await getFleetVesselLiveDetail(vessel.vesselId || vessel.id);

					return mergeVesselWithLiveDetail(vessel, liveDetail);
				} catch (error) {
					console.error('[FLEET_VIEW][LIVE_DETAIL_PRELOAD_ERROR]', vessel, error);
					return vessel;
				}
			})
		);

		return results;
	}

	onMount(async () => {
		if (!browser) return;

		isFleetMounted = true;

		window.addEventListener('mobile-panel-open', handleMobilePanelOpen);

		const container = await waitForMapContainer();

		if (!isFleetMounted) return;

		if (!container) {
			console.warn('[FLEET_MAP] mapContainer still not ready after retry');
			return;
		}

		L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		if (!isFleetMounted || !container) return;

		map = L.map(container, {
			zoomControl: false,
			attributionControl: false
		}).setView([-2.8, 114.5], 5);

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);

		setupMapPanes();

		await loadFleetVessels();
		await loadFleetAssets();

		map.on('contextmenu', handleMapRightClick);
		map.on('click', handleMapMeasureClick);

		setTimeout(() => {
			if (!map) return;

			map.invalidateSize();

			if (selectedVesselId) {
				focusVessel(selectedVesselId, 6, true);
			}
		}, 250);
	});

	onDestroy(() => {
		isFleetMounted = false;

		if (browser) {
			window.removeEventListener('mobile-panel-open', handleMobilePanelOpen);
		}

		cancelMeasure();

		if (map) {
			map.off('contextmenu', handleMapRightClick);
			map.off('click', handleMapMeasureClick);
			map.remove();
			map = null;
		}

		markers.clear();
		assetMarkers.forEach((marker) => marker.remove());
		assetMarkers.clear();
	});

	$effect(() => {
		if (!map) return;

		setTimeout(() => {
			if (!map) return;
			map.invalidateSize();
		}, 100);
	});

	$effect(() => {
		showAssets;
		assetData;

		if (!map || !L) return;

		buildAssetMarkers();
	});
</script>

<section class="fleet-page">
	<button type="button" class="mobile-vessel-toggle" onclick={openMobileSidebar}>
		☰ Vessels
	</button>

	{#if isMobileSidebarOpen}
		<button
			type="button"
			class="mobile-sidebar-backdrop"
			aria-label="Close vessel sidebar"
			onclick={closeMobileSidebar}
		></button>
	{/if}

	<div class="fleet-layout">
		<aside class:sidebar-open={isMobileSidebarOpen} class="fleet-sidebar">
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
						Tot: {vesselData.length}
					</button>
				</div>

				<div class="search-box">
					<input type="text" placeholder="Search vessel..." bind:value={search} />
				</div>
			</div>

			<div class="vessel-list">
				{#each filteredVessels as vessel}
					<article
						class:selected-card={selectedVesselId === vessel.id}
						class:offline-card={!vessel.online}
						class="vessel-card"
					>
						<button type="button" class="vessel-select" onclick={() => selectVessel(vessel.id)}>
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
											{vessel.online ? 'Online' : 'Offline'} · Last Updated:
											{formatLastUpdated(vessel.lastUpdated)}
										</p>
									</div>
								</div>

								<div class="location-button" title="Focus vessel on map">⌖</div>
							</div>

							<div class="vessel-metric-row">
								<div class="mini-metric">
									<span>Speed</span>
									<strong>{vessel.speed}</strong>
								</div>

								<div class="mini-metric">
									<span>Heading</span>
									<strong>{vessel.heading}°</strong>
								</div>
							</div>
						</button>
					</article>
				{/each}
			</div>
		</aside>

		<section class="fleet-map-panel">
			<div class="map-stage">
				{#if fleetLoading}
					<div class="fleet-api-status">Loading fleet data...</div>
				{/if}

				{#if fleetError}
					<div class="fleet-api-error">
						{fleetError}
					</div>
				{/if}
				{#if assetLoading}
					<div class="asset-api-status">Loading assets...</div>
				{/if}

				{#if assetError}
					<div class="asset-api-error">
						{assetError}
					</div>
				{/if}
				<div class="leaflet-map" bind:this={mapContainer}></div>

				{#if !fleetLoading && !fleetError && vesselData.length && !vesselsWithCoordinate.length}
					<div class="fleet-api-status">
						Vessel berhasil dimuat, tetapi koordinat belum tersedia dari API.
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
					<aside class="vessel-detail-panel">
						<div class="detail-panel-header">
							<div>
								<h2>{selectedVessel.name}</h2>
								<p>Vessel detail information</p>
							</div>

							<button type="button" class="detail-close-btn" onclick={closeVesselDetail}>
								×
							</button>
						</div>

						<div class="detail-panel-body">
							<section class="detail-section">
								<div class="detail-grid two-col">
									<div class="detail-item">
										<span>Last Updated</span>
										<strong>{formatLastUpdated(selectedVessel.lastUpdated)}</strong>
									</div>

									<div class="detail-item">
										<span>Vessel Status</span>
										<strong
											class:online-text={selectedVessel.online}
											class:offline-text={!selectedVessel.online}
										>
											{formatOnlineStatus(selectedVessel.online)}
										</strong>
									</div>

									<div class="detail-item">
										<span>Hire Status</span>
										<strong>{selectedVessel.hireStatus}</strong>
									</div>

									<div class="detail-item">
										<span>Last Connect</span>
										<strong>{selectedVessel.lastConnectTime}</strong>
									</div>

									<div class="detail-item">
										<span>Last Disconnect</span>
										<strong>{selectedVessel.lastDisconnectTime}</strong>
									</div>

									<div class="detail-item">
										<span>Latitude</span>
										<strong>{formatMissingValue(selectedVessel.latitude)}</strong>
									</div>

									<div class="detail-item">
										<span>Longitude</span>
										<strong>{formatMissingValue(selectedVessel.longitude)}</strong>
									</div>

									<div class="detail-item">
										<span>Heading</span>
										<strong>{formatMissingValue(selectedVessel.heading, '°')}</strong>
									</div>

									<div class="detail-item">
										<span>Speed</span>
										<strong>{formatMissingValue(selectedVessel.speed)}</strong>
									</div>
								</div>
							</section>

              <section class="detail-section compact-voyage-section">
                <h3>Voyage Progress</h3>

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
								<h3>Engines</h3>

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
										<div class="empty-voyage">Engine list belum tersedia.</div>
									{/if}
								</div>
							</section>

							<section class="detail-section">
								<h3>Weather</h3>

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
									<div class="empty-voyage">Weather belum tersedia.</div>
								{/if}
							</section>

							<section class="detail-section">
								<h3>Ocean Current</h3>

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
									<div class="empty-voyage">Ocean current belum tersedia.</div>
								{/if}
							</section>
						</div>
					</aside>
				{/if}

				<div class="map-legend">
					<span class="legend-title">Legend</span>

					<div class="legend-item">
						<span class="legend-dot online"></span>
						Online
					</div>

					<div class="legend-item">
						<span class="legend-dot offline"></span>
						Offline
					</div>

					<button
						type="button"
						class:active-asset-toggle={showAssets}
						class="asset-toggle-btn"
						onclick={() => (showAssets = !showAssets)}
					>
						<span class="asset-legend-dot"></span>
						Assets: {showAssets ? 'On' : 'Off'}
					</button>
				</div>
			</div>
		</section>
	</div>
</section>

<style>
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
		position: relative;
		height: 100%;
		min-height: 0;
		max-height: 100%;
		background: #f4f6f8;
		padding: 5px;
		color: #0f172a;
		overflow: hidden;
		font-size: 9.5px;
		box-sizing: border-box;
	}

	.fleet-layout {
		height: 100%;
		min-height: 0;
		max-height: 100%;
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		gap: 5px;
	}

	.fleet-sidebar,
	.fleet-map-panel {
		height: 100%;
		min-height: 0;
		max-height: 100%;
		background: #ffffff;
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
		background: #ffffff;
		color: #1d4ed8;
		border: 1px solid #bfdbfe;
	}

	.fleet-api-error {
		background: #fef2f2;
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

	:global(.asset-marker-shell) {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: rgba(255, 255, 255, 0.96);
		border: 2px solid #f59e0b;
		box-shadow:
			0 0 0 4px rgba(245, 158, 11, 0.16),
			0 5px 10px rgba(15, 23, 42, 0.16);
	}

	:global(.asset-marker-core) {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: #f59e0b;
		color: transparent;
	}

	/* =========================
   ASSET / POI POPUP
   ========================= */

	:global(.asset-leaflet-popup) {
		margin-bottom: 9px;
	}

	:global(.asset-leaflet-popup .leaflet-popup-content-wrapper) {
		background: #ffffff;
		color: #0f172a;
		border-radius: 10px;
		border: 1px solid #fed7aa;
		box-shadow:
			0 9px 20px rgba(15, 23, 42, 0.14),
			0 1px 4px rgba(15, 23, 42, 0.08);
		overflow: hidden;
	}

	:global(.asset-leaflet-popup .leaflet-popup-content) {
		margin: 0;
		width: 205px !important;
	}

	:global(.asset-leaflet-popup .leaflet-popup-tip) {
		background: #ffffff;
		border: 1px solid #fed7aa;
		box-shadow: 0 7px 16px rgba(15, 23, 42, 0.12);
	}

	:global(.asset-popup) {
		overflow: hidden;
		background: #ffffff;
	}

	:global(.asset-popup-title) {
		padding: 8px 10px 7px;
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(245, 158, 11, 0)), #fffbeb;
		color: #92400e;
		font-size: 11.5px;
		font-weight: 900;
		line-height: 1.1;
		border-bottom: 1px solid #fed7aa;
	}

	:global(.asset-popup-row) {
		display: grid;
		grid-template-columns: 58px 1fr;
		gap: 5px;
		align-items: start;
		padding: 5px 9px;
		border-bottom: 1px solid #fef3c7;
	}

	:global(.asset-popup-row:last-child) {
		border-bottom: none;
	}

	:global(.asset-popup-row span) {
		color: #92400e;
		font-size: 8px;
		font-weight: 800;
	}

	:global(.asset-popup-row strong) {
		color: #0f172a;
		font-size: 8.8px;
		line-height: 1.25;
		font-weight: 900;
		text-align: right;
	}

	.asset-legend-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
		flex-shrink: 0;
	}

	.asset-toggle-btn {
		height: 21px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0 7px;
		border: 1px solid #fed7aa;
		border-radius: 999px;
		background: #ffffff;
		color: #92400e;
		font-size: 8px;
		line-height: 1;
		font-weight: 900;
		cursor: pointer;
	}

	.asset-toggle-btn.active-asset-toggle {
		background: #fffbeb;
		border-color: #f59e0b;
	}

	.asset-toggle-btn:hover {
		background: #fffbeb;
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
		background: #fffbeb;
		color: #92400e;
		border: 1px solid #fed7aa;
	}

	.asset-api-error {
		background: #fef2f2;
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
		background: #ffffff;
		color: #0f172a;
		border-radius: 12px;
		border: 1px solid #dbe4ef;
		box-shadow:
			0 16px 36px rgba(15, 23, 42, 0.2),
			0 3px 10px rgba(15, 23, 42, 0.1);
		overflow: hidden;
	}

	:global(.measure-context-popup .leaflet-popup-content) {
		margin: 0;
		width: 220px !important;
	}

	:global(.measure-context-popup .leaflet-popup-tip) {
		background: #ffffff;
		border: 1px solid #dbe4ef;
		box-shadow: 0 7px 16px rgba(15, 23, 42, 0.12);
	}

	:global(.measure-start-popup) {
		padding: 0;
		background: #ffffff;
	}

	:global(.measure-start-top) {
		display: grid;
		grid-template-columns: 28px 1fr 22px;
		gap: 8px;
		align-items: start;
		padding: 10px;
		background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(37, 99, 235, 0)), #f8fafc;
		border-bottom: 1px solid #e2e8f0;
	}

	:global(.measure-icon) {
		width: 28px;
		height: 28px;
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
		color: #0f172a;
		font-size: 11.3px;
		line-height: 1.1;
		font-weight: 900;
	}

	:global(.measure-title-group span) {
		display: block;
		margin-top: 3px;
		color: #64748b;
		font-size: 8.5px;
		line-height: 1.2;
		font-weight: 700;
	}

	:global(.measure-start-close) {
		width: 22px;
		height: 22px;
		border: none;
		border-radius: 7px;
		background: #eef2f7;
		color: #64748b;
		font-size: 14px;
		font-weight: 900;
		line-height: 1;
		cursor: pointer;
	}

	:global(.measure-start-close:hover) {
		background: #fee2e2;
		color: #dc2626;
	}

	:global(.measure-start-info) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
		padding: 8px 10px 0;
	}

	:global(.measure-start-info div) {
		min-height: 38px;
		padding: 6px;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		background: #f8fafc;
	}

	:global(.measure-start-info span) {
		display: block;
		color: #64748b;
		font-size: 7.6px;
		line-height: 1;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	:global(.measure-start-info strong) {
		display: block;
		margin-top: 5px;
		color: #0f172a;
		font-size: 9px;
		line-height: 1.1;
		font-weight: 900;
	}

	:global(.measure-start-btn) {
		width: calc(100% - 20px);
		height: 29px;
		margin: 8px 10px 10px;
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
		background: #111827;
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
		background: rgba(255, 255, 255, 0.88);
		color: #111827;
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

	.mobile-vessel-toggle,
	.mobile-sidebar-backdrop,
	.sidebar-close-btn {
		display: none;
	}

	/* =========================
     SIDEBAR - NORMAL SIZE
     ========================= */

	.fleet-sidebar {
		display: flex;
		flex-direction: column;
	}

	.sidebar-fixed {
		flex: 0 0 auto;
		background: #ffffff;
		border-bottom: 1px solid #eef2f7;
		z-index: 2;
	}

	.sidebar-header {
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
		background: #eff6ff;
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
		color: #64748b;
		font-size: 9px;
		line-height: 1.15;
		font-weight: 700;
	}

	.fleet-stats {
		display: flex;
		gap: 5px;
		padding: 0 10px 6px;
		flex-wrap: wrap;
	}

	.stat-chip {
		height: 23px;
		padding: 0 7px;
		border-radius: 999px;
		border: 1px solid #dbe4ef;
		background: #ffffff;
		color: #334155;
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
		background: #eff6ff;
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
		color: #0f172a;
		background: #f8fafc;
		outline: none;
	}

	.search-box input:focus {
		border-color: #60a5fa;
		background: #ffffff;
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
		background: #f1f5f9;
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
		min-height: 0;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		background: #ffffff;
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
		background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.08);
	}

	.vessel-card.offline-card {
		background: #fbfcfe;
	}

	.vessel-select {
		width: 100%;
		border: none;
		background: transparent;
		padding: 7px;
		text-align: left;
		cursor: pointer;
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
		color: #0f172a;
		font-size: 11.5px;
		line-height: 1.1;
		font-weight: 900;
		letter-spacing: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vessel-name-block p {
		margin: 3px 0 0;
		color: #64748b;
		font-size: 8.8px;
		line-height: 1.15;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.location-button {
		width: 23px;
		height: 23px;
		border-radius: 8px;
		background: #eff6ff;
		color: #1d4ed8;
		display: grid;
		place-items: center;
		font-size: 10px;
		font-weight: 900;
		flex-shrink: 0;
	}

	.vessel-card.selected-card .location-button {
		background: #2563eb;
		color: #ffffff;
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
		background: #f8fafc;
	}

	.vessel-card.selected-card .mini-metric {
		background: #ffffff;
		border-color: #bfdbfe;
	}

	.mini-metric span {
		display: block;
		color: #64748b;
		font-size: 7.8px;
		line-height: 1.1;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.mini-metric strong {
		display: block;
		margin-top: 3px;
		color: #0f172a;
		font-size: 10px;
		line-height: 1.05;
		font-weight: 900;
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
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		padding: 5px;
	}

	.map-stage {
		position: relative;
		flex: 1 1 auto;
		height: 100%;
		min-height: 0;
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid #dbe4ef;
		background: #dceef8;
	}

	.leaflet-map {
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	.map-legend {
		position: absolute;
		left: 8px;
		bottom: 8px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 7px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.96);
		border: 1px solid #dbe4ef;
		box-shadow: 0 4px 10px rgba(15, 23, 42, 0.07);
		z-index: 700;
	}

	.legend-title,
	.legend-item {
		font-size: 8px;
		line-height: 1;
	}

	.legend-title {
		font-weight: 900;
		color: #1d4ed8;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-weight: 700;
		color: #334155;
	}

	/* =========================
     LEAFLET MARKER - COMPACT
     ========================= */

	:global(.vessel-leaflet-icon) {
		background: transparent;
		border: none;
	}

	:global(.vessel-marker-shell) {
		width: 23px;
		height: 23px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: rgba(255, 255, 255, 0.95);
		box-shadow:
			0 0 0 4px rgba(34, 197, 94, 0.12),
			0 5px 10px rgba(15, 23, 42, 0.14);
	}

	:global(.vessel-marker-shell img) {
		width: 16px;
		height: 16px;
		object-fit: contain;
		display: block;
		transform-origin: center center;
		filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.24));
	}

	:global(.vessel-leaflet-icon.selected .vessel-marker-shell) {
		width: 29px;
		height: 29px;
		background: #eff6ff;
		border: 2px solid #2563eb;
		box-shadow:
			0 0 0 5px rgba(37, 99, 235, 0.22),
			0 0 0 10px rgba(37, 99, 235, 0.09),
			0 10px 20px rgba(15, 23, 42, 0.22);
		transform: scale(1.04);
	}

	:global(.vessel-leaflet-icon.selected .vessel-marker-shell img) {
		width: 19px;
		height: 19px;
	}

	:global(.vessel-leaflet-icon.offline .vessel-marker-shell) {
		box-shadow:
			0 0 0 4px rgba(148, 163, 184, 0.14),
			0 5px 10px rgba(15, 23, 42, 0.14);
		opacity: 0.85;
		filter: grayscale(0.85);
	}

	:global(.vessel-leaflet-icon.offline.selected .vessel-marker-shell) {
		background: #f8fafc;
		border: 2px solid #64748b;
		box-shadow:
			0 0 0 5px rgba(100, 116, 139, 0.2),
			0 0 0 10px rgba(100, 116, 139, 0.08),
			0 10px 20px rgba(15, 23, 42, 0.18);
		filter: grayscale(0.35);
	}

	/* =========================
     LEAFLET POPUP - COMPACT
     ========================= */

	:global(.fleet-leaflet-popup) {
		margin-bottom: 9px;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-content-wrapper) {
		background: #ffffff;
		color: #0f172a;
		border-radius: 10px;
		border: 1px solid #dbe4ef;
		box-shadow:
			0 9px 20px rgba(15, 23, 42, 0.14),
			0 1px 4px rgba(15, 23, 42, 0.08);
		overflow: hidden;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-content) {
		margin: 0;
		width: 208px !important;
	}

	:global(.fleet-leaflet-popup .leaflet-popup-tip) {
		background: #ffffff;
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
		color: #334155 !important;
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
		background: #ffffff;
	}

	:global(.fleet-popup-title) {
		position: relative;
		padding: 8px 30px 7px 9px;
		background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(37, 99, 235, 0)), #f8fafc;
		color: #0f172a;
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
		color: #64748b;
		font-size: 8px;
		font-weight: 800;
	}

	:global(.fleet-popup-row strong) {
		color: #0f172a;
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
		background: #f8fafc;
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
		background: rgba(255, 255, 255, 0.98);
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
		background: #ffffff;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 7px;
	}

	.detail-panel-header h2 {
		margin: 0;
		color: #334155;
		font-size: 11.3px;
		line-height: 1.1;
		font-weight: 900;
	}

	.detail-panel-header p {
		margin: 2px 0 0;
		color: #64748b;
		font-size: 8px;
		font-weight: 700;
	}

	.detail-close-btn {
		width: 20px;
		height: 20px;
		border: none;
		border-radius: 6px;
		background: #f1f5f9;
		color: #64748b;
		font-size: 13px;
		font-weight: 800;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
	}

	.detail-close-btn:hover {
		background: #fee2e2;
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
		color: #64748b;
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
		color: #334155;
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
		background: #ffffff;
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
		color: #64748b;
	}

	.voyage-progress-head strong,
	.voyage-progress-meta strong {
		display: block;
		font-size: 11px;
		font-weight: 800;
		line-height: 1.15;
		color: #0f172a;
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
    background: #ffffff;
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
    color: #0f172a;
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
    color: #64748b;
  }

  .voyage-progress-track {
    position: relative;
    width: 100%;
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: #e2e8f0;
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
		color: #64748b !important;
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
		color: #334155;
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
		color: #111827;
		font-size: 8.8px;
		font-weight: 900;
	}

	.weather-current span,
	.weather-card span,
	.ocean-current span {
		display: block;
		color: #64748b;
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
		background: #f8fafc;
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
			height: 100%;
			grid-template-columns: 1fr;
		}

		.fleet-sidebar {
			height: 460px;
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
			display: grid;
			grid-template-columns: 1fr;
			gap: 0;
		}

		.fleet-sidebar {
			position: fixed;
			top: 6px;
			left: 6px;
			bottom: 6px;
			width: 260px;
			max-width: calc(100vw - 18px);
			height: auto;
			max-height: none;
			border-radius: 12px;
			z-index: 1200;
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
			position: fixed;
			inset: 0;
			z-index: 1100;
			border: none;
			background: rgba(15, 23, 42, 0.36);
			backdrop-filter: blur(2px);
			cursor: pointer;
		}

		.mobile-vessel-toggle {
			display: inline-flex;
			position: fixed;
			top: 10px;
			left: 10px;
			z-index: 900;
			height: 25px;
			align-items: center;
			justify-content: center;
			gap: 5px;
			padding: 0 8px;
			border: 1px solid #bfdbfe;
			border-radius: 999px;
			background: rgba(255, 255, 255, 0.96);
			color: #1d4ed8;
			font-size: 9px;
			font-weight: 900;
			box-shadow: 0 5px 12px rgba(15, 23, 42, 0.12);
			cursor: pointer;
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
			width: 210px !important;
		}

		:global(.measure-start-top) {
			grid-template-columns: 26px 1fr 21px;
			gap: 7px;
			padding: 9px;
		}

		:global(.measure-icon) {
			width: 26px;
			height: 26px;
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
			width: 21px;
			height: 21px;
			font-size: 13px;
		}

		:global(.measure-start-info) {
			gap: 6px;
			padding: 7px 9px 0;
		}

		:global(.measure-start-info div) {
			min-height: 36px;
			padding: 6px;
		}

		:global(.measure-start-btn) {
			width: calc(100% - 18px);
			height: 28px;
			margin: 8px 9px 9px;
			font-size: 9px;
		}

		.sidebar-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}

		.sidebar-close-btn {
			display: grid;
			width: 23px;
			height: 23px;
			place-items: center;
			border: none;
			border-radius: 8px;
			background: #f1f5f9;
			color: #64748b;
			font-size: 15px;
			font-weight: 900;
			line-height: 1;
			cursor: pointer;
			flex-shrink: 0;
		}

		.sidebar-close-btn:hover {
			background: #fee2e2;
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
			left: 8px;
			bottom: 8px;
			padding: 5px 7px;
		}

		:global(.fleet-leaflet-popup .leaflet-popup-content) {
			width: 200px !important;
		}

		:global(.fleet-popup-title) {
			font-size: 11px;
		}

		:global(.fleet-popup-row) {
			grid-template-columns: 54px 1fr;
		}

		:global(.fleet-popup-sub) {
			margin-left: 63px;
		}

		.vessel-detail-panel {
			left: 6px;
			right: 6px;
			bottom: 6px;
			width: auto;
			max-width: none;
			max-height: 62%;
			border-radius: 11px;
		}

		.detail-grid.two-col {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.detail-item strong {
			font-size: 8.5px;
		}
	}
</style>
