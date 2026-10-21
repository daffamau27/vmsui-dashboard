<script>
	import { onMount, onDestroy, untrack } from 'svelte';
	import { getVesselHireHistoryApi } from '$lib/api/administratorApi.js';

	let { vesselId, vesselName = '-', onclose = () => {} } = $props();
	let dialog = $state();
	let closeButton = $state();
	let loading = $state(true);
	let error = $state('');
	let items = $state([]);
	let page = $state(1);
	let pagination = $state({
		pageSize: 20,
		totalItems: 0,
		totalPages: 1,
		hasNextPage: false,
		hasPrevPage: false
	});
	let requestId = 0;
	const titleId = $props.id();

	async function loadPage(targetVesselId, targetPage) {
		const currentRequest = ++requestId;
		loading = true;
		error = '';
		page = targetPage;
		try {
			const payload = await getVesselHireHistoryApi(targetVesselId, {
				page: targetPage,
				pageSize: 20
			});
			if (currentRequest !== requestId) return;
			items = Array.isArray(payload?.items) ? payload.items : [];
			const meta = payload?.pagination || {};
			page = meta.page ?? targetPage;
			pagination = {
				pageSize: meta.pageSize ?? 20,
				totalItems: meta.totalItems ?? items.length,
				totalPages: Math.max(1, meta.totalPages ?? 1),
				hasNextPage: Boolean(meta.hasNextPage ?? meta.hasNext),
				hasPrevPage: Boolean(meta.hasPrevPage ?? meta.hasPrevious)
			};
		} catch (err) {
			if (currentRequest !== requestId) return;
			items = [];
			error = err?.message || 'Failed to load vessel hire history.';
		} finally {
			if (currentRequest === requestId) loading = false;
		}
	}

	function goToPage(targetPage) {
		if (loading || error || targetPage < 1 || targetPage > pagination.totalPages) return;
		void loadPage(vesselId, targetPage);
	}

	function close() {
		requestId += 1;
		dialog?.close();
		onclose();
	}

	function handleBackdropClick(event) {
		if (event.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		if (
			event.clientX < rect.left ||
			event.clientX > rect.right ||
			event.clientY < rect.top ||
			event.clientY > rect.bottom
		)
			close();
	}

	$effect(() => {
		const id = vesselId;
		untrack(() => {
			void loadPage(id, 1);
		});
		return () => {
			requestId += 1;
		};
	});

	onMount(() => {
		dialog.showModal();
		closeButton.focus();
	});
	onDestroy(() => {
		requestId += 1;
		dialog?.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="hire-history-modal"
	aria-labelledby={titleId}
	onclick={handleBackdropClick}
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
>
	<header class="hire-history-header">
		<div>
			<span class="history-kicker">Hire History</span>
			<h2 id={titleId}>{vesselName}</h2>
			<p>
				{loading
					? 'Loading records...'
					: error
						? 'Unable to load records'
						: `${pagination.totalItems} record(s) found`}
			</p>
		</div>
		<button
			bind:this={closeButton}
			type="button"
			class="hire-history-close"
			onclick={close}
			aria-label="Close hire history">×</button
		>
	</header>
	<div class="hire-history-body" aria-busy={loading}>
		{#if loading}
			<div class="hire-history-state" role="status">Loading hire history...</div>
		{:else if error}
			<div class="hire-history-state danger" role="alert">
				<p>{error}</p>
				<button type="button" onclick={() => loadPage(vesselId, page)}>Retry</button>
			</div>
		{:else if items.length}
			<ul class="hire-history-list">
				{#each items as item, index}
					<li class="hire-history-item">
						<div class="hire-history-item-head">
							<strong>Record #{(page - 1) * pagination.pageSize + index + 1}</strong>
							<span class="hire-history-duration">
								{item?.duration?.formatted || '-'}
								{#if item?.duration?.ongoing}<em>Ongoing</em>{/if}
							</span>
						</div>
						<div class="hire-history-timeline">
							<div class="hire-history-event on">
								<span class="event-label">On Hire</span>
								<strong>{item?.on_hire?.formatted || '-'}</strong>
								<small
									>By {item?.on_hire?.by || '-'}{#if item?.on_hire?.reason}
										{' • '}{item.on_hire.reason}{/if}</small
								>
								{#if item?.on_hire?.note}<p>{item.on_hire.note}</p>{/if}
							</div>
							<div class="hire-history-event off">
								<span class="event-label">Off Hire</span>
								{#if item?.off_hire}
									<strong>{item.off_hire.formatted || '-'}</strong>
									<small
										>By {item.off_hire.by || '-'}{#if item.off_hire.reason}
											{' • '}{item.off_hire.reason}{/if}</small
									>
									{#if item.off_hire.note}<p>{item.off_hire.note}</p>{/if}
								{:else}
									<strong>-</strong>
									<small>Still on hire</small>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="hire-history-state">No hire history available for this vessel.</div>
		{/if}
	</div>
	<footer class="hire-history-pagination">
		<button
			type="button"
			onclick={() => goToPage(page - 1)}
			disabled={loading || Boolean(error) || !pagination.hasPrevPage}>Previous</button
		>
		<span>Page {page} of {pagination.totalPages}</span>
		<button
			type="button"
			onclick={() => goToPage(page + 1)}
			disabled={loading || Boolean(error) || !pagination.hasNextPage}>Next</button
		>
	</footer>
</dialog>

<style>
	.hire-history-modal {
		width: min(620px, calc(100vw - 32px));
		max-width: none;
		max-height: calc(100dvh - 40px);
		margin: auto;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--color-border, #334155);
		border-radius: 16px;
		background: var(--color-surface, #101827);
		color: var(--text-primary, #e2e8f0);
		box-shadow: 0 26px 80px rgba(0, 0, 0, 0.35);
	}
	.hire-history-modal[open] {
		display: flex;
		flex-direction: column;
	}
	.hire-history-modal::backdrop {
		background: rgba(2, 6, 23, 0.72);
		backdrop-filter: blur(8px);
	}
	.hire-history-header {
		display: flex;
		flex: 0 0 auto;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 18px;
		border-bottom: 1px solid var(--color-border, #334155);
	}
	.history-kicker {
		color: #60a5fa;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.hire-history-header h2 {
		margin: 6px 0 0;
		font-size: 18px;
		font-weight: 900;
		overflow-wrap: anywhere;
	}
	.hire-history-header p {
		margin: 5px 0 0;
		color: var(--text-secondary, #94a3b8);
		font-size: 12px;
	}
	button {
		border: 1px solid var(--color-border, #334155);
		border-radius: 9px;
		background: var(--color-elevated, #1e293b);
		color: var(--text-primary, #e2e8f0);
		font: inherit;
		font-size: 12px;
		font-weight: 700;
		padding: 8px 14px;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: #60a5fa;
	}
	button:focus-visible {
		outline: 2px solid #60a5fa;
		outline-offset: 2px;
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.hire-history-close {
		flex: 0 0 32px;
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 22px;
		line-height: 1;
	}
	.hire-history-body {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 14px;
		background: var(--color-elevated, #1e293b);
	}
	.hire-history-state {
		padding: 22px 14px;
		text-align: center;
		color: var(--text-secondary, #94a3b8);
		font-size: 13px;
		background: var(--color-surface, #101827);
		border: 1px dashed var(--color-border, #334155);
		border-radius: 12px;
	}
	.hire-history-state.danger {
		color: #9f1239;
		border-color: #fecaca;
		background: #fff1f2;
	}
	.hire-history-state p {
		margin: 0 0 12px;
	}
	.hire-history-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.hire-history-item {
		padding: 14px;
		border-radius: 12px;
		background: var(--color-surface, #101827);
		border: 1px solid var(--color-border, #334155);
	}
	.hire-history-item-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 12px;
		padding-bottom: 10px;
		border-bottom: 1px dashed var(--color-border, #334155);
		font-size: 13px;
	}
	.hire-history-duration {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted, #172d50);
		font-size: 11px;
		font-weight: 800;
	}
	.hire-history-duration em {
		font-style: normal;
		padding: 2px 7px;
		border-radius: 999px;
		background: #dcfce7;
		color: #166534;
		font-size: 10px;
	}
	.hire-history-timeline {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.hire-history-event {
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid;
		overflow-wrap: anywhere;
	}
	.hire-history-event.on {
		border-color: rgba(16, 185, 129, 0.35);
		background: rgba(16, 185, 129, 0.1);
	}
	.hire-history-event.off {
		border-color: rgba(239, 68, 68, 0.35);
		background: rgba(239, 68, 68, 0.08);
	}
	.event-label {
		display: inline-flex;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}
	.on .event-label {
		background: #dcfce7;
		color: #166534;
	}
	.off .event-label {
		background: #fee2e2;
		color: #991b1b;
	}
	.hire-history-event strong {
		display: block;
		margin-top: 8px;
		font-size: 12px;
	}
	.hire-history-event small {
		display: block;
		margin-top: 4px;
		color: var(--text-secondary, #94a3b8);
		font-size: 11px;
		line-height: 1.5;
	}
	.hire-history-event p {
		margin: 8px 0 0;
		font-size: 12px;
		line-height: 1.5;
	}
	.hire-history-pagination {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 18px;
		border-top: 1px solid var(--color-border, #334155);
	}
	.hire-history-pagination span {
		color: var(--text-secondary, #94a3b8);
		font-size: 12px;
		text-align: center;
	}
	@media (max-width: 560px) {
		.hire-history-modal {
			width: calc(100vw - 20px);
			max-height: calc(100dvh - 20px);
		}
		.hire-history-timeline {
			grid-template-columns: minmax(0, 1fr);
		}
		.hire-history-pagination {
			gap: 8px;
			padding-inline: 12px;
		}
	}
</style>
