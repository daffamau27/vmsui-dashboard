<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';
	import {
		MONTHLY_WEEKDAY_LABELS,
		currentMonth,
		getMaxSelectableDay,
		getMonthlyCalendarDays,
		normalizeMonthlyDay,
		pad
	} from '$lib/utils/monthlyReportCalendar.js';

	let {
		vesselName = '-',
		loading = false,
		exporting = false,
		loadDisabled = false,
		exportDisabled = false,
		autoTimezoneLabel = '',
		rangeLimitText = '',
		reportMonth = $bindable(''),
		startDate = $bindable(''),
		endDate = $bindable(''),
		timezoneMode = $bindable('auto'),
		timezoneOffset = $bindable('+07:00'),
		onLoad,
		onExport,
		onRangeChange
	} = $props();

	let dateRangeDropdownOpen = $state(false);
	let hoveredCalendarDay = $state('');
	let hoveredCalendarKind = $state('');
	let monthlyDayClickCount = $state(0);

	let nextMonthlyDaySelection = $derived(monthlyDayClickCount % 2 === 0 ? 'start' : 'end');
	let activeMonthlyCalendarDays = $derived(getMonthlyCalendarDays(reportMonth));

	function resetMonthlyDateRange() {
		startDate = '';
		endDate = '';
		monthlyDayClickCount = 0;
		dateRangeDropdownOpen = false;
		hoveredCalendarDay = '';
		hoveredCalendarKind = '';
		onRangeChange?.();
	}

	function selectMonthlyDay(day) {
		const selectionKind = nextMonthlyDaySelection;
		const maxDay = getMaxSelectableDay(reportMonth);
		if (maxDay <= 0) return;

		const selectedDay = pad(Math.min(Math.max(normalizeMonthlyDay(day, 1), 1), maxDay));

		if (selectionKind === 'start') {
			startDate = selectedDay;
			endDate = '';
		} else {
			const start = normalizeMonthlyDay(startDate, 1);
			const end = normalizeMonthlyDay(selectedDay, start);
			startDate = pad(Math.min(start, end));
			endDate = pad(Math.min(Math.max(start, end), maxDay));
			dateRangeDropdownOpen = false;
		}

		monthlyDayClickCount += 1;
		hoveredCalendarDay = '';
		hoveredCalendarKind = '';
		onRangeChange?.();
	}

	function setMonthlyDayHover(kind, day) {
		if (!day?.selectable || !day?.value) return;

		hoveredCalendarKind = kind;
		hoveredCalendarDay = day.value;
	}

	function clearMonthlyDayHover(kind) {
		if (hoveredCalendarKind !== kind) return;

		hoveredCalendarDay = '';
		hoveredCalendarKind = '';
	}

	function getMonthlyDayRangeState(day, kind = '') {
		if (!day?.inMonth || !day?.value) {
			return {
				isStart: false,
				isEnd: false,
				isRangeStart: false,
				isRangeEnd: false,
				isInRange: false,
				isPreview: false
			};
		}

		const dayNumber = Number(day.value);
		const hoverNumber = normalizeMonthlyDay(hoveredCalendarDay, 0);
		const isHoveringThisCalendar = hoveredCalendarKind === kind && hoverNumber > 0;
		const hasStartDate = Boolean(String(startDate || '').trim());
		const hasEndDate = Boolean(String(endDate || '').trim());
		const shouldPreviewEndRange = isHoveringThisCalendar && kind === 'end' && hasStartDate;
		const startNumber = hasStartDate ? normalizeMonthlyDay(startDate, 1) : 0;
		const endNumber = shouldPreviewEndRange
			? hoverNumber
			: hasEndDate
				? normalizeMonthlyDay(endDate, startNumber || 1)
				: startNumber;
		const rangeStart = Math.min(startNumber, endNumber);
		const rangeEnd = Math.max(startNumber, endNumber);

		return {
			isStart: hasStartDate && dayNumber === startNumber,
			isEnd: hasEndDate && dayNumber === endNumber,
			isRangeStart: hasStartDate && dayNumber === rangeStart,
			isRangeEnd: hasStartDate && dayNumber === rangeEnd,
			isInRange: hasStartDate && hasEndDate && dayNumber > rangeStart && dayNumber < rangeEnd,
			isPreview: shouldPreviewEndRange && dayNumber >= rangeStart && dayNumber <= rangeEnd
		};
	}

	function handleMonthChange() {
		resetMonthlyDateRange();
	}

	function handleTimezoneChange() {
		onRangeChange?.();
	}
