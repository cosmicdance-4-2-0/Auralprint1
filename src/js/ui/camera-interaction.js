import { CONFIG } from "../core/config.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { state, setCamera, resetCamera } from "../core/state.js";
import { Spaces } from "../core/spaces.js";
import { panCamera, zoomCamera, rotateCamera, moveCameraFrame } from "./camera-actions.js";

const HELD_KEYS = { w: 1, s: 2, a: 4, d: 8, q: 16, e: 32 };

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

function createCameraInteraction({ fitView = () => {} } = {}) {
  let canvas = null;
  let enabled = CONFIG.camera.interaction.enabledByDefault;
  let drag = null;
  let heldKeys = 0, shiftHeld = false;
  let cssWidth = 0, cssHeight = 0, sizeObserver = null;
  let speeds = Object.freeze({
    panSpeedCssPxPerSec: CONFIG.camera.keyboard.panSpeedCssPxPerSec,
    rotationSpeedDegPerSec: CONFIG.camera.keyboard.rotationSpeedDegPerSec,
  });
  const cleanups = [];

  function clearHeldKeys() { heldKeys = 0; shiftHeld = false; }
  function cancelInput() { clearHeldKeys(); cancelDrag(); }
  function cacheCanvasSize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    cssWidth = rect.width; cssHeight = rect.height;
  }

  function setSpeeds(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new RangeError("Camera speeds require a valid patch.");
    for (const key of Object.keys(patch)) {
      const limit = CONFIG.limits.camera[key];
      if (!Object.hasOwn(speeds, key) || !Number.isFinite(patch[key]) || patch[key] < limit.min || patch[key] > limit.max) {
        throw new RangeError("Camera speeds must be finite and within CONFIG limits.");
      }
    }
    if (Object.keys(patch).every(key => speeds[key] === patch[key])) return speeds;
    speeds = Object.freeze({ ...speeds, ...patch });
    return speeds;
  }

  function tick(elapsedSec) {
    if (!enabled || !canvas || document.hidden || document.activeElement !== canvas) {
      clearHeldKeys();
      return false;
    }
    // Timing safety discards time, never physical key ownership. The main clock
    // supplies zero after a suspension; ordinary slow frames use a bounded step
    // and resume on the next callback without accumulating movement debt.
    if (!heldKeys || !Number.isFinite(elapsedSec) || elapsedSec <= 0) return false;
    let horizontal = Number(!!(heldKeys & HELD_KEYS.d)) - Number(!!(heldKeys & HELD_KEYS.a));
    let vertical = Number(!!(heldKeys & HELD_KEYS.w)) - Number(!!(heldKeys & HELD_KEYS.s));
    if (horizontal && vertical) { horizontal *= Math.SQRT1_2; vertical *= Math.SQRT1_2; }
    const rotation = Number(!!(heldKeys & HELD_KEYS.q)) - Number(!!(heldKeys & HELD_KEYS.e));
    const elapsed = Math.min(elapsedSec, CONFIG.camera.keyboard.maxMovementDeltaSec)
      * (shiftHeld ? CONFIG.camera.keyboard.shiftMultiplier : 1);
    return moveCameraFrame(horizontal, vertical, rotation * speeds.rotationSpeedDegPerSec / RAD_TO_DEG * elapsed,
      speeds.panSpeedCssPxPerSec * elapsed, cssWidth, cssHeight);
  }

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
      ? "Camera mode on. Hold W A S D to move and Q E to turn; Shift boosts speed. Drag to pan; wheel to zoom at the pointer. Arrow keys pan; plus and minus zoom; brackets rotate; C or Home resets camera; F fits the world; Escape exits camera mode."
      : "Camera mode off. Enable direct manipulation in the Camera workspace panel.");
  }

  function setEnabled(value) {
    cancelInput();
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
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
      clearHeldKeys();
      return;
    }
    if (!enabled || event.target !== canvas || event.defaultPrevented || event.isComposing
      || document.hidden) return;
    const key = event.key?.toLowerCase();
    if (key === "c" || key === "f") {
      if (document.activeElement !== canvas) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        cancelInput();
        if (key === "c") resetCamera(); else fitView();
      }
      return;
    }
    const heldKey = HELD_KEYS[key];
    if (heldKey || key === "shift") {
      if (document.activeElement !== canvas) return;
      event.preventDefault();
      event.stopPropagation();
      // Repeats cannot reacquire keys cleared by lifecycle cancellation or reset.
      if (event.repeat) return;
      if (heldKey) {
        heldKeys |= heldKey;
        shiftHeld = event.shiftKey === true;
        cacheCanvasSize();
        cancelDrag();
      } else shiftHeld = true;
      return;
    }
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
      case "Home": action = () => { clearHeldKeys(); resetCamera(); }; break;
      case "Escape": action = () => setEnabled(false); break;
      default: return; // H/Space/R/N/P keep their existing application ownership.
    }
    event.preventDefault();
    event.stopPropagation(); // In particular, arrows must not also seek audio.
    cancelDrag();
    action();
  }

  function keyUp(event) {
    const key = event.key?.toLowerCase();
    const heldKey = HELD_KEYS[key];
    if (heldKey) heldKeys &= ~heldKey;
    if (key === "shift") shiftHeld = event.shiftKey === true;
  }

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    cleanups.push(() => target.removeEventListener(name, handler, options));
  }

  function dispose() {
    cancelInput();
    sizeObserver?.disconnect();
    sizeObserver = null;
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
    listen(canvas, "blur", cancelInput);
    listen(canvas, "wheel", wheel, { passive: false });
    listen(canvas, "keydown", keyDown);
    listen(window, "keyup", keyUp);
    listen(window, "blur", cancelInput);
    listen(window, "resize", cacheCanvasSize);
    listen(document, "visibilitychange", () => { if (document.hidden) cancelInput(); });
    if (typeof ResizeObserver === "function") {
      sizeObserver = new ResizeObserver(cacheCanvasSize);
      sizeObserver.observe(canvas);
    }
    syncMode();
    return true;
  }

  return { init, dispose, setEnabled, isEnabled: () => enabled, cancelDrag, cancelInput,
    tick, getSpeeds: () => speeds, setSpeeds };
}

export { createCameraInteraction, clientToCanvas };
