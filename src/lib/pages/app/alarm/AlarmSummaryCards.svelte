<script>
	let { vesselCount = 0, activeCount = 0, newCount = 0, eventCount = 0 } = $props();
</script>

<section class="alarm-summary-grid">
	<article class="summary-card">
		<span>Active Alarm Vessels</span>
		<strong>{vesselCount}</strong>
	</article>

	<article class="summary-card">
		<span>Active Alarms</span>
		<strong>{activeCount}</strong>
	</article>

	<article class="summary-card">
		<span>New Alarms</span>
		<strong>{newCount}</strong>
	</article>

	<article class="summary-card">
		<span>Historical Events</span>
		<strong>{eventCount}</strong>
	</article>
</section>

<style>
	.alarm-summary-grid {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.summary-card {
		min-height: 82px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.summary-card span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.summary-card strong {
		display: block;
		margin-top: 10px;
		color: var(--text-primary);
		font-size: 20px;
		line-height: 1;
		font-weight: 900;
	}

	@media (max-width: 1100px) {
		.alarm-summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.alarm-summary-grid {
			grid-template-columns: 1fr;
			gap: 10px;
		}
	}
</style>
