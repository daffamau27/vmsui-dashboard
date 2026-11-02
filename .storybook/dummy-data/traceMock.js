const PLACEHOLDER_IMAGE =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function pad(value) {
	return String(value).padStart(2, '0');
}

function formatApiDate(ms) {
	const date = new Date(ms);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
		date.getHours()
	)}:${pad(date.getMinutes())}:00`;
}

function parseRange(url, startKey = 'start', endKey = 'end') {
	const { searchParams } = new URL(url, 'http://localhost');
	const start = Date.parse((searchParams.get(startKey) || '').replace(' ', 'T'));
	const end = Date.parse((searchParams.get(endKey) || '').replace(' ', 'T'));

	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
		const now = Date.now();
		return { start: now - 6 * 60 * 60 * 1000, end: now };
	}

	return { start, end };
}

export function buildTraceDataMock(url) {
	const { start, end } = parseRange(url);
	const count = 150;
	const step = (end - start) / (count - 1);
	const baseLat = -6.1023;
	const baseLng = 106.8812;

	const points = Array.from({ length: count }, (_, index) => {
		const wave = Math.sin(index / 9);
		const wave2 = Math.cos(index / 13);

		return {
			timestamp: formatApiDate(start + index * step),
			latitude: baseLat + index * 0.00002 + wave * 0.0009,
			longitude: baseLng + index * 0.00003 + wave2 * 0.0012,
			heading: 92 + wave * 28,
			speed: 8.2 + wave2 * 0.8,
			distance_nm: Number((index * 0.21).toFixed(2)),
			rpm: {
				'Main Engine 1': Math.round(1420 + wave * 40),
				'Main Engine 2': Math.round(1412 + wave2 * 35),
				'Auxiliary Engine 1': 1500
			},
			fuel_per_hour: Number((41.5 + wave * 4.2).toFixed(2)),
			weather: 'Partly cloudy',
			ocean: { speed_kph: 1.4, direction_to: 'SE', direction_to_deg: 135 },
			sd_card: 'OK',
			online: true
		};
	});

	return {
		data: {
			vessel_name: 'MT Samudra Biru',
			timezone: 'UTC+07:00',
			points
		}
	};
}

export function buildCctvSnapshotsMock(url) {
	const { start, end } = parseRange(url, 'startTime', 'endTime');
	const cameras = ['CAM-01 Bridge', 'CAM-02 Engine Room'];
	const count = 12;
	const step = (end - start) / (count - 1);
	const items = Array.from({ length: count }, (_, index) => ({
		file_path: `/storybook/snapshots/snapshot-${index + 1}.jpg`,
		captured_at: formatApiDate(start + index * step),
		presigned_url: PLACEHOLDER_IMAGE,
		camera_name: cameras[index % cameras.length],
		camera_token: index % cameras.length === 0 ? 'cam-01' : 'cam-02',
		file_size: 48213
	}));

	return {
		data: {
			total: items.length,
			totalPages: 1,
			items
		}
	};
}

export function buildTraceMarksMock(url) {
	const { start, end } = parseRange(url);
	const span = end - start;
	const marksAt = [0.2, 0.5, 0.8];
	const cameras = [
		{ camera_name: 'CAM-01 Bridge', camera_token: 'cam-01' },
		{ camera_name: 'CAM-02 Engine Room', camera_token: 'cam-02' }
	];

	return {
		data: {
			cameras: cameras.map((camera, cameraIndex) => ({
				...camera,
				recordings: marksAt.map((ratio, index) => {
					const timestamp = Math.round(start + span * ratio);

					return {
						id: `rec-${cameraIndex + 1}-${index + 1}`,
						timestamp,
						startedAt: formatApiDate(timestamp),
						thumbnailUrl: PLACEHOLDER_IMAGE
					};
				})
			}))
		}
	};
}
