export const dailyReportVessel = {
	id: 102,
	vesselId: 102,
	vesselName: 'MT Samudra Biru',
	name: 'MT Samudra Biru',
	deviceId: 'tb-device-102',
	companyId: 2,
	companyName: 'Samudra Lines',
	latitude: -6.1023,
	longitude: 106.8812,
	status: 'online',
	online: true,
	hireStatus: true,
	fuelConsumptionSource: 'ems_internal',
	engines: [
		{ id: 1, vesselId: 102, engineKeyThingsboard: 'me1', engineName: 'Main Engine 1' },
		{ id: 2, vesselId: 102, engineKeyThingsboard: 'me2', engineName: 'Main Engine 2' },
		{ id: 3, vesselId: 102, engineKeyThingsboard: 'ae1', engineName: 'Auxiliary Engine 1' }
	]
};

export const dailyReportEngineCurves = {
	vessel_id: 102,
	vessel_name: 'MT Samudra Biru',
	curves: [
		{
			curve_id: 'curve-102-maker',
			curve_type: 'engine_maker',
			curve_name: 'Engine Maker Specs 2026',
			is_active: true,
			engines: [
				{
					engine_key_thingsboard: 'Main Engine 1',
					engine_name: 'Main Engine 1',
					ranges: [
						{ rpm_min: 0, rpm_max: 400, value_lh: 420 },
						{ rpm_min: 401, rpm_max: 800, value_lh: 980 },
						{ rpm_min: 801, rpm_max: 1200, value_lh: 1640 }
					]
				},
				{
					engine_key_thingsboard: 'Main Engine 2',
					engine_name: 'Main Engine 2',
					ranges: [
						{ rpm_min: 0, rpm_max: 400, value_lh: 415 },
						{ rpm_min: 401, rpm_max: 800, value_lh: 972 },
						{ rpm_min: 801, rpm_max: 1200, value_lh: 1625 }
					]
				},
				{
					engine_key_thingsboard: 'Auxiliary Engine 1',
					engine_name: 'Auxiliary Engine 1',
					ranges: [
						{ rpm_min: 0, rpm_max: 600, value_lh: 86 },
						{ rpm_min: 601, rpm_max: 1500, value_lh: 210 }
					]
				}
			]
		},
		{
			curve_id: 'curve-102-vms',
			curve_type: 'ems_internal',
			curve_name: 'VMS Baseline',
			is_active: true,
			engines: [
				{
					engine_key_thingsboard: 'Main Engine 1',
					engine_name: 'Main Engine 1',
					ranges: [
						{ rpm_min: 0, rpm_max: 400, value_lh: 410 },
						{ rpm_min: 401, rpm_max: 800, value_lh: 965 },
						{ rpm_min: 801, rpm_max: 1200, value_lh: 1602 }
					]
				},
				{
					engine_key_thingsboard: 'Main Engine 2',
					engine_name: 'Main Engine 2',
					ranges: [
						{ rpm_min: 0, rpm_max: 400, value_lh: 405 },
						{ rpm_min: 401, rpm_max: 800, value_lh: 958 },
						{ rpm_min: 801, rpm_max: 1200, value_lh: 1590 }
					]
				},
				{
					engine_key_thingsboard: 'Auxiliary Engine 1',
					engine_name: 'Auxiliary Engine 1',
					ranges: [
						{ rpm_min: 0, rpm_max: 600, value_lh: 84 },
						{ rpm_min: 601, rpm_max: 1500, value_lh: 205 }
					]
				}
			]
		},
		{
			curve_id: 'curve-102-ems',
			curve_type: 'ems_external',
			curve_name: 'EMS Baseline',
			is_active: true,
			engines: [
				{
					engine_key_thingsboard: 'Main Engine 1',
					engine_name: 'Main Engine 1',
					ranges: [
						{ rpm_min: 0, rpm_max: 400, value_lh: 414 },
						{ rpm_min: 401, rpm_max: 800, value_lh: 971 },
						{ rpm_min: 801, rpm_max: 1200, value_lh: 1612 }
					]
				},
				{
					engine_key_thingsboard: 'Main Engine 2',
					engine_name: 'Main Engine 2',
					ranges: [
						{ rpm_min: 0, rpm_max: 400, value_lh: 409 },
						{ rpm_min: 401, rpm_max: 800, value_lh: 964 },
						{ rpm_min: 801, rpm_max: 1200, value_lh: 1598 }
					]
				},
				{
					engine_key_thingsboard: 'Auxiliary Engine 1',
					engine_name: 'Auxiliary Engine 1',
					ranges: [
						{ rpm_min: 0, rpm_max: 600, value_lh: 85 },
						{ rpm_min: 601, rpm_max: 1500, value_lh: 208 }
					]
				}
			]
		}
	]
};

