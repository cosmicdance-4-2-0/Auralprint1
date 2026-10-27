import { canonicalPrefs } from "./helpers/preset-semantics.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CONFIG } from '../src/js/core/config.js';
import { RAD_TO_DEG, TAU } from '../src/js/core/constants.js';
import { selectConfigGrid, isOnConfigGrid, lastGridIndex } from '../src/js/ui/config-range.js';
import { sanitizePreset, encodePresetPayload } from '../src/js/presets/preset-codec.js';
import { createSpectralRingVisualizer } from '../src/js/render/visualizer-runtime.js';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const orb=CONFIG.limits.motion.angularSpeedRadPerSec,ring=CONFIG.limits.bands.ringSpeedRadPerSec;

test('Angular alignment preserves the entire accepted startup Scene and every unrelated CONFIG limit',()=>{
  // Snapshots captured from accepted main 7a9f967, before this pass's changes.
  const defaults=structuredClone(CONFIG.defaults);
  // 116F explicitly adds opt-in fields; retain the original fingerprint for
  // every previously accepted default rather than changing the frozen value.
  delete defaults.audio.clearQueueOnSourceExit;
  for (const orb of defaults.orbs) { delete orb.trace.fadeEnabled; delete orb.trace.fadeSegments; }
  assert.equal(digest(defaults),'81bc92485e95cd1e1d9446a54b7f2c714e2d341ac3e20ccc54ddfe76fdf70e2b');
  const limits=structuredClone(CONFIG.limits);
  // AUD-004 separately authorizes the frequency domain; retain the original
  // snapshot's protection for every pre-existing unrelated limit.
  delete limits.bands.frequencyHz;
  delete limits.trace.fadeSegments; delete limits.trace.lineColorModes;
  delete limits.motion.angularSpeedRadPerSec.min;delete limits.motion.angularSpeedRadPerSec.step;delete limits.bands.ringSpeedRadPerSec.step;
  assert.equal(digest(limits),'839c6a7d4d2a09e1a032b51ed3653148e88248367b31e3a74dbd96bc299b90b0');
  assert.deepEqual(sanitizePreset({schema:13,prefs:{}}),CONFIG.defaults);
  assert.deepEqual(canonicalPrefs(encodePresetPayload(CONFIG.defaults)),CONFIG.defaults);
});

test('Pi-derived half-degree grids reconstruct startup pi/2 and Ring TAU exactly',()=>{
  assert.equal(orb.min,Math.PI/360);assert.equal(orb.step,Math.PI/360);assert.equal(ring.step,orb.step);
  assert.equal(orb.step*RAD_TO_DEG,.5);assert.equal(ring.step*RAD_TO_DEG,.5);
  assert.equal(orb.max,3);assert.equal(ring.min,0);assert.equal(ring.max,TAU);
  for(const definition of CONFIG.defaults.orbs){
    assert.equal(definition.motion.angularSpeedRadPerSec,Math.PI/2);
    assert.ok(isOnConfigGrid(definition.motion.angularSpeedRadPerSec,orb));
    assert.equal(selectConfigGrid(definition.motion.angularSpeedRadPerSec,orb),definition.motion.angularSpeedRadPerSec);
  }
  assert.equal(orb.min+179*orb.step,Math.PI/2,'Default reconstructs from its grid index with identical bits');
  assert.equal(ring.min+720*ring.step,TAU,'Ring endpoint reconstructs without relying on bound snapping');
  assert.equal(lastGridIndex(orb),342);assert.equal(lastGridIndex(ring),720);
  assert.ok(Math.abs(selectConfigGrid(3,orb)*RAD_TO_DEG-171.5)<1e-12);
  assert.ok(selectConfigGrid(3,orb)<3);assert.equal(isOnConfigGrid(3,orb),false);
  assert.equal(selectConfigGrid(TAU,ring),TAU);assert.ok(isOnConfigGrid(TAU,ring));
});

for(const schema of [10,11,12])test(`Angular schema ${schema}: historical radians and Share remain unquantized`,()=>{
  for(const speed of [.01,.123456,1,2,3]){
    const prefs=sanitizePreset({schema,prefs:{orbs:[{id:'legacy',motion:{angularSpeedRadPerSec:speed}}],bands:{overlay:{ringSpeedRadPerSec:.123456}}}});
    assert.equal(prefs.orbs[0].motion.angularSpeedRadPerSec,speed);
    assert.equal(prefs.bands.overlay.ringSpeedRadPerSec,.123456);
    assert.deepEqual(canonicalPrefs(encodePresetPayload(prefs)),prefs);
  }
});

for(const speed of [0,.123456,Math.PI/2,TAU])test(`Ring free-run retains canonical radian integration at speed ${speed}`,()=>{
  const stateRef={bands:{ringPhaseRad:6.2},orbs:[]};
  const settingsRef={settings:{bands:{overlay:{enabled:true,phaseMode:'free',ringSpeedRadPerSec:speed}}}};
  const visualizer=createSpectralRingVisualizer({settingsRef,stateRef});let elapsed=0;
  for(const delta of [.1,.05,.2,0]){
    visualizer.update({dtSec:delta,motionDtSec:delta});
    elapsed+=delta;const expected=(6.2+speed*elapsed)%TAU;
    assert.ok(Math.abs(stateRef.bands.ringPhaseRad-expected)<1e-12);
  }
  const beforePause=stateRef.bands.ringPhaseRad;visualizer.update({dtSec:1,motionDtSec:1,simPaused:true});assert.equal(stateRef.bands.ringPhaseRad,beforePause);
});
