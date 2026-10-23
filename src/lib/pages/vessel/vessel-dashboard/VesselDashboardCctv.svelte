<script>
	import CctvSnapshotImage from '$lib/components/CctvSnapshotImage.svelte';

	let { items = [], main = null, miniItems = [], loading = false, error = '', onSelect } = $props();
</script>

<div class="monitoring-card cctv-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">CCTV Monitoring</span>
			<h2>Latest Camera Snapshot</h2>
		</div>

		<strong>{loading ? 'Loading...' : `${items.length} cameras`}</strong>
	</div>

	<div class="cctv-grid" class:empty-cctv={items.length === 0 && !loading}>
		{#if loading}
			<div class="cctv-focus-layout">
				<div class="cctv-box cctv-skeleton" aria-hidden="true">
					<span></span>
					<strong></strong>
					<small></small>
				</div>

				<div class="cctv-thumbnail-row" aria-hidden="true">
					{#each Array.from({ length: 3 }, (_, index) => index) as index (index)}
						<div class="cctv-box cctv-skeleton cctv-thumb-box">
							<strong></strong>
						</div>
					{/each}
				</div>
			</div>
		{:else if items.length === 0}
			<div class="cctv-empty">
				<div class="cctv-icon">▣</div>
				<strong>CCTV is not available yet</strong>
				<span>{error || 'Latest snapshot is not available for this vessel yet.'}</span>
			</div>
		{:else}
			<div class="cctv-focus-layout">
				{#if main}
					<div
						class:offline={!main.online}
						class:has-snapshot={Boolean(main.url)}
						class="cctv-box cctv-main-box"
					>
						{#if main.url}
							<CctvSnapshotImage
								class="cctv-snapshot-img"
								src={main.url}
								filePath={main.location}
								alt={`${main.name} latest snapshot`}
								loading="eager"
							/>
						{/if}
						<div class="cctv-top">
							<span class="camera-dot" title={main.status}></span>
							<span class="cctv-status-text">{main.online ? 'Snapshot ready' : 'No snapshot'}</span>
						</div>

						<div class="cctv-content">
							<div class="cctv-icon">▣</div>
							<div class="cctv-name">{main.name}</div>
							{#if main.capturedAtText}
								<div class="cctv-location">Captured {main.capturedAtText}</div>
							{:else}
								<div class="cctv-location">{main.location}</div>
							{/if}
							{#if main.fileSizeText}
								<div class="cctv-file-size">{main.fileSizeText}</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if miniItems.length}
					<div class="cctv-thumbnail-row" aria-label="CCTV camera list">
						{#each miniItems as cctv (cctv.key)}
							<button
								type="button"
								class:offline={!cctv.online}
								class:has-snapshot={Boolean(cctv.url)}
								class="cctv-box cctv-thumb-box"
								onclick={() => onSelect?.(cctv)}
								title={`Show ${cctv.name}`}
							>
								{#if cctv.url}
									<CctvSnapshotImage
										class="cctv-snapshot-img"
										src={cctv.url}
										filePath={cctv.location}
										alt={`${cctv.name} latest snapshot`}
										loading="lazy"
									/>
								{/if}

								<div class="cctv-content">
									<div class="cctv-name">{cctv.name}</div>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
