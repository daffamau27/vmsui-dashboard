import { writable } from "svelte/store";

export const selectedVesselId = writable(null);
export const selectedVesselInfo = writable(null);

export function setSelectedVessel(vessel) {
  if (!vessel) return;

  const vesselId = vessel.vesselId || vessel.id;

  selectedVesselId.set(vesselId);
  selectedVesselInfo.set(vessel);

  localStorage.setItem("selectedVesselId", String(vesselId));
  localStorage.setItem("selectedVesselInfo", JSON.stringify(vessel));

  console.log("[SELECTED_VESSEL_SET]", vessel);
}

export function restoreSelectedVessel() {
  const id = localStorage.getItem("selectedVesselId");
  const info = localStorage.getItem("selectedVesselInfo");

  if (id) {
    selectedVesselId.set(Number(id));
  }

  if (info) {
    try {
      selectedVesselInfo.set(JSON.parse(info));
    } catch {
      selectedVesselInfo.set(null);
    }
  }
}

export function clearSelectedVessel() {
  selectedVesselId.set(null);
  selectedVesselInfo.set(null);

  localStorage.removeItem("selectedVesselId");
  localStorage.removeItem("selectedVesselInfo");
}