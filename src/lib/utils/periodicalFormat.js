export function formatNumber(value, digits = 1, fallback = '-') {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;

	return number.toLocaleString('en-US', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
}

export function toFuelNumber(value) {
	if (value === undefined || value === null || value === '' || value === '-') {
		return 0;
	}

	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

export function formatLiter(value) {
	return `${formatNumber(toFuelNumber(value), 1)} L`;
}

export function formatRuntimeFromMinutes(minutes) {
	const totalMinutes = Number(minutes);

	if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
		return '0h 0m';
	}

	const h = Math.floor(totalMinutes / 60);
	const m = Math.round(totalMinutes % 60);

	return `${h}h ${m}m`;
}
