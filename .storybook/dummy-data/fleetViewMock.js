function engines(mePort, meStbd, ae1) {
	return [
		{ name: 'ME PORT', rpm: mePort },
		{ name: 'ME STBD', rpm: meStbd },
		{ name: 'AE 1', rpm: ae1 }
	];
}

function weather(temp, condition, windDir, windSpeed, humidity, pressure) {
	return {
		current: {
			temp_c: temp,
			condition,
			wind_dir: windDir,
			wind_speed_kt: windSpeed,
			humidity,
			pressure_hpa: pressure
		}
	};
}

function oceanCurrent(speed, direction, deg) {
	return {
		current: {
			speed_kph: speed,
			direction_to: direction,
			direction_to_deg: deg,
			observed_at: '2026-10-29T09:30:00Z'
		}
	};
}

export const fleetVesselsMock = [
	{
		vesselId: 101,
		vesselName: 'MV Nusantara Jaya',
		deviceId: 'tb-device-101',
		companyName: 'Nusantara Shipping',
		latitude: -6.0921,
		longitude: 106.8845,
		speed: 9.6,
		heading: 82,
		online: true,
		hireStatus: 'on_hire',
		timezone: 'UTC+07:00',
		lastUpdated: '29/10/2026 16:42:10 (UTC+07:00)',
		lastConnectTime: '29/10/2026 16:40:02 (UTC+07:00)',
		lastDisconnectTime: '28/10/2026 23:11:44 (UTC+07:00)',
		engines: engines(1320, 1285, 1180),
		voyageProgress: {
			voyageName: 'Jakarta - Surabaya',
			voyagePercentage: 62.4,
			assignedBy: 'Ops Control'
		},
		weather: weather(29.4, 'Partly cloudy', 'SE', 9, 78, 1009),
		oceanCurrent: oceanCurrent(1.8, 'SE', 118)
	},
	{
		vesselId: 102,
		vesselName: 'MT Samudra Biru',
		deviceId: 'tb-device-102',
		companyName: 'Samudra Lines',
		latitude: -5.4218,
		longitude: 112.6721,
		speed: 7.8,
		heading: 124,
		online: true,
		hireStatus: 'on_hire',
		timezone: 'UTC+07:00',
		lastUpdated: '29/10/2026 16:41:37 (UTC+07:00)',
		lastConnectTime: '29/10/2026 16:38:51 (UTC+07:00)',
		lastDisconnectTime: '27/10/2026 19:02:10 (UTC+07:00)',
		engines: engines(1450, 1420, 1200),
		voyageProgress: {
			voyageName: 'Surabaya - Makassar',
			voyagePercentage: 34.8,
			assignedBy: 'Voyage Planner'
		},
		weather: weather(30.1, 'Light rain', 'E', 12, 84, 1007),
		oceanCurrent: oceanCurrent(2.1, 'ESE', 102)
	},
	{
		vesselId: 103,
		vesselName: 'MV Bahari Indah',
		deviceId: 'tb-device-103',
		companyName: 'Bahari Marine',
		latitude: -8.4923,
		longitude: 116.8421,
		speed: 0,
		heading: 210,
		online: false,
		hireStatus: 'off_hire',
		timezone: 'UTC+08:00',
		lastUpdated: '28/10/2026 22:14:05 (UTC+08:00)',
		lastConnectTime: '28/10/2026 05:12:33 (UTC+08:00)',
		lastDisconnectTime: '28/10/2026 22:14:05 (UTC+08:00)',
		engines: engines(0, 0, 0),
		voyageProgress: null,
		weather: weather(28.2, 'Cloudy', 'S', 6, 88, 1011),
		oceanCurrent: oceanCurrent(1.2, 'N', 8)
	},
	{
		vesselId: 104,
		vesselName: 'MT Selat Malaka',
		deviceId: 'tb-device-104',
		companyName: 'Malaka Tankers',
		latitude: 3.9124,
		longitude: 98.7142,
		speed: 11.2,
		heading: 305,
		online: true,
		hireStatus: 'on_hire',
		timezone: 'UTC+07:00',
		lastUpdated: '29/10/2026 16:40:58 (UTC+07:00)',
		lastConnectTime: '29/10/2026 16:39:12 (UTC+07:00)',
		lastDisconnectTime: '26/10/2026 08:41:20 (UTC+07:00)',
		engines: engines(1580, 1540, 1290),
		voyageProgress: {
			voyageName: 'Belawan - Singapore',
			voyagePercentage: 78.1,
			assignedBy: 'Ops Control'
		},
		weather: weather(31.2, 'Sunny', 'SW', 7, 72, 1010),
		oceanCurrent: oceanCurrent(0.9, 'NW', 315)
	},
	{
		vesselId: 105,
		vesselName: 'MV Krakatau Perkasa',
		deviceId: 'tb-device-105',
		companyName: 'Selat Sunda Lines',
		latitude: -5.9121,
		longitude: 105.3123,
		speed: 6.4,
		heading: 41,
		online: true,
		hireStatus: 'off_hire',
		timezone: 'UTC+07:00',
		lastUpdated: '29/10/2026 16:39:21 (UTC+07:00)',
		lastConnectTime: '29/10/2026 16:36:44 (UTC+07:00)',
		lastDisconnectTime: '29/10/2026 02:18:07 (UTC+07:00)',
		engines: engines(1180, 1160, 980),
		voyageProgress: null,
		weather: weather(29.8, 'Partly cloudy', 'NE', 10, 80, 1008),
		oceanCurrent: oceanCurrent(2.4, 'S', 172)
	},
	{
		vesselId: 106,
		vesselName: 'MV Cendrawasih',
		deviceId: 'tb-device-106',
		companyName: 'Papua Marine',
		latitude: -2.5312,
		longitude: 140.7181,
		speed: null,
		heading: null,
		online: false,
		hireStatus: 'on_hire',
		timezone: 'UTC+09:00',
		lastUpdated: '27/10/2026 11:05:44 (UTC+09:00)',
		lastConnectTime: '27/10/2026 04:20:11 (UTC+09:00)',
		lastDisconnectTime: '27/10/2026 11:05:44 (UTC+09:00)',
		engines: engines(null, null, null),
		voyageProgress: {
			voyageName: 'Jayapura - Biak',
			voyagePercentage: 12.5,
			assignedBy: 'Voyage Planner'
		},
		weather: weather(30.5, 'Thunderstorm', 'W', 14, 90, 1006),
		oceanCurrent: oceanCurrent(1.5, 'W', 268)
	}
];

