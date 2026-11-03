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
  timezoneOffset = "",
  columns = ""
}) {
  if (!vesselId) throw new Error("vesselId required.");
  if (!month) throw new Error("The reporting month must be filled in.");

  const query = buildQuery({
    vesselId,
    month,
    startDate,
    endDate,
    timezoneMode,
    timezoneOffset: timezoneMode === "manual" ? timezoneOffset : "",
    columns
  });

  const endpoint = `/monthly-reports/data?${query}`;
  const response = await apiRequest(endpoint, {
    method: "GET"
  });

  return response?.data || response;
}

export async function getMonthlyReportAvailableColumns({ vesselId, month = "" }) {
  if (!vesselId) throw new Error("vesselId required.");

  const query = buildQuery({ vesselId, month });

  const endpoint = `/monthly-reports/available-columns?${query}`;
  const response = await apiRequest(endpoint, {
    method: "GET"
  });

  return response?.data || response;
}

function getMonthlyReportExportUrl(format, {
  vesselId,
  month,
  startDate = "01",
  endDate = "",
  timezoneMode = "auto",
  timezoneOffset = "",
  columns = ""
}) {
  if (!vesselId) throw new Error("vesselId required.");
  if (!month) throw new Error("The reporting month must be filled in.");

  const query = buildQuery({
    vesselId,
    month,
    startDate,
    endDate,
    timezoneMode,
    timezoneOffset: timezoneMode === "manual" ? timezoneOffset : "",
    columns
  });

  return `/monthly-reports/export-${format}?${query}`;
}

export function getMonthlyReportExcelUrl(params) {
  return getMonthlyReportExportUrl("excel", params);
}

export function getMonthlyReportPdfUrl(params) {
  return getMonthlyReportExportUrl("pdf", params);
}
