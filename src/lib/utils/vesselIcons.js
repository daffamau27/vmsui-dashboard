/** @type {Record<string, string>} */
const VESSEL_TYPE_ICON_URLS = {
	ahts: '/assets/vessel-icon/ahts.png',
	'ahts-laden': '/assets/vessel-icon/ahts-laden.png',
	'ahts-ballast': '/assets/vessel-icon/ahts-ballast.png',
	crewboat: '/assets/vessel-icon/crewboat.png',
	multicat: '/assets/vessel-icon/multicat.png',
	psv: '/assets/vessel-icon/psv.png',
	tugboat: '/assets/vessel-icon/tugboat.png',
	'tugboat-laden': '/assets/vessel-icon/tugboat-laden.png',
	'tugboat-ballast': '/assets/vessel-icon/tugboat-ballast.png',
	'utility boat': '/assets/vessel-icon/utility-boat.png',
	mpsv: '/assets/vessel-icon/mpsv.png',
	lct: '/assets/vessel-icon/lct.png',
	'crude oil tanker': '/assets/vessel-icon/crude-oil-tanker.png'
};

/** @type {Record<string, number>} */
const VESSEL_TYPE_ICON_SCALE = { 'crude oil tanker': 1.35 };

// Anchor dikalibrasi di tugboat-laden.png: 93 px dari kanan, 166 px dari atas (172×782).
// tugboat-ballast adalah artwork sama diperbesar ×1.10 (189×865) → fraksi sama berlaku.
/** @type {{ x: number; y: number }} */
const TUG_ANCHOR = { x: 1/2, y: 1 / 5 }; // 93/172, 166/782

// Anchor dikalibrasi dari scan piksel ahts-laden.png (156x866): lambung kapal
// solid di y=49..351 (celah tali 352..431, tongkang 432..840) → tengah kapal ≈ y=200.
/** @type {{ x: number; y: number }} */
const AHTS_ANCHOR = { x: 1 / 2, y: 200 / 866 };

// tugboat-ballast/laden & ahts-ballast/laden: gambar memuat kapal + tongkang, jadi
// kotak ikon dibuat setinggi gambar penuh (aspect), kapal diperkecil agar sama lebar
// dengan tugboat.png / ahts.png, dan anchor ditarik ke titik kapal di ujung atas gambar.
/** @type {Record<string, { widthScale: number; aspect: number; anchor: { x: number; y: number } }>} */
const VESSEL_ICON_LAYOUT = {
	'tugboat-laden': { widthScale: 172 / 266, aspect: 782 / 172, anchor: TUG_ANCHOR },
	'tugboat-ballast': { widthScale: 189 / 266, aspect: 865 / 189, anchor: TUG_ANCHOR },
	// AHTS laden/ballast: komposisi sama dengan tugboat (kapal di atas + tongkang di bawah).
	// anchor y = tengah kapal AHTS di bagian atas gambar (scan piksel).
	'ahts-laden': { widthScale: 156 / 224, aspect: 866 / 156, anchor: AHTS_ANCHOR },
	'ahts-ballast': { widthScale: 126 / 224, aspect: 666 / 126, anchor: AHTS_ANCHOR }
};

/** @param {any} type */
function getVesselTypeKey(type) {
	// Normalize spacing around hyphens: 'Tugboat - Laden', 'Tugboat-Laden' → 'tugboat-laden'.
	return String(type || '')
		.trim()
		.toLowerCase()
		.replace(/\s*-\s*/g, '-');
}

/** @param {any} type */
export function getVesselTypeIconUrl(type) {
	return VESSEL_TYPE_ICON_URLS[getVesselTypeKey(type)] || '/assets/vessel.png';
}

/** @param {any} type */
export function getVesselTypeIconScale(type) {
	return VESSEL_TYPE_ICON_SCALE[getVesselTypeKey(type)] || 1;
}

/** @param {any} type */
export function getVesselIconLayout(type) {
	return VESSEL_ICON_LAYOUT[getVesselTypeKey(type)] || null;
}
