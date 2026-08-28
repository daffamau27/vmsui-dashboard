const alphaCollator = new Intl.Collator('en', {
	numeric: true,
	sensitivity: 'base',
	ignorePunctuation: true
});

function normalizeText(value) {
	return String(value ?? '').trim();
}

export function compareAlphaValue(left, right) {
	const a = normalizeText(left);
	const b = normalizeText(right);

	if (!a && !b) return 0;
	if (!a) return 1;
	if (!b) return -1;

	return alphaCollator.compare(a, b);
}

export function sortByAlpha(items = [], ...getters) {
	const rows = Array.isArray(items) ? [...items] : [];
	const accessors = getters.length ? getters : [(item) => item];

	return rows.sort((left, right) => {
		for (const getter of accessors) {
			const result = compareAlphaValue(getter?.(left), getter?.(right));
			if (result !== 0) return result;
		}

		return 0;
	});
}

export function matchesSearch(keyword = '', values = []) {
	const query = normalizeText(keyword).toLowerCase();
	if (!query) return true;

	return values
		.filter((value) => value !== null && value !== undefined && value !== '')
		.some((value) => normalizeText(value).toLowerCase().includes(query));
}
