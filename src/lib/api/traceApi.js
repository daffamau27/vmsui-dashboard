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
    `/dashboard/vessels/${vesselId}/trace?${params.toString()}`,
    {
      method: "GET"
    }
  );

  return response?.data || response;
}