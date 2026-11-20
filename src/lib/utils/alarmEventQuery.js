/**
 * Builds the query string for `GET /alarm/events`.
 * The backend accepts comma-separated values for both `vesselId` and `alarmType`.
 */
export function buildAlarmEventsQuery({
	vesselIds = [],
	status = '',
	alarmTypes = [],
	page = 1,
	pageSize = 20
} = {}) {
	const params = new URLSearchParams();
	const vesselIdsParam = (Array.isArray(vesselIds) ? vesselIds : [])
		.map((id) => String(id ?? '').trim())
		.filter(Boolean);

	if (vesselIdsParam.length) {
		params.set('vesselId', vesselIdsParam.join(','));
	}

	if (status) {
		params.set('status', status);
	}

	if (Array.isArray(alarmTypes) && alarmTypes.length) {
		params.set('alarmType', alarmTypes.join(','));
	}

	params.set('page', String(page));
	params.set('pageSize', String(pageSize));

	return params.toString();
}
