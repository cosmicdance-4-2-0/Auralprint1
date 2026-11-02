import { planVisualizerUpdates } from "./contract.js";

function frozenCopy(value) {
  const copy = structuredClone(value);
  const ancestors = new Set();
  function freeze(object) {
    if (object && typeof object === "object") {
      if (ancestors.has(object) || (!Array.isArray(object) && Object.getPrototypeOf(object) !== Object.prototype)) {
        throw new Error("Visualizer data must be acyclic plain objects and arrays");
      }
      ancestors.add(object);
      for (const child of Object.values(object)) freeze(child);
      ancestors.delete(object);
      Object.freeze(object);
    } else if (object !== null && !["undefined", "boolean", "string", "number"].includes(typeof object)) {
      throw new Error("Unsupported Visualizer data");
    } else if (typeof object === "number" && !Number.isFinite(object)) {
      throw new Error("Visualizer data must contain finite numbers");
    }
    return object;
  }
  return freeze(copy);
}

function outputExtent(request) {
  if (request === undefined) return null;
  if (!request || !["world-units", "css-pixels"].includes(request.units)) throw new Error("Output extent units are required");
  for (const key of Object.keys(request)) if (!["units", "min", "desired", "max"].includes(key)) throw new Error("Unknown output extent field");
  for (const name of ["min", "desired", "max"]) if (request[name] !== undefined) {
    const size = request[name];
    if (!size || Object.keys(size).some(key => !["width", "height"].includes(key)) ||
        ![size.width, size.height].every(value => Number.isFinite(value) && value > 0)) throw new Error("Invalid output extent dimensions");
  }
  for (const axis of ["width", "height"]) {
    const values = [request.min?.[axis], request.desired?.[axis], request.max?.[axis]].filter(value => value !== undefined);
    if (values.some((value, index) => index && value < values[index - 1])) throw new Error("Inconsistent output extent bounds");
  }
  return Object.freeze({ request: frozenCopy(request), status: "advisory" });
}

function syncResult(value) {
  if (value && typeof value.then === "function") {
    // A broken async hook must not create an unhandled rejection after suspension.
    Promise.resolve(value).catch(() => {});
    throw new Error("Visualizer factories and hooks must be synchronous");
  }
  return value;
}

