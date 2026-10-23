<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { onMount, tick } from 'svelte';
	import { apiRequest } from '$lib/api/authApi.js';
	import { browser } from '$app/environment';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import VoyagePlansHeader from './VoyagePlansHeader.svelte';
	import './voyage-plans-page.css';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import { getFleetAssets } from '$lib/api/fleetApi.js';
	import { activeMenu } from '$lib/stores/appNavigation.svelte.js';
	import { getAssetIconUrl, getAssetTypeLabel, getAssetTypeValue } from '$lib/utils/assetIcons.js';
	import {
		addMapZonesToLeafletMap,
		isZoneAsset,
		normalizeMapZonesFromAssets
	} from '$lib/utils/mapZones.js';
	import {
		MAP_SOURCES,
		addMapTileLayer,
		getMapSourceId,
		setStoredMapSourceId,
		switchMapTileLayer
	} from '$lib/utils/mapStyle.js';
	import {
		createCopyableCoordinateHtml,
		handleCoordinateCopyClick
	} from '$lib/utils/coordinateClipboard.js';
	import { matchesSearch, sortByAlpha } from '$lib/utils/alphaSort.js';
	import 'leaflet/dist/leaflet.css';

	const PAGE_SIZE_OPTIONS = [10, 20, 50];
	const ASSET_LEGEND_TYPES = [
		'anchor',
		'buoy',
		'dock',
		'shipyard',
		'mess',
		'office',
		'fso',
		'rig',
		'whp'
	];
	const mapSourceOptions = Object.values(MAP_SOURCES);

	let loading = false;
	let active = false;
	let saving = false;
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
		fileName: '',
		previewRows: [],
		importedCount: 0,
		loading: false,
		previewReady: false,
		message: '',
		error: ''
	};
	let importPreviewRequestId = 0;

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
	let routeMapScale = {
		metricLabel: '- km',
		nauticalLabel: '- NM',
		totalWidth: 86,
		metricStart: 0,
		metricLabelLeft: 43,
		nauticalStart: 12,
		nauticalLabelLeft: 49
	};
	let activeMapSourceId = getMapSourceId();
	let showPlanMapView = false;
	let planViewMapContainer;
	let planViewMap;
	let planViewRouteLine;
	let planViewRouteLayer;
	let planViewAssetLayer;
	let planViewZoneLayer;
	let planViewResizeObserver = null;

	let assets = [];
	let zones = [];
	let assetsLoading = false;
	let assetsError = '';
	let savedRoutePoints = [];
	let savedRoutePointsLoading = false;
	let savedRoutePointsError = '';
	let savedRoutePointSearchTimer = null;
	let savedRoutePointsRequestToken = 0;
	let savedRoutePointSearchIndex = null;
	let routePointNameDropdownCloseTimer = null;
	let activeRoutePointNameIndex = null;
	let mapInitializing = false;
	let routeMapResizeObserver = null;
	let isRouteMapFullscreen = false;

	const SAVED_ROUTE_POINT_PAGE_SIZE = 100;
	const SAVED_ROUTE_POINT_SEARCH_DELAY_MS = 1000;

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
						saved_point_id: '',
						source: '',
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

	function formatCoordinate(value) {
		const number = Number(value);
		return Number.isFinite(number) ? number.toFixed(5) : '-';
	}

	function isFilledCoordinateValue(value) {
		return value !== '' && value !== null && value !== undefined;
	}

	const INDONESIA_CENTER = [-2.5489, 118.0149];
	const INDONESIA_ZOOM = 5;
	const ROUTE_SCALE_MAX_WIDTH = 132;

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

	function zoomRouteMap(direction) {
		if (!routeMap) return;

		if (direction === 'in') {
			routeMap.zoomIn();
		} else {
			routeMap.zoomOut();
		}
	}

	function selectMapSource(sourceId) {
		const nextSourceId = setStoredMapSourceId(sourceId);
		activeMapSourceId = nextSourceId;

		if (L && routeMap) {
			switchMapTileLayer(L, routeMap, nextSourceId);
			updateRouteMapScale();
		}

		if (L && planViewMap) {
			switchMapTileLayer(L, planViewMap, nextSourceId);
		}
	}

	function updateRouteMapScale() {
		if (!routeMap?._loaded) {
			routeMapScale = {
				metricLabel: '- km',
				nauticalLabel: '- NM',
				totalWidth: Math.round(ROUTE_SCALE_MAX_WIDTH * 0.72),
				metricStart: 0,
				metricLabelLeft: Math.round(ROUTE_SCALE_MAX_WIDTH * 0.36),
				nauticalStart: Math.round(ROUTE_SCALE_MAX_WIDTH * 0.1),
				nauticalLabelLeft: Math.round(ROUTE_SCALE_MAX_WIDTH * 0.41)
			};
			return;
		}

		const size = routeMap.getSize?.();
		if (!size?.x || !size?.y) return;

		const y = size.y / 2;
		const maxWidth = getRouteResponsiveScaleWidth(ROUTE_SCALE_MAX_WIDTH, size.x);
		const maxMeters =
			routeMap.distance(
				routeMap.containerPointToLatLng([0, y]),
				routeMap.containerPointToLatLng([maxWidth, y])
			) || 0;

		routeMapScale = getRouteScale(maxMeters, maxWidth);
	}

	function getRouteScale(maxMeters, maxWidth) {
		if (!Number.isFinite(maxMeters) || maxMeters <= 0) {
			return {
				metricLabel: '- km',
				nauticalLabel: '- NM',
				width: Math.round(maxWidth * 0.72)
			};
		}

		const maxKm = maxMeters / 1000;
		const km = getRouteRoundScaleNumber(maxKm);
		const metricWidth = getRouteScaleWidth(km / maxKm, maxWidth);

		const maxNauticalMiles = maxMeters / 1852;
		const nauticalMiles = getRouteRoundScaleNumber(maxNauticalMiles);
		const nauticalWidth = getRouteScaleWidth(nauticalMiles / maxNauticalMiles, maxWidth);
		const totalWidth = Math.max(metricWidth, nauticalWidth);
		const metricStart = Math.max(0, totalWidth - metricWidth);
		const nauticalStart = Math.max(0, totalWidth - nauticalWidth);

		return {
			metricLabel: `${formatRouteScaleNumber(km)} km`,
			nauticalLabel: `${formatRouteScaleNumber(nauticalMiles)} NM`,
			totalWidth,
			metricStart,
			metricLabelLeft: metricStart + metricWidth / 2,
			nauticalStart,
			nauticalLabelLeft: nauticalStart + nauticalWidth / 2
		};
	}

	function getRouteResponsiveScaleWidth(maxWidth, mapWidth) {
		if (!Number.isFinite(mapWidth) || mapWidth <= 0) return maxWidth;
		return Math.max(76, Math.min(maxWidth, Math.round(mapWidth * 0.28)));
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

			addMapTileLayer(leaflet, routeMap);

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

	function getPlanValidRoutePoints(plan = selectedPlan) {
		return (plan?.planData || [])
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

	function openPlanMapView(plan = selectedPlan) {
		if (!plan) return;
		selectedPlan = plan;
		selectedPlanId = plan.id;
		showPlanMapView = true;

		tick().then(initializePlanViewMap);
	}

	function closePlanMapView() {
		showPlanMapView = false;
		destroyPlanViewMap();
	}

	async function initializePlanViewMap() {
		if (!browser || !showPlanMapView || !planViewMapContainer || planViewMap) return;

		const leaflet = await ensureLeaflet();
		if (!leaflet || !planViewMapContainer || !showPlanMapView) return;

		planViewMap = leaflet.map(planViewMapContainer, {
			zoomControl: false,
			preferCanvas: true
		});

		addMapTileLayer(leaflet, planViewMap);
		planViewZoneLayer = addMapZonesToLeafletMap(leaflet, planViewMap, zones, {
			paneName: 'voyagePlanViewZonePane',
			zIndex: 355
		});
		planViewAssetLayer = leaflet.layerGroup().addTo(planViewMap);
		planViewRouteLayer = leaflet.layerGroup().addTo(planViewMap);
		planViewRouteLine = leaflet
			.polyline([], {
				color: '#2f65e8',
				weight: 4,
				opacity: 0.95
			})
			.addTo(planViewMap);

		renderPlanViewMap();
		setupPlanViewResizeObserver();

		[0, 80, 180, 360].forEach((delay) => {
			setTimeout(() => {
				if (!planViewMap) return;
				planViewMap.invalidateSize({ pan: false });
				renderPlanViewMap(true);
			}, delay);
		});
	}

	function setupPlanViewResizeObserver() {
		if (!browser || !planViewMapContainer || !planViewMap || typeof ResizeObserver === 'undefined')
			return;

		planViewResizeObserver?.disconnect?.();
		planViewResizeObserver = new ResizeObserver(() => {
			planViewMap?.invalidateSize?.({ pan: false });
		});
		planViewResizeObserver.observe(planViewMapContainer);
	}

	function renderPlanViewMap(shouldFit = true) {
		if (!L || !planViewMap || !planViewRouteLayer || !planViewRouteLine) return;

		planViewRouteLayer.clearLayers();
		planViewAssetLayer?.clearLayers();

		assets.forEach((asset) => {
			const marker = L.marker([asset.latitude, asset.longitude], {
				icon: createAssetMarkerIcon(asset),
				interactive: false
			});
			marker.addTo(planViewAssetLayer);
		});

		const validPoints = getPlanValidRoutePoints(selectedPlan);
		const latLngs = validPoints.map((point) => [point.latitude, point.longitude]);
		planViewRouteLine.setLatLngs(latLngs);

		validPoints.forEach((point, index) => {
			const isFirst = index === 0;
			const isLast = index === validPoints.length - 1;
			const marker = L.marker([point.latitude, point.longitude], {
				icon: L.divIcon({
					className: '',
					html: `
						<div class="route-marker plan-view ${isFirst ? 'start' : ''} ${isLast ? 'end' : ''}">
							${isFirst ? 'S' : isLast ? 'E' : point.order || index + 1}
						</div>
					`,
					iconSize: [30, 30],
					iconAnchor: [15, 15]
				})
			});

			marker.addTo(planViewRouteLayer);
		});

		if (shouldFit && validPoints.length >= 2) {
			planViewMap.fitBounds(L.latLngBounds(latLngs), {
				padding: [38, 38],
				maxZoom: 13
			});
		} else if (shouldFit && validPoints.length === 1) {
			planViewMap.setView(latLngs[0], 12);
		} else if (!planViewMap._loaded) {
			planViewMap.setView(INDONESIA_CENTER, INDONESIA_ZOOM);
		} else if (shouldFit) {
			planViewMap.setView(INDONESIA_CENTER, INDONESIA_ZOOM);
		}
	}

	function destroyPlanViewMap() {
		planViewResizeObserver?.disconnect?.();
		planViewResizeObserver = null;

		if (planViewMap) {
			planViewMap.off();
			planViewMap.remove();
		}

		planViewMap = null;
		planViewRouteLine = null;
		planViewRouteLayer = null;
		planViewAssetLayer = null;
		planViewZoneLayer = null;
	}

	function openRouteMapAfterRender() {
		tick().then(async () => {
			if (!showForm) return;
			await initializeRouteMap();
			refreshRouteMapLayout();
			refreshRouteMap(true);
		});
	}

	function addRoutePointFromLatLng(latlng, undoLabel = 'Add point', pointMeta = {}) {
		pushUndoState(undoLabel);

		const lat = roundCoord(latlng.lat);
		const lng = roundCoord(latlng.lng);
		const name = normalizeRoutePointName(pointMeta.name);
		const savedPointId = pointMeta.saved_point_id || pointMeta.savedPointId || '';
		const source = normalizePlanRoutePointSource(pointMeta.source, savedPointId);
		const speedKn =
			pointMeta.speed_kn === null || pointMeta.speed_kn === undefined ? '' : pointMeta.speed_kn;

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
							name,
							saved_point_id: savedPointId,
							source,
							latitude: lat,
							longitude: lng,
							speed_kn: speedKn !== '' ? speedKn : point.speed_kn
						}
					: point
			);

			selectedPointIndex = emptyIndex;
		} else {
			const newPoint = {
				order: form.planData.length + 1,
				name,
				saved_point_id: savedPointId,
				source,
				latitude: lat,
				longitude: lng,
				speed_kn: speedKn
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

		addRoutePointFromLatLng(latlng, `Reuse route point ${point.order || point.index + 1}`, {
			name: point.name,
			saved_point_id: getPointSavedPointId(point),
			source: getPointSource(point),
			speed_kn: point.speed_kn
		});
	}

	function updatePointCoordinate(index, latlng) {
		if (editAllowedOnly) return;

		pushUndoState('Drag point');

		form.planData = form.planData.map((point, pointIndex) =>
			pointIndex === index
				? {
						...point,
						saved_point_id: '',
						source: '',
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
		return matchesSearch(q, [plan.voyageName]);
	});
	$: allowedVesselIdSet = new Set(form.allowedVesselIds.map(Number));
	$: selectedAllowedVessels = sortByAlpha(
		vessels.filter((v) => allowedVesselIdSet.has(Number(v.id))),
		(vessel) => vessel.vesselName,
		(vessel) => vessel.deviceId
	);
	$: notAllowedVessels = sortByAlpha(
		vessels.filter((v) => !allowedVesselIdSet.has(Number(v.id))),
		(vessel) => vessel.vesselName,
		(vessel) => vessel.deviceId
	);
	$: selectedAssignPlan = getAssignmentPlan(assignForm.voyagePlanId);
	$: assignableVessels = getAssignableVessels(assignForm.voyagePlanId);
	$: routePointNameOptions = buildRoutePointNameOptions(savedRoutePoints);
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
		return {
			order,
			name: '',
			saved_point_id: '',
			source: '',
			latitude: '',
			longitude: '',
			speed_kn: ''
		};
	}

	function normalizeRoutePointName(value) {
		return String(value ?? '').trim();
	}

	function normalizeSavedRoutePointSource(value) {
		const source = String(value ?? '').trim();
		return source || 'saved-point';
	}

	function getSavedRoutePointSourceLabel(source) {
		const normalizedSource = normalizeSavedRoutePointSource(source).toLowerCase();
		if (normalizedSource === 'asset') return 'Asset';
		if (['saved', 'saved-point', 'saved_point'].includes(normalizedSource)) return 'Saved point';
		return normalizedSource
			.split(/[-_\s]+/)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function normalizePlanRoutePointSource(source, savedPointId = '') {
		const normalizedSource = String(source ?? '')
			.trim()
			.toLowerCase();
		if (normalizedSource === 'asset') return 'asset';
		if (['saved', 'saved-point', 'saved_point'].includes(normalizedSource)) return 'saved';
		if (savedPointId) return 'saved';
		return '';
	}

	function getPointSource(point = {}) {
		return (
			point.source ||
			point.pointSource ||
			point.point_source ||
			point.savedPoint?.source ||
			point.saved_point?.source ||
			''
		);
	}

	function getPointSavedPointId(point = {}) {
		return (
			point.saved_point_id ||
			point.savedPointId ||
			point.savedPoint?.id ||
			point.saved_point?.id ||
			''
		);
	}

	function normalizeSavedRoutePoint(point = {}) {
		const id = point.id || point._id || point.saved_point_id || point.savedPointId;
		const name = normalizeRoutePointName(point.name || point.pointName || point.point_name);
		const latitude = Number(point.latitude ?? point.lat);
		const longitude = Number(point.longitude ?? point.lng ?? point.lon);
		const speedKn = point.speed_kn ?? point.speedKn ?? point.speed ?? '';
		const speed =
			speedKn === '' || speedKn === null || speedKn === undefined ? '' : Number(speedKn);
		const source = normalizeSavedRoutePointSource(point.source);

		if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

		return {
			id: String(id),
			name,
			latitude,
			longitude,
			speed_kn: Number.isFinite(speed) ? speed : '',
			speedKn: Number.isFinite(speed) ? speed : null,
			source
		};
	}

	function buildRoutePointNameOptions(points = []) {
		return sortByAlpha(
			points
				.map(normalizeSavedRoutePoint)
				.filter(Boolean)
				.map((savedPoint) => ({
					...savedPoint,
					key: `${savedPoint.source}:${savedPoint.id}`,
					saved_point_id: savedPoint.id,
					meta: getSavedRoutePointSourceLabel(savedPoint.source)
				})),
			(option) => option.name,
			(option) => option.meta
		);
	}

	function findRoutePointNameOption(name, options = routePointNameOptions) {
		const normalizedName = normalizeRoutePointName(name).toLowerCase();
		if (!normalizedName) return null;

		const exactMatches = options.filter((option) => option.name.toLowerCase() === normalizedName);

		return exactMatches[0] || null;
	}

	function getRoutePointNameSearchOptions(searchValue = '', options = routePointNameOptions) {
		const searchText = normalizeRoutePointName(searchValue).toLowerCase();

		const matchedOptions = options.filter((option) => {
			if (!searchText) return true;

			return matchesSearch(searchText, [option.name]);
		});

		console.log('[VOYAGE_PLANS][SAVED_POINTS][DROPDOWN_OPTIONS]', {
			search: searchText,
			totalOptions: options.length,
			matchedOptions: matchedOptions.length,
			options: matchedOptions.slice(0, SAVED_ROUTE_POINT_PAGE_SIZE)
		});

		return matchedOptions.slice(0, SAVED_ROUTE_POINT_PAGE_SIZE);
	}

	function openRoutePointNameDropdown(index, searchValue = '') {
		if (editAllowedOnly) return;

		clearTimeout(routePointNameDropdownCloseTimer);
		activeRoutePointNameIndex = index;
		scheduleSavedRoutePointSearch(searchValue, index);
	}

	function dismissRoutePointNameDropdown() {
		clearTimeout(routePointNameDropdownCloseTimer);
		clearTimeout(savedRoutePointSearchTimer);
		savedRoutePointSearchIndex = null;
		activeRoutePointNameIndex = null;
	}

	function closeRoutePointNameDropdown(index = activeRoutePointNameIndex) {
		clearTimeout(routePointNameDropdownCloseTimer);
		clearTimeout(savedRoutePointSearchTimer);
		savedRoutePointSearchIndex = null;
		routePointNameDropdownCloseTimer = setTimeout(() => {
			if (activeRoutePointNameIndex === index) {
				activeRoutePointNameIndex = null;
			}
		}, 120);
	}

	function handleRoutePointNameOutsidePointerDown(event) {
		if (activeRoutePointNameIndex === null || activeRoutePointNameIndex === undefined) return;
		if (event.target?.closest?.('.route-point-name-field')) return;

		dismissRoutePointNameDropdown();
	}

	function selectRoutePointNameOption(index, option) {
		if (editAllowedOnly || !option) return;

		clearTimeout(routePointNameDropdownCloseTimer);

		form.planData = form.planData.map((point, pointIndex) => {
			if (pointIndex !== index) return point;

			const nextPoint = {
				...point,
				name: option.name,
				saved_point_id: option.saved_point_id || '',
				source: normalizePlanRoutePointSource(option.source, option.saved_point_id),
				latitude: roundCoord(option.latitude),
				longitude: roundCoord(option.longitude)
			};

			if (!hasCoordinateValue(point.speed_kn) && option.speed_kn !== '') {
				nextPoint.speed_kn = option.speed_kn;
			}

			return nextPoint;
		});

		selectedPointIndex = index;
		dismissRoutePointNameDropdown();
		refreshRouteMap();
	}

	function getRoutePointNameHint(point = {}, options = routePointNameOptions) {
		const name = normalizeRoutePointName(point.name);
		if (!name) return '';
		if (findRoutePointNameOption(name, options)) return '';
		return `Save "${name}" as new point when plan is saved.`;
	}

	function findSavedRoutePointMatch(
		{ name, latitude, longitude, speed_kn } = {},
		points = savedRoutePoints
	) {
		const normalizedName = normalizeRoutePointName(name).toLowerCase();
		const lat = Number(latitude);
		const lng = Number(longitude);
		const speed =
			speed_kn === '' || speed_kn === null || speed_kn === undefined ? null : Number(speed_kn);

		if (!normalizedName || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

		return points
			.map(normalizeSavedRoutePoint)
			.filter(Boolean)
			.find((point) => {
				if (point.name.toLowerCase() !== normalizedName) return false;
				if (Math.abs(Number(point.latitude) - lat) > 0.000001) return false;
				if (Math.abs(Number(point.longitude) - lng) > 0.000001) return false;

				const pointSpeed =
					point.speed_kn === '' || point.speed_kn === null || point.speed_kn === undefined
						? null
						: Number(point.speed_kn);

				if (speed === null) return true;
				return pointSpeed === null || Math.abs(pointSpeed - speed) <= 0.000001;
			});
	}

	function scheduleSavedRoutePointSearch(searchValue = '', index = activeRoutePointNameIndex) {
		if (!canManage || !browser) return;

		savedRoutePointSearchIndex = index;
		clearTimeout(savedRoutePointSearchTimer);
		savedRoutePointSearchTimer = setTimeout(() => {
			loadSavedRoutePoints(searchValue, index);
		}, SAVED_ROUTE_POINT_SEARCH_DELAY_MS);
	}

	function updateRoutePointName(index, value) {
		if (editAllowedOnly) return;

		form.planData = form.planData.map((point, pointIndex) => {
			if (pointIndex !== index) return point;

			return {
				...point,
				name: value,
				saved_point_id: '',
				source: ''
			};
		});

		selectedPointIndex = index;
		activeRoutePointNameIndex = index;
		scheduleSavedRoutePointSearch(value, index);
		refreshRouteMap();
	}

	function clearRoutePointSavedPointId(index) {
		if (editAllowedOnly) return;
		if (!form.planData[index]) return;

		form.planData[index].saved_point_id = '';
		form.planData[index].source = '';
	}

	function resetImportForm() {
		importPreviewRequestId += 1;
		importForm = {
			fileName: '',
			previewRows: [],
			importedCount: 0,
			loading: false,
			previewReady: false,
			message: '',
			error: ''
		};
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

	function getSavedPointItems(response) {
		const candidates = [
			response?.data?.items,
			response?.data?.points,
			response?.data?.savedPoints,
			response?.data?.saved_points,
			response?.items,
			response?.points,
			response?.savedPoints,
			response?.saved_points,
			response?.data,
			response
		];

		return candidates.find(Array.isArray) || [];
	}

	async function fetchSavedRoutePoints(searchValue = '') {
		if (!permissions.has('manage_voyage_plan_fleet')) {
			console.warn('[VOYAGE_PLANS][SAVED_POINTS][SKIP]', {
				reason: 'Missing manage_voyage_plan_fleet permission',
				search: normalizeRoutePointName(searchValue)
			});
			return [];
		}

		const params = new URLSearchParams({
			page: '1',
			pageSize: String(SAVED_ROUTE_POINT_PAGE_SIZE)
		});

		const searchText = normalizeRoutePointName(searchValue);
		if (searchText) params.set('search', searchText);

		const endpoint = `/voyage-plans/saved-points?${params.toString()}`;
		const result = await apiFetch(endpoint);
		const items = getSavedPointItems(result);
		const normalizedPoints = sortByAlpha(
			items.map(normalizeSavedRoutePoint).filter(Boolean),
			(point) => point.name,
			(point) => point.id
		);

		console.log('[VOYAGE_PLANS][SAVED_POINTS][RESPONSE]', {
			endpoint,
			search: searchText,
			raw: result,
			items,
			normalizedPoints
		});

		return normalizedPoints;
	}

	async function loadSavedRoutePoints(searchValue = '', index = null) {
		if (!permissions.has('manage_voyage_plan_fleet')) return;

		const requestToken = savedRoutePointsRequestToken + 1;
		savedRoutePointsRequestToken = requestToken;
		savedRoutePointsLoading = true;
		savedRoutePointsError = '';

		try {
			const points = await fetchSavedRoutePoints(searchValue);
			if (requestToken !== savedRoutePointsRequestToken) return;

			savedRoutePoints = points;
			if (index !== null && index !== undefined && showForm && !editAllowedOnly) {
				const currentSearch = normalizeRoutePointName(form.planData[index]?.name);
				const completedSearch = normalizeRoutePointName(searchValue);

				if (currentSearch === completedSearch && savedRoutePointSearchIndex === index) {
					activeRoutePointNameIndex = index;
				}
			}
			console.log('[VOYAGE_PLANS][SAVED_POINTS][STATE]', {
				search: normalizeRoutePointName(searchValue),
				count: savedRoutePoints.length,
				savedRoutePoints
			});
		} catch (error) {
			if (requestToken !== savedRoutePointsRequestToken) return;

			console.error('[VOYAGE_PLANS][SAVED_POINTS][ERROR]', error);
			savedRoutePointsError = error?.message || 'Failed to load saved route points.';
		} finally {
			if (requestToken === savedRoutePointsRequestToken) {
				savedRoutePointsLoading = false;
			}
		}
	}

	async function createSavedRoutePoints(pointsData = []) {
		if (!pointsData.length) return [];

		const result = await apiFetch('/voyage-plans/saved-points', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ pointsData })
		});

		return getSavedPointItems(result).map(normalizeSavedRoutePoint).filter(Boolean);
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
			assets = sortByAlpha(
				rows.map(normalizeAsset).filter(Boolean),
				(asset) => asset.assetName,
				(asset) => asset.assetType
			);

			console.log('[VOYAGE_PLANS][ASSETS]', assets);

			renderZoneLayer();
			renderAssetMarkers();
			refreshPlanViewMapOverlays();
		} catch (error) {
			console.error('[VOYAGE_PLANS][ASSETS][ERROR]', error);
			assets = [];
			zones = [];
			assetsError = error?.message || 'Failed to load fleet assets.';
			renderZoneLayer();
			renderAssetMarkers();
			refreshPlanViewMapOverlays();
		} finally {
			assetsLoading = false;
		}
	}

	function refreshPlanViewMapOverlays() {
		if (!L || !planViewMap) return;

		if (planViewZoneLayer) {
			planViewZoneLayer.clearLayers?.();
			planViewZoneLayer.remove?.();
			planViewZoneLayer = null;
		}

		planViewZoneLayer = addMapZonesToLeafletMap(L, planViewMap, zones, {
			paneName: 'voyagePlanViewZonePane',
			zIndex: 355
		});

		renderPlanViewMap(false);
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

				const savedPoint = findSavedRoutePointMatch({
					name: asset.assetName,
					latitude: asset.latitude,
					longitude: asset.longitude
				});

				addRoutePointFromLatLng(latlng, `Add route point from ${asset.assetName}`, {
					name: asset.assetName,
					saved_point_id: savedPoint?.id || '',
					source: savedPoint?.source || 'asset'
				});
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
			activeMapSourceId = getMapSourceId();
			window.addEventListener('keydown', handleRouteEditorKeydown);
			document.addEventListener('pointerdown', handleRoutePointNameOutsidePointerDown);
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
				document.removeEventListener('pointerdown', handleRoutePointNameOutsidePointerDown);
				document.removeEventListener('fullscreenchange', handleRouteMapFullscreenChange);
				document.removeEventListener('webkitfullscreenchange', handleRouteMapFullscreenChange);
				document.removeEventListener('mozfullscreenchange', handleRouteMapFullscreenChange);
				document.removeEventListener('MSFullscreenChange', handleRouteMapFullscreenChange);
			}

			destroyRouteMap();
			destroyPlanViewMap();
			clearTimeout(savedRoutePointSearchTimer);
			clearTimeout(routePointNameDropdownCloseTimer);
			cleanupVesselTransferMode();
		};
	});

	$: {
		if (!active && !showForm && !showPlanMapView) {
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
					permissions.has('manage_voyage_plan_fleet') ? loadSavedRoutePoints() : Promise.resolve(),
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
		vessels = sortByAlpha(
			accessDetails.map(normalizeVessel).filter(Boolean),
			(vessel) => vessel.vesselName,
			(vessel) => vessel.deviceId
		);
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
			voyageName:
				plan.voyageName || plan.voyage_name || plan.name || existingPlan?.voyageName || '',
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

		return sortByAlpha(
			vessels.filter((vessel) => allowedIdSet.has(Number(vessel.id))),
			(vessel) => vessel.vesselName,
			(vessel) => vessel.deviceId
		);
	}

	async function loadVessels() {
		if (vessels.length) return;
		try {
			const result = await apiFetch('/users/my-vessels');
			vessels = sortByAlpha(
				(result?.data || []).map(normalizeVessel).filter(Boolean),
				(vessel) => vessel.vesselName,
				(vessel) => vessel.deviceId
			);
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

	async function refreshVoyagePlans() {
		clearMessages();
		await Promise.all([
			loadPlans(page),
			canAssign ? loadActiveAssignments(activeAssignmentPage) : Promise.resolve(),
			loadActivePlanLocks()
		]);
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
		resetImportForm();
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
				name: point.name || point.pointName || point.point_name || '',
				saved_point_id: getPointSavedPointId(point),
				source: normalizePlanRoutePointSource(getPointSource(point), getPointSavedPointId(point)),
				latitude: point.latitude ?? '',
				longitude: point.longitude ?? '',
				speed_kn: point.speed_kn ?? ''
			}))
		};

		if (!form.planData.length) form.planData = [createPoint(1)];
		resetImportForm();
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
		resetImportForm();
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
			const name = normalizeRoutePointName(point.name || point.pointName || point.point_name);
			const savedPointId = getPointSavedPointId(point);
			const source = normalizePlanRoutePointSource(getPointSource(point), savedPointId);

			if (speed !== null) normalized.speed_kn = speed;
			if (name) normalized.name = name;
			if (savedPointId) normalized.saved_point_id = String(savedPointId);
			if (source) normalized.source = source;

			return normalized;
		});

		return {
			voyageName: form.voyageName.trim(),
			planData,
			isActive: !!form.isActive,
			allowedVesselIds: form.allowedVesselIds.map(Number)
		};
	}

	function getSavedPointSignature(point = {}) {
		const name = normalizeRoutePointName(point.name).toLowerCase();
		const latitude = Number(point.latitude);
		const longitude = Number(point.longitude);
		const speed =
			point.speed_kn === '' || point.speed_kn === null || point.speed_kn === undefined
				? ''
				: Number(point.speed_kn);

		return [name, latitude.toFixed(6), longitude.toFixed(6), speed === '' ? '' : speed].join('|');
	}

	async function attachSavedPointIds(planData = []) {
		const pendingMap = new Map();
		const nextPlanData = planData.map((point) => ({ ...point }));

		planData.forEach((point, index) => {
			const name = normalizeRoutePointName(point.name);
			if (!name || getPointSavedPointId(point)) return;

			const latitude = Number(point.latitude);
			const longitude = Number(point.longitude);
			if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

			const existingSavedPoint = findSavedRoutePointMatch(point);
			if (existingSavedPoint?.id) {
				nextPlanData[index] = {
					...nextPlanData[index],
					saved_point_id: String(existingSavedPoint.id),
					source: normalizePlanRoutePointSource(existingSavedPoint.source, existingSavedPoint.id)
				};
				return;
			}

			const speed =
				point.speed_kn === '' || point.speed_kn === null || point.speed_kn === undefined
					? null
					: Number(point.speed_kn);
			const signature = getSavedPointSignature(point);

			if (!pendingMap.has(signature)) {
				pendingMap.set(signature, {
					indexes: [],
					point,
					payload: {
						name,
						latitude,
						longitude,
						speed_kn: Number.isFinite(speed) ? speed : undefined
					}
				});
			}

			pendingMap.get(signature).indexes.push(index);
		});

		let pending = [...pendingMap.values()];
		if (!pending.length) return nextPlanData;

		const unresolvedPending = [];

		for (const entry of pending) {
			const searchedPoints = await fetchSavedRoutePoints(entry.point.name);
			const existingSavedPoint = findSavedRoutePointMatch(entry.point, searchedPoints);

			if (existingSavedPoint?.id) {
				entry.indexes.forEach((index) => {
					nextPlanData[index] = {
						...nextPlanData[index],
						saved_point_id: String(existingSavedPoint.id),
						source: normalizePlanRoutePointSource(existingSavedPoint.source, existingSavedPoint.id)
					};
				});
				continue;
			}

			unresolvedPending.push(entry);
		}

		pending = unresolvedPending;
		if (!pending.length) return nextPlanData;

		const pointsData = pending.map((entry) => {
			const payload = { ...entry.payload };
			if (payload.speed_kn === undefined) delete payload.speed_kn;
			return payload;
		});

		const createdPoints = await createSavedRoutePoints(pointsData);
		const mergedSavedPoints = sortByAlpha(
			[...savedRoutePoints, ...createdPoints],
			(point) => point.name,
			(point) => point.id
		);
		savedRoutePoints = mergedSavedPoints;

		await Promise.all(
			pending.map(async (entry, pendingIndex) => {
				let savedPoint =
					findSavedRoutePointMatch(entry.point, createdPoints) ||
					findSavedRoutePointMatch(entry.point, mergedSavedPoints) ||
					createdPoints[pendingIndex];

				if (!savedPoint) {
					const searchedPoints = await fetchSavedRoutePoints(entry.point.name);
					savedPoint = findSavedRoutePointMatch(entry.point, searchedPoints);
				}

				if (!savedPoint?.id) return;

				entry.indexes.forEach((index) => {
					nextPlanData[index] = {
						...nextPlanData[index],
						saved_point_id: String(savedPoint.id),
						source: normalizePlanRoutePointSource(savedPoint.source, savedPoint.id)
					};
				});
			})
		);

		return nextPlanData;
	}

	async function submitPlan() {
		clearMessages();
		saving = true;
		try {
			let payload = editAllowedOnly
				? { allowedVesselIds: form.allowedVesselIds.map(Number).filter(Number.isFinite) }
				: validatePlanPayload();

			if (!editAllowedOnly) {
				payload = {
					...payload,
					planData: await attachSavedPointIds(payload.planData)
				};
			}

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
			errorMessage =
				'This voyage plan is currently assigned to an active vessel and cannot be changed.';
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
			errorMessage =
				'This voyage plan is currently assigned to an active vessel and cannot be deleted.';
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
		if (editAllowedOnly) return;

		const fileInput = event.currentTarget;
		const file = fileInput.files?.[0];
		if (!file) return;
		fileInput.value = '';
		const requestId = ++importPreviewRequestId;

		importForm = {
			...importForm,
			fileName: file.name,
			previewRows: [],
			importedCount: 0,
			loading: true,
			previewReady: false,
			message: '',
			error: ''
		};

		try {
			const fileBase64 = await fileToBase64(file);
			const result = await apiFetch('/voyage-plans/import-excel-preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileBase64 })
			});

			if (requestId !== importPreviewRequestId) return;

			const responsePoints = Array.isArray(result?.data?.points) ? result.data.points : [];
			const importedPoints = responsePoints
				.map(normalizeExcelPreviewPoint)
				.sort((a, b) => a.order - b.order)
				.map((point, index) => ({
					order: index + 1,
					name: point.name,
					saved_point_id: point.saved_point_id,
					source: point.source,
					latitude: point.latitude,
					longitude: point.longitude,
					speed_kn: point.speed_kn
				}));

			if (!importedPoints.length) throw new Error('No route points found in the Excel file.');

			pushUndoState('Import Excel route points');
			form.planData = importedPoints;
			selectedPointIndex = 0;

			if (!form.voyageName.trim()) {
				form.voyageName = file.name
					.replace(/\.xlsx?$/i, '')
					.replace(/[_-]+/g, ' ')
					.trim();
			}

			importForm = {
				...importForm,
				previewRows: importedPoints.slice(0, 6),
				importedCount: importedPoints.length,
				loading: false,
				previewReady: true,
				message:
					result?.message ||
					`${importedPoints.length} route points are ready for preview. Review them before creating the plan.`,
				error: ''
			};

			refreshRouteMap();
			setTimeout(() => {
				fitRouteMap();
			}, 80);
		} catch (error) {
			if (requestId !== importPreviewRequestId) return;
			importForm = {
				...importForm,
				previewRows: [],
				importedCount: 0,
				loading: false,
				previewReady: false,
				message: '',
				error: error.message
			};
		}
	}

	function fileToBase64(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = String(reader.result || '');
				const fileBase64 = result.includes(',') ? result.split(',').pop() : result;
				if (!fileBase64) {
					reject(new Error('The selected Excel file could not be read.'));
					return;
				}
				resolve(fileBase64);
			};
			reader.onerror = () => reject(new Error('The selected Excel file could not be read.'));
			reader.readAsDataURL(file);
		});
	}

	function normalizeExcelPreviewPoint(row, index) {
		const order = Number(row?.order ?? index + 1);
		const latitude = Number(row?.latitude);
		const longitude = Number(row?.longitude);
		const rawSpeed = row?.speed_kn ?? row?.speedKn;
		const speed =
			rawSpeed === '' || rawSpeed === null || rawSpeed === undefined ? '' : Number(rawSpeed);

		if (!Number.isFinite(order)) throw new Error(`Point ${index + 1} has an invalid order.`);
		if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
			throw new Error(`Point ${index + 1} has an invalid latitude.`);
		}
		if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
			throw new Error(`Point ${index + 1} has an invalid longitude.`);
		}
		if (speed !== '' && (!Number.isFinite(speed) || speed < 0)) {
			throw new Error(`Point ${index + 1} has an invalid speed.`);
		}

		return {
			order,
			name: normalizeRoutePointName(row?.name || row?.point_name || row?.pointName),
			saved_point_id: '',
			source: '',
			latitude,
			longitude,
			speed_kn: speed
		};
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
	<VoyagePlansHeader
		{canAccess}
		{canManage}
		refreshDisabled={loading || activeAssignmentsLoading || activePlanLocksLoading}
		onRefresh={refreshVoyagePlans}
		onCreate={startCreate}
	/>

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
		<section class:has-assign-panel={canAssign} class="voyage-grid">
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
						<div class="detail-toolbar-actions">
							<button
								class="toolbar-button map-view-button"
								type="button"
								on:click={() => openPlanMapView(selectedPlan)}
							>
								View on map
							</button>
							<span
								class:badge-active={selectedPlan.isActive}
								class:badge-muted={!selectedPlan.isActive}
								class="badge large"
							>
								{selectedPlan.isActive ? 'Active' : 'Inactive'}
							</span>
						</div>
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
									<th>Name</th>
									<th>Latitude</th>
									<th>Longitude</th>
									<th>Speed kn</th>
								</tr>
							</thead>
							<tbody>
								{#each selectedPlan.planData || [] as point}
									<tr>
										<td>{point.order}</td>
										<td>{point.name || '-'}</td>
										<td>
											<CopyableCoordinate
												value={point.latitude}
												display={point.latitude}
												label="latitude"
												compact
											/>
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
										<td colspan="5" class="empty-cell">No route points yet.</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="empty-state">Select a voyage plan to view details.</div>
				{/if}
			</section>
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
								<input
									type="datetime-local"
									use:fourDigitDateYear
									bind:value={assignForm.startDate}
								/>
							</label>

							<div class="assign-action">
								<button
									class="primary-button assign-button"
									type="button"
									on:click={assignPlan}
									disabled={assigning ||
										!assignForm.voyagePlanId ||
										!assignForm.vesselId ||
										!assignForm.startDate}
								>
									{assigning ? 'Assigning...' : 'Assign Plan'}
								</button>
							</div>
						</div>
					</div>
				</section>
			{/if}
		</section>

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
					on:click={() =>
						Promise.all([loadActiveAssignments(activeAssignmentPage), loadActivePlanLocks()])}
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
					<select bind:value={activeAssignmentPageSize} on:change={() => loadActiveAssignments(1)}>
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
												<span style={`width: ${Math.max(0, Math.min(100, assignment.percentage))}%`}
												></span>
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
						{editAllowedOnly
							? 'Edit Allowed Vessels'
							: editMode
								? 'Edit Voyage Plan'
								: 'Create Voyage Plan'}
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
					<div
						class="section-title route-section-title"
						style="margin:-16px -16px 0; border-radius: 0px;"
					>
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

							<button class="toolbar-button" type="button" on:click={fitRouteMap}> Fit Map </button>

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

					<aside class:has-route-import={!editAllowedOnly} class="route-point-panel">
						{#if !editAllowedOnly}
							<div class="route-import-card">
								<div class="route-import-copy">
									<strong>Import route from Excel</strong>
									<span>Columns: order, name, latitude, longitude, speed_kn, source.</span>
								</div>

								<div class="route-import-actions">
									<label class="route-import-file">
										<input
											type="file"
											accept=".xlsx,.xls"
											on:change={handleExcelUpload}
											disabled={importForm.loading}
										/>
										<span
											>{importForm.loading
												? 'Preparing preview...'
												: importForm.fileName || 'Choose Excel'}</span
										>
									</label>

									<button
										class="toolbar-button"
										type="button"
										on:click={downloadTemplate}
										disabled={importForm.loading}
									>
										Template
									</button>
								</div>

								{#if importForm.loading}
									<div class="route-import-loading" role="status">
										<span class="route-import-spinner" aria-hidden="true"></span>
										<span>Parsing Excel and generating route preview...</span>
									</div>
								{/if}

								{#if importForm.message}
									<div class="route-import-message success">{importForm.message}</div>
								{/if}

								{#if importForm.error}
									<div class="route-import-message error">{importForm.error}</div>
								{/if}

								{#if importForm.previewReady}
									<div class="route-import-preview">
										<div class="route-import-preview-head">
											<span>Excel preview</span>
											<strong>{importForm.importedCount} route points</strong>
										</div>

										<div class="route-import-preview-list">
											{#each importForm.previewRows as point}
												<small>
													#{point.order}
													{point.name || `Point ${point.order}`} ·
													{Number(point.latitude).toFixed(5)}, {Number(point.longitude).toFixed(5)}
												</small>
											{/each}
											{#if importForm.importedCount > importForm.previewRows.length}
												<small class="route-import-preview-more">
													+{importForm.importedCount - importForm.previewRows.length} more points shown
													in the table and map
												</small>
											{/if}
										</div>
									</div>
								{/if}
							</div>
						{/if}

						<div class:excel-preview={importForm.previewReady} class="point-hint">
							{editAllowedOnly
								? 'Route points are locked while this plan is assigned to an active vessel.'
								: importForm.previewReady
									? 'Excel preview is active. Review or adjust the points below and on the map before confirming the plan.'
									: 'Click the map to add a point. Markers can be moved to update coordinates.'}
						</div>

						<div class="route-editor">
							<table>
								<thead>
									<tr>
										<th>No</th>
										<th>Name</th>
										<th>Latitude</th>
										<th>Longitude</th>
										<th>Speed</th>
										<th></th>
									</tr>
								</thead>

								<tbody>
									{#each form.planData as point, index}
										{@const nameOptions =
											activeRoutePointNameIndex === index
												? getRoutePointNameSearchOptions(point.name, routePointNameOptions)
												: []}
										{@const pointNameHint =
											activeRoutePointNameIndex === index
												? getRoutePointNameHint(point, routePointNameOptions)
												: ''}
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
												<div class="route-point-name-field">
													<input
														type="text"
														value={point.name || ''}
														placeholder="Point name"
														on:focus|stopPropagation={() => {
															pushUndoState('Edit point name');
															openRoutePointNameDropdown(index, point.name || '');
														}}
														on:input|stopPropagation={(event) =>
															updateRoutePointName(index, event.currentTarget.value)}
														on:blur={() => closeRoutePointNameDropdown(index)}
														on:keydown={(event) => {
															if (event.key === 'Escape') dismissRoutePointNameDropdown();
														}}
														disabled={editAllowedOnly}
													/>

													{#if activeRoutePointNameIndex === index}
														<div
															class="route-point-name-menu"
															on:mousedown|preventDefault|stopPropagation
															on:click|stopPropagation
														>
															{#if nameOptions.length}
																{#each nameOptions as option (option.key)}
																	<button
																		type="button"
																		class="route-point-name-option"
																		on:click={() => selectRoutePointNameOption(index, option)}
																	>
																		<span>
																			<strong>{option.name}</strong>
																			<small>{option.meta}</small>
																		</span>
																		<em
																			>{formatCoordinate(option.latitude)}, {formatCoordinate(
																				option.longitude
																			)}</em
																		>
																	</button>
																{/each}
															{:else if normalizeRoutePointName(point.name)}
																<div class="route-point-name-empty">No matching saved point.</div>
															{:else}
																<div class="route-point-name-empty">
																	Type to search saved points.
																</div>
															{/if}

															{#if pointNameHint}
																<div class="route-point-name-new">{pointNameHint}</div>
															{/if}
														</div>
													{/if}
												</div>
											</td>

											<td>
												<div class="coordinate-input-wrap">
													<input
														type="number"
														step="0.000001"
														bind:value={point.latitude}
														placeholder="-6.1751"
														on:focus={() => pushUndoState('Edit coordinate')}
														on:input={() => {
															clearRoutePointSavedPointId(index);
															refreshRouteMap();
														}}
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
														on:input={() => {
															clearRoutePointSavedPointId(index);
															refreshRouteMap();
														}}
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
													on:input={() => clearRoutePointSavedPointId(index)}
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

							{#if savedRoutePointsLoading}
								<div class="saved-point-status">Loading saved points...</div>
							{:else if savedRoutePointsError}
								<div class="saved-point-status error">{savedRoutePointsError}</div>
							{/if}
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

								<div class="route-map-scale-control" aria-label="Map scale">
									<div
										class="route-map-scale-ruler"
										style={`width: ${routeMapScale.totalWidth}px;`}
									>
										<span
											class="route-map-scale-label metric"
											style={`left: ${routeMapScale.metricLabelLeft}px;`}
										>
											{routeMapScale.metricLabel}
										</span>
										<span
											class="route-map-scale-bar"
											aria-label={`${routeMapScale.metricLabel} / ${routeMapScale.nauticalLabel}`}
										>
											<span
												class="route-map-scale-tick metric"
												style={`left: ${routeMapScale.metricStart}px;`}
											></span>
											<span
												class="route-map-scale-tick nautical"
												style={`left: ${routeMapScale.nauticalStart}px;`}
											></span>
										</span>
										<span
											class="route-map-scale-label nautical"
											style={`left: ${routeMapScale.nauticalLabelLeft}px;`}
										>
											{routeMapScale.nauticalLabel}
										</span>
									</div>
								</div>

								<div class="route-map-source-control" aria-label="Map source">
									<span>Map</span>
									<div>
										{#each mapSourceOptions as source}
											<button
												type="button"
												class:active={activeMapSourceId === source.id}
												aria-pressed={activeMapSourceId === source.id}
												on:click={() => selectMapSource(source.id)}
											>
												{source.label}
											</button>
										{/each}
									</div>
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

									<button
										class="toolbar-button"
										type="button"
										on:click={addPoint}
										disabled={editAllowedOnly}
									>
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
										on:dragstart={(event) => handleVesselDragStart(event, vessel.id, 'not-allowed')}
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
				<button
					class="primary-button"
					type="button"
					on:click={submitPlan}
					disabled={saving || importForm.loading}
				>
					{saving
						? 'Saving...'
						: editAllowedOnly
							? 'Save Allowed Vessels'
							: importForm.previewReady && !editMode
								? 'Confirm & Create Plan'
								: 'Save Voyage Plan'}
				</button>
			</div>
		</section>
	</div>
{/if}

{#if showPlanMapView && selectedPlan}
	<div class="modal-backdrop plan-view-backdrop" on:click={closePlanMapView}>
		<section class="plan-view-window" on:click|stopPropagation>
			<div class="modal-header plan-view-header">
				<div>
					<div class="page-kicker">Voyage Plan Map</div>
					<h2>{selectedPlan.voyageName}</h2>
					<p>
						{(selectedPlan.planData || []).length} route points •
						{(selectedPlan.allowedVesselIds || []).length} allowed vessels
					</p>
				</div>
				<button class="icon-button" type="button" on:click={closePlanMapView}>×</button>
			</div>

			<div class="plan-view-body">
				<aside class="plan-view-info">
					<div class="plan-view-summary">
						<div>
							<span>Plan ID</span>
							<strong>#{selectedPlan.id}</strong>
						</div>
						<div>
							<span>Status</span>
							<strong>{selectedPlan.isActive ? 'Active' : 'Inactive'}</strong>
						</div>
						<div>
							<span>Route Points</span>
							<strong>{(selectedPlan.planData || []).length}</strong>
						</div>
					</div>

					<section class="plan-view-card">
						<div class="plan-view-card-head">
							<h3>Allowed Vessels</h3>
							<span>{(selectedPlan.allowedVesselIds || []).length} vessels</span>
						</div>
						<div class="plan-view-vessel-list">
							{#each selectedPlan.allowedVesselIds || [] as vesselId}
								<span>{vesselLabel(vesselId)}</span>
							{:else}
								<em>No allowed vessels yet.</em>
							{/each}
						</div>
					</section>

					<section class="plan-view-card route-points-card">
						<div class="plan-view-card-head">
							<h3>Route Points</h3>
							<span>Latitude / Longitude</span>
						</div>
						<div class="plan-view-table-wrap">
							<table>
								<thead>
									<tr>
										<th>Order</th>
										<th>Name</th>
										<th>Latitude</th>
										<th>Longitude</th>
										<th>Speed</th>
									</tr>
								</thead>
								<tbody>
									{#each selectedPlan.planData || [] as point}
										<tr>
											<td>{point.order}</td>
											<td>{point.name || '-'}</td>
											<td>
												<CopyableCoordinate
													value={point.latitude}
													display={point.latitude}
													label="latitude"
													compact
												/>
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
											<td colspan="5" class="empty-cell">No route points yet.</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</section>
				</aside>

				<section class="plan-view-map-card">
					<div class="plan-view-map-toolbar">
						<div>
							<h3>Route Preview</h3>
							<span>Plan path, route points, fleet assets, and zones.</span>
						</div>
						<button type="button" class="toolbar-button" on:click={() => renderPlanViewMap(true)}>
							Fit map
						</button>
					</div>
					<div class="plan-view-map" bind:this={planViewMapContainer}></div>
					<div class="plan-view-map-legend">
						<span><i class="legend-route-line"></i> Route line</span>
						<span><i class="legend-route-dot start"></i> Start</span>
						<span><i class="legend-route-dot selected"></i> End</span>
						{#if assets.length}
							<span>Assets: {assets.length}</span>
						{/if}
						{#if zones.length}
							<span>Zones: {zones.length}</span>
						{/if}
					</div>
				</section>
			</div>
		</section>
	</div>
{/if}
