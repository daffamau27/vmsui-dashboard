import { parseTraceDateTimeMs } from './traceDateTime.js';

const MINUTE_MS = 60_000;
// The log samples once per minute. Allow timestamp jitter, but not missing minutes.
const MAX_SAMPLE_GAP_MS = 90_000;

function telemetryNumber(value) {
	if (typeof value !== 'number' && typeof value !== 'string') return null;
	if (typeof value === 'string' && !value.trim()) return null;
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : null;
}

export function getDataLogTimestamp(row, timezone = 'UTC+00:00') {
	for (const key of ['timestamp_utc', 'timestamp', 'ts', 'time', 'datetime']) {
		const value = row?.[key];
		if (value === null || value === undefined || value === '') continue;
		const timestamp = parseTraceDateTimeMs(value, key === 'timestamp_utc' ? 'UTC+00:00' : timezone);
		if (Number.isFinite(timestamp)) return timestamp;
	}
	return NaN;
}

// Analyze oldest first, independently of display order and selected columns.
// Track each main engine (ME) separately; auxiliary engines (AE) do not qualify.
export function getDataLogRowHighlights(rows = [], timezone = 'UTC+00:00') {
	const highlights = new Map();
	const engineRuns = new Map();
	let previousTimestamp = null;
	const samples = rows
		.map((row) => ({ row, timestamp: getDataLogTimestamp(row, timezone) }))
		.filter(({ timestamp }) => Number.isFinite(timestamp))
		.sort((a, b) => a.timestamp - b.timestamp);

	function finishRun(key) {
		const run = engineRuns.get(key);
		engineRuns.delete(key);
		const durationMs = run.end - run.start;
		const level =
			durationMs > 10 * MINUTE_MS ? 'danger' : durationMs >= 5 * MINUTE_MS ? 'warning' : '';
		if (!level) return;

		// Color every row, including the beginning, using the full interval duration.
		// Only intervals whose total duration is under five minutes remain unmarked.
		for (const row of run.rows) {
			const previous = highlights.get(row);
			if (previous?.level === 'danger' && level === 'warning') continue;
			const sameLevel = previous?.level === level;
			highlights.set(row, {
				level,
				durationMinutes: Math.max(durationMs / MINUTE_MS, sameLevel ? previous.durationMinutes : 0),
				engines: sameLevel ? [...new Set([...previous.engines, run.engine])] : [run.engine]
			});
		}
	}

	function finishAllRuns() {
		for (const key of engineRuns.keys()) finishRun(key);
	}

	for (const { row, timestamp } of samples) {
		if (previousTimestamp !== null && timestamp - previousTimestamp > MAX_SAMPLE_GAP_MS) {
			finishAllRuns();
		}
		previousTimestamp = timestamp;

		const values = Object.entries(row).map(([key, value]) => [
			key.toLowerCase().replace(/[^a-z0-9]/g, ''),
			value,
			key
		]);
		const speed = telemetryNumber(values.find(([key]) => key === 'speed')?.[1]);
		if (speed === null || speed >= 2) {
			finishAllRuns();
			continue;
		}

		const qualifyingEngines = new Set();
		for (const [key, value, label] of values) {
			if (!/^(?:me|mainengine).*rpm$/.test(key)) continue;
			const rpm = telemetryNumber(value);
			if (rpm === null || rpm <= 1000) continue;
			qualifyingEngines.add(key);
			if (!engineRuns.has(key)) {
				engineRuns.set(key, {
					start: timestamp,
					end: timestamp,
					engine: label
						.replace(/[_\s]+rpm$/i, '')
						.replaceAll('_', ' ')
						.toUpperCase(),
					rows: []
				});
			}
			const run = engineRuns.get(key);
			run.end = timestamp;
			run.rows.push(row);
		}
		for (const key of engineRuns.keys()) {
			if (!qualifyingEngines.has(key)) finishRun(key);
		}
	}

	finishAllRuns();
	return highlights;
}
