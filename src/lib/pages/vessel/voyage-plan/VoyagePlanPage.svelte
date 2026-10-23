<script>
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { apiRequest } from '$lib/api/authApi.js';
	import {
		selectedVesselId as selectedVesselIdStore,
		selectedVesselInfo as selectedVesselInfoStore,
		setSelectedVessel,
		restoreSelectedVessel
	} from '$lib/stores/selectedVessel.svelte.js';
	import 'leaflet/dist/leaflet.css';
	import { addMapTileLayer } from '$lib/utils/mapStyle.js';
	import { addLeafletZoomAndScale } from '$lib/utils/leafletControls.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { getFleetAssets } from '$lib/api/fleetApi.js';
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
	import VoyagePlanHeader from './VoyagePlanHeader.svelte';
	import VoyagePlanSummary from './VoyagePlanSummary.svelte';
	import VoyagePlanMapPanel from './VoyagePlanMapPanel.svelte';
	import VoyagePlanDetailPanel from './VoyagePlanDetailPanel.svelte';
	import VoyagePlanRouteTable from './VoyagePlanRouteTable.svelte';
	import VoyagePlanHistoryTable from './VoyagePlanHistoryTable.svelte';
	import './voyage-plan-page.css';

	const PAGE_SIZE_OPTIONS = [10, 20, 50];

	export let vesselId = null;
	export let active = false;

	let loading = false;
	let activeLoading = false;
	let historyLoading = false;
	let detailLoading = false;
	let voyageActionLoading = '';
	let errorMessage = '';
	let successMessage = '';

	let permissions = new Set();
	let vessels = [];
	let selectedVesselId = '';
	let selectedVesselName = '-';
	let syncingVesselFromNavbar = false;

	let activeAssignment = null;
	let selectedAssignment = null;
	let historyItems = [];
	let selectedHistoryId = null;

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

	let L;
	let mapContainer = null;
	let routeMap;
	let markerLayer;
	let assetMarkerLayer;
	let vesselMarkerLayer;
	let zoneLayerGroup;
	let routeLine;
	let mapInitializing = false;

	let assets = [];
	let zones = [];
	let assetsLoading = false;
	let assetsError = '';
	let vesselMapInfo = null;

	$: canView = permissions.has('view_voyage_plan_vessel');
	$: currentPlan = selectedAssignment?.voyagePlan || activeAssignment?.voyagePlan || null;
	$: routePoints = normalizeRoutePoints(currentPlan?.planData || []);
	$: totalDistanceNm = calculateTotalDistanceNm(routePoints);
	$: averageSpeedKn = calculateAverageSpeed(routePoints);
	$: routePointCount = routePoints.length;
	$: activeStatusLabel = activeAssignment ? 'Assigned' : 'No Active Plan';
	$: selectedProgress = getAssignmentProgress(selectedAssignment || activeAssignment);
	$: checkpointSummary = getCheckpointSummary(routePoints);
	$: isSelectedActiveAssignment =
		Boolean(activeAssignment && selectedAssignment) &&
		String(activeAssignment.id) === String(selectedAssignment.id) &&
		!activeAssignment.endDate;
	$: canEndActiveVoyage =
		isSelectedActiveAssignment &&
		routePointCount > 0 &&
		checkpointSummary.pending === 0 &&
		checkpointSummary.skipped === 0;

	$: routeRows = buildRouteRows(routePoints);
	$: detailRows = buildDetailRows(selectedAssignment);
	$: historyRows = buildHistoryRows(historyItems);

	$: if (
		canView &&
		!loading &&
		$selectedVesselIdStore &&
		String($selectedVesselIdStore) !== String(selectedVesselId) &&
		!syncingVesselFromNavbar
	) {
		syncVesselFromNavbar($selectedVesselIdStore);
	}

	onMount(async () => {
		if (browser) restoreSelectedVessel();

		await initializePage();

		return () => {
			destroyRouteMap();
		};
	});

	$: if (!active && routeMap) {
		destroyRouteMap();
	}

	$: if (active && mapContainer && routeMap === null && !loading) {
		tick().then(() => {
			initializeOrRefreshMap(true);
		});
	}

	async function initializePage() {
		loading = true;
		clearMessages();

		try {
			await loadCurrentUser();

			const initialVesselId = resolveInitialVesselId();
			if (initialVesselId) {
				selectedVesselId = String(initialVesselId);
				updateSelectedVesselName();
			}

			if (canView) {
				await loadFleetAssets();
			}

			if (canView && selectedVesselId) {
				await loadVesselVoyageData(selectedVesselId, 1);
			}
		} catch (error) {
			errorMessage = error.message;
		} finally {
			loading = false;
			if (canView && selectedVesselId) {
				await tick();
				await initializeOrRefreshMap(true);
			}
		}
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
			paneName: 'voyageVesselZonePane',
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

	const VESSEL_LATITUDE_KEYS = [
		'latitude',
		'lat',
		'currentLatitude',
		'current_latitude',
		'lastLatitude',
		'last_latitude',
		'gpsLatitude',
		'gps_latitude',
		'gpsLat',
		'gps_lat',
		'positionLatitude',
		'position_latitude'
	];
	const VESSEL_LONGITUDE_KEYS = [
		'longitude',
		'lng',
		'lon',
		'currentLongitude',
		'current_longitude',
		'lastLongitude',
		'last_longitude',
		'gpsLongitude',
		'gps_longitude',
		'gpsLng',
		'gps_lng',
		'gpsLon',
		'gps_lon',
		'positionLongitude',
		'position_longitude'
	];
	const VESSEL_HEADING_KEYS = ['heading', 'course', 'cog', 'direction', 'bearing'];
	const VESSEL_NESTED_KEYS = [
		'data',
		'vessel',
		'vesselData',
		'detail',
		'raw',
		'rawLive',
		'latest',
		'latestStatus',
		'latestTelemetry',
		'telemetry',
		'position',
		'location',
		'gps',
		'coordinates',
		'lastPosition',
		'currentPosition'
	];

	function readFirstFiniteNumber(source, keys) {
		if (!source) return NaN;

		for (const key of keys) {
			const value = Number(source?.[key]);
			if (Number.isFinite(value)) return value;
		}

		return NaN;
	}

	function collectVesselPositionCandidates(...sources) {
		const candidates = [];
		const visited = new Set();

		function visit(source, depth = 0) {
			if (!source || typeof source !== 'object' || depth > 4 || visited.has(source)) return;

			visited.add(source);
			candidates.push(source);

			for (const key of VESSEL_NESTED_KEYS) {
				const nested = source?.[key];
				if (Array.isArray(nested)) {
					nested.forEach((item) => visit(item, depth + 1));
				} else {
					visit(nested, depth + 1);
				}
			}
		}

		sources.forEach((source) => visit(source));
		return candidates;
	}

	function getVesselMapPosition() {
		const candidates = collectVesselPositionCandidates(
			vesselMapInfo,
			$selectedVesselInfoStore,
			selectedAssignment,
			selectedAssignment?.vessel,
			selectedAssignment?.vesselData,
			activeAssignment,
			activeAssignment?.vessel,
			activeAssignment?.vesselData
		);

		for (const candidate of candidates) {
			const latitude = readFirstFiniteNumber(candidate, VESSEL_LATITUDE_KEYS);
			const longitude = readFirstFiniteNumber(candidate, VESSEL_LONGITUDE_KEYS);

			if (
				Number.isFinite(latitude) &&
				Number.isFinite(longitude) &&
				!(latitude === 0 && longitude === 0)
			) {
				const heading = readFirstFiniteNumber(candidate, VESSEL_HEADING_KEYS);
				return {
					latitude,
					longitude,
					heading: Number.isFinite(heading) ? heading : 0,
					name:
						candidate?.vesselName ||
						candidate?.name ||
						candidate?.deviceName ||
						selectedVesselName ||
						'Vessel'
				};
			}
		}

		return null;
	}

	function createVesselMarkerIcon(vessel) {
		return L.divIcon({
			className: 'voyage-current-vessel-leaflet-icon',
			html: `
				<img
					class="voyage-current-vessel-marker-icon"
					src="/assets/vessel.png"
					alt="${escapeHtml(vessel?.name || 'Vessel')}"
					style="transform: rotate(${Number(vessel?.heading || 0)}deg) scaleX(1.16);"
				/>
			`,
			iconSize: [28, 60],
			iconAnchor: [14, 30],
			popupAnchor: [0, -32]
		});
	}

	function renderVesselMarker() {
		if (!L || !routeMap) return;

		if (!vesselMarkerLayer) {
			vesselMarkerLayer = L.layerGroup().addTo(routeMap);
		}

		vesselMarkerLayer.clearLayers();

		const vessel = getVesselMapPosition();
		if (!vessel) return;

		const marker = L.marker([vessel.latitude, vessel.longitude], {
			icon: createVesselMarkerIcon(vessel),
			zIndexOffset: 1800
		});

		marker.bindPopup(
			`
				<div class="voyage-current-vessel-popup">
					<div class="map-popup-hero">
						<div class="map-popup-icon vessel-popup-icon">
							<img src="/assets/vessel.png" alt="Vessel icon" />
						</div>
						<div class="map-popup-heading">
							<span>Selected Vessel</span>
							<strong>${escapeHtml(vessel.name)}</strong>
						</div>
					</div>
					<div class="map-popup-body">
						<div class="popup-info-row coordinate-row">
							<span>Latitude</span>
							<div class="popup-coordinate-value">${createCopyableCoordinateHtml(vessel.latitude, 'vessel latitude')}</div>
						</div>
						<div class="popup-info-row coordinate-row">
							<span>Longitude</span>
							<div class="popup-coordinate-value">${createCopyableCoordinateHtml(vessel.longitude, 'vessel longitude')}</div>
						</div>
						<div class="popup-info-row">
							<span>Heading</span>
							<strong>${Number(vessel.heading || 0).toFixed(1)}°</strong>
						</div>
					</div>
				</div>
			`,
			{
				className: 'voyage-vessel-map-popup'
			}
		);

		marker.addTo(vesselMarkerLayer);
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

			console.log('[VOYAGE_PLAN_VESSEL][ASSETS]', assets);

			renderZoneLayer();
			renderAssetMarkers();
		} catch (error) {
			console.error('[VOYAGE_PLAN_VESSEL][ASSETS][ERROR]', error);
			assets = [];
			zones = [];
			assetsError = error?.message || 'Failed to load fleet assets.';
			renderZoneLayer();
			renderAssetMarkers();
		} finally {
			assetsLoading = false;
		}
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
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

			marker.bindPopup(
				`
					<div class="asset-popup route-asset-popup">
						<div class="map-popup-hero">
							<div class="map-popup-icon">
								<img src="${getAssetIconUrl(asset)}" alt="${escapeHtml(getAssetTypeLabel(asset))} icon" />
							</div>
							<div class="map-popup-heading">
								<span>Fleet Asset</span>
								<strong>${escapeHtml(asset.assetName)}</strong>
							</div>
							<em>${escapeHtml(getAssetTypeLabel(asset))}</em>
						</div>

						<div class="map-popup-body">
							<div class="popup-info-row">
								<span>Asset ID</span>
								<strong>${escapeHtml(asset.id ?? '-')}</strong>
							</div>
							<div class="popup-info-row coordinate-row">
								<span>Latitude</span>
								<div class="popup-coordinate-value">${createCopyableCoordinateHtml(asset.latitude, 'asset latitude')}</div>
							</div>
							<div class="popup-info-row coordinate-row">
								<span>Longitude</span>
								<div class="popup-coordinate-value">${createCopyableCoordinateHtml(asset.longitude, 'asset longitude')}</div>
							</div>
						</div>
					</div>
				`,
				{
					className: 'voyage-vessel-map-popup'
				}
			);

			marker.addTo(assetMarkerLayer);
		});
	}

	async function loadCurrentUser() {
		const result = await apiFetch('/users/current-user', { method: 'GET' });
		const user = result?.data || {};

		permissions = collectPermissions(user);

		const accessDetails = Array.isArray(user?.vesselAccess?.details)
			? user.vesselAccess.details
			: [];
		vessels = sortByAlpha(
			accessDetails.map(normalizeVessel).filter(Boolean),
			(vessel) => vessel.vesselName,
			(vessel) => vessel.deviceId
		);

		if (!vessels.length) {
			await loadFallbackVessels();
		}
	}

	async function loadFallbackVessels() {
		try {
			const result = await apiFetch('/users/my-vessels', { method: 'GET' });
			vessels = sortByAlpha(
				(result?.data || []).map(normalizeVessel).filter(Boolean),
				(vessel) => vessel.vesselName,
				(vessel) => vessel.deviceId
			);
		} catch (error) {
			console.warn('[VOYAGE_PLAN_VESSEL][LOAD_VESSELS_ERROR]', error);
		}
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
					result.add('view_voyage_plan_vessel');
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

	function resolveInitialVesselId() {
		if ($selectedVesselIdStore && Number.isFinite(Number($selectedVesselIdStore))) {
			return Number($selectedVesselIdStore);
		}

		if (vesselId) return Number(vesselId);

		if (browser) {
			const keys = ['selected_vessel_id', 'selectedVesselId', 'vessel_id', 'active_vessel_id'];
			for (const key of keys) {
				const value = localStorage.getItem(key);
				if (value && Number.isFinite(Number(value))) return Number(value);
			}
		}

		return vessels[0]?.id || null;
	}

	function updateSelectedVesselName() {
		const storeInfo = $selectedVesselInfoStore || {};
		const storeVesselId = storeInfo?.vesselId ?? storeInfo?.id ?? storeInfo?.dbId;

		if (selectedVesselId && Number(storeVesselId) === Number(selectedVesselId)) {
			selectedVesselName =
				storeInfo?.vesselName ||
				storeInfo?.name ||
				storeInfo?.deviceName ||
				`Vessel ${selectedVesselId}`;
			return;
		}

		selectedVesselName =
			vessels.find((item) => item.id === Number(selectedVesselId))?.vesselName ||
			(selectedVesselId ? `Vessel ${selectedVesselId}` : '-');
	}

	async function handleVesselChange() {
		clearMessages();
		updateSelectedVesselName();

		const vessel = vessels.find((item) => Number(item.id) === Number(selectedVesselId));

		if (vessel) {
			setSelectedVessel(toSelectedVesselStorePayload(vessel));
		} else if (browser && selectedVesselId) {
			localStorage.setItem('selected_vessel_id', String(selectedVesselId));
		}

		resetSelectedAssignmentState();
		await loadVesselVoyageData(selectedVesselId, 1);
	}

	function toSelectedVesselStorePayload(vessel) {
		return {
			id: String(vessel.id),
			vesselId: vessel.id,
			dbId: vessel.id,
			deviceId: vessel.deviceId || '',
			vesselName: vessel.vesselName || `Vessel ${vessel.id}`,
			name: vessel.vesselName || `Vessel ${vessel.id}`,
			deviceName: vessel.vesselName || `Vessel ${vessel.id}`,
			raw: vessel.raw || vessel
		};
	}

	function resetSelectedAssignmentState() {
		activeAssignment = null;
		selectedAssignment = null;
		selectedHistoryId = null;
		historyItems = [];
		vesselMapInfo = null;
		page = 1;
	}

	async function syncVesselFromNavbar(vesselIdFromStore) {
		if (!vesselIdFromStore || syncingVesselFromNavbar) return;
		if (String(vesselIdFromStore) === String(selectedVesselId)) return;

		syncingVesselFromNavbar = true;
		clearMessages();

		try {
			selectedVesselId = String(vesselIdFromStore);
			updateSelectedVesselName();
			resetSelectedAssignmentState();

			console.log('[VOYAGE_PLAN_VESSEL][NAVBAR_VESSEL_CHANGED]', selectedVesselId);

			if (canView) {
				await loadVesselVoyageData(selectedVesselId, 1);
			}
		} finally {
			syncingVesselFromNavbar = false;
		}
	}

	async function loadVesselVoyageData(vesselId = selectedVesselId, targetPage = 1) {
		if (!vesselId) return;

		await Promise.all([
			loadSelectedVesselMapInfo(vesselId),
			loadActiveVoyagePlan(vesselId),
			loadHistory(vesselId, targetPage)
		]);
	}

	async function loadSelectedVesselMapInfo(vesselId = selectedVesselId) {
		if (!vesselId) return;

		try {
			const [dashboardResult, latestStatusResult] = await Promise.allSettled([
				apiFetch(`/dashboard/vessels/${vesselId}`, {
					method: 'GET',
					headers: {
						Accept: 'application/json'
					}
				}),
				apiFetch(`/vessels/${vesselId}/latest-status`, {
					method: 'GET',
					headers: {
						Accept: 'application/json'
					}
				})
			]);

			const dashboardData =
				dashboardResult.status === 'fulfilled'
					? dashboardResult.value?.data || dashboardResult.value
					: null;
			const latestStatus =
				latestStatusResult.status === 'fulfilled'
					? latestStatusResult.value?.data || latestStatusResult.value
					: null;

			vesselMapInfo = {
				...(dashboardData || {}),
				latestStatus,
				rawDashboard: dashboardData,
				rawLatestStatus: latestStatus
			};
		} catch (error) {
			console.warn('[VOYAGE_PLAN_VESSEL][VESSEL_MAP_INFO][ERROR]', error);
			vesselMapInfo = null;
		} finally {
			renderVesselMarker();
		}
	}

	async function loadActiveVoyagePlan(vesselId = selectedVesselId) {
		if (!vesselId) return;

		activeLoading = true;
		clearMessages();

		try {
			const result = await apiFetch(`/voyage-plans/vessels/${vesselId}/active`, {
				method: 'GET'
			});

			activeAssignment = result?.data || null;
			if (
				activeAssignment &&
				(!selectedAssignment || String(selectedAssignment.id) === String(activeAssignment.id))
			) {
				selectedAssignment = activeAssignment;
				selectedHistoryId = activeAssignment.id;
			}

			await tick();
			await initializeOrRefreshMap(true);
		} catch (error) {
			activeAssignment = null;
			if (!String(error.message).toLowerCase().includes('not found')) {
				errorMessage = error.message;
			}
			await tick();
			await initializeOrRefreshMap(false);
		} finally {
			activeLoading = false;
		}
	}

	async function loadHistory(vesselId = selectedVesselId, targetPage = page) {
		if (!vesselId) return;

		historyLoading = true;
		clearMessages();

		try {
			const result = await apiFetch(
				`/voyage-plans/vessels/${vesselId}/history?page=${targetPage}&pageSize=${pageSize}`,
				{ method: 'GET' }
			);

			historyItems = result?.data?.items || [];
			pagination = result?.data?.pagination || pagination;
			page = pagination.page || targetPage;
		} catch (error) {
			historyItems = [];
			errorMessage = error.message;
		} finally {
			historyLoading = false;
		}
	}

	async function openHistoryDetail(historyId) {
		if (!selectedVesselId || !historyId) return;

		detailLoading = true;
		clearMessages();
		selectedHistoryId = historyId;

		try {
			const result = await apiFetch(
				`/voyage-plans/vessels/${selectedVesselId}/history/${historyId}`,
				{ method: 'GET' }
			);

			selectedAssignment = result?.data || null;
			await tick();
			await initializeOrRefreshMap(true);
		} catch (error) {
			errorMessage = error.message;
		} finally {
			detailLoading = false;
		}
	}

	function showActivePlan() {
		selectedAssignment = activeAssignment;
		selectedHistoryId = activeAssignment?.id || null;
		initializeOrRefreshMap(true);
	}

	async function refreshSelectedVoyageData() {
		if (!selectedVesselId) return;
		await loadVesselVoyageData(selectedVesselId, page);
	}

	function isCheckpointActionable(point) {
		const status = String(point?.status || '').toUpperCase();
		return isSelectedActiveAssignment && !['COMPLETED', 'MANUAL_COMPLETED'].includes(status);
	}

	async function cancelActiveVoyageAssignment() {
		if (!selectedVesselId || !activeAssignment) return;
		if (browser && !window.confirm('Cancel the active voyage assignment for this vessel?')) return;

		voyageActionLoading = 'cancel-active';
		clearMessages();

		try {
			const result = await apiFetch(`/voyage-plans/vessels/${selectedVesselId}/active`, {
				method: 'DELETE'
			});

			successMessage = result?.message || 'Active voyage assignment canceled successfully.';
			activeAssignment = null;
			selectedAssignment = null;
			selectedHistoryId = null;
			await refreshSelectedVoyageData();
		} catch (error) {
			errorMessage = error.message;
		} finally {
			voyageActionLoading = '';
		}
	}

	async function completeCheckpointManually(order) {
		if (!selectedVesselId || !order) return;
		if (browser && !window.confirm(`Mark checkpoint ${order} as manually completed?`)) return;

		voyageActionLoading = `complete-${order}`;
		clearMessages();

		try {
			const result = await apiFetch(
				`/voyage-plans/vessels/${selectedVesselId}/active/checkpoints/${order}/complete`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ reachedAt: new Date().toISOString() })
				}
			);

			successMessage = result?.message || `Checkpoint ${order} completed successfully.`;
			await refreshSelectedVoyageData();
		} catch (error) {
			errorMessage = error.message;
		} finally {
			voyageActionLoading = '';
		}
	}

	async function endActiveVoyageAssignment() {
		if (!selectedVesselId || !activeAssignment) return;
		if (browser && !window.confirm('End the active voyage assignment for this vessel?')) return;

		voyageActionLoading = 'end-active';
		clearMessages();

		try {
			const result = await apiFetch(`/voyage-plans/vessels/${selectedVesselId}/active/end`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endDate: new Date().toISOString() })
			});

			successMessage = result?.message || 'Active voyage assignment ended successfully.';
			activeAssignment = null;
			selectedAssignment = null;
			selectedHistoryId = null;
			await refreshSelectedVoyageData();
		} catch (error) {
			errorMessage = error.message;
		} finally {
			voyageActionLoading = '';
		}
	}

	function normalizeRoutePoints(points = []) {
		return points
			.map((point, index) => {
				const averageSpeed =
					point?.average_speed === null ||
					point?.average_speed === undefined ||
					point?.average_speed === ''
						? null
						: Number(point.average_speed);

				return {
					order: Number(point?.order || index + 1),
					latitude: Number(point?.latitude ?? point?.lat),
					longitude: Number(point?.longitude ?? point?.lon ?? point?.lng),
					speed_kn:
						point?.speed_kn === null || point?.speed_kn === undefined || point?.speed_kn === ''
							? null
							: Number(point.speed_kn),
					status: String(point?.status || 'PENDING').toUpperCase(),
					reachedAt: point?.reached_at ?? point?.reachedAt ?? null,
					average_speed: Number.isFinite(averageSpeed) ? averageSpeed : null
				};
			})
			.filter(
				(point) =>
					Number.isFinite(point.latitude) &&
					Number.isFinite(point.longitude) &&
					point.latitude >= -90 &&
					point.latitude <= 90 &&
					point.longitude >= -180 &&
					point.longitude <= 180
			)
			.sort((a, b) => a.order - b.order);
	}

	function getAssignmentProgress(assignment) {
		const progress = Number(
			assignment?.progress_percentage ?? assignment?.progressPercentage ?? assignment?.percentage
		);

		return Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
	}

	function getCheckpointSummary(points = []) {
		const total = points.length;
		const completed = points.filter((point) =>
			['COMPLETED', 'MANUAL_COMPLETED'].includes(String(point.status || '').toUpperCase())
		).length;
		const skipped = points.filter(
			(point) => String(point.status || '').toUpperCase() === 'SKIPPED'
		).length;
		const pending = points.filter(
			(point) => String(point.status || '').toUpperCase() === 'PENDING'
		).length;

		return { total, completed, skipped, pending };
	}

	function formatCheckpointStatus(status) {
		const normalized = String(status || 'PENDING').toUpperCase();
		return normalized
			.toLowerCase()
			.split('_')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function getCheckpointStatusClass(status) {
		const normalized = String(status || 'PENDING').toUpperCase();
		if (normalized === 'COMPLETED') return 'status-completed';
		if (normalized === 'MANUAL_COMPLETED') return 'status-manual';
		if (normalized === 'SKIPPED') return 'status-skipped';
		return 'status-pending';
	}

	async function ensureLeaflet() {
		if (!browser) return null;
		if (L) return L;

		const module = await import('leaflet');
		L = module.default || module;
		return L;
	}

	async function initializeOrRefreshMap(shouldFit = false) {
		if (!browser || !active || !mapContainer) return;

		if (!routeMap) {
			await initializeMap();
		}

		refreshMapRoute(shouldFit);
	}

	async function initializeMap() {
		if (!browser || !active || !mapContainer || routeMap || mapInitializing) return;

		mapInitializing = true;

		try {
			const leaflet = await ensureLeaflet();
			if (!leaflet) return;

			routeMap = leaflet.map(mapContainer, {
				zoomControl: false,
				preferCanvas: true
			});

			addMapTileLayer(leaflet, routeMap);
			addLeafletZoomAndScale(leaflet, routeMap);

			renderZoneLayer();
			assetMarkerLayer = leaflet.layerGroup().addTo(routeMap);
			vesselMarkerLayer = leaflet.layerGroup().addTo(routeMap);
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
			renderVesselMarker();

			routeMap.setView([-2.5489, 118.0149], 5);

			setTimeout(() => {
				routeMap?.invalidateSize({ pan: false });
			}, 120);
		} finally {
			mapInitializing = false;
		}
	}

	function refreshMapRoute(shouldFit = false) {
		if (!L || !routeMap || !markerLayer || !routeLine) return;

		markerLayer.clearLayers();
		renderVesselMarker();

		const points = routePoints;
		const latLngs = points.map((point) => [point.latitude, point.longitude]);
		const vesselPosition = getVesselMapPosition();
		const vesselLatLng = vesselPosition
			? [vesselPosition.latitude, vesselPosition.longitude]
			: null;
		const fitLatLngs = vesselLatLng ? [...latLngs, vesselLatLng] : latLngs;
		routeLine.setLatLngs(latLngs);

		points.forEach((point, index) => {
			const marker = L.marker([point.latitude, point.longitude], {
				icon: L.divIcon({
					className: '',
					html: `<div class="route-marker ${index === 0 ? 'start' : ''} ${index === points.length - 1 ? 'finish' : ''} ${getCheckpointStatusClass(point.status)}">${point.order}</div>`,
					iconSize: [30, 30],
					iconAnchor: [15, 15]
				})
			});

			const speedText = Number.isFinite(point.speed_kn) ? `${point.speed_kn} kn` : '-';
			const averageSpeedText = Number.isFinite(point.average_speed)
				? `${point.average_speed.toFixed(2)} kn`
				: '-';
			marker.bindTooltip(`Point ${point.order}`, { direction: 'top', offset: [0, -10] });
			marker.bindPopup(
				`
					<div class="route-point-popup">
						<div class="map-popup-hero">
							<div class="route-popup-icon">${point.order}</div>
							<div class="map-popup-heading">
								<span>Route Checkpoint</span>
								<strong>Point ${point.order}</strong>
							</div>
							<em class="${getCheckpointStatusClass(point.status)}">${formatCheckpointStatus(point.status)}</em>
						</div>

						<div class="map-popup-body">
							<div class="popup-info-row coordinate-row">
								<span>Latitude</span>
								<div class="popup-coordinate-value">${createCopyableCoordinateHtml(point.latitude, 'point latitude')}</div>
							</div>
							<div class="popup-info-row coordinate-row">
								<span>Longitude</span>
								<div class="popup-coordinate-value">${createCopyableCoordinateHtml(point.longitude, 'point longitude')}</div>
							</div>
							<div class="popup-info-row">
								<span>Planned Speed</span>
								<strong>${speedText}</strong>
							</div>
							<div class="popup-info-row">
								<span>Actual Avg Speed</span>
								<strong>${averageSpeedText}</strong>
							</div>
							<div class="popup-info-row">
								<span>Reached At</span>
								<strong>${formatDate(point.reachedAt)}</strong>
							</div>
						</div>
					</div>
				`,
				{
					className: 'voyage-vessel-map-popup'
				}
			);
			marker.addTo(markerLayer);
		});

		if (shouldFit && fitLatLngs.length >= 2) {
			const bounds = L.latLngBounds(fitLatLngs);
			routeMap.fitBounds(bounds, { padding: [34, 34], maxZoom: 13 });
		} else if (shouldFit && fitLatLngs.length === 1) {
			routeMap.setView(fitLatLngs[0], 12);
		}

		setTimeout(() => {
			routeMap?.invalidateSize({ pan: false });
		}, 80);
	}

	function destroyRouteMap() {
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
		vesselMarkerLayer = null;
		zoneLayerGroup = null;
		routeLine = null;
	}

	function fitMap() {
		refreshMapRoute(true);
	}

	function calculateTotalDistanceNm(points = []) {
		if (!points.length || points.length < 2) return 0;
		let totalKm = 0;

		for (let index = 1; index < points.length; index += 1) {
			totalKm += haversineKm(points[index - 1], points[index]);
		}

		return totalKm / 1.852;
	}

	function calculateAverageSpeed(points = []) {
		const speedValues = points
			.map((point) => point.speed_kn)
			.filter((value) => Number.isFinite(value) && value > 0);

		if (!speedValues.length) return null;
		return speedValues.reduce((sum, value) => sum + value, 0) / speedValues.length;
	}

	function haversineKm(pointA, pointB) {
		const earthRadiusKm = 6371;
		const dLat = toRadians(pointB.latitude - pointA.latitude);
		const dLon = toRadians(pointB.longitude - pointA.longitude);
		const lat1 = toRadians(pointA.latitude);
		const lat2 = toRadians(pointB.latitude);

		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return earthRadiusKm * c;
	}

	function toRadians(value) {
		return (Number(value) * Math.PI) / 180;
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

	function formatNumber(value, digits = 2, suffix = '') {
		if (!Number.isFinite(Number(value))) return '-';
		return `${Number(value).toFixed(digits)}${suffix}`;
	}

	function getAssignmentUser(assignment) {
		return (
			assignment?.user?.name ||
			assignment?.user?.username ||
			`User ${assignment?.assignedBy || '-'}`
		);
	}

	function buildRouteRows(points) {
		return points.map((point) => ({
			key: point.order,
			order: point.order,
			statusLabel: formatCheckpointStatus(point.status),
			statusClass: getCheckpointStatusClass(point.status),
			latitude: point.latitude,
			longitude: point.longitude,
			speedLabel: Number.isFinite(point.speed_kn) ? `${point.speed_kn} kn` : '-',
			averageSpeedLabel: Number.isFinite(point.average_speed)
				? `${point.average_speed.toFixed(2)} kn`
				: '-',
			reachedAtLabel: formatDate(point.reachedAt),
			actionable: isCheckpointActionable(point)
		}));
	}

	function buildDetailRows(assignment) {
		if (!assignment) return [];

		return [
			{ key: 'assignment-id', label: 'Assignment ID', value: `#${assignment.id}` },
			{ key: 'voyage-plan-id', label: 'Voyage Plan ID', value: `#${assignment.voyagePlanId}` },
			{ key: 'start-date', label: 'Start Date', value: formatDate(assignment.startDate) },
			{ key: 'end-date', label: 'End Date', value: formatDate(assignment.endDate) },
			{ key: 'assigned-at', label: 'Assigned At', value: formatDate(assignment.assignedAt) },
			{ key: 'assigned-by', label: 'Assigned By', value: getAssignmentUser(assignment) },
			{ key: 'progress', label: 'Progress', value: formatNumber(selectedProgress, 2, '%') },
			{
				key: 'checkpoints',
				label: 'Checkpoints',
				value: `${checkpointSummary.completed} completed · ${checkpointSummary.skipped} skipped · ${checkpointSummary.pending} pending`
			}
		];
	}

	function buildHistoryRows(items) {
		return items.map((item, index) => ({
			...item,
			key: item.id ?? index,
			startDateLabel: formatDate(item.startDate),
			endDateLabel: formatDate(item.endDate),
			assignedAtLabel: formatDate(item.assignedAt),
			userLabel: getAssignmentUser(item)
		}));
	}
</script>

<section class="voyage-vessel-page">
	<VoyagePlanHeader
		vesselName={selectedVesselName}
		{loading}
		disabled={!(selectedVesselId || $selectedVesselIdStore) || loading}
		onRefresh={() => loadVesselVoyageData(selectedVesselId || $selectedVesselIdStore, 1)}
	/>

	{#if errorMessage}
		<div class="status-box error-box">{errorMessage}</div>
	{/if}

	{#if successMessage}
		<div class="status-box success-box">{successMessage}</div>
	{/if}

	{#if loading}
		<LoadingSkeleton label="Loading vessel voyage plan page" variant="voyage-plan-vessel" />
	{:else if !canView}
		<div class="status-box error-box">
			This user does not have the required permission: <b>view_voyage_plan_vessel</b>.
		</div>
	{:else}
		<VoyagePlanSummary
			statusLabel={activeStatusLabel}
			{routePointCount}
			progress={selectedProgress}
			progressLabel={formatNumber(selectedProgress, 2, '%')}
			distanceLabel={formatNumber(totalDistanceNm, 2, ' NM')}
			averageSpeedLabel={averageSpeedKn === null ? '-' : formatNumber(averageSpeedKn, 2, ' kn')}
		/>

		<section class="main-grid">
			<VoyagePlanMapPanel
				bind:mapContainer
				planName={currentPlan?.voyageName || 'No Active Route'}
				{routePointCount}
				assetsCount={assets.length}
				{assetsLoading}
				{assetsError}
				activeAssignment={Boolean(activeAssignment)}
				{activeLoading}
				{detailLoading}
				{active}
				{zones}
				onFit={fitMap}
				onShowActivePlan={showActivePlan}
			/>

			<VoyagePlanDetailPanel
				voyageName={selectedAssignment?.voyagePlan?.voyageName || '-'}
				rows={detailRows}
				{detailLoading}
				{isSelectedActiveAssignment}
				{canEndActiveVoyage}
				actionLoading={voyageActionLoading}
				onCancel={cancelActiveVoyageAssignment}
				onEnd={endActiveVoyageAssignment}
			/>
		</section>

		<VoyagePlanRouteTable
			rows={routeRows}
			actionLoading={voyageActionLoading}
			onComplete={completeCheckpointManually}
		/>

		<VoyagePlanHistoryTable
			rows={historyRows}
			{pagination}
			{historyLoading}
			{detailLoading}
			{selectedHistoryId}
			onView={openHistoryDetail}
			onPrev={() => loadHistory(selectedVesselId, page - 1)}
			onNext={() => loadHistory(selectedVesselId, page + 1)}
		/>
	{/if}
</section>
