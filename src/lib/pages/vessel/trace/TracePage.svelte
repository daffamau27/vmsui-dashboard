<script>
	import { flushSync, onDestroy, untrack } from 'svelte';
	import TraceHeader from './TraceHeader.svelte';
	import TraceCctv from './TraceCctv.svelte';
	import TraceMap from './TraceMap.svelte';
	import TracePlayback from './TracePlayback.svelte';
	import TraceData from './TraceData.svelte';
	import './trace-page.css';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import {
		getCctvMotionDetail,
		getVesselCctvSnapshots,
		getVesselTrace,
		getVesselTraceMarkRecords
	} from '$lib/api/traceApi.js';
	import { fade, scale } from 'svelte/transition';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { getAutoTimezoneLabelFromSources } from '$lib/utils/autoTimezoneLabel.js';
	import {
		formatTraceDateTime,
		getTraceTimezone,
		parseTraceDateTimeMs
	} from '$lib/utils/traceDateTime.js';
	import {
		TRACE_CCTV_PAGE_SIZE,
		summarizeCctvPage,
		getCctvPagesToLoad,
		getCctvLookAheadPages
	} from '$lib/utils/traceCctvBuffer.js';
	import { createSnapshotImageBuffer } from '$lib/utils/snapshotImageBuffer.js';

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
	let isTraceFullscreen = $state(false);
	let traceRoot = $state(null);
	let fullscreenPending = $state(false);
	let fullscreenError = $state('');
	let fullscreenCctvOpen = $state(false);
	let bottomPanelHeight = $state(0);
	let mapControlsBottom = $state(46);
	let showCctvTimeline = $derived(!isTraceFullscreen || fullscreenCctvOpen);
	let destroyed = false;

	let startDateTime = $state('');
	let endDateTime = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');
	let loadedTimezone = $state('');
	let activeTimePreset = $state('');
	let hasLoadedDateRange = $state(false);
	let shouldShowDateRangeOverlay = $derived(!hasLoadedDateRange || !startDateTime || !endDateTime);
	let autoTimezoneLabel = $derived(
		getAutoTimezoneLabelFromSources(traceData, traceData?.data, $selectedVesselInfo)
	);
	let displayTimezone = $derived(
		getTraceTimezone(
			traceData,
			loadedTimezone || (timezoneMode === 'manual' ? timezoneOffset : autoTimezoneLabel)
		)
	);

	let cctvItems = $state([]);
	let cctvSnapshotsError = $state('');
	let cctvSnapshotsTotal = $state(0);
	let cctvSnapshotsTotalPages = $state(1);
	let cctvSnapshotsBuffering = $state(false);
	let cctvPlaybackBuffering = $state(false);
	let cctvImageBufferRevision = $state(0);
	let cctvPageRequestRevision = $state(0);
	const cctvImageBuffer = createSnapshotImageBuffer({
		onChange: () => {
			cctvImageBufferRevision += 1;
		}
	});
	let cctvSnapshotsLoadedPages = $state(0);
	let cctvSnapshotsLoadedPageNumbers = $state([]);
	let cctvSnapshotQuery = $state(null);
	let cctvSnapshotPages = new Map();
	let cctvSnapshotRetryAfter = new Map();
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
	const CCTV_SNAPSHOT_PAGE_SIZE = TRACE_CCTV_PAGE_SIZE;
	const TRACE_MS_PER_REAL_MS = 60;
	const PLAYBACK_TICK_INTERVAL_MS = 100;
	const PLAYBACK_SPEED_OPTIONS = [0.5, 1, 2, 5, 10];
	const MAX_TRACE_POINT_JUMP_NM = 1000;
	const MAX_TRACE_POINT_SPEED_KN = 80;
	const MAX_TIMELINE_TRACE_MARKS = 24;
	const TRACE_DEBUG = false;
	const TRACE_MARK_CAMERA_COLORS = [
		{ pin: '#f97316', hover: '#fb923c', soft: 'rgba(249, 115, 22, 0.14)' },
		{ pin: '#06b6d4', hover: '#22d3ee', soft: 'rgba(6, 182, 212, 0.14)' },
		{ pin: '#8b5cf6', hover: '#a78bfa', soft: 'rgba(139, 92, 246, 0.14)' },
		{ pin: '#22c55e', hover: '#4ade80', soft: 'rgba(34, 197, 94, 0.14)' },
		{ pin: '#f43f5e', hover: '#fb7185', soft: 'rgba(244, 63, 94, 0.14)' },
		{ pin: '#eab308', hover: '#facc15', soft: 'rgba(234, 179, 8, 0.14)' },
		{ pin: '#3b82f6', hover: '#60a5fa', soft: 'rgba(59, 130, 246, 0.14)' },
		{ pin: '#d946ef', hover: '#e879f9', soft: 'rgba(217, 70, 239, 0.14)' }
	];

	function traceDebug(...args) {
		if (TRACE_DEBUG) console.log(...args);
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

	function isValidTraceDateTime(value) {
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || value.startsWith('0000-')) {
			return false;
		}
		// Validate the calendar fields independently of the browser's timezone.
		const date = new Date(`${value}:00.000Z`);
		return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
	}

	function toApiDateTime(value) {
		if (!isValidTraceDateTime(value)) return '';

		return `${value.replace('T', ' ')}:00`;
	}

	function toSnapshotApiDateTime(value) {
		if (!value) return '';
		return toApiDateTime(value);
	}

	function toNumber(value, fallback = 0) {
		if (value == null || (typeof value === 'string' && !value.trim())) return fallback;
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
		const explicitHourly = toNumber(explicitHourlyValue, NaN);
		if (Number.isFinite(explicitHourly)) return explicitHourly;

		const perMinuteValue =
			item.fuelPerMinute ?? item.fuel_per_minute ?? item.fuelRate ?? item.fuel_rate ?? item.f_rate;
		const perMinute = toNumber(perMinuteValue, NaN);
		return Number.isFinite(perMinute) ? perMinute * 60 : NaN;
	}

	function formatNumber(value, digits = 1, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;
		return number.toFixed(digits);
	}

	function formatDateTime(value) {
		return formatTraceDateTime(value, displayTimezone);
	}

	function formatTimestampMs(timestampMs) {
		return formatDateTime(timestampMs);
	}

	function parseDateTimeMs(value) {
		return parseTraceDateTimeMs(value, displayTimezone);
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
						startedAtText: startedAt ? formatDateTime(startedAt) : formatTimestampMs(timestampMs),
						thumbnailUrl: recording?.thumbnailUrl || recording?.thumbnail_url || ''
					};
				});
			})
			.filter((recording) => Number.isFinite(recording.timestampMs))
			.sort((a, b) => a.timestampMs - b.timestampMs);
	}

	/**
	 * @param {Array<any>} recordings
	 * @param {Array<any>} events
	 */
	function groupTraceMarkRecords(recordings = [], events = []) {
		const groupedMarks = new Map();
		const validRecordings = recordings
			.filter((recording) => Number.isFinite(Number(recording?.timestampMs)))
			.sort((a, b) => Number(a.timestampMs) - Number(b.timestampMs));

		if (!validRecordings.length) return [];

		const eventBounds = getTimelineBounds(events);
		const recordingStart = Number(validRecordings[0]?.timestampMs);
		const recordingEnd = Number(validRecordings.at(-1)?.timestampMs);
		const rangeStart = Number.isFinite(eventBounds.start)
			? eventBounds.start
			: Number.isFinite(getRangeTimestampMs(startDateTime))
				? getRangeTimestampMs(startDateTime)
				: recordingStart;
		const rangeEnd = Number.isFinite(eventBounds.end)
			? eventBounds.end
			: Number.isFinite(getRangeTimestampMs(endDateTime))
				? getRangeTimestampMs(endDateTime)
				: recordingEnd;
		const rangeDuration = rangeEnd - rangeStart;
		const bucketDuration = rangeDuration > 0 ? rangeDuration / MAX_TIMELINE_TRACE_MARKS : 0;

		for (const recording of validRecordings) {
			const timestampMs = Number(recording?.timestampMs);
			const bucketIndex =
				bucketDuration > 0
					? Math.min(
							MAX_TIMELINE_TRACE_MARKS - 1,
							Math.max(0, Math.floor((timestampMs - rangeStart) / bucketDuration))
						)
					: 0;
			const bucketStart =
				bucketDuration > 0 ? rangeStart + bucketIndex * bucketDuration : timestampMs;
			const bucketEnd =
				bucketDuration > 0 ? Math.min(rangeEnd, bucketStart + bucketDuration) : timestampMs;
			const key = `motion-mark-bucket-${bucketIndex}`;
			const existingMark = groupedMarks.get(key);

			if (existingMark) {
				existingMark.recordings.push(recording);
				existingMark.firstTimestampMs = Math.min(existingMark.firstTimestampMs, timestampMs);
				existingMark.lastTimestampMs = Math.max(existingMark.lastTimestampMs, timestampMs);
				continue;
			}

			groupedMarks.set(key, {
				key,
				timestampMs,
				bucketStart,
				bucketEnd,
				firstTimestampMs: timestampMs,
				lastTimestampMs: timestampMs,
				recordings: [recording]
			});
		}

		return Array.from(groupedMarks.values())
			.map((mark) => ({
				...mark,
				cameraCount: new Set(mark.recordings.map(getTraceMarkCameraKey)).size,
				startedAtText: getTraceMarkGroupTimeText(mark),
				pinStyle: getTraceMarkPinStyle(mark.recordings)
			}))
			.sort((a, b) => a.timestampMs - b.timestampMs);
	}

	/** @param {any} mark */
	function getTraceMarkGroupTimeText(mark) {
		const firstTimestampMs = Number(mark?.firstTimestampMs);
		const lastTimestampMs = Number(mark?.lastTimestampMs);

		if (!Number.isFinite(firstTimestampMs)) return '-';
		if (!Number.isFinite(lastTimestampMs) || Math.abs(lastTimestampMs - firstTimestampMs) < 1000) {
			return formatTimestampMs(firstTimestampMs);
		}

		return `${formatTimestampMs(firstTimestampMs)} - ${formatTimestampMs(lastTimestampMs)}`;
	}

	/** @param {any} recording */
	function getTraceMarkCameraKey(recording) {
		return String(recording?.cameraToken || recording?.cameraName || '').trim();
	}

	/** @param {number} index */
	function getTraceMarkCameraPalette(index = 0) {
		return TRACE_MARK_CAMERA_COLORS[index % TRACE_MARK_CAMERA_COLORS.length];
	}

	/** @param {Array<any>} recordings */
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

		return Array.from(options.values())
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((option, index) => {
				const palette = getTraceMarkCameraPalette(index);

				return {
					...option,
					pinColor: palette.pin,
					pinHoverColor: palette.hover,
					pinSoftColor: palette.soft,
					optionStyle: `--camera-color: ${palette.pin}; --camera-hover-color: ${palette.hover}; --camera-soft-color: ${palette.soft};`
				};
			});
	}

	/** @param {Array<any>} options */
	function buildTraceMarkCameraColorMap(options = []) {
		const colorMap = new Map();

		for (const option of options) {
			colorMap.set(option.key, {
				pin: option.pinColor,
				hover: option.pinHoverColor,
				soft: option.pinSoftColor
			});
		}

		return colorMap;
	}

	/**
	 * @param {any} recording
	 * @param {Map<string, { pin: string; hover: string; soft: string }>} colorMap
	 */
	function getTraceMarkRecordingColor(recording, colorMap = traceMarkCameraColorMap) {
		const cameraKey = getTraceMarkCameraKey(recording);
		const palette = colorMap.get(cameraKey);
		return palette || getTraceMarkCameraPalette(0);
	}

	/** @param {any} recording */
	function getTraceMarkRecordingStyle(recording) {
		const palette = recording?.cameraPalette || getTraceMarkRecordingColor(recording);

		return `--camera-color: ${palette.pin}; --camera-hover-color: ${palette.hover}; --camera-soft-color: ${palette.soft};`;
	}

	/** @param {string} hex */
	function hexToRgb(hex) {
		const normalizedHex = String(hex || '')
			.replace('#', '')
			.trim();
		if (!/^[0-9a-f]{6}$/i.test(normalizedHex)) return null;

		return {
			r: Number.parseInt(normalizedHex.slice(0, 2), 16),
			g: Number.parseInt(normalizedHex.slice(2, 4), 16),
			b: Number.parseInt(normalizedHex.slice(4, 6), 16)
		};
	}

	/** @param {Array<string>} colors */
	function mixHexColors(colors = []) {
		const rgbColors = colors.map(hexToRgb).filter(Boolean);
		if (!rgbColors.length) return '#f97316';

		const mixed = rgbColors.reduce(
			(total, color) => ({
				r: total.r + color.r,
				g: total.g + color.g,
				b: total.b + color.b
			}),
			{ r: 0, g: 0, b: 0 }
		);

		return `#${[mixed.r, mixed.g, mixed.b]
			.map((value) =>
				Math.round(value / rgbColors.length)
					.toString(16)
					.padStart(2, '0')
			)
			.join('')}`;
	}

	/** @param {Array<any>} recordings */
	function getTraceMarkPinStyle(recordings = []) {
		const palettes = recordings.map((recording) => recording?.cameraPalette).filter(Boolean);
		const uniquePalettes = [];
		const seenColors = new Set();

		for (const palette of palettes) {
			if (!palette?.pin || seenColors.has(palette.pin)) continue;
			seenColors.add(palette.pin);
			uniquePalettes.push(palette);
		}

		if (uniquePalettes.length <= 1) {
			const palette = uniquePalettes[0] || getTraceMarkCameraPalette(0);
			return `--mark-pin-color: ${palette.pin}; --mark-pin-hover-color: ${palette.hover}; --mark-pin-shadow-color: ${palette.pin};`;
		}

		const mixedPinColor = mixHexColors(uniquePalettes.map((palette) => palette.pin));
		const mixedHoverColor = mixHexColors(uniquePalettes.map((palette) => palette.hover));

		return `--mark-pin-color: ${mixedPinColor}; --mark-pin-hover-color: ${mixedHoverColor}; --mark-pin-shadow-color: ${mixedPinColor};`;
	}

	function toggleTraceMarkCamera(cameraKey, checked) {
		if (checked) {
			selectedTraceMarkCameraKeys = Array.from(
				new Set([...selectedTraceMarkCameraKeys, cameraKey])
			);
		} else {
			selectedTraceMarkCameraKeys = selectedTraceMarkCameraKeys.filter((key) => key !== cameraKey);
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
		if (!isValidTraceDateTime(value)) return NaN;
		return parseTraceDateTimeMs(
			value,
			timezoneMode === 'manual' ? timezoneOffset : autoTimezoneLabel
		);
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
		const displayTimestamp = getCctvDisplayTimestamp(timestampMs);

		return cameraIndex.map((panel) => {
			const snapshots = panel.snapshots || [];
			const activeSnapshot = findPlaybackCctvSnapshot(snapshots, displayTimestamp);

			return {
				...panel,
				snapshots,
				activeSnapshot,
				loadedCount: snapshots.length
			};
		});
	}

	function getCctvDisplayTimestamp(timestampMs) {
		if (!isPlaying || playbackSpeedMultiplier < 5 || !Number.isFinite(timestampMs))
			return timestampMs;
		// High-speed replay samples up to four frames/second per camera. Loading
		// every skipped frame at x10 would overwhelm the connection and decoder.
		const step = 250 * TRACE_MS_PER_REAL_MS * playbackSpeedMultiplier;
		const origin = parseDateTimeMs(cctvSnapshotQuery?.startTime) || 0;
		return origin + Math.floor((timestampMs - origin) / step) * step;
	}

	function prepareCctvImages(timestampMs, playing = isPlaying) {
		const urls = [];
		for (const camera of cctvCameraIndex) {
			const current = findPlaybackCctvSnapshot(
				camera.snapshots,
				getCctvDisplayTimestamp(activeTraceTimestampMs)
			);
			if (current?.url) urls.push(current.url);
		}
		const displayTime = getCctvDisplayTimestamp(timestampMs);
		const step = 250 * TRACE_MS_PER_REAL_MS * playbackSpeedMultiplier * playbackDirection;
		for (let ahead = 0; ahead <= (playing ? 6 : 0); ahead += 1) {
			for (const camera of cctvCameraIndex) {
				const frame = findPlaybackCctvSnapshot(camera.snapshots, displayTime + ahead * step);
				if (frame?.url) urls.push(frame.url);
			}
		}
		cctvImageBuffer.setWindow(urls);
	}

	function isCctvPanelFramePending(panel) {
		cctvImageBufferRevision;
		const url = panel?.activeSnapshot?.url;
		return Boolean(url && !['ready', 'error'].includes(cctvImageBuffer.status(url)));
	}

	function isCctvPanelFrameFailed(panel) {
		cctvImageBufferRevision;
		return cctvImageBuffer.status(panel?.activeSnapshot?.url) === 'error';
	}

	function isCctvPlaybackReadyAt(timestampMs) {
		if (!cctvSnapshotQuery || !cctvItems.length) return true;
		const missingPages = getCctvPagesToLoad({
			timestampMs,
			pages: [...cctvSnapshotPages.values()],
			totalPages: getCctvTotalPages(),
			rangeStart: parseDateTimeMs(cctvSnapshotQuery.startTime),
			rangeEnd: parseDateTimeMs(cctvSnapshotQuery.endTime),
			playing: false,
			direction: playbackDirection
		});
		if (missingPages.length) {
			void ensureCctvPageForTimestamp(timestampMs);
			return false;
		}
		prepareCctvImages(timestampMs);
		return cctvCameraIndex.every((camera) => {
			const frame = findPlaybackCctvSnapshot(
				camera.snapshots,
				getCctvDisplayTimestamp(timestampMs)
			);
			return !frame?.url || ['ready', 'error'].includes(cctvImageBuffer.status(frame.url));
		});
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
				label: formatDateTime(timestampMs),
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
			event.label = point?.timestamp ? formatDateTime(point.timestamp) : event.label;
		});

		snapshots.forEach((snapshot) => {
			const timestampMs = snapshot?.timestampMs;
			if (!Number.isFinite(timestampMs)) return;

			const event = ensureEvent(timestampMs);
			if (!event) return;

			event.hasCctv = true;
			if (event.traceIndex < 0) event.traceIndex = findClosestTraceIndexByTime(timestampMs, points);
			if (snapshot?.name) event.cameraNames.add(snapshot.name);
			if (!event.hasTrace) event.label = formatDateTime(timestampMs);
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
		// Without telemetry, the loaded CCTV cache must not truncate playback
		// at the last frame of page 1 while later pages are still unloaded.
		if (!tracePoints.length && cctvSnapshotQuery && getCctvTotalPages() > 1) {
			return {
				start: parseDateTimeMs(cctvSnapshotQuery.startTime),
				end: parseDateTimeMs(cctvSnapshotQuery.endTime)
			};
		}

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
		cctvSnapshotsBuffering = true;

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
			cctvSnapshotPages.set(pageNumber, summarizeCctvPage(pageNumber, nextItems));
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
		} catch (err) {
			if (requestId === cctvSnapshotRequestId)
				cctvSnapshotRetryAfter.set(pageNumber, Date.now() + 5000);
			throw err;
		} finally {
			cctvSnapshotPageRequests.delete(requestKey);
			if (requestId === cctvSnapshotRequestId) {
				cctvSnapshotsBuffering = [...cctvSnapshotPageRequests].some((key) =>
					key.startsWith(`${requestId}|`)
				);
				cctvPageRequestRevision += 1;
			}
		}
	}

	async function loadTraceCctvSnapshots({ vesselId, startTime, endTime }) {
		const requestId = ++cctvSnapshotRequestId;
		cctvImageBuffer.clear();
		cctvImageBufferRevision += 1;
		cctvPlaybackBuffering = false;
		cctvSnapshotQuery = { requestId, vesselId, startTime, endTime };
		cctvItems = [];
		cctvSnapshotsTotal = 0;
		cctvSnapshotsTotalPages = 1;
		cctvSnapshotsLoadedPages = 0;
		cctvSnapshotsLoadedPageNumbers = [];
		cctvSnapshotPages.clear();
		cctvSnapshotRetryAfter.clear();
		cctvSnapshotPageRequests.clear();
		cctvSnapshotsBuffering = true;

		try {
			// Only fetch the first batch. Further requests are driven by playback.
			return await loadCctvSnapshotPage({
				...cctvSnapshotQuery,
				page: 1,
				preserveTimeline: false,
				source: 'initial'
			});
		} finally {
			if (requestId === cctvSnapshotRequestId) cctvSnapshotsBuffering = false;
		}
	}

	async function ensureCctvPageForTimestamp(
		timestampMs,
		{ playing = isPlaying, direction = playbackDirection, speed = playbackSpeedMultiplier } = {}
	) {
		const query = cctvSnapshotQuery;
		if (!query || query.requestId !== cctvSnapshotRequestId) return;
		if (query.vesselId !== $selectedVesselId || !active || loading || !hasLoadedDateRange) return;
		if (!cctvSnapshotsTotal || !Number.isFinite(timestampMs)) return;
		const inflight = [...cctvSnapshotPageRequests].filter((key) =>
			key.startsWith(`${query.requestId}|`)
		).length;
		const slots = Math.max(0, (playing ? getCctvLookAheadPages(speed) : 1) - inflight);
		if (!slots) return;

		const pages = getCctvPagesToLoad({
			timestampMs,
			pages: [...cctvSnapshotPages.values()],
			totalPages: getCctvTotalPages(),
			rangeStart: parseDateTimeMs(query.startTime),
			rangeEnd: parseDateTimeMs(query.endTime),
			playing,
			direction,
			speed,
			traceMsPerRealMs: TRACE_MS_PER_REAL_MS
		})
			.filter(
				(page) =>
					!isCctvPageLoaded(page) &&
					!cctvSnapshotPageRequests.has(`${query.requestId}|${page}`) &&
					(cctvSnapshotRetryAfter.get(page) || 0) <= Date.now()
			)
			.slice(0, slots);

		await Promise.all(
			pages.map(async (page) => {
				try {
					await loadCctvSnapshotPage({
						...query,
						page,
						source: playing ? 'playback-buffer' : 'timeline-seek'
					});
					if (query.requestId === cctvSnapshotRequestId) {
						cctvSnapshotRetryAfter.delete(page);
						if (!cctvSnapshotRetryAfter.size) cctvSnapshotsError = '';
					}
				} catch (err) {
					if (query.requestId !== cctvSnapshotRequestId) return;
					cctvSnapshotRetryAfter.set(page, Date.now() + 5000);
					cctvSnapshotsError = err?.message || 'Failed to load CCTV snapshots near playback time.';
					console.error('[VESSEL_TRACE_CCTV_PAGE_ERROR]', err);
				}
			})
		);
	}

	function normalizeRpm(value) {
		if (value == null) return {};

		if (typeof value === 'object' && !Array.isArray(value)) {
			return Object.fromEntries(
				Object.entries(value).map(([engineName, rpmValue]) => [engineName, toNumber(rpmValue, NaN)])
			);
		}

		return {
			RPM: toNumber(value, NaN)
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
			.map((value) => toNumber(value, NaN))
			.filter((value) => Number.isFinite(value));

		if (!values.length) return NaN;

		return Math.max(...values);
	}

	function getAvgRpm(rpmObject = {}) {
		const values = Object.values(rpmObject)
			.map((value) => toNumber(value, NaN))
			.filter((value) => Number.isFinite(value));

		if (!values.length) return NaN;

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

	function isMissingTraceValue(value) {
		return (
			value == null ||
			(typeof value === 'number' && !Number.isFinite(value)) ||
			(typeof value === 'string' && /^(?:nan|-)?$/i.test(value.trim()))
		);
	}

	function normalizeTraceWeather(value) {
		if (isMissingTraceValue(value)) return '-';

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
			const windText = Number.isFinite(toNumber(windDirection, NaN))
				? `${formatNumber(windDirection, 0, '0')}°`
				: (value.wind_dir ?? value.windDir ?? value.wind_direction ?? '');

			return (
				[
					isMissingTraceValue(condition) ? '' : condition,
					isMissingTraceValue(windText) ? '' : `Wind ${windText}`
				]
					.filter(Boolean)
					.join(' • ') || '-'
			);
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

	function sanitizeTracePositions(points = []) {
		const dropped = [];
		let previous = null;

		// Missing GPS and rejected jumps must not remove timestamps or telemetry.
		// Only the map position is excluded, preserving playback through data gaps.
		const sanitized = points.map((point) => {
			if (!isValidTraceCoordinate(point.latitude, point.longitude)) {
				return { ...point, latitude: NaN, longitude: NaN };
			}

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
					return { ...point, latitude: NaN, longitude: NaN };
				}
			}

			previous = point;
			return point;
		});

		if (dropped.length) {
			traceDebug('[TRACE_POINTS_OUTLIERS_DROPPED]', {
				dropped: dropped.length,
				minThresholdNm: MAX_TRACE_POINT_JUMP_NM,
				maxSpeedKn: MAX_TRACE_POINT_SPEED_KN,
				samples: dropped.slice(0, 8)
			});
		}

		return sanitized;
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

				const rpm = normalizeRpm(item.rpm ?? item.me_rpm ?? item.mePortRpm ?? item.me_port_rpm);
				const timestampRaw = getTraceTimestampRaw(item);
				const timestampDisplay = getTraceDisplayTime(item, timestampRaw);

				return {
					index,
					rawIndex: index,
					latitude: lat,
					longitude: lng,
					heading: toNumber(item.heading ?? item.course ?? item.bearing, NaN),
					speed: toNumber(item.speed ?? item.sog ?? item.speedOverGround, NaN),
					distance: toNumber(
						item.distance ??
							item.distance_nm ??
							item.distanceNm ??
							item.totalDistance ??
							item.total_distance ??
							item.distance_traveled ??
							item.distanceTraveled,
						NaN
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
						NaN
					),
					fuelPerHour: getTraceFuelPerHour(item),
					weather: normalizeTraceWeather(item.weather ?? item.weatherForecast ?? item.condition),
					ocean: normalizeOceanCurrent(item.ocean ?? item.oceanCurrent ?? item.current),
					queue: toNumber(item.queue, NaN),
					sdCard: toNumber(item.sdCard ?? item.sd_card, NaN),
					online: isMissingTraceValue(item.online) ? null : Boolean(item.online),
					timeFormatted: timestampDisplay,
					timestampRaw,
					timestamp: timestampDisplay
				};
			})
			.filter(Boolean)
			.sort((a, b) => {
				const aTime = parseDateTimeMs(a.timestampRaw ?? a.timestamp);
				const bTime = parseDateTimeMs(b.timestampRaw ?? b.timestamp);
				return (
					(Number.isFinite(aTime) ? aTime : Infinity) - (Number.isFinite(bTime) ? bTime : Infinity)
				);
			});

		const resolvedPoints = carryForwardTraceValues(sanitizeTracePositions(points));

		traceDebug('[TRACE_POINTS_PARSED]', resolvedPoints.length, resolvedPoints.slice(0, 3));

		return resolvedPoints;
	}

	function carryForwardTraceValues(points = []) {
		let previous = null;
		const retainPrevious = (value, previousValue) =>
			isMissingTraceValue(value) && !isMissingTraceValue(previousValue) ? previousValue : value;

		// Resolve in chronological order, not playback order, so reverse/seek give
		// the same values. Never carry timestamps, RPM, or fuel-rate readings.
		return points.map((point, index) => {
			const current = { ...point, index, ocean: { ...point.ocean } };
			for (const field of [
				'latitude',
				'longitude',
				'heading',
				'speed',
				'distance',
				'weather',
				'queue',
				'sdCard',
				'online'
			]) {
				current[field] = retainPrevious(point[field], previous?.[field]);
			}
			for (const field of ['speedKph', 'directionTo', 'directionDeg']) {
				current.ocean[field] = retainPrevious(point.ocean?.[field], previous?.ocean?.[field]);
			}
			current.isPositionCarriedForward =
				!isValidTraceCoordinate(point.latitude, point.longitude) &&
				isValidTraceCoordinate(current.latitude, current.longitude);
			previous = current;
			return current;
		});
	}

	let tracePoints = $derived(getTracePoints(traceData));
	let timelineEvents = $derived(buildMergedTimelineEvents(tracePoints, cctvItems));
	let traceMarkCameraOptions = $derived(buildTraceMarkCameraOptions(traceMarks));
	let traceMarkCameraColorMap = $derived(buildTraceMarkCameraColorMap(traceMarkCameraOptions));
	let filteredTraceMarks = $derived(
		traceMarks
			.filter((recording) => selectedTraceMarkCameraKeys.includes(getTraceMarkCameraKey(recording)))
			.map((recording) => ({
				...recording,
				startedAtText: formatDateTime(recording.startedAt || recording.timestampMs),
				cameraPalette: getTraceMarkRecordingColor(recording, traceMarkCameraColorMap)
			}))
	);
	let timelineTraceMarks = $derived(
		groupTraceMarkRecords(filteredTraceMarks, timelineEvents).map((mark) => ({
			...mark,
			left: getTraceMarkPosition(mark.timestampMs, timelineEvents)
		}))
	);
	let activeTimelineEvent = $derived(timelineEvents[activeIndex] || timelineEvents[0] || null);
	let activeTimelineTimestampMs = $derived(
		Number.isFinite(activePlaybackTimestampMs)
			? activePlaybackTimestampMs
			: (activeTimelineEvent?.timestampMs ??
					parseDateTimeMs(
						tracePoints[activeIndex]?.timestampRaw || tracePoints[activeIndex]?.timestamp
					))
	);
	let activeTraceIndex = $derived(
		Number.isFinite(activeTimelineTimestampMs)
			? Math.max(0, findTraceIndexAtOrBefore(activeTimelineTimestampMs))
			: Number.isInteger(activeTimelineEvent?.traceIndex) && activeTimelineEvent.traceIndex >= 0
				? activeTimelineEvent.traceIndex
				: Math.max(0, findClosestTraceIndexByTime(activeTimelineTimestampMs))
	);
	let activeTimelineLabel = $derived(
		(Number.isFinite(activeTimelineTimestampMs) ? formatDateTime(activeTimelineTimestampMs) : '') ||
			activeTimelineEvent?.label ||
			tracePoints[activeTraceIndex]?.timeFormatted ||
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

	let activeRpmEntries = $derived(
		sortRpmEntriesByEnginePriority(Object.entries(activePoint.rpm || {}))
	);

	let timelineProgress = $derived(
		(() => {
			const { start, end } = getTimelineBounds(timelineEvents);
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
			return Math.min(
				100,
				Math.max(0, ((activeTimelineTimestampMs - start) / (end - start)) * 100)
			);
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

	function toTraceCctvView(panel) {
		const frame = panel.activeSnapshot;

		return {
			key: panel.key,
			name: panel.name,
			loadedCount: panel.loadedCount,
			pending: isCctvPanelFramePending(panel),
			failed: isCctvPanelFrameFailed(panel),
			frame: frame
				? {
						url: frame.url,
						filePath: frame.filePath,
						key: frame.key,
						online: frame.online,
						timeText: formatDateTime(frame.timestampMs)
					}
				: null
		};
	}

	let traceCctvMainView = $derived(mainCctvPanel ? toTraceCctvView(mainCctvPanel) : null);
	let traceCctvMiniView = $derived(miniCctvPanels.map(toTraceCctvView));
	let tracePlaybackMarks = $derived(
		timelineTraceMarks.map((mark) => ({
			...mark,
			recordings: mark.recordings.map((recording) => ({
				...recording,
				style: getTraceMarkRecordingStyle(recording)
			}))
		}))
	);
	let traceRpmCards = $derived(
		activeRpmEntries.map(([engineName, rpmValue], index) => ({
			key: `${engineName}-${index}`,
			label: engineName,
			value: `${formatNumber(rpmValue, 0)} RPM`
		}))
	);

	let vesselInfo = $derived({
		vesselName,
		latitude: activePoint.latitude,
		longitude: activePoint.longitude,
		heading: activePoint.heading,
		currentSpeed: `${formatNumber(activePoint.speed, 1)} knot`,
		distance: formatTraceDistance(activePoint.distance),
		maxRpm: `${formatNumber(activePoint.maxRpm, 0)} RPM`,
		avgRpm: `${formatNumber(activePoint.avgRpm, 0)} RPM`,
		fuelPerHour: `${formatNumber(activePoint.fuelPerHour, 2)} L/h`,
		weatherForecast: activePoint.weather || $selectedVesselInfo?.weather?.current?.condition || '-',
		oceanCurrent: formatOceanCurrent(activePoint.ocean),
		lastUpdate: activeTimelineLabel || activePoint.timestamp || '-',
		onlineStatus: activePoint.online ? 'Online' : 'Offline'
	});

	let traceInfoCards = $derived([
		{ key: 'speed', label: 'Speed', value: vesselInfo.currentSpeed },
		{ key: 'distance', label: 'Distance', value: vesselInfo.distance },
		{ key: 'heading', label: 'Heading', value: `${formatNumber(vesselInfo.heading, 1)}°` },
		{ key: 'fuel', label: 'L/h', value: vesselInfo.fuelPerHour },
		{ key: 'weather', label: 'Weather', value: vesselInfo.weatherForecast },
		{ key: 'ocean', label: 'Ocean current', value: vesselInfo.oceanCurrent },
		{ key: 'points', label: 'Points', value: tracePoints.length }
	]);

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
			cctvSnapshotQuery = null;
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
			error =
				!Number.isFinite(startMs) || !Number.isFinite(endMs)
					? 'Please enter valid Start and End dates with a 4-digit year.'
					: 'End time must be later than start time.';
			traceData = null;
			hasLoadedDateRange = false;
			activePlaybackTimestampMs = NaN;
			cctvItems = [];
			cctvSnapshotsTotal = 0;
			cctvSnapshotsTotalPages = 1;
			cctvSnapshotsBuffering = false;
			cctvSnapshotsLoadedPages = 0;
			cctvSnapshotsLoadedPageNumbers = [];
			cctvSnapshotQuery = null;
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
			cctvSnapshotQuery = null;
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
			loadedTimezone = timezoneMode === 'manual' ? timezoneOffset : autoTimezoneLabel;
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
			cctvSnapshotQuery = null;
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

		if (!isCctvPlaybackReadyAt(nextTime)) {
			cctvPlaybackBuffering = true;
			// Do not accumulate wall-clock time while waiting: resuming must not
			// jump ahead again and leave all prefetched frames behind.
			playbackClockStartedAtTraceMs = getCurrentTimelineTimestampMs();
			playbackClockStartedAtRealMs = Date.now();
			return;
		}
		cctvPlaybackBuffering = false;

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
		cctvPlaybackBuffering = false;
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

	function syncTraceFullscreen() {
		const nextFullscreen = Boolean(traceRoot?.matches(':fullscreen'));
		if (nextFullscreen && !isTraceFullscreen) setFullscreenCctvOpen(false);
		isTraceFullscreen = nextFullscreen;
	}

	function setFullscreenCctvOpen(open) {
		fullscreenCctvOpen = open;
		if (!open) activeTraceMarkKey = '';
	}

	async function exitTraceFullscreen() {
		if (!traceRoot?.matches(':fullscreen') || !document.fullscreenElement) return;
		try {
			await document.exitFullscreen();
		} catch {
			if (!destroyed) fullscreenError = 'Unable to exit fullscreen. Press Esc to leave fullscreen.';
		}
	}

	async function toggleTraceFullscreen() {
		if (fullscreenPending) return;
		fullscreenError = '';
		if (isTraceFullscreen) {
			await exitTraceFullscreen();
			return;
		}
		if (!traceRoot?.requestFullscreen || !document.fullscreenEnabled) {
			fullscreenError = 'Fullscreen is unavailable in this browser or embedded view.';
			return;
		}
		fullscreenPending = true;
		try {
			// Request native browser fullscreen directly from the user's click.
			await traceRoot.requestFullscreen({ navigationUI: 'hide' });
			if (!active || destroyed) await exitTraceFullscreen();
		} catch {
			if (!destroyed) {
				fullscreenError =
					'Could not enter fullscreen. Please try again or check your browser permissions.';
			}
		} finally {
			if (!destroyed) fullscreenPending = false;
		}
	}

	function handleTraceWindowKeydown(event) {
		if (event.key !== 'Escape') return;
		document.querySelector('.timeline-camera-filter[open]')?.removeAttribute('open');

		if (motionVideoOpen) {
			closeMotionVideo();
			return;
		}

		if (isTraceFullscreen) {
			void exitTraceFullscreen();
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
		destroyed = true;
		void exitTraceFullscreen();
		clearPlaybackInterval('destroy');
		cctvSnapshotRequestId += 1;
		cctvImageBuffer.clear();
		motionVideoRequestId += 1;
	});

	$effect(() => {
		if (!isTraceFullscreen || !traceRoot) return;
		const root = traceRoot;
		let resizeObserver;
		const mutationObserver = new MutationObserver(observeMapControls);
		function observeMapControls() {
			const controls = root.querySelector('.map-panel .leaflet-top.leaflet-left');
			if (!controls) return;
			mutationObserver.disconnect();
			const update = () => {
				mapControlsBottom = controls.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
			};
			resizeObserver = new ResizeObserver(update);
			resizeObserver.observe(controls);
			update();
		}
		mutationObserver.observe(root, { childList: true, subtree: true });
		observeMapControls();
		return () => {
			mutationObserver.disconnect();
			resizeObserver?.disconnect();
		};
	});

	$effect(() => {
		if (!active || loading || !hasLoadedDateRange || isDraggingTimeline) return;
		const timestampMs = activeTraceTimestampMs;
		const options = {
			playing: isPlaying,
			direction: playbackDirection,
			speed: playbackSpeedMultiplier
		};
		cctvSnapshotsLoadedPageNumbers;
		cctvPageRequestRevision;
		// Re-evaluate after each tick, seek, speed change, or page completion.
		// Look-ahead stays anchored to this position: x1/x2 = 1, x5 = 2, x10 = 3 pages.
		untrack(() => {
			void ensureCctvPageForTimestamp(timestampMs, options);
		});
	});

	$effect(() => {
		if (!active || loading || !hasLoadedDateRange || isDraggingTimeline) {
			untrack(() => cctvImageBuffer.setWindow([]));
			return;
		}
		const timestampMs = activeTraceTimestampMs;
		const playing = isPlaying;
		playbackSpeedMultiplier;
		playbackDirection;
		cctvCameraIndex;
		untrack(() => prepareCctvImages(timestampMs, playing));
	});

	$effect(() => {
		if (!active) {
			stopPlayback('inactive-page');
			if (motionVideoOpen) closeMotionVideo();
			if (isTraceFullscreen) void exitTraceFullscreen();
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
<svelte:document onfullscreenchange={syncTraceFullscreen} />

<section
	class="trace-root page-content"
	class:trace-fullscreen={isTraceFullscreen}
	class:fullscreen-cctv-hidden={isTraceFullscreen && !fullscreenCctvOpen}
	style:--trace-dock-height={`${bottomPanelHeight}px`}
	style:--trace-map-controls-bottom={`${mapControlsBottom}px`}
	bind:this={traceRoot}
>
	{#if fullscreenError}
		<div class="trace-fullscreen-error" role="alert">
			<span>{fullscreenError}</span>
			<button
				type="button"
				aria-label="Dismiss fullscreen error"
				onclick={() => (fullscreenError = '')}>&times;</button
			>
		</div>
	{/if}
	{#if isTraceFullscreen}
		<button
			type="button"
			class="trace-fullscreen-cctv-toggle trace-floating-control"
			aria-expanded={fullscreenCctvOpen}
			aria-controls="trace-floating-cctv"
			onclick={() => setFullscreenCctvOpen(!fullscreenCctvOpen)}
		>{fullscreenCctvOpen ? 'Hide CCTV' : 'Show CCTV'}</button
		>
		<button
			type="button"
			class="trace-fullscreen-exit trace-floating-control"
			onclick={exitTraceFullscreen}
			aria-label="Exit fullscreen"
			title="Exit fullscreen (Esc)"
		>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6" />
			</svg>
		</button>
	{/if}
	<section class="trace-viewport">
		<TraceHeader
			vesselName={vesselInfo.vesselName}
			bind:startDateTime
			bind:endDateTime
			bind:timezoneMode
			bind:timezoneOffset
			{autoTimezoneLabel}
			{activeTimePreset}
			presets={TIME_PRESETS}
			{loading}
			canLoad={isValidTraceDateTime(startDateTime) && isValidTraceDateTime(endDateTime)}
			onLoad={loadTrace}
			onPreset={applyTimePreset}
			onDateTimeInput={clearActiveTimePreset}
			onTimezoneChange={() => (hasLoadedDateRange = false)}
		/>

		<div
			class="load-required-area trace-load-required-area"
			class:is-locked={shouldShowDateRangeOverlay}
		>
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
					<TraceCctv
						panelId="trace-floating-cctv"
						onClose={isTraceFullscreen ? () => setFullscreenCctvOpen(false) : null}
						mainPanel={traceCctvMainView}
						miniPanels={traceCctvMiniView}
						error={cctvSnapshotsError}
						loadedCount={cctvItems.length}
						total={cctvSnapshotsTotal}
						buffering={cctvSnapshotsBuffering}
						playbackBuffering={cctvPlaybackBuffering}
						renderTick={playbackRenderTick}
						loadImage={cctvImageBuffer.load}
						onSelect={(key) => (selectedCctvPanelKey = key)}
					/>

					<TraceMap
						{active}
						{vesselInfo}
						{tracePoints}
						{activeTraceIndex}
						renderTick={playbackRenderTick}
						gpsUnavailable={Boolean(
							tracePoints.length &&
							!isValidTraceCoordinate(vesselInfo.latitude, vesselInfo.longitude)
						)}
						usingPreviousPosition={activePoint.isPositionCarriedForward}
						isFullscreen={isTraceFullscreen}
						onToggleFullscreen={toggleTraceFullscreen}
					/>
				</section>

				<section class="bottom-panel" bind:clientHeight={bottomPanelHeight}>
					<TracePlayback
						{isPlaying}
						direction={playbackDirection}
						speedOptions={PLAYBACK_SPEED_OPTIONS}
						speed={playbackSpeedMultiplier}
						{activeIndex}
						eventCount={timelineEvents.length}
						bufferSegments={cctvBufferSegments}
						marks={tracePlaybackMarks}
						activeMarkKey={activeTraceMarkKey}
						cameraOptions={traceMarkCameraOptions}
						selectedCameraKeys={selectedTraceMarkCameraKeys}
						showCameraFilter={showCctvTimeline}
						showCameraMarks={showCctvTimeline}
						progress={timelineProgress}
						timeLabel={activeTimelineLabel}
						sourceLabel={activeTimelineSourceLabel}
						marksError={traceMarksError}
						onStep={moveStep}
						onToggle={togglePlayback}
						onSpeed={setPlaybackSpeed}
						onTimelinePointerDown={startTimelineDrag}
						onTimelinePointerMove={dragTimeline}
						onTimelinePointerUp={stopTimelineDrag}
						onTimelineClick={moveTimeline}
						onToggleMark={toggleTraceMarkPopup}
						onOpenRecording={openMotionVideo}
						onToggleAllCameras={(checked) =>
							toggleAllTraceMarkCameras(checked, traceMarkCameraOptions)}
						onToggleCamera={toggleTraceMarkCamera}
					/>

					<TraceData cards={traceInfoCards} rpmEntries={traceRpmCards} />
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
						aria-label="Close CCTV recording">×</button
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
							<strong>{formatDateTime(motionVideoDetail?.startedAt)}</strong>
						</div>
						<div>
							<span>Ended</span>
							<strong>{formatDateTime(motionVideoDetail?.endedAt)}</strong>
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
</section>
