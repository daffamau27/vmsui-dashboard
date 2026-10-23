<script>
	let {
		statusFilter = 'all',
		onlineCount = 0,
		offlineCount = 0,
		totalCount = 0,
		search = $bindable(''),
		onFilter,
		onCloseMobile
	} = $props();
</script>

<div class="sidebar-header">
	<div class="sidebar-title-wrap">
		<div class="sidebar-icon">FL</div>
		<div>
			<h1>Vessels</h1>
			<p>Fleet monitoring</p>
		</div>
	</div>

	<button type="button" class="sidebar-close-btn" onclick={() => onCloseMobile?.()}> A- </button>
</div>

<div class="fleet-stats">
	<button
		type="button"
		class:active-filter={statusFilter === 'online'}
		class="stat-chip"
		onclick={() => onFilter?.('online')}
	>
		<span class="chip-dot online"></span>
		{onlineCount}
	</button>

	<button
		type="button"
		class:active-filter={statusFilter === 'offline'}
		class="stat-chip"
		onclick={() => onFilter?.('offline')}
	>
		<span class="chip-dot offline"></span>
		{offlineCount}
	</button>

	<button
		type="button"
		class:active-filter={statusFilter === 'all'}
		class="stat-chip total-chip"
		onclick={() => onFilter?.('all')}
	>
		Total: {totalCount}
	</button>
</div>

<div class="search-box">
	<input type="text" placeholder="Search vessel..." bind:value={search} />
</div>
