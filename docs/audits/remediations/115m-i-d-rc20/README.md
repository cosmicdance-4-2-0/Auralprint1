# 115M.I.D — RC-20 distribution packaging remediation

RC-20 is ready for independent review after local package, regression, mutation and Chromium HTTP validation. Version is **v0.1.15m.i.d**; preset schema remains **10**. Build **115N remains WITHHELD**. No release, tag, merge, hosting publication or Build 115 canonization is authorized or performed.

## Baseline and scope

Accepted starting main and branding asset intake: **`f5bbf2a25ffbf8b122e81bd9f54e3639a53a6243`**, “Adding deployment assets.” GitHub main was checked against this SHA, fetched, and the initially stale PR-41 checkout was reconciled before implementation. PR #42 was confirmed merged at **`d2d55d21406834bd9551385a04ae7cc6c4f52e11`**, with final head `c8606c0f9a0ba33e051e2976f5b7d0b96ce8f4bb`. Starting version **v0.1.15m.i.c**, schema **10**, and clean working tree were confirmed. Work branch: `codex/115m-i-d-rc20-packaging`.

`agents.md`, the current ROADMAP, original October 6 audit and packaging evidence were read before source edits. The roadmap's existing revision/status text is historical/stale relative to accepted main; the broad documentation reconciliation remains reserved for 115M.I.E. Neither ROADMAP nor historical audit/evidence is modified. All existing release tests remain; only their version assertion advances.

Classification: packaging bug fix, P3 RC-20. Impact: assembler/template/metadata/CI only, plus canonical development version metadata and a narrow distribution-contract bullet in agents.md. No application algorithm, runtime CONFIG, preset field/schema, UI workflow, audio lifecycle, renderer or recorder change. Risk is metadata/build compatibility, covered by isolated input failures and native resource tests; no runtime performance change or new production dependency.

## Canonical source inventory

All eight expected inputs were enumerated and found nonempty. PNG signatures, actual dimensions, file MIME inspection, full Pillow decoding of PNG/ICO, ICO directory bounds, and safe XML parsing of both SVGs were checked before production edits. SVGs reject DTD/entity declarations for inspection; `favicon.svg` has viewBox `0 0 128 128`, OG artwork `0 0 1200 630`. `file` heuristically labels the comment-prefixed OG SVG as HTML, but safe XML parsing confirms its SVG root. [Source inventory, signatures, MIME and hashes](source-assets.json).

| Canonical file | Bytes | Dimensions / structure | SHA-256 |
| --- | ---: | --- | --- |
| `apple-touch-icon.png` | 21,085 | 180 × 180 | `d81a6025dd4b21484bcbe975c0bd2e6db2fdb61a1437e1112849ef58ab016bfc` |
| `assets/og-image.svg` | 7,552 | 0 0 1200 630 | `adf7ce453d3763e1cc6ca33095398ccdcaa98a459cce95926005964c9eab9b87` |
| `favicon-96x96.png` | 9,034 | 96 × 96 | `63c77536989a01479a37f41930989232d589710e83a3e706b9b1fe7b02301817` |
| `favicon.ico` | 15,086 | 3 ICO images (48, 32, 16 px) | `9800272423a8511e334311af34c9ca6e55aa4fa6051d6f4bf355af8189d7e92f` |
| `favicon.svg` | 1,121 | 0 0 128 128 | `f3e95bf3acd93122339066956ec52a048b36f176864255f84f4c45fefc22dd16` |
| `site.webmanifest` | 496 | JSON | `b90d5a924b0289ed4ad5e50a39d2c40058cbbc8ddd8bfb888043341fdce64e25` |
| `web-app-manifest-192x192.png` | 22,773 | 192 × 192 | `b73872f891fdb6cb32eb57c67beb9ea3e940b1722cf5912c60bcb9185a537991` |
| `web-app-manifest-512x512.png` | 105,356 | 512 × 512 | `451750c8f7eebabce053802ebf3e17e447f84daf339f09fa0d43288d7f773568` |

The portable edition embeds the supplied SVG favicon without changing its bytes. The hosted edition copies the six icon images byte for byte. The source manifest is input to a generated manifest derivative, not a copied artwork replacement. The OG SVG is preserved but not consumed by the build. No originals, including the source manifest, are changed.

## Original RC-20 reproduction

