<script>
	import { onMount } from 'svelte';

	let skeletonRoot;
	let shimmerFrame;

	onMount(() => {
		if (!skeletonRoot || typeof window === 'undefined') return;

		const duration = 1150;
		const minX = -145;
		const maxX = 305;

		function setShimmerPosition(now) {
			const progress = (now % duration) / duration;
			const x = minX + (maxX - minX) * progress;
			const fadeIn = Math.min(progress / 0.14, 1);
			const fadeOut = progress > 0.82 ? Math.max((1 - progress) / 0.18, 0) : 1;
			const opacity = Math.max(0, Math.min(1, fadeIn * fadeOut));

			skeletonRoot.style.setProperty('--skeleton-sweep-x', `${x}%`);
			skeletonRoot.style.setProperty('--skeleton-sweep-opacity', `${opacity}`);

			shimmerFrame = window.requestAnimationFrame(setShimmerPosition);
		}

		shimmerFrame = window.requestAnimationFrame(setShimmerPosition);

		return () => {
			if (shimmerFrame) window.cancelAnimationFrame(shimmerFrame);
		};
	});

	let {
		label = 'Loading data...',
		variant = 'card',
		rows = 3,
		columns = 3,
		compact = false,
		class: className = ''
	} = $props();

	function range(count) {
		return Array.from({ length: Math.max(1, Number(count) || 1) });
	}

	function safeCount(count) {
		return Math.max(1, Number(count) || 1);
	}
</script>


<div
	bind:this={skeletonRoot}
	class={`loading-skeleton ${variant} ${compact ? 'compact' : ''} ${className}`}
	role="status"
	aria-live="polite"
	aria-busy="true"
