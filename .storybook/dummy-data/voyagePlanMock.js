const routePlanData = [
	{
		order: 1,
		latitude: -6.1023,
		longitude: 106.8812,
		speed_kn: 8,
		status: 'COMPLETED',
		reached_at: '2026-10-29T08:12:00+07:00',
		average_speed: 7.84
	},
	{
		order: 2,
		latitude: -6.0413,
		longitude: 106.9025,
		speed_kn: 9,
		status: 'COMPLETED',
		reached_at: '2026-10-29T09:40:00+07:00',
		average_speed: 8.75
	},
	{
		order: 3,
		latitude: -5.9887,
		longitude: 106.945,
		speed_kn: 10,
		status: 'COMPLETED',
		reached_at: '2026-10-29T11:05:00+07:00',
		average_speed: 9.51
	},
	{
		order: 4,
		latitude: -5.931,
		longitude: 107.0124,
		speed_kn: 9,
		status: 'COMPLETED',
		reached_at: '2026-10-29T12:30:00+07:00',
		average_speed: 8.9
	},
	{
		order: 5,
		latitude: -5.8745,
		longitude: 107.0881,
		speed_kn: 8,
		status: 'COMPLETED',
		reached_at: '2026-10-29T13:55:00+07:00',
		average_speed: 8.2
	},
	{ order: 6, latitude: -5.818, longitude: 107.1602, speed_kn: 9, status: 'PENDING' },
	{ order: 7, latitude: -5.762, longitude: 107.235, speed_kn: 8, status: 'PENDING' },
	{ order: 8, latitude: -5.706, longitude: 107.312, speed_kn: 7, status: 'PENDING' }
];

export const voyageActiveAssignmentMock = {
	id: 284,
	voyagePlanId: 57,
	startDate: '2026-10-29T08:00:00+07:00',
	endDate: null,
	assignedAt: '2026-10-28T16:35:00+07:00',
	assignedBy: 1,
	user: { name: 'Capt. Arief Wibowo', username: 'arief' },
	progress_percentage: 62.5,
	voyagePlan: {
		id: 57,
		voyageName: 'Jakarta - Cirebon',
		planData: routePlanData
	}
};

export const voyageHistoryMock = {
	data: {
		items: [
			{
				id: 271,
				voyagePlanId: 51,
				startDate: '2026-10-18T06:00:00+07:00',
				endDate: '2026-10-19T06:00:00+07:00',
				assignedAt: '2026-10-17T14:10:00+07:00',
				assignedBy: 2,
				user: { name: 'Capt. Dewi Lestari' }
			},
			{
				id: 263,
				voyagePlanId: 49,
				startDate: '2026-10-12T07:30:00+07:00',
				endDate: '2026-10-13T07:30:00+07:00',
				assignedAt: '2026-10-11T19:55:00+07:00',
				assignedBy: 3,
				user: { name: 'Capt. Rudi Hartono' }
			},
			{
				id: 249,
				voyagePlanId: 44,
				startDate: '2026-10-05T05:00:00+07:00',
				endDate: '2026-10-06T05:00:00+07:00',
				assignedAt: '2026-10-04T15:20:00+07:00',
				assignedBy: 1,
				user: { name: 'Capt. Bayu Saputra' }
			}
		],
		pagination: {
			page: 1,
			pageSize: 20,
			totalItems: 3,
			totalPages: 1,
			hasNext: false,
			hasPrevious: false
		}
	}
};

export const vesselLatestStatusMock = {
	data: {
		vesselName: 'MT Samudra Biru',
		latitude: -6.1023,
		longitude: 106.8812,
		heading: 124,
		updatedAt: '2026-10-29T09:42:00+07:00'
	}
};

export const voyageActionSuccessMock = {
	message: 'Voyage action completed.'
};

export function buildVoyageHistoryDetailMock(url) {
	const id = Number((url.match(/\/history\/(\d+)/) || [])[1]) || 271;

	return {
		data: {
			...voyageActiveAssignmentMock,
			id,
			voyagePlanId: 51,
			startDate: '2026-10-18T06:00:00+07:00',
			endDate: '2026-10-19T06:00:00+07:00',
			assignedAt: '2026-10-17T14:10:00+07:00',
			assignedBy: 2,
			user: { name: 'Capt. Dewi Lestari' },
			progress_percentage: 100,
			voyagePlan: {
				id: 51,
				voyageName: 'Jakarta - Panjang',
				planData: routePlanData.map((point) => ({
					...point,
					status: 'COMPLETED',
					reached_at: point.reached_at || '2026-10-19T05:30:00+07:00',
					average_speed: point.average_speed || point.speed_kn
				}))
			}
		}
	};
}
