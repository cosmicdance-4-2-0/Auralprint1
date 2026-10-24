/* =============================================================================
   Auralprint
   0.1.16d

   Build 116D — Authored Scene camera and independent live camera
   Independent world geometry; authored viewpoint; preset schema v12.
   ========================================================================== */

const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

// Published schema 10 and accepted development schema 11 remain immutable.
const PRESET_SCHEMA_VERSION = 12; // v12 = authored Scene camera
const LEGACY_SCHEMA_V2 = 2;
const LEGACY_SCHEMA_V3 = 3;
const LEGACY_SCHEMA_V4 = 4;
const LEGACY_SCHEMA_V5 = 5; // v5 existed in transitional builds — accept for safe migration
const LEGACY_SCHEMA_V6 = 6;
const LEGACY_SCHEMA_V7 = 7;
const LEGACY_SCHEMA_V8 = 8;
const LEGACY_SCHEMA_V9 = 9;
const LEGACY_SCHEMA_V10 = 10;
const LEGACY_SCHEMA_V11 = 11;

export { TAU, RAD_TO_DEG, PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V2, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V7, LEGACY_SCHEMA_V8, LEGACY_SCHEMA_V9, LEGACY_SCHEMA_V10, LEGACY_SCHEMA_V11 };
