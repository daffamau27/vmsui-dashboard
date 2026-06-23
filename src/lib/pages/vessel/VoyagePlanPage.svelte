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

	const PAGE_SIZE_OPTIONS = [10, 20, 50];

	export let vesselId = null;

	let loading = false;
	let activeLoading = false;
	let historyLoading = false;
	let detailLoading = false;
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
	let routeLine;
	let mapInitializing = false;

	let assets = [];
	let assetsLoading = false;
	let assetsError = '';

	$: canView = permissions.has('view_voyage_plan_vessel');
	$: currentPlan = selectedAssignment?.voyagePlan || activeAssignment?.voyagePlan || null;
	$: routePoints = normalizeRoutePoints(currentPlan?.planData || []);
	$: totalDistanceNm = calculateTotalDistanceNm(routePoints);
	$: averageSpeedKn = calculateAverageSpeed(routePoints);
	$: routePointCount = routePoints.length;
	$: activeStatusLabel = activeAssignment ? 'Assigned' : 'No Active Plan';

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
				await loadVesselVoyageData(1);
			}
		} catch (error) {
			errorMessage = error.message;
		} finally {
			loading = false;
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

			console.log('[VOYAGE_PLAN_VESSEL][ASSETS]', assets);

			renderAssetMarkers();
		} catch (error) {
			console.error('[VOYAGE_PLAN_VESSEL][ASSETS][ERROR]', error);
			assets = [];
			assetsError = error?.message || 'Failed to load fleet assets.';
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
				icon: L.divIcon({
					className: 'asset-leaflet-icon',
					html: `
            <div class="asset-marker-shell">
              <div class="asset-marker-core"></div>
            </div>
          `,
					iconSize: [22, 22],
					iconAnchor: [11, 11]
				})
			});

			marker.bindPopup(`
        <div class="asset-popup">
          <strong>${escapeHtml(asset.assetName)}</strong>
          <span>ID: ${escapeHtml(asset.id ?? '-')}</span>
          <span>Lat: ${escapeHtml(asset.latitude)}</span>
          <span>Lng: ${escapeHtml(asset.longitude)}</span>
        </div>
      `);

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

		await Promise.all([loadActiveVoyagePlan(vesselId), loadHistory(vesselId, targetPage)]);
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
			if (!selectedAssignment && activeAssignment) {
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

	function normalizeRoutePoints(points = []) {
		return points
			.map((point, index) => ({
				order: Number(point?.order || index + 1),
				latitude: Number(point?.latitude),
				longitude: Number(point?.longitude),
				speed_kn:
					point?.speed_kn === null || point?.speed_kn === undefined || point?.speed_kn === ''
						? null
						: Number(point.speed_kn)
			}))
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

	async function ensureLeaflet() {
		if (!browser) return null;
		if (L) return L;

		const module = await import('leaflet');
		L = module.default || module;
		return L;
	}

	async function initializeOrRefreshMap(shouldFit = false) {
		if (!browser || !mapContainer) return;

		if (!routeMap) {
			await initializeMap();
		}

		refreshMapRoute(shouldFit);
	}

	async function initializeMap() {
		if (!browser || !mapContainer || routeMap || mapInitializing) return;

		mapInitializing = true;

		try {
			const leaflet = await ensureLeaflet();
			if (!leaflet) return;

			routeMap = leaflet.map(mapContainer, {
				zoomControl: true,
				preferCanvas: true
			});

			leaflet.tileLayer(VMS_TILE_URL, VMS_TILE_OPTIONS).addTo(routeMap);

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

		const points = routePoints;
		const latLngs = points.map((point) => [point.latitude, point.longitude]);
		routeLine.setLatLngs(latLngs);

		points.forEach((point, index) => {
			const marker = L.marker([point.latitude, point.longitude], {
				icon: L.divIcon({
					className: '',
					html: `<div class="route-marker ${index === 0 ? 'start' : ''} ${index === points.length - 1 ? 'finish' : ''}">${point.order}</div>`,
					iconSize: [30, 30],
					iconAnchor: [15, 15]
				})
			});

			const speedText = Number.isFinite(point.speed_kn) ? `${point.speed_kn} kn` : '-';
			marker.bindTooltip(
				`<b>Point ${point.order}</b><br>Lat: ${point.latitude}<br>Lng: ${point.longitude}<br>Speed: ${speedText}`,
				{ direction: 'top', offset: [0, -10] }
			);
			marker.addTo(markerLayer);
		});

		if (shouldFit && latLngs.length >= 2) {
			const bounds = L.latLngBounds(latLngs);
			routeMap.fitBounds(bounds, { padding: [34, 34], maxZoom: 13 });
		} else if (shouldFit && latLngs.length === 1) {
			routeMap.setView(latLngs[0], 12);
		}

		setTimeout(() => {
			routeMap?.invalidateSize({ pan: false });
		}, 80);
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
		<div class="status-box">Loading vessel voyage plan page...</div>
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
					<div class="route-map" bind:this={mapContainer}></div>

					{#if !routePointCount}
						<div class="map-empty">
							<strong>No route data</strong>
							<span>Select a vessel or history item that has route points.</span>
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
					</div>
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
								<th>Latitude</th>
								<th>Longitude</th>
								<th>Speed (kn)</th>
							</tr>
						</thead>
						<tbody>
							{#each routePoints as point}
								<tr>
									<td>{point.order}</td>
									<td>{point.latitude}</td>
									<td>{point.longitude}</td>
									<td>{Number.isFinite(point.speed_kn) ? point.speed_kn : '-'}</td>
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
			Inter,
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
		grid-template-columns: repeat(4, minmax(0, 1fr));
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

	.table-action-btn {
		height: 28px;
		min-height: 28px;
		padding: 0 10px;
		font-size: 10px;
		line-height: 28px;
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

	:global(.asset-leaflet-icon) {
		background: transparent;
		border: none;
	}

	:global(.asset-marker-shell) {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border: 2px solid #f59e0b;
		border-radius: 999px;
		background: rgba(17, 24, 39, 0.94);
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

	:global(.asset-popup) {
		display: grid;
		gap: 4px;
		min-width: 150px;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	:global(.asset-popup strong) {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	:global(.asset-popup span) {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
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
		.filter-actions button,
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
