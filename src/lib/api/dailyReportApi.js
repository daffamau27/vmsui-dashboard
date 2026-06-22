import { apiRequest } from "$lib/api/authApi.js";

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });

  return query.toString();
}

export async function getDailyReportData({
  vesselId,
  date,
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  if (!vesselId) throw new Error("vesselId wajib diisi.");
  if (!date) throw new Error("Tanggal laporan wajib diisi.");

  const query = buildQuery({
    vesselId,
    date,
    timezoneMode,
    timezoneOffset: timezoneMode === "manual" ? timezoneOffset : ""
  });

  const response = await apiRequest(`/daily-reports/data?${query}`, {
    method: "GET"
  });

  return response?.data || response;
}

export async function recalculateDailyReport({
  vesselId,
  date,
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  if (!vesselId) throw new Error("vesselId wajib diisi.");
  if (!date) throw new Error("Tanggal laporan wajib diisi.");

  const response = await apiRequest("/daily-reports/recalculate", {
    method: "POST",
    body: JSON.stringify({
      vesselId,
      date,
      timezoneMode,
      timezoneOffset: timezoneMode === "manual" ? timezoneOffset : ""
    })
  });

  return response?.data || response;
}

export async function recalculateDailySummary({
  vesselId,
  date,
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  if (!vesselId) throw new Error("vesselId wajib diisi.");
  if (!date) throw new Error("Tanggal laporan wajib diisi.");

  const response = await apiRequest("/daily-reports/recalculate-summary", {
    method: "POST",
    body: JSON.stringify({
      vesselId,
      date,
      timezoneMode,
      timezoneOffset: timezoneMode === "manual" ? timezoneOffset : ""
    })
  });

  return response?.data || response;
}

export function getDailyReportExcelUrl({
  vesselId,
  date,
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  if (!vesselId) throw new Error("vesselId wajib diisi.");
  if (!date) throw new Error("Tanggal laporan wajib diisi.");

  const query = buildQuery({
    vesselId,
    date,
    timezoneMode,
    timezoneOffset: timezoneMode === "manual" ? timezoneOffset : ""
  });

  return `/daily-reports/export-excel?${query}`;
}

export function getDailyReportPdfUrl({
	vesselId,
	date,
	timezoneMode = 'auto',
	timezoneOffset
}) {
	const params = new URLSearchParams();

	params.set('vesselId', vesselId);
	params.set('date', date);
	params.set('timezoneMode', timezoneMode || 'auto');

	if (timezoneMode === 'manual' && timezoneOffset) {
		params.set('timezoneOffset', timezoneOffset);
	}

	return `/daily-reports/export-pdf?${params.toString()}`;
}