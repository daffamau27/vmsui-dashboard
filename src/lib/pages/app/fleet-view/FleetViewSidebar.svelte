<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import FleetViewSidebarHeader from './FleetViewSidebarHeader.svelte';
	import {
		formatLastUpdated,
		getTelemetryUtcLabel,
		isOffHireStatus,
		isOnHireStatus,
		normalizeHireStatus,
		stripUtcLabel
	} from './fleetViewFormat.js';

	let {
		search = $bindable(''),
		statusFilter = $bindable('all'),
		vessels = [],
		loading = false,
		selectedId = null,
		listElement = $bindable(),
		onlineCount = 0,
		offlineCount = 0,
		totalCount = 0,
		open = true,
		onSelect = () => {},
		onCloseMobile = () => {}
	} = $props();

	function formatLastUpdatedBadge(value, timezoneHint = null) {
		return stripUtcLabel(formatLastUpdated(value, timezoneHint));
	}

	function hasValidVesselCoordinate(vessel) {
		const lat = Number(vessel?.lat ?? vessel?.latitude);
		const lng = Number(vessel?.lng ?? vessel?.longitude);

		return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
	}
</script>

<aside class:sidebar-open={open} class:sidebar-collapsed={!open} class="fleet-sidebar">
	<div class="sidebar-fixed">
		<FleetViewSidebarHeader
			{statusFilter}
			{onlineCount}
			{offlineCount}
			{totalCount}
			bind:search
			onFilter={(value) => (statusFilter = value)}
			{onCloseMobile}
		/>
	</div>

	<div class="vessel-list" bind:this={listElement}>
		{#if loading && !vessels.length}
			<LoadingSkeleton label="Loading fleet vessels" variant="fleet-list" rows={7} compact />
		{:else}
			{#each vessels as vessel (vessel.id)}
				<article
					data-vessel-id={String(vessel.id)}
					class:selected-card={String(selectedId) === String(vessel.id)}
					class:offline-card={!vessel.online}
					class="vessel-card"
				>
					<button
						type="button"
						class:selected-select={String(selectedId) === String(vessel.id)}
						class:offline-select={!vessel.online}
						class="vessel-select"
						aria-pressed={String(selectedId) === String(vessel.id)}
						onclick={() => onSelect(vessel.id)}
					>
						<div class="vessel-main-row">
							<div class="vessel-identity">
								<span class:online={vessel.online} class:offline={!vessel.online} class="status-dot"
								></span>

								<div class="vessel-name-block">
									<h3>{vessel.name}</h3>
									<p>Last Updated:</p>
									<p>{formatLastUpdatedBadge(vessel.lastUpdated, vessel.timezone)}</p>
								</div>
							</div>

							<div class="vessel-card-tools">
								<span class="vessel-utc-badge">{getTelemetryUtcLabel(vessel)}</span>
								<div
									class="location-button"
									class:has-coordinate={hasValidVesselCoordinate(vessel)}
									title={hasValidVesselCoordinate(vessel)
										? 'Coordinate available'
										: 'Coordinate unavailable'}
									aria-label={hasValidVesselCoordinate(vessel)
										? 'Coordinate available'
										: 'Coordinate unavailable'}
								></div>
								<span
									class:on-hire={isOnHireStatus(vessel.hireStatus)}
									class:off-hire={isOffHireStatus(vessel.hireStatus)}
									class:unknown-hire={!isOnHireStatus(vessel.hireStatus) &&
										!isOffHireStatus(vessel.hireStatus)}
									class="vessel-hire-badge"
								>
									{normalizeHireStatus(vessel.hireStatus)}
								</span>
							</div>
						</div>
					</button>
				</article>
			{/each}
		{/if}
	</div>
</aside>
