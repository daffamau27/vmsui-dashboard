import { normalizeUtcLabel } from './autoTimezoneLabel.js';

const pad = (value) => String(value).padStart(2, '0');

function utcLabel(value) {
	if (/^(UTC|Z)$|\(UTC\)$/i.test(String(value).trim())) return 'UTC+00:00';
	const label = normalizeUtcLabel(value);
	const match = label.match(/^UTC([+-])(\d{2}):(\d{2})$/);
	if (!match || Number(match[2]) > 14 || Number(match[3]) > 59) return '';
	return label;
}

function offsetMinutes(label) {
	const [, sign, hours, minutes] = label.match(/^UTC([+-])(\d{2}):(\d{2})$/);
	return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
}

export function getTraceTimezone(response, fallback = 'UTC+00:00') {
	const data = response?.data || response;
	return (
		utcLabel(data?.timezone) ||
		utcLabel(data?.points?.[0]?.timeFormatted) ||
		utcLabel(fallback) ||
		'UTC+00:00'
	);
}

// Epoch milliseconds always remain unchanged. Zone-less API dates use the trace
// timezone, never the browser's timezone.
export function parseTraceDateTimeMs(value, timezone = 'UTC+00:00') {
	if (value === null || value === undefined || value === '') return NaN;
	if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
	const raw = String(value).trim();
	if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
	const label = utcLabel(raw) || utcLabel(timezone) || 'UTC+00:00';
	const cleaned = raw.replace(/\s*\(UTC(?:\s*[+-]\d{1,2}(?::?\d{2})?)?\)\s*$/i, '').trim();
	const dmy = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
	const ymd = cleaned.match(
		/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
	);
	if (dmy || ymd) {
		const [, year, month, day, hour, minute, second = '0', millis = '0'] = ymd || [
			null,
			dmy[3],
			dmy[2],
			dmy[1],
			dmy[4],
			dmy[5],
			dmy[6]
		];
		return (
			Date.UTC(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second),
				Number(millis.padEnd(3, '0'))
			) -
			offsetMinutes(label) * 60000
		);
	}
	// ISO timestamps with an explicit offset are already absolute times.
	if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleaned)) return Date.parse(cleaned);
	return NaN;
}

export function formatTraceDateTime(value, timezone = '') {
	const label = utcLabel(timezone) || utcLabel(value) || 'UTC+00:00';
	const timestamp = parseTraceDateTimeMs(value, label);
	if (!Number.isFinite(timestamp)) return typeof value === 'string' && value.trim() ? value : '-';
	const date = new Date(timestamp + offsetMinutes(label) * 60000);
	if (Number.isNaN(date.getTime())) return '-';
	return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} (${label})`;
}
