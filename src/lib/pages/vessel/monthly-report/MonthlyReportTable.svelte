<script>
	import { ArrowRight, ArrowUpRight, CalendarDays, FileText, X } from 'lucide-svelte';
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';

	let {
		active = true,
		rows = [],
		engines = [],
		fuelSources = [],
		globalFuelGroups = [],
		highRpmEngines = [],
		showDataReceived = false,
		showRuntime = false,
		showFuel = false,
		showSpeed = false,
		showHighRpm = false,
		fuelColspan = 1,
		highRpmColspan = 1,
		highRpmEngineColspan = 1,
		headerRowspan = 1,
		hasGroupedHeaderRows = false
	} = $props();

	const popupId = $props.id();
	let popupElement = $state(null);
	let popupRow = $state(null);
	let popupLeft = $state(0);
	let popupTop = $state(0);
	let popupTailLeft = $state(20);
	let popupTailSide = $state('top');
	let popupTrigger = null;
	let popupAnchor = null;

	function closePopup(restoreFocus = false) {
		if (popupElement?.matches(':popover-open')) popupElement.hidePopover();
		popupRow = null;
		popupAnchor = null;
		if (restoreFocus) popupTrigger?.focus({ preventScroll: true });
	}

	async function openRowPopup(event, row) {
		if (!active || !row.dailyReportHref || window.getSelection()?.toString()) return;
		const anchor = event.currentTarget.getBoundingClientRect();
		popupAnchor = { element: event.currentTarget, top: anchor.top, left: anchor.left };
		const x = event.detail ? event.clientX : anchor.left + 16;
		popupTrigger = event.currentTarget.querySelector('.daily-report-row-trigger');
		popupRow = row;
		await tick();
		if (!active || popupRow?.key !== row.key) return;
		popupElement.showPopover();
		const bounds = popupElement.getBoundingClientRect();
		const left = Math.max(12, Math.min(x, window.innerWidth - bounds.width - 12));
		const below = anchor.bottom + 8;
		const placeBelow = below + bounds.height <= window.innerHeight - 12;
		const top = placeBelow ? below : anchor.top - bounds.height - 8;

		popupLeft = left;
		popupTop = Math.max(12, Math.min(top, window.innerHeight - bounds.height - 12));
		popupTailLeft = Math.max(16, Math.min(x - left, bounds.width - 16));
		popupTailSide = placeBelow ? 'top' : 'bottom';
		await tick();
		popupElement.querySelector('a')?.focus({ preventScroll: true });
	}

	function handleScroll(event) {
		if (!popupAnchor || popupElement?.contains(event.target)) return;
		const bounds = popupAnchor.element.getBoundingClientRect();
		// A queued scroll event from bringing the row into view must not dismiss a new popup.
		if (
			Math.abs(bounds.top - popupAnchor.top) > 1 ||
			Math.abs(bounds.left - popupAnchor.left) > 1
		) {
			closePopup();
		}
	}

	$effect(() => {
		if (
			!active ||
			(popupRow &&
				!rows.some(
					(row) => row.key === popupRow.key && row.dailyReportHref === popupRow.dailyReportHref
				))
		) {
			closePopup();
		}
	});

	onMount(() => {
		const handleResize = () => closePopup();
		document.addEventListener('scroll', handleScroll, true);
		window.addEventListener('resize', handleResize);
		return () => {
			document.removeEventListener('scroll', handleScroll, true);
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<section class="table-section monthly-main-table">
	<div class="section-header">
		<div>
			<span class="section-kicker">Daily Aggregation</span>
			<h2>Monthly Report by Date</h2>
		</div>

		<div class="section-header-actions">
			<strong>{rows.length} rows</strong>
		</div>
	</div>

	{#if rows.length}
		<div class="monthly-table-wrapper">
			<table class="monthly-report-table">
				<thead>
					<tr>
						<th rowspan={headerRowspan} class="sticky-col">DATE</th>
						{#if showDataReceived}
							<th rowspan={headerRowspan}>DATA RECEIVED</th>
						{/if}

						{#if showRuntime}
							<th colspan={engines.length || 1}>RUNTIME</th>
						{/if}

						{#if showFuel}
							<th colspan={fuelColspan}>FUEL CONSUMPTION (L)</th>
						{/if}

						{#if showSpeed}
							<th colspan="2">SPEED (KNOT)</th>
						{/if}

						{#if showHighRpm}
							<th colspan={highRpmColspan}>HIGH RPM LOW SPEED</th>
						{/if}
					</tr>

					{#if hasGroupedHeaderRows}
						<tr>
							{#if showRuntime}
								{#if engines.length}
									{#each engines as engine (engine.key)}
										<th rowspan="2">{engine.name}</th>
									{/each}
								{:else}
									<th rowspan="2">-</th>
								{/if}
							{/if}

							{#if showFuel}
								{#if fuelSources.length || globalFuelGroups.length}
									{#each fuelSources as source (source.key)}
										<th colspan={engines.length + 1}>{source.label}</th>
									{/each}

									{#each globalFuelGroups as group (group.key)}
										{#if group.collapsed}
											<th rowspan="2">{group.label}</th>
										{:else}
											<th colspan={group.columns.length}>{group.label}</th>
										{/if}
									{/each}
								{:else}
									<th rowspan="2">-</th>
								{/if}
							{/if}

							{#if showSpeed}
								<th rowspan="2">AVG</th>
								<th rowspan="2">MAX</th>
							{/if}

							{#if showHighRpm}
								<th colspan={highRpmEngineColspan}>DURATION (HH:MM)</th>
								<th colspan={highRpmEngineColspan}>FUEL USED (L)</th>
								<th rowspan="2">TOTAL FUEL (L)</th>
							{/if}
						</tr>

						<tr>
							{#if showFuel && (fuelSources.length || globalFuelGroups.length)}
								{#each fuelSources as source (source.key)}
									{#each engines as engine (engine.key)}
										<th>{engine.name}</th>
									{/each}
									<th>TOTAL</th>
								{/each}

								{#each globalFuelGroups as group (group.key)}
									{#if !group.collapsed}
										{#each group.columns as column (column.key)}
											<th>{column.label}</th>
										{/each}
									{/if}
								{/each}
							{/if}

							{#if showHighRpm}
								{#if highRpmEngines.length}
									{#each highRpmEngines as engine (engine.key)}
										<th>{engine.name}</th>
									{/each}
									{#each highRpmEngines as engine (engine.key)}
										<th>{engine.name}</th>
									{/each}
								{:else}
									<th>-</th>
									<th>-</th>
								{/if}
							{/if}
						</tr>
					{/if}
				</thead>

				<tbody>
					{#each rows as row (row.key)}
						<!-- Row clicks delegate to the date button, which also provides native keyboard access. -->
						<tr
							class:future-row={row.isFuture}
							class:daily-report-row={Boolean(row.dailyReportHref)}
							onclick={(event) => openRowPopup(event, row)}
						>
							<td class="sticky-col date-cell">
								{#if row.dailyReportHref}
									<button
										type="button"
										class="daily-report-row-trigger"
										aria-label={`Open Daily Report for ${row.reportDate}`}
										aria-haspopup="dialog"
										aria-controls={popupId}
									>
										{row.dateLabel}
									</button>
								{:else}
									{row.dateLabel}
								{/if}
							</td>
							{#if showDataReceived}
								<td>{row.isFuture ? '-' : row.dataReceived}</td>
							{/if}

							{#if showRuntime}
								{#if engines.length}
									{#each row.runtimes as value, index (engines[index]?.key || index)}
										<td>{row.isFuture ? '-' : value}</td>
									{/each}
								{:else}
									<td>-</td>
								{/if}
							{/if}

							{#if showFuel}
								{#if fuelSources.length || globalFuelGroups.length}
									{#each row.fuelSourceCells as source (source.key)}
										{#each source.engineValues as value, index (engines[index]?.key || index)}
											<td>{row.isFuture ? '-' : value}</td>
										{/each}
										<td class="total-col">{row.isFuture ? '-' : source.total}</td>
									{/each}

									{#each row.globalFuelValues as value, index (index)}
										<td>{row.isFuture ? '-' : value}</td>
									{/each}
								{:else}
									<td>-</td>
								{/if}
							{/if}

							{#if showSpeed}
								<td>{row.isFuture ? '-' : row.speedAvg}</td>
								<td>{row.isFuture ? '-' : row.speedMax}</td>
							{/if}

							{#if showHighRpm}
								{#if highRpmEngines.length}
									{#each row.highRpmDurations as value, index (highRpmEngines[index]?.key || index)}
										<td>{row.isFuture ? '-' : value}</td>
									{/each}
									{#each row.highRpmFuelUsed as value, index (highRpmEngines[index]?.key || index)}
										<td>{row.isFuture ? '-' : value}</td>
									{/each}
								{:else}
									<td>-</td>
									<td>-</td>
								{/if}
								<td class="total-col">{row.isFuture ? '-' : row.highRpmTotalFuel}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-box">Monthly report by date is not available yet.</div>
	{/if}
</section>

<div
	id={popupId}
	bind:this={popupElement}
	class="monthly-daily-popup"
	class:tail-on-top={popupTailSide === 'top'}
	class:tail-on-bottom={popupTailSide === 'bottom'}
	popover="auto"
	role="dialog"
	aria-modal="false"
	aria-labelledby={`${popupId}-title`}
	style:left={`${popupLeft}px`}
	style:top={`${popupTop}px`}
	style:--popup-tail-left={`${popupTailLeft}px`}
	ontoggle={(event) => {
		if (event.newState === 'closed') popupRow = null;
	}}
>
	<div class="monthly-popup-heading">
		<span class="monthly-popup-icon" aria-hidden="true">
			<FileText size={20} strokeWidth={2} />
		</span>
		<div class="monthly-popup-heading-copy">
			<span class="monthly-popup-eyebrow">Daily report</span>
			<h3 id={`${popupId}-title`}>Open daily report?</h3>
		</div>
	</div>

	<div class="monthly-popup-content">
		<p class="monthly-popup-copy">Review vessel activity and details for this date.</p>
		<div class="monthly-popup-date">
			<span class="monthly-popup-date-icon" aria-hidden="true">
				<CalendarDays size={17} strokeWidth={2} />
			</span>
			<span class="monthly-popup-date-copy">
				<small>Report date</small>
				<strong>{popupRow?.reportDate || '—'}</strong>
			</span>
		</div>

		<div class="daily-popup-actions">
			<a
				class="daily-popup-action daily-popup-action-primary"
				href={resolve(popupRow?.dailyReportHref || '/vessel/daily-report')}
				onclick={() => popupElement.hidePopover()}
			>
				<span>Open report</span>
				<ArrowRight size={17} strokeWidth={2.2} aria-hidden="true" />
			</a>
			<a
				class="daily-popup-action daily-popup-action-secondary"
				href={resolve(popupRow?.dailyReportHref || '/vessel/daily-report')}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => popupElement.hidePopover()}
			>
				<ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" />
				<span>Open in new tab</span>
			</a>
			<button
				type="button"
				class="daily-popup-action daily-popup-action-quiet"
				onclick={() => closePopup(true)}
			>
				<X size={15} strokeWidth={2} aria-hidden="true" />
				<span>Stay here</span>
			</button>
		</div>
	</div>
</div>

<style>
	.daily-report-row {
		cursor: pointer;
	}
	.daily-report-row-trigger {
		padding: 4px 6px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--text-accent);
		font: inherit;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.daily-report-row-trigger:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}
	.monthly-daily-popup {
		position: fixed;
		inset: auto;
		margin: 0;
		width: min(330px, calc(100vw - 24px));
		max-height: calc(100dvh - 24px);
		padding: 0;
		border: 1px solid rgba(59, 130, 246, 0.22);
		border-radius: 18px;
		box-sizing: border-box;
		background: linear-gradient(180deg, var(--color-surface), var(--color-elevated));
		color: var(--text-primary);
		box-shadow:
			0 20px 50px rgba(15, 23, 42, 0.2),
			0 4px 12px rgba(15, 23, 42, 0.08);
		overflow: visible;
	}
	.monthly-daily-popup::before,
	.monthly-daily-popup::after {
		position: absolute;
		left: var(--popup-tail-left, 20px);
		width: 0;
		height: 0;
		transform: translateX(-50%);
		pointer-events: none;
	}
	.monthly-daily-popup::before {
		content: '';
	}
	.monthly-daily-popup::after {
		content: '';
	}
	.monthly-daily-popup.tail-on-top::before {
		top: -9px;
		border-right: 9px solid transparent;
		border-bottom: 9px solid rgba(59, 130, 246, 0.28);
		border-left: 9px solid transparent;
	}
	.monthly-daily-popup.tail-on-top::after {
		top: -7px;
		border-right: 8px solid transparent;
		border-bottom: 8px solid var(--color-surface);
		border-left: 8px solid transparent;
	}
	.monthly-daily-popup.tail-on-bottom::before {
		bottom: -9px;
		border-top: 9px solid rgba(59, 130, 246, 0.28);
		border-right: 9px solid transparent;
		border-left: 9px solid transparent;
	}
	.monthly-daily-popup.tail-on-bottom::after {
		bottom: -7px;
		border-top: 8px solid var(--color-elevated);
		border-right: 8px solid transparent;
		border-left: 8px solid transparent;
	}
	.monthly-daily-popup::backdrop {
		background: transparent;
	}
	.monthly-popup-heading {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 15px 16px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 17px 17px 0 0;
		background:
			radial-gradient(circle at 0 0, rgba(59, 130, 246, 0.13), transparent 62%),
			var(--color-surface);
	}
	.monthly-popup-icon {
		display: grid;
		width: 42px;
		height: 42px;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid rgba(59, 130, 246, 0.2);
		border-radius: 13px;
		background: linear-gradient(145deg, rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0.07));
		color: var(--text-accent);
	}
	.monthly-popup-heading-copy {
		display: grid;
		gap: 3px;
		min-width: 0;
	}
	.monthly-popup-eyebrow {
		color: var(--text-accent);
		font-size: 9px;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.monthly-popup-heading h3 {
		margin: 0;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 850;
		letter-spacing: -0.025em;
		line-height: 1.25;
	}
	.monthly-popup-content {
		max-height: min(440px, calc(100dvh - 112px));
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 13px 16px 16px;
	}
	.monthly-popup-copy {
		margin: 0 0 11px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 600;
		line-height: 1.45;
	}
	.monthly-popup-date {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 11px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		background: var(--color-elevated);
	}
	.monthly-popup-date-icon {
		display: grid;
		width: 32px;
		height: 32px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 10px;
		background: var(--color-accent-muted);
		color: var(--text-accent);
	}
	.monthly-popup-date-copy {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.monthly-popup-date-copy small {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.monthly-popup-date-copy strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 850;
	}
	.daily-popup-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 13px;
	}
	.daily-popup-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-width: 0;
		min-height: 38px;
		padding: 8px 10px;
		border: 1px solid transparent;
		border-radius: 10px;
		font: inherit;
		font-size: 10.5px;
		font-weight: 800;
		text-decoration: none;
		cursor: pointer;
		transition:
			background 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease,
			transform 140ms ease;
	}
	.daily-popup-action-primary {
		grid-column: 1 / -1;
		justify-content: space-between;
		padding: 9px 12px;
		border-color: var(--color-accent);
		background: linear-gradient(135deg, var(--color-accent), #1d4ed8);
		color: #fff;
		box-shadow: 0 6px 14px rgba(37, 99, 235, 0.2);
	}
	.daily-popup-action-secondary {
		border-color: rgba(59, 130, 246, 0.16);
		background: var(--color-accent-muted);
		color: var(--text-accent);
	}
	.daily-popup-action-quiet {
		border-color: rgba(148, 163, 184, 0.18);
		background: var(--color-elevated);
		color: var(--text-secondary);
		border-radius: 10px !important;
	}
	.daily-popup-action:hover {
		transform: translateY(-1px);
		box-shadow: 0 7px 14px rgba(15, 23, 42, 0.12);
	}
	.daily-popup-action-primary:hover {
		background: linear-gradient(135deg, var(--text-accent), #1e40af);
	}
	.daily-popup-action:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
	}
	@media (max-width: 380px) {
		.monthly-popup-heading {
			padding: 13px;
		}
		.monthly-popup-content {
			padding: 12px 13px 13px;
		}
		.daily-popup-action {
			padding-right: 7px;
			padding-left: 7px;
			font-size: 9.5px;
		}
	}
</style>
