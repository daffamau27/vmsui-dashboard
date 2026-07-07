const ZONE_STYLE_PALETTE = [
	{ color: '#38bdf8', fillColor: '#0ea5e9' },
	{ color: '#f59e0b', fillColor: '#f97316' },
	{ color: '#a78bfa', fillColor: '#8b5cf6' },
	{ color: '#22c55e', fillColor: '#16a34a' },
	{ color: '#fb7185', fillColor: '#e11d48' },
	{ color: '#2dd4bf', fillColor: '#14b8a6' }
];

function toNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function normalizeZoneCoordinatePair(value) {
	if (Array.isArray(value)) {
		const lat = toNumber(value[0]);
		const lng = toNumber(value[1]);
		return lat === null || lng === null ? null : [lat, lng];
	}

	const lat = toNumber(value?.latitude ?? value?.lat);
	const lng = toNumber(value?.longitude ?? value?.lng ?? value?.lon);

	return lat === null || lng === null ? null : [lat, lng];
}

export function isZoneAsset(asset = {}) {
	const type = String(asset?.assetType ?? asset?.type ?? '').trim().toLowerCase();
	const coordinates = asset?.coordinates ?? asset?.polygon ?? asset?.boundary;

	return type === 'zone' || (Array.isArray(coordinates) && coordinates.length >= 3);
}

export function normalizeMapZonesFromAssets(assets = []) {
	return (Array.isArray(assets) ? assets : [])
		.filter(isZoneAsset)
		.map((asset, index) => {
			const coordinates = (asset?.coordinates ?? asset?.polygon ?? asset?.boundary ?? [])
				.map(normalizeZoneCoordinatePair)
				.filter(Boolean);

			if (coordinates.length < 3) return null;

			const style = ZONE_STYLE_PALETTE[index % ZONE_STYLE_PALETTE.length];
			const id = asset?.id ?? asset?.assetId ?? `zone-${index + 1}`;
			const name =
				asset?.assetName ||
				asset?.name ||
				String(asset?.assetId || `Zone ${index + 1}`)
					.replace(/[_-]+/g, ' ')
					.replace(/\b\w/g, (char) => char.toUpperCase());

			return {
				id,
				key: String(asset?.assetId ?? id),
				name,
				assetId: asset?.assetId ?? id,
				color: asset?.color || style.color,
				fillColor: asset?.fillColor || asset?.fill_color || style.fillColor,
				coordinates,
				raw: asset
			};
		})
		.filter(Boolean);
}

export function createZonePopupHtml(zone) {
	return `
		<div class="vms-zone-popup">
			<strong>${zone.name}</strong>
			<span>${zone.coordinates.length} boundary points</span>
		</div>
	`;
}

export function addMapZonesToLeafletMap(leaflet, map, zones = [], options = {}) {
	if (!leaflet || !map) return null;

	const paneName = options.paneName || 'vmsZonePane';

	if (!map.getPane(paneName)) {
		map.createPane(paneName);
		map.getPane(paneName).style.zIndex = String(options.zIndex || 360);
		map.getPane(paneName).style.pointerEvents = 'auto';
	}

	const group = leaflet.layerGroup().addTo(map);

	(Array.isArray(zones) ? zones : []).forEach((zone) => {
		if (!Array.isArray(zone?.coordinates) || zone.coordinates.length < 3) return;

		const polygon = leaflet
			.polygon(zone.coordinates, {
				pane: paneName,
				color: zone.color,
				weight: options.weight ?? 2,
				opacity: options.opacity ?? 0.95,
				fill: true,
				fillColor: zone.fillColor,
				fillOpacity: options.fillOpacity ?? 0.14,
				dashArray: options.dashArray || '8 8',
				className: `vms-map-zone vms-map-zone-${String(zone.key || zone.id || '').toLowerCase()}`
			})
			.bindTooltip(zone.name, {
				sticky: true,
				direction: 'top',
				className: 'vms-zone-tooltip'
			})
			.bindPopup(createZonePopupHtml(zone), {
				closeButton: true,
				autoPan: true,
				maxWidth: 220,
				className: 'vms-zone-popup-wrapper'
			});

		polygon.addTo(group);
	});

	return group;
}
