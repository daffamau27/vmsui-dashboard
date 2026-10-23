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
	import { addMapTileLayer } from '$lib/utils/mapStyle.js';
	import { addLeafletZoomAndScale } from '$lib/utils/leafletControls.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import DailyReportHeader from './DailyReportHeader.svelte';
	import DailyReportSummary from './DailyReportSummary.svelte';
	import DailyReportTrip from './DailyReportTrip.svelte';
	import './daily-report-page.css';
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
	import { getAutoTimezoneLabelFromSources } from '$lib/utils/autoTimezoneLabel.js';
	import { sortByAlpha } from '$lib/utils/alphaSort.js';
	import {
		buildPeriodicalRpmMatrices,
		formatRpmRuntime,
		getPeriodicalRpmRuntimePercent
	} from '$lib/utils/periodicalReport.js';

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
	/** @type {any[]} */
	let mapAssetRows = $state([]);

	let reportDate = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');
	let hasLoadedDateRange = $state(false);
	let selectedRpmRuntimeFuelTableKey = $state('');

	let zoomPluginRegistered = false;
	let shouldShowDateRangeOverlay = $derived(!hasLoadedDateRange || !reportDate);

	async function ensureChartZoomPlugin() {
		if (zoomPluginRegistered) return true;
		if (typeof window === 'undefined') return false;

		const module = await import('chartjs-plugin-zoom');
		const zoomPlugin = module.default || module;

		Chart.register(zoomPlugin);
		zoomPluginRegistered = true;

		return true;
	}

	/** @type {any} */
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

	function canViewRpmFuelSource(sourceKey) {
		if (sourceKey === 'ems_internal') return canViewFuelEmsInternal;
		if (sourceKey === 'ems_external') return canViewFuelEmsExternal;
		if (sourceKey === 'engine_maker') return canViewFuelEngineMaker;
		if (sourceKey === 'fms') return canViewFuelFms;
		if (sourceKey === 'ecu') return canViewFuelEcu;

		return false;
	}

	function canViewRpmCurveTable(table) {
		const curveType = String(table?.curveType || '').toLowerCase();
		const sourceKeys = Array.isArray(table?.sourceKeys) ? table.sourceKeys : [];

		if (sourceKeys.length) {
			return sourceKeys.some(canViewRpmFuelSource);
		}

		if (curveType === 'ems_internal') return canViewFuelEmsInternal;
		if (curveType === 'ems_external') return canViewFuelEmsExternal;
		if (curveType === 'engine_maker') return canViewFuelEngineMaker;
		if (curveType === 'fms_ecu') return canViewFuelFms || canViewFuelEcu;

		return false;
	}

	let { active = false } = $props();

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function todayDate() {
		const date = new Date();
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}

	function markDateFilterDirty() {
		hasLoadedDateRange = false;
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

	function formatCoordinatePair(latitude, longitude) {
		const lat = Number(latitude);
		const lng = Number(longitude);

		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '-';

		return `${formatNumber(lat, 6)}, ${formatNumber(lng, 6)}`;
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
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

	function getPriorityFuelSourceForDistance(summary = {}) {
		const candidates = [
			{
				key: 'ems_external',
				label: 'EMS',
				canView: canViewFuelEmsExternal,
				fuelLiter: toFuelNumber(summary?.ems_external ?? summary?.emsExternal)
			},
			{
				key: 'ems_internal',
				label: 'VMS',
				canView: canViewFuelEmsInternal,
				fuelLiter: toFuelNumber(summary?.ems_internal ?? summary?.emsInternal)
			},
			{
				key: 'fms',
				label: 'FMS',
				canView: canViewFuelFms,
				fuelLiter: toFuelNumber(summary?.fms)
			},
			{
				key: 'ecu',
				label: 'ECU',
				canView: canViewFuelEcu,
				fuelLiter: toFuelNumber(summary?.ecu)
			}
		];

		const selected = candidates.find((candidate) => {
			return candidate.canView && candidate.fuelLiter > 0;
		});

		if (!selected) {
			return {
				key: '',
				label: '-',
				fuelLiter: 0,
				literPerNm: null
			};
		}

		return {
			...selected,
			literPerNm: calculateLiterPerNm(selected.fuelLiter, totalDistanceNmForFuel)
		};
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

		return `${formatNumber(number, 2)} kn`;
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

	function getHighRpmLowSpeedDurationSeconds(row) {
		const duration = row?.duration_formatted ?? row?.durationFormatted ?? row?.duration;
		if (typeof duration === 'string' && /\d/.test(duration)) {
			const units = duration
				.trim()
				.match(/^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i);
			if (units) {
				return Number(units[1] || 0) * 3600 + Number(units[2] || 0) * 60 + Number(units[3] || 0);
			}
			const clock = duration.trim().match(/^(\d+):([0-5]\d):([0-5]\d)$/);
			if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
		}

		let durationSeconds = null;
		for (const [value, multiplier] of [
			[row?.duration_seconds ?? row?.durationSeconds, 1],
			[row?.duration_minutes ?? row?.durationMinutes, 60]
		]) {
			if (value === null || value === undefined || String(value).trim() === '') continue;
			const number = Number(value);
			if (Number.isFinite(number) && number >= 0) {
				durationSeconds = number * multiplier;
				break;
			}
		}

		if (durationSeconds === null) {
			const start = timeToSeconds(row?.start_time || row?.startTime);
			const end = timeToSeconds(row?.end_time || row?.endTime);
			if (start === null || end === null || start > 86400 || end > 86400) return null;

			// Time-only events can continue past midnight into the next day.
			durationSeconds = end >= start ? end - start : 86400 - start + end;
		}

		return durationSeconds;
	}

	function getHighRpmLowSpeedDuration(row, durationSeconds) {
		const duration = row?.duration_formatted ?? row?.durationFormatted ?? row?.duration;
		if (typeof duration === 'string' && /\d/.test(duration)) return duration.trim();
		if (durationSeconds === null) return '-';

		const seconds = Math.floor(durationSeconds);
		return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
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

			const durationSeconds = getHighRpmLowSpeedDurationSeconds(row);
			groupMap.get(engineName).push({
				id: `${engineName}-${index}`,
				engineName,
				startTime: row?.start_time || row?.startTime || '-',
				endTime: row?.end_time || row?.endTime || '-',
				duration: getHighRpmLowSpeedDuration(row, durationSeconds),
				isLongDuration: durationSeconds !== null && durationSeconds > 30 * 60,
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

	function formatClutchStatus(status) {
		const value = String(status || '-')
			.trim()
			.toUpperCase();
		if (value === 'ON') return 'IN';
		if (value === 'OFF') return 'OUT';
		return value || '-';
	}

	function timeToSeconds(value) {
		const text = String(value || '').trim();
		const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

		if (!match) return null;

		const hours = Number(match[1]);
		const minutes = Number(match[2]);
		const seconds = Number(match[3] || 0);

		if (
			!Number.isFinite(hours) ||
			!Number.isFinite(minutes) ||
			!Number.isFinite(seconds) ||
			hours < 0 ||
			hours > 24 ||
			minutes < 0 ||
			minutes > 59 ||
			seconds < 0 ||
			seconds > 59
		) {
			return null;
		}

		return hours * 3600 + minutes * 60 + seconds;
	}

	function secondsFromStatusRow(row) {
		const seconds = Number(row?.durationSeconds ?? row?.DurationSeconds ?? 0);
		if (Number.isFinite(seconds) && seconds > 0) return seconds;

		const startSeconds = timeToSeconds(row?.start ?? row?.Start);
		const endSeconds = timeToSeconds(row?.end ?? row?.End);

		if (startSeconds === null || endSeconds === null) return 0;

		if (startSeconds === endSeconds) return 24 * 3600;
		if (endSeconds > startSeconds) return endSeconds - startSeconds;

		return 24 * 3600 - startSeconds + endSeconds;
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
							duration: normalizeSegmentDuration(row?.duration, durationSeconds),
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

	function normalizeEngineKey(value) {
		return String(value || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ');
	}

	function getTimelineGroupByEngine(groups = [], engineName) {
		const key = normalizeEngineKey(engineName);

		if (!key) return null;

		return (
			groups.find((group) => normalizeEngineKey(group?.engineName) === key) ||
			groups.find((group) => {
				const groupKey = normalizeEngineKey(group?.engineName);
				return groupKey.includes(key) || key.includes(groupKey);
			}) ||
			null
		);
	}

	function hasClutchInTimelineData(group) {
		const segments = Array.isArray(group?.segments) ? group.segments : [];

		return segments.some((segment) => isOnStatus(segment?.status));
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

	function normalizeSegmentDuration(duration, durationSeconds) {
		const text = String(duration || '').trim();

		if (
			text &&
			text !== '-' &&
			text.toLowerCase() !== 'null' &&
			text.toLowerCase() !== 'undefined'
		) {
			return text;
		}

		return formatDurationSeconds(durationSeconds);
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

	function hasFiniteChartData(values = []) {
		return (
			Array.isArray(values) &&
			values.some((value) => {
				if (value === undefined || value === null || value === '' || value === '-') return false;

				const number = Number(value);

				return Number.isFinite(number);
			})
		);
	}

	function toNullableChartNumber(value) {
		if (value === undefined || value === null || value === '' || value === '-') return null;

		const number = Number(value);

		return Number.isFinite(number) ? number : null;
	}

	function toNullableNonNegativeNumber(value) {
		if (value === undefined || value === null || value === '' || value === '-') return null;

		const number = Number(value);

		if (!Number.isFinite(number)) return null;

		return number >= 0 ? number : null;
	}

	function getChartFuelValue(row, sourceKey) {
		if (sourceKey === 'ems_internal') {
			return row?.fuel_ems_internal ?? row?.fuelEmsInternal;
		}

		if (sourceKey === 'ems_external') {
			return row?.fuel_ems_external ?? row?.fuelEmsExternal;
		}

		if (sourceKey === 'fms') {
			return row?.fuel_fms ?? row?.fuelFms;
		}

		if (sourceKey === 'ecu') {
			return row?.fuel_ecu ?? row?.fuelEcu;
		}

		if (sourceKey === 'engine_maker') {
			return row?.fuel_engine_maker ?? row?.fuelEngineMaker ?? row?.fuel_maker ?? row?.fuelMaker;
		}

		return undefined;
	}

	function buildRpmFuelCurveChartGroups(data) {
		const rpmVsFuelChart = data?.rpm_vs_fuel_chart || data?.rpmVsFuelChart || {};

		if (!rpmVsFuelChart || typeof rpmVsFuelChart !== 'object') return [];

		const engineCharts = Object.entries(rpmVsFuelChart).filter(
			([engineKey, chartRows]) =>
				Array.isArray(chartRows) &&
				chartRows.length &&
				isConfiguredEngine(normalizeEngineText(engineKey))
		);
		// Decide fuel-series visibility across all configured engines, using raw
		// points so downsampling cannot hide a source's only non-zero measurement.
		const activeFuelSources = new Set(
			['ems_internal', 'ems_external', 'fms', 'ecu', 'engine_maker'].filter((sourceKey) =>
				engineCharts.some(([, chartRows]) =>
					chartRows.some(
						(row) => toNullableNonNegativeNumber(getChartFuelValue(row, sourceKey)) > 0
					)
				)
			)
		);

		return engineCharts
			.map(([engineKey, chartRows]) => {
				const engineName = normalizeEngineText(engineKey);

				const validRows = downsampleChartRows(chartRows).filter((row) => {
					return [
						row?.rpm,
						row?.speed,
						getChartFuelValue(row, 'ems_internal'),
						getChartFuelValue(row, 'ems_external'),
						getChartFuelValue(row, 'fms'),
						getChartFuelValue(row, 'ecu'),
						getChartFuelValue(row, 'engine_maker')
					].some((value) => toNullableChartNumber(value) !== null);
				});

				if (!validRows.length) return null;

				const labels = validRows.map((row) => row?.time || '-');

				const rpmData = validRows.map((row) => toNullableChartNumber(row?.rpm));

				const speedData = validRows.map((row) => toNullableChartNumber(row?.speed));

				const internalFuelData = validRows.map((row) =>
					toNullableNonNegativeNumber(getChartFuelValue(row, 'ems_internal'))
				);

				const externalFuelData = validRows.map((row) =>
					toNullableNonNegativeNumber(getChartFuelValue(row, 'ems_external'))
				);

				const fmsFuelData = validRows.map((row) =>
					toNullableNonNegativeNumber(getChartFuelValue(row, 'fms'))
				);

				const ecuFuelData = validRows.map((row) =>
					toNullableNonNegativeNumber(getChartFuelValue(row, 'ecu'))
				);

				const engineMakerFuelData = validRows.map((row) =>
					toNullableNonNegativeNumber(getChartFuelValue(row, 'engine_maker'))
				);

				const hasInternal = hasFiniteChartData(internalFuelData);
				const hasExternal = hasFiniteChartData(externalFuelData);
				const hasFms = hasFiniteChartData(fmsFuelData);
				const hasEcu = hasFiniteChartData(ecuFuelData);
				const hasEngineMaker = hasFiniteChartData(engineMakerFuelData);
				const hasSpeed = hasFiniteChartData(speedData);
				const hasRpm = hasFiniteChartData(rpmData);
				const hasVisibleFuel =
					(hasInternal && canViewFuelEmsInternal) ||
					(hasExternal && canViewFuelEmsExternal) ||
					(hasFms && canViewFuelFms) ||
					(hasEcu && canViewFuelEcu) ||
					(hasEngineMaker && canViewFuelEngineMaker);

				// Zero is a real measurement, not an empty chart. RPM/speed can
				// also be shown when no permitted fuel series is available.
				if (!hasRpm && !hasSpeed && !hasVisibleFuel) return null;

				return {
					engineKey,
					engineName,
					labels,
					rpmData,
					speedData,
					internalFuelData,
					externalFuelData,
					fmsFuelData,
					ecuFuelData,
					engineMakerFuelData,
					hasRpm,
					hasSpeed,
					hasInternal: hasInternal && activeFuelSources.has('ems_internal'),
					hasExternal: hasExternal && activeFuelSources.has('ems_external'),
					hasFms: hasFms && activeFuelSources.has('fms'),
					hasEcu: hasEcu && activeFuelSources.has('ecu'),
					hasEngineMaker: hasEngineMaker && activeFuelSources.has('engine_maker')
				};
			})
			.filter(Boolean);
	}

	function buildFodChartGroup(data) {
		const fodRows =
			data?.fod_chart || data?.fodChart || data?.fuel_fod_chart || data?.fuelFodChart || [];

		if (!Array.isArray(fodRows) || !fodRows.length) return null;

		const validRows = downsampleChartRows(fodRows).filter((row) => {
			const fuelFod = Number(row?.fuel_fod ?? row?.fuelFod);
			const fuelFodPort = Number(row?.fuel_fod_port ?? row?.fuelFodPort);
			const fuelFodStbd = Number(row?.fuel_fod_stbd ?? row?.fuelFodStbd);

			return (
				Number.isFinite(fuelFod) || Number.isFinite(fuelFodPort) || Number.isFinite(fuelFodStbd)
			);
		});

		if (!validRows.length) return null;

		const labels = validRows.map((row) => row?.time || '-');
		const singleData = validRows.map((row) => toNullableChartNumber(row?.fuel_fod ?? row?.fuelFod));
		const portData = validRows.map((row) =>
			toNullableChartNumber(row?.fuel_fod_port ?? row?.fuelFodPort)
		);
		const stbdData = validRows.map((row) =>
			toNullableChartNumber(row?.fuel_fod_stbd ?? row?.fuelFodStbd)
		);

		const hasSingleValues = hasFiniteChartData(singleData);
		const hasSplitValues = hasPositiveChartData(portData) || hasPositiveChartData(stbdData);
		const hasSingle = hasSingleValues && !hasSplitValues;
		const hasPort = !hasSingle && hasFiniteChartData(portData);
		const hasStbd = !hasSingle && hasFiniteChartData(stbdData);

		if (!hasSingle && !hasPort && !hasStbd) return null;

		return {
			labels,
			singleData,
			portData,
			stbdData,
			hasSingle,
			hasPort,
			hasStbd,
			points: validRows.length
		};
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
					borderColor: '#60a5fa',
					backgroundColor: 'rgba(96, 165, 250, 0.18)',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				}
			];

			if (chartGroup.hasSpeed) {
				datasets.push({
					label: 'Speed kn',
					data: chartGroup.speedData,
					yAxisID: 'speed',
					borderColor: '#22c55e',
					backgroundColor: 'rgba(34, 197, 94, 0.16)',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			if (chartGroup.hasEcu && canViewFuelEcu) {
				datasets.push({
					label: `${getDailyFuelSourceLabel('ecu', chartGroup)} L/min`,
					data: chartGroup.ecuFuelData,
					yAxisID: 'fuel',
					borderColor: '#f97316',
					backgroundColor: 'rgba(249, 115, 22, 0.14)',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			if (chartGroup.hasFms && canViewFuelFms) {
				datasets.push({
					label: `${getDailyFuelSourceLabel('fms', chartGroup)} L/min`,
					data: chartGroup.fmsFuelData,
					yAxisID: 'fuel',
					borderColor: '#a855f7',
					backgroundColor: 'rgba(168, 85, 247, 0.14)',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			if (chartGroup.hasInternal && canViewFuelEmsInternal) {
				datasets.push({
					label: `${getDailyFuelSourceLabel('ems_internal', chartGroup)} L/min`,
					data: chartGroup.internalFuelData,
					yAxisID: 'fuel',
					borderColor: '#38bdf8',
					backgroundColor: 'rgba(56, 189, 248, 0.14)',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			if (chartGroup.hasExternal && canViewFuelEmsExternal) {
				datasets.push({
					label: `${getDailyFuelSourceLabel('ems_external', chartGroup)} L/min`,
					data: chartGroup.externalFuelData,
					yAxisID: 'fuel',
					borderColor: '#f59e0b',
					backgroundColor: 'rgba(245, 158, 11, 0.14)',
					borderWidth: 2,
					tension: 0.25,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			if (chartGroup.hasEngineMaker && canViewFuelEngineMaker) {
				datasets.push({
					label: `${getDailyFuelSourceLabel('engine_maker', chartGroup)} L/min`,
					data: chartGroup.engineMakerFuelData,
					yAxisID: 'fuel',
					borderColor: '#ec4899',
					backgroundColor: 'rgba(236, 72, 153, 0.14)',
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

									if (context.dataset.yAxisID === 'speed') {
										return `${label}: ${formatNumber(value, 2)} kn`;
									}

									return `${label}: ${formatNumber(value, 2)} L/min`;
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
								text: 'Fuel L/min'
							},
							grid: {
								drawOnChartArea: false
							},
							ticks: {
								font: {
									size: 10
								}
							}
						},
						speed: {
							type: 'linear',
							position: 'right',
							min: 0,
							beginAtZero: true,
							title: {
								display: true,
								text: 'Speed kn'
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

	function fodLineChart(node, group) {
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

			const datasets = [];

			if (chartGroup.hasSingle) {
				datasets.push({
					label: 'FOD',
					data: chartGroup.singleData,
					borderColor: '#facc15',
					backgroundColor: 'rgba(250, 204, 21, 0.18)',
					borderWidth: 2,
					tension: 0.28,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			if (chartGroup.hasPort) {
				datasets.push({
					label: 'FOD Port',
					data: chartGroup.portData,
					borderColor: '#38bdf8',
					backgroundColor: 'rgba(56, 189, 248, 0.16)',
					borderWidth: 2,
					tension: 0.28,
					pointRadius: 0,
					pointHoverRadius: 4
				});
			}

			if (chartGroup.hasStbd) {
				datasets.push({
					label: 'FOD STBD',
					data: chartGroup.stbdData,
					borderColor: '#fb923c',
					backgroundColor: 'rgba(251, 146, 60, 0.16)',
					borderWidth: 2,
					tension: 0.28,
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

									return `${label}: ${formatNumber(value, 2)} L`;
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
									backgroundColor: 'rgba(250, 204, 21, 0.12)',
									borderColor: 'rgba(250, 204, 21, 0.45)',
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
						y: {
							type: 'linear',
							position: 'left',
							min: 0,
							beginAtZero: true,
							title: {
								display: true,
								text: 'FOD L'
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
				zones: [],
				assets: []
			};
		}

		return {
			points: Array.isArray(value?.points) ? value.points : [],
			zones: Array.isArray(value?.zones) ? value.zones : [],
			assets: Array.isArray(value?.assets) ? value.assets : []
		};
	}

	/**
	 * @param {any} asset
	 * @returns {string[]}
	 */
	function getAssetIdentityKeys(asset = {}) {
		return [
			asset?.id,
			asset?.assetId,
			asset?.asset_id,
			asset?.thingsboardId,
			asset?.thingsboardName,
			asset?.assetName,
			asset?.name,
			asset?.raw?.id,
			asset?.raw?.assetId,
			asset?.raw?.asset_id,
			asset?.raw?.thingsboardName
		]
			.filter((value) => value !== null && value !== undefined && value !== '')
			.map((value) => String(value).trim().toLowerCase());
	}

	/**
	 * @param {any[]} assets
	 * @param {any} user
	 * @returns {any[]}
	 */
	function getPermittedMapAssets(assets = [], user = null) {
		const assetAccess = user?.assetAccess || {};
		const mode = String(assetAccess?.mode || '').toLowerCase();
		const rows = Array.isArray(assets) ? assets : [];

		if (mode === 'all') {
			return sortByAlpha(rows, getTripAssetSortName, getTripAssetSortType);
		}

		const details = Array.isArray(assetAccess?.details)
			? assetAccess.details
			: Array.isArray(assetAccess?.assets)
				? assetAccess.assets
				: [];

		if (mode !== 'selected' || !details.length) return [];

		const permittedKeys = new Set(details.flatMap(getAssetIdentityKeys));
		const matchedSourceKeys = new Set();

		const matchedRows = rows.filter((asset) => {
			const keys = getAssetIdentityKeys(asset);
			const allowed = keys.some((key) => permittedKeys.has(key));

			if (allowed) {
				keys.forEach((key) => matchedSourceKeys.add(key));
			}

			return allowed;
		});

		const fallbackDetails = details.filter((detail) => {
			const keys = getAssetIdentityKeys(detail);
			return keys.length && !keys.some((key) => matchedSourceKeys.has(key));
		});

		return sortByAlpha(
			[...matchedRows, ...fallbackDetails],
			getTripAssetSortName,
			getTripAssetSortType
		);
	}

	function getTripAssetSortName(asset = {}) {
		return (
			asset?.assetName ||
			asset?.asset_name ||
			asset?.thingsboardName ||
			asset?.name ||
			asset?.assetId ||
			''
		);
	}

	function getTripAssetSortType(asset = {}) {
		return asset?.assetType || asset?.asset_type || asset?.type || '';
	}

	/**
	 * @param {any} asset
	 * @returns {any | null}
	 */
	function normalizeTripAsset(asset = {}) {
		if (isZoneAsset(asset)) return null;

		const latitude = Number(asset?.latitude ?? asset?.lat);
		const longitude = Number(asset?.longitude ?? asset?.lng ?? asset?.lon);

		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
		if (latitude === 0 && longitude === 0) return null;

		const id = asset?.id ?? asset?.assetId ?? asset?.asset_id ?? `${latitude},${longitude}`;
		const assetName =
			asset?.assetName || asset?.name || asset?.thingsboardName || asset?.assetId || `Asset ${id}`;

		return {
			...asset,
			id,
			assetId: asset?.assetId ?? asset?.asset_id ?? id,
			assetName,
			name: assetName,
			assetType: getAssetTypeValue(asset),
			latitude,
			longitude
		};
	}

	/**
	 * @param {any[]} assets
	 * @returns {{ key: string; label: string; icon: string }[]}
	 */
	function getTripAssetLegendTypes(assets = []) {
		const typeMap = new Map();

		(Array.isArray(assets) ? assets : []).forEach((asset) => {
			const key =
				String(getAssetTypeValue(asset) || 'asset')
					.trim()
					.toLowerCase() || 'asset';

			if (typeMap.has(key)) return;

			typeMap.set(key, {
				key,
				label: getAssetTypeLabel(asset),
				icon: getAssetIconUrl(asset)
			});
		});

		return [...typeMap.values()];
	}

	function tripLeafletMap(node, payload = { points: [], zones: [] }) {
		/** @type {any} */
		let map = null;
		/** @type {any} */
		let leaflet = null;
		/** @type {any} */
		let routeLayer = null;
		/** @type {any} */
		let startMarker = null;
		/** @type {any} */
		let endMarker = null;
		/** @type {any} */
		let zoneLayer = null;
		/** @type {any} */
		let assetLayer = null;
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

		/** @param {any} asset */
		function createAssetDivIcon(asset) {
			if (!leaflet) return null;

			const typeLabel = getAssetTypeLabel(asset);

			return leaflet.divIcon({
				className: `trip-asset-marker asset-type-${String(typeLabel).toLowerCase()}`,
				html: `
					<img
						src="${getAssetIconUrl(asset)}"
						alt="${escapeHtml(typeLabel)} asset"
						title="${escapeHtml(asset.assetName || asset.name || typeLabel)}"
					/>
				`,
				iconSize: [30, 30],
				iconAnchor: [15, 15],
				popupAnchor: [0, -16]
			});
		}

		/** @param {any} asset */
		function createAssetPopupHtml(asset) {
			const typeLabel = getAssetTypeLabel(asset);
			const coordinatePair = formatCoordinatePair(asset.latitude, asset.longitude);

			return `
				<div class="trip-asset-popup">
					<div class="trip-asset-popup-head">
						<img src="${getAssetIconUrl(asset)}" alt="" />
						<div>
							<span>${escapeHtml(typeLabel)}</span>
							<strong>${escapeHtml(asset.assetName || asset.name || 'Asset')}</strong>
						</div>
					</div>
					<div class="trip-map-popup-row">
						<span>Coordinate</span>
						${createCopyableCoordinateHtml(coordinatePair, 'asset coordinate')}
					</div>
				</div>
			`;
		}

		async function render(nextPayload = { points: [], zones: [] }) {
			if (disposed) return;

			const {
				points: nextPoints,
				zones: nextZones,
				assets: nextAssets
			} = getTripMapPayload(nextPayload);
			const validPoints = Array.isArray(nextPoints) ? nextPoints : [];
			const validAssets = Array.isArray(nextAssets) ? nextAssets : [];

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

				addMapTileLayer(leaflet, map);
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

			if (assetLayer) {
				assetLayer.clearLayers();
				assetLayer.remove();
				assetLayer = null;
			}

			assetLayer = leaflet.layerGroup().addTo(map);

			validAssets.forEach((asset) => {
				leaflet
					.marker([asset.latitude, asset.longitude], {
						icon: createAssetDivIcon(asset),
						zIndexOffset: 260
					})
					.bindPopup(createAssetPopupHtml(asset), {
						closeButton: true,
						autoPan: true,
						maxWidth: 260,
						className: 'trip-leaflet-popup trip-asset-leaflet-popup'
					})
					.addTo(assetLayer);
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
			const startCoordinatePair = formatCoordinatePair(startPoint.lat, startPoint.lng);
			const endCoordinatePair = formatCoordinatePair(endPoint.lat, endPoint.lng);

			startMarker = leaflet
				.marker([startPoint.lat, startPoint.lng], {
					icon: createTripDivIcon('S', 'start')
				})
				.bindPopup(
					`
					<div class="trip-map-popup">
						<strong class="trip-map-popup-title">Start Point</strong>
						<div class="trip-map-popup-row"><span>Time</span><b>${startPoint.time}</b></div>
						<div class="trip-map-popup-row"><span>Coordinate</span>${createCopyableCoordinateHtml(startCoordinatePair, 'start coordinate')}</div>
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
						<div class="trip-map-popup-row"><span>Coordinate</span>${createCopyableCoordinateHtml(endCoordinatePair, 'end coordinate')}</div>
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

				if (assetLayer) {
					assetLayer.clearLayers();
					assetLayer.remove();
					assetLayer = null;
				}

				if (map) {
					map.remove();
					map = null;
				}
			}
		};
	}

	let tripMapPoints = $derived(getTripMapPoints(normalizedReport));
	let permittedMapAssets = $derived(getPermittedMapAssets(mapAssetRows, currentUser));
	let mapZones = $derived(normalizeMapZonesFromAssets(permittedMapAssets));
	let tripMapAssets = $derived(
		sortByAlpha(
			permittedMapAssets.map(normalizeTripAsset).filter(Boolean),
			getTripAssetSortName,
			getTripAssetSortType
		)
	);
	let tripAssetLegendTypes = $derived(getTripAssetLegendTypes(tripMapAssets));

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
		return row?.lh_ems ?? row?.lhEms ?? row?.lh_maker ?? row?.lhMaker ?? row?.lh;
	}

	function getConsumptionPerRangeRows(data) {
		return pickArray(
			data?.consumption_per_range?.detail,
			data?.consumption_per_range?.details,
			data?.consumption_per_range?.items,
			data?.consumptionPerRange?.detail,
			data?.consumptionPerRange?.details,
			data?.consumptionPerRange?.items
		);
	}

	function getRpmFuelValue(row, sourceKey) {
		if (sourceKey === 'ems_internal') {
			return (
				row?.fuel_ems_internal ??
				row?.fuelEmsInternal ??
				row?.fuel_estimated_l ??
				row?.fuelEstimatedL ??
				row?.fuel ??
				row?.fuelUsed
			);
		}

		if (sourceKey === 'ems_external') {
			return (
				row?.fuel_ems_external ??
				row?.fuelEmsExternal ??
				row?.fuel_estimated_l ??
				row?.fuelEstimatedL ??
				row?.fuel ??
				row?.fuelUsed
			);
		}

		if (sourceKey === 'engine_maker') {
			return (
				row?.fuel_engine_maker ??
				row?.fuelEngineMaker ??
				row?.fuel_maker ??
				row?.fuelMaker ??
				row?.fuel_estimated_l ??
				row?.fuelEstimatedL ??
				row?.fuel ??
				row?.fuelUsed
			);
		}

		if (sourceKey === 'fms') {
			return row?.fuel_fms ?? row?.fuelFms ?? row?.fms;
		}

		if (sourceKey === 'ecu') {
			return row?.fuel_ecu ?? row?.fuelEcu ?? row?.ecu;
		}

		return row?.fuel_estimated_l ?? row?.fuelEstimatedL ?? row?.fuel ?? row?.fuelUsed;
	}

	function hasPresentRpmFuelValue(row, sourceKey) {
		const value = getRpmFuelValue(row, sourceKey);

		if (value === undefined || value === null || value === '' || value === '-') return false;

		const number = Number(value);
		return Number.isFinite(number);
	}

	function getRpmSourceLabel(sourceKey) {
		if (sourceKey === 'ems_internal') return 'VMS';
		if (sourceKey === 'ems_external') return 'EMS';
		if (sourceKey === 'engine_maker') return 'Engine Maker';
		if (sourceKey === 'fms') return 'FMS';
		if (sourceKey === 'ecu') return 'ECU';

		return sourceKey || '-';
	}

	function getRpmCurveTableLabel(table) {
		const sourceKeys = Array.isArray(table?.sourceKeys) ? table.sourceKeys : [];

		if (sourceKeys.length === 2 && sourceKeys.includes('fms') && sourceKeys.includes('ecu')) {
			return 'FMS / ECU';
		}

		if (sourceKeys.length === 1) return getRpmSourceLabel(sourceKeys[0]);

		if (table?.curveType === 'ems_internal') return 'VMS';
		if (table?.curveType === 'ems_external') return 'EMS';
		if (table?.curveType === 'engine_maker') return 'Engine Maker';

		return table?.title || '-';
	}

	function formatRpmRangeLabel(value) {
		if (value === undefined || value === null || value === '') return '-';

		const text = String(value).trim();

		if (!text || text === '-' || text === '—') return text || '-';

		return text.replace(/-?\d+(?:[.,]\d+)?/g, (match) => {
			const number = Number(match.replace(',', '.'));
			return Number.isFinite(number) ? String(Math.round(number)) : match;
		});
	}

	function formatRpmMatrixCell(row, metric, engineRows = []) {
		if (!row) return '-';
		if (metric.key === 'runtime') return formatRpmRuntime(row);
		if (metric.key === 'runtime_percent') {
			const percent = getPeriodicalRpmRuntimePercent(row, engineRows);
			return percent === null ? '-' : `${formatNumber(percent, 1)}%`;
		}
		const value = metric.key === 'lh' ? getRpmLhValue(row) : getRpmFuelValue(row, metric.sourceKey);
		if (
			(typeof value !== 'number' && typeof value !== 'string') ||
			String(value).trim() === '' ||
			!Number.isFinite(Number(value))
		)
			return '-';
		return metric.key === 'lh' ? formatNumber(value, 2) : formatLiter(value);
	}

	function buildRpmCurveTables(data) {
		const consumptionRows = addRpmCurveSource(getConsumptionPerRangeRows(data), 'fms_ecu');
		const hasFmsRows = consumptionRows.some((row) => hasPresentRpmFuelValue(row, 'fms'));
		const hasEcuRows = consumptionRows.some((row) => hasPresentRpmFuelValue(row, 'ecu'));
		const consumptionSourceKeys = [...(hasFmsRows ? ['fms'] : []), ...(hasEcuRows ? ['ecu'] : [])];

		const tables = [
			{
				key: 'ems_internal',
				curveType: 'ems_internal',
				title: 'VMS',
				grandTotal:
					(data?.rpm_ranges_ems_internal || data?.rpmRangesEmsInternal)?.grand_total ??
					(data?.rpm_ranges_ems_internal || data?.rpmRangesEmsInternal)?.grandTotal,
				sourceKeys: ['ems_internal'],
				showLh: true,
				rows: addRpmCurveSource(
					data?.rpm_ranges_ems_internal?.details || data?.rpmRangesEmsInternal?.details,
					'ems_internal'
				)
			},
			{
				key: 'ems_external',
				curveType: 'ems_external',
				title: 'EMS',
				grandTotal:
					(data?.rpm_ranges_ems_external || data?.rpmRangesEmsExternal)?.grand_total ??
					(data?.rpm_ranges_ems_external || data?.rpmRangesEmsExternal)?.grandTotal,
				sourceKeys: ['ems_external'],
				showLh: true,
				rows: addRpmCurveSource(
					data?.rpm_ranges_ems_external?.details || data?.rpmRangesEmsExternal?.details,
					'ems_external'
				)
			},
			{
				key: 'engine_maker',
				curveType: 'engine_maker',
				title: 'Engine Maker',
				grandTotal:
					(data?.rpm_ranges_maker || data?.rpmRangesMaker)?.grand_total ??
					(data?.rpm_ranges_maker || data?.rpmRangesMaker)?.grandTotal,
				sourceKeys: ['engine_maker'],
				showLh: true,
				rows: addRpmCurveSource(
					data?.rpm_ranges_maker?.details || data?.rpmRangesMaker?.details,
					'engine_maker'
				)
			}
		];

		if (consumptionSourceKeys.length) {
			tables.push({
				key: 'fms_ecu',
				curveType: 'fms_ecu',
				grandTotal:
					(data?.consumption_per_range || data?.consumptionPerRange)?.grand_total ??
					(data?.consumption_per_range || data?.consumptionPerRange)?.grandTotal,
				title: consumptionSourceKeys.map(getRpmSourceLabel).join(' / '),
				sourceKeys: consumptionSourceKeys,
				showLh: false,
				rows: consumptionRows
			});
		}

		return tables
			.map((table) => ({
				...table,
				rows: table.rows.filter(isConfiguredRpmRow)
			}))
			.filter((table) => table.rows.length);
	}

	function parseRuntimeHours(value) {
		if (value === undefined || value === null || value === '') return 0;

		const directNumber = Number(value);
		if (Number.isFinite(directNumber)) return directNumber;

		const text = String(value).trim();
		const clockMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

		if (clockMatch) {
			const hours = Number(clockMatch[1]);
			const minutes = Number(clockMatch[2]);
			const seconds = Number(clockMatch[3] || 0);

			return hours + minutes / 60 + seconds / 3600;
		}

		const partsMatch = text.match(
			/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/i
		);

		if (partsMatch && (partsMatch[1] || partsMatch[2] || partsMatch[3])) {
			const hours = Number(partsMatch[1] || 0);
			const minutes = Number(partsMatch[2] || 0);
			const seconds = Number(partsMatch[3] || 0);

			return hours + minutes / 60 + seconds / 3600;
		}

		return 0;
	}

	function getRpmRuntimeHours(row) {
		const runtimeHours = parseRuntimeHours(row?.runtime_hours ?? row?.runtimeHours);

		if (Number.isFinite(runtimeHours) && runtimeHours > 0) return runtimeHours;

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

		if (sourceKey === 'fms' || sourceKey === 'ecu') {
			const rows = getConsumptionPerRangeRows(normalizedReport);

			return (
				Array.isArray(rows) &&
				rows.some((row) => hasRuntimeValue(row) && hasPresentRpmFuelValue(row, sourceKey))
			);
		}

		return false;
	}

	function hasFuelSourceInRpmChartRaw(sourceKey) {
		const chart = normalizedReport?.rpm_vs_fuel_chart || normalizedReport?.rpmVsFuelChart || {};

		if (!chart || typeof chart !== 'object') return false;

		return Object.values(chart).some((rows) => {
			if (!Array.isArray(rows)) return false;

			return rows.some((row) => {
				return hasPositiveFuelValue(getChartFuelValue(row, sourceKey));
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
	let autoTimezoneLabel = $derived(
		getAutoTimezoneLabelFromSources(normalizedReport, reportData, $selectedVesselInfo)
	);

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
		),
		...addRpmCurveSource(getConsumptionPerRangeRows(normalizedReport), 'fms_ecu')
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

	let hourlyAverageSpeedRows = $derived(
		Array.isArray(normalizedReport?.hourly_average_speed)
			? normalizedReport.hourly_average_speed
					.filter((row) => row && typeof row === 'object')
					.map((row) => ({
						hour: row.hour || '-',
						averageSpeed: toNullableChartNumber(row.avg_speed)
					}))
			: null
	);

	let travelDistance = $derived(
		normalizedReport?.travel_distance || normalizedReport?.travelDistance || {}
	);

	let dailySummary = $derived(normalizedReport?.summary || {});

	let summaryTotalOperationHours = $derived(
		dailySummary?.total_operation_hours ?? dailySummary?.totalOperationHours ?? '-'
	);

	let summaryTopSpeed = $derived(
		dailySummary?.top_speed ??
			dailySummary?.topSpeed ??
			speedSummary?.top_speed ??
			speedSummary?.topSpeed ??
			speedSummary?.maxSpeed ??
			null
	);

	let summaryAverageSpeed = $derived(
		dailySummary?.average_speed ??
			dailySummary?.averageSpeed ??
			speedSummary?.avg_running_speed ??
			speedSummary?.averageSpeed ??
			speedSummary?.avgSpeed ??
			null
	);

	let summaryTotalDistanceNm = $derived(
		dailySummary?.total_distance_nm ??
			dailySummary?.totalDistanceNm ??
			travelDistance?.total_distance_nm ??
			travelDistance?.totalDistanceNm ??
			null
	);

	let summaryOutsideDistanceNm = $derived(
		dailySummary?.total_distance_outside_nm ??
			dailySummary?.totalDistanceOutsideNm ??
			travelDistance?.outside_safety_zone_distance_nm ??
			travelDistance?.outsideSafetyZoneDistanceNm ??
			null
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

	let rawClutchTimelineGroups = $derived(
		getStatusHistoryGroups(
			normalizedReport?.clutch_in_timeline || normalizedReport?.clutchInTimeline || {}
		)
	);

	let clutchTimelineGroups = $derived(
		buildStatusTimelineGroups(
			sortByConfiguredEngines(
				rawClutchTimelineGroups.filter((group) => isConfiguredEngine(group.engineName)),
				(group) => group.engineName
			)
		)
	);

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

	let canAccessDailyReport = $derived(hasPermission('access_daily_report'));

	let canViewEngineRuntimeTable = $derived(hasPermission('view_engine_runtime_table'));

	let canViewEngineEventStatusHistory = $derived(hasPermission('view_engine_event_status_history'));

	let canViewEngineOnOffChart = $derived(hasPermission('view_engine_on_off_chart'));

	let canViewClutchInChart = $derived(hasPermission('view_clutch_in_chart'));

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

	let visibleRpmCurveTables = $derived(
		rpmCurveTables
			.map((table) => ({
				...table,
				sourceKeys: (Array.isArray(table.sourceKeys) ? table.sourceKeys : []).filter(
					canViewRpmFuelSource
				)
			}))
			.filter((table) => table.sourceKeys.length && canViewRpmCurveTable(table))
	);

	let visibleRpmRows = $derived(visibleRpmCurveTables.flatMap((table) => table.rows || []));

	let selectedRpmCurveTable = $derived(
		visibleRpmCurveTables.find((table) => table.key === selectedRpmRuntimeFuelTableKey) ||
			visibleRpmCurveTables[0] ||
			null
	);

	let selectedRpmMatrices = $derived(
		buildPeriodicalRpmMatrices(
			(selectedRpmCurveTable?.rows || []).map((row) => ({
				...row,
				engine_name: getRowEngineName(row)
			}))
		)
	);
	let rpmMatrixMetrics = $derived([
		{ key: 'runtime', label: 'Runtime' },
		{ key: 'runtime_percent', label: 'Runtime %' },
		{ key: 'lh', label: 'L/H' },
		...(selectedRpmCurveTable?.sourceKeys || []).map((sourceKey) => ({
			key: `fuel_${sourceKey}`,
			sourceKey,
			label:
				selectedRpmCurveTable.sourceKeys.length === 1
					? 'Fuel (L)'
					: `${getRpmSourceLabel(sourceKey)} Fuel (L)`
		}))
	]);

	$effect(() => {
		const keys = visibleRpmCurveTables.map((table) => table.key);

		if (!keys.length) {
			selectedRpmRuntimeFuelTableKey = '';
			return;
		}

		if (!keys.includes(selectedRpmRuntimeFuelTableKey)) {
			selectedRpmRuntimeFuelTableKey = keys[0];
		}
	});

	let canViewRpmRangeRuntimeFuel = $derived(hasPermission('view_rpm_ranges_runtime_fuel_table'));

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

	let priorityFuelSourceForDistance = $derived(getPriorityFuelSourceForDistance(fuelSummary));

	let literPerNauticalMile = $derived(priorityFuelSourceForDistance.literPerNm);

	let visibleFuelSourceForDistance = $derived(priorityFuelSourceForDistance.label);

	let rpmFuelCurveChartGroups = $derived(buildRpmFuelCurveChartGroups(normalizedReport));

	let fodChartGroup = $derived(buildFodChartGroup(normalizedReport));

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

	let dailySummaryCards = $derived([
		...(canViewEngineRuntimeTable
			? [
					{
						key: 'operation-hours',
						label: 'Total Operation Hours',
						value: summaryTotalOperationHours
					}
				]
			: []),
		...(canViewSpeedStatsTable
			? [
					{
						key: 'top-speed',
						label: 'Top Speed',
						value:
							summaryTopSpeed !== null && summaryTopSpeed !== undefined
								? `${formatNumber(summaryTopSpeed, 2)} knot`
								: '-'
					},
					{
						key: 'average-speed',
						label: 'Average Speed',
						value:
							summaryAverageSpeed !== null && summaryAverageSpeed !== undefined
								? `${formatNumber(summaryAverageSpeed, 2)} knot`
								: '-'
					}
				]
			: []),
		...(canViewLiterPerNauticalMileTable && canShowFuelEcu
			? [{ key: 'ecu-nm', label: 'ECU Fuel per NM', value: formatLiterPerNm(ecuLiterPerNm) }]
			: []),
		...(canViewLiterPerNauticalMileTable && canShowFuelFms
			? [{ key: 'fms-nm', label: 'FMS Fuel per NM', value: formatLiterPerNm(fmsLiterPerNm) }]
			: []),
		...(canViewLiterPerNauticalMileTable && canShowFuelEmsInternal
			? [
					{
						key: 'ems-internal-nm',
						label: `${getDailyFuelSourceLabel('ems_internal')} Fuel per NM`,
						value: formatLiterPerNm(emsInternalLiterPerNm)
					}
				]
			: []),
		...(canViewLiterPerNauticalMileTable && canShowFuelEmsExternal
			? [
					{
						key: 'ems-external-nm',
						label: `${getDailyFuelSourceLabel('ems_external')} Fuel per NM`,
						value: formatLiterPerNm(emsExternalLiterPerNm)
					}
				]
			: []),
		...(canViewLiterPerNauticalMileTable && canShowFuelEngineMaker
			? [
					{
						key: 'engine-maker-nm',
						label: 'Engine Maker Fuel per NM',
						value: formatLiterPerNm(engineMakerLiterPerNm)
					}
				]
			: [])
	]);

	let dailySpeedCards = $derived(
		canViewTravelDistanceTable
			? [
					{
						key: 'total-distance',
						label: 'Total Distance',
						value:
							summaryTotalDistanceNm !== null && summaryTotalDistanceNm !== undefined
								? `${formatNumber(summaryTotalDistanceNm, 3)} NM`
								: '-'
					},
					{
						key: 'outside-zone',
						label: 'Outside Safety Zone',
						value:
							summaryOutsideDistanceNm !== null && summaryOutsideDistanceNm !== undefined
								? `${formatNumber(summaryOutsideDistanceNm, 3)} NM`
								: '-'
					}
				]
			: []
	);

	let tripSummaryView = $derived({
		...dailyTripSummary,
		totalDistanceLabel: formatNumber(dailyTripSummary.totalDistanceNm, 3),
		outsideDistanceLabel: formatNumber(dailyTripSummary.outsideDistanceNm, 3)
	});

	let tripStartCoordinate = $derived(
		formatCoordinatePair(dailyTripSummary.startLat, dailyTripSummary.startLng)
	);
	let tripEndCoordinate = $derived(
		formatCoordinatePair(dailyTripSummary.endLat, dailyTripSummary.endLng)
	);
	let tripLiterPerNmLabel = $derived(
		literPerNauticalMile === null ? null : formatNumber(literPerNauticalMile, 2)
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

	function getDailyFuelSourceLabel(sourceKey, chartGroup = null) {
		const hasInternal = chartGroup
			? chartGroup.hasInternal && canViewFuelEmsInternal
			: canShowFuelEmsInternal;
		const hasExternal = chartGroup
			? chartGroup.hasExternal && canViewFuelEmsExternal
			: canShowFuelEmsExternal;

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
			hasLoadedDateRange = false;
			return;
		}

		if (!reportDate) {
			hasLoadedDateRange = false;
			return;
		}

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
				getEngineCurvesForVessel($selectedVesselId),
				mapAssetRows.length ? Promise.resolve(mapAssetRows) : loadMapAssets()
			]);

			reportData = result;
			engineCurveData = curveResult;
			hasLoadedDateRange = true;

			const payload = result?.data || result || {};
			updateTopbarStatus(payload);

			console.log('[DAILY_REPORT_DATA]', result);
			console.log('[DAILY_ENGINE_CURVES]', curveResult);
		} catch (err) {
			console.error('[DAILY_REPORT_ERROR]', err);
			error = err?.message || 'Failed to load daily report.';
			reportData = null;
			engineCurveData = null;
			hasLoadedDateRange = false;
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

	async function loadMapAssets() {
		try {
			const assets = await getFleetAssets();
			mapAssetRows = sortByAlpha(
				Array.isArray(assets) ? assets : [],
				getTripAssetSortName,
				getTripAssetSortType
			);
		} catch (err) {
			console.error('[DAILY_MAP_ASSETS_ERROR]', err);
			mapAssetRows = [];
		}
	}

	onMount(() => {
		reportDate = todayDate();
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
</script>

<section class="daily-page">
	<DailyReportHeader
		{vesselName}
		bind:reportDate
		bind:timezoneMode
		bind:timezoneOffset
		{autoTimezoneLabel}
		{loading}
		{exporting}
		{exportingPdf}
		canExport={!shouldShowDateRangeOverlay}
		onLoad={loadDailyReport}
		onExportExcel={handleExportExcel}
		onExportPdf={handleExportPdf}
		onFilterChange={markDateFilterDirty}
	/>

	<div class="load-required-area" class:is-locked={shouldShowDateRangeOverlay}>
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
			<DailyReportSummary cards={dailySummaryCards} speedCards={dailySpeedCards} />

			{#if canViewTravelDistanceTable}
				<DailyReportTrip
					summary={tripSummaryView}
					startCoordinate={tripStartCoordinate}
					endCoordinate={tripEndCoordinate}
					literPerNauticalMile={tripLiterPerNmLabel}
					fuelSourceLabel={visibleFuelSourceForDistance}
					canViewFuelPerNm={canViewLiterPerNauticalMileTable}
					canViewMap={canViewDailyPathMap}
					{active}
					mapAction={tripLeafletMap}
					mapPoints={tripMapPoints}
					{mapZones}
					mapAssets={tripMapAssets}
					legendTypes={tripAssetLegendTypes}
				/>
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
							<h2>Engine Activity Timeline</h2>
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

									<div
										class="compact-timeline-area"
										class:engine-timeline-area={canViewClutchInChart &&
											hasClutchInTimelineData(
												getTimelineGroupByEngine(clutchTimelineGroups, group.engineName)
											)}
									>
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

									{#each [getTimelineGroupByEngine(clutchTimelineGroups, group.engineName)] as clutchGroup}
										{#if canViewClutchInChart && hasClutchInTimelineData(clutchGroup)}
											<div class="compact-timeline-area clutch-timeline-area">
												<div class="compact-transition-labels">
													{#each clutchGroup.transitionLabels as label}
														<span
															class="compact-transition-label clutch-transition-label"
															style={`left: ${label.leftPercent}%;`}
															title={`${label.time} | ${formatClutchStatus(label.status)}`}
														>
															{label.time}
														</span>
													{/each}
												</div>

												<div class="compact-timeline clutch-timeline">
													{#each clutchGroup.segments as segment}
														<div
															class="compact-segment clutch-segment"
															class:on-segment={isOnStatus(segment.status)}
															class:off-segment={isOffStatus(segment.status)}
															style={`width: ${segment.widthPercent}%;`}
															title={`Clutch ${formatClutchStatus(segment.status)} | ${segment.start} - ${segment.end} | ${segment.duration}`}
														>
															{#if segment.widthPercent >= 12}
																<span>{formatClutchStatus(segment.status)}</span>
															{/if}
														</div>
													{/each}
												</div>

												<div class="compact-axis">
													<span>{clutchGroup.segments[0]?.start || '-'}</span>
													<span
														>{clutchGroup.segments[clutchGroup.segments.length - 1]?.end ||
															'-'}</span
													>
												</div>
											</div>
										{/if}
									{/each}
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-box">Engine Activity timeline is not available yet.</div>
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
											<td
												>{formatPlainLiter(
													fuelSummary?.ems_internal ?? fuelSummary?.emsInternal
												)}</td
											>
										{/if}

										{#if canShowFuelEmsExternal}
											<td
												>{formatPlainLiter(
													fuelSummary?.ems_external ?? fuelSummary?.emsExternal
												)}</td
											>
										{/if}

										{#if canShowFuelEngineMaker}
											<td
												>{formatPlainLiter(
													fuelSummary?.engine_maker ?? fuelSummary?.engineMaker
												)}</td
											>
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

			{#if canViewSpeedStatsTable && hourlyAverageSpeedRows}
				<section class="table-section hourly-speed-section" aria-labelledby="hourly-speed-title">
					<div class="section-header">
						<div>
							<span class="section-kicker">Speed</span>
							<h2 id="hourly-speed-title">Hourly Average Speed</h2>
							<p>Average speed per hour (knots)</p>
						</div>
						{#if normalizedReport.timezone}
							<strong>{normalizedReport.timezone}</strong>
						{/if}
					</div>

					{#if hourlyAverageSpeedRows.length}
						<div class="table-wrapper">
							<table class="hourly-speed-table" aria-labelledby="hourly-speed-title">
								<thead>
									<tr>
										<th scope="col">Time Range</th>
										<th scope="col">Average Speed (kn)</th>
									</tr>
								</thead>
								<tbody>
									{#each hourlyAverageSpeedRows as row}
										<tr>
											<td>{row.hour}</td>
											<td>
												{#if row.averageSpeed !== null}
													{formatNumber(row.averageSpeed, 2)}
												{:else}
													<span aria-label="No speed data">-</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="empty-box">Hourly average speed data is not available for this date.</div>
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

						<div class="rpm-curve-source-control">
							<label for="rpm-runtime-fuel-source">Table Source</label>
							<select id="rpm-runtime-fuel-source" bind:value={selectedRpmRuntimeFuelTableKey}>
								{#each visibleRpmCurveTables as table}
									<option value={table.key}>{getRpmCurveTableLabel(table)}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if selectedRpmCurveTable}
						<div class="rpm-curve-table-list">
							{#each selectedRpmMatrices as matrix (matrix.key)}
								<article class="rpm-curve-table-card">
									<div class="rpm-curve-table-header">
										<div>
											<span>{getRpmCurveTableLabel(selectedRpmCurveTable)}</span>
											<strong>{matrix.label}</strong>
										</div>

										<div class="rpm-curve-table-count">
											{matrix.engines.length} engines
										</div>
									</div>

									<!-- Scrollable comparison is keyboard accessible. -->
									<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
									<div
										class="table-wrapper rpm-matrix-wrap"
										role="region"
										aria-label={`${matrix.label} RPM range comparison`}
										tabindex="0"
									>
										<table class="rpm-matrix">
											<thead>
												<tr>
													<th rowspan="2" scope="col" class="rpm-range-column">RPM Range</th>
													{#each rpmMatrixMetrics as metric (metric.key)}
														<th
															colspan={matrix.engines.length}
															scope="colgroup"
															class="rpm-metric-start">{metric.label}</th
														>
													{/each}
												</tr>
												<tr>
													{#each rpmMatrixMetrics as metric (metric.key)}
														{#each matrix.engines as engine, engineIndex (engine.key)}
															<th
																scope="col"
																title={engine.engineName}
																class:rpm-metric-start={engineIndex === 0}>{engine.label}</th
															>
														{/each}
													{/each}
												</tr>
											</thead>

											<tbody>
												{#each matrix.rows as row (row.key)}
													<tr class:total-row={row.isTotal}>
														<th scope="row" class="rpm-range-column"
															>{row.isTotal ? 'Total' : formatRpmRangeLabel(row.label)}</th
														>
														{#each rpmMatrixMetrics as metric (metric.key)}
															{#if row.isTotal && metric.key === 'lh'}
																<td
																	colspan={matrix.engines.length}
																	class="rpm-total-spacer rpm-metric-start"
																	aria-label="Not applicable"
																></td>
															{:else}
																{#each matrix.engines as engine, engineIndex (engine.key)}
																	<td class:rpm-metric-start={engineIndex === 0}
																		>{formatRpmMatrixCell(
																			row.cells[engineIndex],
																			metric,
																			engine.rows
																		)}</td
																	>
																{/each}
															{/if}
														{/each}
													</tr>
												{:else}
													<tr>
														<td colspan={1 + rpmMatrixMetrics.length * matrix.engines.length}
															>All RPM ranges have zero runtime.</td
														>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								</article>
							{/each}
						</div>
						{#if selectedRpmCurveTable.grandTotal && Object.keys(selectedRpmCurveTable.grandTotal).length}
							<div class="table-wrapper rpm-grand-total">
								<table>
									<thead>
										<tr>
											<th scope="col">Summary</th>
											<th scope="col">Runtime</th>
											{#each selectedRpmCurveTable.sourceKeys as sourceKey}
												<th scope="col">{getRpmSourceLabel(sourceKey)} Fuel</th>
											{/each}
										</tr>
									</thead>
									<tbody>
										<tr class="total-row">
											<td>Grand Total</td>
											<td
												>{formatRpmMatrixCell(selectedRpmCurveTable.grandTotal, {
													key: 'runtime'
												})}</td
											>
											{#each selectedRpmCurveTable.sourceKeys as sourceKey}
												<td
													>{formatRpmMatrixCell(selectedRpmCurveTable.grandTotal, {
														key: `fuel_${sourceKey}`,
														sourceKey
													})}</td
												>
											{/each}
										</tr>
									</tbody>
								</table>
							</div>
						{/if}
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
											{#if group.hasSpeed}
												<span>Speed</span>
											{/if}

											{#if group.hasEcu && canViewFuelEcu}
												<span>{getDailyFuelSourceLabel('ecu', group)}</span>
											{/if}

											{#if group.hasFms && canViewFuelFms}
												<span>{getDailyFuelSourceLabel('fms', group)}</span>
											{/if}

											{#if group.hasInternal && canViewFuelEmsInternal}
												<span>{getDailyFuelSourceLabel('ems_internal', group)}</span>
											{/if}

											{#if group.hasExternal && canViewFuelEmsExternal}
												<span>{getDailyFuelSourceLabel('ems_external', group)}</span>
											{/if}

											{#if group.hasEngineMaker && canViewFuelEngineMaker}
												<span>{getDailyFuelSourceLabel('engine_maker', group)}</span>
											{/if}
										</div>
									</div>

									<div class="rpm-fuel-chart-canvas">
										<canvas use:rpmFuelCurveChart={group}></canvas>
									</div>

									<div class="rpm-fuel-chart-hint">
										Scroll to zoom in/out, drag to select a zoom area, Shift + drag to pan, double
										click to reset.
									</div>
								</article>
							{/each}
						</div>
					{:else}
						<div class="empty-box">RPM vs fuel curve chart is not available yet.</div>
					{/if}
				</section>
			{/if}

			{#if canViewFuelFod}
				<section class="table-section rpm-fuel-curve-section fod-chart-section">
					<div class="section-header">
						<div>
							<span class="section-kicker">FOD</span>
							<h2>FOD Fuel Chart</h2>
						</div>

						<strong>{fodChartGroup?.points || 0} points</strong>
					</div>

					{#if fodChartGroup}
						<div class="rpm-fuel-chart-grid fod-chart-grid">
							<article class="rpm-fuel-chart-card fod-chart-card">
								<div class="rpm-fuel-chart-header">
									<div>
										<span>Fuel oil day tank</span>
										<strong>
											{#if fodChartGroup.hasPort || fodChartGroup.hasStbd}
												FOD Port / FOD STBD
											{:else}
												FOD
											{/if}
										</strong>
									</div>

									<div class="rpm-fuel-chart-badges">
										{#if fodChartGroup.hasSingle}<span>FOD</span>{/if}
										{#if fodChartGroup.hasPort}<span>FOD Port</span>{/if}
										{#if fodChartGroup.hasStbd}<span>FOD STBD</span>{/if}
									</div>
								</div>

								<div class="rpm-fuel-chart-canvas fod-chart-canvas">
									<canvas use:fodLineChart={fodChartGroup}></canvas>
								</div>

								<div class="rpm-fuel-chart-hint">
									Scroll to zoom in/out, drag to select a zoom area, Shift + drag to pan, double
									click to reset.
								</div>
							</article>
						</div>
					{:else}
						<div class="empty-box">FOD fuel curve chart is not available yet.</div>
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
							<p class="low-speed-duration-hint">
								Red rows indicate durations longer than 30 minutes.
							</p>
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
														<th>Duration</th>
														<th>Fuel Used</th>
													</tr>
												</thead>

												<tbody>
													{#each group.rows as row}
														<tr class:low-speed-long-duration-row={row.isLongDuration}>
															<td>{formatTimeDot(row.startTime)}</td>
															<td>{formatTimeDot(row.endTime)}</td>
															<td>{row.duration}</td>
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
		{/if}

		{#if shouldShowDateRangeOverlay}
			<div class="load-required-overlay">
				<div class="load-required-card">
					<div class="load-required-icon">!</div>
					<span class="section-kicker">Waiting for date</span>
					<h2>Choose a date first</h2>
					<p>
						Select the report date and timezone above, then click <strong>Load Data</strong>
						to display the daily report.
					</p>
				</div>
			</div>
		{/if}
	</div>
</section>
