import { BAND_NAMES, sanitizeOrbBandIds } from "../core/preferences.js";

// Build 115 feature: expose existing bandIds without changing the preset schema.
// UI state stays in the component; selection commits use the canonical orb path.
// Lists are bounded by the configured band count and refreshed only on UI/config events.
function parseBandSelection(text, count = BAND_NAMES.length) {
  if (!text.trim()) return { ids: [], error: "" };
  const tokens = text.trim().split(/[,;\s]+/);
  if (tokens.some(token => !/^\d+$/.test(token) || Number(token) >= count)) {
    return { ids: null, error: `Use whole band indices from 0 to ${count - 1}, separated by commas. Leave blank for full spectrum.` };
  }
  // Convert only human-entered digit tokens after the explicit validation above.
  return { ids: sanitizeOrbBandIds(tokens.map(Number)), error: "" };
}

function bandRangeSelection(start, end, count = BAND_NAMES.length) {
  if (!/^\d+$/.test(String(start)) || !/^\d+$/.test(String(end))) return null;
  const first = Number(start), last = Number(end);
  if (first > last || first < 0 || last >= count) return null;
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function matchingBandIndices(query, names = BAND_NAMES) {
  const search = query.trim().toLocaleLowerCase();
  return names.reduce((matches, name, index) => {
    if (!search || name.toLocaleLowerCase().includes(search) || String(index).includes(search)) matches.push(index);
    return matches;
  }, []);
}

function createOrbBandPicker(container, { orbLabel, onChange, formatRange, describeBank }) {
  if (!container) return null;
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const summary = make("p", "band-selection-summary");
  summary.setAttribute("role", "status");
  const actions = make("div", "panel-actions");
  const full = make("button", "", "Full spectrum");
  full.type = "button";
  full.setAttribute("aria-label", `${orbLabel}: use full spectrum`);
  actions.appendChild(full);
  const details = make("details", "band-chooser");
  details.appendChild(make("summary", "", "Choose frequency bands"));
  const bank = make("p", "panel-description");
  const help = make("p", "panel-description", "Selected bands use the combined spectrum. Channel controls the waveform. With no explicit targets, the orb uses its channel’s full-spectrum energy.");
  const searchLabel = make("label", "picker-search", "Find a band");
  const search = make("input");
  search.type = "search";
  search.placeholder = "Name or index";
  search.setAttribute("aria-label", `${orbLabel}: find a band`);
  searchLabel.appendChild(search);
  const range = make("div", "picker-range");
  const first = make("input"), last = make("input");
  for (const [input, text] of [[first, "From"], [last, "To"]]) {
    input.type = "number";
    input.min = "0";
    input.max = String(BAND_NAMES.length - 1);
    input.step = "1";
    input.setAttribute("aria-label", `${orbLabel}: ${text.toLowerCase()} band index`);
    const label = make("label", "", text);
    label.appendChild(input);
    range.appendChild(label);
  }
  const apply = make("button", "", "Use range");
  apply.type = "button";
  range.appendChild(apply);
  const error = make("p", "picker-error");
  error.setAttribute("role", "alert");
  const resultCount = make("p", "panel-description");
  resultCount.setAttribute("role", "status");
  const list = make("div", "picker-results");
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", `${orbLabel} band targets`);
  for (const el of [bank, help, range, error, searchLabel, resultCount, list]) details.appendChild(el);
  for (const el of [summary, actions, details]) container.appendChild(el);
  let selected = [];
  const rows = [];

  function filterRows() {
    const matches = new Set(matchingBandIndices(search.value));
    for (const row of rows) row.label.hidden = !matches.has(row.index);
    resultCount.textContent = matches.size ? `${matches.size} band${matches.size === 1 ? "" : "s"} shown` : "No matching bands. Try a name or index.";
  }

  function refreshRows() {
    if (!details.open) return;
    if (!rows.length) {
      for (let index = 0; index < BAND_NAMES.length; index++) {
        const label = make("label", "picker-band");
        const check = make("input");
        check.type = "checkbox";
        check.setAttribute("aria-label", `${orbLabel}: band ${index}, ${BAND_NAMES[index]}`);
        const name = make("span", "picker-band-name", `${index} · ${BAND_NAMES[index]}`);
        const frequency = make("span", "picker-frequency");
        label.appendChild(check); label.appendChild(name); label.appendChild(frequency);
        list.appendChild(label);
        rows.push({ index, label, check, frequency });
        check.addEventListener("change", () => {
          const next = new Set(selected);
          if (check.checked) next.add(index); else next.delete(index);
          commit([...next].sort((a, b) => a - b));
        });
      }
    }
    const selection = new Set(selected);
    for (const row of rows) {
      row.check.checked = selection.has(row.index);
      row.frequency.textContent = formatRange(row.index);
    }
    bank.textContent = describeBank();
    filterRows();
  }

  function sync(ids) {
    selected = [...ids];
    summary.textContent = selected.length
      ? `${selected.length} target${selected.length === 1 ? "" : "s"}: ${selected.map(index => BAND_NAMES[index]).join(", ")}`
      : "Full spectrum · channel energy";
    full.setAttribute("aria-pressed", selected.length ? "false" : "true");
    // Preserve range drafts while typing. Sparse subsets must not look like a range.
    if (document.activeElement !== first && document.activeElement !== last) {
      const sorted = [...selected].sort((a, b) => a - b);
      const contiguous = sorted.length && sorted[sorted.length - 1] - sorted[0] + 1 === sorted.length;
      first.value = contiguous ? String(sorted[0]) : "";
      last.value = contiguous ? String(sorted[sorted.length - 1]) : "";
    }
    refreshRows();
  }

  function commit(ids) {
    error.textContent = "";
    first.setAttribute("aria-invalid", "false"); last.setAttribute("aria-invalid", "false");
    onChange(ids);
    sync(ids);
  }
  full.addEventListener("click", () => commit([]));
  apply.addEventListener("click", () => {
    const ids = bandRangeSelection(first.value, last.value);
    if (!ids) {
      error.textContent = `Enter a range from 0 to ${BAND_NAMES.length - 1}, with From no greater than To. Your targets have not changed.`;
      first.setAttribute("aria-invalid", "true"); last.setAttribute("aria-invalid", "true");
      return;
    }
    commit(ids);
  });
  search.addEventListener("input", filterRows);
  details.addEventListener("toggle", refreshRows);
  return { sync };
}

export { createOrbBandPicker, parseBandSelection, bandRangeSelection, matchingBandIndices };
