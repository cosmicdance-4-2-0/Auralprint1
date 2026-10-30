import { CONFIG } from "../core/config.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { state, setCamera } from "../core/state.js";
import { viewportToWorld } from "../core/camera-projection.js";
import { computeCameraFit } from "../core/camera-fit.js";
import { runtime } from "../core/preferences.js";
import { collectCameraFitContent } from "../render/camera-fit-content.js";

// Shared by native controls and canvas shortcuts. Every successful operation
// replaces the authoritative camera through its validated runtime setter.
function commitCamera(patch) {
  try { setCamera(patch); return true; }
  catch (error) { if (error instanceof RangeError) return false; throw error; }
}

// Direction describes camera movement in the current view's axes (+Y is up).
// The distance remains world units, independent of zoom and viewport size.
function panCamera(horizontal, vertical) {
  if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) return false;
  const camera = state.camera, step = CONFIG.camera.interaction.panStepUnits;
  const cos = Math.cos(camera.rotationRad), sin = Math.sin(camera.rotationRad);
  return commitCamera({
    x: camera.x + step * (horizontal * cos - vertical * sin),
    y: camera.y + step * (horizontal * sin + vertical * cos),
  });
}

function rotateCamera(direction) {
  if (!Number.isFinite(direction)) return false;
  return commitCamera({ rotationRad: state.camera.rotationRad
    + direction * CONFIG.camera.interaction.rotationStepDeg / RAD_TO_DEG });
}

// Integrate a constant view-relative velocity while the camera turns. The
// midpoint orientation times sinc(half turn) is the exact circular-arc integral,
// so splitting a held combination into different frame intervals gives the same
// path. Projection fit and backing/CSS ratios convert screen speed, never world
// geometry. Rectangle dimensions are cached by the interaction owner.
function moveCameraFrame(horizontal, vertical, turnRad, distanceCssPx, cssWidth, cssHeight) {
  const camera = state.camera;
  let x = camera.x, y = camera.y;
  if (distanceCssPx !== 0 && (horizontal !== 0 || vertical !== 0)) {
    const scale = Math.min(state.widthPx, state.heightPx) / state.world?.referenceSpanUnits * camera.zoom;
    if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(cssWidth) || cssWidth <= 0
      || !Number.isFinite(cssHeight) || cssHeight <= 0) return false;
    const halfTurn = turnRad * 0.5;
    const distance = distanceCssPx / scale * (halfTurn === 0 ? 1 : Math.sin(halfTurn) / halfTurn);
    const angle = camera.rotationRad + halfTurn;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const viewX = horizontal * state.widthPx / cssWidth;
    const viewY = vertical * state.heightPx / cssHeight;
    x += distance * (viewX * cos - viewY * sin);
    y += distance * (viewX * sin + viewY * cos);
  }
  if (x === camera.x && y === camera.y && turnRad === 0) return false;
  return commitCamera({ x, y, rotationRad: camera.rotationRad + turnRad });
}

function zoomCamera(factor, backingPoint = null) {
  if (!Number.isFinite(factor) || factor <= 0) return false;
  const camera = state.camera, limits = CONFIG.limits.camera.zoom;
  const zoom = factor >= limits.max / camera.zoom ? limits.max
    : factor <= limits.min / camera.zoom ? limits.min : camera.zoom * factor;
  if (zoom === camera.zoom) return true;
  if (backingPoint === null) return commitCamera({ zoom });
  const before = viewportToWorld(backingPoint.x, backingPoint.y, state, state.world, camera);
  const after = viewportToWorld(backingPoint.x, backingPoint.y, state, state.world, { ...camera, zoom });
  if (!before || !after) return false;
  // Anchor the same world point without changing simulation coordinates.
  return commitCamera({ zoom, x: camera.x + (before.x - after.x), y: camera.y + (before.y - after.y) });
}

// Pointer pairs are in projection/backing coordinates, just like wheel anchors.
// Solve the full pose before committing: a rejected inverse or translation must
// never leave zoom/rotation applied on their own.
function manipulateCamera(beforeA, beforeB, afterA, afterB) {
  const midpoint = (a, b) => ({ x: a.x * .5 + b.x * .5, y: a.y * .5 + b.y * .5 });
  const beforeMid = midpoint(beforeA, beforeB), afterMid = midpoint(afterA, afterB);
  const dx0 = beforeB.x - beforeA.x, dy0 = beforeB.y - beforeA.y;
  const dx1 = afterB.x - afterA.x, dy1 = afterB.y - afterA.y;
  const distance0 = Math.hypot(dx0, dy0), distance1 = Math.hypot(dx1, dy1);
  if (![dx0, dy0, dx1, dy1, distance0, distance1].every(Number.isFinite)
    || distance0 <= 0 || distance1 <= 0) return false;
  const factor = distance1 / distance0;
  if (!Number.isFinite(factor) || factor <= 0) return false;
  const delta = Math.atan2(dy1, dx1) - Math.atan2(dy0, dx0);
  const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
  const camera = state.camera, limits = CONFIG.limits.camera.zoom;
  const zoom = factor >= limits.max / camera.zoom ? limits.max
    : factor <= limits.min / camera.zoom ? limits.min : camera.zoom * factor;
  // Backing +Y points down: positive pair angle and positive camera rotation
  // both turn the displayed scene clockwise.
  const proposed = { ...camera, zoom, rotationRad: camera.rotationRad + turn };
  const before = viewportToWorld(beforeMid.x, beforeMid.y, state, state.world, camera);
  const after = viewportToWorld(afterMid.x, afterMid.y, state, state.world, proposed);
  if (!before || !after) return false;
  return commitCamera({ ...proposed, x: camera.x + (before.x - after.x), y: camera.y + (before.y - after.y) });
}

// An explicit one-shot query. Neither drawing nor the animation callback calls
// this collector: retained history is traversed only when the operator asks.
function fitCamera(analysisFrame = null) {
  const result = computeCameraFit({
    primitives: collectCameraFitContent({ world: state.world, orbs: state.orbs,
      overlay: runtime.settings.bands.overlay, analysisFrame }),
    viewport: { widthPx: state.widthPx, heightPx: state.heightPx, dpr: state.dpr },
    world: state.world, rotationRad: state.camera.rotationRad,
    zoomLimits: CONFIG.limits.camera.zoom, paddingCssPx: CONFIG.camera.fit.paddingCssPx,
  });
  if (!result) return { applied: false, fits: false, reason: "invalid-geometry" };
  // Screen-sized marks cannot be made smaller by changing camera zoom. Leave
  // the view intact and explain this separate no-fit condition to the operator.
  if (result.reason === "screen-margin") return { ...result, applied: false };
  const applied = commitCamera(result.camera);
  return { ...result, applied, fits: applied && result.fits,
    reason: applied ? result.reason : "invalid-geometry" };
}

export { panCamera, rotateCamera, zoomCamera, manipulateCamera, moveCameraFrame, fitCamera };
