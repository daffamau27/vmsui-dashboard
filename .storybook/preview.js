import '../src/lib/styles/layout.css';

const realFetch = window.fetch.bind(window);

const jsonResponse = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const dataLogMock = {
	columns: ['timestamp', 'latitude', 'longitude', 'course', 'speed', 'me1_rpm', 'me2_rpm'],
	rows: [
		{
			timestamp: '22 Okt 2026, 09:42:00',
			latitude: -6.1023,
			longitude: 106.8812,
			course: 12,
			speed: 8.4,
			me1_rpm: 1420,
			me2_rpm: 1418
		},
		{
			timestamp: '22 Okt 2026, 09:41:00',
			latitude: -6.1031,
			longitude: 106.8808,
			course: 11,
			speed: 8.6,
			me1_rpm: 1435,
			me2_rpm: 1429
		}
	],
	pagination: {
		page: 1,
		pageSize: 100,
		totalItems: 2,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	},
	deviation: {
		deviations: {
			jumping_data: {
				count: 1,
				total_duration_minutes: 6,
				rows: [
					{
						start: '22 Okt 2026, 09:12:00',
						end: '22 Okt 2026, 09:18:00',
						duration_minutes: 6
					}
				]
			},
			spike_rpm: { count: 0, total_duration_minutes: 0, rows: [] },
			outrange_rpm: { count: 0, total_duration_minutes: 0, rows: [] },
			rpm_blank: { count: 0, total_duration_minutes: 0, rows: [] }
		},
		rpm_limits: { low: 300, high: 1800, lower_limit: 250, upper_limit: 1900 }
	}
};

const auditMock = {
	items: [
		{
			id: 'aud-9f2c1a',
			logged_at: 1761097320000,
			user: { username: 'admin', user_id: 1 },
			action: 'UPDATE',
			module: 'vessel_profile'
		},
		{
			id: 'aud-7b41de',
			logged_at: 1761094260000,
			user: { username: 'operator1', user_id: 12 },
			action: 'CREATE',
			module: 'daily_report'
		}
	],
	pagination: {
		page: 1,
		pageSize: 20,
		totalItems: 2,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	}
};

const alarmMock = {
	monitor: [
		{
			vesselId: 101,
			vesselName: 'MV Nusantara Jaya',
			status: 'ACTIVE',
			type: 'DEVICE_OFFLINE',
			lastUpdateTs: 1735689600000,
			isNew: true
		},
		{
			vesselId: 102,
			vesselName: 'MT Samudra Biru',
			status: 'ACTIVE',
			type: 'SPIKE_RPM',
			lastUpdate: '22 Okt 2026, 09:42:10',
			isNew: false
		},
		{
			vesselId: 103,
			vesselName: 'MV Bahari Indah',
			status: 'CLEARED',
			type: 'OUTRANGE_RPM',
			lastUpdate: '22 Okt 2026, 08:15:44',
			isNew: false
		}
	],
	events: [
		{
			vesselId: 101,
			vesselName: 'MV Nusantara Jaya',
			alarmType: 'DEVICE_OFFLINE',
			status: 'ACTIVE',
			eventTs: 1735689300000,
			startTs: 1735689300000,
			endTs: null
		},
		{
			vesselId: 102,
			vesselName: 'MT Samudra Biru',
			alarmType: 'SPIKE_RPM',
			status: 'ACTIVE',
			eventTs: 1735688400000,
			startTs: 1735688400000,
			endTs: null
		},
		{
			vesselId: 103,
			vesselName: 'MV Bahari Indah',
			alarmType: 'OUTRANGE_RPM',
			status: 'CLEARED',
			eventTs: 1735682400000,
			startTs: 1735682400000,
			endTs: 1735686000000
		}
	]
};