export const dailyReportPayload = {
	data: {
		timezone: 'UTC+07:00',
		summary: {
			total_operation_hours: '32h 15m',
			top_speed: 12.84,
			average_speed: 8.46,
			total_distance_nm: 184.2,
			total_distance_outside_nm: 4.75
		},
		travel_distance: {
			total_distance_nm: 184.2,
			outside_safety_zone_distance_nm: 4.75
		},
		data_received_stats: {
			received_minutes: 1380,
			total_minutes: 1440,
			percentage: 95.8
		},
		path_coordinates: [
			{ latitude: -6.1045, longitude: 106.8863, time: '06:12', inside_safety_zone: true },
			{ latitude: -6.1018, longitude: 106.8821, time: '08:05', inside_safety_zone: true },
			{ latitude: -6.0972, longitude: 106.8764, time: '09:48', inside_safety_zone: true },
			{ latitude: -6.0921, longitude: 106.8712, time: '11:32', inside_safety_zone: false },
			{ latitude: -6.0879, longitude: 106.8674, time: '12:26', inside_safety_zone: false },
			{ latitude: -6.0902, longitude: 106.8719, time: '13:40', inside_safety_zone: true },
			{ latitude: -6.0954, longitude: 106.8776, time: '15:02', inside_safety_zone: true },
			{ latitude: -6.0998, longitude: 106.8808, time: '16:18', inside_safety_zone: true },
			{ latitude: -6.1033, longitude: 106.8839, time: '17:21', inside_safety_zone: true },
			{ latitude: -6.1052, longitude: 106.8868, time: '18:40', inside_safety_zone: true }
		],
		engine_runtimes: [
			{ engine_name: 'Main Engine 1', runtime_hours: 12.6 },
			{ engine_name: 'Main Engine 2', runtime_hours: 11.2 },
			{ engine_name: 'Auxiliary Engine 1', runtime_hours: 8.5 }
		],
		engine_rpm_stats: [
			{ engine_name: 'Main Engine 1', top_rpm: 1180, avg_rpm: 846 },
			{ engine_name: 'Main Engine 2', top_rpm: 1152, avg_rpm: 822 },
			{ engine_name: 'Auxiliary Engine 1', top_rpm: 1490, avg_rpm: 1210 }
		],
		status_history: {
			'Main Engine 1': [
				{ start: '06:10', end: '09:40', duration: '3h 30m', DurationSeconds: 12600, status: 'ON' },
				{ start: '09:40', end: '10:05', duration: '25m', DurationSeconds: 1500, status: 'OFF' },
				{ start: '10:05', end: '15:20', duration: '5h 15m', DurationSeconds: 18900, status: 'ON' },
				{ start: '15:20', end: '15:45', duration: '25m', DurationSeconds: 1500, status: 'OFF' },
				{ start: '15:45', end: '18:40', duration: '2h 55m', DurationSeconds: 10500, status: 'ON' }
			],
			'Main Engine 2': [
				{ start: '06:10', end: '12:05', duration: '5h 55m', DurationSeconds: 21300, status: 'ON' },
				{ start: '12:05', end: '12:35', duration: '30m', DurationSeconds: 1800, status: 'OFF' },
				{ start: '12:35', end: '18:40', duration: '6h 5m', DurationSeconds: 21900, status: 'ON' }
			],
			'Auxiliary Engine 1': [
				{ start: '05:00', end: '08:30', duration: '3h 30m', DurationSeconds: 12600, status: 'ON' },
				{ start: '08:30', end: '09:00', duration: '30m', DurationSeconds: 1800, status: 'OFF' },
				{ start: '09:00', end: '14:00', duration: '5h 0m', DurationSeconds: 18000, status: 'ON' },
				{ start: '14:00', end: '23:59', duration: '9h 59m', DurationSeconds: 35940, status: 'OFF' }
			]
		},
		clutch_in_timeline: {
			'Main Engine 1': [
				{ start: '06:05', end: '13:10', duration: '7h 5m', DurationSeconds: 25500, status: 'ON' },
				{ start: '13:10', end: '13:30', duration: '20m', DurationSeconds: 1200, status: 'OFF' },
				{ start: '13:30', end: '18:45', duration: '5h 15m', DurationSeconds: 18900, status: 'ON' }
			],
			'Main Engine 2': [
				{ start: '06:05', end: '18:45', duration: '12h 40m', DurationSeconds: 45600, status: 'ON' }
			],
			'Auxiliary Engine 1': [
				{ start: '05:00', end: '08:15', duration: '3h 15m', DurationSeconds: 11700, status: 'ON' },
				{ start: '08:15', end: '09:30', duration: '1h 15m', DurationSeconds: 4500, status: 'OFF' },
				{ start: '09:30', end: '14:10', duration: '4h 40m', DurationSeconds: 16800, status: 'ON' }
			]
		},
		fuel_consumption_table: {
			details: [
				{
					engine_name: 'Main Engine 1',
					is_main: true,
					ecu: 980.4,
					fms: 972.1,
					ems_internal: 969.8,
					ems_external: 975.3,
					engine_maker: 965.7
				},
				{
					engine_name: 'Main Engine 2',
					is_main: true,
					ecu: 862.6,
					fms: 858.9,
					ems_internal: 854.2,
					ems_external: 860.4,
					engine_maker: 851.8
				},
				{
					engine_name: 'Auxiliary Engine 1',
					is_main: false,
					ecu: 214.5,
					fms: 210.2,
					ems_internal: 208.7,
					ems_external: 212.9,
					engine_maker: 206.4
				}
			],
			totals: {
				grand_total: {
					ecu: 2057.5,
					fms: 2041.2,
					ems_internal: 2032.7,
					ems_external: 2048.6,
					engine_maker: 2023.9
				}
			}
		},
		fod_usage: {
			fod_port_l: 640.2,
			fod_stbd_l: 628.7,
			total_fod_l: 1268.9
		},
		fod_chart: [
			{ time: '06:00', fuel_fod_port: 640, fuel_fod_stbd: 629 },
			{ time: '08:00', fuel_fod_port: 542, fuel_fod_stbd: 534 },
			{ time: '10:00', fuel_fod_port: 431, fuel_fod_stbd: 426 },
			{ time: '12:00', fuel_fod_port: 322, fuel_fod_stbd: 318 },
			{ time: '14:00', fuel_fod_port: 214, fuel_fod_stbd: 212 },
			{ time: '16:00', fuel_fod_port: 108, fuel_fod_stbd: 104 },
			{ time: '18:00', fuel_fod_port: 42, fuel_fod_stbd: 38 }
		],
		hourly_average_speed: [
			{ hour: '00:00', avg_speed: 0 },
			{ hour: '01:00', avg_speed: 0 },
			{ hour: '02:00', avg_speed: 0 },
			{ hour: '03:00', avg_speed: 0 },
			{ hour: '04:00', avg_speed: 0 },
			{ hour: '05:00', avg_speed: 3.2 },
			{ hour: '06:00', avg_speed: 6.8 },
			{ hour: '07:00', avg_speed: 8.4 },
			{ hour: '08:00', avg_speed: 9.1 },
			{ hour: '09:00', avg_speed: 8.7 },
			{ hour: '10:00', avg_speed: 8.9 },
			{ hour: '11:00', avg_speed: 9.4 },
			{ hour: '12:00', avg_speed: 8.2 },
			{ hour: '13:00', avg_speed: 8.6 },
			{ hour: '14:00', avg_speed: 9.0 },
			{ hour: '15:00', avg_speed: 8.5 },
			{ hour: '16:00', avg_speed: 9.2 },
			{ hour: '17:00', avg_speed: 8.8 },
			{ hour: '18:00', avg_speed: 7.4 },
			{ hour: '19:00', avg_speed: 2.1 },
			{ hour: '20:00', avg_speed: 0 },
			{ hour: '21:00', avg_speed: 0 },
			{ hour: '22:00', avg_speed: 0 },
			{ hour: '23:00', avg_speed: 0 }
		],
		rpm_ranges_ems_internal: {
			grand_total: {
				runtime_hours: 32.3,
				runtime_minutes: 1938,
				fuel_ems_internal: 2032.7
			},
			details: [
				{
					engine_name: 'Main Engine 1',
					rpm_range: '600 - 800',
					runtime_hours: 4.2,
					runtime_minutes: 252,
					lh: 812.4,
					fuel_ems_internal: 568.7
				},
				{
					engine_name: 'Main Engine 1',
					rpm_range: '801 - 1000',
					runtime_hours: 5.6,
					runtime_minutes: 336,
					lh: 968.2,
					fuel_ems_internal: 271.1
				},
				{
					engine_name: 'Main Engine 2',
					rpm_range: '600 - 800',
					runtime_hours: 3.8,
					runtime_minutes: 228,
					lh: 798.6,
					fuel_ems_internal: 505.8
				},
				{
					engine_name: 'Main Engine 2',
					rpm_range: '801 - 1000',
					runtime_hours: 4.9,
					runtime_minutes: 294,
					lh: 949.4,
					fuel_ems_internal: 348.4
				},
				{
					engine_name: 'Auxiliary Engine 1',
					rpm_range: '1000 - 1500',
					runtime_hours: 8.5,
					runtime_minutes: 510,
					lh: 118.7,
					fuel_ems_internal: 208.7
				}
			]
		},
		rpm_ranges_ems_external: {
			grand_total: {
				runtime_hours: 32.3,
				runtime_minutes: 1938,
				fuel_ems_external: 2048.6
			},
			details: [
				{
					engine_name: 'Main Engine 1',
					rpm_range: '600 - 800',
					runtime_hours: 4.2,
					runtime_minutes: 252,
					lh: 818.1,
					fuel_ems_external: 572.7
				},
				{
					engine_name: 'Main Engine 1',
					rpm_range: '801 - 1000',
					runtime_hours: 5.6,
					runtime_minutes: 336,
					lh: 974.5,
					fuel_ems_external: 272.6
				},
				{
					engine_name: 'Main Engine 2',
					rpm_range: '600 - 800',
					runtime_hours: 3.8,
					runtime_minutes: 228,
					lh: 803.2,
					fuel_ems_external: 508.7
				},
				{
					engine_name: 'Main Engine 2',
					rpm_range: '801 - 1000',
					runtime_hours: 4.9,
					runtime_minutes: 294,
					lh: 954.7,
					fuel_ems_external: 348.3
				},
				{
					engine_name: 'Auxiliary Engine 1',
					rpm_range: '1000 - 1500',
					runtime_hours: 8.5,
					runtime_minutes: 510,
					lh: 121.1,
					fuel_ems_external: 212.9
				}
			]
		},
		rpm_ranges_maker: {
			grand_total: {
				runtime_hours: 32.3,
				runtime_minutes: 1938,
				fuel_engine_maker: 2023.9
			},
			details: [
				{
					engine_name: 'Main Engine 1',
					rpm_range: '600 - 800',
					runtime_hours: 4.2,
					runtime_minutes: 252,
					lh: 808.5,
					fuel_engine_maker: 566.0
				},
				{
					engine_name: 'Main Engine 1',
					rpm_range: '801 - 1000',
					runtime_hours: 5.6,
					runtime_minutes: 336,
					lh: 963.9,
					fuel_engine_maker: 269.8
				},
				{
					engine_name: 'Main Engine 2',
					rpm_range: '600 - 800',
					runtime_hours: 3.8,
					runtime_minutes: 228,
					lh: 795.1,
					fuel_engine_maker: 503.6
				},
				{
					engine_name: 'Main Engine 2',
					rpm_range: '801 - 1000',
					runtime_hours: 4.9,
					runtime_minutes: 294,
					lh: 945.5,
					fuel_engine_maker: 347.1
				},
				{
					engine_name: 'Auxiliary Engine 1',
					rpm_range: '1000 - 1500',
					runtime_hours: 8.5,
					runtime_minutes: 510,
					lh: 117.5,
					fuel_engine_maker: 206.4
				}
			]
		},
		consumption_per_range: {
			grand_total: { fuel_fms: 2041.2, fuel_ecu: 2057.5 },
			detail: [
				{
					engine_name: 'Main Engine 1',
					rpm_range: '600 - 800',
					runtime_hours: 4.2,
					runtime_minutes: 252,
					fuel_fms: 892.1,
					fuel_ecu: 898.6
				},
				{
					engine_name: 'Main Engine 1',
					rpm_range: '801 - 1000',
					runtime_hours: 5.6,
					runtime_minutes: 336,
					fuel_fms: 268.9,
					fuel_ecu: 271.2
				},
				{
					engine_name: 'Main Engine 2',
					rpm_range: '600 - 800',
					runtime_hours: 3.8,
					runtime_minutes: 228,
					fuel_fms: 795.4,
					fuel_ecu: 799.8
				},
				{
					engine_name: 'Main Engine 2',
					rpm_range: '801 - 1000',
					runtime_hours: 4.9,
					runtime_minutes: 294,
					fuel_fms: 347.8,
					fuel_ecu: 349.9
				},
				{
					engine_name: 'Auxiliary Engine 1',
					rpm_range: '1000 - 1500',
					runtime_hours: 8.5,
					runtime_minutes: 510,
					fuel_fms: 210.2,
					fuel_ecu: 214.5
				}
			]
		},
		rpm_vs_fuel_chart: {
			'Main Engine 1': [
				{
					time: '06:10',
					rpm: 620,
					speed: 6.9,
					fuel_ems_internal: 61.2,
					fuel_ems_external: 62.8,
					fuel_fms: 60.9,
					fuel_ecu: 61.5,
					fuel_engine_maker: 60.4
				},
				{
					time: '07:00',
					rpm: 780,
					speed: 8.4,
					fuel_ems_internal: 74.8,
					fuel_ems_external: 75.6,
					fuel_fms: 74.2,
					fuel_ecu: 75.1,
					fuel_engine_maker: 73.9
				},
				{
					time: '08:10',
					rpm: 920,
					speed: 9.2,
					fuel_ems_internal: 94.1,
					fuel_ems_external: 95.0,
					fuel_fms: 93.5,
					fuel_ecu: 94.8,
					fuel_engine_maker: 92.9
				},
				{
					time: '09:30',
					rpm: 1040,
					speed: 10.1,
					fuel_ems_internal: 118.6,
					fuel_ems_external: 119.8,
					fuel_fms: 117.9,
					fuel_ecu: 119.2,
					fuel_engine_maker: 116.8
				},
				{
					time: '11:20',
					rpm: 1120,
					speed: 11.0,
					fuel_ems_internal: 136.2,
					fuel_ems_external: 137.4,
					fuel_fms: 135.1,
					fuel_ecu: 136.9,
					fuel_engine_maker: 134.0
				},
				{
					time: '13:40',
					rpm: 980,
					speed: 9.8,
					fuel_ems_internal: 104.7,
					fuel_ems_external: 105.6,
					fuel_fms: 103.9,
					fuel_ecu: 105.1,
					fuel_engine_maker: 103.2
				},
				{
					time: '16:10',
					rpm: 860,
					speed: 8.7,
					fuel_ems_internal: 84.3,
					fuel_ems_external: 85.1,
					fuel_fms: 83.6,
					fuel_ecu: 84.7,
					fuel_engine_maker: 83.0
				},
				{
					time: '18:30',
					rpm: 640,
					speed: 6.4,
					fuel_ems_internal: 63.8,
					fuel_ems_external: 64.6,
					fuel_fms: 63.1,
					fuel_ecu: 64.2,
					fuel_engine_maker: 62.6
				}
			],
			'Main Engine 2': [
				{
					time: '06:10',
					rpm: 610,
					speed: 6.9,
					fuel_ems_internal: 59.8,
					fuel_ems_external: 60.7,
					fuel_fms: 59.4,
					fuel_ecu: 60.2,
					fuel_engine_maker: 58.9
				},
				{
					time: '07:00',
					rpm: 765,
					speed: 8.4,
					fuel_ems_internal: 73.2,
					fuel_ems_external: 74.1,
					fuel_fms: 72.8,
					fuel_ecu: 73.6,
					fuel_engine_maker: 72.4
				},
				{
					time: '08:10',
					rpm: 905,
					speed: 9.2,
					fuel_ems_internal: 92.4,
					fuel_ems_external: 93.2,
					fuel_fms: 91.8,
					fuel_ecu: 92.9,
					fuel_engine_maker: 91.1
				},
				{
					time: '09:30',
					rpm: 1015,
					speed: 10.1,
					fuel_ems_internal: 112.8,
					fuel_ems_external: 113.9,
					fuel_fms: 112.0,
					fuel_ecu: 113.3,
					fuel_engine_maker: 111.0
				},
				{
					time: '12:20',
					rpm: 1090,
					speed: 10.9,
					fuel_ems_internal: 129.4,
					fuel_ems_external: 130.5,
					fuel_fms: 128.5,
					fuel_ecu: 130.1,
					fuel_engine_maker: 127.3
				},
				{
					time: '15:10',
					rpm: 950,
					speed: 9.6,
					fuel_ems_internal: 99.1,
					fuel_ems_external: 100.0,
					fuel_fms: 98.4,
					fuel_ecu: 99.6,
					fuel_engine_maker: 97.6
				},
				{
					time: '18:30',
					rpm: 630,
					speed: 6.4,
					fuel_ems_internal: 62.0,
					fuel_ems_external: 62.9,
					fuel_fms: 61.4,
					fuel_ecu: 62.4,
					fuel_engine_maker: 60.8
				}
			],
			'Auxiliary Engine 1': [
				{
					time: '05:00',
					rpm: 1200,
					speed: 0,
					fuel_ems_internal: 26.1,
					fuel_ems_external: 26.6,
					fuel_fms: 26.2,
					fuel_ecu: 26.8,
					fuel_engine_maker: 25.6
				},
				{
					time: '07:00',
					rpm: 1380,
					speed: 6.9,
					fuel_ems_internal: 30.4,
					fuel_ems_external: 30.9,
					fuel_fms: 30.6,
					fuel_ecu: 31.2,
					fuel_engine_maker: 29.8
				},
				{
					time: '09:00',
					rpm: 1450,
					speed: 9.2,
					fuel_ems_internal: 32.6,
					fuel_ems_external: 33.2,
					fuel_fms: 32.8,
					fuel_ecu: 33.5,
					fuel_engine_maker: 32.0
				},
				{
					time: '11:00',
					rpm: 1480,
					speed: 11.0,
					fuel_ems_internal: 33.8,
					fuel_ems_external: 34.4,
					fuel_fms: 34.0,
					fuel_ecu: 34.7,
					fuel_engine_maker: 33.1
				},
				{
					time: '13:00',
					rpm: 1410,
					speed: 9.8,
					fuel_ems_internal: 31.4,
					fuel_ems_external: 31.9,
					fuel_fms: 31.6,
					fuel_ecu: 32.2,
					fuel_engine_maker: 30.8
				}
			]
		},
		high_rpm_outside_safety_zone: {
			table_15: {
				threshold_rpm: 1012,
				rows: [
					{
						engine_name: 'Main Engine 1',
						duration: '0h 42m 0s',
						rh_percent: 4.4,
						speed_avg: 10.6,
						speed_highest: 12.8,
						speed_lowest: 8.9
					},
					{
						engine_name: 'Main Engine 2',
						duration: '0h 18m 0s',
						rh_percent: 1.9,
						speed_avg: 10.1,
						speed_highest: 11.9,
						speed_lowest: 8.6
					}
				]
			},
			table_20: {
				threshold_rpm: 1104,
				rows: [
					{
						engine_name: 'Main Engine 1',
						duration: '0h 21m 0s',
						rh_percent: 2.2,
						speed_avg: 11.2,
						speed_highest: 12.8,
						speed_lowest: 9.8
					}
				]
			}
		},
		high_rpm_low_speed: {
			rule: 'RPM > 900 with speed < 2.0 knot for more than 15 minutes',
			details: [
				{
					engine_name: 'Main Engine 1',
					start_time: '09:12',
					end_time: '09:44',
					duration: '0h 32m 0s',
					fuel_used_l: 18.6
				},
				{
					engine_name: 'Main Engine 2',
					start_time: '14:20',
					end_time: '14:38',
					duration: '0h 18m 0s',
					fuel_used_l: 10.2
				},
				{
					engine_name: 'Auxiliary Engine 1',
					start_time: '16:05',
					end_time: '16:41',
					duration: '0h 36m 0s',
					fuel_used_l: 6.8
				}
			],
			totals: [
				{ engine_name: 'Main Engine 1', fuel_used_l: 18.6 },
				{ engine_name: 'Main Engine 2', fuel_used_l: 10.2 },
				{ engine_name: 'Auxiliary Engine 1', fuel_used_l: 6.8 }
			],
			grand_total_l: 35.6
		}
	}
};
