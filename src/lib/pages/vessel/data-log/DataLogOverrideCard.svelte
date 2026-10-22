<script>
	import './data-log-page.css';

	let {
		disabled = false,
		downloadingTemplate = false,
		importing = false,
		deleting = false,
		deletingPath = '',
		file = null,
		message = '',
		error = '',
		imports = [],
		importsLoading = false,
		importsError = '',
		pagination = {},
		onDownloadTemplate,
		onRefresh,
		onFileChange,
		onImport,
		onClearFile,
		onDelete,
		onPage
	} = $props();

	let fileInput = $state(null);

	$effect(() => {
		if (!file && fileInput) {
			fileInput.value = '';
		}
	});

	function getOverrideImportFilename(item = {}) {
		const sourceFilePath = item?.source_file_path || item?.sourceFilePath || '';

		return (
			item?.filename ||
			item?.fileName ||
			(sourceFilePath ? sourceFilePath.split(/[\\/]/).pop() : '') ||
			'Imported override file'
		);
	}

	function getOverrideImportSourcePath(item = {}) {
		return item?.source_file_path || item?.sourceFilePath || '';
	}

	function getOverrideImportDateRange(item = {}) {
		const start = item?.start || item?.min_ts || item?.recorded_from || '';
		const end = item?.end || item?.max_ts || item?.recorded_until || '';

		if (start && end) return `${start} — ${end}`;
		if (start) return `From ${start}`;
		if (end) return `Until ${end}`;

		return '-';
	}

	function getOverrideImportDateIso(item = {}) {
		if (Array.isArray(item?.date_iso) && item.date_iso.length) {
			return item.date_iso.join(', ');
		}

		return item?.date_iso || '-';
	}
</script>

<section class="override-card">
	<div class="override-header">
		<div>
			<span class="section-kicker">Override</span>
			<h2>Data Log Override</h2>
		</div>

		<div class="override-actions">
			<button
				type="button"
				class="ghost-btn"
				onclick={() => onDownloadTemplate?.()}
				disabled={downloadingTemplate}
			>
				{downloadingTemplate ? 'Downloading...' : 'Download Template'}
			</button>
			<button
				type="button"
				class="ghost-btn"
				onclick={() => onRefresh?.()}
				disabled={importsLoading || disabled}
			>
				{importsLoading ? 'Refreshing...' : 'Refresh Imports'}
			</button>
		</div>
	</div>

	<div class="override-grid">
		<label class="override-field">
			<span>Import Excel Override</span>
			<input
				bind:this={fileInput}
				type="file"
				accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				onchange={(event) => onFileChange?.(event)}
			/>
			<small>The file must use the system template and .xlsx format.</small>
		</label>

		<div class="override-actions">
			<button
				type="button"
				class="primary-btn"
				onclick={() => onImport?.()}
				disabled={importing || !file}
			>
				{importing ? 'Importing...' : 'Import Override'}
			</button>

			{#if file}
				<button type="button" class="ghost-btn" onclick={() => onClearFile?.()}>Clear File</button>
			{/if}
		</div>
	</div>

	<div class="override-imports-panel">
		<div class="override-imports-header">
			<div>
				<h3>Imported Override Files</h3>
				<p>Files are filtered by the selected data-log date range.</p>
			</div>
			<strong>{pagination.totalItems || imports.length} files</strong>
		</div>

		{#if importsLoading && !imports.length}
			<div class="override-imports-loading">Loading imported override files...</div>
		{:else if importsError}
			<div class="status-box error-box">{importsError}</div>
		{:else if imports.length}
			<div class="override-import-list">
				{#each imports as item, index (getOverrideImportSourcePath(item) || index)}
					{@const sourcePath = getOverrideImportSourcePath(item)}
					<div class="override-import-item">
						<div class="override-import-main">
							<strong>{getOverrideImportFilename(item)}</strong>
							<small>{sourcePath || '-'}</small>
						</div>

						<div class="override-import-meta">
							<div>
								<span>Overrides</span>
								<strong>{item?.override_count ?? item?.overrideCount ?? '-'}</strong>
							</div>
							<div>
								<span>Range</span>
								<strong>{getOverrideImportDateRange(item)}</strong>
							</div>
							<div>
								<span>Date ISO</span>
								<strong>{getOverrideImportDateIso(item)}</strong>
							</div>
						</div>

						<button
							type="button"
							class="danger-btn"
							onclick={() => onDelete?.(sourcePath)}
							disabled={deleting || !sourcePath}
						>
							{deletingPath === sourcePath ? 'Deleting...' : 'Delete'}
						</button>
					</div>
				{/each}
			</div>

			<div class="override-imports-pagination">
				<button
					type="button"
					class="ghost-btn"
					onclick={() => onPage?.(Math.max(1, (pagination.page || 1) - 1))}
					disabled={!pagination.hasPrevious || importsLoading}
				>
					Previous
				</button>
				<span>Page {pagination.page || 1} of {pagination.totalPages || 1}</span>
				<button
					type="button"
					class="ghost-btn"
					onclick={() => onPage?.((pagination.page || 1) + 1)}
					disabled={!pagination.hasNext || importsLoading}
				>
					Next
				</button>
			</div>
		{:else}
			<div class="empty-box">No imported override files found for this selected date range.</div>
		{/if}
	</div>

	{#if message}
		<div class="status-box success-box">{message}</div>
	{/if}

	{#if error}
		<div class="status-box error-box">{error}</div>
	{/if}
</section>
