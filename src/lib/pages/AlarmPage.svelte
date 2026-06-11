<script>
  import { onMount } from "svelte";
  import { apiRequest } from "$lib/api/authApi.js";

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
    monitorRows
      .map((row) => ({
        vesselId: row?.vesselId,
        vesselName: row?.vesselName || `Vessel ${row?.vesselId}`
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

      monitorRows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
    } catch (err) {
      console.error("[ALARM_MONITOR_ERROR]", err);
      error = err?.message || "Gagal memuat alarm monitor.";
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

      eventRows = Array.isArray(payload?.events)
        ? payload.events
        : Array.isArray(response?.events)
          ? response.events
          : [];

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
      error = err?.message || "Gagal memuat alarm events.";
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
      error = err?.message || "Gagal acknowledge semua alarm.";
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
      <span>Assigned Vessels</span>
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
      <div class="empty-box">Loading alarm monitor...</div>
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

              <div>
                <span>Device ID</span>
                <strong>{row.deviceId || "-"}</strong>
              </div>
            </div>

            {#if row.isNew}
              <div class="new-badge">NEW</div>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="empty-box">Tidak ada alarm monitor untuk vessel yang ditugaskan.</div>
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
        <input
          type="text"
          bind:value={selectedAlarmType}
          placeholder="e.g. ENGINE_HEALTH"
        />
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
      <div class="empty-box">Loading alarm events...</div>
    {:else if eventRows.length}
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Vessel ID</th>
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
                <td>{row.vesselId ?? "-"}</td>
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
      <div class="empty-box">Tidak ada alarm event yang sesuai filter.</div>
    {/if}
  </section>
</section>

<style>
  .alarm-page {
    min-height: 100vh;
    padding: 16px;
    background: #f3f6fa;
    color: #0f172a;
    display: grid;
    gap: 14px;
  }

  .alarm-header-card,
  .table-section,
  .status-box,
  .summary-card {
    background: #ffffff;
    border: 1px solid #d9e2ec;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  }

  .alarm-header-card {
    padding: 18px 22px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
  }

  .page-kicker,
  .section-kicker {
    display: inline-flex;
    padding: 4px 10px;
    border-radius: 999px;
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .alarm-header-card h1 {
    margin: 10px 0 4px;
    font-size: 24px;
    font-weight: 900;
  }

  .alarm-header-card p {
    margin: 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .header-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .primary-btn,
  .secondary-btn {
    height: 40px;
    padding: 0 16px;
    border: none;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }

  .primary-btn {
    background: #2563eb;
    color: #ffffff;
  }

  .secondary-btn {
    background: #f8fafc;
    color: #0f172a;
    border: 1px solid #cbd5e1;
  }

  .primary-btn:disabled,
  .secondary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .status-box {
    padding: 12px 16px;
    font-size: 13px;
    font-weight: 900;
  }

  .error-box {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }

  .success-box {
    background: #f0fdf4;
    color: #15803d;
    border-color: #bbf7d0;
  }

  .alarm-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-card {
    min-height: 88px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .summary-card span {
    color: #64748b;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .summary-card strong {
    margin-top: 8px;
    font-size: 24px;
    font-weight: 900;
  }

  .section-header {
    min-height: 58px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e2e8f0;
  }

  .section-header h2 {
    margin: 6px 0 0;
    font-size: 18px;
    font-weight: 900;
  }

  .section-header strong {
    padding: 5px 10px;
    border-radius: 999px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
  }

  .alarm-monitor-grid {
    padding: 14px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    background: #f8fafc;
  }

  .alarm-vessel-card {
    position: relative;
    padding: 14px;
    background: #ffffff;
    border: 1px solid #d9e2ec;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    display: grid;
    gap: 12px;
  }

  .alarm-vessel-card.new-card {
    border-color: #f97316;
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
    color: #64748b;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .alarm-vessel-top strong {
    display: block;
    margin-top: 4px;
    font-size: 16px;
    font-weight: 900;
  }

  .alarm-vessel-body {
    display: grid;
    gap: 10px;
  }

  .alarm-vessel-body strong {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    font-weight: 900;
    word-break: break-word;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 74px;
    padding: 5px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .status-active {
    background: #fee2e2;
    border: 1px solid #fecaca;
    color: #b91c1c;
  }

  .status-cleared {
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    color: #15803d;
  }

  .status-neutral {
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    color: #475569;
  }

  .new-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    transform: translateY(-28px);
    padding: 4px 8px;
    border-radius: 999px;
    background: #f97316;
    color: #ffffff;
    font-size: 10px;
    font-weight: 900;
  }

  .event-filter-card {
    padding: 14px;
    display: flex;
    align-items: end;
    gap: 12px;
    flex-wrap: wrap;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .event-filter-card label {
    display: grid;
    gap: 6px;
  }

  .event-filter-card label span {
    color: #475569;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .event-filter-card input,
  .event-filter-card select {
    height: 40px;
    min-width: 170px;
    padding: 0 10px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
    font-size: 13px;
    font-weight: 800;
  }

  .filter-actions {
    display: flex;
    gap: 8px;
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
    padding: 10px 12px;
    background: #f1f5f9;
    border-bottom: 1px solid #d9e2ec;
    color: #334155;
    font-size: 11px;
    font-weight: 900;
    text-align: left;
    text-transform: uppercase;
    white-space: nowrap;
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid #edf2f7;
    color: #0f172a;
    font-weight: 800;
    white-space: nowrap;
  }

  .pagination-bar {
    padding: 12px 14px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    background: #f8fafc;
  }

  .pagination-bar span {
    color: #475569;
    font-size: 12px;
    font-weight: 900;
  }

  .empty-box {
    padding: 18px;
    color: #64748b;
    font-weight: 800;
  }

  @media (max-width: 900px) {
    .alarm-header-card {
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
    }

    .event-filter-card input,
    .event-filter-card select,
    .primary-btn,
    .secondary-btn {
      width: 100%;
    }
  }
</style>