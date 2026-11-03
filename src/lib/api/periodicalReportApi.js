import { apiRequest } from "$lib/api/authApi.js";

function buildPeriodicalQuery({
  vesselId,
  start,
  end,
  timezoneMode = "auto",
  timezoneOffset = "+07:00"
}) {
  const params = new URLSearchParams();

  params.set("vesselId", vesselId);
  params.set("start", start);
  params.set("end", end);
  params.set("timezoneMode", timezoneMode || "auto");

  if (timezoneMode === "manual" && timezoneOffset) {
    params.set("timezoneOffset", timezoneOffset);
  }

  return params.toString();
}

export async function getPeriodicalReportData({
  vesselId,
  start,
  end,
  timezoneMode = "auto",
  timezoneOffset = "+07:00"
}) {
  const query = buildPeriodicalQuery({
    vesselId,
    start,
    end,
    timezoneMode,
    timezoneOffset
  });

  return apiRequest(`/periodical-reports/data?${query}`, {
    method: "GET"
  });
}

/**
 * Catatan:
 * Endpoint Excel periodical belum Bapak berikan.
 * Kalau nanti backend menyediakan endpoint export, tinggal ganti path di bawah.
 */
export function getPeriodicalReportExcelUrl({
  vesselId,
  start,
  end,
  timezoneMode = "auto",
  timezoneOffset = "+07:00"
}) {
  const query = buildPeriodicalQuery({
    vesselId,
    start,
    end,
    timezoneMode,
    timezoneOffset
  });

  return `/periodical-reports/export-excel?${query}`;
}

export function getPeriodicalReportPdfUrl(params) {
  if (!params?.vesselId) throw new Error("vesselId required.");
  if (!params.start || !params.end) throw new Error("Start and End are required.");

  const query = buildPeriodicalQuery(params);
  return `/periodical-reports/export-pdf?${query}`;
}
