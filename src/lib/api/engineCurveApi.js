import { apiRequest } from "$lib/api/authApi.js";

function normalizeCurveType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeEngineCurve(curve) {
  return {
    curveId: curve?.curve_id || curve?.curveId || "",
    curveType: normalizeCurveType(curve?.curve_type || curve?.curveType),
    curveName: curve?.curve_name || curve?.curveName || "-",
    isActive: Boolean(curve?.is_active ?? curve?.isActive),
    engines: Array.isArray(curve?.engines) ? curve.engines : [],
    meta: curve?.meta || null,
    raw: curve
  };
}

export async function getEngineCurvesForVessel(vesselId) {
  if (!vesselId) {
    throw new Error("vesselId is required.");
  }

  const response = await apiRequest(`/engine-curves/vessels/${vesselId}`, {
    method: "GET"
  });

  const data = response?.data || response || {};
  const curves = Array.isArray(data?.curves) ? data.curves : [];

  return {
    vesselId: data?.vessel_id || data?.vesselId || vesselId,
    vesselName: data?.vessel_name || data?.vesselName || "-",
    curves: curves.map(normalizeEngineCurve),
    raw: data
  };
}