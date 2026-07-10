<script>
	import { onMount, tick } from 'svelte';
	import * as XLSX from 'xlsx';
	import { apiRequest } from '$lib/api/authApi.js';
	import { browser } from '$app/environment';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import { getFleetAssets } from '$lib/api/fleetApi.js';
	import { activeMenu } from '$lib/stores/appNavigation.svelte.js';
	import { getAssetIconUrl, getAssetTypeLabel, getAssetTypeValue } from '$lib/utils/assetIcons.js';
	import {
		addMapZonesToLeafletMap,
		isZoneAsset,
		normalizeMapZonesFromAssets
	} from '$lib/utils/mapZones.js';
	import { VMS_TILE_OPTIONS, VMS_TILE_URL } from '$lib/mapStyle.js';
	import {
		createCopyableCoordinateHtml,
		handleCoordinateCopyClick
	} from '$lib/utils/coordinateClipboard.js';
	import 'leaflet/dist/leaflet.css';

	const PAGE_SIZE_OPTIONS = [10, 20, 50];
	const ASSET_LEGEND_TYPES = ['anchor', 'buoy', 'dock', 'shipyard', 'mess', 'office', 'fso', 'rig', 'whp'];

	let loading = false;
	let active = false;
	let saving = false;
	let importing = false;
	let assigning = false;
	let errorMessage = '';
	let successMessage = '';

	let plans = [];
	let selectedPlan = null;
	let selectedPlanId = null;
	let vessels = [];
	let permissions = new Set();

	let movingPointIndex = null;

	let pendingMovePoint = {
		active: false,
		index: null,
		originalPoint: null,
		newLatLng: null
	};

	let page = 1;
	let pageSize = 20;
	let pagination = {
		page: 1,
		pageSize: 20,
		totalItems: 0,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	};
	let activeAssignments = [];
	let activeAssignmentsLoading = false;
	let activeAssignmentsError = '';
	let activePlanUsage = new Map();
	let activePlanLocksLoading = false;
	let activeAssignmentPage = 1;
	let activeAssignmentPageSize = 10;
	let activeAssignmentPagination = {
		page: 1,
		pageSize: 10,
		totalItems: 0,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	};
	let activeAssignmentFilters = {
		voyagePlanId: '',
		vesselId: ''
	};

	let search = '';
	let showForm = false;
	let editMode = false;
	let editAllowedOnly = false;
	let confirmDeleteId = null;

	let form = getEmptyForm();
	let selectedNotAllowedVesselId = '';
	let selectedAllowedVesselId = '';
	let draggedVesselId = '';
	let draggedVesselSource = '';
	let vesselDropTarget = '';
	let useButtonVesselTransfer = false;
	let useVerticalVesselTransfer = false;
	let importForm = {
		voyageName: '',
		isActive: true,
		fileName: '',
		fileBase64: '',
		previewRows: []
	};

	let assignForm = {
		voyagePlanId: '',
		vesselId: '',
		startDate: toDatetimeLocal(new Date())
	};

	let L;
	let mapContainer;
	let routeMapShellContainer;
	let routeMap;
	let markerLayer;
	let assetMarkerLayer;
	let zoneLayerGroup;
	let routeLine;
	let selectedPointIndex = 0;
	let routeMarkerDragging = false;
	let routeMapScaleUnit = 'metric';
	let routeMapScaleLabel = 'Bar = -';
	let routeMapScaleWidth = 80;

	let assets = [];
	let zones = [];
	let assetsLoading = false;
	let assetsError = '';
	let mapInitializing = false;
	let routeMapResizeObserver = null;
	let isRouteMapFullscreen = false;

	let pointContextMenu = {
		visible: false,
		index: null,
		x: 0,
		y: 0
	};

	function closePointContextMenu() {
		pointContextMenu = {
			visible: false,
			index: null,
			x: 0,
			y: 0
		};
	}

	let moveConfirmPosition = {
		visible: false,
		x: 0,
		y: 0
	};

	let undoStack = [];
	const MAX_UNDO_STACK = 30;

	$: active = $activeMenu === 'voyage-plans';
	$: canUndoRoute = undoStack.length > 0;

	function clonePlanData(planData = form.planData) {
		return JSON.parse(JSON.stringify(planData || []));
	}

	function pushUndoState(label = 'Route change') {
		undoStack = [
			...undoStack,
			{
				label,
				planData: clonePlanData(form.planData),
				selectedPointIndex
			}
		].slice(-MAX_UNDO_STACK);
	}

	function resetUndoStack() {
		undoStack = [];
	}

	function resetMoveState() {
		movingPointIndex = null;

		pendingMovePoint = {
			active: false,
			index: null,
			originalPoint: null,
			newLatLng: null
		};

		moveConfirmPosition = {
			visible: false,
			x: 0,
			y: 0
		};

		closePointContextMenu();
	}

	function undoRouteChange() {
		const lastState = undoStack[undoStack.length - 1];
		if (!lastState) return;

		form.planData = clonePlanData(lastState.planData);
		selectedPointIndex = Math.max(
			0,
			Math.min(lastState.selectedPointIndex || 0, form.planData.length - 1)
		);

		undoStack = undoStack.slice(0, -1);

		resetMoveState();
		refreshRouteMap();
	}

	function handleRouteEditorKeydown(event) {
		const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z';

		if (!isUndo) return;
		if (!showForm) return;
		if (editAllowedOnly) return;
		if (!canUndoRoute) return;

		event.preventDefault();
		undoRouteChange();
	}

	function updateMoveConfirmPosition() {
		if (!routeMap) return;

		const index = pendingMovePoint.index ?? movingPointIndex;
		if (index === null || index === undefined) {
			moveConfirmPosition = {
				visible: false,
				x: 0,
				y: 0
			};
			return;
		}

		const point = form.planData[index];
		if (!isValidCoordinate(point)) {
			moveConfirmPosition = {
				visible: false,
				x: 0,
				y: 0
			};
			return;
		}

		const containerPoint = routeMap.latLngToContainerPoint([
			Number(point.latitude),
			Number(point.longitude)
		]);

		moveConfirmPosition = {
			visible: true,
			x: containerPoint.x,
			y: containerPoint.y
		};
	}

	function openPointContextMenu(pointIndex, event) {
		if (editAllowedOnly) return;
		if (!routeMap) return;

		const containerPoint = routeMap.latLngToContainerPoint(event.latlng);

		pointContextMenu = {
			visible: true,
			index: pointIndex,
			x: containerPoint.x,
			y: containerPoint.y
		};

		selectedPointIndex = pointIndex;
		refreshRouteMap();
	}

	function startMovePointFromContext(index) {
		if (editAllowedOnly) return;
		if (!form.planData[index]) return;

		movingPointIndex = index;
		selectedPointIndex = index;

		pendingMovePoint = {
			active: false,
			index,
			originalPoint: { ...form.planData[index] },
			newLatLng: null
		};

		closePointContextMenu();
		refreshRouteMap();
		tick().then(updateMoveConfirmPosition);
	}

	function moveSelectedPointToLatLng(index, latlng) {
		if (editAllowedOnly) return;
		if (index === null || index === undefined) return;
		if (!form.planData[index]) return;

		const nextLatLng = {
			lat: roundCoord(latlng.lat),
			lng: roundCoord(latlng.lng)
		};

		form.planData = form.planData.map((point, pointIndex) =>
			pointIndex === index
				? {
						...point,
						latitude: nextLatLng.lat,
						longitude: nextLatLng.lng
					}
				: point
		);

		selectedPointIndex = index;

		pendingMovePoint = {
			...pendingMovePoint,
			active: true,
			index,
			newLatLng: nextLatLng
		};

		refreshRouteMap();
		tick().then(updateMoveConfirmPosition);
	}

	function confirmMovePoint() {
		if (editAllowedOnly) return;
		if (!pendingMovePoint.active) return;

		const index = pendingMovePoint.index;

		if (
			index !== null &&
			index !== undefined &&
			pendingMovePoint.originalPoint &&
			form.planData[index]
		) {
			const beforeMove = clonePlanData(form.planData);

			beforeMove[index] = {
				...pendingMovePoint.originalPoint,
				order: form.planData[index].order
			};

			undoStack = [
				...undoStack,
				{
					label: 'Move point',
					planData: beforeMove,
					selectedPointIndex: index
				}
			].slice(-MAX_UNDO_STACK);
		}

		movingPointIndex = null;

		pendingMovePoint = {
			active: false,
			index: null,
			originalPoint: null,
			newLatLng: null
		};
		moveConfirmPosition = {
			visible: false,
			x: 0,
			y: 0
		};
		refreshRouteMap();
	}

	function cancelMovePoint() {
		const index = pendingMovePoint.index ?? movingPointIndex;

		if (
			index !== null &&
			index !== undefined &&
			pendingMovePoint.originalPoint &&
			form.planData[index]
		) {
			form.planData = form.planData.map((point, pointIndex) =>
				pointIndex === index
					? {
							...pendingMovePoint.originalPoint,
							order: point.order
						}
					: point
			);
		}

		movingPointIndex = null;

		pendingMovePoint = {
			active: false,
			index: null,
			originalPoint: null,
			newLatLng: null
		};

		closePointContextMenu();
		moveConfirmPosition = {
			visible: false,
			x: 0,
			y: 0
		};
		refreshRouteMap();
	}

	function movePointOrder(index, direction) {
		if (editAllowedOnly) return;
		resetMoveState();

		const targetIndex = direction === 'up' ? index - 1 : index + 1;

		if (targetIndex < 0 || targetIndex >= form.planData.length) return;

		pushUndoState('Move order');

		const nextPlanData = [...form.planData];
		const currentPoint = nextPlanData[index];

		nextPlanData[index] = nextPlanData[targetIndex];
		nextPlanData[targetIndex] = currentPoint;

		form.planData = nextPlanData.map((point, rowIndex) => ({
			...point,
			order: rowIndex + 1
		}));

		selectedPointIndex = targetIndex;
		closePointContextMenu();
		refreshRouteMap();
	}

	function deletePointFromMap(index) {
		if (editAllowedOnly) return;
		resetMoveState();

		if (form.planData.length <= 1) return;

		pushUndoState('Delete point');

		form.planData = form.planData
			.filter((_, rowIndex) => rowIndex !== index)
			.map((point, rowIndex) => ({
				...point,
				order: rowIndex + 1
			}));

		selectedPointIndex = Math.max(0, Math.min(index, form.planData.length - 1));

		closePointContextMenu();
		refreshRouteMap();
	}

	function roundCoord(value) {
		return Number(Number(value).toFixed(6));
	}

	function isFilledCoordinateValue(value) {
		return value !== '' && value !== null && value !== undefined;
	}

	const INDONESIA_CENTER = [-2.5489, 118.0149];
	const INDONESIA_ZOOM = 5;
	const ROUTE_SCALE_STORAGE_KEY = 'vms-map-scale-unit';
	const ROUTE_SCALE_UNITS = ['metric', 'nautical', 'imperial'];
	const ROUTE_SCALE_UNIT_LABELS = {
		metric: 'KM',
		nautical: 'NM',
		imperial: 'MI'
	};
	const ROUTE_SCALE_MAX_WIDTH = 112;

	function hasCoordinateValue(value) {
		return value !== '' && value !== null && value !== undefined && String(value).trim() !== '';
	}

	function isValidCoordinate(point) {
		if (!hasCoordinateValue(point?.latitude)) return false;
		if (!hasCoordinateValue(point?.longitude)) return false;

		const lat = Number(point.latitude);
		const lng = Number(point.longitude);

		return (
			Number.isFinite(lat) &&
			Number.isFinite(lng) &&
			lat >= -90 &&
			lat <= 90 &&
			lng >= -180 &&
			lng <= 180
		);
	}

	function getValidRoutePoints() {
		return form.planData
			.map((point, index) => ({
				...point,
				index
			}))
			.filter(isValidCoordinate)
			.map((point) => ({
				...point,
				latitude: Number(point.latitude),
				longitude: Number(point.longitude)
			}));
	}

	function initializeRouteMapScaleUnit() {
		if (!browser) return;

		try {
			const stored = window.localStorage?.getItem(ROUTE_SCALE_STORAGE_KEY);
			if (ROUTE_SCALE_UNITS.includes(stored)) {
				routeMapScaleUnit = stored;
			}
		} catch {
			// Storage access is optional; keep the default metric unit.
		}
	}

	function setRouteMapScaleUnit(unit) {
		routeMapScaleUnit = ROUTE_SCALE_UNITS.includes(unit) ? unit : 'metric';

		try {
			window.localStorage?.setItem(ROUTE_SCALE_STORAGE_KEY, routeMapScaleUnit);
		} catch {
			// Ignore localStorage errors.
		}

		updateRouteMapScale();
	}

	function zoomRouteMap(direction) {
		if (!routeMap) return;

		if (direction === 'in') {
			routeMap.zoomIn();
		} else {
			routeMap.zoomOut();
		}
	}

	function updateRouteMapScale() {
		if (!routeMap?._loaded) {
			routeMapScaleLabel = 'Bar = -';
			routeMapScaleWidth = Math.round(ROUTE_SCALE_MAX_WIDTH * 0.72);
			return;
		}

		const size = routeMap.getSize?.();
		if (!size?.x || !size?.y) return;

		const y = size.y / 2;
		const maxMeters =
			routeMap.distance(
				routeMap.containerPointToLatLng([0, y]),
				routeMap.containerPointToLatLng([ROUTE_SCALE_MAX_WIDTH, y])
			) || 0;
		const scale = getRouteScaleForUnit(maxMeters, routeMapScaleUnit, ROUTE_SCALE_MAX_WIDTH);

		routeMapScaleLabel = scale.label;
		routeMapScaleWidth = scale.width;
	}

	function getRouteScaleForUnit(maxMeters, unit, maxWidth) {
		if (!Number.isFinite(maxMeters) || maxMeters <= 0) {
			return { label: 'Bar = -', width: Math.round(maxWidth * 0.72) };
		}

		const meters = getRouteRoundScaleNumber(maxMeters);
		const width = getRouteScaleWidth(meters / maxMeters, maxWidth);

		return {
			label: getRouteScaleLabel(meters, unit),
			width
		};
	}

	function getRouteScaleLabel(meters, unit) {
		if (!Number.isFinite(meters) || meters <= 0) return 'Bar = -';

		if (unit === 'nautical') {
			return `Bar = ${formatRouteConvertedScaleNumber(meters / 1852)} NM`;
		}

		if (unit === 'imperial') {
			return `Bar = ${formatRouteConvertedScaleNumber(meters / 1609.344)} mi`;
		}

		if (meters >= 1000) {
			return `Bar = ${formatRouteScaleNumber(meters / 1000)} km`;
		}

		return `Bar = ${formatRouteScaleNumber(meters)} m`;
	}

	function getRouteScaleWidth(ratio, maxWidth) {
		const width = Math.round(Math.max(0.25, Math.min(1, ratio)) * maxWidth);
		return Math.max(36, Math.min(maxWidth, width));
	}

	function getRouteRoundScaleNumber(value) {
		if (!Number.isFinite(value) || value <= 0) return 0;

		const pow10 = 10 ** Math.floor(Math.log10(value));
		const digit = value / pow10;
		const roundedDigit = digit >= 5 ? 5 : digit >= 3 ? 3 : digit >= 2 ? 2 : 1;
		return roundedDigit * pow10;
	}

	function formatRouteScaleNumber(value) {
		if (!Number.isFinite(value)) return '-';
		if (value >= 100 || Number.isInteger(value)) return String(Math.round(value));
		if (value >= 10) return value.toFixed(1).replace(/\.0$/, '');
		return value.toFixed(2).replace(/\.?0+$/, '');
	}

	function formatRouteConvertedScaleNumber(value) {
		if (!Number.isFinite(value)) return '-';
		if (value >= 1000) return String(Math.round(value));
		if (value >= 100) return value.toFixed(1).replace(/\.0$/, '');
		if (value >= 10) return value.toFixed(2).replace(/\.?0+$/, '');
		if (value >= 1) return value.toFixed(3).replace(/\.?0+$/, '');
		return value.toFixed(6).replace(/\.?0+$/, '');
	}

	async function ensureLeaflet() {
		if (!browser) return null;
		if (L) return L;

		const leafletModule = await import('leaflet');
		L = leafletModule.default || leafletModule;
		return L;
	}

	async function initializeRouteMap() {
		if (!browser || !showForm || !mapContainer || routeMap || mapInitializing) return;

		mapInitializing = true;

		try {
			const leaflet = await ensureLeaflet();
			if (!leaflet) return;

			routeMap = leaflet.map(mapContainer, {
				zoomControl: false,
				preferCanvas: true
			});

			leaflet.tileLayer(VMS_TILE_URL, VMS_TILE_OPTIONS).addTo(routeMap);

			renderZoneLayer();
			assetMarkerLayer = leaflet.layerGroup().addTo(routeMap);
			markerLayer = leaflet.layerGroup().addTo(routeMap);
			mapContainer.addEventListener('click', handleCoordinateCopyClick, true);

			routeLine = leaflet
				.polyline([], {
					color: '#2f65e8',
					weight: 4,
					opacity: 0.95
				})
				.addTo(routeMap);

			renderAssetMarkers();

			routeMap.on('click', (event) => {
				if (movingPointIndex === null || movingPointIndex === undefined) {
					closePointContextMenu();
				}

				handleMapClick(event);
			});

			routeMap.on('contextmenu', () => {
				closePointContextMenu();
			});

			routeMap.on('move zoom', () => {
				if (movingPointIndex !== null && movingPointIndex !== undefined) {
					updateMoveConfirmPosition();
				}

				updateRouteMapScale();
			});

			routeMap.on('moveend zoomend resize load', updateRouteMapScale);

			const existingPoints = getValidRoutePoints();

			if (existingPoints.length) {
				routeMap.setView([existingPoints[0].latitude, existingPoints[0].longitude], 11);
				refreshRouteMap();
			} else {
				routeMap.setView(INDONESIA_CENTER, INDONESIA_ZOOM);
			}

			updateRouteMapScale();

			setupRouteMapResizeObserver();
			refreshRouteMapLayout();
		} finally {
			mapInitializing = false;
		}
	}

	function refreshRouteMapLayout() {
		if (!routeMap) return;

		[0, 80, 180, 360, 700].forEach((delay) => {
			setTimeout(() => {
				if (!routeMap) return;
				routeMap.invalidateSize({ pan: false });
				refreshRouteMap();
				renderAssetMarkers();
				renderZoneLayer();
				updateRouteMapScale();
			}, delay);
		});
	}

	function setupRouteMapResizeObserver() {
		if (!browser || !mapContainer || !routeMap || typeof ResizeObserver === 'undefined') return;

		routeMapResizeObserver?.disconnect?.();
		routeMapResizeObserver = new ResizeObserver(() => {
			routeMap?.invalidateSize?.({ pan: false });
			updateRouteMapScale();
		});
		routeMapResizeObserver.observe(mapContainer);
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

	async function toggleRouteMapFullscreen() {
		if (!browser || !routeMapShellContainer) return;

		try {
			if (getFullscreenElement() === routeMapShellContainer) {
				const exitFullscreen =
					document.exitFullscreen ||
					document.webkitExitFullscreen ||
					document.mozCancelFullScreen ||
					document.msExitFullscreen;
				await exitFullscreen?.call(document);
				return;
			}

			const requestFullscreen =
				routeMapShellContainer.requestFullscreen ||
				routeMapShellContainer.webkitRequestFullscreen ||
				routeMapShellContainer.mozRequestFullScreen ||
				routeMapShellContainer.msRequestFullscreen;
			await requestFullscreen?.call(routeMapShellContainer);
		} catch (error) {
			console.warn('[VOYAGE_PLANS_FULLSCREEN_ERROR]', error);
		}
	}

	function handleRouteMapFullscreenChange() {
		isRouteMapFullscreen = getFullscreenElement() === routeMapShellContainer;
		refreshRouteMapLayout();
	}

	function destroyRouteMap() {
		routeMapResizeObserver?.disconnect?.();
		routeMapResizeObserver = null;

		if (mapContainer) {
			mapContainer.removeEventListener('click', handleCoordinateCopyClick, true);
		}

		if (routeMap) {
			routeMap.off();
			routeMap.remove();
		}

		routeMap = null;
		markerLayer = null;
		assetMarkerLayer = null;
		zoneLayerGroup = null;
		routeLine = null;
	}

	function openRouteMapAfterRender() {
		tick().then(async () => {
			if (!showForm) return;
			await initializeRouteMap();
			refreshRouteMapLayout();
			refreshRouteMap(true);
		});
	}

	function addRoutePointFromLatLng(latlng, undoLabel = 'Add point') {
		pushUndoState(undoLabel);

		const lat = roundCoord(latlng.lat);
		const lng = roundCoord(latlng.lng);

		const emptyIndex = form.planData.findIndex(
			(point) =>
				(point.latitude === '' || point.latitude === null || point.latitude === undefined) &&
				(point.longitude === '' || point.longitude === null || point.longitude === undefined)
		);

		if (emptyIndex >= 0) {
			form.planData = form.planData.map((point, index) =>
				index === emptyIndex
					? {
							...point,
							order: index + 1,
							latitude: lat,
							longitude: lng
						}
					: point
			);

			selectedPointIndex = emptyIndex;
		} else {
			const newPoint = {
				order: form.planData.length + 1,
				latitude: lat,
				longitude: lng,
				speed_kn: ''
			};

			form.planData = [...form.planData, newPoint];
			selectedPointIndex = form.planData.length - 1;
		}

		refreshRouteMap();
	}

	function handleMapClick(event) {
		if (editAllowedOnly) return;

		if (movingPointIndex !== null && movingPointIndex !== undefined) {
			moveSelectedPointToLatLng(movingPointIndex, event.latlng);
			return;
		}

		addRoutePointFromLatLng(event.latlng, 'Add route point from map');
	}

	function handleRouteMarkerClick(point, event) {
		if (event?.originalEvent && L?.DomEvent) {
			L.DomEvent.stopPropagation(event.originalEvent);
		}

		if (routeMarkerDragging) return;

		if (editAllowedOnly) {
			selectPoint(point.index);
			return;
		}

		closePointContextMenu();

		const latlng = {
			lat: Number(point.latitude),
			lng: Number(point.longitude)
		};

		if (movingPointIndex !== null && movingPointIndex !== undefined) {
			moveSelectedPointToLatLng(movingPointIndex, latlng);
			return;
		}

		addRoutePointFromLatLng(latlng, `Reuse route point ${point.order || point.index + 1}`);
	}

	function updatePointCoordinate(index, latlng) {
		if (editAllowedOnly) return;

		pushUndoState('Drag point');

		form.planData = form.planData.map((point, pointIndex) =>
			pointIndex === index
				? {
						...point,
						latitude: roundCoord(latlng.lat),
						longitude: roundCoord(latlng.lng)
					}
				: point
		);

		selectedPointIndex = index;
		refreshRouteMap();
	}

	function selectPoint(index) {
		selectedPointIndex = index;

		const point = form.planData[index];

		if (routeMap && isValidCoordinate(point)) {
			routeMap.setView(
				[Number(point.latitude), Number(point.longitude)],
				Math.max(routeMap.getZoom(), 12)
			);
		}

		refreshRouteMap();
	}

	function refreshRouteMap(shouldFit = false) {
		if (!L || !routeMap || !markerLayer || !routeLine) return;

		markerLayer.clearLayers();

		const validPoints = getValidRoutePoints();

		const latLngs = validPoints.map((point) => [point.latitude, point.longitude]);
		routeLine.setLatLngs(latLngs);

		validPoints.forEach((point) => {
			const isSelected = point.index === selectedPointIndex;
			const isMoving = point.index === movingPointIndex;

			const marker = L.marker([point.latitude, point.longitude], {
				draggable: !editAllowedOnly,
				icon: L.divIcon({
					className: '',
					html: `
            <div class="route-marker ${isSelected ? 'selected' : ''} ${isMoving ? 'moving' : ''}">
              ${point.order || point.index + 1}
            </div>
          `,
					iconSize: [30, 30],
					iconAnchor: [15, 15]
				})
			});

			marker.on('click', (event) => {
				handleRouteMarkerClick(point, event);
			});

			marker.on('contextmenu', (event) => {
				if (editAllowedOnly) return;
				openPointContextMenu(point.index, event);
			});

			marker.on('dragstart', () => {
				if (editAllowedOnly) return;
				routeMarkerDragging = true;
				closePointContextMenu();
				selectedPointIndex = point.index;
				refreshRouteMap();
			});

			marker.on('dragend', () => {
				if (editAllowedOnly) return;
				updatePointCoordinate(point.index, marker.getLatLng());
				setTimeout(() => {
					routeMarkerDragging = false;
				}, 120);
			});

			marker.addTo(markerLayer);
		});

		if (shouldFit && validPoints.length >= 2) {
			const bounds = L.latLngBounds(latLngs);
			routeMap.fitBounds(bounds, {
				padding: [35, 35],
				maxZoom: 13
			});
		} else if (shouldFit && validPoints.length === 1) {
			routeMap.setView(latLngs[0], Math.max(routeMap.getZoom(), 12));
		} else if (shouldFit && validPoints.length === 0) {
			routeMap.setView(INDONESIA_CENTER, INDONESIA_ZOOM);
		}

		setTimeout(() => {
			routeMap?.invalidateSize({
				pan: false
			});
		}, 80);
		if (movingPointIndex !== null && movingPointIndex !== undefined) {
			tick().then(updateMoveConfirmPosition);
		}
	}

	function fitRouteMap() {
		refreshRouteMap(true);
	}

	function clearRoutePoints() {
		if (editAllowedOnly) return;

		pushUndoState('Clear route');

		form.planData = [createPoint(1)];
		selectedPointIndex = 0;
		resetMoveState();
		refreshRouteMap();
	}

	$: canAccess =
		permissions.has('access_voyage_plan_fleet') ||
		permissions.has('manage_voyage_plan_fleet') ||
		permissions.has('assign_voyage_plan_fleet');
	$: canManage = permissions.has('manage_voyage_plan_fleet');
	$: canAssign = permissions.has('assign_voyage_plan_fleet');
	$: filteredPlans = plans.filter((plan) => {
		const q = search.trim().toLowerCase();
		if (!q) return true;
		return (
			String(plan.id).includes(q) ||
			String(plan.voyageName || '')
				.toLowerCase()
				.includes(q)
		);
	});
	$: allowedVesselIdSet = new Set(form.allowedVesselIds.map(Number));
	$: selectedAllowedVessels = vessels.filter((v) => allowedVesselIdSet.has(Number(v.id)));
	$: notAllowedVessels = vessels.filter((v) => !allowedVesselIdSet.has(Number(v.id)));
	$: selectedAssignPlan = getAssignmentPlan(assignForm.voyagePlanId);
	$: assignableVessels = getAssignableVessels(assignForm.voyagePlanId);
	$: if (
		assignForm.vesselId &&
		assignForm.voyagePlanId &&
		!assignableVessels.some((vessel) => Number(vessel.id) === Number(assignForm.vesselId))
	) {
		assignForm.vesselId = '';
	}

	function getEmptyForm() {
		return {
			id: null,
			voyageName: '',
			isActive: true,
			allowedVesselIds: [],
			planData: [createPoint(1)]
		};
	}

	function createPoint(order = 1) {
		return { order, latitude: '', longitude: '', speed_kn: '' };
	}

	function clearMessages() {
		errorMessage = '';
		successMessage = '';
	}

	async function apiFetch(path, options = {}) {
		try {
			return await apiRequest(path, options);
		} catch (error) {
			const message = error?.message || 'Request failed.';
			if (message.toLowerCase().includes('unauthorized') || message.includes('401')) {
				throw new Error('Unauthorized. Please log in again.');
			}
			throw new Error(message);
		}
	}

	function normalizeAsset(asset) {
		if (isZoneAsset(asset)) return null;

		const latitude = Number(asset?.latitude);
		const longitude = Number(asset?.longitude);

		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

		return {
			id: asset?.id,
			assetId: asset?.assetId || '',
			assetName: asset?.assetName || `Asset ${asset?.id || ''}`,
			assetType: getAssetTypeValue(asset),
			latitude,
			longitude,
			raw: asset
		};
	}

	function renderZoneLayer() {
		if (!L || !routeMap) return;

		if (zoneLayerGroup) {
			zoneLayerGroup.clearLayers();
			zoneLayerGroup.remove();
			zoneLayerGroup = null;
		}

		zoneLayerGroup = addMapZonesToLeafletMap(L, routeMap, zones, {
			paneName: 'voyageZonePane',
			zIndex: 355
		});
	}

	function createAssetMarkerIcon(asset) {
		const iconUrl = getAssetIconUrl(asset);
		const typeLabel = getAssetTypeLabel(asset);

		return L.divIcon({
			className: `asset-leaflet-icon asset-type-${String(typeLabel).toLowerCase()}`,
			html: `
				<img class="asset-type-marker-icon" src="${iconUrl}" alt="${escapeHtml(typeLabel)} asset" title="${escapeHtml(asset.assetName)}" />
			`,
			iconSize: [32, 32],
			iconAnchor: [16, 16],
			popupAnchor: [0, -16]
		});
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	async function loadFleetAssets() {
		assetsLoading = true;
		assetsError = '';

		try {
			const rows = await getFleetAssets();

			zones = normalizeMapZonesFromAssets(rows);
			assets = rows.map(normalizeAsset).filter(Boolean);

			console.log('[VOYAGE_PLANS][ASSETS]', assets);

			renderZoneLayer();
			renderAssetMarkers();
		} catch (error) {
			console.error('[VOYAGE_PLANS][ASSETS][ERROR]', error);
			assets = [];
			zones = [];
			assetsError = error?.message || 'Failed to load fleet assets.';
			renderZoneLayer();
			renderAssetMarkers();
		} finally {
			assetsLoading = false;
		}
	}

	function renderAssetMarkers() {
		if (!L || !routeMap) return;

		if (!assetMarkerLayer) {
			assetMarkerLayer = L.layerGroup().addTo(routeMap);
		}

		assetMarkerLayer.clearLayers();

		assets.forEach((asset) => {
			const marker = L.marker([asset.latitude, asset.longitude], {
				icon: createAssetMarkerIcon(asset)
			});

			marker.bindTooltip(escapeHtml(asset.assetName), {
				direction: 'top',
				offset: [0, -10],
				opacity: 0.95
			});

			marker.on('click', (event) => {
				if (event?.originalEvent) {
					L.DomEvent.stopPropagation(event.originalEvent);
				}

				closePointContextMenu();

				const latlng = {
					lat: asset.latitude,
					lng: asset.longitude
				};

				if (movingPointIndex !== null && movingPointIndex !== undefined) {
					moveSelectedPointToLatLng(movingPointIndex, latlng);
					return;
				}

				addRoutePointFromLatLng(latlng, `Add route point from ${asset.assetName}`);
			});

			marker.addTo(assetMarkerLayer);
		});
	}

	async function apiFetchBlob(path, options = {}) {
		const response = await apiRequest(path, {
			...options,
			responseType: 'blob'
		});

		if (response instanceof Blob) return response;
		if (response?.blob instanceof Blob) return response.blob;
		if (response?.data instanceof Blob) return response.data;

		throw new Error(
			'The Excel template could not be read as a file. Check the apiRequest helper for blob responseType support.'
		);
	}

	onMount(() => {
		let cleanupVesselTransferMode = () => {};

		if (browser) {
			initializeRouteMapScaleUnit();
			window.addEventListener('keydown', handleRouteEditorKeydown);
			document.addEventListener('fullscreenchange', handleRouteMapFullscreenChange);
			document.addEventListener('webkitfullscreenchange', handleRouteMapFullscreenChange);
			document.addEventListener('mozfullscreenchange', handleRouteMapFullscreenChange);
			document.addEventListener('MSFullscreenChange', handleRouteMapFullscreenChange);
			cleanupVesselTransferMode = setupVesselTransferMode();
		}

		initializePage();

		return () => {
			if (browser) {
				window.removeEventListener('keydown', handleRouteEditorKeydown);
				document.removeEventListener('fullscreenchange', handleRouteMapFullscreenChange);
				document.removeEventListener('webkitfullscreenchange', handleRouteMapFullscreenChange);
				document.removeEventListener('mozfullscreenchange', handleRouteMapFullscreenChange);
				document.removeEventListener('MSFullscreenChange', handleRouteMapFullscreenChange);
			}

			destroyRouteMap();
			cleanupVesselTransferMode();
		};
	});

	$: {
		if (!active && !showForm) {
			destroyRouteMap();
		} else if (showForm) {
			openRouteMapAfterRender();
		}
	}

	function setupVesselTransferMode() {
		if (!browser) return () => {};

		const buttonModeQuery = window.matchMedia('(max-width: 1024px), (pointer: coarse)');
		const verticalModeQuery = window.matchMedia('(max-width: 720px)');

		const updateTransferMode = () => {
			useButtonVesselTransfer = buttonModeQuery.matches;
			useVerticalVesselTransfer = verticalModeQuery.matches;

			if (useButtonVesselTransfer) {
				handleVesselDragEnd();
			}
		};

		updateTransferMode();

		buttonModeQuery.addEventListener?.('change', updateTransferMode);
		verticalModeQuery.addEventListener?.('change', updateTransferMode);

		return () => {
			buttonModeQuery.removeEventListener?.('change', updateTransferMode);
			verticalModeQuery.removeEventListener?.('change', updateTransferMode);
		};
	}

	async function initializePage() {
		loading = true;
		clearMessages();
		try {
			await loadCurrentUser();
			if (canAccess) {
				await Promise.all([
					loadPlans(),
					loadVessels(),
					loadFleetAssets(),
					loadActiveAssignments(),
					loadActivePlanLocks()
				]);
			}
		} catch (error) {
			errorMessage = error.message;
		} finally {
			loading = false;
		}
	}

	async function loadCurrentUser() {
		const result = await apiFetch('/users/current-user');
		const data = result?.data || {};
		permissions = collectPermissions(data);

		const accessDetails = data?.vesselAccess?.details || [];
		vessels = accessDetails.map(normalizeVessel).filter(Boolean);
	}

	function collectPermissions(user) {
		const result = new Set();
		const candidates = [
			user?.permissions,
			user?.permissionAccess?.details,
			user?.permissionAccess?.permissions,
			user?.permissionAccess,
			user?.access
		];

		for (const item of candidates) {
			if (Array.isArray(item)) {
				item.forEach((value) => {
					if (typeof value === 'string') result.add(value);
					if (value?.key) result.add(value.key);
					if (value?.permissionKey) result.add(value.permissionKey);
					if (value?.name) result.add(value.name);
				});
			} else if (item && typeof item === 'object') {
				if (item.mode === 'all') {
					[
						'access_voyage_plan_fleet',
						'manage_voyage_plan_fleet',
						'assign_voyage_plan_fleet'
					].forEach((p) => result.add(p));
				}
				Object.keys(item).forEach((key) => {
					if (item[key] === true) result.add(key);
				});
			}
		}
		return result;
	}

	function normalizeVessel(vessel) {
		const id = Number(vessel?.id ?? vessel?.vesselId);
		if (!Number.isFinite(id)) return null;
		return {
			id,
			vesselName:
				vessel?.vesselName ||
				vessel?.name ||
				vessel?.thingsboardName ||
				vessel?.assetName ||
				`Vessel ${id}`,
			deviceId: vessel?.deviceId || vessel?.assetId || ''
		};
	}

	function normalizeActiveAssignment(row = {}) {
		const checkpoints = Array.isArray(row.checkpoints) ? row.checkpoints : [];
		const percentage = Number(row.percentage ?? 0);

		return {
			id: row.id,
			vesselId: row.vessel?.id ?? row.vesselId ?? row.vessel_id,
			vesselName:
				row.vessel?.vesselName ||
				row.vessel?.name ||
				row.vesselName ||
				(row.vessel?.id ? `Vessel ${row.vessel.id}` : '-'),
			voyagePlanId: row.voyage?.id ?? row.voyagePlanId ?? row.voyage_plan_id,
			voyageName:
				row.voyage?.voyageName ||
				row.voyage?.name ||
				row.voyageName ||
				(row.voyage?.id ? `Plan ${row.voyage.id}` : '-'),
			startDate: row.startDate ?? row.start_date ?? null,
			percentage: Number.isFinite(percentage) ? percentage : 0,
			assignedBy: row.assignedBy ?? row.assigned_by ?? '-',
			checkpoints
		};
	}

	function normalizeVoyagePlan(plan = {}) {
		const id = Number(plan.id ?? plan.voyagePlanId ?? plan.voyage_plan_id);
		const existingPlan = plans.find((item) => Number(item.id) === id);
		const allowedVesselIds = Array.isArray(plan.allowedVesselIds)
			? plan.allowedVesselIds
			: Array.isArray(plan.allowed_vessel_ids)
				? plan.allowed_vessel_ids
				: [];
		const planData = Array.isArray(plan.planData)
			? plan.planData
			: Array.isArray(plan.plan_data)
				? plan.plan_data
				: [];

		return {
			...existingPlan,
			...plan,
			id: Number.isFinite(id) ? id : plan.id,
			voyageName: plan.voyageName || plan.voyage_name || plan.name || existingPlan?.voyageName || '',
			isActive: Boolean(plan.isActive ?? plan.is_active ?? existingPlan?.isActive),
			isUsed: Boolean(plan.isUsed ?? plan.is_used ?? existingPlan?.isUsed),
			allowedVesselIds: allowedVesselIds.map(Number).filter(Number.isFinite),
			planData
		};
	}

	function getCheckpointSummary(checkpoints = []) {
		const total = checkpoints.length;
		const completed = checkpoints.filter((checkpoint) =>
			['COMPLETED', 'MANUAL_COMPLETED'].includes(String(checkpoint.status || '').toUpperCase())
		).length;
		const skipped = checkpoints.filter(
			(checkpoint) => String(checkpoint.status || '').toUpperCase() === 'SKIPPED'
		).length;
		const pending = checkpoints.filter(
			(checkpoint) => String(checkpoint.status || '').toUpperCase() === 'PENDING'
		).length;

		return { total, completed, skipped, pending };
	}

	async function loadActiveAssignments(targetPage = activeAssignmentPage) {
		activeAssignmentsLoading = true;
		activeAssignmentsError = '';

		try {
			const params = new URLSearchParams({
				page: String(targetPage),
				pageSize: String(Number(activeAssignmentPageSize) || 10)
			});

			if (activeAssignmentFilters.voyagePlanId) {
				params.set('voyagePlanId', String(activeAssignmentFilters.voyagePlanId));
			}

			if (activeAssignmentFilters.vesselId) {
				params.set('vesselId', String(activeAssignmentFilters.vesselId));
			}

			const result = await apiFetch(`/voyage-plans/assignments/active?${params.toString()}`);
			activeAssignments = (result?.data?.items || []).map(normalizeActiveAssignment);
			activeAssignmentPagination = result?.data?.pagination || activeAssignmentPagination;
			activeAssignmentPage = activeAssignmentPagination.page || targetPage;
		} catch (error) {
			activeAssignmentsError = error.message;
			activeAssignments = [];
		} finally {
			activeAssignmentsLoading = false;
		}
	}

	async function loadActivePlanLocks() {
		activePlanLocksLoading = true;

		try {
			const usage = new Map();
			let lockPage = 1;
			let hasNext = true;
			const pageSizeForLocks = 500;
			let guard = 0;

			while (hasNext && guard < 20) {
				const params = new URLSearchParams({
					page: String(lockPage),
					pageSize: String(pageSizeForLocks)
				});

				const result = await apiFetch(`/voyage-plans/assignments/active?${params.toString()}`);
				const rows = (result?.data?.items || []).map(normalizeActiveAssignment);

				rows.forEach((assignment) => {
					const planId = Number(assignment.voyagePlanId);
					if (!Number.isFinite(planId)) return;

					const current = usage.get(planId) || [];
					current.push(assignment);
					usage.set(planId, current);
				});

				const paginationInfo = result?.data?.pagination || {};
				hasNext = Boolean(paginationInfo.hasNext);
				lockPage = Number(paginationInfo.page || lockPage) + 1;
				guard += 1;
			}

			activePlanUsage = usage;
		} catch (error) {
			console.warn('[VOYAGE_PLANS][ACTIVE_LOCKS_ERROR]', error);
			activePlanUsage = new Map();
		} finally {
			activePlanLocksLoading = false;
		}
	}

	function isPlanInUse(planId) {
		const normalizedPlanId = Number(planId);
		const plan = plans.find((item) => Number(item.id) === normalizedPlanId);

		return Boolean(plan?.isUsed) || activePlanUsage.has(normalizedPlanId);
	}

	function getPlanUsageLabel(planId) {
		const assignments = activePlanUsage.get(Number(planId)) || [];
		if (!assignments.length) return '';

		const vesselNames = assignments
			.map((assignment) => assignment.vesselName)
			.filter(Boolean)
			.slice(0, 2);
		const suffix = assignments.length > 2 ? ` +${assignments.length - 2}` : '';

		return vesselNames.length
			? `In use by ${vesselNames.join(', ')}${suffix}`
			: `In use by ${assignments.length} vessel`;
	}

	function clearActiveAssignmentFilters() {
		activeAssignmentFilters = {
			voyagePlanId: '',
			vesselId: ''
		};
		loadActiveAssignments(1);
	}

	function getAssignmentPlan(planId) {
		if (!planId) return null;

		const normalizedPlanId = Number(planId);
		if (!Number.isFinite(normalizedPlanId)) return null;

		if (Number(selectedPlan?.id) === normalizedPlanId) return selectedPlan;

		return plans.find((plan) => Number(plan.id) === normalizedPlanId) || null;
	}

	function getAssignableVessels(planId) {
		const plan = getAssignmentPlan(planId);
		const allowedIds = (plan?.allowedVesselIds || []).map(Number).filter(Number.isFinite);

		if (!plan || allowedIds.length === 0) return [];

		const allowedIdSet = new Set(allowedIds);

		return vessels.filter((vessel) => allowedIdSet.has(Number(vessel.id)));
	}

	async function loadVessels() {
		if (vessels.length) return;
		try {
			const result = await apiFetch('/users/my-vessels');
			vessels = (result?.data || []).map(normalizeVessel).filter(Boolean);
		} catch (error) {
			console.warn('Failed to load my-vessels', error);
		}
	}

	async function loadPlans(targetPage = page) {
		clearMessages();
		loading = true;
		try {
			const result = await apiFetch(`/voyage-plans?page=${targetPage}&pageSize=${pageSize}`);
			const data = result?.data || {};
			const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
			plans = items.map(normalizeVoyagePlan);
			pagination = data?.pagination || pagination;
			page = pagination.page || targetPage;

			if (!selectedPlanId && plans[0]?.id) {
				await openPlan(plans[0].id, false);
			} else if (selectedPlanId) {
				const stillExists = plans.some((plan) => plan.id === selectedPlanId);
				if (!stillExists && plans[0]?.id) await openPlan(plans[0].id, false);
			}
		} catch (error) {
			errorMessage = error.message;
		} finally {
			loading = false;
		}
	}

	async function openPlan(id, showLoading = true) {
		clearMessages();
		selectedPlanId = id;
		if (showLoading) loading = true;
		try {
			const result = await apiFetch(`/voyage-plans/${id}`);
			selectedPlan = result?.data ? normalizeVoyagePlan(result.data) : null;
			assignForm.voyagePlanId = selectedPlan?.id || '';
		} catch (error) {
			errorMessage = error.message;
		} finally {
			if (showLoading) loading = false;
		}
	}

	function startCreate() {
		clearMessages();
		form = getEmptyForm();
		selectedNotAllowedVesselId = '';
		selectedAllowedVesselId = '';
		handleVesselDragEnd();
		editMode = false;
		editAllowedOnly = false;
		showForm = true;
		selectedPointIndex = 0;
		resetUndoStack();
		openRouteMapAfterRender();
	}

	async function startEdit(planId) {
		clearMessages();
		const planIsInUse = isPlanInUse(planId);

		await openPlan(planId);
		if (!selectedPlan) return;

		form = {
			id: selectedPlan.id,
			voyageName: selectedPlan.voyageName || '',
			isActive: !!selectedPlan.isActive,
			allowedVesselIds: (selectedPlan.allowedVesselIds || []).map(Number),
			planData: (selectedPlan.planData || []).map((point, index) => ({
				order: Number(point.order || index + 1),
				latitude: point.latitude ?? '',
				longitude: point.longitude ?? '',
				speed_kn: point.speed_kn ?? ''
			}))
		};

		if (!form.planData.length) form.planData = [createPoint(1)];
		selectedNotAllowedVesselId = '';
		selectedAllowedVesselId = '';
		handleVesselDragEnd();
		editMode = true;
		editAllowedOnly = planIsInUse;
		showForm = true;
		selectedPointIndex = 0;
		resetUndoStack();
		openRouteMapAfterRender();
	}

	function closeForm() {
		if (browser && getFullscreenElement() === routeMapShellContainer) {
			const exitFullscreen =
				document.exitFullscreen ||
				document.webkitExitFullscreen ||
				document.mozCancelFullScreen ||
				document.msExitFullscreen;
			exitFullscreen?.call(document);
		}
		isRouteMapFullscreen = false;
		destroyRouteMap();
		showForm = false;
		editMode = false;
		editAllowedOnly = false;
		form = getEmptyForm();
		selectedNotAllowedVesselId = '';
		selectedAllowedVesselId = '';
		handleVesselDragEnd();
		selectedPointIndex = 0;
		resetUndoStack();
		resetMoveState();
	}

	function addPoint() {
		if (editAllowedOnly) return;

		pushUndoState('Add empty point');

		form.planData = [...form.planData, createPoint(form.planData.length + 1)];
		selectedPointIndex = form.planData.length - 1;
		refreshRouteMap();
	}

	function removePoint(index) {
		if (editAllowedOnly) return;

		resetMoveState();

		if (form.planData.length <= 1) return;

		pushUndoState('Remove point');

		form.planData = form.planData
			.filter((_, rowIndex) => rowIndex !== index)
			.map((point, rowIndex) => ({ ...point, order: rowIndex + 1 }));

		selectedPointIndex = Math.max(0, Math.min(selectedPointIndex, form.planData.length - 1));
		closePointContextMenu();
		refreshRouteMap();
	}

	function reorderPoints() {
		if (editAllowedOnly) return;

		form.planData = form.planData.map((point, rowIndex) => ({ ...point, order: rowIndex + 1 }));
		refreshRouteMap();
	}

	function toggleVessel(id) {
		const value = Number(id);
		if (form.allowedVesselIds.includes(value)) {
			form.allowedVesselIds = form.allowedVesselIds.filter((item) => item !== value);
		} else {
			form.allowedVesselIds = [...form.allowedVesselIds, value].sort((a, b) => a - b);
		}
	}

	function moveVesselToAllowed(id) {
		const value = Number(id);
		if (!Number.isFinite(value)) return;

		if (!form.allowedVesselIds.map(Number).includes(value)) {
			form.allowedVesselIds = [...form.allowedVesselIds.map(Number), value].sort((a, b) => a - b);
		}

		selectedNotAllowedVesselId = '';
		selectedAllowedVesselId = String(value);
	}

	function moveVesselToNotAllowed(id) {
		const value = Number(id);
		if (!Number.isFinite(value)) return;

		form.allowedVesselIds = form.allowedVesselIds.map(Number).filter((item) => item !== value);

		selectedAllowedVesselId = '';
		selectedNotAllowedVesselId = String(value);
	}

	function allowSelectedVessel() {
		if (!selectedNotAllowedVesselId) return;
		moveVesselToAllowed(selectedNotAllowedVesselId);
	}

	function disallowSelectedVessel() {
		if (!selectedAllowedVesselId) return;
		moveVesselToNotAllowed(selectedAllowedVesselId);
	}

	function selectTransferVessel(vesselId, source) {
		if (source === 'allowed') {
			selectedAllowedVesselId = String(vesselId);
			selectedNotAllowedVesselId = '';
			return;
		}

		selectedNotAllowedVesselId = String(vesselId);
		selectedAllowedVesselId = '';
	}

	function handleVesselDragStart(event, vesselId, source) {
		if (useButtonVesselTransfer) {
			event.preventDefault();
			return;
		}

		draggedVesselId = String(vesselId);
		draggedVesselSource = source;
		vesselDropTarget = source === 'allowed' ? 'not-allowed' : 'allowed';

		event.dataTransfer?.setData('text/plain', String(vesselId));
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleVesselDragOver(event, target) {
		if (useButtonVesselTransfer) return;

		event.preventDefault();
		vesselDropTarget = target;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleVesselDrop(event, target) {
		if (useButtonVesselTransfer) return;

		event.preventDefault();

		const droppedId = draggedVesselId || event.dataTransfer?.getData('text/plain');
		if (!droppedId) return;

		if (target === 'allowed') {
			moveVesselToAllowed(droppedId);
		} else {
			moveVesselToNotAllowed(droppedId);
		}

		draggedVesselId = '';
		draggedVesselSource = '';
		vesselDropTarget = '';
	}

	function handleVesselDragEnd() {
		draggedVesselId = '';
		draggedVesselSource = '';
		vesselDropTarget = '';
	}

	function validatePlanPayload() {
		if (!form.voyageName.trim()) throw new Error('Voyage name is required.');
		if (!form.planData.length) throw new Error('At least 1 route point is required.');

		const planData = form.planData.map((point, index) => {
			if (!isFilledCoordinateValue(point.latitude)) {
				throw new Error(`Latitude in row ${index + 1} is required.`);
			}

			if (!isFilledCoordinateValue(point.longitude)) {
				throw new Error(`Longitude in row ${index + 1} is required.`);
			}

			const latitude = Number(point.latitude);
			const longitude = Number(point.longitude);
			const speed =
				point.speed_kn === '' || point.speed_kn === null ? null : Number(point.speed_kn);

			if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
				throw new Error(`Latitude in row ${index + 1} is invalid.`);
			}
			if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
				throw new Error(`Longitude in row ${index + 1} is invalid.`);
			}
			if (speed !== null && (!Number.isFinite(speed) || speed < 0)) {
				throw new Error(`Speed in row ${index + 1} is invalid.`);
			}

			const normalized = {
				order: index + 1,
				latitude,
				longitude
			};
			if (speed !== null) normalized.speed_kn = speed;
			return normalized;
		});

		return {
			voyageName: form.voyageName.trim(),
			planData,
			isActive: !!form.isActive,
			allowedVesselIds: form.allowedVesselIds.map(Number)
		};
	}

	async function submitPlan() {
		clearMessages();
		saving = true;
		try {
			const payload = editAllowedOnly
				? { allowedVesselIds: form.allowedVesselIds.map(Number).filter(Number.isFinite) }
				: validatePlanPayload();
			const path = editMode ? `/voyage-plans/${form.id}` : '/voyage-plans';
			const method = editMode ? 'PUT' : 'POST';
			const result = await apiFetch(path, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			successMessage = result?.message || 'Voyage plan saved successfully.';
			closeForm();
			await loadPlans(page);
			await openPlan(result?.data?.id || selectedPlanId || plans[0]?.id);
		} catch (error) {
			errorMessage = error.message;
		} finally {
			saving = false;
		}
	}

	async function toggleActive(plan) {
		clearMessages();
		if (isPlanInUse(plan.id)) {
			errorMessage = 'This voyage plan is currently assigned to an active vessel and cannot be changed.';
			return;
		}

		saving = true;
		try {
			const result = await apiFetch(`/voyage-plans/${plan.id}/toggle-active`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: !plan.isActive })
			});
			successMessage = result?.message || 'Voyage plan status updated successfully.';
			await loadPlans(page);
			if (selectedPlanId === plan.id) await openPlan(plan.id, false);
		} catch (error) {
			errorMessage = error.message;
		} finally {
			saving = false;
		}
	}

	async function deletePlan(id) {
		clearMessages();
		if (isPlanInUse(id)) {
			errorMessage = 'This voyage plan is currently assigned to an active vessel and cannot be deleted.';
			return;
		}

		saving = true;
		try {
			const result = await apiFetch(`/voyage-plans/${id}`, { method: 'DELETE' });
			successMessage = result?.message || 'Voyage plan deleted successfully.';
			confirmDeleteId = null;
			if (selectedPlanId === id) {
				selectedPlanId = null;
				selectedPlan = null;
			}
			await loadPlans(page);
		} catch (error) {
			errorMessage = error.message;
		} finally {
			saving = false;
		}
	}

	async function downloadTemplate() {
		clearMessages();
		try {
			const blob = await apiFetchBlob('/voyage-plans/download-template', {
				headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'voyage_plan_template.xlsx';
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			errorMessage = error.message;
		}
	}

	async function handleExcelUpload(event) {
		clearMessages();
		const file = event.target.files?.[0];
		if (!file) return;

		importForm.fileName = file.name;
		try {
			const arrayBuffer = await file.arrayBuffer();
			const workbook = XLSX.read(arrayBuffer, { type: 'array' });
			const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
			const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
			validateExcelRows(rows);
			importForm.previewRows = rows.slice(0, 6).map(normalizeExcelRow);
			importForm.fileBase64 = arrayBufferToBase64(arrayBuffer);
			if (!importForm.voyageName.trim()) {
				importForm.voyageName = file.name.replace(/\.xlsx?$/i, '').replace(/[_-]/g, ' ');
			}
		} catch (error) {
			importForm.fileBase64 = '';
			importForm.previewRows = [];
			errorMessage = error.message;
		}
	}

	function validateExcelRows(rows) {
		if (!rows.length) throw new Error('The Excel file is empty.');
		const required = ['order', 'latitude', 'longitude'];
		const headers = Object.keys(rows[0] || {}).map((key) => key.trim());
		const missing = required.filter((key) => !headers.includes(key));
		if (missing.length)
			throw new Error(`Excel columns are incomplete. Required columns: ${missing.join(', ')}.`);

		rows.forEach((row, index) => {
			const point = normalizeExcelRow(row);
			if (!Number.isFinite(point.order)) throw new Error(`Order in row ${index + 2} is invalid.`);
			if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90)
				throw new Error(`Latitude in row ${index + 2} is invalid.`);
			if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180)
				throw new Error(`Longitude in row ${index + 2} is invalid.`);
			if (point.speed_kn !== '' && (!Number.isFinite(point.speed_kn) || point.speed_kn < 0))
				throw new Error(`Speed in row ${index + 2} is invalid.`);
		});
	}

	function normalizeExcelRow(row) {
		return {
			order: Number(row.order),
			latitude: Number(row.latitude),
			longitude: Number(row.longitude),
			speed_kn:
				row.speed_kn === '' || row.speed_kn === null || row.speed_kn === undefined
					? ''
					: Number(row.speed_kn)
		};
	}

	function arrayBufferToBase64(buffer) {
		let binary = '';
		const bytes = new Uint8Array(buffer);
		const chunkSize = 8192;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
		}
		return btoa(binary);
	}

	async function importExcel() {
		clearMessages();
		if (!importForm.voyageName.trim()) {
			errorMessage = 'Voyage name for import is required.';
			return;
		}
		if (!importForm.fileBase64) {
			errorMessage = 'Select an Excel file first.';
			return;
		}

		importing = true;
		try {
			const result = await apiFetch('/voyage-plans/import-excel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					voyageName: importForm.voyageName.trim(),
					fileBase64: importForm.fileBase64,
					isActive: !!importForm.isActive
				})
			});
			successMessage = result?.message || 'Voyage plan imported successfully.';
			importForm = {
				voyageName: '',
				isActive: true,
				fileName: '',
				fileBase64: '',
				previewRows: []
			};
			await loadPlans(1);
			await openPlan(result?.data?.id, false);
		} catch (error) {
			errorMessage = error.message;
		} finally {
			importing = false;
		}
	}

	async function assignPlan() {
		clearMessages();
		if (!assignForm.voyagePlanId || !assignForm.vesselId || !assignForm.startDate) {
			errorMessage = 'Voyage plan, vessel, and start date are required.';
			return;
		}

		assigning = true;
		try {
			const result = await apiFetch('/voyage-plans/assign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					voyagePlanId: Number(assignForm.voyagePlanId),
					vesselId: Number(assignForm.vesselId),
					startDate: new Date(assignForm.startDate).toISOString()
				})
			});
			successMessage = result?.message || 'Voyage plan assigned to vessel successfully.';
			await Promise.all([loadActiveAssignments(1), loadActivePlanLocks()]);
		} catch (error) {
			errorMessage = error.message;
		} finally {
			assigning = false;
		}
	}

	function toDatetimeLocal(date) {
		const pad = (value) => String(value).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function formatDate(value) {
		if (!value) return '-';
		return new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function vesselLabel(id) {
		return vessels.find((v) => v.id === Number(id))?.vesselName || `Vessel ${id}`;
	}
</script>

<section class="voyage-page">
	<section class="voyage-header-card">
		<div>
			<div class="page-kicker">Voyage Plan Fleet</div>
			<h1>Voyage Plans</h1>
			<p>
				Manage route points, active status, vessel access, Excel import, and voyage plan assignments
				to vessels.
			</p>
		</div>

		<div class="header-actions">
			{#if canManage}
				<button class="ghost-button" type="button" on:click={downloadTemplate}
					>Download Template</button
				>
				<button class="primary-button" type="button" on:click={startCreate}>Create Plan</button>
			{/if}
		</div>
	</section>

	{#if errorMessage}
		<div class="alert error">{errorMessage}</div>
	{/if}
	{#if successMessage}
		<div class="alert success">{successMessage}</div>
	{/if}

	{#if loading && !plans.length}
		<LoadingSkeleton label="Loading voyage plans" variant="voyage-plans-page" rows={6} />
	{:else if !canAccess}
		<div class="empty-card">
			<h3>Access Restricted</h3>
			<p>This user does not have the <b>access_voyage_plan_fleet</b> permission.</p>
		</div>
	{:else}
		<section class="voyage-grid">
			<section class="panel list-panel">
				<div class="panel-toolbar">
					<div>
						<h2>Plan List</h2>
						<span>{pagination.totalItems || 0} total plans</span>
					</div>
					<input class="search-input" bind:value={search} placeholder="Search plan..." />
				</div>

				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>ID</th>
								<th>Voyage Name</th>
								<th>Status</th>
								<th>Allowed Vessel</th>
								<th class="right">Action</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredPlans as plan}
								{@const planIsInUse = isPlanInUse(plan.id)}
								{@const planUsageLabel = getPlanUsageLabel(plan.id)}
								<tr
									class:active-row={selectedPlanId === plan.id}
									class:plan-in-use-row={planIsInUse}
									on:click={() => openPlan(plan.id)}
								>
									<td>#{plan.id}</td>
									<td class="strong">
										<div class="plan-name-cell">
											<span>{plan.voyageName}</span>
											{#if planIsInUse}
												<small>{planUsageLabel}</small>
											{/if}
										</div>
									</td>
									<td>
										<span
											class:badge-active={plan.isActive}
											class:badge-muted={!plan.isActive}
											class="badge"
										>
											{plan.isActive ? 'Active' : 'Inactive'}
										</span>
									</td>
									<td>{(plan.allowedVesselIds || []).length} vessel</td>
									<td class="actions right" on:click|stopPropagation>
										<div class="action-row">
											{#if canManage}
												{#if planIsInUse}
													<span class="plan-lock-pill" title={planUsageLabel}>In use</span>
												{/if}
												{#if planIsInUse}
													<button
														class="icon-action"
														type="button"
														title="Edit allowed vessels"
														aria-label="Edit allowed vessels"
														on:click={() => startEdit(plan.id)}
														disabled={saving || activePlanLocksLoading}
													>
														✎
													</button>
												{:else if confirmDeleteId === plan.id}
													<button
														class="icon-action danger"
														type="button"
														title="Confirm delete"
														aria-label="Confirm delete"
														on:click={() => deletePlan(plan.id)}
														disabled={saving || planIsInUse || activePlanLocksLoading}
													>
														✓
													</button>

													<button
														class="icon-action"
														type="button"
														title="Cancel delete"
														aria-label="Cancel delete"
														on:click={() => (confirmDeleteId = null)}
														disabled={saving}
													>
														✕
													</button>
												{:else}
													<button
														class="icon-action"
														type="button"
														title="Edit"
														aria-label="Edit"
														on:click={() => startEdit(plan.id)}
														disabled={saving || activePlanLocksLoading}
													>
														✎
													</button>

													<button
														class="icon-action"
														class:active-toggle={plan.isActive}
														type="button"
														title={plan.isActive ? 'Deactivate' : 'Activate'}
														aria-label={plan.isActive ? 'Deactivate' : 'Activate'}
														on:click={() => toggleActive(plan)}
														disabled={saving || planIsInUse || activePlanLocksLoading}
													>
														{plan.isActive ? '⏸' : '▶'}
													</button>

													<button
														class="icon-action danger ghost-danger"
														type="button"
														title="Delete"
														aria-label="Delete"
														on:click={() => (confirmDeleteId = plan.id)}
														disabled={saving || planIsInUse || activePlanLocksLoading}
													>
														🗑
													</button>
												{/if}
											{:else}
												<button
													class="icon-action"
													type="button"
													title="View"
													aria-label="View"
													on:click={() => openPlan(plan.id)}
												>
													👁
												</button>
											{/if}
										</div>
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="5" class="empty-cell">No voyage plan data is available.</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="pagination-bar">
					<button
						type="button"
						disabled={!pagination.hasPrevious || loading}
						on:click={() => loadPlans(page - 1)}>Previous</button
					>
					<span>Page {pagination.page || page} of {pagination.totalPages || 1}</span>
					<button
						type="button"
						disabled={!pagination.hasNext || loading}
						on:click={() => loadPlans(page + 1)}>Next</button
					>
					<select bind:value={pageSize} on:change={() => loadPlans(1)}>
						{#each PAGE_SIZE_OPTIONS as option}
							<option value={option}>{option}/page</option>
						{/each}
					</select>
				</div>
			</section>

			<section class="panel detail-panel">
				<div class="panel-toolbar">
					<div>
						<h2>Plan Detail</h2>
						<span>{selectedPlan ? selectedPlan.voyageName : 'No selected plan'}</span>
					</div>
					{#if selectedPlan}
						<span
							class:badge-active={selectedPlan.isActive}
							class:badge-muted={!selectedPlan.isActive}
							class="badge large"
						>
							{selectedPlan.isActive ? 'Active' : 'Inactive'}
						</span>
					{/if}
				</div>

				{#if selectedPlan}
					<div class="detail-summary">
						<div>
							<span>ID</span>
							<b>#{selectedPlan.id}</b>
						</div>
						<div>
							<span>Route Points</span>
							<b>{(selectedPlan.planData || []).length}</b>
						</div>
						<div>
							<span>Allowed Vessels</span>
							<b>{(selectedPlan.allowedVesselIds || []).length}</b>
						</div>
						<div>
							<span>Created</span>
							<b>{formatDate(selectedPlan.createdAt)}</b>
						</div>
					</div>

					<div class="allowed-list">
						{#each selectedPlan.allowedVesselIds || [] as vesselId}
							<span>{vesselLabel(vesselId)}</span>
						{:else}
							<em>No allowed vessels yet.</em>
						{/each}
					</div>

					<div class="route-table-wrap">
						<table>
							<thead>
								<tr>
									<th>Order</th>
									<th>Latitude</th>
									<th>Longitude</th>
									<th>Speed kn</th>
								</tr>
							</thead>
							<tbody>
								{#each selectedPlan.planData || [] as point}
									<tr>
										<td>{point.order}</td>
										<td>
											<CopyableCoordinate value={point.latitude} display={point.latitude} label="latitude" compact />
										</td>
										<td>
											<CopyableCoordinate
												value={point.longitude}
												display={point.longitude}
												label="longitude"
												compact
											/>
										</td>
										<td>{point.speed_kn ?? '-'}</td>
									</tr>
								{:else}
									<tr>
										<td colspan="4" class="empty-cell">No route points yet.</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="empty-state">Select a voyage plan to view details.</div>
				{/if}
			</section>
		</section>

		{#if canManage || canAssign}
			<section class="bottom-grid">
				{#if canManage}
					<section class="panel import-panel">
						<div class="panel-toolbar">
							<div>
								<h2>Import Excel</h2>
								<span>Format: order, latitude, longitude, speed_kn</span>
							</div>
						</div>

						<div class="form-grid compact">
							<label>
								<span>Voyage Name</span>
								<input bind:value={importForm.voyageName} placeholder="Imported Plan Name" />
							</label>
							<label class="switch-line">
								<input type="checkbox" bind:checked={importForm.isActive} />
								<span>Set as active</span>
							</label>
							<label class="file-box">
								<input type="file" accept=".xlsx,.xls" on:change={handleExcelUpload} />
								<span>{importForm.fileName || 'Choose Excel File'}</span>
							</label>
							<button
								class="primary-button"
								type="button"
								on:click={importExcel}
								disabled={importing || !importForm.fileBase64}
							>
								{importing ? 'Importing...' : 'Import Excel'}
							</button>
						</div>

						{#if importForm.previewRows.length}
							<div class="preview-box">
								<b>Preview</b>
								<table>
									<thead>
										<tr><th>order</th><th>latitude</th><th>longitude</th><th>speed_kn</th></tr>
									</thead>
									<tbody>
										{#each importForm.previewRows as row}
											<tr
												><td>{row.order}</td
												><td
													><CopyableCoordinate
														value={row.latitude}
														display={row.latitude}
														label="latitude"
														compact
													/></td
												><td
													><CopyableCoordinate
														value={row.longitude}
														display={row.longitude}
														label="longitude"
														compact
													/></td
												><td>{row.speed_kn}</td
												></tr
											>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</section>
				{/if}

				{#if canAssign}
					<section class="panel assign-panel">
						<div class="panel-toolbar assign-toolbar">
							<div>
								<div class="panel-kicker">Assignment</div>
								<h2>Assign to Vessel</h2>
								<span>Assign a voyage plan only to vessels allowed by that plan.</span>
							</div>
						</div>

						<div class="assign-card">
							<div class="assign-plan-preview">
								<div>
									<span>Selected Plan</span>
									<strong>{selectedAssignPlan?.voyageName || 'Choose a voyage plan'}</strong>
								</div>
								<em>
									{assignForm.voyagePlanId
										? `${assignableVessels.length} allowed vessel`
										: 'No plan selected'}
								</em>
							</div>

							<div class="assign-form-grid">
								<label class="assign-field">
									<span>Voyage Plan</span>
									<select bind:value={assignForm.voyagePlanId}>
										<option value="">Select plan</option>
										{#each plans as plan}
											<option value={plan.id}>{plan.voyageName}</option>
										{/each}
									</select>
								</label>

								<label class="assign-field">
									<span>Allowed Vessel</span>
									<select bind:value={assignForm.vesselId} disabled={!assignForm.voyagePlanId}>
										<option value="">
											{assignForm.voyagePlanId ? 'Select allowed vessel' : 'Select voyage plan first'}
										</option>
										{#each assignableVessels as vessel}
											<option value={vessel.id}>{vessel.vesselName}</option>
										{/each}
									</select>
									{#if assignForm.voyagePlanId && assignableVessels.length === 0}
										<small class="field-note warning-note">
											This voyage plan has no allowed vessel.
										</small>
									{:else if assignForm.voyagePlanId}
										<small class="field-note">
											Only vessels listed in this plan can be assigned.
										</small>
									{/if}
								</label>

								<label class="assign-field">
									<span>Start Date</span>
									<input type="datetime-local" bind:value={assignForm.startDate} />
								</label>

								<div class="assign-action">
									<button
										class="primary-button assign-button"
										type="button"
										on:click={assignPlan}
										disabled={assigning || !assignForm.voyagePlanId || !assignForm.vesselId || !assignForm.startDate}
									>
										{assigning ? 'Assigning...' : 'Assign Plan'}
									</button>
								</div>
							</div>
						</div>
					</section>
				{/if}
			</section>
		{/if}

		<section class="panel active-assignments-panel">
			<div class="panel-toolbar assignments-toolbar">
				<div>
					<h2>Active Assignments</h2>
					<span>
						{activeAssignmentPagination.totalItems || 0} active voyage plan assignment
					</span>
				</div>

				<button
					type="button"
					class="ghost-button"
					on:click={() => Promise.all([loadActiveAssignments(activeAssignmentPage), loadActivePlanLocks()])}
					disabled={activeAssignmentsLoading}
				>
					{activeAssignmentsLoading ? 'Refreshing...' : 'Refresh'}
				</button>
			</div>

			<div class="assignment-filter-grid">
				<label>
					<span>Voyage Plan</span>
					<select
						bind:value={activeAssignmentFilters.voyagePlanId}
						on:change={() => loadActiveAssignments(1)}
					>
						<option value="">All plans</option>
						{#each plans as plan}
							<option value={plan.id}>{plan.voyageName}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Vessel</span>
					<select
						bind:value={activeAssignmentFilters.vesselId}
						on:change={() => loadActiveAssignments(1)}
					>
						<option value="">All vessels</option>
						{#each vessels as vessel}
							<option value={vessel.id}>{vessel.vesselName}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Page Size</span>
					<select
						bind:value={activeAssignmentPageSize}
						on:change={() => loadActiveAssignments(1)}
					>
						{#each PAGE_SIZE_OPTIONS as option}
							<option value={option}>{option}/page</option>
						{/each}
					</select>
				</label>

				<button
					type="button"
					class="ghost-button"
					on:click={clearActiveAssignmentFilters}
					disabled={!activeAssignmentFilters.voyagePlanId && !activeAssignmentFilters.vesselId}
				>
					Clear Filter
				</button>
			</div>

			{#if activeAssignmentsError}
				<div class="alert error compact-alert">{activeAssignmentsError}</div>
			{/if}

			<div class="table-wrap active-assignment-table-wrap">
				<table>
					<thead>
						<tr>
							<th>ID</th>
							<th>Vessel</th>
							<th>Voyage Plan</th>
							<th>Start Date</th>
							<th>Progress</th>
							<th>Checkpoints</th>
							<th>Assigned By</th>
						</tr>
					</thead>
					<tbody>
						{#if activeAssignmentsLoading && !activeAssignments.length}
							<tr>
								<td colspan="7" class="empty-cell">Loading active assignments...</td>
							</tr>
						{:else}
							{#each activeAssignments as assignment}
								{@const checkpointSummary = getCheckpointSummary(assignment.checkpoints)}
								<tr>
									<td>#{assignment.id}</td>
									<td>
										<strong>{assignment.vesselName}</strong>
										<small>#{assignment.vesselId}</small>
									</td>
									<td>
										<strong>{assignment.voyageName}</strong>
										<small>#{assignment.voyagePlanId}</small>
									</td>
									<td>{formatDate(assignment.startDate)}</td>
									<td>
										<div class="assignment-progress">
											<div class="assignment-progress-track">
												<span style={`width: ${Math.max(0, Math.min(100, assignment.percentage))}%`}></span>
											</div>
											<strong>{assignment.percentage.toFixed(2)}%</strong>
										</div>
									</td>
									<td>
										<div class="checkpoint-summary">
											<span>{checkpointSummary.completed} completed</span>
											<span>{checkpointSummary.skipped} skipped</span>
											<span>{checkpointSummary.pending} pending</span>
											<small>{checkpointSummary.total} total</small>
										</div>
									</td>
									<td>{assignment.assignedBy}</td>
								</tr>
							{:else}
								<tr>
									<td colspan="7" class="empty-cell">No active assignment is available.</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			<div class="pagination-bar">
				<button
					type="button"
					disabled={!activeAssignmentPagination.hasPrevious || activeAssignmentsLoading}
					on:click={() => loadActiveAssignments(activeAssignmentPage - 1)}>Previous</button
				>
				<span>
					Page {activeAssignmentPagination.page || activeAssignmentPage} of
					{activeAssignmentPagination.totalPages || 1}
				</span>
				<button
					type="button"
					disabled={!activeAssignmentPagination.hasNext || activeAssignmentsLoading}
					on:click={() => loadActiveAssignments(activeAssignmentPage + 1)}>Next</button
				>
			</div>
		</section>
	{/if}
</section>

{#if showForm}
	<div class="modal-backdrop" on:click={closeForm}>
		<section class="modal-card" on:click|stopPropagation>
			<div class="modal-header">
				<div>
					<div class="page-kicker">
						{editAllowedOnly ? 'Edit Allowed Vessels' : editMode ? 'Edit Voyage Plan' : 'Create Voyage Plan'}
					</div>
					<h2>{editMode ? form.voyageName : 'New Voyage Plan'}</h2>
					{#if editAllowedOnly}
						<p class="modal-lock-note">
							This plan is currently in use. Route points, status, and voyage name are locked.
						</p>
					{/if}
				</div>
				<button class="icon-button" type="button" on:click={closeForm}>×</button>
			</div>

			<div class="modal-body">
				{#if false}
					<div class="section-title route-section-title" style="margin:-16px -16px 0; border-radius: 0px;">
					<div>
						<h3>Route Points</h3>
						<span>
							Click the map to add a point, right-click a marker to move, reorder, or delete it.
						</span>
					</div>

					<div class="route-title-actions">
						<button
							type="button"
							class="toolbar-button"
							on:click={undoRouteChange}
							disabled={!canUndoRoute}
							title={canUndoRoute
								? `Undo: ${undoStack[undoStack.length - 1]?.label}`
								: 'No undo available'}
						>
							↶ Undo
						</button>

						<button class="toolbar-button" type="button" on:click={addPoint}>
							+ Add Point
						</button>

						<button class="toolbar-button" type="button" on:click={fitRouteMap}>
							Fit Map
						</button>

						<button
							class="toolbar-button danger ghost-danger"
							type="button"
							on:click={clearRoutePoints}
						>
							Clear
						</button>
					</div>
					</div>
				{/if}

				<div class:locked-editor={editAllowedOnly} class="route-map-editor">
					{#if editAllowedOnly}
						<div class="locked-editor-overlay" aria-hidden="true">
							<div>
								<strong>Route is locked</strong>
								<span>Only allowed vessels can be changed while this plan is in use.</span>
							</div>
						</div>
					{/if}

					<aside class="route-point-panel">
						<div class="point-hint">
							{editAllowedOnly
								? 'Route points are locked while this plan is assigned to an active vessel.'
								: 'Click the map to add a point. Markers can be moved to update coordinates.'}
						</div>

						<div class="route-editor">
							<table>
								<thead>
									<tr>
										<th>No</th>
										<th>Latitude</th>
										<th>Longitude</th>
										<th>Speed</th>
										<th></th>
									</tr>
								</thead>

								<tbody>
									{#each form.planData as point, index}
										<tr
											class:selected-point-row={selectedPointIndex === index}
											on:click={() => selectPoint(index)}
										>
											<td>
												<input
													type="number"
													bind:value={point.order}
													on:change={reorderPoints}
													disabled={editAllowedOnly}
												/>
											</td>

											<td>
												<div class="coordinate-input-wrap">
													<input
														type="number"
														step="0.000001"
														bind:value={point.latitude}
														placeholder="-6.1751"
														on:focus={() => pushUndoState('Edit coordinate')}
														on:input={() => refreshRouteMap()}
														disabled={editAllowedOnly}
													/>
													<CopyableCoordinate
														value={point.latitude}
														display=""
														label="latitude"
														compact
													/>
												</div>
											</td>

											<td>
												<div class="coordinate-input-wrap">
													<input
														type="number"
														step="0.000001"
														bind:value={point.longitude}
														placeholder="106.865"
														on:focus={() => pushUndoState('Edit coordinate')}
														on:input={() => refreshRouteMap()}
														disabled={editAllowedOnly}
													/>
													<CopyableCoordinate
														value={point.longitude}
														display=""
														label="longitude"
														compact
													/>
												</div>
											</td>

											<td>
												<input
													type="number"
													step="0.1"
													bind:value={point.speed_kn}
													placeholder="8"
													on:focus={() => pushUndoState('Edit speed')}
													disabled={editAllowedOnly}
												/>
											</td>

											<td>
												<button
													class="icon-action danger ghost-danger"
													type="button"
													title="Remove point"
													aria-label="Remove point"
													on:click|stopPropagation={() => removePoint(index)}
													disabled={editAllowedOnly}
												>
													🗑
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

					</aside>

					<section class="route-map-card">
						<div
							class:is-fullscreen={isRouteMapFullscreen}
							class="route-map-shell"
							bind:this={routeMapShellContainer}
						>
							<div class="route-map" bind:this={mapContainer}></div>

							<div class="route-map-native-controls" aria-label="Route map controls">
								<div class="route-map-zoom-control" aria-label="Zoom controls">
									<button type="button" aria-label="Zoom in" on:click={() => zoomRouteMap('in')}>
										+
									</button>
									<button type="button" aria-label="Zoom out" on:click={() => zoomRouteMap('out')}>
										−
									</button>
								</div>

								<div class="route-map-scale-control">
									<div class="route-map-scale-bar" style={`width: ${routeMapScaleWidth}px;`}>
										<span>{routeMapScaleLabel}</span>
									</div>
									<select
										aria-label="Change scale unit"
										title="Change scale unit"
										bind:value={routeMapScaleUnit}
										on:change={(event) => setRouteMapScaleUnit(event.currentTarget.value)}
									>
										{#each ROUTE_SCALE_UNITS as unit}
											<option value={unit}>{ROUTE_SCALE_UNIT_LABELS[unit]}</option>
										{/each}
									</select>
								</div>
							</div>

							<div class="route-map-overlay-toolbar">
								<div class="route-map-title">
									<h3>Route Points</h3>
									<span>
										{editAllowedOnly
											? 'Route editing is locked for active assignments.'
											: 'Click map to add point, right-click marker to move, reorder, or delete.'}
									</span>
								</div>

								<div class="route-title-actions">
									<button
										type="button"
										class="toolbar-button"
										on:click={undoRouteChange}
										disabled={!canUndoRoute || editAllowedOnly}
										title={canUndoRoute
											? `Undo: ${undoStack[undoStack.length - 1]?.label}`
											: 'No undo available'}
									>
										Undo
									</button>

									<button class="toolbar-button" type="button" on:click={addPoint} disabled={editAllowedOnly}>
										+ Add Point
									</button>

									<button class="toolbar-button" type="button" on:click={fitRouteMap}>
										Fit Map
									</button>

									<button
										class="toolbar-button danger ghost-danger"
										type="button"
										on:click={clearRoutePoints}
										disabled={editAllowedOnly}
									>
										Clear
									</button>
								</div>
							</div>

							<button
								class:is-fullscreen={isRouteMapFullscreen}
								class="route-map-fullscreen-btn"
								type="button"
								aria-pressed={isRouteMapFullscreen}
								aria-label={isRouteMapFullscreen ? 'Exit fullscreen map' : 'Open fullscreen map'}
								title={isRouteMapFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
								on:click={toggleRouteMapFullscreen}
							>
								<span aria-hidden="true">{isRouteMapFullscreen ? '↙' : '⛶'}</span>
							</button>

							{#if movingPointIndex !== null && movingPointIndex !== undefined && moveConfirmPosition.visible}
								<div
									class="move-point-popover"
									style={`left: ${moveConfirmPosition.x}px; top: ${moveConfirmPosition.y}px;`}
									on:click|stopPropagation
									on:contextmenu|preventDefault
								>
									{#if pendingMovePoint.active}
										<button
											class="move-point-btn confirm"
											type="button"
											title="Confirm move"
											aria-label="Confirm move"
											on:click={confirmMovePoint}
										>
											✓
										</button>
									{/if}

									<button
										class="move-point-btn cancel"
										type="button"
										title="Cancel move"
										aria-label="Cancel move"
										on:click={cancelMovePoint}
									>
										✕
									</button>
								</div>
							{/if}

							{#if pointContextMenu.visible}
								<div
									class="point-context-menu"
									style={`left: ${pointContextMenu.x}px; top: ${pointContextMenu.y}px;`}
									on:click|stopPropagation
									on:contextmenu|preventDefault
								>
									<div class="context-title">
										Point {(pointContextMenu.index ?? 0) + 1}
									</div>

									<button
										type="button"
										on:click={() => startMovePointFromContext(pointContextMenu.index)}
									>
										↔ Move Point
									</button>

									<button
										type="button"
										on:click={() => movePointOrder(pointContextMenu.index, 'up')}
										disabled={pointContextMenu.index === 0}
									>
										↑ Move Up
									</button>

									<button
										type="button"
										on:click={() => movePointOrder(pointContextMenu.index, 'down')}
										disabled={pointContextMenu.index === form.planData.length - 1}
									>
										↓ Move Down
									</button>

									<button
										class="danger-action"
										type="button"
										on:click={() => deletePointFromMap(pointContextMenu.index)}
										disabled={form.planData.length <= 1}
									>
										🗑 Delete Point
									</button>
								</div>
							{/if}
						</div>

						<div class="route-map-legend" aria-label="Route editor map legend">
							<div class="legend-group">
								<span class="legend-title">Route</span>
								<span class="legend-item">
									<i class="legend-route-line"></i>
									Route line
								</span>
								<span class="legend-item">
									<i class="legend-route-dot"></i>
									Point
								</span>
								<span class="legend-item">
									<i class="legend-route-dot selected"></i>
									Selected
								</span>
								<!-- <span class="legend-item">
									<i class="legend-route-dot moving"></i>
									Moving
								</span> -->
							</div>

							<div class="legend-group">
								<span class="legend-title">Assets</span>
								{#each ASSET_LEGEND_TYPES as assetType}
									<span class="legend-item asset-legend-item">
										<img
											class="legend-asset-icon"
											src={getAssetIconUrl(assetType)}
											alt={`${getAssetTypeLabel(assetType)} icon`}
										/>
										{getAssetTypeLabel(assetType)}
									</span>
								{/each}
							</div>

							{#if zones.length}
								<div class="legend-group">
									<span class="legend-title">Zones</span>
									{#each zones as zone}
										<span class="legend-item">
											<i
												class="legend-zone-swatch"
												style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
											></i>
											{zone.name}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					</section>
				</div>

				<div class:locked-section-shell={editAllowedOnly} class="form-grid">
					{#if editAllowedOnly}
						<div class="form-lock-overlay" aria-hidden="true">
							<div>
								<strong>Plan settings locked</strong>
								<span>Name and active status cannot be changed for an in-use plan.</span>
							</div>
						</div>
					{/if}

					<label>
						<span>Voyage Name</span>
						<input
							bind:value={form.voyageName}
							placeholder="Plan Jakarta to Surabaya"
							disabled={editAllowedOnly}
						/>
					</label>

					<label class="switch-line">
						<input type="checkbox" bind:checked={form.isActive} disabled={editAllowedOnly} />
						<span>Active</span>
					</label>
				</div>

				<div class="vessel-picker">
					<div class="section-title compact-title">
						<div>
							<h3>Allowed Vessels</h3>
							<span>
								{selectedAllowedVessels.length} selected vessel •
								{useButtonVesselTransfer
									? 'select a vessel, then use the transfer buttons'
									: 'drag vessel between boxes'}
							</span>
						</div>
					</div>

					<div
						class="vessel-transfer"
						class:drag-mode={!useButtonVesselTransfer}
						class:button-mode={useButtonVesselTransfer}
						class:vertical-mode={useVerticalVesselTransfer}
					>
						<section
							class="vessel-transfer-box"
							class:drop-ready={vesselDropTarget === 'not-allowed'}
							on:dragover={(event) => handleVesselDragOver(event, 'not-allowed')}
							on:drop={(event) => handleVesselDrop(event, 'not-allowed')}
						>
							<div class="transfer-box-head">
								<strong>Not Allowed</strong>
								<span>{notAllowedVessels.length} vessel</span>
							</div>

							<div class="transfer-list" role="listbox" aria-label="Not allowed vessels">
								{#each notAllowedVessels as vessel}
									<button
										type="button"
										draggable={!useButtonVesselTransfer}
										class:selected={String(vessel.id) === selectedNotAllowedVesselId}
										class:dragging={draggedVesselId === String(vessel.id)}
										on:click={() => selectTransferVessel(vessel.id, 'not-allowed')}
										on:dblclick={() => moveVesselToAllowed(vessel.id)}
										on:dragstart={(event) =>
											handleVesselDragStart(event, vessel.id, 'not-allowed')}
										on:dragend={handleVesselDragEnd}
									>
										<span>{vessel.vesselName}</span>
									</button>
								{:else}
									<em>All vessels are allowed.</em>
								{/each}
							</div>
						</section>

						<div class="transfer-actions" aria-label="Move vessel access">
							<button
								type="button"
								on:click={allowSelectedVessel}
								disabled={!selectedNotAllowedVesselId}
								aria-label="Allow selected vessel"
							>
								<span class="wide-icon">&gt;</span>
							</button>

							<button
								type="button"
								on:click={disallowSelectedVessel}
								disabled={!selectedAllowedVesselId}
								aria-label="Remove selected vessel from allowed"
							>
								<span class="wide-icon">&lt;</span>
							</button>
						</div>

						<section
							class="vessel-transfer-box allowed"
							class:drop-ready={vesselDropTarget === 'allowed'}
							on:dragover={(event) => handleVesselDragOver(event, 'allowed')}
							on:drop={(event) => handleVesselDrop(event, 'allowed')}
						>
							<div class="transfer-box-head">
								<strong>Allowed</strong>
								<span>{selectedAllowedVessels.length} vessel</span>
							</div>

							<div class="transfer-list" role="listbox" aria-label="Allowed vessels">
								{#each selectedAllowedVessels as vessel}
									<button
										type="button"
										draggable={!useButtonVesselTransfer}
										class:selected={String(vessel.id) === selectedAllowedVesselId}
										class:dragging={draggedVesselId === String(vessel.id)}
										on:click={() => selectTransferVessel(vessel.id, 'allowed')}
										on:dblclick={() => moveVesselToNotAllowed(vessel.id)}
										on:dragstart={(event) => handleVesselDragStart(event, vessel.id, 'allowed')}
										on:dragend={handleVesselDragEnd}
									>
										<span>{vessel.vesselName}</span>
										<small>ID {vessel.id}</small>
									</button>
								{:else}
									<em>No vessel allowed yet.</em>
								{/each}
							</div>
						</section>
					</div>
				</div>
			</div>

			<div class="modal-footer">
				<button type="button" on:click={closeForm}>Cancel</button>
				<button class="primary-button" type="button" on:click={submitPlan} disabled={saving}>
					{saving ? 'Saving...' : editAllowedOnly ? 'Save Allowed Vessels' : 'Save Voyage Plan'}
				</button>
			</div>
		</section>
	</div>
{/if}

<style>
	.voyage-page {
		width: 100%;
		height: 100%;
		max-height: 100%;
		min-height: 0;
		padding: 14px;
		background: var(--color-base);
		color: var(--text-primary);
		overflow-y: auto;
		overflow-x: hidden;
		box-sizing: border-box;
		font-family:
			'Plus Jakarta Sans',
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	:global(.leaflet-container) {
		font-family:
			'Plus Jakarta Sans',
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

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

	:global(.leaflet-tooltip) {
		border: 1px solid #d9e2ec;
		border-radius: 10px;
		box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 900;
	}

	:global(.voyage-page .leaflet-popup-content-wrapper),
	:global(.voyage-plan-map-popup .leaflet-popup-content-wrapper) {
		overflow: hidden;
		border: 1px solid rgba(96, 165, 250, 0.22);
		border-radius: 14px;
		background: #0f172a !important;
		color: #f8fafc !important;
		box-shadow: 0 18px 42px rgba(15, 23, 42, 0.38);
	}

	:global(.voyage-plan-map-popup .leaflet-popup-content-wrapper) {
		width: 315px;
		max-width: 78vw;
	}

	:global(.asset-popup) {
		width: min(315px, 78vw);
	}

	:global(.voyage-page .leaflet-popup-content),
	:global(.voyage-plan-map-popup .leaflet-popup-content) {
		margin: 0;
		color: #f8fafc !important;
	}

	:global(.voyage-page .leaflet-popup-tip),
	:global(.voyage-plan-map-popup .leaflet-popup-tip) {
		background: #0f172a !important;
		border: 1px solid rgba(96, 165, 250, 0.22);
		box-shadow: 0 10px 22px rgba(15, 23, 42, 0.24);
	}

	:global(.voyage-page .leaflet-popup-close-button),
	:global(.voyage-plan-map-popup .leaflet-popup-close-button) {
		top: 10px;
		right: 12px;
		width: 24px;
		height: 24px;
		border-radius: 999px;
		background: rgba(30, 41, 59, 0.92);
		color: #cbd5e1 !important;
		font-size: 16px;
		line-height: 22px;
	}

	:global(.voyage-page .leaflet-popup-close-button:hover),
	:global(.voyage-plan-map-popup .leaflet-popup-close-button:hover) {
		background: rgba(59, 130, 246, 0.28);
		color: #ffffff !important;
	}

	:global(.asset-popup) {
		display: grid;
		width: min(310px, 78vw);
		overflow: hidden;
		border-radius: 14px;
		background: #0f172a;
		font-family:
			'Plus Jakarta Sans',
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	:global(.map-popup-hero) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 14px 52px 13px 16px;
		background:
			radial-gradient(circle at top left, rgba(37, 99, 235, 0.28), transparent 52%),
			linear-gradient(135deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.98));
		border-bottom: 1px solid rgba(148, 163, 184, 0.16);
	}

	:global(.map-popup-icon),
	:global(.route-popup-icon) {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 13px;
		background: rgba(37, 99, 235, 0.14);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}

	:global(.map-popup-icon img) {
		width: 27px;
		height: 27px;
		object-fit: contain;
		filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.28));
	}

	:global(.route-popup-icon) {
		color: #dbeafe;
		font-size: 13px;
		font-weight: 900;
	}

	:global(.map-popup-heading) {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	:global(.map-popup-heading span) {
		color: #60a5fa;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.1em;
		line-height: 1;
		text-transform: uppercase;
	}

	:global(.asset-popup strong) {
		color: #f8fafc;
		font-size: 14px;
		font-weight: 900;
		line-height: 1.15;
	}

	:global(.map-popup-heading strong) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.map-popup-hero em) {
		max-width: 78px;
		overflow: hidden;
		padding: 5px 8px;
		border: 1px solid rgba(96, 165, 250, 0.26);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.16);
		color: #bfdbfe;
		font-size: 10px;
		font-style: normal;
		font-weight: 900;
		line-height: 1;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	:global(.map-popup-body) {
		display: grid;
		gap: 7px;
		padding: 11px 14px 14px;
	}

	:global(.popup-info-row) {
		display: grid;
		grid-template-columns: minmax(82px, 0.8fr) minmax(0, 1.2fr);
		align-items: center;
		gap: 10px;
		min-height: 36px;
		padding: 9px 14px;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 12px;
		background: rgba(30, 41, 59, 0.74);
	}

	:global(.popup-info-row > span),
	:global(.asset-popup small) {
		color: #cbd5e1;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.05em;
		line-height: 1.35;
		text-transform: uppercase;
	}

	:global(.popup-info-row > strong),
	:global(.popup-coordinate-value),
	:global(.coordinate-copy-inline strong) {
		min-width: 0;
		color: #f8fafc;
		font-size: 12px;
		font-weight: 850;
		line-height: 1.2;
		text-align: right;
	}

	:global(.popup-coordinate-value .coordinate-copy-inline) {
		width: 100%;
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 7px;
	}

	:global(.map-popup-note) {
		margin: 0 10px 10px;
		padding: 8px 10px;
		border: 1px dashed rgba(96, 165, 250, 0.28);
		border-radius: 12px;
		background: rgba(37, 99, 235, 0.1);
		color: #bfdbfe;
		font-size: 11px;
		font-weight: 750;
		line-height: 1.35;
	}

	:global(.asset-popup .copy-coordinate-button),
	:global(.asset-popup button) {
		border-color: rgba(96, 165, 250, 0.34);
		background: rgba(37, 99, 235, 0.18);
		color: #bfdbfe;
	}

	:global(.asset-popup .copy-coordinate-button:hover),
	:global(.asset-popup button:hover) {
		background: rgba(37, 99, 235, 0.32);
		color: #ffffff;
	}

	:global(.route-marker) {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: 3px solid #ffffff;
		border-radius: 999px;
		background: #2563eb;
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.28);
		font-size: 12px;
		font-weight: 900;
	}

	:global(.route-marker.selected) {
		background: #ef4444;
		transform: scale(1.08);
	}

	:global(.route-marker.moving) {
		background: #f59e0b;
		animation: movingPulse 0.9s ease-in-out infinite;
	}

	@keyframes movingPulse {
		0%,
		100% {
			transform: scale(1);
		}

		50% {
			transform: scale(1.18);
		}
	}

	:global(*) {
		box-sizing: border-box;
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	.voyage-header-card,
	.panel,
	.empty-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.voyage-header-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px;
	}

	.page-kicker {
		display: inline-flex;
		width: fit-content;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.voyage-header-card h1 {
		margin: 8px 0 0;
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
		letter-spacing: -0.02em;
		color: var(--text-primary);
	}

	.voyage-header-card p {
		max-width: 760px;
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.45;
	}

	.header-actions,
	.route-title-actions,
	.action-row,
	.pagination-bar,
	.modal-footer,
	.map-mini-meta,
	.move-confirm-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.header-actions {
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.alert {
		margin-top: 14px;
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 900;
		line-height: 1.45;
	}

	.alert.error {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.alert.success {
		background: var(--color-success-muted);
		color: #047857;
		border: 1px solid #bbf7d0;
	}

	.empty-card,
	.empty-state,
	.empty-cell {
		padding: 28px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.5;
		text-align: center;
	}

	.empty-card {
		margin-top: 14px;
	}

	.empty-card h3 {
		margin-bottom: 8px;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
	}

	.voyage-grid {
		display: grid;
		grid-template-columns: minmax(520px, 1.08fr) minmax(410px, 0.92fr);
		gap: 14px;
		align-items: start;
		margin-top: 14px;
	}

	.bottom-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		margin-top: 14px;
	}

	.active-assignments-panel {
		margin-top: 14px;
	}

	.assignments-toolbar {
		align-items: flex-start;
	}

	.assign-panel {
		background:
			linear-gradient(180deg, rgba(30, 41, 59, 0.36), rgba(15, 23, 42, 0.14)),
			var(--color-surface);
	}

	.assign-toolbar {
		align-items: flex-start;
		padding-bottom: 14px;
	}

	.panel-kicker {
		display: inline-flex;
		width: fit-content;
		margin-bottom: 6px;
		padding: 4px 9px;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.18);
		color: #60a5fa;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.08em;
		line-height: 1;
		text-transform: uppercase;
	}

	.assign-card {
		display: grid;
		gap: 12px;
		padding: 14px;
	}

	.assign-plan-preview {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border: 1px solid rgba(96, 165, 250, 0.18);
		border-radius: 14px;
		background:
			radial-gradient(circle at top left, rgba(37, 99, 235, 0.2), transparent 48%),
			rgba(15, 23, 42, 0.32);
	}

	.assign-plan-preview div {
		min-width: 0;
	}

	.assign-plan-preview span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		line-height: 1;
		text-transform: uppercase;
	}

	.assign-plan-preview strong {
		display: block;
		overflow: hidden;
		margin-top: 6px;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 850;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.assign-plan-preview em {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 26px;
		padding: 5px 10px;
		border: 1px solid rgba(96, 165, 250, 0.26);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.16);
		color: #bfdbfe;
		font-size: 10px;
		font-style: normal;
		font-weight: 900;
		line-height: 1;
		white-space: nowrap;
	}

	.assign-form-grid {
		display: grid;
		grid-template-columns: minmax(190px, 1.1fr) minmax(190px, 1.1fr);
		gap: 12px;
		align-items: start;
	}

	.assign-field {
		min-width: 0;
		padding: 10px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 13px;
		background: rgba(15, 23, 42, 0.24);
	}

	.assign-field > span {
		display: block;
		margin-bottom: 7px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		line-height: 1;
		text-transform: uppercase;
	}

	.assign-field input,
	.assign-field select {
		height: 38px;
		min-height: 38px;
		border-color: rgba(148, 163, 184, 0.24);
		border-radius: 10px;
		background: rgba(30, 41, 59, 0.72);
		font-size: 12px;
		font-weight: 750;
	}

	.assign-field .field-note {
		display: block;
		margin-top: 7px;
	}

	.assign-action {
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		min-width: 0;
		padding: 10px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 13px;
		background: rgba(15, 23, 42, 0.18);
	}

	.assign-button {
		width: 100%;
		height: 38px;
		min-height: 38px;
		border-radius: 10px;
		box-shadow: 0 10px 22px rgba(37, 99, 235, 0.2);
	}

	.assignment-filter-grid {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) minmax(120px, 150px) auto;
		gap: 10px;
		align-items: end;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		background: rgba(15, 23, 42, 0.18);
	}

	.compact-alert {
		margin: 12px 14px 0;
	}

	.active-assignment-table-wrap {
		max-height: 360px;
	}

	.active-assignment-table-wrap td small {
		display: block;
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 700;
	}

	.assignment-progress {
		display: grid;
		gap: 5px;
		min-width: 130px;
	}

	.assignment-progress-track {
		width: 100%;
		height: 8px;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.24);
	}

	.assignment-progress-track span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #2563eb 0%, #14b8a6 100%);
		box-shadow: 0 0 14px rgba(37, 99, 235, 0.22);
	}

	.assignment-progress strong {
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 850;
	}

	.checkpoint-summary {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 5px;
		max-width: 280px;
	}

	.checkpoint-summary span,
	.checkpoint-summary small {
		display: inline-flex;
		align-items: center;
		min-height: 22px;
		padding: 4px 7px;
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.24);
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 750;
		line-height: 1;
	}

	.checkpoint-summary span:first-child {
		border-color: rgba(34, 197, 94, 0.28);
		background: rgba(34, 197, 94, 0.12);
		color: #86efac;
	}

	.panel {
		min-width: 0;
		padding: 0;
		overflow: hidden;
	}

	.panel-toolbar,
	.section-title,
	.modal-header,
	.map-mini-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
	}

	.panel-toolbar h2,
	.modal-header h2,
	.section-title h3 {
		color: var(--text-primary);
		font-size: 15px;
		line-height: 1.25;
		font-weight: 900;
		letter-spacing: -0.02em;
	}

	.panel-toolbar span,
	.detail-summary span,
	.section-title span,
	.map-mini-toolbar span,
	label {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.map-mini-meta {
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.map-mini-meta span {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		padding: 4px 8px;
		border-radius: 999px;
		border: 1px solid #d9e2ec;
		background: var(--color-surface);
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.map-mini-meta .asset-error {
		border-color: #fecaca;
		background: var(--color-danger-muted);
		color: #b91c1c;
	}

	.compact-title,
	.route-section-title {
		margin-top: 14px;
	}

	button,
	input,
	select {
		font: inherit;
	}

	button {
		height: 32px;
		min-height: 32px;
		border: none;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
		padding: 0 12px;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease,
			opacity 0.15s ease,
			transform 0.12s ease;
	}

	button:hover:not(:disabled) {
		background: #cbd5e1;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.primary-button {
		background: #2563eb;
		color: #ffffff;
	}

	.primary-button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.ghost-button,
	.toolbar-button {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.ghost-button:hover:not(:disabled),
	.toolbar-button:hover:not(:disabled) {
		background: #cbd5e1;
	}

	.danger,
	.ghost-danger {
		background: var(--color-danger-muted);
		color: #b91c1c;
	}

	.danger:hover:not(:disabled),
	.ghost-danger:hover:not(:disabled) {
		background: var(--color-danger-muted);
		color: #991b1b;
	}

	.search-input,
	input,
	select {
		width: 100%;
		height: 32px;
		min-height: 32px;
		min-width: 0;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		color: var(--text-primary);
		padding: 0 9px;
		font-size: 12px;
		font-weight: 700;
		outline: none;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease,
			background 0.15s ease;
	}

	.search-input {
		max-width: 230px;
	}

	input:focus,
	select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
		background: var(--color-elevated);
	}

	.table-wrap,
	.route-table-wrap,
	.route-editor,
	.preview-box {
		overflow: auto;
		background: var(--color-surface);
	}

	.table-wrap,
	.route-table-wrap {
		border-top: 1px solid #eef2f7;
	}

	.list-panel .table-wrap {
		max-height: 50vh;
	}

	.detail-panel .route-table-wrap {
		max-height: 38vh;
	}

	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 12px;
	}

	th,
	td {
		padding: 9px 10px;
		border-right: 1px solid rgba(255, 255, 255, 0.18);
		border-bottom: 1px solid #e5edf5;
		text-align: left;
		vertical-align: middle;
		white-space: nowrap;
	}

	th:last-child,
	td:last-child {
		border-right: 0;
	}

	th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: #2563eb;
		color: #ffffff;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	tbody td {
		background: var(--color-surface);
		color: var(--text-primary);
		font-weight: 700;
	}

	tbody tr:nth-child(even) td {
		background: var(--color-elevated);
	}

	tbody tr:hover td {
		background: var(--color-accent-muted);
	}

	tr.active-row td,
	.selected-point-row td {
		background: var(--color-accent-muted) !important;
	}

	tr.plan-in-use-row td {
		background: rgba(15, 23, 42, 0.32);
	}

	.strong {
		color: var(--text-primary);
		font-weight: 900;
	}

	.plan-name-cell {
		display: grid;
		gap: 4px;
		min-width: 0;
	}

	.plan-name-cell > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.plan-name-cell > small {
		color: #fbbf24;
		font-size: 10px;
		font-weight: 750;
		line-height: 1.25;
		white-space: normal;
	}

	.right,
	th.right,
	td.right {
		text-align: right;
	}

	td.actions {
		width: 218px;
		min-width: 218px;
		vertical-align: middle;
	}

	.action-row {
		justify-content: flex-end;
		flex-wrap: nowrap;
	}

	.icon-action,
	.icon-button,
	.move-point-btn,
	.mini-icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		line-height: 1;
	}

	.icon-action {
		width: 30px;
		height: 30px;
		min-height: 30px;
		font-size: 14px;
	}

	.icon-action:hover:not(:disabled) {
		background: var(--color-accent-muted);
		transform: translateY(-1px);
	}

	.icon-action:disabled {
		filter: grayscale(0.35);
	}

	.plan-lock-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 26px;
		padding: 5px 9px;
		border: 1px solid rgba(245, 158, 11, 0.34);
		border-radius: 999px;
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24;
		font-size: 10px;
		font-weight: 900;
		line-height: 1;
		white-space: nowrap;
	}

	.icon-action.active-toggle {
		background: var(--color-accent-muted);
		color: #1d4ed8;
	}

	.icon-action.danger,
	.icon-action.ghost-danger {
		background: var(--color-danger-muted);
		color: #b91c1c;
	}

	.icon-action.danger:hover:not(:disabled),
	.icon-action.ghost-danger:hover:not(:disabled) {
		background: var(--color-danger-muted);
		color: #991b1b;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 4px 9px;
		font-size: 10px;
		font-weight: 900;
		line-height: 1.2;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.badge.large {
		padding: 6px 10px;
	}

	.badge-active {
		border: 1px solid #bbf7d0;
		background: var(--color-success-muted);
		color: #047857;
	}

	.badge-muted {
		border: 1px solid #e2e8f0;
		background: var(--color-elevated);
		color: var(--text-secondary);
	}

	.pagination-bar {
		justify-content: flex-end;
		flex-wrap: wrap;
		border-top: 1px solid #e5edf5;
		background: var(--color-elevated);
		padding: 10px 12px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 800;
	}

	.pagination-bar select {
		width: auto;
	}

	.detail-summary {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		padding: 14px;
		background: var(--color-elevated);
	}

	.detail-summary div {
		min-width: 0;
		padding: 14px;
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: var(--color-surface);
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.detail-summary b {
		display: block;
		margin-top: 7px;
		overflow: hidden;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
		line-height: 1.15;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.allowed-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 12px 14px 14px;
	}


	.allowed-list span {
		height: auto;
		min-height: 28px;
		border: 1px solid #d9e2ec;
		border-radius: 999px;
		background: var(--color-elevated);
		color: var(--text-secondary);
		padding: 6px 10px;
		font-size: 11px;
		font-weight: 900;
	}

	.vessel-transfer {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		padding: 12px 14px 14px;
		align-items: stretch;
	}

	.transfer-actions {
		display: none;
	}

	.vessel-transfer.button-mode {
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
	}

	.vessel-transfer.button-mode .transfer-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 10px;
	}

	.vessel-transfer-box {
		min-width: 0;
		overflow: hidden;
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: var(--color-elevated);
	}

	.vessel-transfer-box.allowed {
		border-color: rgba(37, 99, 235, 0.24);
		background: rgba(37, 99, 235, 0.06);
	}

	.vessel-transfer-box.drop-ready {
		border-color: rgba(37, 99, 235, 0.72);
		background: rgba(37, 99, 235, 0.1);
		box-shadow:
			0 0 0 3px rgba(37, 99, 235, 0.12),
			inset 0 0 0 1px rgba(37, 99, 235, 0.1);
	}

	.transfer-box-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1px solid #d9e2ec;
		background: var(--color-surface);
	}

	.transfer-box-head strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 800;
	}

	.transfer-box-head span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 700;
	}

	.transfer-list {
		display: grid;
		align-content: start;
		gap: 7px;
		height: 190px;
		overflow-y: auto;
		padding: 10px;
	}

	.transfer-list button {
		width: 100%;
		height: auto;
		min-height: 40px;
		display: grid;
		justify-items: start;
		gap: 2px;
		padding: 7px 9px;
		border: 1px solid rgba(203, 213, 225, 0.85);
		border-radius: 10px;
		background: var(--color-surface);
		color: var(--text-primary);
		cursor: grab;
		text-align: left;
	}

	.vessel-transfer.button-mode .transfer-list button {
		cursor: pointer;
	}

	.transfer-list button:active {
		cursor: grabbing;
	}

	.transfer-list button:hover:not(:disabled) {
		border-color: rgba(37, 99, 235, 0.34);
		background: var(--color-accent-muted);
	}

	.transfer-list button.selected {
		border-color: #2563eb;
		background: #dbeafe;
		color: #1d4ed8;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
	}

	.transfer-list button.dragging {
		opacity: 0.48;
		transform: scale(0.985);
	}

	.transfer-list button span {
		font-size: 12px;
		font-weight: 800;
		line-height: 1.2;
	}

	.transfer-list button small,
	.transfer-list em {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 700;
		line-height: 1.25;
	}

	.transfer-list em {
		padding: 14px 10px;
		text-align: center;
	}

	.transfer-actions button {
		width: 38px;
		height: 38px;
		min-width: 38px;
		min-height: 38px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid rgba(96, 165, 250, 0.42);
		border-radius: 999px;
		background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
		color: #ffffff;
		font-size: 16px;
		font-weight: 800;
		box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
	}

	.transfer-actions button span {
		display: block;
		width: auto;
		line-height: 1;
		transform: translateY(-0.5px);
	}

	.transfer-actions button:hover:not(:disabled) {
		border-color: rgba(147, 197, 253, 0.72);
		background: linear-gradient(180deg, #60a5fa 0%, #2563eb 100%);
		transform: translateY(-1px);
	}

	.transfer-actions button:disabled {
		border-color: rgba(71, 85, 105, 0.72);
		background: rgba(30, 41, 59, 0.92);
		color: #94a3b8;
		box-shadow: none;
		opacity: 0.78;
	}

	.form-grid {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 12px;
		padding: 14px;
	}

	.form-grid.locked-section-shell {
		border: 1px solid rgba(245, 158, 11, 0.32);
		border-radius: 14px;
		background:
			linear-gradient(135deg, rgba(245, 158, 11, 0.08), transparent 44%),
			rgba(15, 23, 42, 0.38);
		overflow: hidden;
	}

	.form-lock-overlay,
	.locked-editor-overlay {
		position: absolute;
		z-index: 45;
		display: grid;
		place-items: center;
		padding: 18px;
		pointer-events: auto;
	}

	.form-lock-overlay {
		inset: 0;
		border-radius: inherit;
		background: rgba(15, 23, 42, 0.42);
		backdrop-filter: blur(1.5px);
	}

	.form-lock-overlay > div,
	.locked-editor-overlay > div {
		display: grid;
		gap: 5px;
		max-width: 360px;
		padding: 12px 14px;
		border: 1px solid rgba(245, 158, 11, 0.34);
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.9);
		color: #f8fafc;
		text-align: center;
		box-shadow: 0 16px 32px rgba(2, 6, 23, 0.32);
	}

	.form-lock-overlay strong,
	.locked-editor-overlay strong {
		font-size: 12px;
		font-weight: 750;
	}

	.form-lock-overlay span,
	.locked-editor-overlay span {
		color: #fcd34d;
		font-size: 10px;
		font-weight: 650;
		line-height: 1.35;
	}

	.modal-body .route-section-title {
		margin-top: 0;
	}

	.modal-body > .form-grid {
		padding: 0;
		margin: 0;
	}

	.form-grid.compact {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	label {
		display: grid;
		gap: 5px;
	}

	.field-note {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 700;
		line-height: 1.35;
		letter-spacing: 0;
		text-transform: none;
	}

	.field-note.warning-note {
		color: #fca5a5;
	}

	.switch-line {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		align-self: end;
		width: fit-content;
		min-height: 40px;
		border: 1px solid rgba(148, 163, 184, 0.26);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.42);
		padding: 7px 12px 7px 8px;
		color: var(--text-secondary);
		cursor: pointer;
		text-transform: none;
		transition:
			border-color 0.18s ease,
			background 0.18s ease,
			color 0.18s ease;
		user-select: none;
	}

	.switch-line input {
		position: absolute;
		width: 1px;
		height: 1px;
		min-height: 0;
		margin: 0;
		opacity: 0;
		pointer-events: none;
	}

	.switch-line span {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 9px;
		color: inherit;
		font-size: 12px;
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.01em;
	}

	.switch-line span::before {
		content: '';
		width: 34px;
		height: 20px;
		border: 1px solid rgba(148, 163, 184, 0.34);
		border-radius: 999px;
		background: rgba(30, 41, 59, 0.94);
		box-shadow: inset 0 1px 3px rgba(2, 6, 23, 0.34);
		transition:
			border-color 0.18s ease,
			background 0.18s ease;
	}

	.switch-line span::after {
		content: '';
		position: absolute;
		left: 3px;
		width: 14px;
		height: 14px;
		border-radius: 999px;
		background: #94a3b8;
		box-shadow: 0 3px 8px rgba(2, 6, 23, 0.28);
		transition:
			transform 0.18s ease,
			background 0.18s ease;
	}

	.switch-line:hover {
		border-color: rgba(96, 165, 250, 0.48);
		background: rgba(30, 41, 59, 0.66);
		color: var(--text-primary);
	}

	.switch-line input:checked + span {
		color: #bfdbfe;
	}

	.switch-line input:checked + span::before {
		border-color: rgba(96, 165, 250, 0.72);
		background: linear-gradient(135deg, #2563eb 0%, #14b8a6 100%);
	}

	.switch-line input:checked + span::after {
		background: #f8fafc;
		transform: translateX(14px);
	}

	.switch-line input:focus-visible + span::before {
		outline: 2px solid rgba(96, 165, 250, 0.82);
		outline-offset: 3px;
	}

	.file-box {
		position: relative;
		min-height: 42px;
		border: 1px dashed #93c5fd;
		border-radius: 12px;
		background: var(--color-accent-muted);
		padding: 12px;
		cursor: pointer;
		text-transform: none;
	}

	.file-box input {
		position: absolute;
		inset: 0;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.preview-box {
		margin: 0 14px 14px;
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.preview-box b {
		display: block;
		padding: 10px 12px;
		border-bottom: 1px solid #e5edf5;
		background: var(--color-elevated);
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 2500;
		display: flex;
		align-items: stretch;
		justify-content: center;
		padding: 0;
		background: rgba(15, 23, 42, 0.48);
		backdrop-filter: blur(3px);
		overflow: hidden;
		transition:
			left 0.24s cubic-bezier(0.22, 1, 0.36, 1),
			background 0.18s ease,
			backdrop-filter 0.18s ease;
	}

	:global(.app-shell:has(.sidebar.sidebar-open)) .modal-backdrop {
		left: 64px;
	}

	.modal-card {
		width: 100%;
		height: 100vh;
		max-height: 100vh;
		display: grid;
		grid-template-rows: auto 1fr auto;
		overflow: hidden;
		border: 1px solid #d9e2ec;
		border-radius: 0;
		background: var(--color-surface);
		box-shadow: none;
		transition:
			width 0.24s cubic-bezier(0.22, 1, 0.36, 1),
			transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.modal-header,
	.modal-footer {
		margin: 0;
		padding: 14px 18px;
	}

	.modal-lock-note {
		margin: 7px 0 0;
		color: #fbbf24;
		font-size: 11px;
		font-weight: 750;
		line-height: 1.4;
	}

	.modal-footer {
		justify-content: flex-end;
		border-top: 1px solid #e5edf5;
		border-bottom: 0;
		background: var(--color-elevated);
	}

	.modal-body {
		min-height: 0;
		overflow: auto;
		padding: 14px;
		background: var(--color-surface);
	}

	.icon-button {
		width: 32px;
		height: 32px;
		min-height: 32px;
		border-radius: 999px;
		font-size: 20px;
	}

	.vessel-picker {
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: var(--color-surface);
		margin-bottom: 0;
		overflow: hidden;
		margin-top: 14px;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.vessel-picker .compact-title {
		margin: 0;
	}

	.route-section-title {
		border: 1px solid #d9e2ec;
		border-bottom: 0;
		border-radius: 12px 12px 0 0;
		background: var(--color-surface);
	}

	.route-title-actions {
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.route-title-actions button {
		height: 30px;
		min-height: 30px;
		padding: 0 10px;
		font-size: 10px;
	}

	.route-map-overlay-toolbar .route-title-actions {
		flex: 0 0 auto;
		flex-wrap: nowrap;
	}

	.route-map-overlay-toolbar .toolbar-button {
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 10px;
		background: rgba(30, 41, 59, 0.86);
		color: #e2e8f0;
	}

	.route-map-overlay-toolbar .toolbar-button:hover:not(:disabled) {
		border-color: rgba(96, 165, 250, 0.42);
		background: rgba(37, 99, 235, 0.84);
		color: #ffffff;
	}

	.route-map-overlay-toolbar .toolbar-button.ghost-danger {
		border-color: rgba(248, 113, 113, 0.32);
		background: rgba(127, 29, 29, 0.74);
		color: #fecaca;
	}

	.route-map-overlay-toolbar .toolbar-button.ghost-danger:hover:not(:disabled) {
		background: rgba(220, 38, 38, 0.88);
		color: #ffffff;
	}

	.route-map-editor {
		position: relative;
		display: grid;
		grid-template-columns: minmax(360px, 0.78fr) minmax(480px, 1.42fr);
		gap: 0;
		height: min(700px, calc(100vh - 190px));
		margin: -14px -14px 14px;
		min-height: 560px;
		max-height: none;
		border: 1px solid #d9e2ec;
		background: var(--color-surface);
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.route-map-editor.locked-editor {
		border-color: rgba(245, 158, 11, 0.35);
		background:
			linear-gradient(135deg, rgba(245, 158, 11, 0.08), transparent 34%),
			var(--color-surface);
	}

	.route-map-editor.locked-editor .route-map,
	.route-map-editor.locked-editor .route-marker {
		cursor: not-allowed;
	}

	.route-map-editor.locked-editor input:disabled,
	.form-grid input:disabled,
	.switch-line input:disabled + span {
		cursor: not-allowed;
		opacity: 0.68;
	}

	.route-map-editor.locked-editor .point-hint {
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24;
	}

	.locked-editor-overlay {
		inset: 0;
		background:
			radial-gradient(circle at 50% 46%, rgba(245, 158, 11, 0.14), transparent 28%),
			rgba(2, 6, 23, 0.38);
		backdrop-filter: blur(1px);
	}

	.route-point-panel,
	.route-map-card {
		min-width: 0;
		background: var(--color-surface);
	}

	.route-point-panel {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		overflow: hidden;
		border-right: 1px solid #e5edf5;
	}

	.point-hint {
		border-bottom: 1px solid #e5edf5;
		background: var(--color-elevated);
		color: var(--text-secondary);
		padding: 10px 12px;
		font-size: 11px;
		font-weight: 800;
		line-height: 1.45;
	}

	.route-map-card {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		overflow: hidden;
	}

	.map-mini-toolbar {
		margin: 0;
		padding: 10px 12px;
	}

	.route-map-shell {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 100%;
		overflow: hidden;
	}

	.route-map-shell:fullscreen,
	.route-map-shell.is-fullscreen {
		width: 100vw;
		height: 100vh;
		min-height: 100vh;
		background: #0b1120;
	}

	.route-map-shell:-webkit-full-screen {
		width: 100vw;
		height: 100vh;
		min-height: 100vh;
		background: #0b1120;
	}

	.route-map-shell .route-map,
	.route-map {
		position: relative;
		isolation: isolate;
		width: 100%;
		height: 100%;
		min-height: 100%;
		background: var(--color-accent-muted);
	}

	:global(.voyage-page .route-map .leaflet-map-pane),
	:global(.voyage-page .route-map .leaflet-pane) {
		position: absolute;
		top: 0;
		left: 0;
	}

	:global(.voyage-page .route-map .leaflet-map-pane) {
		z-index: 1;
	}

	:global(.voyage-page .route-map .leaflet-tile-pane) {
		z-index: 200;
		opacity: 1 !important;
		filter: none !important;
	}

	:global(.voyage-page .route-map .leaflet-overlay-pane) {
		z-index: 400;
	}

	:global(.voyage-page .route-map .leaflet-shadow-pane) {
		z-index: 500;
	}

	:global(.voyage-page .route-map .leaflet-marker-pane) {
		z-index: 600;
	}

	:global(.voyage-page .route-map .leaflet-tooltip-pane) {
		z-index: 700;
	}

	:global(.voyage-page .route-map .leaflet-popup-pane) {
		z-index: 800;
	}

	:global(.voyage-page .route-map .leaflet-control-container) {
		position: absolute;
		inset: 0;
		z-index: 980;
		pointer-events: none;
	}

	:global(.voyage-page .route-map.vms-map-controls .leaflet-top.leaflet-left) {
		top: auto !important;
		right: auto !important;
		bottom: 14px !important;
		left: 14px !important;
		padding: 0 !important;
		z-index: 980;
		pointer-events: auto;
		align-items: flex-end;
	}

	:global(.voyage-page .route-map.vms-map-controls .leaflet-top.leaflet-left .leaflet-control) {
		z-index: 981;
	}

	.route-map-native-controls {
		position: absolute;
		left: 14px;
		bottom: 14px;
		z-index: 940;
		display: flex;
		align-items: flex-end;
		gap: 8px;
		pointer-events: auto;
	}

	.route-map-zoom-control {
		width: auto;
		height: 34px;
		display: grid;
		grid-template-columns: 34px 34px;
		grid-template-rows: 34px;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.82);
		box-shadow: var(--shadow-md);
		backdrop-filter: blur(12px);
	}

	.route-map-zoom-control button {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: #eaf2ff;
		font: inherit;
		font-size: 19px;
		font-weight: 800;
		line-height: 1;
		cursor: pointer;
	}

	.route-map-zoom-control button:first-child {
		border-right: 1px solid rgba(255, 255, 255, 0.12);
	}

	.route-map-zoom-control button:hover {
		background: rgba(37, 99, 235, 0.28);
		color: #ffffff;
	}

	.route-map-scale-control {
		min-height: 34px;
		min-width: 124px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 6px 5px 9px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.82);
		box-shadow: var(--shadow-md);
		color: #eaf2ff;
		backdrop-filter: blur(12px);
	}

	.route-map-scale-bar {
		min-width: 36px;
		max-width: 112px;
		display: inline-flex;
		align-items: center;
		padding-bottom: 3px;
		border-bottom: 2px solid rgba(147, 197, 253, 0.95);
		transition: width 0.16s ease;
	}

	.route-map-scale-bar span {
		white-space: nowrap;
		color: #eaf2ff;
		font-size: 10px;
		font-weight: 800;
		line-height: 1;
	}

	.route-map-scale-control select {
		width: 45px;
		height: 26px;
		min-height: 26px;
		padding: 0 7px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 10px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
			rgba(30, 41, 59, 0.92);
		color: #e5edff;
		font-size: 11px;
		font-weight: 800;
		line-height: 1;
		outline: 0;
		cursor: pointer;
		appearance: none;
		text-align: center;
		text-align-last: center;
	}

	.route-map-scale-control select:hover {
		border-color: rgba(147, 197, 253, 0.42);
		background:
			linear-gradient(180deg, rgba(59, 130, 246, 0.18), rgba(255, 255, 255, 0.02)),
			rgba(30, 41, 59, 0.95);
	}

	.route-map-scale-control select:focus-visible {
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28);
	}

	.route-map-scale-control select option {
		background: #0f172a;
		color: #eaf2ff;
	}

	.route-map-fullscreen-btn {
		position: absolute;
		right: 14px;
		bottom: 14px;
		z-index: 930;
		width: 42px;
		height: 42px;
		padding: 0;
		display: inline-grid;
		place-items: center;
		border: 1px solid rgba(147, 197, 253, 0.42);
		border-radius: 14px;
		background:
			linear-gradient(180deg, rgba(37, 99, 235, 0.24), rgba(15, 23, 42, 0.04)),
			rgba(15, 23, 42, 0.88);
		color: #eaf2ff;
		box-shadow:
			0 14px 30px rgba(15, 23, 42, 0.28),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(12px) saturate(1.12);
		cursor: pointer;
		transition:
			transform 0.16s ease,
			background 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.16s ease;
	}

	.route-map-fullscreen-btn span {
		display: inline-grid;
		place-items: center;
		width: 25px;
		height: 25px;
		border-radius: 10px;
		background: rgba(37, 99, 235, 0.52);
		color: #ffffff;
		font-size: 18px;
		font-weight: 900;
		line-height: 1;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
	}

	.route-map-fullscreen-btn:hover {
		transform: translateY(-1px);
		border-color: rgba(191, 219, 254, 0.72);
		background:
			linear-gradient(180deg, rgba(37, 99, 235, 0.34), rgba(15, 23, 42, 0.08)),
			rgba(15, 23, 42, 0.94);
		box-shadow:
			0 18px 34px rgba(15, 23, 42, 0.34),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}

	.route-map-fullscreen-btn.is-fullscreen span {
		background: rgba(248, 113, 113, 0.22);
		color: #fecaca;
	}

	.route-map-legend {
		display: grid;
		gap: 10px;
		padding: 12px 14px;
		border-top: 1px solid #e5edf5;
		background: var(--color-elevated);
		color: var(--text-primary);
	}

	.legend-group {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		column-gap: 14px;
		row-gap: 7px;
		min-width: 0;
	}

	.legend-title {
		flex: 0 0 66px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 20px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 700;
		line-height: 1.2;
		white-space: nowrap;
	}

	.legend-route-dot {
		width: 12px;
		height: 12px;
		border: 2px solid #ffffff;
		border-radius: 999px;
		background: #2563eb;
		box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.18);
	}

	.legend-route-dot.selected {
		background: #ef4444;
	}

	.legend-route-dot.moving {
		background: #f59e0b;
	}

	.legend-route-line {
		width: 24px;
		height: 4px;
		border-radius: 999px;
		background: #2f65e8;
		box-shadow: 0 0 0 1px rgba(47, 101, 232, 0.2);
	}

	.legend-asset-icon {
		width: 18px;
		height: 18px;
		object-fit: contain;
		filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.25));
	}

	.legend-zone-swatch {
		width: 20px;
		height: 14px;
		border: 2px dashed var(--zone-color, #38bdf8);
		border-radius: 5px;
		background: color-mix(in srgb, var(--zone-fill, #0ea5e9) 24%, transparent);
		flex: 0 0 auto;
	}

	:global(.vms-zone-popup-wrapper .leaflet-popup-content-wrapper) {
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.94);
		color: #f8fafc;
		box-shadow: 0 18px 36px rgba(15, 23, 42, 0.36);
		overflow: hidden;
	}

	:global(.vms-zone-popup-wrapper .leaflet-popup-content) {
		margin: 0;
		width: 180px !important;
	}

	:global(.vms-zone-popup-wrapper .leaflet-popup-tip) {
		background: rgba(15, 23, 42, 0.94);
	}

	:global(.vms-zone-popup) {
		display: grid;
		gap: 5px;
		padding: 10px 12px;
	}

	:global(.vms-zone-popup strong) {
		color: #f8fafc;
		font-size: 13px;
		font-weight: 800;
	}

	:global(.vms-zone-popup span) {
		color: #94a3b8;
		font-size: 11px;
		font-weight: 650;
	}

	:global(.vms-zone-tooltip) {
		border: 1px solid rgba(96, 165, 250, 0.26);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.88);
		color: #f8fafc;
		font-size: 10px;
		font-weight: 800;
		box-shadow: 0 10px 20px rgba(15, 23, 42, 0.28);
	}

	.route-map-overlay-toolbar {
		position: absolute;
		top: 14px;
		left: 14px;
		right: 14px;
		z-index: 520;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.88);
		color: #f8fafc;
		box-shadow: 0 16px 38px rgba(15, 23, 42, 0.22);
		backdrop-filter: blur(14px);
		pointer-events: auto;
	}

	.route-map-title {
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	.route-map-title h3 {
		margin: 0;
		color: #f8fafc;
		font-size: 15px;
		line-height: 1.15;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	.route-map-title span {
		overflow: hidden;
		color: rgba(203, 213, 225, 0.92);
		font-size: 11px;
		font-weight: 600;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.route-editor {
		width: 100%;
		height: 100%;
		max-height: none;
		overflow-x: hidden;
		overflow-y: auto;
		border: 0;
		border-radius: 0;
	}

	.route-editor table {
		width: 100%;
		min-width: 0;
		table-layout: fixed;
	}

	.route-editor th,
	.route-editor td {
		white-space: normal;
		padding: 7px 6px;
	}

	.route-editor th:nth-child(1),
	.route-editor td:nth-child(1) {
		width: 48px;
	}

	.route-editor th:nth-child(2),
	.route-editor td:nth-child(2),
	.route-editor th:nth-child(3),
	.route-editor td:nth-child(3) {
		width: 30%;
	}

	.route-editor th:nth-child(4),
	.route-editor td:nth-child(4) {
		width: 66px;
	}

	.route-editor th:nth-child(5),
	.route-editor td:nth-child(5) {
		width: 44px;
	}

	.route-editor input {
		width: 100%;
		min-width: 0;
		height: 30px;
		min-height: 30px;
		padding: 0 6px;
		font-size: 11px;
	}

	.coordinate-input-wrap {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 6px;
	}

	.route-editor .icon-action {
		width: 28px;
		height: 28px;
		min-height: 28px;
		padding: 0;
	}

	.point-context-menu {
		position: absolute;
		z-index: 1000;
		min-width: 160px;
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: var(--color-surface);
		box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
		transform: translate(8px, 8px);
		overflow: hidden;
	}

	.context-title {
		border-bottom: 1px solid #e5edf5;
		background: var(--color-elevated);
		color: var(--text-primary);
		padding: 9px 11px;
		font-size: 11px;
		font-weight: 900;
	}

	.point-context-menu button {
		width: 100%;
		height: 34px;
		min-height: 34px;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		border: 0;
		border-bottom: 1px solid #edf2f7;
		background: var(--color-surface);
		color: var(--text-primary);
		padding: 0 11px;
		font-size: 11px;
		font-weight: 800;
		text-align: left;
	}

	.point-context-menu button:last-child {
		border-bottom: 0;
	}

	.point-context-menu button:hover:not(:disabled) {
		background: var(--color-accent-muted);
		color: #1d4ed8;
	}

	.point-context-menu button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.point-context-menu .danger-action {
		color: #b91c1c;
	}

	.point-context-menu .danger-action:hover:not(:disabled) {
		background: var(--color-danger-muted);
		color: #991b1b;
	}

	.move-point-popover {
		position: absolute;
		z-index: 1300;
		display: flex;
		align-items: center;
		gap: 5px;
		transform: translate(-50%, -52px);
		pointer-events: auto;
	}

	.move-point-btn {
		width: 32px;
		height: 32px;
		min-height: 32px;
		border-radius: 999px;
		font-size: 16px;
		font-weight: 900;
		box-shadow: 0 6px 16px rgba(15, 23, 42, 0.25);
	}

	.move-point-btn.confirm {
		border: 2px solid #22c55e;
		background: #dcfce7;
		color: #166534;
	}

	.move-point-btn.confirm:hover:not(:disabled) {
		background: #bbf7d0;
		color: #14532d;
	}

	.move-point-btn.cancel {
		border: 2px solid #ef4444;
		background: var(--color-danger-muted);
		color: #991b1b;
	}

	.move-point-btn.cancel:hover:not(:disabled) {
		background: var(--color-danger-muted);
		color: #7f1d1d;
	}

	@media (max-width: 1180px) {
		.voyage-grid,
		.bottom-grid,
		.assign-form-grid,
		.assignment-filter-grid,
		.route-map-editor {
			grid-template-columns: 1fr;
		}

		.route-map-editor {
			height: auto;
			min-height: 0;
			overflow: visible;
		}

		.modal-body {
			grid-template-rows: minmax(0, 1fr);
		}

		.route-map-card,
		.route-map-shell,
		.route-map-shell .route-map,
		.route-map {
			min-height: 560px;
		}

		.detail-summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.route-point-panel {
			order: 2;
			min-height: 260px;
			border-right: 0;
			border-top: 1px solid #e5edf5;
			border-bottom: 0;
		}

		.route-point-panel .route-editor {
			height: auto;
			max-height: 320px;
		}

		.route-map-card {
			order: 1;
		}

		.modal-card {
			width: 100%;
			height: 100vh;
			max-height: 100vh;
		}
	}

	@media (max-width: 720px) {
		.voyage-page {
			padding: 10px;
		}

		.voyage-header-card,
		.panel-toolbar,
		.section-title,
		.modal-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.header-actions,
		.route-title-actions,
		.form-grid,
		.assign-form-grid,
		.form-grid.compact,
		.detail-summary {
			grid-template-columns: 1fr;
			width: 100%;
		}

		.assign-card {
			padding: 12px;
		}

		.assign-plan-preview {
			align-items: flex-start;
			flex-direction: column;
		}

		.assign-plan-preview em,
		.assign-button {
			width: 100%;
		}

		.header-actions,
		.route-title-actions {
			justify-content: flex-start;
		}

		.header-actions button,
		.route-title-actions button,
		.form-grid button,
		.search-input {
			width: 100%;
			max-width: none;
		}

		.modal-backdrop {
			inset: 0;
			padding: 0;
		}

		:global(.app-shell:has(.sidebar.sidebar-open)) .modal-backdrop {
			left: 0;
		}

		.modal-card {
			width: 100%;
			height: 100vh;
			max-height: 100vh;
			border-radius: 0;
		}

		.modal-body {
			padding: 12px;
			grid-template-rows: minmax(0, 1fr);
		}

		.route-map-overlay-toolbar {
			align-items: stretch;
			flex-direction: column;
		}

		.vessel-transfer {
			grid-template-columns: 1fr;
		}

		.transfer-actions {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 10px;
			order: 2;
			flex-direction: row;
			width: 100%;
		}

		.transfer-actions button {
			width: 42px;
			height: 42px;
			min-width: 42px;
			min-height: 42px;
			font-size: 14px;
		}

		.vessel-transfer-box {
			order: 1;
		}

		.vessel-transfer-box.allowed {
			order: 3;
		}

		.route-map-card,
		.route-map-shell,
		.route-map-shell .route-map,
		.route-map {
			min-height: 480px;
		}

		.route-point-panel .route-editor {
			max-height: 280px;
		}
	}
</style>
