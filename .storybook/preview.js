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
	if (url.includes('/users/current-user'))
		return jsonResponse({ data: { id: 1, permissionAccess: { mode: 'all' } } });
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
