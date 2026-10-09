# F.6 independent acceptance matrix

Audited application `158a782c4af0466bd09a9c11dc9f3db0dd6f780d`; freshly built v0.1.15m.i.f/schema 10. Native environment is Linux/headless Chromium 151.0.7922.173. PASS means the stated executed contract; it does not assert exhaustive browser/device behavior.

| Contract | Method and actual result | Evidence | Disposition / limitation |
| --- | --- | --- | --- |
| Exact accepted F.5 tree, ancestry, draft PR/main | Clean/exact F.5 head; all prior phases; main unchanged; only stale local tracking ref corrected | `validation.json`, integrity | PASS; tags collection unavailable, no release/canon change |
| Pending selected removal, autoplay true/false, loaded playing/paused | Immutable production-path native assertions all green | regression-results | PASS; controlled real resume/Play boundary |
| Duplicate filenames and same File repeated | Entry/request/media identity remains distinct | regression-results, default suite | PASS; names do not prove identity |
| Earlier/later/unrelated removal and shuffle | Current entry remains selected/authorized through shifts | integration-reruns, default suite | PASS; production Queue/UI |
| Final removal/Clear and A→B→C | No late restoration; latest owner only | regression-results, integration-reruns | PASS; out-of-order real resume scheduling |
| Initial/second context failure and constructor | Current terminal source/audio error; retry; no leaked rejection | regression-results | PASS; explicit controlled startup failures |
| Obsolete first/second/Play failure | Winner source/media/error survives, no obsolete notification | regression-results, integration-reruns | PASS; includes newer winner error |
| Real corrupt File pre-commit | Decoder error 4, media detached, listeners aborted, URL released, no ready/retained graph; exactly one failure before retry | independent-results `corrupt`; cleanup-reruns | PASS; primary failure is native, no decoder injection |
| Original F.4 cleanup probes | Original runner six passes; stronger F.5 runner six passes | cleanup-reruns | PASS; unchanged historical failures remain in F.4 |
| Exception before transfer | No installed owner; local resources released | independent-results `before-transfer` | PASS; real API source factory injection |
| Transfer/partial gains/splitter | Failed exact owner released; all allocated nodes disconnect once | independent-results `gain-first`, `gain-partial`, `splitter` | PASS; controlled allocation exception |
| Partial analyser/configuration | Mapped nodes and local not-yet-mapped analyser released | independent-results `analyser-first`, `analyser-partial`, `analyser-config` | PASS; real analyser setter/factory fault |
| Partial connections/late settings | No source/output/bands/ready graph remains | independent-results `partial-connect`, `after-tap` | PASS; controlled connect/configuration fault |
| Graph error vocabulary | Valid WAV reports source attachment and original controlled cause, not corrupt-media diagnosis | independent-results, cleanup-reruns | PASS; cause retained across cleanup |
| Post-commit native error route | Manager cleanup once; error retained; callbacks after abort cannot repeat teardown | independent-results installed callback | PASS; synthetic error event on real element, separately labeled |
| Stale installed A after successful/failing B/Clear | Zero shared writes, winner operations or terminal notifications; identity/error retained | independent-results five obsolete cases | PASS; real native Play completion held before commit |
| Stale A after Mic/Stream | Winner graph/capture/live track not released | independent-results, regression-results | PASS; native synthetic upstream, not physical device |
| Queued callbacks after abort | Captured callbacks invoked directly; no resurrection, duplicate cleanup or stale writes | independent-results | PASS; stronger adversarial callback delivery, explicitly injected |
| Recoverable loaded Play resume/rejection/throw | Same media/time/session/ready graph retained; truthful paused error; native retry succeeds | independent-results three Play cases | PASS; injected refusals at actual call boundary |
| Closed context | Truthful reload-required terminal failure, no silent recreation | regression-results | PASS; external closure only, app has no close path |
| Current UI failure notification | Exactly one failed track transition; cancellations silent | regression-results, independent-results, controls | PASS; not conflated with failed loaded Play |
| Native recorder corrupt File | Same recorder/tap tracks remain; failed graph released; B reconnects; Stop/export retained | independent-results corrupt recording, integration-reruns | PASS; configured real MediaRecorder |
| Native recorder late graph fault | Failure observed after output/tap connection; cleanup removes invalid connection without stopping recording | independent-results after-tap recording | PASS; controlled exception, real encoder |
| Encoded A→B content | Actual WebM demux/decode contains VP9/Opus and 440/660Hz windows | independent-export-probes | PASS, 2/2; no claim of perceptual external-player fidelity |
| Export retention/re-record/disposal | Valid export survives failure; new recording replaces; owned tracks release; valid playback survives disposal | integration-reruns, independent-results | PASS |
| Finalization/deferred natural EOF | Queue controls locked; actual native EOF advances once after native Stop finalization | integration-reruns | PASS; application onstop callback held, not fake recorder |
| Shared live recording tracks | Stop/disposal leave upstream live; manager teardown ends it | integration-reruns | PASS; synthetic native Mic |
| Portable actual HTML HTTP | Valid playback, pending removal, corrupt failure cleanup/recovery; no missing dependencies/errors | distribution-results | PASS; unchanged HTML, forwarding native wrappers |
| Hosted `/` | Same media/failure behavior; linked manifest/icons/start URL 200 | distribution-results | PASS |
| Hosted `/apps/auralprint/` | Same media/failure behavior; nested assets and metadata resolve | distribution-results | PASS |
| Direct file | Browser blocks navigation before application execution | integration-reruns | INCONCLUSIVE environment; human desktop success retained |
| Firefox/WebKit/physical devices | No compatible binaries or real device grants exercised | validation, integration-reruns | NOT EXECUTED; broader 115N scope, no invented remediation gate |
| Existing native assertions | 54/54 including original 28; 45 scenarios, no infrastructure failure | regression-results | PASS |
| Semantic mutation sensitivity | F.2 9/9; F.3 9/9; F.5 10/10; relevant assertion failures | negative-controls | PASS; disposable source copies only |
| RC-02/03/04/05/06/19/20 | Full permanent suite plus applicable native ingestion/Clear/live/Play/EOF/export/disposal/package probes | default-suite, integration-reruns, distribution-results | PASS; no permanent expectation changes |
| Full validation sequence | ci/test/build/Python verify/diff-check exit 0; 693 pass, one skip | commands, default-suite | PASS |
| Historical/production integrity | 728 original tracked files, including 90 phase evidence files unchanged | integrity | PASS |
| Final-head Linux/Windows CI | Check after evidence commit is published | PR #46 metadata/final handoff | Report intentionally contains no pre-run result |

Finding dispositions: **AUD-001 CLOSE; AUD-002 CLOSE; F4-CLEANUP-01 CLOSE**. Recommend human merge review, no automatic merge/release. Build 115N remains withheld.

## Changed-file inventory

All paths below are new and relative to this `f6/` directory:

- `README.md`
- `acceptance-matrix.md`
- `validation.json`
- `diagnostics/independent.cjs`
- `diagnostics/distribution.cjs`
- `diagnostics/export-probe.py`
- `evidence/independent-results.json`
- `evidence/distribution-results.json`
- `evidence/independent-export-probes.json`
- `evidence/regression-results.json`
- `evidence/cleanup-reruns.json`
- `evidence/integration-reruns.json`
- `evidence/negative-controls.json`
- `evidence/integrity.json`
- `evidence/preliminary-observations.json`
- `evidence/commands.json`
- `evidence/default-suite.log`

The two preliminary UI assertions are runner observation timing, preserved explicitly. Final checks still assert immediate failed-resource state and eventual truthful UI error. No discovered application defect was fixed or hidden. All evidence links refer to files under `evidence/`; historical phase results have not been overwritten.
