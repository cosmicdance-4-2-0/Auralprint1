import { CONFIG } from "../core/config.js";
import { state, setCamera, resetCamera } from "../core/state.js";
import { Spaces } from "../core/spaces.js";
import { panCamera, zoomCamera, rotateCamera } from "./camera-actions.js";

// Browser client coordinates and backing pixels differ under CSS scaling/DPR.
// Captured pointers can be outside the rectangle; do not clamp their positions.
function clientToCanvas(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height,
    canvas.width, canvas.height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
  const x = (clientX - rect.left) * canvas.width / rect.width;
  const y = (clientY - rect.top) * canvas.height / rect.height;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function createCameraInteraction() {
  let canvas = null;
  let enabled = CONFIG.camera.interaction.enabledByDefault;
  let drag = null;
  const cleanups = [];

  function cancelDrag() {
    const previous = drag;
    drag = null;
    canvas?.setAttribute("data-camera-dragging", "false");
    if (previous && canvas?.hasPointerCapture(previous.id)) {
      canvas.releasePointerCapture(previous.id);
    }
  }

  function syncMode() {
    if (!canvas) return;
    canvas.setAttribute("data-camera-interaction", String(enabled));
    canvas.setAttribute("aria-description", enabled
      ? "Camera mode on. Drag to pan; wheel to zoom at the pointer. Arrow keys pan; plus and minus zoom; brackets rotate; Home resets camera; Escape exits camera mode."
      : "Camera mode off. Enable direct manipulation in Settings, Viewport Camera.");
  }

  function setEnabled(value) {
    cancelDrag();
    enabled = value === true;
    syncMode();
  }

  function moveDrag(event) {
    const beforePx = clientToCanvas(canvas, drag.clientX, drag.clientY);
    const afterPx = clientToCanvas(canvas, event.clientX, event.clientY);
    if (!beforePx || !afterPx) { cancelDrag(); return; }
    // Invert both positions through the current projection. This also handles
    // intervening zoom, rotation, world edits, CSS layout and viewport resizing.
    const before = Spaces.screenToSim(beforePx.x, beforePx.y);
    const after = Spaces.screenToSim(afterPx.x, afterPx.y);
    if (!before || !after) { cancelDrag(); return; }
    const x = state.camera.x + (before.x - after.x);
    const y = state.camera.y + (before.y - after.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { cancelDrag(); return; }
    if (event.clientX !== drag.clientX || event.clientY !== drag.clientY) setCamera({ x, y });
    drag.clientX = event.clientX; drag.clientY = event.clientY;
  }

  function pointerDown(event) {
    if (!enabled || drag || !event.isPrimary || event.button !== 0
      || event.altKey || event.ctrlKey || event.metaKey) return;
    const point = clientToCanvas(canvas, event.clientX, event.clientY);
    if (!point || !Spaces.screenToSim(point.x, point.y)) return;
    canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(event.pointerId); }
    catch { return; } // Detached or no longer active: never start an unowned drag.
    drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    canvas.setAttribute("data-camera-dragging", "true");
    event.preventDefault();
  }

  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!(event.buttons & 1)) { cancelDrag(); return; }
    event.preventDefault();
    moveDrag(event);
  }

  function pointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    moveDrag(event);
    cancelDrag();
  }

  function pointerCancel(event) {
    if (drag && event.pointerId === drag.id) cancelDrag();
  }

  function wheel(event) {
    if (!enabled || event.altKey || event.ctrlKey || event.metaKey
      || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    const point = clientToCanvas(canvas, event.clientX, event.clientY);
    if (!point || point.x < 0 || point.y < 0 || point.x > canvas.width || point.y > canvas.height) return;
    const rect = canvas.getBoundingClientRect();
    const unit = event.deltaMode === 0 ? 1 : event.deltaMode === 1
      ? CONFIG.camera.interaction.wheelLinePixels : event.deltaMode === 2 ? rect.height : null;
    if (unit === null || !Spaces.screenToSim(point.x, point.y)) return;
    const limits = CONFIG.limits.camera.zoom;
    const exponent = -event.deltaY * unit * CONFIG.camera.interaction.wheelZoomPerPixel;
    // Bound before exp so even a very large finite wheel delta reaches a limit.
    const minimumFactor = limits.min / state.camera.zoom;
    const maximumFactor = limits.max / state.camera.zoom;
    const factor = exponent <= Math.log(minimumFactor) ? minimumFactor
      : exponent >= Math.log(maximumFactor) ? maximumFactor : Math.exp(exponent);
    event.preventDefault();
    zoomCamera(factor, point);
  }

  function keyDown(event) {
    if (!enabled || event.target !== canvas || event.defaultPrevented || event.isComposing
      || event.altKey || event.ctrlKey || event.metaKey) return;
    let action;
    switch (event.key) {
      case "ArrowLeft": action = () => panCamera(-1, 0); break;
      case "ArrowRight": action = () => panCamera(1, 0); break;
      case "ArrowUp": action = () => panCamera(0, 1); break;
      case "ArrowDown": action = () => panCamera(0, -1); break;
      case "+": case "=": action = () => zoomCamera(CONFIG.camera.interaction.zoomFactor); break;
      case "-": case "_": action = () => zoomCamera(1 / CONFIG.camera.interaction.zoomFactor); break;
      case "[": action = () => rotateCamera(-1); break;
      case "]": action = () => rotateCamera(1); break;
      case "Home": action = resetCamera; break;
      case "Escape": action = () => setEnabled(false); break;
      default: return; // H/Space/R/N/P keep their existing application ownership.
    }
    event.preventDefault();
    event.stopPropagation(); // In particular, arrows must not also seek audio.
    cancelDrag();
    action();
  }

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    cleanups.push(() => target.removeEventListener(name, handler, options));
  }

  function dispose() {
    cancelDrag();
    for (const cleanup of cleanups.splice(0)) cleanup();
    if (canvas) {
      canvas.removeAttribute("data-camera-interaction");
      canvas.removeAttribute("data-camera-dragging");
      canvas.removeAttribute("aria-description");
    }
    canvas = null;
  }

  function init() {
    if (canvas === state.canvas) return false;
    dispose();
    canvas = state.canvas;
    if (!canvas) return false;
    listen(canvas, "pointerdown", pointerDown);
    listen(canvas, "pointermove", pointerMove);
    listen(canvas, "pointerup", pointerUp);
    listen(canvas, "pointercancel", pointerCancel);
    listen(canvas, "lostpointercapture", pointerCancel);
    listen(canvas, "blur", cancelDrag);
    listen(canvas, "wheel", wheel, { passive: false });
    listen(canvas, "keydown", keyDown);
    listen(window, "blur", cancelDrag);
    listen(document, "visibilitychange", () => { if (document.hidden) cancelDrag(); });
    syncMode();
    return true;
  }

  return { init, dispose, setEnabled, isEnabled: () => enabled, cancelDrag };
}

export { createCameraInteraction, clientToCanvas };
