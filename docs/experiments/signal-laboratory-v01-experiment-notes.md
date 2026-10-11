# Signal Laboratory v0.1 (experimental)

This is a developer research surface embedded in the existing Analysis workspace. It does not alter preferences, preset schemas, shipped releases, audio routing, or default Orb behavior. The lab only updates when its disclosure is expanded.

Select L/R/C and a frequency interval to inspect normalized amplitude-band aggregate, envelope, positive energy attack and positive spectral flux. Intersecting bands are weighted by their overlap in Hz. Band readings already represent averaged normalized decibels and **must not** be interpreted as calibrated spectral power or isolated instruments. The canvas depicts recent *UI samples*, not a calibrated timebase.

The engine reads producer-owned `AnalysisFrame` arrays and caches overlapping band indices until the band definition or user target changes. It resets across invalid frames, time discontinuities and target changes. It remains driven by animation-frame observations: tempo, beat and frame-rate-independent results are explicitly out of scope. Do not interpret visual repeatability as signal-science reproducibility.

Verification: focused Node 22 tests pass in the isolated harness. Node 24 project tests, packaging verification, and browser audio/device testing are required before merging. This branch targets the preceding **experimental branch**, not `main`.