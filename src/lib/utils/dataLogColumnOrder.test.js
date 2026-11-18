import { describe, expect, it } from 'vitest';
import { orderSpeedBetweenLongitudeAndRpm } from './dataLogColumnOrder.js';

describe('orderSpeedBetweenLongitudeAndRpm', () => {
	it('places speed directly after longitude', () => {
		expect(
			orderSpeedBetweenLongitudeAndRpm([
				'timestamp',
				'latitude',
				'longitude',
				'course',
				'speed',
				'rig',
				'me_port_rpm'
			])
		).toEqual([
			'timestamp',
			'latitude',
			'longitude',
			'speed',
			'course',
			'rig',
			'me_port_rpm'
		]);
	});

	it('moves speed when the backend puts it before longitude or past the rpm columns', () => {
		expect(
			orderSpeedBetweenLongitudeAndRpm([
				'timestamp',
				'speed',
				'latitude',
				'longitude',
				'me_port_rpm',
				'me_stbd_rpm'
			])
		).toEqual([
			'timestamp',
			'latitude',
			'longitude',
			'speed',
			'me_port_rpm',
			'me_stbd_rpm'
		]);
	});

	it('falls back to the first rpm column when longitude is missing', () => {
		expect(
			orderSpeedBetweenLongitudeAndRpm(['timestamp', 'speed', 'me_port_run', 'me_port_rpm'])
		).toEqual(['timestamp', 'me_port_run', 'speed', 'me_port_rpm']);
	});

	it('keeps the order when there is no speed, longitude or rpm column', () => {
		expect(orderSpeedBetweenLongitudeAndRpm(['timestamp', 'course'])).toEqual([
			'timestamp',
			'course'
		]);
		expect(orderSpeedBetweenLongitudeAndRpm(['course', 'speed'])).toEqual(['course', 'speed']);
	});
});
