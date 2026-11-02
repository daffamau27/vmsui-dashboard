export function formatValue(value, fallback = '-') {
	if (value === null || value === undefined || value === '') return fallback;
	return value;
}

export function formatNumber(value, digits = 1, fallback = '-') {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return number.toFixed(digits);
}

export function formatDmsCoordinate(value, axis = 'lat') {
	const number = Number(value);
	if (!Number.isFinite(number)) return '-';

	const direction = axis === 'lng' ? (number >= 0 ? 'E' : 'W') : number >= 0 ? 'N' : 'S';
	let absolute = Math.abs(number);
	let degrees = Math.floor(absolute);
	let minutesFloat = (absolute - degrees) * 60;
	let minutes = Math.floor(minutesFloat);
	let seconds = Number(((minutesFloat - minutes) * 60).toFixed(2));

	if (seconds >= 60) {
		seconds = 0;
		minutes += 1;
	}

	if (minutes >= 60) {
		minutes = 0;
		degrees += 1;
	}

	const paddedMinutes = String(minutes).padStart(2, '0');
	const paddedSeconds = seconds.toFixed(2).padStart(5, '0');

	return `${degrees}\u00b0 ${paddedMinutes}' ${paddedSeconds}" ${direction}`;
}

export function formatDmsPair(latitude, longitude) {
	const latDms = formatDmsCoordinate(latitude, 'lat');
	const lngDms = formatDmsCoordinate(longitude, 'lng');

	if (latDms === '-' || lngDms === '-') return '-';

	return `${latDms} \u2022 ${lngDms}`;
}

export function parseVesselDateTime(value, timezoneHint = null) {
	if (!value || value === '-') return null;

	const text = String(value).trim();
	const timezoneText = `${text} ${timezoneHint || ''}`;
	const timezoneMatch = timezoneText.match(/\(?\bUTC\s*([+-])(\d{1,2})(?::?(\d{2}))?\)?/i);
	const timezoneOffsetMinutes = timezoneMatch
		? (timezoneMatch[1] === '-' ? -1 : 1) *
			(Number(timezoneMatch[2]) * 60 + Number(timezoneMatch[3] || 0))
		: null;

	function buildDateWithOptionalTimezone({ year, month, day, hour, minute, second }) {
		if (Number.isFinite(timezoneOffsetMinutes)) {
			const utcTime =
				Date.UTC(year, month - 1, day, hour, minute, second) - timezoneOffsetMinutes * 60 * 1000;

			const date = new Date(utcTime);
			return Number.isNaN(date.getTime()) ? null : date;
		}

		const date = new Date(year, month - 1, day, hour, minute, second);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);

	if (match) {
		const [, dd, mm, yyyy, hh, min, ss] = match;

		const date = buildDateWithOptionalTimezone({
			year: Number(yyyy),
			month: Number(mm),
			day: Number(dd),
			hour: Number(hh),
			minute: Number(min),
			second: Number(ss)
		});

		if (date) return date;
	}

	const isoLikeMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?/);

	if (isoLikeMatch) {
		const [, yyyy, mm, dd, hh, min, ss = '0'] = isoLikeMatch;
		const date = buildDateWithOptionalTimezone({
			year: Number(yyyy),
			month: Number(mm),
			day: Number(dd),
			hour: Number(hh),
			minute: Number(min),
			second: Number(ss)
		});

		if (date) return date;
	}

	const fallbackDate = new Date(text);
	if (!Number.isNaN(fallbackDate.getTime())) return fallbackDate;

	return null;
}

export function stripUtcLabel(value) {
	if (!value || value === '-') return '-';

	const cleaned = String(value)
		.replace(/\s*\(?\bUTC\s*[+-]\d{1,2}(?::?\d{2})?\)?\s*/gi, ' ')
		.replace(/\s{2,}/g, ' ')
		.trim();

	return cleaned || '-';
}

export function getUtcLabel(value) {
	if (!value || value === '-') return null;

	const text = String(value).trim();

	if (/^Asia\/Jakarta$/i.test(text) || /^WIB$/i.test(text)) return 'UTC+07:00';
	if (/^Asia\/Makassar$/i.test(text) || /^WITA$/i.test(text)) return 'UTC+08:00';
	if (/^Asia\/Jayapura$/i.test(text) || /^WIT$/i.test(text)) return 'UTC+09:00';

	const match =
		text.match(/\bUTC\s*([+-]\d{1,2})(?::?(\d{2}))?/i) ||
		text.match(/^([+-]\d{1,2})(?::?(\d{2}))?$/);
	if (!match) return null;

	const rawHour = match[1];
	const sign = rawHour.startsWith('-') ? '-' : '+';
	const hour = rawHour.replace(/^[+-]/, '').padStart(2, '0');
	const minute = (match[2] || '00').padStart(2, '0');

	return `UTC${sign}${hour}:${minute}`;
}

export function formatLastUpdated(value, timezoneHint = null) {
	if (!value || value === '-') return '-';

	const date = parseVesselDateTime(value, timezoneHint);
	if (!date) return value;

	const diffMs = Date.now() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);

	if (diffMinutes < 0) return value;

	if (diffMinutes < 1) {
		return 'Just now';
	}

	if (diffMinutes < 10) {
		return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
	}

	return value;
}

export function formatActualLastUpdated(value) {
	if (!value || value === '-') return '-';

	const cleanedValue = stripUtcLabel(formatValue(value, '-'));
	if (!cleanedValue || cleanedValue === '-') return '-';

	if (/^(just now|\d+\s+minutes?\s+ago)$/i.test(cleanedValue)) {
		const parsedDate = parseVesselDateTime(value);
		if (!parsedDate) return cleanedValue;

		return parsedDate.toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}

	return cleanedValue;
}

export function getTelemetryUtcLabel(vessel) {
	return (
		getUtcLabel(vessel?.lastUpdated) ||
		getUtcLabel(vessel?.lastConnectTime) ||
		getUtcLabel(vessel?.lastDisconnectTime) ||
		getUtcLabel(vessel?.timezone) ||
		getUtcLabel(vessel?.timeZone) ||
		getUtcLabel(vessel?.timezoneMode) ||
		getUtcLabel(vessel?.utc) ||
		getUtcLabel(vessel?.utcOffset) ||
		getUtcLabel(vessel?.utc_offset) ||
		'UTC+07:00'
	);
}

export function normalizeHireStatus(value) {
	if (value === true) return 'On Hire';
	if (value === false) return 'Off Hire';

	const text = String(value ?? '').trim();

	if (!text || text === '-') return 'Hire unknown';

	const normalized = text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

	if (normalized.includes('off')) return 'Off Hire';
	if (normalized.includes('on')) return 'On Hire';
	if (['true', '1', 'active'].includes(normalized)) return 'On Hire';
	if (['false', '0', 'inactive'].includes(normalized)) return 'Off Hire';

	return text;
}

export function isOnHireStatus(value) {
	return normalizeHireStatus(value).toLowerCase() === 'on hire';
}

export function isOffHireStatus(value) {
	return normalizeHireStatus(value).toLowerCase() === 'off hire';
}
