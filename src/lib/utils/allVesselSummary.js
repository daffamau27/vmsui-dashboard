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
		headerPath: ['RUNTIME'],
		permission: 'view_engine_runtime_table'
	},
	{
		key: 'sriti',
		field: 'sriti_formatted',
		label: 'SRITI RH',
		type: 'additional',
		group: 'SRITI RH',
		headerPath: ['HIGH RPM LOW SPEED', 'DURATION (HH:MM)'],
		permission: 'view_high_rpm_low_speed_table'
	},
	{
		key: 'sriti_fuel',
		field: 'sriti_fuel',
		label: 'SRITI FC',
		type: 'additional',
		group: 'SRITI FC',
		headerPath: ['HIGH RPM LOW SPEED', 'FUEL USED (L)'],
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
		headerPath: ['SPEED (KNOT)', 'AVG'],
		type: 'additional',
		path: ['speed', 'avg_running_speed'],
		permissions: ['view_speed_stats_table']
	},
	{
		id: 'max_speed',
		label: 'MAX SPEED',
		headerPath: ['SPEED (KNOT)', 'MAX'],
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

function hasEngineValue(rows, path) {
	return rows.some((row) =>
		(Array.isArray(row?.engines) ? row.engines : []).some(
			(engine) => engine?.key && hasNonZeroField(engine, path)
		)
	);
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
	const hasSource = (key) => hasEngineValue(rows, ['fuel', key]);
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
	return [...emsSources, ...otherFuelSources].filter(
		(source) => hasSource(source.key) && (source.key !== 'vms' || !internal)
	);
}

export function groupAllVesselSummaryColumns(columns) {
	const groups = new Map();
	for (const column of columns) {
		if (!groups.has(column.group)) groups.set(column.group, { label: column.group, columns: [] });
		groups.get(column.group).columns.push(column);
	}
	return Array.from(groups.values());
}

function getFuelColumnOrder(column) {
	if (column.path[0] === 'totals') {
		return { ae: 1, me: 3, grand: 5 }[column.path[1]] ?? 5;
	}
	// Prefer the engine key, with its display name as a fallback for custom keys.
	for (const value of [column.engineKey, column.headerPath.at(-1)]) {
		const name = String(value || '')
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '');
		if (name.startsWith('ae') || name.startsWith('aux')) return 0;
		if (name.startsWith('me') || name.startsWith('main')) return 2;
	}
	return 4;
}

// Build both the headers and body order from the same tree. Hidden columns
// cannot leave empty groups or stale spans in the three-level header.
export function buildAllVesselSummaryTable(columns) {
	const roots = [];
	for (const column of columns) {
		const path = column.headerPath || [column.label];
		let siblings = roots;
		for (let depth = 0; depth < path.length; depth += 1) {
			const label = path[depth];
			if (depth === path.length - 1) {
				siblings.push({ id: column.id, label, column });
			} else {
				let group = siblings.find((node) => node.children && node.label === label);
				if (!group) {
					group = { id: JSON.stringify(path.slice(0, depth + 1)), label, children: [] };
					siblings.push(group);
				}
				siblings = group.children;
			}
		}
	}
	const sectionOrder = [
		'DATA RECEIVED',
		'RUNTIME',
		'FUEL CONSUMPTION (L)',
		'SPEED (KNOT)',
		'HIGH RPM LOW SPEED',
		'DISTANCE',
		'UTC'
	];
	const sourceOrder = ['EMS', 'EMS INTERNAL', 'EMS EXTERNAL', 'Engine Maker', 'ECU', 'FMS', 'VMS'];
	const rank = (order, label) => (order.includes(label) ? order.indexOf(label) : order.length);
	roots.sort((a, b) => rank(sectionOrder, a.label) - rank(sectionOrder, b.label));
	const fuelGroup = roots.find((node) => node.label === 'FUEL CONSUMPTION (L)');
	fuelGroup?.children.sort((a, b) => rank(sourceOrder, a.label) - rank(sourceOrder, b.label));
	for (const source of fuelGroup?.children || []) {
		// Keep each subtotal beside its engines, and the overall total last.
		source.children.sort(
			(a, b) =>
				getFuelColumnOrder(a.column) - getFuelColumnOrder(b.column) ||
				compareAlphaValue(a.column.engineKey, b.column.engineKey)
		);
	}

	const headerRows = [[], [], []];
	const orderedColumns = [];
	const visit = (node, depth) => {
		const cell = {
			id: node.id,
			label: node.label,
			column: node.column,
			colspan: 1,
			rowspan: node.children ? 1 : headerRows.length - depth
		};
		headerRows[depth].push(cell);
		if (node.children) {
			cell.colspan = node.children.reduce((count, child) => count + visit(child, depth + 1), 0);
		} else {
			orderedColumns.push(node.column);
		}
		return cell.colspan;
	};
	roots.forEach((node) => visit(node, 0));
	return { columns: orderedColumns, headerRows };
}

export function buildAllVesselSummaryColumns(rows = []) {
	const engines = new Map();
	for (const row of rows) {
		for (const engine of Array.isArray(row?.engines) ? row.engines : []) {
			if (!engine?.key) continue;
			if (!engines.has(engine.key)) {
				engines.set(engine.key, { key: engine.key, name: engine.name || engine.key });
			}
		}
	}
	const orderedEngines = Array.from(engines.values()).sort((left, right) =>
		compareAlphaValue(left.key, right.key)
	);
	const fuelSources = getFuelSources(rows);

	// Visibility belongs to the metric/source, not to an individual engine.
	// Once a group has data, include every engine, preserving zero/missing cells.
	const engineColumns = engineMetrics
		.filter((metric) => hasEngineValue(rows, [metric.field]))
		.flatMap((metric) =>
			orderedEngines.map((engine) => ({
				id: `engine__${metric.key}__${engine.key}`,
				label: `${engine.name} ${metric.label}`,
				headerPath: [...metric.headerPath, engine.name],
				type: metric.type,
				group: metric.group,
				engineKey: engine.key,
				path: [metric.field],
				permissions: [metric.permission]
			}))
		);

	const fuelColumns = fuelSources.flatMap((source) =>
		orderedEngines.map((engine) => ({
			id: `engine__fuel_${source.key}__${engine.key}`,
			label: `${engine.name} FC (${source.label})`,
			headerPath: [
				'FUEL CONSUMPTION (L)',
				source.key === 'engine_maker' ? 'Engine Maker' : source.label,
				engine.name
			],
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
				headerPath: [
					'FUEL CONSUMPTION (L)',
					source.key === 'engine_maker' ? 'Engine Maker' : source.label,
					scope.key === 'grand' ? 'TOTAL' : `${scope.key.toUpperCase()} TOTAL`
				],
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
						headerPath: ['HIGH RPM LOW SPEED', 'TOTAL FUEL'],
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
