<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import './avs-page.css';

	let {
		devices = [],
		filteredDevices = [],
		selectedDeviceIds = [],
		selectAllDevices = false,
		devicesLoading = false,
		search = $bindable(''),
		onToggleAll,
		onToggleSingle
	} = $props();
</script>

<aside class="vessel-panel">
	<div class="section-header">
		<div>
			<span class="section-kicker">Vessels</span>
			<h2>Select Vessel</h2>
		</div>

		<strong>{selectedDeviceIds.length}/{devices.length}</strong>
	</div>

	<div class="vessel-tools">
		<input type="search" placeholder="Search vessel..." bind:value={search} />

		<label class="check-row">
			<input
				type="checkbox"
				checked={selectAllDevices}
				onchange={(event) => onToggleAll?.(event.currentTarget.checked)}
			/>
			<span>Select all vessels</span>
		</label>
	</div>

	<div class="vessel-list">
		{#if devicesLoading}
			<LoadingSkeleton label="Loading vessels" variant="all-vessel-vessel-list" rows={6} compact />
		{:else if filteredDevices.length}
			{#each filteredDevices as device (device.id)}
				<label
					class="vessel-check-card"
					class:selected-vessel={selectedDeviceIds.includes(device.id)}
				>
					<input
						type="checkbox"
						checked={selectedDeviceIds.includes(device.id)}
						onchange={(event) => onToggleSingle?.(device.id, event.currentTarget.checked)}
					/>

					<span class="vessel-info">
						<strong>{device.name}</strong>
					</span>
				</label>
			{/each}
		{:else}
			<div class="empty-box">No vessels available.</div>
		{/if}
	</div>
</aside>
