import { apiRequest } from "$lib/api/authApi.js";

export async function getVesselDashboard(vesselId) {
  if (!vesselId) {
    throw new Error("vesselId required.");
  }

  const response = await apiRequest(`/dashboard/vessels/${vesselId}`, {
    method: "GET"
  });

  return response?.data || response;
}

export async function getLatestCctvSnapshots(vesselId, cameraName = "") {
  if (!vesselId) {
    throw new Error("vesselId required.");
  }

  const params = new URLSearchParams();

  if (cameraName) {
    params.set("camera_name", cameraName);
  }

  const query = params.toString();
  const response = await apiRequest(
    `/cctv/vessels/${vesselId}/snapshots/latest${query ? `?${query}` : ""}`,
    {
      method: "GET"
    }
  );

  console.log("[CCTV_LATEST_SNAPSHOTS_RESPONSE]", {
    vesselId,
    cameraName,
    response
  });

  return response?.data || response || [];
}
