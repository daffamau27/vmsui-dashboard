export const MAP_SOURCE_STORAGE_KEY = 'vms-map-source';

export const MAP_SOURCE_IDS = {
	SEMAR: 'semar',
	DEFAULT: 'default'
};

export const MAP_SOURCES = {
	[MAP_SOURCE_IDS.SEMAR]: {
		id: MAP_SOURCE_IDS.SEMAR,
		label: 'SeMAR',
		url: '/map-tiles/{z}/{x}/{y}.png',
		options: {
			minZoom: 2,
			maxZoom: 18,
			maxNativeZoom: 14,
			tileSize: 256,
			zoomOffset: 0,
			detectRetina: false,
			keepBuffer: 3,
			attribution: '&copy; SeMAR map tiles'
		}
	},
	[MAP_SOURCE_IDS.DEFAULT]: {
		id: MAP_SOURCE_IDS.DEFAULT,
		label: 'Default',
		url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
		options: {
			minZoom: 2,
			maxZoom: 19,
			detectRetina: false,
			attribution:
				'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom'
		}
	}
};

export const DEFAULT_MAP_SOURCE_ID = MAP_SOURCE_IDS.SEMAR;

export const VMS_TILE_URL = MAP_SOURCES[DEFAULT_MAP_SOURCE_ID].url;
export const VMS_TILE_ATTRIBUTION = MAP_SOURCES[DEFAULT_MAP_SOURCE_ID].options.attribution;
export const VMS_TILE_OPTIONS = MAP_SOURCES[DEFAULT_MAP_SOURCE_ID].options;

export function getMapSourceId(sourceId) {
	if (isValidMapSourceId(sourceId)) return sourceId;

	if (typeof window !== 'undefined') {
		const stored = window.localStorage?.getItem(MAP_SOURCE_STORAGE_KEY);
		if (isValidMapSourceId(stored)) return stored;
	}

	return DEFAULT_MAP_SOURCE_ID;
}

export function setStoredMapSourceId(sourceId) {
	const nextSourceId = getMapSourceId(sourceId);

	if (typeof window !== 'undefined') {
		window.localStorage?.setItem(MAP_SOURCE_STORAGE_KEY, nextSourceId);
		window.dispatchEvent?.(
			new CustomEvent('vms-map-source-change', {
				detail: { sourceId: nextSourceId }
			})
		);
	}

	return nextSourceId;
}

export function getMapTileConfig(sourceId) {
	const nextSourceId = getMapSourceId(sourceId);
	return MAP_SOURCES[nextSourceId] || MAP_SOURCES[DEFAULT_MAP_SOURCE_ID];
}

export function addMapTileLayer(leaflet, map, sourceId) {
	if (!leaflet || !map) return null;

	const source = getMapTileConfig(sourceId);
	const layer = leaflet.tileLayer(source.url, source.options).addTo(map);

	layer.bringToBack?.();
	map._vmsBaseTileLayer = layer;
	map._vmsMapSourceId = source.id;

	return layer;
}

export function switchMapTileLayer(leaflet, map, sourceId) {
	if (!leaflet || !map) return null;

	const source = getMapTileConfig(sourceId);
	if (map._vmsMapSourceId === source.id && map._vmsBaseTileLayer) {
		return map._vmsBaseTileLayer;
	}

	if (map._vmsBaseTileLayer) {
		map.removeLayer(map._vmsBaseTileLayer);
	}

	return addMapTileLayer(leaflet, map, source.id);
}

function isValidMapSourceId(sourceId) {
	return Boolean(sourceId && MAP_SOURCES[sourceId]);
}
