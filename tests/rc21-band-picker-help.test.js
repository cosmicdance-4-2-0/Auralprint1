import test from "node:test";
import assert from "node:assert/strict";
import { createOrbBandPicker } from "../src/js/ui/orb-band-picker.js";
import { createAnalysisFrame, updateAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { selectOrbAnalysis } from "../src/js/render/visualizer-runtime.js";
import { Orb } from "../src/js/render/orb.js";
import { normalizeOrbDef } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { installUiDocument } from "./helpers/ui-dom.js";

function fixture() {
  const bands = {}, channels = {};
  for (const [id, full, wave, energies] of [["L", .8, .75, [.9, .7]], ["R", .2, -.5, [.1, .3]], ["C", .6, .25, [.5, .4]]]) {
    bands[id] = { energy01: full, timeDomain: Float32Array.of(wave) };
    channels[id] = { energies01: energies };
  }
  return updateAnalysisFrame(createAnalysisFrame(), { ready: true, monoLike: false, bands }, { channels });
}

test("RC-21: one-band, multi-band and empty targeting keep the selected channel's waveform and energy", t => {
  const frame = fixture(), before = structuredClone(frame);
  const size = [state.widthPx, state.heightPx, state.dpr];
  state.widthPx = state.heightPx = 1000; state.dpr = 1;
  try {
    const rows = [];
    for (const [chanId, single, multiple] of [["L", .9, .8], ["R", .1, .2], ["C", .5, .45]]) {
      for (const [bandIds, expected] of [[[0], single], [[0, 1], multiple], [[], null]]) {
        const orb = new Orb(normalizeOrbDef({ id: chanId, chanId, bandIds, particles: { emitPerSecond: 0 } }));
        try {
          const selected = selectOrbAnalysis(orb, frame), channel = frame.channels[chanId];
          assert.equal(selected.band, channel);
          assert.equal(selected.band.waveform, channel.waveform);
          assert.equal(selected.energyOverride01, expected);
          if (!bandIds.length) assert.equal(selected.selectedDominantBandIndex, null);
          orb.step(0, 0, selected.band, selected.energyOverride01, 0);
          const energy = expected ?? channel.energy01;
          const radius = 1000 * (orb.response.minRadiusFrac + (orb.response.maxRadiusFrac - orb.response.minRadiusFrac) * energy);
          assert.ok(Math.abs(orb.baseRadiusPx - radius) < 1e-10);
          assert.equal(orb.radialDispPx, orb.baseRadiusPx * orb.response.waveformRadialDisplaceFrac * channel.waveform[0]);
          rows.push({ chanId, bandIds, selected: expected, full: channel.energy01, waveform: channel.waveform[0] });
        } finally { orb.trail.dispose(); }
      }
    }
    assert.deepEqual(frame, before, "consumer leaves producer arrays unchanged");
    t.diagnostic(JSON.stringify(rows));
  } finally { [state.widthPx, state.heightPx, state.dpr] = size; }
});

test("RC-21: actual rendered help explains channel ownership and band/empty targeting", t => {
  const dom = installUiDocument();
  try {
    const container = dom.element();
    let targets = [0];
    const picker = createOrbBandPicker(container, { orbLabel: "Orb 1", onChange: ids => { targets = ids; }, formatRange: () => "range", describeBank: () => "bank" });
    picker.sync(targets);
    const details = container.children.find(child => child.tagName === "DETAILS");
    details.open = true; details.dispatchEvent({ type: "toggle" });
    const help = details.children[2].textContent;
    assert.match(help, /channel.*both.*waveform.*band energ/i);
    for (const channel of ["Left", "Right", "Center"]) assert.ok(help.includes(channel));
    assert.match(help, /selected bands.*that channel.s energy/i);
    assert.match(help, /no bands selected.*channel.s full-spectrum energy/i);
    assert.doesNotMatch(help, /selected bands use the combined spectrum|channel controls the waveform/i);
    const firstCheck = details.children.at(-1).children[1].children[0];
    firstCheck.checked = true; firstCheck.dispatchEvent({ type: "change" });
    assert.deepEqual(targets, [0, 1]);
    const frame = fixture();
    assert.equal(selectOrbAnalysis({ chanId: "L", bandIds: targets }, frame).energyOverride01, .8);
    container.children[1].children[0].click();
    assert.deepEqual(targets, []);
    assert.equal(selectOrbAnalysis({ chanId: "L", bandIds: targets }, frame).band, frame.channels.L);
    assert.equal(selectOrbAnalysis({ chanId: "L", bandIds: targets }, frame).energyOverride01, null);
    assert.match(container.children[0].textContent, /full spectrum.*channel energy/i);
    t.diagnostic(help);
  } finally { dom.restore(); }
});
