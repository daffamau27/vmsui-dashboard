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
  if (!vesselId) throw new Error("vesselId is required..");
  if (!start) throw new Error("Start time must be filled in.");
  if (!end) throw new Error("End time must be filled in.");

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
  if (!vesselId) throw new Error("vesselId must be filled in.");
  if (!start) throw new Error("Start time must be filled in.");
  if (!end) throw new Error("End time must be filled in.");

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