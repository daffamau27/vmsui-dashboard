import { VESSEL_MENUS } from '$lib/utils/appRoutes.js';

export function match(param) {
	return VESSEL_MENUS.includes(param);
}
