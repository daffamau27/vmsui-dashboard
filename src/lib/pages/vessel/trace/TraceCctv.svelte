<script>
	import { fade, scale } from 'svelte/transition';
	import CctvSnapshotImage from '$lib/components/CctvSnapshotImage.svelte';

	let {
		mainPanel = null,
		miniPanels = [],
		error = '',
		loadedCount = 0,
		total = 0,
		buffering = false,
		playbackBuffering = false,
		renderTick = 0,
		loadImage,
		onSelect
	} = $props();
</script>

<section class="monitor-card cctv-card">
	<div class="card-header">
		<div>
			<div class="card-title">CCTV Monitoring</div>
			<div class="card-subtitle" class:cctv-error-text={Boolean(error)}>
				{error ||
					`${loadedCount}/${total || loadedCount} snapshot records loaded${playbackBuffering ? ' • preparing playback...' : buffering ? ' • loading next pages...' : ''}`}
			</div>
		</div>
	</div>

	<div class="cctv-layout">
		{#if mainPanel}
			<div class="cctv-focus-layout">
				<article
					class="cctv-camera-panel cctv-camera-main"
					data-render-tick={renderTick}
					class:offline={!mainPanel.frame?.online || mainPanel.failed}
					class:has-snapshot={Boolean(mainPanel.frame?.url)}
					class:frame-pending={mainPanel.pending}
					in:scale={{ start: 0.98, duration: 150 }}
				>
					<div class="cctv-camera-frame">
						{#if mainPanel.frame?.url && !mainPanel.failed}
							<CctvSnapshotImage
								class="cctv-camera-image"
								src={mainPanel.frame.url}
								filePath={mainPanel.frame.filePath}
								frameKey={mainPanel.frame.key}
								{renderTick}
								alt={`${mainPanel.name} snapshot`}
								loading="eager"
								{loadImage}
							/>
						{/if}

						{#if mainPanel.pending}
							<div class="cctv-frame-loading" aria-live="polite">
								<span aria-hidden="true"></span>
								<small>Loading frame...</small>
							</div>
						{:else if mainPanel.failed}
							<div class="cctv-frame-loading"><small>Snapshot unavailable</small></div>
						{/if}

						<div class="cctv-scanline"></div>
					</div>

					<div class="cctv-camera-info">
						<strong>{mainPanel.name}</strong>
						<span
							>{mainPanel.pending
								? 'Loading frame...'
								: mainPanel.frame
									? mainPanel.frame.timeText
									: 'No frame yet'}</span
						>
						<small>{mainPanel.loadedCount} snapshots available</small>
					</div>
				</article>

				{#if miniPanels.length}
					<div class="cctv-thumbnail-row" aria-label="CCTV cameras">
						{#each miniPanels as panel (panel.key)}
							<button
								type="button"
								class="cctv-camera-panel cctv-camera-thumb"
								data-render-tick={renderTick}
								class:offline={!panel.frame?.online || panel.failed}
								class:has-snapshot={Boolean(panel.frame?.url)}
								class:frame-pending={panel.pending}
								onclick={() => onSelect?.(panel.key)}
								title={`Show ${panel.name}`}
							>
								<div class="cctv-camera-frame">
									{#if panel.frame?.url && !panel.failed}
										<CctvSnapshotImage
											class="cctv-camera-image"
											src={panel.frame.url}
											filePath={panel.frame.filePath}
											frameKey={panel.frame.key}
											{renderTick}
											alt={`${panel.name} snapshot`}
											loading="eager"
											{loadImage}
										/>
									{/if}

									{#if panel.pending}
										<div class="cctv-frame-loading compact" aria-live="polite">
											<span aria-hidden="true"></span>
										</div>
									{:else if panel.failed}
										<div class="cctv-frame-loading compact">
											<small>Snapshot unavailable</small>
										</div>
									{/if}

									<div class="cctv-scanline"></div>
								</div>

								<div class="cctv-camera-info">
									<strong>{panel.name}</strong>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="cctv-main-shell cctv-empty-shell" in:fade={{ duration: 150 }}>
				<div class="cctv-main offline cctv-empty-main">
					<div class="cctv-overlay">
						<span class="camera-name">No CCTV snapshot</span>
						<span class="camera-status">Choose a range and load trace</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
</section>