>
	<span class="sr-only">{label}</span>

	{#if variant === 'inline'}
		<span class="skeleton-pill"></span>
	{:else if variant === 'daily-report'}
		<div class="daily-report-skeleton">
			<div class="daily-skeleton-summary-grid">
				{#each range(8) as _, index}
					<article class="daily-skeleton-summary-card" style={`--skeleton-delay: ${index * 55}ms`}>
						<span class="daily-skeleton-line label"></span>
						<span class="daily-skeleton-line value"></span>
					</article>
				{/each}
			</div>

			<div class="daily-skeleton-speed-grid">
				{#each range(3) as _, index}
					<article class="daily-skeleton-speed-card" style={`--skeleton-delay: ${index * 60}ms`}>
						<span class="daily-skeleton-line label"></span>
						<span class="daily-skeleton-line value small"></span>
					</article>
				{/each}
			</div>

			<section class="daily-skeleton-panel daily-trip-skeleton">
				<div class="daily-skeleton-section-header">
					<div>
						<span class="daily-skeleton-pill small"></span>
						<span class="daily-skeleton-line heading"></span>
					</div>
					<span class="daily-skeleton-pill"></span>
				</div>

				<div class="daily-trip-skeleton-content">
					<article class="daily-trip-route-skeleton-card">
						<div class="daily-card-header-skeleton">
							<span class="daily-skeleton-line label"></span>
							<span class="daily-skeleton-line medium"></span>
						</div>
						<div class="daily-skeleton-map">
							<span class="daily-skeleton-map-route"></span>
							<span class="daily-skeleton-map-pin start"></span>
							<span class="daily-skeleton-map-pin end"></span>
						</div>
					</article>

					<article class="daily-trip-detail-skeleton-card">
						<div class="daily-trip-detail-grid">
							{#each range(6) as _, index}
								<div style={`--skeleton-delay: ${index * 45}ms`}>
									<span class="daily-skeleton-line label"></span>
									<span class="daily-skeleton-line medium"></span>
								</div>
							{/each}
						</div>
					</article>
				</div>
			</section>

			<section class="daily-skeleton-panel">
				<div class="daily-skeleton-section-header">
					<div>
						<span class="daily-skeleton-pill small"></span>
						<span class="daily-skeleton-line heading"></span>
					</div>
					<span class="daily-skeleton-pill"></span>
				</div>
				<div class="daily-skeleton-table" style="--daily-table-columns: 3;">
					{#each range(3) as _}
						<span class="daily-skeleton-cell header"></span>
					{/each}
					{#each range(4) as _, rowIndex}
						{#each range(3) as _, columnIndex}
							<span
								class="daily-skeleton-cell"
								style={`--skeleton-width: ${columnIndex === 0 ? 72 : columnIndex === 1 ? 58 : 48}%; --skeleton-delay: ${rowIndex * 55 + columnIndex * 30}ms`}
							></span>
						{/each}
					{/each}
				</div>
			</section>

			<section class="daily-skeleton-panel">
				<div class="daily-skeleton-section-header">
					<div>
						<span class="daily-skeleton-pill small"></span>
						<span class="daily-skeleton-line heading wide"></span>
					</div>
					<span class="daily-skeleton-pill"></span>
				</div>

				<div class="daily-event-skeleton-grid">
					{#each range(2) as _, cardIndex}
						<article class="daily-event-skeleton-card" style={`--skeleton-delay: ${cardIndex * 80}ms`}>
							<div class="daily-event-skeleton-header">
								<div>
									<span class="daily-skeleton-line label"></span>
									<span class="daily-skeleton-line medium"></span>
								</div>
								<span class="daily-skeleton-pill"></span>
							</div>

							<div class="daily-skeleton-table compact-table" style="--daily-table-columns: 4;">
								{#each range(4) as _}
									<span class="daily-skeleton-cell header"></span>
								{/each}
								{#each range(3) as _, rowIndex}
									{#each range(4) as _, columnIndex}
										<span
											class="daily-skeleton-cell"
											style={`--skeleton-width: ${columnIndex === 3 ? 52 : 66}%; --skeleton-delay: ${rowIndex * 50 + columnIndex * 25}ms`}
										></span>
									{/each}
								{/each}
							</div>
						</article>
					{/each}
				</div>
			</section>

			<section class="daily-skeleton-panel">
				<div class="daily-skeleton-section-header">
					<div>
						<span class="daily-skeleton-pill small"></span>
						<span class="daily-skeleton-line heading wide"></span>
					</div>
					<span class="daily-skeleton-pill"></span>
				</div>

				<div class="daily-timeline-skeleton-list">
					<div class="daily-timeline-legend">
						<span class="daily-skeleton-pill tiny"></span>
						<span class="daily-skeleton-pill tiny"></span>
					</div>
					{#each range(3) as _, index}
						<div class="daily-timeline-skeleton-row" style={`--skeleton-delay: ${index * 70}ms`}>
							<div class="daily-timeline-engine">
								<span class="daily-skeleton-line medium"></span>
								<span class="daily-skeleton-pill small"></span>
							</div>
							<div>
								<span class="daily-skeleton-timeline-labels"></span>
								<span class="daily-skeleton-timeline"></span>
								<span class="daily-skeleton-axis"></span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<section class="daily-skeleton-panel">
				<div class="daily-skeleton-section-header">
					<div>
						<span class="daily-skeleton-pill small"></span>
						<span class="daily-skeleton-line heading"></span>
					</div>
					<span class="daily-skeleton-pill"></span>
				</div>

				<div class="daily-fod-skeleton-grid">
					{#each range(3) as _, index}
						<article style={`--skeleton-delay: ${index * 50}ms`}>
							<span class="daily-skeleton-line label"></span>
							<span class="daily-skeleton-line value small"></span>
						</article>
					{/each}
				</div>

				<div class="daily-skeleton-table" style="--daily-table-columns: 6;">
					{#each range(6) as _}
						<span class="daily-skeleton-cell header"></span>
					{/each}
					{#each range(5) as _, rowIndex}
						{#each range(6) as _, columnIndex}
							<span
								class="daily-skeleton-cell"
								style={`--skeleton-width: ${columnIndex <= 1 ? 62 : 48}%; --skeleton-delay: ${rowIndex * 45 + columnIndex * 20}ms`}
							></span>
						{/each}
					{/each}
				</div>
			</section>

			<section class="daily-skeleton-panel">
				<div class="daily-skeleton-section-header">
					<div>
						<span class="daily-skeleton-pill small"></span>
						<span class="daily-skeleton-line heading"></span>
					</div>
					<span class="daily-skeleton-pill"></span>
				</div>
				<div class="daily-skeleton-table" style="--daily-table-columns: 3;">
					{#each range(3) as _}
						<span class="daily-skeleton-cell header"></span>
					{/each}
					{#each range(4) as _, rowIndex}
						{#each range(3) as _, columnIndex}
							<span
								class="daily-skeleton-cell"
								style={`--skeleton-width: ${columnIndex === 0 ? 70 : 44}%; --skeleton-delay: ${rowIndex * 55 + columnIndex * 30}ms`}
							></span>
						{/each}
					{/each}
				</div>
			</section>

			<section class="daily-skeleton-panel">
				<div class="daily-skeleton-section-header">
					<div>
						<span class="daily-skeleton-pill small"></span>
						<span class="daily-skeleton-line heading wide"></span>
					</div>
					<span class="daily-skeleton-pill"></span>
				</div>

				<div class="daily-rpm-table-card-list">
					{#each range(2) as _, cardIndex}
						<article class="daily-rpm-table-card-skeleton" style={`--skeleton-delay: ${cardIndex * 85}ms`}>
							<div class="daily-event-skeleton-header">
								<div>
									<span class="daily-skeleton-line label"></span>
									<span class="daily-skeleton-line medium"></span>
								</div>
								<span class="daily-skeleton-pill"></span>
							</div>
							<div class="daily-skeleton-table compact-table" style="--daily-table-columns: 5;">
								{#each range(5) as _}
									<span class="daily-skeleton-cell header"></span>
								{/each}
								{#each range(4) as _, rowIndex}
									{#each range(5) as _, columnIndex}
										<span
											class="daily-skeleton-cell"
											style={`--skeleton-width: ${columnIndex <= 1 ? 66 : 48}%; --skeleton-delay: ${rowIndex * 45 + columnIndex * 20}ms`}
										></span>
									{/each}
								{/each}
							</div>
						</article>
					{/each}
				</div>
			</section>

			<section class="daily-skeleton-panel">
				<div class="daily-skeleton-section-header">
					<div>
						<span class="daily-skeleton-pill small"></span>
						<span class="daily-skeleton-line heading"></span>
					</div>
					<span class="daily-skeleton-pill"></span>
				</div>

				<div class="daily-chart-skeleton-grid">
					{#each range(2) as _, index}
						<article class="daily-chart-skeleton-card" style={`--skeleton-delay: ${index * 80}ms`}>
							<div class="daily-event-skeleton-header">
								<div>
									<span class="daily-skeleton-line label"></span>
									<span class="daily-skeleton-line medium"></span>
								</div>
								<span class="daily-skeleton-pill wide"></span>
							</div>
							<div class="daily-skeleton-chart"></div>
							<span class="daily-skeleton-line hint"></span>
						</article>
					{/each}
				</div>
			</section>
		</div>

	{:else if variant === 'administrator-page'}
		<div class="admin-page-skeleton">
			<div class="admin-skeleton-tabs">
				{#each range(7) as _, index}
					<span class="admin-skeleton-pill tab" style={`--skeleton-delay: ${index * 45}ms`}></span>
				{/each}
			</div>

			<section class="admin-skeleton-workspace">
				<aside class="admin-skeleton-side-panel">
					<div class="admin-skeleton-section-header">
						<div>
							<span class="admin-skeleton-line heading"></span>
							<span class="admin-skeleton-line subtitle"></span>
						</div>
						<span class="admin-skeleton-pill counter"></span>
					</div>

					<span class="admin-skeleton-input"></span>

					<div class="admin-entity-list-skeleton">
						{#each range(6) as _, index}
							<article class="admin-entity-row-skeleton" style={`--skeleton-delay: ${index * 50}ms`}>
								<div>
									<span class="admin-skeleton-line entity-title"></span>
									<span class="admin-skeleton-line entity-meta"></span>
									<span class="admin-skeleton-line entity-small"></span>
								</div>
								<span class="admin-skeleton-pill status"></span>
							</article>
						{/each}
					</div>
				</aside>

				<main class="admin-skeleton-editor-panel">
					<div class="admin-skeleton-section-header editor">
						<div>
							<span class="admin-skeleton-line heading wide"></span>
							<span class="admin-skeleton-line subtitle wide"></span>
						</div>
						<span class="admin-skeleton-pill button"></span>
					</div>

					<div class="admin-detail-form-skeleton">
						<div class="admin-form-grid-skeleton">
							{#each range(6) as _, index}
								<label class="admin-field-skeleton" style={`--skeleton-delay: ${index * 45}ms`}>
									<span class="admin-skeleton-line label"></span>
									<span class="admin-skeleton-input"></span>
								</label>
							{/each}
						</div>

						<div class="admin-permission-catalog-skeleton">
							{#each range(3) as _, groupIndex}
								<section class="admin-permission-group-skeleton" style={`--skeleton-delay: ${groupIndex * 70}ms`}>
									<div class="admin-permission-group-head">
										<div>
											<span class="admin-skeleton-line group-title"></span>
											<span class="admin-skeleton-line group-subtitle"></span>
										</div>
										<span class="admin-skeleton-pill counter"></span>
									</div>

									<div class="admin-permission-items">
										{#each range(3) as _, itemIndex}
											<div class="admin-permission-item-skeleton" style={`--skeleton-delay: ${groupIndex * 70 + itemIndex * 35}ms`}>
												<span class="admin-skeleton-checkbox"></span>
												<div>
													<span class="admin-skeleton-line permission-title"></span>
													<span class="admin-skeleton-line permission-desc"></span>
												</div>
											</div>
										{/each}
									</div>
								</section>
							{/each}
						</div>
					</div>
				</main>
			</section>
		</div>

	{:else if variant === 'admin-entity-list'}
		<div class="admin-entity-list-skeleton">
			{#each range(rows || 6) as _, index}
				<article class="admin-entity-row-skeleton" style={`--skeleton-delay: ${index * 50}ms`}>
					<div>
						<span class="admin-skeleton-line entity-title"></span>
						<span class="admin-skeleton-line entity-meta"></span>
						<span class="admin-skeleton-line entity-small"></span>
					</div>

					<span class="admin-skeleton-pill status"></span>
				</article>
			{/each}
		</div>

	{:else if variant === 'admin-detail-form'}
		<div class="admin-detail-form-skeleton">
			<div class="admin-form-grid-skeleton">
				{#each range(6) as _, index}
					<label class="admin-field-skeleton" style={`--skeleton-delay: ${index * 45}ms`}>
						<span class="admin-skeleton-line label"></span>
						<span class="admin-skeleton-input"></span>
					</label>
				{/each}
			</div>

			<div class="admin-form-actions-skeleton">
				<span class="admin-skeleton-pill button muted"></span>
				<span class="admin-skeleton-pill button"></span>
			</div>
		</div>

	{:else if variant === 'admin-permission-catalog'}
		<div class="admin-permission-catalog-skeleton">
			{#each range(rows || 5) as _, groupIndex}
				<section class="admin-permission-group-skeleton" style={`--skeleton-delay: ${groupIndex * 70}ms`}>
					<div class="admin-permission-group-head">
						<div>
							<span class="admin-skeleton-line group-title"></span>
							<span class="admin-skeleton-line group-subtitle"></span>
						</div>
						<span class="admin-skeleton-pill counter"></span>
					</div>

					<div class="admin-permission-items">
						{#each range(3) as _, itemIndex}
							<div class="admin-permission-item-skeleton" style={`--skeleton-delay: ${groupIndex * 70 + itemIndex * 35}ms`}>
								<span class="admin-skeleton-checkbox"></span>
								<div>
									<span class="admin-skeleton-line permission-title"></span>
									<span class="admin-skeleton-line permission-desc"></span>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>

	{:else if variant === 'admin-compact-list'}
		<div class="admin-compact-list-skeleton">
			{#each range(rows || 4) as _, index}
				<article class="admin-compact-row-skeleton" style={`--skeleton-delay: ${index * 50}ms`}>
					<div>
						<span class="admin-skeleton-line entity-title"></span>
						<span class="admin-skeleton-line entity-meta"></span>
					</div>
					<span class="admin-skeleton-pill status small"></span>
				</article>
			{/each}
		</div>

	{:else if variant === 'admin-engine-curve-detail'}
		<div class="admin-engine-curve-detail-skeleton">
			<div class="admin-engine-detail-head-skeleton">
				<div>
					<span class="admin-skeleton-line heading wide"></span>
					<span class="admin-skeleton-line subtitle wide"></span>
				</div>
				<span class="admin-skeleton-pill status"></span>
			</div>

			<div class="admin-engine-detail-grid-skeleton">
				{#each range(6) as _, index}
					<article class="admin-engine-detail-card-skeleton" style={`--skeleton-delay: ${index * 45}ms`}>
						<span class="admin-skeleton-line label"></span>
						<span class="admin-skeleton-line detail-value"></span>
					</article>
				{/each}
			</div>

			<div class="admin-engine-table-skeleton">
				{#each range(5) as _, columnIndex}
					<span class="admin-engine-table-cell header" style={`--skeleton-delay: ${columnIndex * 25}ms`}></span>
				{/each}

				{#each range(5) as _, rowIndex}
					{#each range(5) as _, columnIndex}
						<span
							class="admin-engine-table-cell"
							style={`--skeleton-delay: ${rowIndex * 45 + columnIndex * 16}ms`}
						></span>
					{/each}
				{/each}
			</div>
		</div>

	{:else if variant === 'admin-global-audit-table'}
		<div class="admin-global-audit-table-skeleton">
			<div
				class="admin-global-audit-grid-skeleton"
				style={`--admin-audit-columns: ${safeCount(columns || 5)}`}
			>
				{#each range(columns || 5) as _, columnIndex}
					<span
						class="admin-global-audit-cell header"
						style={`--skeleton-delay: ${columnIndex * 30}ms; --skeleton-width: ${columnIndex === 0 ? 64 : columnIndex === 1 ? 72 : columnIndex === 2 ? 58 : columnIndex === 3 ? 54 : 42}%`}
					></span>
				{/each}

				{#each range(rows || 6) as _, rowIndex}
					{#each range(columns || 5) as _, columnIndex}
						<span
							class={`admin-global-audit-cell ${rowIndex % 2 ? 'even' : ''} ${columnIndex === 2 ? 'action-col' : ''}`}
							style={`--skeleton-delay: ${rowIndex * 50 + columnIndex * 20}ms; --skeleton-width: ${columnIndex === 0 ? 76 : columnIndex === 1 ? 70 : columnIndex === 2 ? 54 : columnIndex === 3 ? 60 : 44}%`}
						></span>
					{/each}
				{/each}
			</div>

			<div class="admin-global-audit-pagination-skeleton">
				<span class="admin-skeleton-pill button muted"></span>
				<span class="admin-skeleton-line page-text"></span>
				<span class="admin-skeleton-pill button muted"></span>
			</div>
		</div>

	{:else if variant === 'profile-page'}
		<div class="profile-page-skeleton">
			<header class="profile-skeleton-hero">
				<div class="profile-skeleton-hero-left">
					<span class="profile-skeleton-avatar"></span>

					<div class="profile-skeleton-hero-copy">
						<span class="profile-skeleton-pill kicker"></span>
						<span class="profile-skeleton-line hero-title"></span>
						<span class="profile-skeleton-line hero-subtitle"></span>

						<div class="profile-skeleton-badge-row">
							<span class="profile-skeleton-pill badge"></span>
							<span class="profile-skeleton-pill badge wide"></span>
							<span class="profile-skeleton-pill badge date"></span>
						</div>
					</div>
				</div>

				<span class="profile-skeleton-pill refresh-button"></span>
			</header>

			<section class="profile-skeleton-summary-grid">
				{#each range(4) as _, index}
					<article class="profile-skeleton-summary-card" style={`--skeleton-delay: ${index * 55}ms`}>
						<span class="profile-skeleton-line summary-label"></span>
						<span class="profile-skeleton-line summary-value"></span>
						<span class="profile-skeleton-line summary-note"></span>
					</article>
				{/each}
			</section>

			<section class="profile-skeleton-content-grid">
				<article class="profile-skeleton-panel">
					<div class="profile-skeleton-panel-header">
						<div>
							<span class="profile-skeleton-line panel-title"></span>
							<span class="profile-skeleton-line panel-subtitle"></span>
						</div>
					</div>

					<div class="profile-skeleton-form-grid">
						{#each range(3) as _, index}
							<label class="profile-skeleton-field" style={`--skeleton-delay: ${index * 45}ms`}>
								<span class="profile-skeleton-line field-label"></span>
								<span class="profile-skeleton-input"></span>
							</label>
						{/each}

						<div class="profile-skeleton-form-actions">
							<span class="profile-skeleton-pill form-button"></span>
						</div>
					</div>
				</article>

				<article class="profile-skeleton-panel">
					<div class="profile-skeleton-panel-header">
						<div>
							<span class="profile-skeleton-line panel-title"></span>
							<span class="profile-skeleton-line panel-subtitle wide"></span>
						</div>
					</div>

					<div class="profile-skeleton-form-grid">
						{#each range(3) as _, index}
							<label class="profile-skeleton-field" style={`--skeleton-delay: ${index * 45}ms`}>
								<span class="profile-skeleton-line field-label"></span>
								<span class="profile-skeleton-input"></span>
							</label>
						{/each}

						<div class="profile-skeleton-form-actions">
							<span class="profile-skeleton-pill form-button danger"></span>
						</div>
					</div>
				</article>

				<article class="profile-skeleton-panel">
					<div class="profile-skeleton-panel-header">
						<div>
							<span class="profile-skeleton-line panel-title short"></span>
							<span class="profile-skeleton-line panel-subtitle wide"></span>
						</div>

						<span class="profile-skeleton-pill count"></span>
					</div>

					<div class="profile-skeleton-access-list">
						{#each range(4) as _, index}
							<div class="profile-skeleton-access-row" style={`--skeleton-delay: ${index * 50}ms`}>
								<span class="profile-skeleton-access-icon vessel"></span>

								<div>
									<span class="profile-skeleton-line access-title"></span>
									<span class="profile-skeleton-line access-meta"></span>
									<span class="profile-skeleton-line access-id"></span>
								</div>
							</div>
						{/each}
					</div>
				</article>

				<article class="profile-skeleton-panel">
					<div class="profile-skeleton-panel-header">
						<div>
							<span class="profile-skeleton-line panel-title short"></span>
							<span class="profile-skeleton-line panel-subtitle wide"></span>
						</div>

						<span class="profile-skeleton-pill count"></span>
					</div>

					<div class="profile-skeleton-access-list">
						{#each range(4) as _, index}
							<div class="profile-skeleton-access-row" style={`--skeleton-delay: ${index * 50}ms`}>
								<span class="profile-skeleton-access-icon asset"></span>

								<div>
									<span class="profile-skeleton-line access-title"></span>
									<span class="profile-skeleton-line access-meta"></span>
									<span class="profile-skeleton-line access-id"></span>
								</div>
							</div>
						{/each}
					</div>
				</article>
			</section>
		</div>

	{:else if variant === 'audit-log-table'}
		<div class="audit-log-table-skeleton">
			<div class="audit-log-table-scroll">
				<div
					class="audit-log-table-grid"
					style={`--audit-log-columns: ${safeCount(columns || 7)}`}
				>
					{#each range(columns || 7) as _, columnIndex}
						<span
							class="audit-log-table-cell header"
							style={`--skeleton-delay: ${columnIndex * 35}ms; --skeleton-width: ${columnIndex === 0 ? 34 : columnIndex === 1 ? 72 : columnIndex === 2 ? 58 : columnIndex === 3 ? 54 : columnIndex === 4 ? 62 : columnIndex === 5 ? 46 : 42}%`}
						></span>
					{/each}

					{#each range(rows || 6) as _, rowIndex}
						{#each range(columns || 7) as _, columnIndex}
							<span
								class={`audit-log-table-cell ${rowIndex % 2 ? 'even' : ''} ${columnIndex === 3 ? 'action-col' : ''} ${columnIndex === 6 ? 'button-col' : ''}`}
								style={`--skeleton-delay: ${rowIndex * 55 + columnIndex * 25}ms; --skeleton-width: ${columnIndex === 0 ? 28 : columnIndex === 1 ? 78 : columnIndex === 2 ? 68 : columnIndex === 3 ? 72 : columnIndex === 4 ? 62 : columnIndex === 5 ? 44 : 48}%`}
							></span>
						{/each}
					{/each}
				</div>
			</div>

			<div class="audit-log-pagination-skeleton">
				<span class="audit-log-skeleton-pill page-button"></span>
				<span class="audit-log-skeleton-line page-text"></span>
				<span class="audit-log-skeleton-pill page-button"></span>
			</div>
		</div>

	{:else if variant === 'audit-log-detail'}
		<div class="audit-detail-skeleton">
			<div class="audit-detail-grid-skeleton">
				{#each range(7) as _, index}
					<article class="audit-detail-info-card" style={`--skeleton-delay: ${index * 45}ms`}>
						<span class="audit-log-skeleton-line label"></span>
						<span class="audit-log-skeleton-line detail-value"></span>
					</article>
				{/each}
			</div>

			<section class="audit-detail-changes-card">
				<div class="audit-detail-changes-header">
					<div>
						<span class="audit-log-skeleton-pill kicker"></span>
						<span class="audit-log-skeleton-line heading"></span>
					</div>

					<span class="audit-log-skeleton-pill counter"></span>
				</div>

				<div class="audit-detail-code-skeleton">
					{#each range(7) as _, index}
						<span
							class="audit-detail-code-line"
							style={`--skeleton-delay: ${index * 45}ms; --code-width: ${index === 0 ? 52 : index === 1 ? 76 : index === 2 ? 68 : index === 3 ? 84 : index === 4 ? 58 : index === 5 ? 72 : 46}%`}
						></span>
					{/each}
				</div>
			</section>
		</div>

	{:else if variant === 'all-vessel-summary-page'}
		<div class="avs-summary-page-skeleton">
			<section class="avs-skeleton-summary-grid">
				{#each range(4) as _, index}
					<article class="avs-skeleton-summary-card" style={`--skeleton-delay: ${index * 55}ms`}>
						<span class="avs-skeleton-line label"></span>
						<span class="avs-skeleton-line value"></span>
					</article>
				{/each}
			</section>

			<section class="avs-skeleton-layout-grid">
				<aside class="avs-skeleton-vessel-panel">
					<div class="avs-skeleton-section-header">
						<div>
							<span class="avs-skeleton-pill kicker"></span>
							<span class="avs-skeleton-line heading"></span>
						</div>
						<span class="avs-skeleton-pill counter"></span>
					</div>

					<div class="avs-skeleton-vessel-tools">
						<span class="avs-skeleton-input"></span>
						<span class="avs-skeleton-check-row"></span>
					</div>

					<div class="avs-skeleton-vessel-list">
						{#each range(6) as _, index}
							<div class="avs-skeleton-vessel-card" style={`--skeleton-delay: ${index * 45}ms`}>
								<span class="avs-skeleton-checkbox"></span>
								<span class="avs-skeleton-line vessel-name"></span>
							</div>
						{/each}
					</div>
				</aside>

				<section class="avs-skeleton-control-panel">
					<section class="avs-skeleton-panel">
						<div class="avs-skeleton-section-header">
							<div>
								<span class="avs-skeleton-pill kicker"></span>
								<span class="avs-skeleton-line heading wide"></span>
							</div>
							<span class="avs-skeleton-pill counter wide"></span>
						</div>

						<div class="avs-skeleton-request-body">
							<div class="avs-skeleton-request-card">
								<div class="avs-skeleton-request-head">
									<span class="avs-skeleton-icon"></span>
									<div>
										<span class="avs-skeleton-line title"></span>
										<span class="avs-skeleton-line subtitle"></span>
									</div>
									<span class="avs-skeleton-pill badge"></span>
								</div>

								<div class="avs-skeleton-request-grid">
									{#each range(4) as _, index}
										<div class="avs-skeleton-field" style={`--skeleton-delay: ${index * 45}ms`}>
											<span class="avs-skeleton-line label"></span>
											<span class="avs-skeleton-input"></span>
										</div>
									{/each}
								</div>

								<div class="avs-skeleton-preset-row">
									<span class="avs-skeleton-line label"></span>
									<span class="avs-skeleton-pill preset"></span>
									<span class="avs-skeleton-pill preset"></span>
									<span class="avs-skeleton-pill preset"></span>
								</div>

								<div class="avs-skeleton-action-row">
									<span class="avs-skeleton-pill button"></span>
									<span class="avs-skeleton-pill button"></span>
								</div>
							</div>

							<div class="avs-skeleton-strip">
								{#each range(4) as _, index}
									<article style={`--skeleton-delay: ${index * 45}ms`}>
										<span class="avs-skeleton-line label"></span>
										<span class="avs-skeleton-line strip-value"></span>
									</article>
								{/each}
							</div>

							<div class="avs-skeleton-vessel-request-panel">
								<div class="avs-skeleton-request-head compact">
									<div>
										<span class="avs-skeleton-line title"></span>
										<span class="avs-skeleton-line subtitle"></span>
									</div>
									<span class="avs-skeleton-pill counter"></span>
								</div>

								<div class="avs-skeleton-vessel-request-list">
									{#each range(2) as _, cardIndex}
										<article class="avs-skeleton-vessel-request-card" style={`--skeleton-delay: ${cardIndex * 70}ms`}>
											<div class="avs-skeleton-vessel-request-title">
												<span class="avs-skeleton-avatar"></span>
												<span class="avs-skeleton-line vessel-name"></span>
												<span class="avs-skeleton-pill badge"></span>
											</div>

											<div class="avs-skeleton-request-grid">
												{#each range(4) as _, index}
													<div class="avs-skeleton-field" style={`--skeleton-delay: ${cardIndex * 70 + index * 35}ms`}>
														<span class="avs-skeleton-line label"></span>
														<span class="avs-skeleton-input"></span>
													</div>
												{/each}
											</div>
										</article>
									{/each}
								</div>
							</div>
						</div>
					</section>

					<section class="avs-skeleton-panel">
						<div class="avs-skeleton-section-header">
							<div>
								<span class="avs-skeleton-pill kicker"></span>
								<span class="avs-skeleton-line heading"></span>
							</div>
							<span class="avs-skeleton-pill button small"></span>
						</div>
					</section>
				</section>
			</section>

			<section class="avs-skeleton-panel">
				<div class="avs-skeleton-section-header">
					<div>
						<span class="avs-skeleton-pill kicker"></span>
						<span class="avs-skeleton-line heading"></span>
					</div>
					<span class="avs-skeleton-pill counter"></span>
				</div>

				<div class="avs-summary-table-skeleton">
					<div
						class="avs-summary-table-grid"
						style={`--avs-summary-columns: ${safeCount(columns || 8)}`}
					>
						{#each range(columns || 8) as _, columnIndex}
							<span
								class="avs-summary-table-cell header"
								style={`--skeleton-delay: ${columnIndex * 22}ms; --skeleton-width: ${columnIndex === 0 ? 38 : columnIndex === 1 ? 64 : 52}%`}
							></span>
						{/each}

						{#each range(rows || 6) as _, rowIndex}
							{#each range(columns || 8) as _, columnIndex}
								<span
									class={`avs-summary-table-cell ${rowIndex % 2 ? 'even' : ''} ${columnIndex >= safeCount(columns || 8) - 3 ? 'metric-col' : ''}`}
									style={`--skeleton-delay: ${rowIndex * 45 + columnIndex * 14}ms; --skeleton-width: ${columnIndex === 0 ? 32 : columnIndex === 1 ? 72 : columnIndex === 2 ? 84 : 50}%`}
								></span>
							{/each}
						{/each}
					</div>
				</div>
			</section>
		</div>

	{:else if variant === 'all-vessel-vessel-list'}
		<div class="avs-skeleton-vessel-list standalone">
			{#each range(rows || 6) as _, index}
				<div class="avs-skeleton-vessel-card" style={`--skeleton-delay: ${index * 45}ms`}>
					<span class="avs-skeleton-checkbox"></span>
					<span class="avs-skeleton-line vessel-name"></span>
				</div>
			{/each}
		</div>

	{:else if variant === 'all-vessel-summary-table'}
		<div class="avs-summary-table-skeleton">
			<div
				class="avs-summary-table-grid"
				style={`--avs-summary-columns: ${safeCount(columns || 8)}`}
			>
				{#each range(columns || 8) as _, columnIndex}
					<span
						class="avs-summary-table-cell header"
						style={`--skeleton-delay: ${columnIndex * 22}ms; --skeleton-width: ${columnIndex === 0 ? 38 : columnIndex === 1 ? 64 : 52}%`}
					></span>
				{/each}

				{#each range(rows || 7) as _, rowIndex}
					{#each range(columns || 8) as _, columnIndex}
						<span
							class={`avs-summary-table-cell ${rowIndex % 2 ? 'even' : ''} ${columnIndex >= safeCount(columns || 8) - 3 ? 'metric-col' : ''}`}
							style={`--skeleton-delay: ${rowIndex * 45 + columnIndex * 14}ms; --skeleton-width: ${columnIndex === 0 ? 32 : columnIndex === 1 ? 72 : columnIndex === 2 ? 84 : 50}%`}
						></span>
					{/each}
				{/each}
			</div>
		</div>

	{:else if variant === 'alarm-monitor-grid'}
		<div class="alarm-monitor-skeleton-grid">
			{#each range(rows) as _, index}
				<article class="alarm-monitor-skeleton-card" style={`--skeleton-delay: ${index * 55}ms`}>
					<div class="alarm-monitor-skeleton-top">
						<div>
							<span class="alarm-skeleton-line label"></span>
							<span class="alarm-skeleton-line vessel-name"></span>
						</div>

						<span class="alarm-skeleton-pill status"></span>
					</div>

					<div class="alarm-monitor-skeleton-body">
						<div>
							<span class="alarm-skeleton-line label"></span>
							<span class="alarm-skeleton-line alarm-type"></span>
						</div>

						<div>
							<span class="alarm-skeleton-line label"></span>
							<span class="alarm-skeleton-line update-time"></span>
						</div>
					</div>

					{#if index === 0}
						<span class="alarm-skeleton-pill new-badge"></span>
					{/if}
				</article>
			{/each}
		</div>

	{:else if variant === 'alarm-events-table'}
		<div class="alarm-events-skeleton-table">
			<div class="alarm-events-skeleton-scroll">
				<div class="alarm-events-skeleton-grid">
					{#each range(7) as _, index}
						<span
							class="alarm-events-skeleton-cell header"
							style={`--skeleton-delay: ${index * 35}ms`}
						></span>
					{/each}

					{#each range(rows) as _, rowIndex}
						{#each range(7) as _, columnIndex}
							<span
								class="alarm-events-skeleton-cell"
								style={`--skeleton-delay: ${rowIndex * 55 + columnIndex * 25}ms`}
							></span>
						{/each}
					{/each}
				</div>
			</div>

			<div class="alarm-events-skeleton-pagination">
				<span class="alarm-skeleton-pill page-button"></span>
				<span class="alarm-skeleton-line page-text"></span>
				<span class="alarm-skeleton-pill page-button"></span>
			</div>
		</div>

	{:else if variant === 'voyage-plans-page'}
		<div class="voyage-plans-skeleton">
			<section class="voyage-plans-main-grid">
				<section class="vplans-panel vplan-panel vplans-list-panel">
					<div class="vplans-panel-toolbar">
						<div>
							<span class="vplan-skeleton-line heading"></span>
							<span class="vplan-skeleton-line page-text"></span>
						</div>

						<span class="vplan-skeleton-pill search-input"></span>
					</div>

					<div class="voyage-plans-table-wrap">
						<div class="voyage-plans-table-grid cols-5">
							{#each range(5) as _, columnIndex}
								<span
									class="vplan-table-cell header"
									style={`--skeleton-delay: ${columnIndex * 30}ms`}
								></span>
							{/each}

							{#each range(rows || 6) as _, rowIndex}
								{#each range(5) as _, columnIndex}
									<span
										class={`vplan-table-cell ${rowIndex % 2 ? 'even' : ''} ${columnIndex === 2 ? 'badge-col' : ''} ${columnIndex === 4 ? 'action-col' : ''}`}
										style={`--skeleton-delay: ${rowIndex * 50 + columnIndex * 22}ms; --skeleton-width: ${columnIndex === 0 ? 34 : columnIndex === 1 ? 74 : columnIndex === 2 ? 48 : columnIndex === 3 ? 52 : 46}%`}
									></span>
								{/each}
							{/each}
						</div>
					</div>

					<div class="vplans-pagination-skeleton">
						<span class="vplan-skeleton-pill page-button"></span>
						<span class="vplan-skeleton-line page-text"></span>
						<span class="vplan-skeleton-pill page-button"></span>
						<span class="vplan-skeleton-pill page-size"></span>
					</div>
				</section>

				<section class="vplans-panel vplan-panel vplans-detail-panel">
					<div class="vplans-panel-toolbar">
						<div>
							<span class="vplan-skeleton-line heading"></span>
							<span class="vplan-skeleton-line page-text"></span>
						</div>

						<span class="vplan-skeleton-pill status-badge"></span>
					</div>

					<div class="vplans-detail-summary">
						{#each range(4) as _, index}
							<article style={`--skeleton-delay: ${index * 45}ms`}>
								<span class="vplan-skeleton-line label"></span>
								<span class="vplan-skeleton-line value"></span>
							</article>
						{/each}
					</div>

					<div class="vplans-allowed-list">
						{#each range(4) as _, index}
							<span
								class="vplan-skeleton-pill allowed-chip"
								style={`--skeleton-delay: ${index * 45}ms`}
							></span>
						{/each}
					</div>

					<div class="voyage-plans-table-wrap route">
						<div class="voyage-plans-table-grid cols-4">
							{#each range(4) as _, columnIndex}
								<span
									class="vplan-table-cell header"
									style={`--skeleton-delay: ${columnIndex * 30}ms`}
								></span>
							{/each}

							{#each range(5) as _, rowIndex}
								{#each range(4) as _, columnIndex}
									<span
										class={`vplan-table-cell ${rowIndex % 2 ? 'even' : ''}`}
										style={`--skeleton-delay: ${rowIndex * 50 + columnIndex * 22}ms; --skeleton-width: ${columnIndex === 0 ? 44 : columnIndex === 1 || columnIndex === 2 ? 74 : 42}%`}
									></span>
								{/each}
							{/each}
						</div>
					</div>
				</section>
			</section>

			<section class="voyage-plans-bottom-grid">
				<section class="vplans-panel vplan-panel">
					<div class="vplans-panel-toolbar">
						<div>
							<span class="vplan-skeleton-line heading"></span>
							<span class="vplan-skeleton-line page-text wide"></span>
						</div>
					</div>

					<div class="vplans-form-grid compact">
						{#each range(3) as _, index}
							<label class="vplans-form-field" style={`--skeleton-delay: ${index * 45}ms`}>
								<span class="vplan-skeleton-line label"></span>
								<span class="vplan-skeleton-pill form-input"></span>
							</label>
						{/each}

						<span class="vplan-skeleton-pill form-button"></span>
					</div>

					<div class="vplans-preview-table">
						<div class="voyage-plans-table-grid cols-4">
							{#each range(4) as _, columnIndex}
								<span
									class="vplan-table-cell header"
									style={`--skeleton-delay: ${columnIndex * 30}ms`}
								></span>
							{/each}

							{#each range(3) as _, rowIndex}
								{#each range(4) as _, columnIndex}
									<span
										class={`vplan-table-cell ${rowIndex % 2 ? 'even' : ''}`}
										style={`--skeleton-delay: ${rowIndex * 50 + columnIndex * 22}ms`}
									></span>
								{/each}
							{/each}
						</div>
					</div>
				</section>

				<section class="vplans-panel vplan-panel">
					<div class="vplans-panel-toolbar">
						<div>
							<span class="vplan-skeleton-line heading"></span>
							<span class="vplan-skeleton-line page-text wide"></span>
						</div>
					</div>

					<div class="vplans-form-grid compact">
						{#each range(3) as _, index}
							<label class="vplans-form-field" style={`--skeleton-delay: ${index * 45}ms`}>
								<span class="vplan-skeleton-line label"></span>
								<span class="vplan-skeleton-pill form-input"></span>
							</label>
						{/each}

						<span class="vplan-skeleton-pill form-button"></span>
					</div>
				</section>
			</section>
		</div>

	{:else if variant === 'voyage-plan-vessel'}
		<div class="voyage-plan-skeleton">
		<section class="vplan-summary-grid">
			{#each range(4) as _, index}
				<article class="vplan-summary-card" style={`--skeleton-delay: ${index * 55}ms`}>
					<span class="vplan-skeleton-line label"></span>
					<span class="vplan-skeleton-line value"></span>
				</article>
			{/each}
		</section>

		<section class="vplan-main-grid">
			<section class="vplan-panel vplan-map-panel">
				<div class="vplan-section-header vplan-map-header">
					<div>
						<span class="vplan-skeleton-pill kicker"></span>
						<span class="vplan-skeleton-line heading wide"></span>
						<div class="vplan-meta-row">
							<span class="vplan-skeleton-pill meta"></span>
							<span class="vplan-skeleton-pill meta"></span>
						</div>
					</div>

					<div class="vplan-action-row">
						<span class="vplan-skeleton-pill button"></span>
						<span class="vplan-skeleton-pill button"></span>
					</div>
				</div>

				<div class="vplan-map-shell">
					<span class="vplan-map-grid"></span>
					<span class="vplan-route-line"></span>
					<span class="vplan-route-marker start"></span>
					<span class="vplan-route-marker middle"></span>
					<span class="vplan-route-marker finish"></span>
					<span class="vplan-asset-marker one"></span>
					<span class="vplan-asset-marker two"></span>
					<span class="vplan-map-chip"></span>
				</div>
			</section>

			<section class="vplan-panel vplan-detail-panel">
				<div class="vplan-section-header">
					<div>
						<span class="vplan-skeleton-pill kicker"></span>
						<span class="vplan-skeleton-line heading"></span>
					</div>
				</div>

				<div class="vplan-detail-list">
					{#each range(6) as _, index}
						<div class="vplan-detail-item" style={`--skeleton-delay: ${index * 45}ms`}>
							<span class="vplan-skeleton-line label"></span>
							<span class="vplan-skeleton-line detail-value"></span>
						</div>
					{/each}
				</div>
			</section>
		</section>

		<section class="vplan-panel vplan-table-panel">
			<div class="vplan-section-header">
				<div>
					<span class="vplan-skeleton-pill kicker"></span>
					<span class="vplan-skeleton-line heading wide"></span>
				</div>

				<span class="vplan-skeleton-pill counter"></span>
			</div>

			<div class="vplan-table-skeleton cols-4">
				{#each range(4) as _, index}
					<span class="vplan-table-cell header" style={`--skeleton-delay: ${index * 35}ms`}></span>
				{/each}

				{#each range(6) as _, rowIndex}
					{#each range(4) as _, columnIndex}
						<span
							class="vplan-table-cell"
							style={`--skeleton-delay: ${rowIndex * 55 + columnIndex * 25}ms`}
						></span>
					{/each}
				{/each}
			</div>
		</section>

		<section class="vplan-panel vplan-table-panel">
			<div class="vplan-section-header">
				<div>
					<span class="vplan-skeleton-pill kicker"></span>
					<span class="vplan-skeleton-line heading wide"></span>
				</div>

				<span class="vplan-skeleton-pill counter"></span>
			</div>

			<div class="vplan-table-skeleton cols-7">
				{#each range(7) as _, index}
					<span class="vplan-table-cell header" style={`--skeleton-delay: ${index * 35}ms`}></span>
				{/each}

				{#each range(5) as _, rowIndex}
					{#each range(7) as _, columnIndex}
						<span
							class="vplan-table-cell"
							style={`--skeleton-delay: ${rowIndex * 55 + columnIndex * 25}ms`}
						></span>
					{/each}
				{/each}
			</div>

			<div class="vplan-pagination-skeleton">
				<span class="vplan-skeleton-pill page-button"></span>
				<span class="vplan-skeleton-line page-text"></span>
				<span class="vplan-skeleton-pill page-button"></span>
			</div>
		</section>
	</div>
	{:else if variant === 'voyage-route-map'}
		<div class="voyage-map-mini-skeleton">
			<span class="vplan-skeleton-line heading"></span>
			<span class="vplan-skeleton-line detail-value"></span>
			<div class="voyage-map-mini-grid">
				<span></span>
				<span></span>
				<span></span>
			</div>
		</div>

	{:else if variant === 'voyage-assignment-detail'}
		<div class="voyage-detail-mini-skeleton">
			{#each range(4) as _, index}
				<div class="vplan-detail-item" style={`--skeleton-delay: ${index * 45}ms`}>
					<span class="vplan-skeleton-line label"></span>
					<span class="vplan-skeleton-line detail-value"></span>
				</div>
			{/each}
		</div>

	{:else if variant === 'voyage-history-table'}
		<div class="voyage-history-table-skeleton">
			<div class="vplan-table-skeleton cols-7">
				{#each range(7) as _, index}
					<span class="vplan-table-cell header" style={`--skeleton-delay: ${index * 35}ms`}></span>
				{/each}

				{#each range(5) as _, rowIndex}
					{#each range(7) as _, columnIndex}
						<span
							class="vplan-table-cell"
							style={`--skeleton-delay: ${rowIndex * 55 + columnIndex * 25}ms`}
						></span>
					{/each}
				{/each}
			</div>
		</div>

	{:else if variant === 'vessel-dashboard'}
	<div class="vessel-dashboard-skeleton">
		<section class="vdash-hero-grid">
		<section class="vdash-panel vdash-cctv-section">
			<div class="vdash-section-header">
			<div>
				<span class="vdash-skeleton-pill kicker"></span>
				<span class="vdash-skeleton-line heading"></span>
			</div>
			<span class="vdash-skeleton-pill counter"></span>
			</div>

			<div class="vdash-cctv-grid">
			{#each range(4) as _, index}
				<article class="vdash-cctv-box" style={`--skeleton-delay: ${index * 55}ms`}>
				<div class="vdash-cctv-top">
					<span class="vdash-camera-dot"></span>
					<span class="vdash-skeleton-line status"></span>
				</div>

				<div class="vdash-cctv-content">
					<span class="vdash-cctv-icon"></span>
					<span class="vdash-skeleton-line cctv-title"></span>
					<span class="vdash-skeleton-line cctv-subtitle"></span>
				</div>
				</article>
			{/each}
			</div>
		</section>

		<section class="vdash-panel vdash-map-section">
			<div class="vdash-section-header">
			<div>
				<span class="vdash-skeleton-pill kicker"></span>
				<span class="vdash-skeleton-line heading wide"></span>
			</div>
			<span class="vdash-skeleton-pill counter"></span>
			</div>

			<div class="vdash-map-box">
			<span class="vdash-map-grid"></span>
			<span class="vdash-map-route"></span>
			<span class="vdash-vessel-marker"></span>
			<span class="vdash-map-status"></span>
			<div class="vdash-map-legend">
				<span class="vdash-skeleton-pill legend"></span>
				<span class="vdash-skeleton-pill legend"></span>
			</div>
			</div>
		</section>
		</section>

		<section class="vdash-info-rpm-section">
		<section class="vdash-panel vdash-vessel-panel">
			<div class="vdash-section-header">
			<div>
				<span class="vdash-skeleton-pill kicker"></span>
				<span class="vdash-skeleton-line heading"></span>
			</div>
			<span class="vdash-skeleton-pill online"></span>
			</div>

			<div class="vdash-vessel-info-grid">
			{#each range(8) as _, index}
				<article class="vdash-info-card" class:highlight={index === 4} style={`--skeleton-delay: ${index * 45}ms`}>
				<span class="vdash-skeleton-line label"></span>
				<span class="vdash-skeleton-line metric"></span>
				</article>
			{/each}
			</div>
		</section>

		<section class="vdash-panel vdash-rpm-panel">
			<div class="vdash-section-header">
			<div>
				<span class="vdash-skeleton-pill kicker"></span>
				<span class="vdash-skeleton-line heading"></span>
			</div>
			<span class="vdash-skeleton-pill counter"></span>
			</div>

			<div class="vdash-rpm-grid">
			{#each range(4) as _, index}
				<article class="vdash-rpm-card" style={`--skeleton-delay: ${index * 55}ms`}>
				<div class="vdash-rpm-card-header">
					<span class="vdash-skeleton-line rpm-title"></span>
					<span class="vdash-skeleton-pill rpm-chip"></span>
				</div>
				<span class="vdash-rpm-gauge"></span>
				<div class="vdash-rpm-meta">
					<span class="vdash-skeleton-line small"></span>
					<span class="vdash-skeleton-line small"></span>
				</div>
				</article>
			{/each}
			</div>
		</section>
		</section>

		<section class="vdash-summary-grid">
		{#each range(3) as _, index}
			<article class="vdash-summary-card" style={`--skeleton-delay: ${index * 55}ms`}>
			<span class="vdash-skeleton-line label short"></span>
			<span class="vdash-skeleton-line summary-value"></span>
			</article>
		{/each}
		</section>

		<section class="vdash-environment-summary">
		{#each range(2) as _, panelIndex}
			<section class="vdash-panel vdash-environment-card" style={`--skeleton-delay: ${panelIndex * 80}ms`}>
			<div class="vdash-section-header">
				<div>
				<span class="vdash-skeleton-pill kicker"></span>
				<span class="vdash-skeleton-line heading wide"></span>
				</div>
			</div>

			<div class="vdash-environment-grid">
				{#each range(3) as _, index}
				<article style={`--skeleton-delay: ${panelIndex * 80 + index * 45}ms`}>
					<span class="vdash-skeleton-line label"></span>
					<span class="vdash-skeleton-line env-value"></span>
					<span class="vdash-skeleton-line env-note"></span>
				</article>
				{/each}
			</div>
			</section>
		{/each}
		</section>

		<section class="vdash-fuel-summary">
		<section class="vdash-panel vdash-main-fuel-card">
			<div class="vdash-section-header">
			<div>
				<span class="vdash-skeleton-pill kicker"></span>
				<span class="vdash-skeleton-line heading wide"></span>
			</div>
			<span class="vdash-skeleton-pill counter"></span>
			</div>

			<div class="vdash-fuel-cols">
			{#each range(4) as _, index}
				<article class="vdash-fuel-metric" style={`--skeleton-delay: ${index * 50}ms`}>
				<span class="vdash-skeleton-line label"></span>
				<span class="vdash-skeleton-line fuel-value"></span>
				</article>
			{/each}
			</div>

			<div class="vdash-fod-usage-summary">
			{#each range(3) as _, index}
				<article style={`--skeleton-delay: ${index * 55}ms`}>
				<span class="vdash-skeleton-line label"></span>
				<span class="vdash-skeleton-line fod-value"></span>
				</article>
			{/each}
			</div>
		</section>

		<section class="vdash-panel vdash-rob-card">
			<div class="vdash-section-header">
			<div>
				<span class="vdash-skeleton-pill kicker"></span>
				<span class="vdash-skeleton-line heading"></span>
			</div>
			</div>

			<div class="vdash-rob-content">
			<span class="vdash-skeleton-line label"></span>
			<span class="vdash-skeleton-line rob-value"></span>
			</div>
		</section>
		</section>
	</div>

	{:else if variant === 'trace-playback'}
	<div class="trace-skeleton-playback">
			<section class="trace-skeleton-main-grid">
				<section class="trace-skeleton-monitor-card">
					<div class="trace-skeleton-card-header">
						<div>
							<span class="trace-skeleton-line title"></span>
							<span class="trace-skeleton-line subtitle"></span>
						</div>
					</div>

					<div class="trace-skeleton-cctv-layout">
						<div class="trace-skeleton-cctv-main">
							<span class="trace-skeleton-cctv-scanline"></span>
							<div class="trace-skeleton-cctv-overlay">
								<span class="trace-skeleton-line camera-name"></span>
								<span class="trace-skeleton-pill camera-status"></span>
							</div>
						</div>

						<div class="trace-skeleton-cctv-mini-row">
							{#each range(3) as _, index}
								<span class="trace-skeleton-cctv-mini" style={`--skeleton-delay: ${index * 55}ms`}>
									<span class="trace-skeleton-line mini-title"></span>
									<span class="trace-skeleton-line mini-subtitle"></span>
								</span>
							{/each}
						</div>
					</div>
				</section>

				<section class="trace-skeleton-monitor-card">
					<div class="trace-skeleton-card-header trace-map-header">
						<div>
							<span class="trace-skeleton-line title"></span>
							<span class="trace-skeleton-line subtitle wide"></span>
						</div>
						<span class="trace-skeleton-coordinate-badge"></span>
					</div>

					<div class="trace-skeleton-map-panel">
						<span class="trace-skeleton-map-grid"></span>
						<span class="trace-skeleton-route-line"></span>
						<span class="trace-skeleton-vessel-marker"></span>
						<span class="trace-skeleton-map-badge"></span>
					</div>
				</section>
			</section>

			<section class="trace-skeleton-bottom-panel">
				<div class="trace-skeleton-playback-card">
					<div class="trace-skeleton-controls">
						<span class="trace-skeleton-step-btn"></span>
						<span class="trace-skeleton-play-btn"></span>
						<span class="trace-skeleton-step-btn"></span>
					</div>

					<div class="trace-skeleton-timeline">
						<span class="trace-skeleton-timeline-track"></span>
						<span class="trace-skeleton-timeline-progress"></span>
						<span class="trace-skeleton-timeline-dot"></span>
					</div>

					<div class="trace-skeleton-timebox">
						<span class="trace-skeleton-line count"></span>
						<span class="trace-skeleton-line time"></span>
					</div>
				</div>

				<section class="trace-skeleton-bottom-data-grid">
					<div class="trace-skeleton-info-grid">
						{#each range(5) as _, index}
							<article class="trace-skeleton-info-card" style={`--skeleton-delay: ${index * 45}ms`}>
								<span class="trace-skeleton-line label"></span>
								<span class="trace-skeleton-line metric"></span>
							</article>
						{/each}
					</div>

					<section class="trace-skeleton-rpm-panel">
						<div class="trace-skeleton-rpm-header">
							<span class="trace-skeleton-line title short"></span>
							<span class="trace-skeleton-line subtitle short"></span>
						</div>

						<div class="trace-skeleton-rpm-grid">
							{#each range(3) as _, index}
								<article class="trace-skeleton-rpm-card" style={`--skeleton-delay: ${index * 55}ms`}>
									<span class="trace-skeleton-line label"></span>
									<span class="trace-skeleton-line rpm-value"></span>
								</article>
							{/each}
						</div>
					</section>
				</section>
			</section>
		</div>

	{:else if variant === 'periodical-report'}
		<div class="periodical-skeleton-report">
			<section class="periodical-skeleton-data-received">
				<span class="periodical-skeleton-line label"></span>
				<span class="periodical-skeleton-line data-value"></span>
			</section>

			<div class="periodical-skeleton-summary-grid">
				{#each range(7) as _, index}
					<article class="periodical-skeleton-summary-card" style={`--skeleton-delay: ${index * 55}ms`}>
						<span class="periodical-skeleton-line label"></span>
						<span class="periodical-skeleton-line value"></span>
					</article>
				{/each}
			</div>

			<section class="periodical-skeleton-panel">
				<div class="periodical-skeleton-section-header">
					<div>
						<span class="periodical-skeleton-kicker"></span>
						<span class="periodical-skeleton-heading"></span>
					</div>
					<span class="periodical-skeleton-counter"></span>
				</div>

				<div class="periodical-skeleton-table" style="--periodical-skeleton-columns: 3;">
					{#each range(3) as _, columnIndex}
						<span
							class="periodical-skeleton-cell header"
							style={`--skeleton-width: ${columnIndex === 0 ? 58 : 46}%; --skeleton-delay: ${columnIndex * 22}ms`}
						></span>
					{/each}

					{#each range(rows || 4) as _, rowIndex}
						{#each range(3) as _, columnIndex}
							<span
								class={`periodical-skeleton-cell ${rowIndex % 2 ? 'even' : ''} ${rowIndex === safeCount(rows || 4) - 1 ? 'total-row' : ''}`}
								style={`--skeleton-width: ${columnIndex === 0 ? 64 : columnIndex === 1 ? 54 : 42}%; --skeleton-delay: ${rowIndex * 46 + columnIndex * 18}ms`}
							></span>
						{/each}
					{/each}
				</div>
			</section>

			<section class="periodical-skeleton-panel">
				<div class="periodical-skeleton-section-header">
					<div>
						<span class="periodical-skeleton-kicker"></span>
						<span class="periodical-skeleton-heading wide"></span>
					</div>
					<span class="periodical-skeleton-counter"></span>
				</div>

				<div class="periodical-skeleton-fod-grid">
					{#each range(3) as _, index}
						<article style={`--skeleton-delay: ${index * 45}ms`}>
							<span class="periodical-skeleton-line label short"></span>
							<span class="periodical-skeleton-line metric"></span>
						</article>
					{/each}
				</div>

				<div
					class="periodical-skeleton-table fuel-table"
					style={`--periodical-skeleton-columns: ${safeCount(columns || 4)}`}
				>
					{#each range(columns || 4) as _, columnIndex}
						<span
							class="periodical-skeleton-cell header"
							style={`--skeleton-width: ${columnIndex === 0 ? 58 : columnIndex === safeCount(columns || 4) - 1 ? 50 : 44}%; --skeleton-delay: ${columnIndex * 20}ms`}
						></span>
					{/each}

					{#each range(rows || 4) as _, rowIndex}
						{#each range(columns || 4) as _, columnIndex}
							<span
								class={`periodical-skeleton-cell ${rowIndex % 2 ? 'even' : ''} ${rowIndex === safeCount(rows || 4) - 1 ? 'total-row' : ''}`}
								style={`--skeleton-width: ${columnIndex === 0 ? 62 : columnIndex === safeCount(columns || 4) - 1 ? 48 : 42}%; --skeleton-delay: ${rowIndex * 44 + columnIndex * 16}ms`}
							></span>
						{/each}
					{/each}
				</div>
			</section>

			<section class="periodical-skeleton-panel">
				<div class="periodical-skeleton-section-header">
					<div>
						<span class="periodical-skeleton-kicker"></span>
						<span class="periodical-skeleton-heading"></span>
					</div>
				</div>

				<div class="periodical-skeleton-speed-grid">
					{#each range(2) as _, index}
						<article style={`--skeleton-delay: ${index * 60}ms`}>
							<span class="periodical-skeleton-line label short"></span>
							<span class="periodical-skeleton-line metric"></span>
						</article>
					{/each}
				</div>
			</section>
		</div>

	{:else if variant === 'monthly-report'}
		<div class="monthly-skeleton-report">
			<div class="monthly-skeleton-summary-grid">
				{#each range(4) as _, index}
					<article class="monthly-skeleton-summary-card" style={`--skeleton-delay: ${index * 55}ms`}>
						<span class="monthly-skeleton-line label"></span>
						<span class="monthly-skeleton-line value"></span>
					</article>
				{/each}
			</div>

			<section class="monthly-skeleton-table-section">
				<div class="monthly-skeleton-section-header">
					<div>
						<span class="monthly-skeleton-kicker"></span>
						<span class="monthly-skeleton-heading"></span>
					</div>
					<span class="monthly-skeleton-counter"></span>
				</div>

				<div class="monthly-skeleton-table-wrapper">
					<div
						class="monthly-skeleton-table"
						style={`--monthly-skeleton-columns: ${safeCount(columns || 10)}`}
					>
						{#each range(columns || 10) as _, columnIndex}
							<span
								class={`monthly-skeleton-cell header top ${columnIndex === 0 ? 'sticky-col' : ''}`}
								style={`--skeleton-width: ${columnIndex === 0 ? 52 : columnIndex === 1 ? 74 : 48}%; --skeleton-delay: ${columnIndex * 16}ms`}
							></span>
						{/each}

						{#each range(columns || 10) as _, columnIndex}
							<span
								class={`monthly-skeleton-cell header second ${columnIndex === 0 ? 'sticky-col' : ''}`}
								style={`--skeleton-width: ${columnIndex === 0 ? 40 : columnIndex % 3 === 0 ? 70 : 54}%; --skeleton-delay: ${columnIndex * 18}ms`}
							></span>
						{/each}

						{#each range(columns || 10) as _, columnIndex}
							<span
								class={`monthly-skeleton-cell header third ${columnIndex === 0 ? 'sticky-col' : ''}`}
								style={`--skeleton-width: ${columnIndex === 0 ? 38 : columnIndex % 2 ? 46 : 58}%; --skeleton-delay: ${columnIndex * 20}ms`}
							></span>
						{/each}

						{#each range(rows || 10) as _, rowIndex}
							{#each range(columns || 10) as _, columnIndex}
								<span
									class={`monthly-skeleton-cell ${columnIndex === 0 ? 'sticky-col date-col' : ''} ${rowIndex % 2 ? 'even' : ''} ${columnIndex > 1 && columnIndex % 5 === 0 ? 'total-col' : ''}`}
									style={`--skeleton-width: ${columnIndex === 0 ? 36 : columnIndex === 1 ? 64 : columnIndex % 5 === 0 ? 42 : 50}%; --skeleton-delay: ${rowIndex * 42 + columnIndex * 12}ms`}
								></span>
							{/each}
						{/each}
					</div>
				</div>
			</section>
		</div>

	{:else if variant === 'fuel-summary'}
		{#each range(rows || 4) as _, index}
			<article class="fuel-skeleton-summary-card" style={`--skeleton-delay: ${index * 60}ms`}>
				<span class="fuel-skeleton-line label"></span>
				<span class="fuel-skeleton-line value"></span>
				<span class="fuel-skeleton-line note"></span>
			</article>
		{/each}
	{:else if variant === 'fuel-comparison'}
		<div class="fuel-skeleton-comparison-grid">
			{#each range(4) as _, index}
				<article class="fuel-skeleton-metric-card" style={`--skeleton-delay: ${index * 55}ms`}>
					<span class="fuel-skeleton-line label"></span>
					<span class="fuel-skeleton-line value"></span>
				</article>
			{/each}
		</div>
	{:else if variant === 'fuel-operations'}
		<div class="fuel-skeleton-operation-grid">
			{#each range(3) as _, formIndex}
				<article class="fuel-skeleton-form-card" style={`--skeleton-delay: ${formIndex * 70}ms`}>
					<span class="fuel-skeleton-line heading"></span>

					{#each range(formIndex === 1 ? 4 : 3) as _, fieldIndex}
						<div
							class="fuel-skeleton-field"
							style={`--skeleton-delay: ${formIndex * 70 + fieldIndex * 35}ms`}
						>
							<span class="fuel-skeleton-line label short"></span>
							<span class="fuel-skeleton-input"></span>
						</div>
					{/each}

					<span class="fuel-skeleton-button"></span>
				</article>
			{/each}
		</div>

	{:else if variant === 'fuel-table' || variant === 'fuel-history'}
		<div class="fuel-skeleton-table-wrap">
			<div
				class="fuel-skeleton-table"
				style={`--fuel-skeleton-columns: ${safeCount(columns || (variant === 'fuel-history' ? 7 : 4))}`}
			>
				{#each range(columns || (variant === 'fuel-history' ? 7 : 4)) as _, columnIndex}
					<span
						class="fuel-skeleton-cell header"
						style={`--skeleton-width: ${columnIndex === 0 ? 68 : columnIndex % 2 ? 52 : 46}%; --skeleton-delay: ${columnIndex * 20}ms`}
					></span>
				{/each}

				{#each range(rows || (variant === 'fuel-history' ? 6 : 5)) as _, rowIndex}
					{#each range(columns || (variant === 'fuel-history' ? 7 : 4)) as _, columnIndex}
						<span
							class={`fuel-skeleton-cell ${rowIndex % 2 ? 'even' : ''}`}
							style={`--skeleton-width: ${columnIndex === 0 ? 70 : columnIndex >= safeCount(columns || (variant === 'fuel-history' ? 7 : 4)) - 2 ? 44 : 56}%; --skeleton-delay: ${rowIndex * 45 + columnIndex * 16}ms`}
						></span>
					{/each}
				{/each}
			</div>
		</div>
	{:else if variant === 'data-log'}
		<div class="data-log-skeleton">
			<section class="data-log-skeleton-table-section">
				<div class="data-log-skeleton-section-header">
					<div>
						<span class="data-log-skeleton-kicker"></span>
						<span class="data-log-skeleton-title"></span>
					</div>

					<span class="data-log-skeleton-counter"></span>
				</div>

				<div class="data-log-skeleton-table-wrapper">
					<div
						class="data-log-skeleton-table"
						style={`--data-log-skeleton-columns: ${safeCount(columns || 10)}`}
					>
						{#each range(columns || 10) as _, columnIndex}
							<span
								class={`data-log-skeleton-cell header ${columnIndex === 0 ? 'sticky-col' : ''}`}
								style={`--skeleton-delay: ${columnIndex * 18}ms; --skeleton-width: ${columnIndex === 0 ? 74 : columnIndex % 3 === 0 ? 62 : 48}%`}
							></span>
						{/each}

						{#each range(rows || 10) as _, rowIndex}
							{#each range(columns || 10) as _, columnIndex}
								<span
									class={`data-log-skeleton-cell ${columnIndex === 0 ? 'sticky-col' : ''} ${rowIndex % 2 ? 'even' : ''}`}
									style={`--skeleton-delay: ${rowIndex * 44 + columnIndex * 14}ms; --skeleton-width: ${columnIndex === 0 ? 78 : columnIndex === 1 || columnIndex === 2 ? 54 : columnIndex % 4 === 0 ? 38 : 48}%`}
								></span>
							{/each}
						{/each}
					</div>
				</div>
			</section>
		</div>
	{:else if variant === 'table'}
		<div class="skeleton-label">{label}</div>
		<div class="skeleton-table" style={`--skeleton-columns: ${safeCount(columns)}`}>
			{#each range(columns) as _}
				<span class="skeleton-cell header"></span>
			{/each}
			{#each range(rows) as _, rowIndex}
				{#each range(columns) as _, columnIndex}
					<span
						class="skeleton-cell"
						style={`--skeleton-width: ${columnIndex === 0 ? 82 : columnIndex % 2 ? 68 : 92}%; --skeleton-delay: ${rowIndex * 70 + columnIndex * 35}ms`}
					></span>
				{/each}
			{/each}
		</div>
	{:else if variant === 'fleet-list'}
		<div class="fleet-skeleton-list">
			{#each range(rows) as _, index}
				<div class="fleet-skeleton-card" style={`--skeleton-delay: ${index * 70}ms`}>
					<span class="fleet-dot"></span>
					<span class="fleet-copy">
						<span class="skeleton-line title"></span>
						<span class="skeleton-line medium"></span>
						<span class="skeleton-line wide"></span>
					</span>
					<span class="fleet-side">
						<span class="skeleton-chip"></span>
						<span class="fleet-pin"></span>
					</span>
				</div>
			{/each}
		</div>
	{:else if variant === 'list'}
		<div class="skeleton-label">{label}</div>
		<div class="skeleton-list">
			{#each range(rows) as _, index}
				<div class="skeleton-list-row" style={`--skeleton-delay: ${index * 80}ms`}>
					<span class="skeleton-avatar"></span>
					<span class="skeleton-copy">
						<span class="skeleton-line wide"></span>
						<span class="skeleton-line short"></span>
					</span>
					<span class="skeleton-chip"></span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="skeleton-label">{label}</div>
		<div class="skeleton-card-grid">
			{#each range(rows) as _, index}
				<div class="skeleton-card" style={`--skeleton-delay: ${index * 80}ms`}>
					<span class="skeleton-line title"></span>
					<span class="skeleton-line wide"></span>
					<span class="skeleton-line medium"></span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.loading-skeleton {
		--skeleton-base: rgba(148, 163, 184, 0.11);
		--skeleton-glow: rgba(96, 165, 250, 0.2);
		--skeleton-highlight: rgba(241, 245, 249, 0.16);
		width: 100%;
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 16px;
		background:
			radial-gradient(circle at 18% 12%, rgba(59, 130, 246, 0.1), transparent 32%),
			rgba(15, 23, 42, 0.54);
		padding: 14px;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.loading-skeleton.administrator-page,
	.loading-skeleton.admin-entity-list,
	.loading-skeleton.admin-detail-form,
	.loading-skeleton.admin-permission-catalog,
	.loading-skeleton.admin-compact-list,
	.loading-skeleton.admin-engine-curve-detail,
	.loading-skeleton.admin-global-audit-table {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.admin-page-skeleton,
	.admin-entity-list-skeleton,
	.admin-detail-form-skeleton,
	.admin-permission-catalog-skeleton,
	.admin-compact-list-skeleton,
	.admin-engine-curve-detail-skeleton,
	.admin-global-audit-table-skeleton {
		--admin-panel: var(--color-surface, #ffffff);
		--admin-elevated: var(--color-elevated, #f8fafc);
		--admin-accent-muted: var(--color-accent-muted, #eff6ff);
		--admin-border: #d9e2ec;
		--admin-soft-border: #e5edf5;
		--admin-line: #e2e8f0;
		--admin-line-strong: #f8fafc;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}

	.admin-page-skeleton {
		display: grid;
		gap: 14px;
	}

	.admin-skeleton-line,
	.admin-skeleton-pill,
	.admin-skeleton-input,
	.admin-skeleton-checkbox,
	.admin-engine-table-cell,
	.admin-global-audit-cell {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--admin-line) 0%,
			var(--admin-line-strong) 42%,
			var(--admin-line) 78%
		);
		background-size: 240% 100%;
		animation: adminSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.admin-skeleton-tabs {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		background: var(--admin-panel);
		border: 1px solid var(--admin-border);
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
		overflow-x: auto;
	}

	.admin-skeleton-pill.tab {
		width: 120px;
		height: 36px;
		border-radius: 0;
		background-color: var(--admin-elevated);
		border: 1px solid var(--admin-soft-border);
		flex: 0 0 auto;
	}

	.admin-skeleton-workspace {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		gap: 14px;
		align-items: start;
	}

	.admin-skeleton-side-panel,
	.admin-skeleton-editor-panel,
	.admin-permission-group-skeleton,
	.admin-engine-curve-detail-skeleton,
	.admin-global-audit-table-skeleton {
		background: var(--admin-panel);
		border: 1px solid var(--admin-border);
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
		overflow: hidden;
	}

	.admin-skeleton-side-panel {
		display: grid;
		gap: 10px;
		padding-bottom: 10px;
	}

	.admin-skeleton-section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--admin-soft-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--admin-panel);
		box-sizing: border-box;
	}

	.admin-skeleton-section-header.editor {
		border-bottom: 1px solid var(--admin-soft-border);
	}

	.admin-skeleton-section-header > div,
	.admin-permission-group-head > div,
	.admin-engine-detail-head-skeleton > div,
	.admin-entity-row-skeleton > div,
	.admin-compact-row-skeleton > div {
		min-width: 0;
		display: grid;
		gap: 7px;
	}

	.admin-skeleton-line.heading {
		width: 150px;
		height: 17px;
	}

	.admin-skeleton-line.heading.wide {
		width: 260px;
		max-width: 68vw;
	}

	.admin-skeleton-line.subtitle {
		width: 120px;
		height: 11px;
	}

	.admin-skeleton-line.subtitle.wide {
		width: 420px;
		max-width: 78vw;
	}

	.admin-skeleton-line.label {
		width: 92px;
		height: 10px;
	}

	.admin-skeleton-line.entity-title {
		width: 150px;
		max-width: 76%;
		height: 15px;
	}

	.admin-skeleton-line.entity-meta {
		width: 120px;
		max-width: 68%;
		height: 11px;
	}

	.admin-skeleton-line.entity-small {
		width: 180px;
		max-width: 82%;
		height: 10px;
	}

	.admin-skeleton-line.group-title {
		width: 180px;
		height: 16px;
	}

	.admin-skeleton-line.group-subtitle {
		width: 260px;
		max-width: 78%;
		height: 11px;
	}

	.admin-skeleton-line.permission-title {
		width: 220px;
		max-width: 80%;
		height: 13px;
	}

	.admin-skeleton-line.permission-desc {
		width: 360px;
		max-width: 92%;
		height: 10px;
	}

	.admin-skeleton-line.detail-value {
		width: 70%;
		height: 16px;
	}

	.admin-skeleton-line.page-text {
		width: 120px;
		height: 12px;
	}

	.admin-skeleton-pill.counter {
		width: 78px;
		height: 26px;
		background-color: var(--admin-accent-muted);
		border: 1px solid #bfdbfe;
	}

	.admin-skeleton-pill.status {
		width: 78px;
		height: 26px;
		background-color: var(--admin-accent-muted);
		border: 1px solid #bfdbfe;
		flex-shrink: 0;
	}

	.admin-skeleton-pill.status.small {
		width: 58px;
		height: 22px;
	}

	.admin-skeleton-pill.button {
		width: 120px;
		height: 36px;
		border-radius: 0;
		background-color: #2563eb;
	}

	.admin-skeleton-pill.button.muted {
		background-color: var(--admin-elevated);
		border: 1px solid #cbd5e1;
	}

	.admin-skeleton-input {
		width: calc(100% - 24px);
		height: 38px;
		margin: 0 12px;
		border-radius: 0;
		background-color: var(--admin-panel);
		border: 1px solid #cbd5e1;
		box-sizing: border-box;
	}

	.admin-field-skeleton .admin-skeleton-input {
		width: 100%;
		margin: 0;
	}

	.admin-entity-list-skeleton,
	.admin-compact-list-skeleton {
		display: grid;
		gap: 8px;
		padding: 10px;
	}

	.admin-entity-row-skeleton,
	.admin-compact-row-skeleton {
		min-height: 74px;
		padding: 12px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		background: var(--admin-panel);
		border: 1px solid var(--admin-soft-border);
		border-radius: 12px;
		box-sizing: border-box;
	}

	.admin-compact-row-skeleton {
		min-height: 62px;
	}

	.admin-detail-form-skeleton {
		padding: 14px;
		display: grid;
		gap: 14px;
		background: var(--admin-panel);
	}

	.admin-form-grid-skeleton {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.admin-field-skeleton {
		display: grid;
		gap: 6px;
		min-width: 0;
	}

	.admin-form-actions-skeleton {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
	}

	.admin-permission-catalog-skeleton {
		display: grid;
		gap: 12px;
	}

	.admin-permission-group-skeleton {
		border-radius: 12px;
	}

	.admin-permission-group-head {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--admin-soft-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--admin-panel);
	}

	.admin-permission-items {
		padding: 10px;
		display: grid;
		gap: 8px;
		background: var(--admin-elevated);
	}

	.admin-permission-item-skeleton {
		min-height: 58px;
		padding: 10px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 10px;
		background: var(--admin-panel);
		border: 1px solid var(--admin-soft-border);
		border-radius: 10px;
		box-sizing: border-box;
	}

	.admin-skeleton-checkbox {
		width: 18px;
		height: 18px;
		border-radius: 5px;
		background-color: var(--admin-panel);
		border: 1px solid rgba(148, 163, 184, 0.55);
	}

	.admin-engine-curve-detail-skeleton {
		display: grid;
		gap: 12px;
		padding: 14px;
	}

	.admin-engine-detail-head-skeleton {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--admin-soft-border);
	}

	.admin-engine-detail-grid-skeleton {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.admin-engine-detail-card-skeleton {
		min-height: 74px;
		padding: 12px;
		display: grid;
		align-content: center;
		gap: 8px;
		background: var(--admin-elevated);
		border: 1px solid var(--admin-soft-border);
		border-radius: 10px;
		box-sizing: border-box;
	}

	.admin-engine-table-skeleton {
		display: grid;
		grid-template-columns: repeat(5, minmax(100px, 1fr));
		overflow-x: auto;
		border: 1px solid var(--admin-border);
		background: var(--admin-panel);
	}

	.admin-engine-table-cell {
		height: 38px;
		border-radius: 0;
		border-right: 1px solid #d7dee8;
		border-bottom: 1px solid #d7dee8;
		background-color: var(--admin-panel);
	}

	.admin-engine-table-cell.header {
		background: var(--admin-elevated);
	}

	.admin-engine-table-cell::before,
	.admin-global-audit-cell::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 12px;
		width: var(--skeleton-width, 58%);
		height: 9px;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--admin-line) 0%,
			var(--admin-line-strong) 42%,
			var(--admin-line) 78%
		);
		background-size: 240% 100%;
		transform: translateY(-50%);
		animation: adminSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.admin-engine-table-cell.header::before,
	.admin-global-audit-cell.header::before {
		height: 8px;
		background: linear-gradient(
			90deg,
			rgba(148, 163, 184, 0.26) 0%,
			rgba(248, 250, 252, 0.9) 42%,
			rgba(148, 163, 184, 0.26) 78%
		);
		background-size: 240% 100%;
	}

	.admin-global-audit-table-skeleton {
		background: var(--admin-panel);
	}

	.admin-global-audit-grid-skeleton {
		display: grid;
		grid-template-columns: repeat(var(--admin-audit-columns, 5), minmax(120px, 1fr));
		min-width: 760px;
		background: var(--admin-panel);
		overflow-x: auto;
	}

	.admin-global-audit-cell {
		height: 41px;
		border-radius: 0;
		border-right: 1px solid #d7dee8;
		border-bottom: 1px solid #d7dee8;
		background-color: var(--admin-panel);
	}

	.admin-global-audit-cell.header {
		height: 39px;
		background: var(--admin-elevated);
	}

	.admin-global-audit-cell.even {
		background: var(--admin-elevated);
	}

	.admin-global-audit-cell.action-col::before {
		width: 62px;
		height: 24px;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			rgba(191, 219, 254, 0.78) 0%,
			rgba(239, 246, 255, 0.96) 42%,
			rgba(191, 219, 254, 0.78) 78%
		);
		background-size: 240% 100%;
	}

	.admin-global-audit-pagination-skeleton {
		padding: 12px 14px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		background: var(--admin-elevated);
		border-top: 1px solid var(--admin-soft-border);
	}

	@keyframes adminSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	@media (max-width: 1100px) {
		.admin-skeleton-workspace {
			grid-template-columns: 1fr;
		}

		.admin-form-grid-skeleton,
		.admin-engine-detail-grid-skeleton {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.admin-skeleton-tabs {
			align-items: stretch;
		}

		.admin-skeleton-pill.tab {
			width: 104px;
		}

		.admin-skeleton-section-header,
		.admin-permission-group-head,
		.admin-engine-detail-head-skeleton {
			align-items: flex-start;
			flex-direction: column;
		}

		.admin-entity-row-skeleton,
		.admin-compact-row-skeleton {
			grid-template-columns: 1fr;
			align-items: start;
		}

		.admin-form-actions-skeleton,
		.admin-global-audit-pagination-skeleton {
			flex-direction: column;
			align-items: stretch;
		}

		.admin-skeleton-pill.button {
			width: 100%;
		}

		.admin-global-audit-grid-skeleton {
			min-width: 680px;
		}
	}

	.loading-skeleton.profile-page {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.profile-page-skeleton {
		--profile-panel: var(--color-surface, #ffffff);
		--profile-elevated: var(--color-elevated, #f8fafc);
		--profile-accent-muted: var(--color-accent-muted, #eff6ff);
		--profile-success-muted: var(--color-success-muted, #dcfce7);
		--profile-danger-muted: var(--color-danger-muted, #fee2e2);
		--profile-border: #d9e2ec;
		--profile-soft-border: #e5edf5;
		--profile-line: #e2e8f0;
		--profile-line-strong: #f8fafc;
		display: grid;
		gap: 14px;
		width: 100%;
		min-width: 0;
	}

	.profile-skeleton-hero,
	.profile-skeleton-summary-card,
	.profile-skeleton-panel {
		background: var(--profile-panel);
		border: 1px solid var(--profile-border);
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.profile-skeleton-line,
	.profile-skeleton-pill,
	.profile-skeleton-avatar,
	.profile-skeleton-input,
	.profile-skeleton-access-icon {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--profile-line) 0%,
			var(--profile-line-strong) 42%,
			var(--profile-line) 78%
		);
		background-size: 240% 100%;
		animation: profileSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.profile-skeleton-hero {
		padding: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		box-sizing: border-box;
	}

	.profile-skeleton-hero-left {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}

	.profile-skeleton-avatar {
		width: 58px;
		height: 58px;
		min-width: 58px;
		border-radius: 12px;
		background-color: var(--profile-accent-muted);
		border: 1px solid #bfdbfe;
	}

	.profile-skeleton-hero-copy {
		min-width: 0;
		display: grid;
		gap: 8px;
	}

	.profile-skeleton-pill.kicker {
		width: 108px;
		height: 22px;
		background-color: var(--profile-accent-muted);
	}

	.profile-skeleton-line.hero-title {
		width: 220px;
		max-width: 52vw;
		height: 24px;
	}

	.profile-skeleton-line.hero-subtitle {
		width: 520px;
		max-width: 68vw;
		height: 13px;
	}

	.profile-skeleton-badge-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 2px;
	}

	.profile-skeleton-pill.badge {
		width: 94px;
		height: 26px;
		background-color: var(--profile-accent-muted);
		border: 1px solid #bfdbfe;
	}

	.profile-skeleton-pill.badge.wide {
		width: 148px;
	}

	.profile-skeleton-pill.badge.date {
		width: 132px;
	}

	.profile-skeleton-pill.refresh-button {
		width: 92px;
		height: 36px;
		border-radius: 0;
		background-color: var(--profile-elevated);
		border: 1px solid #cbd5e1;
		flex-shrink: 0;
	}

	.profile-skeleton-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}

	.profile-skeleton-summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		box-sizing: border-box;
	}

	.profile-skeleton-line.summary-label {
		width: 92px;
		height: 10px;
	}

	.profile-skeleton-line.summary-value {
		width: 68%;
		height: 22px;
		margin-top: 10px;
	}

	.profile-skeleton-line.summary-note {
		width: 82%;
		height: 11px;
		margin-top: 9px;
	}

	.profile-skeleton-content-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		align-items: start;
	}

	.profile-skeleton-panel {
		min-width: 0;
	}

	.profile-skeleton-panel-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--profile-soft-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--profile-panel);
		box-sizing: border-box;
	}

	.profile-skeleton-panel-header > div {
		min-width: 0;
		display: grid;
		gap: 7px;
	}

	.profile-skeleton-line.panel-title {
		width: 170px;
		height: 17px;
	}

	.profile-skeleton-line.panel-title.short {
		width: 106px;
	}

	.profile-skeleton-line.panel-subtitle {
		width: 290px;
		max-width: 60vw;
		height: 12px;
	}

	.profile-skeleton-line.panel-subtitle.wide {
		width: 330px;
	}

	.profile-skeleton-pill.count {
		width: 42px;
		height: 28px;
		background-color: var(--profile-accent-muted);
		border: 1px solid #bfdbfe;
		flex-shrink: 0;
	}

	.profile-skeleton-form-grid {
		padding: 14px;
		display: grid;
		gap: 12px;
		background: var(--profile-panel);
	}

	.profile-skeleton-field {
		display: grid;
		gap: 5px;
	}

	.profile-skeleton-line.field-label {
		width: 112px;
		height: 10px;
	}

	.profile-skeleton-input {
		width: 100%;
		height: 32px;
		border-radius: 0;
		background-color: var(--profile-panel);
		border: 1px solid #cbd5e1;
		box-sizing: border-box;
	}

	.profile-skeleton-form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 2px;
	}

	.profile-skeleton-pill.form-button {
		width: 118px;
		height: 36px;
		border-radius: 0;
		background-color: #2563eb;
	}

	.profile-skeleton-pill.form-button.danger {
		background-color: #b5150c;
	}

	.profile-skeleton-access-list {
		max-height: 360px;
		overflow: hidden;
		padding: 14px;
		display: grid;
		gap: 10px;
		background: var(--profile-elevated);
		box-sizing: border-box;
	}

	.profile-skeleton-access-row {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr);
		gap: 12px;
		align-items: center;
		padding: 12px;
		border-radius: 12px;
		background: var(--profile-panel);
		border: 1px solid var(--profile-border);
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
		box-sizing: border-box;
	}

	.profile-skeleton-access-row > div {
		min-width: 0;
		display: grid;
		gap: 6px;
	}

	.profile-skeleton-access-icon {
		width: 42px;
		height: 42px;
		border-radius: 12px;
	}

	.profile-skeleton-access-icon.vessel {
		background-color: var(--profile-accent-muted);
		border: 1px solid #bfdbfe;
	}

	.profile-skeleton-access-icon.asset {
		background-color: var(--profile-success-muted);
		border: 1px solid #bbf7d0;
	}

	.profile-skeleton-line.access-title {
		width: 170px;
		max-width: 72%;
		height: 14px;
	}

	.profile-skeleton-line.access-meta {
		width: 230px;
		max-width: 84%;
		height: 12px;
	}

	.profile-skeleton-line.access-id {
		width: 280px;
		max-width: 92%;
		height: 10px;
	}

	@keyframes profileSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	@media (max-width: 1100px) {
		.profile-skeleton-summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.profile-skeleton-content-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.profile-skeleton-hero {
			flex-direction: column;
			align-items: flex-start;
		}

		.profile-skeleton-hero-left {
			align-items: flex-start;
		}

		.profile-skeleton-avatar {
			width: 52px;
			height: 52px;
			min-width: 52px;
		}

		.profile-skeleton-pill.refresh-button {
			width: 100%;
		}

		.profile-skeleton-summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}

		.profile-skeleton-summary-card {
			min-height: 72px;
			padding: 10px 12px;
		}

		.profile-skeleton-line.summary-value {
			height: 18px;
			margin-top: 6px;
		}

		.profile-skeleton-form-actions {
			width: 100%;
		}

		.profile-skeleton-pill.form-button {
			width: 100%;
		}

		.profile-skeleton-panel-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.profile-skeleton-pill.count {
			width: 64px;
		}

		.profile-skeleton-access-list {
			padding: 10px;
		}

		.profile-skeleton-access-row {
			grid-template-columns: 38px minmax(0, 1fr);
			padding: 10px;
		}

		.profile-skeleton-access-icon {
			width: 38px;
			height: 38px;
		}
	}

	.loading-skeleton.audit-log-table,
	.loading-skeleton.audit-log-detail {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.audit-log-table-skeleton,
	.audit-detail-skeleton {
		--audit-panel: var(--color-surface, #ffffff);
		--audit-elevated: var(--color-elevated, #f8fafc);
		--audit-accent-muted: var(--color-accent-muted, #eff6ff);
		--audit-border: #d9e2ec;
		--audit-soft-border: #e5edf5;
		--audit-line: #e2e8f0;
		--audit-line-strong: #f8fafc;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}

	.audit-log-skeleton-line,
	.audit-log-skeleton-pill,
	.audit-log-table-cell,
	.audit-detail-code-line {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--audit-line) 0%,
			var(--audit-line-strong) 42%,
			var(--audit-line) 78%
		);
		background-size: 240% 100%;
		animation: auditLogSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	/* Audit logs table skeleton */
	.audit-log-table-skeleton {
		background: var(--audit-panel);
	}

	.audit-log-table-scroll {
		width: 100%;
		overflow-x: auto;
		overflow-y: visible;
	}

	.audit-log-table-grid {
		min-width: 860px;
		display: grid;
		grid-template-columns:
			minmax(54px, 0.45fr)
			minmax(150px, 1.25fr)
			minmax(150px, 1.15fr)
			minmax(120px, 0.9fr)
			minmax(130px, 1fr)
			minmax(110px, 0.8fr)
			minmax(96px, 0.7fr);
		background: var(--audit-panel);
	}

	.audit-log-table-cell {
		height: 41px;
		border-radius: 0;
		border-bottom: 1px solid #eef2f7;
		background-color: var(--audit-panel);
	}

	.audit-log-table-cell.even {
		background-color: var(--audit-elevated);
	}

	.audit-log-table-cell.header {
		height: 38px;
		background: var(--audit-elevated);
		border-bottom: 1px solid #e2e8f0;
	}

	.audit-log-table-cell.action-col::before {
		width: 82px;
		height: 24px;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			rgba(191, 219, 254, 0.72) 0%,
			rgba(239, 246, 255, 0.95) 42%,
			rgba(191, 219, 254, 0.72) 78%
		);
		background-size: 240% 100%;
	}

	.audit-log-table-cell.button-col::before {
		width: 54px;
		height: 30px;
		border-radius: 0;
		background: linear-gradient(
			90deg,
			rgba(191, 219, 254, 0.72) 0%,
			rgba(239, 246, 255, 0.95) 42%,
			rgba(191, 219, 254, 0.72) 78%
		);
		background-size: 240% 100%;
	}

	.audit-log-table-cell::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 12px;
		width: var(--skeleton-width, 58%);
		height: 10px;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--audit-line) 0%,
			var(--audit-line-strong) 42%,
			var(--audit-line) 78%
		);
		background-size: 240% 100%;
		transform: translateY(-50%);
		animation: auditLogSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.audit-log-table-cell.header::before {
		height: 8px;
		background: linear-gradient(
			90deg,
			rgba(148, 163, 184, 0.22) 0%,
			rgba(248, 250, 252, 0.86) 42%,
			rgba(148, 163, 184, 0.22) 78%
		);
		background-size: 240% 100%;
	}

	.audit-log-pagination-skeleton {
		padding: 12px 14px;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 12px;
		background: var(--audit-elevated);
		border-top: 1px solid var(--audit-soft-border);
	}

	.audit-log-skeleton-pill.page-button {
		width: 82px;
		height: 32px;
		border-radius: 0;
		background-color: var(--audit-panel);
		border: 1px solid var(--audit-border);
	}

	.audit-log-skeleton-line.page-text {
		width: 118px;
		height: 12px;
	}

	/* Audit detail modal skeleton */
	.audit-detail-skeleton {
		display: grid;
		gap: 14px;
		padding: 14px;
		background: var(--audit-elevated);
	}

	.audit-detail-grid-skeleton {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.audit-detail-info-card,
	.audit-detail-changes-card {
		background: var(--audit-panel);
		border: 1px solid var(--audit-border);
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.audit-detail-info-card {
		min-height: 76px;
		padding: 14px;
		display: grid;
		align-content: center;
		gap: 8px;
		box-sizing: border-box;
	}

	.audit-log-skeleton-line.label {
		width: 72px;
		height: 10px;
	}

	.audit-log-skeleton-line.detail-value {
		width: 72%;
		height: 14px;
	}

	.audit-detail-changes-card {
		overflow: hidden;
	}

	.audit-detail-changes-header {
		min-height: 58px;
		padding: 12px 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid var(--audit-soft-border);
		background: var(--audit-panel);
	}

	.audit-detail-changes-header > div {
		min-width: 0;
		display: grid;
		gap: 7px;
	}

	.audit-log-skeleton-pill.kicker {
		width: 76px;
		height: 22px;
		background-color: var(--audit-accent-muted);
	}

	.audit-log-skeleton-line.heading {
		width: 180px;
		height: 17px;
	}

	.audit-log-skeleton-pill.counter {
		width: 74px;
		height: 26px;
		background-color: var(--audit-accent-muted);
		border: 1px solid #bfdbfe;
	}

	.audit-detail-code-skeleton {
		margin: 0;
		padding: 12px;
		min-height: 180px;
		max-height: 380px;
		overflow: hidden;
		background: #0f172a;
		display: grid;
		align-content: start;
		gap: 9px;
	}

	.audit-detail-code-line {
		width: var(--code-width, 70%);
		height: 11px;
		background: linear-gradient(
			90deg,
			rgba(148, 163, 184, 0.32) 0%,
			rgba(226, 232, 240, 0.72) 42%,
			rgba(148, 163, 184, 0.32) 78%
		);
		background-size: 240% 100%;
	}

	@keyframes auditLogSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	@media (max-width: 900px) {
		.audit-log-pagination-skeleton {
			align-items: stretch;
			flex-direction: column;
		}

		.audit-log-skeleton-pill.page-button {
			width: 100%;
		}

		.audit-log-skeleton-line.page-text {
			align-self: center;
		}
	}

	@media (max-width: 760px) {
		.audit-detail-grid-skeleton {
			grid-template-columns: 1fr;
		}

		.audit-detail-changes-header {
			align-items: flex-start;
			flex-direction: column;
		}
	}

	.loading-skeleton.all-vessel-summary-page,
	.loading-skeleton.all-vessel-vessel-list,
	.loading-skeleton.all-vessel-summary-table {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.avs-summary-page-skeleton,
	.avs-skeleton-vessel-list,
	.avs-summary-table-skeleton {
		--avs-panel: var(--color-surface, #ffffff);
		--avs-elevated: var(--color-elevated, #f8fafc);
		--avs-accent-muted: var(--color-accent-muted, #eff6ff);
		--avs-border: #d9e2ec;
		--avs-soft-border: #e2e8f0;
		--avs-line: #e2e8f0;
		--avs-line-strong: #f8fafc;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}

	.avs-summary-page-skeleton {
		display: grid;
		gap: 14px;
	}

	.avs-skeleton-line,
	.avs-skeleton-pill,
	.avs-skeleton-input,
	.avs-skeleton-check-row,
	.avs-skeleton-checkbox,
	.avs-skeleton-icon,
	.avs-skeleton-avatar,
	.avs-summary-table-cell {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--avs-line) 0%,
			var(--avs-line-strong) 42%,
			var(--avs-line) 78%
		);
		background-size: 240% 100%;
		animation: avsSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.avs-skeleton-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.avs-skeleton-summary-card,
	.avs-skeleton-panel,
	.avs-skeleton-vessel-panel {
		background: var(--avs-panel);
		border: 1px solid var(--avs-border);
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
		overflow: hidden;
	}

	.avs-skeleton-summary-card {
		min-height: 88px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 10px;
	}

	.avs-skeleton-line.label {
		width: 46%;
		height: 10px;
	}

	.avs-skeleton-line.value {
		width: 68%;
		height: 22px;
	}

	.avs-skeleton-line.heading {
		width: 154px;
		height: 17px;
	}

	.avs-skeleton-line.heading.wide {
		width: 230px;
		max-width: 70vw;
	}

	.avs-skeleton-line.title {
		width: 148px;
		height: 15px;
	}

	.avs-skeleton-line.subtitle {
		width: 260px;
		max-width: 72%;
		height: 11px;
		margin-top: 7px;
	}

	.avs-skeleton-line.vessel-name {
		width: 150px;
		max-width: 80%;
		height: 14px;
	}

	.avs-skeleton-line.strip-value {
		width: 136px;
		height: 14px;
		margin-top: 8px;
	}

	.avs-skeleton-pill.kicker {
		width: 102px;
		height: 22px;
		background-color: var(--avs-accent-muted);
	}

	.avs-skeleton-pill.counter {
		width: 78px;
		height: 26px;
		background-color: var(--avs-accent-muted);
		border: 1px solid #bfdbfe;
	}

	.avs-skeleton-pill.counter.wide {
		width: 126px;
	}

	.avs-skeleton-pill.badge {
		width: 82px;
		height: 26px;
		background-color: var(--avs-accent-muted);
		border: 1px solid #bfdbfe;
	}

	.avs-skeleton-pill.button {
		width: 112px;
		height: 40px;
		border-radius: 0;
		background-color: var(--avs-elevated);
		border: 1px solid #cbd5e1;
	}

	.avs-skeleton-pill.button.small {
		width: 118px;
	}

	.avs-skeleton-pill.preset {
		width: 112px;
		height: 34px;
		border-radius: 0;
		background-color: var(--avs-elevated);
		border: 1px solid #cbd5e1;
	}

	.avs-skeleton-layout-grid {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		gap: 14px;
	}

	.avs-skeleton-vessel-panel {
		min-height: 420px;
		display: flex;
		flex-direction: column;
	}

	.avs-skeleton-section-header {
		min-height: 58px;
		padding: 12px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid var(--avs-soft-border);
		background: var(--avs-panel);
		box-sizing: border-box;
	}

	.avs-skeleton-section-header > div {
		min-width: 0;
		display: grid;
		gap: 7px;
	}

	.avs-skeleton-vessel-tools {
		padding: 12px;
		display: grid;
		gap: 10px;
		background: var(--avs-elevated);
		border-bottom: 1px solid var(--avs-soft-border);
	}

	.avs-skeleton-input {
		width: 100%;
		height: 40px;
		border-radius: 0;
		background-color: var(--avs-panel);
		border: 1px solid #cbd5e1;
	}

	.avs-skeleton-check-row {
		width: 76%;
		height: 18px;
		background-color: var(--avs-line);
	}

	.avs-skeleton-vessel-list {
		display: grid;
		align-content: start;
		gap: 8px;
		padding: 10px;
		background: var(--avs-panel);
	}

	.avs-skeleton-vessel-list.standalone {
		padding: 0;
		background: transparent;
	}

	.avs-skeleton-vessel-card {
		min-height: 42px;
		padding: 10px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 10px;
		border: 1px solid var(--avs-soft-border);
		border-radius: 10px;
		background: var(--avs-panel);
		box-sizing: border-box;
	}

	.avs-skeleton-checkbox {
		width: 18px;
		height: 18px;
		min-width: 18px;
		border-radius: 5px;
		background-color: var(--avs-panel);
		border: 1px solid rgba(148, 163, 184, 0.55);
	}

	.avs-skeleton-control-panel {
		display: grid;
		gap: 14px;
		min-width: 0;
	}

	.avs-skeleton-request-body {
		display: grid;
		gap: 14px;
		padding: 14px;
		background: var(--avs-elevated);
	}

	.avs-skeleton-request-card,
	.avs-skeleton-vessel-request-panel,
	.avs-skeleton-vessel-request-card {
		background: var(--avs-panel);
		border: 1px solid var(--avs-border);
		border-radius: 12px;
		overflow: hidden;
	}

	.avs-skeleton-request-card,
	.avs-skeleton-vessel-request-panel {
		padding: 14px;
	}

	.avs-skeleton-request-head {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		margin-bottom: 14px;
	}

	.avs-skeleton-request-head.compact {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.avs-skeleton-icon,
	.avs-skeleton-avatar {
		width: 42px;
		height: 42px;
		border-radius: 12px;
		background-color: var(--avs-accent-muted);
	}

	.avs-skeleton-avatar {
		border-radius: 999px;
	}

	.avs-skeleton-request-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.avs-skeleton-field {
		display: grid;
		gap: 6px;
	}

	.avs-skeleton-preset-row {
		margin-top: 14px;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}

	.avs-skeleton-action-row {
		margin-top: 14px;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.avs-skeleton-strip {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.avs-skeleton-strip article {
		min-height: 72px;
		padding: 12px;
		background: var(--avs-panel);
		border: 1px solid var(--avs-border);
		border-radius: 10px;
		box-sizing: border-box;
	}

	.avs-skeleton-vessel-request-list {
		display: grid;
		gap: 10px;
	}

	.avs-skeleton-vessel-request-card {
		padding: 12px;
	}

	.avs-skeleton-vessel-request-title {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
	}

	.avs-summary-table-skeleton {
		width: 100%;
		overflow: auto;
		background: var(--avs-panel);
	}

	.avs-summary-table-grid {
		display: grid;
		grid-template-columns: repeat(var(--avs-summary-columns, 8), minmax(110px, 1fr));
		width: max-content;
		min-width: 100%;
		border: 1px solid var(--avs-border);
		border-top: 0;
	}

	.avs-summary-table-cell {
		height: 39px;
		border-radius: 0;
		border-right: 1px solid #d7dee8;
		border-bottom: 1px solid #d7dee8;
		background-color: var(--avs-panel);
	}

	.avs-summary-table-cell.header {
		height: 40px;
		background: #2563eb;
	}

	.avs-summary-table-cell.even {
		background-color: var(--avs-elevated);
	}

	.avs-summary-table-cell.metric-col {
		background-color: var(--avs-accent-muted);
	}

	.avs-summary-table-cell::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: var(--skeleton-width, 54%);
		height: 9px;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			rgba(148, 163, 184, 0.28) 0%,
			rgba(248, 250, 252, 0.92) 42%,
			rgba(148, 163, 184, 0.28) 78%
		);
		background-size: 240% 100%;
		transform: translate(-50%, -50%);
		animation: avsSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.avs-summary-table-cell.header::before {
		height: 8px;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.42) 0%,
			rgba(255, 255, 255, 0.86) 42%,
			rgba(255, 255, 255, 0.42) 78%
		);
		background-size: 240% 100%;
	}

	@keyframes avsSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	@media (max-width: 1100px) {
		.avs-skeleton-layout-grid {
			grid-template-columns: 1fr;
		}

		.avs-skeleton-vessel-panel {
			min-height: 320px;
		}

		.avs-skeleton-request-grid,
		.avs-skeleton-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.avs-skeleton-summary-grid,
		.avs-skeleton-request-grid,
		.avs-skeleton-strip {
			grid-template-columns: 1fr;
		}

		.avs-skeleton-section-header,
		.avs-skeleton-request-head,
		.avs-skeleton-vessel-request-title {
			align-items: flex-start;
			grid-template-columns: 1fr;
		}

		.avs-skeleton-action-row {
			flex-direction: column;
			align-items: stretch;
		}

		.avs-skeleton-pill.button {
			width: 100%;
		}

		.avs-summary-table-grid {
			min-width: 760px;
		}
	}

	.loading-skeleton.alarm-monitor-grid,
	.loading-skeleton.alarm-events-table {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.alarm-monitor-skeleton-grid,
	.alarm-events-skeleton-table {
		--alarm-panel: var(--color-surface, #ffffff);
		--alarm-elevated: var(--color-elevated, #f8fafc);
		--alarm-accent-muted: var(--color-accent-muted, #eff6ff);
		--alarm-border: #d9e2ec;
		--alarm-soft-border: #e5edf5;
		--alarm-line: #e2e8f0;
		--alarm-line-strong: #f8fafc;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}

	.alarm-skeleton-line,
	.alarm-skeleton-pill,
	.alarm-events-skeleton-cell {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--alarm-line, #e2e8f0) 0%,
			var(--alarm-line-strong, #f8fafc) 42%,
			var(--alarm-line, #e2e8f0) 78%
		);
		background-size: 240% 100%;
		animation: alarmSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.alarm-monitor-skeleton-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 12px;
		background: var(--alarm-elevated);
	}

	.alarm-monitor-skeleton-card {
		position: relative;
		min-height: 142px;
		padding: 14px;
		background: var(--alarm-panel);
		border: 1px solid var(--alarm-border);
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
		display: grid;
		gap: 12px;
		box-sizing: border-box;
	}

	.alarm-monitor-skeleton-card:first-child {
		border-color: #fed7aa;
		box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.12);
	}

	.alarm-monitor-skeleton-top {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
	}

	.alarm-monitor-skeleton-top > div,
	.alarm-monitor-skeleton-body > div {
		min-width: 0;
		display: grid;
		gap: 6px;
	}

	.alarm-monitor-skeleton-body {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px;
	}

	.alarm-skeleton-line.label {
		width: 62px;
		height: 10px;
	}

	.alarm-skeleton-line.vessel-name {
		width: 138px;
		height: 16px;
	}

	.alarm-skeleton-line.alarm-type {
		width: 170px;
		max-width: 80%;
		height: 13px;
	}

	.alarm-skeleton-line.update-time {
		width: 205px;
		max-width: 86%;
		height: 13px;
	}

	.alarm-skeleton-pill.status {
		width: 76px;
		height: 24px;
		background-color: var(--alarm-accent-muted);
		border: 1px solid #bfdbfe;
	}

	.alarm-skeleton-pill.new-badge {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 44px;
		height: 21px;
		background-color: #fed7aa;
	}

	.alarm-events-skeleton-table {
		background: var(--alarm-panel);
	}

	.alarm-events-skeleton-scroll {
		width: 100%;
		overflow: auto;
	}

	.alarm-events-skeleton-grid {
		min-width: 880px;
		display: grid;
		grid-template-columns: 1.15fr 1.05fr 0.75fr 1fr 1fr 1fr 0.85fr;
		background: var(--alarm-panel);
	}

	.alarm-events-skeleton-cell {
		height: 38px;
		border-radius: 0;
		border-bottom: 1px solid var(--alarm-soft-border);
		background-color: var(--alarm-panel);
	}

	.alarm-events-skeleton-cell.header {
		height: 38px;
		background: var(--alarm-elevated);
		border-bottom: 1px solid #e2e8f0;
	}

	.alarm-events-skeleton-pagination {
		padding: 12px 14px;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 10px;
		background: var(--alarm-elevated);
		border-top: 1px solid var(--alarm-soft-border);
	}

	.alarm-skeleton-pill.page-button {
		width: 82px;
		height: 32px;
		border-radius: 0;
		background-color: var(--alarm-panel);
		border: 1px solid var(--alarm-border);
	}

	.alarm-skeleton-line.page-text {
		width: 112px;
		height: 12px;
	}

	@keyframes alarmSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	@media (max-width: 760px) {
		.alarm-monitor-skeleton-grid {
			grid-template-columns: 1fr;
			padding: 10px;
		}

		.alarm-events-skeleton-pagination {
			justify-content: stretch;
			flex-direction: column;
			align-items: stretch;
		}

		.alarm-skeleton-pill.page-button {
			width: 100%;
		}

		.alarm-skeleton-line.page-text {
			align-self: center;
		}
	}

	.loading-skeleton.voyage-plans-page {
		display: block;
		width: 100%;
		margin-top: 14px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.voyage-plans-skeleton {
		display: grid;
		gap: 14px;
		width: 100%;
		min-width: 0;
	}

	.voyage-plans-main-grid {
		display: grid;
		grid-template-columns: minmax(520px, 1.08fr) minmax(410px, 0.92fr);
		gap: 14px;
		align-items: start;
	}

	.voyage-plans-bottom-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}

	.vplans-panel {
		min-width: 0;
		overflow: hidden;
	}

	.vplans-panel-toolbar {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		box-sizing: border-box;
	}

	.vplans-panel-toolbar > div {
		min-width: 0;
		display: grid;
		gap: 7px;
	}

	.vplans-panel-toolbar .vplan-skeleton-line.heading {
		width: 154px;
		height: 17px;
	}

	.vplans-panel-toolbar .vplan-skeleton-line.page-text {
		width: 122px;
		height: 11px;
	}

	.vplans-panel-toolbar .vplan-skeleton-line.page-text.wide {
		width: 290px;
		max-width: 62vw;
	}

	.vplan-skeleton-pill.search-input {
		width: 190px;
		height: 36px;
		border-radius: 0;
		flex-shrink: 0;
	}

	.vplan-skeleton-pill.status-badge {
		width: 82px;
		height: 30px;
		flex-shrink: 0;
	}

	.voyage-plans-table-wrap {
		width: 100%;
		overflow: auto;
		border-top: 1px solid rgba(148, 163, 184, 0.18);
	}

	.voyage-plans-table-wrap.route {
		max-height: 38vh;
	}

	.voyage-plans-table-grid {
		display: grid;
		width: 100%;
		min-width: 640px;
		background: transparent;
	}

	.voyage-plans-table-grid.cols-5 {
		grid-template-columns: 0.55fr 1.45fr 0.8fr 0.9fr 0.75fr;
	}

	.voyage-plans-table-grid.cols-4 {
		grid-template-columns: 0.7fr 1.1fr 1.1fr 0.8fr;
		min-width: 520px;
	}

	.voyage-plans-table-grid .vplan-table-cell {
		height: 39px;
		border-radius: 0;
		border-right: 1px solid rgba(148, 163, 184, 0.18);
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
	}

	.voyage-plans-table-grid .vplan-table-cell.header {
		height: 38px;
		background: #2563eb;
		opacity: 0.95;
	}

	.voyage-plans-table-grid .vplan-table-cell.even {
		background-color: rgba(30, 41, 59, 0.72);
	}

	.voyage-plans-table-grid .vplan-table-cell.badge-col::before,
	.voyage-plans-table-grid .vplan-table-cell.action-col::before {
		height: 22px;
		border-radius: 999px;
	}

	.vplans-pagination-skeleton {
		min-height: 58px;
		padding: 12px 14px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		border-top: 1px solid rgba(148, 163, 184, 0.18);
		box-sizing: border-box;
	}

	.vplan-skeleton-pill.page-button {
		width: 78px;
		height: 32px;
		border-radius: 0;
	}

	.vplan-skeleton-pill.page-size {
		width: 86px;
		height: 32px;
		border-radius: 0;
	}

	.vplans-detail-summary {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.vplans-detail-summary article {
		min-height: 76px;
		padding: 12px;
		display: grid;
		align-content: center;
		gap: 10px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 10px;
		box-sizing: border-box;
	}

	.vplans-detail-summary .vplan-skeleton-line.label {
		width: 62px;
		height: 10px;
	}

	.vplans-detail-summary .vplan-skeleton-line.value {
		width: 74%;
		height: 18px;
		margin-top: 0;
	}

	.vplans-allowed-list {
		padding: 0 14px 14px;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}

	.vplan-skeleton-pill.allowed-chip {
		width: 116px;
		height: 28px;
	}

	.vplans-form-grid {
		padding: 14px;
		display: grid;
		gap: 12px;
	}

	.vplans-form-grid.compact {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.vplans-form-field {
		min-width: 0;
		display: grid;
		gap: 6px;
	}

	.vplans-form-field .vplan-skeleton-line.label {
		width: 112px;
		height: 10px;
	}

	.vplan-skeleton-pill.form-input {
		width: 100%;
		height: 38px;
		border-radius: 0;
	}

	.vplan-skeleton-pill.form-button {
		width: 136px;
		height: 38px;
		border-radius: 0;
		align-self: end;
	}

	.vplans-preview-table {
		padding: 0 14px 14px;
		overflow: auto;
	}

	@media (max-width: 1180px) {
		.voyage-plans-main-grid,
		.voyage-plans-bottom-grid {
			grid-template-columns: 1fr;
		}

		.vplans-panel-toolbar {
			align-items: flex-start;
			flex-direction: column;
		}

		.vplan-skeleton-pill.search-input {
			width: 100%;
		}
	}

	@media (max-width: 720px) {
		.vplans-detail-summary,
		.vplans-form-grid.compact {
			grid-template-columns: 1fr;
		}

		.vplans-pagination-skeleton {
			align-items: stretch;
			flex-direction: column;
		}

		.vplan-skeleton-pill.page-button,
		.vplan-skeleton-pill.page-size,
		.vplan-skeleton-pill.form-button {
			width: 100%;
		}

		.voyage-plans-table-grid.cols-5,
		.voyage-plans-table-grid.cols-4 {
			min-width: 680px;
		}
	}

	.loading-skeleton.voyage-plan-vessel {
		display: block;
		width: 100%;
		margin-top: 14px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.loading-skeleton.voyage-route-map,
	.loading-skeleton.voyage-assignment-detail,
	.loading-skeleton.voyage-history-table {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.voyage-plan-skeleton {
		--vplan-panel: var(--color-surface, #ffffff);
		--vplan-elevated: var(--color-elevated, #f8fafc);
		--vplan-accent-muted: var(--color-accent-muted, #eff6ff);
		--vplan-border: #d9e2ec;
		--vplan-soft-border: #e2e8f0;
		--vplan-line: #e2e8f0;
		--vplan-line-strong: #f8fafc;
		display: grid;
		gap: 14px;
		width: 100%;
		min-width: 0;
	}

	.vplan-panel,
	.vplan-summary-card {
		min-width: 0;
		background: var(--vplan-panel);
		border: 1px solid var(--vplan-border);
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.vplan-skeleton-line,
	.vplan-skeleton-pill,
	.vplan-table-cell,
	.vplan-map-chip,
	.voyage-map-mini-grid span {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--vplan-line, #e2e8f0) 0%,
			var(--vplan-line-strong, #f8fafc) 42%,
			var(--vplan-line, #e2e8f0) 78%
		);
		background-size: 240% 100%;
		animation: vplanSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.vplan-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}

	.vplan-summary-card {
		padding: 14px 16px;
	}

	.vplan-skeleton-line.label {
		width: 58%;
		height: 10px;
	}

	.vplan-skeleton-line.value {
		width: 72%;
		height: 17px;
		margin-top: 8px;
	}

	.vplan-skeleton-line.heading {
		width: 150px;
		height: 17px;
	}

	.vplan-skeleton-line.heading.wide {
		width: 230px;
		max-width: 70vw;
	}

	.vplan-skeleton-line.detail-value {
		width: 76%;
		height: 13px;
		margin-top: 7px;
	}

	.vplan-skeleton-line.page-text {
		width: 118px;
		height: 12px;
	}

	.vplan-skeleton-pill.kicker {
		width: 132px;
		height: 22px;
		background-color: var(--vplan-accent-muted);
	}

	.vplan-skeleton-pill.meta {
		width: 112px;
		height: 24px;
		background-color: var(--vplan-elevated);
		border: 1px solid var(--vplan-border);
	}

	.vplan-skeleton-pill.button {
		width: 96px;
		height: 32px;
		border-radius: 0;
		background-color: #dbeafe;
	}

	.vplan-skeleton-pill.counter {
		width: 74px;
		height: 24px;
		background-color: var(--vplan-elevated);
		border: 1px solid var(--vplan-border);
	}

	.vplan-skeleton-pill.page-button {
		width: 78px;
		height: 32px;
		border-radius: 0;
		background-color: var(--vplan-elevated);
		border: 1px solid var(--vplan-border);
	}

	.vplan-main-grid {
		display: grid;
		grid-template-columns: minmax(540px, 1.35fr) minmax(320px, 0.65fr);
		gap: 14px;
		align-items: stretch;
	}

	.vplan-map-panel,
	.vplan-detail-panel,
	.vplan-table-panel {
		padding: 14px;
	}

	.vplan-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
		background: var(--vplan-panel);
	}

	.vplan-section-header > div {
		min-width: 0;
		display: grid;
		gap: 7px;
	}

	.vplan-map-header {
		align-items: flex-start;
	}

	.vplan-meta-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 1px;
	}

	.vplan-action-row {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-left: auto;
	}

	.vplan-map-shell {
		position: relative;
		width: 100%;
		height: 460px;
		min-height: 460px;
		overflow: hidden;
		border: 1px solid var(--vplan-border);
		border-radius: 12px;
		background: #d9e2ec;
	}

	.vplan-map-grid {
		position: absolute;
		inset: 0;
		display: block;
		background:
			linear-gradient(90deg, rgba(148, 163, 184, 0.24) 1px, transparent 1px),
			linear-gradient(rgba(148, 163, 184, 0.24) 1px, transparent 1px);
		background-size: 42px 42px;
		opacity: 0.7;
	}

	.vplan-route-line {
		position: absolute;
		left: 10%;
		right: 12%;
		top: 53%;
		height: 4px;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.45);
		transform: rotate(-7deg);
	}

	.vplan-route-marker {
		position: absolute;
		z-index: 2;
		width: 30px;
		height: 30px;
		border: 3px solid #ffffff;
		border-radius: 999px;
		background: #2563eb;
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.32);
	}

	.vplan-route-marker.start {
		left: 12%;
		top: 57%;
		background: #16a34a;
	}

	.vplan-route-marker.middle {
		left: 52%;
		top: 43%;
	}

	.vplan-route-marker.finish {
		right: 13%;
		top: 48%;
		background: #ef4444;
	}

	.vplan-asset-marker {
		position: absolute;
		z-index: 2;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.88);
		box-shadow: 0 4px 10px rgba(15, 23, 42, 0.26);
	}

	.vplan-asset-marker.one {
		left: 32%;
		top: 34%;
	}

	.vplan-asset-marker.two {
		right: 28%;
		bottom: 24%;
	}

	.vplan-map-chip {
		position: absolute;
		right: 14px;
		bottom: 14px;
		width: 150px;
		height: 32px;
		border-radius: 10px;
		background-color: rgba(15, 23, 42, 0.86);
	}

	.vplan-detail-list {
		display: grid;
		gap: 8px;
	}

	.vplan-detail-item {
		padding: 10px 12px;
		border: 1px solid var(--vplan-border);
		border-radius: 10px;
		background: var(--vplan-elevated);
	}

	.vplan-table-panel {
		margin-top: 0;
	}

	.vplan-table-skeleton {
		display: grid;
		gap: 0;
		overflow: auto;
		border: 1px solid var(--vplan-border);
		background: var(--vplan-panel);
	}

	.vplan-table-skeleton.cols-4 {
		grid-template-columns: 0.7fr 1.1fr 1.1fr 0.8fr;
	}

	.vplan-table-skeleton.cols-7 {
		grid-template-columns: 0.55fr 0.75fr 1fr 1fr 1fr 1fr 0.7fr;
	}

	.vplan-table-cell {
		height: 38px;
		margin: 0;
		border-radius: 0;
		border-bottom: 1px solid var(--vplan-soft-border);
		background-color: var(--vplan-panel);
	}

	.vplan-table-cell.header {
		height: 36px;
		background: #2563eb;
		opacity: 0.95;
	}

	.vplan-pagination-skeleton {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 12px;
	}

	.voyage-map-mini-skeleton {
		display: grid;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--vplan-border, #d9e2ec);
		border-radius: 12px;
		background: var(--color-surface, #ffffff);
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
	}

	.voyage-map-mini-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 7px;
		margin-top: 4px;
	}

	.voyage-map-mini-grid span {
		height: 34px;
		border-radius: 8px;
	}

	.voyage-detail-mini-skeleton {
		display: grid;
		gap: 8px;
	}

	.voyage-history-table-skeleton {
		display: grid;
		gap: 10px;
	}

	@keyframes vplanSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	@media (max-width: 1180px) {
		.vplan-summary-grid,
		.vplan-main-grid {
			grid-template-columns: 1fr;
		}

		.vplan-action-row {
			justify-content: flex-start;
			margin-left: 0;
		}
	}

	@media (max-width: 720px) {
		.vplan-summary-grid {
			grid-template-columns: 1fr;
			gap: 10px;
		}

		.vplan-section-header,
		.vplan-map-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.vplan-action-row,
		.vplan-action-row .vplan-skeleton-pill.button {
			width: 100%;
		}

		.vplan-map-shell {
			height: 380px;
			min-height: 380px;
		}

		.vplan-table-skeleton.cols-4,
		.vplan-table-skeleton.cols-7 {
			min-width: 720px;
		}

		.vplan-pagination-skeleton {
			justify-content: flex-start;
		}
	}

	.loading-skeleton.vessel-dashboard {
		display: block;
		width: 100%;
		margin-top: 14px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.vessel-dashboard-skeleton {
		--vdash-panel: var(--color-surface, #ffffff);
		--vdash-elevated: var(--color-elevated, #f8fafc);
		--vdash-accent-muted: var(--color-accent-muted, #eff6ff);
		--vdash-border: #d9e2ec;
		--vdash-soft-border: #e5edf5;
		--vdash-line: #e2e8f0;
		--vdash-line-strong: #f8fafc;
		display: grid;
		gap: 14px;
		width: 100%;
		min-width: 0;
	}

	.vdash-panel,
	.vdash-summary-card {
		min-width: 0;
		background: var(--vdash-panel);
		border: 1px solid var(--vdash-border);
		border-radius: 12px;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.vdash-skeleton-line,
	.vdash-skeleton-pill,
	.vdash-map-status {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--vdash-line) 0%,
			var(--vdash-line-strong) 42%,
			var(--vdash-line) 78%
		);
		background-size: 240% 100%;
		animation: vdashSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.vdash-section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--vdash-soft-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--vdash-panel);
	}

	.vdash-section-header > div {
		min-width: 0;
		display: grid;
		gap: 7px;
	}

	.vdash-skeleton-pill.kicker {
		width: 112px;
		height: 22px;
		background-color: var(--vdash-accent-muted);
	}

	.vdash-skeleton-pill.counter {
		width: 82px;
		height: 26px;
		background-color: var(--vdash-accent-muted);
	}

	.vdash-skeleton-pill.online {
		width: 86px;
		height: 30px;
		background-color: var(--vdash-accent-muted);
	}

	.vdash-skeleton-pill.legend {
		width: 78px;
		height: 21px;
		background-color: var(--vdash-panel);
	}

	.vdash-skeleton-line.heading {
		width: 148px;
		height: 17px;
	}

	.vdash-skeleton-line.heading.wide {
		width: 220px;
		max-width: 70vw;
	}

	.vdash-skeleton-line.label {
		width: 58%;
		height: 10px;
	}

	.vdash-skeleton-line.label.short {
		width: 90px;
	}

	.vdash-skeleton-line.metric {
		width: 72%;
		height: 14px;
		margin-top: 7px;
	}

	.vdash-skeleton-line.small {
		width: 70px;
		height: 9px;
	}

	.vdash-hero-grid {
		display: grid;
		grid-template-columns: minmax(360px, 1fr) minmax(420px, 1.15fr);
		gap: 14px;
		min-height: 404px;
	}

	.vdash-cctv-section,
	.vdash-map-section {
		min-width: 0;
		min-height: 404px;
		display: flex;
		flex-direction: column;
	}

	.vdash-cctv-grid {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		padding: 14px;
		background: var(--vdash-elevated);
	}

	.vdash-cctv-box {
		position: relative;
		min-height: 142px;
		border-radius: 12px;
		overflow: hidden;
		background:
			linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px),
			linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
			#334155;
		background-size: 22px 22px, 22px 22px, auto;
		border: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 12px;
	}

	.vdash-cctv-top {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.vdash-camera-dot {
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: #22c55e;
		box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.14);
		flex: 0 0 auto;
	}

	.vdash-skeleton-line.status {
		width: 44px;
		height: 10px;
		background: rgba(219, 234, 254, 0.42);
	}

	.vdash-cctv-content {
		display: grid;
		place-items: center;
		text-align: center;
		gap: 6px;
		margin-bottom: 10px;
	}

	.vdash-cctv-icon {
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.14);
	}

	.vdash-skeleton-line.cctv-title {
		width: 82px;
		height: 14px;
		background: rgba(241, 245, 249, 0.55);
	}

	.vdash-skeleton-line.cctv-subtitle {
		width: 110px;
		height: 10px;
		background: rgba(219, 227, 236, 0.45);
	}

	.vdash-map-box {
		position: relative;
		flex: 1;
		width: 100%;
		min-height: 320px;
		background: #d9e1eb;
		overflow: hidden;
	}

	.vdash-map-grid {
		position: absolute;
		inset: 0;
		display: block;
		background:
			linear-gradient(90deg, rgba(148, 163, 184, 0.22) 1px, transparent 1px),
			linear-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px);
		background-size: 42px 42px;
		opacity: 0.62;
	}

	.vdash-map-route {
		position: absolute;
		left: 12%;
		right: 16%;
		top: 54%;
		height: 4px;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.38);
		transform: rotate(-8deg);
	}

	.vdash-map-route::before,
	.vdash-map-route::after {
		content: "";
		position: absolute;
		top: 50%;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #2563eb;
		transform: translateY(-50%);
	}

	.vdash-map-route::before {
		left: 0;
	}

	.vdash-map-route::after {
		right: 0;
	}

	.vdash-vessel-marker {
		position: absolute;
		left: 55%;
		top: 43%;
		width: 34px;
		height: 34px;
		border-radius: 999px;
		background: rgba(239, 246, 255, 0.98);
		border: 2px solid #2563eb;
		box-shadow:
			0 0 0 5px rgba(37, 99, 235, 0.22),
			0 0 0 10px rgba(37, 99, 235, 0.09),
			0 10px 20px rgba(15, 23, 42, 0.22);
		transform: translate(-50%, -50%);
	}

	.vdash-map-status {
		position: absolute;
		top: 10px;
		left: 50%;
		z-index: 2;
		width: 186px;
		height: 28px;
		transform: translateX(-50%);
		background-color: rgba(17, 24, 39, 0.94);
	}

	.vdash-map-legend {
		position: absolute;
		left: 8px;
		bottom: 8px;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 7px;
		border-radius: 8px;
		background: rgba(17, 24, 39, 0.94);
		border: 1px solid #dbe4ef;
	}

	.vdash-info-rpm-section {
		display: grid;
		grid-template-columns: minmax(420px, 0.9fr) minmax(540px, 1.1fr);
		gap: 14px;
		align-items: stretch;
	}

	.vdash-vessel-info-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		padding: 14px;
		background: var(--vdash-elevated);
	}

	.vdash-info-card {
		min-height: 72px;
		padding: 12px;
		border: 1px solid var(--vdash-border);
		border-radius: 10px;
		background: var(--vdash-panel);
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.vdash-info-card.highlight {
		border-color: #bfdbfe;
		background: var(--vdash-accent-muted);
	}

	.vdash-rpm-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(180px, 1fr));
		gap: 10px;
		padding: 14px;
		background: var(--vdash-elevated);
		min-width: 0;
	}

	.vdash-rpm-card {
		min-height: 178px;
		padding: 12px;
		border: 1px solid var(--vdash-border);
		border-radius: 12px;
		background: var(--vdash-panel);
		display: grid;
		gap: 10px;
		align-content: space-between;
	}

	.vdash-rpm-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.vdash-skeleton-line.rpm-title {
		width: 95px;
		height: 13px;
	}

	.vdash-skeleton-pill.rpm-chip {
		width: 54px;
		height: 22px;
	}

	.vdash-rpm-gauge {
		width: 76px;
		height: 76px;
		border-radius: 50%;
		justify-self: center;
		background:
			radial-gradient(circle at center, var(--vdash-panel) 46%, transparent 48%),
			conic-gradient(#2563eb 0deg 215deg, #e2e8f0 215deg 360deg);
		opacity: 0.85;
	}

	.vdash-rpm-meta {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		justify-items: center;
	}

	.vdash-summary-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px;
	}

	.vdash-summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.vdash-skeleton-line.summary-value {
		width: 112px;
		height: 22px;
		margin-top: 10px;
	}

	.vdash-environment-summary {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}

	.vdash-environment-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		padding: 14px;
		background: var(--vdash-elevated);
	}

	.vdash-environment-grid article {
		min-height: 82px;
		padding: 12px;
		border-radius: 10px;
		background: var(--vdash-panel);
		border: 1px solid var(--vdash-border);
	}

	.vdash-skeleton-line.env-value {
		width: 86px;
		height: 17px;
		margin-top: 9px;
	}

	.vdash-skeleton-line.env-note {
		width: 74px;
		height: 10px;
		margin-top: 8px;
	}

	.vdash-fuel-summary {
		display: grid;
		grid-template-columns: 1.45fr 0.85fr;
		gap: 14px;
	}

	.vdash-fuel-cols {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		padding: 14px;
		background: var(--vdash-elevated);
	}

	.vdash-fuel-metric {
		min-height: 92px;
		padding: 14px;
		border-radius: 10px;
		border: 1px solid var(--vdash-border);
		background: var(--vdash-panel);
	}

	.vdash-skeleton-line.fuel-value {
		width: 128px;
		height: 24px;
		margin-top: 12px;
	}

	.vdash-fod-usage-summary {
		padding: 0 14px 14px;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		background: var(--vdash-elevated);
	}

	.vdash-fod-usage-summary article {
		min-height: 68px;
		padding: 12px 14px;
		background: var(--vdash-panel);
		border: 1px solid var(--vdash-border);
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.vdash-skeleton-line.fod-value {
		width: 94px;
		height: 18px;
		margin-top: 6px;
	}

	.vdash-rob-card {
		min-height: 180px;
	}

	.vdash-rob-content {
		padding: 18px 16px;
		background: var(--vdash-elevated);
	}

	.vdash-skeleton-line.rob-value {
		width: 140px;
		height: 30px;
		margin-top: 14px;
	}

	@keyframes vdashSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	@media (max-width: 1100px) {
		.vdash-hero-grid,
		.vdash-info-rpm-section,
		.vdash-environment-summary,
		.vdash-fuel-summary {
			grid-template-columns: 1fr;
		}

		.vdash-hero-grid,
		.vdash-cctv-section,
		.vdash-map-section {
			min-height: auto;
		}

		.vdash-map-box {
			height: 320px;
			flex: none;
		}
	}

	@media (max-width: 780px) {
		.vdash-section-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.vdash-cctv-grid,
		.vdash-vessel-info-grid,
		.vdash-rpm-grid,
		.vdash-summary-grid,
		.vdash-environment-grid,
		.vdash-fuel-cols,
		.vdash-fod-usage-summary {
			grid-template-columns: 1fr;
		}

		.vdash-cctv-box {
			min-height: 150px;
		}

		.vdash-summary-card {
			min-height: 88px;
		}
	}

	.loading-skeleton.trace-playback {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.trace-skeleton-playback {
		--trace-skeleton-panel: var(--color-surface, #ffffff);
		--trace-skeleton-elevated: var(--color-elevated, #f8fafc);
		--trace-skeleton-border: #d8dde3;
		--trace-skeleton-line: #e2e8f0;
		--trace-skeleton-line-strong: #f8fafc;
		display: grid;
		grid-template-rows: minmax(0, 1fr) 190px;
		gap: 10px;
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.trace-skeleton-main-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: 0.9fr 1.45fr;
		gap: 10px;
	}

	.trace-skeleton-monitor-card,
	.trace-skeleton-playback-card,
	.trace-skeleton-info-card,
	.trace-skeleton-rpm-panel {
		background: var(--trace-skeleton-panel);
		border: 1px solid var(--trace-skeleton-border);
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
	}

	.trace-skeleton-monitor-card {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.trace-skeleton-line,
	.trace-skeleton-pill,
	.trace-skeleton-coordinate-badge,
	.trace-skeleton-map-badge {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--trace-skeleton-line) 0%,
			var(--trace-skeleton-line-strong) 42%,
			var(--trace-skeleton-line) 78%
		);
		background-size: 240% 100%;
		animation: traceSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.trace-skeleton-card-header {
		height: 46px;
		min-height: 46px;
		padding: 8px 12px;
		border-bottom: 1px solid #e2e8f0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		box-sizing: border-box;
	}

	.trace-skeleton-card-header > div,
	.trace-skeleton-rpm-header {
		min-width: 0;
		display: grid;
		gap: 6px;
	}

	.trace-skeleton-line.title {
		width: 132px;
		height: 13px;
	}

	.trace-skeleton-line.title.short {
		width: 92px;
	}

	.trace-skeleton-line.subtitle {
		width: 108px;
		height: 10px;
	}

	.trace-skeleton-line.subtitle.wide {
		width: 220px;
	}

	.trace-skeleton-line.subtitle.short {
		width: 78px;
	}

	.trace-skeleton-line.label {
		width: 52%;
		height: 9px;
		margin: 0 auto;
	}

	.trace-skeleton-line.metric {
		width: 74%;
		height: 14px;
		margin: 0 auto;
	}

	.trace-skeleton-line.camera-name {
		width: 82px;
		height: 15px;
	}

	.trace-skeleton-line.count {
		width: 54px;
		height: 10px;
		justify-self: end;
	}

	.trace-skeleton-line.time {
		width: 156px;
		height: 10px;
		justify-self: end;
	}

	.trace-skeleton-line.mini-title {
		width: 58px;
		height: 10px;
	}

	.trace-skeleton-line.mini-subtitle {
		width: 42px;
		height: 8px;
	}

	.trace-skeleton-line.rpm-value {
		width: 78%;
		height: 12px;
		margin: 0 auto;
	}

	.trace-skeleton-pill.camera-status {
		width: 58px;
		height: 20px;
	}

	.trace-skeleton-cctv-layout {
		flex: 1;
		min-height: 0;
		padding: 8px;
		display: grid;
		grid-template-rows: minmax(0, 1fr) 46px;
		gap: 8px;
	}

	.trace-skeleton-cctv-main {
		position: relative;
		min-height: 0;
		overflow: hidden;
		background:
			linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
			linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
			#4f5658;
		background-size: 22px 22px, 22px 22px, auto;
		display: grid;
		place-items: center;
	}

	.trace-skeleton-cctv-scanline {
		position: absolute;
		left: 0;
		right: 0;
		top: -40%;
		height: 40%;
		background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.09), transparent);
		animation: traceCctvScan 1.4s ease-out infinite;
	}

	.trace-skeleton-cctv-overlay {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		gap: 7px;
	}

	.trace-skeleton-cctv-mini-row {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.trace-skeleton-cctv-mini {
		min-width: 0;
		min-height: 46px;
		background: #53595b;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 5px;
		overflow: hidden;
	}

	.trace-skeleton-coordinate-badge {
		width: 176px;
		height: 26px;
		border-radius: 0;
		background-color: var(--trace-skeleton-elevated);
	}

	.trace-skeleton-map-panel {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: #d9d9d9;
	}

	.trace-skeleton-map-grid {
		position: absolute;
		inset: 0;
		display: block;
		background:
			linear-gradient(90deg, rgba(148, 163, 184, 0.22) 1px, transparent 1px),
			linear-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px);
		background-size: 42px 42px;
		opacity: 0.55;
	}

	.trace-skeleton-route-line {
		position: absolute;
		left: 13%;
		right: 17%;
		top: 54%;
		height: 4px;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.38);
		transform: rotate(-8deg);
	}

	.trace-skeleton-route-line::before,
	.trace-skeleton-route-line::after {
		content: '';
		position: absolute;
		top: 50%;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #2563eb;
		transform: translateY(-50%);
	}

	.trace-skeleton-route-line::before {
		left: 0;
	}

	.trace-skeleton-route-line::after {
		right: 0;
	}

	.trace-skeleton-vessel-marker {
		position: absolute;
		left: 55%;
		top: 44%;
		width: 0;
		height: 0;
		border-left: 10px solid transparent;
		border-right: 10px solid transparent;
		border-bottom: 24px solid #2563eb;
		filter: drop-shadow(0 4px 8px rgba(15, 23, 42, 0.2));
		transform: rotate(38deg);
	}

	.trace-skeleton-map-badge {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 92px;
		height: 24px;
		border-radius: 0;
	}

	.trace-skeleton-bottom-panel {
		height: 190px;
		min-height: 190px;
		max-height: 190px;
		display: grid;
		grid-template-rows: 56px minmax(0, 1fr);
		gap: 10px;
		overflow: hidden;
	}

	.trace-skeleton-playback-card {
		min-width: 0;
		height: 56px;
		min-height: 56px;
		max-height: 56px;
		padding: 8px 10px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) 190px;
		align-items: center;
		gap: 10px;
		overflow: hidden;
		box-sizing: border-box;
	}

	.trace-skeleton-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
	}

	.trace-skeleton-step-btn,
	.trace-skeleton-play-btn {
		display: block;
		height: 28px;
		border-radius: 0;
		background: #2563eb;
		opacity: 0.78;
	}

	.trace-skeleton-step-btn {
		width: 30px;
	}

	.trace-skeleton-play-btn {
		width: 64px;
	}

	.trace-skeleton-timeline {
		position: relative;
		height: 22px;
	}

	.trace-skeleton-timeline-track,
	.trace-skeleton-timeline-progress {
		position: absolute;
		left: 0;
		top: 9px;
		height: 3px;
		border-radius: 999px;
	}

	.trace-skeleton-timeline-track {
		right: 0;
		background: #d5dbe3;
	}

	.trace-skeleton-timeline-progress {
		width: 42%;
		background: #2563eb;
	}

	.trace-skeleton-timeline-dot {
		position: absolute;
		left: 42%;
		top: 4px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #2563eb;
		border: 2px solid #ffffff;
		box-shadow: 0 0 0 1px #2563eb;
		transform: translateX(-50%);
	}

	.trace-skeleton-timebox {
		display: grid;
		gap: 4px;
		justify-items: end;
	}

	.trace-skeleton-bottom-data-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: 1.15fr 1.35fr;
		gap: 10px;
		overflow: hidden;
	}

	.trace-skeleton-info-grid {
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 8px;
		overflow: hidden;
	}

	.trace-skeleton-info-card {
		min-width: 0;
		min-height: 0;
		padding: 8px 6px;
		display: grid;
		align-content: center;
		gap: 7px;
		text-align: center;
		box-sizing: border-box;
	}

	.trace-skeleton-rpm-panel {
		min-width: 0;
		min-height: 0;
		padding: 8px;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 7px;
		overflow: hidden;
		box-sizing: border-box;
	}

	.trace-skeleton-rpm-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.trace-skeleton-rpm-grid {
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
		overflow: hidden;
	}

	.trace-skeleton-rpm-card {
		min-width: 0;
		min-height: 0;
		padding: 6px 8px;
		background: var(--trace-skeleton-elevated);
		border: 1px solid #e2e8f0;
		display: grid;
		align-content: center;
		gap: 7px;
		text-align: center;
		box-sizing: border-box;
	}

	@keyframes traceSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	@keyframes traceCctvScan {
		from {
			top: -40%;
			opacity: 0.75;
		}

		to {
			top: 100%;
			opacity: 0;
		}
	}

	@media (max-width: 1200px) {
		.trace-skeleton-playback {
			height: auto;
			min-height: 0;
			grid-template-rows: auto auto;
			overflow: visible;
		}

		.trace-skeleton-main-grid,
		.trace-skeleton-bottom-data-grid {
			grid-template-columns: 1fr;
		}

		.trace-skeleton-monitor-card,
		.trace-skeleton-cctv-layout,
		.trace-skeleton-map-panel {
			min-height: 300px;
		}

		.trace-skeleton-bottom-panel {
			height: auto;
			min-height: 190px;
			max-height: none;
		}
	}

	@media (max-width: 760px) {
		.trace-skeleton-playback {
			gap: 8px;
		}

		.trace-skeleton-playback-card {
			height: auto;
			max-height: none;
			grid-template-columns: 1fr;
			justify-items: stretch;
		}

		.trace-skeleton-timebox {
			justify-items: start;
		}

		.trace-skeleton-line.count,
		.trace-skeleton-line.time {
			justify-self: start;
		}

		.trace-skeleton-info-grid,
		.trace-skeleton-rpm-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.trace-skeleton-coordinate-badge {
			display: none;
		}
	}

	.loading-skeleton.periodical-report {
		margin-top: 14px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.periodical-skeleton-report {
		display: grid;
		gap: 14px;
		width: 100%;
	}

	.periodical-skeleton-data-received,
	.periodical-skeleton-summary-card,
	.periodical-skeleton-panel,
	.periodical-skeleton-speed-grid article {
		background: var(--color-surface, #ffffff);
		border: 1px solid #d9e2ec;
		border-radius: 0;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.periodical-skeleton-data-received {
		min-height: 54px;
		padding: 14px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.periodical-skeleton-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}

	.periodical-skeleton-summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 10px;
	}

	.periodical-skeleton-section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface, #ffffff);
	}

	.periodical-skeleton-table {
		display: grid;
		grid-template-columns: repeat(var(--periodical-skeleton-columns, 3), minmax(110px, 1fr));
		width: 100%;
		overflow: auto;
	}

	.periodical-skeleton-cell {
		min-height: 40px;
		border-bottom: 1px solid #eef2f7;
		background: var(--color-surface, #ffffff);
	}

	.periodical-skeleton-cell.header {
		min-height: 39px;
		background: var(--color-elevated, #f8fafc);
		border-bottom: 1px solid #e2e8f0;
	}

	.periodical-skeleton-cell.even {
		background: var(--color-elevated, #f8fafc);
	}

	.periodical-skeleton-cell.total-row {
		background: var(--color-accent-muted, #dbeafe);
	}

	.periodical-skeleton-fod-grid {
		padding: 12px 14px 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		background: var(--color-elevated, #f8fafc);
	}

	.periodical-skeleton-fod-grid article {
		min-height: 68px;
		padding: 12px 14px;
		background: var(--color-surface, #ffffff);
		border: 1px solid #d9e2ec;
		border-radius: 10px;
	}

	.periodical-skeleton-speed-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		background: var(--color-elevated, #f8fafc);
	}

	.loading-skeleton.monthly-report {
		margin-top: 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.monthly-skeleton-report {
		display: grid;
		gap: 12px;
		width: 100%;
	}

	.monthly-skeleton-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.monthly-skeleton-summary-card,
	.monthly-skeleton-table-section {
		background: var(--color-surface, #ffffff);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.monthly-skeleton-summary-card {
		min-height: 84px;
		padding: 13px 14px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 9px;
	}

	.monthly-skeleton-section-header {
		min-height: 54px;
		padding: 11px 13px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface, #ffffff);
	}

	.monthly-skeleton-table-wrapper {
		width: 100%;
		max-height: 100vh;
		min-height: 260px;
		overflow: auto;
		background: var(--color-surface, #ffffff);
	}

	.monthly-skeleton-table {
		display: grid;
		grid-template-columns: repeat(var(--monthly-skeleton-columns, 10), minmax(76px, 1fr));
		width: max-content;
		min-width: 100%;
	}

	.monthly-skeleton-cell {
		min-height: 33px;
		border-right: 1px solid #d7dee8;
		border-bottom: 1px solid #d7dee8;
		background: var(--color-surface, #ffffff);
	}

	.monthly-skeleton-cell.header {
		position: sticky;
		z-index: 5;
		background: #3478e5;
		border-right: 1px solid rgba(255, 255, 255, 0.32);
		border-bottom: 1px solid rgba(255, 255, 255, 0.32);
	}

	.monthly-skeleton-cell.header.top {
		top: 0;
	}

	.monthly-skeleton-cell.header.second {
		top: 31px;
		background: #3b82f6;
	}

	.monthly-skeleton-cell.header.third {
		top: 62px;
		background: #4b8bf0;
	}

	.monthly-skeleton-cell.sticky-col {
		position: sticky;
		left: 0;
		z-index: 7;
		min-width: 44px;
		box-shadow: 1px 0 0 #d7dee8;
	}

	.monthly-skeleton-cell.header.sticky-col {
		z-index: 9;
		background: #3478e5;
		box-shadow: 1px 0 0 rgba(255, 255, 255, 0.22);
	}

	/* Strong visible shimmer for Monthly & Periodical reports */
	.loading-skeleton.monthly-report,
	.loading-skeleton.periodical-report {
		--report-skeleton-panel: color-mix(in srgb, var(--color-surface, #0f172a) 86%, #ffffff 14%);
		--report-skeleton-elevated: color-mix(in srgb, var(--color-elevated, #111827) 82%, #ffffff 18%);
		--report-skeleton-border: rgba(148, 163, 184, 0.28);
		--report-skeleton-line: rgba(148, 163, 184, 0.42);
		--report-skeleton-line-strong: rgba(226, 232, 240, 0.72);
		--report-skeleton-header-line: rgba(255, 255, 255, 0.72);
	}

	.monthly-skeleton-summary-card,
	.monthly-skeleton-table-section,
	.periodical-skeleton-data-received,
	.periodical-skeleton-summary-card,
	.periodical-skeleton-panel,
	.periodical-skeleton-speed-grid article {
		background: var(--report-skeleton-panel);
		border-color: var(--report-skeleton-border);
	}

	.monthly-skeleton-section-header,
	.periodical-skeleton-section-header {
		background: var(--report-skeleton-panel);
		border-bottom-color: var(--report-skeleton-border);
	}

	.monthly-skeleton-table-wrapper,
	.periodical-skeleton-fod-grid,
	.periodical-skeleton-speed-grid {
		background: var(--report-skeleton-elevated);
	}

	.monthly-skeleton-cell,
	.periodical-skeleton-cell {
		position: relative;
		overflow: hidden;
		background: var(--report-skeleton-panel);
		border-color: var(--report-skeleton-border);
	}

	.monthly-skeleton-cell.even,
	.monthly-skeleton-cell.total-col,
	.periodical-skeleton-cell.even {
		background: var(--report-skeleton-elevated);
	}

	.periodical-skeleton-cell.total-row,
	.periodical-skeleton-fod-grid article {
		background: var(--report-skeleton-panel);
		border-color: var(--report-skeleton-border);
	}

	.monthly-skeleton-line,
	.monthly-skeleton-kicker,
	.monthly-skeleton-heading,
	.monthly-skeleton-counter,
	.periodical-skeleton-line,
	.periodical-skeleton-kicker,
	.periodical-skeleton-heading,
	.periodical-skeleton-counter {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--report-skeleton-line) 0%,
			var(--report-skeleton-line-strong) 42%,
			var(--report-skeleton-line) 78%
		);
		background-size: 240% 100%;
		animation: reportSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.monthly-skeleton-line.label,
	.periodical-skeleton-line.label {
		width: 42%;
		height: 10px;
	}

	.monthly-skeleton-line.value,
	.periodical-skeleton-line.value,
	.periodical-skeleton-line.data-value {
		width: 72%;
		height: 24px;
	}

	.periodical-skeleton-line.metric {
		width: 68%;
		height: 20px;
		margin-top: 9px;
	}

	.periodical-skeleton-line.short {
		width: 34%;
	}

	.monthly-skeleton-kicker,
	.periodical-skeleton-kicker {
		width: 86px;
		height: 22px;
		margin-bottom: 7px;
	}

	.monthly-skeleton-heading,
	.periodical-skeleton-heading {
		width: 190px;
		height: 16px;
	}

	.periodical-skeleton-heading.wide {
		width: 240px;
	}

	.monthly-skeleton-counter,
	.periodical-skeleton-counter {
		width: 90px;
		height: 28px;
	}

	.monthly-skeleton-cell::before,
	.periodical-skeleton-cell::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: var(--skeleton-width, 54%);
		height: 9px;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			var(--report-skeleton-line) 0%,
			var(--report-skeleton-line-strong) 42%,
			var(--report-skeleton-line) 78%
		);
		background-size: 240% 100%;
		transform: translate(-50%, -50%);
		animation: reportSkeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.monthly-skeleton-cell.sticky-col::before {
		left: 50%;
	}

	.monthly-skeleton-cell.header::before {
		height: 8px;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.46) 0%,
			var(--report-skeleton-header-line) 42%,
			rgba(255, 255, 255, 0.46) 78%
		);
		background-size: 240% 100%;
	}

	.periodical-skeleton-cell.header::before {
		height: 8px;
	}

	@keyframes reportSkeletonShimmer {
		0% {
			background-position: 120% 0;
		}

		100% {
			background-position: -120% 0;
		}
	}

	.loading-skeleton.fuel-summary {
		display: contents;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.loading-skeleton.fuel-comparison,
	.loading-skeleton.fuel-operations,
	.loading-skeleton.fuel-table,
	.loading-skeleton.fuel-history {
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.fuel-skeleton-summary-card,
	.fuel-skeleton-metric-card,
	.fuel-skeleton-form-card {
		position: relative;
		overflow: hidden;
		min-width: 0;
		background: var(--color-surface, #ffffff);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.fuel-skeleton-summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 10px;
	}

	.fuel-skeleton-comparison-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		background: var(--color-elevated, #f8fafc);
	}

	.fuel-skeleton-metric-card {
		min-height: 92px;
		padding: 14px;
		border-radius: 10px;
		display: grid;
		align-content: center;
		gap: 12px;
	}

	.fuel-skeleton-operation-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(3, minmax(190px, 1fr));
		gap: 12px;
		background: var(--color-elevated, #f8fafc);
	}

	.fuel-skeleton-form-card {
		padding: 12px;
		border-radius: 10px;
		display: grid;
		align-content: start;
		gap: 9px;
	}

	.fuel-skeleton-field {
		display: grid;
		gap: 5px;
	}

	.fuel-skeleton-line,
	.fuel-skeleton-input,
	.fuel-skeleton-button,
	.fuel-skeleton-cell {
		position: relative;
		display: block;
		overflow: hidden;
		background: rgba(148, 163, 184, 0.18);
	}

	.fuel-skeleton-line {
		height: 10px;
		border-radius: 999px;
	}

	.fuel-skeleton-line.label {
		width: 46%;
		height: 11px;
	}

	.fuel-skeleton-line.label.short {
		width: 34%;
		height: 9px;
	}

	.fuel-skeleton-line.value {
		width: 72%;
		height: 24px;
		margin-top: 2px;
	}

	.fuel-skeleton-line.note {
		width: 82%;
		height: 10px;
	}

	.fuel-skeleton-line.heading {
		width: 58%;
		height: 14px;
		margin-bottom: 2px;
	}

	.fuel-skeleton-input {
		height: 32px;
		border-radius: 0;
		border: 1px solid #cbd5e1;
		background: var(--color-surface, #ffffff);
	}

	.fuel-skeleton-button {
		width: 72%;
		height: 32px;
		border-radius: 0;
		background: rgba(37, 99, 235, 0.24);
	}

	.fuel-skeleton-table-wrap {
		width: 100%;
		overflow: auto;
		background: var(--color-surface, #ffffff);
	}

	.fuel-skeleton-table {
		display: grid;
		grid-template-columns: repeat(var(--fuel-skeleton-columns, 4), minmax(110px, 1fr));
		width: 100%;
		min-width: 520px;
	}

	.loading-skeleton.fuel-history .fuel-skeleton-table {
		min-width: 780px;
	}

	.fuel-skeleton-cell {
		min-height: 39px;
		border-bottom: 1px solid #eef2f7;
		background: var(--color-surface, #ffffff);
	}

	.fuel-skeleton-cell.header {
		min-height: 38px;
		background: var(--color-elevated, #f8fafc);
		border-bottom: 1px solid #e2e8f0;
	}

	.fuel-skeleton-cell.even {
		background: var(--color-elevated, #f8fafc);
	}

	.fuel-skeleton-cell::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 12px;
		width: var(--skeleton-width, 58%);
		height: 9px;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.2);
		transform: translateY(-50%);
	}

	.fuel-skeleton-cell.header::before {
		height: 8px;
		background: rgba(100, 116, 139, 0.2);
	}

	.fuel-skeleton-line::after,
	.fuel-skeleton-input::after,
	.fuel-skeleton-button::after,
	.fuel-skeleton-cell::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent);
		transform: translateX(-110%);
		animation: skeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	@media (max-width: 1100px) {
		.fuel-skeleton-operation-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.fuel-skeleton-comparison-grid {
			grid-template-columns: 1fr;
		}
	}

	.loading-skeleton.compact {
		padding: 10px;
		border-radius: 12px;
	}

	.loading-skeleton.inline {
		width: auto;
		min-width: 86px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.loading-skeleton.fleet-list {
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
		padding: 0;
	}

	.skeleton-label {
		margin-bottom: 12px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.skeleton-card-grid,
	.skeleton-list,
	.fleet-skeleton-list {
		display: grid;
		gap: 10px;
	}

	.skeleton-card {
		display: grid;
		gap: 10px;
		padding: 12px;
		border: 1px solid rgba(148, 163, 184, 0.12);
		border-radius: 13px;
		background: rgba(17, 24, 39, 0.58);
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.skeleton-list-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 10px;
		border: 1px solid rgba(148, 163, 184, 0.12);
		border-radius: 12px;
		background: rgba(17, 24, 39, 0.58);
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.fleet-skeleton-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: 9px;
		min-height: 74px;
		padding: 10px 11px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 12px;
		background:
			linear-gradient(135deg, rgba(59, 130, 246, 0.1), transparent 42%),
			rgba(17, 24, 39, 0.68);
		box-shadow: inset 3px 0 0 rgba(59, 130, 246, 0.5);
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.fleet-copy,
	.fleet-side {
		display: grid;
		gap: 8px;
		min-width: 0;
	}

	.fleet-side {
		justify-items: end;
	}

	.skeleton-copy {
		display: grid;
		gap: 8px;
		min-width: 0;
	}

	.skeleton-table {
		display: grid;
		grid-template-columns: repeat(var(--skeleton-columns, 3), minmax(0, 1fr));
		gap: 8px;
	}

	.loading-skeleton.table .skeleton-table {
		border: 1px solid rgba(148, 163, 184, 0.12);
		border-radius: 12px;
		overflow: hidden;
		background: rgba(15, 23, 42, 0.3);
	}

	.skeleton-cell,
	.skeleton-line,
	.skeleton-pill,
	.skeleton-avatar,
	.skeleton-chip,
	.fleet-dot,
	.fleet-pin {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: var(--skeleton-base);
	}

	.skeleton-cell::after,
	.skeleton-line::after,
	.skeleton-pill::after,
	.skeleton-avatar::after,
	.skeleton-chip::after,
	.fleet-dot::after,
	.fleet-pin::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent,
			var(--skeleton-highlight),
			var(--skeleton-glow),
			transparent
		);
		transform: translateX(-110%);
		animation: skeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.skeleton-line {
		height: 10px;
	}

	.skeleton-line.title {
		width: 44%;
		height: 14px;
	}

	.loading-skeleton.fleet-list .skeleton-line.title {
		width: min(150px, 72%);
		height: 13px;
	}

	.skeleton-line.wide {
		width: 86%;
	}

	.skeleton-line.medium {
		width: 62%;
	}

	.skeleton-line.short {
		width: 42%;
	}

	.skeleton-pill {
		width: 92px;
		height: 18px;
	}

	.skeleton-avatar {
		width: 34px;
		height: 34px;
		border-radius: 12px;
	}

	.skeleton-chip {
		width: 58px;
		height: 24px;
	}

	.loading-skeleton.fleet-list .skeleton-chip {
		width: 74px;
		height: 22px;
	}

	.fleet-dot {
		width: 9px;
		height: 9px;
		margin-top: 4px;
		border-radius: 999px;
		background: rgba(34, 197, 94, 0.28);
	}

	.fleet-pin {
		width: 30px;
		height: 30px;
		border-radius: 10px;
		background: rgba(34, 197, 94, 0.13);
	}

	.loading-skeleton.data-log {
		margin-top: 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.data-log-skeleton {
		display: grid;
		gap: 12px;
		width: 100%;
	}

	.data-log-skeleton-table-section {
		background: var(--color-surface, #ffffff);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.data-log-skeleton-section-header {
		min-height: 54px;
		padding: 11px 13px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface, #ffffff);
	}

	.data-log-skeleton-section-header > div {
		display: grid;
		gap: 6px;
		min-width: 0;
	}

	.data-log-skeleton-kicker,
	.data-log-skeleton-title,
	.data-log-skeleton-counter,
	.data-log-skeleton-cell {
		position: relative;
		display: block;
		overflow: hidden;
	}

	.data-log-skeleton-kicker {
		width: 82px;
		height: 22px;
		border-radius: 999px;
		background: var(--color-accent-muted, #dbeafe);
	}

	.data-log-skeleton-title {
		width: min(220px, 54vw);
		height: 16px;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.22);
	}

	.data-log-skeleton-counter {
		width: 84px;
		height: 28px;
		border-radius: 999px;
		background: var(--color-accent-muted, #dbeafe);
		border: 1px solid #bfdbfe;
	}

	.data-log-skeleton-table-wrapper {
		width: 100%;
		max-height: calc(100vh - 430px);
		min-height: 260px;
		overflow: auto;
		background: var(--color-surface, #ffffff);
	}

	.data-log-skeleton-table {
		display: grid;
		grid-template-columns: repeat(var(--data-log-skeleton-columns, 10), minmax(96px, 1fr));
		width: max-content;
		min-width: 100%;
	}

	.data-log-skeleton-cell {
		min-height: 33px;
		border-right: 1px solid #d7dee8;
		border-bottom: 1px solid #d7dee8;
		background: var(--color-surface, #ffffff);
	}

	.data-log-skeleton-cell.header {
		position: sticky;
		top: 0;
		z-index: 5;
		min-height: 34px;
		background: #3478e5;
		border-right: 1px solid rgba(255, 255, 255, 0.32);
		border-bottom: 1px solid rgba(255, 255, 255, 0.32);
	}

	.data-log-skeleton-cell.even {
		background: var(--color-elevated, #f8fafc);
	}

	.data-log-skeleton-cell.sticky-col {
		position: sticky;
		left: 0;
		z-index: 7;
		min-width: 150px;
		box-shadow: 1px 0 0 #d7dee8;
	}

	.data-log-skeleton-cell.header.sticky-col {
		z-index: 9;
		background: #3478e5;
		box-shadow: 1px 0 0 rgba(255, 255, 255, 0.32);
	}

	.data-log-skeleton-cell::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: var(--skeleton-width, 52%);
		height: 9px;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.22);
		transform: translate(-50%, -50%);
	}

	.data-log-skeleton-cell.sticky-col::before {
		left: 9px;
		width: var(--skeleton-width, 76%);
		transform: translateY(-50%);
	}

	.data-log-skeleton-cell.header::before {
		height: 8px;
		background: rgba(255, 255, 255, 0.52);
	}

	.data-log-skeleton-kicker::after,
	.data-log-skeleton-title::after,
	.data-log-skeleton-counter::after,
	.data-log-skeleton-cell::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
		transform: translateX(-110%);
		animation: skeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	@media (max-width: 760px) {
		.data-log-skeleton-section-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.data-log-skeleton-counter {
			width: 100%;
			max-width: 140px;
		}
	}


	.loading-skeleton.daily-report {
		--daily-skeleton-base: rgba(148, 163, 184, 0.18);
		--daily-skeleton-soft: rgba(241, 245, 249, 0.68);
		--daily-skeleton-panel: var(--color-surface, #ffffff);
		--daily-skeleton-elevated: var(--color-elevated, #f8fafc);
		--daily-skeleton-border: #d9e2ec;
		--daily-skeleton-muted-border: #e5edf5;
		--daily-skeleton-accent: var(--color-accent-muted, #dbeafe);
		margin-top: 14px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.daily-report-skeleton {
		display: grid;
		gap: 14px;
		width: 100%;
	}

	.daily-skeleton-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}

	.daily-skeleton-summary-card,
	.daily-skeleton-speed-card,
	.daily-skeleton-panel,
	.daily-trip-route-skeleton-card,
	.daily-trip-detail-skeleton-card,
	.daily-event-skeleton-card,
	.daily-rpm-table-card-skeleton,
	.daily-chart-skeleton-card {
		background: var(--daily-skeleton-panel);
		border: 1px solid var(--daily-skeleton-border);
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.daily-skeleton-summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 12px;
	}

	.daily-skeleton-speed-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}

	.daily-skeleton-speed-card {
		min-height: 80px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 12px;
	}

	.daily-skeleton-panel {
		overflow: hidden;
	}

	.daily-skeleton-section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--daily-skeleton-muted-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--daily-skeleton-panel);
	}

	.daily-skeleton-section-header > div,
	.daily-card-header-skeleton > div,
	.daily-event-skeleton-header > div {
		display: grid;
		gap: 7px;
		min-width: 0;
	}

	.daily-trip-skeleton-content {
		padding: 14px;
		display: grid;
		grid-template-columns: minmax(320px, 0.9fr) minmax(360px, 1.1fr);
		gap: 14px;
		background: var(--daily-skeleton-elevated);
	}

	.daily-trip-route-skeleton-card,
	.daily-trip-detail-skeleton-card,
	.daily-event-skeleton-card,
	.daily-rpm-table-card-skeleton,
	.daily-chart-skeleton-card {
		border-radius: 12px;
		overflow: hidden;
	}

	.daily-card-header-skeleton,
	.daily-event-skeleton-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--daily-skeleton-muted-border);
		background: var(--daily-skeleton-panel);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.daily-skeleton-map {
		position: relative;
		height: 250px;
		margin: 14px;
		border-radius: 12px;
		border: 1px solid var(--daily-skeleton-border);
		background:
			linear-gradient(120deg, rgba(219, 234, 254, 0.55) 0 12%, transparent 12% 100%),
			linear-gradient(35deg, transparent 0 48%, rgba(203, 213, 225, 0.55) 48% 52%, transparent 52% 100%),
			var(--daily-skeleton-elevated);
		overflow: hidden;
	}

	.daily-skeleton-map-route {
		position: absolute;
		left: 17%;
		right: 18%;
		top: 50%;
		height: 4px;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.22);
		transform: rotate(-11deg);
	}

	.daily-skeleton-map-pin {
		position: absolute;
		width: 26px;
		height: 26px;
		border-radius: 999px;
		border: 3px solid #ffffff;
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
	}

	.daily-skeleton-map-pin.start {
		left: 18%;
		top: 56%;
		background: rgba(16, 185, 129, 0.32);
	}

	.daily-skeleton-map-pin.end {
		right: 18%;
		top: 34%;
		background: rgba(239, 68, 68, 0.3);
	}

	.daily-trip-detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.daily-trip-detail-grid div {
		min-height: 70px;
		padding: 14px;
		border-bottom: 1px solid #eef2f7;
		border-right: 1px solid #eef2f7;
		display: grid;
		align-content: center;
		gap: 10px;
	}

	.daily-trip-detail-grid div:nth-child(2n) {
		border-right: 0;
	}

	.daily-skeleton-table {
		display: grid;
		grid-template-columns: repeat(var(--daily-table-columns, 3), minmax(126px, 1fr));
		overflow-x: auto;
	}

	.daily-skeleton-table.compact-table {
		min-width: 100%;
	}

	.daily-skeleton-cell {
		position: relative;
		min-height: 38px;
		border-bottom: 1px solid #eef2f7;
		background: var(--daily-skeleton-panel);
		overflow: hidden;
	}

	.daily-skeleton-cell.header {
		min-height: 40px;
		background: var(--daily-skeleton-elevated);
		border-bottom: 1px solid #e2e8f0;
	}

	.daily-skeleton-cell::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 12px;
		width: var(--skeleton-width, 64%);
		height: 10px;
		border-radius: 999px;
		background: var(--daily-skeleton-base);
		transform: translateY(-50%);
	}

	.daily-skeleton-cell.header::before {
		height: 9px;
		width: 58%;
		background: rgba(148, 163, 184, 0.24);
	}

	.daily-event-skeleton-grid,
	.daily-chart-skeleton-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(340px, 1fr));
		gap: 14px;
		background: var(--daily-skeleton-elevated);
	}

	.daily-timeline-skeleton-list {
		padding: 12px 14px;
		display: grid;
		gap: 10px;
		background: var(--daily-skeleton-elevated);
	}

	.daily-timeline-legend {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
	}

	.daily-timeline-skeleton-row {
		min-height: 74px;
		padding: 10px 12px;
		background: var(--daily-skeleton-panel);
		border: 1px solid var(--daily-skeleton-border);
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
		display: grid;
		grid-template-columns: 150px 1fr;
		gap: 14px;
		align-items: center;
	}

	.daily-timeline-engine {
		display: grid;
		gap: 8px;
	}

	.daily-skeleton-timeline-labels {
		display: block;
		width: 72%;
		height: 12px;
		margin: 0 auto 4px;
		border-radius: 999px;
		background: var(--daily-skeleton-base);
		position: relative;
		overflow: hidden;
	}

	.daily-skeleton-timeline {
		display: block;
		height: 24px;
		border: 1px solid var(--daily-skeleton-border);
		border-radius: 999px;
		background:
			linear-gradient(90deg, rgba(16, 185, 129, 0.28) 0 38%, rgba(148, 163, 184, 0.34) 38% 57%, rgba(16, 185, 129, 0.28) 57% 100%);
		position: relative;
		overflow: hidden;
	}

	.daily-skeleton-axis {
		display: block;
		height: 10px;
		margin-top: 6px;
		border-radius: 999px;
		background: linear-gradient(90deg, var(--daily-skeleton-base), transparent 42%, transparent 58%, var(--daily-skeleton-base));
	}

	.daily-fod-skeleton-grid {
		padding: 12px 14px 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		background: var(--daily-skeleton-elevated);
	}

	.daily-fod-skeleton-grid article {
		min-height: 68px;
		padding: 12px 14px;
		background: var(--daily-skeleton-panel);
		border: 1px solid var(--daily-skeleton-border);
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 10px;
	}

	.daily-rpm-table-card-list {
		padding: 14px;
		display: grid;
		gap: 14px;
		background: var(--daily-skeleton-elevated);
	}

	.daily-skeleton-chart {
		height: 320px;
		margin: 14px;
		border: 1px solid var(--daily-skeleton-border);
		border-radius: 12px;
		background:
			linear-gradient(180deg, transparent 0 24%, rgba(203, 213, 225, 0.28) 24% 25%, transparent 25% 49%, rgba(203, 213, 225, 0.22) 49% 50%, transparent 50% 74%, rgba(203, 213, 225, 0.22) 74% 75%, transparent 75% 100%),
			linear-gradient(90deg, transparent 0 19%, rgba(203, 213, 225, 0.18) 19% 20%, transparent 20% 39%, rgba(203, 213, 225, 0.18) 39% 40%, transparent 40% 59%, rgba(203, 213, 225, 0.18) 59% 60%, transparent 60% 79%, rgba(203, 213, 225, 0.18) 79% 80%, transparent 80% 100%),
			var(--daily-skeleton-elevated);
		position: relative;
		overflow: hidden;
	}

	.daily-skeleton-chart::before {
		content: '';
		position: absolute;
		left: 8%;
		right: 7%;
		bottom: 24%;
		height: 4px;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.24);
		transform: rotate(-8deg);
		transform-origin: left center;
	}

	.daily-skeleton-chart::after {
		content: '';
		position: absolute;
		left: 8%;
		right: 12%;
		bottom: 44%;
		height: 4px;
		border-radius: 999px;
		background: rgba(22, 163, 74, 0.22);
		transform: rotate(10deg);
		transform-origin: left center;
	}

	.daily-skeleton-line,
	.daily-skeleton-pill,
	.daily-skeleton-timeline-labels,
	.daily-skeleton-timeline,
	.daily-skeleton-axis,
	.daily-skeleton-map-route,
	.daily-skeleton-map-pin {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 999px;
		background: var(--daily-skeleton-base);
	}

	.daily-skeleton-line {
		height: 10px;
		width: 72%;
	}

	.daily-skeleton-line.label {
		width: 42%;
		height: 9px;
	}

	.daily-skeleton-line.value {
		width: 64%;
		height: 22px;
	}

	.daily-skeleton-line.value.small {
		width: 50%;
		height: 18px;
	}

	.daily-skeleton-line.heading {
		width: 170px;
		height: 17px;
	}

	.daily-skeleton-line.heading.wide {
		width: 240px;
	}

	.daily-skeleton-line.medium {
		width: 62%;
		height: 13px;
	}

	.daily-skeleton-line.hint {
		width: calc(100% - 28px);
		height: 10px;
		margin: 0 14px 14px;
	}

	.daily-skeleton-pill {
		width: 82px;
		height: 24px;
		background: var(--daily-skeleton-accent);
	}

	.daily-skeleton-pill.small {
		width: 72px;
		height: 19px;
	}

	.daily-skeleton-pill.tiny {
		width: 44px;
		height: 14px;
	}

	.daily-skeleton-pill.wide {
		width: 130px;
	}

	.daily-skeleton-summary-card,
	.daily-skeleton-speed-card,
	.daily-event-skeleton-card,
	.daily-rpm-table-card-skeleton,
	.daily-chart-skeleton-card,
	.daily-timeline-skeleton-row,
	.daily-fod-skeleton-grid article,
	.daily-trip-detail-grid div {
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.daily-skeleton-line::after,
	.daily-skeleton-pill::after,
	.daily-skeleton-map::after,
	.daily-skeleton-cell::after,
	.daily-skeleton-timeline-labels::after,
	.daily-skeleton-timeline::after,
	.daily-skeleton-axis::after,
	.daily-skeleton-map-route::after,
	.daily-skeleton-map-pin::after,
	.daily-skeleton-chart > *::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.68), transparent);
		transform: translateX(-110%);
		animation: skeletonShimmer 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	.daily-skeleton-cell::after,
	.daily-skeleton-timeline::after,
	.daily-skeleton-map::after,
	.daily-skeleton-chart::before {
		pointer-events: none;
	}

	@media (max-width: 1100px) {
		.daily-skeleton-summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 1000px) {
		.daily-trip-skeleton-content {
			grid-template-columns: 1fr;
		}

		.daily-trip-detail-grid {
			grid-template-columns: 1fr;
		}

		.daily-trip-detail-grid div {
			border-right: 0;
		}
	}

	@media (max-width: 850px) {
		.daily-skeleton-speed-grid,
		.daily-fod-skeleton-grid,
		.daily-event-skeleton-grid,
		.daily-chart-skeleton-grid {
			grid-template-columns: 1fr;
		}

		.daily-event-skeleton-grid,
		.daily-chart-skeleton-grid {
			padding: 12px;
		}

		.daily-timeline-skeleton-row {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.daily-skeleton-summary-grid {
			grid-template-columns: 1fr;
		}

		.daily-skeleton-section-header,
		.daily-event-skeleton-header,
		.daily-card-header-skeleton {
			align-items: flex-start;
			flex-direction: column;
		}

		.daily-skeleton-map {
			height: 210px;
		}
	}

	/* Universal Fleet View style shimmer */
	.loading-skeleton {
		--fleet-shimmer-base: rgba(30, 41, 59, 0.92);
		--fleet-shimmer-base-soft: rgba(51, 65, 85, 0.72);
		--fleet-shimmer-line: rgba(71, 85, 105, 0.52);
		--fleet-shimmer-light: rgba(248, 250, 252, 0.92);
		--fleet-shimmer-blue: rgba(96, 165, 250, 0.34);
	}

	/* Semua elemen skeleton dibuat punya base gelap seperti Fleet View */
	.skeleton-cell,
	.skeleton-line,
	.skeleton-pill,
	.skeleton-avatar,
	.skeleton-chip,
	.fleet-dot,
	.fleet-pin,

	.admin-skeleton-line,
	.admin-skeleton-pill,
	.admin-skeleton-input,
	.admin-skeleton-checkbox,
	.admin-engine-table-cell,
	.admin-global-audit-cell,

	.profile-skeleton-line,
	.profile-skeleton-pill,
	.profile-skeleton-avatar,
	.profile-skeleton-input,
	.profile-skeleton-access-icon,

	.audit-log-skeleton-line,
	.audit-log-skeleton-pill,
	.audit-log-table-cell,
	.audit-detail-code-line,

	.avs-skeleton-line,
	.avs-skeleton-pill,
	.avs-skeleton-input,
	.avs-skeleton-check-row,
	.avs-skeleton-checkbox,
	.avs-skeleton-icon,
	.avs-skeleton-avatar,
	.avs-summary-table-cell,

	.alarm-skeleton-line,
	.alarm-skeleton-pill,
	.alarm-events-skeleton-cell,

	.vplan-skeleton-line,
	.vplan-skeleton-pill,
	.vplan-table-cell,
	.vplan-map-chip,
	.voyage-map-mini-grid span,

	.vdash-skeleton-line,
	.vdash-skeleton-pill,
	.vdash-map-status,

	.trace-skeleton-line,
	.trace-skeleton-pill,
	.trace-skeleton-coordinate-badge,
	.trace-skeleton-map-badge,

	.monthly-skeleton-line,
	.monthly-skeleton-kicker,
	.monthly-skeleton-heading,
	.monthly-skeleton-counter,
	.monthly-skeleton-cell,

	.periodical-skeleton-line,
	.periodical-skeleton-kicker,
	.periodical-skeleton-heading,
	.periodical-skeleton-counter,
	.periodical-skeleton-cell,

	.fuel-skeleton-line,
	.fuel-skeleton-input,
	.fuel-skeleton-button,
	.fuel-skeleton-cell,

	.data-log-skeleton-kicker,
	.data-log-skeleton-title,
	.data-log-skeleton-counter,
	.data-log-skeleton-cell,

	.daily-skeleton-line,
	.daily-skeleton-pill,
	.daily-skeleton-cell,
	.daily-skeleton-timeline-labels,
	.daily-skeleton-timeline,
	.daily-skeleton-axis,
	.daily-skeleton-map-route,
	.daily-skeleton-map-pin {
		position: relative;
		overflow: hidden;
		isolation: isolate;
		background: linear-gradient(
			90deg,
			var(--fleet-shimmer-line) 0%,
			rgba(51, 65, 85, 0.62) 100%
		) !important;
		background-size: 100% 100% !important;
		animation: none !important;
	}

	/* Highlight diagonal seperti Fleet View */
	.skeleton-cell::after,
	.skeleton-line::after,
	.skeleton-pill::after,
	.skeleton-avatar::after,
	.skeleton-chip::after,
	.fleet-dot::after,
	.fleet-pin::after,

	.admin-skeleton-line::after,
	.admin-skeleton-pill::after,
	.admin-skeleton-input::after,
	.admin-skeleton-checkbox::after,
	.admin-engine-table-cell::after,
	.admin-global-audit-cell::after,

	.profile-skeleton-line::after,
	.profile-skeleton-pill::after,
	.profile-skeleton-avatar::after,
	.profile-skeleton-input::after,
	.profile-skeleton-access-icon::after,

	.audit-log-skeleton-line::after,
	.audit-log-skeleton-pill::after,
	.audit-log-table-cell::after,
	.audit-detail-code-line::after,

	.avs-skeleton-line::after,
	.avs-skeleton-pill::after,
	.avs-skeleton-input::after,
	.avs-skeleton-check-row::after,
	.avs-skeleton-checkbox::after,
	.avs-skeleton-icon::after,
	.avs-skeleton-avatar::after,
	.avs-summary-table-cell::after,

	.alarm-skeleton-line::after,
	.alarm-skeleton-pill::after,
	.alarm-events-skeleton-cell::after,

	.vplan-skeleton-line::after,
	.vplan-skeleton-pill::after,
	.vplan-table-cell::after,
	.vplan-map-chip::after,
	.voyage-map-mini-grid span::after,

	.vdash-skeleton-line::after,
	.vdash-skeleton-pill::after,
	.vdash-map-status::after,

	.trace-skeleton-line::after,
	.trace-skeleton-pill::after,
	.trace-skeleton-coordinate-badge::after,
	.trace-skeleton-map-badge::after,

	.monthly-skeleton-line::after,
	.monthly-skeleton-kicker::after,
	.monthly-skeleton-heading::after,
	.monthly-skeleton-counter::after,
	.monthly-skeleton-cell::after,

	.periodical-skeleton-line::after,
	.periodical-skeleton-kicker::after,
	.periodical-skeleton-heading::after,
	.periodical-skeleton-counter::after,
	.periodical-skeleton-cell::after,

	.fuel-skeleton-line::after,
	.fuel-skeleton-input::after,
	.fuel-skeleton-button::after,
	.fuel-skeleton-cell::after,

	.data-log-skeleton-kicker::after,
	.data-log-skeleton-title::after,
	.data-log-skeleton-counter::after,
	.data-log-skeleton-cell::after,

	.daily-skeleton-line::after,
	.daily-skeleton-pill::after,
	.daily-skeleton-cell::after,
	.daily-skeleton-timeline-labels::after,
	.daily-skeleton-timeline::after,
	.daily-skeleton-axis::after,
	.daily-skeleton-map-route::after,
	.daily-skeleton-map-pin::after {
		content: '';
		position: absolute;
		top: -45%;
		bottom: -45%;
		left: -70%;
		z-index: 2;
		width: 58%;
		pointer-events: none;
		border-radius: inherit;
		background: linear-gradient(
			100deg,
			transparent 0%,
			rgba(255, 255, 255, 0.08) 24%,
			var(--fleet-shimmer-light) 46%,
			rgba(147, 197, 253, 0.48) 58%,
			transparent 100%
		);
		filter: blur(0.2px);
		transform: translateX(-120%) skewX(-18deg);
		animation: fleetStyleSkeletonSweep 1.35s ease-in-out infinite;
		animation-delay: var(--skeleton-delay, 0ms);
	}

	/* Untuk card / row skeleton, base panel dibuat gelap seperti Fleet View */
	.skeleton-card,
	.skeleton-list-row,
	.fleet-skeleton-card,
	.admin-entity-row-skeleton,
	.admin-compact-row-skeleton,
	.profile-skeleton-access-row,
	.alarm-monitor-skeleton-card,
	.avs-skeleton-vessel-card,
	.vplan-detail-item,
	.vdash-info-card,
	.vdash-rpm-card,
	.daily-timeline-skeleton-row {
		background: var(--fleet-shimmer-base) !important;
		border-color: rgba(148, 163, 184, 0.16) !important;
		box-shadow: 0 8px 18px rgba(2, 6, 23, 0.18) !important;
	}

	/* Untuk panel besar skeleton */
	.loading-skeleton,
	.admin-skeleton-side-panel,
	.admin-skeleton-editor-panel,
	.profile-skeleton-hero,
	.profile-skeleton-summary-card,
	.profile-skeleton-panel,
	.audit-detail-info-card,
	.audit-detail-changes-card,
	.avs-skeleton-summary-card,
	.avs-skeleton-panel,
	.avs-skeleton-vessel-panel,
	.vplan-panel,
	.vplan-summary-card,
	.vdash-panel,
	.vdash-summary-card,
	.alarm-events-skeleton-table,
	.audit-log-table-skeleton,
	.admin-global-audit-table-skeleton {
		background: #0f172a !important;
		border-color: rgba(148, 163, 184, 0.18) !important;
	}

	/* Khusus dot status tetap hijau seperti Fleet View */
	.fleet-dot,
	.vdash-camera-dot,
	.alarm-monitor-skeleton-card .alarm-skeleton-pill.new-badge {
		background: rgba(34, 197, 94, 0.48) !important;
	}

	/* Animasi shimmer model Fleet View */
	@keyframes fleetStyleSkeletonSweep {
		0% {
			transform: translateX(-120%) skewX(-18deg);
			opacity: 0;
		}

		18% {
			opacity: 1;
		}

		72% {
			opacity: 1;
		}

		100% {
			transform: translateX(260%) skewX(-18deg);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton-cell::after,
		.skeleton-line::after,
		.skeleton-pill::after,
		.skeleton-avatar::after,
		.skeleton-chip::after,
		.fleet-dot::after,
		.fleet-pin::after,

		.admin-skeleton-line::after,
		.admin-skeleton-pill::after,
		.admin-skeleton-input::after,
		.admin-skeleton-checkbox::after,
		.admin-engine-table-cell::after,
		.admin-global-audit-cell::after,

		.profile-skeleton-line::after,
		.profile-skeleton-pill::after,
		.profile-skeleton-avatar::after,
		.profile-skeleton-input::after,
		.profile-skeleton-access-icon::after,

		.audit-log-skeleton-line::after,
		.audit-log-skeleton-pill::after,
		.audit-log-table-cell::after,
		.audit-detail-code-line::after,

		.avs-skeleton-line::after,
		.avs-skeleton-pill::after,
		.avs-skeleton-input::after,
		.avs-skeleton-check-row::after,
		.avs-skeleton-checkbox::after,
		.avs-skeleton-icon::after,
		.avs-skeleton-avatar::after,
		.avs-summary-table-cell::after,

		.alarm-skeleton-line::after,
		.alarm-skeleton-pill::after,
		.alarm-events-skeleton-cell::after,

		.vplan-skeleton-line::after,
		.vplan-skeleton-pill::after,
		.vplan-table-cell::after,
		.vplan-map-chip::after,
		.voyage-map-mini-grid span::after,

		.vdash-skeleton-line::after,
		.vdash-skeleton-pill::after,
		.vdash-map-status::after,

		.trace-skeleton-line::after,
		.trace-skeleton-pill::after,
		.trace-skeleton-coordinate-badge::after,
		.trace-skeleton-map-badge::after,

		.monthly-skeleton-line::after,
		.monthly-skeleton-kicker::after,
		.monthly-skeleton-heading::after,
		.monthly-skeleton-counter::after,
		.monthly-skeleton-cell::after,

		.periodical-skeleton-line::after,
		.periodical-skeleton-kicker::after,
		.periodical-skeleton-heading::after,
		.periodical-skeleton-counter::after,
		.periodical-skeleton-cell::after,

		.fuel-skeleton-line::after,
		.fuel-skeleton-input::after,
		.fuel-skeleton-button::after,
		.fuel-skeleton-cell::after,

		.data-log-skeleton-kicker::after,
		.data-log-skeleton-title::after,
		.data-log-skeleton-counter::after,
		.data-log-skeleton-cell::after,

		.daily-skeleton-line::after,
		.daily-skeleton-pill::after,
		.daily-skeleton-cell::after,
		.daily-skeleton-timeline-labels::after,
		.daily-skeleton-timeline::after,
		.daily-skeleton-axis::after,
		.daily-skeleton-map-route::after,
		.daily-skeleton-map-pin::after {
			animation: none !important;
			transform: none !important;
		}
	}

	/* =========================================================
	   FINAL OVERRIDE - Fleet View style shimmer for all skeletons
	   Letakkan blok ini paling bawah agar menimpa shimmer lama.
	   ========================================================= */

	.loading-skeleton {
		--fleet-shimmer-page: #020617;
		--fleet-shimmer-panel: #0f172a;
		--fleet-shimmer-card: rgba(15, 23, 42, 0.94);
		--fleet-shimmer-line: rgba(51, 65, 85, 0.82);
		--fleet-shimmer-line-2: rgba(71, 85, 105, 0.72);
		--fleet-shimmer-light: rgba(248, 250, 252, 0.92);
		--fleet-shimmer-blue: rgba(96, 165, 250, 0.42);
		--fleet-shimmer-border: rgba(148, 163, 184, 0.18);
	}

	/* Wrapper utama dibuat gelap konsisten seperti Fleet View */
	.loading-skeleton:not(.inline):not(.fuel-summary) {
		background:
			radial-gradient(circle at 18% 12%, rgba(59, 130, 246, 0.08), transparent 30%),
			var(--fleet-shimmer-panel) !important;
		border-color: var(--fleet-shimmer-border) !important;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
	}

	/* Panel/card besar */
	.skeleton-card,
	.skeleton-list-row,
	.fleet-skeleton-card,

	.admin-skeleton-tabs,
	.admin-skeleton-side-panel,
	.admin-skeleton-editor-panel,
	.admin-entity-row-skeleton,
	.admin-compact-row-skeleton,
	.admin-permission-group-skeleton,
	.admin-permission-item-skeleton,
	.admin-engine-curve-detail-skeleton,
	.admin-engine-detail-card-skeleton,
	.admin-global-audit-table-skeleton,

	.profile-skeleton-hero,
	.profile-skeleton-summary-card,
	.profile-skeleton-panel,
	.profile-skeleton-access-row,

	.audit-log-table-skeleton,
	.audit-detail-skeleton,
	.audit-detail-info-card,
	.audit-detail-changes-card,

	.avs-skeleton-summary-card,
	.avs-skeleton-panel,
	.avs-skeleton-vessel-panel,
	.avs-skeleton-vessel-card,
	.avs-skeleton-request-card,
	.avs-skeleton-vessel-request-panel,
	.avs-skeleton-vessel-request-card,
	.avs-skeleton-strip article,

	.alarm-monitor-skeleton-grid,
	.alarm-monitor-skeleton-card,
	.alarm-events-skeleton-table,

	.vplan-panel,
	.vplan-summary-card,
	.vplan-detail-item,
	.voyage-map-mini-skeleton,

	.vdash-panel,
	.vdash-summary-card,
	.vdash-info-card,
	.vdash-rpm-card,
	.vdash-fuel-metric,
	.vdash-fod-usage-summary article,
	.vdash-environment-grid article,

	.trace-skeleton-monitor-card,
	.trace-skeleton-playback-card,
	.trace-skeleton-info-card,
	.trace-skeleton-rpm-panel,
	.trace-skeleton-rpm-card,

	.monthly-skeleton-summary-card,
	.monthly-skeleton-table-section,
	.periodical-skeleton-data-received,
	.periodical-skeleton-summary-card,
	.periodical-skeleton-panel,
	.periodical-skeleton-speed-grid article,

	.fuel-skeleton-summary-card,
	.fuel-skeleton-metric-card,
	.fuel-skeleton-form-card,

	.data-log-skeleton-table-section,

	.daily-skeleton-summary-card,
	.daily-skeleton-speed-card,
	.daily-skeleton-panel,
	.daily-trip-route-skeleton-card,
	.daily-trip-detail-skeleton-card,
	.daily-event-skeleton-card,
	.daily-rpm-table-card-skeleton,
	.daily-chart-skeleton-card,
	.daily-timeline-skeleton-row,
	.daily-fod-skeleton-grid article {
		background:
			linear-gradient(135deg, rgba(59, 130, 246, 0.08), transparent 42%),
			var(--fleet-shimmer-card) !important;
		border-color: var(--fleet-shimmer-border) !important;
		box-shadow:
			0 8px 18px rgba(2, 6, 23, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
	}

	/* Area elevated / list / table body */
	.admin-permission-items,
	.vdash-vessel-info-grid,
	.vdash-rpm-grid,
	.vdash-environment-grid,
	.vdash-fuel-cols,
	.vdash-fod-usage-summary,
	.vdash-rob-content,
	.avs-skeleton-request-body,
	.avs-skeleton-vessel-tools,
	.avs-skeleton-vessel-list,
	.alarm-monitor-skeleton-grid,
	.daily-trip-skeleton-content,
	.daily-event-skeleton-grid,
	.daily-chart-skeleton-grid,
	.daily-timeline-skeleton-list,
	.daily-fod-skeleton-grid,
	.daily-rpm-table-card-list,
	.fuel-skeleton-comparison-grid,
	.fuel-skeleton-operation-grid,
	.monthly-skeleton-table-wrapper,
	.periodical-skeleton-fod-grid,
	.periodical-skeleton-speed-grid,
	.data-log-skeleton-table-wrapper {
		background: rgba(2, 6, 23, 0.26) !important;
	}

	/* Semua elemen kecil shimmer */
	.skeleton-cell,
	.skeleton-line,
	.skeleton-pill,
	.skeleton-avatar,
	.skeleton-chip,
	.fleet-dot,
	.fleet-pin,

	.admin-skeleton-line,
	.admin-skeleton-pill,
	.admin-skeleton-input,
	.admin-skeleton-checkbox,
	.admin-engine-table-cell,
	.admin-global-audit-cell,

	.profile-skeleton-line,
	.profile-skeleton-pill,
	.profile-skeleton-avatar,
	.profile-skeleton-input,
	.profile-skeleton-access-icon,

	.audit-log-skeleton-line,
	.audit-log-skeleton-pill,
	.audit-log-table-cell,
	.audit-detail-code-line,

	.avs-skeleton-line,
	.avs-skeleton-pill,
	.avs-skeleton-input,
	.avs-skeleton-check-row,
	.avs-skeleton-checkbox,
	.avs-skeleton-icon,
	.avs-skeleton-avatar,
	.avs-summary-table-cell,

	.alarm-skeleton-line,
	.alarm-skeleton-pill,
	.alarm-events-skeleton-cell,

	.vplan-skeleton-line,
	.vplan-skeleton-pill,
	.vplan-table-cell,
	.vplan-map-chip,
	.voyage-map-mini-grid span,

	.vdash-skeleton-line,
	.vdash-skeleton-pill,
	.vdash-map-status,
	.vdash-cctv-icon,

	.trace-skeleton-line,
	.trace-skeleton-pill,
	.trace-skeleton-coordinate-badge,
	.trace-skeleton-map-badge,

	.monthly-skeleton-line,
	.monthly-skeleton-kicker,
	.monthly-skeleton-heading,
	.monthly-skeleton-counter,
	.monthly-skeleton-cell,

	.periodical-skeleton-line,
	.periodical-skeleton-kicker,
	.periodical-skeleton-heading,
	.periodical-skeleton-counter,
	.periodical-skeleton-cell,

	.fuel-skeleton-line,
	.fuel-skeleton-input,
	.fuel-skeleton-button,
	.fuel-skeleton-cell,

	.data-log-skeleton-kicker,
	.data-log-skeleton-title,
	.data-log-skeleton-counter,
	.data-log-skeleton-cell,

	.daily-skeleton-line,
	.daily-skeleton-pill,
	.daily-skeleton-cell,
	.daily-skeleton-timeline-labels,
	.daily-skeleton-timeline,
	.daily-skeleton-axis,
	.daily-skeleton-map-route,
	.daily-skeleton-map-pin {
		position: relative !important;
		overflow: hidden !important;
		isolation: isolate !important;
		background:
			linear-gradient(
				90deg,
				var(--fleet-shimmer-line) 0%,
				var(--fleet-shimmer-line-2) 100%
			) !important;
		background-size: 100% 100% !important;
		animation: none !important;
	}

	/* Sapuan diagonal model Fleet View */
	.skeleton-cell::after,
	.skeleton-line::after,
	.skeleton-pill::after,
	.skeleton-avatar::after,
	.skeleton-chip::after,
	.fleet-dot::after,
	.fleet-pin::after,

	.admin-skeleton-line::after,
	.admin-skeleton-pill::after,
	.admin-skeleton-input::after,
	.admin-skeleton-checkbox::after,
	.admin-engine-table-cell::after,
	.admin-global-audit-cell::after,

	.profile-skeleton-line::after,
	.profile-skeleton-pill::after,
	.profile-skeleton-avatar::after,
	.profile-skeleton-input::after,
	.profile-skeleton-access-icon::after,

	.audit-log-skeleton-line::after,
	.audit-log-skeleton-pill::after,
	.audit-log-table-cell::after,
	.audit-detail-code-line::after,

	.avs-skeleton-line::after,
	.avs-skeleton-pill::after,
	.avs-skeleton-input::after,
	.avs-skeleton-check-row::after,
	.avs-skeleton-checkbox::after,
	.avs-skeleton-icon::after,
	.avs-skeleton-avatar::after,
	.avs-summary-table-cell::after,

	.alarm-skeleton-line::after,
	.alarm-skeleton-pill::after,
	.alarm-events-skeleton-cell::after,

	.vplan-skeleton-line::after,
	.vplan-skeleton-pill::after,
	.vplan-table-cell::after,
	.vplan-map-chip::after,
	.voyage-map-mini-grid span::after,

	.vdash-skeleton-line::after,
	.vdash-skeleton-pill::after,
	.vdash-map-status::after,
	.vdash-cctv-icon::after,

	.trace-skeleton-line::after,
	.trace-skeleton-pill::after,
	.trace-skeleton-coordinate-badge::after,
	.trace-skeleton-map-badge::after,

	.monthly-skeleton-line::after,
	.monthly-skeleton-kicker::after,
	.monthly-skeleton-heading::after,
	.monthly-skeleton-counter::after,
	.monthly-skeleton-cell::after,

	.periodical-skeleton-line::after,
	.periodical-skeleton-kicker::after,
	.periodical-skeleton-heading::after,
	.periodical-skeleton-counter::after,
	.periodical-skeleton-cell::after,

	.fuel-skeleton-line::after,
	.fuel-skeleton-input::after,
	.fuel-skeleton-button::after,
	.fuel-skeleton-cell::after,

	.data-log-skeleton-kicker::after,
	.data-log-skeleton-title::after,
	.data-log-skeleton-counter::after,
	.data-log-skeleton-cell::after,

	.daily-skeleton-line::after,
	.daily-skeleton-pill::after,
	.daily-skeleton-cell::after,
	.daily-skeleton-timeline-labels::after,
	.daily-skeleton-timeline::after,
	.daily-skeleton-axis::after,
	.daily-skeleton-map-route::after,
	.daily-skeleton-map-pin::after {
		content: '' !important;
		position: absolute !important;
		top: -55% !important;
		bottom: -55% !important;
		left: -75% !important;
		z-index: 2 !important;
		width: 58% !important;
		pointer-events: none !important;
		border-radius: inherit !important;
		background:
			linear-gradient(
				100deg,
				transparent 0%,
				rgba(255, 255, 255, 0.07) 23%,
				var(--fleet-shimmer-light) 46%,
				var(--fleet-shimmer-blue) 58%,
				transparent 100%
			) !important;
		filter: blur(0.2px) !important;
		transform: translateX(-120%) skewX(-18deg) !important;
		animation: fleetStyleSkeletonSweepFinal 1.35s ease-in-out infinite !important;
		animation-delay: var(--skeleton-delay, 0ms) !important;
	}

	/* Table cells tetap full-cell, shimmer-nya dari pseudo element */
	.skeleton-cell::before,
	.admin-engine-table-cell::before,
	.admin-global-audit-cell::before,
	.audit-log-table-cell::before,
	.avs-summary-table-cell::before,
	.monthly-skeleton-cell::before,
	.periodical-skeleton-cell::before,
	.fuel-skeleton-cell::before,
	.data-log-skeleton-cell::before,
	.daily-skeleton-cell::before {
		background: rgba(148, 163, 184, 0.32) !important;
	}

	.skeleton-cell.header,
	.admin-engine-table-cell.header,
	.admin-global-audit-cell.header,
	.audit-log-table-cell.header,
	.avs-summary-table-cell.header,
	.alarm-events-skeleton-cell.header,
	.vplan-table-cell.header,
	.monthly-skeleton-cell.header,
	.periodical-skeleton-cell.header,
	.fuel-skeleton-cell.header,
	.data-log-skeleton-cell.header,
	.daily-skeleton-cell.header {
		background: rgba(37, 99, 235, 0.42) !important;
	}

	/* Dot/status hijau seperti Fleet View */
	.fleet-dot,
	.vdash-camera-dot,
	.vplan-route-marker.start,
	.daily-skeleton-map-pin.start {
		background: rgba(34, 197, 94, 0.48) !important;
		box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.12) !important;
	}

	/* Pin/icon kotak hijau gelap seperti Fleet View */
	.fleet-pin,
	.profile-skeleton-access-icon.asset,
	.alarm-skeleton-pill.new-badge {
		background: rgba(20, 83, 45, 0.62) !important;
		border-color: rgba(34, 197, 94, 0.18) !important;
	}

	@keyframes fleetStyleSkeletonSweepFinal {
		0% {
			transform: translateX(-120%) skewX(-18deg);
			opacity: 0;
		}

		16% {
			opacity: 1;
		}

		72% {
			opacity: 1;
		}

		100% {
			transform: translateX(275%) skewX(-18deg);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton-cell::after,
		.skeleton-line::after,
		.skeleton-pill::after,
		.skeleton-avatar::after,
		.skeleton-chip::after,
		.fleet-dot::after,
		.fleet-pin::after,

		.admin-skeleton-line::after,
		.admin-skeleton-pill::after,
		.admin-skeleton-input::after,
		.admin-skeleton-checkbox::after,
		.admin-engine-table-cell::after,
		.admin-global-audit-cell::after,

		.profile-skeleton-line::after,
		.profile-skeleton-pill::after,
		.profile-skeleton-avatar::after,
		.profile-skeleton-input::after,
		.profile-skeleton-access-icon::after,

		.audit-log-skeleton-line::after,
		.audit-log-skeleton-pill::after,
		.audit-log-table-cell::after,
		.audit-detail-code-line::after,

		.avs-skeleton-line::after,
		.avs-skeleton-pill::after,
		.avs-skeleton-input::after,
		.avs-skeleton-check-row::after,
		.avs-skeleton-checkbox::after,
		.avs-skeleton-icon::after,
		.avs-skeleton-avatar::after,
		.avs-summary-table-cell::after,

		.alarm-skeleton-line::after,
		.alarm-skeleton-pill::after,
		.alarm-events-skeleton-cell::after,

		.vplan-skeleton-line::after,
		.vplan-skeleton-pill::after,
		.vplan-table-cell::after,
		.vplan-map-chip::after,
		.voyage-map-mini-grid span::after,

		.vdash-skeleton-line::after,
		.vdash-skeleton-pill::after,
		.vdash-map-status::after,
		.vdash-cctv-icon::after,

		.trace-skeleton-line::after,
		.trace-skeleton-pill::after,
		.trace-skeleton-coordinate-badge::after,
		.trace-skeleton-map-badge::after,

		.monthly-skeleton-line::after,
		.monthly-skeleton-kicker::after,
		.monthly-skeleton-heading::after,
		.monthly-skeleton-counter::after,
		.monthly-skeleton-cell::after,

		.periodical-skeleton-line::after,
		.periodical-skeleton-kicker::after,
		.periodical-skeleton-heading::after,
		.periodical-skeleton-counter::after,
		.periodical-skeleton-cell::after,

		.fuel-skeleton-line::after,
		.fuel-skeleton-input::after,
		.fuel-skeleton-button::after,
		.fuel-skeleton-cell::after,

		.data-log-skeleton-kicker::after,
		.data-log-skeleton-title::after,
		.data-log-skeleton-counter::after,
		.data-log-skeleton-cell::after,

		.daily-skeleton-line::after,
		.daily-skeleton-pill::after,
		.daily-skeleton-cell::after,
		.daily-skeleton-timeline-labels::after,
		.daily-skeleton-timeline::after,
		.daily-skeleton-axis::after,
		.daily-skeleton-map-route::after,
		.daily-skeleton-map-pin::after {
			animation: none !important;
			transform: none !important;
		}
	}


	/* =========================================================
	   JS-DRIVEN SHIMMER - paling bawah
	   Tidak bergantung pada CSS animation/keyframes.
	   ========================================================= */

	.loading-skeleton {
		--force-shimmer-line: rgba(51, 65, 85, 0.82);
		--force-shimmer-line-2: rgba(71, 85, 105, 0.72);
		--force-shimmer-light: rgba(248, 250, 252, 0.92);
		--force-shimmer-blue: rgba(96, 165, 250, 0.42);
		--skeleton-sweep-x: -145%;
		--skeleton-sweep-opacity: 1;
	}

	.loading-skeleton :is(
		.skeleton-cell,
		.skeleton-line,
		.skeleton-pill,
		.skeleton-avatar,
		.skeleton-chip,
		.fleet-dot,
		.fleet-pin,
		.admin-skeleton-line,
		.admin-skeleton-pill,
		.admin-skeleton-input,
		.admin-skeleton-checkbox,
		.admin-engine-table-cell,
		.admin-global-audit-cell,
		.profile-skeleton-line,
		.profile-skeleton-pill,
		.profile-skeleton-avatar,
		.profile-skeleton-input,
		.profile-skeleton-access-icon,
		.audit-log-skeleton-line,
		.audit-log-skeleton-pill,
		.audit-log-table-cell,
		.audit-detail-code-line,
		.avs-skeleton-line,
		.avs-skeleton-pill,
		.avs-skeleton-input,
		.avs-skeleton-check-row,
		.avs-skeleton-checkbox,
		.avs-skeleton-icon,
		.avs-skeleton-avatar,
		.avs-summary-table-cell,
		.alarm-skeleton-line,
		.alarm-skeleton-pill,
		.alarm-events-skeleton-cell,
		.vplan-skeleton-line,
		.vplan-skeleton-pill,
		.vplan-table-cell,
		.vplan-map-chip,
		.voyage-map-mini-grid span,
		.vdash-skeleton-line,
		.vdash-skeleton-pill,
		.vdash-map-status,
		.vdash-cctv-icon,
		.trace-skeleton-line,
		.trace-skeleton-pill,
		.trace-skeleton-coordinate-badge,
		.trace-skeleton-map-badge,
		.monthly-skeleton-line,
		.monthly-skeleton-kicker,
		.monthly-skeleton-heading,
		.monthly-skeleton-counter,
		.monthly-skeleton-cell,
		.periodical-skeleton-line,
		.periodical-skeleton-kicker,
		.periodical-skeleton-heading,
		.periodical-skeleton-counter,
		.periodical-skeleton-cell,
		.fuel-skeleton-line,
		.fuel-skeleton-input,
		.fuel-skeleton-button,
		.fuel-skeleton-cell,
		.data-log-skeleton-kicker,
		.data-log-skeleton-title,
		.data-log-skeleton-counter,
		.data-log-skeleton-cell,
		.daily-skeleton-line,
		.daily-skeleton-pill,
		.daily-skeleton-cell,
		.daily-skeleton-timeline-labels,
		.daily-skeleton-timeline,
		.daily-skeleton-axis,
		.daily-skeleton-map-route,
		.daily-skeleton-map-pin
	) {
		position: relative !important;
		overflow: hidden !important;
		isolation: isolate !important;
		background: linear-gradient(
			90deg,
			var(--force-shimmer-line) 0%,
			var(--force-shimmer-line-2) 100%
		) !important;
		background-size: 100% 100% !important;
	}

	.loading-skeleton :is(
		.skeleton-cell,
		.skeleton-line,
		.skeleton-pill,
		.skeleton-avatar,
		.skeleton-chip,
		.fleet-dot,
		.fleet-pin,
		.admin-skeleton-line,
		.admin-skeleton-pill,
		.admin-skeleton-input,
		.admin-skeleton-checkbox,
		.admin-engine-table-cell,
		.admin-global-audit-cell,
		.profile-skeleton-line,
		.profile-skeleton-pill,
		.profile-skeleton-avatar,
		.profile-skeleton-input,
		.profile-skeleton-access-icon,
		.audit-log-skeleton-line,
		.audit-log-skeleton-pill,
		.audit-log-table-cell,
		.audit-detail-code-line,
		.avs-skeleton-line,
		.avs-skeleton-pill,
		.avs-skeleton-input,
		.avs-skeleton-check-row,
		.avs-skeleton-checkbox,
		.avs-skeleton-icon,
		.avs-skeleton-avatar,
		.avs-summary-table-cell,
		.alarm-skeleton-line,
		.alarm-skeleton-pill,
		.alarm-events-skeleton-cell,
		.vplan-skeleton-line,
		.vplan-skeleton-pill,
		.vplan-table-cell,
		.vplan-map-chip,
		.voyage-map-mini-grid span,
		.vdash-skeleton-line,
		.vdash-skeleton-pill,
		.vdash-map-status,
		.vdash-cctv-icon,
		.trace-skeleton-line,
		.trace-skeleton-pill,
		.trace-skeleton-coordinate-badge,
		.trace-skeleton-map-badge,
		.monthly-skeleton-line,
		.monthly-skeleton-kicker,
		.monthly-skeleton-heading,
		.monthly-skeleton-counter,
		.monthly-skeleton-cell,
		.periodical-skeleton-line,
		.periodical-skeleton-kicker,
		.periodical-skeleton-heading,
		.periodical-skeleton-counter,
		.periodical-skeleton-cell,
		.fuel-skeleton-line,
		.fuel-skeleton-input,
		.fuel-skeleton-button,
		.fuel-skeleton-cell,
		.data-log-skeleton-kicker,
		.data-log-skeleton-title,
		.data-log-skeleton-counter,
		.data-log-skeleton-cell,
		.daily-skeleton-line,
		.daily-skeleton-pill,
		.daily-skeleton-cell,
		.daily-skeleton-timeline-labels,
		.daily-skeleton-timeline,
		.daily-skeleton-axis,
		.daily-skeleton-map-route,
		.daily-skeleton-map-pin
	)::after {
		content: '' !important;
		position: absolute !important;
		top: -65% !important;
		bottom: -65% !important;
		left: -10% !important;
		z-index: 999 !important;
		width: 52% !important;
		pointer-events: none !important;
		border-radius: inherit !important;
		background: linear-gradient(
			100deg,
			transparent 0%,
			rgba(255, 255, 255, 0.12) 22%,
			var(--force-shimmer-light) 46%,
			var(--force-shimmer-blue) 58%,
			transparent 100%
		) !important;
		filter: blur(0.2px) !important;
		opacity: var(--skeleton-sweep-opacity, 1) !important;
		transform: translate3d(var(--skeleton-sweep-x, -145%), 0, 0) skewX(-18deg) !important;
		animation: none !important;
		transition: none !important;
		will-change: transform, opacity !important;
	}

</style>