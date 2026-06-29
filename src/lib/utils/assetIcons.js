const ASSET_TYPE_ICON_MAP = {
	anchor: 'anchor.png',
	buoy: 'buoy.png',
	dock: 'jetty.png',
	fso: 'fso.png',
	galangan: 'galangan.png',
	jetty: 'jetty.png',
	mess: 'mess.png',
	office: 'office.png',
	platform: 'whp.png',
	rig: 'rig.png',
	shipyard: 'shipyard.png',
	whp: 'whp.png'
};

export function getAssetTypeValue(assetOrType) {
	if (typeof assetOrType === 'string') return assetOrType;

	return (
		assetOrType?.assetType ??
		assetOrType?.asset_type ??
		assetOrType?.type ??
		assetOrType?.category ??
		assetOrType?.raw?.assetType ??
		assetOrType?.raw?.asset_type ??
		assetOrType?.raw?.type ??
		''
	);
}

export function normalizeAssetType(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

export function getAssetIconUrl(assetOrType) {
	const type = normalizeAssetType(getAssetTypeValue(assetOrType));
	const filename = ASSET_TYPE_ICON_MAP[type] || 'whp.png';

	return `/assets/${filename}`;
}

export function getAssetTypeLabel(assetOrType) {
	const type = normalizeAssetType(getAssetTypeValue(assetOrType));

	if (!type) return 'Asset';
	if (['fso', 'whp'].includes(type)) return type.toUpperCase();

	return type.charAt(0).toUpperCase() + type.slice(1);
}
