<script>
	import { flushSync, onDestroy } from 'svelte';
	import VesselMap from '$lib/VesselMap.svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { getVesselCctvSnapshots, getVesselTrace } from '$lib/api/traceApi.js';
	import { fade, fly, scale } from 'svelte/transition';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import CctvSnapshotImage from '$lib/components/CctvSnapshotImage.svelte';

	let { active = false } = $props();

	let loading = $state(false);
	let error = $state('');
	let traceData = $state(null);

	let isPlaying = $state(false);
	let activeIndex = $state(0);
	let playbackRenderTick = $state(0);
	let playbackInterval = null;
	let lastPlaybackToggleAt = 0;

	let startDateTime = $state('');
	let endDateTime = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');

	let cctvItems = $state([]);
	let cctvSnapshotsError = $state('');
	let cctvSnapshotsTotal = $state(0);
	let cctvSnapshotsBuffering = $state(false);
	let cctvSnapshotsLoadedPages = $state(0);
	let selectedCctvPanelKey = $state('');
	let cctvSnapshotRequestId = 0;
	const CCTV_SNAPSHOT_PAGE_SIZE = 50;
	const ENABLE_CCTV_BACKGROUND_BUFFER = true;

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function toApiDateTime(value) {
		if (!value) return '';

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) return value;

		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
			date.getDate()
		)} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
	}

	function toSnapshotApiDateTime(value) {
		if (!value) return '';
		return toApiDateTime(value);
	}

	function toNumber(value, fallback = 0) {
		const number = Number(value);
		return Number.isFinite(number) ? number : fallback;
	}

	function formatNumber(value, digits = 1, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;
		return number.toFixed(digits);
	}

	function formatDateTime(value) {
		if (!value) return '-';

		const timestampMs = parseDateTimeMs(value);

		if (Number.isFinite(timestampMs)) {
			return formatTimestampMs(timestampMs);
		}

		return value;
	}

	function formatTimestampMs(timestampMs) {
		const date = new Date(timestampMs);

		if (Number.isNaN(date.getTime())) return '-';

		return date.toLocaleString('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function parseDateTimeMs(value) {
		if (!value) return NaN;

		const rawValue = String(value).trim();

		if (/^\d+$/.test(rawValue)) {
			const number = Number(rawValue);
			return Number.isFinite(number) ? number : NaN;
		}

		const timezoneMatch = rawValue.match(/\(UTC([+-])(\d{1,2})(?::?(\d{2}))?\)/i);
		const timezoneOffsetMinutes = timezoneMatch
			? (timezoneMatch[1] === '-' ? -1 : 1) *
				(Number(timezoneMatch[2]) * 60 + Number(timezoneMatch[3] || 0))
			: null;
		const cleanedValue = rawValue.replace(/\s*\(UTC[+-]\d{1,2}(?::?\d{2})?\)\s*$/i, '').trim();

		const makeTimestamp = (year, month, day, hour, minute, second) => {
			if (Number.isFinite(timezoneOffsetMinutes)) {
				return (
					Date.UTC(
						Number(year),
						Number(month) - 1,
						Number(day),
						Number(hour),
						Number(minute),
						Number(second)
					) -
					timezoneOffsetMinutes * 60 * 1000
				);
			}

			return new Date(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second)
			).getTime();
		};

		const dmyMatch = cleanedValue.match(
			/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
		);

		if (dmyMatch) {
			const [, day, month, year, hour, minute, second = '00'] = dmyMatch;
			return makeTimestamp(year, month, day, hour, minute, second);
		}

		const ymdMatch = cleanedValue.match(
			/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
		);

		if (ymdMatch) {
			const [, year, month, day, hour, minute, second = '00'] = ymdMatch;
			return makeTimestamp(year, month, day, hour, minute, second);
		}

		const parsed = new Date(cleanedValue).getTime();
		return Number.isNaN(parsed) ? NaN : parsed;
	}

	function formatFileSize(value) {
		const bytes = Number(value);
		if (!Number.isFinite(bytes) || bytes <= 0) return '';

		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex += 1;
		}

		return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
	}

	function getCameraNameFromPath(filePath = '') {
		const match = String(filePath).match(/camera_([^/]+)/i);
		if (!match?.[1]) return '';

		return decodeURIComponent(match[1]).replace(/[-_]+/g, ' ').trim();
	}

	function normalizeCctvSnapshots(value) {
		const payload = value?.items ? value : value?.data?.items ? value.data : value?.data || value;
		const rawItems = Array.isArray(payload?.items)
			? payload.items
			: Array.isArray(value)
				? value
				: [];
		const items = rawItems.flatMap((item) => {
			if (!Array.isArray(item?.cameras)) return [item];

			return item.cameras.flatMap((camera) => {
				const snapshots = Array.isArray(camera?.snapshots) ? camera.snapshots : [];

				if (!snapshots.length) {
					return [
						{
							...camera,
							vesselId: item?.vesselId,
							vesselName: item?.vesselName
						}
					];
				}

				return snapshots.map((snapshot) => ({
					...snapshot,
					camera_name: camera?.camera_name,
					cameraName: camera?.cameraName,
					camera_token: camera?.camera_token,
					vesselId: item?.vesselId,
					vesselName: item?.vesselName
				}));
			});
		});

		cctvSnapshotsTotal =
			Number(
				payload?.total ??
					payload?.pagination?.total ??
					payload?.pagination?.totalItems ??
					payload?.meta?.total ??
					items.length
			) || 0;

		return items
			.map((item, index) => {
			const filePath = item?.file_path || item?.filePath || '';
			const capturedAt = item?.captured_at || item?.capturedAt || '';
			const url = item?.presigned_url || item?.presignedUrl || item?.url || '';
			const cameraName =
				item?.camera_name ||
				item?.cameraName ||
				item?.name ||
				getCameraNameFromPath(filePath) ||
				`Snapshot ${index + 1}`;
			const timestampMs = parseDateTimeMs(capturedAt);

			return {
				key: `${cameraName}|${capturedAt}|${url || filePath || index}`,
				name: cameraName,
				cameraToken: item?.camera_token || item?.cameraToken || '',
				status: url ? 'Captured' : 'No image',
				url,
				filePath,
				fileSizeText: formatFileSize(item?.file_size ?? item?.fileSize),
				capturedAt,
				capturedAtText: formatDateTime(capturedAt),
				timestampMs,
				online: Boolean(url)
			};
		})
			.sort((a, b) => {
				if (!Number.isFinite(a.timestampMs) && !Number.isFinite(b.timestampMs)) return 0;
				if (!Number.isFinite(a.timestampMs)) return 1;
				if (!Number.isFinite(b.timestampMs)) return -1;
				return a.timestampMs - b.timestampMs;
			});
	}

	function mergeCctvSnapshots(existingItems = [], nextItems = []) {
		const map = new Map();

		for (const item of [...existingItems, ...nextItems]) {
			const key = item?.key || `${item?.name}|${item?.capturedAt}|${item?.url}`;
			if (!key) continue;
			map.set(key, item);
		}

		return Array.from(map.values()).sort((a, b) => {
			if (!Number.isFinite(a.timestampMs) && !Number.isFinite(b.timestampMs)) return 0;
			if (!Number.isFinite(a.timestampMs)) return 1;
			if (!Number.isFinite(b.timestampMs)) return -1;
			return a.timestampMs - b.timestampMs;
		});
	}

	function getCctvTotalPages(total = cctvSnapshotsTotal) {
		return Math.max(1, Math.ceil((Number(total) || 0) / CCTV_SNAPSHOT_PAGE_SIZE));
	}

	function getRangeTimestampMs(value) {
		if (!value) return NaN;

		const parsed = new Date(value).getTime();
		if (Number.isFinite(parsed)) return parsed;

		return parseDateTimeMs(value);
	}

	function getCctvBufferedPercent(items = cctvItems) {
		const startMs = getRangeTimestampMs(startDateTime);
		const endMs = getRangeTimestampMs(endDateTime);

		if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
			if (!cctvSnapshotsTotal) return 0;
			return Math.min(100, Math.max(0, (items.length / cctvSnapshotsTotal) * 100));
		}

		const loadedTimestamps = items
			.map((item) => item?.timestampMs)
			.filter((timestamp) => Number.isFinite(timestamp));

		if (!loadedTimestamps.length) return 0;

		const latestLoadedTime = Math.max(...loadedTimestamps);
		return Math.min(100, Math.max(0, ((latestLoadedTime - startMs) / (endMs - startMs)) * 100));
	}

	function findClosestCctvSnapshot(snapshots = [], timestampMs) {
		if (!snapshots.length) return null;

		if (!Number.isFinite(timestampMs)) {
			return snapshots[0] || null;
		}

		let previousSnapshot = null;

		for (const snapshot of snapshots) {
			if (!Number.isFinite(snapshot?.timestampMs)) continue;

			if (snapshot.timestampMs <= timestampMs) {
				previousSnapshot = snapshot;
			} else {
				break;
			}
		}

		return previousSnapshot;
	}

	function getCctvCameraPanels(items = [], timestampMs = NaN, renderTick = 0) {
		renderTick;
		const groups = new Map();

		for (const item of items) {
			const cameraKey = item?.cameraToken || item?.name || 'Unknown Camera';

			if (!groups.has(cameraKey)) {
				groups.set(cameraKey, {
					key: cameraKey,
					name: item?.name || 'Unknown Camera',
					cameraToken: item?.cameraToken || '',
					snapshots: []
				});
			}

			groups.get(cameraKey).snapshots.push(item);
		}

		return Array.from(groups.values()).map((panel) => {
			const snapshots = panel.snapshots.sort((a, b) => {
				if (!Number.isFinite(a.timestampMs) && !Number.isFinite(b.timestampMs)) return 0;
				if (!Number.isFinite(a.timestampMs)) return 1;
				if (!Number.isFinite(b.timestampMs)) return -1;
				return a.timestampMs - b.timestampMs;
			});
			const activeSnapshot = findClosestCctvSnapshot(snapshots, timestampMs);

			return {
				...panel,
				snapshots,
				activeSnapshot,
				loadedCount: snapshots.length
			};
		});
	}

	function isCctvPanelFramePending(panel, timestampMs = activeTraceTimestampMs) {
		if (!cctvSnapshotsBuffering) return false;
		if (cctvSnapshotsTotal && cctvItems.length >= cctvSnapshotsTotal) return false;
		if (!Number.isFinite(timestampMs) || !panel?.snapshots?.length) return false;

		const loadedTimestamps = panel.snapshots
			.map((snapshot) => snapshot?.timestampMs)
			.filter((timestamp) => Number.isFinite(timestamp));

		if (!loadedTimestamps.length) return false;

		const latestLoadedTimestamp = Math.max(...loadedTimestamps);
		return Number.isFinite(latestLoadedTimestamp) && timestampMs > latestLoadedTimestamp;
	}

	function findClosestTraceIndexByTime(timestampMs, points = tracePoints) {
		if (!Number.isFinite(timestampMs) || !points.length) return -1;

		let bestIndex = -1;
		let bestDistance = Infinity;

		points.forEach((point, index) => {
			const pointTime = parseDateTimeMs(point?.timestampRaw || point?.timestamp);
			if (!Number.isFinite(pointTime)) return;

			const distance = Math.abs(pointTime - timestampMs);

			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = index;
			}
		});

		return bestIndex;
	}

	function buildTimelineEvents(points = [], snapshots = []) {
		const events = [];

		points.forEach((point, index) => {
			const timestampMs = parseDateTimeMs(point?.timestampRaw || point?.timestamp);
			if (!Number.isFinite(timestampMs)) return;

			events.push({
				key: `trace|${index}|${timestampMs}`,
				type: 'trace',
				timestampMs,
				traceIndex: index,
				label: point?.timestamp || formatDateTime(timestampMs),
				sourceLabel: 'Trace point'
			});
		});

		snapshots.forEach((snapshot, index) => {
			const timestampMs = snapshot?.timestampMs;
			if (!Number.isFinite(timestampMs)) return;

			events.push({
				key: `cctv|${snapshot?.key || index}`,
				type: 'cctv',
				timestampMs,
				traceIndex: findClosestTraceIndexByTime(timestampMs),
				cctvKey: snapshot?.key || '',
				cameraName: snapshot?.name || 'CCTV',
				label: snapshot?.capturedAtText || formatDateTime(timestampMs),
				sourceLabel: snapshot?.name ? `CCTV • ${snapshot.name}` : 'CCTV snapshot'
			});
		});

		return events
			.sort((a, b) => {
				if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
				if (a.type === b.type) return String(a.key).localeCompare(String(b.key));
				return a.type === 'trace' ? -1 : 1;
			})
			.map((event, index) => ({ ...event, index }));
	}

	function buildMergedTimelineEvents(points = [], snapshots = []) {
		const eventMap = new Map();

		const ensureEvent = (timestampMs) => {
			if (!Number.isFinite(timestampMs)) return null;

			const key = String(timestampMs);

			if (!eventMap.has(key)) {
				eventMap.set(key, {
					key: `time|${timestampMs}`,
					type: 'time',
					hasTrace: false,
					hasCctv: false,
					timestampMs,
					traceIndex: -1,
					cameraNames: new Set(),
					label: formatDateTime(timestampMs),
					sourceLabel: 'Timeline'
				});
			}

			return eventMap.get(key);
		};

		points.forEach((point, index) => {
			const timestampMs = parseDateTimeMs(point?.timestampRaw || point?.timestamp);
			if (!Number.isFinite(timestampMs)) return;

			const event = ensureEvent(timestampMs);
			if (!event) return;

			event.hasTrace = true;
			event.traceIndex = index;
			event.label = point?.timestamp || event.label;
		});

		snapshots.forEach((snapshot) => {
			const timestampMs = snapshot?.timestampMs;
			if (!Number.isFinite(timestampMs)) return;

			const event = ensureEvent(timestampMs);
			if (!event) return;

			event.hasCctv = true;
			if (event.traceIndex < 0) event.traceIndex = findClosestTraceIndexByTime(timestampMs, points);
			if (snapshot?.name) event.cameraNames.add(snapshot.name);
			if (!event.hasTrace) event.label = snapshot?.capturedAtText || event.label;
		});

		return Array.from(eventMap.values())
			.sort((a, b) => {
				if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
				return String(a.key).localeCompare(String(b.key));
			})
			.map((event, index) => {
				const cameraNames = Array.from(event.cameraNames);
				const sourceParts = [];

				if (event.hasTrace) sourceParts.push('Trace');
				if (event.hasCctv) {
					sourceParts.push(
						cameraNames.length === 1
							? `CCTV • ${cameraNames[0]}`
							: `CCTV • ${cameraNames.length} cameras`
					);
				}

				return {
					...event,
					index,
					type: event.hasTrace && event.hasCctv ? 'trace+cctv' : event.hasCctv ? 'cctv' : 'trace',
					cameraNames,
					sourceLabel: sourceParts.join(' + ') || 'Timeline'
				};
			});
	}

	function findClosestTimelineIndexByTime(timestampMs) {
		return findClosestTimelineIndexInEvents(timelineEvents, timestampMs);
	}

	function findClosestTimelineIndexInEvents(events = [], timestampMs) {
		if (!Number.isFinite(timestampMs) || !events.length) return -1;

		let bestIndex = -1;
		let bestDistance = Infinity;

		events.forEach((event, index) => {
			if (!Number.isFinite(event?.timestampMs)) return;

			const distance = Math.abs(event.timestampMs - timestampMs);
			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = index;
			}
		});

		return bestIndex;
	}

	function getCurrentTimelineTimestampMs() {
		const eventTimestamp = timelineEvents[activeIndex]?.timestampMs;
		if (Number.isFinite(eventTimestamp)) return eventTimestamp;

		return parseDateTimeMs(activePoint?.timestampRaw || activePoint?.timestamp);
	}

	function applyCctvItems(nextItems = [], { preserveTimeline = true } = {}) {
		const previousTimestamp = getCurrentTimelineTimestampMs();
		const nextEvents = preserveTimeline ? buildMergedTimelineEvents(tracePoints, nextItems) : [];

		cctvItems = nextItems;

		if (preserveTimeline && Number.isFinite(previousTimestamp) && nextEvents.length) {
			const nextIndex = findClosestTimelineIndexInEvents(nextEvents, previousTimestamp);
			if (nextIndex >= 0) activeIndex = nextIndex;
		}
	}

	async function bufferRemainingCctvSnapshots({
		requestId,
		vesselId,
		startTime,
		endTime,
		totalPages
	}) {
		if (totalPages <= 1) return;

		cctvSnapshotsBuffering = true;

		try {
			for (let page = 2; page <= totalPages; page += 1) {
				if (requestId !== cctvSnapshotRequestId) {
					console.log('[TRACE_CCTV_PAGE_SKIP_STALE]', {
						page,
						requestId,
						activeRequestId: cctvSnapshotRequestId
					});
					return;
				}

				console.log('[TRACE_CCTV_PAGE_REQUEST]', {
					page,
					totalPages,
					pageSize: CCTV_SNAPSHOT_PAGE_SIZE,
					loadedBefore: cctvItems.length,
					vesselId,
					startTime,
					endTime
				});

				const result = await getVesselCctvSnapshots({
					vesselId,
					startTime,
					endTime,
					page,
					pageSize: CCTV_SNAPSHOT_PAGE_SIZE
				});

				if (requestId !== cctvSnapshotRequestId) {
					console.log('[TRACE_CCTV_PAGE_RESPONSE_STALE]', {
						page,
						requestId,
						activeRequestId: cctvSnapshotRequestId
					});
					return;
				}

				const nextItems = normalizeCctvSnapshots(result);
				const beforeMergeCount = cctvItems.length;
				applyCctvItems(mergeCctvSnapshots(cctvItems, nextItems), { preserveTimeline: true });
				cctvSnapshotsLoadedPages = page;

				console.log('[TRACE_CCTV_PAGE_LOADED]', {
					page,
					totalPages,
					normalizedItems: nextItems.length,
					beforeMergeCount,
					afterMergeCount: cctvItems.length,
					totalSnapshots: cctvSnapshotsTotal,
					panels: getCctvCameraPanels(cctvItems, activeTraceTimestampMs).map((panel) => ({
						name: panel.name,
						frames: panel.loadedCount,
						activeFrame: panel.activeSnapshot?.capturedAt || null
					}))
				});
			}
		} catch (err) {
			console.error('[VESSEL_TRACE_CCTV_BUFFER_ERROR]', err);
			cctvSnapshotsError = err?.message || 'Failed to buffer remaining CCTV snapshots.';
		} finally {
			if (requestId === cctvSnapshotRequestId) {
				cctvSnapshotsBuffering = false;
				console.log('[TRACE_CCTV_BUFFER_DONE]', {
					loadedPages: cctvSnapshotsLoadedPages,
					loadedItems: cctvItems.length,
					totalSnapshots: cctvSnapshotsTotal
				});
			}
		}
	}

	async function loadTraceCctvSnapshots({ vesselId, startTime, endTime }) {
		const requestId = ++cctvSnapshotRequestId;

		cctvItems = [];
		cctvSnapshotsTotal = 0;
		cctvSnapshotsLoadedPages = 0;
		cctvSnapshotsBuffering = false;

		console.log('[TRACE_CCTV_PAGE_REQUEST]', {
			page: 1,
			totalPages: null,
			pageSize: CCTV_SNAPSHOT_PAGE_SIZE,
			loadedBefore: 0,
			vesselId,
			startTime,
			endTime
		});

		const firstPageResult = await getVesselCctvSnapshots({
			vesselId,
			startTime,
			endTime,
			page: 1,
			pageSize: CCTV_SNAPSHOT_PAGE_SIZE
		});

		if (requestId !== cctvSnapshotRequestId) return null;

		const firstItems = normalizeCctvSnapshots(firstPageResult);
		applyCctvItems(firstItems, { preserveTimeline: false });
		cctvSnapshotsLoadedPages = 1;

		const totalPages = getCctvTotalPages();

		console.log('[TRACE_CCTV_PAGE_LOADED]', {
			page: 1,
			totalPages,
			normalizedItems: firstItems.length,
			beforeMergeCount: 0,
			afterMergeCount: cctvItems.length,
			totalSnapshots: cctvSnapshotsTotal,
			panels: getCctvCameraPanels(cctvItems, activeTraceTimestampMs).map((panel) => ({
				name: panel.name,
				frames: panel.loadedCount,
				activeFrame: panel.activeSnapshot?.capturedAt || null
			}))
		});

		if (totalPages > 1 && ENABLE_CCTV_BACKGROUND_BUFFER) {
			console.log('[TRACE_CCTV_BUFFER_START]', {
				totalPages,
				nextPage: 2,
				totalSnapshots: cctvSnapshotsTotal,
				pageSize: CCTV_SNAPSHOT_PAGE_SIZE
			});

			bufferRemainingCctvSnapshots({
				requestId,
				vesselId,
				startTime,
				endTime,
				totalPages
			});
		} else if (totalPages > 1) {
			console.log('[TRACE_CCTV_BUFFER_SKIPPED_FOR_FIRST_PAGE_TEST]', {
				totalPages,
				loadedPages: cctvSnapshotsLoadedPages,
				loadedItems: cctvItems.length,
				totalSnapshots: cctvSnapshotsTotal
			});
		}

		return firstPageResult;
	}

	function normalizeRpm(value) {
		if (!value) return {};

		if (typeof value === 'object' && !Array.isArray(value)) {
			return Object.fromEntries(
				Object.entries(value).map(([engineName, rpmValue]) => [engineName, toNumber(rpmValue, 0)])
			);
		}

		return {
			RPM: toNumber(value, 0)
		};
	}

	function getMaxRpm(rpmObject = {}) {
		const values = Object.values(rpmObject)
			.map((value) => toNumber(value, 0))
			.filter((value) => Number.isFinite(value));

		if (!values.length) return 0;

		return Math.max(...values);
	}

	function getAvgRpm(rpmObject = {}) {
		const values = Object.values(rpmObject)
			.map((value) => toNumber(value, 0))
			.filter((value) => Number.isFinite(value));

		if (!values.length) return 0;

		return values.reduce((sum, value) => sum + value, 0) / values.length;
	}

	function getTracePoints(data) {
		const candidates =
			data?.points ||
			data?.trace ||
			data?.traces ||
			data?.coordinates ||
			data?.path ||
			data?.rows ||
			data?.items ||
			data?.result ||
			data?.data?.points ||
			data?.data?.trace ||
			data?.data?.coordinates ||
			data?.data?.path ||
			data?.data?.rows ||
			data?.data ||
			data ||
			[];

		if (!Array.isArray(candidates)) {
			console.warn('[TRACE_POINTS_NOT_ARRAY]', data);
			return [];
		}

		const points = candidates
			.map((item, index) => {
				const lat = toNumber(
					item.latitude ??
						item.lat ??
						item.gps_lat ??
						item.gpsLatitude ??
						item.latitude_deg ??
						item.position?.latitude ??
						item.position?.lat,
					NaN
				);

				const lng = toNumber(
					item.longitude ??
						item.lng ??
						item.lon ??
						item.gps_lng ??
						item.gps_lon ??
						item.gpsLongitude ??
						item.longitude_deg ??
						item.position?.longitude ??
						item.position?.lng ??
						item.position?.lon,
					NaN
				);

				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
				if (lat === 0 && lng === 0) return null;

				const rpm = normalizeRpm(item.rpm ?? item.me_rpm ?? item.mePortRpm ?? item.me_port_rpm);

				return {
					index,
					latitude: lat,
					longitude: lng,
					heading: toNumber(item.heading ?? item.course ?? item.bearing, 0),
					speed: toNumber(item.speed ?? item.sog ?? item.speedOverGround, 0),
					rpm,
					maxRpm: getMaxRpm(rpm),
					avgRpm: getAvgRpm(rpm),
					fuelPerMinute: toNumber(
						item.fuelPerMinute ??
							item.fuel_per_minute ??
							item.fuelRate ??
							item.fuel_rate ??
							item.f_rate,
						0
					),
					weather: item.weather || item.weatherForecast || item.condition || '-',
					queue: toNumber(item.queue, 0),
					sdCard: toNumber(item.sdCard ?? item.sd_card, 0),
					online: Boolean(item.online),
					timestampRaw:
						item.timestamp ||
						item.ts ||
						item.time ||
						item.datetime ||
						item.createdAt ||
						item.created_at ||
						'',
					timestamp: formatDateTime(
						item.timestamp ||
							item.ts ||
							item.time ||
							item.datetime ||
							item.createdAt ||
							item.created_at ||
							'-'
					)
				};
			})
			.filter(Boolean);

		console.log('[TRACE_POINTS_PARSED]', points.length, points.slice(0, 3));

		return points;
	}

	let tracePoints = $derived(getTracePoints(traceData));
	let timelineEvents = $derived(buildMergedTimelineEvents(tracePoints, cctvItems));
	let activeTimelineEvent = $derived(timelineEvents[activeIndex] || timelineEvents[0] || null);
	let activeTimelineTimestampMs = $derived(
		activeTimelineEvent?.timestampMs ??
			parseDateTimeMs(tracePoints[activeIndex]?.timestampRaw || tracePoints[activeIndex]?.timestamp)
	);
	let activeTraceIndex = $derived(
		Number.isInteger(activeTimelineEvent?.traceIndex) && activeTimelineEvent.traceIndex >= 0
			? activeTimelineEvent.traceIndex
			: Math.max(0, findClosestTraceIndexByTime(activeTimelineTimestampMs))
	);
	let activeTimelineLabel = $derived(
		activeTimelineEvent?.label ||
			formatDateTime(activeTimelineTimestampMs) ||
			tracePoints[activeTraceIndex]?.timestamp ||
			'-'
	);
	let activeTimelineSourceLabel = $derived(activeTimelineEvent?.sourceLabel || 'Trace timeline');

	let activePoint = $derived(
		tracePoints[activeTraceIndex] ||
			tracePoints[0] || {
				latitude: toNumber($selectedVesselInfo?.latitude ?? $selectedVesselInfo?.lat, 0),
				longitude: toNumber($selectedVesselInfo?.longitude ?? $selectedVesselInfo?.lng, 0),
				heading: toNumber($selectedVesselInfo?.heading, 0),
				speed: toNumber($selectedVesselInfo?.speed, 0),
				rpm: {},
				maxRpm: 0,
				avgRpm: 0,
				fuelPerMinute: 0,
				weather: $selectedVesselInfo?.weather?.current?.condition || '-',
				queue: 0,
				sdCard: 0,
				online: false,
				timestamp: formatDateTime($selectedVesselInfo?.lastUpdated || '-')
			}
	);

	let vesselName = $derived(
		traceData?.vesselName ||
			traceData?.data?.vesselName ||
			$selectedVesselInfo?.name ||
			$selectedVesselInfo?.vesselName ||
			'Selected Vessel'
	);

	let activeRpmEntries = $derived(Object.entries(activePoint.rpm || {}));

	let timelineProgress = $derived(
		timelineEvents.length > 1
			? Math.min(100, Math.max(0, (activeIndex / (timelineEvents.length - 1)) * 100))
			: 0
	);
	let cctvBufferedPercent = $derived(getCctvBufferedPercent(cctvItems));

	let activeTraceTimestampMs = $derived(
		Number.isFinite(activeTimelineTimestampMs)
			? activeTimelineTimestampMs
			: parseDateTimeMs(activePoint?.timestampRaw || activePoint?.timestamp)
	);
	let cctvCameraPanels = $derived(
		getCctvCameraPanels(cctvItems, activeTraceTimestampMs, playbackRenderTick)
	);
	let mainCctvPanel = $derived(
		cctvCameraPanels.find((panel) => panel.key === selectedCctvPanelKey) ||
			cctvCameraPanels[0] ||
			null
	);
	let miniCctvPanels = $derived(
		mainCctvPanel ? cctvCameraPanels.filter((panel) => panel.key !== mainCctvPanel.key) : []
	);

	let vesselInfo = $derived({
		vesselName,
		latitude: activePoint.latitude,
		longitude: activePoint.longitude,
		heading: activePoint.heading,
		currentSpeed: `${formatNumber(activePoint.speed, 1, '0.0')} knot`,
		maxRpm: `${formatNumber(activePoint.maxRpm, 0, '0')} RPM`,
		avgRpm: `${formatNumber(activePoint.avgRpm, 0, '0')} RPM`,
		fuelPerMinute: `${formatNumber(activePoint.fuelPerMinute, 2, '0.00')} L/min`,
		weatherForecast: activePoint.weather || $selectedVesselInfo?.weather?.current?.condition || '-',
		lastUpdate: activeTimelineLabel || activePoint.timestamp || '-',
		onlineStatus: activePoint.online ? 'Online' : 'Offline'
	});

	function selectCctvPanel(panel) {
		if (!panel?.key) return;
		selectedCctvPanelKey = panel.key;
	}

	async function loadTrace() {
		stopPlayback('load-trace');

		if (!startDateTime || !endDateTime) {
			error = 'Please choose a start and end time first.';
			traceData = null;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			cctvSnapshotsBuffering = false;
			cctvSnapshotsLoadedPages = 0;
			cctvSnapshotRequestId += 1;
			return;
		}

		const startMs = getRangeTimestampMs(startDateTime);
		const endMs = getRangeTimestampMs(endDateTime);

		if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
			error = 'End time must be later than start time.';
			traceData = null;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			cctvSnapshotsBuffering = false;
			cctvSnapshotsLoadedPages = 0;
			cctvSnapshotRequestId += 1;
			return;
		}

		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			traceData = null;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			cctvSnapshotsBuffering = false;
			cctvSnapshotsLoadedPages = 0;
			cctvSnapshotRequestId += 1;
			return;
		}

		loading = true;
		error = '';
		cctvSnapshotsError = '';
		cctvSnapshotRequestId += 1;

		try {
			const traceStart = toApiDateTime(startDateTime);
			const traceEnd = toApiDateTime(endDateTime);
			const cctvStart = toSnapshotApiDateTime(startDateTime);
			const cctvEnd = toSnapshotApiDateTime(endDateTime);

			console.log('[TRACE_CCTV_SNAPSHOTS_LOAD_PARAMS]', {
				vesselId: $selectedVesselId,
				startDateTime,
				endDateTime,
				traceStart,
				traceEnd,
				cctvStart,
				cctvEnd,
				page: 1,
				pageSize: CCTV_SNAPSHOT_PAGE_SIZE
			});

			const [result, snapshotResult] = await Promise.all([
				getVesselTrace({
					vesselId: $selectedVesselId,
					start: traceStart,
					end: traceEnd,
					timezoneMode,
					timezoneOffset: timezoneMode === 'manual' ? timezoneOffset : ''
				}),
				loadTraceCctvSnapshots({
					vesselId: $selectedVesselId,
					startTime: cctvStart,
					endTime: cctvEnd
				}).catch((snapshotErr) => {
					console.error('[VESSEL_TRACE_CCTV_SNAPSHOTS_ERROR]', snapshotErr);
					cctvSnapshotsError =
						snapshotErr?.message || 'Failed to load CCTV snapshots for this trace range.';
					return null;
				})
			]);

			traceData = result;
			activeIndex = 0;
			playbackRenderTick += 1;

			const parsedTracePoints = getTracePoints(result);
			const parsedTimelineEvents = buildMergedTimelineEvents(parsedTracePoints, cctvItems);
			const firstCctvEvent = parsedTimelineEvents.find((event) => event.hasCctv);
			const firstTraceEvent = parsedTimelineEvents.find((event) => event.hasTrace);

			console.log('[VESSEL_TRACE_RAW]', result);
			console.log('[VESSEL_TRACE_POINTS_COUNT]', parsedTracePoints.length);
			console.log('[VESSEL_TRACE_CCTV_SNAPSHOTS_COUNT]', cctvItems.length);
			console.log('[TRACE_TIMELINE_EVENTS_SUMMARY]', {
				totalTimelineEvents: parsedTimelineEvents.length,
				totalTraceEvents: parsedTimelineEvents.filter((event) => event.hasTrace).length,
				totalCctvEvents: parsedTimelineEvents.filter((event) => event.hasCctv).length,
				firstEvent: parsedTimelineEvents[0]
					? {
							label: parsedTimelineEvents[0].label,
							source: parsedTimelineEvents[0].sourceLabel,
							timestampMs: parsedTimelineEvents[0].timestampMs
						}
					: null,
				firstTraceEvent: firstTraceEvent
					? {
							label: firstTraceEvent.label,
							source: firstTraceEvent.sourceLabel,
							timestampMs: firstTraceEvent.timestampMs
						}
					: null,
				firstCctvEvent: firstCctvEvent
					? {
							label: firstCctvEvent.label,
							source: firstCctvEvent.sourceLabel,
							timestampMs: firstCctvEvent.timestampMs
						}
					: null,
				lastEvent: parsedTimelineEvents.at(-1)
					? {
							label: parsedTimelineEvents.at(-1).label,
							source: parsedTimelineEvents.at(-1).sourceLabel,
							timestampMs: parsedTimelineEvents.at(-1).timestampMs
						}
					: null
			});
		} catch (err) {
			console.error('[VESSEL_TRACE_ERROR]', err);
			error = err?.message || 'Failed to load vessel trace.';
			traceData = null;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
		} finally {
			loading = false;
		}
	}

	function clearPlaybackInterval(reason = 'manual') {
		if (!playbackInterval) return;

		clearInterval(playbackInterval);
		playbackInterval = null;

		console.log('[TRACE_PLAY_INTERVAL_CLEARED]', {
			reason,
			activeIndex,
			totalTimelineEvents: timelineEvents.length,
			totalTracePoints: tracePoints.length
		});
	}

	function runPlaybackTick(source = 'interval') {
		const currentIndex = activeIndex;
		const totalTimelineEvents = timelineEvents.length;

		console.log('[TRACE_PLAY_TICK_BEGIN]', {
			source,
			activeIndex: currentIndex,
			totalTimelineEvents,
			totalTracePoints: tracePoints.length,
			isPlaying,
			hasInterval: Boolean(playbackInterval)
		});

		if (!timelineEvents.length) {
			clearPlaybackInterval('empty-timeline');
			isPlaying = false;
			return;
		}

		if (currentIndex >= totalTimelineEvents - 1) {
			console.log('[TRACE_PLAY_STOP_END]', {
				activeIndex: currentIndex,
				totalTimelineEvents,
				source
			});
			clearPlaybackInterval('end');
			isPlaying = false;
			return;
		}

		const nextIndex = currentIndex + 1;
		const nextEvent = timelineEvents[nextIndex];
		const nextTime = nextEvent?.timestampMs;
		const nextTraceIndex =
			Number.isInteger(nextEvent?.traceIndex) && nextEvent.traceIndex >= 0
				? nextEvent.traceIndex
				: findClosestTraceIndexByTime(nextTime);
		const nextPoint = tracePoints[nextTraceIndex] || null;

		flushSync(() => {
			activeIndex = nextIndex;
			playbackRenderTick += 1;
		});

		try {
			const nextPanels = getCctvCameraPanels(cctvItems, nextTime, playbackRenderTick);

			console.log('[TRACE_PLAY_TICK]', {
				source,
				fromIndex: currentIndex,
				toIndex: nextIndex,
				totalTimelineEvents,
				totalTracePoints: tracePoints.length,
				eventType: nextEvent?.type,
				eventSource: nextEvent?.sourceLabel,
				eventTime: nextEvent?.label,
				traceIndex: nextTraceIndex,
				traceTime: nextPoint?.timestampRaw || nextPoint?.timestamp,
				traceLatitude: nextPoint?.latitude,
				traceLongitude: nextPoint?.longitude,
				cctvBufferedPercent,
				cctvLoadedItems: cctvItems.length,
				cctvPanels: nextPanels.map((panel) => ({
					name: panel.name,
					frames: panel.loadedCount,
					frameTime: panel.activeSnapshot?.capturedAt || null,
					frameUrl: panel.activeSnapshot?.url || null
				}))
			});
		} catch (err) {
			console.error('[TRACE_PLAY_TICK_LOG_ERROR]', {
				source,
				fromIndex: currentIndex,
				toIndex: nextIndex,
				error: err
			});
		}
	}

	function startPlayback() {
		clearPlaybackInterval('restart');

		console.log('[TRACE_PLAY_START]', {
			activeIndex,
			totalTimelineEvents: timelineEvents.length,
			totalTracePoints: tracePoints.length,
			cctvItems: cctvItems.length
		});

		isPlaying = true;
		runPlaybackTick('start');

		if (!isPlaying) return;

		playbackInterval = setInterval(() => {
			runPlaybackTick('interval');
		}, 900);

		console.log('[TRACE_PLAY_INTERVAL_CREATED]', {
			activeIndex,
			totalTimelineEvents: timelineEvents.length,
			totalTracePoints: tracePoints.length,
			delayMs: 900
		});
	}

	function stopPlayback(reason = 'toggle') {
		clearPlaybackInterval(reason);
		isPlaying = false;
	}

	function togglePlayback() {
		if (!timelineEvents.length) {
			console.warn('[TRACE_PLAY_TOGGLE_BLOCKED]', {
				reason: 'timelineEvents is empty',
				traceData,
				cctvItems: cctvItems.length,
				cctvSnapshotsTotal
			});
			return;
		}

		const now = Date.now();

		if (now - lastPlaybackToggleAt < 250) {
			console.warn('[TRACE_PLAY_TOGGLE_IGNORED_FAST_REPEAT]', {
				activeIndex,
				totalTimelineEvents: timelineEvents.length,
				isPlaying
			});
			return;
		}

		lastPlaybackToggleAt = now;

		const nextPlaying = !isPlaying;

		console.log('[TRACE_PLAY_TOGGLE]', {
			from: isPlaying,
			to: nextPlaying,
			activeIndex,
			activeTraceIndex,
			totalTimelineEvents: timelineEvents.length,
			totalTracePoints: tracePoints.length,
			activeEventType: activeTimelineEvent?.type,
			activeEventTime: activeTimelineLabel,
			activePointTime: activePoint?.timestampRaw || activePoint?.timestamp,
			cctvItems: cctvItems.length,
			cctvPanels: cctvCameraPanels.map((panel) => ({
				name: panel.name,
				frames: panel.loadedCount,
				activeFrame: panel.activeSnapshot?.capturedAt || null
			}))
		});

		if (nextPlaying) {
			startPlayback();
		} else {
			stopPlayback('toggle');
		}
	}

	let isDraggingTimeline = $state(false);

	function updateTimelineFromPointer(event) {
		if (!timelineEvents.length) return;

		const target = event.currentTarget;
		const rect = target.getBoundingClientRect();
		const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
		const x = clientX - rect.left;
		const ratio = Math.min(1, Math.max(0, x / rect.width));

		activeIndex = Math.round(ratio * (timelineEvents.length - 1));
		playbackRenderTick += 1;
	}

	function moveTimeline(event) {
		updateTimelineFromPointer(event);
	}

	function startTimelineDrag(event) {
		if (!timelineEvents.length) return;

		isDraggingTimeline = true;
		isPlaying = false;

		event.currentTarget.setPointerCapture?.(event.pointerId);
		updateTimelineFromPointer(event);
	}

	function dragTimeline(event) {
		if (!isDraggingTimeline) return;

		updateTimelineFromPointer(event);
	}

	function stopTimelineDrag(event) {
		if (!isDraggingTimeline) return;

		isDraggingTimeline = false;
		event.currentTarget.releasePointerCapture?.(event.pointerId);
	}

	function moveStep(direction) {
		if (!timelineEvents.length) return;

		activeIndex = Math.min(timelineEvents.length - 1, Math.max(0, activeIndex + direction));
		playbackRenderTick += 1;
	}

	onDestroy(() => {
		clearPlaybackInterval('destroy');
	});

	$effect(() => {
		if (!active) {
			stopPlayback('inactive-page');
		}
	});

	$effect(() => {
		if (!timelineEvents.length) {
			if (activeIndex !== 0) activeIndex = 0;
			return;
		}

		if (activeIndex > timelineEvents.length - 1) {
			activeIndex = timelineEvents.length - 1;
			playbackRenderTick += 1;
		}
	});

	$effect(() => {
		if (!cctvCameraPanels.length) {
			if (selectedCctvPanelKey) selectedCctvPanelKey = '';
			return;
		}

		if (!cctvCameraPanels.some((panel) => panel.key === selectedCctvPanelKey)) {
			selectedCctvPanelKey = cctvCameraPanels[0]?.key || '';
		}
	});

