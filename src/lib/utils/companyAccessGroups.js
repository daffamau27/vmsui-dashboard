import { matchesSearch, sortByAlpha } from './alphaSort.js';

function firstName(...values) {
	return values.find((value) => typeof value === 'string' && value.trim() && value.trim() !== '-')?.trim() || '';
}

export function getAccessCompanyFields(row = {}) {
	const id = Number(row.companyId ?? row.company_id ?? row.company?.id);
	return {
		companyId: Number.isFinite(id) && id > 0 ? id : null,
		companyName: firstName(
			row.companyName,
			row.company_name,
			row.company?.name,
			row.company?.companyName,
			typeof row.company === 'string' ? row.company : ''
		)
	};
}

export function groupAccessOptions(options = [], companies = [], keyword = '') {
	const catalog = companies.map((company) => ({
		id: Number(company.id),
		name: firstName(company.name, company.companyName, company.company_name)
	}));
	const groups = new Map();
	for (const option of sortByAlpha(options, (row) => row.label, (row) => row.sublabel)) {
		const { companyId, companyName } = getAccessCompanyFields(option);
		const nameMatches = companyName
			? catalog.filter((company) => company.name.toLowerCase() === companyName.toLowerCase())
			: [];
		const company = companyId
			? catalog.find((company) => company.id === companyId)
			: nameMatches.length === 1 ? nameMatches[0] : null;
		const id = companyId || company?.id;
		const name = company?.name || companyName || (id ? `Company ${id}` : 'No Company');
		const key = id ? `id:${id}` : companyName ? `name:${companyName.toLowerCase()}` : 'none';
		if (!groups.has(key)) groups.set(key, { key, companyName: name, options: [] });
		groups.get(key).options.push(option);
	}

	return sortByAlpha([...groups.values()], (group) => group.companyName)
		.map((group) => ({
			...group,
			visibleOptions: group.options.filter((option) => matchesSearch(keyword, [
				group.companyName, option.label, option.sublabel, option.id, ...(option.searchValues || [])
			]))
		}))
		.filter((group) => group.visibleOptions.length > 0);
}
