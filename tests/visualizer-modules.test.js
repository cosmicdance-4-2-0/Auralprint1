import test from "node:test";
import assert from "node:assert/strict";
import { createVisualizerCatalog, validateVisualizerManifest, planVisualizerUpdates } from "../src/js/visualizers/contract.js";
import { createVisualizerHost } from "../src/js/visualizers/host.js";

function manifest(typeId = "marker", overrides = {}) {
  return { contractVersion: 1, typeId, name: typeId, multiplicity: "multiple", capabilities: [], ...overrides };
}
function catalog(definitions) { return createVisualizerCatalog(definitions); }
function type(typeId, createVisualizer, overrides) { return { manifest: manifest(typeId, overrides), createVisualizer }; }
const directDrawing = () => ({ drawing: Object.freeze({}), run: callback => callback() });
const definition = (typeId, instanceId, settings = {}) => ({ typeId, instanceId, settings });

test("module metadata rejects malformed/versioned contracts and executable catalog mistakes", () => {
  for (const invalid of [null, [], {}, manifest("../escape"), manifest("ok", { contractVersion: 2 }),
    manifest("ok", { capabilities: ["update", "update"] }), manifest("ok", { capabilities: ["unknown"] }),
    manifest("ok", { updateAfter: ["a", "a"] }), manifest("ok", { ownsResources: true }),
    manifest("ok", { entry: "../../escape.js" })]) assert.throws(() => validateVisualizerManifest(invalid));
  assert.throws(() => catalog([type("a", null)]), /factory/);
  assert.throws(() => catalog([type("a", () => ({})), type("a", () => ({}))]), /Duplicate/);
  const input = manifest("ok", { capabilities: ["reset"] });
  const result = validateVisualizerManifest(input);
  input.capabilities.push("update");
  assert.deepEqual(result.capabilities, ["reset"]);
  assert.ok(Object.isFrozen(result));
});

test("required/optional dependencies and static cycles are distinct", () => {
  const a = validateVisualizerManifest(manifest("a", { updateAfter: ["b"] }));
  const b = validateVisualizerManifest(manifest("b", { optionalUpdateAfter: ["absent"] }));
  assert.deepEqual(planVisualizerUpdates([a, b]).map(node => node.typeId), ["b", "a"]);
  assert.throws(() => planVisualizerUpdates([a]), /Missing required/);
  assert.throws(() => planVisualizerUpdates([a, validateVisualizerManifest(manifest("b", { updateAfter: ["a"] }))]), /Cyclic/);
  assert.throws(() => planVisualizerUpdates([b], [{ id: "commit", afterTypes: ["b"], beforeTypes: ["b"], commit() {} }]), /Cyclic/);
});

test("a static non-audio module activates explicitly and retains its identity/settings view", () => {
  let creations = 0, seen;
  const c = catalog([type("marker", ({ context }) => { creations++; seen = context; return { render(view) { assert.equal(view, seen); } }; })]);
  const h = createVisualizerHost({ catalog: c, drawing: directDrawing() });
  assert.equal(creations, 0); assert.deepEqual(h.getInstances(), []);
  const input = { color: "red", nested: [1] };
  const [handle] = h.reconcile([definition("marker", "spectral-ring", input)]);
  input.nested.push(2);
  assert.deepEqual(seen.settings.nested, [1]);
  assert.throws(() => { seen.settings.color = "blue"; }, TypeError);
  h.update({}); h.render({});
  assert.equal(h.reconcile([definition("marker", "spectral-ring", { color: "blue" })])[0], handle);
  assert.equal(seen.settings.color, "blue"); assert.equal(creations, 1);
  h.dispose(); assert.equal(handle.status, "disposed");
});

test("identity is type plus opaque ID; singleton/duplicate admission is atomic", () => {
  const c = catalog([type("a", () => ({ render() {} })), type("b", () => ({ render() {} }), { multiplicity: "single" })]);
  const h = createVisualizerHost({ catalog: c, drawing: directDrawing() });
  const handles = h.reconcile([definition("a", "same"), definition("b", "same")]);
  for (const invalid of [[definition("a", "same"), definition("a", "same")], [definition("b", "one"), definition("b", "two")],
    [definition("absent", "one")], [definition("a", "")]]) {
    assert.throws(() => h.reconcile(invalid)); assert.deepEqual(h.getInstances(), handles);
  }
  h.dispose();
});

