const EARTH_RADIUS_KM = 6371;
const KM_PER_NAUTICAL_MILE = 1.852;

function toRadians(value) {
	return (Number(value) * Math.PI) / 180;
}

function toCoordinate(value) {
	if (value === null || value === undefined || value === '') return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function isValidCoordinate(point) {
	const latitude = toCoordinate(point?.latitude);
	const longitude = toCoordinate(point?.longitude);

	return (
		latitude !== null &&
		longitude !== null &&
		latitude >= -90 &&
		latitude <= 90 &&
		longitude >= -180 &&
		longitude <= 180
	);
}

// Returns null when either point has no usable coordinate.
export function haversineDistanceNm(pointA, pointB) {
	if (!isValidCoordinate(pointA) || !isValidCoordinate(pointB)) return null;

	const lat1 = toRadians(pointA.latitude);
	const lat2 = toRadians(pointB.latitude);
	const dLat = toRadians(pointB.latitude - pointA.latitude);
	const dLon = toRadians(pointB.longitude - pointA.longitude);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return (EARTH_RADIUS_KM * c) / KM_PER_NAUTICAL_MILE;
}

// Distance from the previous point, in NM. The first point (start) is null.
export function getRouteLegDistancesNm(points = []) {
	if (!Array.isArray(points)) return { legs: [], totalNm: 0 };

	const legs = points.map((point, index) =>
		index === 0 ? null : haversineDistanceNm(points[index - 1], point)
	);

	const totalNm = legs.reduce((sum, leg) => (Number.isFinite(leg) ? sum + leg : sum), 0);

	return { legs, totalNm };
}

export function formatDistanceNm(value) {
	return Number.isFinite(value) ? `${value.toFixed(2)}` : '-';
}
