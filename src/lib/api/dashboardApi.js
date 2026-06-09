import { apiRequest } from "$lib/api/authApi.js";

export async function getVesselDashboard(vesselId) {
  if (!vesselId) {
    throw new Error("vesselId wajib diisi.");
  }

  const response = await apiRequest(`/dashboard/vessels/${vesselId}`, {
    method: "GET"
  });

  return response?.data || response;
}