import { TAU, RAD_TO_DEG } from "./constants.js";
import { deepFreeze } from "./utils.js";

const SIMULATION_MAX_DELTA_TIME_SEC = 1 / 30;
const ANGULAR_SPEED_STEP_RAD_PER_SEC = Math.PI / 360;
const DEFAULT_CAMERA = { x: 0, y: 0, zoom: 1, rotationRad: 0 };

const DEFAULT_ORB_BEHAVIOR = {
  motion: { angularSpeedRadPerSec: Math.PI * 0.50 },
  response: { minRadiusFrac: 0.01, maxRadiusFrac: 0.80, waveformRadialDisplaceFrac: 0.10 },
  particles: { emitPerSecond: 240, sizeMaxPx: 8, sizeMinPx: 1, sizeToMinSec: 3.0, ttlSec: 6.0, minPlacementDistanceUnits: 0.5 },
  trace: { lines: true, numLines: 10, lineAlpha: 0.35, lineWidthPx: 2, lineColorMode: "dominantBand" },
};

function defaultOrb(identity) {
  return { ...identity, motion: { ...DEFAULT_ORB_BEHAVIOR.motion }, response: { ...DEFAULT_ORB_BEHAVIOR.response }, particles: { ...DEFAULT_ORB_BEHAVIOR.particles }, trace: { ...DEFAULT_ORB_BEHAVIOR.trace } };
}

/* =============================================================================
   CONFIG — Canonical truth (never mutated)
   ========================================================================== */
