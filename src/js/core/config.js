import { TAU } from "./constants.js";
import { deepFreeze } from "./utils.js";

/* =============================================================================
   CONFIG — Canonical truth (never mutated)
   ========================================================================== */
const CONFIG = deepFreeze({
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
    panelBackgroundRgba: "rgba(0,0,0,0.72)",
    panelBlurPx: 6,
    panelPaddingPx: 10,
    panelGapPx: 10,
    panelRadiusPx: 10,
    audioPanelHeightPx: 106, // pad(10) + scrubber(36) + gap(10) + transport(var(--ui-icon)=40) + pad(10) = 106px
    iconButtonSizePx: 40,
    volume: { min: 0, max: 1, step: 0.01 },
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
      // Future record panel dock corner inside the existing panel system.
      edgeX: "right",
      edgeY: "bottom",

      // Future panel stacking rules relative to existing bottom-docked UI.
      anchorAboveAudioPanel: true,
      anchorAboveQueuePanel: true,
    },

    launcherPlacement: {
      // Future launcher anchor for the hidden record panel.
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
      // Future recording-state pulse timing for the camera launcher.
      periodMs: 1400,

      // Future pulse intensity bounds - consumed by UI animation, not runtime state.
      scaleMin: 1.0,
      scaleMax: 1.08,
      opacityMin: 0.78,
      opacityMax: 1.0,
    },
  },

  visualizers: {
    orbs: {
      defaults: {
        hueOffsetDeg: 0,
        centerX: 0,
        centerY: 0,
      },
      limits: {
        hueOffsetDeg: { min: 0, max: 360, step: 1 },
        centerX: { min: -1, max: 1, step: 0.01 },
        centerY: { min: -1, max: 1, step: 0.01 },
      },
    },
  },

  defaults: {
    visuals: {
      backgroundColor: "#000000",
      particleColor: "#ffffff",
    },

    trace: {
      lines: true,
      numLines: 10,
      lineAlpha: 0.35,
      lineWidthPx: 2,
      lineColorMode: "dominantBand", // "fixed" | "lastParticle" | "dominantBand"
    },

    particles: {
      emitPerSecond: 240,
      sizeMaxPx: 8,
      sizeMinPx: 1,
      sizeToMinSec: 3.0,
      ttlSec: 6.0,
      overlapRadiusPx: 1.0,
    },

    motion: {
      angularSpeedRadPerSec: Math.PI * 0.50,
      waveformRadialDisplaceFrac: 0.10,
    },

    audio: {
      fftSize: 8192,
      smoothingTimeConstant: 0.10,
      rmsGain: 1.0,
      minRadiusFrac: 0.01,
      maxRadiusFrac: 0.80,

      // Playback knobs (do NOT affect analysis)
      repeatMode: "none",
      muted: false,
      volume: 1.0,
    },

    // Orbs: each orb chooses an analyser channel via `chanId` and can optionally
    // target specific spectral bands with `bandIds`.
    // Empty `bandIds` means full-band energy.
    //
    // ENGINE-COMPLETE fields (fully working in sim, no UI yet — do not re-implement):
    //   chanId        — L/R/C channel routing (engine done; UI deferred)
    //   bandIds       — per-orb spectral band targeting, avg energy (engine done; UI deferred)
    //   chirality     — +1 or -1 rotation direction (engine done; UI deferred)
    //   startAngleRad — initial phase offset in radians (engine done; UI deferred)
    //
    // Scene-only orb-overhaul fields live under CONFIG.visualizers.orbs and the
    // canonical Scene runtime/preset path:
    //   hueOffsetDeg  — per-orb color phase offset
    //   centerX/Y     — orb origin offset in sim space
    orbs: [
      { id: "ORB0", chanId: "R", bandIds: [], chirality: -1, startAngleRad: 0 },
	  { id: "ORB1", chanId: "L", bandIds: [], chirality: -1, startAngleRad: Math.PI },
    ],

    scene: {
      nodes: [
        {
          id: "orbs-1",
          type: "orbs",
          enabled: true,
          zIndex: 0,
          bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
          anchor: { x: 0.5, y: 0.5 },
          settings: [
            {
              id: "ORB0",
              chanId: "R",
              bandIds: [],
              chirality: -1,
              startAngleRad: 0,
              hueOffsetDeg: 0,
              centerX: 0,
              centerY: 0,
            },
            {
              id: "ORB1",
              chanId: "L",
              bandIds: [],
              chirality: -1,
              startAngleRad: Math.PI,
              hueOffsetDeg: 0,
              centerX: 0,
              centerY: 0,
            },
          ],
        },
        {
          id: "overlay-1",
          type: "bandOverlay",
          enabled: true,
          zIndex: 1,
          bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
          anchor: { x: 0.5, y: 0.5 },
          settings: {
            enabled: true,
            connectAdjacent: true,
            alpha: 0.65,
            pointSizePx: 3,
            minRadiusFrac: 0.01,
            maxRadiusFrac: 0.80,
            waveformRadialDisplaceFrac: 0.18,
            lineAlpha: 0.35,
            lineWidthPx: 1,
            phaseMode: "free",
            ringSpeedRadPerSec: 0.0,
          },
        },
      ],
    },

bands: {
  // Ceiling adjusted (Now 22.5K) to restore band 255 functionality. Should now be 22.5K to 24K (Effectively, depending on nyquist)
  // To others: Ceiling should be under assumed Nyquist cap: To prevent band 255 death. 
  // If configured above the actual Nyquist ceiling: Band 255 will become effectively Nyquist to Nyquist, so: Dead.
  // I question if this is a bug, or a configuration limit to be aware of. 
  
  count: 256,
  floorHz: 20,
  ceilingHz: 22500,
  distributionMode: "erb",  // "linear" | "log" | "mel" | "bark" | "erb"

      overlay: {
        enabled: true,
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
      maxDeltaTimeSec: 1 / 30,
    },
  },

  limits: {
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
      overlapRadiusPx: { min: 0.5, max: 10, step: 0.1 },
    },

    motion: {
      angularSpeedRadPerSec: { min: 0.01, max: 3, step: 0.01 },
      waveformRadialDisplaceFrac: { min: 0.01, max: 1.00, step: 0.01 },
    },

    audio: {
      rmsGain: { min: 0.05, max: 10, step: 0.01 },
      minRadiusFrac: { min: 0.01, max: 0.4, step: 0.01 },
      maxRadiusFrac: { min: 0.3, max: 1, step: 0.01 },
      smoothingTimeConstant: { min: 0.01, max: 0.99, step: 0.01 },
      fftSizes: [256, 512, 1024, 2048, 4096, 8192, 16384],
    },

    bands: {
      overlayAlpha: { min: 0, max: 1, step: 0.01 },
      pointSizePx: { min: 1, max: 10, step: 1 },
      overlayMinRadiusFrac: { min: 0.01, max: 0.4, step: 0.01 },
      overlayMaxRadiusFrac: { min: 0.3, max: 1, step: 0.01 },
      overlayWaveformRadialDisplaceFrac: { min: 0.01, max: 1.00, step: 0.01 },
      hueOffsetDeg: { min: 0, max: 360, step: 1 },
      saturation: { min: 0, max: 1, step: 0.01 },
      value: { min: 0, max: 1, step: 0.01 },

      ringSpeedRadPerSec: { min: 0, max: TAU, step: 0.01 },
      distributionModes: ["linear", "log", "mel", "bark", "erb"],
    },

    monoDetect: {
      rightSilenceRms: 0.002,
      lrCorrelationStride: 8,
      lrCorrelationMonoThresh: 0.995
    }
  }
});

export { CONFIG };
