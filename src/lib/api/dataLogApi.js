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

export async function getDataLogData({
  vesselId,
  start,
  end,
  timezoneMode = "auto",
  timezoneOffset = "",
  columns = ""
}) {
  if (!vesselId) throw new Error("vesselId wajib diisi.");
  if (!start) throw new Error("Waktu mulai wajib diisi.");
  if (!end) throw new Error("Waktu akhir wajib diisi.");

  const query = buildQuery({
    vesselId,
    start,
    end,
    timezoneMode,
    timezoneOffset: timezoneMode === "manual" ? timezoneOffset : "",
    columns
  });

  const response = await apiRequest(`/data-logs/data?${query}`, {
    method: "GET"
  });

  return response?.data || response;
}

export function getDataLogExcelUrl({
  vesselId,
  start,
  end,
  timezoneMode = "auto",
  timezoneOffset = "",
  columns = ""
}) {
  if (!vesselId) throw new Error("vesselId wajib diisi.");
  if (!start) throw new Error("Waktu mulai wajib diisi.");
  if (!end) throw new Error("Waktu akhir wajib diisi.");

  const query = buildQuery({
    vesselId,
    start,
    end,
    timezoneMode,
    timezoneOffset: timezoneMode === "manual" ? timezoneOffset : "",
    columns
  });

  return `/data-logs/export-excel?${query}`;
}