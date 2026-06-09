import { getDataLogData, getDataLogExcelUrl } from "$lib/api/dataLogApi.js";

export async function getPeriodicalReportData({
  vesselId,
  start,
  end,
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  return getDataLogData({
    vesselId,
    start,
    end,
    timezoneMode,
    timezoneOffset,
    columns: ""
  });
}

export function getPeriodicalReportExcelUrl({
  vesselId,
  start,
  end,
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  return getDataLogExcelUrl({
    vesselId,
    start,
    end,
    timezoneMode,
    timezoneOffset,
    columns: ""
  });
}