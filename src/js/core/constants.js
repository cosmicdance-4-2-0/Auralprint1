/* =============================================================================
   Auralprint
   0.1.13
  
   Recording / Capture & Band Truth release
   1) Dedicated recording panel, bottom-right camera launcher, and export flow included.
   2) Log boolean for band spacing replaced with Linear, Log, Mel, Mark, or ERB selection. 
   2a) ERB is now the default band spacing. 
   2b) Legacy presets supported as Log default. 
   
   NEXT: LIVE INPUT SOURCES! Mic, System Audio, et al. 
   ========================================================================== */
	
const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

const PRESET_SCHEMA_VERSION = 9; // v9 = persisted scene.nodes replaces legacy visual roots
const LEGACY_SCHEMA_V1 = 1;
const LEGACY_SCHEMA_V2 = 2;
const LEGACY_SCHEMA_V3 = 3;
const LEGACY_SCHEMA_V4 = 4;
const LEGACY_SCHEMA_V5 = 5; // v5 existed in transitional builds — accept for safe migration
const LEGACY_SCHEMA_V6 = 6;
const LEGACY_SCHEMA_V7 = 7;

export { TAU, RAD_TO_DEG, PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V1, LEGACY_SCHEMA_V2, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V7 };