export function buildFleetLiveDetailMock(url) {
	const match = String(url || '').match(/\/fleet\/vessels\/(\d+)/);
	const id = match ? match[1] : '';

	return fleetVesselsMock.find((vessel) => String(vessel.vesselId) === id) || fleetVesselsMock[0];
}

export const fleetAssetsMock = [
	{
		id: 201,
		assetId: 'asset-201',
		assetName: 'Engine Monitor Alpha',
		assetType: 'buoy',
		companyId: 1,
		thingsboardName: 'engine-monitor-alpha',
		latitude: -5.9812,
		longitude: 106.7712
	},
	{
		id: 202,
		assetId: 'asset-202',
		assetName: 'Fuel Flow Meter',
		assetType: 'whp',
		companyId: 2,
		thingsboardName: 'fuel-flow-meter',
		latitude: -6.2011,
		longitude: 107.1123
	},
	{
		id: 203,
		assetId: 'asset-203',
		assetName: 'Buoy Kilang Utara',
		assetType: 'buoy',
		companyId: 1,
		latitude: -6.3111,
		longitude: 106.9012
	},
	{
		id: 204,
		assetId: 'asset-204',
		assetName: 'FSO Natuna Star',
		assetType: 'fso',
		companyId: 2,
		latitude: 4.8211,
		longitude: 108.1345
	},
	{
		id: 205,
		assetId: 'asset-205',
		assetName: 'Jetty Marunda',
		assetType: 'jetty',
		companyId: 1,
		latitude: -6.0912,
		longitude: 106.9812
	},
	{
		id: 206,
		assetId: 'asset-206',
		assetName: 'Rig Alpha',
		assetType: 'rig',
		companyId: 2,
		latitude: -5.7123,
		longitude: 109.2811
	},
	{
		id: 207,
		assetId: 'asset-207',
		assetName: 'Anchor Point Bravo',
		assetType: 'anchor',
		companyId: 1,
		latitude: -6.4521,
		longitude: 108.7712
	},
	{
		id: 208,
		assetId: 'asset-208',
		assetName: 'Mess Operator',
		assetType: 'mess',
		companyId: 1,
		latitude: -6.1023,
		longitude: 106.9011
	},
	{
		id: 209,
		assetId: 'asset-209',
		assetName: 'Office Fleet Ops',
		assetType: 'office',
		companyId: 2,
		latitude: -6.1201,
		longitude: 106.8212
	},
	{
		id: 210,
		assetId: 'zone-jakarta',
		assetName: 'Zone Operasi Jakarta',
		assetType: 'zone',
		coordinates: [
			[-5.9, 106.6],
			[-5.9, 107.1],
			[-6.55, 107.1],
			[-6.55, 106.6]
		]
	},
	{
		id: 211,
		assetId: 'zone-natuna',
		assetName: 'Area Larangan Natuna',
		assetType: 'zone',
		coordinates: [
			[4.4, 107.9],
			[4.4, 108.7],
			[5.3, 108.7],
			[5.3, 107.9]
		]
	}
];
