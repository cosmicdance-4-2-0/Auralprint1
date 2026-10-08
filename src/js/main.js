import { simulationDeltaSec } from "./core/timing.js";
import { CONFIG } from "./core/config.js";
import { runtime, resolveSettings } from "./core/preferences.js";
import { state } from "./core/state.js";
import { resizeCanvasToDisplaySize } from "./core/spaces.js";
import { UrlPreset } from "./presets/url-preset.js";
import { BandBankController } from "./audio/band-bank-controller.js";
import { AudioEngine } from "./audio/audio-engine.js";
import { createAnalysisFrame, updateAnalysisFrame } from "./audio/analysis-frame.js";
import { InputSourceManager } from "./audio/input-source-manager.js";
import { Scrubber } from "./audio/scrubber.js";
import { Renderer } from "./render/renderer.js";
import { RecorderEngine } from "./recording/recorder-engine.js";
import { UI } from "./ui/ui.js";
import { initOrbs } from "./render/orb-runtime.js";
import { VisualizerRuntime } from "./render/visualizer-runtime.js";

/* =============================================================================
   Boot / loop
   ========================================================================== */
const analysisFrame = createAnalysisFrame();
const visualizerFrameContext = {
  dtSec: 0,
  nowSec: 0,
  simPaused: false,
  analysisFrame,
};

function onAnimationFrame(tsMs) {
  requestAnimationFrame(onAnimationFrame);

  resizeCanvasToDisplaySize();

  if (state.time.lastTimestampMs === null) {
    state.time.lastTimestampMs = tsMs;
    return;
  }

  const dtSecRaw = (tsMs - state.time.lastTimestampMs) / 1000;
  state.time.lastTimestampMs = tsMs;

  // Integrate with real frame time, but cap to a single "slow frame" (~33 ms)
  // so tab-switch or GC spikes can't cause huge jumps. Normal 60/120 Hz frames
  // stay untouched, lower bound remains 0, and downstream emit overflow guards stay valid.
  const dtSec = simulationDeltaSec(dtSecRaw, runtime.settings.timing?.maxDeltaTimeSec);
  const nowSec = performance.now() / 1000;

  updateAnalysisFrame(analysisFrame, AudioEngine.sample(), state.bands);

  visualizerFrameContext.dtSec = dtSec;
  visualizerFrameContext.nowSec = nowSec;
  visualizerFrameContext.simPaused = state.time.simPaused;
  VisualizerRuntime.update(visualizerFrameContext);
  VisualizerRuntime.render(Renderer, visualizerFrameContext);
  UI.refreshAllUiText(analysisFrame);
  Scrubber.draw(); // update playhead position every frame
}

function main() {
  UI.setCssVarsFromConfig();

  state.canvas = document.getElementById("c");
  state.ctx = state.canvas.getContext("2d", { alpha: false });

  resolveSettings();
  UrlPreset.applyFromLocationHash();
  resolveSettings();
  InputSourceManager.init({
    onExternalLiveInputReset: UI.resetTrackVisualState,
  });

  BandBankController.syncFromSettings();
  BandBankController.rebuildNow();
  initOrbs();

  // RecorderEngine bootstraps against read-only app seams only.
  RecorderEngine.init({
    config: CONFIG.recording,
    stateRef: state.recording,
    // Renderer owns the canonical display canvas. Recording reads it through
    // a tap descriptor only; it does not create an alternate render path.
    getRenderTap: Renderer.getRecorderTap,
    // Delegate to AudioEngine's canonical recorder-audio interface.
    // This returns { isLoaded, isPlaying, filename, ensureStream(), releaseStream() }.
    // ensureStream() yields the current recordable source audio without turning on
    // local monitoring for live inputs.
    getAudioTap: () => AudioEngine.getRecorderTap(),
  });

  UI.wireControls();
  UI.applyPrefs(null); // null = silent boot; no "Updated: boot" toast on first load
  UI.refreshRecordingUi();

  Scrubber.init(document.getElementById("scrubberCanvas"));
  UI.refreshAllUiText(analysisFrame);

  resizeCanvasToDisplaySize();
  window.addEventListener("resize", resizeCanvasToDisplaySize);

  requestAnimationFrame(onAnimationFrame);
}

main();

export { onAnimationFrame, main };
