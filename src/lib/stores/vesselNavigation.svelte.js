import { writable } from "svelte/store";

export const activeVesselMenu = writable("dashboard");

export function setActiveVesselMenu(menu) {
  activeVesselMenu.set(menu);
}