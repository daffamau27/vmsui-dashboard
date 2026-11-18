function normalizeColumnKey(key) {
	return String(key || '')
		.trim()
		.toLowerCase();
}

// Speed must always render between longitude and the first RPM column.
export function orderSpeedBetweenLongitudeAndRpm(columns = []) {
	if (!Array.isArray(columns)) return [];

	const speedIndex = columns.findIndex((column) => normalizeColumnKey(column) === 'speed');
	if (speedIndex === -1) return columns;

	const rest = columns.filter((_, index) => index !== speedIndex);
	const longitudeIndex = rest.findIndex((column) => normalizeColumnKey(column) === 'longitude');

	if (longitudeIndex !== -1) {
		rest.splice(longitudeIndex + 1, 0, columns[speedIndex]);
		return rest;
	}

	const rpmIndex = rest.findIndex((column) => {
		const key = normalizeColumnKey(column);
		return key === 'rpm' || key.endsWith('_rpm');
	});

	if (rpmIndex !== -1) {
		rest.splice(rpmIndex, 0, columns[speedIndex]);
		return rest;
	}

	return columns;
}
