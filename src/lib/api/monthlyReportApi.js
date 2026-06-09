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

export async function getMonthlyReportData({
  vesselId,
  month,
  startDate = "01",
  endDate = "",
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  if (!vesselId) throw new Error("vesselId wajib diisi.");
  if (!month) throw new Error("Bulan laporan wajib diisi.");

  const query = buildQuery({
    vesselId,
    month,
    startDate,
    endDate,
    timezoneMode,
    timezoneOffset: timezoneMode === "manual" ? timezoneOffset : ""
  });

  const response = await apiRequest(`/monthly-reports/data?${query}`, {
    method: "GET"
  });

  return response?.data || response;
}

export function getMonthlyReportExcelUrl({
  vesselId,
  month,
  startDate = "01",
  endDate = "",
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  if (!vesselId) throw new Error("vesselId wajib diisi.");
  if (!month) throw new Error("Bulan laporan wajib diisi.");

  const query = buildQuery({
    vesselId,
    month,
    startDate,
    endDate,
    timezoneMode,
    timezoneOffset: timezoneMode === "manual" ? timezoneOffset : ""
  });

  return `/monthly-reports/export-excel?${query}`;
}