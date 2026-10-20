const FUEL_SOURCE_PRIORITY = ['ems_external', 'ems_internal', 'fms', 'ecu'];

function normalizeEngineName(value) {
	return String(value || '')
		.replace(/_/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toUpperCase();
}

function getEngineName(row) {
	return String(row?.engine_name || row?.engineName || '').trim();
}

function getFuelValue(row) {
	const value = row?.fuel_l ?? row?.fuelL ?? row?.fuel;
	if (typeof value !== 'number' && typeof value !== 'string') return null;
	if (typeof value === 'string' && !value.trim()) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

/** Select one available fuel measurement per engine; zero is a valid measurement. */
export function buildPeriodicalEngineFuelSummary(runtimeRows = [], sources = []) {
	const engines = new Map();
	for (const row of [...runtimeRows, ...sources.flatMap((source) => source.engines || [])]) {
		const engineName = getEngineName(row);
		const key = normalizeEngineName(engineName);
		if (key && !engines.has(key)) engines.set(key, engineName);
	}

	const prioritizedSources = FUEL_SOURCE_PRIORITY.map((key) =>
		sources.find((source) => source.key === key)
	).filter(Boolean);

	return Array.from(engines, ([key, engineName]) => {
		for (const source of prioritizedSources) {
			const row = (source.engines || []).find(
				(engine) => normalizeEngineName(getEngineName(engine)) === key
			);
			const fuel = getFuelValue(row);
			if (fuel !== null) {
				const sourceLabel =
					source.key === 'ems_external'
						? 'EMS'
						: source.key === 'ems_internal'
							? 'VMS'
							: source.key.toUpperCase();
				return { key, engineName, fuel, sourceKey: source.key, sourceLabel };
			}
		}
		return { key, engineName, fuel: null, sourceKey: null, sourceLabel: null };
	});
}

/** Keep API row values and engine subtotals intact while splitting the selected source by engine. */
export function groupPeriodicalRpmRowsByEngine(rows = []) {
	const groups = new Map();
	let previousKey = '';
	for (const row of rows) {
		const engineName = getEngineName(row);
		let key = normalizeEngineName(engineName);
		if (isRpmTotalRow(row)) {
			const subtotalKey = key.replace(/^TOTAL\s+|\s+TOTAL$/g, '').trim();
			if (groups.has(subtotalKey)) key = subtotalKey;
			else if (key === 'TOTAL') key = previousKey;
		}
		key ||= previousKey || '-';
		if (!groups.has(key)) groups.set(key, { key, engineName: engineName || '-', rows: [] });
		groups.get(key).rows.push(row);
		previousKey = key;
	}
	return Array.from(groups.values());
}

function isRpmTotalRow(row) {
	const range = String(row?.rpm_range ?? row?.rpmRange ?? row?.range ?? '').trim();
	return Boolean(
		row?.is_total_row ||
		row?.isTotalRow ||
		/^total$/i.test(range) ||
		/\bTOTAL$/.test(normalizeEngineName(getEngineName(row)))
	);
}

function finiteNumber(value) {
	if (typeof value !== 'number' && typeof value !== 'string') return null;
	if (typeof value === 'string' && !value.trim()) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function parseRuntimeHours(value) {
	const number = finiteNumber(value);
	if (number !== null) return number;
	const text = String(value ?? '').trim();
	const clock = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
	if (clock) return Number(clock[1]) + Number(clock[2]) / 60 + Number(clock[3] || 0) / 3600;
	const duration = text.match(
		/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/i
	);
	if (duration && duration.slice(1).some((part) => part !== undefined)) {
		return (
			Number(duration[1] || 0) + Number(duration[2] || 0) / 60 + Number(duration[3] || 0) / 3600
		);
	}
	return null;
}

export function getPeriodicalRpmRuntimeHours(row) {
	const hours = parseRuntimeHours(
		row?.runtime_hours ?? row?.runtimeHours ?? row?.runtime_formatted ?? row?.runtimeFormatted
	);
	if (hours !== null) return hours;
	const minutes = finiteNumber(row?.runtime_minutes ?? row?.runtimeMinutes);
	return minutes === null ? null : minutes / 60;
}

/** Prefer API percentages; otherwise use this engine's runtime, excluding its subtotal rows. */
export function getPeriodicalRpmRuntimePercent(row, engineRows = []) {
	if (!row) return null;
	const explicitPercent =
		row.runtime_percent ??
		row.runtimePercent ??
		row.runtime_percentage ??
		row.runtimePercentage ??
		row.rh_percent ??
		row.rhPercent ??
		row.percentage_rh ??
		row.percentageRh;
	const percent = finiteNumber(
		typeof explicitPercent === 'string' ? explicitPercent.replace(/%$/, '').trim() : explicitPercent
	);
	if (percent !== null) return percent;
	const runtime = getPeriodicalRpmRuntimeHours(row);
	if (runtime === null) return null;
	const subtotal = engineRows.find(isRpmTotalRow);
	const explicitTotal = parseRuntimeHours(
		row.total_runtime_hours ??
			row.totalRuntimeHours ??
			row.engine_runtime_hours ??
			row.engineRuntimeHours ??
			row.total_rh ??
			row.totalRh
	);
	const runtimes = engineRows
		.filter((item) => !isRpmTotalRow(item))
		.map(getPeriodicalRpmRuntimeHours)
		.filter((value) => value !== null);
	const total =
		explicitTotal ??
		getPeriodicalRpmRuntimeHours(subtotal) ??
		(runtimes.length ? runtimes.reduce((sum, value) => sum + value, 0) : null);
	if (total === null) return null;
	if (total === 0) return runtime === 0 ? 0 : null;
	return (runtime / total) * 100;
}

function getRpmEngineCategory(engineName) {
	const name = normalizeEngineName(engineName).replace(
		/^(ME|AE)(PORT|STBD|STARBOARD|CENTER|CENTRE)\b/,
		'$1 $2'
	);
	if (/^(ME\b|ME\d|MAIN\s+ENGINE\b)/.test(name))
		return { key: 'me', label: 'Main Engines', order: 0 };
	if (/^(AE\b|AE\d|AUX(?:ILIARY)?\s+ENGINE\b)/.test(name))
		return { key: 'ae', label: 'Auxiliary Engines', order: 1 };
	return { key: 'other', label: 'Engines', order: 2 };
}

function getRpmEnginePosition(engineName) {
	const name = normalizeEngineName(engineName).replace(
		/^(ME|AE)(PORT|STBD|STARBOARD|CENTER|CENTRE)\b/,
		'$1 $2'
	);
	if (/\b(PORT|LEFT)\b/.test(name)) return { label: 'Port', order: 0 };
	if (/\b(STBD|STARBOARD|RIGHT)\b/.test(name)) return { label: 'Stbd', order: 1 };
	if (/\b(CENTER|CENTRE|MIDDLE)\b/.test(name)) return { label: 'Center', order: 2 };
	return { label: engineName, order: 3 };
}

/** Pivot matching RPM ranges, retaining raw cell values and missing cells separately from zero. */
export function buildPeriodicalRpmMatrices(rows = []) {
	const categories = new Map();
	for (const engine of groupPeriodicalRpmRowsByEngine(rows)) {
		const category = getRpmEngineCategory(engine.engineName);
		if (!categories.has(category.key)) categories.set(category.key, { ...category, engines: [] });
		categories
			.get(category.key)
			.engines.push({ ...engine, position: getRpmEnginePosition(engine.engineName) });
	}
	return Array.from(categories.values())
		.sort((a, b) => a.order - b.order)
		.map((category) => {
			const engines = category.engines
				.sort((a, b) => a.position.order - b.position.order)
				.map((engine) => ({
					...engine,
					label:
						category.engines.filter((other) => other.position.label === engine.position.label)
							.length > 1
							? engine.engineName
							: engine.position.label
				}));
			const ranges = new Map();
			const engineCells = engines.map((engine) => {
				const cells = new Map();
				const occurrences = new Map();
				for (const row of engine.rows) {
					const isTotal = isRpmTotalRow(row);
					const label = isTotal
						? 'Total'
						: String(row.rpm_range ?? row.rpmRange ?? row.range ?? '-').trim();
					const rangeKey = isTotal
						? '__total__'
						: label
								.replace(/[–—]/g, '-')
								.replace(/\s+/g, '')
								.replace(/\d+(?:[.,]\d+)?/g, (value) => String(Number(value.replace(',', '.'))));
					const occurrence = occurrences.get(rangeKey) || 0;
					occurrences.set(rangeKey, occurrence + 1);
					const key = `${rangeKey}:${occurrence}`;
					if (!ranges.has(key)) ranges.set(key, { key, label, isTotal });
					cells.set(key, row);
				}
				return cells;
			});
			const matrixRows = Array.from(ranges.values())
				.sort((a, b) => {
					if (a.isTotal !== b.isTotal) return a.isTotal ? 1 : -1;
					return a.label.localeCompare(b.label, 'en', { numeric: true });
				})
				.map((range) => ({
					...range,
					cells: engineCells.map((cells) => cells.get(range.key) || null)
				}))
				.filter(
					(range) =>
						range.isTotal || !range.cells.every((cell) => getPeriodicalRpmRuntimeHours(cell) === 0)
				);
			return { key: category.key, label: category.label, engines, rows: matrixRows };
		});
}
