<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import './audit-log-page.css';

	let {
		isSuperAdmin = false,
		auditScope = $bindable('my'),
		userIdFilter = $bindable(''),
		exportStartDate = $bindable(''),
		exportEndDate = $bindable(''),
		pageSize = $bindable(20),
		exporting = false,
		onScopeChange,
		onUserIdChange,
		onPageSizeChange,
		onExport
	} = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Export</span>
			<h2>
				{isSuperAdmin && auditScope === 'all' ? 'Export All Audit Logs' : 'Export My Audit Logs'}
			</h2>
		</div>

		<strong>CSV</strong>
	</div>

	<div class="audit-filter-card">
		{#if isSuperAdmin}
			<label>
				<span>Audit Scope</span>
				<select bind:value={auditScope} onchange={() => onScopeChange?.()}>
					<option value="my">My Audit Logs</option>
					<option value="all">All Audit Logs</option>
				</select>
			</label>
		{/if}

		{#if isSuperAdmin && auditScope === 'all'}
			<label>
				<span>User ID</span>
				<input
					type="number"
					min="1"
					placeholder="Optional"
					bind:value={userIdFilter}
					onchange={() => onUserIdChange?.()}
				/>
			</label>
		{/if}

		<label>
			<span>Start Date</span>
			<input type="date" use:fourDigitDateYear bind:value={exportStartDate} />
		</label>

		<label>
			<span>End Date</span>
			<input type="date" use:fourDigitDateYear bind:value={exportEndDate} />
		</label>

		<label>
			<span>Page Size</span>
			<select bind:value={pageSize} onchange={() => onPageSizeChange?.()}>
				<option value={10}>10</option>
				<option value={20}>20</option>
				<option value={50}>50</option>
				<option value={100}>100</option>
			</select>
		</label>

		<div class="filter-actions">
			<button type="button" class="primary-btn" onclick={() => onExport?.()} disabled={exporting}>
				Export
			</button>

			<button
				type="button"
				class="secondary-btn"
				onclick={() => {
					exportStartDate = '';
					exportEndDate = '';
				}}
				disabled={exporting}
			>
				Reset
			</button>
		</div>
	</div>
</section>
