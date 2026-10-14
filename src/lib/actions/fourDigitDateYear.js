const DATE_BOUNDS = {
	date: { min: '0001-01-01', max: '9999-12-31' },
	'datetime-local': { min: '0001-01-01T00:00', max: '9999-12-31T23:59' },
	month: { min: '0001-01', max: '9999-12' },
	week: { min: '0001-W01', max: '9999-W52' }
};

export function normalizeDateInputYear(value) {
	if (typeof value !== 'string') return value;
	return value.replace(/^(\d{4})\d+(-)/, '$1$2');
}

export function fourDigitDateYear(input) {
	const bounds = DATE_BOUNDS[input.type];
	if (!bounds) return;

	const originalMin = input.getAttribute('min');
	const originalMax = input.getAttribute('max');
	if (!/^\d{4}-/.test(input.min) || input.min < bounds.min) input.min = bounds.min;
	if (!/^\d{4}-/.test(input.max) || input.max > bounds.max) input.max = bounds.max;
	const appliedMin = input.min;
	const appliedMax = input.max;

	function normalize(event) {
		const value = normalizeDateInputYear(input.value);
		if (value === input.value) return;
		input.value = value;
		if (event?.type !== 'input') {
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}

	input.addEventListener('input', normalize, true);
	input.addEventListener('change', normalize, true);
	normalize();

	return {
		destroy() {
			input.removeEventListener('input', normalize, true);
			input.removeEventListener('change', normalize, true);
			if (input.min === appliedMin) {
				if (originalMin === null) input.removeAttribute('min');
				else input.setAttribute('min', originalMin);
			}
			if (input.max === appliedMax) {
				if (originalMax === null) input.removeAttribute('max');
				else input.setAttribute('max', originalMax);
			}
		}
	};
}
