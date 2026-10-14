import { compareAlphaValue } from './alphaSort.js';

// Fuel columns and their totals read API fields without adding different sources.
// Only SRITI TOTAL is calculated locally, as the sum of engine sriti_fuel values.
const otherFuelSources = [
	{ key: 'engine_maker', label: 'ENGINE MAKER', permission: 'view_fuel_engine_maker' },
	{ key: 'ecu', label: 'ECU', permission: 'view_fuel_ecu' },
	{ key: 'fms', label: 'FMS', permission: 'view_fuel_fms' },
	{ key: 'vms', label: 'VMS', permission: 'view_fuel_ems_internal' }
];

const engineMetrics = [
	{
		key: 'runtime',
		field: 'runtime_formatted',
		label: 'RH',
		type: 'runtime',
		group: 'RH',
		permission: 'view_engine_runtime_table'
	},
	{
		key: 'sriti',
		field: 'sriti_formatted',
		label: 'SRITI RH',
		type: 'additional',
		group: 'SRITI RH',
		permission: 'view_high_rpm_low_speed_table'
	},
	{
		key: 'sriti_fuel',
		field: 'sriti_fuel',
		label: 'SRITI FC',
		type: 'additional',
		group: 'SRITI FC',
		permission: 'view_high_rpm_low_speed_table'
	}
];

const additionalColumns = [
	{
		id: 'data_received',
		label: 'DATA RECEIVED',
		type: 'percent',
		path: ['data_received', 'percentage'],
		permissions: ['access_all_vessel_summary']
	},
	{
		id: 'avg_speed',
		label: 'AVG SPEED',
		type: 'additional',
		path: ['speed', 'avg_running_speed'],
		permissions: ['view_speed_stats_table']
	},
	{
		id: 'max_speed',
		label: 'MAX SPEED',
		type: 'additional',
		path: ['speed', 'top_speed'],
		permissions: ['view_speed_stats_table']
	},
	{
		id: 'distance',
		label: 'DISTANCE',
		type: 'additional',
		path: ['distance'],
		permissions: ['view_travel_distance_table']
	},
	{ id: 'utc', label: 'UTC', type: 'utc', path: ['range', 'timezone'], permissions: [] }
];

function hasNonZeroValue(value) {
	if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
	if (typeof value !== 'string') return false;

	const text = value.trim();
	if (!text || /^(?:-|nan|null|undefined)$/i.test(text)) return false;

	const numeric = Number(text);
	if (!Number.isNaN(numeric)) return Number.isFinite(numeric) && numeric !== 0;

	// Durations such as "0h 0m" are also zero. Only inspect them for column
	// visibility; the original API value is still used when rendering a cell.
	if (/^(?:\d+(?:\.\d+)?\s*[dhms]\s*)+$/i.test(text) || /^\d+:\d{2}(?::\d{2})?$/.test(text)) {
		return text.match(/\d+(?:\.\d+)?/g).some((part) => Number(part) !== 0);
	}

	return true;
}

function hasNonZeroField(value, path) {
	for (const key of path) {
		if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return false;
		value = value[key];
	}
	return hasNonZeroValue(value);
}

function readField(value, path) {
	for (const key of path) value = value?.[key];
	return value;
}

