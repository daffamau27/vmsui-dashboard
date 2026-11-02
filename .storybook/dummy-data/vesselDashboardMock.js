const PLACEHOLDER_IMAGE =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const cctvSnapshots = [
	{
		camera_name: 'CAM-01 Bridge',
		camera_token: 'cam-01',
		location: 'Bridge deck',
		captured_at: '29/10/2026 09:42:00 (UTC+07:00)',
		presigned_url: PLACEHOLDER_IMAGE,
		file_size: 184320
	},
	{
		camera_name: 'CAM-02 Engine Room',
		camera_token: 'cam-02',
		location: 'Engine room',
		captured_at: '29/10/2026 09:41:00 (UTC+07:00)',
		presigned_url: PLACEHOLDER_IMAGE,
		file_size: 205824
	}
];

export const vesselDashboardCctvLatestMock = {
	data: cctvSnapshots
};

export const vesselDashboardDataMock = {
	vesselName: 'MT Samudra Biru',
	deviceId: 'tb-device-102',
	timezone: 'UTC+07:00',
	latitude: -6.1023,
	longitude: 106.8812,
	heading: 124,
	currentSpeed: 8.4,
	online: true,
	updatedAt: '29 Oct 2026 09:42',
	localTime: '29 Oct 2026 09:42',
	vesselLocalTime: '29 Oct 2026 16:42',
	topSpeed: 12.6,
	avgSpeed: 7.8,
	totalDistance: 184.2,
	dataReceivedStats: {
		received_minutes: 1380,
		total_minutes: 1440,
		percentage: 95.8
	},
	weatherForecast: {
		current: { label: 'Today', temp_c: 29.4, condition: 'Partly cloudy', wind_speed_kt: 8 },
		tomorrow: {
			label: 'Tomorrow',
			temp_min_c: 26.1,
			temp_max_c: 31.0,
			condition: 'Light rain'
		},
		day_after: {
			label: 'Day After',
			temp_min_c: 25.8,
			temp_max_c: 30.4,
			condition: 'Cloudy'
		}
	},
	oceanCurrent: {
		current: { label: 'Today', speed_kph: 1.8, direction_to: 'SE', direction_to_deg: 118 },
		tomorrow: { label: 'Tomorrow', speed_kph: 2.1, direction_to: 'ESE', direction_to_deg: 102 },
		day_after: { label: 'Day After', speed_kph: 1.6, direction_to: 'E', direction_to_deg: 96 }
	},
	engines: [
		{ name: 'Main Engine 1', last_rpm: 1450, avg_rpm: 1320, top_rpm: 1780 },
		{ name: 'Main Engine 2', last_rpm: 1420, avg_rpm: 1290, top_rpm: 1760 },
		{ name: 'Auxiliary Engine 1', last_rpm: 1200, avg_rpm: 1150, top_rpm: 1500 }
	],
	consumptionSource: 'ems_internal',
	consumptionEmsInternal: 1240.5,
	consumptionEmsExternal: 1198.2,
	consumptionFms: 1150.0,
	consumptionEcu: 1132.7,
	latestRob: 18420.0,
	fodUsage: { accumulatedLiters: 320.4 },
	cctv: cctvSnapshots
};