test("resource barriers run after producer updates, before dependent updates, with independent drawing order", () => {
  const events = [];
  const c = catalog([
    type("ring", () => ({ render() { events.push("draw:ring"); }, update() { events.push("update:ring"); } }), { capabilities: ["update"], optionalUpdateAfter: ["orb"] }),
    type("orb", ({ instanceId }) => ({ render() { events.push(`draw:${instanceId}`); }, update() { events.push(`update:${instanceId}`); } }), { capabilities: ["update"] }),
  ]);
  const h = createVisualizerHost({ catalog: c, drawing: directDrawing(), barriers: [{ id: "particles", afterTypes: ["orb"], beforeTypes: ["ring"],
    begin() { events.push("begin"); }, commit() { events.push("commit"); } }] });
  h.reconcile([definition("ring", "ring"), definition("orb", "b"), definition("orb", "a")]);
  h.update({}); h.render({});
  assert.deepEqual(events, ["begin", "update:b", "update:a", "commit", "update:ring", "draw:ring", "draw:b", "draw:a"]);
  events.length = 0;
  h.reconcile([definition("ring", "ring")]); h.update({});
  assert.deepEqual(events, ["begin", "commit", "update:ring"]);
  h.dispose();
});

test("operation views follow fresh analysis/world/viewport/clocks without replacing the view", () => {
  let view, observed;
  const services = { world: Object.freeze({ width: 10 }), viewport: Object.freeze({ dpr: 1 }) };
  const h = createVisualizerHost({ catalog: catalog([type("a", () => ({ render(context) {
    view = context;
    observed = { analysis: context.analysisFrame, world: context.world,
      time: [context.time.emissionDtSec, context.time.motionDtSec, context.time.nowSec, context.time.simPaused] };
  } }))]), drawing: directDrawing(), services });
  h.reconcile([definition("a", "a")]);
  const frame = { analysisFrame: { channels: { C: { waveform: new Float32Array([0.5]) } } }, dtSec: 0.01, motionDtSec: 0.02, nowSec: 3, simPaused: true };
  h.render(frame); const original = view;
  assert.equal(observed.analysis, frame.analysisFrame); assert.equal(observed.world, services.world);
  assert.deepEqual(observed.time, [0.01, 0.02, 3, true]);
  assert.equal(view.analysisFrame, null, "frame borrow ends with the operation");
  frame.analysisFrame.channels.C.waveform[0] = 0.75;
  services.world = Object.freeze({ width: 20 });
  h.render(frame); assert.equal(view, original); assert.equal(view.world.width, 20);
  h.dispose();
});

test("failure suspends one instance until successful explicit reset; independent instances continue", () => {
  const drawn = [], reasons = [];
  let failing = true;
  const h = createVisualizerHost({ catalog: catalog([type("a", ({ instanceId }) => ({
    render() { if (instanceId === "bad" && failing) throw new Error("bad draw"); drawn.push(instanceId); },
    reset(reason) { reasons.push(reason); failing = false; },
  }), { capabilities: ["reset"] })]), drawing: directDrawing() });
  h.reconcile([definition("a", "bad"), definition("a", "good")]);
  h.render({}); h.render({});
  assert.deepEqual(drawn, ["good", "good"]); assert.equal(h.getFailures().length, 1);
  assert.equal(h.getInstances()[0].status, "suspended");
  h.reset("track"); h.render({});
  assert.deepEqual(drawn.slice(-2), ["bad", "good"]); assert.deepEqual(reasons, ["track", "track"]);
  h.dispose();
});

test("partial factory creation unwinds registered ownership and preserves previous survivors", () => {
  const cleanup = [];
  const h = createVisualizerHost({ catalog: catalog([
    type("good", () => ({ render() {} })),
    type("bad", ({ onDispose }) => { onDispose(() => cleanup.push("first")); onDispose(() => cleanup.push("second")); throw new Error("factory failed"); },
      { ownsResources: true, capabilities: ["dispose"] }),
  ]), drawing: directDrawing() });
  const previous = h.reconcile([definition("good", "old", { value: 1 })]);
  assert.throws(() => h.reconcile([definition("good", "old", { value: 2 }), definition("good", "new"), definition("bad", "new")]), /factory failed/);
  assert.deepEqual(cleanup, ["second", "first"]); assert.deepEqual(h.getInstances(), previous);
  assert.equal(h.getUnresolvedOwnership().length, 0); h.dispose();
});

