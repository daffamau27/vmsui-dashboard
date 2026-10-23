<script>
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { slideScale } from '$lib/utils/modalTransition.js';

	let {
		open = false,
		loading = false,
		error = '',
		vesselLabel = '-',
		items = [],
		pagination = {},
		page = 1,
		onClose,
		onPrev,
		onNext
	} = $props();
</script>

{#if open}
	<div
		class="hire-history-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) onClose?.();
		}}
		transition:fade={{ duration: 220, easing: cubicOut }}
	>
		<section
			class="hire-history-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="hire-history-title"
			tabindex="-1"
			in:slideScale={{ intro: true, distance: 480, start: 0.6, duration: 280 }}
			out:slideScale={{ intro: false, distance: 480, start: 0.6, fadeAt: 0.3, duration: 280 }}
		>
			<header class="hire-history-header">
				<div>
					<span class="page-kicker">Hire History</span>
					<h2 id="hire-history-title">{vesselLabel}</h2>
					<p>{pagination.totalItems || 0} record(s) found</p>
				</div>
				<button
					type="button"
					class="hire-history-close"
					onclick={() => onClose?.()}
					disabled={loading}
					aria-label="Close hire history">×</button
				>
			</header>

			<div class="hire-history-body">
				{#if loading}
					<div class="hire-history-state">Loading hire history...</div>
				{:else if error}
					<div class="hire-history-state danger" role="alert">{error}</div>
				{:else if items.length}
					<ul class="hire-history-list">
						{#each items as item, index (index)}
							<li class="hire-history-item">
								<div class="hire-history-item-head">
									<strong>Record #{index + 1}</strong>
									<span class="hire-history-duration">
										{item?.duration?.formatted || '-'}
										{#if item?.duration?.ongoing}
											<em>Ongoing</em>
										{/if}
									</span>
								</div>

								<div class="hire-history-timeline">
									<div class="hire-history-event on">
										<span class="event-label">On Hire</span>
										<strong>{item?.on_hire?.formatted || '-'}</strong>
										<small>
											By {item?.on_hire?.by || '-'}
											{#if item?.on_hire?.reason}
												• {item.on_hire.reason}{/if}
										</small>
										{#if item?.on_hire?.note}
											<p>{item.on_hire.note}</p>
										{/if}
									</div>

									<div class="hire-history-event off">
										<span class="event-label">Off Hire</span>
										{#if item?.off_hire}
											<strong>{item?.off_hire?.formatted || '-'}</strong>
											<small>
												By {item?.off_hire?.by || '-'}
												{#if item?.off_hire?.reason}
													• {item.off_hire.reason}{/if}
											</small>
											{#if item?.off_hire?.note}
												<p>{item.off_hire.note}</p>
											{/if}
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
					class="secondary-button"
					onclick={() => onPrev?.()}
					disabled={!pagination.hasPrevPage || loading}
				>
					Previous
				</button>

				<span>Page {pagination.page || page} of {pagination.totalPages || 1}</span>

				<button
					type="button"
					class="secondary-button"
					onclick={() => onNext?.()}
					disabled={!pagination.hasNextPage || loading}
				>
					Next
				</button>
			</footer>
		</section>
	</div>
{/if}
