/** @param {number} dayOffset @param {Date} [baseDate] */
export function getForecastWeekdayLabel(dayOffset, baseDate = new Date()) {
	const forecastDate = new Date(
		baseDate.getFullYear(),
		baseDate.getMonth(),
		baseDate.getDate() + dayOffset
	);

	return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(forecastDate).toUpperCase();
}
