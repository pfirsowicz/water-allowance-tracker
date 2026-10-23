"use strict";

const API_BASE_URL = "";
const DEFAULT_SETTINGS = {
  baselineDate: "2026-01-01",
  baselineReading: 100000,
  dailyAllowance: 800,
};

const state = {
  readings: [],
  editingId: null,
  settingsPersisted: false,
};

const $ = (id) => document.getElementById(id);

function fmtLitres(value) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString()} L`;
}

function fmtSignedLitres(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString()} L`;
}

function showMessage(id, message) {
  const box = $(id);
  box.textContent = message;
  box.classList.toggle("visible", Boolean(message));
}

function clearMessages() {
  showMessage("errBox", "");
  showMessage("successBox", "");
}

function showError(message) {
  showMessage("successBox", "");
  showMessage("errBox", message);
}

function showSuccess(message) {
  showMessage("errBox", "");
  showMessage("successBox", message);
}

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (HTTP ${response.status})`);
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function setBadge(kind, text) {
  const badge = $("statusBadge");
  badge.className = `badge${kind ? ` ${kind}` : ""}`;
  badge.textContent = text;
}

function setProgress(used, allowed) {
  const fill = $("barFill");
  const label = $("barPct");
  if (!Number.isFinite(used) || !Number.isFinite(allowed) || allowed <= 0) {
    fill.style.width = "0%";
    fill.classList.remove("bad");
    label.textContent = "—";
    return;
  }

  const percent = (used / allowed) * 100;
  fill.style.width = `${Math.max(0, Math.min(100, percent)).toFixed(1)}%`;
  fill.classList.toggle("bad", percent > 100);
  label.textContent = `${percent.toFixed(1)}%`;
}

function resetSummary() {
  $("statusText").textContent = "Enter a reading";
  $("remainingOut").textContent = "—";
  $("bufferOut").textContent = "—";
  $("dailyOut").textContent = "—";
  $("limitOut").textContent = "—";
  $("usedAllowedOut").textContent = "—";
  $("daysOut").textContent = "—";
  setBadge("", "—");
  setProgress(NaN, NaN);
}

function readCalculatorInputs() {
  return {
    initialReading: Number($("initialReading").value),
    initialDate: $("initialDate").value,
    dailyLimit: Number($("dailyLimit").value),
    currentDate: $("currentDate").value,
    currentReading: Number($("currentReading").value),
  };
}

function calculate({ reportError = false } = {}) {
  if ($("currentReading").value.trim() === "") {
    resetSummary();
    return null;
  }

  try {
    const result = WaterCalc.calculateAllowance(readCalculatorInputs());
    $("remainingOut").textContent = fmtSignedLitres(result.remaining);
    $("dailyOut").textContent = fmtLitres(result.dailyUsage);
    $("limitOut").textContent = `of ${Number($("dailyLimit").value).toLocaleString()} L/day`;
    $("usedAllowedOut").textContent = `${fmtLitres(result.used)} / ${fmtLitres(result.allowed)}`;
    $("daysOut").textContent = `${result.daysElapsed.toLocaleString()} calendar day${result.daysElapsed === 1 ? "" : "s"}`;

    const absBufferDays = Math.abs(result.bufferDays);
    if (result.remaining >= 0) {
      $("bufferOut").textContent = `${absBufferDays.toFixed(1)} allowance days ahead`;
    } else {
      $("bufferOut").textContent = `${absBufferDays.toFixed(1)} allowance days over`;
    }

    if (result.status === "exceeded") {
      $("statusText").textContent = "Exceeded allowance";
      setBadge("bad", "EXCEEDED");
    } else if (result.status === "near") {
      $("statusText").textContent = "Close to allowance";
      setBadge("warn", "NEAR LIMIT");
    } else {
      $("statusText").textContent = "Within allowance";
      setBadge("good", "OK");
    }
    setProgress(result.used, result.allowed);
    if (reportError) showMessage("errBox", "");
    return result;
  } catch (err) {
    resetSummary();
    if (reportError) showError(err.message);
    return null;
  }
}

function updateSettingsSummary() {
  const daily = Number($("dailyLimit").value);
  $("settingsSummary").textContent = Number.isFinite(daily) && daily > 0
    ? `${daily.toLocaleString()} L/day`
    : "Needs configuration";
}

async function loadSettings() {
  let settings = DEFAULT_SETTINGS;
  let loadError = null;
  try {
    const data = await apiJson("/api/settings");
    settings = data.settings || DEFAULT_SETTINGS;
    state.settingsPersisted = settings.persisted === true;
  } catch (err) {
    state.settingsPersisted = false;
    loadError = err;
  }

  $("initialDate").value = WaterCalc.isoToDDMMYYYY(settings.baselineDate || DEFAULT_SETTINGS.baselineDate);
  $("initialReading").value = settings.baselineReading ?? DEFAULT_SETTINGS.baselineReading;
  $("dailyLimit").value = settings.dailyAllowance ?? DEFAULT_SETTINGS.dailyAllowance;
  updateSettingsSummary();

  if (loadError) {
    $("settingsMeta").textContent = `Could not load saved settings; using defaults. ${loadError.message}`;
  } else if (!state.settingsPersisted) {
    $("settingsMeta").textContent = "Settings are using fallback defaults until the v4 database migration is applied and settings are saved.";
  } else {
    $("settingsMeta").textContent = settings.updatedAt ? `Last updated ${settings.updatedAt}.` : "Settings stored in MySQL.";
  }
}

async function saveSettings() {
  clearMessages();
  const baselineDate = WaterCalc.ddmmyyyyToIso($("initialDate").value);
  if (!baselineDate) return showError("Baseline date must be a valid dd/mm/yyyy date.");

  const baselineReading = Number($("initialReading").value);
  const dailyAllowance = Number($("dailyLimit").value);
  if (!Number.isSafeInteger(baselineReading) || baselineReading < 0) {
    return showError("Baseline reading must be a non-negative whole number.");
  }
  if (!Number.isSafeInteger(dailyAllowance) || dailyAllowance <= 0) {
    return showError("Daily allowance must be a whole number greater than zero.");
  }

  try {
    const data = await apiJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ baselineDate, baselineReading, dailyAllowance }),
    });
    state.settingsPersisted = true;
    $("settingsMeta").textContent = data.settings?.updatedAt
      ? `Last updated ${data.settings.updatedAt}.`
      : "Settings stored in MySQL.";
    updateSettingsSummary();
    calculate();
    showSuccess("Allowance settings saved.");
  } catch (err) {
    showError(err.message);
  }
}

function setEditMode(reading = null) {
  state.editingId = reading?.id ?? null;
  const editing = Boolean(reading);
  $("saveBtn").textContent = editing ? "Update reading" : "Save reading";
  $("cancelEditBtn").classList.toggle("hidden", !editing);
  $("entryModeText").textContent = editing
    ? `Editing recorded reading #${reading.id}.`
    : "Enter the reading shown on the meter.";
}

