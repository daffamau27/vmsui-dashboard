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
  params.set("timezoneOffset", timezoneOffset || "+07:00");

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