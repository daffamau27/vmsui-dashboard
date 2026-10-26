<script>
	let {
		isPlaying = false,
		direction = 1,
		speedOptions = [],
		speed = 1,
		activeIndex = 0,
		eventCount = 0,
		bufferSegments = [],
		marks = [],
		activeMarkKey = '',
		cameraOptions = [],
		selectedCameraKeys = [],
		progress = 0,
		timeLabel = '-',
		sourceLabel = 'Trace timeline',
		marksError = '',
		showCameraFilter = true,
		showCameraMarks = true,
		onStep,
		onToggle,
		onSpeed,
		onTimelinePointerDown,
		onTimelinePointerMove,
		onTimelinePointerUp,
		onTimelineClick,
		onToggleMark,
		onOpenRecording,
		onToggleAllCameras,
		onToggleCamera
	} = $props();
</script>

<div class="playback-card" class:has-camera-filter={cameraOptions.length > 0 && showCameraFilter}>
	<div class="playback-controls">
		<button
			type="button"
			class="step-btn"
			onclick={() => onStep?.(-1)}
			disabled={!eventCount || activeIndex <= 0}
		>
			‹
		</button>

		<div class="playback-main">
			<button
				type="button"
				class="play-button"
				onclick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onToggle?.(-1);
				}}
				disabled={!eventCount}
			>
				{isPlaying && direction === -1 ? 'Pause' : 'Reverse'}
			</button>

			<button
				type="button"
				class="play-button"
				onclick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onToggle?.(1);
				}}
				disabled={!eventCount}
			>
				{isPlaying && direction === 1 ? 'Pause' : 'Play'}
			</button>
		</div>

		<div
			class="speed-controls"
			style={`--speed-index: ${speedOptions.indexOf(speed)}`}
			aria-label="Playback speed"
		>
			{#each speedOptions as option (option)}
				<button
					type="button"
					class="speed-btn"
					class:active-speed={speed === option}
					onclick={() => onSpeed?.(option)}
					disabled={!eventCount}
					aria-pressed={speed === option}
				>
					x{option}
				</button>
			{/each}
		</div>

		<button
			type="button"
			class="step-btn"
			onclick={() => onStep?.(1)}
			disabled={!eventCount || activeIndex >= eventCount - 1}
		>
			›
		</button>
	</div>

	<div class="timeline-shell">
		<div
			class="timeline"
			role="slider"
			tabindex="0"
			aria-label="Trace playback timeline"
			aria-valuemin="0"
			aria-valuemax={Math.max(eventCount - 1, 0)}
			aria-valuenow={activeIndex}
			onpointerdown={(event) => onTimelinePointerDown?.(event)}
			onpointermove={(event) => onTimelinePointerMove?.(event)}
			onpointerup={(event) => onTimelinePointerUp?.(event)}
			onpointercancel={(event) => onTimelinePointerUp?.(event)}
			onclick={(event) => onTimelineClick?.(event)}
		>
			<div class="timeline-track"></div>
			{#each bufferSegments as segment (segment.key)}
				<div
					class="timeline-buffer-segment"
					style={`left: ${segment.left}%; width: ${segment.width}%;`}
					title={`CCTV page ${segment.startPage}-${segment.endPage} loaded`}
				></div>
			{/each}
			<div class="timeline-progress" style={`width: ${progress}%`}></div>
			<div class="timeline-dot" style={`left: ${progress}%`}></div>
		</div>

		{#if showCameraMarks}
			<div class="timeline-mark-layer" aria-label="CCTV motion recording marks">
				{#each marks as mark (mark.key)}
					<div
						class="timeline-mark"
						class:open={activeMarkKey === mark.key}
						class:align-left={mark.left < 12}
						class:align-right={mark.left > 88}
						style={`left: ${mark.left}%; ${mark.pinStyle}`}
					>
						<button
							type="button"
							class="timeline-mark-trigger"
							class:active={activeMarkKey === mark.key}
							aria-label={`Show ${mark.recordings.length} recording${mark.recordings.length === 1 ? '' : 's'} grouped around ${mark.startedAtText}`}
							aria-expanded={activeMarkKey === mark.key}
							onpointerdown={(event) => event.stopPropagation()}
							onclick={(event) => onToggleMark?.(mark, event)}
						>
							<span class="timeline-mark-pin" aria-hidden="true"></span>
						</button>

						{#if activeMarkKey === mark.key}
							<div
								class="timeline-mark-popup"
								class:single-camera={mark.recordings.length === 1}
								class:two-cameras={mark.recordings.length === 2}
								class:four-cameras={mark.recordings.length === 4}
								class:many-recordings={mark.recordings.length > 4}
								role="group"
								aria-label={`Camera recording group around ${mark.startedAtText}`}
							>
								<div class="timeline-mark-popup-header">
									<strong
										>{mark.recordings.length} recording{mark.recordings.length === 1
											? ''
											: 's'}</strong
									>
									<small
										>{mark.cameraCount} camera{mark.cameraCount === 1 ? '' : 's'} - {mark.startedAtText}</small
									>
								</div>

								<div class="timeline-mark-camera-grid">
									{#each mark.recordings as recording (recording.key)}
										<button
											type="button"
											class="timeline-mark-camera"
											style={recording.style}
											onclick={(event) => onOpenRecording?.(recording, event)}
											aria-label={`Play recording from ${recording.cameraName}`}
										>
											<span class="timeline-mark-thumbnail">
												{#if recording.thumbnailUrl}
													<img
														src={recording.thumbnailUrl}
														alt={`Motion thumbnail from ${recording.cameraName}`}
														loading="lazy"
														draggable="false"
													/>
												{:else}
													<span class="timeline-mark-no-image">No thumbnail</span>
												{/if}
											</span>
											<span class="timeline-mark-copy">
												<strong>{recording.cameraName}</strong>
												<small>{recording.startedAtText}</small>
											</span>
										</button>
									{/each}
								</div>
							</div>
							<span class="timeline-mark-popup-pointer" aria-hidden="true"></span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if cameraOptions.length && showCameraFilter}
		<details class="timeline-camera-filter">
			<summary aria-label="Filter timeline markers by camera">
				<span class="timeline-camera-filter-title">Camera</span>
				<strong>
					{selectedCameraKeys.length === cameraOptions.length
						? 'All'
						: `${selectedCameraKeys.length} camera${selectedCameraKeys.length === 1 ? '' : 's'}`}
				</strong>
				<span class="timeline-camera-filter-chevron" aria-hidden="true">⌄</span>
			</summary>
			<div class="timeline-camera-filter-options">
				<label class="timeline-camera-option all-cameras">
					<input
						type="checkbox"
						checked={selectedCameraKeys.length === cameraOptions.length}
						onchange={(event) => onToggleAllCameras?.(event.currentTarget.checked)}
					/>
					<span class="timeline-camera-checkbox" aria-hidden="true"></span>
					<span class="timeline-camera-name">All</span>
				</label>

				{#each cameraOptions as camera (camera.key)}
					<label class="timeline-camera-option" style={camera.optionStyle} title={camera.name}>
						<input
							type="checkbox"
							checked={selectedCameraKeys.includes(camera.key)}
							onchange={(event) => onToggleCamera?.(camera.key, event.currentTarget.checked)}
						/>
						<span class="timeline-camera-checkbox" aria-hidden="true"></span>
						<span class="timeline-camera-name">{camera.name}</span>
					</label>
				{/each}
			</div>
		</details>
	{/if}

	<div class="timeline-time">
		<span
			>{activeIndex + 1}/{eventCount || 0} • {sourceLabel}{showCameraMarks && marks.length
				? ` • ${marks.length} marks`
				: showCameraMarks && marksError
					? ' • marks unavailable'
					: ''}</span
		>
		<strong>{timeLabel}</strong>
	</div>
</div>