</script>

<section class="trace-root page-content">
	<section class="trace-viewport">
		<section class="compact-filter-card">
			<div class="filter-title">
				<strong>Trace Playback</strong>
				<span>{vesselInfo.vesselName}</span>
			</div>

			<div class="filter-controls">
				<label>
					<span>Start</span>
					<input type="datetime-local" bind:value={startDateTime} />
				</label>

				<label>
					<span>End</span>
					<input type="datetime-local" bind:value={endDateTime} />
				</label>

				<label>
					<span>Timezone</span>
					<select bind:value={timezoneMode}>
						<option value="auto">Auto</option>
						<option value="manual">Manual</option>
					</select>
				</label>

				{#if timezoneMode === 'manual'}
					<label>
						<span>Offset</span>
						<input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
					</label>
				{/if}

				<button type="button" onclick={loadTrace} disabled={loading || !startDateTime || !endDateTime}>
					{loading ? 'Loading...' : 'Load Trace'}
				</button>
			</div>
		</section>

		{#if error}
			<div class="status-box error-box">{error}</div>
		{/if}

	{#if loading}
		<section class="trace-loading-shell">
			<LoadingSkeleton
				label="Loading trace playback"
				variant="trace-playback"
				class="trace-page-skeleton"
			/>
		</section>
	{:else}
		<section class="main-monitor-grid">
			<section class="monitor-card cctv-card">
				<div class="card-header">
					<div>
						<div class="card-title">CCTV Monitoring</div>
						<div class="card-subtitle" class:cctv-error-text={Boolean(cctvSnapshotsError)}>
							{cctvSnapshotsError ||
								`${cctvItems.length}/${cctvSnapshotsTotal || cctvItems.length} snapshots loaded${cctvSnapshotsBuffering ? ' • buffering...' : ''}`}
						</div>
					</div>
				</div>

				<div class="cctv-layout">
					{#if cctvCameraPanels.length}
						<div class="cctv-focus-layout">
							{#if mainCctvPanel}
								{@const activeFrame = mainCctvPanel.activeSnapshot}
								{@const framePending = isCctvPanelFramePending(mainCctvPanel)}
								<article
									class="cctv-camera-panel cctv-camera-main"
									data-render-tick={playbackRenderTick}
									class:offline={!activeFrame?.online}
									class:has-snapshot={Boolean(activeFrame?.url)}
									class:frame-pending={framePending}
									in:scale={{ start: 0.98, duration: 150 }}
								>
									<div class="cctv-camera-frame">
										{#if activeFrame?.url}
											{#key activeFrame.key}
											<CctvSnapshotImage
												class="cctv-camera-image"
												src={activeFrame.url}
												filePath={activeFrame.filePath}
												frameKey={activeFrame.key}
												renderTick={playbackRenderTick}
												alt={`${mainCctvPanel.name} snapshot`}
												loading="eager"
											/>
											{/key}
										{/if}

										{#if framePending}
											<div class="cctv-frame-loading" aria-live="polite">
												<span aria-hidden="true"></span>
												<small>Loading frame...</small>
											</div>
										{/if}

										<div class="cctv-scanline"></div>
									</div>

									<div class="cctv-camera-info">
										<strong>{mainCctvPanel.name}</strong>
										<span>{framePending ? 'Loading frame...' : activeFrame?.capturedAtText || 'No frame yet'}</span>
										<small>{mainCctvPanel.loadedCount} frames loaded</small>
									</div>
								</article>
							{/if}

							{#if miniCctvPanels.length}
								<div class="cctv-thumbnail-row" aria-label="CCTV cameras">
									{#each miniCctvPanels as panel (panel.key)}
										{@const activeFrame = panel.activeSnapshot}
										{@const framePending = isCctvPanelFramePending(panel)}
										<button
											type="button"
											class="cctv-camera-panel cctv-camera-thumb"
											data-render-tick={playbackRenderTick}
											class:offline={!activeFrame?.online}
											class:has-snapshot={Boolean(activeFrame?.url)}
											class:frame-pending={framePending}
											onclick={() => selectCctvPanel(panel)}
											title={`Show ${panel.name}`}
										>
											<div class="cctv-camera-frame">
												{#if activeFrame?.url}
													{#key activeFrame.key}
													<CctvSnapshotImage
														class="cctv-camera-image"
														src={activeFrame.url}
														filePath={activeFrame.filePath}
														frameKey={activeFrame.key}
														renderTick={playbackRenderTick}
														alt={`${panel.name} snapshot`}
														loading="eager"
													/>
													{/key}
												{/if}

												{#if framePending}
													<div class="cctv-frame-loading compact" aria-live="polite">
														<span aria-hidden="true"></span>
													</div>
												{/if}

												<div class="cctv-scanline"></div>
											</div>

											<div class="cctv-camera-info">
												<strong>{panel.name}</strong>
											</div>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<div class="cctv-main-shell cctv-empty-shell" in:fade={{ duration: 150 }}>
							<div class="cctv-main offline cctv-empty-main">
								<div class="cctv-overlay">
									<span class="camera-name">No CCTV snapshot</span>
									<span class="camera-status">Choose a range and load trace</span>
								</div>
							</div>
						</div>
					{/if}

				</div>
			</section>

			<section class="monitor-card map-card">
				<div class="card-header map-header">
					<div>
						<div class="card-title">Vessel Position</div>
						<div class="card-subtitle">
							{vesselInfo.lastUpdate}
						</div>
					</div>

					<div class="coordinate-badge">
						<CopyableCoordinate
							value={formatNumber(vesselInfo.latitude, 6, '0.000000')}
							display={formatNumber(vesselInfo.latitude, 6, '0.000000')}
							label="latitude"
							compact
						/>
						<span class="coordinate-separator">,</span>
						<CopyableCoordinate
							value={formatNumber(vesselInfo.longitude, 6, '0.000000')}
							display={formatNumber(vesselInfo.longitude, 6, '0.000000')}
							label="longitude"
							compact
						/>
					</div>
				</div>

				<div class="map-panel">
					{#if active}
						<VesselMap
							latitude={vesselInfo.latitude}
							longitude={vesselInfo.longitude}
							heading={vesselInfo.heading}
							vesselName={vesselInfo.vesselName}
							speed={vesselInfo.currentSpeed}
							lastUpdate={vesselInfo.lastUpdate}
							iconUrl="/assets/vessel.png"
							zoom={12}
							{tracePoints}
							activeIndex={activeTraceIndex}
							renderKey={playbackRenderTick}
							showTraceLine={true}
							followActivePoint={isPlaying}
						/>
					{/if}
				</div>
			</section>
		</section>

		<section class="bottom-panel">
			<div class="playback-card">
				<div class="playback-controls">
					<button
						type="button"
						class="step-btn"
						onclick={() => moveStep(-1)}
						disabled={!timelineEvents.length || activeIndex <= 0}
					>
						‹
					</button>

					<button
						type="button"
						class="play-button"
						onclick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							togglePlayback();
						}}
						disabled={!timelineEvents.length}
					>
						{isPlaying ? 'Pause' : 'Play'}
					</button>

					<button
						type="button"
						class="step-btn"
						onclick={() => moveStep(1)}
						disabled={!timelineEvents.length || activeIndex >= timelineEvents.length - 1}
					>
						›
					</button>
				</div>

				<div
					class="timeline"
					role="slider"
					tabindex="0"
					aria-label="Trace playback timeline"
					aria-valuemin="0"
					aria-valuemax={Math.max(timelineEvents.length - 1, 0)}
					aria-valuenow={activeIndex}
					onpointerdown={startTimelineDrag}
					onpointermove={dragTimeline}
					onpointerup={stopTimelineDrag}
					onpointercancel={stopTimelineDrag}
					onclick={moveTimeline}
				>
					<div class="timeline-track"></div>
					<div class="timeline-buffer" style={`width: ${cctvBufferedPercent}%`}></div>
					<div class="timeline-progress" style={`width: ${timelineProgress}%`}></div>
					<div class="timeline-dot" style={`left: ${timelineProgress}%`}></div>
				</div>

				<div class="timeline-time">
					<span>{activeIndex + 1}/{timelineEvents.length || 0} • {activeTimelineSourceLabel}</span>
					<strong>{activeTimelineLabel}</strong>
				</div>
			</div>

			<section class="bottom-data-grid">
				<div class="compact-info-grid">
					<article class="info-card">
						<span>Speed</span>
						<strong>{vesselInfo.currentSpeed}</strong>
					</article>

					<article class="info-card">
						<span>Heading</span>
						<strong>{formatNumber(vesselInfo.heading, 1, '0.0')}°</strong>
					</article>

					<article class="info-card">
						<span>Fuel / Min</span>
						<strong>{vesselInfo.fuelPerMinute}</strong>
					</article>

					<article class="info-card">
						<span>Weather</span>
						<strong>{vesselInfo.weatherForecast}</strong>
					</article>

					<article class="info-card">
						<span>Points</span>
						<strong>{tracePoints.length}</strong>
					</article>
				</div>

				<section class="rpm-panel">
					<div class="rpm-header">
						<span>Engine RPM</span>
						<strong>{activeRpmEntries.length} engines</strong>
					</div>

					{#if activeRpmEntries.length}
						<div class="rpm-grid">
							{#each activeRpmEntries as [engineName, rpmValue]}
								<article class="rpm-card">
									<span>{engineName}</span>
									<strong>{formatNumber(rpmValue, 0, '0')} RPM</strong>
								</article>
							{/each}
						</div>
					{:else}
						<div class="rpm-empty">RPM data is not available.</div>
					{/if}
				</section>
			</section>
		</section>
		{/if}
	</section>

	{#if traceData && !loading}
		<details class="raw-box">
			<summary>Raw Trace Response</summary>
			<pre>{JSON.stringify(traceData, null, 2)}</pre>
		</details>
	{/if}
</section>

<style>
	.trace-root {
		width: 100%;
		height: 100%;
		min-height: 0;
		background: var(--color-base);
		color: var(--text-primary);
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.trace-viewport {
		padding: 10px;
		box-sizing: border-box;
		display: grid;
		grid-template-rows: auto auto auto auto;
		gap: 10px;
		overflow: visible;
	}

	.compact-filter-card {
		min-height: 64px;
		padding: 10px 18px;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		align-items: center;
		gap: 16px;
	}

	.filter-title {
		display: grid;
		align-content: center;
		gap: 4px;
		min-height: 42px;
	}

	.filter-title strong {
		display: block;
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 950;
		line-height: 1.1;
	}

	.filter-title span {
		display: block;
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 800;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.filter-controls {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		flex-wrap: wrap;
	}

	.filter-controls label {
		display: grid;
		gap: 4px;
	}

	.filter-controls label span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 950;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.filter-controls input,
	.filter-controls select {
		height: 28px;
		min-width: 135px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 8px;
		color: var(--text-primary);
		font-size: 10px;
		font-weight: 750;
		outline: none;
		box-sizing: border-box;
	}

	.filter-controls input:focus,
	.filter-controls select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.filter-controls button {
		height: 28px;
		padding: 0 12px;
		border: none;
		background: #2563eb;
		color: #ffffff;
		font-size: 10px;
		font-weight: 950;
		cursor: pointer;
	}

	.filter-controls button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.status-box {
		padding: 8px 10px;
		font-size: 11px;
		font-weight: 850;
	}

	.error-box {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.trace-loading-shell {
		grid-row: 2 / -1;
		min-height: 620px;
		display: grid;
		overflow: visible;
	}

	.trace-loading-shell :global(.loading-skeleton.trace-playback),
	.trace-loading-shell :global(.trace-skeleton-playback) {
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	.main-monitor-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(420px, 1fr) minmax(0, 1.75fr);
		align-items: stretch;
		gap: 10px;
	}

	.monitor-card,
	.playback-card,
	.info-card,
	.rpm-panel {
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
	}

	.monitor-card {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.map-card {
		height: auto;
		min-height: 0;
	}

	.card-header {
		height: 46px;
		min-height: 46px;
		padding: 8px 12px;
		border-bottom: 1px solid #e2e8f0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		box-sizing: border-box;
	}

	.card-title {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 950;
		line-height: 1.15;
	}

	.card-subtitle {
		margin-top: 2px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 750;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.coordinate-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 7px;
		background: var(--color-elevated);
		border: 1px solid #e2e8f0;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 850;
		white-space: nowrap;
	}

	.coordinate-separator {
		color: var(--text-muted);
	}

	.cctv-layout {
		flex: 1;
		min-height: 0;
		padding: 8px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

  .cctv-focus-layout {
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
  }

  .cctv-thumbnail-row {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    max-height: none;
    overflow-y: auto;
  }

  .cctv-camera-panel {
    min-width: 0;
    width: 100%;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    background: #111827;
    color: #ffffff;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto auto;
    cursor: pointer;
    text-align: left;
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .cctv-camera-main {
    flex: 0 0 auto;
    min-height: 0;
    cursor: default;
  }

  .cctv-camera-thumb {
    min-height: 0;
    border-radius: 9px;
  }

  .cctv-camera-panel:hover {
    transform: translateY(-2px);
    border-color: rgba(96, 165, 250, 0.56);
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.26);
  }

  .cctv-camera-main:hover {
    transform: none;
    border-color: rgba(148, 163, 184, 0.2);
    box-shadow: none;
  }

  .cctv-camera-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0)),
      #4f5658;
    overflow: hidden;
  }

  .cctv-camera-main .cctv-camera-info {
    min-height: 0;
    padding: 7px 10px 8px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 10px;
  }

  .cctv-camera-main .cctv-camera-info strong {
    grid-column: 1;
  }

  .cctv-camera-main .cctv-camera-info span {
    grid-column: 1;
  }

  .cctv-camera-main .cctv-camera-info small {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    white-space: nowrap;
  }

  .cctv-camera-frame::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background:
      linear-gradient(180deg, rgba(15, 23, 42, 0.1), rgba(15, 23, 42, 0.78)),
      linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: auto, 22px 22px, 22px 22px;
    pointer-events: none;
  }

  :global(.cctv-camera-image) {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cctv-frame-loading {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 8px;
    background:
      radial-gradient(circle at center, rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.56)),
      rgba(15, 23, 42, 0.18);
    color: #e2e8f0;
    pointer-events: none;
  }

  .cctv-frame-loading span {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    border: 3px solid rgba(147, 197, 253, 0.25);
    border-top-color: #60a5fa;
    animation: cctvFrameSpin 0.75s linear infinite;
  }

  .cctv-frame-loading small {
    color: #dbeafe;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  .cctv-frame-loading.compact {
    gap: 0;
  }

  .cctv-frame-loading.compact span {
    width: 22px;
    height: 22px;
    border-width: 2px;
  }

  @keyframes cctvFrameSpin {
    to {
      transform: rotate(360deg);
    }
  }

  .cctv-camera-info {
    min-width: 0;
    padding: 8px 9px 9px;
    display: grid;
    gap: 3px;
  }

  .cctv-camera-thumb .cctv-camera-info {
    padding: 5px 6px;
  }

  .cctv-camera-thumb .cctv-camera-info strong {
    font-size: 9px;
  }

  .cctv-camera-info strong {
    color: #f8fafc;
    font-size: 12px;
    line-height: 1.15;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cctv-camera-info span {
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cctv-camera-info small {
    color: #93c5fd;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .cctv-buffer-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

	.cctv-main-shell {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		min-height: 0;
		max-height: 100%;
		overflow: hidden;
		background: #4f5658;
	}

	.cctv-empty-shell {
		align-self: start;
		max-height: none;
		border-radius: 12px;
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

  .cctv-main {
    position: absolute;
    inset: 0;
    min-height: 0;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0)),
      #4f5658;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    will-change: transform, opacity;
  }

  .cctv-main.offline {
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0)),
      #6b7280;
  }

  .cctv-main.has-snapshot {
    background: #111827;
  }

  .cctv-main::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: 22px 22px;
    opacity: 0.25;
    z-index: 1;
  }

  .cctv-main.has-snapshot::before {
    background:
      linear-gradient(180deg, rgba(15, 23, 42, 0.58), rgba(15, 23, 42, 0.1) 42%, rgba(15, 23, 42, 0.82));
    opacity: 1;
  }

  :global(.cctv-snapshot-image) {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cctv-empty-main {
    text-align: center;
  }

  .cctv-scanline {
    position: absolute;
    left: 0;
    right: 0;
    top: -40%;
    height: 40%;
    background: linear-gradient(
      to bottom,
      transparent,
      rgba(255, 255, 255, 0.08),
      transparent
    );
    animation: cctvScan 1.4s ease-out;
    pointer-events: none;
    z-index: 2;
  }

  @keyframes cctvScan {
    from {
      top: -40%;
      opacity: 0.75;
    }

    to {
      top: 100%;
      opacity: 0;
    }
  }

  .cctv-overlay {
    position: relative;
    z-index: 3;
    display: grid;
    place-items: center;
    gap: 5px;
    color: #ffffff;
    animation: cctvTextPop 0.18s ease-out;
  }

  @keyframes cctvTextPop {
    from {
      transform: translateY(5px) scale(0.98);
      opacity: 0;
    }

    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  .camera-name {
    font-size: 15px;
    font-weight: 950;
  }

  .camera-status {
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    font-size: 10px;
    font-weight: 850;
  }

  .camera-file-size {
    color: #bfdbfe;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .cctv-error-text {
    color: #fca5a5;
  }

  .cctv-mini-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
    align-content: start;
    padding-right: 4px;
  }

  .cctv-mini {
    min-width: 0;
    width: 100%;
    aspect-ratio: 4 / 3;
    border: none;
    background: #53595b;
    color: #ffffff;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    cursor: pointer;
    transform: translateY(0) scale(1);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease,
    opacity 0.18s ease;
    will-change: transform, opacity;
    position: relative;
    overflow: hidden;
  }

  .cctv-mini::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.24), rgba(15, 23, 42, 0.78));
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .cctv-mini.has-snapshot::before {
    opacity: 1;
  }

  :global(.cctv-mini-snapshot) {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cctv-mini:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 5px 12px rgba(15, 23, 42, 0.24);
    background: #3f4648;
  }

  .cctv-mini.active {
    outline: 2px solid #60a5fa;
    outline-offset: -2px;
    box-shadow:
      0 0 0 2px rgba(37, 99, 235, 0.28),
      0 8px 18px rgba(37, 99, 235, 0.2);
  }

  .cctv-mini:active {
    transform: translateY(0) scale(0.97);
  }

  .cctv-mini span {
    position: relative;
    z-index: 2;
    font-size: 11px;
    font-weight: 950;
  }

  .cctv-mini small {
    position: relative;
    z-index: 2;
    color: #d8dee4;
    font-size: 8px;
    font-weight: 750;
  }

  .cctv-mini.offline {
    background: #7a7f82;
  }

  .cctv-buffering {
    cursor: default;
    pointer-events: none;
    background: #111827;
  }

  .cctv-buffering span,
  .cctv-buffering small {
    width: 62%;
    height: 12px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(148, 163, 184, 0.2);
  }

  .cctv-buffering small {
    width: 76%;
    height: 10px;
  }

  .cctv-buffering span::after,
  .cctv-buffering small::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent);
    animation: cctvBufferShimmer 1.25s infinite;
  }

  @keyframes cctvBufferShimmer {
    100% {
      transform: translateX(100%);
    }
  }

	.map-panel {
		flex: 1;
		height: auto;
		min-height: 0;
		position: relative;
		overflow: hidden;
		background: #d9d9d9;
	}

	.map-panel :global(.vessel-map-root) {
		height: 100%;
		min-height: 0;
	}

	.bottom-panel {
		min-height: 0;
		display: grid;
		grid-template-rows: auto auto;
		gap: 10px;
		overflow: visible;
	}

	.bottom-data-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: 1.15fr 1.35fr;
		gap: 10px;
		overflow: hidden;
	}

	.playback-card {
		min-width: 0;
		min-height: 52px;
		padding: 8px 10px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) 190px;
		align-items: center;
		gap: 10px;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.playback-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
	}

	.play-button,
	.step-btn {
		height: 28px;
		border: 1px solid #93b4ec;
		background: #2563eb;
		color: #ffffff;
		font-size: 11px;
		font-weight: 950;
		cursor: pointer;
	}

	.play-button {
		min-width: 64px;
		padding: 0 10px;
	}

	.step-btn {
		width: 30px;
		font-size: 18px;
		line-height: 1;
	}

	.play-button:disabled,
	.step-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.timeline {
		position: relative;
		height: 22px;
		border: none;
		background: transparent;
		padding: 0;
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.timeline:active {
		cursor: grabbing;
	}

	.timeline-track,
	.timeline-buffer,
	.timeline-progress,
	.timeline-dot {
		pointer-events: none;
	}

	.timeline-track {
		position: absolute;
		left: 0;
		right: 0;
		top: 9px;
		height: 3px;
		background: #d5dbe3;
	}

	.timeline-buffer {
		position: absolute;
		left: 0;
		top: 9px;
		height: 3px;
		background: #64748b;
		opacity: 0.72;
		transition: width 0.28s ease;
	}

	.timeline-progress {
		position: absolute;
		left: 0;
		top: 9px;
		height: 3px;
		background: #2563eb;
	}

	.timeline-dot {
		position: absolute;
		top: 4px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #2563eb;
		border: 2px solid #ffffff;
		box-shadow: 0 0 0 1px #2563eb;
		transform: translateX(-50%);
	}

	.timeline-time {
		display: grid;
		gap: 3px;
		text-align: right;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 850;
		white-space: nowrap;
	}

	.timeline-time strong {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 850;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.compact-info-grid {
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 8px;
		overflow: hidden;
	}

	.info-card {
		min-width: 0;
		min-height: 0;
		padding: 8px 6px;
		display: grid;
		align-content: center;
		gap: 5px;
		text-align: center;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		box-sizing: border-box;
	}

	.info-card span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 950;
		text-transform: uppercase;
	}

	.info-card strong {
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 950;
		line-height: 1.1;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rpm-panel {
		min-width: 0;
		min-height: 0;
		padding: 8px;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 7px;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.rpm-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.rpm-header span {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 950;
	}

	.rpm-header strong {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
	}

	.rpm-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
		overflow: hidden;
	}

	.rpm-card {
		min-width: 0;
		min-height: 0;
		padding: 6px 8px;
		background: var(--color-elevated);
		border: 1px solid #e2e8f0;
		display: grid;
		align-content: center;
		gap: 4px;
		text-align: center;
		box-sizing: border-box;
	}

	.rpm-card span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 900;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rpm-card strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 950;
		white-space: nowrap;
	}

	.rpm-empty {
		padding: 12px;
		background: var(--color-elevated);
		border: 1px dashed #cbd5e1;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 850;
		text-align: center;
	}

	.raw-box {
		margin: 10px;
		background: #0f172a;
		color: #e5e7eb;
		border: 1px solid #1e293b;
	}

	.raw-box summary {
		padding: 10px 12px;
		cursor: pointer;
		font-size: 11px;
		font-weight: 900;
	}

	.raw-box pre {
		max-height: 420px;
		margin: 0;
		padding: 12px;
		overflow: auto;
		border-top: 1px solid #1e293b;
		font-size: 11px;
		line-height: 1.45;
	}

	@media (max-width: 1200px) {
		.trace-viewport {
			height: auto;
			max-height: none;
			min-height: 100vh;
			overflow: visible;
		}

		.main-monitor-grid {
			grid-template-columns: 1fr;
		}

		.map-card {
			height: auto;
			min-height: 0;
		}

		.cctv-layout {
			min-height: 0;
		}

		.cctv-main-shell {
			max-width: min(100%, 680px);
			margin: 0 auto;
		}

		.map-panel {
			height: auto;
			min-height: 440px;
		}

		.map-panel :global(.vessel-map-root) {
			min-height: 440px;
		}

		.bottom-panel {
			height: auto;
			min-height: 0;
			max-height: none;
			grid-template-rows: auto auto;
			grid-template-columns: 1fr;
			overflow: visible;
		}

		.trace-loading-shell {
			grid-row: auto;
			display: block;
			overflow: visible;
		}
	}

	@media (max-width: 760px) {
		.trace-viewport {
			padding: 8px;
		}

		.map-panel {
			min-height: 360px;
		}

		.map-panel :global(.vessel-map-root) {
			min-height: 360px;
		}

		.compact-filter-card {
			grid-template-columns: 1fr;
		}

		.filter-controls {
			justify-content: flex-start;
		}

		.filter-controls label,
		.filter-controls input,
		.filter-controls select,
		.filter-controls button {
			width: 100%;
			min-width: 0;
		}

		.compact-info-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.rpm-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.coordinate-badge {
			display: none;
		}
	}
</style>
