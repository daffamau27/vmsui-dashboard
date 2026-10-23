<script>
	import { resolve } from '$app/paths';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { getVesselPath } from '$lib/utils/appRoutes.js';

	let {
		activeLabel = '-',
		permissionLoading = true,
		visibleVesselMenus = [],
		activeMenuKey = '',
		status = {},
		canManageHireStatus = false,
		selectedHireIsOn = false,
		selectedHireStatusKnown = false,
		hireStatusLoading = false,
		selectedHireLabel = '-',
		hireStatusToggleTitle = '',
		latestVesselStatus = {},
		selectedVessel = '-',
		selectedVesselId = null,
		hasSelectedVessel = false,
		vessels = [],
		filteredVessels = [],
		vesselLoading = false,
		vesselError = '',
		menuOpen = $bindable(false),
		vesselDropdownOpen = $bindable(false),
		vesselSearch = $bindable(''),
		focusedVesselIndex = $bindable(-1),
		vesselMenuElement = $bindable(null),
		vesselSearchInputElement = $bindable(null),
		onSelectMenu,
		onToggleVesselDropdown,
		onVesselSelectorKeydown,
		onVesselDropdownKeydown,
		onVesselSearchKeydown,
		onSelectVessel,
		onOpenHireStatusModal,
		onOpenHireHistory
	} = $props();
</script>

