<script>
	import { flushSync, onDestroy } from 'svelte';
	import VesselMap from '$lib/VesselMap.svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import {
		getCctvMotionDetail,
		getVesselCctvSnapshots,
		getVesselTrace,
		getVesselTraceMarkRecords
	} from '$lib/api/traceApi.js';
	import { fade, scale } from 'svelte/transition';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import CctvSnapshotImage from '$lib/components/CctvSnapshotImage.svelte';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';
	import { getAutoTimezoneLabelFromSources } from '$lib/utils/autoTimezoneLabel.js';

	let { active = false } = $props();

	let loading = $state(false);
	let error = $state('');
	let traceData = $state(null);

	let isPlaying = $state(false);
	let activeIndex = $state(0);
	let activePlaybackTimestampMs = $state(NaN);
	let playbackRenderTick = $state(0);
	let playbackInterval = null;
	let playbackClockStartedAtRealMs = 0;
	let playbackClockStartedAtTraceMs = NaN;
	let lastPlaybackToggleAt = 0;
	let playbackSpeedMultiplier = $state(1);
	let playbackDirection = $state(1);

	let startDateTime = $state('');
	let endDateTime = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');
	let activeTimePreset = $state('');
	let hasLoadedDateRange = $state(false);
	let shouldShowDateRangeOverlay = $derived(
		!hasLoadedDateRange || !startDateTime || !endDateTime
	);
	let autoTimezoneLabel = $derived(
		getAutoTimezoneLabelFromSources(traceData, traceData?.data, $selectedVesselInfo)
	);

	let cctvItems = $state([]);
	let cctvSnapshotsError = $state('');
	let cctvSnapshotsTotal = $state(0);
	let cctvSnapshotsTotalPages = $state(1);
	let cctvSnapshotsBuffering = $state(false);
	let cctvSnapshotsLoadedPages = $state(0);
	let cctvSnapshotsLoadedPageNumbers = $state([]);
	let cctvSnapshotBufferPivotPage = $state(1);
	let selectedCctvPanelKey = $state('');
	let cctvSnapshotRequestId = 0;
	let traceMarks = $state([]);
	let traceMarksError = $state('');
	let selectedTraceMarkCameraKeys = $state([]);
	let activeTraceMarkKey = $state('');
	let traceMarkRequestId = 0;
	let motionVideoOpen = $state(false);
	let motionVideoLoading = $state(false);
	let motionVideoError = $state('');
	let motionVideoDetail = $state(null);
	let motionVideoRequestId = 0;
	let cctvSnapshotPageRequests = new Set();
	const CCTV_SNAPSHOT_PAGE_SIZE = 50;
	const ENABLE_CCTV_BACKGROUND_BUFFER = true;
	const CCTV_BACKGROUND_PAGE_DELAY_MS = 900;
	const TRACE_MS_PER_REAL_MS = 60;
	const PLAYBACK_TICK_INTERVAL_MS = 100;
	const PLAYBACK_SPEED_OPTIONS = [1, 2, 5, 10];
	const MAX_TRACE_POINT_JUMP_NM = 1000;
	const MAX_TRACE_POINT_SPEED_KN = 80;
	const TRACE_DEBUG = false;

	function traceDebug(...args) {
		if (TRACE_DEBUG) console.log(...args);
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function waitForIdle(timeout = 900) {
		return new Promise((resolve) => {
			if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
				window.requestIdleCallback(() => resolve(), { timeout });
				return;
			}

			setTimeout(resolve, timeout);
		});
	}

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	const TIME_PRESETS = [
		{ id: 'today', label: 'Today' },
		{ id: 'yesterday', label: 'Yesterday' },
		{ id: 'two-days-before', label: '2 Days before' },
		{ id: 'one-week', label: 'a Week' },
		{ id: 'two-weeks', label: '2 Weeks' }
	];

	function toDatetimeLocalValue(date) {
		if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	function startOfLocalDay(date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
	}

	function endOfLocalDay(date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 0, 0);
	}

	function addLocalDays(date, amount) {
		const nextDate = new Date(date);
		nextDate.setDate(nextDate.getDate() + amount);
		return nextDate;
	}

	function applyTimePreset(presetId) {
		const now = new Date();
		let start = null;
		let end = null;

		if (presetId === 'today') {
			start = startOfLocalDay(now);
			end = startOfLocalDay(addLocalDays(now, 1));
		} else if (presetId === 'yesterday') {
			const yesterday = addLocalDays(now, -1);
			start = startOfLocalDay(yesterday);
			end = startOfLocalDay(now);
		} else if (presetId === 'two-days-before') {
			const twoDaysBefore = addLocalDays(now, -2);
			start = startOfLocalDay(twoDaysBefore);
			end = startOfLocalDay(addLocalDays(now, -1));
		} else if (presetId === 'one-week') {
			end = startOfLocalDay(now);
			start = startOfLocalDay(addLocalDays(now, -7));
		} else if (presetId === 'two-weeks') {
			end = startOfLocalDay(now);
			start = startOfLocalDay(addLocalDays(now, -14));
		}

		if (!start || !end) return;

		activeTimePreset = presetId;
		startDateTime = toDatetimeLocalValue(start);
		endDateTime = toDatetimeLocalValue(end);
		hasLoadedDateRange = false;
	}

	function clearActiveTimePreset() {
		activeTimePreset = '';
		hasLoadedDateRange = false;
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

	function getTraceFuelPerHour(item = {}) {
		const explicitHourlyValue =
			item.fuelPerHour ??
			item.fuel_per_hour ??
			item.fuel_lph ??
			item.fuel_l_per_hour ??
			item.fuel_lh ??
			item.fuelHour ??
			item.fuel_hour;
		const explicitHourly = Number(explicitHourlyValue);
		if (Number.isFinite(explicitHourly)) return explicitHourly;

		const perMinuteValue =
			item.fuelPerMinute ??
			item.fuel_per_minute ??
			item.fuelRate ??
			item.fuel_rate ??
			item.f_rate;
		const perMinute = Number(perMinuteValue);
		return Number.isFinite(perMinute) ? perMinute * 60 : 0;
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

		if (/^\d+(?:\.\d+)?$/.test(rawValue)) {
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
					payload?.total_items ??
					payload?.totalItems ??
					payload?.pagination?.total ??
					payload?.pagination?.totalItems ??
					payload?.pagination?.total_items ??
					payload?.meta?.total ??
					items.length
			) || 0;
		cctvSnapshotsTotalPages =
			Number(
				payload?.totalPages ??
					payload?.total_pages ??
					payload?.pagination?.totalPages ??
					payload?.pagination?.total_pages ??
					payload?.meta?.totalPages ??
					payload?.meta?.total_pages
			) || Math.max(1, Math.ceil((Number(cctvSnapshotsTotal) || 0) / CCTV_SNAPSHOT_PAGE_SIZE));

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

	function normalizeTraceMarkRecords(value) {
		const payload = value?.data || value || {};
		const cameras = Array.isArray(payload?.cameras) ? payload.cameras : [];

		return cameras
			.flatMap((camera, cameraIndex) => {
				const recordings = Array.isArray(camera?.recordings) ? camera.recordings : [];
				const cameraName = camera?.cameraName || camera?.camera_name || `Camera ${cameraIndex + 1}`;
				const cameraToken = camera?.cameraToken || camera?.camera_token || '';

				return recordings.map((recording, recordingIndex) => {
					const timestampMs = Number.isFinite(Number(recording?.timestamp))
						? Number(recording.timestamp)
						: parseDateTimeMs(recording?.startedAt || recording?.started_at);
					const startedAt = recording?.startedAt || recording?.started_at || '';
					const id = recording?.id || `${cameraToken || cameraName}-${recordingIndex}`;

					return {
						key: `${cameraToken || cameraName}|${id}|${timestampMs}`,
						id,
						cameraName,
						cameraToken,
						timestampMs,
						startedAt,
						startedAtText: startedAt || formatTimestampMs(timestampMs),
						thumbnailUrl: recording?.thumbnailUrl || recording?.thumbnail_url || ''
					};
				});
			})
			.filter((recording) => Number.isFinite(recording.timestampMs))
			.sort((a, b) => a.timestampMs - b.timestampMs);
	}

	function groupTraceMarkRecords(recordings = []) {
		const groupedMarks = new Map();

		for (const recording of recordings) {
			const timestampMs = Number(recording?.timestampMs);
			if (!Number.isFinite(timestampMs)) continue;

			const key = `motion-mark-${timestampMs}`;
			const existingMark = groupedMarks.get(key);

			if (existingMark) {
				existingMark.recordings.push(recording);
				continue;
			}

			groupedMarks.set(key, {
				key,
				timestampMs,
				startedAtText: recording.startedAtText,
				recordings: [recording]
			});
		}

		return Array.from(groupedMarks.values()).sort((a, b) => a.timestampMs - b.timestampMs);
	}

	function getTraceMarkCameraKey(recording) {
		return String(recording?.cameraToken || recording?.cameraName || '').trim();
	}

	function buildTraceMarkCameraOptions(recordings = []) {
		const options = new Map();

		for (const recording of recordings) {
			const key = getTraceMarkCameraKey(recording);
			if (!key || options.has(key)) continue;

			options.set(key, {
				key,
				name: recording.cameraName || 'Unnamed camera'
			});
		}

		return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
	}

	function toggleTraceMarkCamera(cameraKey, checked) {
		if (checked) {
			selectedTraceMarkCameraKeys = Array.from(
				new Set([...selectedTraceMarkCameraKeys, cameraKey])
			);
		} else {
			selectedTraceMarkCameraKeys = selectedTraceMarkCameraKeys.filter(
				(key) => key !== cameraKey
			);
		}

		activeTraceMarkKey = '';
	}

	function toggleAllTraceMarkCameras(checked, options) {
		selectedTraceMarkCameraKeys = checked ? options.map((option) => option.key) : [];
		activeTraceMarkKey = '';
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
		const explicitTotalPages = Number(cctvSnapshotsTotalPages);
		if (Number.isFinite(explicitTotalPages) && explicitTotalPages > 1) {
			return Math.max(1, Math.ceil(explicitTotalPages));
		}

		return Math.max(1, Math.ceil((Number(total) || 0) / CCTV_SNAPSHOT_PAGE_SIZE));
	}

	function markCctvPageLoaded(page) {
		const pageNumber = Number(page);
		if (!Number.isInteger(pageNumber) || pageNumber < 1) return;

		if (!cctvSnapshotsLoadedPageNumbers.includes(pageNumber)) {
			cctvSnapshotsLoadedPageNumbers = [...cctvSnapshotsLoadedPageNumbers, pageNumber].sort(
				(a, b) => a - b
			);
		}

		cctvSnapshotsLoadedPages = cctvSnapshotsLoadedPageNumbers.length;
	}

	function isCctvPageLoaded(page) {
		const pageNumber = Number(page);
		return Number.isInteger(pageNumber) && cctvSnapshotsLoadedPageNumbers.includes(pageNumber);
	}

	function isCctvPageRequesting(page, requestId = cctvSnapshotRequestId) {
		const pageNumber = Number(page);
		return (
			Number.isInteger(pageNumber) &&
			cctvSnapshotPageRequests.has(`${requestId}|${pageNumber}`)
		);
	}

	function getNextCctvBufferPage(totalPages = getCctvTotalPages(), requestId = cctvSnapshotRequestId) {
		const normalizedTotalPages = Math.max(1, Number(totalPages) || 1);
		const pivotPage = Math.min(
			normalizedTotalPages,
			Math.max(1, Number(cctvSnapshotBufferPivotPage) || 1)
		);

		for (let distance = 0; distance < normalizedTotalPages; distance += 1) {
			const candidates =
				distance === 0
					? [pivotPage]
					: [pivotPage + distance, pivotPage - distance];

			for (const page of candidates) {
				if (page < 1 || page > normalizedTotalPages) continue;
				if (isCctvPageLoaded(page) || isCctvPageRequesting(page, requestId)) continue;
				return page;
			}
		}

		return null;
	}

	function getCctvPageForTimestamp(timestampMs) {
		const startMs = getRangeTimestampMs(startDateTime);
		const endMs = getRangeTimestampMs(endDateTime);
		const totalPages = getCctvTotalPages();

		if (
			!Number.isFinite(timestampMs) ||
			!Number.isFinite(startMs) ||
			!Number.isFinite(endMs) ||
			endMs <= startMs ||
			totalPages <= 1
		) {
			return 1;
		}

		const ratio = Math.min(1, Math.max(0, (timestampMs - startMs) / (endMs - startMs)));
		return Math.min(totalPages, Math.max(1, Math.floor(ratio * totalPages) + 1));
	}

	function getCctvBufferSegments() {
		const totalPages = getCctvTotalPages();
		if (!cctvSnapshotsLoadedPageNumbers.length || totalPages <= 0) return [];

		const loadedPages = cctvSnapshotsLoadedPageNumbers
			.filter((page) => Number.isInteger(page) && page >= 1 && page <= totalPages)
			.sort((a, b) => a - b);

		if (!loadedPages.length) return [];

		const ranges = [];

		for (const page of loadedPages) {
			const lastRange = ranges.at(-1);

			if (lastRange && page === lastRange.endPage + 1) {
				lastRange.endPage = page;
			} else {
				ranges.push({
					startPage: page,
					endPage: page
				});
			}
		}

		return ranges.map((range) => {
			const left = ((range.startPage - 1) / totalPages) * 100;
			const width = ((range.endPage - range.startPage + 1) / totalPages) * 100;

			return {
				key: `${range.startPage}-${range.endPage}`,
				startPage: range.startPage,
				endPage: range.endPage,
				left: Math.min(100, Math.max(0, left)),
				width: Math.min(100 - left, Math.max(0, width))
			};
		});
	}

	function getRangeTimestampMs(value) {
		if (!value) return NaN;

		const parsed = new Date(value).getTime();
		if (Number.isFinite(parsed)) return parsed;

		return parseDateTimeMs(value);
	}

	function getTraceMarkPosition(timestampMs, events = timelineEvents) {
		let { start, end } = getTimelineBounds(events);

		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
			start = getRangeTimestampMs(startDateTime);
			end = getRangeTimestampMs(endDateTime);
		}

		if (!Number.isFinite(timestampMs) || !Number.isFinite(start) || !Number.isFinite(end)) {
			return 0;
		}

		if (end <= start) return 0;
		return Math.min(100, Math.max(0, ((timestampMs - start) / (end - start)) * 100));
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

		const index = lowerBoundSnapshotIndex(snapshots, timestampMs + 1) - 1;
		return snapshots[Math.max(0, index)] || null;
	}

	function lowerBoundSnapshotIndex(snapshots = [], timestampMs) {
		let low = 0;
		let high = snapshots.length;

		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			const midTime = snapshots[mid]?.timestampMs;

			if (!Number.isFinite(midTime) || midTime < timestampMs) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}

		return low;
	}

	function findPlaybackCctvSnapshot(snapshots = [], timestampMs) {
		if (!snapshots.length) return null;

		if (!Number.isFinite(timestampMs)) {
			return snapshots[0] || null;
		}

		const minuteStart = Math.floor(timestampMs / 60000) * 60000;
		const minuteEnd = minuteStart + 60000;
		const minuteStartIndex = lowerBoundSnapshotIndex(snapshots, minuteStart);
		const minuteEndIndex = lowerBoundSnapshotIndex(snapshots, minuteEnd);
		const minuteCount = Math.max(0, minuteEndIndex - minuteStartIndex);

		if (minuteCount) {
			const slotDurationMs = 60000 / minuteCount;
			const slotIndex = Math.min(
				minuteCount - 1,
				Math.max(0, Math.floor((timestampMs - minuteStart) / slotDurationMs))
			);

			return snapshots[minuteStartIndex + slotIndex] || null;
		}

		return findClosestCctvSnapshot(snapshots, timestampMs);
	}

	function buildCctvCameraIndex(items = []) {
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
			panel.snapshots.sort((a, b) => {
				if (!Number.isFinite(a.timestampMs) && !Number.isFinite(b.timestampMs)) return 0;
				if (!Number.isFinite(a.timestampMs)) return 1;
				if (!Number.isFinite(b.timestampMs)) return -1;
				return a.timestampMs - b.timestampMs;
			});

			return panel;
		});
	}

	function getCctvCameraPanels(cameraIndex = [], timestampMs = NaN, renderTick = 0) {
		renderTick;

		return cameraIndex.map((panel) => {
			const snapshots = panel.snapshots || [];
			const activeSnapshot = findPlaybackCctvSnapshot(snapshots, timestampMs);

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

	function findTimelineIndexAtOrBefore(events = [], timestampMs) {
		if (!Number.isFinite(timestampMs) || !events.length) return -1;

		let previousIndex = -1;

		for (let index = 0; index < events.length; index += 1) {
			const eventTime = events[index]?.timestampMs;
			if (!Number.isFinite(eventTime)) continue;

			if (eventTime <= timestampMs) {
				previousIndex = index;
			} else {
				break;
			}
		}

		return previousIndex >= 0 ? previousIndex : 0;
	}

	function findTraceIndexAtOrBefore(timestampMs, points = tracePoints) {
		if (!Number.isFinite(timestampMs) || !points.length) return -1;

		let previousIndex = -1;

		for (let index = 0; index < points.length; index += 1) {
			const pointTime = parseDateTimeMs(points[index]?.timestampRaw || points[index]?.timestamp);
			if (!Number.isFinite(pointTime)) continue;

			if (pointTime <= timestampMs) {
				previousIndex = index;
			} else {
				break;
			}
		}

		return previousIndex >= 0 ? previousIndex : 0;
	}

	function getTimelineBounds(events = timelineEvents) {
		const validEvents = events.filter((event) => Number.isFinite(event?.timestampMs));

		return {
			start: validEvents[0]?.timestampMs ?? NaN,
			end: validEvents.at(-1)?.timestampMs ?? NaN
		};
	}

	function clampPlaybackTimestamp(timestampMs, events = timelineEvents) {
		const { start, end } = getTimelineBounds(events);
		if (!Number.isFinite(timestampMs)) return Number.isFinite(start) ? start : NaN;
		if (Number.isFinite(start) && timestampMs < start) return start;
		if (Number.isFinite(end) && timestampMs > end) return end;
		return timestampMs;
	}

	function setPlaybackTimestamp(timestampMs, { bumpRender = true } = {}) {
		const nextTimestamp = clampPlaybackTimestamp(timestampMs);
		if (!Number.isFinite(nextTimestamp)) return;

		activePlaybackTimestampMs = nextTimestamp;
		const nextIndex = findTimelineIndexAtOrBefore(timelineEvents, nextTimestamp);
		if (nextIndex >= 0) activeIndex = nextIndex;
		if (bumpRender) playbackRenderTick += 1;
	}

	function getCurrentTimelineTimestampMs() {
		if (Number.isFinite(activePlaybackTimestampMs)) return activePlaybackTimestampMs;

		const eventTimestamp = timelineEvents[activeIndex]?.timestampMs;
		if (Number.isFinite(eventTimestamp)) return eventTimestamp;

		return parseDateTimeMs(activePoint?.timestampRaw || activePoint?.timestamp);
	}

	function applyCctvItems(nextItems = [], { preserveTimeline = true } = {}) {
		const previousTimestamp = getCurrentTimelineTimestampMs();
		const nextEvents = preserveTimeline ? buildMergedTimelineEvents(tracePoints, nextItems) : [];

		cctvItems = nextItems;

		if (preserveTimeline && Number.isFinite(previousTimestamp) && nextEvents.length) {
			const nextIndex = findTimelineIndexAtOrBefore(nextEvents, previousTimestamp);
			if (nextIndex >= 0) activeIndex = nextIndex;
			activePlaybackTimestampMs = clampPlaybackTimestamp(previousTimestamp, nextEvents);
		}
	}

	async function loadCctvSnapshotPage({
		requestId,
		vesselId,
		startTime,
		endTime,
		page,
		preserveTimeline = true,
		source = 'buffer'
	}) {
		const pageNumber = Number(page);
		if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
		if (requestId !== cctvSnapshotRequestId) return null;
		if (isCctvPageLoaded(pageNumber)) return null;

		const requestKey = `${requestId}|${pageNumber}`;
		if (cctvSnapshotPageRequests.has(requestKey)) return null;

		cctvSnapshotPageRequests.add(requestKey);

		try {
			traceDebug('[TRACE_CCTV_PAGE_REQUEST]', {
				source,
				page: pageNumber,
				totalPages: getCctvTotalPages(),
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
				page: pageNumber,
				pageSize: CCTV_SNAPSHOT_PAGE_SIZE
			});

			if (requestId !== cctvSnapshotRequestId) return null;

			const nextItems = normalizeCctvSnapshots(result);
			const beforeMergeCount = cctvItems.length;
			applyCctvItems(mergeCctvSnapshots(cctvItems, nextItems), { preserveTimeline });
			markCctvPageLoaded(pageNumber);

			traceDebug('[TRACE_CCTV_PAGE_LOADED]', {
				source,
				page: pageNumber,
				totalPages: getCctvTotalPages(),
				normalizedItems: nextItems.length,
				beforeMergeCount,
				afterMergeCount: cctvItems.length,
				totalSnapshots: cctvSnapshotsTotal
			});

			return result;
		} finally {
			cctvSnapshotPageRequests.delete(requestKey);
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
			while (cctvSnapshotsLoadedPageNumbers.length < totalPages) {
				const page = getNextCctvBufferPage(totalPages, requestId);
				if (!page) return;

				if (requestId !== cctvSnapshotRequestId) {
					traceDebug('[TRACE_CCTV_PAGE_SKIP_STALE]', {
						page,
						requestId,
						activeRequestId: cctvSnapshotRequestId
					});
					return;
				}

				await waitForIdle();
				await sleep(CCTV_BACKGROUND_PAGE_DELAY_MS);

				if (requestId !== cctvSnapshotRequestId) return;
				if (isCctvPageLoaded(page)) continue;

				const result = await loadCctvSnapshotPage({
					requestId,
					vesselId,
					startTime,
					endTime,
					page,
					preserveTimeline: true,
					source: 'background-buffer'
				});

				if (requestId !== cctvSnapshotRequestId) return;
				if (!result) continue;
			}
		} catch (err) {
			console.error('[VESSEL_TRACE_CCTV_BUFFER_ERROR]', err);
			cctvSnapshotsError = err?.message || 'Failed to buffer remaining CCTV snapshots.';
		} finally {
			if (requestId === cctvSnapshotRequestId) {
				cctvSnapshotsBuffering = false;
				traceDebug('[TRACE_CCTV_BUFFER_DONE]', {
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
		cctvSnapshotsTotalPages = 1;
		cctvSnapshotsLoadedPages = 0;
		cctvSnapshotsLoadedPageNumbers = [];
		cctvSnapshotBufferPivotPage = 1;
		cctvSnapshotPageRequests.clear();
		cctvSnapshotsBuffering = false;

		traceDebug('[TRACE_CCTV_PAGE_REQUEST]', {
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
		markCctvPageLoaded(1);

		const totalPages = getCctvTotalPages();

		traceDebug('[TRACE_CCTV_PAGE_LOADED]', {
			page: 1,
			totalPages,
			normalizedItems: firstItems.length,
			beforeMergeCount: 0,
			afterMergeCount: cctvItems.length,
			totalSnapshots: cctvSnapshotsTotal
		});

		if (totalPages > 1 && ENABLE_CCTV_BACKGROUND_BUFFER) {
			traceDebug('[TRACE_CCTV_BUFFER_START]', {
				totalPages,
				pivotPage: cctvSnapshotBufferPivotPage,
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
			traceDebug('[TRACE_CCTV_BUFFER_SKIPPED_FOR_FIRST_PAGE_TEST]', {
				totalPages,
				loadedPages: cctvSnapshotsLoadedPages,
				loadedItems: cctvItems.length,
				totalSnapshots: cctvSnapshotsTotal
			});
		}

		return firstPageResult;
	}

	async function ensureCctvPageForTimestamp(timestampMs, source = 'timeline-seek') {
		if (!Number.isFinite(timestampMs)) return;
		if (!$selectedVesselId || !startDateTime || !endDateTime) return;
		if (!cctvSnapshotsTotal || getCctvTotalPages() <= 1) return;

		const targetPage = getCctvPageForTimestamp(timestampMs);
		cctvSnapshotBufferPivotPage = targetPage;
		if (isCctvPageLoaded(targetPage)) return;

		const requestId = cctvSnapshotRequestId;
		const cctvStart = toSnapshotApiDateTime(startDateTime);
		const cctvEnd = toSnapshotApiDateTime(endDateTime);

		try {
			await loadCctvSnapshotPage({
				requestId,
				vesselId: $selectedVesselId,
				startTime: cctvStart,
				endTime: cctvEnd,
				page: targetPage,
				preserveTimeline: true,
				source
			});
		} catch (err) {
			console.error('[VESSEL_TRACE_CCTV_SEEK_PAGE_ERROR]', err);
			cctvSnapshotsError = err?.message || 'Failed to load CCTV snapshots near selected time.';
		}
	}

	function ensureCctvPageForCurrentTimeline(source = 'timeline-seek') {
		const timestampMs = getCurrentTimelineTimestampMs();
		void ensureCctvPageForTimestamp(timestampMs, source);
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

	function getEngineRpmSortRank(engineName = '') {
		const normalized = String(engineName).trim().toUpperCase();
		const compact = normalized.replace(/[\s_-]+/g, '');

		if (/^(ME|MAINENGINE)/.test(compact) || /\bME\b/.test(normalized)) return 0;
		if (/^(AE|AUX|AUXILIARYENGINE)/.test(compact) || /\bAE\b/.test(normalized)) return 1;
		return 2;
	}

	function getEngineSideSortRank(engineName = '') {
		const normalized = String(engineName).trim().toUpperCase();

		if (/\bPORT\b|\bPS\b/.test(normalized)) return 0;
		if (/\bCENTER\b|\bCENTRE\b|\bCTR\b/.test(normalized)) return 1;
		if (/\bSTBD\b|\bSTARBOARD\b|\bSB\b/.test(normalized)) return 2;
		return 3;
	}

	function sortRpmEntriesByEnginePriority(entries = []) {
		return [...entries].sort(([engineNameA], [engineNameB]) => {
			const engineRankA = getEngineRpmSortRank(engineNameA);
			const engineRankB = getEngineRpmSortRank(engineNameB);

			if (engineRankA !== engineRankB) return engineRankA - engineRankB;

			const sideRankA = getEngineSideSortRank(engineNameA);
			const sideRankB = getEngineSideSortRank(engineNameB);

			if (sideRankA !== sideRankB) return sideRankA - sideRankB;

			return String(engineNameA).localeCompare(String(engineNameB), undefined, {
				numeric: true,
				sensitivity: 'base'
			});
		});
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

	function normalizeOceanCurrent(value) {
		const ocean = value || {};

		return {
			speedKph: toNumber(
				ocean.speed_kph ?? ocean.speedKph ?? ocean.current_speed_kph ?? ocean.currentSpeedKph,
				NaN
			),
			directionTo:
				ocean.direction_to ??
				ocean.directionTo ??
				ocean.current_direction_to ??
				ocean.currentDirectionTo ??
				'',
			directionDeg: toNumber(
				ocean.direction_to_deg ??
					ocean.directionToDeg ??
					ocean.current_direction_to_deg ??
					ocean.currentDirectionToDeg,
				NaN
			)
		};
	}

	function normalizeTraceWeather(value) {
		if (!value) return '-';

		if (typeof value === 'string') return value || '-';

		if (typeof value === 'object') {
			const condition =
				value.condition ??
				value.weather ??
				value.label ??
				value.text ??
				value.current?.condition ??
				value.current?.weather ??
				'';
			const windDirection = value.wind_dir_deg ?? value.windDirDeg ?? value.wind_direction_deg;
			const windText =
				Number.isFinite(Number(windDirection))
					? `${formatNumber(windDirection, 0, '0')}°`
					: value.wind_dir ?? value.windDir ?? value.wind_direction ?? '';

			return [condition, windText ? `Wind ${windText}` : ''].filter(Boolean).join(' • ') || '-';
		}

		return String(value);
	}

	function formatOceanCurrent(ocean = {}) {
		const speed = Number(ocean?.speedKph);
		const degree = Number(ocean?.directionDeg);
		const direction = ocean?.directionTo ? String(ocean.directionTo) : '';
		const parts = [];

		if (Number.isFinite(speed)) parts.push(`${formatNumber(speed, 1, '0.0')} kph`);
		if (Number.isFinite(degree)) {
			parts.push(`${formatNumber(degree, 0, '0')}°`);
		} else if (direction) {
			parts.push(direction);
		}

		return parts.length ? parts.join(' • ') : '-';
	}

	function formatTraceDistance(value) {
		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		const digits = Math.abs(number) < 10 ? 3 : 2;
		return `${formatNumber(number, digits, '0')} NM`;
	}

	function calculateDistanceNm(fromPoint, toPoint) {
		const lat1 = Number(fromPoint?.latitude);
		const lng1 = Number(fromPoint?.longitude);
		const lat2 = Number(toPoint?.latitude);
		const lng2 = Number(toPoint?.longitude);

		if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;

		const toRadians = (degree) => (degree * Math.PI) / 180;
		const earthRadiusNm = 3440.065;
		const deltaLat = toRadians(lat2 - lat1);
		const deltaLng = toRadians(lng2 - lng1);
		const a =
			Math.sin(deltaLat / 2) ** 2 +
			Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return earthRadiusNm * c;
	}

	function isValidTraceCoordinate(lat, lng) {
		return (
			Number.isFinite(lat) &&
			Number.isFinite(lng) &&
			lat >= -90 &&
			lat <= 90 &&
			lng >= -180 &&
			lng <= 180 &&
			!(lat === 0 && lng === 0)
		);
	}

	function filterTracePointJumps(points = []) {
		const filtered = [];
		const dropped = [];

		points.forEach((point) => {
			const previous = filtered[filtered.length - 1];

			if (previous) {
				const distanceNm = calculateDistanceNm(previous, point);
				const previousTime = parseDateTimeMs(previous?.timestampRaw || previous?.timestamp);
				const pointTime = parseDateTimeMs(point?.timestampRaw || point?.timestamp);
				const elapsedHours =
					Number.isFinite(previousTime) && Number.isFinite(pointTime)
						? Math.max(Math.abs(pointTime - previousTime) / 3_600_000, 1 / 60)
						: 1 / 60;
				const allowedDistanceNm = Math.max(
					MAX_TRACE_POINT_JUMP_NM,
					MAX_TRACE_POINT_SPEED_KN * elapsedHours
				);

				if (distanceNm > allowedDistanceNm) {
					dropped.push({
						index: point.rawIndex ?? point.index,
						latitude: point.latitude,
						longitude: point.longitude,
						distanceNm,
						allowedDistanceNm,
						from: previous.timeFormatted || previous.timestamp,
						to: point.timeFormatted || point.timestamp
					});
					return;
				}
			}

			filtered.push({
				...point,
				index: filtered.length
			});
		});

		if (dropped.length) {
			traceDebug('[TRACE_POINTS_OUTLIERS_DROPPED]', {
				dropped: dropped.length,
				minThresholdNm: MAX_TRACE_POINT_JUMP_NM,
				maxSpeedKn: MAX_TRACE_POINT_SPEED_KN,
				samples: dropped.slice(0, 8)
			});
		}

		return filtered;
	}

	function getTracePayload(data) {
		const payload = data?.data && !Array.isArray(data?.data) ? data.data : data;
		return payload || {};
	}

	function getTraceCandidates(data) {
		const payload = getTracePayload(data);

		return (
			payload?.points ||
			payload?.trace ||
			payload?.traces ||
			payload?.coordinates ||
			payload?.path ||
			payload?.rows ||
			payload?.items ||
			payload?.result ||
			data?.data?.points ||
			data?.data?.trace ||
			data?.data?.coordinates ||
			data?.data?.path ||
			data?.data?.rows ||
			data?.data ||
			data ||
			[]
		);
	}

	function getTraceTimestampRaw(item = {}) {
		return (
			item.timestamp ??
			item.timestamp_ms ??
			item.timestampMs ??
			item.ts ??
			item.timeMs ??
			item.timeRaw ??
			item.time_raw ??
			item.time ??
			item.datetime ??
			item.createdAt ??
			item.created_at ??
			item.timeFormatted ??
			item.time_formatted ??
			''
		);
	}

	function getTraceDisplayTime(item = {}, timestampRaw = '') {
		const display =
			item.timeFormatted ??
			item.time_formatted ??
			item.displayTime ??
			item.display_time ??
			item.localTime ??
			item.local_time ??
			'';

		if (display) return formatDateTime(display);
		return formatDateTime(timestampRaw);
	}

	function getTracePoints(data) {
		const candidates = getTraceCandidates(data);

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

				if (!isValidTraceCoordinate(lat, lng)) return null;

				const rpm = normalizeRpm(item.rpm ?? item.me_rpm ?? item.mePortRpm ?? item.me_port_rpm);
				const timestampRaw = getTraceTimestampRaw(item);
				const timestampDisplay = getTraceDisplayTime(item, timestampRaw);

				return {
					index,
					rawIndex: index,
					latitude: lat,
					longitude: lng,
					heading: toNumber(item.heading ?? item.course ?? item.bearing, 0),
					speed: toNumber(item.speed ?? item.sog ?? item.speedOverGround, 0),
					distance: toNumber(
						item.distance ??
							item.distance_nm ??
							item.distanceNm ??
							item.totalDistance ??
							item.total_distance ??
							item.distance_traveled ??
							item.distanceTraveled,
						0
					),
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
					fuelPerHour: getTraceFuelPerHour(item),
					weather: normalizeTraceWeather(item.weather ?? item.weatherForecast ?? item.condition),
					ocean: normalizeOceanCurrent(item.ocean ?? item.oceanCurrent ?? item.current),
					queue: toNumber(item.queue, 0),
					sdCard: toNumber(item.sdCard ?? item.sd_card, 0),
					online: item.online === undefined ? true : Boolean(item.online),
					timeFormatted: timestampDisplay,
					timestampRaw,
					timestamp: timestampDisplay
				};
			})
			.filter(Boolean);

		const filteredPoints = filterTracePointJumps(points);

		traceDebug('[TRACE_POINTS_PARSED]', filteredPoints.length, filteredPoints.slice(0, 3));

		return filteredPoints;
	}

	let tracePoints = $derived(getTracePoints(traceData));
	let timelineEvents = $derived(buildMergedTimelineEvents(tracePoints, cctvItems));
	let traceMarkCameraOptions = $derived(buildTraceMarkCameraOptions(traceMarks));
	let filteredTraceMarks = $derived(
		traceMarks.filter((recording) =>
			selectedTraceMarkCameraKeys.includes(getTraceMarkCameraKey(recording))
		)
	);
	let timelineTraceMarks = $derived(
		groupTraceMarkRecords(filteredTraceMarks).map((mark) => ({
			...mark,
			left: getTraceMarkPosition(mark.timestampMs, timelineEvents)
		}))
	);
	let activeTimelineEvent = $derived(timelineEvents[activeIndex] || timelineEvents[0] || null);
	let activeTimelineTimestampMs = $derived(
		Number.isFinite(activePlaybackTimestampMs)
			? activePlaybackTimestampMs
			: activeTimelineEvent?.timestampMs ??
			parseDateTimeMs(tracePoints[activeIndex]?.timestampRaw || tracePoints[activeIndex]?.timestamp)
	);
	let activeTraceIndex = $derived(
		Number.isFinite(activeTimelineTimestampMs)
			? Math.max(0, findTraceIndexAtOrBefore(activeTimelineTimestampMs))
			: Number.isInteger(activeTimelineEvent?.traceIndex) && activeTimelineEvent.traceIndex >= 0
				? activeTimelineEvent.traceIndex
				: Math.max(0, findClosestTraceIndexByTime(activeTimelineTimestampMs))
	);
	let activeTimelineLabel = $derived(
		activeTimelineEvent?.label ||
			tracePoints[activeTraceIndex]?.timeFormatted ||
			tracePoints[activeTraceIndex]?.timestamp ||
			(Number.isFinite(activeTimelineTimestampMs) ? formatDateTime(activeTimelineTimestampMs) : '') ||
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
				distance: toNumber(
					$selectedVesselInfo?.distance ??
						$selectedVesselInfo?.distanceNm ??
						$selectedVesselInfo?.totalDistance ??
						$selectedVesselInfo?.total_distance,
					0
				),
				rpm: {},
				maxRpm: 0,
				avgRpm: 0,
				fuelPerMinute: 0,
				fuelPerHour: 0,
				weather: $selectedVesselInfo?.weather?.current?.condition || '-',
				ocean: normalizeOceanCurrent($selectedVesselInfo?.oceanCurrent?.current || {}),
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

	let activeRpmEntries = $derived(sortRpmEntriesByEnginePriority(Object.entries(activePoint.rpm || {})));

	let timelineProgress = $derived(
		(() => {
			const { start, end } = getTimelineBounds(timelineEvents);
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
			return Math.min(100, Math.max(0, ((activeTimelineTimestampMs - start) / (end - start)) * 100));
		})()
	);
	let cctvBufferedPercent = $derived(getCctvBufferedPercent(cctvItems));
	let cctvBufferSegments = $derived(getCctvBufferSegments());
	let cctvCameraIndex = $derived(buildCctvCameraIndex(cctvItems));

	let activeTraceTimestampMs = $derived(
		Number.isFinite(activeTimelineTimestampMs)
			? activeTimelineTimestampMs
			: parseDateTimeMs(activePoint?.timestampRaw || activePoint?.timestamp)
	);
	let cctvCameraPanels = $derived(
		getCctvCameraPanels(cctvCameraIndex, activeTraceTimestampMs, playbackRenderTick)
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
		distance: formatTraceDistance(activePoint.distance),
		maxRpm: `${formatNumber(activePoint.maxRpm, 0, '0')} RPM`,
		avgRpm: `${formatNumber(activePoint.avgRpm, 0, '0')} RPM`,
		fuelPerHour: `${formatNumber(activePoint.fuelPerHour, 2, '0.00')} L/h`,
		weatherForecast: activePoint.weather || $selectedVesselInfo?.weather?.current?.condition || '-',
		oceanCurrent: formatOceanCurrent(activePoint.ocean),
		lastUpdate: activeTimelineLabel || activePoint.timestamp || '-',
		onlineStatus: activePoint.online ? 'Online' : 'Offline'
	});

	function selectCctvPanel(panel) {
		if (!panel?.key) return;
		selectedCctvPanelKey = panel.key;
	}

	async function loadTrace() {
		stopPlayback('load-trace');
		if (motionVideoOpen) closeMotionVideo();

		if (!startDateTime || !endDateTime) {
			error = 'Please choose a start and end time first.';
			traceData = null;
			hasLoadedDateRange = false;
			activePlaybackTimestampMs = NaN;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			cctvSnapshotsTotalPages = 1;
			cctvSnapshotsBuffering = false;
			cctvSnapshotsLoadedPages = 0;
			cctvSnapshotsLoadedPageNumbers = [];
			cctvSnapshotBufferPivotPage = 1;
			cctvSnapshotPageRequests.clear();
			cctvSnapshotRequestId += 1;
			traceMarks = [];
			traceMarksError = '';
			selectedTraceMarkCameraKeys = [];
			activeTraceMarkKey = '';
			traceMarkRequestId += 1;
			return;
		}

		const startMs = getRangeTimestampMs(startDateTime);
		const endMs = getRangeTimestampMs(endDateTime);

		if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
			error = 'End time must be later than start time.';
			traceData = null;
			hasLoadedDateRange = false;
			activePlaybackTimestampMs = NaN;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			cctvSnapshotsTotalPages = 1;
			cctvSnapshotsBuffering = false;
			cctvSnapshotsLoadedPages = 0;
			cctvSnapshotsLoadedPageNumbers = [];
			cctvSnapshotBufferPivotPage = 1;
			cctvSnapshotPageRequests.clear();
			cctvSnapshotRequestId += 1;
			traceMarks = [];
			traceMarksError = '';
			selectedTraceMarkCameraKeys = [];
			activeTraceMarkKey = '';
			traceMarkRequestId += 1;
			return;
		}

		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			traceData = null;
			hasLoadedDateRange = false;
			activePlaybackTimestampMs = NaN;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			cctvSnapshotsTotalPages = 1;
			cctvSnapshotsBuffering = false;
			cctvSnapshotsLoadedPages = 0;
			cctvSnapshotsLoadedPageNumbers = [];
			cctvSnapshotBufferPivotPage = 1;
			cctvSnapshotPageRequests.clear();
			cctvSnapshotRequestId += 1;
			traceMarks = [];
			traceMarksError = '';
			selectedTraceMarkCameraKeys = [];
			activeTraceMarkKey = '';
			traceMarkRequestId += 1;
			return;
		}

		loading = true;
		error = '';
		cctvSnapshotsError = '';
		cctvSnapshotRequestId += 1;
		traceMarks = [];
		traceMarksError = '';
		selectedTraceMarkCameraKeys = [];
		activeTraceMarkKey = '';
		const markRequestId = ++traceMarkRequestId;

		try {
			const traceStart = toApiDateTime(startDateTime);
			const traceEnd = toApiDateTime(endDateTime);
			const cctvStart = toSnapshotApiDateTime(startDateTime);
			const cctvEnd = toSnapshotApiDateTime(endDateTime);

			traceDebug('[TRACE_CCTV_SNAPSHOTS_LOAD_PARAMS]', {
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

			const [result] = await Promise.all([
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
				}),
				getVesselTraceMarkRecords({
					vesselId: $selectedVesselId,
					start: traceStart,
					end: traceEnd,
					timezoneMode,
					timezoneOffset: timezoneMode === 'manual' ? timezoneOffset : ''
				})
					.then((markResult) => {
						if (markRequestId !== traceMarkRequestId) return null;
						const normalizedMarks = normalizeTraceMarkRecords(markResult);
						traceMarks = normalizedMarks;
						selectedTraceMarkCameraKeys = buildTraceMarkCameraOptions(normalizedMarks).map(
							(option) => option.key
						);
						return markResult;
					})
					.catch((markError) => {
						if (markRequestId !== traceMarkRequestId) return null;
						console.error('[VESSEL_TRACE_MARK_RECORDS_ERROR]', markError);
						traceMarks = [];
						selectedTraceMarkCameraKeys = [];
						traceMarksError = markError?.message || 'Failed to load CCTV motion marks.';
						return null;
				})
			]);

			traceData = result;
			hasLoadedDateRange = true;
			activeIndex = 0;
			playbackRenderTick += 1;

			const parsedTracePoints = getTracePoints(result);
			const parsedTimelineEvents = buildMergedTimelineEvents(parsedTracePoints, cctvItems);
			activePlaybackTimestampMs = parsedTimelineEvents[0]?.timestampMs ?? NaN;
			const firstCctvEvent = parsedTimelineEvents.find((event) => event.hasCctv);
			const firstTraceEvent = parsedTimelineEvents.find((event) => event.hasTrace);

			traceDebug('[VESSEL_TRACE_RAW]', result);
			traceDebug('[VESSEL_TRACE_POINTS_COUNT]', parsedTracePoints.length);
			traceDebug('[VESSEL_TRACE_CCTV_SNAPSHOTS_COUNT]', cctvItems.length);
			traceDebug('[TRACE_TIMELINE_EVENTS_SUMMARY]', {
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
			hasLoadedDateRange = false;
			activePlaybackTimestampMs = NaN;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			cctvSnapshotsTotalPages = 1;
			cctvSnapshotsLoadedPageNumbers = [];
			cctvSnapshotBufferPivotPage = 1;
			cctvSnapshotPageRequests.clear();
			traceMarks = [];
			selectedTraceMarkCameraKeys = [];
			activeTraceMarkKey = '';
		} finally {
			loading = false;
		}
	}

	function clearPlaybackInterval(reason = 'manual') {
		if (!playbackInterval) return;

		clearInterval(playbackInterval);
		playbackInterval = null;
		playbackClockStartedAtRealMs = 0;
		playbackClockStartedAtTraceMs = NaN;

		traceDebug('[TRACE_PLAY_INTERVAL_CLEARED]', {
			reason,
			activeIndex,
			totalTimelineEvents: timelineEvents.length,
			totalTracePoints: tracePoints.length
		});
	}

	function runPlaybackTick(source = 'interval') {
		const currentIndex = activeIndex;
		const totalTimelineEvents = timelineEvents.length;
		const { start, end } = getTimelineBounds(timelineEvents);

		traceDebug('[TRACE_PLAY_TICK_BEGIN]', {
			source,
			activeIndex: currentIndex,
			activePlaybackTimestampMs,
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

		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
			clearPlaybackInterval('invalid-timeline-bounds');
			isPlaying = false;
			return;
		}

		const baseTraceTime = Number.isFinite(playbackClockStartedAtTraceMs)
			? playbackClockStartedAtTraceMs
			: clampPlaybackTimestamp(activePlaybackTimestampMs);
		const elapsedRealMs =
			source === 'start' ? 0 : Math.max(0, Date.now() - playbackClockStartedAtRealMs);
		const direction = playbackDirection === -1 ? -1 : 1;
		const rawNextTime =
			baseTraceTime + elapsedRealMs * TRACE_MS_PER_REAL_MS * playbackSpeedMultiplier * direction;
		const nextTime = direction === -1 ? Math.max(start, rawNextTime) : Math.min(end, rawNextTime);
		const nextIndex = findTimelineIndexAtOrBefore(timelineEvents, nextTime);

		if ((direction === 1 && nextTime >= end) || (direction === -1 && nextTime <= start)) {
			const boundaryTime = direction === -1 ? start : end;
			setPlaybackTimestamp(boundaryTime);

			traceDebug('[TRACE_PLAY_STOP_END]', {
				activeIndex,
				totalTimelineEvents,
				playbackTime: formatDateTime(boundaryTime),
				source,
				direction
			});

			clearPlaybackInterval(direction === -1 ? 'start' : 'end');
			isPlaying = false;
			return;
		}

		const nextEvent = timelineEvents[nextIndex];
		const nextTraceIndex =
			Number.isInteger(nextEvent?.traceIndex) && nextEvent.traceIndex >= 0
				? nextEvent.traceIndex
				: findTraceIndexAtOrBefore(nextTime);
		const nextPoint = tracePoints[nextTraceIndex] || null;

		flushSync(() => {
			setPlaybackTimestamp(nextTime);
		});

		try {
			const nextPanels = getCctvCameraPanels(cctvCameraIndex, nextTime, playbackRenderTick);

			traceDebug('[TRACE_PLAY_TICK]', {
				source,
				fromIndex: currentIndex,
				toIndex: nextIndex,
				totalTimelineEvents,
				totalTracePoints: tracePoints.length,
				playbackTime: formatDateTime(nextTime),
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
			traceDebug('[TRACE_PLAY_TICK_LOG_ERROR]', {
				source,
				fromIndex: currentIndex,
				toIndex: nextIndex,
				error: err
			});
		}
	}

	function startPlayback(direction = 1) {
		clearPlaybackInterval('restart');
		const { start, end } = getTimelineBounds(timelineEvents);
		const normalizedDirection = direction === -1 ? -1 : 1;

		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
			isPlaying = false;
			return;
		}

		const currentTimestamp = Number.isFinite(activePlaybackTimestampMs)
			? clampPlaybackTimestamp(activePlaybackTimestampMs)
			: start;
		const startTimestamp =
			normalizedDirection === -1
				? currentTimestamp <= start
					? end
					: currentTimestamp
				: currentTimestamp >= end
					? start
					: currentTimestamp;
		setPlaybackTimestamp(startTimestamp, { bumpRender: false });
		playbackDirection = normalizedDirection;
		playbackClockStartedAtTraceMs = startTimestamp;
		playbackClockStartedAtRealMs = Date.now();

		traceDebug('[TRACE_PLAY_START]', {
			activeIndex,
			playbackStartTime: formatDateTime(startTimestamp),
			speed: `1 real second = ${playbackSpeedMultiplier} trace minute(s)`,
			speedMultiplier: playbackSpeedMultiplier,
			direction: playbackDirection,
			totalTimelineEvents: timelineEvents.length,
			totalTracePoints: tracePoints.length,
			cctvItems: cctvItems.length
		});

		isPlaying = true;
		runPlaybackTick('start');

		if (!isPlaying) return;

		playbackInterval = setInterval(() => {
			runPlaybackTick('interval');
		}, PLAYBACK_TICK_INTERVAL_MS);

		traceDebug('[TRACE_PLAY_INTERVAL_CREATED]', {
			activeIndex,
			totalTimelineEvents: timelineEvents.length,
			totalTracePoints: tracePoints.length,
			delayMs: PLAYBACK_TICK_INTERVAL_MS,
			traceMsPerRealMs: TRACE_MS_PER_REAL_MS,
			speedMultiplier: playbackSpeedMultiplier,
			direction: playbackDirection
		});
	}

	function stopPlayback(reason = 'toggle') {
		clearPlaybackInterval(reason);
		isPlaying = false;
	}

	function setPlaybackSpeed(multiplier) {
		const nextMultiplier = Number(multiplier);
		if (!PLAYBACK_SPEED_OPTIONS.includes(nextMultiplier)) return;
		if (playbackSpeedMultiplier === nextMultiplier) return;

		if (isPlaying) {
			runPlaybackTick('speed-change');
			playbackClockStartedAtTraceMs = getCurrentTimelineTimestampMs();
			playbackClockStartedAtRealMs = Date.now();
		}

		playbackSpeedMultiplier = nextMultiplier;

		traceDebug('[TRACE_PLAY_SPEED_CHANGE]', {
			speedMultiplier: playbackSpeedMultiplier,
			direction: playbackDirection,
			activeIndex,
			playbackTime: formatDateTime(getCurrentTimelineTimestampMs()),
			isPlaying
		});
	}

	function togglePlayback(direction = 1) {
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

		const normalizedDirection = direction === -1 ? -1 : 1;
		const nextPlaying = !(isPlaying && playbackDirection === normalizedDirection);

		traceDebug('[TRACE_PLAY_TOGGLE]', {
			from: isPlaying,
			to: nextPlaying,
			fromDirection: playbackDirection,
			toDirection: normalizedDirection,
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
			if (isPlaying && playbackDirection !== normalizedDirection) {
				runPlaybackTick('direction-change');
			}

			startPlayback(normalizedDirection);
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
		const { start, end } = getTimelineBounds(timelineEvents);

		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
			activeIndex = Math.round(ratio * (timelineEvents.length - 1));
			activePlaybackTimestampMs = timelineEvents[activeIndex]?.timestampMs ?? NaN;
			playbackRenderTick += 1;
			return;
		}

		setPlaybackTimestamp(start + (end - start) * ratio);
	}

	function moveTimeline(event) {
		updateTimelineFromPointer(event);
		ensureCctvPageForCurrentTimeline('timeline-click');
	}

	function startTimelineDrag(event) {
		if (!timelineEvents.length) return;

		isDraggingTimeline = true;
		stopPlayback('timeline-drag');

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
		ensureCctvPageForCurrentTimeline('timeline-drag-release');
	}

	function moveStep(direction) {
		if (!timelineEvents.length) return;

		const nextIndex = Math.min(timelineEvents.length - 1, Math.max(0, activeIndex + direction));
		setPlaybackTimestamp(timelineEvents[nextIndex]?.timestampMs ?? activePlaybackTimestampMs);
	}

	function closeMotionVideo() {
		motionVideoRequestId += 1;
		motionVideoOpen = false;
		motionVideoLoading = false;
		motionVideoError = '';
		motionVideoDetail = null;
	}

	function handleMotionVideoBackdropClick(event) {
		if (event.target === event.currentTarget) closeMotionVideo();
	}

	function handleTraceWindowKeydown(event) {
		if (event.key !== 'Escape') return;
		document.querySelector('.timeline-camera-filter[open]')?.removeAttribute('open');

		if (motionVideoOpen) {
			closeMotionVideo();
			return;
		}

		activeTraceMarkKey = '';
	}

	function handleTraceWindowClick(event) {
		if (!event?.target?.closest?.('.timeline-camera-filter')) {
			document.querySelector('.timeline-camera-filter[open]')?.removeAttribute('open');
		}

		if (event?.target?.closest?.('.timeline-mark-popup, .timeline-mark-trigger')) return;
		if (!motionVideoOpen) activeTraceMarkKey = '';
	}

	function toggleTraceMarkPopup(mark, event) {
		event?.preventDefault();
		event?.stopPropagation();
		activeTraceMarkKey = activeTraceMarkKey === mark?.key ? '' : mark?.key || '';
	}

	function formatMotionDuration(value) {
		const seconds = Number(value);
		if (!Number.isFinite(seconds) || seconds < 0) return '-';

		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = Math.floor(seconds % 60);
		return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
	}

	async function openMotionVideo(mark, event) {
		event?.preventDefault();
		event?.stopPropagation();

		if (!mark?.id) return;
		activeTraceMarkKey = '';

		const requestId = ++motionVideoRequestId;
		motionVideoOpen = true;
		motionVideoLoading = true;
		motionVideoError = '';
		motionVideoDetail = {
			id: mark.id,
			cameraName: mark.cameraName,
			cameraToken: mark.cameraToken,
			startedAt: mark.startedAt,
			recordingUrl: ''
		};

		try {
			const detail = await getCctvMotionDetail({
				recordId: mark.id,
				timezoneMode,
				timezoneOffset: timezoneMode === 'manual' ? timezoneOffset : ''
			});

			if (requestId !== motionVideoRequestId) return;

			motionVideoDetail = {
				...motionVideoDetail,
				...detail,
				recordingUrl: detail?.recordingUrl || detail?.recording_url || ''
			};

			if (!motionVideoDetail.recordingUrl) {
				motionVideoError = 'Video URL is not available for this recording.';
			}
		} catch (videoError) {
			if (requestId !== motionVideoRequestId) return;
			console.error('[VESSEL_TRACE_MOTION_VIDEO_ERROR]', videoError);
			motionVideoError = videoError?.message || 'Failed to load CCTV motion recording.';
		} finally {
			if (requestId === motionVideoRequestId) {
				motionVideoLoading = false;
			}
		}
	}

	onDestroy(() => {
		clearPlaybackInterval('destroy');
		motionVideoRequestId += 1;
	});

	$effect(() => {
		if (!active) {
			stopPlayback('inactive-page');
			if (motionVideoOpen) closeMotionVideo();
		}
	});

	$effect(() => {
		if (!timelineEvents.length) {
			if (activeIndex !== 0) activeIndex = 0;
			if (Number.isFinite(activePlaybackTimestampMs)) activePlaybackTimestampMs = NaN;
			return;
		}

		if (activeIndex > timelineEvents.length - 1) {
			activeIndex = timelineEvents.length - 1;
			playbackRenderTick += 1;
		}

		const nextTimestamp = clampPlaybackTimestamp(activePlaybackTimestampMs);
		if (
			Number.isFinite(nextTimestamp) &&
			(!Number.isFinite(activePlaybackTimestampMs) ||
				Math.abs(activePlaybackTimestampMs - nextTimestamp) > 1)
		) {
			activePlaybackTimestampMs = nextTimestamp;
			activeIndex = findTimelineIndexAtOrBefore(timelineEvents, nextTimestamp);
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

<svelte:window onkeydown={handleTraceWindowKeydown} onclick={handleTraceWindowClick} />

<section class="trace-root page-content">
	<section class="trace-viewport">
		<section class="trace-header-card">
			<div class="trace-header-copy">
				<div class="page-kicker">Trace Playback</div>
				<h1>{vesselInfo.vesselName}</h1>
				<p>Replay vessel position, route trail, telemetry, engine RPM, and CCTV snapshots by time range.</p>
			</div>

			<div class="trace-header-filters">
				<div class="filter-controls">
					<label>
						<span>Start</span>
						<input
							type="datetime-local"
							bind:value={startDateTime}
							oninput={clearActiveTimePreset}
						/>
					</label>

					<label>
						<span>End</span>
						<input
							type="datetime-local"
							bind:value={endDateTime}
							oninput={clearActiveTimePreset}
						/>
					</label>

				<label>
					<span class="field-label-row">
						Timezone
						{#if timezoneMode === 'auto'}
							<small class="timezone-auto-pill">Auto • {autoTimezoneLabel}</small>
						{/if}
					</span>
					<select bind:value={timezoneMode} onchange={() => (hasLoadedDateRange = false)}>
						{#each TIMEZONE_MODE_OPTIONS as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				{#if timezoneMode === 'manual'}
					<label>
						<span>Offset</span>
						<select bind:value={timezoneOffset} onchange={() => (hasLoadedDateRange = false)}>
							{#each TIMEZONE_OFFSET_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
				{/if}

				<button
					type="button"
					class="primary-btn"
					onclick={loadTrace}
					disabled={loading || !startDateTime || !endDateTime}
				>
					{loading ? 'Loading...' : 'Load Trace'}
				</button>
			</div>

			<div class="time-preset-row" aria-label="Trace time presets">
				<span>Preset</span>
				<div class="time-preset-list">
					{#each TIME_PRESETS as preset}
						<button
							type="button"
							class:active={activeTimePreset === preset.id}
							onclick={() => applyTimePreset(preset.id)}
						>
							{preset.label}
						</button>
					{/each}
				</div>
			</div>
			</div>
		</section>

		<div class="load-required-area trace-load-required-area" class:is-locked={shouldShowDateRangeOverlay}>
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
											<CctvSnapshotImage
												class="cctv-camera-image"
												src={activeFrame.url}
												filePath={activeFrame.filePath}
												frameKey={activeFrame.key}
												renderTick={playbackRenderTick}
												alt={`${mainCctvPanel.name} snapshot`}
												loading="eager"
											/>
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
													<CctvSnapshotImage
														class="cctv-camera-image"
														src={activeFrame.url}
														filePath={activeFrame.filePath}
														frameKey={activeFrame.key}
														renderTick={playbackRenderTick}
														alt={`${panel.name} snapshot`}
														loading="eager"
													/>
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
							followActivePoint={false}
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
							togglePlayback(-1);
						}}
						disabled={!timelineEvents.length}
					>
						{isPlaying && playbackDirection === -1 ? 'Pause' : 'Reverse'}
					</button>

					<button
						type="button"
						class="play-button"
						onclick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							togglePlayback(1);
						}}
						disabled={!timelineEvents.length}
					>
						{isPlaying && playbackDirection === 1 ? 'Pause' : 'Play'}
					</button>

					<div
						class="speed-controls"
						style={`--speed-index: ${PLAYBACK_SPEED_OPTIONS.indexOf(playbackSpeedMultiplier)}`}
						aria-label="Playback speed"
					>
						{#each PLAYBACK_SPEED_OPTIONS as speed}
							<button
								type="button"
								class="speed-btn"
								class:active-speed={playbackSpeedMultiplier === speed}
								onclick={() => setPlaybackSpeed(speed)}
								disabled={!timelineEvents.length}
								aria-pressed={playbackSpeedMultiplier === speed}
							>
								x{speed}
							</button>
						{/each}
					</div>

					<button
						type="button"
						class="step-btn"
						onclick={() => moveStep(1)}
						disabled={!timelineEvents.length || activeIndex >= timelineEvents.length - 1}
					>
						›
					</button>
				</div>

				<div class="timeline-shell">
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
						{#each cctvBufferSegments as segment (segment.key)}
							<div
								class="timeline-buffer-segment"
								style={`left: ${segment.left}%; width: ${segment.width}%;`}
								title={`CCTV page ${segment.startPage}-${segment.endPage} loaded`}
							></div>
						{/each}
						<div class="timeline-progress" style={`width: ${timelineProgress}%`}></div>
						<div class="timeline-dot" style={`left: ${timelineProgress}%`}></div>
					</div>

					<div class="timeline-mark-layer" aria-label="CCTV motion recording marks">
						{#each timelineTraceMarks as mark (mark.key)}
							<div
								class="timeline-mark"
								class:open={activeTraceMarkKey === mark.key}
								class:align-left={mark.left < 12}
								class:align-right={mark.left > 88}
								style={`left: ${mark.left}%`}
							>
								<button
									type="button"
									class="timeline-mark-trigger"
									class:active={activeTraceMarkKey === mark.key}
									aria-label={`Show ${mark.recordings.length} camera recording${mark.recordings.length === 1 ? '' : 's'} started ${mark.startedAtText}`}
									aria-expanded={activeTraceMarkKey === mark.key}
									onpointerdown={(event) => event.stopPropagation()}
									onclick={(event) => toggleTraceMarkPopup(mark, event)}
								>
									<span class="timeline-mark-pin" aria-hidden="true"></span>
								</button>

								{#if activeTraceMarkKey === mark.key}
									<div
										class="timeline-mark-popup"
										class:single-camera={mark.recordings.length === 1}
										class:two-cameras={mark.recordings.length === 2}
										class:four-cameras={mark.recordings.length === 4}
										role="group"
										aria-label={`Camera recordings started ${mark.startedAtText}`}
									>
										<div class="timeline-mark-popup-header">
											<strong>{mark.recordings.length} camera{mark.recordings.length === 1 ? '' : 's'}</strong>
											<small>{mark.startedAtText}</small>
										</div>

										<div class="timeline-mark-camera-grid">
											{#each mark.recordings as recording (recording.key)}
												<button
													type="button"
													class="timeline-mark-camera"
													onclick={(event) => openMotionVideo(recording, event)}
													aria-label={`Play recording from ${recording.cameraName}`}
												>
													<span class="timeline-mark-thumbnail">
														{#if recording.thumbnailUrl}
															<img
																src={recording.thumbnailUrl}
																alt={`Motion thumbnail from ${recording.cameraName}`}
																loading="lazy"
																draggable="false"
															/>
														{:else}
															<span class="timeline-mark-no-image">No thumbnail</span>
														{/if}
													</span>
													<span class="timeline-mark-copy">
														<strong>{recording.cameraName}</strong>
														<small>{recording.startedAtText}</small>
													</span>
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				{#if traceMarkCameraOptions.length}
					<details class="timeline-camera-filter">
						<summary aria-label="Filter timeline markers by camera">
							<span class="timeline-camera-filter-title">Camera</span>
							<strong>
								{selectedTraceMarkCameraKeys.length === traceMarkCameraOptions.length
									? 'All'
									: `${selectedTraceMarkCameraKeys.length} camera${selectedTraceMarkCameraKeys.length === 1 ? '' : 's'}`}
							</strong>
							<span class="timeline-camera-filter-chevron" aria-hidden="true">⌄</span>
						</summary>
						<div class="timeline-camera-filter-options">
							<label class="timeline-camera-option all-cameras">
								<input
									type="checkbox"
									checked={selectedTraceMarkCameraKeys.length === traceMarkCameraOptions.length}
									onchange={(event) =>
										toggleAllTraceMarkCameras(event.currentTarget.checked, traceMarkCameraOptions)}
								/>
								<span class="timeline-camera-checkbox" aria-hidden="true"></span>
								<span class="timeline-camera-name">All</span>
							</label>

							{#each traceMarkCameraOptions as camera (camera.key)}
								<label class="timeline-camera-option" title={camera.name}>
									<input
										type="checkbox"
										checked={selectedTraceMarkCameraKeys.includes(camera.key)}
										onchange={(event) =>
											toggleTraceMarkCamera(camera.key, event.currentTarget.checked)}
									/>
									<span class="timeline-camera-checkbox" aria-hidden="true"></span>
									<span class="timeline-camera-name">{camera.name}</span>
								</label>
							{/each}
						</div>
					</details>
				{/if}

				<div class="timeline-time">
					<span
						>{activeIndex + 1}/{timelineEvents.length || 0} • {activeTimelineSourceLabel}{timelineTraceMarks.length
							? ` • ${timelineTraceMarks.length} marks`
							: traceMarksError
								? ' • marks unavailable'
								: ''}</span
					>
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
						<span>Distance</span>
						<strong>{vesselInfo.distance}</strong>
					</article>

					<article class="info-card">
						<span>Heading</span>
						<strong>{formatNumber(vesselInfo.heading, 1, '0.0')}°</strong>
					</article>

					<article class="info-card">
						<span>L/h</span>
						<strong>{vesselInfo.fuelPerHour}</strong>
					</article>

					<article class="info-card">
						<span>Weather</span>
						<strong>{vesselInfo.weatherForecast}</strong>
					</article>

					<article class="info-card">
						<span>Ocean current</span>
						<strong>{vesselInfo.oceanCurrent}</strong>
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

			{#if shouldShowDateRangeOverlay}
				<div class="load-required-overlay">
					<div class="load-required-card">
						<div class="load-required-icon">!</div>
						<span class="section-kicker">Waiting for date range</span>
						<h2>Choose a trace range first</h2>
						<p>
							Select Start, End, and timezone above, then click <strong>Load Trace</strong>
							to display playback, map, and CCTV snapshots.
						</p>
					</div>
				</div>
			{/if}
		</div>
	</section>
</section>

{#if motionVideoOpen}
	<div
		class="motion-video-backdrop"
		role="presentation"
		onclick={handleMotionVideoBackdropClick}
		transition:fade={{ duration: 140 }}
	>
		<div
			class="motion-video-modal"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-labelledby="motion-video-title"
			in:scale={{ start: 0.97, duration: 160 }}
		>
			<header class="motion-video-header">
				<div>
					<small>CCTV Motion Recording</small>
					<h2 id="motion-video-title">
						{motionVideoDetail?.cameraName || 'Camera recording'}
					</h2>
					<p>{motionVideoDetail?.vesselName || vesselInfo.vesselName}</p>
				</div>
				<button
					type="button"
					class="motion-video-close"
					onclick={closeMotionVideo}
					aria-label="Close CCTV recording"
				>×</button
				>
			</header>

			<div class="motion-video-body">
				{#if motionVideoLoading}
					<div class="motion-video-loading" role="status">
						<span class="motion-video-spinner" aria-hidden="true"></span>
						<strong>Loading recording...</strong>
					</div>
				{:else if motionVideoError}
					<div class="motion-video-error" role="alert">
						<strong>Recording unavailable</strong>
						<span>{motionVideoError}</span>
					</div>
				{:else if motionVideoDetail?.recordingUrl}
					<div class="motion-video-player-shell">
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src={motionVideoDetail.recordingUrl}
							poster={traceMarks.find((mark) => mark.id === motionVideoDetail?.id)
								?.thumbnailUrl || ''}
							controls
							playsinline
							preload="metadata"
						>
							Your browser does not support video playback.
						</video>
					</div>
				{/if}

				<div class="motion-video-meta">
					<div>
						<span>Camera</span>
						<strong>{motionVideoDetail?.cameraName || '-'}</strong>
					</div>
					<div>
						<span>Started</span>
						<strong>{motionVideoDetail?.startedAt || '-'}</strong>
					</div>
					<div>
						<span>Ended</span>
						<strong>{motionVideoDetail?.endedAt || '-'}</strong>
					</div>
					<div>
						<span>Duration</span>
						<strong>{formatMotionDuration(motionVideoDetail?.durationSeconds)}</strong>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

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

	.trace-header-card,
	.monitor-card,
	.playback-card,
	.info-card,
	.rpm-panel {
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
	}

	.trace-header-card {
		padding: 16px;
		display: grid;
		grid-template-columns: minmax(240px, 0.75fr) minmax(520px, 1.25fr);
		align-items: center;
		gap: 16px;
	}

	.trace-header-copy {
		min-width: 220px;
		max-width: 520px;
	}

	.page-kicker,
	.section-kicker {
		display: inline-flex;
		width: fit-content;
		align-items: center;
		justify-content: center;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.trace-header-card h1 {
		margin: 8px 0 0;
		color: var(--text-primary);
		font-size: 22px;
		font-weight: 900;
		line-height: 1.2;
	}

	.trace-header-card p {
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.trace-header-filters {
		width: 100%;
		min-width: 0;
		display: grid;
		justify-items: end;
		gap: 8px;
	}

	.filter-controls {
		width: 100%;
		display: grid;
		grid-template-columns: minmax(170px, 1fr) minmax(170px, 1fr) minmax(190px, 1fr) auto;
		align-items: end;
		justify-content: flex-end;
		gap: 10px;
	}

	.filter-controls:has(label:nth-of-type(4)) {
		grid-template-columns: repeat(4, minmax(135px, 1fr)) auto;
	}

	.filter-controls label {
		min-width: 0;
		display: grid;
		gap: 4px;
	}

	.filter-controls label span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.field-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.timezone-auto-pill {
		display: inline-flex;
		align-items: center;
		min-height: 17px;
		padding: 2px 7px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.1);
		color: #bfdbfe;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0;
		text-transform: none;
		white-space: nowrap;
	}

	.filter-controls input,
	.filter-controls select {
		height: 32px;
		width: 100%;
		min-width: 0;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 9px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		outline: none;
		box-sizing: border-box;
	}

	.filter-controls input:focus,
	.filter-controls select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.filter-controls button {
		height: 32px;
		padding: 0 12px;
		align-self: end;
		border: none;
		background: #2563eb;
		color: #ffffff;
		font-size: 12px;
		font-weight: 900;
		cursor: pointer;
	}

	.filter-controls button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.time-preset-row {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 0;
		min-width: 0;
	}

	.time-preset-row > span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 950;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.time-preset-list {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		flex-wrap: wrap;
		min-width: 0;
	}

	.time-preset-list button {
		height: 24px;
		border: 1px solid rgba(148, 163, 184, 0.34);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.48);
		padding: 0 10px;
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 850;
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			color 0.16s ease,
			transform 0.16s ease;
	}

	.time-preset-list button:hover,
	.time-preset-list button.active {
		border-color: rgba(96, 165, 250, 0.78);
		background: rgba(37, 99, 235, 0.26);
		color: #bfdbfe;
	}

	.time-preset-list button:active {
		transform: translateY(1px);
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
		position: relative;
		z-index: 1;
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
		position: relative;
		z-index: 1000;
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
		position: relative;
		z-index: 2;
		min-width: 0;
		min-height: 52px;
		padding: 8px 10px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) 140px 190px;
		align-items: center;
		gap: 10px;
		background: var(--color-surface);
		border: 1px solid #d8dde3;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
		overflow: visible;
	}

	.playback-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
	}

	.speed-controls {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 3px;
		border: 1px solid rgba(147, 197, 253, 0.24);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.42);
		overflow: hidden;
		--speed-button-width: 34px;
		--speed-gap: 3px;
		--speed-index: 0;
	}

	.speed-controls::before {
		content: '';
		position: absolute;
		z-index: 0;
		top: 3px;
		left: 3px;
		width: var(--speed-button-width);
		height: 22px;
		border-radius: 999px;
		background: linear-gradient(135deg, #2563eb, #3b82f6);
		box-shadow:
			0 0 0 1px rgba(147, 197, 253, 0.35),
			0 8px 18px rgba(37, 99, 235, 0.26);
		transform: translateX(calc(var(--speed-index) * (var(--speed-button-width) + var(--speed-gap))));
		transition:
			transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 220ms ease,
			opacity 180ms ease;
	}

	.play-button,
	.step-btn,
	.speed-btn {
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

	.speed-btn {
		position: relative;
		z-index: 1;
		width: 34px;
		height: 22px;
		border-color: transparent;
		border-radius: 999px;
		background: transparent;
		color: #9fb4d2;
		font-size: 10px;
		font-weight: 850;
		transition:
			color 160ms ease,
			transform 160ms ease,
			background 160ms ease;
	}

	.speed-btn:hover:not(:disabled) {
		color: #f8fbff;
		background: rgba(96, 165, 250, 0.18);
		transform: translateY(-1px);
	}

	.speed-btn.active-speed {
		color: #ffffff;
		background: transparent;
		box-shadow: none;
	}

	.play-button:disabled,
	.step-btn:disabled,
	.speed-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.timeline-shell {
		position: relative;
		min-width: 0;
		height: 22px;
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
	.timeline-buffer-segment,
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

	.timeline-buffer-segment {
		position: absolute;
		top: 9px;
		height: 3px;
		background: #64748b;
		opacity: 0.72;
		transition:
			left 0.22s ease,
			width 0.22s ease,
			opacity 0.22s ease;
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

	.timeline-mark-layer {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
	}

	.timeline-mark {
		position: absolute;
		top: 1px;
		width: 12px;
		height: 20px;
		pointer-events: none;
		transform: translateX(-50%);
		z-index: 1;
	}

	.timeline-mark.open,
	.timeline-mark:focus-within {
		z-index: 5;
	}

	.timeline-mark.align-left {
		transform: none;
	}

	.timeline-mark.align-right {
		transform: translateX(-100%);
	}

	.timeline-mark-trigger {
		position: absolute;
		inset: 0;
		width: 12px;
		height: 20px;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		pointer-events: auto;
	}

	.timeline-mark-trigger:focus-visible {
		outline: 2px solid #60a5fa;
		outline-offset: 3px;
		border-radius: 3px;
	}

	.timeline-mark-pin {
		position: absolute;
		left: 50%;
		top: 0;
		width: 8px;
		height: 8px;
		border: 2px solid #ffffff;
		border-radius: 2px 2px 2px 0;
		background: #f97316;
		box-shadow:
			0 0 0 1px #c2410c,
			0 2px 5px rgba(124, 45, 18, 0.32);
		transform: translateX(-50%) rotate(-45deg);
		transition: transform 140ms ease, background 140ms ease;
	}

	.timeline-mark-trigger:hover .timeline-mark-pin,
	.timeline-mark-trigger:focus-visible .timeline-mark-pin,
	.timeline-mark-trigger.active .timeline-mark-pin {
		background: #fb923c;
		transform: translateX(-50%) rotate(-45deg) scale(1.2);
	}

	.timeline-mark-popup {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 8px);
		width: min(680px, calc(100vw - 56px));
		max-height: min(680px, calc(100dvh - 100px));
		padding: 9px;
		display: grid;
		gap: 9px;
		overflow-x: hidden;
		overflow-y: auto;
		border: 1px solid #415475;
		border-radius: 8px;
		background: #101827;
		box-shadow: 0 14px 30px rgba(15, 23, 42, 0.38);
		color: #f8fafc;
		text-align: left;
		transform: translateX(-50%);
		pointer-events: auto;
		box-sizing: border-box;
	}

	.timeline-mark-popup.single-camera {
		width: min(360px, calc(100vw - 56px));
	}

	.timeline-mark-popup.two-cameras {
		width: min(520px, calc(100vw - 56px));
	}

	.timeline-mark-popup::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -5px;
		width: 9px;
		height: 9px;
		border-right: 1px solid #415475;
		border-bottom: 1px solid #415475;
		background: #101827;
		transform: translateX(-50%) rotate(45deg);
	}

	.timeline-mark-popup-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 1px 2px;
	}

	.timeline-mark-popup-header strong {
		font-size: 11px;
		font-weight: 850;
	}

	.timeline-mark-popup-header small {
		overflow: hidden;
		color: #b8c7dc;
		font-size: 10px;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timeline-mark-camera-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.timeline-mark-popup.single-camera .timeline-mark-camera-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.timeline-mark-popup.two-cameras .timeline-mark-camera-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.timeline-mark-popup.four-cameras .timeline-mark-camera-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.timeline-mark-camera {
		min-width: 0;
		padding: 6px;
		display: grid;
		gap: 6px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 7px;
		background: #172033;
		color: #f8fafc;
		text-align: left;
		cursor: pointer;
		transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
	}

	.timeline-mark-camera:hover,
	.timeline-mark-camera:focus-visible {
		border-color: #60a5fa;
		background: #1e2c45;
		outline: none;
		transform: translateY(-1px);
	}

	.timeline-mark-thumbnail {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: 5px;
		background: #1e293b;
	}

	.timeline-mark-thumbnail img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.timeline-mark-no-image {
		color: #94a3b8;
		font-size: 10px;
		font-weight: 750;
	}

	.timeline-mark-copy {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.timeline-mark-copy strong,
	.timeline-mark-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timeline-mark-copy strong {
		font-size: 11px;
		font-weight: 850;
	}

	.timeline-mark-copy small {
		color: #b8c7dc;
		font-size: 10px;
		font-weight: 650;
	}

	.timeline-camera-filter {
		position: relative;
		width: 210px;
		max-width: 100%;
		min-width: 0;
		justify-self: start;
	}

	.timeline-camera-filter summary {
		min-height: 34px;
		padding: 5px 8px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 7px;
		border: 1px solid #34445e;
		border-radius: 8px;
		background: linear-gradient(180deg, rgba(30, 41, 59, 0.86), rgba(15, 23, 42, 0.86));
		cursor: pointer;
		list-style: none;
		box-sizing: border-box;
		transition:
			border-color 0.18s ease,
			background 0.18s ease;
	}

	.timeline-camera-filter summary:hover,
	.timeline-camera-filter[open] summary {
		border-color: rgba(96, 165, 250, 0.72);
		background: linear-gradient(180deg, rgba(37, 52, 75, 0.94), rgba(17, 27, 45, 0.94));
	}

	.timeline-camera-filter summary::-webkit-details-marker {
		display: none;
	}

	.timeline-camera-filter summary:focus-visible {
		border-color: #60a5fa;
		outline: 2px solid rgba(96, 165, 250, 0.25);
		outline-offset: 2px;
	}

	.timeline-camera-filter-title {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 850;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.timeline-camera-filter summary strong {
		justify-self: end;
		padding: 2px 6px;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.18);
		color: #93c5fd;
		font-size: 10px;
		font-weight: 850;
		text-align: right;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timeline-camera-filter-chevron {
		color: var(--text-secondary);
		font-size: 15px;
		line-height: 1;
		transition: transform 150ms ease;
	}

	.timeline-camera-filter[open] .timeline-camera-filter-chevron {
		transform: rotate(180deg);
	}

	.timeline-camera-filter-options {
		position: absolute;
		right: 0;
		bottom: calc(100% + 7px);
		z-index: 20;
		width: min(210px, calc(100vw - 32px));
		max-height: 240px;
		padding: 7px;
		display: grid;
		gap: 3px;
		overflow-x: hidden;
		overflow-y: auto;
		border: 1px solid #415475;
		border-radius: 9px;
		background: #101827;
		box-shadow: 0 14px 30px rgba(15, 23, 42, 0.38);
		box-sizing: border-box;
	}

	.timeline-camera-option {
		min-width: 0;
		width: 100%;
		padding: 8px;
		display: flex;
		align-items: center;
		gap: 7px;
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 750;
		cursor: pointer;
		box-sizing: border-box;
	}

	.timeline-camera-option:hover {
		background: rgba(96, 165, 250, 0.12);
		color: #f8fafc;
	}

	.timeline-camera-option:has(input:checked) {
		background: rgba(37, 99, 235, 0.13);
		color: #dbeafe;
	}

	.timeline-camera-option.all-cameras {
		margin-bottom: 3px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 6px 6px 0 0;
		color: #60a5fa;
		font-weight: 850;
	}

	.timeline-camera-option input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		opacity: 0;
		pointer-events: none;
	}

	.timeline-camera-checkbox {
		position: relative;
		flex: 0 0 16px;
		width: 16px;
		height: 16px;
		border: 1px solid #64748b;
		border-radius: 4px;
		background: #0b1220;
		box-sizing: border-box;
		transition:
			border-color 0.16s ease,
			background 0.16s ease,
			box-shadow 0.16s ease;
	}

	.timeline-camera-checkbox::after {
		content: '';
		position: absolute;
		left: 4px;
		top: 1px;
		width: 5px;
		height: 9px;
		border-right: 2px solid #ffffff;
		border-bottom: 2px solid #ffffff;
		opacity: 0;
		transform: rotate(45deg) scale(0.72);
		transition:
			opacity 0.14s ease,
			transform 0.14s ease;
	}

	.timeline-camera-option input:checked + .timeline-camera-checkbox {
		border-color: #60a5fa;
		background: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
	}

	.timeline-camera-option input:checked + .timeline-camera-checkbox::after {
		opacity: 1;
		transform: rotate(45deg) scale(1);
	}

	.timeline-camera-option input:focus-visible + .timeline-camera-checkbox {
		outline: 2px solid #93c5fd;
		outline-offset: 2px;
	}

	.timeline-camera-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.motion-video-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40000;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(2, 6, 23, 0.82);
		backdrop-filter: blur(8px);
		box-sizing: border-box;
	}

	.motion-video-modal {
		width: min(920px, 100%);
		max-height: calc(100dvh - 40px);
		overflow: auto;
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 16px;
		background: #0f172a;
		box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
		color: #f8fafc;
	}

	.motion-video-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
		padding: 18px 20px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.16);
	}

	.motion-video-header small {
		color: #60a5fa;
		font-size: 10px;
		font-weight: 850;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.motion-video-header h2 {
		margin: 5px 0 3px;
		font-size: 19px;
		line-height: 1.25;
	}

	.motion-video-header p {
		margin: 0;
		color: #94a3b8;
		font-size: 12px;
	}

	.motion-video-close {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		padding: 0;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 9px;
		background: rgba(30, 41, 59, 0.82);
		color: #cbd5e1;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
	}

	.motion-video-close:hover {
		border-color: rgba(96, 165, 250, 0.72);
		color: #ffffff;
	}

	.motion-video-body {
		display: grid;
		gap: 14px;
		padding: 20px;
	}

	.motion-video-player-shell {
		width: 100%;
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 12px;
		background: #020617;
		aspect-ratio: 16 / 9;
	}

	.motion-video-player-shell video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #020617;
	}

	.motion-video-loading,
	.motion-video-error {
		min-height: 280px;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 12px;
		padding: 24px;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 12px;
		background: #020617;
		text-align: center;
		box-sizing: border-box;
	}

	.motion-video-loading strong,
	.motion-video-error strong {
		font-size: 14px;
	}

	.motion-video-error strong {
		color: #fca5a5;
	}

	.motion-video-error span {
		max-width: 520px;
		color: #cbd5e1;
		font-size: 12px;
		line-height: 1.5;
	}

	.motion-video-spinner {
		width: 30px;
		height: 30px;
		border: 3px solid rgba(96, 165, 250, 0.22);
		border-top-color: #60a5fa;
		border-radius: 50%;
		animation: motionVideoSpin 0.8s linear infinite;
	}

	.motion-video-meta {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
	}

	.motion-video-meta > div {
		min-width: 0;
		padding: 11px 12px;
		display: grid;
		gap: 5px;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 9px;
		background: rgba(30, 41, 59, 0.62);
	}

	.motion-video-meta span {
		color: #94a3b8;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.motion-video-meta strong {
		overflow: hidden;
		color: #f1f5f9;
		font-size: 11px;
		font-weight: 800;
		line-height: 1.4;
		text-overflow: ellipsis;
	}

	@keyframes motionVideoSpin {
		to {
			transform: rotate(360deg);
		}
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

	@media (max-width: 700px) {
		.motion-video-backdrop {
			padding: 10px;
		}

		.motion-video-modal {
			max-height: calc(100dvh - 20px);
			border-radius: 12px;
		}

		.motion-video-header,
		.motion-video-body {
			padding: 14px;
		}

		.motion-video-meta {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.motion-video-loading,
		.motion-video-error {
			min-height: 200px;
		}
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

		.playback-card {
			grid-template-columns: auto minmax(0, 1fr);
			align-items: center;
		}

		.playback-controls {
			grid-column: 1;
			grid-row: 1;
		}

		.timeline-time {
			grid-column: 2;
			grid-row: 1;
		}

		.timeline-shell {
			grid-column: 1 / -1;
			grid-row: 2;
		}

		.timeline-camera-filter {
			grid-column: 1 / -1;
			grid-row: 3;
		}

		.trace-loading-shell {
			grid-row: auto;
			display: block;
			overflow: visible;
		}
	}

	@media (max-width: 1100px) {
		.trace-header-card {
			grid-template-columns: 1fr;
			align-items: stretch;
			gap: 14px;
		}

		.trace-header-copy {
			max-width: none;
		}

		.trace-header-filters {
			justify-items: stretch;
		}

		.filter-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			justify-content: stretch;
		}

		.filter-controls button {
			width: 100%;
		}

		.time-preset-row,
		.time-preset-list {
			justify-content: flex-start;
		}
	}

	@media (max-width: 760px) {
		.trace-viewport {
			padding: 8px;
		}

		.playback-card {
			grid-template-columns: minmax(0, 1fr);
		}

		.playback-controls,
		.timeline-shell,
		.timeline-camera-filter,
		.timeline-time {
			grid-column: 1;
		}

		.playback-controls {
			grid-row: 1;
			flex-wrap: wrap;
		}

		.timeline-shell {
			grid-row: 2;
		}

		.timeline-camera-filter {
			grid-row: 3;
		}

		.timeline-time {
			grid-row: 4;
			text-align: left;
		}

		.map-panel {
			min-height: 360px;
		}

		.map-panel :global(.vessel-map-root) {
			min-height: 360px;
		}

		.trace-header-card {
			padding: 14px;
			gap: 12px;
		}

		.trace-header-card h1 {
			font-size: 20px;
		}

		.trace-header-copy,
		.trace-header-filters {
			width: 100%;
			min-width: 0;
		}

		.filter-controls {
			width: 100%;
			grid-template-columns: 1fr;
			justify-content: stretch;
		}

		.time-preset-row {
			align-items: flex-start;
			justify-content: flex-start;
			flex-direction: column;
			margin-top: 0;
		}

		.time-preset-list {
			justify-content: flex-start;
			width: 100%;
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
