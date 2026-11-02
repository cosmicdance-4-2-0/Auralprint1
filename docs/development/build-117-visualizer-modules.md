# Build 117 Visualizer discovery proof

First implementation pass: **117-3.5a**, based on `v117_dev` `e6533e8` / merged PR #107.
The owner authorized starting the modular rewrite. This is a reviewable ABI/discovery
candidate; it does not promote the full architecture or complete the measurement baseline.
The existing Orb/Ring simulation, renderer, editors, presets, CONFIG, schema 16, version
and protected fixtures are unchanged. Orb/Ring adapter migration remains the next pass.

## Add a type

Use `src/js/visualizers/<directory>/visualizer.json` and `index.js`. Directory names and
type IDs are lowercase kebab case. Build and watch share one discovery plugin; it emits
static imports into `catalog.js` for both editions. No generator command, dependency or
hand-maintained import list is needed. Source-only diagnostics use an empty extension
catalog. Discovery validates factories without creating instances or adding preset data.
The actual `createHost` activation API from `modules.js` is bundled in the application;
the native proof exposes that existing API rather than injecting a replacement registry
or implementation. The default application creates no extension host or backing canvas.

Minimal metadata:

```json
{
  "contractVersion": 1,
  "typeId": "example",
  "name": "Example",
  "multiplicity": "multiple",
  "capabilities": []
}
```

Export synchronous `createVisualizer({ instanceId, context, onDispose })` returning an
object with synchronous `render(context)`. A static, non-audio type needs no other hooks.
Declare implemented `update`, `reset`, `dispose` and `fit` hooks in `capabilities`.
Resource owners declare `ownsResources: true` plus `dispose`; register partial-creation
cleanup with `onDispose` during the factory call. Registered callbacks run on creation
failure and normal teardown; `dispose` must not release those same resources again.
Each resource has one cleanup owner. The [contract validator](../../src/js/visualizers/contract.js)
owns exact metadata fields. Missing named exports fail bundling; callable factories and
returned hook/capability agreement are checked separately at registration/activation.

Malformed metadata, duplicate type IDs, unsupported versions, missing required type
dependencies, update-dependency cycles, missing entry files and symlink paths fail the
build. Watch preserves valid outputs on failure, observes directory additions/removals,
and fences publication against current manifest bytes and directory membership.

## Activate and operate

`createVisualizerHost` accepts a catalog and explicit runtime-only instance definitions:
`{ typeId, instanceId, settings, visible?, outputExtent? }`. Identity is the pair of type
and opaque instance ID. Reconciliation retains surviving factories, replaces their scoped
settings views, and admits the whole request before mutation. Settings are copied/frozen
plain data; callers must supply normalized settings. This is not a new Scene normalizer.
Singleton admission covers the entire owned lifetime, including failed creation/cleanup.
To change a singleton ID, first remove it and confirm cleanup, then activate the new ID.
Unresolved singleton ownership blocks all alternate IDs of that type in the same host;
independent types remain usable.

The reused operation context supplies scoped settings, borrowed read-only analysis,
emission/motion/real clocks, pause, and host-supplied world/viewport/projection views.
The caller supplies read-only world/view services. Analysis is available only during
synchronous operations; retaining borrowed arrays does not create a snapshot or freshness
key. Modules have no Web Audio or writable application-state service.

`updateAfter` requires registered types; `optionalUpdateAfter` tolerates absent types.
Host-supplied resource barriers declare `afterTypes`, `beforeTypes`, `begin` and `commit`.
Updates follow the graph, including barriers with zero active producers; drawing follows
composition order. Unrelated types use catalog declaration order as the update tie breaker;
instances within a type follow composition order. The compiled schedule, dependency arrays
and hook slots are read-only snapshots. Changing that registration requires a new host; begin and commit
receive the same compiled descriptor. Callback-owned services/state remain separate.
Shared barrier failures abort dependent work and propagate to the host.
Visibility affects drawing, not update/analysis requirements. Fit hooks return type-owned
primitives for the eventual Camera adapter; existing Camera Fit is unchanged.

Optional output extents use `world-units` or `css-pixels`, with width/height pairs for
`min`, `desired`, `max`. The response is explicitly **advisory**. No automatic scaling,
clipping, geometry changes or claim that the request was satisfied is made.

## Drawing, failure and ownership

The prototype Canvas facade exposes `strokeWorldPath`, with world coordinates and CSS
stroke width. The host supplies projection to backing pixels and current DPR. Raw canvas
context/stack access is absent. A lazily allocated scratch canvas discards a failed
instance's partial draw before compositing; independent instances continue. Zero-sized
viewports skip drawing safely. Host disposal releases its scratch drawing resource.

This is a trusted-code ABI, not a JavaScript security sandbox. The scratch surface adds
one canvas-sized backing store and compositing work per host. No performance advantage
or suitability for migrating the current high-density Orb/Trace renderer is established.

Hook failure suspends that instance. Explicit successful reset can recover an instance
with a reset hook; otherwise remove/recreate it. Disposal continues across independent
instances. Failed cleanup retains ownership evidence, blocks reuse of that identity,
and is retried by host disposal without repeating successful cleanup. Reporting failure
does not establish native resource release.

## Verification and next boundary

The follow-up contract review reproduced singleton ownership bypass and mutable resource
scheduling on `e198344`. The [six regression cases](../../tests/visualizer-contract-review.test.js)
include five that failed on that head; all pass with the admission and snapshot fixes.
This tightens the unpublished version-1 candidate without changing the preset schema,
the existing Orb/Ring runtime or the drawing implementation.
Follow-up local checks: **1,578 passed, zero failed, one existing opt-in skip**;
build/distribution and protected-path comparison passed. Dependencies were reused from
an installation with identical package/lock files and matching versions; offline
reinstallation lacked the cached Playwright archive. No matching local browser is
installed in this environment; current-head native results are recorded in
[PR #109 CI](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/109/checks).

Run the standard [sequential checks](../../README.md#developer-bootstrap), then:

```sh
node scripts/validate-117-visualizer-modules.mjs
```

The validator adds/removes the independent [test module](../../tests/support/visualizer-proof/index.js)
in disposable builds. It checks both editions, explicit activation, survivor identity,
native pixels, partial-draw failure/recovery, zero viewport and DPR resizing. Test seams
and the example are not shipped. `AP_CHROMIUM_PATH` optionally selects an explicit local
browser; report that browser separately from pinned Playwright CI. Ubuntu CI runs this
validator after its existing browser gates.

Initial discovery proof on `e198344`: locked offline installation; **1,572 Node tests passed,
zero failed, one existing opt-in skip**; build/distribution verification passed. The
module validator and all existing mandatory Camera, editing, compact-preset, Queue/Trace
and accessibility browser gates passed on separately restored **Chromium 153.0.8010.0**.
Existing gates used an external launcher override; project dependencies and assertions
were unchanged. Pinned Chromium CI is a separate environment. Two later full reruns
hit the unchanged `prepareWatchBuild` output-directory absence assertion; the isolated
check, a diagnostic full run and a clean pre-build full run passed. The cause remains unresolved and no assertion
was changed. No owner-device, performance, memory-soak or release acceptance is inferred.

Next: review this contract/discovery proof, complete the outstanding baseline work,
review upstream analysis requirements, then migrate Orb/Ring and their drawing/Fit/editor
adapters with exact protected behavior and measured rendering cost. No default activation,
new persisted type format, Simple/Advanced mode or release promotion is included here.
