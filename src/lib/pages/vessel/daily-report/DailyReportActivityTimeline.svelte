<script>
	let { statusGroups = [], clutchGroups = [], canViewClutchInChart = false } = $props();

	function isOnStatus(status) {
		return String(status || '').toUpperCase() === 'ON';
	}

	function isOffStatus(status) {
		return String(status || '').toUpperCase() === 'OFF';
	}

	function formatDurationSeconds(seconds) {
		const value = Number(seconds || 0);
		if (!Number.isFinite(value) || value <= 0) return '0s';

		const hours = Math.floor(value / 3600);
		const minutes = Math.floor((value % 3600) / 60);
		const remainingSeconds = Math.floor(value % 60);

		if (hours > 0) return `${hours}h ${minutes}m`;
		if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;

		return `${remainingSeconds}s`;
	}

	function normalizeEngineKey(value) {
		return String(value || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ');
	}

	function getTimelineGroupByEngine(groups = [], engineName) {
		const key = normalizeEngineKey(engineName);

		if (!key) return null;

		return (
			groups.find((group) => normalizeEngineKey(group?.engineName) === key) ||
			groups.find((group) => {
				const groupKey = normalizeEngineKey(group?.engineName);
				return groupKey.includes(key) || key.includes(groupKey);
			}) ||
			null
		);
	}

	function hasClutchInTimelineData(group) {
		const segments = Array.isArray(group?.segments) ? group.segments : [];

		return segments.some((segment) => isOnStatus(segment?.status));
	}

	function formatClutchStatus(status) {
		const value = String(status || '-')
			.trim()
			.toUpperCase();
		if (value === 'ON') return 'IN';
		if (value === 'OFF') return 'OUT';
		return value || '-';
	}
</script>

<section class="table-section engine-status-chart-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Chart</span>
			<h2>Engine Activity Timeline</h2>
		</div>

		<strong>{statusGroups.length} engines</strong>
	</div>

	{#if statusGroups.length}
		<div class="compact-status-list">
			<div class="compact-status-legend">
				<span><i class="legend-on"></i> ON</span>
				<span><i class="legend-off"></i> OFF</span>
			</div>

			{#each statusGroups as group, groupIndex (groupIndex)}
				<div class="compact-status-row">
					<div class="compact-engine-name">
						<strong>{group.engineName}</strong>
						<span>{formatDurationSeconds(group.totalSeconds)}</span>
					</div>

					<div
						class="compact-timeline-area"
						class:engine-timeline-area={canViewClutchInChart &&
							hasClutchInTimelineData(getTimelineGroupByEngine(clutchGroups, group.engineName))}
					>
						<div class="compact-transition-labels">
							{#each group.transitionLabels as label, labelIndex (labelIndex)}
								<span
									class="compact-transition-label"
									style={`left: ${label.leftPercent}%;`}
									title={`${label.time} · ${label.status}`}
								>
									{label.time}
								</span>
							{/each}
						</div>

						<div class="compact-timeline">
							{#each group.segments as segment, segmentIndex (segmentIndex)}
								<div
									class="compact-segment"
									class:on-segment={isOnStatus(segment.status)}
									class:off-segment={isOffStatus(segment.status)}
									style={`width: ${segment.widthPercent}%;`}
									title={`${segment.status} | ${segment.start} - ${segment.end} | ${segment.duration}`}
								>
									{#if segment.widthPercent >= 12}
										<span>{segment.status}</span>
									{/if}
								</div>
							{/each}
						</div>

						<div class="compact-axis">
							<span>{group.segments[0]?.start || '-'}</span>
							<span>{group.segments[group.segments.length - 1]?.end || '-'}</span>
						</div>
					</div>

					{#each [getTimelineGroupByEngine(clutchGroups, group.engineName)] as clutchGroup, clutchGroupIndex (clutchGroupIndex)}
						{#if canViewClutchInChart && hasClutchInTimelineData(clutchGroup)}
							<div class="compact-timeline-area clutch-timeline-area">
								<div class="compact-transition-labels">
									{#each clutchGroup.transitionLabels as label, labelIndex (labelIndex)}
										<span
											class="compact-transition-label clutch-transition-label"
											style={`left: ${label.leftPercent}%;`}
											title={`${label.time} | ${formatClutchStatus(label.status)}`}
										>
											{label.time}
										</span>
									{/each}
								</div>

								<div class="compact-timeline clutch-timeline">
									{#each clutchGroup.segments as segment, segmentIndex (segmentIndex)}
										<div
											class="compact-segment clutch-segment"
											class:on-segment={isOnStatus(segment.status)}
											class:off-segment={isOffStatus(segment.status)}
											style={`width: ${segment.widthPercent}%;`}
											title={`Clutch ${formatClutchStatus(segment.status)} | ${segment.start} - ${segment.end} | ${segment.duration}`}
										>
											{#if segment.widthPercent >= 12}
												<span>{formatClutchStatus(segment.status)}</span>
											{/if}
										</div>
									{/each}
								</div>

								<div class="compact-axis">
									<span>{clutchGroup.segments[0]?.start || '-'}</span>
									<span>{clutchGroup.segments[clutchGroup.segments.length - 1]?.end || '-'}</span>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty-box">Engine Activity timeline is not available yet.</div>
	{/if}
</section>
