/* =============================================================================
   Auralprint
   0.1.15

   Build 115 — Orbs overhaul v1
   Per-orb hue offset, color source, sim-space center; preset schema v9.
   ========================================================================== */

const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

const PRESET_SCHEMA_VERSION = 9; // v9 = per-orb hueOffsetDeg, colorSource, centerXFrac/Y
const LEGACY_SCHEMA_V2 = 2;
const LEGACY_SCHEMA_V3 = 3;
const LEGACY_SCHEMA_V4 = 4;
const LEGACY_SCHEMA_V5 = 5; // v5 existed in transitional builds — accept for safe migration
const LEGACY_SCHEMA_V6 = 6;
const LEGACY_SCHEMA_V7 = 7;
const LEGACY_SCHEMA_V8 = 8;

export { TAU, RAD_TO_DEG, PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V2, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V7, LEGACY_SCHEMA_V8 };