Before production changes, the accepted build produced `dist/auralprint_0.1.15m.i.c.html`: **400,363 bytes**, SHA-256 `15d661654b2161e506ffcbb15cb72739b68b910a1f102499c037719327f070dd`. Its five links retained `/favicon.ico`, `/favicon-96x96.png`, `/favicon.svg`, `/apple-touch-icon.png`, `/site.webmanifest`. Branding now existed under source intake, but the distribution still contained no referenced icons or manifest.

Native Chromium served the unchanged baseline HTML at `/apps/auralprint/index.html`; every declared resource resolved at server root and returned **404**. Naturally observed icon requests and explicit probes of all five declarations are recorded separately in [baseline-browser.json](baseline-browser.json). App canvas/Load control booted, with **zero page exceptions**. The 404 console messages are metadata loading failures, not evidence of failed application boot.

The original declarations remain an executable negative control derived from the unchanged original audit JSON in `tests/rc20_packaging.py`. The new validation rejects them. A second [native root-path mutation](root-path-negative-control.json) replaces only generated HTML `href="./` with `href="/` in memory: all five resources return **200** with a root mount and **404** when mounted only at `/apps/auralprint/`; the app boots in both modes. Its [optional probe](root-path-negative-control.cjs) does not edit accepted source or artifacts.

## Distribution contracts and exact output tree

`npm run build` retains the primary downloadable filename and adds hosted packaging. It uses one template and one JS/CSS bundling pipeline. Both HTML files contain the same assembled script/style content and application version.

```text
dist/
├── auralprint_0.1.15m.i.d.html
├── esbuild-metafile.json                  # existing diagnostic, not a deployable resource
└── hosted/
    ├── index.html
    ├── favicon.ico
    ├── favicon.svg
    ├── favicon-96x96.png
    ├── apple-touch-icon.png
    ├── web-app-manifest-192x192.png
    ├── web-app-manifest-512x512.png
    └── site.webmanifest
```

Portable HTML: **401,173 bytes**, SHA-256 `2b3495b6e5a7a0a2629b9b044fd837ecbc2513f85c8a7667154b546eb690a3a4`.
Hosted HTML: **400,004 bytes**, SHA-256 `7b09e3bd5e4d6dac1c12c9e2d453c97e39b0c99b02ff500fe6dcc20886c9cdd5`.
All nine distributable sizes/hashes: [artifacts.json](artifacts.json).

### Shared metadata injection and portable encoding

`src/index.template.html` replaces the five hardcoded URLs/platform declarations with `<!-- AURALPRINT_HEAD_METADATA -->`. The existing Python assembler validates each CSS, JS, version and metadata marker occurs exactly once, assembles JS/CSS once, then selects metadata for portable/hosted output. Final HTML is structurally parsed; unresolved markers, external script/style dependencies and malformed metadata fail before writing outputs. Version tags are restricted to safe filename/HTML characters and escaped. Paths derive from the script/repository location; they do not depend on caller cwd. Explicit UTF-8/LF output is used on Linux and Windows.

Portable emits one `rel=icon`, `type=image/svg+xml`, base64 `data:` URL from canonical `favicon.svg`. Decoded bytes equal the source hash. It omits manifest, apple-touch-icon and Apple platform-name metadata. UTF-8, viewport, existing title/description/keywords/author and embedded application CSS/JS are retained. No runtime requests for scripts, styles, icons, manifest, fonts or telemetry are introduced. It is not presented as an installable PWA.

Hosted emits five links using `./filename`, with source MIME declarations and verified dimensions. Six supplied icon files are copied unchanged into `dist/hosted/`. The build rejects missing/empty inputs, invalid SVG/ICO/PNG signatures or bounds, mismatched PNG dimensions, PNG chunk/checksum/compression failures and invalid manifest JSON/icon contracts. No OG image is a required input.

### Hosted manifest transformation

Canonical `site.webmanifest` is parsed and validated for the actual Auralprint name/short name, exactly both supplied PNG icons, matching MIME and dimensions. Output changes each `/web-app-manifest-*.png` to `./web-app-manifest-*.png`, `/index.html` to `./index.html`, and adds `scope: "./"`. All other metadata is retained: name, short name, `#ffffff` background/theme colors, `standalone` display and `maskable` icon purposes. Stable two-space JSON with trailing LF is generated next to `index.html`.

