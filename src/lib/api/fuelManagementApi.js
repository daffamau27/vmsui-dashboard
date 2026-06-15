import { apiRequest } from '$lib/api/authApi.js';

export async function getFuelManagementData({ vesselId, date, timezoneMode = 'auto', timezoneOffset = '' }) {
	const params = new URLSearchParams({
		vesselId: String(vesselId),
		date,
		timezoneMode
	});

	if (timezoneMode === 'manual' && timezoneOffset) {
		params.set('timezoneOffset', timezoneOffset);
	}

	return apiRequest(`/fuel-management/data?${params.toString()}`, {
		method: 'GET'
	});
}

export async function getFuelManagementHistory({ vesselId, date, page = 1, limit = 10 }) {
	const params = new URLSearchParams({
		vesselId: String(vesselId),
		date,
		page: String(page),
		limit: String(limit)
	});

	return apiRequest(`/fuel-management/history?${params.toString()}`, {
		method: 'GET'
	});
}

export async function saveFuelRob({ vesselId, datetime, rob, note }) {
	return apiRequest('/fuel-management/save-rob', {
		method: 'POST',
		body: JSON.stringify({
			vesselId: Number(vesselId),
			datetime,
			rob: Number(rob),
			note: note || ''
		})
	});
}

export async function applyFuelTransaction({ vesselId, datetime, received, consumption, note }) {
	return apiRequest('/fuel-management/apply-transaction', {
		method: 'POST',
		body: JSON.stringify({
			vesselId: Number(vesselId),
			datetime,
			received: Number(received || 0),
			consumption: Number(consumption || 0),
			note: note || ''
		})
	});
}

export async function deleteFuelTransaction(id) {
	return apiRequest(`/fuel-management/transactions/${id}`, {
		method: 'DELETE'
	});
}

export async function importFuelVdor({ vesselId, fileBase64 }) {
	return apiRequest('/fuel-management/import-vdor', {
		method: 'POST',
		body: JSON.stringify({
			vesselId: Number(vesselId),
			fileBase64
		})
	});
}

export async function downloadVdorTemplate() {
	return apiRequest('/fuel-management/vdor-template', {
		method: 'GET',
		raw: true,
		headers: {
			Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		}
	});
}