function clearEntry({ keepDate = false } = {}) {
  setEditMode(null);
  $("currentReading").value = "";
  if (!keepDate) $("currentDate").value = WaterCalc.toDDMMYYYY(new Date());
  resetSummary();
}

function editReading(reading) {
  clearMessages();
  setEditMode(reading);
  $("currentDate").value = WaterCalc.isoToDDMMYYYY(reading.readingDate);
  $("currentReading").value = reading.reading;
  calculate();
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("currentReading").focus();
}

async function deleteReading(reading) {
  const confirmed = window.confirm(
    `Delete ${Number(reading.reading).toLocaleString()} L recorded on ${WaterCalc.isoToDDMMYYYY(reading.readingDate)}?`
  );
  if (!confirmed) return;

  clearMessages();
  try {
    await apiJson(`/api/readings/${reading.id}`, { method: "DELETE" });
    if (state.editingId === reading.id) clearEntry({ keepDate: true });
    await loadReadings();
    showSuccess("Reading deleted.");
  } catch (err) {
    showError(err.message);
  }
}

function appendCell(row, text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  row.appendChild(td);
  return td;
}

function renderReadings() {
  const body = $("readingsBody");
  body.replaceChildren();

  if (state.readings.length === 0) {
    const row = document.createElement("tr");
    const cell = appendCell(row, "No readings recorded yet.", "muted");
    cell.colSpan = 6;
    body.appendChild(row);
    $("readingsMeta").textContent = "No readings recorded.";
    return;
  }

  state.readings.forEach((reading, index) => {
    const older = state.readings[index + 1] || null;
    let delta = "—";
    let avg = "—";

    if (older) {
      const newerDate = WaterCalc.parseDDMMYYYY(WaterCalc.isoToDDMMYYYY(reading.readingDate));
      const olderDate = WaterCalc.parseDDMMYYYY(WaterCalc.isoToDDMMYYYY(older.readingDate));
      const days = WaterCalc.daysBetweenUTC(olderDate, newerDate);
      const used = Number(reading.reading) - Number(older.reading);
      delta = fmtSignedLitres(used);
      if (days > 0) avg = `${Math.round(used / days).toLocaleString()} L/day`;
    }

    const row = document.createElement("tr");
    appendCell(row, WaterCalc.isoToDDMMYYYY(reading.readingDate), "mono");
    appendCell(row, `${Number(reading.reading).toLocaleString()} L`, "mono right");
    appendCell(row, delta, "mono right");
    appendCell(row, avg, "mono right");
    const savedAt = reading.createdAtEpoch
      ? new Date(reading.createdAtEpoch * 1000).toLocaleString("en-NZ", { dateStyle: "short", timeStyle: "short" })
      : `${reading.date} ${reading.time}`;
    appendCell(row, savedAt, "mono saved-at");

    const actions = appendCell(row, "", "row-actions");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary table-btn";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editReading(reading));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger table-btn";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteReading(reading));

    actions.append(edit, del);
    body.appendChild(row);
  });

  $("readingsMeta").textContent = `Showing ${state.readings.length} most recent reading${state.readings.length === 1 ? "" : "s"}.`;
}

