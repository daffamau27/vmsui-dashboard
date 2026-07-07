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
    startTime,
    endTime,
    page: String(page),
    pageSize: String(pageSize)
  });

  if (cameraName) {
    params.set("camera_name", cameraName);
  }

  const endpoint = `/cctv/vessels/${vesselId}/snapshots?${params.toString()}`;

  console.log("[CCTV_RANGE_SNAPSHOTS_REQUEST]", {
    vesselId,
    cameraName,
    startTime,
    endTime,
    page,
    pageSize,
    endpoint
  });

  let response;

  try {
    response = await apiRequest(endpoint, {
      method: "GET"
    });
  } catch (error) {
    console.error("[CCTV_RANGE_SNAPSHOTS_ERROR]", {
      vesselId,
      cameraName,
      startTime,
      endTime,
      page,
      pageSize,
      endpoint,
      status: error?.status,
      data: error?.data,
      message: error?.message,
      error
    });

    throw error;
  }

  console.log("[CCTV_RANGE_SNAPSHOTS_RESPONSE]", {
    vesselId,
    cameraName,
    startTime,
    endTime,
    page,
    pageSize,
    response
  });

  return response?.data || response;
}
