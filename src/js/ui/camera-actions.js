import { CONFIG } from "../core/config.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { state, setCamera } from "../core/state.js";
import { viewportToWorld } from "../core/camera-projection.js";

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

export { panCamera, rotateCamera, zoomCamera };
