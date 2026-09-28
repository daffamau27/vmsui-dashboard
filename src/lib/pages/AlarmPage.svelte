<script>
  import { onMount, tick } from "svelte";
  import { apiRequest } from "$lib/api/authApi.js";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import { sortByAlpha } from "$lib/utils/alphaSort.js";

  let { active = false } = $props();

  let loadingMonitor = $state(false);
  let loadingEvents = $state(false);
  let acknowledging = $state(false);
  let error = $state("");
  let successMessage = $state("");

  let monitorRows = $state([]);
  let eventRows = $state([]);
  let deviationRows = $state([]);
  let deviationPagination = $state({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false
  });
  let loadingDeviations = $state(false);
  let showDeviationOverlay = $state(false);
  let deviationAcknowledged = $state(false);
  let deviationAcknowledgeError = $state("");
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
  let selectedAlarmTypes = $state([]);
  let page = $state(1);
  let pageSize = $state(20);
  let alarmEventsSectionElement = $state(null);
  let alarmTypeFilterElement = $state(null);

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
    },
    {
      value: "VOYAGE_PLAN_DEVIATION",
      label: "Voyage Plan Deviation"
    },
    {
      value: "JUMPING_DATA",
      label: "Jumping Data"
    },
    {
      value: "SPIKE_RPM",
      label: "Spike RPM"
    },
    {
      value: "OUTRANGE_RPM",
      label: "Outrange RPM"
    },
    {
      value: "RPM_BLANK",
      label: "RPM Blank"
    },
    {
      value: "UNALIGNED_RPM_ENGINES",
      label: "Unaligned RPM Engines"
    }
  ];

  let refreshTimer = null;
  let deviationRefreshTimer = null;

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
    sortByAlpha(
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
        }, []),
      (vessel) => vessel.vesselName
    )
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

  function getDeviationDescription(type) {
    const descriptions = {
      JUMPING_DATA: "No telemetry data has been received for more than 5 minutes.",
      SPIKE_RPM: "Engine RPM spiked from 0 to 1000 RPM or higher.",
      OUTRANGE_RPM: "Engine RPM is outside the configured operating limits.",
      RPM_BLANK: "Telemetry is available, but the engine RPM value is missing or unreadable."
    };

    return descriptions[String(type || "").toUpperCase()] || "A telemetry data deviation was detected.";
  }

  function closeDeviationOverlay() {
    showDeviationOverlay = false;
  }

  function handleDeviationOverlayKeydown(event) {
    if (event.key !== "Escape") return;

    if (showDeviationOverlay) closeDeviationOverlay();
    closeAlarmTypeDropdown();
  }

  function closeAlarmTypeDropdown() {
    alarmTypeFilterElement?.removeAttribute?.("open");
  }

  function handleAlarmTypeOutsidePointerDown(event) {
    if (event.target?.closest?.(".alarm-type-filter")) return;
    closeAlarmTypeDropdown();
  }

  function toggleAlarmType(alarmType, checked) {
    const normalizedType = String(alarmType || "").trim().toUpperCase();
    if (!normalizedType) return;

    selectedAlarmTypes = checked
      ? [...new Set([...selectedAlarmTypes, normalizedType])]
      : selectedAlarmTypes.filter((type) => type !== normalizedType);
  }

  async function viewDeviationHistory() {
    const visibleDeviationTypes = new Set(
      deviationRows
        .map((row) => String(row?.type || "").trim().toUpperCase())
        .filter(Boolean)
    );

    selectedAlarmTypes = alarmTypeOptions
      .map((option) => option.value)
      .filter((type) => visibleDeviationTypes.has(type));
    selectedVesselId = "";
    selectedStatus = "";
    page = 1;
    closeDeviationOverlay();
    closeAlarmTypeDropdown();

    await loadAlarmEvents();
    await tick();
    alarmEventsSectionElement?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  async function handleDeviationAcknowledge() {
    deviationAcknowledgeError = "";

    const acknowledged = await handleMarkAllRead();

    if (acknowledged) {
      deviationAcknowledged = true;
      return;
    }

    deviationAcknowledgeError = error || "Failed to acknowledge alarms.";
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

    if (selectedAlarmTypes.length) {
      params.set("alarmType", selectedAlarmTypes.join(","));
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

  async function loadMonitorDeviations() {
    if (loadingDeviations) return;

    loadingDeviations = true;

    try {
      const response = await apiRequest("/alarm/monitor-deviations?page=1&pageSize=20", {
        method: "GET"
      });
      const payload = response?.data || {};

      const nextDeviationRows = Array.isArray(payload?.monitor)
        ? payload.monitor
        : Array.isArray(response?.monitor)
          ? response.monitor
          : [];

      const nextDeviationPagination = {
        page: payload?.pagination?.page ?? 1,
        pageSize: payload?.pagination?.pageSize ?? 20,
        totalItems: payload?.pagination?.totalItems ?? nextDeviationRows.length,
        totalPages: payload?.pagination?.totalPages ?? 1,
        hasNext: Boolean(payload?.pagination?.hasNext),
        hasPrevious: Boolean(payload?.pagination?.hasPrevious)
      };

      if (nextDeviationRows.length > 0) {
        deviationRows = nextDeviationRows;
        deviationPagination = nextDeviationPagination;
        deviationAcknowledged = false;
        deviationAcknowledgeError = "";
        showDeviationOverlay = true;
      } else if (!showDeviationOverlay) {
        deviationRows = [];
        deviationPagination = nextDeviationPagination;
      }
    } catch (err) {
      if (!showDeviationOverlay) deviationRows = [];

      if (Number(err?.status) !== 403) {
        console.error("[ALARM_MONITOR_DEVIATIONS_ERROR]", err);
      }
    } finally {
      loadingDeviations = false;
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
    closeAlarmTypeDropdown();
    await loadAlarmEvents();
  }

  async function handleResetFilter() {
    selectedVesselId = "";
    selectedStatus = "";
    selectedAlarmTypes = [];
    page = 1;
    pageSize = 20;
    closeAlarmTypeDropdown();
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
      return true;
    } catch (err) {
      console.error("[ALARM_MARK_ALL_READ_ERROR]", err);
      error = err?.message || "Failed to acknowledge all alarms.";
      return false;
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

  function startDeviationAutoRefresh() {
    stopDeviationAutoRefresh();

    deviationRefreshTimer = setInterval(() => {
      loadMonitorDeviations();
    }, 60000);
  }

  function stopDeviationAutoRefresh() {
    if (deviationRefreshTimer) {
      clearInterval(deviationRefreshTimer);
      deviationRefreshTimer = null;
    }
  }

  onMount(() => {
    document.addEventListener("pointerdown", handleAlarmTypeOutsidePointerDown);
    loadAllAlarmData();
    loadMonitorDeviations();
    startAutoRefresh();
    startDeviationAutoRefresh();

    return () => {
      document.removeEventListener("pointerdown", handleAlarmTypeOutsidePointerDown);
      stopAutoRefresh();
      stopDeviationAutoRefresh();
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

<svelte:window onkeydown={handleDeviationOverlayKeydown} />

{#if showDeviationOverlay && deviationRows.length}
  <button
    type="button"
    class="deviation-overlay-backdrop"
    aria-label="Close data deviation alert"
    onclick={closeDeviationOverlay}
  ></button>

  <section
    class="deviation-alert-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="deviation-alert-title"
  >
    <header class="deviation-alert-header">
      <div class="deviation-alert-icon" aria-hidden="true">!</div>

      <div class="deviation-alert-title">
        <span>Unread data deviations</span>
        <h2 id="deviation-alert-title">
          {deviationPagination.totalItems || deviationRows.length} active deviation{(deviationPagination.totalItems || deviationRows.length) === 1 ? "" : "s"}
        </h2>
        <p>Review these telemetry issues from vessels assigned to you.</p>
      </div>

      <button
        type="button"
        class="deviation-alert-close"
        aria-label="Close data deviation alert"
        title="Close"
        onclick={closeDeviationOverlay}
      >
        &times;
      </button>
    </header>

    <div class="deviation-alert-list">
      {#each deviationRows as row (row.alarmId)}
        <article class="deviation-alert-item">
          <div class="deviation-item-heading">
            <div>
              <span>Vessel</span>
              <strong>{getVesselName(row)}</strong>
            </div>

            <span class="deviation-type-pill">{formatAlarmType(row.type)}</span>
          </div>

          <p>{getDeviationDescription(row.type)}</p>

          <div class="deviation-item-meta">
            <div>
              <span>Started</span>
              <strong>{row.start || formatDateTime(row.startTs)}</strong>
            </div>

            <div>
              <span>Duration</span>
              <strong>{row.duration || `${row.durationSeconds ?? 0}s`}</strong>
            </div>

            <div>
              <span>Device ID</span>
              <strong>{row.deviceId || "-"}</strong>
            </div>
          </div>
        </article>
      {/each}
    </div>

    <footer class="deviation-alert-footer">
      <div class="deviation-alert-feedback">
        <span>
          Showing {deviationRows.length} of {deviationPagination.totalItems || deviationRows.length} unread deviations.
        </span>

        {#if deviationAcknowledged}
          <strong>Alarms acknowledged. You can still review this alert.</strong>
        {:else if deviationAcknowledgeError}
          <em>{deviationAcknowledgeError}</em>
        {/if}
      </div>

      <div class="deviation-alert-actions">
        <button type="button" class="secondary-btn" onclick={closeDeviationOverlay}>
          Continue
        </button>

        <button
          type="button"
          class="deviation-acknowledge-btn"
          onclick={handleDeviationAcknowledge}
          disabled={acknowledging || deviationAcknowledged}
        >
          {acknowledging ? "Acknowledging..." : deviationAcknowledged ? "Acknowledged" : "Acknowledge"}
        </button>

        <button type="button" class="deviation-history-btn" onclick={viewDeviationHistory}>
          View History
        </button>
      </div>
    </footer>
  </section>
{/if}

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
        {acknowledging ? "Acknowledging..." : "Acknowledge All"}
      </button>
    </div>
  </section>

  {#if error || successMessage}
    <div class="alarm-toast-layer" aria-live="polite">
      {#if error}
        <div class="alarm-toast danger" role="alert">
          <div class="alarm-toast-copy">
            <strong>Action failed</strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            class="alarm-toast-close"
            aria-label="Close error notification"
            onclick={() => (error = "")}
          >
            &times;
          </button>
        </div>
      {/if}

      {#if successMessage}
        <div class="alarm-toast success" role="status">
          <div class="alarm-toast-copy">
            <strong>Action success</strong>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            class="alarm-toast-close"
            aria-label="Close success notification"
            onclick={() => (successMessage = "")}
          >
            &times;
          </button>
        </div>
      {/if}
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

  <section class="table-section alarm-events-section" bind:this={alarmEventsSectionElement}>
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
        <span>Page Size</span>
        <select bind:value={pageSize}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>

      <details class="alarm-type-filter" bind:this={alarmTypeFilterElement}>
        <summary>
          <span>
            <small>Alarm Type</small>
            <strong>
              {selectedAlarmTypes.length ? `${selectedAlarmTypes.length} types selected` : "All types"}
            </strong>
          </span>
          <span class="alarm-type-chevron" aria-hidden="true">&#8964;</span>
        </summary>

        <div class="alarm-type-dropdown">
          <div class="alarm-type-dropdown-head">
            <span>Select alarm types</span>
            {#if selectedAlarmTypes.length}
              <button type="button" onclick={() => (selectedAlarmTypes = [])}>Clear</button>
            {/if}
          </div>

          <div class="alarm-type-checkboxes">
            {#each alarmTypeOptions as alarmType (alarmType.value)}
              <label class:checked={selectedAlarmTypes.includes(alarmType.value)}>
                <input
                  type="checkbox"
                  checked={selectedAlarmTypes.includes(alarmType.value)}
                  onchange={(event) => toggleAlarmType(alarmType.value, event.currentTarget.checked)}
                />
                <span class="alarm-type-checkbox-mark" aria-hidden="true"></span>
                <span class="alarm-type-checkbox-label">{alarmType.label}</span>
              </label>
            {/each}
          </div>
        </div>
      </details>

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
  .deviation-overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 5000;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: rgba(2, 6, 23, 0.76);
    backdrop-filter: blur(4px);
    cursor: default;
  }

  .deviation-alert-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 5001;
    width: min(780px, calc(100vw - 32px));
    max-height: min(760px, calc(100vh - 32px));
    transform: translate(-50%, -50%);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px solid rgba(251, 146, 60, 0.46);
    border-radius: 18px;
    background: var(--color-surface);
    color: var(--text-primary);
    box-shadow: 0 28px 80px rgba(2, 6, 23, 0.52), 0 0 0 1px rgba(249, 115, 22, 0.08);
  }

  .deviation-alert-header {
    padding: 18px 20px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 13px;
    border-bottom: 1px solid rgba(251, 146, 60, 0.24);
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.17), rgba(245, 158, 11, 0.05));
  }

  .deviation-alert-icon {
    width: 38px;
    height: 38px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    background: #f97316;
    color: #ffffff;
    box-shadow: 0 8px 22px rgba(249, 115, 22, 0.28);
    font-size: 22px;
    line-height: 1;
    font-weight: 950;
  }

  .deviation-alert-title {
    min-width: 0;
  }

  .deviation-alert-title > span {
    color: #fb923c;
    font-size: 10px;
    line-height: 1.2;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .deviation-alert-title h2 {
    margin: 4px 0 0;
    color: var(--text-primary);
    font-size: clamp(18px, 2.5vw, 24px);
    line-height: 1.2;
    font-weight: 900;
  }

  .deviation-alert-title p {
    margin: 6px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.45;
    font-weight: 700;
  }

  .deviation-alert-close {
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: rgba(15, 23, 42, 0.42);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
  }

  .deviation-alert-close:hover {
    border-color: rgba(251, 146, 60, 0.68);
    background: rgba(249, 115, 22, 0.14);
    color: #fb923c;
  }

  .deviation-alert-list {
    min-height: 0;
    padding: 14px;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    align-content: start;
    gap: 10px;
    background: var(--color-base);
  }

  .deviation-alert-item {
    padding: 14px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-left: 4px solid #f97316;
    border-radius: 12px;
    background: var(--color-surface);
    box-shadow: 0 4px 12px rgba(2, 6, 23, 0.12);
  }

  .deviation-item-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .deviation-item-heading > div > span,
  .deviation-item-meta span {
    display: block;
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.2;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .deviation-item-heading strong {
    display: block;
    margin-top: 4px;
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.25;
    font-weight: 900;
  }

  .deviation-type-pill {
    max-width: 48%;
    padding: 5px 9px;
    border: 1px solid rgba(251, 146, 60, 0.42);
    border-radius: 999px;
    background: rgba(249, 115, 22, 0.12);
    color: #fb923c;
    font-size: 9px;
    line-height: 1.2;
    font-weight: 900;
    text-align: center;
    white-space: normal;
  }

  .deviation-alert-item > p {
    margin: 10px 0 0;
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.5;
    font-weight: 700;
  }

  .deviation-item-meta {
    margin-top: 12px;
    padding-top: 11px;
    border-top: 1px solid rgba(148, 163, 184, 0.18);
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .deviation-item-meta strong {
    display: block;
    margin-top: 4px;
    color: var(--text-primary);
    font-size: 11px;
    line-height: 1.4;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .deviation-alert-footer {
    padding: 12px 16px;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    background: var(--color-surface);
  }

  .deviation-alert-feedback {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .deviation-alert-feedback > span {
    color: var(--text-secondary);
    font-size: 10px;
    line-height: 1.4;
    font-weight: 700;
  }

  .deviation-alert-feedback > strong,
  .deviation-alert-feedback > em {
    font-size: 10px;
    line-height: 1.4;
    font-style: normal;
    font-weight: 850;
  }

  .deviation-alert-feedback > strong {
    color: #34d399;
  }

  .deviation-alert-feedback > em {
    color: #f87171;
  }

  .deviation-alert-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex: 0 0 auto;
  }

  .deviation-history-btn {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #f97316;
    background: #f97316;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
    white-space: nowrap;
  }

  .deviation-history-btn:hover {
    border-color: #ea580c;
    background: #ea580c;
  }

  .deviation-acknowledge-btn {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #2563eb;
    background: rgba(37, 99, 235, 0.15);
    color: #60a5fa;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
    white-space: nowrap;
  }

  .deviation-acknowledge-btn:hover:not(:disabled) {
    background: #2563eb;
    color: #ffffff;
  }

  .deviation-acknowledge-btn:disabled {
    opacity: 0.58;
    cursor: not-allowed;
  }

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

  .alarm-toast-layer {
    position: fixed;
    top: 18px;
    right: 18px;
    z-index: 30000;
    width: min(390px, calc(100vw - 36px));
    display: grid;
    gap: 10px;
    pointer-events: none;
  }

  .alarm-toast {
    padding: 11px 12px;
    border: 1px solid #d9e2ec;
    border-radius: 12px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    background: rgba(248, 250, 252, 0.98);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.28);
    backdrop-filter: blur(10px);
    pointer-events: auto;
    animation: alarm-toast-in 0.22s ease both;
  }

  .alarm-toast-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .alarm-toast-copy strong {
    color: #0f172a !important;
    font-size: 12px;
    font-weight: 900;
  }

  .alarm-toast-copy span {
    color: #334155 !important;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 700;
    overflow-wrap: anywhere;
    text-transform: none;
  }

  .alarm-toast.success {
    border-color: #86efac;
    background: rgba(240, 253, 244, 0.98);
  }

  .alarm-toast.success .alarm-toast-copy strong {
    color: #052e16 !important;
  }

  .alarm-toast.success .alarm-toast-copy span {
    color: #14532d !important;
  }

  .alarm-toast.danger {
    border-color: #fda4af;
    background: rgba(255, 241, 242, 0.98);
  }

  .alarm-toast.danger .alarm-toast-copy strong {
    color: #881337 !important;
  }

  .alarm-toast.danger .alarm-toast-copy span {
    color: #9f1239 !important;
  }

  .alarm-toast-close {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: rgba(15, 23, 42, 0.08);
    color: #334155 !important;
    font-size: 17px;
    line-height: 1;
    font-weight: 900;
    cursor: pointer;
  }

  .alarm-toast-close:hover {
    background: rgba(15, 23, 42, 0.14);
  }

  @keyframes alarm-toast-in {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
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

  .alarm-events-section {
    overflow: visible;
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

  .event-filter-card > label {
    display: grid;
    gap: 5px;
  }

  .event-filter-card > label > span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .event-filter-card > label > input,
  .event-filter-card > label > select {
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

  .event-filter-card > label > select option,
  .event-filter-card > label > select optgroup {
    background: #111827;
    color: #f1f5f9;
    font-size: 12px;
    font-weight: 700;
  }

  .event-filter-card > label > input:focus,
  .event-filter-card > label > select:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
  }

  .alarm-type-filter {
    position: relative;
    flex: 1 1 250px;
    max-width: 340px;
    min-width: 0;
    align-self: flex-end;
  }

  .alarm-type-filter summary {
    height: 32px;
    padding: 0 9px;
    border: 1px solid #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--color-surface);
    color: var(--text-primary);
    cursor: pointer;
    list-style: none;
    box-sizing: border-box;
  }

  .alarm-type-filter summary::-webkit-details-marker {
    display: none;
  }

  .alarm-type-filter summary:focus-visible,
  .alarm-type-filter[open] summary {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
    outline: none;
  }

  .alarm-type-filter summary > span:first-child {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .alarm-type-filter summary small {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .alarm-type-filter summary strong {
    min-width: 0;
    color: var(--text-primary);
    font-size: 11px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .alarm-type-chevron {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1;
    transition: transform 140ms ease;
  }

  .alarm-type-filter[open] .alarm-type-chevron {
    transform: rotate(180deg);
  }

  .alarm-type-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 120;
    width: min(360px, calc(100vw - 48px));
    padding: 8px;
    border: 1px solid rgba(96, 165, 250, 0.42);
    border-radius: 10px;
    background: var(--color-surface);
    box-shadow: 0 18px 42px rgba(2, 6, 23, 0.34);
  }

  .alarm-type-dropdown-head {
    min-height: 28px;
    padding: 0 3px 7px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .alarm-type-dropdown-head > span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .alarm-type-dropdown-head button {
    padding: 3px 7px;
    border: 0;
    border-radius: 6px;
    background: rgba(37, 99, 235, 0.14);
    color: #60a5fa;
    font-size: 9px;
    font-weight: 900;
    cursor: pointer;
  }

  .alarm-type-checkboxes {
    max-height: 285px;
    margin-top: 7px;
    overflow-y: auto;
    display: grid;
    gap: 5px;
  }

  .alarm-type-checkboxes label {
    width: 100%;
    min-height: 32px;
    padding: 6px 8px;
    border: 1px solid rgba(148, 163, 184, 0.26);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 7px;
    background: var(--color-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    box-sizing: border-box;
    transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
  }

  .alarm-type-checkboxes label:hover {
    border-color: rgba(96, 165, 250, 0.58);
  }

  .alarm-type-checkboxes label.checked {
    border-color: rgba(37, 99, 235, 0.78);
    background: rgba(37, 99, 235, 0.15);
    color: var(--text-primary);
  }

  .alarm-type-checkboxes input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .alarm-type-checkbox-mark {
    position: relative;
    width: 16px;
    height: 16px;
    min-width: 16px;
    border: 1px solid #64748b;
    border-radius: 4px;
    display: grid;
    place-items: center;
    background: #0f172a;
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.42);
    box-sizing: border-box;
    transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
  }

  .alarm-type-checkbox-mark::after {
    content: "";
    width: 4px;
    height: 8px;
    margin-top: -2px;
    border: solid #ffffff;
    border-width: 0 2px 2px 0;
    opacity: 0;
    transform: rotate(45deg) scale(0.65);
    transition: opacity 120ms ease, transform 120ms ease;
  }

  .alarm-type-checkboxes input:checked + .alarm-type-checkbox-mark {
    border-color: #60a5fa;
    background: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  }

  .alarm-type-checkboxes input:checked + .alarm-type-checkbox-mark::after {
    opacity: 1;
    transform: rotate(45deg) scale(1);
  }

  .alarm-type-checkboxes input:focus-visible + .alarm-type-checkbox-mark {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.32);
  }

  .alarm-type-checkbox-label {
    color: inherit;
    font-size: 10px;
    line-height: 1.2;
    font-weight: 800;
    text-transform: none;
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
    .alarm-toast-layer {
      top: 48px;
      right: 10px;
      width: calc(100vw - 20px);
    }

    .deviation-alert-dialog {
      width: calc(100vw - 20px);
      max-height: calc(100vh - 20px);
      border-radius: 14px;
    }

    .deviation-alert-header {
      padding: 14px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
    }

    .deviation-alert-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      font-size: 18px;
    }

    .deviation-alert-list {
      padding: 10px;
    }

    .deviation-item-heading,
    .deviation-alert-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .deviation-type-pill {
      max-width: 100%;
      width: fit-content;
    }

    .deviation-item-meta {
      grid-template-columns: 1fr;
      gap: 9px;
    }

    .deviation-alert-actions,
    .deviation-alert-actions button {
      width: 100%;
    }

    .deviation-alert-actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .alarm-type-filter {
      width: 100%;
      max-width: none;
      align-self: stretch;
    }

    .alarm-type-dropdown {
      width: 100%;
      box-sizing: border-box;
    }

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

    .event-filter-card > label > input,
    .event-filter-card > label > select,
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
