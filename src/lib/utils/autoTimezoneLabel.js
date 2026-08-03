function pad(value) {
	return String(value).padStart(2, '0');
}

function formatTimezoneOffsetFromMinutes(offsetMinutes) {
	const normalizedMinutes = Number(offsetMinutes);

	if (!Number.isFinite(normalizedMinutes)) return '';

	const totalMinutes = -normalizedMinutes;
	const sign = totalMinutes >= 0 ? '+' : '-';
	const absoluteMinutes = Math.abs(totalMinutes);
	const hours = Math.floor(absoluteMinutes / 60);
	const minutes = absoluteMinutes % 60;

	return `UTC${sign}${pad(hours)}:${pad(minutes)}`;
}

export function normalizeUtcLabel(value) {
	if (value === undefined || value === null || value === '') return '';

	const text = String(value).trim();
	if (!text || text === '-') return '';

	if (/^Asia\/Jakarta$/i.test(text) || /^WIB$/i.test(text)) return 'UTC+07:00';
	if (/^Asia\/Makassar$/i.test(text) || /^WITA$/i.test(text)) return 'UTC+08:00';
	if (/^Asia\/Jayapura$/i.test(text) || /^WIT$/i.test(text)) return 'UTC+09:00';

	const utcMatch =
		text.match(/\bUTC\s*([+-]\d{1,2})(?::?(\d{2}))?/i) ||
		text.match(/^([+-]\d{1,2})(?::?(\d{2}))?$/);

	if (!utcMatch) return '';

	const rawHour = utcMatch[1];
	const sign = rawHour.startsWith('-') ? '-' : '+';
	const hour = rawHour.replace(/^[+-]/, '').padStart(2, '0');
	const minute = (utcMatch[2] || '00').padStart(2, '0');

	return `UTC${sign}${hour}:${minute}`;
}

function collectTimezoneCandidates(source, output) {
	if (!source || typeof source !== 'object') return;

	const keys = [
		'timezone',
		'timeZone',
		'timezoneOffset',
		'timezone_offset',
		'utc',
		'utcOffset',
		'utc_offset'
	];

	for (const key of keys) {
		output.push(source?.[key]);
	}

	collectTimezoneCandidates(source?.data, output);
	collectTimezoneCandidates(source?.raw, output);
	collectTimezoneCandidates(source?.detail, output);
	collectTimezoneCandidates(source?.vessel, output);
}

export function getBrowserUtcLabel(fallback = 'UTC+07:00') {
	if (typeof window === 'undefined') return fallback;

	return formatTimezoneOffsetFromMinutes(new Date().getTimezoneOffset()) || fallback;
}

export function getAutoTimezoneLabelFromSources(...sources) {
	const candidates = [];

	for (const source of sources) {
		collectTimezoneCandidates(source, candidates);
		candidates.push(source);
	}

	for (const candidate of candidates) {
		const label = normalizeUtcLabel(candidate);

		if (label) return label;
	}

	return getBrowserUtcLabel();
}
