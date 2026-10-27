import { CONFIG } from "../core/config.js";
import { hexToRgb01, rgb01ToCss } from "../core/utils.js";
import { runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { Spaces } from "../core/spaces.js";
import { ColorPolicy } from "./color-policy.js";

// Lazy, fixed-capacity scratch holds only projected numbers, never particles or
// retained history. One projection pass counts the actual drawable segments so
// missing points do not consume fade length. Combined features share this pass.
let scratch = null;
function getScratch() {
  if (!scratch) {
    const capacity = Math.ceil(CONFIG.limits.trace.numLines.max) + 1;
    scratch = { x: new Float64Array(capacity), y: new Float64Array(capacity),
      r: new Float64Array(capacity), g: new Float64Array(capacity), b: new Float64Array(capacity) };
  }
  return scratch;
}
const mixed = { r: 0, g: 0, b: 0 };
function mixedCss(points, index, background, amount, alpha) {
  mixed.r = background.r + (points.r[index] - background.r) * amount;
  mixed.g = background.g + (points.g[index] - background.g) * amount;
  mixed.b = background.b + (points.b[index] - background.b) * amount;
  return rgb01ToCss(mixed, alpha);
}

function drawSegmentedTrace(ctx, particles, dominantBandIndex, trace, quota) {
  const points = getScratch();
  const count = Math.min(particles.length, Math.ceil(trace.numLines) + 1);
  const birth = trace.lineColorMode === "particleBirth";
  const fixed = ColorPolicy.pickLineColorRgb01(particles, dominantBandIndex, birth ? "fixed" : trace.lineColorMode);
  let length = 0, drawable = 0, previousValid = false;
  for (const particle of particles.suffix(count)) {
    const p = Spaces.simToScreen(particle?.xSim, particle?.ySim);
    const valid = !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
    points.x[length] = valid ? p.x : NaN;
    points.y[length] = valid ? p.y : NaN;
    // Chronological older/start endpoint owns each segment's birth color. A gap
    // breaks adjacency: no historical particle is bridged or re-colored.
    const rgb = birth && particle?.rgbStart && Number.isFinite(particle.rgbStart.r) &&
      Number.isFinite(particle.rgbStart.g) && Number.isFinite(particle.rgbStart.b) ? particle.rgbStart : fixed;
    points.r[length] = rgb.r; points.g[length] = rgb.g; points.b[length] = rgb.b;
    if (valid && previousValid) drawable++;
    previousValid = valid;
    length++;
  }
  if (!drawable) return 0;
  let fadeCount = trace.fadeEnabled ? Math.min(drawable, trace.fadeSegments) : 0;
  const demand = birth ? drawable : fadeCount;
  const groups = Math.min(demand, Math.max(0, Math.floor(quota)));
  // Keep the exact fade/solid boundary even when birth colors are coalesced.
  // One available birth-color group cannot express both portions; in that case
  // omit fading rather than extending its ramp into the solid visible Trace.
  if (birth && groups === 1 && fadeCount < drawable) fadeCount = 0;
  const fadeGroups = birth && fadeCount > 0 && fadeCount < drawable
    ? Math.min(fadeCount, Math.max(1, Math.floor(groups * fadeCount / drawable))) : groups;
  const solidGroups = groups - fadeGroups;
  const bg = fadeCount && groups ? hexToRgb01(runtime.settings.visuals.backgroundColor) : fixed;
  let segmentIndex = 0, currentGroup = -1, groupStart = 0, groupEnd = 0, colorIndex = 0;
  let startIndex = 0, endIndex = 0, strokes = 0;
  const amount = ordinal => fadeCount ? Math.min(1, ordinal / fadeCount) : 1;
  const validPoint = index => index >= 0 && index < length && Number.isFinite(points.x[index]);
  function clipJoin(index, after) {
    if (!validPoint(index - 1) || !validPoint(index + 1)) return;
    const x = points.x[index], y = points.y[index];
    const ax = x - points.x[index - 1], ay = y - points.y[index - 1];
    const bx = points.x[index + 1] - x, by = points.y[index + 1] - y;
    const a = Math.hypot(ax, ay), b = Math.hypot(bx, by);
    if (!a || !b) return;
    const nx = ax / a + bx / b, ny = ay / a + by / b;
    // An exact reversal has no unique bisector; preserve its natural overlap.
    if (!nx && !ny) return;
    const angle = Math.atan2(ny, nx) + (after ? Math.PI / 2 : -Math.PI / 2);
    ctx.beginPath();
    ctx.rect(0, 0, state.widthPx, state.heightPx);
    ctx.moveTo(x + ctx.lineWidth * Math.cos(angle), y + ctx.lineWidth * Math.sin(angle));
    ctx.arc(x, y, ctx.lineWidth, angle, angle + Math.PI);
    ctx.closePath();
    // Remove the unwanted half of this join neighborhood, leaving all distant
    // geometry intact. Sequential clips make overlapping neighborhoods intersect.
    ctx.clip("evenodd");
  }
  let extensionX = 0, extensionY = 0;
  function extension(from, toward) {
    const x = points.x[from], y = points.y[from];
    const dx = points.x[toward] - x, dy = points.y[toward] - y;
    const distance = Math.hypot(dx, dy);
    const t = distance ? Math.min(1, ctx.lineWidth / (2 * distance)) : 0;
    extensionX = x + dx * t;
    extensionY = y + dy * t;
  }
  function finishGroup() {
    if (currentGroup === -1) return;
    const startX = points.x[startIndex], startY = points.y[startIndex];
    const endX = points.x[endIndex], endY = points.y[endIndex];
    // A depleted budget uses one stable, full-geometry path. Birth mode samples
    // the first drawable segment's stored color. It never reads current audio.
    const faded = groups > 0 && groupStart < fadeCount;
    ctx.save();
    clipJoin(startIndex, true);
    clipJoin(endIndex, false);
    ctx.beginPath();
    if (validPoint(startIndex - 1)) {
      extension(startIndex, startIndex - 1);
      ctx.moveTo(extensionX, extensionY);
      ctx.lineTo(startX, startY);
    } else ctx.moveTo(startX, startY);
    let connected = true;
    for (let i = startIndex + 1; i <= endIndex; i++) {
      if (!validPoint(i)) { connected = false; continue; }
      if (connected) ctx.lineTo(points.x[i], points.y[i]);
      else { ctx.moveTo(points.x[i], points.y[i]); connected = true; }
    }
    if (validPoint(endIndex + 1)) {
      extension(endIndex, endIndex + 1);
      ctx.lineTo(extensionX, extensionY);
    }
    if (faded && (startX !== endX || startY !== endY)) {
      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      gradient.addColorStop(0, mixedCss(points, colorIndex, bg, amount(groupStart), trace.lineAlpha));
      gradient.addColorStop(1, mixedCss(points, colorIndex, bg, amount(groupEnd), trace.lineAlpha));
      ctx.strokeStyle = gradient;
    } else {
      ctx.strokeStyle = mixedCss(points, colorIndex, bg, faded ? amount(groupEnd) : 1, trace.lineAlpha);
    }
    ctx.stroke();
    ctx.restore();
    if (currentGroup >= 0) strokes++;
  }
  // A local angle-bisector partition shares round-join coverage between adjacent
  // paths instead of drawing their alpha twice. Each group adds at most two small
  // clips and two half-width neighbor extensions; no offscreen surface is used.
  for (let i = 1; i < length; i++) {
    if (!validPoint(i - 1) || !validPoint(i)) continue;
    let group;
    if (!groups) group = -2;
    else if (birth && fadeCount > 0 && fadeCount < drawable) {
      group = segmentIndex < fadeCount
        ? Math.min(fadeGroups - 1, Math.floor(segmentIndex * fadeGroups / fadeCount))
        : fadeGroups + Math.min(solidGroups - 1, Math.floor((segmentIndex - fadeCount) * solidGroups / (drawable - fadeCount)));
    } else if (birth) group = Math.min(groups - 1, Math.floor(segmentIndex * groups / drawable));
    else group = segmentIndex < fadeCount ? Math.min(groups - 1, Math.floor(segmentIndex * groups / fadeCount)) : -2;
    if (group !== currentGroup) {
      finishGroup();
      currentGroup = group;
      groupStart = segmentIndex;
      colorIndex = startIndex = i - 1;
    }
    endIndex = i;
    groupEnd = ++segmentIndex;
  }
  finishGroup();
  return strokes;
}

export { drawSegmentedTrace };
