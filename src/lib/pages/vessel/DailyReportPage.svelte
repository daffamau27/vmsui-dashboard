<script>
	import { onMount } from 'svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import {
		getDailyReportData,
		getDailyReportExcelUrl,
		getDailyReportPdfUrl
	} from '$lib/api/dailyReportApi.js';
	import Chart from 'chart.js/auto';
	import { getEngineCurvesForVessel } from '$lib/api/engineCurveApi.js';
	import { getFleetVesselDetail } from '$lib/api/fleetApi.js';
	import { downloadApiFile, apiRequest } from '$lib/api/authApi.js';
	import { VMS_TILE_URL, VMS_TILE_OPTIONS } from '$lib/mapStyle.js';
	import { addLeafletZoomAndScale } from '$lib/utils/leafletControls.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import { getFleetAssets } from '$lib/api/fleetApi.js';
	import { addMapZonesToLeafletMap, normalizeMapZonesFromAssets } from '$lib/utils/mapZones.js';
	import {
		createCopyableCoordinateHtml,
		handleCoordinateCopyClick
	} from '$lib/utils/coordinateClipboard.js';
	
	let loading = $state(false);
	let exporting = $state(false);
	let exportingPdf = $state(false);
	let error = $state('');
	let reportData = $state(null);
	let engineCurveData = $state(null);

	let vesselDetail = $state(null);
	let vesselEnginesLoading = $state(false);
	let vesselEnginesError = $state('');
	let loadedEngineDetailVesselId = $state(null);
	let mapZones = $state([]);

	let reportDate = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');

	let zoomPluginRegistered = false;

	async function ensureChartZoomPlugin() {
		if (zoomPluginRegistered) return true;
		if (typeof window === 'undefined') return false;

		const module = await import('chartjs-plugin-zoom');
		const zoomPlugin = module.default || module;

		Chart.register(zoomPlugin);
		zoomPluginRegistered = true;

		return true;
	}

	let currentUser = $state(null);
	let currentUserLoading = $state(false);
	let currentUserError = $state('');

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;
		currentUserError = '';

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			currentUser = response?.data || response?.user || response || null;

			console.log('[CURRENT_USER_PERMISSION]', currentUser);

			return currentUser;
		} catch (err) {
			console.error('[CURRENT_USER_PERMISSION_ERROR]', err);
			currentUserError = err?.message || 'Failed to load user permissions.';
			currentUser = null;
			return null;
		} finally {
			currentUserLoading = false;
		}
	}

	function hasPermissionForUser(user, permissionKey) {
		if (!permissionKey) return true;

		const permissionAccess = user?.permissionAccess || {};
		const mode = permissionAccess?.mode;

		if (mode === 'all') return true;

		if (mode === 'selected') {
			const permissions = Array.isArray(permissionAccess?.permissions)
				? permissionAccess.permissions
				: [];

			return permissions.includes(permissionKey);
		}

		return false;
	}

	function hasPermission(permissionKey) {
		return hasPermissionForUser(currentUser, permissionKey);
	}

	function getVisibleFuelTotal(row) {
		let total = 0;

		if (canShowFuelEcu) {
			total += toFuelNumber(row?.ecu);
		}

		if (canShowFuelFms) {
			total += toFuelNumber(row?.fms);
		}

		if (canShowFuelEmsInternal) {
			total += toFuelNumber(row?.ems_internal ?? row?.emsInternal);
		}

		if (canShowFuelEmsExternal) {
			total += toFuelNumber(row?.ems_external ?? row?.emsExternal);
		}

		if (canShowFuelEngineMaker) {
			total += toFuelNumber(row?.engine_maker ?? row?.engineMaker);
		}

		return total;
	}

	function getDailyCurveTableTitle(table) {
		const curveType = String(table?.curveType || '').toLowerCase();

		if (curveType === 'ems_internal' || curveType === 'ems_external') {
			return getDailyFuelSourceLabel(curveType);
		}

		return table?.title || '-';
	}

	function getVisibleFuelSourceLabel() {
		const sources = [];

		if (canViewFuelEcu && toFuelNumber(fuelSummary?.ecu) > 0) {
			sources.push('ECU');
		}

		if (canViewFuelFms && toFuelNumber(fuelSummary?.fms) > 0) {
			sources.push('FMS');
		}

		if (
			canViewFuelEmsInternal &&
			toFuelNumber(fuelSummary?.ems_internal ?? fuelSummary?.emsInternal) > 0
		) {
			sources.push(getDailyFuelSourceLabel('ems_internal'));
		}

		if (
			canViewFuelEmsExternal &&
			toFuelNumber(fuelSummary?.ems_external ?? fuelSummary?.emsExternal) > 0
		) {
			sources.push(getDailyFuelSourceLabel('ems_external'));
		}

		if (
			canViewFuelEngineMaker &&
			toFuelNumber(fuelSummary?.engine_maker ?? fuelSummary?.engineMaker) > 0
		) {
			sources.push('Engine Maker');
		}

		return sources.length ? sources.join(' + ') : '-';
	}

	function canViewRpmCurveTable(table) {
		const curveType = String(table?.curveType || '').toLowerCase();

		if (curveType === 'ems_internal') return canViewFuelEmsInternal;
		if (curveType === 'ems_external') return canViewFuelEmsExternal;
		if (curveType === 'engine_maker') return canViewFuelEngineMaker;

		return false;
	}

	let { active = false } = $props();
	let loadedKeys = $state({});
	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function todayDate() {
		const date = new Date();
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}

	function toNumber(value, fallback = 0) {
		const number = Number(value);
		return Number.isFinite(number) ? number : fallback;
	}

	function formatNumber(value, digits = 2, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;

		return number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}

	function formatHour(value) {
		if (value === undefined || value === null || value === '') return '-';

		if (typeof value === 'string') {
			if (value.includes('h') || value.includes(':')) return value;
		}

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return `${formatNumber(number, 2)} h`;
	}

	function formatLiter(value) {
		if (value === undefined || value === null || value === '') return '-';
		if (value === '-') return '-';

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return `${formatNumber(number, 2)} L`;
	}

	function getFuelTotalFromRpmCurveGroups(groups = [], curveType) {
		const targetType = String(curveType || '').toLowerCase();

		if (!Array.isArray(groups) || !targetType) return 0;

		return groups.reduce((curveSum, curveGroup) => {
			const groupType = String(curveGroup?.curveType || '').toLowerCase();

			if (groupType !== targetType) return curveSum;

			const engines = Array.isArray(curveGroup?.engines) ? curveGroup.engines : [];

			const engineTotal = engines.reduce((engineSum, engine) => {
				const rows = Array.isArray(engine?.rows) ? engine.rows : [];

				const totalRow = rows.find((row) => row?.is_total_row || row?.isTotalRow);

				const fuel = Number(totalRow?.fuel_estimated_l ?? totalRow?.fuelEstimatedL ?? 0);

				return engineSum + (Number.isFinite(fuel) ? fuel : 0);
			}, 0);

			return curveSum + engineTotal;
		}, 0);
	}

	function getFuelTotalFromRpmCurveGroupsByEngine(groups = [], curveType, engineName) {
		const targetType = String(curveType || '').toLowerCase();
		const targetEngine = normalizeEngineText(engineName);

		if (!Array.isArray(groups) || !targetType || !targetEngine) return 0;

		return groups.reduce((curveSum, curveGroup) => {
			const groupType = String(curveGroup?.curveType || '').toLowerCase();

			if (groupType !== targetType) return curveSum;

			const engines = Array.isArray(curveGroup?.engines) ? curveGroup.engines : [];

			const matchedEngine = engines.find((engine) => {
				return normalizeEngineText(engine?.engineName || engine?.engine_name) === targetEngine;
			});

			if (!matchedEngine) return curveSum;

			const rows = Array.isArray(matchedEngine?.rows) ? matchedEngine.rows : [];

			const totalRow = rows.find((row) => row?.is_total_row || row?.isTotalRow);

			const fuel = Number(totalRow?.fuel_estimated_l ?? totalRow?.fuelEstimatedL ?? 0);

			return curveSum + (Number.isFinite(fuel) ? fuel : 0);
		}, 0);
	}

	function toFuelNumber(value) {
		if (value === undefined || value === null || value === '' || value === '-') return 0;

		const number = Number(value);
		return Number.isFinite(number) ? number : 0;
	}

	function getFuelTotal(row) {
		return (
			toFuelNumber(row?.ecu) +
			toFuelNumber(row?.fms) +
			toFuelNumber(row?.ems_internal ?? row?.emsInternal) +
			toFuelNumber(row?.ems_external ?? row?.emsExternal) +
			toFuelNumber(row?.engine_maker ?? row?.engineMaker)
		);
	}

	function getTotalFuelLiter(summary = {}) {
		return (
			toFuelNumber(summary?.ecu) +
			toFuelNumber(summary?.fms) +
			toFuelNumber(summary?.ems_internal ?? summary?.emsInternal) +
			toFuelNumber(summary?.ems_external ?? summary?.emsExternal) +
			toFuelNumber(summary?.engine_maker ?? summary?.engineMaker)
		);
	}

	function getFuelSourceLabel(summary = {}) {
		const sources = [];

		if (toFuelNumber(summary?.ecu) > 0) sources.push('ECU');
		if (toFuelNumber(summary?.fms) > 0) sources.push('FMS');

		if (toFuelNumber(summary?.ems_internal ?? summary?.emsInternal) > 0) {
			sources.push(getDailyFuelSourceLabel('ems_internal'));
		}

		if (toFuelNumber(summary?.ems_external ?? summary?.emsExternal) > 0) {
			sources.push(getDailyFuelSourceLabel('ems_external'));
		}

		if (toFuelNumber(summary?.engine_maker ?? summary?.engineMaker) > 0) {
			sources.push('Engine Maker');
		}

		return sources.length ? sources.join(' + ') : '-';
	}

	function formatPlainLiter(value) {
		if (value === undefined || value === null || value === '') return '-';
		if (value === '-') return '-';

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return formatNumber(number, 2);
	}

	function getPathPointLat(point) {
		return Number(point?.latitude ?? point?.lat);
	}

	function getPathPointLng(point) {
		return Number(point?.longitude ?? point?.lng);
	}

	function getPathPointTime(point) {
		return point?.time || point?.timestamp || point?.ts || '-';
	}

	function isValidPathPoint(point) {
		const lat = getPathPointLat(point);
		const lng = getPathPointLng(point);

		return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
	}

	function haversineDistanceNm(pointA, pointB) {
		const lat1 = getPathPointLat(pointA);
		const lon1 = getPathPointLng(pointA);
		const lat2 = getPathPointLat(pointB);
		const lon2 = getPathPointLng(pointB);

		if (
			!Number.isFinite(lat1) ||
			!Number.isFinite(lon1) ||
			!Number.isFinite(lat2) ||
			!Number.isFinite(lon2)
		) {
			return 0;
		}

		const radiusKm = 6371;
		const toRad = (value) => (value * Math.PI) / 180;

		const dLat = toRad(lat2 - lat1);
		const dLon = toRad(lon2 - lon1);

		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		const distanceKm = radiusKm * c;

		return distanceKm / 1.852;
	}

	function calculatePathDistanceNm(points = [], filterFn = null) {
		if (!Array.isArray(points) || points.length < 2) return 0;

		let total = 0;

		for (let index = 1; index < points.length; index += 1) {
			const prev = points[index - 1];
			const current = points[index];

			if (!isValidPathPoint(prev) || !isValidPathPoint(current)) continue;

			if (filterFn && (!filterFn(prev) || !filterFn(current))) continue;

			total += haversineDistanceNm(prev, current);
		}

		return total;
	}

	function formatPathTime(value) {
		if (!value || value === '-') return '-';

		const text = String(value).trim();

		if (/^\d{2}:\d{2}$/.test(text)) return text;
		if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text.slice(0, 5);

		if (/^\d+$/.test(text)) {
			const date = new Date(Number(text));
			if (!Number.isNaN(date.getTime())) {
				return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
			}
		}

		const date = new Date(text);
		if (!Number.isNaN(date.getTime())) {
			return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}

		return text.slice(0, 5);
	}

	function buildTripRouteProjection(points = []) {
		const validPoints = Array.isArray(points) ? points.filter(isValidPathPoint) : [];

		if (!validPoints.length) {
			return {
				routePoints: '',
				start: { x: 0, y: 0 },
				end: { x: 0, y: 0 }
			};
		}

		const latValues = validPoints.map(getPathPointLat);
		const lngValues = validPoints.map(getPathPointLng);

		const minLat = Math.min(...latValues);
		const maxLat = Math.max(...latValues);
		const minLng = Math.min(...lngValues);
		const maxLng = Math.max(...lngValues);

		const width = 100;
		const height = 100;
		const padding = 8;

		const latRange = maxLat - minLat || 0.000001;
		const lngRange = maxLng - minLng || 0.000001;

		function project(point) {
			const lat = getPathPointLat(point);
			const lng = getPathPointLng(point);

			const x = padding + ((lng - minLng) / lngRange) * (width - padding * 2);
			const y = padding + ((maxLat - lat) / latRange) * (height - padding * 2);

			return {
				x,
				y,
				point: `${x.toFixed(2)},${y.toFixed(2)}`
			};
		}

		const projectedPoints = validPoints.map(project);

		return {
			routePoints: projectedPoints.map((item) => item.point).join(' '),
			start: {
				x: projectedPoints[0].x,
				y: projectedPoints[0].y
			},
			end: {
				x: projectedPoints[projectedPoints.length - 1].x,
				y: projectedPoints[projectedPoints.length - 1].y
			}
		};
	}

	function buildDailyTripSummary(data) {
		const pathCoordinates = data?.path_coordinates || data?.pathCoordinates || [];

		const points = Array.isArray(pathCoordinates) ? pathCoordinates.filter(isValidPathPoint) : [];

		if (!points.length) {
			return {
				points: [],
				routePoints: '',
				startPoint: { x: 0, y: 0 },
				endPoint: { x: 0, y: 0 },
				totalPoints: 0,
				outsidePoints: 0,
				insidePoints: 0,
				startTime: '-',
				endTime: '-',
				startLat: null,
				startLng: null,
				endLat: null,
				endLng: null,
				totalDistanceNm: 0,
				outsideDistanceNm: 0
			};
		}

		const firstPoint = points[0];
		const lastPoint = points[points.length - 1];

		const outsidePoints = points.filter((point) => point?.inside_safety_zone === false);
		const insidePoints = points.filter((point) => point?.inside_safety_zone === true);

		const totalDistanceFromResponse =
			data?.travel_distance?.total_distance_nm ?? data?.travelDistance?.totalDistanceNm;

		const outsideDistanceFromResponse =
			data?.travel_distance?.outside_safety_zone_distance_nm ??
			data?.travelDistance?.outsideSafetyZoneDistanceNm;
		const routeProjection = buildTripRouteProjection(points);

		return {
			points,
			routePoints: routeProjection.routePoints,
			startPoint: routeProjection.start,
			endPoint: routeProjection.end,
			totalPoints: points.length,
			outsidePoints: outsidePoints.length,
			insidePoints: insidePoints.length,
			startTime: formatPathTime(getPathPointTime(firstPoint)),
			endTime: formatPathTime(getPathPointTime(lastPoint)),
			startLat: getPathPointLat(firstPoint),
			startLng: getPathPointLng(firstPoint),
			endLat: getPathPointLat(lastPoint),
			endLng: getPathPointLng(lastPoint),
			totalDistanceNm:
				totalDistanceFromResponse !== undefined && totalDistanceFromResponse !== null
					? Number(totalDistanceFromResponse)
					: calculatePathDistanceNm(points),
			outsideDistanceNm:
				outsideDistanceFromResponse !== undefined && outsideDistanceFromResponse !== null
					? Number(outsideDistanceFromResponse)
					: calculatePathDistanceNm(points, (point) => point?.inside_safety_zone === false)
		};
	}

	function normalizeEngineText(value) {
		return String(value || '')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function getEngineDisplayNameFromKey(key) {
		return normalizeEngineText(key);
	}

	function getConfiguredEngineNames() {
		const engines = Array.isArray(vesselDetail?.engines)
			? vesselDetail.engines
			: Array.isArray($selectedVesselInfo?.engines)
				? $selectedVesselInfo.engines
				: [];

		return engines
			.map((engine) =>
				normalizeEngineText(
					engine?.engineName ||
						engine?.name ||
						getEngineDisplayNameFromKey(engine?.engineKeyThingsboard || engine?.key)
				)
			)
			.filter(Boolean);
	}

	function isConfiguredEngine(engineName) {
		const configuredNames = getConfiguredEngineNames();

		// If engine details have not loaded successfully, do not filter so data remains visible.
		if (!configuredNames.length) return true;

		return configuredNames.includes(normalizeEngineText(engineName));
	}

	function sortByConfiguredEngines(rows, getName) {
		const configuredNames = getConfiguredEngineNames();

		if (!configuredNames.length) return rows;

		return [...rows].sort((a, b) => {
			const nameA = normalizeEngineText(getName(a));
			const nameB = normalizeEngineText(getName(b));

			const indexA = configuredNames.indexOf(nameA);
			const indexB = configuredNames.indexOf(nameB);

			const safeA = indexA === -1 ? 999 : indexA;
			const safeB = indexB === -1 ? 999 : indexB;

			return safeA - safeB;
		});
	}

	function filterEngineRows(rows, getName) {
		const filtered = rows.filter((row) => isConfiguredEngine(getName(row)));
		return sortByConfiguredEngines(filtered, getName);
	}

	function getRowEngineName(row) {
		return row?.engine_name || row?.engineName || row?.engine || row?.name || '';
	}

	function pickArray(...values) {
		for (const value of values) {
			if (Array.isArray(value)) return value;
		}

		return [];
	}

	function normalizeTimeKey(value) {
		if (!value) return '';

		const text = String(value).trim();

		// Format "09:02" menjadi "09:02"
		if (/^\d{2}:\d{2}$/.test(text)) return text;

		// Format "09:02:00" menjadi "09:02"
		if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text.slice(0, 5);

		// Format timestamp number
		if (/^\d+$/.test(text)) {
			const date = new Date(Number(text));

			if (!Number.isNaN(date.getTime())) {
				return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(
					2,
					'0'
				)}`;
			}
		}

		const date = new Date(text);

		if (!Number.isNaN(date.getTime())) {
			return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(
				2,
				'0'
			)}`;
		}

		return text.slice(0, 5);
	}

	function buildOutsideSafetyZoneMap(pathCoordinates = []) {
		const map = new Map();

		if (!Array.isArray(pathCoordinates)) return map;

		pathCoordinates.forEach((point) => {
			const timeKey = normalizeTimeKey(
				point?.time || point?.timestamp || point?.ts || point?.datetime
			);

			if (!timeKey) return;

			const insideSafetyZone = point?.inside_safety_zone ?? point?.insideSafetyZone;

			map.set(timeKey, insideSafetyZone === false);
		});

		return map;
	}

	function normalizeEngineName(value) {
		return String(value || '-')
			.replace(/\s+/g, '_')
			.toUpperCase();
	}

	function formatDurationFromMinutes(totalMinutes) {
		const minutesValue = Number(totalMinutes || 0);

		if (!Number.isFinite(minutesValue) || minutesValue <= 0) return '0h 0m 0s';

		const hours = Math.floor(minutesValue / 60);
		const minutes = Math.floor(minutesValue % 60);

		return `${hours}h ${minutes}m 0s`;
	}

	function getEngineRuntimeMinutes(data, engineName) {
		const runtimeRows = data?.engine_runtimes || data?.engineRuntimes || [];

		if (!Array.isArray(runtimeRows)) return 0;

		const normalizedTarget = normalizeEngineName(engineName);

		const found = runtimeRows.find((row) => {
			const normalizedEngine = normalizeEngineName(
				row?.engine_name || row?.engineName || row?.engine
			);

			return normalizedEngine === normalizedTarget;
		});

		if (!found) return 0;

		const runtimeHours = Number(found?.runtime_hours ?? found?.runtimeHours ?? 0);

		return Number.isFinite(runtimeHours) ? runtimeHours * 60 : 0;
	}

	function normalizeHighRpmOutsideSafetyZoneRows(data) {
		if (!data || typeof data !== 'object') return [];

		const highRpmOutside =
			data?.high_rpm_outside_safety_zone || data?.highRpmOutsideSafetyZone || null;

		// Prioritas utama: pakai hasil hitungan backend karena sudah ada speed_avg, speed_highest, speed_lowest
		if (highRpmOutside && typeof highRpmOutside === 'object') {
			const table15Rows = Array.isArray(highRpmOutside?.table_15?.rows)
				? highRpmOutside.table_15.rows
				: [];

			const table20Rows = Array.isArray(highRpmOutside?.table_20?.rows)
				? highRpmOutside.table_20.rows
				: [];

			const table15Threshold =
				highRpmOutside?.table_15?.threshold_rpm ?? highRpmOutside?.table15?.thresholdRpm ?? '-';

			const table20Threshold =
				highRpmOutside?.table_20?.threshold_rpm ?? highRpmOutside?.table20?.thresholdRpm ?? '-';

			const rows15 = table15Rows.map((row, index) => ({
				id: `rpm-15-${index}`,
				engine: normalizeEngineName(row?.engine_name || row?.engineName || row?.engine),
				rule: `RPM (15% Highest: ${table15Threshold}+) outside Safety Zones`,
				duration: row?.duration || '0h 0m 0s',
				percentageRh:
					row?.rh_percent ?? row?.rhPercent ?? row?.percentage_rh ?? row?.percentageRh ?? 0,
				avgSpeed: row?.speed_avg ?? row?.speedAvg ?? null,
				highestSpeed:
					row?.speed_highest ??
					row?.speedHighest ??
					row?.highest_speed ??
					row?.highestSpeed ??
					null,
				lowestSpeed:
					row?.speed_lowest ?? row?.speedLowest ?? row?.lowest_speed ?? row?.lowestSpeed ?? null
			}));

			const rows20 = table20Rows.map((row, index) => ({
				id: `rpm-20-${index}`,
				engine: normalizeEngineName(row?.engine_name || row?.engineName || row?.engine),
				rule: `RPM (20% Highest: ${table20Threshold}+) outside Safety Zones`,
				duration: row?.duration || '0h 0m 0s',
				percentageRh:
					row?.rh_percent ?? row?.rhPercent ?? row?.percentage_rh ?? row?.percentageRh ?? 0,
				avgSpeed: row?.speed_avg ?? row?.speedAvg ?? null,
				highestSpeed:
					row?.speed_highest ??
					row?.speedHighest ??
					row?.highest_speed ??
					row?.highestSpeed ??
					null,
				lowestSpeed:
					row?.speed_lowest ?? row?.speedLowest ?? row?.lowest_speed ?? row?.lowestSpeed ?? null
			}));

			return [...rows15, ...rows20];
		}

		// Legacy fallback: calculate from rpm_vs_fuel_chart if the backend has not sent high_rpm_outside_safety_zone.
		const pathCoordinates = data?.path_coordinates || data?.pathCoordinates || [];

		const rpmVsFuelChart = data?.rpm_vs_fuel_chart || data?.rpmVsFuelChart || {};

		if (!rpmVsFuelChart || typeof rpmVsFuelChart !== 'object') return [];

		const outsideMap = buildOutsideSafetyZoneMap(pathCoordinates);

		const rules = [
			{
				key: 'rpm_15_highest_850',
				label: 'RPM (15% Highest: 850+) outside Safety Zones',
				rpmThreshold: 850
			},
			{
				key: 'rpm_20_highest_800',
				label: 'RPM (20% Highest: 800+) outside Safety Zones',
				rpmThreshold: 800
			}
		];

		const engineNames = Object.keys(rpmVsFuelChart).filter((engineName) => {
			const upper = String(engineName).toUpperCase();
			return upper.includes('ME');
		});

		return rules.flatMap((rule) => {
			return engineNames.map((engineName) => {
				const chartRows = Array.isArray(rpmVsFuelChart[engineName])
					? rpmVsFuelChart[engineName]
					: [];

				const matchedRows = chartRows.filter((row) => {
					const timeKey = normalizeTimeKey(row?.time);
					const rpm = Number(row?.rpm ?? 0);
					const isOutsideSafetyZone = outsideMap.get(timeKey) === true;

					return isOutsideSafetyZone && rpm >= rule.rpmThreshold;
				});

				const durationMinutes = matchedRows.length;
				const runtimeMinutes = getEngineRuntimeMinutes(data, engineName);

				return {
					id: `${rule.key}-${engineName}`,
					engine: normalizeEngineName(engineName),
					rule: rule.label,
					durationMinutes,
					duration: formatDurationFromMinutes(durationMinutes),
					percentageRh: runtimeMinutes > 0 ? (durationMinutes / runtimeMinutes) * 100 : 0,
					avgSpeed: null,
					highestSpeed: null,
					lowestSpeed: null
				};
			});
		});
	}

	function groupHighRpmOutsideSafetyZoneRows(rows) {
		const groups = new Map();

		rows.forEach((row) => {
			const key = row.rule || '-';

			if (!groups.has(key)) {
				groups.set(key, []);
			}

			groups.get(key).push(row);
		});

		return Array.from(groups.entries()).map(([rule, rows]) => ({
			rule,
			rows
		}));
	}

	function formatPercent(value) {
		if (value === undefined || value === null || value === '' || value === '-') {
			return '-';
		}

		if (typeof value === 'string' && value.includes('%')) {
			return value;
		}

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return `${formatNumber(number, 1)}%`;
	}

	function formatSpeed(value) {
		if (value === undefined || value === null || value === '' || value === '-') {
			return '-';
		}

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return formatNumber(number, 2);
	}

	function formatTimeDot(value) {
		if (!value || value === '-') return '-';

		const text = String(value).trim();

		if (/^\d{2}:\d{2}$/.test(text)) {
			return `${text.replace(':', '.')}.00`;
		}

		if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
			return text.replaceAll(':', '.');
		}

		return text;
	}

	function normalizeHighRpmLowSpeed(data) {
		const source = data?.high_rpm_low_speed || data?.highRpmLowSpeed || null;

		if (!source || typeof source !== 'object') {
			return {
				rule: null,
				groups: [],
				totals: [],
				grandTotal: 0
			};
		}

		const details = Array.isArray(source.details) ? source.details : [];
		const totals = Array.isArray(source.totals) ? source.totals : [];

		const groupMap = new Map();

		details.forEach((row, index) => {
			const engineName = normalizeEngineName(
				row?.engine_name || row?.engineName || row?.engine || '-'
			);

			if (!isConfiguredEngine(engineName)) return;

			if (!groupMap.has(engineName)) {
				groupMap.set(engineName, []);
			}

			groupMap.get(engineName).push({
				id: `${engineName}-${index}`,
				engineName,
				startTime: row?.start_time || row?.startTime || '-',
				endTime: row?.end_time || row?.endTime || '-',
				fuelUsedL: row?.fuel_used_l ?? row?.fuelUsedL ?? 0
			});
		});

		const groups = Array.from(groupMap.entries()).map(([engineName, rows]) => {
			const totalFromRows = rows.reduce((sum, row) => {
				const value = Number(row.fuelUsedL);
				return sum + (Number.isFinite(value) ? value : 0);
			}, 0);

			const totalFromBackend = totals.find((item) => {
				const totalEngineName = normalizeEngineName(
					item?.engine_name || item?.engineName || item?.engine
				);

				return totalEngineName === engineName;
			});

			const totalFuel = Number(
				totalFromBackend?.fuel_used_l ?? totalFromBackend?.fuelUsedL ?? totalFromRows
			);

			return {
				engineName,
				rows,
				totalFuel: Number.isFinite(totalFuel) ? totalFuel : 0
			};
		});

		const filteredTotals = totals
			.map((row) => ({
				engineName: normalizeEngineName(row?.engine_name || row?.engineName || row?.engine),
				fuelUsedL: row?.fuel_used_l ?? row?.fuelUsedL ?? 0
			}))
			.filter((row) => isConfiguredEngine(row.engineName));

		const grandTotalFromGroups = groups.reduce((sum, group) => {
			return sum + Number(group.totalFuel || 0);
		}, 0);

		const grandTotal = Number(source.grand_total_l ?? source.grandTotalL ?? grandTotalFromGroups);

		return {
			rule: source.rule || null,
			groups,
			totals: filteredTotals.length
				? filteredTotals
				: groups.map((group) => ({
						engineName: group.engineName,
						fuelUsedL: group.totalFuel
					})),
			grandTotal: Number.isFinite(grandTotal) ? grandTotal : grandTotalFromGroups
		};
	}

	function normalizeCurveEngineKey(value) {
		return String(value || '')
			.replace(/\s+/g, '_')
			.trim()
			.toLowerCase();
	}

	function getCurveValueLh(curveEngine, rpm) {
		if (!curveEngine) return null;

		const fixedValue = Number(curveEngine?.value_lh ?? curveEngine?.valueLh);

		if (Number.isFinite(fixedValue)) {
			return fixedValue;
		}

		const ranges = Array.isArray(curveEngine?.ranges) ? curveEngine.ranges : [];

		const rpmValue = Number(rpm);

		if (!Number.isFinite(rpmValue)) return null;

		const matchedRange = ranges.find((range) => {
			const min = Number(range?.rpm_min ?? range?.rpmMin);
			const max = Number(range?.rpm_max ?? range?.rpmMax);

			return Number.isFinite(min) && Number.isFinite(max) && rpmValue >= min && rpmValue <= max;
		});

		const valueLh = Number(matchedRange?.value_lh ?? matchedRange?.valueLh);

		return Number.isFinite(valueLh) ? valueLh : null;
	}

	function getCurveBuckets(curveEngine, chartRows = []) {
		const ranges = Array.isArray(curveEngine?.ranges) ? curveEngine.ranges : [];

		if (ranges.length) {
			return ranges
				.map((range) => {
					const min = Number(range?.rpm_min ?? range?.rpmMin);
					const max = Number(range?.rpm_max ?? range?.rpmMax);
					const valueLh = Number(range?.value_lh ?? range?.valueLh);

					if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

					return {
						label: `${min} - ${max}`,
						min,
						max,
						valueLh: Number.isFinite(valueLh) ? valueLh : null,
						type: 'range'
					};
				})
				.filter(Boolean);
		}

		const fixedValue = Number(curveEngine?.value_lh ?? curveEngine?.valueLh);

		if (Number.isFinite(fixedValue)) {
			return [
				{
					label: 'Fixed L/h',
					min: -Infinity,
					max: Infinity,
					valueLh: fixedValue,
					type: 'fixed'
				}
			];
		}

		// Fallback when the curve has no ranges/value_lh:
		// buat range dari data RPM yang ada agar tetap bisa tampil.
		const rpmValues = chartRows
			.map((row) => Number(row?.rpm))
			.filter((value) => Number.isFinite(value));

		if (!rpmValues.length) return [];

		const minRpm = Math.floor(Math.min(...rpmValues) / 100) * 100;
		const maxRpm = Math.ceil(Math.max(...rpmValues) / 100) * 100;

		const buckets = [];

		for (let min = minRpm; min <= maxRpm; min += 100) {
			buckets.push({
				label: `${min} - ${min + 99}`,
				min,
				max: min + 99,
				valueLh: null,
				type: 'fallback'
			});
		}

		return buckets;
	}

	function getStatusHistoryGroups(statusHistory) {
		if (!statusHistory || typeof statusHistory !== 'object') return [];

		return Object.entries(statusHistory).map(([engineName, rows]) => ({
			engineName,
			rows: Array.isArray(rows)
				? rows.map((row, index) => ({
						id: `${engineName}-${index}`,
						start: row?.Start ?? row?.start ?? '-',
						end: row?.End ?? row?.end ?? '-',
						duration: row?.Duration ?? row?.duration ?? '-',
						durationSeconds: row?.DurationSeconds ?? row?.durationSeconds ?? 0,
						status: row?.Status ?? row?.status ?? '-'
					}))
				: []
		}));
	}

	function isOffStatus(status) {
		return String(status || '').toUpperCase() === 'OFF';
	}

	function isOnStatus(status) {
		return String(status || '').toUpperCase() === 'ON';
	}

	function secondsFromStatusRow(row) {
		const seconds = Number(row?.durationSeconds ?? row?.DurationSeconds ?? 0);
		if (Number.isFinite(seconds) && seconds > 0) return seconds;

		return 0;
	}

	function buildStatusTimelineGroups(groups = []) {
		if (!Array.isArray(groups)) return [];

		return groups
			.map((group) => {
				const rows = Array.isArray(group?.rows) ? group.rows : [];

				const totalSeconds = rows.reduce((sum, row) => {
					return sum + secondsFromStatusRow(row);
				}, 0);

				if (totalSeconds <= 0) return null;

				const segments = rows
					.map((row) => {
						const durationSeconds = secondsFromStatusRow(row);
						if (durationSeconds <= 0) return null;

						return {
							...row,
							durationSeconds,
							widthPercent: (durationSeconds / totalSeconds) * 100,
							status: String(row?.status || '-').toUpperCase()
						};
					})
					.filter(Boolean);

				if (!segments.length) return null;

				return {
					engineName: group.engineName,
					totalSeconds,
					segments,
					transitionLabels: buildStatusTransitionLabels(segments)
				};
			})
			.filter(Boolean);
	}

	function buildStatusTransitionLabels(segments = []) {
		if (!Array.isArray(segments) || !segments.length) return [];

		let cumulativePercent = 0;

		const rawLabels = [];

		segments.forEach((segment, index) => {
			const widthPercent = Number(segment.widthPercent || 0);

			if (index === 0) {
				rawLabels.push({
					id: `${segment.id || index}-start`,
					leftPercent: 0,
					time: formatTimeOnly(segment.start),
					status: segment.status,
					type: 'start'
				});
			}

			cumulativePercent += widthPercent;

			rawLabels.push({
				id: `${segment.id || index}-end`,
				leftPercent: Math.min(cumulativePercent, 100),
				time: formatTimeOnly(segment.end),
				status: segment.status,
				type: 'end'
			});
		});

		return reduceDenseTimelineLabels(rawLabels, 7);
	}

	function reduceDenseTimelineLabels(labels = [], minGapPercent = 7) {
		const sorted = [...labels].sort((a, b) => a.leftPercent - b.leftPercent);
		const result = [];

		sorted.forEach((label, index) => {
			const isFirst = index === 0;
			const isLast = index === sorted.length - 1;
			const previous = result[result.length - 1];

			if (isFirst || isLast) {
				result.push(label);
				return;
			}

			if (!previous || Math.abs(label.leftPercent - previous.leftPercent) >= minGapPercent) {
				result.push(label);
			}
		});

		return result;
	}

	function formatTimeOnly(value) {
		if (!value || value === '-') return '-';

		const text = String(value).trim();

		if (/^\d{2}:\d{2}$/.test(text)) return text;
		if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text.slice(0, 5);

		return text.slice(0, 5);
	}

	function formatDurationSeconds(seconds) {
		const value = Number(seconds || 0);
		if (!Number.isFinite(value) || value <= 0) return '0s';

		const hours = Math.floor(value / 3600);
		const minutes = Math.floor((value % 3600) / 60);
		const remainingSeconds = Math.floor(value % 60);

		if (hours > 0) return `${hours}h ${minutes}m`;
		if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;

		return `${remainingSeconds}s`;
	}

	function getNumericValue(value, fallback = 0) {
		const number = Number(value);
		return Number.isFinite(number) ? number : fallback;
	}

	function calculateLiterPerNm(fuelLiter, distanceNm) {
		const fuel = Number(fuelLiter);
		const distance = Number(distanceNm);

		if (!Number.isFinite(fuel) || !Number.isFinite(distance)) return null;
		if (fuel <= 0 || distance <= 0) return null;

		return fuel / distance;
	}

	function formatLiterPerNm(value) {
		if (value === null || value === undefined || value === '') return '-';

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return `${formatNumber(number, 2)} L/NM`;
	}

	function buildRpmRangeGroupsByCurve(data, curveData) {
		const rpmVsFuelChart = data?.rpm_vs_fuel_chart || data?.rpmVsFuelChart || {};

		const curves = Array.isArray(curveData?.curves)
			? curveData.curves.filter((curve) => curve?.isActive || curve?.is_active)
			: [];

		if (!rpmVsFuelChart || typeof rpmVsFuelChart !== 'object') return [];

		return curves
			.map((curve) => {
				const curveType = curve.curveType || curve.curve_type || '-';
				const curveName = curve.curveName || curve.curve_name || '-';
				const curveEngines = Array.isArray(curve.engines) ? curve.engines : [];

				const engines = curveEngines
					.map((curveEngine) => {
						const engineKey =
							curveEngine?.engine_key_thingsboard ||
							curveEngine?.engineKeyThingsboard ||
							curveEngine?.key ||
							'';

						const engineName =
							curveEngine?.engine_name ||
							curveEngine?.engineName ||
							curveEngine?.name ||
							engineKey ||
							'-';

						const chartRows =
							rpmVsFuelChart[engineKey] ||
							rpmVsFuelChart[normalizeEngineText(engineName)] ||
							rpmVsFuelChart[engineName] ||
							[];

						if (!Array.isArray(chartRows)) return null;

						const rows = calculateRpmRowsForSingleCurveEngine(
							chartRows,
							curveEngine,
							engineName,
							curveType,
							curveName
						);

						return {
							engineKey,
							engineName: normalizeEngineText(engineName),
							rows
						};
					})
					.filter(Boolean)
					.filter((engine) => isConfiguredEngine(engine.engineName))
					.filter((engine) => Array.isArray(engine.rows) && engine.rows.length);

				return {
					curveType,
					curveName,
					engines
				};
			})
			.filter((group) => group.engines.length);
	}

	function calculateRpmRowsForSingleCurveEngine(
		chartRows,
		curveEngine,
		engineName,
		curveType,
		curveName
	) {
		const buckets = getCurveBuckets(curveEngine, chartRows);

		const rows = buckets
			.map((bucket) => {
				const matchedRows = chartRows.filter((row) => {
					const rpm = Number(row?.rpm ?? 0);

					if (!Number.isFinite(rpm)) return false;

					return rpm >= bucket.min && rpm <= bucket.max;
				});

				const runtimeMinutes = matchedRows.length;

				// Do not display RPM ranges without runtime.
				if (runtimeMinutes <= 0) return null;

				const runtimeHours = runtimeMinutes / 60;

				const fuelEstimated = matchedRows.reduce((sum, row) => {
					const rpm = Number(row?.rpm ?? 0);

					let valueLh = bucket.valueLh;

					if (!Number.isFinite(valueLh)) {
						valueLh = getCurveValueLh(curveEngine, rpm);
					}

					if (Number.isFinite(valueLh)) {
						return sum + valueLh / 60;
					}

					const fallbackFuel = Number(row?.fuel_ems ?? row?.fuelEms ?? 0);

					return sum + (Number.isFinite(fallbackFuel) ? fallbackFuel : 0);
				}, 0);

				const averageLh = runtimeHours > 0 ? fuelEstimated / runtimeHours : 0;

				return {
					engine_name: normalizeEngineText(engineName),
					curve_type: curveType,
					curve_name: curveName,
					rpm_range: bucket.label,
					runtime_minutes: runtimeMinutes,
					runtime_hours: runtimeHours,
					lh: averageLh,
					fuel_estimated_l: fuelEstimated,
					is_total_row: false
				};
			})
			.filter(Boolean);

		// If this engine has no runtime across all RPM ranges, do not display the engine table.
		if (!rows.length) return [];

		const totalRuntimeMinutes = rows.reduce((sum, row) => {
			return sum + Number(row.runtime_minutes || 0);
		}, 0);

		const totalRuntimeHours = totalRuntimeMinutes / 60;

		const totalFuelEstimated = rows.reduce((sum, row) => {
			return sum + Number(row.fuel_estimated_l || 0);
		}, 0);

		rows.push({
			engine_name: `${normalizeEngineText(engineName)} TOTAL`,
			curve_type: curveType,
			curve_name: curveName,
			rpm_range: 'TOTAL',
			runtime_minutes: totalRuntimeMinutes,
			runtime_hours: totalRuntimeHours,
			lh: totalRuntimeHours > 0 ? totalFuelEstimated / totalRuntimeHours : 0,
			fuel_estimated_l: totalFuelEstimated,
			is_total_row: true
		});

		return rows;
	}

	function hasPositiveChartData(values = []) {
		return (
			Array.isArray(values) &&
			values.some((value) => {
				const number = Number(value);
				return Number.isFinite(number) && number > 0;
			})
		);
	}

	function toNullablePositiveNumber(value) {
		if (value === undefined || value === null || value === '' || value === '-') return null;

		const number = Number(value);

		if (!Number.isFinite(number)) return null;

		return number > 0 ? number : null;
	}

	function buildRpmFuelCurveChartGroups(data) {
		const rpmVsFuelChart = data?.rpm_vs_fuel_chart || data?.rpmVsFuelChart || {};

		if (!rpmVsFuelChart || typeof rpmVsFuelChart !== 'object') return [];

		return Object.entries(rpmVsFuelChart)
			.map(([engineKey, chartRows]) => {
				if (!Array.isArray(chartRows) || !chartRows.length) return null;

				const engineName = normalizeEngineText(engineKey);

				if (!isConfiguredEngine(engineName)) return null;

				const validRows = downsampleChartRows(chartRows).filter((row) => {
					const rpm = Number(row?.rpm);
					const fuelInternal = Number(row?.fuel_ems_internal ?? row?.fuelEmsInternal);
					const fuelExternal = Number(row?.fuel_ems_external ?? row?.fuelEmsExternal);

					return (
						Number.isFinite(rpm) || Number.isFinite(fuelInternal) || Number.isFinite(fuelExternal)
					);
				});

				if (!validRows.length) return null;

				const labels = validRows.map((row) => row?.time || '-');

				const rpmData = validRows.map((row) => {
					const rpm = Number(row?.rpm);
					return Number.isFinite(rpm) ? rpm : null;
				});

				const internalFuelData = validRows.map((row) =>
					toNullablePositiveNumber(row?.fuel_ems_internal ?? row?.fuelEmsInternal)
				);

				const externalFuelData = validRows.map((row) =>
					toNullablePositiveNumber(row?.fuel_ems_external ?? row?.fuelEmsExternal)
				);

				const hasInternal = hasPositiveChartData(internalFuelData);
				const hasExternal = hasPositiveChartData(externalFuelData);

				if (!hasInternal && !hasExternal) return null;

				return {
					engineKey,
					engineName,
					labels,
					rpmData,
					internalFuelData,
					externalFuelData,
					hasInternal,
					hasExternal
				};
			})
			.filter(Boolean);
	}

	function rpmFuelCurveChart(node, group) {
		let chart;
		let disposed = false;

		node.style.touchAction = 'none';

		const handleResetZoom = () => {
			chart?.resetZoom?.();
		};

		node.addEventListener('dblclick', handleResetZoom);

		async function render(chartGroup) {
			if (!chartGroup || disposed) return;

			await ensureChartZoomPlugin();

			if (disposed) return;

			if (chart) {
				chart.destroy();
				chart = null;
			}

			const datasets = [
				{
					label: 'RPM',
					data: chartGroup.rpmData,
					yAxisID: 'rpm',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				}
			];

			if (chartGroup.hasInternal && canShowFuelEmsInternal) {
				datasets.push({
					label: `${getDailyFuelSourceLabel('ems_internal')} L/h`,
					data: chartGroup.internalFuelData,
					yAxisID: 'fuel',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			if (chartGroup.hasExternal && canShowFuelEmsExternal) {
				datasets.push({
					label: `${getDailyFuelSourceLabel('ems_external')} L/h`,
					data: chartGroup.externalFuelData,
					yAxisID: 'fuel',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			chart = new Chart(node, {
				type: 'line',
				data: {
					labels: chartGroup.labels,
					datasets
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					interaction: {
						mode: 'index',
						intersect: false
					},
					plugins: {
						legend: {
							position: 'top',
							labels: {
								boxWidth: 12,
								font: {
									size: 11,
									weight: 'bold'
								}
							}
						},
						tooltip: {
							callbacks: {
								label(context) {
									const label = context.dataset.label || '';
									const value = context.parsed.y;

									if (context.dataset.yAxisID === 'rpm') {
										return `${label}: ${formatNumber(value, 0)} RPM`;
									}

									return `${label}: ${formatNumber(value, 2)} L/h`;
								}
							}
						},
						zoom: {
							limits: {
								x: {
									min: 'original',
									max: 'original',
									minRange: 5
								}
							},
							pan: {
								enabled: true,
								mode: 'x',
								modifierKey: 'shift'
							},
							zoom: {
								wheel: {
									enabled: true,
									speed: 0.08
								},
								pinch: {
									enabled: true
								},
								drag: {
									enabled: true,
									backgroundColor: 'rgba(37, 99, 235, 0.12)',
									borderColor: 'rgba(37, 99, 235, 0.35)',
									borderWidth: 1
								},
								mode: 'x'
							}
						}
					},
					scales: {
						x: {
							ticks: {
								maxTicksLimit: 10,
								font: {
									size: 10
								}
							},
							grid: {
								display: false
							}
						},
						rpm: {
							type: 'linear',
							position: 'left',
							min: 0,
							beginAtZero: true,
							title: {
								display: true,
								text: 'RPM'
							},
							ticks: {
								font: {
									size: 10
								}
							}
						},
						fuel: {
							type: 'linear',
							position: 'right',
							min: 0,
							beginAtZero: true,
							title: {
								display: true,
								text: 'Fuel L/h'
							},
							grid: {
								drawOnChartArea: false
							},
							ticks: {
								font: {
									size: 10
								}
							}
						}
					}
				}
			});
		}

		render(group);

		return {
			update(nextGroup) {
				render(nextGroup);
			},
			destroy() {
				disposed = true;
				node.removeEventListener('dblclick', handleResetZoom);

				if (chart) {
					chart.destroy();
					chart = null;
				}
			}
		};
	}

	function getTripMapPoints(data) {
		const points = data?.path_coordinates || data?.pathCoordinates || [];

		if (!Array.isArray(points)) return [];

		return points
			.map((point) => {
				const lat = Number(point?.latitude ?? point?.lat);
				const lng = Number(point?.longitude ?? point?.lng);

				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
				if (lat === 0 && lng === 0) return null;

				return {
					lat,
					lng,
					time: point?.time || point?.timestamp || point?.ts || '-'
				};
			})
			.filter(Boolean);
	}

	function getTripMapPayload(value) {
		if (Array.isArray(value)) {
			return {
				points: value,
				zones: []
			};
		}

		return {
			points: Array.isArray(value?.points) ? value.points : [],
			zones: Array.isArray(value?.zones) ? value.zones : []
		};
	}

	function tripLeafletMap(node, payload = { points: [], zones: [] }) {
		let map = null;
		let leaflet = null;
		let routeLayer = null;
		let startMarker = null;
		let endMarker = null;
		let zoneLayer = null;
		let disposed = false;

		node.addEventListener('click', handleCoordinateCopyClick, true);

		function createTripDivIcon(label, type) {
			if (!leaflet) return null;

			return leaflet.divIcon({
				className: `trip-map-marker ${type}`,
				html: `<span>${label}</span>`,
				iconSize: [30, 30],
				iconAnchor: [15, 15],
				popupAnchor: [0, -14]
			});
		}

		async function render(nextPayload = { points: [], zones: [] }) {
			if (disposed) return;

			const { points: nextPoints, zones: nextZones } = getTripMapPayload(nextPayload);
			const validPoints = Array.isArray(nextPoints) ? nextPoints : [];

			if (!leaflet) {
				const module = await import('leaflet');
				leaflet = module.default || module;
			}

			if (disposed) return;

			if (!map) {
				map = leaflet.map(node, {
					zoomControl: false,
					scrollWheelZoom: true,
					dragging: true,
					doubleClickZoom: true,
					touchZoom: true,
					attributionControl: false
				});

				leaflet.tileLayer(VMS_TILE_URL, VMS_TILE_OPTIONS).addTo(map);
				addLeafletZoomAndScale(leaflet, map);
			}

			if (zoneLayer) {
				zoneLayer.clearLayers();
				zoneLayer.remove();
				zoneLayer = null;
			}

			zoneLayer = addMapZonesToLeafletMap(leaflet, map, nextZones, {
				paneName: 'dailyTripZonePane',
				zIndex: 355
			});

			if (routeLayer) {
				routeLayer.remove();
				routeLayer = null;
			}

			if (startMarker) {
				startMarker.remove();
				startMarker = null;
			}

			if (endMarker) {
				endMarker.remove();
				endMarker = null;
			}

			if (!validPoints.length) {
				map.setView([-2.5489, 118.0149], 5);
				return;
			}

			const latLngs = validPoints.map((point) => [point.lat, point.lng]);

			routeLayer = leaflet
				.polyline(latLngs, {
					weight: 4,
					opacity: 0.9
				})
				.addTo(map);

			const startPoint = validPoints[0];
			const endPoint = validPoints[validPoints.length - 1];

			startMarker = leaflet
				.marker([startPoint.lat, startPoint.lng], {
					icon: createTripDivIcon('S', 'start')
				})
				.bindPopup(
					`
					<div class="trip-map-popup">
						<strong class="trip-map-popup-title">Start Point</strong>
						<div class="trip-map-popup-row"><span>Time</span><b>${startPoint.time}</b></div>
						<div class="trip-map-popup-row"><span>Lat</span>${createCopyableCoordinateHtml(startPoint.lat, 'start latitude')}</div>
						<div class="trip-map-popup-row"><span>Lng</span>${createCopyableCoordinateHtml(startPoint.lng, 'start longitude')}</div>
					</div>
				`,
					{
						className: 'trip-leaflet-popup',
						maxWidth: 260
					}
				)
				.addTo(map);

			endMarker = leaflet
				.marker([endPoint.lat, endPoint.lng], {
					icon: createTripDivIcon('E', 'end')
				})
				.bindPopup(
					`
					<div class="trip-map-popup">
						<strong class="trip-map-popup-title">End Point</strong>
						<div class="trip-map-popup-row"><span>Time</span><b>${endPoint.time}</b></div>
						<div class="trip-map-popup-row"><span>Lat</span>${createCopyableCoordinateHtml(endPoint.lat, 'end latitude')}</div>
						<div class="trip-map-popup-row"><span>Lng</span>${createCopyableCoordinateHtml(endPoint.lng, 'end longitude')}</div>
					</div>
				`,
					{
						className: 'trip-leaflet-popup',
						maxWidth: 260
					}
				)
				.addTo(map);

			map.fitBounds(routeLayer.getBounds(), {
				padding: [24, 24],
				maxZoom: 14
			});

			setTimeout(() => {
				map?.invalidateSize();
			}, 120);
		}

		render(payload);

		return {
			update(nextPayload) {
				render(nextPayload);
			},
			destroy() {
				disposed = true;
				node.removeEventListener('click', handleCoordinateCopyClick, true);

				if (zoneLayer) {
					zoneLayer.clearLayers();
					zoneLayer.remove();
					zoneLayer = null;
				}

				if (map) {
					map.remove();
					map = null;
				}
			}
		};
	}

	let tripMapPoints = $derived(getTripMapPoints(normalizedReport));

	let vesselName = $derived(
		$selectedVesselInfo?.name ||
			$selectedVesselInfo?.vesselName ||
			reportData?.vessel_name ||
			reportData?.vesselName ||
			'Selected Vessel'
	);

	function addRpmCurveSource(rows = [], curveType) {
		if (!Array.isArray(rows)) return [];

		return rows.map((row) => ({
			...row,
			curve_type: row?.curve_type ?? row?.curveType ?? curveType
		}));
	}

	function getRpmRowEngineName(row) {
		const name = getRowEngineName(row);
		return String(name || '')
			.replace(/\s+TOTAL$/i, '')
			.trim();
	}

	function isConfiguredRpmRow(row) {
		return isConfiguredEngine(getRpmRowEngineName(row));
	}

	function getRpmLhValue(row) {
		return row?.lh_ems ?? row?.lhEms ?? row?.lh_maker ?? row?.lhMaker ?? row?.lh ?? 0;
	}

	function buildRpmCurveTables(data) {
		const tables = [
			{
				curveType: 'ems_internal',
				title: 'ems_internal',
				rows: addRpmCurveSource(
					data?.rpm_ranges_ems_internal?.details || data?.rpmRangesEmsInternal?.details,
					'ems_internal'
				)
			},
			{
				curveType: 'ems_external',
				title: 'ems_external',
				rows: addRpmCurveSource(
					data?.rpm_ranges_ems_external?.details || data?.rpmRangesEmsExternal?.details,
					'ems_external'
				)
			},
			{
				curveType: 'engine_maker',
				title: 'Engine Maker',
				rows: addRpmCurveSource(
					data?.rpm_ranges_maker?.details || data?.rpmRangesMaker?.details,
					'engine_maker'
				)
			}
		];

		return tables
			.map((table) => ({
				...table,
				rows: table.rows.filter(isConfiguredRpmRow).filter(hasRuntimeValue)
			}))
			.filter((table) => table.rows.length);
	}

	function getRpmRuntimeHours(row) {
		const runtimeHours = Number(row?.runtime_hours ?? row?.runtimeHours);

		if (Number.isFinite(runtimeHours)) return runtimeHours;

		const runtimeMinutes = Number(row?.runtime_minutes ?? row?.runtimeMinutes);

		if (Number.isFinite(runtimeMinutes)) return runtimeMinutes / 60;

		return 0;
	}

	function hasRuntimeValue(row) {
		return getRpmRuntimeHours(row) > 0;
	}

	function hasPositiveFuelValue(value) {
		return toFuelNumber(value) > 0;
	}

	function hasFuelSourceInRows(sourceKey) {
		return fuelRows.some((row) => {
			if (sourceKey === 'ems_internal') {
				return hasPositiveFuelValue(row?.ems_internal ?? row?.emsInternal);
			}

			if (sourceKey === 'ems_external') {
				return hasPositiveFuelValue(row?.ems_external ?? row?.emsExternal);
			}

			if (sourceKey === 'ecu') {
				return hasPositiveFuelValue(row?.ecu);
			}

			if (sourceKey === 'fms') {
				return hasPositiveFuelValue(row?.fms);
			}

			if (sourceKey === 'engine_maker') {
				return hasPositiveFuelValue(row?.engine_maker ?? row?.engineMaker);
			}

			return false;
		});
	}

	function hasFuelSourceInSummary(sourceKey) {
		if (sourceKey === 'ems_internal') {
			return hasPositiveFuelValue(fuelSummary?.ems_internal ?? fuelSummary?.emsInternal);
		}

		if (sourceKey === 'ems_external') {
			return hasPositiveFuelValue(fuelSummary?.ems_external ?? fuelSummary?.emsExternal);
		}

		if (sourceKey === 'ecu') {
			return hasPositiveFuelValue(fuelSummary?.ecu);
		}

		if (sourceKey === 'fms') {
			return hasPositiveFuelValue(fuelSummary?.fms);
		}

		if (sourceKey === 'engine_maker') {
			return hasPositiveFuelValue(fuelSummary?.engine_maker ?? fuelSummary?.engineMaker);
		}

		return false;
	}

	function hasFuelSourceInRpmRangeRaw(sourceKey) {
		if (sourceKey === 'ems_internal') {
			const rows =
				normalizedReport?.rpm_ranges_ems_internal?.details ||
				normalizedReport?.rpmRangesEmsInternal?.details ||
				[];

			return Array.isArray(rows) && rows.some((row) => hasRuntimeValue(row));
		}

		if (sourceKey === 'ems_external') {
			const rows =
				normalizedReport?.rpm_ranges_ems_external?.details ||
				normalizedReport?.rpmRangesEmsExternal?.details ||
				[];

			return Array.isArray(rows) && rows.some((row) => hasRuntimeValue(row));
		}

		if (sourceKey === 'engine_maker') {
			const rows =
				normalizedReport?.rpm_ranges_maker?.details ||
				normalizedReport?.rpmRangesMaker?.details ||
				[];

			return Array.isArray(rows) && rows.some((row) => hasRuntimeValue(row));
		}

		return false;
	}

	function hasFuelSourceInRpmChartRaw(sourceKey) {
		const chart = normalizedReport?.rpm_vs_fuel_chart || normalizedReport?.rpmVsFuelChart || {};

		if (!chart || typeof chart !== 'object') return false;

		return Object.values(chart).some((rows) => {
			if (!Array.isArray(rows)) return false;

			return rows.some((row) => {
				if (sourceKey === 'ems_internal') {
					return hasPositiveFuelValue(row?.fuel_ems_internal ?? row?.fuelEmsInternal);
				}

				if (sourceKey === 'ems_external') {
					return hasPositiveFuelValue(row?.fuel_ems_external ?? row?.fuelEmsExternal);
				}

				return false;
			});
		});
	}

	function hasDailyFuelSourceData(sourceKey) {
		return (
			hasFuelSourceInSummary(sourceKey) ||
			hasFuelSourceInRows(sourceKey) ||
			hasFuelSourceInRpmRangeRaw(sourceKey) ||
			hasFuelSourceInRpmChartRaw(sourceKey)
		);
	}

	function downsampleChartRows(rows = [], maxPoints = 240) {
		if (!Array.isArray(rows)) return [];
		if (rows.length <= maxPoints) return rows;

		const step = Math.ceil(rows.length / maxPoints);

		return rows.filter((_, index) => index % step === 0);
	}

	let normalizedReport = $derived(reportData?.data || reportData || {});

	let rawRuntimeRows = $derived(
		pickArray(
			normalizedReport?.engine_runtimes,
			normalizedReport?.engineRuntimes,
			normalizedReport?.runtimeRows
		)
	);

	let runtimeRows = $derived(filterEngineRows(rawRuntimeRows, getRowEngineName));

	let rawRpmRows = $derived([
		...addRpmCurveSource(
			normalizedReport?.rpm_ranges_ems_internal?.details ||
				normalizedReport?.rpmRangesEmsInternal?.details,
			'ems_internal'
		),
		...addRpmCurveSource(
			normalizedReport?.rpm_ranges_ems_external?.details ||
				normalizedReport?.rpmRangesEmsExternal?.details,
			'ems_external'
		),
		...addRpmCurveSource(
			normalizedReport?.rpm_ranges_maker?.details || normalizedReport?.rpmRangesMaker?.details,
			'engine_maker'
		)
	]);

	let rpmCurveTables = $derived(buildRpmCurveTables(normalizedReport));

	let rpmRows = $derived(rpmCurveTables.flatMap((table) => table.rows));

	let totalFuelValue = $derived(
		toFuelNumber(fuelSummary?.ecu) +
			toFuelNumber(fuelSummary?.fms) +
			toFuelNumber(fuelSummary?.ems_internal ?? fuelSummary?.emsInternal) +
			toFuelNumber(fuelSummary?.ems_external ?? fuelSummary?.emsExternal) +
			toFuelNumber(fuelSummary?.engine_maker ?? fuelSummary?.engineMaker)
	);

	let rawFuelRows = $derived(
		pickArray(
			normalizedReport?.fuel_consumption_table?.details,
			normalizedReport?.fuelConsumptionTable?.details,
			normalizedReport?.fuelRows
		)
	);

	let fuelRows = $derived(filterEngineRows(rawFuelRows, getRowEngineName));

	let speedSummary = $derived(
		normalizedReport?.speed_stats ||
			normalizedReport?.speedStats ||
			normalizedReport?.speedSummary ||
			normalizedReport?.speed ||
			normalizedReport?.summary?.speed ||
			{}
	);

	let travelDistance = $derived(
		normalizedReport?.travel_distance || normalizedReport?.travelDistance || {}
	);

	let dailyTripSummary = $derived(buildDailyTripSummary(normalizedReport));

	let fuelSummary = $derived(
		normalizedReport?.fuel_consumption_table?.totals?.grand_total ||
			normalizedReport?.fuelConsumptionTable?.totals?.grand_total ||
			normalizedReport?.fuelSummary ||
			normalizedReport?.fuel ||
			normalizedReport?.summary?.fuel ||
			{}
	);

	let dataReceivedStats = $derived(
		normalizedReport?.data_received_stats ||
			normalizedReport?.dataReceivedStats ||
			normalizedReport?.stats ||
			{}
	);

	let rawHighRpmOutsideSafetyZoneRows = $derived(
		normalizeHighRpmOutsideSafetyZoneRows(normalizedReport)
	);

	let highRpmOutsideSafetyZoneRows = $derived(
		filterEngineRows(rawHighRpmOutsideSafetyZoneRows, (row) => row.engine)
	);

	let highRpmOutsideSafetyZoneGroups = $derived(
		groupHighRpmOutsideSafetyZoneRows(highRpmOutsideSafetyZoneRows)
	);

	let highRpmLowSpeedData = $derived(normalizeHighRpmLowSpeed(normalizedReport));

	let highRpmLowSpeedGroups = $derived(highRpmLowSpeedData.groups || []);

	let highRpmLowSpeedTotals = $derived(highRpmLowSpeedData.totals || []);

	let highRpmLowSpeedGrandTotal = $derived(highRpmLowSpeedData.grandTotal || 0);

	let rawStatusHistoryGroups = $derived(
		getStatusHistoryGroups(
			normalizedReport?.status_history || normalizedReport?.statusHistory || {}
		)
	);

	let statusHistoryGroups = $derived(
		sortByConfiguredEngines(
			rawStatusHistoryGroups.filter((group) => isConfiguredEngine(group.engineName)),
			(group) => group.engineName
		)
	);

	let statusTimelineGroups = $derived(buildStatusTimelineGroups(statusHistoryGroups));

	let hasRawData = $derived(Boolean(reportData));

	let visibleTotalFuelValue = $derived(
		(canViewFuelEcu ? toFuelNumber(fuelSummary?.ecu) : 0) +
			(canViewFuelFms ? toFuelNumber(fuelSummary?.fms) : 0) +
			(canViewFuelEmsInternal
				? toFuelNumber(fuelSummary?.ems_internal ?? fuelSummary?.emsInternal)
				: 0) +
			(canViewFuelEmsExternal
				? toFuelNumber(fuelSummary?.ems_external ?? fuelSummary?.emsExternal)
				: 0) +
			(canViewFuelEngineMaker
				? toFuelNumber(fuelSummary?.engine_maker ?? fuelSummary?.engineMaker)
				: 0)
	);

	let visibleFuelSourceForDistance = $derived(getVisibleFuelSourceLabel());

	let canAccessDailyReport = $derived(hasPermission('access_daily_report'));

	let canViewEngineRuntimeTable = $derived(hasPermission('view_engine_runtime_table'));

	let canViewEngineEventStatusHistory = $derived(hasPermission('view_engine_event_status_history'));

	let canViewEngineOnOffChart = $derived(hasPermission('view_engine_on_off_chart'));

	let canViewFuelConsumptionTable = $derived(hasPermission('view_fuel_consumption_table'));

	let canViewEngineRpmStatsTable = $derived(hasPermission('view_engine_rpm_stats_table'));

	let canViewSpeedStatsTable = $derived(hasPermission('view_speed_stats_table'));

	let canViewTravelDistanceTable = $derived(hasPermission('view_travel_distance_table'));

	let canViewDailyPathMap = $derived(hasPermission('view_daily_path_map'));

	let canViewRpmVsFuelChart = $derived(hasPermission('view_rpm_vs_fuel_chart'));

	let canViewLiterPerNauticalMileTable = $derived(
		hasPermission('view_liter_per_nautical_mile_table')
	);

	let canViewHighRpmOutsideSafetyZoneTable = $derived(
		hasPermission('view_high_rpm_outside_safety_zone_table')
	);

	let canViewHighRpmLowSpeedTable = $derived(hasPermission('view_high_rpm_low_speed_table'));

	let canViewFuelEcu = $derived(hasPermission('view_fuel_ecu'));

	let canViewFuelFms = $derived(hasPermission('view_fuel_fms'));

	let canViewFuelFod = $derived(hasPermission('view_fuel_fod'));

	let canViewFuelEmsInternal = $derived(hasPermission('view_fuel_ems_internal'));

	let canViewFuelEmsExternal = $derived(hasPermission('view_fuel_ems_external'));

	let canViewFuelEngineMaker = $derived(hasPermission('view_fuel_engine_maker'));

	let visibleRpmCurveTables = $derived(rpmCurveTables.filter(canViewRpmCurveTable));

	let visibleRpmRows = $derived(visibleRpmCurveTables.flatMap((table) => table.rows || []));

	let canViewRpmRangeRuntimeFuel = $derived(visibleRpmCurveTables.length > 0);

	let totalRuntimeHours = $derived(
		runtimeRows.reduce((sum, row) => {
			return sum + toNumber(row?.runtime_hours ?? row?.runtimeHours, 0);
		}, 0)
	);

	let totalDistanceNmForFuel = $derived(
		getNumericValue(
			travelDistance?.total_distance_nm ??
				travelDistance?.totalDistanceNm ??
				travelDistance?.totalDistance,
			0
		)
	);

	let rpmCurveGroups = $derived(buildRpmRangeGroupsByCurve(normalizedReport, engineCurveData));

	let emsInternalFuelValue = $derived(
		getFuelTotalFromRpmCurveGroups(rpmCurveGroups, 'ems_internal')
	);

	let emsExternalFuelValue = $derived(
		getFuelTotalFromRpmCurveGroups(rpmCurveGroups, 'ems_external')
	);

	let engineMakerFuelValue = $derived(
		getFuelTotalFromRpmCurveGroups(rpmCurveGroups, 'engine_maker')
	);

	let emsInternalLiterPerNm = $derived(
		calculateLiterPerNm(emsInternalFuelValue, totalDistanceNmForFuel)
	);

	let emsExternalLiterPerNm = $derived(
		calculateLiterPerNm(emsExternalFuelValue, totalDistanceNmForFuel)
	);

	let engineMakerLiterPerNm = $derived(
		calculateLiterPerNm(engineMakerFuelValue, totalDistanceNmForFuel)
	);

	let ecuFuelValue = $derived(
		getNumericValue(
			fuelSummary?.ecu ??
				normalizedReport?.fuel_consumption_table?.totals?.grand_total?.ecu ??
				normalizedReport?.fuelConsumptionTable?.totals?.grand_total?.ecu,
			0
		)
	);

	let fmsFuelValue = $derived(
		getNumericValue(
			fuelSummary?.fms ??
				normalizedReport?.fuel_consumption_table?.totals?.grand_total?.fms ??
				normalizedReport?.fuelConsumptionTable?.totals?.grand_total?.fms,
			0
		)
	);

	let ecuLiterPerNm = $derived(calculateLiterPerNm(ecuFuelValue, totalDistanceNmForFuel));

	let fmsLiterPerNm = $derived(calculateLiterPerNm(fmsFuelValue, totalDistanceNmForFuel));

	let totalFuelLiterForDistance = $derived(getTotalFuelLiter(fuelSummary));

	let fuelSourceForDistance = $derived(getFuelSourceLabel(fuelSummary));

	let literPerNauticalMile = $derived(
		calculateLiterPerNm(totalFuelLiterForDistance, totalDistanceNmForFuel)
	);

	let rpmFuelCurveChartGroups = $derived(buildRpmFuelCurveChartGroups(normalizedReport));

	let rawEngineRpmStatsRows = $derived(
		pickArray(
			normalizedReport?.engine_rpm_stats,
			normalizedReport?.engineRpmStats,
			normalizedReport?.rpm_stats,
			normalizedReport?.rpmStats
		)
	);

	let engineRpmStatsRows = $derived(
		filterEngineRows(rawEngineRpmStatsRows, getRowEngineName).filter((row) => {
			const topRpm = Number(row?.top_rpm ?? row?.topRpm ?? row?.top ?? 0);
			const avgRpm = Number(row?.avg_rpm ?? row?.avgRpm ?? row?.average ?? 0);

			return topRpm > 0 || avgRpm > 0;
		})
	);

	let fodUsage = $derived(normalizedReport?.fod_usage || normalizedReport?.fodUsage || {});

	let fodPortValue = $derived(fodUsage?.fod_port_l ?? fodUsage?.fodPortL);

	let fodStbdValue = $derived(fodUsage?.fod_stbd_l ?? fodUsage?.fodStbdL);

	let fodSingleValue = $derived(fodUsage?.fod_single_l ?? fodUsage?.fodSingleL);

	let fodTotalValue = $derived(
		fodUsage?.total_fod_l ??
			fodUsage?.totalFodL ??
			toFuelNumber(fodPortValue) + toFuelNumber(fodStbdValue) + toFuelNumber(fodSingleValue)
	);

	let hasFodPortStbd = $derived(fodPortValue !== undefined || fodStbdValue !== undefined);

	let hasFodSingleOnly = $derived(
		!hasFodPortStbd &&
			fodSingleValue !== undefined &&
			fodSingleValue !== null &&
			fodSingleValue !== ''
	);

	let hasFodUsage = $derived(
		toFuelNumber(fodPortValue) > 0 ||
			toFuelNumber(fodStbdValue) > 0 ||
			toFuelNumber(fodSingleValue) > 0 ||
			toFuelNumber(fodTotalValue) > 0
	);

	let canShowFuelEcu = $derived(canViewFuelEcu && hasDailyFuelSourceData('ecu'));

	let canShowFuelFms = $derived(canViewFuelFms && hasDailyFuelSourceData('fms'));

	let canShowFuelEmsInternal = $derived(
		canViewFuelEmsInternal && hasDailyFuelSourceData('ems_internal')
	);

	let canShowFuelEmsExternal = $derived(
		canViewFuelEmsExternal && hasDailyFuelSourceData('ems_external')
	);

	let canShowFuelEngineMaker = $derived(
		canViewFuelEngineMaker && hasDailyFuelSourceData('engine_maker')
	);

	function updateTopbarStatus(payload) {
		const stats =
			payload?.data_received_stats || payload?.dataReceivedStats || payload?.stats || {};

		setPageStatus({
			pageKey: 'daily-report',
			dataReceived:
				stats?.received_minutes !== undefined && stats?.total_minutes !== undefined
					? `${stats.received_minutes} of ${stats.total_minutes} (${stats.percentage ?? '-'}%)`
					: stats?.received_slots !== undefined && stats?.total_slots !== undefined
						? `${stats.received_slots} of ${stats.total_slots} (${stats.percentage ?? '-'}%)`
						: '-',
			sourcePage: 'Daily Report'
		});
	}

	function getVisibleDailyFuelSources() {
		const sources = [];

		if (canShowFuelEcu) {
			sources.push({ key: 'ecu' });
		}

		if (canShowFuelFms) {
			sources.push({ key: 'fms' });
		}

		if (canShowFuelEmsInternal) {
			sources.push({ key: 'ems_internal' });
		}

		if (canShowFuelEmsExternal) {
			sources.push({ key: 'ems_external' });
		}

		if (canShowFuelEngineMaker) {
			sources.push({ key: 'engine_maker' });
		}

		return sources;
	}

	let visibleDailyFuelSources = $derived(getVisibleDailyFuelSources());

	function hasVisibleDailyFuelSource(sourceKey) {
		return visibleDailyFuelSources.some((source) => source.key === sourceKey);
	}

	function getDailyFuelSourceLabel(sourceKey) {
		const hasInternal = canShowFuelEmsInternal;
		const hasExternal = canShowFuelEmsExternal;

		if (sourceKey === 'ems_internal') {
			return hasInternal && hasExternal ? 'VMS' : 'EMS';
		}

		if (sourceKey === 'ems_external') {
			return 'EMS';
		}

		if (sourceKey === 'engine_maker') return 'Engine Maker';
		if (sourceKey === 'ecu') return 'ECU';
		if (sourceKey === 'fms') return 'FMS';

		return sourceKey || '-';
	}

	async function loadSelectedVesselDetail() {
		if (!$selectedVesselId) return;

		vesselEnginesLoading = true;
		vesselEnginesError = '';

		try {
			const detail = await getFleetVesselDetail($selectedVesselId);

			vesselDetail = detail;

			console.log('[DAILY][VESSEL_DETAIL]', detail);
			console.log('[DAILY][VESSEL_ENGINES]', detail?.engines || []);
		} catch (err) {
			console.error('[DAILY][VESSEL_DETAIL_ERROR]', err);
			vesselEnginesError = err?.message || 'Failed to load vessel engine details.';
			vesselDetail = null;
		} finally {
			vesselEnginesLoading = false;
		}
	}

	async function loadDailyReport() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			reportData = null;
			return;
		}

		if (!reportDate) return;

		loading = true;
		error = '';

		try {
			const [result, curveResult] = await Promise.all([
				getDailyReportData({
					vesselId: $selectedVesselId,
					date: reportDate,
					timezoneMode,
					timezoneOffset
				}),
				getEngineCurvesForVessel($selectedVesselId)
			]);

			reportData = result;
			engineCurveData = curveResult;

			const payload = result?.data || result || {};
			updateTopbarStatus(payload);

			console.log('[DAILY_REPORT_DATA]', result);
			console.log('[DAILY_ENGINE_CURVES]', curveResult);
		} catch (err) {
			console.error('[DAILY_REPORT_ERROR]', err);
			error = err?.message || 'Failed to load daily report.';
			reportData = null;
			engineCurveData = null;
		} finally {
			loading = false;
		}
	}

	async function handleExportExcel() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected.';
			return;
		}

		exporting = true;
		error = '';

		try {
			const url = getDailyReportExcelUrl({
				vesselId: $selectedVesselId,
				date: reportDate,
				timezoneMode,
				timezoneOffset
			});

			const safeVesselName = String(vesselName || 'vessel')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_');

			await downloadApiFile(url, `Daily_Report_${safeVesselName}_${reportDate}.xlsx`);
		} catch (err) {
			console.error('[DAILY_EXPORT_EXCEL_ERROR]', err);
			error = err?.message || 'Failed to export the daily report to Excel.';
		} finally {
			exporting = false;
		}
	}

	async function handleExportPdf() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected.';
			return;
		}

		if (!reportDate) {
			error = 'No report date has been selected.';
			return;
		}

		exportingPdf = true;
		error = '';

		try {
			const url = getDailyReportPdfUrl({
				vesselId: $selectedVesselId,
				date: reportDate,
				timezoneMode,
				timezoneOffset
			});

			const safeVesselName = String(vesselName || 'vessel')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_');

			await downloadApiFile(url, `Daily_Report_${safeVesselName}_${reportDate}.pdf`);
		} catch (err) {
			console.error('[DAILY_EXPORT_PDF_ERROR]', err);
			error = err?.message || 'Failed to export the daily report to PDF.';
		} finally {
			exportingPdf = false;
		}
	}

	async function loadMapZones() {
		try {
			const assets = await getFleetAssets();
			mapZones = normalizeMapZonesFromAssets(assets);
		} catch (err) {
			console.error('[DAILY_MAP_ZONES_ERROR]', err);
			mapZones = [];
		}
	}

	onMount(() => {
		reportDate = todayDate();
		loadMapZones();
	});

	$effect(() => {
		if (!active) return;
		if (!$selectedVesselId) return;

		if (loadedEngineDetailVesselId === $selectedVesselId) return;

		loadedEngineDetailVesselId = $selectedVesselId;
		loadSelectedVesselDetail();
	});

	$effect(() => {
		if (!active) return;
		if (currentUser || currentUserLoading) return;

		loadCurrentUser();
	});

	$effect(() => {
		if (!active) return;
		if (!$selectedVesselId) return;
		if (!reportDate) return;

		const key = `${$selectedVesselId}|${reportDate}|${timezoneMode}|${timezoneOffset}`;

		if (loadedKeys[key]) return;

		loadedKeys = {
			...loadedKeys,
			[key]: true
		};

		loadDailyReport();
	});