const adminMock = {
	users: [
		{
			id: 1,
			name: 'Mahesa Pratama',
			username: 'mahesa',
			email: 'mahesa@example.com',
			createdAt: '2025-01-15T08:00:00Z',
			deletedAt: null
		},
		{
			id: 12,
			name: 'Rizky Operator',
			username: 'operator1',
			email: 'operator1@example.com',
			createdAt: '2025-03-02T08:00:00Z',
			deletedAt: null
		},
		{
			id: 27,
			name: 'Dewi Analyst',
			username: 'dewi.analyst',
			email: 'dewi@example.com',
			createdAt: '2025-06-11T08:00:00Z',
			deletedAt: '2026-09-01T08:00:00Z'
		}
	],
	permissions: {
		modulePermissions: {
			dashboard: {
				moduleLabel: 'Dashboard',
				permissions: [
					{
						key: 'access_dashboard',
						label: 'Access Dashboard',
						description: 'Open the vessel dashboard page.',
						category: 'access'
					},
					{
						key: 'view_engine_rpm_stats_table',
						label: 'Engine RPM Stats Table',
						description: 'Show engine RPM statistics.',
						category: 'report_content'
					}
				]
			},
			reporting: {
				moduleLabel: 'Reporting',
				permissions: [
					{
						key: 'view_fuel_consumption_table',
						label: 'Fuel Consumption Table',
						description: 'Show the fuel consumption section.',
						category: 'report_content'
					},
					{
						key: 'view_daily_path_map',
						label: 'Daily Path Map',
						description: 'Show the vessel daily path map.',
						category: 'report_content'
					}
				]
			},
			administrator: {
				moduleLabel: 'Administrator',
				permissions: [
					{
						key: 'manage_cctv_config',
						label: 'Manage CCTV Config',
						description: 'Manage CCTV cameras per vessel.',
						category: 'manage'
					}
				]
			}
		}
	},
	companies: [
		{ id: 1, name: 'Nusantara Shipping', companyIdThingsboard: 'tb-company-01' },
		{ id: 2, name: 'Samudra Lines', companyIdThingsboard: 'tb-company-02' }
	],
	vessels: [
		{
			id: 101,
			vesselName: 'MV Nusantara Jaya',
			deviceId: 'tb-device-101',
			status: 'online',
			companyId: 1,
			fuelConsumptionSource: 'fm',
			hireStatus: true
		},
		{
			id: 102,
			vesselName: 'MT Samudra Biru',
			deviceId: 'tb-device-102',
			status: 'offline',
			companyId: 2,
			fuelConsumptionSource: 'ecu',
			hireStatus: false
		},
		{
			id: 103,
			vesselName: 'MV Bahari Indah',
			deviceId: 'tb-device-103',
			status: 'online',
			companyId: 1,
			fuelConsumptionSource: 'ems_internal',
			hireStatus: true
		}
	],
	vesselFeatures: [
		{ key: 'access_dashboard', label: 'Dashboard', module: 'Access' },
		{ key: 'access_daily_report', label: 'Daily Report', module: 'Access' },
		{ key: 'access_fleet_view', label: 'Fleet View', module: 'Access' }
	],
	assets: [
		{
			id: 201,
			assetId: 'asset-201',
			assetName: 'Engine Monitor Alpha',
			assetType: 'buoy',
			companyId: 1,
			thingsboardName: 'engine-monitor-alpha'
		},
		{
			id: 202,
			assetId: 'asset-202',
			assetName: 'Fuel Flow Meter',
			assetType: 'whp',
			companyId: 2,
			thingsboardName: 'fuel-flow-meter'
		}
	],
	engineCurves: [
		{
			curve_id: 'curve-01',
			vessel_id: 101,
			vessel_name: 'MV Nusantara Jaya',
			curve_name: 'ME Maker Specs v1',
			curve_type: 'engine_maker',
			valid_from: '2026-01-01',
			valid_to: null,
			is_active: true
		},
		{
			curve_id: 'curve-02',
			vessel_id: 102,
			vessel_name: 'MT Samudra Biru',
			curve_name: 'EMS Internal Baseline',
			curve_type: 'ems_internal',
			valid_from: '2026-04-15',
			valid_to: '2026-12-31',
			is_active: false
		}
	],
	engineCurveDetail: {
		curve_id: 'curve-01',
		vessel_id: 101,
		vessel_name: 'MV Nusantara Jaya',
		curve_name: 'ME Maker Specs v1',
		curve_type: 'engine_maker',
		valid_from: '2026-01-01',
		valid_to: null,
		is_active: true,
		meta: {
			source_file_path: 'curves/me-maker-specs-v1.xlsx',
			uploaded_at: '2026-01-05T09:15:00Z'
		},
		engines: [
			{
				engine_name: 'Main Engine 1',
				engine_key_thingsboard: 'me1',
				ranges: [
					{ rpm_min: 0, rpm_max: 600, value_lh: 12.5 },
					{ rpm_min: 601, rpm_max: 1200, value_lh: 48.2 }
				]
			},
			{ engine_name: 'Auxiliary Engine 1', engine_key_thingsboard: 'ae1', value_lh: 6.4 }
		]
	},
	reportingVessels: [
		{
			id: 101,
			vessel_name: 'MV Nusantara Jaya',
			deviceId: 'tb-device-101',
			status: 'online',
			companyId: 1,
			companyName: 'Nusantara Shipping',
			fuelConsumptionSource: 'fm',
			hireStatus: true,
			auto_report: {
				is_enabled: true,
				send_time: '08:00',
				timezone_mode: 'auto',
				recipients: {
					pic: ['ops@nusantara.example'],
					cc: ['fleet@nusantara.example'],
					bcc: []
				},
				report_content: {
					sections: [
						'view_engine_runtime_table',
						'view_fuel_consumption_table',
						'view_engine_rpm_stats_table'
					]
				}
			},
			engine_health: {
				is_enabled: true,
				oil_pressure_min: 2.5,
				oil_pressure_max: 6,
				oil_temperature_max: 95,
				coolant_temperature_min: 60,
				coolant_temperature_max: 90
			}
		},
		{
			id: 102,
			vessel_name: 'MT Samudra Biru',
			deviceId: 'tb-device-102',
			status: 'offline',
			companyId: 2,
			companyName: 'Samudra Lines',
			fuelConsumptionSource: 'ecu',
			hireStatus: false,
			auto_report: {
				is_enabled: false,
				send_time: '07:30',
				timezone_mode: 'auto',
				recipients: { pic: [], cc: [], bcc: [] },
				report_content: { sections: [] }
			},
			engine_health: { is_enabled: false }
		},
		{
			id: 103,
			vessel_name: 'MV Bahari Indah',
			deviceId: 'tb-device-103',
			status: 'online',
			companyId: 1,
			companyName: 'Nusantara Shipping',
			fuelConsumptionSource: 'ems_internal',
			hireStatus: true,
			auto_report: {
				is_enabled: true,
				send_time: '09:00',
				timezone_mode: 'auto',
				recipients: { pic: ['ops@bahari.example'], cc: [], bcc: [] },
				report_content: { sections: ['view_travel_distance_table'] }
			},
			engine_health: {
				is_enabled: true,
				oil_pressure_min: 2.4,
				oil_pressure_max: 5.8,
				oil_temperature_max: 92,
				coolant_temperature_min: 55,
				coolant_temperature_max: 88
			}
		}
	],
	assignableUsers: {
		users: [
			{ id: 1, name: 'Mahesa Pratama', username: 'mahesa', email: 'mahesa@example.com' },
			{ id: 12, name: 'Rizky Operator', username: 'operator1', email: 'operator1@example.com' }
		],
		pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 }
	},
	telegramGroups: {
		items: [
			{
				id: 301,
				name: 'Fleet Ops Alerts',
				chatId: '-10022334455',
				isActive: true,
				rules: {
					vesselId: [101, 103],
					alarmKeys: ['ENGINE_HEALTH', 'DEVICE_OFFLINE']
				}
			},
			{
				id: 302,
				name: 'Samudra On-Call',
				chatId: '-10099887766',
				isActive: false,
				rules: { vesselId: [102], alarmKeys: ['LOW_SPEED_HIGH_RPM'] }
			}
		],
		pagination: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 }
	},
	autoReportAuditLogs: [
		{
			action: 'UPDATE',
			module: 'auto_report',
			user: { username: 'admin' },
			logged_at: 1761097320000,
			changes: [
				{ fields: 'send_time', old_value: '07:00', new_value: '08:00' },
				{
					fields: 'recipients.pic',
					old_value: 'ops@example.com',
					new_value: 'ops@nusantara.example'
				}
			]
		},
		{
			action: 'CREATE',
			module: 'engine_health',
			user: { username: 'operator1' },
			logged_at: 1761094260000,
			changes: [{ fields: 'oil_pressure_min', old_value: '-', new_value: '2.5' }]
		}
	],
	cctvConfig: {
		updatedAt: '2026-10-20T10:00:00Z',
		cameras: [
			{ camera_name: 'Engine Room Cam', camera_token: 'cam-token-engine-room' },
			{ camera_name: 'Deck Cam', camera_token: 'cam-token-deck' }
		]
	}
};

