export const DEFAULT_APP_PATH = '/fleet-view';

const appPermissions = {
	profile: null,
	administrator: null,
	'fleet-view': 'access_fleet_view',
	vessel: null,
	'all-vessel-summary': 'access_all_vessel_summary',
	'voyage-plans': 'access_voyage_plan_fleet',
	alarm: 'access_alarm'
};

export const APP_MENUS = Object.keys(appPermissions);
export const VESSEL_MENUS = [
	'dashboard', 'daily-report', 'monthly-report', 'periodical-report',
	'voyage-plan', 'trace', 'data-log', 'fuel-management', 'single-line-diagram'
];

/** Only known routes are accepted, including for post-login redirects. */
export function parseAppPath(pathname) {
	const parts = String(pathname || '').replace(/\/$/, '').split('/');
	if (parts[0] !== '' || !APP_MENUS.includes(parts[1])) return null;
	const menu = parts[1];
	if (menu === 'vessel') {
		const vesselMenu = parts[2] || 'dashboard';
		return parts.length <= 3 && VESSEL_MENUS.includes(vesselMenu)
			? { menu, vesselMenu }
			: null;
	}
	return parts.length === 2 ? { menu, vesselMenu: null } : null;
}

export function getVesselPath(menu = 'dashboard') {
	if (!VESSEL_MENUS.includes(menu)) return '/vessel';
	return menu === 'dashboard' ? '/vessel' : `/vessel/${menu}`;
}

export function getAppPath(menu, vesselMenu = 'dashboard') {
	if (!APP_MENUS.includes(menu)) return DEFAULT_APP_PATH;
	return menu === 'vessel' ? getVesselPath(vesselMenu) : `/${menu}`;
}

export function getPostLoginPath(value) {
	if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
		return DEFAULT_APP_PATH;
	}
	try {
		const url = new URL(value, 'https://vms.invalid');
		if (url.origin !== 'https://vms.invalid') return DEFAULT_APP_PATH;
		if (url.pathname === '/app') return DEFAULT_APP_PATH + url.search + url.hash;
		return parseAppPath(url.pathname)
			? url.pathname + url.search + url.hash
			: DEFAULT_APP_PATH;
	} catch {
		return DEFAULT_APP_PATH;
	}
}

export function canAccessAppMenu(menu, user) {
	if (!APP_MENUS.includes(menu)) return false;
	if (menu === 'profile' || menu === 'vessel') return true;
	if (!user) return false;
	const mode = (value) => String(value || 'selected').toLowerCase();
	if (menu === 'administrator') {
		return mode(user.assetAccess?.mode) === 'all' &&
			mode(user.vesselAccess?.mode) === 'all' &&
			mode(user.permissionAccess?.mode) === 'all';
	}
	if (mode(user.permissionAccess?.mode) === 'all') return true;
	const access = user.permissionAccess || {};
	const permissions = Array.isArray(access.permissions) ? access.permissions
		: Array.isArray(access.details) ? access.details : [];
	return permissions.some((item) => {
		const key = typeof item === 'string' ? item
			: item?.key || item?.permissionKey || item?.name || item?.code || item?.permission;
		return key === appPermissions[menu];
	});
}
