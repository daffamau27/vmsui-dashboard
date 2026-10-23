export function pad(value) {
	return String(value).padStart(2, '0');
}

export function currentMonth() {
	const date = new Date();
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function getLastDayOfMonth(monthValue) {
	if (!monthValue) return '31';

	const [year, month] = monthValue.split('-').map(Number);
	if (!year || !month) return '31';

	return String(new Date(year, month, 0).getDate()).padStart(2, '0');
}

export function getMonthParts(monthValue) {
	const [year, month] = String(monthValue || '')
		.split('-')
		.map(Number);

	if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
		return null;
	}

	return { year, month };
}

export function getMaxSelectableDay(monthValue) {
	const parts = getMonthParts(monthValue);
	if (!parts) return 31;

	const today = new Date();
	const selectedMonthIndex = parts.month - 1;
	const selectedMonthDate = new Date(parts.year, selectedMonthIndex, 1);
	const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
	const lastDay = Number(getLastDayOfMonth(monthValue));

	if (selectedMonthDate > currentMonthDate) return 0;

	if (parts.year === today.getFullYear() && selectedMonthIndex === today.getMonth()) {
		return Math.min(lastDay, today.getDate());
	}

	return lastDay;
}

export const MONTHLY_WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function getMonthlyCalendarDays(monthValue, minDay = '1') {
	const parts = getMonthParts(monthValue);
	if (!parts) return [];

	const maxSelectableDay = getMaxSelectableDay(monthValue);
	if (maxSelectableDay <= 0) return [];

	const lastDay = Number(getLastDayOfMonth(monthValue));
	const minSelectableDay = Math.max(1, normalizeMonthlyDay(minDay, 1));
	const firstDate = new Date(parts.year, parts.month - 1, 1);
	const firstWeekday = firstDate.getDay();
	const totalCells = Math.ceil((firstWeekday + lastDay) / 7) * 7;

	return Array.from({ length: totalCells }, (_, index) => {
		const dayNumber = index - firstWeekday + 1;
		const inMonth = dayNumber >= 1 && dayNumber <= lastDay;
		const selectable = inMonth && dayNumber >= minSelectableDay && dayNumber <= maxSelectableDay;

		return {
			key: `${monthValue}-${index}`,
			label: inMonth ? String(dayNumber) : '',
			value: inMonth ? pad(dayNumber) : '',
			inMonth,
			selectable
		};
	});
}

export function getMonthlyRangeLimitText(monthValue) {
	if (!monthValue) return 'Select a month first.';

	const maxDay = getMaxSelectableDay(monthValue);
	if (maxDay <= 0) return 'Future month cannot be loaded.';

	const lastDay = Number(getLastDayOfMonth(monthValue));
	const isLimitedByToday = maxDay < lastDay;

	return isLimitedByToday
		? `Available until day ${pad(maxDay)} because the selected month is current month.`
		: `Available day 01 - ${pad(maxDay)}.`;
}

export function normalizeMonthlyDay(value, fallback = 1) {
	const day = Number(value);
	return Number.isInteger(day) ? day : fallback;
}

export function validateMonthlyRange(monthValue, startDate, endDate) {
	if (!monthValue) {
		return { valid: false, message: 'Month is required.' };
	}

	const maxDay = getMaxSelectableDay(monthValue);
	const monthLastDay = Number(getLastDayOfMonth(monthValue));

	if (maxDay <= 0) {
		return {
			valid: false,
			message: 'Selected month is in the future. Please choose current month or a previous month.'
		};
	}

	const start = normalizeMonthlyDay(startDate, 1);
	const end = normalizeMonthlyDay(endDate, maxDay);

	if (!String(startDate || '').trim() || !String(endDate || '').trim()) {
		return { valid: false, message: 'Date range is required.' };
	}

	if (start < 1 || end < 1) {
		return { valid: false, message: 'Start day and end day must be at least 1.' };
	}

	if (start > monthLastDay || end > monthLastDay) {
		return {
			valid: false,
			message: `Selected day exceeds the selected month. ${monthValue} only has ${monthLastDay} days.`
		};
	}

	if (start > maxDay || end > maxDay) {
		return {
			valid: false,
			message: `Selected day exceeds available data date. Maximum day for this month is ${pad(maxDay)}.`
		};
	}

	if (start > end) {
		return { valid: false, message: 'Start day cannot be greater than end day.' };
	}

	return {
		valid: true,
		startDate: pad(start),
		endDate: pad(end)
	};
}
