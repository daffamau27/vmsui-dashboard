<script>
  import { onMount } from "svelte";
  import { getFleetVessels } from "$lib/api/fleetApi.js";

  const TIME_RANGE_PRESETS = [
    { id: "midnight", label: "00:00 - 06:00", start: "2026-05-20T00:00", end: "2026-05-20T06:00" },
    { id: "day", label: "06:00 - 18:00", start: "2026-05-20T06:00", end: "2026-05-20T18:00" },
    { id: "night", label: "18:00 - 24:00", start: "2026-05-20T18:00", end: "2026-05-21T00:00" }
  ];

  let devices = $state([]);
  let devicesLoading = $state(false);
  let devicesError = $state("");

  const reportColumns = [
    { id: "me_port_rh", label: "ME PORT RH", type: "runtime", group: "Runtime / RH" },
    { id: "me_stbd_rh", label: "ME STBD RH", type: "runtime", group: "Runtime / RH" },
    { id: "me_center_rh", label: "ME CENTER RH", type: "runtime", group: "Runtime / RH" },
    { id: "ae_port_rh", label: "AE PORT RH", type: "runtime", group: "Runtime / RH" },
    { id: "ae_stbd_rh", label: "AE STBD RH", type: "runtime", group: "Runtime / RH" },

    { id: "me_port_fc_ems", label: "ME PORT FC (EMS)", type: "fuel", group: "Fuel / FC" },
    { id: "me_stbd_fc_ems", label: "ME STBD FC (EMS)", type: "fuel", group: "Fuel / FC" },
    { id: "me_center_fc_ems", label: "ME CENTER FC (EMS)", type: "fuel", group: "Fuel / FC" },
    { id: "ae_port_fc_ems", label: "AE PORT FC (EMS)", type: "fuel", group: "Fuel / FC" },
    { id: "ae_stbd_fc_ems", label: "AE STBD FC (EMS)", type: "fuel", group: "Fuel / FC" },

    { id: "me_port_fc_fms", label: "ME PORT FC (FMS/ECU)", type: "fuel", group: "Fuel / FC" },
    { id: "me_stbd_fc_fms", label: "ME STBD FC (FMS/ECU)", type: "fuel", group: "Fuel / FC" },
    { id: "ae_port_fc_fms", label: "AE PORT FC (FMS/ECU)", type: "fuel", group: "Fuel / FC" },
    { id: "ae_stbd_fc_fms", label: "AE STBD FC (FMS/ECU)", type: "fuel", group: "Fuel / FC" },

    { id: "sriti_me_port", label: "SRITI ME PORT", type: "additional", group: "Additional" },
    { id: "sriti_me_stbd", label: "SRITI ME STBD", type: "additional", group: "Additional" },
    { id: "total_fuel", label: "TOTAL FUEL", type: "total", group: "Additional" },
    { id: "avg_speed", label: "AVG SPEED", type: "additional", group: "Additional" },
    { id: "max_speed", label: "MAX SPEED", type: "additional", group: "Additional" },
    { id: "distance", label: "DISTANCE", type: "additional", group: "Additional" },
    { id: "utc", label: "UTC", type: "utc", group: "Additional" }
  ];

  const defaultColumnIds = [
    "me_port_rh",
    "me_stbd_rh",
    "ae_port_rh",
    "ae_stbd_rh",
    "me_port_fc_ems",
    "me_stbd_fc_ems",
    "me_port_fc_fms",
    "me_stbd_fc_fms",
    "total_fuel",
    "avg_speed",
    "max_speed",
    "utc"
  ];

  let vesselReportRows = $state([]);

  let selectedDeviceIds = $state([]);
  let vesselSearch = $state("");
  let defaultStartDate = $state("2026-05-20T00:00");
  let defaultEndDate = $state("2026-05-20T13:44");
  let activeDefaultPresetId = $state("custom");
  let showColumnSelector = $state(false);
  let visibleColumnIds = $state([...defaultColumnIds]);
  let hasLoadedReport = $state(true);
  let loading = $state(false);
  let loadingStatus = $state("Preparing");
  let completed = $state(0);

  async function loadDeviceList() {
    devicesLoading = true;
    devicesError = "";

    try {
      console.log("[ALL_VESSEL][LOAD_DEVICES][START]");

      const rows = await getFleetVessels();

      console.log("[ALL_VESSEL][LOAD_DEVICES][RESULT]", rows);

      devices = Array.isArray(rows)
        ? rows.map((item) => ({
            id: String(item.vesselId || item.id),
            vesselId: item.vesselId || item.id,
            deviceId: item.deviceId || "",
            name: item.vesselName || item.name || "-",
            vesselName: item.vesselName || item.name || "-",
            companyName: item.companyName || "-",
            online: Boolean(item.online),
            raw: item
          }))
        : [];

      if (!selectedDeviceIds.length && devices.length) {
        selectedDeviceIds = [devices[0].id];
      }
    } catch (err) {
      console.error("[ALL_VESSEL][LOAD_DEVICES][ERROR]", err);
      devicesError = err?.message || "Gagal memuat device list dari API.";
      devices = [];
    } finally {
      devicesLoading = false;
    }
  }

  let selectedDevicesCount = $derived(selectedDeviceIds.length);
  let selectAllDevices = $derived(
    devices.length > 0 && selectedDeviceIds.length === devices.length
  );
  let selectedColumnCount = $derived(visibleColumnIds.length);

  let filteredDevices = $derived(
    devices.filter((device) =>
      device.name.toLowerCase().includes(vesselSearch.toLowerCase())
    )
  );

  let selectedDevices = $derived(
    devices.filter((device) => selectedDeviceIds.includes(device.id))
  );

  let visibleDataColumns = $derived(
    reportColumns.filter((col) => visibleColumnIds.includes(col.id))
  );

  let runtimeColumns = $derived(reportColumns.filter((col) => col.group === "Runtime / RH"));
  let fuelColumns = $derived(reportColumns.filter((col) => col.group === "Fuel / FC"));
  let controlColumns = $derived(reportColumns.filter((col) => col.group === "Additional"));

  let filteredVesselLogs = $derived(
    vesselReportRows.filter((row) => selectedDeviceIds.includes(row.id))
  );

  let selectedRangeSummary = $derived(
    `${defaultStartDate.replace("T", " ")} → ${defaultEndDate.replace("T", " ")}`
  );

  let selectedDeviceRangesValid = $derived(Boolean(defaultStartDate && defaultEndDate));

  let activeDefaultPresetLabel = $derived(
    TIME_RANGE_PRESETS.find((item) => item.id === activeDefaultPresetId)?.label || "Custom"
  );

  let progress = $derived(
    selectedDevicesCount > 0
      ? Math.min(100, (completed / selectedDevicesCount) * 100)
      : 0
  );

  function toggleAllDevices(checked) {
    selectedDeviceIds = checked ? devices.map((device) => device.id) : [];
  }

  function toggleSingleDevice(deviceId, checked) {
    if (checked) {
      selectedDeviceIds = [...new Set([...selectedDeviceIds, deviceId])];
    } else {
      selectedDeviceIds = selectedDeviceIds.filter((id) => id !== deviceId);
    }
  }

  function applyDefaultRangePreset(preset) {
    defaultStartDate = preset.start;
    defaultEndDate = preset.end;
    activeDefaultPresetId = preset.id;
  }

  function setAllColumnsVisibility(value) {
    visibleColumnIds = value ? reportColumns.map((col) => col.id) : [];
  }

  function resetVisibleColumns() {
    visibleColumnIds = [...defaultColumnIds];
  }

  function setColumnVisibility(columnId, checked) {
    if (checked) {
      visibleColumnIds = [...new Set([...visibleColumnIds, columnId])];
    } else {
      visibleColumnIds = visibleColumnIds.filter((id) => id !== columnId);
    }
  }

  function getGroupVisibleCount(columns) {
    return columns.filter((col) => visibleColumnIds.includes(col.id)).length;
  }

  async function loadReport() {
    loading = true;
    hasLoadedReport = false;
    completed = 0;
    loadingStatus = `Loading ${targetDevices[i].name}`;

    const targetDevices = selectedDevices;

    for (let i = 0; i < targetDevices.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 35));
      completed = i + 1;
    }

    loading = false;
    hasLoadedReport = true;
  }

  function formatRangeLabel(row) {
    return `${row.range_start.replace("T", " ")} → ${row.range_end.replace("T", " ")}`;
  }

  function getCellValue(row, col) {
    return row[col.id] ?? "-";
  }

  function isTotalColumn(col) {
    return col.type === "total" || col.id.includes("total");
  }

  onMount(() => {
    loadDeviceList();
  });
