/* =============================================================================
   Auralprint
   0.1.15m.g

   Build 115 — Visualizer Architecture + Orb Overhaul v1
   Per-Orb visual ownership; preset schema v10.
   ========================================================================== */

const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

// Build 115 freezes schema 10. Future persistence changes require 11 plus
// migration from 10; never reuse a schema number for incompatible formats.
const PRESET_SCHEMA_VERSION = 10; // v10 = per-orb motion, response, particles, and trace
const LEGACY_SCHEMA_V2 = 2;
const LEGACY_SCHEMA_V3 = 3;
const LEGACY_SCHEMA_V4 = 4;
const LEGACY_SCHEMA_V5 = 5; // v5 existed in transitional builds — accept for safe migration
const LEGACY_SCHEMA_V6 = 6;
const LEGACY_SCHEMA_V7 = 7;
const LEGACY_SCHEMA_V8 = 8;
const LEGACY_SCHEMA_V9 = 9;

export { TAU, RAD_TO_DEG, PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V2, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V7, LEGACY_SCHEMA_V8, LEGACY_SCHEMA_V9 };
