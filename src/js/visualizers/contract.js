// 117-3.5a: module ABI versioning is independent of the immutable preset schemas.
export const VISUALIZER_CONTRACT_VERSION = 1;
const TYPE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CAPABILITIES = new Set(["update", "reset", "dispose", "fit"]);
const FIELDS = new Set(["contractVersion", "typeId", "name", "description", "multiplicity",
  "capabilities", "updateAfter", "optionalUpdateAfter", "ownsResources"]);

function identifiers(value, label) {
  if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !TYPE_ID.test(id)) ||
      new Set(value).size !== value.length) throw new Error(`${label}: expected unique type IDs`);
  return Object.freeze([...value]);
}

export function validateVisualizerManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Visualizer manifest");
  for (const key of Object.keys(value)) if (!FIELDS.has(key)) throw new Error(`Unknown Visualizer field: ${key}`);
  if (value.contractVersion !== VISUALIZER_CONTRACT_VERSION) throw new Error("Unsupported Visualizer contract version");
  if (typeof value.typeId !== "string" || !TYPE_ID.test(value.typeId)) throw new Error("Invalid Visualizer typeId");
  if (typeof value.name !== "string" || !value.name.trim()) throw new Error("Visualizer name is required");
  if (value.description !== undefined && typeof value.description !== "string") throw new Error("Invalid Visualizer description");
  if (!["single", "multiple"].includes(value.multiplicity)) throw new Error("Invalid Visualizer multiplicity");
  if (!Array.isArray(value.capabilities) || new Set(value.capabilities).size !== value.capabilities.length ||
      value.capabilities.some(capability => !CAPABILITIES.has(capability))) throw new Error("Invalid Visualizer capabilities");
  if (value.ownsResources !== undefined && typeof value.ownsResources !== "boolean") throw new Error("Invalid ownsResources");
  if (value.ownsResources && !value.capabilities.includes("dispose")) throw new Error("Resource owners must declare dispose");
  const updateAfter = identifiers(value.updateAfter ?? [], "updateAfter");
  const optionalUpdateAfter = identifiers(value.optionalUpdateAfter ?? [], "optionalUpdateAfter");
  if (updateAfter.some(id => optionalUpdateAfter.includes(id))) throw new Error("Overlapping Visualizer dependencies");
  return Object.freeze({ ...value, capabilities: Object.freeze([...value.capabilities]), updateAfter, optionalUpdateAfter });
}

function snapshotResourceBarrier(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Visualizer resource barrier");
  const { id, afterTypes, beforeTypes, begin, commit } = value;
  if (typeof id !== "string" || !TYPE_ID.test(id) || typeof commit !== "function" ||
      (begin !== undefined && typeof begin !== "function")) throw new Error("Invalid Visualizer resource barrier");
  // Keep opaque callback-owned service references, but snapshot every field that
  // determines dispatch/topology. The caller's declarations remain writable.
  return Object.freeze({ ...value, id, begin, commit,
    afterTypes: identifiers(afterTypes, "afterTypes"),
    beforeTypes: identifiers(beforeTypes, "beforeTypes"),
  });
}

// Type declaration order breaks dependency ties; instances of each type retain
// composition order. Shared commits are explicit graph nodes. Drawing is separate.
export function planVisualizerUpdates(manifests, barriers = []) {
  const nodes = new Map(manifests.map(manifest => [`type:${manifest.typeId}`, { typeId: manifest.typeId }]));
  if (nodes.size !== manifests.length) throw new Error("Duplicate Visualizer typeId");
  const edges = new Map([...nodes.keys()].map(id => [id, new Set()]));
  function edge(before, after) {
    if (!nodes.has(before) || !nodes.has(after)) throw new Error(`Missing required Visualizer dependency: ${before} -> ${after}`);
    edges.get(after).add(before);
  }
  for (const manifest of manifests) {
    for (const id of manifest.updateAfter) edge(`type:${id}`, `type:${manifest.typeId}`);
    for (const id of manifest.optionalUpdateAfter) if (nodes.has(`type:${id}`)) edge(`type:${id}`, `type:${manifest.typeId}`);
  }
  for (const declaration of barriers) {
    const barrier = snapshotResourceBarrier(declaration);
    const id = `barrier:${barrier.id}`;
    if (nodes.has(id)) throw new Error("Duplicate Visualizer resource barrier");
    nodes.set(id, { barrier }); edges.set(id, new Set());
    for (const type of barrier.afterTypes) edge(`type:${type}`, id);
    for (const type of barrier.beforeTypes) edge(id, `type:${type}`);
  }
  const result = [];
  const pending = new Map(nodes);
  while (pending.size) {
    const ready = [...pending.keys()].find(id => [...edges.get(id)].every(dependency => !pending.has(dependency)));
    if (!ready) throw new Error("Cyclic Visualizer update dependencies");
    result.push(pending.get(ready)); pending.delete(ready);
  }
  return Object.freeze(result.map(node => Object.freeze(node)));
}

export function createVisualizerCatalog(definitions) {
  const types = definitions.map(definition => {
    const manifest = validateVisualizerManifest(definition.manifest);
    if (typeof definition.createVisualizer !== "function") throw new Error(`Missing createVisualizer factory: ${manifest.typeId}`);
    return Object.freeze({ manifest, createVisualizer: definition.createVisualizer });
  });
  planVisualizerUpdates(types.map(type => type.manifest));
  const byId = new Map(types.map(type => [type.manifest.typeId, type]));
  return Object.freeze({ types: Object.freeze(types), get: typeId => byId.get(typeId) });
}
