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