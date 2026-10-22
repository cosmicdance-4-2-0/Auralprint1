import { CONFIG } from "../core/config.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { state, setCamera, resetCamera } from "../core/state.js";
import { panCamera, rotateCamera, zoomCamera } from "./camera-actions.js";

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const FIELDS = [
  { key: "x", name: "X", unit: "world units" },
  { key: "y", name: "Y", unit: "world units" },
  { key: "zoom", name: "Zoom", unit: "×" },
  { key: "rotationRad", name: "Rotation", unit: "degrees" },
];
const SPEED_FIELDS = [
  { key: "panSpeedCssPxPerSec", name: "PanSpeed", unit: "CSS pixels/second" },
  { key: "rotationSpeedDegPerSec", name: "RotationSpeed", unit: "degrees/second" },
];
const sync = (node, key, value) => { if (node[key] !== value) node[key] = value; };
const displayValue = (camera, field) => field.key === "rotationRad" ? camera.rotationRad * RAD_TO_DEG : camera[field.key];

function createCameraControlsUi({ ui, interaction, fitView = () => {} } = {}) {
  let initializedOn = null, lastCamera = null, lastEnabled = null, lastSpeeds = null;

  function refresh(force = false, committedInput = null) {
    if (!initializedOn || (!force && ui.cameraPanel?.style.display === "none")) return false;
    const focused = typeof document !== "undefined" ? document.activeElement : null;
    const camera = state.camera, enabled = interaction.isEnabled();
    if (force || camera !== lastCamera) {
      for (const field of FIELDS) {
        const input = ui[`numCamera${field.name}`], value = displayValue(camera, field);
        // Live movement may update readouts, but a focused numeric draft belongs
        // to its editor until commit/blur, including temporarily invalid text.
        if (input !== focused || input === committedInput) {
          sync(input, "value", String(value));
          if (input.getAttribute("aria-invalid") !== "false") input.setAttribute("aria-invalid", "false");
          sync(ui[`camera${field.name}Error`], "textContent", "");
        }
        sync(ui[`valCamera${field.name}`], "textContent", `${value} ${field.unit}`);
      }
      ui.btnCameraZoomOut.disabled = camera.zoom <= CONFIG.limits.camera.zoom.min;
      ui.btnCameraZoomIn.disabled = camera.zoom >= CONFIG.limits.camera.zoom.max;
      lastCamera = camera;
    }
    if (force || enabled !== lastEnabled) {
      ui.chkCameraInteraction.checked = enabled;
      ui.valCameraInteraction.textContent = enabled ? "Camera mode on" : "Camera mode off";
      lastEnabled = enabled;
    }
    const speeds = interaction.getSpeeds();
    if (force || speeds !== lastSpeeds) {
      for (const field of SPEED_FIELDS) {
        const input = ui[`numCamera${field.name}`];
        if (input !== focused || input === committedInput) {
          sync(input, "value", String(speeds[field.key]));
          if (input.getAttribute("aria-invalid") !== "false") input.setAttribute("aria-invalid", "false");
          sync(ui[`camera${field.name}Error`], "textContent", "");
        }
        sync(ui[`valCamera${field.name}`], "textContent", `${speeds[field.key]} ${field.unit}`);
      }
      lastSpeeds = speeds;
    }
    return true;
  }

  function commitSpeed(field) {
    const input = ui[`numCamera${field.name}`], raw = input.value.trim();
    const value = DECIMAL.test(raw) ? Number(raw) : NaN;
    const limits = CONFIG.limits.camera[field.key];
    if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
      input.setAttribute("aria-invalid", "true");
      ui[`camera${field.name}Error`].textContent = `Enter ${limits.min} to ${limits.max} ${field.unit}.`;
      return false;
    }
    interaction.setSpeeds({ [field.key]: value });
    refresh(true, input);
    return true;
  }

  function commitField(field) {
    const input = ui[`numCamera${field.name}`], raw = input.value.trim();
    const value = DECIMAL.test(raw) ? Number(raw) : NaN;
    const zoom = CONFIG.limits.camera.zoom;
    if (!Number.isFinite(value) || (field.key === "zoom" && (value < zoom.min || value > zoom.max))) {
      input.setAttribute("aria-invalid", "true");
      ui[`camera${field.name}Error`].textContent = field.key === "zoom"
        ? `Enter a zoom from ${zoom.min} to ${zoom.max}.`
        : `Enter a finite number in ${field.unit}.`;
      return false;
    }
    // Merely focusing and leaving a degree field must not round-trip radians.
    if (value !== displayValue(state.camera, field)) {
      try { setCamera({ [field.key]: field.key === "rotationRad" ? value / RAD_TO_DEG : value }); }
      catch (error) {
        if (!(error instanceof RangeError)) throw error;
        input.setAttribute("aria-invalid", "true");
        ui[`camera${field.name}Error`].textContent = "This camera value cannot be represented.";
        return false;
      }
    }
    interaction.cancelDrag();
    refresh(true, input);
    return true;
  }

  function init() {
    if (!ui?.cameraSection || initializedOn === ui.cameraSection) return false;
    initializedOn = ui.cameraSection;
    for (const field of FIELDS) {
      const input = ui[`numCamera${field.name}`];
      input.step = "any"; // Keep imported/edited precision; explicit keys own increments.
      if (field.key === "zoom") {
        input.min = String(CONFIG.limits.camera.zoom.min);
        input.max = String(CONFIG.limits.camera.zoom.max);
      }
      input.addEventListener("change", () => commitField(field));
      input.addEventListener("blur", () => {
        if (input.getAttribute("aria-invalid") !== "true") refresh(true);
      });
      input.addEventListener("keydown", event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? 1 : -1;
        const raw = input.value.trim(), current = DECIMAL.test(raw) ? Number(raw) : NaN;
        if (!Number.isFinite(current) || (field.key === "zoom"
          && (current < CONFIG.limits.camera.zoom.min || current > CONFIG.limits.camera.zoom.max))) {
          commitField(field);
          return;
        }
        input.value = String(field.key === "zoom"
          ? Math.max(CONFIG.limits.camera.zoom.min, Math.min(CONFIG.limits.camera.zoom.max,
            current * CONFIG.camera.interaction.zoomFactor ** direction))
          : current + direction * (field.key === "rotationRad"
            ? CONFIG.camera.interaction.rotationStepDeg : CONFIG.camera.interaction.panStepUnits));
        commitField(field);
      });
    }
    for (const field of SPEED_FIELDS) {
      const input = ui[`numCamera${field.name}`], limits = CONFIG.limits.camera[field.key];
      input.min = String(limits.min); input.max = String(limits.max); input.step = String(limits.step);
      input.addEventListener("change", () => commitSpeed(field));
      input.addEventListener("blur", () => {
        if (input.getAttribute("aria-invalid") !== "true") refresh(true);
      });
    }
    ui.btnFocusCameraCanvas.addEventListener("click", () => state.canvas?.focus({ preventScroll: true }));
    const bindAction = (id, action, stopMovement = false) => ui[id].addEventListener("click", () => {
      if (stopMovement) interaction.cancelInput(); else interaction.cancelDrag();
      action();
      refresh(true);
    });
    bindAction("btnCameraPanLeft", () => panCamera(-1, 0));
    bindAction("btnCameraPanRight", () => panCamera(1, 0));
    bindAction("btnCameraPanUp", () => panCamera(0, 1));
    bindAction("btnCameraPanDown", () => panCamera(0, -1));
    bindAction("btnCameraZoomIn", () => zoomCamera(CONFIG.camera.interaction.zoomFactor));
    bindAction("btnCameraZoomOut", () => zoomCamera(1 / CONFIG.camera.interaction.zoomFactor));
    bindAction("btnCameraRotateCW", () => rotateCamera(-1));
    bindAction("btnCameraRotateCCW", () => rotateCamera(1));
    bindAction("btnResetCamera", resetCamera, true);
    bindAction("btnFitCamera", fitView, true);
    ui.chkCameraInteraction.addEventListener("change", () => {
      interaction.setEnabled(ui.chkCameraInteraction.checked);
      refresh();
    });
    refresh(true);
    return true;
  }

  return { init, refresh };
}

export { createCameraControlsUi };
