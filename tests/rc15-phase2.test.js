import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { sanitizePreset, encodePresetPayload } from "../src/js/presets/preset-codec.js";
import { state } from "../src/js/core/state.js";
import { simulationDeltaSec } from "../src/js/core/timing.js";
import { createAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { Orb } from "../src/js/render/orb.js";
import { TrailSystem } from "../src/js/render/trail-system.js";
import { ParticleGovernor } from "../src/js/render/particle-governor.js";
import { createVisualizerRuntime, VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { initOrbs, reconcileOrbs, createRuntimeOrb, duplicateRuntimeOrb, removeRuntimeOrb, resetOrbTrailsForTrack, resetVisualizers } from "../src/js/render/orb-runtime.js";
import { Renderer } from "../src/js/render/renderer.js";
import { ColorPolicy } from "../src/js/render/color-policy.js";

const policy = CONFIG.limits.particleSafety;
const rgb = { r: .2, g: .4, b: .6 };
const particles = trail => Array.from(trail.particles);
function def(id, rate = 240, ttl = 600) {
  const result = structuredClone(CONFIG.defaults.orbs[0]);
  result.id = id; result.particles.emitPerSecond = rate; result.particles.ttlSec = ttl;
  return result;
}
function scene(count, particlePolicy, rate = 240) {
  const orbs = Array.from({ length: count }, (_, i) => new Orb(def(`ORB-${i}`, rate)));
  const visualizers = createVisualizerRuntime({ particlePolicy }); visualizers.rebuild(orbs);
  const context = { dtSec: 1 / 60, nowSec: 0, simPaused: false, analysisFrame: createAnalysisFrame() };
  return { orbs, visualizers, context, tick(dtSec = context.dtSec) {
    context.dtSec = dtSec; context.nowSec += dtSec; visualizers.update(context);
    return visualizers.getParticleStats();
  } };
}
function counts(s) { return s.orbs.map(orb => orb.trail.particles.length); }
function assertAccounting(s) {
  const total = counts(s).reduce((a,b) => a+b, 0);
  assert.equal(s.visualizers.getParticleStats().activeParticles, total);
  assert.ok(total <= policy.maxActiveParticles);
  for (const orb of s.orbs) {
    const trail = orb.trail;
    assert.ok(trail.emitAccumulator >= 0 && trail.emitAccumulator < 1);
    assert.equal(trail.pendingEmissions, 0); assert.equal(trail.nextPending, null);
    assert.equal(trail.emission.rgbStart, null);
  }
}

test("RC-15 phase 2: CONFIG budgets are independent, frozen, and absent from presets", () => {
  assert.deepEqual(policy, { maxEmissionsPerFrame: 512, maxActiveParticles: 16384 });
  assert.ok(Object.isFrozen(policy));
  assert.throws(() => { policy.maxEmissionsPerFrame = 1e6; }, TypeError);
  const governor = new ParticleGovernor({ maxEmissionsPerFrame: 1e6, maxActiveParticles: Infinity });
  assert.deepEqual(governor.policy, policy);
  assert.ok(Object.isFrozen(governor.policy));
  assert.throws(() => { governor.policy = policy; }, TypeError);
  const dirty = structuredClone(CONFIG.defaults); dirty.particleSafety = policy;
  dirty.orbs[0].allocationCursor = 2; dirty.orbs[0].particles.activeCount = 123;
  assert.deepEqual(encodePresetPayload(dirty), { schema: 10, prefs: CONFIG.defaults });
});

for (const count of [0, 1, 2, 256, 4096]) {
  test(`RC-15 phase 2: exact aggregate frame limit with ${count} accepted Orbs`, () => {
    const accepted = sanitizePreset({ schema: 10, prefs: { orbs: Array.from({length: count}, (_, i) => def(`EXTREME-${i}`)) } });
    assert.equal(accepted.orbs.length, count);
    const s = scene(0); s.orbs = accepted.orbs.map(d => new Orb(d)); s.visualizers.rebuild(s.orbs);
    const snapshot = structuredClone(accepted);
    try {
      for (let i = 0; i < 4; i++) {
        const stats = s.tick();
        assert.equal(stats.emissions, Math.min(count * 4, policy.maxEmissionsPerFrame));
        assert.equal(stats.droppedDemand, Math.max(0, count * 4 - policy.maxEmissionsPerFrame));
        assert.ok(stats.schedulingVisits <= count + stats.emissions);
        assertAccounting(s);
      }
      assert.deepEqual(accepted, snapshot);
      if (count) assert.ok(s.orbs.every(orb => orb.angleRad !== orb.startAngleRad));
    } finally { s.visualizers.dispose(); }
  });
}

test("RC-15 phase 2: normal 60/120 Hz scenes preserve exact fractional frequency, positions and color", () => {
  const s = scene(2), expected = new Orb(def("reference"));
  try {
    for (let i = 0; i < 120; i++) {
      const dt = i % 2 ? 1 / 120 : 1 / 60;
      s.tick(dt); expected.step(dt, s.context.nowSec, null, null, 0);
      for (const orb of s.orbs) {
        assert.equal(orb.angleRad, expected.angleRad);
        assert.equal(orb.trail.emitAccumulator, expected.trail.emitAccumulator);
        assert.deepEqual(particles(orb.trail), particles(expected.trail));
      }
    }
    assert.equal(counts(s)[0], 360);
    assertAccounting(s);
  } finally { s.visualizers.dispose(); expected.trail.dispose(); }
});

test("RC-15 phase 2: high, nonfinite and corrupt demand cannot create debt or unbounded loops", () => {
  const s = scene(1024);
  try {
    for (const rate of [1000, 1e6, Number.MAX_VALUE, NaN, Infinity, -Infinity, -1, 0]) {
      s.orbs.forEach(orb => { orb.particles.emitPerSecond = rate; orb.trail.emitAccumulator = Infinity; });
      const stats = s.tick(1 / 30);
      assert.equal(stats.emissions, Number.isFinite(rate) && rate > 0 ? 512 : 0);
      assertAccounting(s);
    }
    for (const dt of [NaN, Infinity, -Infinity, -1, 0, Number.MAX_VALUE]) {
      const trail = new TrailSystem();
      trail.updateAndEmit(dt, 1, 0, 0, rgb, def("numeric").particles);
      assert.ok(trail.particles.length <= 10);
      assert.ok(Number.isFinite(trail.emitAccumulator) && trail.emitAccumulator < 1);
      assert.ok(Number.isFinite(trail.governor.stats.droppedDemand));
      trail.dispose();
    }
  } finally { s.visualizers.dispose(); }
});

test("RC-15 phase 2: one-particle quanta and persistent service priority prevent later-Orb starvation with a tiny budget", () => {
  const s = scene(7, { maxEmissionsPerFrame: 2 });
  try {
    for (let i = 0; i < 14; i++) {
      assert.equal(s.tick().emissions, 2);
      assertAccounting(s);
    }
    assert.deepEqual(counts(s), Array(7).fill(4));
    assert.equal(s.orbs[0].trail.governor.nextPriority, s.orbs[0].trail);
  } finally { s.visualizers.dispose(); }
});

test("RC-15 phase 2: fairness skips zero demand, serves unequal rates, wraps and survives reorder/removal/add", () => {
  const s = scene(4, { maxEmissionsPerFrame: 1 });
  s.orbs[0].particles.emitPerSecond = 1000;
  s.orbs[1].particles.emitPerSecond = 60;
  s.orbs[2].particles.emitPerSecond = 0;
  s.orbs[3].particles.emitPerSecond = 120;
  try {
    for (let i = 0; i < 6; i++) s.tick();
    assert.deepEqual(counts(s), [2,2,0,2]);
    const histories = new Map(s.orbs.map(orb => [orb, particles(orb.trail)]));
    s.orbs.reverse(); s.visualizers.reconcile(s.orbs);
    for (const orb of s.orbs) assert.deepEqual(particles(orb.trail), histories.get(orb));
    const target = s.orbs.find(orb => orb.particles.emitPerSecond === 1000);
    const governor = target.trail.governor, removed = target.trail.particles.head;
    s.orbs = s.orbs.filter(orb => orb !== target); s.visualizers.reconcile(s.orbs);
    assert.equal(governor.trails.includes(target.trail), false);
    assert.notEqual(governor.nextPriority, target.trail);
    assert.equal(target.trail.particles.length, 0);
    if (removed) { assert.equal(removed.trail, null); assert.equal(removed.heapIndex, -1); }
    const addition = new Orb(def("ADDED",60)); s.orbs.push(addition); s.visualizers.reconcile(s.orbs);
    const inactive = s.orbs.find(orb => orb.particles.emitPerSecond === 0);
    inactive.particles.emitPerSecond = 60;
    const before = counts(s);
    for (let i = 0; i < 8; i++) s.tick();
    assert.deepEqual(counts(s).map((n,i) => n-before[i]), [2,2,2,2]);
    assertAccounting(s);
  } finally { s.visualizers.dispose(); }
});

test("RC-15 phase 2: denied whole demand is discarded while fractional remainder stays smooth", () => {
  const s = scene(20, { maxEmissionsPerFrame: 2 }, 90);
  try {
    for (let i = 0; i < 11; i++) {
      const stats = s.tick(); assert.equal(stats.emissions, 2);
      assert.ok(s.orbs.every(orb => orb.trail.emitAccumulator === (i % 2 ? 0 : .5)));
      assertAccounting(s);
    }
    s.orbs.forEach(orb => { orb.particles.emitPerSecond = 0; });
    assert.equal(s.tick().emissions, 0, "no denied integer work survives overload");
    s.orbs = [s.orbs.at(-1)]; s.visualizers.reconcile(s.orbs);
    s.orbs[0].particles.emitPerSecond = 30;
    assert.equal(s.tick().emissions, 1, "saved .5 plus current .5 emits one");
    assert.equal(s.tick().emissions, 0);
    assert.equal(s.tick().emissions, 1);
  } finally { s.visualizers.dispose(); }
});

test("RC-15 phase 2: pause, stall resume and zero delta do not create a compensating burst or disturb Ring phase", () => {
  const old = runtime.settings, oldOrbs = state.orbs, oldPhase = state.bands.ringPhaseRad;
  const s = scene(256);
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    runtime.settings.bands.overlay.phaseMode = "orb"; state.orbs = s.orbs;
    s.tick(); const angles = s.orbs.map(orb => orb.angleRad), before = counts(s);
    s.context.simPaused = true;
    s.context.nowSec = 120; s.visualizers.update(s.context);
    assert.equal(s.visualizers.getParticleStats().emissions, 0);
    assert.deepEqual(counts(s), before); assert.deepEqual(s.orbs.map(orb => orb.angleRad), angles);
    assert.equal(state.bands.ringPhaseRad, s.orbs[0].angleRad);
    s.context.simPaused = false;
    s.tick(simulationDeltaSec(120, Number.MAX_VALUE));
    assert.equal(s.visualizers.getParticleStats().emissions, 512); assertAccounting(s);
    assert.equal(state.bands.ringPhaseRad, s.orbs[0].angleRad);
    assert.equal(s.tick(0).emissions, 0);
    s.tick(1/60); assert.equal(s.visualizers.getParticleStats().droppedDemand, 512);
  } finally { s.visualizers.dispose(); runtime.settings = old; state.orbs = oldOrbs; state.bands.ringPhaseRad = oldPhase; }
});

function retention(cap = 4) {
  const governor = new ParticleGovernor({ maxActiveParticles: cap });
  const trails = [new TrailSystem(), new TrailSystem()];
  trails.forEach(trail => trail.setGovernor(governor)); governor.setTrails(trails);
  return { governor, trails };
}
function expire(g, trails, now, ttls) {
  g.beginFrame();
  trails.forEach((t,i) => t.updateAndEmit(0, now, 0, 0, rgb, { ...def("expiry").particles, ttlSec: ttls[i] }));
  g.finishFrame();
}

test("RC-15 phase 2: exact retention boundaries and same-timestamp oldest ordering retire before insertion", () => {
  const { governor:g, trails:[a,b] } = retention();
  assert.equal(g.activeParticles, 0);
  a.emitAt(1,1,0,rgb); b.emitAt(2,2,0,rgb); a.emitAt(3,3,0,rgb);
  assert.equal(g.activeParticles, 3);
  const oldest = a.particles.head;
  b.emitAt(4,4,0,rgb); assert.equal(g.activeParticles, 4);
  const append = b.particles.append.bind(b.particles);
  b.particles.append = node => { assert.ok(a.particles.length + b.particles.length < 4); append(node); };
  b.emitAt(5,5,0,rgb);
  assert.equal(g.activeParticles, 4);
  assert.deepEqual(particles(a).map(p=>p.xSim), [3]);
  assert.deepEqual(particles(b).map(p=>p.xSim), [2,4,5]);
  assert.equal(oldest.trail, null); assert.equal(oldest.prev, null); assert.equal(oldest.next, null); assert.equal(oldest.heapIndex,-1);
  for (let i=6;i<100;i++) a.emitAt(i,i,0,rgb);
  assert.equal(g.activeParticles,4); assert.equal(b.particles.length,0);
  assert.deepEqual(particles(a).map(p=>p.xSim), [96,97,98,99]);
  g.dispose(); assert.equal(g.activeParticles,0);
});

test("RC-15 phase 2: oldest means birth timestamp across trails, with independent TTL expiry and replacement", () => {
  const { governor:g, trails:[a,b] } = retention();
  a.emitAt(10,0,10,rgb); b.emitAt(1,0,1,rgb); a.emitAt(9,0,9,rgb); b.emitAt(2,0,2,rgb);
  a.emitAt(11,0,11,rgb);
  assert.deepEqual(particles(b).map(p=>p.bornSec), [2]);
  expire(g,[a,b],12,[100,10]);
  assert.equal(g.stats.expired,1); assert.equal(g.activeParticles,3);
  b.emitAt(12,0,12,rgb); b.emitAt(13,0,13,rgb);
  assert.deepEqual(particles(a).map(p=>p.bornSec), [10,11]);
  for (let i=14;i<40;i++) { expire(g,[a,b],i,[3,1]); b.emitAt(i,0,i,rgb); assert.ok(g.activeParticles<=4); }
  assert.equal(a.particles.length,0); assert.equal(b.particles.length,1);
  g.dispose(); assert.equal(g.heap.length,0);
});

test("RC-15 phase 2: actual 16,384-particle cap holds during sustained aggregate overload", () => {
  const s = scene(256);
  try {
    for (let i=0;i<40;i++) {
      const stats=s.tick(); assert.equal(stats.emissions,512);
      assert.equal(stats.activeParticles,Math.min((i+1)*512,16384));
      assert.equal(stats.evicted,i<32?0:512);
      assertAccounting(s);
    }
    assert.ok(s.orbs.every(orb=>orb.trail.particles.length===64));
  } finally { s.visualizers.dispose(); }
});

test("RC-15 phase 2: retired particles disappear from actual particle drawing and chronological trace suffix", () => {
  const oldCtx=state.ctx, oldSettings=runtime.settings, oldSize=[state.widthPx,state.heightPx,state.dpr];
  const s=scene(1,{maxActiveParticles:4});
  try {
    runtime.settings=structuredClone(CONFIG.defaults);state.widthPx=state.heightPx=100;state.dpr=1;
    const orb=s.orbs[0];orb.trace.numLines=2;orb.trace.lineColorMode="lastParticle";
    for(let i=0;i<6;i++)orb.trail.emitAt(i,0,0,{...rgb,r:i/10});
    assert.deepEqual(particles(orb.trail).map(p=>p.xSim),[2,3,4,5]);
    assert.deepEqual(orb.trail.particles.slice(1).map(p=>p.xSim),[3,4,5]);
    assert.equal(orb.trail.particles.at(-1).xSim,5);
    assert.deepEqual(ColorPolicy.pickLineColorRgb01(orb.trail.particles,0,"lastParticle"),{...rgb,r:.5});
    const arcs=[],lines=[];
    state.ctx=new Proxy({}, {get(_t,key){return (...args)=>{if(key==='arc')arcs.push(args[0]);if(key==='moveTo'||key==='lineTo')lines.push(args[0]);};},set(){return true;}});
    Renderer.drawOrb(orb,0,0);
    assert.deepEqual(arcs,[52,53,54,55]); assert.deepEqual(lines,[53,54,55]);
  } finally{s.visualizers.dispose();state.ctx=oldCtx;runtime.settings=oldSettings;[state.widthPx,state.heightPx,state.dpr]=oldSize;}
});

test("RC-15 phase 2: lifecycle removal/reset/disposal releases heap nodes, cursor and scene ownership", () => {
  const s=scene(3,{maxEmissionsPerFrame:2,maxActiveParticles:8});
  try {
    for(let i=0;i<4;i++)s.tick();
    const removed=s.orbs[0], governor=removed.trail.governor;
    const nodes=[];for(let n=removed.trail.particles.head;n;n=n.next)nodes.push(n);
    s.orbs=s.orbs.slice(1);s.visualizers.reconcile(s.orbs);
    assertAccounting(s); assert.equal(governor.trails.includes(removed.trail),false);
    assert.notEqual(removed.trail.governor,governor);
    assert.ok(nodes.every(n=>n.trail===null&&n.prev===null&&n.next===null&&n.heapIndex===-1));
    const survivor=s.orbs[0], node=survivor.trail.particles.head;
    const before=particles(survivor.trail); s.orbs.reverse();s.visualizers.reconcile(s.orbs);
    assert.deepEqual(particles(survivor.trail),before);assert.equal(survivor.trail.particles.head,node);
    survivor.resetTrail();assertAccounting(s);
    const snapshotNodes=[...governor.heap];s.visualizers.reset("track");
    assert.equal(governor.activeParticles,0);assert.ok(snapshotNodes.every(n=>n.trail===null));
    for(let i=0;i<10;i++)s.tick();s.visualizers.reset("visuals");
    assert.equal(governor.activeParticles,0);assert.ok(s.orbs.every(o=>o.angleRad===o.startAngleRad));
    s.tick();s.visualizers.rebuild([]);s.orbs=[];
    assert.equal(governor.heap.length,0);assert.deepEqual(governor.trails,[]);assert.equal(governor.nextPriority,null);
    assert.equal(s.tick().emissions,0);assertAccounting(s);
  } finally{s.visualizers.dispose();}
});

test("RC-15 phase 2: canonical Add/Duplicate/Remove, track reset and repeated preset replacement account exactly", () => {
  const oldPrefs=structuredClone(preferences),oldSettings=runtime.settings,oldOrbs=[...state.orbs];
  const context={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
  try {
    replacePreferences({...structuredClone(CONFIG.defaults),orbs:[def("A"),def("B")]});resolveSettings();initOrbs();
    VisualizerRuntime.update(context);const source=state.orbs[0], sourceHistory=particles(source.trail);
    source.trail.emitAccumulator=.5;
    const added=createRuntimeOrb();const dup=duplicateRuntimeOrb("A");
    assert.deepEqual(particles(state.orbs.find(o=>o.id===dup.id).trail),[]);
    assert.equal(state.orbs.find(o=>o.id===dup.id).trail.emitAccumulator,0);
    assert.deepEqual(particles(source.trail),sourceHistory);assert.equal(source.trail.emitAccumulator,.5);
    assert.equal(VisualizerRuntime.getParticleStats().activeParticles,8);
    assert.equal(removeRuntimeOrb("B"),true);assert.equal(VisualizerRuntime.getParticleStats().activeParticles,4);
    preferences.orbs.reverse();resolveSettings();reconcileOrbs();assert.equal(state.orbs.find(o=>o.id==='A'),source);
    assert.equal(removeRuntimeOrb(added.id),true);resetOrbTrailsForTrack();
    assert.equal(VisualizerRuntime.getParticleStats().activeParticles,0);assert.equal(source.trail.emitAccumulator,0);
    for(let i=0;i<6;i++){
      const oldNodes=state.orbs.flatMap(o=>{const a=[];for(let n=o.trail.particles.head;n;n=n.next)a.push(n);return a;});
      replacePreferences(sanitizePreset({schema:10,prefs:{orbs:i%2?[def('NEW')]:[]}}));resolveSettings();initOrbs();
      assert.equal(VisualizerRuntime.getParticleStats().activeParticles,0);assert.ok(oldNodes.every(n=>n.trail===null));
      context.nowSec++;VisualizerRuntime.update(context);
      assert.equal(VisualizerRuntime.getParticleStats().activeParticles,i%2?4:0);
      resetVisualizers("visuals");assert.equal(VisualizerRuntime.getParticleStats().activeParticles,0);
    }
  } finally{VisualizerRuntime.dispose();replacePreferences(oldPrefs);runtime.settings=oldSettings;state.orbs.length=0;state.orbs.push(...oldOrbs);}
});

test("RC-15 phase 2: admission itself enforces the shared frame ceiling across direct trail emission paths", () => {
  const {governor:g,trails:[a,b]}=retention(8);
  g.beginFrame();
  for(let i=0;i<policy.maxEmissionsPerFrame;i++) {
    assert.equal((i%2?a:b).emitAt(i,0,0,rgb),true);
  }
  assert.equal(g.stats.emissions,512);assert.equal(a.emitAt(9999,0,0,rgb),false);
  assert.equal(g.stats.emissions,512);assert.equal(g.activeParticles,8);
  g.finishFrame();g.dispose();
});

test("RC-15 phase 2: heap retirement agrees with an independent oldest model through churn", () => {
  const {governor:g,trails}=retention(32);
  let seed=71,serial=0;const model=[];
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let i=0;i<1500;i++){
    const owner=random()%2;
    if(i%17===0){trails[owner].reset();for(let j=model.length-1;j>=0;j--)if(model[j].owner===owner)model.splice(j,1);}
    else {
      const bornSec=random()%20;
      if(model.length===32){const oldest=[...model].sort((a,b)=>a.bornSec-b.bornSec||a.serial-b.serial)[0];model.splice(model.indexOf(oldest),1);}
      trails[owner].emitAt(serial,0,bornSec,rgb);model.push({owner,bornSec,serial:serial++});
    }
    assert.equal(g.activeParticles,model.length);
    for(let owner=0;owner<2;owner++)assert.deepEqual(particles(trails[owner]).map(p=>p.xSim),model.filter(p=>p.owner===owner).map(p=>p.serial));
    assert.ok(g.heap.every((n,index)=>n.heapIndex===index&&n.trail===trails[model.find(p=>p.serial===n.particle.xSim).owner]));
  }
  g.dispose();assert.equal(g.heap.length,0);assert.equal(g.nextPriority,null);
});

test("RC-15 phase 2: full adapter rebuild preserves surviving Orb history and clears replaced owners", () => {
  const s=scene(2,{maxEmissionsPerFrame:2,maxActiveParticles:8});
  try {
    s.tick();const [a,b]=s.orbs,g=a.trail.governor;
    const ah=particles(a.trail),an=a.trail.particles.head,oldAdapter=s.visualizers.getVisualizers()[1];
    a.trail.emitAccumulator=.5;
    const replaced=new Orb(def(b.id));
    s.orbs=[a,replaced];s.visualizers.rebuild(s.orbs);
    assert.deepEqual(particles(a.trail),ah);assert.equal(a.trail.particles.head,an);
    assert.equal(a.trail.emitAccumulator,.5);assert.notEqual(s.visualizers.getVisualizers()[1],oldAdapter);
    assert.equal(b.trail.particles.length,0);assert.notEqual(b.trail.governor,g);
    assertAccounting(s);s.tick();assertAccounting(s);
  }finally{s.visualizers.dispose();}
});

test("RC-15 phase 2: periodic low-rate demand cannot starve through cursor/clock alignment", () => {
  const s=scene(4,{maxEmissionsPerFrame:1},60);
  s.orbs[3].particles.emitPerSecond=15;
  try{
    for(let i=0;i<48;i++)s.tick();
    assert.deepEqual(counts(s),[12,12,12,12]);
    assertAccounting(s);
  }finally{s.visualizers.dispose();}
});
