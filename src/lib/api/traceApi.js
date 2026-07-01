import { apiRequest } from "$lib/api/authApi.js";

export async function getVesselTrace({
  vesselId,
  start,
  end,
  timezoneMode = "auto",
  timezoneOffset = ""
}) {
  if (!vesselId) {
    throw new Error("vesselId wajib diisi.");
  }

  if (!start || !end) {
    throw new Error("Start dan end wajib diisi.");
  }

  const params = new URLSearchParams({
    start,
    end,
    timezoneMode
  });

  if (timezoneOffset) {
    params.set("timezoneOffset", timezoneOffset);
  }

  const response = await apiRequest(
    `/trace/vessels/${vesselId}?${params.toString()}`,
    {
      method: "GET"
    }
  );

  return response?.data || response;
}

export async function getVesselCctvSnapshots({
  vesselId,
  cameraName = "",
  startTime,
  endTime,
  page = 1,
  pageSize = 12
}) {
  if (!vesselId) {
    throw new Error("vesselId wajib diisi.");
  }

  if (!startTime || !endTime) {
    throw new Error("Start time dan end time CCTV wajib diisi.");
  }

  const params = new URLSearchParams({
    start_time: startTime,
    end_time: endTime,
    page: String(page),
    pageSize: String(pageSize)
  });

  if (cameraName) {
    params.set("camera_name", cameraName);
  }

  const response = await apiRequest(
    `/cctv/vessels/${vesselId}/snapshots?${params.toString()}`,
    {
      method: "GET"
    }
  );

  return response?.data || response;
}
