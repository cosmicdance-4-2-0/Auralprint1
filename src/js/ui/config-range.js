// Editing-only CONFIG grid. Preset sanitation deliberately does not use this:
// existing Scenes and shipped defaults retain their historical precision.
const models = new WeakMap();
// A 15-significant-digit native range serialization can lose a few dozen
// binary64 epsilons before subtraction/division reconstructs the grid index.
// This relative allowance is for integer-index membership, not value rounding;
// exact bounds below still take precedence. Current sliders reach index 5999.
const GRID_INDEX_ROUNDOFF_FACTOR = 64;
const indexTolerance = index => GRID_INDEX_ROUNDOFF_FACTOR * Number.EPSILON * Math.max(1, Math.abs(index));
const nearIndex = index => Math.abs(index - Math.round(index)) <= indexTolerance(index);

// Clean cancellation residue only for simple decimal UI grids. Ten places is a
// conservative cleanup ceiling, not persisted precision: finer/high-precision
// steps (including pi-derived angles) retain the binary64 index calculation.
const MAX_SIMPLE_DECIMAL_PLACES = 10;
function decimalPlaces(value) {
  const [coefficient, exponent = "0"] = String(value).split("e");
  return Math.max(0, (coefficient.split(".")[1] || "").length - Number(exponent));
}

function lastGridIndex({ min, max, step }) {
  const index = (max - min) / step;
  return nearIndex(index) ? Math.round(index) : Math.floor(index);
}
function gridValue(limit, index) {
  const last = lastGridIndex(limit);
  index = Math.max(0, Math.min(last, index));
  const raw = limit.min + index * limit.step;
  // Decimal CONFIG steps should serialize without cancellation residue. Radian
  // steps retain binary64 index multiplication, including the exact TAU endpoint.
  const places = Math.max(decimalPlaces(limit.min), decimalPlaces(limit.step));
  const value = places <= MAX_SIMPLE_DECIMAL_PLACES ? Number(raw.toFixed(places)) : raw;
  return index === last && nearIndex((limit.max - limit.min) / limit.step) ? limit.max : value;
}
function isOnConfigGrid(value, limit) {
  return Number.isFinite(value) && value >= limit.min && value <= limit.max
    && nearIndex((value - limit.min) / limit.step);
}
function selectConfigGrid(value, limit, bounds = {}) {
  if (!Number.isFinite(value)) return null;
  const low = Math.max(limit.min, bounds.min ?? limit.min), high = Math.min(limit.max, bounds.max ?? limit.max);
  const lowIndex = (low - limit.min) / limit.step, highIndex = (high - limit.min) / limit.step;
  let first = Math.max(0, nearIndex(lowIndex) ? Math.round(lowIndex) : Math.ceil(lowIndex));
  let last = Math.min(lastGridIndex(limit), nearIndex(highIndex) ? Math.round(highIndex) : Math.floor(highIndex));
  // Membership tolerance must not relax exact legacy dependency boundaries:
  // even a one-ULP crossing could make historical normalization change a peer.
  if (gridValue(limit, first) < low) first++;
  if (gridValue(limit, last) > high) last--;
  if (first > last) return null;
  return gridValue(limit, Math.max(first, Math.min(last, Math.round((value - limit.min) / limit.step))));
}
function bindConfigRange(control, limit, scale = 1) {
  // Angular controls use degrees natively: HTML decimal arithmetic otherwise puts
  // 360 * String(oneDegreeInRadians) just beyond String(TAU) in Chromium.
  // This unit conversion derives all three attributes from CONFIG unchanged.
  control.min = String(limit.min * scale); control.max = String(limit.max * scale); control.step = String(limit.step * scale);
  models.set(control, { limit, scale, canonical: null });
  control.addEventListener('keydown', event => {
    if (control.disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!direction) return;
    const model = models.get(control), value = model.canonical ?? Number(control.value) / scale;
    if (!Number.isFinite(value)) return;
    event.preventDefault();
    const index = (value - limit.min) / limit.step;
    const nextIndex = nearIndex(index) ? Math.round(index) + direction : direction > 0 ? Math.ceil(index) : Math.floor(index);
    const next = gridValue(limit, nextIndex);
    if (next === value) return;
    control.value = String(next * scale);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function readConfigRange(control, bounds) {
  if (control.disabled || control.value === '') return null;
  const model = models.get(control);
  // Validate at the editing owner too: HTML attributes alone are insufficient.
  const value = selectConfigGrid(Number(control.value) / model.scale, model.limit, bounds);
  if (value !== null) { model.canonical = value; control.value = String(value * model.scale); }
  return value;
}
function syncConfigRange(control, output, canonical, format = String) {
  const model = models.get(control);
  // Mixed Bulk fields have no canonical value. Interpret their existing native
  // selection in the binding's units, without treating degrees as radians.
  canonical ??= selectConfigGrid(Number(control.value) / model.scale, model.limit);
  const selection = selectConfigGrid(canonical, model.limit);
  model.canonical = canonical;
  control.value = String(selection * model.scale);
  const text = canonical === selection ? format(canonical)
    : `Current ${format(canonical)}; slider selection ${format(selection)} (edit to apply)`;
  output.textContent = text;
  output.setAttribute('data-config-range-discrepancy', String(canonical !== selection));
  control.setAttribute('aria-valuetext', text);
  return selection;
}

export { bindConfigRange, readConfigRange, syncConfigRange, isOnConfigGrid, selectConfigGrid, gridValue, lastGridIndex };