function getSritiFuelTotal(row) {
	const values = (Array.isArray(row?.engines) ? row.engines : [])
		.map((engine) => engine?.sriti_fuel)
		.filter(
			(value) =>
				(typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
				Number.isFinite(Number(value))
		)
		.map(Number);
	if (!values.length) return null;
	// Avoid displaying binary floating-point artifacts such as 0.1 + 0.2.
	return Number(values.reduce((total, value) => total + value, 0).toPrecision(15));
}

function getFuelSources(rows) {
	const hasSource = (key) =>
		rows.some(
			(row) =>
				(Array.isArray(row?.engines) ? row.engines : []).some((engine) =>
					hasNonZeroField(engine, ['fuel', key])
				) || ['me', 'ae', 'grand'].some((scope) => hasNonZeroField(row, ['totals', scope, key]))
		);
	const internal = hasSource('ems_internal');
	const external = hasSource('ems_external');
	const splitEms = internal && external;
	const emsSources = [];

	if (internal) {
		emsSources.push({
			key: 'ems_internal',
			label: splitEms ? 'EMS INTERNAL' : 'EMS',
			permission: 'view_fuel_ems_internal'
		});
	}
	if (external) {
		emsSources.push({
			key: 'ems_external',
			label: splitEms ? 'EMS EXTERNAL' : 'EMS',
			permission: 'view_fuel_ems_external'
		});
	}
	if (!internal && !external) {
		emsSources.push({ key: 'ems', label: 'EMS', permission: 'view_fuel_ems_external' });
	}

	// A single EMS column reads the active source directly, without adding values.
	// VMS is the API alias for EMS internal; don't repeat it when internal is shown.
	return [...emsSources, ...otherFuelSources.filter((source) => source.key !== 'vms' || !internal)];
}

export function groupAllVesselSummaryColumns(columns) {
	const groups = new Map();
	for (const column of columns) {
		if (!groups.has(column.group)) groups.set(column.group, { label: column.group, columns: [] });
		groups.get(column.group).columns.push(column);
	}
	return Array.from(groups.values());
}

export function buildAllVesselSummaryColumns(rows = []) {
	const engines = new Map();
	for (const row of rows) {
		for (const engine of Array.isArray(row?.engines) ? row.engines : []) {
			if (!engine?.key) continue;
			if (!engines.has(engine.key)) {
				engines.set(engine.key, { key: engine.key, name: engine.name || engine.key, records: [] });
			}
			engines.get(engine.key).records.push(engine);
		}
	}
	const orderedEngines = Array.from(engines.values()).sort((left, right) =>
		compareAlphaValue(left.key, right.key)
	);
	const fuelSources = getFuelSources(rows);

	const engineColumns = engineMetrics.flatMap((metric) =>
		orderedEngines
			.filter((engine) => engine.records.some((record) => hasNonZeroField(record, [metric.field])))
			.map((engine) => ({
				id: `engine__${metric.key}__${engine.key}`,
				label: `${engine.name} ${metric.label}`,
				type: metric.type,
				group: metric.group,
				engineKey: engine.key,
				path: [metric.field],
				permissions: [metric.permission]
			}))
	);

	const fuelColumns = fuelSources.flatMap((source) =>
		orderedEngines
			.filter((engine) =>
				engine.records.some((record) => hasNonZeroField(record, ['fuel', source.key]))
			)
			.map((engine) => ({
				id: `engine__fuel_${source.key}__${engine.key}`,
				label: `${engine.name} FC (${source.label})`,
				type: 'fuel',
				group: `FC ${source.label}`,
				engineKey: engine.key,
				path: ['fuel', source.key],
				permissions: ['view_fuel_consumption_table', source.permission]
			}))
	);

	const totalColumns = [
		{ key: 'me', label: 'ME FC TOTAL' },
		{ key: 'ae', label: 'AE FC TOTAL' },
		{ key: 'grand', label: 'FC TOTAL' }
	].flatMap((scope) =>
		fuelSources
			.filter((source) =>
				rows.some((row) => hasNonZeroField(row, ['totals', scope.key, source.key]))
			)
			.map((source) => ({
				id: `total_fuel__${scope.key}__${source.key}`,
				label: `${scope.label} (${source.label})`,
				type: 'total',
				group: scope.label,
				path: ['totals', scope.key, source.key],
				permissions: ['view_fuel_consumption_table', source.permission],
				defaultVisible: true
			}))
	);

	return [
		...engineColumns.filter((column) => column.type === 'runtime'),
		...fuelColumns,
		...totalColumns,
		...engineColumns.filter((column) => column.type !== 'runtime'),
		...(rows.some((row) => hasNonZeroValue(getSritiFuelTotal(row)))
			? [
					{
						id: 'total_sriti_fuel',
						label: 'SRITI TOTAL',
						type: 'total',
						group: 'SRITI TOTAL',
						permissions: ['view_high_rpm_low_speed_table'],
						defaultVisible: true
					}
				]
			: []),
		...additionalColumns
			.filter((column) => rows.some((row) => hasNonZeroField(row, column.path)))
			.map((column) => ({ ...column, group: 'Additional', defaultVisible: true }))
	];
}

export function getAllVesselSummaryCellValue(row, column) {
	const record = column.engineKey
		? (Array.isArray(row?.engines) ? row.engines : []).find(
				(engine) => engine?.key === column.engineKey
			)
		: row;
	const value =
		column.id === 'total_sriti_fuel' ? getSritiFuelTotal(row) : readField(record, column.path);
	if (value === null || value === undefined || value === '') return '-';
	if (typeof value === 'number' && !Number.isFinite(value)) return '-';
	return column.type === 'percent' ? `${value}%` : String(value);
}
