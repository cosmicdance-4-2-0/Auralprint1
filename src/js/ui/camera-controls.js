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
const displayValue = (camera, field) => field.key === "rotationRad" ? camera.rotationRad * RAD_TO_DEG : camera[field.key];

function createCameraControlsUi({ ui, interaction } = {}) {
  let initializedOn = null, lastCamera = null, lastEnabled = null;

  function refresh(force = false) {
    if (!initializedOn) return false;
    const camera = state.camera, enabled = interaction.isEnabled();
    if (force || camera !== lastCamera) {
      for (const field of FIELDS) {
        const input = ui[`numCamera${field.name}`], value = displayValue(camera, field);
        input.value = String(value);
        input.setAttribute("aria-invalid", "false");
        ui[`camera${field.name}Error`].textContent = "";
        ui[`valCamera${field.name}`].textContent = `${value} ${field.unit}`;
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
    refresh(true);
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
    const bindAction = (id, action) => ui[id].addEventListener("click", () => {
      interaction.cancelDrag();
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
    bindAction("btnResetCamera", resetCamera);
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
