export const VMS_TILE_URL =
	'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

export const VMS_TILE_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const VMS_TILE_OPTIONS = {
	maxZoom: 20,
	subdomains: 'abcd',
	detectRetina: true,
	attribution: VMS_TILE_ATTRIBUTION
};
