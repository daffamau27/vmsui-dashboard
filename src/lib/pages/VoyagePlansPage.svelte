<script>
	import { onMount, tick } from 'svelte';
	import * as XLSX from 'xlsx';
	import { apiRequest } from '$lib/api/authApi.js';
	import { browser } from '$app/environment';
	import 'leaflet/dist/leaflet.css';

	const PAGE_SIZE_OPTIONS = [10, 20, 50];

	let loading = false;
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

	let search = '';
	let showForm = false;
	let editMode = false;
	let confirmDeleteId = null;

	let form = getEmptyForm();
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
	let routeMap;
	let markerLayer;
	let assetMarkerLayer;
	let routeLine;
	let selectedPointIndex = 0;

	let assets = [];
	let assetsLoading = false;
	let assetsError = '';
	let mapInitializing = false;

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

	function isValidCoordinate(point) {
		const lat = Number(point?.latitude);
		const lng = Number(point?.longitude);

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
				index,
				latitude: Number(point.latitude),
				longitude: Number(point.longitude)
			}))
			.filter(isValidCoordinate);
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
				zoomControl: true,
				preferCanvas: true
			});

			leaflet
				.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					maxZoom: 19,
					attribution: '&copy; OpenStreetMap'
				})
				.addTo(routeMap);

			assetMarkerLayer = leaflet.layerGroup().addTo(routeMap);
			markerLayer = leaflet.layerGroup().addTo(routeMap);

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
			});

			const existingPoints = getValidRoutePoints();

			if (existingPoints.length) {
				routeMap.setView([existingPoints[0].latitude, existingPoints[0].longitude], 11);
				refreshRouteMap();
			} else {
				routeMap.setView([-7.2575, 112.7521], 10);
			}

			setTimeout(() => {
				routeMap?.invalidateSize();
			}, 120);
		} finally {
			mapInitializing = false;
		}
	}

	function destroyRouteMap() {
		if (routeMap) {
			routeMap.off();
			routeMap.remove();
		}

		routeMap = null;
		markerLayer = null;
		assetMarkerLayer = null;
		routeLine = null;
	}

	function openRouteMapAfterRender() {
		tick().then(async () => {
			await initializeRouteMap();
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
		if (movingPointIndex !== null && movingPointIndex !== undefined) {
			moveSelectedPointToLatLng(movingPointIndex, event.latlng);
			return;
		}

		addRoutePointFromLatLng(event.latlng, 'Add route point from map');
	}

	function updatePointCoordinate(index, latlng) {
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
				draggable: true,
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

			marker.on('click', () => {
				closePointContextMenu();
				selectPoint(point.index);
			});

			marker.on('contextmenu', (event) => {
				openPointContextMenu(point.index, event);
			});

			marker.on('dragstart', () => {
				closePointContextMenu();
				selectedPointIndex = point.index;
				refreshRouteMap();
			});

			marker.on('dragend', () => {
				updatePointCoordinate(point.index, marker.getLatLng());
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
	$: selectedAllowedVessels = vessels.filter((v) => form.allowedVesselIds.includes(v.id));

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
		const latitude = Number(asset?.latitude);
		const longitude = Number(asset?.longitude);

		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

		return {
			id: asset?.id,
			assetId: asset?.assetId || '',
			assetName: asset?.assetName || `Asset ${asset?.id || ''}`,
			latitude,
			longitude,
			raw: asset
		};
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
			const result = await apiFetch('/fleet/assets', {
				method: 'GET',
				headers: {
					Accept: 'application/json'
				}
			});

			const rows = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];

			assets = rows.map(normalizeAsset).filter(Boolean);

			console.log('[VOYAGE_PLANS][ASSETS]', assets);

			renderAssetMarkers();
		} catch (error) {
			console.error('[VOYAGE_PLANS][ASSETS][ERROR]', error);
			assets = [];
			assetsError = error?.message || 'Failed to load fleet assets.';
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
				icon: L.divIcon({
					className: 'asset-leaflet-icon',
					html: `
						<div class="asset-marker-shell" title="${escapeHtml(asset.assetName)}">
							<div class="asset-marker-core"></div>
						</div>
					`,
					iconSize: [22, 22],
					iconAnchor: [11, 11]
				})
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

	onMount(async () => {
		if (browser) {
			window.addEventListener('keydown', handleRouteEditorKeydown);
		}

		await initializePage();

		return () => {
			if (browser) {
				window.removeEventListener('keydown', handleRouteEditorKeydown);
			}
		};
	});

	async function initializePage() {
		loading = true;
		clearMessages();
		try {
			await loadCurrentUser();
			if (canAccess) {
				await Promise.all([loadPlans(), loadVessels(), loadFleetAssets()]);
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
			plans = result?.data?.items || [];
			pagination = result?.data?.pagination || pagination;
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
			selectedPlan = result?.data || null;
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
		editMode = false;
		showForm = true;
		selectedPointIndex = 0;
		resetUndoStack();
		openRouteMapAfterRender();
	}

	async function startEdit(planId) {
		clearMessages();
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
		editMode = true;
		showForm = true;
		selectedPointIndex = 0;
		resetUndoStack();
		openRouteMapAfterRender();
	}

	function closeForm() {
		destroyRouteMap();
		showForm = false;
		editMode = false;
		form = getEmptyForm();
		selectedPointIndex = 0;
		resetUndoStack();
		resetMoveState();
	}

	function addPoint() {
		pushUndoState('Add empty point');

		form.planData = [...form.planData, createPoint(form.planData.length + 1)];
		selectedPointIndex = form.planData.length - 1;
		refreshRouteMap();
	}

	function removePoint(index) {
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

	function validatePlanPayload() {
		if (!form.voyageName.trim()) throw new Error('Voyage name is required.');
		if (!form.planData.length) throw new Error('At least 1 route point is required.');

		const planData = form.planData.map((point, index) => {
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
			const payload = validatePlanPayload();
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
		<div class="empty-card">Loading voyage plans...</div>
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
								<tr
									class:active-row={selectedPlanId === plan.id}
									on:click={() => openPlan(plan.id)}
								>
									<td>#{plan.id}</td>
									<td class="strong">{plan.voyageName}</td>
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
												{#if confirmDeleteId === plan.id}
													<button
														class="icon-action danger"
														type="button"
														title="Confirm delete"
														aria-label="Confirm delete"
														on:click={() => deletePlan(plan.id)}
														disabled={saving}
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
														disabled={saving}
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
														disabled={saving}
													>
														{plan.isActive ? '⏸' : '▶'}
													</button>

													<button
														class="icon-action danger ghost-danger"
														type="button"
														title="Delete"
														aria-label="Delete"
														on:click={() => (confirmDeleteId = plan.id)}
														disabled={saving}
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
										<td>{point.latitude}</td>
										<td>{point.longitude}</td>
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
												><td>{row.order}</td><td>{row.latitude}</td><td>{row.longitude}</td><td
													>{row.speed_kn}</td
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
						<div class="panel-toolbar">
							<div>
								<h2>Assign to Vessel</h2>
								<span>Assign a plan to a vessel according to the active period.</span>
							</div>
						</div>

						<div class="form-grid compact">
							<label>
								<span>Voyage Plan</span>
								<select bind:value={assignForm.voyagePlanId}>
									<option value="">Select plan</option>
									{#each plans as plan}
										<option value={plan.id}>{plan.voyageName}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>Vessel</span>
								<select bind:value={assignForm.vesselId}>
									<option value="">Select vessel</option>
									{#each vessels as vessel}
										<option value={vessel.id}>{vessel.vesselName}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>Start Date</span>
								<input type="datetime-local" bind:value={assignForm.startDate} />
							</label>
							<button
								class="primary-button"
								type="button"
								on:click={assignPlan}
								disabled={assigning}
							>
								{assigning ? 'Assigning...' : 'Assign Plan'}
							</button>
						</div>
					</section>
				{/if}
			</section>
		{/if}
	{/if}
</section>

{#if showForm}
	<div class="modal-backdrop" on:click={closeForm}>
		<section class="modal-card" on:click|stopPropagation>
			<div class="modal-header">
				<div>
					<div class="page-kicker">{editMode ? 'Edit Voyage Plan' : 'Create Voyage Plan'}</div>
					<h2>{editMode ? form.voyageName : 'New Voyage Plan'}</h2>
				</div>
				<button class="icon-button" type="button" on:click={closeForm}>×</button>
			</div>

			<div class="modal-body">
				<div class="form-grid">
					<label>
						<span>Voyage Name</span>
						<input bind:value={form.voyageName} placeholder="Plan Jakarta to Surabaya" />
					</label>
					<label class="switch-line">
						<input type="checkbox" bind:checked={form.isActive} />
						<span>Active</span>
					</label>
				</div>

				<div class="vessel-picker">
					<div class="section-title compact-title">
						<div>
							<h3>Allowed Vessels</h3>
							<span>{selectedAllowedVessels.length} selected vessel</span>
						</div>
					</div>
					<div class="vessel-chips">
						{#each vessels as vessel}
							<button
								type="button"
								class:selected={form.allowedVesselIds.includes(vessel.id)}
								on:click={() => toggleVessel(vessel.id)}
							>
								{vessel.vesselName}
							</button>
						{:else}
							<em>Vessel data is not available.</em>
						{/each}
					</div>
				</div>

				<div class="section-title route-section-title">
					<div>
						<h3>Route Points</h3>
						<span
							>Click the map to add a point, right-click a marker to move, reorder, or delete it.</span
						>
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

						<button class="toolbar-button" type="button" on:click={addPoint}>+ Add Point</button>
						<button class="toolbar-button" type="button" on:click={fitRouteMap}>Fit Map</button>
						<button
							class="toolbar-button danger ghost-danger"
							type="button"
							on:click={clearRoutePoints}
						>
							Clear
						</button>
					</div>
				</div>

				<div class="route-map-editor">
					<aside class="route-point-panel">
						<div class="point-hint">
							Click the map to add a point. Markers can be moved to update
							coordinates.
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
												<input type="number" bind:value={point.order} on:change={reorderPoints} />
											</td>

											<td>
												<input
													type="number"
													step="0.000001"
													bind:value={point.latitude}
													placeholder="-6.1751"
													on:focus={() => pushUndoState('Edit coordinate')}
													on:input={() => refreshRouteMap()}
												/>
											</td>

											<td>
												<input
													type="number"
													step="0.000001"
													bind:value={point.longitude}
													placeholder="106.865"
													on:focus={() => pushUndoState('Edit coordinate')}
													on:input={() => refreshRouteMap()}
												/>
											</td>

											<td>
												<input
													type="number"
													step="0.1"
													bind:value={point.speed_kn}
													placeholder="8"
													on:focus={() => pushUndoState('Edit speed')}
												/>
											</td>

											<td>
												<button
													class="icon-action danger ghost-danger"
													type="button"
													title="Remove point"
													aria-label="Remove point"
													on:click|stopPropagation={() => removePoint(index)}
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
						<div class="map-mini-toolbar">
							<strong>Map Point Editor</strong>
							<div class="map-mini-meta">
								<span>{getValidRoutePoints().length} valid points</span>
								<span>{assetsLoading ? 'Loading assets...' : `${assets.length} assets`}</span>
								{#if assetsError}
									<span class="asset-error">{assetsError}</span>
								{/if}
							</div>
						</div>

						<div class="route-map-shell">
							<div class="route-map" bind:this={mapContainer}></div>

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
					</section>
				</div>
			</div>

			<div class="modal-footer">
				<button type="button" on:click={closeForm}>Cancel</button>
				<button class="primary-button" type="button" on:click={submitPlan} disabled={saving}>
					{saving ? 'Saving...' : 'Save Voyage Plan'}
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
		background: #f4f6f8;
		color: #0f172a;
		overflow-y: auto;
		overflow-x: hidden;
		box-sizing: border-box;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	:global(.leaflet-container) {
		font-family:
			Inter,
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

	:global(.leaflet-tooltip) {
		border: 1px solid #d9e2ec;
		border-radius: 10px;
		box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
		color: #0f172a;
		font-size: 11px;
		font-weight: 900;
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
		background: #ffffff;
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
		background: #dbeafe;
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
		color: #0f172a;
	}

	.voyage-header-card p {
		max-width: 760px;
		margin: 7px 0 0;
		color: #64748b;
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
		background: #fef2f2;
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.alert.success {
		background: #ecfdf5;
		color: #047857;
		border: 1px solid #bbf7d0;
	}

	.empty-card,
	.empty-state,
	.empty-cell {
		padding: 28px;
		color: #64748b;
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
		color: #0f172a;
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
		background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
	}

	.panel-toolbar h2,
	.modal-header h2,
	.section-title h3 {
		color: #0f172a;
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
		color: #64748b;
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
		background: #ffffff;
		color: #64748b;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.map-mini-meta .asset-error {
		border-color: #fecaca;
		background: #fef2f2;
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
		background: #e2e8f0;
		color: #0f172a;
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
		background: #e2e8f0;
		color: #0f172a;
	}

	.ghost-button:hover:not(:disabled),
	.toolbar-button:hover:not(:disabled) {
		background: #cbd5e1;
	}

	.danger,
	.ghost-danger {
		background: #fee2e2;
		color: #b91c1c;
	}

	.danger:hover:not(:disabled),
	.ghost-danger:hover:not(:disabled) {
		background: #fecaca;
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
		background: #ffffff;
		color: #0f172a;
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
		background: #fbfdff;
	}

	.table-wrap,
	.route-table-wrap,
	.route-editor,
	.preview-box {
		overflow: auto;
		background: #ffffff;
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
		background: #ffffff;
		color: #0f172a;
		font-weight: 700;
	}

	tbody tr:nth-child(even) td {
		background: #f8fafc;
	}

	tbody tr:hover td {
		background: #eff6ff;
	}

	tr.active-row td,
	.selected-point-row td {
		background: #dbeafe !important;
	}

	.strong {
		color: #0f172a;
		font-weight: 900;
	}

	.right,
	th.right,
	td.right {
		text-align: right;
	}

	td.actions {
		width: 142px;
		min-width: 142px;
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
		background: #dbeafe;
		transform: translateY(-1px);
	}

	.icon-action.active-toggle {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.icon-action.danger,
	.icon-action.ghost-danger {
		background: #fee2e2;
		color: #b91c1c;
	}

	.icon-action.danger:hover:not(:disabled),
	.icon-action.ghost-danger:hover:not(:disabled) {
		background: #fecaca;
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
		background: #ecfdf5;
		color: #047857;
	}

	.badge-muted {
		border: 1px solid #e2e8f0;
		background: #f8fafc;
		color: #64748b;
	}

	.pagination-bar {
		justify-content: flex-end;
		flex-wrap: wrap;
		border-top: 1px solid #e5edf5;
		background: #f8fafc;
		padding: 10px 12px;
		color: #64748b;
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
		background: #f8fafc;
	}

	.detail-summary div {
		min-width: 0;
		padding: 14px;
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: #ffffff;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.detail-summary b {
		display: block;
		margin-top: 7px;
		overflow: hidden;
		color: #0f172a;
		font-size: 18px;
		font-weight: 900;
		line-height: 1.15;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.allowed-list,
	.vessel-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 12px 14px 14px;
	}

	.allowed-list {
		padding-top: 0;
	}

	.allowed-list span,
	.vessel-chips button {
		height: auto;
		min-height: 28px;
		border: 1px solid #d9e2ec;
		border-radius: 999px;
		background: #f8fafc;
		color: #334155;
		padding: 6px 10px;
		font-size: 11px;
		font-weight: 900;
	}

	.vessel-chips button:hover:not(:disabled) {
		background: #eff6ff;
	}

	.vessel-chips button.selected {
		border-color: #bfdbfe;
		background: #dbeafe;
		color: #1d4ed8;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 12px;
		padding: 14px;
	}

	.modal-body > .form-grid {
		padding: 0;
		margin-bottom: 14px;
	}

	.form-grid.compact {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	label {
		display: grid;
		gap: 5px;
	}

	.switch-line {
		display: flex;
		align-items: center;
		gap: 9px;
		align-self: end;
		min-height: 32px;
		padding-bottom: 1px;
		text-transform: none;
	}

	.switch-line input {
		width: auto;
		height: auto;
		min-height: auto;
	}

	.file-box {
		position: relative;
		min-height: 42px;
		border: 1px dashed #93c5fd;
		border-radius: 12px;
		background: #eff6ff;
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
		background: #f8fafc;
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 24px 24px 24px 104px;
		background: rgba(15, 23, 42, 0.48);
		backdrop-filter: blur(3px);
		overflow: auto;
	}

	.modal-card {
		width: min(1080px, calc(100vw - 144px));
		max-height: calc(100vh - 48px);
		display: grid;
		grid-template-rows: auto 1fr auto;
		overflow: hidden;
		border: 1px solid #d9e2ec;
		border-radius: 14px;
		background: #ffffff;
		box-shadow: 0 22px 60px rgba(15, 23, 42, 0.22);
	}

	.modal-header,
	.modal-footer {
		margin: 0;
		padding: 14px 18px;
	}

	.modal-footer {
		justify-content: flex-end;
		border-top: 1px solid #e5edf5;
		border-bottom: 0;
		background: #f8fafc;
	}

	.modal-body {
		overflow: auto;
		padding: 16px;
		background: #ffffff;
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
		background: #ffffff;
		margin-bottom: 14px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.vessel-picker .compact-title {
		margin: 0;
	}

	.route-section-title {
		border: 1px solid #d9e2ec;
		border-bottom: 0;
		border-radius: 12px 12px 0 0;
		background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
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

	.route-map-editor {
		display: grid;
		grid-template-columns: minmax(360px, 0.78fr) minmax(480px, 1.42fr);
		gap: 0;
		min-height: 540px;
		border: 1px solid #d9e2ec;
		border-radius: 0 0 12px 12px;
		background: #ffffff;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.route-point-panel,
	.route-map-card {
		min-width: 0;
		background: #ffffff;
	}

	.route-point-panel {
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
		border-right: 1px solid #e5edf5;
	}

	.point-hint {
		border-bottom: 1px solid #e5edf5;
		background: #f8fafc;
		color: #64748b;
		padding: 10px 12px;
		font-size: 11px;
		font-weight: 800;
		line-height: 1.45;
	}

	.route-map-card {
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
	}

	.map-mini-toolbar {
		margin: 0;
		padding: 10px 12px;
	}

	.map-mini-toolbar strong {
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
	}

	.route-map-shell {
		position: relative;
		width: 100%;
		min-height: 500px;
		overflow: hidden;
	}

	.route-map-shell .route-map,
	.route-map {
		width: 100%;
		height: 100%;
		min-height: 500px;
		background: #dbeafe;
	}

	.route-editor {
		width: 100%;
		height: 100%;
		max-height: 450px;
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
		background: #ffffff;
		box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
		transform: translate(8px, 8px);
		overflow: hidden;
	}

	.context-title {
		border-bottom: 1px solid #e5edf5;
		background: #f8fafc;
		color: #0f172a;
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
		background: #ffffff;
		color: #0f172a;
		padding: 0 11px;
		font-size: 11px;
		font-weight: 800;
		text-align: left;
	}

	.point-context-menu button:last-child {
		border-bottom: 0;
	}

	.point-context-menu button:hover:not(:disabled) {
		background: #eff6ff;
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
		background: #fee2e2;
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
		background: #fee2e2;
		color: #991b1b;
	}

	.move-point-btn.cancel:hover:not(:disabled) {
		background: #fecaca;
		color: #7f1d1d;
	}

	.move-mode-badge {
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		border-radius: 999px;
		border: 1px solid #fde68a;
		background: #fef9c3;
		color: #854d0e;
		padding: 6px 10px;
		font-size: 11px;
		font-weight: 900;
	}

	.mini-icon-btn,
	.mini-map-btn,
	.move-confirm-btn,
	.move-cancel-btn {
		width: 30px;
		height: 30px;
		min-height: 30px;
		font-size: 14px;
	}

	.confirm-move-btn,
	.move-confirm-btn {
		background: #dcfce7;
		color: #166534;
	}

	.cancel-move-btn,
	.move-cancel-btn {
		background: #fee2e2;
		color: #b91c1c;
	}

	@media (max-width: 1180px) {
		.voyage-grid,
		.bottom-grid,
		.route-map-editor {
			grid-template-columns: 1fr;
		}

		.detail-summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.route-point-panel {
			border-right: 0;
			border-bottom: 1px solid #e5edf5;
		}

		.modal-card {
			width: min(980px, calc(100vw - 126px));
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
		.form-grid.compact,
		.detail-summary {
			grid-template-columns: 1fr;
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
			padding: 10px;
		}

		.modal-card {
			width: 100%;
			max-height: calc(100vh - 20px);
			border-radius: 12px;
		}

		.modal-body {
			padding: 12px;
		}
	}
</style>
