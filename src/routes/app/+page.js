import { redirect } from '@sveltejs/kit';
import { DEFAULT_APP_PATH } from '$lib/utils/appRoutes.js';

export function load({ url }) {
	redirect(307, DEFAULT_APP_PATH + url.search);
}
