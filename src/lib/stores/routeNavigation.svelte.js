import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { toStore } from 'svelte/store';
import { APP_MENUS, VESSEL_MENUS, getAppPath, getVesselPath, parseAppPath } from '$lib/utils/appRoutes.js';

let lastVesselMenu = $state('dashboard');

function currentRoute() {
	return browser ? parseAppPath(page.url.pathname) : null;
}

// The URL is the source of truth, including browser Back/Forward and direct links.
export const activeMenu = toStore(() => currentRoute()?.menu || 'fleet-view');
export const activeVesselMenu = toStore(() => currentRoute()?.vesselMenu || lastVesselMenu);

export function rememberVesselRoute(pathname) {
	const route = parseAppPath(pathname);
	if (route?.vesselMenu) lastVesselMenu = route.vesselMenu;
}

export function getMenuHref(menu) {
	return getAppPath(menu, currentRoute()?.vesselMenu || lastVesselMenu);
}

function navigate(path, options = {}) {
	if (!browser || page.url.pathname + page.url.search + page.url.hash === path) return;
	return goto(path, { noScroll: true, keepFocus: true, ...options });
}

export function setActiveMenu(menu, options = {}) {
	if (!APP_MENUS.includes(menu)) return;
	return navigate(getMenuHref(menu), options);
}

export function setActiveVesselMenu(menu, options = {}) {
	if (!VESSEL_MENUS.includes(menu)) return;
	return navigate(getVesselPath(menu), options);
}
