import { describe, expect, it } from 'vitest';
import { formatDistanceNm, getRouteLegDistancesNm, haversineDistanceNm } from './voyageRouteDistance.js';

describe('haversineDistanceNm', () => {
	it('measures one degree of latitude as about 60.04 NM', () => {
		const distance = haversineDistanceNm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
		expect(distance).toBeCloseTo(60.04, 1);
	});

	it('returns null when a point has no usable coordinate', () => {
		expect(haversineDistanceNm({ latitude: 0, longitude: 0 }, { latitude: '', longitude: 0 })).toBe(
			null
		);
		expect(haversineDistanceNm({ latitude: null, longitude: 0 }, { latitude: 1, longitude: 0 })).toBe(
			null
		);
		expect(haversineDistanceNm({ latitude: 95, longitude: 0 }, { latitude: 1, longitude: 0 })).toBe(
			null
		);
	});
});

describe('getRouteLegDistancesNm', () => {
	it('leaves the first point empty and sums the remaining legs', () => {
		const { legs, totalNm } = getRouteLegDistancesNm([
			{ latitude: 0, longitude: 0 },
			{ latitude: 1, longitude: 0 },
			{ latitude: 2, longitude: 0 }
		]);

		expect(legs[0]).toBe(null);
		expect(legs[1]).toBeCloseTo(60.04, 1);
		expect(legs[2]).toBeCloseTo(60.04, 1);
		expect(totalNm).toBeCloseTo(120.08, 0);
	});

	it('skips legs with missing coordinates in the total', () => {
		const { legs, totalNm } = getRouteLegDistancesNm([
			{ latitude: 0, longitude: 0 },
			{ latitude: '', longitude: '' },
			{ latitude: 2, longitude: 0 }
		]);

		expect(legs[1]).toBe(null);
		expect(totalNm).toBe(0);
	});

	it('handles a single point and empty input', () => {
		expect(getRouteLegDistancesNm([{ latitude: 1, longitude: 1 }])).toEqual({ legs: [null], totalNm: 0 });
		expect(getRouteLegDistancesNm()).toEqual({ legs: [], totalNm: 0 });
	});
});

describe('formatDistanceNm', () => {
	it('formats finite distances and dashes everything else', () => {
		expect(formatDistanceNm(12.3456)).toBe('12.35 NM');
		expect(formatDistanceNm(0)).toBe('0.00 NM');
		expect(formatDistanceNm(null)).toBe('-');
	});
});
