# Experimental temporal audio / Orb modulation

**Status:** opt-in prototype, deliberately outside the Build 115 release scope.
No canonical release, schema, default behavior, or shipped artifact is changed.

## Purpose and data ownership

`audio/temporal-features.js` consumes the producer-owned `AnalysisFrame`
without modifying source arrays. Its reusable output has per-channel (L/R/C)
`energy01` (instantaneous), `envelope01` (smoothed level), `rise01`,
`fall01`, and `flux01` (positive spectral change). These are heuristic,
dimensionless features, **not calibrated audio power, beat detection or tempo**.

Positive spectral flux is the arithmetic mean of positive differences between
normalized band energies, multiplied by `fluxNormalizationSec / frameDeltaSec`,
then clamped to [0, 1]. Rising/falling energy use that same time normalization.
The envelope uses separate exponential attack/release constants. Spectral
history and output objects are reused between frames; band-definition changes,
unready audio, invalid/zero time steps and explicit track resets discard history
rather than creating false attacks.

The experimental `render/temporal-modulation.js` adapter selects a feature
and applies a nonnegative angular-speed offset only to an Orb whose persistent
ID matches. The offset is ephemeral and never modifies Orb definition, runtime
motion preference, or preset data. Effective Orb speed is capped by the
existing CONFIG motion maximum.

## Opt-in developer experiment

Edit `CONFIG.experimental.temporalAudio` in `src/js/core/config.js`
and rebuild the development application. Set `enabled: true` to evaluate
the experiment. The switch defaults to **false**. This is intentionally a
**documented code-only option**; no user-facing UI or persistence is added.

Available parameters:

- `targetOrbId`: stable Orb ID, e.g. `ORB0`.
- `sourceChannel`: `L`, `R`, or `C`.
- `sourceFeature`: `flux01`, `rise01`, `fall01`, or `envelope01`.
- `maxSpeedOffsetRadPerSec`: peak additional angular speed.
- `envelopeAttackSec`, `envelopeReleaseSec`, `fluxNormalizationSec`:
  temporal response constants (strictly positive).

Run `npm ci`, `npm test`, `npm run build`, then
`python scripts/verify_distribution.py` sequentially, on the repository's
supported Node 24 / Python 3.12 toolchain. In a browser, compare the same
track with `enabled: false` and `true`, including stereo, track changes,
different band counts, a hidden tab, and prolonged quiet sections. This
comparison remains a manual acceptance gate; no claims of perceptual or
device performance follow from unit tests alone.

## Limitations and follow-up

This uses visual-frame observations rather than independent audio-clock
analysis, so transients are frame-cadence-sensitive. Averaged normalized
decibel-band readings are not physical energy measurements. The aggregate
flux can underrepresent sparse narrow-band changes. A future modulation
matrix would need declared contracts, reproducibility targets, UX ownership,
source/session identity, and dedicated performance measurements. None of
those are implied by this isolated prototype.
