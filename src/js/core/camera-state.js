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

export { createCameraState, isValidCameraState };