This is a **metadata derivative** necessary for relocatable deployment. It is generated only under `dist/hosted/site.webmanifest`, is intentionally not byte-identical to its source, and is validated against the exact documented transformation plus actual browser URL resolution. No artwork derivative exists.

Both source icons declare `maskable`. The supplied image was visually inspected; the badge/outer ring extends toward the edges and may be cropped by platform masks. Maskable-safe artwork approval/testing remains unresolved. Purposes and original pixels are preserved, with no silent regeneration or safety-area certification.

### Intentional Open Graph omission

`assets/og-image.svg` includes “IDIW · Auralprint” and “Curated AI adventure games,” with additional unrelated messaging. It has no product approval as Auralprint OG artwork. No `og:image`, new social metadata, replacement or modification is introduced; its hash remains unchanged and it is absent from hosted output. Open Graph work is separate from RC-20.

## Developer watch behavior

The existing esbuild JS/CSS watchers and serialized assembly chain remain. On initial successful bundles and subsequent JS/CSS changes, that chain calls the same assembler and regenerates **both** portable and hosted outputs. No new watcher or second packaging pipeline exists. Branding, HTML-template and version-only changes are not watched; rerun `npm run build` or restart watch for those inputs. Assembly failures are logged by the existing watch error path.

An [isolated watch probe](check-watch.cjs) copied current source/scripts/version into a temporary checkout and validated initial output, a JS change and a CSS change using the artifact verifier. Both editions regenerated and matched shared bundles. [watch.json](watch.json) records the result. Accepted source was not edited by this probe.

## Automated tests, mutations and reproducibility

`npm test` owns an isolated Node test invoking 23 standard-library Python tests using temporary copies of source assets/template and small JS/CSS fixture bundles. It neither requires nor changes checkout `dist/`/`.build/`, preserving sequential bootstrap and the existing build-directory test. Linux/Windows Python interpreter selection follows the existing build candidates. No mandatory browser/test dependency is added.

Positive tests structurally inspect embedded favicon/metadata, manifest transformation, same JS/CSS, version/schema, output inventory, hash integrity and deterministic assembly. Negative assertions or useful CLI build-validation failures detect:

- Original root-relative declarations and root-only hosted metadata.
- Missing SVG favicon, missing hosted favicon, missing source/output manifest icons and absent manifest references.
- Invalid SVG/entity declarations, PNG dimensions/checksums and manifest MIME.
- Invalid manifest JSON in source/output and root-relative launch URL/scope.
- External portable favicon/extra icon, external script/stylesheet, stale version in either HTML.
- Missing/duplicate assembly markers, unresolved extra markers and hosted JS divergence.

These are real contract/build failures, not arbitrary syntax failures in production application code. [focused.log](focused.log) records **23 tests passed**; mutation subcases are included. Temporary assets and output mutations are isolated and removed after each test. The native root-path control additionally proves the root-vs-prefix difference.

Sequential final bootstrap/validation: locked `npm ci` (2 packages, unchanged package/lockfile), `npm test` (**603 passed, zero failed, 1 existing opt-in skip**), `npm run build`, `python scripts/verify_distribution.py`, native browser diagnostics, a second unchanged build/artifact comparison, then `git diff --check`. The opt-in RC-15 **1,048,576-particle boundary** passed separately (**1 passed**). Evidence: [npm-ci.log](npm-ci.log), [full-test.log](full-test.log), [million-stress.log](million-stress.log), [build.log](build.log), [rebuild.log](rebuild.log).

Both build hash inventories were exactly equal for all **nine** distributable files. Existing `dist/esbuild-metafile.json` is excluded because its `generatedAt` diagnostic timestamp changes. All eight source hashes match their pre-edit inventory; all six hosted image hashes match source; source manifest and OG remain unchanged. Historical audit/evidence byte changes are absent. [integrity-and-determinism.json](integrity-and-determinism.json).

## Native browser and request evidence

Linux environment: Node **24.19.0**, npm **11.9.0**, Python **3.12.14**, esbuild **0.25.12**, Chromium **151.0.7922.173**, externally available Playwright. The optional `scripts/validate-rc20.cjs` tests unmodified final artifacts, without adding a project dependency or exposing runtime bundle internals.