async function loadReadings() {
  $("readingsMeta").textContent = "Loading…";
  try {
    const data = await apiJson("/api/readings?limit=200");
    state.readings = Array.isArray(data.items) ? data.items : [];
    renderReadings();
  } catch (err) {
    state.readings = [];
    $("readingsBody").innerHTML = '<tr><td colspan="6" class="muted">Failed to load readings.</td></tr>';
    $("readingsMeta").textContent = err.message;
  }
}

async function saveCurrentReading() {
  clearMessages();
  const result = calculate({ reportError: true });
  if (!result) return;

  const readingDate = WaterCalc.ddmmyyyyToIso($("currentDate").value);
  const reading = Number($("currentReading").value);
  const editing = state.editingId !== null;

  try {
    const data = await apiJson(
      editing ? `/api/readings/${state.editingId}` : "/api/readings",
      {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ readingDate, reading }),
      }
    );

    await loadReadings();
    setEditMode(null);
    if (data.item) {
      $("currentDate").value = WaterCalc.isoToDDMMYYYY(data.item.readingDate);
      $("currentReading").value = data.item.reading;
      calculate();
    }
    showSuccess(editing ? "Reading updated." : "Reading saved.");
  } catch (err) {
    showError(err.message);
  }
}

async function exportCsv() {
  clearMessages();
  try {
    const response = await fetch(`${API_BASE_URL}/api/readings/export.csv`, { credentials: "same-origin" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Export failed (HTTP ${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "water-readings.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError(err.message);
  }
}

function bindEvents() {
  ["initialReading", "dailyLimit", "initialDate", "currentDate", "currentReading"].forEach((id) => {
    $(id).addEventListener("input", () => {
      if (id === "dailyLimit") updateSettingsSummary();
      calculate();
    });
    $(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (id === "currentDate" || id === "currentReading")) {
        saveCurrentReading();
      }
    });
  });

  $("saveBtn").addEventListener("click", saveCurrentReading);
  $("resetBtn").addEventListener("click", () => {
    clearMessages();
    clearEntry();
  });
  $("cancelEditBtn").addEventListener("click", () => {
    clearMessages();
    clearEntry({ keepDate: true });
  });
  $("saveSettingsBtn").addEventListener("click", saveSettings);
  $("reloadReadingsBtn").addEventListener("click", loadReadings);
  $("exportBtn").addEventListener("click", exportCsv);
}

(async function init() {
  $("currentDate").value = WaterCalc.toDDMMYYYY(new Date());
  bindEvents();
  resetSummary();
  await loadSettings();
  await loadReadings();
})();