test("cleanup failures retain ownership, block reuse and retry only unsuccessful cleanup", () => {
  let allowed = false, disposal = 0, successfulCleanup = 0, failedCleanup = 0;
  const h = createVisualizerHost({ catalog: catalog([type("a", ({ onDispose }) => {
    onDispose(() => { successfulCleanup++; });
    onDispose(() => { failedCleanup++; if (!allowed) throw new Error("not released"); });
    return { render() {}, dispose() { disposal++; } };
  }, { ownsResources: true, capabilities: ["dispose"] })]), drawing: directDrawing() });
  h.reconcile([definition("a", "one")]); h.reconcile([]);
  assert.equal(h.getUnresolvedOwnership()[0].status, "cleanup-failed");
  assert.throws(() => h.reconcile([definition("a", "one")]), /unresolved/);
  allowed = true; assert.equal(h.dispose(), true); assert.equal(h.dispose(), true);
  assert.deepEqual([disposal, successfulCleanup, failedCleanup], [1, 1, 2]);
});

test("minimum hooks, capabilities, async factories and async render are checked separately from JSON", async () => {
  for (const factory of [() => ({}), () => ({ render() {}, update() {} }), async () => ({ render() {} })]) {
    const h = createVisualizerHost({ catalog: catalog([type("a", factory)]), drawing: directDrawing() });
    assert.throws(() => h.reconcile([definition("a", "one")])); h.dispose();
  }
  const h = createVisualizerHost({ catalog: catalog([type("a", () => ({ async render() { throw new Error("async failure"); } }))]), drawing: directDrawing() });
  h.reconcile([definition("a", "one")]); h.render({});
  assert.equal(h.getInstances()[0].status, "suspended"); assert.match(h.getFailures()[0].error.message, /synchronous/);
  await new Promise(resolve => setImmediate(resolve)); h.dispose();
});

test("sizing requests have explicit units/bounds and an advisory response without geometry mutation", () => {
  let context;
  const h = createVisualizerHost({ catalog: catalog([type("a", args => { context = args.context; return { render() {} }; })]), drawing: directDrawing() });
  const request = { units: "css-pixels", min: { width: 1, height: 2 }, desired: { width: 10, height: 20 }, max: { width: 100, height: 200 } };
  h.reconcile([{ ...definition("a", "one"), outputExtent: request }]);
  assert.equal(context.outputExtent.status, "advisory"); assert.deepEqual(context.outputExtent.request, request);
  for (const bad of [{ ...request, units: "pixels" }, { ...request, desired: { width: 0, height: 2 } }, { ...request, max: { width: 2, height: 3 } }]) {
    assert.throws(() => h.reconcile([{ ...definition("a", "one"), outputExtent: bad }]));
  }
  h.dispose();
});

test("settings admission rejects mutable container types and cycles before changing survivors", () => {
  const h = createVisualizerHost({ catalog: catalog([type("a", () => ({ render() {} }))]), drawing: directDrawing() });
  const original = h.reconcile([definition("a", "one")]);
  const cycle = {}; cycle.self = cycle;
  for (const settings of [new Map([["x", 1]]), new Set([1]), new Float32Array([1]), new Date(), { value: Infinity }, cycle]) {
    assert.throws(() => h.reconcile([definition("a", "one", settings)]));
    assert.deepEqual(h.getInstances(), original);
  }
  h.dispose();
});

test("host barriers commit with no activation and stop dependent updates on failure", () => {
  const events = [];
  let failed = false;
  const h = createVisualizerHost({ catalog: catalog([type("a", () => ({ render() {}, update() { events.push("update"); } }), { capabilities: ["update"] })]),
    drawing: directDrawing(), barriers: [{ id: "resource", afterTypes: [], beforeTypes: ["a"],
      begin() { events.push("begin"); }, commit() { events.push("commit"); if (failed) throw new Error("shared commit failed"); } }] });
  h.update({}); assert.deepEqual(events, ["begin", "commit"]);
  h.reconcile([definition("a", "one")]); events.length = 0; failed = true;
  assert.throws(() => h.update({}), /shared commit failed/);
  assert.deepEqual(events, ["begin", "commit"]); assert.equal(h.getInstances()[0].status, "active");
  h.dispose();
});
