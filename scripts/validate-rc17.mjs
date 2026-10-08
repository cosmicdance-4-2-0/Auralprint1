// Runs inside native Chromium against actual source boot/listeners/runtime.
// Scheduling is frozen by the driver; frame time is controlled for continuity.
export async function validateRc17() {
  const { onAnimationFrame } = await import("../src/js/main.js");
  const { preferences, runtime, resolveSettings } = await import("../src/js/core/preferences.js");
  const { state } = await import("../src/js/core/state.js");
  const { UI } = await import("../src/js/ui/ui.js");
  const { UrlPreset } = await import("../src/js/presets/url-preset.js");
  const { initOrbs, reconcileOrbs, duplicateRuntimeOrb } = await import("../src/js/render/orb-runtime.js");
  const { VisualizerRuntime } = await import("../src/js/render/visualizer-runtime.js");
  const { TAU, RAD_TO_DEG } = await import("../src/js/core/constants.js");
  const assert = (ok, label) => { if (!ok) throw Error(label); };
  const close = (a, b, label) => assert(Math.abs(a - b) < 1e-10, `${label}: ${a} != ${b}`);
  const read = input => ({ value: Number(input.value), display: input.closest('.row').querySelector('.val').textContent,
    aria: input.getAttribute('aria-valuetext') });
  const focus = input => {
    if (!input.closest('#visualizersPanel').getClientRects().length) document.querySelector('#btnOpenVisualizers').click();
    for (let p = input.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    input.focus(); assert(document.activeElement === input, "could not focus visible phase control");
  };
  const agrees = (input, expected) => {
    const result = read(input); close(result.value, expected, "native slider precision");
    assert(result.aria === result.display.slice(0, -1) + " degrees", "visible/accessible disagreement");
    close(parseFloat(result.display), expected * RAD_TO_DEG, "display precision"); return result;
  };
  const load = (phaseMode, phase = .25) => {
    const payload = { schema: 10, prefs: { orbs: [{ id: "moving", chirality: 1, startAngleRad: phase,
      motion: { angularSpeedRadPerSec: 2 } }, { id: "independent", startAngleRad: Math.PI }],
      bands: { overlay: { phaseMode, ringSpeedRadPerSec: 1 } } } };
    history.replaceState(null, "", "#p=" + btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    assert(UrlPreset.applyFromLocationHash(), "actual preset import failed"); resolveSettings(); initOrbs(); UI.applyPrefs(null);
    return document.querySelector('[data-orb-id="moving"] input[id$="-phase-offset"]');
  };
  let ms = performance.now(); const originalNow = performance.now;
  performance.now = () => ms;
  const frame = () => { ms += 100; onAnimationFrame(ms); };
  const rows = [];
  try {
    for (const phaseMode of ["orb", "free"]) {
      const input = load(phaseMode), orb = state.orbs[0], other = state.orbs[1];
      state.time.lastTimestampMs = null; state.time.simPaused = false; frame(); frame();
      close(orb.angleRad, .45, "ordinary motion before editing");
      orb.trail.emitAt(10, 20, ms / 1000, { r: 1, g: 0, b: 0 }); orb.trail.emitAccumulator = .375;
      const before = orb.angleRad, ringBefore = state.bands.ringPhaseRad, list = orb.trail.particles;
      const tail = list.tail, governor = orb.trail.governor, beforeOther = other.angleRad;
      const stats = VisualizerRuntime.getParticleStats();
      focus(input); input.value = String(1.5 / RAD_TO_DEG); input.dispatchEvent(new Event("input", { bubbles: true }));
      const designed = orb.startAngleRad, ui = agrees(input, designed);
      close(designed, 1.5 / RAD_TO_DEG, "requested edit at native precision");
      assert(orb.startAngleRad === preferences.orbs[0].startAngleRad, "designed phase not persisted/synced");
      assert(state.orbs[0] === orb && orb.angleRad === before && other.angleRad === beforeOther, "edit teleported/recreated Orb");
      assert(orb.trail.particles === list && list.tail === tail && orb.trail.governor === governor, "edit changed history/governor");
      assert(orb.trail.emitAccumulator === .375 && state.bands.ringPhaseRad === ringBefore, "edit reset emission/Ring");
      assert(JSON.stringify(VisualizerRuntime.getParticleStats()) === JSON.stringify(stats), "edit reset governor diagnostics");
      frame(); close(orb.angleRad, before + .2, "live continuity after edit");
      if (phaseMode === "orb") assert(state.bands.ringPhaseRad === orb.angleRad, "current-frame Orb lock");
      const beforeTrack = orb.angleRad, beforeTrackRing = state.bands.ringPhaseRad;
      UI.resetTrackVisualState();
      assert(orb.angleRad === beforeTrack && orb.startAngleRad === designed, "track reset applied designed phase");
      assert(list.length === 0 && state.bands.ringPhaseRad === beforeTrackRing, "track reset trail/Ring behavior");
      orb.trail.emitAt(10, 20, ms / 1000, { r: 1, g: 0, b: 0 });
      document.querySelector('#btnResetVisuals').click();
      assert(orb.angleRad === orb.startAngleRad && list.length === 0 && state.orbs[0] === orb, "Reset Visuals failed");
      assert(state.bands.ringPhaseRad === (phaseMode === "orb" ? orb.startAngleRad : 0), "Ring visual reset");
      agrees(input, orb.startAngleRad);
      frame(); close(orb.angleRad, orb.startAngleRad + .2, "motion after visual reset");
      const def = duplicateRuntimeOrb("moving"), duplicate = state.orbs.find(o => o.id === def.id);
      UI.refreshAllUiText();
      assert(duplicate !== orb && duplicate.startAngleRad === orb.startAngleRad && duplicate.angleRad === orb.startAngleRad,
        "duplication copied live phase");
      assert(duplicate.trail.particles.length === 0, "duplication copied history");
      // Retain nodes, open state and focus while order changes; commit by ID.
      const card = input.closest('.orb-card'); card.open = true; focus(input);
      const countBefore = window.__rc17Listeners?.get(input)?.length;
      preferences.orbs.reverse(); resolveSettings(); reconcileOrbs(); UI.applyPrefs(null);
      assert(document.querySelector('[data-orb-id="moving"] input[id$="-phase-offset"]') === input && card.open, "reorder replaced editor");
      assert(document.activeElement === input, "refresh lost focus");
      for (let i = 0; i < 5; i++) { UI.applyPrefs(null); UI.refreshAllUiText(); }
      assert(window.__rc17Listeners?.get(input)?.length === countBefore, "refresh duplicated native listeners");
      const duplicatePhase = duplicate.startAngleRad;
      input.value = String(TAU); input.dispatchEvent(new Event("input", { bubbles: true }));
      const endpoint = agrees(input, 0);
      assert(preferences.orbs.find(o => o.id === "moving").startAngleRad === 0 && orb.startAngleRad === 0, "endpoint committed by wrong ID");
      assert(duplicate.startAngleRad === duplicatePhase, "endpoint changed independent Orb");
      // Open surviving editor during actual preset replacement.
      load(phaseMode, -Math.PI / 2);
      assert(document.querySelector('[data-orb-id="moving"] input[id$="-phase-offset"]') === input && card.open, "replacement lost surviving editor");
      const replacement = agrees(input, 3 * Math.PI / 2);
      rows.push({ phaseMode, beforeEditLive: before, afterEditLive: before, designed: ui,
        trackResetLive: beforeTrack, visualResetApplied: designed, duplicateDesigned: duplicatePhase,
        nativeListenerCount: countBefore, endpoint, replacement, preserved: ["Orb object", "trail/list/tail", "governor", "emission fraction", "Ring phase", "independent Orb", "focus", "open editor", "listeners"] });
    }
    return rows;
  } finally { performance.now = originalNow; }
}
