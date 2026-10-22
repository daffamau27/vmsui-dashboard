<script>
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { slideScale } from '$lib/utils/modalTransition.js';
	import './audit-log-page.css';

	let {
		open = false,
		loading = false,
		detail = null,
		formatDateTime,
		formatModule,
		onClose
	} = $props();
</script>

{#if open}
	<div
		class="detail-overlay"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) onClose?.();
		}}
		transition:fade={{ duration: 220, easing: cubicOut }}
	>
		<div
			class="detail-modal"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			in:slideScale={{ intro: true, distance: 480, start: 0.6, duration: 280 }}
			out:slideScale={{ intro: false, distance: 480, start: 0.6, fadeAt: 0.3, duration: 280 }}
		>
			<div class="detail-header">
				<div>
					<span class="section-kicker">Detail</span>
					<h2>Audit Log Detail</h2>
				</div>

				<button type="button" class="close-btn" onclick={() => onClose?.()}> × </button>
			</div>

			<div class="detail-body">
				{#if loading}
					<LoadingSkeleton label="Loading audit detail" variant="audit-log-detail" />
				{:else if detail}
					<div class="detail-grid">
						<div>
							<span>Audit ID</span>
							<strong>{detail.id || '-'}</strong>
						</div>

						<div>
							<span>User</span>
							<strong>{detail.user?.username || '-'}</strong>
						</div>

						<div>
							<span>Action</span>
							<strong>{detail.action || '-'}</strong>
						</div>

						<div>
							<span>Module</span>
							<strong>{formatModule?.(detail.module)}</strong>
						</div>

						<div>
							<span>Entity Name</span>
							<strong>{detail.entity?.entity_name || '-'}</strong>
						</div>

						<div>
							<span>Entity ID</span>
							<strong>{detail.entity?.entity_id || '-'}</strong>
						</div>

						<div>
							<span>Logged At</span>
							<strong>{formatDateTime?.(detail.logged_at)}</strong>
						</div>
					</div>

					<div class="changes-card">
						<div class="section-header compact">
							<div>
								<span class="section-kicker">Changes</span>
								<h2>Modification Detail</h2>
							</div>

							<strong>{detail.changes?.length || 0} items</strong>
						</div>

						{#if detail.changes?.length}
							<pre>{JSON.stringify(detail.changes, null, 2)}</pre>
						{:else}
							<div class="empty-box">No change details are available.</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