<header class="vessel-topbar" class:dropdown-open={menuOpen || vesselDropdownOpen}>
	<div class="topbar-left">
		<div class="dropdown">
			<button type="button" class="dropdown-button" onclick={() => (menuOpen = !menuOpen)}>
				<span class="menu-icon" aria-hidden="true">▦</span>
				<span class="selector-copy">
					<small>Workspace</small>
					<strong>{activeLabel}</strong>
				</span>
				<span>▾</span>
			</button>

			{#if menuOpen}
				<div class="dropdown-menu">
					{#if permissionLoading}
						<div class="dropdown-empty">
							<LoadingSkeleton label="Loading menu" variant="list" rows={3} compact />
						</div>
					{:else if visibleVesselMenus.length}
						{#each visibleVesselMenus as menu (menu.key)}
							<a
								href={resolve(getVesselPath(menu.key))}
								aria-current={activeMenuKey === menu.key ? 'page' : undefined}
								data-sveltekit-noscroll
								class="dropdown-item"
								class:active-item={activeMenuKey === menu.key}
								onclick={(event) => onSelectMenu?.(event, menu.key)}
							>
								<span>{menu.label}</span>
								{#if activeMenuKey === menu.key}
									<span class="active-check">✓</span>
								{/if}
							</a>
						{/each}
					{:else}
						<div class="dropdown-empty">No menu access.</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="topbar-table telemetry-count-card">
			<div class="topbar-table-title">Telemetry Data Count ({status.dataReceivedTotal})</div>
			<div class="topbar-table-grid two-cols">
				<span>Received</span>
				<span>Queue</span>
				<strong>{status.dataReceivedReceived}</strong>
				<strong>{status.queue}</strong>
			</div>
		</div>

		<div class="topbar-table sd-card-card">
			<div class="topbar-table-title">
				<span
					class:available-dot={status.sdCardAvailable}
					class:unavailable-dot={!status.sdCardAvailable}
					class="sd-available-dot"
				></span>
				Storage
			</div>
			<div class="topbar-table-grid two-cols">
				<span>Used</span>
				<span>Capacity</span>
				<strong>{status.sdCardUsed}</strong>
				<strong>{status.sdCardCapacity}</strong>
			</div>
		</div>

		<div class="topbar-item online-box" class:offline-box={!status.online}>
			<span class="dot"></span>
			<span class="status-copy">
				<small>Connection</small>
				<strong>{status.online ? 'Online' : 'Offline'}</strong>
			</span>
		</div>

		{#if canManageHireStatus}
			<button
				type="button"
				class="hire-status-toggle manager-detail"
				class:on-hire={selectedHireIsOn}
				class:off-hire={!selectedHireIsOn}
				onclick={() => onOpenHireStatusModal?.()}
				disabled={!hasSelectedVessel ||
					!selectedHireStatusKnown ||
					hireStatusLoading ||
					permissionLoading}
				aria-pressed={selectedHireIsOn}
				title={hireStatusToggleTitle}
			>
				<span class="hire-toggle-track" aria-hidden="true">
					<span></span>
				</span>
				<span class="hire-manager-grid">
					<span class="hire-detail-item status-detail">
						<small>Hire Status</small>
						<strong>{hireStatusLoading ? 'Updating...' : selectedHireLabel}</strong>
					</span>
					<span class="hire-detail-item upcoming-detail">
						<small>{latestVesselStatus.hireUpcomingLabel}</small>
						<strong title={latestVesselStatus.hireUpcoming || '-'}>
							{latestVesselStatus.hireUpcoming || '-'}
						</strong>
					</span>
					<span class="hire-detail-item changed-by-detail">
						<small>Changed By</small>
						<strong title={latestVesselStatus.hireChangedBy}
							>{latestVesselStatus.hireChangedBy}</strong
						>
					</span>
				</span>
			</button>
		{:else}
			<div
				class="hire-status-display"
				class:on-hire={selectedHireIsOn}
				class:off-hire={!selectedHireIsOn}
				role="status"
				title="Hire status"
			>
				<span class="hire-status-dot" aria-hidden="true"></span>
				<span class="hire-toggle-copy">
					<small>Hire Status</small>
					<strong>{selectedHireLabel}</strong>
				</span>
			</div>
		{/if}

		{#if canManageHireStatus}
			<button
				type="button"
				class="hire-history-topbar-button"
				onclick={() => onOpenHireHistory?.()}
				disabled={permissionLoading || !hasSelectedVessel}
				title={`View hire history for ${selectedVessel}`}
				aria-label="Hire History"
				aria-haspopup="dialog"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					aria-hidden="true"
				>
					<path
						d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span>Hire History</span>
			</button>
		{/if}
	</div>

	<div class="vessel-dropdown">
		<button
			type="button"
			class="vessel-selector"
			onclick={() => onToggleVesselDropdown?.()}
			onkeydown={(event) => onVesselSelectorKeydown?.(event)}
		>
			<span class="vessel-selector-icon" aria-hidden="true">🚢</span>
			<span class="selector-copy">
				<strong>{selectedVessel}</strong>
			</span>
			<span>▾</span>
		</button>

		{#if vesselDropdownOpen}
			<div
				class="vessel-menu"
				bind:this={vesselMenuElement}
				onkeydown={(event) => onVesselDropdownKeydown?.(event)}
				role="listbox"
				aria-label="Vessel list"
				tabindex="-1"
			>
				{#if vesselLoading}
					<div class="vessel-state">
						<LoadingSkeleton label="Loading vessels" variant="list" rows={4} compact />
					</div>
				{:else if vesselError}
					<div class="vessel-state error">{vesselError}</div>
				{:else if vessels.length === 0}
					<div class="vessel-state">No vessels available</div>
				{:else}
					<div class="vessel-search-box">
						<input
							type="search"
							placeholder="Search vessel..."
							aria-label="Search vessel"
							bind:value={vesselSearch}
							bind:this={vesselSearchInputElement}
							onkeydown={(event) => onVesselSearchKeydown?.(event)}
						/>
						{#if vesselSearch}
							<button
								type="button"
								class="vessel-search-clear"
								aria-label="Clear vessel search"
								onclick={() => (vesselSearch = '')}
							>
							</button>
						{/if}
					</div>

					{#if filteredVessels.length === 0}
						<div class="vessel-state">No vessel found.</div>
					{:else}
						{#each filteredVessels as vessel, index (vessel.id ?? vessel.vesselId ?? index)}
							<button
								type="button"
								class="vessel-item"
								class:active-vessel={Number(selectedVesselId) === Number(vessel.id)}
								class:keyboard-active={focusedVesselIndex === index &&
									Number(selectedVesselId) !== Number(vessel.id)}
								data-vessel-option-index={index}
								role="option"
								aria-selected={focusedVesselIndex === index}
								onmouseenter={() => (focusedVesselIndex = index)}
								onclick={() => onSelectVessel?.(vessel)}
							>
								<span class="vessel-item-icon" aria-hidden="true">🚢</span>
								<span class="vessel-item-copy">
									<strong>{vessel.vesselName || vessel.name}</strong>
									<small>{vessel.companyName || vessel.deviceName || 'Vessel monitoring'}</small>
								</span>
								{#if Number(selectedVesselId) === Number(vessel.id)}
									<span class="active-check">✓</span>
								{/if}
							</button>
						{/each}
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</header>
