import { getVesselPath } from './appRoutes.js';
import { TIMEZONE_OFFSET_OPTIONS } from './timezoneOptions.js';

export function isReportDate(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	if (year < 1 || month < 1 || month > 12 || day < 1) return false;
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function getMonthlyRowReportDate(row, month) {
	const raw = [
		row?.dateNumber,
		row?.dayNumber,
		row?.day,
		row?.tanggal,
		row?.date,
		row?.dateIso,
		row?.date_iso,
		row?.reportDate,
		row?.report_date
	].find((value) => value !== undefined && value !== null && value !== '');
	const value = String(raw ?? '').trim();
	let date = '';
	if (/^\d{1,2}$/.test(value)) {
		date = `${month}-${value.padStart(2, '0')}`;
	} else if (/^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(value)) {
		// Keep the report's calendar date; never convert it through the browser's timezone.
		date = value.slice(0, 10);
	} else {
		const parts = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
		if (parts) date = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
	}
	return isReportDate(date) ? date : '';
}

export function readDailyReportLink(url) {
	if (url?.pathname !== getVesselPath('daily-report')) return null;
	const date = url.searchParams.get('date');
	const vesselId = url.searchParams.get('vesselId');
	const timezoneMode = url.searchParams.get('timezoneMode') || 'auto';
	const timezoneOffset = url.searchParams.get('timezoneOffset');
	if (!isReportDate(date) || !/^[1-9]\d*$/.test(vesselId || '')) return null;
	if (!['auto', 'manual'].includes(timezoneMode)) return null;
	if (
		timezoneMode === 'manual' &&
		!TIMEZONE_OFFSET_OPTIONS.some((item) => item.value === timezoneOffset)
	)
		return null;
	return {
		date,
		vesselId,
		timezoneMode,
		timezoneOffset: timezoneMode === 'manual' ? timezoneOffset : '+07:00'
	};
}

export function getDailyReportHref({
	date,
	vesselId,
	timezoneMode = 'auto',
	timezoneOffset = '+07:00'
}) {
	const params = new URLSearchParams({ date, vesselId: String(vesselId ?? ''), timezoneMode });
	if (timezoneMode === 'manual') params.set('timezoneOffset', timezoneOffset);
	const href = `${getVesselPath('daily-report')}?${params}`;
	return readDailyReportLink(new URL(href, 'https://vms.invalid')) ? href : '';
}
