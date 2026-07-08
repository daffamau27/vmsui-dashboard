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

	const scaleControl = createSwitchableScaleControl(leaflet, {
		position,
		maxWidth: options.maxWidth || 112,
		defaultUnit: options.defaultUnit || 'metric'
	});

	zoomControl.addTo(map);
	scaleControl.addTo(map);

	return { zoomControl, scaleControl };
}

const SCALE_UNITS = ['metric', 'nautical', 'imperial'];
const SCALE_UNIT_LABELS = {
	metric: 'KM',
	nautical: 'NM',
	imperial: 'MI'
};
const SCALE_UNIT_STORAGE_KEY = 'vms-map-scale-unit';

function createSwitchableScaleControl(leaflet, options = {}) {
	return new (leaflet.Control.extend({
		options: {
			position: options.position || 'topleft'
		},

		onAdd(map) {
			this._map = map;
			this._maxWidth = options.maxWidth || 112;
			this._unit = getInitialScaleUnit(options.defaultUnit || 'metric');

			const container = leaflet.DomUtil.create('div', 'leaflet-control vms-scale-control');
			const bar = leaflet.DomUtil.create('div', 'vms-scale-control__bar', container);
			const label = leaflet.DomUtil.create('span', 'vms-scale-control__label', bar);
			const unitSelect = leaflet.DomUtil.create('select', 'vms-scale-control__unit', container);
			unitSelect.title = 'Change scale unit';
			unitSelect.setAttribute('aria-label', 'Change scale unit');
			unitSelect.innerHTML = `
				<option value="metric">KM</option>
				<option value="nautical">NM</option>
				<option value="imperial">MI</option>
			`;
			unitSelect.value = this._unit;

			this._container = container;
			this._bar = bar;
			this._label = label;
			this._unitSelect = unitSelect;

			leaflet.DomEvent.disableClickPropagation(container);
			leaflet.DomEvent.disableScrollPropagation(container);
			leaflet.DomEvent.on(unitSelect, 'change', this._handleUnitChange, this);

			map.on('load moveend zoomend resize', this._update, this);
			this._update();

			return container;
		},

		onRemove(map) {
			map.off('load moveend zoomend resize', this._update, this);
			if (this._unitSelect) {
				leaflet.DomEvent.off(this._unitSelect, 'change', this._handleUnitChange, this);
			}
		},

		_handleUnitChange(event) {
			leaflet.DomEvent.stop(event);
			const nextUnit = event?.target?.value;
			this._unit = SCALE_UNITS.includes(nextUnit) ? nextUnit : 'metric';
			saveScaleUnit(this._unit);
			this._update();
		},

		_update() {
			if (!this._map || !this._label || !this._bar || !this._unitSelect) return;
			if (!this._map._loaded) {
				this._label.textContent = 'Bar = -';
				this._bar.style.width = `${Math.round(this._maxWidth * 0.72)}px`;
				this._unitSelect.value = this._unit;
				return;
			}

			const size = this._map.getSize?.();
			if (!size?.x || !size?.y) return;

			const y = size.y / 2;
			const maxMeters =
				this._map.distance(
					this._map.containerPointToLatLng([0, y]),
					this._map.containerPointToLatLng([this._maxWidth, y])
				) || 0;

			const scale = getScaleForUnit(maxMeters, this._unit, this._maxWidth);
			this._label.textContent = scale.label;
			this._bar.style.width = `${scale.width}px`;
			this._unitSelect.value = this._unit;
		}
	}))(options);
}

function getInitialScaleUnit(defaultUnit) {
	try {
		const stored = window?.localStorage?.getItem(SCALE_UNIT_STORAGE_KEY);
		if (SCALE_UNITS.includes(stored)) return stored;
	} catch {
		// Ignore storage access errors; fallback is enough.
	}

	return SCALE_UNITS.includes(defaultUnit) ? defaultUnit : 'metric';
}

function saveScaleUnit(unit) {
	try {
		window?.localStorage?.setItem(SCALE_UNIT_STORAGE_KEY, unit);
	} catch {
		// Ignore storage access errors.
	}
}

function getScaleForUnit(maxMeters, unit, maxWidth) {
	if (!Number.isFinite(maxMeters) || maxMeters <= 0) {
		return { label: 'Bar = -', width: Math.round(maxWidth * 0.72) };
	}

	if (unit === 'nautical') {
		const maxNm = maxMeters / 1852;
		const nm = getRoundNumber(maxNm);
		return {
			label: `Bar = ${formatScaleNumber(nm)} NM`,
			width: getScaleWidth((nm * 1852) / maxMeters, maxWidth)
		};
	}

	if (unit === 'imperial') {
		const maxFeet = maxMeters * 3.280839895;
		if (maxFeet >= 5280) {
			const miles = getRoundNumber(maxFeet / 5280);
			return {
				label: `Bar = ${formatScaleNumber(miles)} mi`,
				width: getScaleWidth((miles * 1609.344) / maxMeters, maxWidth)
			};
		}

		const feet = getRoundNumber(maxFeet);
		return {
			label: `Bar = ${formatScaleNumber(feet)} ft`,
			width: getScaleWidth((feet * 0.3048) / maxMeters, maxWidth)
		};
	}

	const meters = getRoundNumber(maxMeters);
	if (meters >= 1000) {
		return {
			label: `Bar = ${formatScaleNumber(meters / 1000)} km`,
			width: getScaleWidth(meters / maxMeters, maxWidth)
		};
	}

	return {
		label: `Bar = ${formatScaleNumber(meters)} m`,
		width: getScaleWidth(meters / maxMeters, maxWidth)
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
