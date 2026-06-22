import { apiRequest, downloadApiFile } from "$lib/api/authApi.js";

function unwrap(response) {
  return response?.data || response;
}

export async function getPermissionCatalogApi() {
  const response = await apiRequest("/users/permissions", {
    method: "GET"
  });

  return unwrap(response);
}

export async function getAllUsersApi() {
  const response = await apiRequest("/users/all-users", {
    method: "GET"
  });

  return unwrap(response);
}

export async function getUserDetailApi(id) {
  if (!id) {
    throw new Error("User ID tidak valid.");
  }

  const response = await apiRequest(`/users/${id}`, {
    method: "GET"
  });

  return unwrap(response);
}

export async function createUserApi(payload) {
  const response = await apiRequest("/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function updateUserApi(id, payload) {
  if (!id) {
    throw new Error("User ID tidak valid.");
  }

  const response = await apiRequest(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function deactivateUserApi(id) {
  if (!id) {
    throw new Error("User ID tidak valid.");
  }

  const response = await apiRequest(`/users/${id}/deactivate`, {
    method: "POST"
  });

  return unwrap(response);
}

export async function activateUserApi(id) {
  if (!id) {
    throw new Error("User ID tidak valid.");
  }

  const response = await apiRequest(`/users/${id}/activate`, {
    method: "POST"
  });

  return unwrap(response);
}

export async function getAllVesselsAdminApi() {
  const response = await apiRequest("/vessels", {
    method: "GET"
  });

  return unwrap(response);
}

export async function createVesselAdminApi(payload) {
  const response = await apiRequest("/vessels", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function updateVesselAdminApi(id, payload) {
  if (!id) {
    throw new Error("Vessel ID tidak valid.");
  }

  const response = await apiRequest(`/vessels/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function deleteVesselAdminApi(id) {
  if (!id) {
    throw new Error("Vessel ID tidak valid.");
  }

  const response = await apiRequest(`/vessels/${id}`, {
    method: "DELETE"
  });

  return unwrap(response);
}

export async function getAllAssetsAdminApi() {
  const response = await apiRequest("/assets", {
    method: "GET"
  });

  return unwrap(response);
}

export async function getAssetDetailAdminApi(id) {
  if (!id) {
    throw new Error("Asset ID tidak valid.");
  }

  const response = await apiRequest(`/assets/${id}`, {
    method: "GET"
  });

  return unwrap(response);
}

export async function createAssetAdminApi(payload) {
  const response = await apiRequest("/assets", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function updateAssetAdminApi(id, payload) {
  if (!id) {
    throw new Error("Asset ID tidak valid.");
  }

  const response = await apiRequest(`/assets/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function deleteAssetAdminApi(id) {
  if (!id) {
    throw new Error("Asset ID tidak valid.");
  }

  const response = await apiRequest(`/assets/${id}`, {
    method: "DELETE"
  });

  return unwrap(response);
}

export async function downloadEngineCurveTemplateAdminApi(vesselId) {
  if (!vesselId) {
    throw new Error("Vessel ID wajib dipilih.");
  }

  return downloadApiFile(
    `/engine-curves/download-template?vesselId=${vesselId}`,
    `engine_curve_template_vessel_${vesselId}.xlsx`
  );
}

export async function importEngineCurveAdminApi(payload) {
  const response = await apiRequest("/engine-curves/import", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function getAllEngineCurvesAdminApi() {
  const response = await apiRequest("/engine-curves", {
    method: "GET"
  });

  return unwrap(response);
}

export async function getEngineCurvesByVesselAdminApi(vesselId) {
  if (!vesselId) {
    throw new Error("Vessel ID tidak valid.");
  }

  const response = await apiRequest(`/engine-curves/vessels/${vesselId}`, {
    method: "GET"
  });

  return unwrap(response);
}

export async function getEngineCurveDetailAdminApi(curveId) {
  if (!curveId) {
    throw new Error("Curve ID tidak valid.");
  }

  const response = await apiRequest(`/engine-curves/curves/${curveId}`, {
    method: "GET"
  });

  return unwrap(response);
}

export async function deleteEngineCurveAdminApi(curveId) {
  if (!curveId) {
    throw new Error("Curve ID tidak valid.");
  }

  const response = await apiRequest(`/engine-curves/curves/${curveId}`, {
    method: "DELETE"
  });

  return unwrap(response);
}

export async function toggleEngineCurveActiveAdminApi(curveId, isActive) {
  if (!curveId) {
    throw new Error("Curve ID tidak valid.");
  }

  const response = await apiRequest(`/engine-curves/curves/${curveId}/toggle-active`, {
    method: "PUT",
    body: JSON.stringify({ isActive: Boolean(isActive) })
  });

  return unwrap(response);
}

export async function getReportingVesselsAdminApi({
  search = "",
  status = "all",
  autoReport = "all"
} = {}) {
  const params = new URLSearchParams();

  if (search) params.set("search", search);
  params.set("status", status || "all");
  params.set("autoReport", autoReport || "all");

  const response = await apiRequest(`/reporting/vessels?${params.toString()}`, {
    method: "GET"
  });

  return unwrap(response);
}

export async function saveAutoReportConfigAdminApi(vesselId, payload) {
  if (!vesselId) {
    throw new Error("Vessel ID tidak valid.");
  }

  const response = await apiRequest(`/reporting/auto-report-configs/${vesselId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function getReportingAssignableUsersAdminApi(
  vesselId,
  { page = 1, pageSize = 20 } = {}
) {
  if (!vesselId) {
    throw new Error("Vessel ID tidak valid.");
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });

  const response = await apiRequest(
    `/reporting/vessels/${vesselId}/assignable-users?${params.toString()}`,
    {
      method: "GET"
    }
  );

  return unwrap(response);
}

export async function downloadReportingDailyReportAdminApi(
  vesselId,
  { date, timezoneMode = "auto", timezoneOffset = "+00:00" }
) {
  if (!vesselId) {
    throw new Error("Vessel ID tidak valid.");
  }

  if (!date) {
    throw new Error("Tanggal report wajib diisi.");
  }

  const params = new URLSearchParams({
    date,
    timezoneMode,
    timezoneOffset
  });

  return downloadApiFile(
    `/reporting/vessels/${vesselId}/generate-report?${params.toString()}`,
    `Daily_Report_Vessel_${vesselId}_${date}.xlsx`
  );
}

export async function sendReportingDailyReportEmailAdminApi(vesselId, payload) {
  if (!vesselId) {
    throw new Error("Vessel ID tidak valid.");
  }

  const response = await apiRequest(`/reporting/vessels/${vesselId}/send-report`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function getAutoReportAuditLogsAdminApi() {
  const response = await apiRequest("/reporting/auto-report-audit-logs", {
    method: "GET"
  });

  return unwrap(response);
}

export async function exportAutoReportAuditLogsCsvAdminApi() {
  return downloadApiFile(
    "/reporting/auto-report-audit-logs/export-csv",
    "auto_report_audit_logs.csv"
  );
}

export async function getTelegramGroupsAdminApi({ page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });

  const response = await apiRequest(`/reporting/alarm/telegram-groups?${params.toString()}`, {
    method: "GET"
  });

  return unwrap(response);
}

export async function createTelegramGroupAdminApi(payload) {
  const response = await apiRequest("/reporting/alarm/telegram-groups", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function getTelegramGroupDetailAdminApi(id) {
  if (!id) {
    throw new Error("Telegram group ID tidak valid.");
  }

  const response = await apiRequest(`/reporting/alarm/telegram-groups/${id}`, {
    method: "GET"
  });

  return unwrap(response);
}

export async function updateTelegramGroupAdminApi(id, payload) {
  if (!id) {
    throw new Error("Telegram group ID tidak valid.");
  }

  const response = await apiRequest(`/reporting/alarm/telegram-groups/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function deleteTelegramGroupAdminApi(id) {
  if (!id) {
    throw new Error("Telegram group ID tidak valid.");
  }

  const response = await apiRequest(`/reporting/alarm/telegram-groups/${id}`, {
    method: "DELETE"
  });

  return unwrap(response);
}

export async function saveEngineHealthConfigAdminApi(vesselId, payload) {
  if (!vesselId) {
    throw new Error("Vessel ID tidak valid.");
  }

  const response = await apiRequest(`/reporting/alarm/engine-health-configs/${vesselId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  return unwrap(response);
}

export async function getGlobalAuditLogsAdminApi({
  userId = "",
  page = 1,
  pageSize = 20
} = {}) {
  const params = new URLSearchParams();

  if (userId) params.set("userId", String(userId));
  params.set("page", String(page || 1));
  params.set("pageSize", String(pageSize || 20));

  const response = await apiRequest(`/audit-logs?${params.toString()}`, {
    method: "GET"
  });

  return unwrap(response);
}

export async function exportGlobalAuditLogsCsvAdminApi({
  userId = "",
  startDate = "",
  endDate = ""
} = {}) {
  const params = new URLSearchParams();

  if (userId) params.set("userId", String(userId));
  if (startDate) params.set("startDate", String(startDate));
  if (endDate) params.set("endDate", String(endDate));

  const query = params.toString();

  return downloadApiFile(
    `/audit-logs/export-csv${query ? `?${query}` : ""}`,
    `audit_logs_${Date.now()}.csv`
  );
}

export async function getAllCompaniesAdminApi() {
	const response = await apiRequest('/companies', {
		method: 'GET'
	});

	return response?.data || response || [];
}

export async function syncCompaniesAdminApi() {
	return apiRequest('/companies/sync', {
		method: 'POST'
	});
}

export async function deleteCompanyAdminApi(id) {
	return apiRequest(`/companies/${id}`, {
		method: 'DELETE'
	});
}

export async function syncAllVesselsAdminApi() {
	return apiRequest('/vessels/sync/all', {
		method: 'POST'
	});
}