window.fetch = (input, init) => {
	const url = typeof input === 'string' ? input : input.url;

	if (url.includes('/audit-logs/my?') || url.includes('/audit-logs?'))
		return jsonResponse({ data: auditMock });
	if (url.includes('/all-vessel-summary/vessels'))
		return jsonResponse({
			data: [
				{ id: 101, vesselName: 'MV Nusantara Jaya', companyName: 'Nusantara Shipping' },
				{ id: 102, vesselName: 'MT Samudra Biru', companyName: 'Samudra Lines' },
				{ id: 103, vesselName: 'MV Bahari Indah', companyName: 'Bahari Marine' }
			]
		});
	if (url.includes('/all-vessel-summary/data')) return jsonResponse({ data: { rows: [] } });
	if (url.includes('/users/my-vessels'))
		return jsonResponse({
			data: [
				{ vesselId: 101, vesselName: 'MV Nusantara Jaya' },
				{ vesselId: 102, vesselName: 'MT Samudra Biru' },
				{ vesselId: 103, vesselName: 'MV Bahari Indah' }
			]
		});
	if (url.includes('/users/my-assets'))
		return jsonResponse({
			data: [
				{ assetId: 'a-01', assetName: 'Engine Monitor 01', assetType: 'engine' },
				{ assetId: 'a-02', assetName: 'Fuel Flow Meter 02', assetType: 'sensor' }
			]
		});
	if (url.includes('/users/current-user'))
		return jsonResponse({
			data: {
				id: 1,
				name: 'Mahesa Pratama',
				username: 'mahesa',
				email: 'mahesa@example.com',
				createdAt: '2025-01-15T08:00:00Z',
				permissionAccess: { mode: 'all' },
				vesselAccess: { mode: 'assigned' },
				assetAccess: { mode: 'assigned' }
			}
		});
	if (url.includes('/data-logs/available-columns'))
		return jsonResponse({ data: { available_columns: dataLogMock.columns } });
	if (url.includes('/data-logs/data-deviation'))
		return jsonResponse({ data: dataLogMock.deviation });
	if (url.includes('/data-logs/data?'))
		return jsonResponse({
			data: {
				rows: dataLogMock.rows,
				columns: dataLogMock.columns,
				pagination: dataLogMock.pagination,
				timezone: 'UTC+07:00'
			}
		});
	if (url.includes('/data-logs/overrides/imports'))
		return jsonResponse({
			data: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 } }
		});
	if (url.includes('/alarm/mark-all-read')) return jsonResponse({ message: 'ok' });
	if (url.includes('/alarm/monitor-deviations'))
		return jsonResponse({
			data: { monitor: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 } }
		});
	if (url.includes('/alarm/monitor')) return jsonResponse({ data: { monitor: alarmMock.monitor } });
	if (url.includes('/alarm/events'))
		return jsonResponse({
			data: {
				events: alarmMock.events,
				pagination: {
					page: 1,
					pageSize: 20,
					totalItems: alarmMock.events.length,
					totalPages: 1,
					hasNext: false,
					hasPrevious: false
				}
			}
		});

	if (url.includes('/users/permissions')) return jsonResponse({ data: adminMock.permissions });
	if (url.includes('/users/all-users')) return jsonResponse({ data: adminMock.users });
	if (/\/users\/\d+(\?|$)/.test(url)) return jsonResponse({ data: adminMock.users[0] });
	if (url.includes('/vessels/available-features'))
		return jsonResponse({ data: adminMock.vesselFeatures });
	if (/\/vessels(\?|$)/.test(url)) return jsonResponse({ data: adminMock.vessels });
	if (/\/companies(\?|$)/.test(url)) return jsonResponse({ data: adminMock.companies });
	if (/\/assets(\?|$)/.test(url)) return jsonResponse({ data: adminMock.assets });
	if (url.includes('/engine-curves/vessels/'))
		return jsonResponse({ data: adminMock.engineCurveDetail });
	if (/\/engine-curves(\?|$)/.test(url)) return jsonResponse({ data: adminMock.engineCurves });
	if (url.includes('/cctv/vessels/')) return jsonResponse({ data: adminMock.cctvConfig });
	if (url.includes('/reporting/vessels/') && url.includes('/assignable-users'))
		return jsonResponse({ data: adminMock.assignableUsers });
	if (url.includes('/reporting/periodical/vessels?') || url.includes('/reporting/vessels?'))
		return jsonResponse({ data: adminMock.reportingVessels });
	if (url.includes('/reporting/auto-report-audit-logs'))
		return jsonResponse({ data: adminMock.autoReportAuditLogs });
	if (url.includes('/reporting/alarm/telegram-groups'))
		return jsonResponse({ data: adminMock.telegramGroups });

	return realFetch(input, init);
};

/** @type { import('@storybook/sveltekit').Preview } */
const preview = {
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		},

		a11y: {
			// 'todo' - show a11y violations in the test UI only
			// 'error' - fail CI on a11y violations
			// 'off' - skip a11y checks entirely
			test: 'todo'
		}
	}
};

export default preview;
