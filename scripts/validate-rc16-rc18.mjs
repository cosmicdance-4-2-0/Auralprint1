// Optional native validation: actual boot, URL/editor boundaries, callback and Space.
export async function validateRc16Rc18() {
  const { onAnimationFrame } = await import("../src/js/main.js");
  const { state } = await import("../src/js/core/state.js");
  const { preferences, resolveSettings } = await import("../src/js/core/preferences.js");
  const { UrlPreset } = await import("../src/js/presets/url-preset.js");
  const { initOrbs } = await import("../src/js/render/orb-runtime.js");
  const { VisualizerRuntime } = await import("../src/js/render/visualizer-runtime.js");
  const { AudioEngine } = await import("../src/js/audio/audio-engine.js");
  const { UI } = await import("../src/js/ui/ui.js");
  const original = { now: performance.now, sample: AudioEngine.sample, update: VisualizerRuntime.update };
  let ms = 100000, samples = 0, lastFrame, changingSignal = false;
  const distributions = { L: [.9, .1, .2, .8, 1], R: [.3, .2, .4, .6, -.5], C: [.6, .3, .8, .4, .25] };
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
  performance.now = () => ms;
  AudioEngine.sample = () => {
    samples++;
    return { ready: true, monoLike: false, bands: Object.fromEntries(Object.entries(distributions).map(([chanId, [energy01, , , , waveform]]) =>
      [chanId, { energy01: energy01 + (changingSignal ? samples / 10000 : 0), rms: energy01, timeDomain: Float32Array.of(waveform) }])) };
  };
  VisualizerRuntime.update = context => { lastFrame = context.analysisFrame; original.update(context); };
  const callback = time => { ms = time; onAnimationFrame(time); };
  const load = (chanId, bandIds, phaseMode = "free") => {
    const prefs = { orbs: [{ id: "probe", chanId, bandIds, chirality: 1, startAngleRad: 1, motion: { angularSpeedRadPerSec: 2 }, particles: { emitPerSecond: 0 } }],
      bands: { overlay: { phaseMode, ringSpeedRadPerSec: 2 } } };
    const bytes = new TextEncoder().encode(JSON.stringify({ schema: 10, prefs }));
    const hash = "#p=" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    history.replaceState(null, "", hash);
    assert(UrlPreset.applyFromLocationHash(), "URL import failed");
    resolveSettings(); initOrbs(); UI.applyPrefs(null);
    for (const [c, [, zero, three, seven]] of Object.entries(distributions)) {
      const energies = state.bands.channels[c].energies01;
      energies.fill(0); energies[0] = zero; energies[3] = three; energies[7] = seven;
    }
    state.time.lastTimestampMs = null; state.time.simPaused = false; state.bands.ringPhaseRad = 1;
    callback(ms);
    return state.orbs[0];
  };
  const rows = [], pauses = [];
  try {
    for (const chanId of ["L", "R", "C"]) {
      const full = load(chanId, []).baseRadiusPx;
      const malformed = load(chanId, [null, false, "", [], true]);
      assert(malformed.bandIds.length === 0, "malformed targets became bands");
      close(malformed.baseRadiusPx, full, "all-invalid vs empty control");
      const target = load(chanId, [7, null, 3, false, 7, 0, true, 3]);
      assert(JSON.stringify(target.bandIds) === "[7,3,0]", "stable selection");
      const [energy, zero, three, seven] = distributions[chanId];
      const minDim = Math.min(state.widthPx, state.heightPx);
      close(full, minDim * (.01 + .79 * energy), "full selected-channel radius");
      close(target.baseRadiusPx, minDim * (.01 + .79 * (zero + three + seven) / 3), "target selected-channel radius");
      const band0 = load(chanId, [0]);
      close(band0.baseRadiusPx, minDim * (.01 + .79 * zero), "valid Band 0 radius");
      rows.push({ chanId, fullRadiusPx: full, selectedRadiusPx: target.baseRadiusPx, band0RadiusPx: band0.baseRadiusPx });
    }
    // Actual generated editor commits parsed numbers and actual picker indices.
    const orb = load("R", []);
    const input = document.querySelector('[data-orb-id="probe"] input[id$="-bands"]');
    assert(input, "generated band input missing");
    input.value = "7, 3; 7 0 255"; input.dispatchEvent(new Event("change", { bubbles: true }));
    assert(JSON.stringify(orb.bandIds) === "[7,3,0,255]", "UI text lost legitimate IDs");
    input.value = "true"; input.dispatchEvent(new Event("change", { bubbles: true }));
    assert(input.getAttribute("aria-invalid") === "true", "invalid text accepted");
    assert(JSON.stringify(orb.bandIds) === "[7,3,0,255]", "invalid UI text changed selection");
    input.value = ""; input.dispatchEvent(new Event("change", { bubbles: true }));
    assert(orb.bandIds.length === 0, "blank UI text must mean full spectrum");
    const details = document.querySelector('[data-orb-id="probe"] .orb-band-picker details');
    details.open = true; details.dispatchEvent(new Event("toggle"));
    const check = details.querySelector('input[aria-label^="Orb probe: band 0,"]');
    assert(check, "picker Band 0 missing"); check.checked = true; check.dispatchEvent(new Event("change"));
    assert(JSON.stringify(orb.bandIds) === "[0]", "picker lost legitimate Band 0");
    changingSignal = true;
    for (const phaseMode of ["free", "orb"]) {
      const pausedOrb = load("L", [], phaseMode);
      callback(ms + 100);
      document.activeElement?.blur();
      const space = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
      space(); assert(state.time.simPaused, "actual Space did not pause");
      const orbPhase = pausedOrb.angleRad, ringPhase = state.bands.ringPhaseRad;
      const countBefore = samples, energyBefore = lastFrame.channels.C.energy01;
      for (let i = 0; i < 20; i++) callback(ms + 100);
      assert(pausedOrb.angleRad === orbPhase && state.bands.ringPhaseRad === ringPhase, "pause changed motion");
      assert(samples - countBefore === 20 && lastFrame.ready && lastFrame.channels.C.energy01 > energyBefore, "analysis stopped during visual pause");
      space(); assert(!state.time.simPaused, "actual Space did not resume"); callback(ms + 100);
      close(pausedOrb.angleRad, orbPhase + .2, "resume Orb without catch-up");
      close(state.bands.ringPhaseRad, ringPhase + .2, "resume Ring without catch-up");
      if (phaseMode === "orb") assert(state.bands.ringPhaseRad === pausedOrb.angleRad, "Orb lock lost synchronization");
      pauses.push({ phaseMode, orbBefore: orbPhase, ringBefore: ringPhase, samplesDuringPause: 20, resumedOrb: pausedOrb.angleRad, resumedRing: state.bands.ringPhaseRad });
    }
    return { rows, pauses, ui: ["validated text produces numeric IDs", "invalid text preserves selection", "blank text uses full spectrum", "picker preserves Band 0"], samples };
  } finally { performance.now = original.now; AudioEngine.sample = original.sample; VisualizerRuntime.update = original.update; VisualizerRuntime.dispose(); }
}
