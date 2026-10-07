# Audit reproduction and evidence bundle

Associated report: [2026-10-06_214431_PDT-release-audit.md](../../2026-10-06_214431_PDT-release-audit.md).

Audited source: `0cd79958d3f0156d52c4f68e36458298d6accd9b` / `v0.1.15m.h`. These are read-only audit probes. They assert **observed defective behavior**, including positive controls where relevant. Successful execution reproduces the findings; it does not establish that the application is correct. Run against the pinned original source. Correcting a defect is expected to invalidate its assertion.

The Node-only preset and render probes need no extra project dependency. Browser probes require an externally available Playwright module and Chromium. The project dependency manifest has not been changed. The recorded environment used Node v24.19.0, Python 3.12.14, npm 11.9.0, esbuild 0.25.12 and Chromium 151.0.7922.173 on Linux.

From the repository root, install/build sequentially before using browser probes:

```sh
npm ci
npm test
npm run build
```

Run Node probes:

```sh
node docs/audits/evidence/2026-10-06_214431_PDT/presets/repro.mjs
node docs/audits/evidence/2026-10-06_214431_PDT/render_analysis/reproduce-render-analysis.mjs
node docs/audits/evidence/2026-10-06_214431_PDT/presets/id-worker.mjs control
timeout 2s node docs/audits/evidence/2026-10-06_214431_PDT/presets/id-worker.mjs huge-add
timeout 2s node docs/audits/evidence/2026-10-06_214431_PDT/presets/id-worker.mjs huge-import
```

The ordinary ID control exits 0 and allocates ORB43. Both dangerous workers intentionally stall and must be terminated externally: GNU timeout exits **124**, which is the recorded hang result. Do not load their dangerous hashes into a browser session containing unsaved work. Platforms without GNU timeout should run the workers under an equivalent external process deadline.

Browser probes default to `/usr/bin/chromium` where supplied; recording probes use Playwright's normal browser resolution unless `AUDIT_CHROMIUM_PATH` is set. Set both supported browser-variable spellings when selecting a different executable:

```sh
export AUDIT_CHROMIUM=/usr/bin/chromium
export AUDIT_CHROMIUM_PATH=/usr/bin/chromium
node docs/audits/evidence/2026-10-06_214431_PDT/audio/browser-repros.cjs
node docs/audits/evidence/2026-10-06_214431_PDT/recording/native-capture.cjs
node docs/audits/evidence/2026-10-06_214431_PDT/recording/finalizing-eof.cjs
node docs/audits/evidence/2026-10-06_214431_PDT/ui/reproduce-ui-focus.cjs
```

Those probes provide their own temporary HTTP server or Playwright routing. They do not call an external service. Audio uses the actual source template/modules; recording EOF uses the built HTML with test-only object exposure and native callback scheduling. Live acquisition returns real generated MediaStreams. Recording native capture serves source modules and draws a real canvas. UI focus serves the actual built HTML. Touch seeking uses synthetic standard TouchEvents, not physical mobile hardware.

For the UI controls and packaging probes, serve the built artifact in a separate shell:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Then run:

```sh
node docs/audits/evidence/2026-10-06_214431_PDT/ui/ui-control-repro.cjs
node docs/audits/evidence/2026-10-06_214431_PDT/packaging.cjs
```

`AUDIT_APP_URL` can override the default built-page URL. Browser scripts write result JSON beside themselves; `AUDIT_OUTPUT_DIR` directs fresh results elsewhere to preserve committed evidence. `AUDIT_REPO_ROOT` selects another checkout. The UI Vorbis fixture remains beside ui-control-repro.cjs. Recording probes additionally accept `AUDIT_PLAYWRIGHT_MODULE` when the environment exposes a Playwright-compatible module at another path. In the managed audit environment, browser/server commands required the tool's additional network permission to create sockets; this is an execution-environment requirement, not application behavior.

The optional existing `scripts/validate-stream-stereo.cjs` was inspected and executed after build, with `--chromium=/usr/bin/chromium` and `--report=...`. `stream-stereo.json` records the native graph and built-artifact measurements. Native display capture was **not attempted**; acquisition was supplied by generated streams.

## Evidence inventory

| Files | Purpose |
| --- | --- |
| audio/browser-repros.cjs, browser-repros.json | Six assert-backed cases covering RC-02, RC-03, RC-04 and RC-14 |
| presets/repro.mjs, repro-output.txt | Actual normalization, spectral gap, stable-ID and typed-band behavior; roundtrip/boundary controls |
| presets/id-worker.mjs, id-*-output.txt | Timeout-isolated RC-01 and ordinary control |
| recording/native-capture.cjs, native-capture-results.json | Native formats/metadata, prior export revocation, and public disposal |
| recording/finalizing-eof.cjs, finalizing-eof-results.json | Actual EOF controls, lost EOF finalization event, and capture across queue advance/unload |
| render_analysis/reproduce-render-analysis.mjs, render-analysis-results.json | Actual phase adapters, isolated FFT scale, normalized resource counts/frame bursts |
| ui/ui-control-repro.cjs, ui-control-results.json, tone.ogg | Native mixed select, legitimate/empty MIME, phase and other presentation inconsistencies |
| ui/reproduce-ui-focus.cjs, ui-focus-evidence.json, background-focus-*.png | Desktop/mobile invisible persisted edit and queue focus loss |
| packaging.cjs, packaging-results.json | Built-file hash, HTTP boot, resource references, file-policy limitation |
| npm-ci.log, npm-test.log, npm-build.log | Clean lockfile install and sequential test/build evidence |
| browser-smoke.log, stream-stereo.json | Native generated WAV transport and channel graph controls |

Snapshot JSON includes ephemeral Blob URLs, ports, and local diagnostic paths from the run. Those are observations, not dependencies that must be recreated exactly. Resource timing fields use a Node/stub Canvas and must not be read as native GPU/browser FPS measurements. Native capture file sizes vary by encoder run. The reproduced state transitions, measured mappings, operation counts, and assertions are the relevant evidence.

The initial home-cache npm failure, default-sandbox socket denial, missing default Playwright executable during a preliminary rerun, and file-navigation browser-policy block were diagnosed as environment conditions. Final validation used a writable npm cache, allowed local sockets, and the installed Chromium executable. Direct `file://` boot remains unvalidated because the environment returned ERR_BLOCKED_BY_ADMINISTRATOR. No product source was changed to bypass these conditions.
