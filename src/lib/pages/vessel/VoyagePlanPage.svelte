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
	let routeLine;
	let mapInitializing = false;

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
				throw new Error('Unauthorized. Silakan login kembali.');
			}
			throw new Error(message);
		}
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
		await loadVesselVoyageData(1);
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
				await loadVesselVoyageData(1);
			}
		} finally {
			syncingVesselFromNavbar = false;
		}
	}

	async function loadVesselVoyageData(targetPage = page) {
		if (!selectedVesselId) {
			errorMessage = 'Pilih vessel terlebih dahulu.';
			return;
		}

		await Promise.all([loadActiveVoyagePlan(), loadHistory(targetPage)]);
	}

	async function loadActiveVoyagePlan() {
		activeLoading = true;
		clearMessages();

		try {
			const result = await apiFetch(`/voyage-plans/vessels/${selectedVesselId}/active`, {
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

	async function loadHistory(targetPage = page) {
		historyLoading = true;
		clearMessages();

		try {
			const result = await apiFetch(
				`/voyage-plans/vessels/${selectedVesselId}/history?page=${targetPage}&pageSize=${pageSize}`,
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

			leaflet
				.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					maxZoom: 19,
					attribution: '&copy; OpenStreetMap'
				})
				.addTo(routeMap);

			markerLayer = leaflet.layerGroup().addTo(routeMap);
			routeLine = leaflet
				.polyline([], {
					color: '#2f65e8',
					weight: 4,
					opacity: 0.95
				})
				.addTo(routeMap);

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
		return new Intl.DateTimeFormat('id-ID', {
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
		<div>
			<div class="page-kicker">Voyage Plan Vessel</div>
			<h1>{selectedVesselName}</h1>
			<p>Active voyage route and assignment history for the selected vessel.</p>
		</div>
	</section>

	<section class="filter-card">
		<label>
			<span>Vessel</span>
			<select bind:value={selectedVesselId} on:change={handleVesselChange} disabled={loading}>
				<option value="">Select vessel</option>
				{#each vessels as vessel}
					<option value={vessel.id}>{vessel.vesselName}</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Page Size</span>
			<select bind:value={pageSize} on:change={() => loadHistory(1)} disabled={!selectedVesselId}>
				{#each PAGE_SIZE_OPTIONS as option}
					<option value={option}>{option} rows</option>
				{/each}
			</select>
		</label>

		<div class="filter-actions">
			<button
				type="button"
				class="primary-button"
				on:click={() => loadVesselVoyageData(1)}
				disabled={!selectedVesselId || activeLoading || historyLoading}
			>
				{activeLoading || historyLoading ? 'Loading...' : 'Load Data'}
			</button>

			<button type="button" on:click={fitMap} disabled={!routePointCount}>Fit Map</button>
		</div>
	</section>

	{#if errorMessage}
		<div class="status-box error-box">{errorMessage}</div>
	{/if}

	{#if successMessage}
		<div class="status-box success-box">{successMessage}</div>
	{/if}

	{#if loading}
		<div class="status-box">Loading voyage plan vessel page...</div>
	{:else if !canView}
		<div class="status-box error-box">
			User ini belum memiliki permission <b>view_voyage_plan_vessel</b>.
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
				<div class="section-header">
					<div>
						<span class="section-kicker">Route Map</span>
						<h2>{currentPlan?.voyageName || 'No Active Voyage Plan'}</h2>
					</div>

					{#if activeAssignment}
						<button type="button" on:click={showActivePlan} disabled={detailLoading}
							>Show Active</button
						>
					{/if}
				</div>

				<div class="map-shell">
					<div class="route-map" bind:this={mapContainer}></div>

					{#if !routePointCount}
						<div class="map-empty">
							<strong>No route data</strong>
							<span>Pilih vessel atau history yang memiliki route point.</span>
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
					<div class="empty-box">Belum ada assignment yang dipilih.</div>
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
								<th>Speed kn</th>
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
				<div class="empty-box">Route point belum tersedia.</div>
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
						on:click={() => loadHistory(page - 1)}
					>
						Previous
					</button>

					<span>Page {pagination.page || page} of {pagination.totalPages || 1}</span>

					<button
						type="button"
						disabled={!pagination.hasNext || historyLoading}
						on:click={() => loadHistory(page + 1)}
					>
						Next
					</button>
				</div>
			{:else}
				<div class="empty-box">History voyage plan belum tersedia.</div>
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
		background: #f3f6f9;
		color: #111827;
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
		height: 100vh;
		overflow: auto;
		padding: 14px 12px 28px;
		background: #f3f6f9;
	}

	.voyage-header-card,
	.filter-card,
	.summary-card,
	.map-panel,
	.detail-panel,
	.table-section,
	.status-box {
		border: 1px solid #d4dfec;
		border-radius: 0;
		background: #ffffff;
		box-shadow: none;
	}

	.voyage-header-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 16px;
		padding: 22px 22px 20px;
	}

	.page-kicker,
	.section-kicker {
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		margin-bottom: 10px;
		border-radius: 999px;
		background: #dbeafe;
		color: #245bd4;
		padding: 6px 13px;
		font-size: 12px;
		font-weight: 900;
		line-height: 1;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.section-kicker {
		min-height: auto;
		margin-bottom: 7px;
		padding: 5px 10px;
		font-size: 11px;
	}

	.voyage-header-card h1 {
		color: #0f172a;
		font-size: clamp(28px, 2.2vw, 34px);
		font-weight: 900;
		line-height: 1.1;
		letter-spacing: -0.04em;
	}

	.voyage-header-card p {
		margin-top: 8px;
		color: #627087;
		font-size: 16px;
		font-weight: 700;
		line-height: 1.45;
	}

	.header-meta {
		min-width: 150px;
		border: 1px solid #d4dfec;
		background: #f8fbff;
		padding: 14px 16px;
		text-align: right;
	}

	.header-meta span,
	.summary-card span,
	.detail-list span,
	label span {
		display: block;
		color: #5f6f86;
		font-size: 12px;
		font-weight: 900;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.header-meta strong {
		display: block;
		margin-top: 7px;
		color: #111827;
		font-size: 24px;
		font-weight: 900;
	}

	.filter-card {
		display: grid;
		grid-template-columns: minmax(240px, 0.9fr) minmax(140px, 180px) auto;
		gap: 14px;
		align-items: end;
		margin-bottom: 16px;
		padding: 16px;
	}

	label {
		display: grid;
		gap: 8px;
	}

	input,
	select,
	button {
		font: inherit;
	}

	select,
	input {
		width: 100%;
		min-height: 43px;
		border: 1px solid #c9d5e5;
		border-radius: 0;
		background: #ffffff;
		color: #111827;
		padding: 10px 13px;
		font-size: 15px;
		font-weight: 800;
		outline: none;
	}

	select:focus,
	input:focus {
		border-color: #2f65e8;
		background: #fbfdff;
	}

	button {
		min-height: 43px;
		border: 1px solid #c9d5e5;
		border-radius: 0;
		background: #ffffff;
		color: #111827;
		padding: 10px 14px;
		font-size: 14px;
		font-weight: 900;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: #2f65e8;
		background: #f8fbff;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.primary-button {
		border-color: #2f65e8;
		background: #2f65e8;
		color: #ffffff;
	}

	.primary-button:hover:not(:disabled) {
		border-color: #245bd4;
		background: #245bd4;
	}

	.filter-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
	}

	.status-box {
		margin-bottom: 16px;
		padding: 15px 16px;
		color: #334155;
		font-size: 15px;
		font-weight: 800;
	}

	.error-box {
		border-color: #fecaca;
		background: #fff1f1;
		color: #b11111;
	}

	.success-box {
		border-color: #bbf7d0;
		background: #f0fdf4;
		color: #166534;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 16px;
		margin-bottom: 16px;
	}

	.summary-card {
		padding: 18px 16px;
	}

	.summary-card strong {
		display: block;
		margin-top: 8px;
		overflow: hidden;
		color: #111827;
		font-size: 24px;
		font-weight: 900;
		line-height: 1.15;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.main-grid {
		display: grid;
		grid-template-columns: minmax(540px, 1.35fr) minmax(340px, 0.65fr);
		gap: 16px;
		align-items: stretch;
		margin-bottom: 16px;
	}

	.map-panel,
	.detail-panel,
	.table-section {
		min-width: 0;
		padding: 16px;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		margin-bottom: 14px;
	}

	.section-header h2 {
		color: #111827;
		font-size: 22px;
		font-weight: 900;
		letter-spacing: -0.035em;
	}

	.section-header strong {
		color: #64748b;
		font-size: 13px;
		font-weight: 900;
		white-space: nowrap;
	}

	.map-shell {
		position: relative;
		width: 100%;
		min-height: 460px;
		border: 1px solid #d4dfec;
		background: #dbeafe;
		overflow: hidden;
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
		background: rgba(248, 251, 255, 0.82);
		color: #64748b;
		text-align: center;
		font-size: 14px;
		font-weight: 800;
	}

	.map-empty strong {
		color: #111827;
		font-size: 18px;
		font-weight: 900;
	}

	.detail-list {
		display: grid;
		gap: 10px;
	}

	.detail-list div {
		border: 1px solid #d4dfec;
		background: #f8fbff;
		padding: 12px 13px;
	}

	.detail-list strong {
		display: block;
		margin-top: 6px;
		color: #111827;
		font-size: 14px;
		font-weight: 900;
		line-height: 1.35;
	}

	.table-wrap {
		overflow: auto;
		border: 1px solid #d4dfec;
		background: #ffffff;
	}

	.route-table-wrap {
		max-height: 300px;
	}

	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 13px;
	}

	th,
	td {
		padding: 12px 14px;
		border-right: 1px solid rgba(255, 255, 255, 0.22);
		border-bottom: 1px solid #dbe4f0;
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
		background: #2f65e8;
		color: #ffffff;
		font-size: 12px;
		font-weight: 900;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	tbody td {
		background: #ffffff;
		color: #111827;
		font-weight: 700;
	}

	tbody tr:nth-child(even) td {
		background: #f8fbff;
	}

	tbody tr:hover td,
	tr.active-row td {
		background: #dbeafe !important;
	}

	.right {
		text-align: right;
	}

	.table-action-btn {
		min-height: 34px;
		padding: 7px 12px;
		font-size: 12px;
	}

	.pagination-bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 14px;
		color: #64748b;
		font-size: 13px;
		font-weight: 800;
	}

	.empty-box {
		border: 1px dashed #c9d5e5;
		background: #f8fbff;
		padding: 26px;
		color: #64748b;
		text-align: center;
		font-size: 14px;
		font-weight: 800;
	}

	:global(.route-marker) {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: 3px solid #ffffff;
		border-radius: 999px;
		background: #2f65e8;
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
		.filter-card,
		.main-grid,
		.summary-grid {
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
		.section-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.header-meta,
		.filter-actions,
		.filter-actions button {
			width: 100%;
			text-align: left;
		}

		.filter-actions {
			flex-direction: column;
		}
	}
</style>