</script>

<section class="avs-page">
  <div class="avs-container">
    <header class="avs-header">
      <div>
        <h1>All Vessel Summary</h1>
        <p>{completed} / {selectedDevicesCount} vessels processed</p>
      </div>

    </header>

    <section class="summary-cards">
      <div class="summary-card">
        <span>Selected Vessels</span>
        <strong>{selectedDevicesCount}</strong>
        <small>of {devices.length} available vessels</small>
      </div>

      <div class="summary-card">
        <span>Date Ranges</span>
        <strong>{selectedDeviceRangesValid ? "Ready" : "Not Ready"}</strong>
        <small>{selectedRangeSummary}</small>
      </div>

      <div class="summary-card">
        <span>Active Columns</span>
        <strong>{selectedColumnCount}</strong>
        <small>of {reportColumns.length} report columns</small>
      </div>
    </section>

    <section class="control-layout">
      <section class="panel-card device-panel">
        <div class="panel-header">
          <div>
            <span class="step-chip">Step 1</span>
            <h2>Select vessels</h2>
            <p>Select vessels to include in the summary.</p>
          </div>

          <span class="soft-badge">{selectedDevicesCount} selected</span>
        </div>

        <div class="select-all-box">
          <label>
            <input
              type="checkbox"
              checked={selectAllDevices}
              onchange={(e) => toggleAllDevices(e.currentTarget.checked)}
            />
            <span>Select all vessels</span>
          </label>

          <small>{selectedDevicesCount} of {devices.length}</small>
        </div>

        <input
          class="search-input"
          type="text"
          placeholder="Search vessel name..."
          bind:value={vesselSearch}
        />

        <div class="vessel-list">
          {#if devicesLoading}
            <div class="device-empty">Loading device list...</div>
          {:else if devicesError}
            <div class="device-empty error">{devicesError}</div>
          {:else if filteredDevices.length}
            <div class="device-grid">
                {#if devicesLoading}
                  <div class="device-empty">Loading device list...</div>
                {:else if devicesError}
                  <div class="device-empty error">{devicesError}</div>
                {:else if filteredDevices.length}
                  {#each filteredDevices as device}
                    <label
                      class="device-card"
                      class:active={selectedDeviceIds.includes(device.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDeviceIds.includes(device.id)}
                        onchange={(event) => toggleSingleDevice(device.id, event.currentTarget.checked)}
                      />

                      <div class="device-info">
                        <div class="device-title-row">
                          <strong>{device.name}</strong>

                          <span class:offline={!device.online} class="device-status">
                            <span></span>
                            {device.online ? "Online" : "Offline"}
                          </span>
                        </div>
                      </div>
                    </label>
                  {/each}
                {:else}
                  <div class="device-empty">Tidak ada vessel dari API.</div>
                {/if}
            </div>
          {:else}
            <div class="device-empty">Tidak ada vessel dari API.</div>
          {/if}
        </div>
      </section>

      <div class="side-stack">
        <section class="panel-card range-panel">
          <div class="panel-header">
            <div>
              <span class="step-chip">Step 2</span>
              <h2>Per-vessel date ranges</h2>
              <p>Set calculation period for selected vessels.</p>
            </div>
          </div>

          <div class="range-box">
            <div class="range-box-head">
              <strong>Default range</strong>
              <small>Active preset: {activeDefaultPresetLabel}</small>
            </div>

            <div class="date-grid">
              <label>
                <span>Start</span>
                <input type="datetime-local" bind:value={defaultStartDate} />
              </label>

              <label>
                <span>End</span>
                <input type="datetime-local" bind:value={defaultEndDate} />
              </label>
            </div>

            <div class="preset-row">
              {#each TIME_RANGE_PRESETS as preset}
                <button
                  type="button"
                  class:active={activeDefaultPresetId === preset.id}
                  onclick={() => applyDefaultRangePreset(preset)}
                >
                  {preset.label}
                </button>
              {/each}
            </div>

            <button class="primary-wide-btn">Apply to selected vessels</button>
          </div>

          <div class="selected-range-list">
            {#if selectedDevices.length === 0}
              <div class="range-empty">Select one or more vessels first.</div>
            {:else}
              {#each selectedDevices as device}
                <div class="selected-range-item">
                  <div>
                    <strong>{device.name}</strong>
                    <small>Active preset: {activeDefaultPresetLabel}</small>
                  </div>
                  <span>{defaultStartDate.replace("T", " ")} → {defaultEndDate.replace("T", " ")}</span>
                </div>
              {/each}
            {/if}
          </div>

          <button class="load-report-btn" onclick={loadReport}>
            {loading ? "Loading..." : "Load report"}
          </button>
        </section>

        <section class="panel-card column-panel">
          <div class="panel-header compact">
            <div>
              <span class="step-chip">Step 3</span>
              <h2>Manage columns</h2>
              <p>Hide unnecessary columns to keep table concise.</p>
            </div>

            <button
              class="open-btn"
              type="button"
              onclick={() => (showColumnSelector = !showColumnSelector)}
            >
              {showColumnSelector ? "Close" : "Open"}
            </button>
          </div>

          <div class="column-toolbar">
            <span class="soft-badge">{selectedColumnCount} / {reportColumns.length} active</span>

            <div class="column-actions">
              <button onclick={() => setAllColumnsVisibility(true)}>Show all</button>
              <button onclick={() => setAllColumnsVisibility(false)}>Hide all</button>
              <button onclick={resetVisibleColumns}>Reset</button>
            </div>
          </div>

          {#if showColumnSelector}
            <div class="column-groups">
              <div class="column-group">
                <div class="column-group-head">
                  <span>Runtime / RH</span>
                  <small>{getGroupVisibleCount(runtimeColumns)} / {runtimeColumns.length}</small>
                </div>

                <div class="column-grid">
                  {#each runtimeColumns as col}
                    <label class:active={visibleColumnIds.includes(col.id)}>
                      <input
                        type="checkbox"
                        checked={visibleColumnIds.includes(col.id)}
                        onchange={(e) => setColumnVisibility(col.id, e.currentTarget.checked)}
                      />
                      <span>{col.label}</span>
                    </label>
                  {/each}
                </div>
              </div>

              <div class="column-group">
                <div class="column-group-head">
                  <span>Fuel / FC</span>
                  <small>{getGroupVisibleCount(fuelColumns)} / {fuelColumns.length}</small>
                </div>

                <div class="column-grid">
                  {#each fuelColumns as col}
                    <label class:active={visibleColumnIds.includes(col.id)}>
                      <input
                        type="checkbox"
                        checked={visibleColumnIds.includes(col.id)}
                        onchange={(e) => setColumnVisibility(col.id, e.currentTarget.checked)}
                      />
                      <span>{col.label}</span>
                    </label>
                  {/each}
                </div>
              </div>

              <div class="column-group full">
                <div class="column-group-head">
                  <span>Additional</span>
                  <small>{getGroupVisibleCount(controlColumns)} / {controlColumns.length}</small>
                </div>

                <div class="column-grid compact">
                  {#each controlColumns as col}
                    <label class:active={visibleColumnIds.includes(col.id)}>
                      <input
                        type="checkbox"
                        checked={visibleColumnIds.includes(col.id)}
                        onchange={(e) => setColumnVisibility(col.id, e.currentTarget.checked)}
                      />
                      <span>{col.label}</span>
                    </label>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </section>
      </div>
    </section>

    {#if loading}
      <section class="loading-card">
        <div class="spinner"></div>
        <strong>Loading summary...</strong>
        <span>{loadingStatus} · {completed} / {devices.length} vessels processed</span>

        <div class="progress-track">
          <div class="progress-bar" style={`width:${progress}%`}></div>
        </div>
      </section>
    {:else if !hasLoadedReport}
      <section class="empty-card">
        <strong>No data loaded yet</strong>
        <span>Select vessels, set each vessel date range, then click Load.</span>
      </section>
    {:else}
      <section class="results-card">
        <div class="results-header">
          <div>
            <span class="step-chip">Report Results</span>
            <h2>Vessel summary table</h2>
            <p>Showing runtime, fuel consumption, and UTC settings based on selected vessel configuration.</p>
          </div>

          <div class="result-badges">
            <span>{filteredVesselLogs.length} rows</span>
            <span>{visibleDataColumns.length} columns</span>
          </div>
        </div>

        <div class="scroll-note">Scroll horizontally to view all selected columns.</div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th class="sticky-left vessel-head">Vessel</th>

                {#each visibleDataColumns as col}
                  <th
                    class:runtime-head={col.type === "runtime"}
                    class:fuel-head={col.type === "fuel"}
                    class:total-head={isTotalColumn(col)}
                    class:utc-head={col.type === "utc"}
                  >
                    {col.label}
                  </th>
                {/each}
              </tr>
            </thead>

            <tbody>
              {#each filteredVesselLogs as row}
                <tr>
                  <td class="sticky-left vessel-cell">
                    <strong>{row.vessel}</strong>
                    <small>{formatRangeLabel(row)}</small>
                  </td>

                  {#each visibleDataColumns as col}
                    <td
                      class:runtime-cell={col.type === "runtime"}
                      class:fuel-cell={col.type === "fuel"}
                      class:total-cell={isTotalColumn(col)}
                      class:utc-cell={col.type === "utc"}
                    >
                      {#if col.type === "utc"}
                        <div class="utc-content">
                          <span class="utc-auto">Auto</span>
                          <span class="utc-zone">{getCellValue(row, col)}</span>
                        </div>
                      {:else}
                        <span>{getCellValue(row, col)}</span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  </div>
</section>

<style>
.avs-page {
  min-height: 100%;
  background: #f4f6f8;
  color: #0f172a;
  padding: 18px 20px 48px;
  box-sizing: border-box;
}

  .avs-container {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
  }

  .avs-header {
    display: flex;
    justify-content: center;
    text-align: center;
    margin-bottom: 18px;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 900;
    line-height: 1.1;
  }

  .avs-header p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 14px;
    font-weight: 700;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 16px;
  }

  .device-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    padding: 12px;
  }

  .device-card {
    min-height: fit-content;
    padding: 12px 14px;
    border: 1px solid #d7dee8;
    border-radius: 14px;
    background: #ffffff;
    display: grid;
    grid-template-columns: 22px 1fr;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }

  .device-card:hover {
    border-color: #93c5fd;
    background: #f8fbff;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
    transform: translateY(-1px);
  }

  .device-card.active {
    border-color: #2563eb;
    background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
    box-shadow:
      0 0 0 1px rgba(37, 99, 235, 0.18),
      0 8px 18px rgba(37, 99, 235, 0.10);
  }

  .device-card input {
    width: 17px;
    height: 17px;
    margin-top: 3px;
    accent-color: #2563eb;
    cursor: pointer;
  }

  .device-info {
    min-width: 0;
    display: grid;
    gap: 7px;
  }

  .device-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .device-title-row strong {
    min-width: 0;
    color: #0f172a;
    font-size: 15px;
    line-height: 1.2;
    font-weight: 900;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .device-status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 999px;
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #bbf7d0;
    font-size: 10px;
    font-weight: 900;
  }

  .device-status span {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #10b981;
  }

  .device-status.offline {
    background: #f8fafc;
    color: #64748b;
    border-color: #cbd5e1;
  }

  .device-status.offline span {
    background: #94a3b8;
  }

  .device-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .device-meta span {
    padding: 3px 7px;
    border-radius: 8px;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
    font-size: 10.5px;
    font-weight: 800;
  }

  .device-company {
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.3;
  }

  .device-empty {
    grid-column: 1 / -1;
    padding: 16px;
    border: 1px dashed #cbd5e1;
    border-radius: 12px;
    background: #f8fafc;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  .device-empty.error {
    color: #b91c1c;
    border-color: #fecaca;
    background: #fef2f2;
  }

  .device-empty {
    padding: 12px;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  .device-empty.error {
    color: #b91c1c;
  }

  .summary-card,
  .panel-card,
  .results-card,
  .loading-card,
  .empty-card {
    background: white;
    border: 1px solid #d9e2ec;
    border-radius: 14px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
  }

  .summary-card {
    padding: 16px 18px;
  }

  .summary-card span {
    display: block;
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .summary-card strong {
    display: block;
    margin-top: 10px;
    font-size: 30px;
    line-height: 1;
    font-weight: 900;
  }

  .summary-card small {
    display: block;
    margin-top: 8px;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .control-layout {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 16px;
    align-items: start;
    margin-bottom: 16px;
  }

  .side-stack {
    display: grid;
    gap: 16px;
  }

  .panel-card {
    padding: 16px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 14px;
  }

  .panel-header.compact {
    align-items: center;
  }

  .step-chip {
    display: inline-flex;
    width: fit-content;
    padding: 5px 10px;
    border-radius: 999px;
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .panel-header h2,
  .results-header h2 {
    margin: 8px 0 4px;
    font-size: 20px;
    font-weight: 900;
  }

  .panel-header p,
  .results-header p {
    margin: 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
  }

  .soft-badge {
    display: inline-flex;
    padding: 7px 10px;
    border-radius: 999px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e3a8a;
    font-size: 12px;
    font-weight: 900;
    white-space: nowrap;
  }

  .select-all-box {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 12px;
    border-radius: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    margin-bottom: 12px;
  }

  .select-all-box label,
  .vessel-item,
  .column-grid label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 800;
  }

  .select-all-box small {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #2563eb;
  }

  .search-input,
  .date-grid input {
    width: 100%;
    height: 40px;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 0 12px;
    font-size: 13px;
    background: white;
  }

  .search-input {
    margin-bottom: 12px;
  }

  .vessel-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
    max-height: 410px;
    overflow: auto;
    padding-right: 4px;
  }

  .vessel-item {
    min-height: 42px;
    padding: 0 10px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: white;
    cursor: pointer;
  }

  .vessel-item.active {
    background: #eff6ff;
    border-color: #93c5fd;
    color: #1e3a8a;
  }

  .range-box {
    padding: 14px;
    border-radius: 12px;
    border: 1px solid #dbeafe;
    background: #eff6ff;
    margin-bottom: 12px;
  }

  .range-box-head,
  .selected-range-item {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }

  .range-box-head small,
  .selected-range-item small {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  .date-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }

  .date-grid span {
    display: block;
    margin-bottom: 6px;
    color: #475569;
    font-size: 12px;
    font-weight: 900;
  }

  .preset-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 12px;
  }

  .preset-row button,
  .primary-wide-btn,
  .load-report-btn,
  .open-btn,
  .column-actions button {
    border: none;
    cursor: pointer;
    font-weight: 900;
  }

  .preset-row button {
    min-height: 34px;
    border-radius: 9px;
    background: white;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 11px;
  }

  .preset-row button.active {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }

  .primary-wide-btn,
  .load-report-btn {
    width: 100%;
    height: 40px;
    margin-top: 12px;
    border-radius: 10px;
    background: #2563eb;
    color: white;
    font-size: 13px;
  }

  .selected-range-list {
    display: grid;
    gap: 9px;
    max-height: 230px;
    overflow: auto;
    padding-right: 4px;
  }

  .selected-range-item {
    padding: 11px 12px;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    background: white;
  }

  .selected-range-item strong {
    display: block;
    font-size: 13px;
  }

  .selected-range-item span {
    font-size: 11px;
    color: #64748b;
    font-weight: 700;
    text-align: right;
  }

  .range-empty {
    padding: 14px;
    border-radius: 10px;
    border: 1px dashed #cbd5e1;
    color: #64748b;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
  }

  .open-btn {
    min-width: 78px;
    height: 36px;
    border-radius: 9px;
    background: #2563eb;
    color: white;
  }

  .column-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .column-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .column-actions button {
    height: 32px;
    border-radius: 8px;
    padding: 0 10px;
    background: white;
    border: 1px solid #cbd5e1;
    color: #334155;
    font-size: 12px;
  }

  .column-groups {
    display: grid;
    gap: 12px;
    margin-top: 12px;
  }

  .column-group {
    padding: 12px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    background: white;
  }

  .column-group-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .column-group-head span {
    font-size: 13px;
    font-weight: 900;
  }

  .column-group-head small {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  .column-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
    gap: 8px;
  }

  .column-grid.compact {
    grid-template-columns: repeat(auto-fill, minmax(125px, 1fr));
  }

  .column-grid label {
    min-height: 38px;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    font-size: 11px;
    cursor: pointer;
  }

  .column-grid label.active {
    background: #eff6ff;
    border-color: #93c5fd;
    color: #1e3a8a;
  }

  .results-card,
  .loading-card,
  .empty-card {
    padding: 16px;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: flex-start;
    padding-bottom: 14px;
    border-bottom: 1px solid #e5e7eb;
  }

  .result-badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .result-badges span {
    display: inline-flex;
    padding: 7px 10px;
    border-radius: 999px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e3a8a;
    font-size: 12px;
    font-weight: 900;
  }

  .scroll-note {
    display: inline-flex;
    margin: 14px 0 10px;
    padding: 6px 10px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  .table-container {
    overflow: auto;
    border: 1px solid #dbe3ef;
    border-radius: 14px;
    max-height: 70vh;
  }

  table {
    width: 100%;
    min-width: 1250px;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
  }

  th,
  td {
    padding: 10px 11px;
    border-right: 1px solid #dbe4ef;
    border-bottom: 1px solid #dbe4ef;
    text-align: center;
    white-space: nowrap;
    background: white;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 5;
    background: #0f172a;
    color: white;
    font-weight: 900;
    text-transform: uppercase;
    font-size: 11px;
  }

  th.runtime-head { background: #1e3a8a; }
  th.fuel-head { background: #065f46; }
  th.total-head { background: #7c2d12; }
  th.utc-head { background: #334155; }

  tbody tr:nth-child(even) td {
    background: #f8fafc;
  }

  tbody tr:hover td {
    background: #eef6ff;
  }

  .sticky-left {
    position: sticky;
    left: 0;
    z-index: 6;
  }

  th.sticky-left {
    z-index: 10;
    background: #111827;
  }

  .vessel-cell {
    min-width: 210px;
    text-align: left;
  }

  .vessel-cell strong {
    display: block;
    font-size: 13px;
    font-weight: 900;
  }

  .vessel-cell small {
    display: block;
    margin-top: 3px;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    white-space: normal;
  }

  .runtime-cell span {
    color: #1e3a8a;
    font-weight: 900;
  }

  .fuel-cell span {
    color: #065f46;
    font-weight: 900;
  }

  .total-cell {
    background: #fff7ed !important;
    color: #9a3412;
    font-weight: 900;
  }

  .utc-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }

  .utc-auto {
    padding: 4px 9px;
    border-radius: 999px;
    background: #eff6ff;
    color: #1d4ed8;
    font-weight: 900;
  }

  .utc-zone {
    padding: 5px 9px;
    border-radius: 8px;
    border: 1px solid #dbe4ef;
    background: #f8fafc;
    font-weight: 800;
  }

  .loading-card,
  .empty-card {
    display: grid;
    place-items: center;
    gap: 10px;
    text-align: center;
    min-height: 180px;
  }

  .spinner {
    width: 36px;
    height: 36px;
    border: 4px solid #dbeafe;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .progress-track {
    width: min(420px, 90%);
    height: 10px;
    border-radius: 999px;
    background: #e2e8f0;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: #2563eb;
  }

  @media (max-width: 1100px) {
    .summary-cards,
    .control-layout {
      grid-template-columns: 1fr;
    }

    .vessel-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .avs-header,
    .results-header {
      flex-direction: column;
    }
  }

  @media (max-width: 700px) {
    .avs-page {
      padding: 14px 12px 36px;
    }

    .vessel-list,
    .date-grid,
    .preset-row {
      grid-template-columns: 1fr;
    }

    .column-toolbar,
    .select-all-box {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>