</script>

<section class="daily-page">
	<section class="daily-header-card">
		<div>
			<div class="page-kicker">Daily Report</div>
			<h1>{vesselName}</h1>
			<p>Daily vessel operation report, runtime, speed, RPM range, and fuel usage.</p>
		</div>
	</section>

	<section class="filter-card">
		<label>
			<span>Date</span>
			<input type="date" bind:value={reportDate} />
		</label>

		<label>
			<span>Timezone Mode</span>
			<select bind:value={timezoneMode}>
				<option value="auto">Auto</option>
				<option value="manual">Manual</option>
			</select>
		</label>

		{#if timezoneMode === 'manual'}
			<label>
				<span>Timezone Offset</span>
				<input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
			</label>
		{/if}

		<div class="filter-actions">
			<button type="button" class="primary-btn" onclick={loadDailyReport} disabled={loading}>
				{loading ? 'Loading...' : 'Load Data'}
			</button>

			<button type="button" class="export-btn excel" onclick={handleExportExcel} disabled={exporting}>
				{exporting ? 'Exporting...' : 'Export Excel'}
			</button>

			<button type="button" class="export-btn pdf" onclick={handleExportPdf} disabled={exportingPdf}>
				{exportingPdf ? 'Exporting PDF...' : 'Export PDF'}
			</button>
		</div>
	</section>

	{#if error}
		<div class="status-box error-box">{error}</div>
	{/if}

	{#if vesselEnginesLoading}
		<LoadingSkeleton label="Loading vessel engines" variant="list" rows={3} compact />
	{/if}

	{#if loading}
		<LoadingSkeleton label="Loading daily report data" variant="daily-report" />
	{/if}

	{#if vesselEnginesError}
		<div class="status-box error-box">{vesselEnginesError}</div>
	{/if}

	{#if !loading}
		<section class="summary-grid">
		<article class="summary-card">
			<span>Total Runtime</span>
			<strong>{formatHour(totalRuntimeHours)}</strong>
		</article>

		{#if canViewSpeedStatsTable}
			<article class="summary-card">
				<span>Top Speed</span>
				<strong>
					{speedSummary?.top_speed !== undefined && speedSummary?.top_speed !== null
						? `${formatNumber(speedSummary.top_speed, 2)} knot`
						: speedSummary?.topSpeed !== undefined && speedSummary?.topSpeed !== null
							? `${formatNumber(speedSummary.topSpeed, 2)} knot`
							: speedSummary?.maxSpeed !== undefined && speedSummary?.maxSpeed !== null
								? `${formatNumber(speedSummary.maxSpeed, 2)} knot`
								: '-'}
				</strong>
			</article>
		{/if}

		{#if canViewSpeedStatsTable}
			<article class="summary-card">
				<span>Average Speed</span>
				<strong>
					{speedSummary?.avg_running_speed !== undefined && speedSummary?.avg_running_speed !== null
						? `${formatNumber(speedSummary.avg_running_speed, 2)} knot`
						: speedSummary?.averageSpeed !== undefined && speedSummary?.averageSpeed !== null
							? `${formatNumber(speedSummary.averageSpeed, 2)} knot`
							: speedSummary?.avgSpeed !== undefined && speedSummary?.avgSpeed !== null
								? `${formatNumber(speedSummary.avgSpeed, 2)} knot`
								: '-'}
				</strong>
			</article>
		{/if}

		{#if canViewLiterPerNauticalMileTable && canShowFuelEcu}
			<article class="summary-card">
				<span>ECU Fuel per NM</span>
				<strong>{formatLiterPerNm(ecuLiterPerNm)}</strong>
			</article>
		{/if}

		{#if canViewLiterPerNauticalMileTable && canShowFuelFms}
			<article class="summary-card">
				<span>FMS Fuel per NM</span>
				<strong>{formatLiterPerNm(fmsLiterPerNm)}</strong>
			</article>
		{/if}

		{#if canViewLiterPerNauticalMileTable && canShowFuelEmsInternal}
			<article class="summary-card">
				<span>{getDailyFuelSourceLabel('ems_internal')} Fuel per NM</span>
				<strong>{formatLiterPerNm(emsInternalLiterPerNm)}</strong>
			</article>
		{/if}

		{#if canViewLiterPerNauticalMileTable && canShowFuelEmsExternal}
			<article class="summary-card">
				<span>{getDailyFuelSourceLabel('ems_external')} Fuel per NM</span>
				<strong>{formatLiterPerNm(emsExternalLiterPerNm)}</strong>
			</article>
		{/if}

		{#if canViewLiterPerNauticalMileTable && canShowFuelEngineMaker}
			<article class="summary-card">
				<span>Engine Maker Fuel per NM</span>
				<strong>{formatLiterPerNm(engineMakerLiterPerNm)}</strong>
			</article>
		{/if}
	</section>

	{#if canViewSpeedStatsTable || canViewTravelDistanceTable}
		<section class="speed-detail-grid">
			{#if canViewTravelDistanceTable}
				<article>
					<span>Total Distance</span>
					<strong>
						{travelDistance?.total_distance_nm || travelDistance?.totalDistanceNm
							? `${formatNumber(travelDistance?.total_distance_nm ?? travelDistance?.totalDistanceNm, 3)} NM`
							: '-'}
					</strong>
				</article>

				<article>
					<span>Outside Safety Zone</span>
					<strong>
						{travelDistance?.outside_safety_zone_distance_nm ||
						travelDistance?.outsideSafetyZoneDistanceNm
							? `${formatNumber(travelDistance?.outside_safety_zone_distance_nm ?? travelDistance?.outsideSafetyZoneDistanceNm, 3)} NM`
							: '-'}
					</strong>
				</article>
			{/if}

			<article>
				<span>Timezone</span>
				<strong>{normalizedReport?.timezone || '-'}</strong>
			</article>
		</section>
	{/if}

	{#if canViewTravelDistanceTable}
		<section class="table-section trip-summary-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Trip</span>
					<h2>Daily Trip Summary</h2>
				</div>

				<strong>{dailyTripSummary.totalPoints} points</strong>
			</div>

			{#if canViewDailyPathMap && dailyTripSummary.totalPoints}
				<div class="trip-summary-content">
					<article class="trip-route-card">
						<div class="trip-route-header">
							<div>
								<span>Route Preview</span>
								<strong>{dailyTripSummary.startTime} - {dailyTripSummary.endTime}</strong>
							</div>
						</div>

						<div class="trip-route-map">
							{#if active}
								<div
									class="trip-leaflet-map"
									use:tripLeafletMap={{ points: tripMapPoints, zones: mapZones }}
								></div>
							{/if}
						</div>

						{#if mapZones.length}
							<div class="trip-zone-legend" aria-label="Zone legend">
								{#each mapZones as zone}
									<span>
										<i
											style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
											aria-hidden="true"
										></i>
										{zone.name}
									</span>
								{/each}
							</div>
						{/if}
					</article>

					<article class="trip-summary-card">
						<div class="trip-summary-list">
							<div>
								<span>Total Distance</span>
								<strong>{formatNumber(dailyTripSummary.totalDistanceNm, 3)} NM</strong>
							</div>

							{#if canViewLiterPerNauticalMileTable}
								<div>
									<span>Fuel per Nautical Mile</span>
									<strong>
										{literPerNauticalMile === null
											? '-'
											: `${formatNumber(literPerNauticalMile, 2)} L/NM (${visibleFuelSourceForDistance})`}
									</strong>
								</div>
							{/if}

							<div>
								<span>Outside Safety Zone</span>
								<strong>{formatNumber(dailyTripSummary.outsideDistanceNm, 3)} NM</strong>
							</div>

							<div>
								<span>Outside Points</span>
								<strong>{dailyTripSummary.outsidePoints}</strong>
							</div>

							<div>
								<span>Start Coordinate</span>
								<strong class="coordinate-pair">
									<CopyableCoordinate
										value={formatNumber(dailyTripSummary.startLat, 6)}
										display={formatNumber(dailyTripSummary.startLat, 6)}
										label="start latitude"
										compact
									/>
									<span>,</span>
									<CopyableCoordinate
										value={formatNumber(dailyTripSummary.startLng, 6)}
										display={formatNumber(dailyTripSummary.startLng, 6)}
										label="start longitude"
										compact
									/>
								</strong>
							</div>

							<div>
								<span>End Coordinate</span>
								<strong class="coordinate-pair">
									<CopyableCoordinate
										value={formatNumber(dailyTripSummary.endLat, 6)}
										display={formatNumber(dailyTripSummary.endLat, 6)}
										label="end latitude"
										compact
									/>
									<span>,</span>
									<CopyableCoordinate
										value={formatNumber(dailyTripSummary.endLng, 6)}
										display={formatNumber(dailyTripSummary.endLng, 6)}
										label="end longitude"
										compact
									/>
								</strong>
							</div>
						</div>
					</article>
				</div>
			{:else}
				<div class="empty-box">Daily trip path is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewEngineRuntimeTable}
		<section class="table-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Runtime</span>
					<h2>Engine Running Hour</h2>
				</div>
				<strong>{runtimeRows.length} rows</strong>
			</div>

			{#if runtimeRows.length}
				<div class="table-wrapper">
					<table>
						<thead>
							<tr>
								<th>Engine</th>
								<th>Running Hour</th>
								<th>Runtime Hours</th>
							</tr>
						</thead>
						<tbody>
							{#each runtimeRows as row}
								<tr>
									<td>{row.engine_name || row.engineName || row.engine || row.name || '-'}</td>
									<td
										>{row.runtime_formatted ||
											row.runtimeFormatted ||
											formatHour(row.runtime_hours ?? row.runtimeHours)}</td
									>
									<td>{formatHour(row.runtime_hours ?? row.runtimeHours)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty-box">Runtime data is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewEngineEventStatusHistory}
		<section class="table-section event-history-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Status</span>
					<h2>Engine Event Status History</h2>
				</div>

				<strong>{statusHistoryGroups.length} engines</strong>
			</div>

			{#if statusHistoryGroups.length}
				<div class="event-history-grid">
					{#each statusHistoryGroups as group}
						<article class="event-card">
							<div class="event-card-header">
								<div>
									<span>Engine</span>
									<strong>{group.engineName}</strong>
								</div>

								<div class="event-count">
									{group.rows.length} events
								</div>
							</div>

							<div class="event-table-wrapper">
								<table class="event-table">
									<thead>
										<tr>
											<th>Start</th>
											<th>End</th>
											<th>Duration</th>
											<th>Status</th>
										</tr>
									</thead>

									<tbody>
										{#each group.rows as row}
											<tr>
												<td>{row.start}</td>
												<td>{row.end}</td>
												<td>{row.duration}</td>
												<td>
													<span
														class="event-status"
														class:on-status={isOnStatus(row.status)}
														class:off-status={isOffStatus(row.status)}
													>
														{row.status}
													</span>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<div class="empty-box">Event status history is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewEngineOnOffChart}
		<section class="table-section engine-status-chart-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Chart</span>
					<h2>Engine ON/OFF Timeline</h2>
				</div>

				<strong>{statusTimelineGroups.length} engines</strong>
			</div>

			{#if statusTimelineGroups.length}
				<div class="compact-status-list">
					<div class="compact-status-legend">
						<span><i class="legend-on"></i> ON</span>
						<span><i class="legend-off"></i> OFF</span>
					</div>

					{#each statusTimelineGroups as group}
						<div class="compact-status-row">
							<div class="compact-engine-name">
								<strong>{group.engineName}</strong>
								<span>{formatDurationSeconds(group.totalSeconds)}</span>
							</div>

							<div class="compact-timeline-area">
								<div class="compact-transition-labels">
									{#each group.transitionLabels as label}
										<span
											class="compact-transition-label"
											style={`left: ${label.leftPercent}%;`}
											title={`${label.time} · ${label.status}`}
										>
											{label.time}
										</span>
									{/each}
								</div>

								<div class="compact-timeline">
									{#each group.segments as segment}
										<div
											class="compact-segment"
											class:on-segment={isOnStatus(segment.status)}
											class:off-segment={isOffStatus(segment.status)}
											style={`width: ${segment.widthPercent}%;`}
											title={`${segment.status} | ${segment.start} - ${segment.end} | ${segment.duration}`}
										>
											{#if segment.widthPercent >= 12}
												<span>{segment.status}</span>
											{/if}
										</div>
									{/each}
								</div>

								<div class="compact-axis">
									<span>{group.segments[0]?.start || '-'}</span>
									<span>{group.segments[group.segments.length - 1]?.end || '-'}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="empty-box">Engine ON/OFF timeline is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewFuelConsumptionTable}
		<section class="table-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Fuel</span>
					<h2>Fuel Consumption</h2>
				</div>
				<strong>{fuelRows.length} rows</strong>
			</div>

			{#if canViewFuelFod && hasFodUsage}
				<div class="fod-usage-summary" class:single-fod-layout={hasFodSingleOnly}>
					{#if hasFodSingleOnly}
						<article>
							<span>FOD Single</span>
							<strong>{formatLiter(fodSingleValue)}</strong>
						</article>

						<article class="fod-total-card">
							<span>Total FOD</span>
							<strong>{formatLiter(fodTotalValue)}</strong>
						</article>
					{:else}
						<article>
							<span>FOD Port</span>
							<strong>{formatLiter(fodPortValue)}</strong>
						</article>

						<article>
							<span>FOD STBD</span>
							<strong>{formatLiter(fodStbdValue)}</strong>
						</article>

						<article class="fod-total-card">
							<span>Total FOD</span>
							<strong>{formatLiter(fodTotalValue)}</strong>
						</article>
					{/if}
				</div>
			{/if}

			{#if fuelRows.length}
				<div class="table-wrapper">
					<table>
						<thead>
							<tr>
								<th>Engine</th>
								<th>Type</th>
								{#if canShowFuelEcu}<th>ECU</th>{/if}
								{#if canShowFuelFms}<th>FMS</th>{/if}
								{#if canShowFuelEmsInternal}
									<th>{getDailyFuelSourceLabel('ems_internal')}</th>
								{/if}
								{#if canShowFuelEmsExternal}
									<th>{getDailyFuelSourceLabel('ems_external')}</th>
								{/if}
								{#if canShowFuelEngineMaker}<th>Engine Maker</th>{/if}
							</tr>
						</thead>

						<tbody>
							{#each fuelRows as row}
								<tr>
									<td>{row.engine_name || row.engineName || row.engine || row.name || '-'}</td>
									<td>{row.is_main ? 'ME' : 'AE'}</td>

									{#if canShowFuelEcu}
										<td>{formatPlainLiter(row.ecu)}</td>
									{/if}

									{#if canShowFuelFms}
										<td>{formatPlainLiter(row.fms)}</td>
									{/if}

									{#if canShowFuelEmsInternal}
										<td>{formatPlainLiter(row.ems_internal ?? row.emsInternal)}</td>
									{/if}

									{#if canShowFuelEmsExternal}
										<td>{formatPlainLiter(row.ems_external ?? row.emsExternal)}</td>
									{/if}

									{#if canShowFuelEngineMaker}
										<td>{formatPlainLiter(row.engine_maker ?? row.engineMaker)}</td>
									{/if}
								</tr>
							{/each}

							<tr class="total-row">
								<td colspan="2">Grand Total</td>

								{#if canShowFuelEcu}
									<td>{formatPlainLiter(fuelSummary?.ecu)}</td>
								{/if}

								{#if canShowFuelFms}
									<td>{formatPlainLiter(fuelSummary?.fms)}</td>
								{/if}

								{#if canShowFuelEmsInternal}
									<td>{formatPlainLiter(fuelSummary?.ems_internal ?? fuelSummary?.emsInternal)}</td>
								{/if}

								{#if canShowFuelEmsExternal}
									<td>{formatPlainLiter(fuelSummary?.ems_external ?? fuelSummary?.emsExternal)}</td>
								{/if}

								{#if canShowFuelEngineMaker}
									<td>{formatPlainLiter(fuelSummary?.engine_maker ?? fuelSummary?.engineMaker)}</td>
								{/if}
							</tr>
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty-box">Fuel data is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewEngineRpmStatsTable}
		<section class="table-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">RPM</span>
					<h2>Engine RPM Statistics</h2>
				</div>

				<strong>{engineRpmStatsRows.length} engines</strong>
			</div>

			{#if engineRpmStatsRows.length}
				<div class="table-wrapper">
					<table>
						<thead>
							<tr>
								<th>Engine</th>
								<th>Top RPM</th>
								<th>Avg RPM</th>
							</tr>
						</thead>

						<tbody>
							{#each engineRpmStatsRows as row}
								<tr>
									<td>{row.engine_name || row.engineName || row.engine || row.name || '-'}</td>
									<td>{formatNumber(row.top_rpm ?? row.topRpm ?? row.top ?? 0, 0)}</td>
									<td>{formatNumber(row.avg_rpm ?? row.avgRpm ?? row.average ?? 0, 1)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty-box">RPM statistics data is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewRpmRangeRuntimeFuel}
		<section class="table-section rpm-curve-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">RPM</span>
					<h2>RPM Range Runtime & Fuel</h2>
				</div>
				<strong>{visibleRpmRows.length} rows</strong>
			</div>

			{#if visibleRpmCurveTables.length}
				<div class="rpm-curve-table-list">
					{#each visibleRpmCurveTables as table}
						<article class="rpm-curve-table-card">
							<div class="rpm-curve-table-header">
								<div>
									<span>Curve Source</span>
									<strong>
										{table.curveType === 'ems_internal' || table.curveType === 'ems_external'
											? getDailyFuelSourceLabel(table.curveType)
											: table.title}
									</strong>
								</div>

								<div class="rpm-curve-table-count">
									{table.rows.length} rows
								</div>
							</div>

							<div class="table-wrapper">
								<table>
									<thead>
										<tr>
											<th>Engine</th>
											<th>RPM Range</th>
											<th>Runtime</th>
											<th>L/h</th>
											<th>Fuel Estimated</th>
										</tr>
									</thead>

									<tbody>
										{#each table.rows as row}
											<tr class:total-row={row.is_total_row || row.isTotalRow}>
												<td>{row.engine_name || row.engineName || row.engine || row.name || '-'}</td
												>

												<td>{row.rpm_range || row.rpmRange || row.range || '-'}</td>

												<td>{formatHour(getRpmRuntimeHours(row))}</td>

												<td>{formatNumber(getRpmLhValue(row), 2)}</td>

												<td>
													{formatLiter(
														row.fuel_estimated_l ?? row.fuelEstimatedL ?? row.fuel ?? row.fuelUsed
													)}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<div class="empty-box">RPM range data is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewRpmVsFuelChart}
		<section class="table-section rpm-fuel-curve-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Chart</span>
					<h2>RPM vs Fuel Curve</h2>
				</div>

				<strong>{rpmFuelCurveChartGroups.length} engines</strong>
			</div>

			{#if rpmFuelCurveChartGroups.length}
				<div class="rpm-fuel-chart-grid">
					{#each rpmFuelCurveChartGroups as group}
						<article class="rpm-fuel-chart-card">
							<div class="rpm-fuel-chart-header">
								<div>
									<span>Engine</span>
									<strong>{group.engineName}</strong>
								</div>

								<div class="rpm-fuel-chart-badges">
									{#if group.hasInternal && canShowFuelEmsInternal}
										<span>{getDailyFuelSourceLabel('ems_internal')}</span>
									{/if}

									{#if group.hasExternal && canShowFuelEmsExternal}
										<span>{getDailyFuelSourceLabel('ems_external')}</span>
									{/if}
								</div>
							</div>

							<div class="rpm-fuel-chart-canvas">
								<canvas use:rpmFuelCurveChart={group}></canvas>
							</div>

							<div class="rpm-fuel-chart-hint">
								Scroll to zoom in/out, drag to select a zoom area, Shift + drag to pan, double click to reset.
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<div class="empty-box">RPM vs fuel curve chart is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewHighRpmOutsideSafetyZoneTable}
		<section class="table-section high-rpm-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">RPM</span>
					<h2>High RPM Outside Safety Zone</h2>
				</div>

				<strong>{highRpmOutsideSafetyZoneRows.length} rows</strong>
			</div>

			{#if highRpmOutsideSafetyZoneGroups.length}
				<div class="high-rpm-group-list">
					{#each highRpmOutsideSafetyZoneGroups as group}
						<article class="high-rpm-card">
							<div class="high-rpm-title">
								{group.rule}
							</div>

							<div class="high-rpm-table-wrapper">
								<table class="high-rpm-table">
									<thead>
										<tr>
											<th>Engine (ME)</th>
											<th>Duration</th>
											<th>% RH</th>
											<th>Avg Speed</th>
											<th>Highest Speed</th>
											<th>Lowest Speed</th>
										</tr>
									</thead>

									<tbody>
										{#each group.rows as row}
											<tr>
												<td>{row.engine}</td>
												<td>{row.duration}</td>
												<td>{formatPercent(row.percentageRh)}</td>
												<td>{formatSpeed(row.avgSpeed)}</td>
												<td>{formatSpeed(row.highestSpeed)}</td>
												<td>{formatSpeed(row.lowestSpeed)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<div class="empty-box">High RPM outside safety zone data is not available yet.</div>
			{/if}
		</section>
	{/if}

	{#if canViewHighRpmLowSpeedTable}
		<section class="table-section low-speed-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Fuel</span>
					<h2>High RPM Low Speed</h2>
				</div>

				<strong>{highRpmLowSpeedGroups.length} engines</strong>
			</div>

			{#if highRpmLowSpeedGroups.length}
				<div class="low-speed-content">
					<div class="low-speed-grid">
						{#each highRpmLowSpeedGroups as group}
							<article class="low-speed-card">
								<div class="low-speed-card-header">
									<div>
										<span>Engine</span>
										<strong>{group.engineName}</strong>
									</div>

									<div class="low-speed-total-pill">
										{formatLiter(group.totalFuel)}
									</div>
								</div>

								<div class="low-speed-table-wrapper">
									<table class="low-speed-table">
										<thead>
											<tr>
												<th>Start Time</th>
												<th>End Time</th>
												<th>Fuel Used</th>
											</tr>
										</thead>

										<tbody>
											{#each group.rows as row}
												<tr>
													<td>{formatTimeDot(row.startTime)}</td>
													<td>{formatTimeDot(row.endTime)}</td>
													<td>{formatLiter(row.fuelUsedL)}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</article>
						{/each}
					</div>

					<article class="low-speed-summary-card">
						<div class="low-speed-summary-header">
							<div>
								<span>Summary</span>
								<strong>Total All Engines</strong>
							</div>
						</div>

						<div class="low-speed-table-wrapper">
							<table class="low-speed-table">
								<tbody>
									{#each highRpmLowSpeedTotals as row}
										<tr>
											<td>TOTAL {row.engineName}</td>
											<td>{formatLiter(row.fuelUsedL)}</td>
										</tr>
									{/each}

									<tr class="grand-total-row">
										<td>GRAND TOTAL ALL ENGINES</td>
										<td>{formatLiter(highRpmLowSpeedGrandTotal)}</td>
									</tr>
								</tbody>
							</table>
						</div>
					</article>
				</div>
			{:else}
				<div class="empty-box">High RPM low speed data is not available yet.</div>
			{/if}
		</section>
	{/if}

		{#if hasRawData}
			<details class="raw-box">
				<summary>Raw Daily Report Response</summary>
				<pre>{JSON.stringify(reportData, null, 2)}</pre>
			</details>
		{/if}
	{/if}
</section>

<style>
	.daily-page {
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
	}

	.daily-header-card,
	.filter-card,
	.summary-card,
	.table-section,
	.raw-box,
	.data-received-card,
	.speed-detail-grid article {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.daily-header-card {
		padding: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.page-kicker,
	.section-kicker {
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

	.daily-header-card h1 {
		margin: 8px 0 0;
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
		color: var(--text-primary);
	}

	.daily-header-card p {
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.header-meta {
		min-width: 120px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--color-elevated);
		border: 1px solid #e2e8f0;
		text-align: right;
	}

	.header-meta span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.header-meta strong {
		display: block;
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.filter-card {
		margin-top: 14px;
		padding: 12px;
		display: flex;
		align-items: end;
		gap: 10px;
		flex-wrap: wrap;
	}

	.filter-card label {
		display: grid;
		gap: 5px;
	}

	.filter-card label span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.filter-card input,
	.filter-card select {
		height: 32px;
		min-width: 150px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 9px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		outline: none;
	}

	.filter-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.primary-btn,
	.secondary-btn,
	.export-btn {
		height: 32px;
		padding: 0 12px;
		border: none;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
	}

	.primary-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.secondary-btn {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.export-btn {
		color: #ffffff;
	}

	.excel {
		background: #16a34a;
	}

	.pdf {
		background: #b5150c;
	}

	.primary-btn:disabled,
	.secondary-btn:disabled,
	.export-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.status-box {
		margin-top: 14px;
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 900;
	}

	.error-box {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.success-box {
		background: var(--color-success-muted);
		color: #047857;
		border: 1px solid #bbf7d0;
	}

	.data-received-card {
		margin-top: 14px;
		padding: 14px 16px;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: center;
	}

	.data-received-card span {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.data-received-card strong {
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
	}

	.trip-summary-section {
		overflow: hidden;
	}

	.trip-summary-content {
		padding: 14px;
		display: grid;
		grid-template-columns: minmax(320px, 0.9fr) minmax(360px, 1.1fr);
		gap: 14px;
		background: var(--color-elevated);
	}

	.trip-route-card,
	.trip-summary-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.trip-route-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
	}

	.trip-route-header span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.trip-route-header strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 900;
	}

	.trip-route-map {
		position: relative;
		height: 250px;
		margin: 14px;
		border-radius: 12px;
		border: 1px solid #d9e2ec;
		background: var(--color-elevated);
		overflow: hidden;
		box-sizing: border-box;
	}

	.trip-leaflet-map {
		width: 100%;
		height: 100%;
	}

	.trip-zone-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: -4px 14px 14px;
		padding: 0;
	}

	.trip-zone-legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 24px;
		padding: 4px 8px;
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 999px;
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 800;
	}

	.trip-zone-legend i {
		width: 20px;
		height: 14px;
		border: 2px dashed var(--zone-color, #38bdf8);
		border-radius: 5px;
		background: color-mix(in srgb, var(--zone-fill, #0ea5e9) 24%, transparent);
		flex: 0 0 auto;
	}

	.trip-leaflet-map :global(.leaflet-container) {
		width: 100%;
		height: 100%;
		border-radius: 12px;
	}

	.trip-leaflet-map :global(.vms-zone-popup-wrapper .leaflet-popup-content-wrapper) {
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.94);
		color: #f8fafc;
		box-shadow: 0 18px 36px rgba(15, 23, 42, 0.36);
		overflow: hidden;
	}

	.trip-leaflet-map :global(.vms-zone-popup-wrapper .leaflet-popup-content) {
		margin: 0;
		width: 180px !important;
	}

	.trip-leaflet-map :global(.vms-zone-popup-wrapper .leaflet-popup-tip) {
		background: rgba(15, 23, 42, 0.94);
	}

	.trip-leaflet-map :global(.vms-zone-popup) {
		display: grid;
		gap: 5px;
		padding: 10px 12px;
	}

	.trip-leaflet-map :global(.vms-zone-popup strong) {
		color: #f8fafc;
		font-size: 13px;
		font-weight: 800;
	}

	.trip-leaflet-map :global(.vms-zone-popup span) {
		color: #94a3b8;
		font-size: 11px;
		font-weight: 650;
	}

	.trip-leaflet-map :global(.vms-zone-tooltip) {
		border: 1px solid rgba(96, 165, 250, 0.26);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.88);
		color: #f8fafc;
		font-size: 10px;
		font-weight: 800;
		box-shadow: 0 10px 20px rgba(15, 23, 42, 0.28);
	}

	.trip-leaflet-map :global(.trip-map-marker) {
		width: 30px;
		height: 30px;
		border-radius: 999px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px solid #ffffff;
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.35);
	}

	.trip-leaflet-map :global(.trip-map-marker span) {
		color: #ffffff;
		font-size: 13px;
		font-weight: 900;
		line-height: 1;
	}

	.trip-leaflet-map :global(.trip-map-marker.start) {
		background: #10b981;
	}

	.trip-leaflet-map :global(.trip-map-marker.end) {
		background: #ef4444;
	}

	.trip-leaflet-map :global(.trip-leaflet-popup .leaflet-popup-content-wrapper) {
		background: #0f172a;
		color: #f8fafc;
		border: 1px solid rgba(148, 163, 184, 0.34);
		border-radius: 12px;
		box-shadow:
			0 16px 30px rgba(2, 6, 23, 0.28),
			0 2px 8px rgba(15, 23, 42, 0.2);
		overflow: hidden;
	}

	.trip-leaflet-map :global(.trip-leaflet-popup .leaflet-popup-content) {
		width: 230px !important;
		margin: 0;
		color: #f8fafc;
	}

	.trip-leaflet-map :global(.trip-leaflet-popup .leaflet-popup-tip) {
		background: #0f172a;
		border: 1px solid rgba(148, 163, 184, 0.34);
	}

	.trip-leaflet-map :global(.trip-leaflet-popup .leaflet-popup-close-button) {
		color: rgba(226, 232, 240, 0.82) !important;
		font-size: 18px !important;
		font-weight: 700 !important;
		padding: 7px 8px 0 0 !important;
	}

	.trip-leaflet-map :global(.trip-leaflet-popup .leaflet-popup-close-button:hover) {
		color: #ffffff !important;
	}

	.trip-leaflet-map :global(.trip-map-popup-title) {
		display: block;
		padding: 10px 36px 9px 12px;
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(96, 165, 250, 0.04)),
			#111827;
		color: #f8fafc;
		font-size: 13px;
		font-weight: 800;
		line-height: 1.2;
		border-bottom: 1px solid rgba(148, 163, 184, 0.22);
	}

	.trip-leaflet-map :global(.trip-map-popup-row) {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr);
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #0f172a;
		border-bottom: 1px solid rgba(148, 163, 184, 0.16);
	}

	.trip-leaflet-map :global(.trip-map-popup-row:last-child) {
		border-bottom: 0;
	}

	.trip-leaflet-map :global(.trip-map-popup-row span) {
		color: #94a3b8;
		font-size: 10px;
		font-weight: 700;
	}

	.trip-leaflet-map :global(.trip-map-popup-row b),
	.trip-leaflet-map :global(.trip-map-popup-row strong) {
		color: #f8fafc;
		font-size: 11px;
		font-weight: 700;
		text-align: right;
	}

	.trip-leaflet-map :global(.trip-map-popup-row .coordinate-copy-inline) {
		justify-content: flex-end;
	}

	.trip-leaflet-map :global(.leaflet-container) {
		width: 100%;
		height: 100%;
	}

	.trip-summary-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.trip-summary-list div {
		padding: 14px;
		border-bottom: 1px solid #eef2f7;
		border-right: 1px solid #eef2f7;
	}

	.trip-summary-list div:nth-child(2n) {
		border-right: 0;
	}

	.trip-summary-list span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.trip-summary-list strong {
		display: block;
		margin-top: 6px;
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
		word-break: break-word;
	}

	.trip-summary-list strong.coordinate-pair {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 5px;
	}

	@media (max-width: 1000px) {
		.trip-summary-content {
			grid-template-columns: 1fr;
		}

		.trip-summary-list {
			grid-template-columns: 1fr;
		}

		.trip-summary-list div {
			border-right: 0;
		}
	}

	.summary-grid {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}

	.summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.summary-card span {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.summary-card strong {
		margin-top: 10px;
		color: var(--text-primary);
		font-size: 22px;
		line-height: 1.1;
		font-weight: 900;
	}

	@media (min-width: 1101px) {
		.summary-grid > .summary-card:nth-last-child(2):nth-child(4n),
		.summary-grid > .summary-card:last-child:nth-child(4n + 1) {
			grid-column: span 2;
		}

		.summary-grid > .summary-card:nth-last-child(2):nth-child(4n + 1),
		.summary-grid > .summary-card:last-child:nth-child(4n + 2) {
			grid-column: span 2;
		}

		.summary-grid > .summary-card:nth-last-child(3):nth-child(4n + 1) {
			grid-column: span 2;
		}

		.summary-grid:has(> .summary-card:nth-child(5):last-child) {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}

		.summary-grid:has(> .summary-card:nth-child(5):last-child) > .summary-card {
			grid-column: span 2;
		}

		.summary-grid:has(> .summary-card:nth-child(5):last-child) > .summary-card:nth-last-child(-n + 2) {
			grid-column: span 3;
		}
	}

	.speed-detail-grid {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}

	.speed-detail-grid article {
		min-height: 80px;
		padding: 14px;
	}

	.speed-detail-grid span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.speed-detail-grid strong {
		display: block;
		margin-top: 10px;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
	}

	.table-section {
		margin-top: 14px;
		overflow: hidden;
	}

	.section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.section-header h2 {
		margin: 7px 0 0;
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 900;
	}

	.section-header > strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.table-wrapper {
		width: 100%;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	th {
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
		padding: 10px 12px;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	td {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		padding: 10px 12px;
		border-bottom: 1px solid #eef2f7;
		white-space: nowrap;
	}

	tr:hover td {
		background: var(--color-elevated);
	}

	.total-row td {
		background: var(--color-accent-muted);
		color: var(--text-primary);
		font-weight: 900;
	}

	.empty-box {
		padding: 18px 14px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.raw-box {
		margin-top: 14px;
		padding: 12px 14px;
	}

	.raw-box summary {
		cursor: pointer;
		font-size: 12px;
		font-weight: 900;
		color: #1d4ed8;
	}

	.raw-box pre {
		margin-top: 12px;
		padding: 12px;
		max-height: 360px;
		overflow: auto;
		background: #0f172a;
		color: #e2e8f0;
		font-size: 11px;
		line-height: 1.5;
	}

	.fod-usage-summary {
		padding: 12px 14px 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		background: var(--color-elevated);
	}

	.fod-usage-summary article {
		min-height: 68px;
		padding: 12px 14px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.fod-usage-summary span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.fod-usage-summary strong {
		margin-top: 6px;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
	}

	.fod-total-card {
		background: var(--color-accent-muted) !important;
		border-color: #bfdbfe !important;
	}

	.fod-total-card strong {
		color: #1d4ed8;
	}

	.fod-usage-summary.single-fod-layout {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	@media (max-width: 700px) {
		.fod-usage-summary.single-fod-layout {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 700px) {
		.fod-usage-summary {
			grid-template-columns: 1fr;
		}
	}

	.event-history-section {
		overflow: hidden;
	}

	.event-history-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(340px, 1fr));
		gap: 14px;
		background: var(--color-elevated);
	}

	.event-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.event-card-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.event-card-header span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.event-card-header strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 900;
	}

	.event-count {
		flex-shrink: 0;
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.event-table-wrapper {
		width: 100%;
		overflow-x: auto;
	}

	.event-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	.event-table th {
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: center;
		padding: 10px 12px;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	.event-table td {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		padding: 10px 12px;
		border-bottom: 1px solid #eef2f7;
		text-align: center;
		white-space: nowrap;
	}

	.event-table tbody tr:hover td {
		background: var(--color-elevated);
	}

	.event-status {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		height: 24px;
		padding: 0 10px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.04em;
	}

	.event-status.on-status {
		background: var(--color-success-muted);
		color: #047857;
		border: 1px solid #bbf7d0;
	}

	.event-status.off-status {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-secondary);
		border: 1px solid #cbd5e1;
	}

	.engine-status-chart-section {
		overflow: hidden;
	}

	.engine-status-chart-section {
		overflow: hidden;
	}

	.compact-status-list {
		padding: 12px 14px;
		display: grid;
		gap: 10px;
		background: var(--color-elevated);
	}

	.compact-status-legend {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
	}

	.compact-status-legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.compact-status-legend i {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		display: inline-block;
	}

	.legend-on {
		background: #10b981;
	}

	.legend-off {
		background: #94a3b8;
	}

	.compact-status-row {
		min-height: 74px;
		padding: 10px 12px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
		display: grid;
		grid-template-columns: 150px 1fr;
		gap: 14px;
		align-items: center;
	}

	.compact-engine-name {
		min-width: 0;
	}

	.compact-engine-name strong {
		display: block;
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
		line-height: 1.2;
	}

	.compact-engine-name span {
		display: inline-flex;
		margin-top: 5px;
		padding: 3px 8px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
	}

	.compact-timeline-area {
		position: relative;
		padding-top: 16px;
	}

	.compact-transition-labels {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 14px;
	}

	.compact-transition-label {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		padding: 1px 4px;
		border-radius: 6px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 900;
		line-height: 1.1;
		white-space: nowrap;
		box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
	}

	.compact-transition-label::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 100%;
		width: 1px;
		height: 7px;
		background: #cbd5e1;
		transform: translateX(-50%);
	}

	.compact-timeline {
		height: 24px;
		display: flex;
		overflow: hidden;
		border: 1px solid #d9e2ec;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
	}

	.compact-segment {
		min-width: 2px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		transition:
			opacity 0.15s ease,
			filter 0.15s ease,
			transform 0.15s ease,
			box-shadow 0.15s ease;
		cursor: pointer;
	}

	.compact-segment:hover {
		opacity: 1;
		filter: brightness(1.08) saturate(1.15);
		transform: scaleY(1.18);
		z-index: 3;
		box-shadow:
			0 0 0 2px rgba(15, 23, 42, 0.18),
			0 4px 10px rgba(15, 23, 42, 0.18);
	}

	.compact-segment:hover span {
		opacity: 1;
	}

	.compact-timeline:hover .compact-segment:not(:hover) {
		opacity: 0.55;
	}

	.compact-segment.on-segment:hover {
		background: #059669;
	}

	.compact-segment.off-segment:hover {
		background: #64748b;
	}

	.compact-segment span {
		color: #ffffff;
		font-size: 9px;
		font-weight: 900;
		letter-spacing: 0.04em;
	}

	.compact-segment.on-segment {
		background: #10b981;
	}

	.compact-segment.off-segment {
		background: #94a3b8;
	}

	.compact-axis {
		margin-top: 5px;
		display: flex;
		justify-content: space-between;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 800;
	}

	@media (max-width: 900px) {
		.compact-status-row {
			grid-template-columns: 1fr;
			gap: 8px;
		}

		.compact-status-legend {
			justify-content: flex-start;
		}
	}

	.rpm-curve-section {
		overflow: hidden;
	}

	.rpm-curve-table-list {
		padding: 14px;
		display: grid;
		gap: 14px;
		background: var(--color-elevated);
	}

	.rpm-curve-table-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.rpm-curve-table-header {
		min-height: 52px;
		padding: 10px 14px;
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.rpm-curve-table-header span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.rpm-curve-table-header strong {
		display: block;
		margin-top: 3px;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 900;
	}

	.rpm-curve-table-count {
		flex-shrink: 0;
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.rpm-curve-content {
		padding: 14px;
		display: grid;
		gap: 14px;
		background: var(--color-elevated);
	}

	.rpm-curve-card,
	.rpm-engine-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.rpm-curve-header,
	.rpm-engine-header {
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.rpm-engine-header {
		padding: 12px 14px;
		min-height: 58px;
	}

	.rpm-curve-header {
		padding: 12px 14px;
		min-height: 20px;
	}

	.rpm-curve-header span,
	.rpm-engine-header span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.rpm-curve-header strong,
	.rpm-engine-header strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 900;
	}

	.rpm-engine-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(340px, 1fr));
		gap: 14px;
		background: var(--color-elevated);
	}

	@media (max-width: 1000px) {
		.rpm-engine-grid {
			grid-template-columns: 1fr;
		}
	}

	.rpm-fuel-curve-section {
		overflow: hidden;
	}

	.rpm-fuel-chart-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(360px, 1fr));
		gap: 14px;
		background: var(--color-elevated);
	}

	.rpm-fuel-chart-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.rpm-fuel-chart-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.rpm-fuel-chart-header span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.rpm-fuel-chart-header strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 900;
	}

	.rpm-fuel-chart-badges {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.rpm-fuel-chart-badges span {
		padding: 5px 8px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
	}

	.rpm-fuel-chart-canvas {
		height: 280px;
		padding: 14px;
	}

	.rpm-fuel-chart-canvas canvas {
		width: 100%;
		height: 100%;
	}

	.rpm-fuel-chart-hint {
		padding: 0 14px 14px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 800;
		line-height: 1.4;
	}

	@media (max-width: 1000px) {
		.rpm-fuel-chart-grid {
			grid-template-columns: 1fr;
		}
	}

	.high-rpm-section {
		overflow: hidden;
	}

	.high-rpm-group-list {
		padding: 14px;
		display: grid;
		gap: 14px;
		background: var(--color-elevated);
	}

	.high-rpm-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.high-rpm-title {
		min-height: 44px;
		padding: 11px 14px;
		background: var(--color-surface);
		border-bottom: 1px solid #e5edf5;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
		display: flex;
		align-items: center;
	}

	.high-rpm-table-wrapper {
		width: 100%;
		overflow-x: auto;
	}

	.high-rpm-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	.high-rpm-table th {
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: center;
		padding: 10px 12px;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	.high-rpm-table td {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		padding: 10px 12px;
		border-bottom: 1px solid #eef2f7;
		text-align: center;
		white-space: nowrap;
	}

	.high-rpm-table tbody tr:hover td {
		background: var(--color-elevated);
	}

	.high-rpm-table td:first-child {
		font-weight: 900;
		color: #1e293b;
	}

	.low-speed-section {
		overflow: hidden;
	}

	.low-speed-content {
		padding: 14px;
		display: grid;
		gap: 14px;
		background: var(--color-elevated);
	}

	.low-speed-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(320px, 1fr));
		gap: 14px;
	}

	.low-speed-card,
	.low-speed-summary-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.low-speed-card-header,
	.low-speed-summary-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.low-speed-card-header span,
	.low-speed-summary-header span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.low-speed-card-header strong,
	.low-speed-summary-header strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 900;
	}

	.low-speed-total-pill {
		flex-shrink: 0;
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.low-speed-table-wrapper {
		width: 100%;
		overflow-x: auto;
	}

	.low-speed-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	.low-speed-table th {
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: center;
		padding: 10px 12px;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	.low-speed-table td {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		padding: 10px 12px;
		border-bottom: 1px solid #eef2f7;
		text-align: center;
		white-space: nowrap;
	}

	.low-speed-table tbody tr:hover td {
		background: var(--color-elevated);
	}

	.low-speed-table td:first-child {
		font-weight: 900;
		color: #1e293b;
	}

	.low-speed-table .grand-total-row td {
		background: var(--color-elevated);
		color: var(--text-primary);
		font-size: 12.5px;
		font-weight: 900;
		border-top: 1px solid #d9e2ec;
	}

	.low-speed-summary-card .low-speed-table td:first-child {
		text-align: left;
	}

	.low-speed-summary-card .low-speed-table td:last-child {
		text-align: right;
		font-weight: 900;
	}

	@media (max-width: 1000px) {
		.low-speed-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 1000px) {
		.event-history-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 1100px) {
		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.summary-grid > .summary-card:last-child:nth-child(odd) {
			grid-column: 1 / -1;
		}

		.speed-detail-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.daily-page {
			padding: 8px;
		}

		.daily-header-card {
			flex-direction: column;
			align-items: flex-start;
		}

		.header-meta {
			width: 100%;
			text-align: left;
		}

		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}

		.summary-card {
			min-height: 72px;
			padding: 10px 12px;
		}

		.summary-card span {
			font-size: 9px;
			line-height: 1.2;
			letter-spacing: 0.03em;
		}

		.summary-card strong {
			margin-top: 6px;
			font-size: 18px;
			line-height: 1.1;
		}

		.filter-card input,
		.filter-card select {
			min-width: 100%;
		}

		.filter-actions {
			width: 100%;
		}

		.primary-btn,
		.secondary-btn,
		.export-btn {
			width: 100%;
		}

		.data-received-card {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
