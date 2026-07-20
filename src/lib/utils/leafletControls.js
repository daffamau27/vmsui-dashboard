export function addLeafletZoomAndScale(leaflet, map, options = {}) {
	if (!leaflet || !map) return null;

	const position = options.position || 'topleft';
	const container = map.getContainer?.();
	container?.classList.add('vms-map-controls');

	const zoomControl = leaflet.control.zoom({
		position,
		zoomInTitle: options.zoomInTitle || 'Zoom in',
		zoomOutTitle: options.zoomOutTitle || 'Zoom out'
	});

	const scaleControl = createDualScaleControl(leaflet, {
		position,
		maxWidth: options.maxWidth || 132
	});

	zoomControl.addTo(map);
	scaleControl.addTo(map);

	return { zoomControl, scaleControl };
}

function createDualScaleControl(leaflet, options = {}) {
	return new (leaflet.Control.extend({
		options: {
			position: options.position || 'topleft'
		},

		onAdd(map) {
			this._map = map;
			this._maxWidth = options.maxWidth || 132;

			const container = leaflet.DomUtil.create(
				'div',
				'leaflet-control vms-scale-control vms-dual-scale-control'
			);
			const scale = createSharedScale(leaflet, container);

			this._container = container;
			this._scale = scale;

			leaflet.DomEvent.disableClickPropagation(container);
			leaflet.DomEvent.disableScrollPropagation(container);

			map.on('load move zoom moveend zoomend resize', this._update, this);
			this._update();

			return container;
		},

		onRemove(map) {
			map.off('load move zoom moveend zoomend resize', this._update, this);
		},

		_update() {
			if (!this._map || !this._scale) return;
			if (!this._map._loaded) {
				setSharedScale(this._scale, {
					metricLabel: '- km',
					nauticalLabel: '- NM',
					totalWidth: Math.round(this._maxWidth * 0.72),
					metricStart: 0,
					metricLabelLeft: Math.round(this._maxWidth * 0.36),
					nauticalStart: Math.round(this._maxWidth * 0.1),
					nauticalLabelLeft: Math.round(this._maxWidth * 0.41)
				});
				return;
			}

			const size = this._map.getSize?.();
			if (!size?.x || !size?.y) return;

			const y = size.y / 2;
			const maxWidth = getResponsiveMaxWidth(this._maxWidth, size.x);
			const maxMeters =
				this._map.distance(
					this._map.containerPointToLatLng([0, y]),
					this._map.containerPointToLatLng([maxWidth, y])
				) || 0;

			setSharedScale(this._scale, getSharedScale(maxMeters, maxWidth));
		}
	}))(options);
}

function createSharedScale(leaflet, container) {
	const ruler = leaflet.DomUtil.create('div', 'vms-scale-control__ruler', container);
	const metricLabel = leaflet.DomUtil.create(
		'span',
		'vms-scale-control__label vms-scale-control__label--metric',
		ruler
	);
	const bar = leaflet.DomUtil.create('span', 'vms-scale-control__bar', ruler);
	const metricTick = leaflet.DomUtil.create(
		'span',
		'vms-scale-control__tick vms-scale-control__tick--metric',
		bar
	);
	const nauticalTick = leaflet.DomUtil.create(
		'span',
		'vms-scale-control__tick vms-scale-control__tick--nautical',
		bar
	);
	const nauticalLabel = leaflet.DomUtil.create(
		'span',
		'vms-scale-control__label vms-scale-control__label--nautical',
		ruler
	);

	return { ruler, bar, metricLabel, metricTick, nauticalLabel, nauticalTick };
}

function setSharedScale(scaleElement, scale) {
	if (
		!scaleElement?.ruler ||
		!scaleElement?.bar ||
		!scaleElement?.metricLabel ||
		!scaleElement?.metricTick ||
		!scaleElement?.nauticalLabel ||
		!scaleElement?.nauticalTick
	) {
		return;
	}

	scaleElement.ruler.style.width = `${scale.totalWidth}px`;
	scaleElement.metricLabel.textContent = scale.metricLabel;
	scaleElement.nauticalLabel.textContent = scale.nauticalLabel;
	scaleElement.metricLabel.style.left = `${scale.metricLabelLeft}px`;
	scaleElement.nauticalLabel.style.left = `${scale.nauticalLabelLeft}px`;
	scaleElement.metricTick.style.left = `${scale.metricStart}px`;
	scaleElement.nauticalTick.style.left = `${scale.nauticalStart}px`;
	scaleElement.bar.setAttribute('aria-label', `${scale.metricLabel} / ${scale.nauticalLabel}`);
}

function getResponsiveMaxWidth(maxWidth, mapWidth) {
	if (!Number.isFinite(mapWidth) || mapWidth <= 0) return maxWidth;
	return Math.max(76, Math.min(maxWidth, Math.round(mapWidth * 0.28)));
}

function getSharedScale(maxMeters, maxWidth) {
	if (!Number.isFinite(maxMeters) || maxMeters <= 0) {
		return {
			metricLabel: '- km',
			nauticalLabel: '- NM',
			totalWidth: Math.round(maxWidth * 0.72),
			metricStart: 0,
			metricLabelLeft: Math.round(maxWidth * 0.36),
			nauticalStart: Math.round(maxWidth * 0.1),
			nauticalLabelLeft: Math.round(maxWidth * 0.41)
		};
	}

	const maxKm = maxMeters / 1000;
	const km = getRoundNumber(maxKm);
	const metricWidth = getScaleWidth(km / maxKm, maxWidth);

	const maxNauticalMiles = maxMeters / 1852;
	const nauticalMiles = getRoundNumber(maxNauticalMiles);
	const nauticalWidth = getScaleWidth(nauticalMiles / maxNauticalMiles, maxWidth);
	const totalWidth = Math.max(metricWidth, nauticalWidth);
	const metricStart = Math.max(0, totalWidth - metricWidth);
	const nauticalStart = Math.max(0, totalWidth - nauticalWidth);

	return {
		metricLabel: `${formatScaleNumber(km)} km`,
		nauticalLabel: `${formatScaleNumber(nauticalMiles)} NM`,
		totalWidth,
		metricStart,
		metricLabelLeft: metricStart + metricWidth / 2,
		nauticalStart,
		nauticalLabelLeft: nauticalStart + nauticalWidth / 2
	};
}

function getScaleWidth(ratio, maxWidth) {
	const width = Math.round(Math.max(0.25, Math.min(1, ratio)) * maxWidth);
	return Math.max(36, Math.min(maxWidth, width));
}

function getRoundNumber(value) {
	if (!Number.isFinite(value) || value <= 0) return 0;

	const pow10 = 10 ** Math.floor(Math.log10(value));
	const digit = value / pow10;
	const roundedDigit = digit >= 5 ? 5 : digit >= 3 ? 3 : digit >= 2 ? 2 : 1;
	return roundedDigit * pow10;
}

function formatScaleNumber(value) {
	if (!Number.isFinite(value)) return '-';
	if (value >= 100 || Number.isInteger(value)) return String(Math.round(value));
	if (value >= 10) return value.toFixed(1).replace(/\.0$/, '');
	return value.toFixed(2).replace(/\.?0+$/, '');
}
