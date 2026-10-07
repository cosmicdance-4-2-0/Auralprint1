# 115M.H.I — RC-08 correct FFT coordinates while retaining inclusive overlap

RC-08 CLOSED by local acceptance evidence. Version `v0.1.15m.h.i`.

Root cause: N frequency bins have centers k*sampleRate/fftSize, hence frequency coordinates use N/Nyquist. Production scaled by N−1, shifting membership below aligned boundaries. Current-branch reproduction independently observes positive top-band energy for bins 119 (FFT 256) and 3839 (FFT 8192) below 22.5 kHz.

Contract/correction: scale by N; preserve floor/ceil, inclusive membership, zero-width bands, dB normalization and clamping to N−1. Production change only `src/js/audio/band-bank.js` (two lines), plus version metadata/assertion. Risk is boundary membership; no preset semantics/schema or interface changes.

Regression: `tests/fft-coordinate.test.js` checks every supported FFT size with below-boundary negative and at-boundary positive controls, propagating energy through AnalysisFrame to targeted Orb selection. Four sample rates verify exact boundary sharing at both interior edges and DC/final-bin clamping. Existing BandBank/Nyquist/RC-07 coverage passes. Synthetic bin vectors isolate arithmetic, so native browser evidence is not required for this defect.

Mutation: restoring N−1 rejects the below-boundary regression; making averaging upper-exclusive rejects the intentional inclusive-overlap controls. Both mutations restored before acceptance.


Acceptance: intended-behavior regressions and focused tests PASS; full `npm test` PASS including protected RC-01–RC-06; production build PASS; `git diff --check` PASS; schema exactly 10. Generated untracked artifact `dist/auralprint_0.1.15m.h.i.html` has matching version metadata. Adjacent logs record reproduction, regression, mutation and final checks.

Historical audit/evidence are unchanged. RC-01–RC-06 were CLOSED before this mission. RC-07–RC-08 are locally CLOSED. Remaining mission findings are OPEN. RC-16–RC-22 are untouched. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Hosted Linux/Windows CI is reserved for the final PR if all blockers close.