const CONFIG = deepFreeze({
  // URL/protocol resource admission, not limits on Scene configuration itself.
  // 64 MiB accommodates 4096 fully independent Orbs with all 256 selections
  // (over one million assignments), full legacy fields and generous opaque IDs.
  // Arbitrarily long identities still share this documented transport budget.
  presets: {
    maxJsonBytes: 64 * 1024 * 1024,
    maxCompressedBytes: 64 * 1024 * 1024 + 64 * 1024,
    maxEncodedChars: Math.ceil((64 * 1024 * 1024 + 64 * 1024) / 3) * 4,
    maxStructureDepth: 16, // canonical Scene nesting is at most five containers
    maxStructureNodes: 2_000_000, // includes maximum legacy numeric selections
  },
  // Shared camera policy; live state and authored Scene state are independent.
  camera: {
    defaults: DEFAULT_CAMERA,
    // Provisional 116C interaction choices, pending owner artistic testing.
    interaction: {
      enabledByDefault: false,
      panStepUnits: 50,
      zoomFactor: 1.1,
      rotationStepDeg: 5,
      wheelZoomPerPixel: 0.0015,
      wheelLinePixels: 16,
    },
    fit: { paddingCssPx: 16, feedbackDurationMs: 6000 },
    keyboard: {
      panSpeedCssPxPerSec: 320,
      rotationSpeedDegPerSec: 60,
      shiftMultiplier: 3,
      maxMovementDeltaSec: 0.1,
    },
  },
  bandNames: [
// 0–31  Planetary Core – The Iron-Nickel Heart of the World (deepest sub-bass)
  "Eternal Core",
  "Nickel Forge",
  "Iron Heartbeat",
  "Primordial Mantle",
  "Lithic Roar",
  "Subduction Song",
  "Magma Heart",
  "Rift Whisper",
  "Volcanic Pulse",
  "Crustal Thunder",
  "Tectonic Echo",
  "Seismic Lullaby",
  "Planetary Forge",
  "Core Resonance",
  "Mantle Dream",
  "Abyssal Maw",
  "Hadal Thunder",
  "Trench Oracle",
  "Benthic Choir",
  "Pressure Veil",
  "Deep Mantle Song",
  "Geothermal Hum",
  "Iron Core Pulse",
  "Nickel Veil",
  "Primordial Roar",
  "Subterranean Whisper",
  "Lithosphere Pulse",
  "Mantle Chamber",
  "Core Song",
  "Planetary Heart",
  "Eternal Forge",
  "Deepest Resonance",

  // 32–63  Oceans & Tectonics – Fluid Foundations of Life
  "Mariana Pulse",
  "Hadal Depths",
  "Oceanic Spine",
  "Continental Rumble",
  "Mountain Root",
  "Ancient Soil",
  "Seabed Choir",
  "Trench Echo",
  "Pelagic Dream",
  "Abyssal Current",
  "Hydrothermal Song",
  "Pressure Chamber",
  "Oceanic Veil",
  "Tectonic Drift",
  "Rift Valley Hum",
  "Submarine Thunder",
  "Coral Heart",
  "Deep Current Pulse",
  "Ocean Floor Forge",
  "Benthic Resonance",
  "Mariana Whisper",
  "Hadal Lullaby",
  "Pelagic Roar",
  "Continental Song",
  "Seabed Pulse",
  "Trench Heart",
  "Abyssal Forge",
  "Oceanic Dream",
  "Pressure Song",
  "Deep Sea Resonance",
  "Hydrothermal Veil",
  "Mariana Core",

  // 64–95  Biosphere & Living Crust – Where Life First Awakens
  "Forest Floor",
  "Canopy Breath",
  "Jungle Canopy",
  "Savanna Heart",
  "River Stone",
  "Earth Breath",
  "Gaia Hum",
  "Biosphere Song",
  "Thunder Root",
  "Storm Cradle",
  "Wind Weaver",
  "Cloud Chamber",
  "Dawn Chorus",
  "Human Veil",
  "Vocal Ridge",
  "Breath Chamber",
  "Presence Spark",
  "Clarity Thread",
  "Life Resonance",
  "Soil Symphony",
  "Root Network",
  "Leaf Whisper",
  "Pollen Pulse",
  "Mycelial Song",
  "Rainforest Hum",
  "Savanna Pulse",
  "River Echo",
  "Earth Song",
  "Gaia Pulse",
  "Biosphere Veil",
  "Life Thread",
  "Organic Resonance",

  // 96–127  Human Voice & Emotional Presence – The Heart of the Mix
  "Vocal Spark",
  "Throat Chamber",
  "Chest Resonance",
  "Nasal Veil",
  "Presence Ridge",
  "Clarity Peak",
  "Sibilant Edge",
  "Bite Burst",
  "Air Shelf",
  "Breath Spark",
  "Voice Thread",
  "Human Hum",
  "Emotional Core",
  "Soul Whisper",
  "Heartbeat Echo",
  "Vocal Forge",
  "Presence Veil",
  "Clarity Song",
  "Sibilance Dream",
  "Air Resonance",
  "Breath Pulse",
  "Voice Lullaby",
  "Human Spark",
  "Emotional Veil",
  "Soul Pulse",
  "Heart Song",
  "Vocal Dream",
  "Presence Core",
  "Clarity Forge",
  "Sibilant Whisper",
  "Air Heart",
  "Breath Resonance",

  // 128–159  Lower Atmosphere – Sky Begins to Open
  "Tropospheric Dance",
  "Cloud Weaver",
  "Storm Pulse",
  "Rain Veil",
  "Lightning Thread",
  "Wind Ridge",
  "Fog Chamber",
  "Mist Spark",
  "Dawn Veil",
  "Dusk Echo",
  "Twilight Hum",
  "Atmosphere Song",
  "Weather Pulse",
  "Cumulus Heart",
  "Stratus Whisper",
  "Nimbus Resonance",
  "Thunder Song",
  "Lightning Dream",
  "Raindrop Pulse",
  "Wind Forge",
  "Cloud Veil",
  "Mist Thread",
  "Fog Resonance",
  "Dawn Spark",
  "Dusk Lullaby",
  "Twilight Pulse",
  "Atmosphere Veil",
  "Weather Song",
  "Cumulus Echo",
  "Stratus Dream",
  "Nimbus Heart",
  "Thunder Veil",

  // 160–191  Upper Atmosphere & Ionosphere – Light & Electricity
  "Lightning Veil",
  "Aurora Thread",
  "Ion Whisper",
  "Magnetosphere Ring",
  "Solar Wind Hymn",
  "Helios Harp",
  "Van Allen Veil",
  "Orbital Echo",
  "Lunar Reflection",
  "Meteor Shimmer",
  "Exospheric Spark",
  "Satellite Choir",
  "Stratospheric Veil",
  "Ionospheric Dance",
  "Aurora Pulse",
  "Magneto Song",
  "Solar Veil",
  "Helios Dream",
  "Van Allen Pulse",
  "Orbital Whisper",
  "Lunar Heart",
  "Meteor Forge",
  "Exospheric Hum",
  "Satellite Resonance",
  "Stratospheric Song",
  "Ionospheric Spark",
  "Aurora Lullaby",
  "Magneto Veil",
  "Solar Pulse",
  "Helios Resonance",
  "Van Allen Dream",
  "Orbital Song",

  // 192–223  Solar System – Planets, Moons & Solar Winds
  "Lunar Reflection",
  "Mars Dust",
  "Jovian Thunder",
  "Saturn Ring Song",
  "Venus Veil",
  "Mercury Pulse",
  "Neptune Whisper",
  "Uranus Dream",
  "Pluto Edge",
  "Asteroid Shimmer",
  "Comet Trail",
  "Solar Flare Heart",
  "Coronal Song",
  "Heliosphere Veil",
  "Interplanetary Hum",
  "Moonlit Resonance",
  "Jupiter Pulse",
  "Saturn Echo",
  "Venus Spark",
  "Mercury Forge",
  "Neptune Lullaby",
  "Uranus Veil",
  "Pluto Song",
  "Asteroid Dream",
  "Comet Pulse",
  "Solar Flare Whisper",
  "Coronal Resonance",
  "Heliosphere Song",
  "Interplanetary Veil",
  "Moonlit Pulse",
  "Jovian Dream",
  "Saturn Heart",

  // 224–255  Stellar to Quantum Eternity – The Farthest Reaches
  "Stellar Drift",
  "Nebula Heart",
  "Galactic Pulse",
  "Cosmic Root",
  "Quasar Whisper",
  "Black Hole Lullaby",
  "Dark Matter Song",
  "Cosmic Microwave",
  "Quantum Foam",
  "Void Resonance",
  "Star Forge",
  "Nebula Veil",
  "Galactic Edge",
  "Observable Dream",
  "Universal Hum",
  "Eternity’s Resonance",
  "Photon Veil",
  "Neutrino Song",
  "Graviton Pulse",
  "Singularity Heart",
  "Big Bang Echo",
  "Multiverse Whisper",
  "Cosmic Horizon",
  "Dark Energy Dream",
  "Stellar Nursery",
  "Supernova Spark",
  "Pulsar Choir",
  "Quasar Forge",
  "Black Hole Veil",
  "Cosmic Infinity",
  "Observable Edge",
  "Eternal Resonance"
  ],

  ui: {
    panelBackgroundRgba: "rgba(17,25,30,0.96)",
    panelBlurPx: 6,
    panelPaddingPx: 10,
    panelGapPx: 10,
    panelRadiusPx: 10,
    analysisHudIntervalMs: 100,
    audioPanelHeightPx: 106, // pad(10) + scrubber(36) + gap(10) + transport(var(--ui-icon)=40) + pad(10) = 106px
    iconButtonSizePx: 40,
    volume: { min: 0, max: 1, step: 0.01 },
  },

  // Application-only waveform policy and choices; never scene/preset defaults.
  waveform: {
    decodeSampleRateHz: 44100,
    peakBucketCount: 512,
    automaticProfiles: [
      { id: "4m", approximateMinutes: 4 },
      { id: "8m", approximateMinutes: 8 },
      { id: "15m", approximateMinutes: 15 },
    ],
    defaultProfileId: "8m",
    defaultAboveProfileBehavior: "ask",
    aboveProfileBehaviors: [
      { id: "ask", label: "Ask before generating" },
      { id: "generate-if-permitted", label: "Generate automatically if permitted" },
      { id: "skip", label: "Skip automatic generation" },
    ],
    // Provisional source defaults, not a total browser-memory guarantee.
    maxEncodedBytes: 64 * 1024 * 1024,
    maxEstimatedDecodedPcmBytes: 512 * 1024 * 1024,
    fallbackEstimatedChannels: 2,
    metadataProbe: { maxBytes: 64 * 1024, maxChunks: 128 },
  },

  // Application policy only: decimal bytes and milliseconds, outside Scene presets.
  recordingResources: {
    defaultProfile: "balanced",
    profiles: ["balanced", "custom", "unrestricted"],
    factory: {
      softBytes: 130_000_000,
      aggregateBytes: 270_000_000,
      reserveBytes: 10_000_000,
      maxChunks: 1_200,
      durationMs: 300_000,
      warningFraction: 0.80,
    },
    // Representation constraints, not substitute resource ceilings.
    integer: { min: 1, max: Number.MAX_SAFE_INTEGER },
    reserveDivisor: 10,
    storage: { key: "auralprint.recording-resources", version: 1 },
  },

  recording: {
    // Build 113 recording feature gate.
    hooksEnabled: true,

    // Record panel launches hidden behind its camera launcher.
    defaultPanelVisible: false,

    // Default target video frame rate for canvas capture.
    targetFps: 30,

    // Curated UI-safe frame-rate choices for runtime recording settings.
    targetFpsOptions: [24, 30, 60],

    // Default capture mode - include playback audio in the export mix.
    includePlaybackAudio: true,

    // MediaRecorder MIME candidates in strict priority order.
    preferredMimeTypes: [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
    ],

    // MediaRecorder chunk cadence for ondataavailable delivery.
    chunkTimesliceMs: 1000,

    // Recorder-owned runtime timer cadence for elapsedMs synchronization.
    // Keeps recording state current without coupling timer updates to render FPS.
    timerUpdateIntervalMs: 200,

    // Export filename template for finalized recording downloads.
    outputFileNameTemplate: "auralprint-capture-{yyyy}{mm}{dd}-{hh}{min}{ss}",

    panelPlacement: {
      // Record panel dock corner inside the workspace panel system.
      edgeX: "right",
      edgeY: "bottom",

      // Record panel offsets relative to existing bottom-docked UI.
      anchorAboveAudioPanel: true,
      anchorAboveQueuePanel: true,
    },

    launcherPlacement: {
      // Emits launcher edge variables; the unified launcher layout does not consume them.
      corner: "bottom-right",
    },

    panelStyle: {
      // Record-panel phase treatment stays config-defined, then flows through CSS vars at boot.
      recordingShadowCss: "0 0 0 1px rgba(255, 112, 112, 0.28), 0 12px 24px rgba(0,0,0,0.24)",
      finalizingShadowCss: "0 0 0 1px rgba(255, 214, 102, 0.26), 0 12px 24px rgba(0,0,0,0.24)",
      completeShadowCss: "0 0 0 1px rgba(134, 255, 196, 0.22), 0 12px 24px rgba(0,0,0,0.24)",
      errorShadowCss: "0 0 0 1px rgba(255, 118, 118, 0.34), 0 12px 24px rgba(0,0,0,0.24)",
    },

    launcherStyle: {
      // Launcher family treatment stays shared, with only the record-specific deltas defined here.
      restOpacity: 0.96,
      borderColorRgba: "rgba(255,255,255,0.22)",
      shadowCss: "0 8px 18px rgba(0,0,0,0.28)",
    },

    launcherPulse: {
      // Recording-state pulse timing for the Record launcher.
      periodMs: 1400,

      // Pulse intensity bounds - consumed by UI animation, not runtime state.
      scaleMin: 1.0,
      scaleMax: 1.08,
      opacityMin: 0.78,
      opacityMax: 1.0,
    },
  },

  worldGeometry: { legacyWorldUnitsPerCssPixel: 1 },

  defaults: {
    sceneCamera: DEFAULT_CAMERA,
    world: { widthUnits: 1000, heightUnits: 1000 },
    visuals: {
      backgroundColor: "#000000",
      particleColor: "#ffffff",
    },

    audio: {
      fftSize: 8192,
      smoothingTimeConstant: 0.10,
      rmsGain: 1.0,

      // Playback knobs (do NOT affect analysis)
      repeatMode: "none",
      clearQueueOnSourceExit: false,
      muted: false,
      volume: 1.0,
    },

    // Orbs: each orb chooses an analyser channel via `chanId` and can optionally
    // target specific spectral bands with `bandIds`.
    // Empty `bandIds` means full-band energy.
    orbs: [
      defaultOrb({
        id: "ORB0",
        chanId: "R",
        bandIds: [],
        chirality: -1,
        startAngleRad: 0,
        hueOffsetDeg: 0,
        colorSource: "inherit",
        centerXFrac: 0,
        centerYFrac: 0,
      }),
      defaultOrb({
        id: "ORB1",
        chanId: "L",
        bandIds: [],
        chirality: -1,
        startAngleRad: Math.PI,
        hueOffsetDeg: 0,
        colorSource: "inherit",
        centerXFrac: 0,
        centerYFrac: 0,
      }),
    ],

bands: {
  // Configured frequency domain is independent of the actual AudioContext rate.
  // The controller caps at Nyquist; the final open-ended band can collapse there.
  count: 256,
  floorHz: 20,
  ceilingHz: 22500,
  distributionMode: "erb",  // "linear" | "log" | "mel" | "bark" | "erb"

      overlay: {
        enabled: false,
        connectAdjacent: true,
        alpha: 0.65,
        pointSizePx: 3,
        minRadiusFrac: 0.01,
        maxRadiusFrac: 0.80,
        waveformRadialDisplaceFrac: 0.18,
        lineAlpha: 0.35,
        lineWidthPx: 1,

        phaseMode: "free",        // "orb" | "free"
        ringSpeedRadPerSec: 0.0 // used when phaseMode="free"
      },

      rainbow: {
        hueOffsetDeg: 0,
        saturation: 0.90,
        value: 1.00,
      },

      particleColorSource: "dominant", // "fixed" | "dominant" | "angle"
    },

    timing: {
      maxDeltaTimeSec: SIMULATION_MAX_DELTA_TIME_SEC,
    },
    particleSafety: { maxEmissionsPerFrame: 512, maxActiveParticles: 16384 },
  },

  limits: {
    // Provisional numerical support range; interaction/artistic policy is 116C.
    camera: {
      zoom: { min: 0.01, max: 100 },
      panSpeedCssPxPerSec: { min: 0, max: 3200, step: 20 },
      rotationSpeedDegPerSec: { min: 0, max: 360, step: 5 },
    },
    world: {
      widthUnits: { min: 1, max: 1_000_000, step: "any" },
      heightUnits: { min: 1, max: 1_000_000, step: "any" },
    },
    particleSafety: {
      maxEmissionsPerFrame: { min: 0, max: 16384, step: 1 },
      maxActiveParticles: { min: 0, max: 1048576, step: 1 },
    },
    timing: { maxDeltaTimeSec: SIMULATION_MAX_DELTA_TIME_SEC, motionDiscontinuitySec: 0.5 },
    trace: {
      numLines: { min: 10, max: 1000, step: 10 },
      lineAlpha: { min: 0, max: 1, step: 0.01 },
      lineWidthPx: { min: 1, max: 6, step: 1 },
    },

    particles: {
      emitPerSecond: { min: 10, max: 1000, step: 10 },
      sizeMaxPx: { min: 1, max: 12, step: 0.1 },
      sizeMinPx: { min: 0.5, max: 6, step: 0.1 },
      sizeToMinSec: { min: 0.1, max: 120, step: 0.1 },
      ttlSec: { min: 0.1, max: 600, step: 0.1 },
      minPlacementDistanceUnits: { min: 0, max: 10, step: 0.1 },
    },

    motion: {
      angularSpeedRadPerSec: { min: ANGULAR_SPEED_STEP_RAD_PER_SEC, max: 3, step: ANGULAR_SPEED_STEP_RAD_PER_SEC },
    },

    audio: {
      rmsGain: { min: 0.05, max: 10, step: 0.01 },
      smoothingTimeConstant: { min: 0.01, max: 0.99, step: 0.01 },
      fftSizes: [256, 512, 1024, 2048, 4096, 8192, 16384],
    },

    bands: {
      // Floor band, at least one interior band, and open-ended top band.
      count: { min: 3, max: 256 },
      // User-configured domain, independent of the live AudioContext Nyquist.
      // Positive finite fractional Hz remain supported; no editing lattice.
      frequencyHz: { max: 384000 },
      overlayAlpha: { min: 0, max: 1, step: 0.01 },
      overlayLineAlpha: { min: 0, max: 1, step: 0.01 },
      overlayLineWidthPx: { min: 1, max: 6, step: 1 },
      pointSizePx: { min: 1, max: 10, step: 1 },
      overlayMinRadiusFrac: { min: 0.01, max: 0.4, step: 0.01 },
      overlayMaxRadiusFrac: { min: 0.3, max: 1, step: 0.01 },
      overlayWaveformRadialDisplaceFrac: { min: 0.01, max: 1.00, step: 0.01 },
      ringSpeedRadPerSec: { min: 0, max: TAU, step: ANGULAR_SPEED_STEP_RAD_PER_SEC },
      distributionModes: ["linear", "log", "mel", "bark", "erb"],
    },

    // Scene Appearance owns the shared color policy. Persistence intentionally
    // remains under the historical visuals.* and bands.* schema-10 paths.
    sceneColor: {
      hueOffsetDeg: { min: 0, max: 360, step: 1 },
      saturation: { min: 0, max: 1, step: 0.01 },
      value: { min: 0, max: 1, step: 0.01 },
      particleColorSources: ["fixed", "dominant", "angle"],
    },

    monoDetect: {
      rightSilenceRms: 0.002,
      lrCorrelationStride: 8,
      lrCorrelationMonoThresh: 0.995
    },

    orbs: {
      // Provisional operational safety ceiling, not a frame-rate guarantee.
      maxCount: 4096,
      response: {
        minRadiusFrac: { min: 0.01, max: 0.4, step: 0.01 },
        maxRadiusFrac: { min: 0.3, max: 1, step: 0.01 },
        waveformRadialDisplaceFrac: { min: 0.01, max: 1.00, step: 0.01 },
      },
      startAngleRad: { min: 0, max: TAU, step: 1 / RAD_TO_DEG },
      hueOffsetDeg: { min: 0, max: 360, step: 1 },
      centerXFrac: { min: -0.95, max: 0.95, step: 0.01 },
      centerYFrac: { min: -0.95, max: 0.95, step: 0.01 },
      colorSources: ["inherit", "fixed", "dominant", "angle"],
      channels: ["L", "R", "C"],
    },
  }
});

export { CONFIG };
