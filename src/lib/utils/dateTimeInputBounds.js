import { normalizeUtcLabel } from './autoTimezoneLabel.js';

function pad(value) {
	return String(value).padStart(2, '0');
}

/**
 * Format a Date into the `YYYY-MM-DDTHH:mm` shape used by `<input type="datetime-local">`.
 * Uses the browser's local clock, matching how the datetime inputs are rendered.
 */
export function toDateTimeLocalValue(date = new Date()) {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
		date.getHours()
	)}:${pad(date.getMinutes())}`;
}

/**
 * Resolve a timezone offset (minutes east of UTC) from a value such as `+07:00`,
 * `UTC+08:00`, `WIB`, or `Asia/Jakarta`. Returns `NaN` when the value is unusable.
 */
export function getTimezoneOffsetMinutes(value) {
	const label = normalizeUtcLabel(value);
	const match = label.match(/^UTC([+-])(\d{2}):(\d{2})$/);

	if (!match) return NaN;

	const minutes = Number(match[2]) * 60 + Number(match[3]);

	return match[1] === '-' ? -minutes : minutes;
}

/**
 * Format the wall-clock time of `date` in the given timezone offset.
 * Falls back to the browser clock when the offset is unusable.
 */
export function toDateTimeLocalValueInOffset(date = new Date(), offsetMinutes = NaN) {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
	if (!Number.isFinite(offsetMinutes)) return toDateTimeLocalValue(date);

	const shifted = new Date(date.getTime() + offsetMinutes * 60000);

	return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
		shifted.getUTCDate()
	)}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** Current wall-clock time of `offsetMinutes`, usable as a datetime input `max` bound. */
export function getNowDateTimeLocalValue(offsetMinutes = NaN) {
	return toDateTimeLocalValueInOffset(new Date(), offsetMinutes);
}

/** Midnight of the current day in `offsetMinutes`, expressed as a datetime input value. */
export function getStartOfDayDateTimeLocalValue(offsetMinutes = NaN, date = new Date()) {
	if (!Number.isFinite(offsetMinutes)) {
		return toDateTimeLocalValue(
			new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
		);
	}

	const shifted = new Date(date.getTime() + offsetMinutes * 60000);

	return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
		shifted.getUTCDate()
	)}T00:00`;
}

/**
 * Clamp a datetime-local value so it never exceeds `maxValue`.
 * Both values share the `YYYY-MM-DDTHH:mm` format, so lexicographic comparison is safe.
 */
export function clampDateTimeLocalValue(value = '', maxValue = '') {
	if (!value || !maxValue) return value;
	return value > maxValue ? maxValue : value;
}
