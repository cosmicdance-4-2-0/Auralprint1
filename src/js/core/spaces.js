import { state } from "./state.js";
import { worldToViewport, viewportToWorld } from "./camera-projection.js";

/* =============================================================================
   Sim space vs Screen space
   ========================================================================== */
const Spaces = (() => {
  function centerPx() {
    if (!Number.isFinite(state.widthPx) || state.widthPx < 0 ||
        !Number.isFinite(state.heightPx) || state.heightPx < 0) return null;
    return { x: state.widthPx * 0.5, y: state.heightPx * 0.5 };
  }
  function simToScreen(xSim, ySim) {
    return worldToViewport(xSim, ySim, state, state.world, state.camera);
  }
  function screenToSim(xPx, yPx) {
    return viewportToWorld(xPx, yPx, state, state.world, state.camera);
  }
  return { centerPx, simToScreen, screenToSim };
})();

/* =============================================================================
   Canvas sizing
   ========================================================================== */
function resizeCanvasToDisplaySize() {
  const deviceDpr = window.devicePixelRatio;
  const dpr = Number.isFinite(deviceDpr) && deviceDpr > 0 &&
    Number.isSafeInteger(Math.ceil(deviceDpr)) ? deviceDpr : 1;
  const cssW = state.canvas.clientWidth;
  const cssH = state.canvas.clientHeight;

  // Malformed/unrepresentable layout is a degenerate view, never world input.
  const backingSize = cssSize => Number.isFinite(cssSize) && cssSize >= 0 &&
    Number.isSafeInteger(Math.floor(cssSize * dpr)) ? Math.floor(cssSize * dpr) : 0;
  const pxW = backingSize(cssW);
  const pxH = backingSize(cssH);

  if (pxW !== state.widthPx || pxH !== state.heightPx || dpr !== state.dpr) {
    state.dpr = dpr;
    state.widthPx = pxW;
    state.heightPx = pxH;
    state.canvas.width = pxW;
    state.canvas.height = pxH;
  }
}

export { Spaces, resizeCanvasToDisplaySize };
