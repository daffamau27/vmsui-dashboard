import { APP_MENUS } from '$lib/utils/appRoutes.js';

export function match(param) {
	return param !== 'vessel' && APP_MENUS.includes(param);
}
