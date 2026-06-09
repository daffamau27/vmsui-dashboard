import { writable } from "svelte/store";

export const activeMenu = writable("fleet-view");

export function setActiveMenu(menu) {
  activeMenu.set(menu);
}