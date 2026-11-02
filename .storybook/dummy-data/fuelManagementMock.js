export const fuelManagementDataMock = {
	data: {
		vessel_name: 'MT Samudra Biru',
		fuel_consumption: {
			cons_vdor: 3450.5,
			daily_system: 3420.8,
			daily_system_source: 'ems_internal',
			fuel_rob: 18420.0,
			fuel_ems_internal: { total: 3420.8, ae: 328.8, me: 3092.0 },
			fuel_ems_external: { total: 3395.2, ae: 325.1, me: 3070.1 },
			fuel_engine_maker: { total: 3502.6, ae: 336.4, me: 3166.2 }
		},
		fuel_consumption_per_engine: {
			per_engine_system: {
				details: [
					{ engine: 'Main Engine 1', total: 1850.4 },
					{ engine: 'Main Engine 2', total: 1241.6 },
					{ engine: 'Auxiliary Engine 1', total: 328.8 }
				],
				subtotal_ae: 328.8,
				subtotal_me: 3092.0,
				grand_total: 3420.8
			},
			per_engine_ems_internal: {
				details: [
					{ engine: 'Main Engine 1', total: 1842.7 },
					{ engine: 'Main Engine 2', total: 1249.3 },
					{ engine: 'Auxiliary Engine 1', total: 328.8 }
				],
				subtotal_ae: 328.8,
				subtotal_me: 3092.0,
				grand_total: 3420.8
			},
			per_engine_ems_external: {
				details: [
					{ engine: 'Main Engine 1', total: 1836.1 },
					{ engine: 'Main Engine 2', total: 1234.0 },
					{ engine: 'Auxiliary Engine 1', total: 325.1 }
				],
				subtotal_ae: 325.1,
				subtotal_me: 3070.1,
				grand_total: 3395.2
			},
			per_engine_maker: {
				details: [
					{ engine: 'Main Engine 1', total: 1896.8 },
					{ engine: 'Main Engine 2', total: 1269.4 },
					{ engine: 'Auxiliary Engine 1', total: 336.4 }
				],
				subtotal_ae: 336.4,
				subtotal_me: 3166.2,
				grand_total: 3502.6
			}
		}
	}
};

export const fuelManagementHistoryMock = {
	data: {
		timezone: 'UTC+07:00',
		history: [
			{
				date: '2026-10-28',
				rob_before: 20870.5,
				rob_after: 18420.0,
				sources: [
					{
						fuel_source: 'ems_internal',
						recorded_from: '2026-10-28 00:00:00',
						recorded_until: '2026-10-28 12:00:00',
						consumption_l: 1220.5
					},
					{
						fuel_source: 'ems_external',
						recorded_from: '2026-10-28 12:00:00',
						recorded_until: '2026-10-28 23:59:59',
						consumption_l: 1230.0
					}
				],
				note: 'Noon report'
			},
			{
				date: '2026-10-27',
				rob_before: 24180.9,
				rob_after: 20870.5,
				consumption: 3310.4,
				fuel_source: 'ems_internal',
				note: '-'
			},
			{
				date: '2026-10-26',
				rob_before: 19390.4,
				rob_after: 24180.9,
				consumption: 211.5,
				fuel_source: 'ems_external',
				transactions: [
					{
						id: 'trx-1',
						timestamp: '2026-10-26 08:15:00',
						action: 'Fuel Received',
						transaction_type: 'BUNKER',
						quantity_l: 5000,
						user: 'Chief Engineer',
						fuel_source: 'ems_external',
						note: 'Bunker at anchorage'
					},
					{
						id: 'trx-2',
						timestamp: '2026-10-26 16:40:00',
						action: 'Fuel Consumption',
						transaction_type: 'BOUT',
						quantity_l: 210.5,
						user: 'Chief Engineer',
						fuel_source: 'ems_external',
						note: '-'
					}
				]
			}
		],
		pagination: {
			total_items: 5,
			page: 1,
			limit: 10,
			total_pages: 1
		}
	}
};