// 117-3.5a: opt-in host. The existing Orb/Ring runtime is intentionally separate
// until its adapters pass migration/fidelity review. No source/preset authority.
export function createVisualizerHost({ catalog, drawing, services = {}, barriers = [], reportFailure = () => {} }) {
  let records = [];
  let schedule = [];
  let currentFrame = null;
  let disposed = false;
  let operating = false;
  let drawingReleased = false;
  const retired = new Set();
  const failures = [];
  const manifests = catalog.types.map(type => type.manifest);
  const plan = planVisualizerUpdates(manifests, barriers);
  const resourceBarriers = plan.filter(node => node.barrier).map(node => node.barrier);
  schedule = plan.filter(node => node.barrier);

  function report(record, operation, error) {
    const failure = Object.freeze({ typeId: record?.typeId ?? null, instanceId: record?.instanceId ?? null, operation, error });
    failures.push(failure);
    try { reportFailure(failure); } catch (reportError) { failures.push(Object.freeze({ ...failure, operation: "reportFailure", error: reportError })); }
  }
  function exclusive(operation) {
    if (operating) throw new Error("Reentrant Visualizer host operation");
    operating = true;
    try { return operation(); } finally { operating = false; currentFrame = null; }
  }
  function call(record, method, argument) {
    if (typeof record.api?.[method] === "function") return syncResult(record.api[method](argument));
  }
  function release(record) {
    let complete = true;
    if (!record.disposed) {
      try { call(record, "dispose"); record.disposed = true; }
      catch (error) { complete = false; report(record, "dispose", error); }
    }
    for (const cleanup of record.cleanups) if (!cleanup.done) {
      try { syncResult(cleanup.run()); cleanup.done = true; }
      catch (error) { complete = false; report(record, "cleanup", error); }
    }
    // A retained identity handle must not retain completed cleanup closures or
    // a disposed implementation. Keep only unresolved ownership for retries.
    record.cleanups = record.cleanups.filter(cleanup => !cleanup.done);
    if (record.disposed) record.api = null;
    if (complete) { record.settings = null; record.outputExtent = null; }
    record.status = complete ? "disposed" : "cleanup-failed";
    if (complete) retired.delete(record); else retired.add(record);
    return complete;
  }
  function createRecord(type, definition) {
    const record = { ...definition, cleanups: [], api: null, status: "active", disposed: false };
    const time = Object.freeze({
      get emissionDtSec() { return currentFrame?.dtSec ?? 0; },
      get motionDtSec() { return currentFrame?.motionDtSec ?? currentFrame?.dtSec ?? 0; },
      get nowSec() { return currentFrame?.nowSec ?? 0; },
      get simPaused() { return currentFrame?.simPaused ?? false; },
    });
    // These operation views are reused. Analysis arrays are borrowed producer
    // data, read-only by ABI; they are neither snapshots nor mutable host state.
    const context = Object.freeze({
      get settings() { return record.settings; },
      get analysisFrame() { return currentFrame?.analysisFrame ?? null; },
      get world() { return services.world ?? null; },
      get viewport() { return services.viewport ?? null; },
      get projection() { return services.projection ?? null; },
      get outputExtent() { return record.outputExtent; },
      drawing: drawing?.drawing ?? null,
      time,
    });
    record.context = context;
    record.handle = Object.freeze({
      typeId: record.typeId, instanceId: record.instanceId,
      get status() { return record.status; },
    });
    let creating = true;
    try {
      record.api = syncResult(type.createVisualizer(Object.freeze({
        instanceId: record.instanceId, context,
        onDispose(run) {
          if (!creating || typeof run !== "function") throw new Error("Register cleanup synchronously during factory creation");
          record.cleanups.unshift({ run, done: false });
        },
      })));
      if (!record.api || typeof record.api.render !== "function") throw new Error("Visualizer render hook is required");
      for (const hook of ["update", "reset", "dispose", "fit"]) {
        const declared = type.manifest.capabilities.includes(hook);
        if (declared !== (typeof record.api[hook] === "function") ||
            (record.api[hook] !== undefined && typeof record.api[hook] !== "function")) throw new Error(`Visualizer capability mismatch: ${hook}`);
      }
      if (record.cleanups.length && !type.manifest.ownsResources) throw new Error("Cleanup requires ownsResources metadata");
      return record;
    } catch (error) {
      report(record, "create", error); release(record); throw error;
    } finally { creating = false; }
  }
  function dispatch(record, operation, argument) {
    if (record.status !== "active") return;
    try {
      if (operation === "render") {
        if (!drawing?.run) throw new Error("Visualizer drawing boundary is unavailable");
        drawing.run(() => call(record, operation, record.context));
      } else call(record, operation, argument ?? record.context);
    } catch (error) { record.status = "suspended"; report(record, operation, error); }
  }

  function reconcile(definitions) {
    return exclusive(() => {
      if (disposed) throw new Error("Visualizer host is disposed");
      const identities = new Map();
      const counts = new Map();
      // Validate the whole request before creation or mutation of survivors.
      const requests = definitions.map(definition => {
        const type = catalog.get(definition.typeId);
        if (!type) throw new Error(`Unknown Visualizer type: ${definition.typeId}`);
        if (typeof definition.instanceId !== "string" || !definition.instanceId.length) throw new Error("Visualizer instanceId is required");
        if (definition.visible !== undefined && typeof definition.visible !== "boolean") throw new Error("Invalid Visualizer visibility");
        const ids = identities.get(definition.typeId) ?? new Set();
        if (ids.has(definition.instanceId)) throw new Error("Duplicate Visualizer instance identity");
        ids.add(definition.instanceId); identities.set(definition.typeId, ids);
        const count = (counts.get(definition.typeId) ?? 0) + 1;
        counts.set(definition.typeId, count);
        if (type.manifest.multiplicity === "single" && count > 1) throw new Error("Singleton Visualizer admission exceeded");
        if ([...retired].some(record => record.typeId === definition.typeId && record.instanceId === definition.instanceId)) throw new Error("Visualizer cleanup is unresolved");
        // 117-3.5a contract review: a singleton owns its slot through teardown.
        // Staging another identity before removal would overlap its resources.
        if (type.manifest.multiplicity === "single" && (
          records.some(record => record.typeId === definition.typeId && record.instanceId !== definition.instanceId) ||
          [...retired].some(record => record.typeId === definition.typeId)
        )) throw new Error("Singleton Visualizer identity is still owned; remove and confirm cleanup before replacement");
        return { type, definition: { typeId: definition.typeId, instanceId: definition.instanceId,
          settings: frozenCopy(definition.settings ?? {}), visible: definition.visible ?? true,
          outputExtent: outputExtent(definition.outputExtent) } };
      });
      const created = [];
      const previous = new Map();
      for (const record of records) {
        if (!previous.has(record.typeId)) previous.set(record.typeId, new Map());
        previous.get(record.typeId).set(record.instanceId, record);
      }
      let next;
      try {
        next = requests.map(({ type, definition }) => {
          const retained = previous.get(definition.typeId)?.get(definition.instanceId);
          if (retained) return retained;
          const record = createRecord(type, definition); created.push(record); return record;
        });
      } catch (error) { for (const record of created) release(record); throw error; }
      const survivors = new Set(next);
      for (const record of records) if (!survivors.has(record)) release(record);
      next.forEach((record, index) => Object.assign(record, requests[index].definition));
      records = next;
      schedule = plan.flatMap(node => node.barrier ? [node] : records.filter(record => record.typeId === node.typeId));
      return records.map(record => record.handle);
    });
  }
  return Object.freeze({
    reconcile,
    update(frame) {
      return exclusive(() => {
        if (disposed) return;
        currentFrame = frame;
        // Barrier errors are host failures and abort dependent work; they are
        // never attributed to another instance or silently treated as success.
        for (const barrier of resourceBarriers) if (barrier.begin) syncResult(barrier.begin(frame));
        for (const node of schedule) {
          if (node.barrier) syncResult(node.barrier.commit(frame));
          else dispatch(node, "update");
        }
      });
    },
    render(frame) {
      return exclusive(() => {
        if (disposed) return;
        currentFrame = frame;
        for (const record of records) if (record.visible) dispatch(record, "render");
      });
    },
    reset(reason) {
      return exclusive(() => {
        if (disposed) return;
        for (const record of records) {
          if (record.status === "suspended" && typeof record.api.reset !== "function") continue;
          try { call(record, "reset", reason); record.status = "active"; }
          catch (error) { record.status = "suspended"; report(record, "reset", error); }
        }
      });
    },
    getFitPrimitives(frame) {
      return exclusive(() => {
        if (disposed) return [];
        currentFrame = frame;
        const result = [];
        for (const record of records) if (record.visible && record.status === "active" && record.api.fit) {
          try { result.push(Object.freeze({ identity: record.handle, primitives: frozenCopy(call(record, "fit", record.context)) })); }
          catch (error) { record.status = "suspended"; report(record, "fit", error); }
        }
        return result;
      });
    },
    dispose() {
      return exclusive(() => {
        disposed = true;
        for (const record of new Set([...records, ...retired])) release(record);
        records = []; schedule = [];
        if (!drawingReleased) {
          try { if (drawing?.dispose) syncResult(drawing.dispose()); drawingReleased = true; }
          catch (error) { report(null, "drawing-dispose", error); }
        }
        return retired.size === 0 && drawingReleased;
      });
    },
    getInstances: () => records.map(record => record.handle),
    getFailures: () => [...failures],
    getUnresolvedOwnership: () => [...retired].map(record => record.handle),
  });
}
