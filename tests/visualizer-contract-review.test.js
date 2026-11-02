import test from "node:test";
import assert from "node:assert/strict";
import { createVisualizerCatalog, planVisualizerUpdates } from "../src/js/visualizers/contract.js";
import { createVisualizerHost } from "../src/js/visualizers/host.js";

const manifest = (typeId, extra = {}) => ({ contractVersion: 1, typeId, name: typeId,
  multiplicity: "multiple", capabilities: [], ...extra });
const definition = (typeId, instanceId) => ({ typeId, instanceId, settings: {} });
const drawing = () => ({ drawing: Object.freeze({}), run: render => render() });

test("singleton replacement requires completed removal before a different factory can start", () => {
  let live = 0, created = 0, maximumLive = 0, unrelatedCreated = 0;
  const catalog = createVisualizerCatalog([
    { manifest: manifest("single", { multiplicity: "single", ownsResources: true, capabilities: ["dispose"] }),
      createVisualizer() {
        created++; live++; maximumLive = Math.max(maximumLive, live);
        return { render() {}, dispose() { live--; } };
      } },
    { manifest: manifest("other"), createVisualizer() { unrelatedCreated++; return { render() {} }; } },
  ]);
  const host = createVisualizerHost({ catalog, drawing: drawing() });
  try {
    const [original] = host.reconcile([definition("single", "old")]);
    assert.throws(() => host.reconcile([definition("other", "staged"), definition("single", "new")]), /Singleton/);
    assert.deepEqual(host.getInstances(), [original]);
    assert.deepEqual([created, unrelatedCreated, live], [1, 0, 1], "admission precedes every factory");
    host.reconcile([]); assert.equal(live, 0);
    host.reconcile([definition("single", "new")]);
    assert.equal(maximumLive, 1);
  } finally { host.dispose(); }
  assert.equal(live, 0);
});

test("failed singleton disposal blocks alternate IDs while unrelated types remain usable", () => {
  let cleanupAllowed = false, live = 0;
  const catalog = createVisualizerCatalog([
    { manifest: manifest("single", { multiplicity: "single", ownsResources: true, capabilities: ["dispose"] }),
      createVisualizer() { live++; return { render() {}, dispose() {
        if (!cleanupAllowed) throw new Error("native ownership retained");
        live--;
      } }; } },
    { manifest: manifest("other"), createVisualizer: () => ({ render() {} }) },
  ]);
  const host = createVisualizerHost({ catalog, drawing: drawing() });
  try {
    host.reconcile([definition("single", "old")]); host.reconcile([]);
    assert.equal(host.getUnresolvedOwnership()[0].instanceId, "old");
    assert.throws(() => host.reconcile([definition("single", "new")]), /Singleton/);
    assert.equal(live, 1);
    host.reconcile([definition("other", "independent")]); host.render({});
    assert.equal(host.getInstances()[0].status, "active");
  } finally { cleanupAllowed = true; assert.equal(host.dispose(), true); }
  assert.equal(live, 0);
});

test("partial factory cleanup failure also retains its singleton admission slot", () => {
  let cleanupAllowed = false, factoryCalls = 0, live = 0;
  const catalog = createVisualizerCatalog([{ manifest: manifest("single", {
    multiplicity: "single", ownsResources: true, capabilities: ["dispose"],
  }), createVisualizer({ onDispose }) {
    factoryCalls++; live++;
    onDispose(() => { if (!cleanupAllowed) throw new Error("partial ownership retained"); live--; });
    throw new Error("partial factory failed");
  } }]);
  const host = createVisualizerHost({ catalog, drawing: drawing() });
  try {
    assert.throws(() => host.reconcile([definition("single", "old")]), /partial factory failed/);
    assert.equal(host.getUnresolvedOwnership().length, 1);
    assert.throws(() => host.reconcile([definition("single", "new")]), /Singleton/);
    assert.deepEqual([factoryCalls, live], [1, 1]);
  } finally { cleanupAllowed = true; assert.equal(host.dispose(), true); }
  assert.equal(live, 0);
});

test("resource scheduling snapshots caller-owned descriptors, arrays and hook references", () => {
  const events = [];
  const catalog = createVisualizerCatalog([{ manifest: manifest("marker"), createVisualizer: () => ({ render() {} }) }]);
  const barrier = { id: "shared", afterTypes: [], beforeTypes: ["marker"],
    begin() { events.push(`begin:${this.id}`); }, commit() { events.push(`commit:${this.id}`); } };
  const barriers = [barrier];
  const host = createVisualizerHost({ catalog, drawing: drawing(), barriers });
  barrier.id = "changed"; barrier.afterTypes.push("absent"); barrier.beforeTypes.length = 0;
  barrier.begin = () => events.push("changed begin"); barrier.commit = () => events.push("changed commit");
  barriers.splice(0, 1, { id: "unplanned", afterTypes: [], beforeTypes: [],
    begin() { events.push("unplanned begin"); }, commit() { events.push("unplanned commit"); } });
  try {
    host.update({});
    assert.deepEqual(events, ["begin:shared", "commit:shared"]);
  } finally { host.dispose(); }
});

test("compiled plans are read-only without freezing the caller's resource metadata", () => {
  const catalog = createVisualizerCatalog([{ manifest: manifest("marker"), createVisualizer: () => ({ render() {} }) }]);
  const resource = { id: "shared", afterTypes: [], beforeTypes: ["marker"], commit() {} };
  const plan = planVisualizerUpdates(catalog.types.map(type => type.manifest), [resource]);
  const compiled = plan.find(node => node.barrier).barrier;
  resource.id = "changed"; resource.beforeTypes.length = 0;
  assert.equal(compiled.id, "shared"); assert.deepEqual(compiled.beforeTypes, ["marker"]);
  assert.throws(() => { compiled.commit = () => {}; }, TypeError);
  assert.throws(() => { compiled.beforeTypes.push("absent"); }, TypeError);
  assert.throws(() => { plan[0] = {}; }, TypeError);
});

test("resource begin and commit receive the same compiled descriptor", () => {
  const catalog = createVisualizerCatalog([{ manifest: manifest("marker"), createVisualizer: () => ({ render() {} }) }]);
  let began, committed = false;
  const host = createVisualizerHost({ catalog, drawing: drawing(), barriers: [{ id: "shared", afterTypes: [], beforeTypes: ["marker"],
    begin() { began = this; }, commit() { assert.equal(this, began); committed = true; } }] });
  try { host.update({}); assert.equal(committed, true); } finally { host.dispose(); }
});