</script>

<section class="monthly-header-card">
	<div class="monthly-header-copy">
		<div class="page-kicker">Monthly Report</div>
		<h1>{vesselName}</h1>
		<p>
			Monthly operation report by date with runtime, fuel consumption, speed, and high RPM low speed
			summary.
		</p>
	</div>

	<div class="monthly-header-filters">
		<div class="filter-card">
			<label>
				<span>Month</span>
				<input
					type="month"
					use:fourDigitDateYear
					bind:value={reportMonth}
					max={currentMonth()}
					onchange={handleMonthChange}
				/>
			</label>

			<label>
				<span>Date Range</span>
				<div class="date-range-combo">
					<button
						type="button"
						class="date-range-trigger"
						class:is-open={dateRangeDropdownOpen}
						aria-label="Open date range calendar"
						aria-expanded={dateRangeDropdownOpen}
						onclick={() => (dateRangeDropdownOpen = !dateRangeDropdownOpen)}
					>
						<span class="date-range-value" class:is-placeholder={!startDate && !endDate}>
							{#if startDate && endDate}
								{startDate} - {endDate}
							{:else if startDate}
								{startDate} -
							{:else}
								Select date range
							{/if}
						</span>
						<span class="date-range-caret">v</span>
					</button>

					{#if dateRangeDropdownOpen}
						<div class="day-dropdown-menu">
							{#each MONTHLY_WEEKDAY_LABELS as label (label)}
								<span class="day-calendar-weekday">{label}</span>
							{/each}
							{#each activeMonthlyCalendarDays as day (day.key)}
								{@const rangeState = getMonthlyDayRangeState(day, nextMonthlyDaySelection)}
								<button
									type="button"
									disabled={!day.selectable}
									class:is-muted={!day.inMonth || !day.selectable}
									class:is-in-range={rangeState.isInRange}
									class:is-preview-range={rangeState.isPreview}
									class:is-range-start={rangeState.isRangeStart}
									class:is-range-end={rangeState.isRangeEnd}
									class:is-selected={rangeState.isStart || rangeState.isEnd}
									onmousedown={(event) => event.preventDefault()}
									onmouseenter={() => setMonthlyDayHover(nextMonthlyDaySelection, day)}
									onmouseleave={() => clearMonthlyDayHover(nextMonthlyDaySelection)}
									onclick={() => day.selectable && selectMonthlyDay(day.value)}
								>
									{day.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</label>

			<label>
				<span class="field-label-row">
					Timezone Mode
					{#if timezoneMode === 'auto'}
						<small class="timezone-auto-pill">Auto • {autoTimezoneLabel}</small>
					{/if}
				</span>
				<select bind:value={timezoneMode} onchange={handleTimezoneChange}>
					{#each TIMEZONE_MODE_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>

			{#if timezoneMode === 'manual'}
				<label>
					<span>Timezone Offset</span>
					<select bind:value={timezoneOffset} onchange={handleTimezoneChange}>
						{#each TIMEZONE_OFFSET_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			{/if}

			<div class="filter-actions">
				<button
					type="button"
					class="primary-btn"
					onclick={() => onLoad?.()}
					disabled={loadDisabled}
				>
					{loading ? 'Loading...' : 'Load Data'}
				</button>

				<button
					type="button"
					class="export-btn"
					onclick={() => onExport?.()}
					disabled={exportDisabled || exporting}
				>
					{exporting ? 'Exporting...' : 'Export Excel'}
				</button>
			</div>

			<p class="filter-hint">{rangeLimitText}</p>
		</div>
	</div>
</section>
