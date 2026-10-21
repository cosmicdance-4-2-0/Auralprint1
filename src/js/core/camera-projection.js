import { isValidCameraState } from "./camera-state.js";

function validProjectionInputs(x, y, viewport, world, camera) {
  return Number.isFinite(x) && Number.isFinite(y)
    && !!viewport && Number.isFinite(viewport.widthPx) && viewport.widthPx >= 0
    && Number.isFinite(viewport.heightPx) && viewport.heightPx >= 0
    && !!world && Number.isFinite(world.referenceSpanUnits) && world.referenceSpanUnits > 0
    && isValidCameraState(camera);
}

function finitePoint(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

// Positive rotation turns the CAMERA's world-space +X axis counterclockwise
// toward +Y. Projecting the world applies R(-rotation): a stationary scene turns
// clockwise on screen. This does not change any Orb's designed/live phase.
function worldToViewport(x, y, viewport, world, camera) {
  if (!validProjectionInputs(x, y, viewport, world, camera)) return null;
  const centerX = viewport.widthPx * 0.5;
  const centerY = viewport.heightPx * 0.5;
  const shortSide = Math.min(viewport.widthPx, viewport.heightPx);
  // Preserve 116A's collapsed forward view. There is no inverse at zero size.
  if (shortSide === 0) return { x: centerX, y: centerY };
  const scale = shortSide / world.referenceSpanUnits * camera.zoom;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const dx = x - camera.x;
  const dy = y - camera.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const cos = Math.cos(camera.rotationRad), sin = Math.sin(camera.rotationRad);
  return finitePoint(centerX + (dx * cos + dy * sin) * scale,
    centerY - (-dx * sin + dy * cos) * scale);
}

// Inverse of the same fit, camera rotation and translation. Null denotes an
// invalid/degenerate input or unrepresentable result, never a replacement origin.
// Tests use 1e-10 * max(1, |point|, |camera|, world span) world-unit tolerance;
// cancellation when a tiny offset is added to a huge camera position is bounded
// by floating-point precision at that position, not at the tiny offset's scale.
function viewportToWorld(x, y, viewport, world, camera) {
  if (!validProjectionInputs(x, y, viewport, world, camera)) return null;
  const scale = Math.min(viewport.widthPx, viewport.heightPx) / world.referenceSpanUnits * camera.zoom;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const dx = (x - viewport.widthPx * 0.5) / scale;
  const dy = (viewport.heightPx * 0.5 - y) / scale;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const cos = Math.cos(camera.rotationRad), sin = Math.sin(camera.rotationRad);
  return finitePoint(camera.x + dx * cos - dy * sin,
    camera.y + dx * sin + dy * cos);
}

export { worldToViewport, viewportToWorld };
