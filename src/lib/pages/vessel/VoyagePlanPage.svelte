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
	import { VMS_TILE_URL, VMS_TILE_OPTIONS } from '$lib/mapStyle.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
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

	const PAGE_SIZE_OPTIONS = [10, 20, 50];
	const ASSET_LEGEND_TYPES = ['anchor', 'buoy', 'dock', 'shipyard', 'mess', 'office', 'fso', 'rig', 'whp'];

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
	let mapContainer;
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
			assets = rows.map(normalizeAsset).filter(Boolean);

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
		vessels = accessDetails.map(normalizeVessel).filter(Boolean);

		if (!vessels.length) {
			await loadFallbackVessels();
		}
	}

	async function loadFallbackVessels() {
		try {
			const result = await apiFetch('/users/my-vessels', { method: 'GET' });
			vessels = (result?.data || []).map(normalizeVessel).filter(Boolean);
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
			const [fleetResult, latestStatusResult] = await Promise.allSettled([
				apiFetch(`/fleet/vessels/${vesselId}`, {
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

			const fleetData = fleetResult.status === 'fulfilled' ? fleetResult.value?.data || fleetResult.value : null;
			const latestStatus =
				latestStatusResult.status === 'fulfilled'
					? latestStatusResult.value?.data || latestStatusResult.value
					: null;

			vesselMapInfo = {
				...(fleetData || {}),
				latestStatus,
				rawFleet: fleetData,
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
				zoomControl: true,
				preferCanvas: true
			});

			leaflet.tileLayer(VMS_TILE_URL, VMS_TILE_OPTIONS).addTo(routeMap);

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
		const vesselLatLng = vesselPosition ? [vesselPosition.latitude, vesselPosition.longitude] : null;
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
</script>

<section class="voyage-vessel-page">
	<section class="voyage-header-card">
		<div class="header-copy">
			<div class="page-kicker">Vessel Voyage Plan</div>
			<h1>{selectedVesselName}</h1>
			<p>Active voyage route and assignment history for the selected vessel.</p>
		</div>

		<button
			type="button"
			class="primary-button header-refresh-button"
			on:click={() => loadVesselVoyageData(selectedVesselId || $selectedVesselIdStore, 1)}
			disabled={!(selectedVesselId || $selectedVesselIdStore) || loading}
		>
			{loading ? 'Loading...' : 'Refresh Data'}
		</button>
	</section>

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
		<section class="summary-grid">
			<article class="summary-card">
				<span>Status</span>
				<strong>{activeStatusLabel}</strong>
			</article>

			<article class="summary-card">
				<span>Route Points</span>
				<strong>{routePointCount}</strong>
			</article>

			<article class="summary-card progress-summary-card">
				<span>Progress</span>
				<strong>{formatNumber(selectedProgress, 2, '%')}</strong>
				<div class="progress-track">
					<i style={`width: ${selectedProgress}%`}></i>
				</div>
			</article>

			<article class="summary-card">
				<span>Total Distance</span>
				<strong>{formatNumber(totalDistanceNm, 2, ' NM')}</strong>
			</article>

			<article class="summary-card">
				<span>Average Speed</span>
				<strong>{averageSpeedKn === null ? '-' : formatNumber(averageSpeedKn, 2, ' kn')}</strong>
			</article>
		</section>

		<section class="main-grid">
			<section class="map-panel">
				<div class="section-header map-section-header">
					<div class="map-title">
						<span class="section-kicker">Route Map</span>
						<h2>{currentPlan?.voyageName || 'No Active Route'}</h2>
						<div class="map-meta-line">
							<span>{routePointCount} route points</span>
							<span>{assetsLoading ? 'Loading assets...' : `${assets.length} assets`}</span>
							{#if assetsError}
								<span class="asset-error">{assetsError}</span>
							{/if}
						</div>
					</div>

					<div class="section-actions map-actions">
						<button type="button" on:click={fitMap}>Fit Map</button>
						{#if activeAssignment}
							<button type="button" on:click={showActivePlan} disabled={detailLoading}>Show Active Plan</button>
						{/if}
					</div>
				</div>

				<div class="map-shell">
					{#if active}
						<div class="route-map" bind:this={mapContainer}></div>
					{/if}

					{#if activeLoading || detailLoading || assetsLoading}
						<div class="map-loading-overlay">
							<LoadingSkeleton label="Loading route map data" variant="voyage-route-map" compact />
						</div>
					{/if}

					{#if !routePointCount}
						<div class="map-empty">
							<strong>No route data</strong>
							<span>Select a vessel or history item that has route points.</span>
						</div>
					{/if}
				</div>

				<div class="route-map-legend" aria-label="Route map legend">
					<div class="legend-group">
						<span class="legend-title">Route</span>
						<span class="legend-item">
							<i class="legend-route-dot start"></i>
							Start
						</span>
						<span class="legend-item">
							<i class="legend-route-dot pending"></i>
							Pending
						</span>
						<span class="legend-item">
							<i class="legend-route-dot completed"></i>
							Completed
						</span>
						<span class="legend-item">
							<i class="legend-route-dot manual"></i>
							Manual
						</span>
						<span class="legend-item">
							<i class="legend-route-dot skipped"></i>
							Skipped
						</span>
						<span class="legend-item">
							<i class="legend-route-dot finish"></i>
							Finish
						</span>
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

			<section class="detail-panel">
				<div class="section-header">
					<div>
						<span class="section-kicker">Assignment Detail</span>
						<h2>{selectedAssignment?.voyagePlan?.voyageName || '-'}</h2>
					</div>
				</div>

				{#if selectedAssignment}
					{#if detailLoading}
						<LoadingSkeleton label="Loading assignment detail" variant="voyage-assignment-detail" compact />
					{/if}
					<div class="detail-list">
						<div><span>Assignment ID</span><strong>#{selectedAssignment.id}</strong></div>
						<div>
							<span>Voyage Plan ID</span><strong>#{selectedAssignment.voyagePlanId}</strong>
						</div>
						<div>
							<span>Start Date</span><strong>{formatDate(selectedAssignment.startDate)}</strong>
						</div>
						<div>
							<span>End Date</span><strong>{formatDate(selectedAssignment.endDate)}</strong>
						</div>
						<div>
							<span>Assigned At</span><strong>{formatDate(selectedAssignment.assignedAt)}</strong>
						</div>
						<div>
							<span>Assigned By</span><strong>{getAssignmentUser(selectedAssignment)}</strong>
						</div>
						<div>
							<span>Progress</span><strong>{formatNumber(selectedProgress, 2, '%')}</strong>
						</div>
						<div>
							<span>Checkpoints</span>
							<strong>
								{checkpointSummary.completed} completed · {checkpointSummary.skipped} skipped ·
								{checkpointSummary.pending} pending
							</strong>
						</div>
					</div>

					{#if isSelectedActiveAssignment}
						<div class="assignment-actions">
							<button
								type="button"
								class="danger-button"
								on:click={cancelActiveVoyageAssignment}
								disabled={Boolean(voyageActionLoading)}
							>
								{voyageActionLoading === 'cancel-active' ? 'Canceling...' : 'Cancel Active Assignment'}
							</button>

							<button
								type="button"
								class="primary-button"
								on:click={endActiveVoyageAssignment}
								disabled={Boolean(voyageActionLoading) || !canEndActiveVoyage}
								title={canEndActiveVoyage
									? 'End active voyage assignment'
									: 'All checkpoints must be completed before ending the voyage'}
							>
								{voyageActionLoading === 'end-active' ? 'Ending...' : 'End Active Voyage'}
							</button>
						</div>

						{#if !canEndActiveVoyage}
							<p class="action-note">
								Complete all pending/skipped checkpoints before ending this voyage.
							</p>
						{/if}
					{/if}
				{:else}
					<div class="empty-box">No assignment has been selected.</div>
				{/if}
			</section>
		</section>

		<section class="table-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Route Points</span>
					<h2>Voyage Route Detail</h2>
				</div>

				<strong>{routePointCount} points</strong>
			</div>

			{#if routePointCount}
				<div class="table-wrap route-table-wrap">
					<table>
						<thead>
							<tr>
								<th>Order</th>
								<th>Status</th>
								<th>Latitude</th>
								<th>Longitude</th>
								<th>Planned Speed</th>
								<th>Actual Avg Speed</th>
								<th>Reached At</th>
								<th class="right">Action</th>
							</tr>
						</thead>
						<tbody>
							{#each routePoints as point}
								<tr>
									<td>{point.order}</td>
									<td>
										<span class={`checkpoint-status ${getCheckpointStatusClass(point.status)}`}>
											{formatCheckpointStatus(point.status)}
										</span>
									</td>
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
									<td>{Number.isFinite(point.speed_kn) ? `${point.speed_kn} kn` : '-'}</td>
									<td>
										{Number.isFinite(point.average_speed) ? `${point.average_speed.toFixed(2)} kn` : '-'}
									</td>
									<td>{formatDate(point.reachedAt)}</td>
									<td class="right">
										{#if isCheckpointActionable(point)}
											<button
												type="button"
												class="table-action-btn"
												on:click={() => completeCheckpointManually(point.order)}
												disabled={Boolean(voyageActionLoading)}
											>
												{voyageActionLoading === `complete-${point.order}` ? 'Completing...' : 'Complete'}
											</button>
										{:else}
											<span class="muted-action">-</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty-box">Route points are not available yet.</div>
			{/if}
		</section>

		<section class="table-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Assignment History</span>
					<h2>Voyage Plan History</h2>
				</div>

				<strong>{pagination.totalItems || 0} rows</strong>
			</div>

			{#if historyItems.length}
				{#if historyLoading}
					<LoadingSkeleton label="Loading voyage plan history" variant="voyage-history-table" />
				{/if}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>ID</th>
								<th>Plan ID</th>
								<th>Start Date</th>
								<th>End Date</th>
								<th>Assigned At</th>
								<th>User</th>
								<th class="right">Action</th>
							</tr>
						</thead>
						<tbody>
							{#each historyItems as item}
								<tr class:active-row={selectedHistoryId === item.id}>
									<td>#{item.id}</td>
									<td>#{item.voyagePlanId}</td>
									<td>{formatDate(item.startDate)}</td>
									<td>{formatDate(item.endDate)}</td>
									<td>{formatDate(item.assignedAt)}</td>
									<td>{getAssignmentUser(item)}</td>
									<td class="right">
										<button
											type="button"
											class="table-action-btn"
											on:click={() => openHistoryDetail(item.id)}
											disabled={detailLoading}
										>
											View
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="pagination-bar">
					<button
						type="button"
						disabled={!pagination.hasPrevious || historyLoading}
						on:click={() => loadHistory(selectedVesselId, page - 1)}
					>
						Previous
					</button>

					<span>Page {pagination.page || page} of {pagination.totalPages || 1}</span>

					<button
						type="button"
						disabled={!pagination.hasNext || historyLoading}
						on:click={() => loadHistory(selectedVesselId, page + 1)}
					>
						Next
					</button>
				</div>
			{:else}
				<div class="empty-box">Voyage plan history is not available yet.</div>
			{/if}
		</section>
	{/if}
</section>

<style>
	:global(html),
	:global(body) {
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		overflow: hidden;
		font-family:
			'Plus Jakarta Sans',
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		background: var(--color-base);
		color: var(--text-primary);
	}

	:global(*) {
		box-sizing: border-box;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	.voyage-vessel-page {
		width: 100%;
		height: 100%;
		max-height: 100%;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 14px;
		background: var(--color-base);
		color: var(--text-primary);
	}

	.voyage-header-card,
	.summary-card,
	.map-panel,
	.detail-panel,
	.table-section {
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

	.header-copy {
		min-width: 0;
	}

	.header-refresh-button {
		flex-shrink: 0;
		min-width: 130px;
		justify-content: center;
	}

	.page-kicker,
	.section-kicker {
		display: inline-flex;
		width: fit-content;
		align-items: center;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		line-height: 1;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.section-kicker {
		margin-bottom: 6px;
	}

	.voyage-header-card h1 {
		margin-top: 8px;
		color: var(--text-primary);
		font-size: 22px;
		font-weight: 900;
		line-height: 1.2;
		letter-spacing: -0.02em;
	}

	.voyage-header-card p {
		margin-top: 7px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.45;
	}


	.header-meta span,
	.summary-card span,
	.detail-list span,
	label span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}


	.header-meta {
		min-width: 120px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--color-elevated);
		border: 1px solid #e2e8f0;
		text-align: right;
	}

	.header-meta strong {
		display: block;
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.filter-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}

	label {
		display: grid;
		gap: 5px;
	}

	input,
	select,
	button {
		font: inherit;
	}

	select,
	input {
		width: 100%;
		height: 32px;
		min-width: 150px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		color: var(--text-primary);
		padding: 0 9px;
		font-size: 12px;
		font-weight: 700;
		outline: none;
	}

	select:focus,
	input:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
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
		line-height: 32px;
		cursor: pointer;
		white-space: nowrap;
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

	.danger-button {
		background: var(--color-danger-muted);
		color: #b91c1c;
	}

	.danger-button:hover:not(:disabled) {
		background: #fecaca;
		color: #991b1b;
	}

	.status-box {
		margin-top: 14px;
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 900;
		line-height: 1.45;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
		color: var(--text-secondary);
	}

	.error-box {
		border-color: #fecaca;
		background: var(--color-danger-muted);
		color: #b91c1c;
	}

	.success-box {
		border-color: #bbf7d0;
		background: var(--color-success-muted);
		color: #047857;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 14px;
		margin-top: 14px;
	}

	.summary-card {
		padding: 14px 16px;
	}

	.summary-card strong {
		display: block;
		margin-top: 6px;
		overflow: hidden;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-summary-card {
		display: grid;
		align-content: start;
	}

	.progress-track {
		width: 100%;
		height: 8px;
		overflow: hidden;
		margin-top: 10px;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.22);
	}

	.progress-track i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #2563eb 0%, #14b8a6 100%);
		box-shadow: 0 0 14px rgba(37, 99, 235, 0.22);
	}

	.main-grid {
		display: grid;
		grid-template-columns: minmax(540px, 1.35fr) minmax(320px, 0.65fr);
		gap: 14px;
		align-items: stretch;
		margin-top: 14px;
	}

	.map-panel,
	.detail-panel,
	.table-section {
		min-width: 0;
		padding: 14px;
	}

	.table-section {
		margin-top: 14px;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
		margin-bottom: 12px;
	}

	.section-header h2 {
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
		line-height: 1.25;
		letter-spacing: -0.02em;
	}

	.section-header > strong {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 24px;
		padding: 4px 9px;
		border-radius: 999px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.map-section-header {
		align-items: flex-start;
	}

	.map-title {
		display: block;
		min-width: 0;
		flex: 1 1 auto;
	}

	.section-actions,
	.map-actions {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex: 0 0 auto;
		margin-left: auto;
	}

	.map-actions button {
		width: auto;
		min-width: 96px;
	}

	.map-meta-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.map-meta-line span {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		padding: 4px 8px;
		border-radius: 999px;
		border: 1px solid #d9e2ec;
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
	}

	.map-meta-line .asset-error {
		border-color: #fecaca;
		background: var(--color-danger-muted);
		color: #b91c1c;
	}

	.map-shell {
		position: relative;
		width: 100%;
		min-height: 460px;
		overflow: hidden;
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: var(--color-accent-muted);
	}

	.route-map {
		width: 100%;
		height: 460px;
		min-height: 460px;
	}

	.map-loading-overlay {
		position: absolute;
		right: 14px;
		bottom: 14px;
		z-index: 650;
		width: min(360px, calc(100% - 28px));
		pointer-events: none;
	}

	.map-empty {
		position: absolute;
		inset: 0;
		z-index: 500;
		display: grid;
		place-content: center;
		gap: 8px;
		background: rgba(248, 250, 252, 0.86);
		color: var(--text-secondary);
		text-align: center;
		font-size: 12px;
		font-weight: 800;
	}

	.map-empty strong {
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
	}

	.route-map-legend {
		display: grid;
		gap: 8px;
		margin-top: 10px;
		padding: 10px 12px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		background: var(--color-elevated);
		color: var(--text-primary);
	}

	.legend-group {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 7px;
		min-width: 0;
	}

	.legend-title {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 24px;
		padding: 4px 8px;
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 800;
		line-height: 1;
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

	.legend-route-dot.start,
	.legend-route-dot.completed {
		background: #16a34a;
	}

	.legend-route-dot.manual {
		background: #14b8a6;
	}

	.legend-route-dot.skipped {
		background: #f59e0b;
	}

	.legend-route-dot.finish {
		background: #ef4444;
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

	.detail-list {
		display: grid;
		gap: 8px;
	}

	.detail-list div {
		padding: 10px 12px;
		border: 1px solid #d9e2ec;
		border-radius: 10px;
		background: var(--color-elevated);
	}

	.detail-list strong {
		display: block;
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
		line-height: 1.35;
		word-break: break-word;
	}

	.assignment-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}

	.assignment-actions button {
		flex: 1 1 180px;
		justify-content: center;
	}

	.action-note {
		margin-top: 8px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 700;
		line-height: 1.45;
	}

	.table-wrap {
		overflow: auto;
		border: 1px solid #d9e2ec;
		background: var(--color-surface);
	}

	.route-table-wrap {
		max-height: 300px;
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
		border-bottom: 1px solid #e2e8f0;
		text-align: left;
		vertical-align: middle;
		white-space: nowrap;
	}

	th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: #2563eb;
		color: #ffffff;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	tbody td {
		background: var(--color-surface);
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
	}

	tbody tr:nth-child(even) td {
		background: var(--color-elevated);
	}

	tbody tr:hover td,
	tr.active-row td {
		background: var(--color-accent-muted) !important;
	}

	.right {
		text-align: right;
	}

	.checkpoint-status {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		padding: 4px 8px;
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.12);
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		line-height: 1;
		text-transform: uppercase;
	}

	.checkpoint-status.status-completed {
		border-color: rgba(34, 197, 94, 0.34);
		background: rgba(34, 197, 94, 0.12);
		color: #047857;
	}

	.checkpoint-status.status-manual {
		border-color: rgba(20, 184, 166, 0.36);
		background: rgba(20, 184, 166, 0.12);
		color: #0f766e;
	}

	.checkpoint-status.status-skipped {
		border-color: rgba(245, 158, 11, 0.38);
		background: rgba(245, 158, 11, 0.12);
		color: #92400e;
	}

	.checkpoint-status.status-pending {
		border-color: rgba(96, 165, 250, 0.34);
		background: rgba(96, 165, 250, 0.12);
		color: #1d4ed8;
	}

	.table-action-btn {
		height: 28px;
		min-height: 28px;
		padding: 0 10px;
		font-size: 10px;
		line-height: 28px;
	}

	.muted-action {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 800;
	}

	.pagination-bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 12px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.pagination-bar select {
		width: auto;
		min-width: 110px;
	}

	.empty-box {
		padding: 22px;
		border: 1px dashed #cbd5e1;
		border-radius: 10px;
		background: var(--color-elevated);
		color: var(--text-secondary);
		text-align: center;
		font-size: 12px;
		font-weight: 800;
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
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.32);
		font-size: 12px;
		font-weight: 900;
	}

	:global(.route-marker.start) {
		background: #16a34a;
	}

	:global(.route-marker.finish) {
		background: #ef4444;
	}

	:global(.route-marker.status-completed) {
		background: #16a34a;
	}

	:global(.route-marker.status-manual) {
		background: #14b8a6;
	}

	:global(.route-marker.status-skipped) {
		background: #f59e0b;
	}

	:global(.route-marker.status-pending) {
		background: #2563eb;
	}

	:global(.route-marker.finish.status-pending) {
		background: #2563eb;
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

	:global(.voyage-current-vessel-leaflet-icon) {
		position: relative;
		display: block;
		overflow: visible !important;
		background: transparent;
		border: none;
	}

	:global(.voyage-current-vessel-leaflet-icon::before) {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		z-index: 0;
		width: 42px;
		height: 42px;
		border-radius: 999px;
		transform: translate(-50%, -50%);
		background: rgba(34, 197, 94, 0.18);
		box-shadow:
			0 0 0 8px rgba(34, 197, 94, 0.12),
			0 0 18px rgba(34, 197, 94, 0.44);
	}

	:global(.voyage-current-vessel-leaflet-icon::after) {
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

	:global(.voyage-current-vessel-marker-icon) {
		position: relative;
		z-index: 1;
		width: 100%;
		height: 100%;
		margin: 0;
		object-fit: contain;
		display: block;
		transform-origin: center center;
		filter:
			drop-shadow(0 0 4px rgba(255, 255, 255, 0.95))
			drop-shadow(0 7px 13px rgba(15, 23, 42, 0.32));
	}

	:global(.vessel-popup-icon img) {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}

	:global(.voyage-vessel-page .leaflet-popup-content-wrapper),
	:global(.voyage-vessel-map-popup .leaflet-popup-content-wrapper) {
		overflow: hidden;
		border: 1px solid rgba(96, 165, 250, 0.22);
		border-radius: 14px;
		background: #0f172a !important;
		color: #f8fafc !important;
		box-shadow: 0 18px 42px rgba(15, 23, 42, 0.38);
	}

	:global(.voyage-vessel-map-popup .leaflet-popup-content-wrapper) {
		width: 315px;
		max-width: 78vw;
	}

	:global(.asset-popup),
	:global(.route-point-popup) {
		width: min(315px, 78vw);
	}

	:global(.voyage-vessel-page .leaflet-popup-content),
	:global(.voyage-vessel-map-popup .leaflet-popup-content) {
		margin: 0;
		color: #f8fafc !important;
	}

	:global(.voyage-vessel-page .leaflet-popup-tip),
	:global(.voyage-vessel-map-popup .leaflet-popup-tip) {
		background: #0f172a !important;
		border: 1px solid rgba(96, 165, 250, 0.22);
		box-shadow: 0 10px 22px rgba(15, 23, 42, 0.24);
	}

	:global(.voyage-vessel-page .leaflet-popup-close-button),
	:global(.voyage-vessel-map-popup .leaflet-popup-close-button) {
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

	:global(.voyage-vessel-page .leaflet-popup-close-button:hover),
	:global(.voyage-vessel-map-popup .leaflet-popup-close-button:hover) {
		background: rgba(59, 130, 246, 0.28);
		color: #ffffff !important;
	}

	:global(.asset-popup),
	:global(.route-point-popup) {
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

	:global(.asset-popup strong),
	:global(.route-point-popup strong) {
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
		max-width: 96px;
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

	:global(.map-popup-hero em.status-completed) {
		border-color: rgba(34, 197, 94, 0.34);
		background: rgba(34, 197, 94, 0.14);
		color: #86efac;
	}

	:global(.map-popup-hero em.status-manual) {
		border-color: rgba(20, 184, 166, 0.36);
		background: rgba(20, 184, 166, 0.14);
		color: #99f6e4;
	}

	:global(.map-popup-hero em.status-skipped) {
		border-color: rgba(245, 158, 11, 0.36);
		background: rgba(245, 158, 11, 0.14);
		color: #fde68a;
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

	:global(.popup-info-row > span) {
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

	:global(.asset-popup .copy-coordinate-button),
	:global(.route-point-popup .copy-coordinate-button),
	:global(.asset-popup button),
	:global(.route-point-popup button) {
		border-color: rgba(96, 165, 250, 0.34);
		background: rgba(37, 99, 235, 0.18);
		color: #bfdbfe;
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

	@media (max-width: 1180px) {
		.summary-grid,
		.main-grid {
			grid-template-columns: 1fr;
		}

		.filter-actions {
			justify-content: flex-start;
		}
	}

	@media (max-width: 720px) {
		.voyage-vessel-page {
			padding: 12px;
		}

		.voyage-header-card,
		.section-header,
		.map-title {
			align-items: flex-start;
			flex-direction: column;
		}

		.header-meta,
		.filter-actions,
		.header-refresh-button {
			width: 100%;
			text-align: left;
		}

		.summary-grid {
			grid-template-columns: 1fr;
			gap: 10px;
		}

		.route-map,
		.map-shell {
			height: 380px;
			min-height: 380px;
		}
	}
</style>