| Mode | Resource/manifest result | Application result |
| --- | --- | --- |
| Portable HTTP `/portable.html` | One embedded SVG successfully decoded by Chromium; no external metadata/app resource requests | Correct title/version, generated stereo WAV load/play, advancing scrubber, rendering, pause/resume/stop and Space activation pass |
| Hosted `/index.html` | All linked resources 200; manifest/icons parse/decode; declared MIME/dimensions match; Chromium `Page.getAppManifest` has no errors | Same audio/visualizer/control checks pass |
| Hosted `/apps/auralprint/index.html` | Exactly the same hosted directory, without rebuild; all resources 200 inside prefix; start URL/scope resolve inside prefix; no root-target requests | Same audio/visualizer/control checks pass |
| Actual portable `file://` (network offline) | **Blocked by environment policy, ERR_BLOCKED_BY_ADMINISTRATOR** | Direct-file boot/playback is **unverified**, not a reported Auralprint defect |

For each successful mode, there are **zero page exceptions, zero console errors, zero failed resource requests and zero metadata 404s**. Portable HTTP requests only its HTML and local audio Blob URL. Hosted linked PNG/SVG/ICO files are decoded, and manifest icons resolve at both mounts with their actual sizes. SVG has scalable dimensions; Chromium's image decoder reports its default intrinsic raster size rather than a fixed PNG size. No service worker or installability/caching test is claimed.

[browser.json](browser.json) records browser version, exact final request URLs, statuses, MIME types, console/page-error/failed-request classes, explicit linked-resource probes, Chromium manifest parsing/resolution, canvas pixel evidence and direct-file limitation. The local HTTP server explicitly serves correct MIME types. Explicit resource probes include Apple touch metadata that Chromium does not necessarily request automatically. Natural browser requests are separately listed in server/page request records; no unexplained default favicon probe was observed. Metadata 404s from baseline are not conflated with page exceptions.

Re-run after build:

```sh
RC20_REPORT=/path/to/browser.json node scripts/validate-rc20.cjs
```

`RC20_PLAYWRIGHT_MODULE` and `RC20_CHROMIUM_PATH` select optional external tooling; in PowerShell use `$env:RC20_REPORT=...` before invoking Node.

## Application regression protection

Runtime source diff is only the development version comment in `src/js/core/constants.js`; application CSS, algorithms, persistence, source ownership and recording code are unchanged. Both distributions are checked against the same actual bundled JS/CSS. Existing tests cover file load/queue/scrubber, Mic/Stream ownership, AnalysisFrame/L/R/C, Orb/preset schema 10, Ring, RC-15 budgets, RC-16 bands, RC-17 phase, RC-18 pause, RC-19 disposal and RC-21/22 help/identity behavior.

The existing optional native stereo diagnostic passed L/R/C 440/880 Hz separation, left/right-only, dual-mono and file/stream graph checks against this source/build, with no page errors: [stereo.json](stereo.json). Native display acquisition was not attempted. The existing native retained-export diagnostic passed recording A/B creation, retention across a failed new start, successful replacement/revocation and nonempty native export availability, with no page errors: [recording-export.json](recording-export.json). No external-player audio-fidelity claim is made.

## CI and output tracking

Linux and Windows matrix, clean locked install, sequential tests/build, generated-file tracking check and `git diff --check` are retained. CI adds `python scripts/verify_distribution.py` immediately after build; it fails for malformed/missing portable **or** hosted output and verifies current bundles/hash integrity. `dist/`, `.build/`, `node_modules/` and Python bytecode caches remain ignored/untracked. Browser tooling remains optional and separate from CI.

Hosted GitHub Actions status will be recorded after the implementation commit is pushed. Local Linux checks above are passed; Windows execution is not inferred from local results.

## Changed files and remaining limits

[changed-files.txt](changed-files.txt) is the exact inventory relative to accepted starting main, including this report and evidence. No canonical artwork, historical audit, ROADMAP/root README, package dependencies or runtime algorithm changes are included.

Remaining limits: actual direct-file launch is blocked/unverified in this managed browser; Safari/Firefox/mobile/physical devices/permission dialogs are not tested here; maskable-safe artwork approval remains unresolved; server MIME configuration is required; hosted offline caching/installation is not implemented or claimed; watch does not react to branding/template/version-only edits without restart/build; independent review remains required. No service worker, new PWA subsystem, telemetry, hosting account or production deployment was added. Build 115 is not shipped or canonized; **115N remains WITHHELD**.
