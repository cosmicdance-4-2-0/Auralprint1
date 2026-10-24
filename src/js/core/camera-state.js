import { CONFIG } from "./config.js";
import { TAU } from "./constants.js";

function isValidCameraState(camera) {
  const zoom = CONFIG.limits.camera.zoom;
  return !!camera && Number.isFinite(camera.x) && Number.isFinite(camera.y)
    && Number.isFinite(camera.zoom) && camera.zoom >= zoom.min && camera.zoom <= zoom.max
    && Number.isFinite(camera.rotationRad);
}

// Camera positions are not constrained by the world's reference dimensions.
// Reject malformed values, rather than allowing invalid view state to spread.
function createCameraState(camera = CONFIG.camera.defaults) {
  if (!isValidCameraState(camera)) {
    throw new RangeError("Camera coordinates/rotation must be finite and zoom must be within CONFIG limits.");
  }
  const remainder = camera.rotationRad % TAU;
  const rotationRad = remainder < 0 ? remainder + TAU : remainder;
  return Object.freeze({
    x: camera.x,
    y: camera.y,
    zoom: camera.zoom,
    // Keep the half-open range even when adding TAU rounds a tiny negative up.
    rotationRad: rotationRad === TAU || rotationRad === 0 ? 0 : rotationRad,
  });
}

// Persistence boundary: malformed fields fall back independently, positive
// finite zoom clamps to the existing live-camera range. Never coerce types or
// retain input references. The strict live setter keeps its rejection policy.
function normalizeSceneCamera(camera) {
  const defaults = CONFIG.defaults.sceneCamera;
  const input = camera && typeof camera === "object" && !Array.isArray(camera) ? camera : {};
  const zoom = CONFIG.limits.camera.zoom;
  return createCameraState({
    x: Number.isFinite(input.x) ? input.x : defaults.x,
    y: Number.isFinite(input.y) ? input.y : defaults.y,
    zoom: Number.isFinite(input.zoom) && input.zoom > 0
      ? Math.max(zoom.min, Math.min(zoom.max, input.zoom)) : defaults.zoom,
    rotationRad: Number.isFinite(input.rotationRad) ? input.rotationRad : defaults.rotationRad,
  });
}

export { createCameraState, isValidCameraState, normalizeSceneCamera };
