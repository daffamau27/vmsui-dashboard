<script>
  import { onMount } from "svelte";
  import { apiRequest } from "$lib/api/authApi.js";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";

  let { active = false } = $props();

  let loadingMonitor = $state(false);
  let loadingEvents = $state(false);
  let acknowledging = $state(false);
  let error = $state("");
  let successMessage = $state("");

  let monitorRows = $state([]);
  let eventRows = $state([]);
  let pagination = $state({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false
  });

  let selectedVesselId = $state("");
  let selectedStatus = $state("");
  let selectedAlarmType = $state("");
  let page = $state(1);
  let pageSize = $state(20);

  const alarmTypeOptions = [
    {
      value: "DEVICE_OFFLINE",
      label: "Device Offline"
    },
    {
      value: "PANEL_OPEN",
      label: "Panel Open"
    },
    {
      value: "LOW_SPEED_HIGH_RPM",
      label: "Low Speed High RPM"
    },
    {
      value: "LOW_SPEED_OUTSIDE_BOUNDARY",
      label: "Low Speed Outside Boundary"
    },
    {
      value: "ENGINE_HEALTH",
      label: "Engine Health"
    }
  ];

  let refreshTimer = null;

  let activeMonitorRows = $derived(
    monitorRows.filter((row) => String(row?.status || "").toUpperCase() === "ACTIVE")
  );

  let clearedMonitorRows = $derived(
    monitorRows.filter((row) => String(row?.status || "").toUpperCase() === "CLEARED")
  );

  let newAlarmCount = $derived(
    monitorRows.filter((row) => row?.isNew).length
  );

  let activeAlarmCount = $derived(
    activeMonitorRows.length
  );

  let totalEventCount = $derived(
    pagination?.totalItems || eventRows.length
  );

  let vesselOptions = $derived(
    [...monitorRows, ...eventRows]
      .map((row) => ({
        vesselId: row?.vesselId,
        vesselName:
          row?.vesselName ||
          row?.vessel_name ||
          row?.assetName ||
          row?.deviceName ||
          `Vessel ${row?.vesselId}`
      }))
      .filter((row) => row.vesselId !== undefined && row.vesselId !== null)
      .reduce((items, row) => {
        const exists = items.some((item) => String(item.vesselId) === String(row.vesselId));
        return exists ? items : [...items, row];
      }, [])
  );

  function formatDateTime(value) {
    if (!value && value !== 0) return "-";

    if (typeof value === "string" && Number.isNaN(Number(value))) {
      return value;
    }

    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return String(value);

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function formatAlarmType(value) {
    return String(value || "-")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function getVesselName(row) {
    return (
      row?.vesselName ||
      row?.vessel_name ||
      row?.assetName ||
      row?.deviceName ||
      (row?.vesselId ? `Vessel ${row.vesselId}` : "-")
    );
  }

  function getStatusClass(status) {
    const normalized = String(status || "").toUpperCase();

    if (normalized === "ACTIVE") return "status-active";
    if (normalized === "CLEARED") return "status-cleared";

    return "status-neutral";
  }

  function buildAlarmEventsQuery() {
    const params = new URLSearchParams();

    if (selectedVesselId) {
      params.set("vesselId", selectedVesselId);
    }

    if (selectedStatus) {
      params.set("status", selectedStatus);
    }

    if (selectedAlarmType.trim()) {
      params.set("alarmType", selectedAlarmType.trim());
    }

    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    return params.toString();
  }

  async function loadAlarmMonitor() {
    loadingMonitor = true;
    error = "";

    try {
      const response = await apiRequest("/alarm/monitor", {
        method: "GET"
      });

      const payload = response?.data || {};

      monitorRows = Array.isArray(payload?.monitor)
        ? payload.monitor
        : Array.isArray(response?.monitor)
          ? response.monitor
          : Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response)
              ? response
              : [];
    } catch (err) {
      console.error("[ALARM_MONITOR_ERROR]", err);
      error = err?.message || "Failed to load alarm monitor.";
      monitorRows = [];
    } finally {
      loadingMonitor = false;
    }
  }

  async function loadAlarmEvents() {
    loadingEvents = true;
    error = "";

    try {
      const query = buildAlarmEventsQuery();

      const response = await apiRequest(`/alarm/events?${query}`, {
        method: "GET"
      });

      const payload = response?.data || {};

      const events = Array.isArray(payload?.events)
        ? payload.events
        : Array.isArray(response?.events)
          ? response.events
          : [];

      eventRows = events.map((event) => ({
        ...event,
        vesselName:
          event?.vesselName ||
          event?.vessel_name ||
          event?.assetName ||
          event?.deviceName ||
          (event?.vesselId ? `Vessel ${event.vesselId}` : "-")
      }));

      pagination = {
        page: payload?.pagination?.page ?? page,
        pageSize: payload?.pagination?.pageSize ?? pageSize,
        totalItems: payload?.pagination?.totalItems ?? eventRows.length,
        totalPages: payload?.pagination?.totalPages ?? 1,
        hasNext: Boolean(payload?.pagination?.hasNext),
        hasPrevious: Boolean(payload?.pagination?.hasPrevious)
      };
    } catch (err) {
      console.error("[ALARM_EVENTS_ERROR]", err);
      error = err?.message || "Failed to load alarm events.";
      eventRows = [];
      pagination = {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      };
    } finally {
      loadingEvents = false;
    }
  }

  async function loadAllAlarmData() {
    await Promise.all([
      loadAlarmMonitor(),
      loadAlarmEvents()
    ]);
  }

  async function handleApplyFilter() {
    page = 1;
    await loadAlarmEvents();
  }

  async function handleResetFilter() {
    selectedVesselId = "";
    selectedStatus = "";
    selectedAlarmType = "";
    page = 1;
    pageSize = 20;
    await loadAlarmEvents();
  }

  async function handleNextPage() {
    if (!pagination.hasNext) return;

    page = Number(pagination.page || page) + 1;
    await loadAlarmEvents();
  }

  async function handlePreviousPage() {
    if (!pagination.hasPrevious) return;

    page = Math.max(1, Number(pagination.page || page) - 1);
    await loadAlarmEvents();
  }

  async function handleMarkAllRead() {
    acknowledging = true;
    error = "";
    successMessage = "";

    try {
      await apiRequest("/alarm/mark-all-read", {
        method: "POST"
      });

      successMessage = "All alarms acknowledged successfully.";

      await loadAllAlarmData();
    } catch (err) {
      console.error("[ALARM_MARK_ALL_READ_ERROR]", err);
      error = err?.message || "Failed to acknowledge all alarms.";
    } finally {
      acknowledging = false;
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();

    refreshTimer = setInterval(() => {
      if (!active) return;
      loadAlarmMonitor();
    }, 10000);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  onMount(() => {
    loadAllAlarmData();
    startAutoRefresh();

    return () => {
      stopAutoRefresh();
    };
  });

  $effect(() => {
    if (active) {
      loadAllAlarmData();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
</script>

<section class="alarm-page">
  <section class="alarm-header-card">
    <div>
      <div class="page-kicker">Alarm Monitor</div>
      <h1>Alarm Page</h1>
      <p>
        Live alarm monitor and historical alarm event logs for assigned vessels.
      </p>
    </div>

    <div class="header-actions">
      <button
        type="button"
        class="secondary-btn"
        onclick={loadAllAlarmData}
        disabled={loadingMonitor || loadingEvents}
      >
        {loadingMonitor || loadingEvents ? "Refreshing..." : "Refresh"}
      </button>

      <button
        type="button"
        class="primary-btn"
        onclick={handleMarkAllRead}
        disabled={acknowledging}
      >
        {acknowledging ? "Acknowledging..." : "Mark All Read"}
      </button>
    </div>
  </section>

  {#if error}
    <div class="status-box error-box">
      {error}
    </div>
  {/if}

  {#if successMessage}
    <div class="status-box success-box">
      {successMessage}
    </div>
  {/if}

  <section class="alarm-summary-grid">
    <article class="summary-card">
      <span>Active Alarm Vessels</span>
      <strong>{monitorRows.length}</strong>
    </article>

    <article class="summary-card">
      <span>Active Alarms</span>
      <strong>{activeAlarmCount}</strong>
    </article>

    <article class="summary-card">
      <span>New Alarms</span>
      <strong>{newAlarmCount}</strong>
    </article>

    <article class="summary-card">
      <span>Historical Events</span>
      <strong>{totalEventCount}</strong>
    </article>
  </section>

  <section class="table-section alarm-monitor-section">
    <div class="section-header">
      <div>
        <span class="section-kicker">Live</span>
        <h2>Assigned Vessel Alarm Status</h2>
      </div>

      <strong>{monitorRows.length} vessels</strong>
    </div>

    {#if loadingMonitor}
      <LoadingSkeleton label="Loading alarm monitor" variant="alarm-monitor-grid" rows={4} />
    {:else if monitorRows.length}
      <div class="alarm-monitor-grid">
        {#each monitorRows as row}
          <article class="alarm-vessel-card" class:new-card={row.isNew}>
            <div class="alarm-vessel-top">
              <div>
                <span>Vessel</span>
                <strong>{row.vesselName || `Vessel ${row.vesselId}`}</strong>
              </div>

              <div class={`status-pill ${getStatusClass(row.status)}`}>
                {row.status || "-"}
              </div>
            </div>

            <div class="alarm-vessel-body">
              <div>
                <span>Alarm Type</span>
                <strong>{formatAlarmType(row.type)}</strong>
              </div>

              <div>
                <span>Last Update</span>
                <strong>{row.lastUpdate || formatDateTime(row.lastUpdateTs)}</strong>
              </div>
            </div>

            {#if row.isNew}
              <div class="new-badge">NEW</div>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="empty-box">No alarm monitor data is available for assigned vessels.</div>
    {/if}
  </section>

  <section class="table-section alarm-events-section">
    <div class="section-header">
      <div>
        <span class="section-kicker">History</span>
        <h2>Alarm Events</h2>
      </div>

      <strong>{pagination.totalItems || 0} events</strong>
    </div>

    <div class="event-filter-card">
      <label>
        <span>Vessel</span>
        <select bind:value={selectedVesselId}>
          <option value="">All Vessels</option>
          {#each vesselOptions as vessel}
            <option value={vessel.vesselId}>
              {vessel.vesselName}
            </option>
          {/each}
        </select>
      </label>

      <label>
        <span>Status</span>
        <select bind:value={selectedStatus}>
          <option value="">All Status</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="CLEARED">CLEARED</option>
        </select>
      </label>

      <label>
        <span>Alarm Type</span>
        <select bind:value={selectedAlarmType}>
          <option value="">All Alarm Types</option>

          {#each alarmTypeOptions as alarmType}
            <option value={alarmType.value}>
              {alarmType.label}
            </option>
          {/each}
        </select>
      </label>

      <label>
        <span>Page Size</span>
        <select bind:value={pageSize}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>

      <div class="filter-actions">
        <button
          type="button"
          class="primary-btn"
          onclick={handleApplyFilter}
          disabled={loadingEvents}
        >
          Apply
        </button>

        <button
          type="button"
          class="secondary-btn"
          onclick={handleResetFilter}
          disabled={loadingEvents}
        >
          Reset
        </button>
      </div>
    </div>

    {#if loadingEvents}
      <LoadingSkeleton label="Loading alarm events" variant="alarm-events-table" rows={6} columns={7} />
    {:else if eventRows.length}
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Vessel Name</th>
              <th>Alarm Type</th>
              <th>Status</th>
              <th>Event Time</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th>Alarm ID</th>
            </tr>
          </thead>

          <tbody>
            {#each eventRows as row}
              <tr>
                <td>{getVesselName(row)}</td>
                <td>{formatAlarmType(row.alarmType)}</td>
                <td>
                  <span class={`status-pill ${getStatusClass(row.status)}`}>
                    {row.status || "-"}
                  </span>
                </td>
                <td>{formatDateTime(row.eventTs)}</td>
                <td>{formatDateTime(row.startTs)}</td>
                <td>{row.endTs ? formatDateTime(row.endTs) : "-"}</td>
                <td>{row.alarmId || row.id || "-"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="pagination-bar">
        <button
          type="button"
          class="secondary-btn"
          onclick={handlePreviousPage}
          disabled={!pagination.hasPrevious || loadingEvents}
        >
          Previous
        </button>

        <span>
          Page {pagination.page || page} of {pagination.totalPages || 1}
        </span>

        <button
          type="button"
          class="secondary-btn"
          onclick={handleNextPage}
          disabled={!pagination.hasNext || loadingEvents}
        >
          Next
        </button>
      </div>
    {:else}
      <div class="empty-box">No alarm events match the selected filters.</div>
    {/if}
  </section>
</section>

<style>
  .alarm-page {
    width: 100%;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    padding: 14px;
    background: var(--color-base);
    color: var(--text-primary);
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .alarm-header-card,
  .table-section,
  .status-box,
  .summary-card {
    background: var(--color-surface);
    border: 1px solid #d9e2ec;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  }

  .alarm-header-card {
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .page-kicker,
  .section-kicker {
    display: inline-flex;
    width: fit-content;
    padding: 4px 9px;
    border-radius: 999px;
    background: var(--color-accent-muted);
    color: #1d4ed8;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .alarm-header-card h1 {
    margin: 8px 0 0;
    color: var(--text-primary);
    font-size: 22px;
    line-height: 1.2;
    font-weight: 900;
  }

  .alarm-header-card p {
    margin: 7px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .primary-btn,
  .secondary-btn {
    height: 32px;
    padding: 0 12px;
    border: none;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
    white-space: nowrap;
  }

  .primary-btn {
    background: #2563eb;
    color: #ffffff;
  }

  .secondary-btn {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
  }

  .primary-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .secondary-btn:hover:not(:disabled) {
    background: #cbd5e1;
  }

  .primary-btn:disabled,
  .secondary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .status-box {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 900;
  }

  .error-box {
    background: var(--color-danger-muted);
    color: #b91c1c;
    border-color: #fecaca;
  }

  .success-box {
    background: var(--color-success-muted);
    color: #047857;
    border-color: #bbf7d0;
  }

  .alarm-summary-grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-card {
    min-height: 82px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .summary-card span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .summary-card strong {
    display: block;
    margin-top: 10px;
    color: var(--text-primary);
    font-size: 20px;
    line-height: 1;
    font-weight: 900;
  }

  .table-section {
    margin-top: 14px;
    overflow: hidden;
  }

  .section-header {
    min-height: 58px;
    padding: 12px 14px;
    border-bottom: 1px solid #e5edf5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--color-surface);
  }

  .section-header h2 {
    margin: 7px 0 0;
    color: var(--text-primary);
    font-size: 17px;
    font-weight: 900;
  }

  .section-header > strong {
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--color-accent-muted);
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .alarm-monitor-grid {
    padding: 14px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    background: var(--color-elevated);
  }

  .alarm-vessel-card {
    position: relative;
    padding: 14px;
    background: var(--color-surface);
    border: 1px solid #d9e2ec;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
    display: grid;
    gap: 12px;
  }

  .alarm-vessel-card.new-card {
    border-color: #fb923c;
    box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.12);
  }

  .alarm-vessel-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .alarm-vessel-top span,
  .alarm-vessel-body span {
    display: block;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .alarm-vessel-top strong {
    display: block;
    margin-top: 4px;
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.25;
    font-weight: 900;
  }

  .alarm-vessel-body {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .alarm-vessel-body strong {
    display: block;
    margin-top: 4px;
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.35;
    font-weight: 700;
    word-break: break-word;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 70px;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 10px;
    line-height: 1.2;
    font-weight: 900;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .status-active {
    background: var(--color-danger-muted);
    border: 1px solid #fecaca;
    color: #b91c1c;
  }

  .status-cleared {
    background: var(--color-success-muted);
    border: 1px solid #bbf7d0;
    color: #047857;
  }

  .status-neutral {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid #cbd5e1;
    color: var(--text-secondary);
  }

  .new-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 4px 8px;
    border-radius: 999px;
    background: #f97316;
    color: #ffffff;
    font-size: 9px;
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: 0.04em;
  }

  .event-filter-card {
    padding: 12px;
    display: flex;
    align-items: end;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--color-elevated);
    border-bottom: 1px solid #e2e8f0;
  }

  .event-filter-card label {
    display: grid;
    gap: 5px;
  }

  .event-filter-card label span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .event-filter-card input,
  .event-filter-card select {
    height: 32px;
    min-width: 150px;
    border: 1px solid #cbd5e1;
    background: var(--color-surface);
    padding: 0 9px;
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 700;
    outline: none;
    color-scheme: dark;
  }

  .event-filter-card select option,
  .event-filter-card select optgroup {
    background: #111827;
    color: #f1f5f9;
    font-size: 12px;
    font-weight: 700;
  }

  .event-filter-card input:focus,
  .event-filter-card select:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
  }

  .filter-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .table-wrapper {
    width: 100%;
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  th {
    background: var(--color-elevated);
    color: var(--text-secondary);
    font-size: 10.5px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  td {
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 700;
    padding: 10px 12px;
    border-bottom: 1px solid #eef2f7;
    white-space: nowrap;
  }

  tr:hover td {
    background: var(--color-elevated);
  }

  .pagination-bar {
    padding: 12px 14px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    background: var(--color-elevated);
    border-top: 1px solid #e5edf5;
  }

  .pagination-bar span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 900;
    white-space: nowrap;
  }

  .empty-box {
    padding: 18px 14px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    background: var(--color-surface);
  }

  @media (max-width: 1100px) {
    .alarm-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .alarm-page {
      padding: 10px;
    }

    .alarm-header-card {
      align-items: stretch;
      flex-direction: column;
    }

    .header-actions,
    .event-filter-card,
    .filter-actions {
      width: 100%;
      flex-direction: column;
      align-items: stretch;
    }

    .alarm-summary-grid {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .section-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .alarm-monitor-grid {
      grid-template-columns: 1fr;
      padding: 10px;
    }

    .event-filter-card input,
    .event-filter-card select,
    .primary-btn,
    .secondary-btn {
      width: 100%;
      min-width: 0;
    }

    .pagination-bar {
      justify-content: stretch;
      flex-direction: column;
      align-items: stretch;
    }

    .pagination-bar span {
      text-align: center;
    }
  }
</style>
