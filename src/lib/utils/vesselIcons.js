/** @type {Record<string, string>} */
const VESSEL_TYPE_ICON_URLS = {
	ahts: '/assets/vessel-icon/ahts.png',
	crewboat: '/assets/vessel-icon/crewboat.png',
	multicat: '/assets/vessel-icon/multicat.png',
	psv: '/assets/vessel-icon/psv.png',
	tugboat: '/assets/vessel-icon/tugboat.png',
	'utility boat': '/assets/vessel-icon/utility-boat.png',
	mpsv: '/assets/vessel-icon/mpsv.png',
	lct: '/assets/vessel-icon/lct.png',
	'crude oil tanker': '/assets/vessel-icon/crude-oil-tanker.png'
};

/** @type {Record<string, number>} */
const VESSEL_TYPE_ICON_SCALE = { 'crude oil tanker': 1.55 };

/** @param {any} type */
export function getVesselTypeIconUrl(type) {
	return (
		VESSEL_TYPE_ICON_URLS[
			String(type || '')
				.trim()
				.toLowerCase()
		] || '/assets/vessel.png'
	);
}

/** @param {any} type */
export function getVesselTypeIconScale(type) {
	return (
		VESSEL_TYPE_ICON_SCALE[
			String(type || '')
				.trim()
				.toLowerCase()
		] || 1
	);
}
