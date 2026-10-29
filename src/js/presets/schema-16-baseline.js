import { deepFreeze } from "../core/utils.js";

// Frozen schema-16 decoding contract: accepted 116E plus Queue policy and numeric fade.
// Keep independent of CONFIG and all earlier wire baselines.
const SCHEMA_16_BASELINE = deepFreeze({
  "sceneCamera": {
    "x": 0,
    "y": 0,
    "zoom": 1,
    "rotationRad": 0
  },
  "world": {
    "widthUnits": 1000,
    "heightUnits": 1000
  },
  "visuals": {
    "backgroundColor": "#000000",
    "particleColor": "#ffffff"
  },
  "audio": {
    "fftSize": 8192,
    "smoothingTimeConstant": 0.1,
    "rmsGain": 1,
    "repeatMode": "none",
    "clearQueueOnSourceExit": false,
    "muted": false,
    "volume": 1
  },
  "orbs": [
    {
      "id": "ORB0",
      "chanId": "R",
      "bandIds": [],
      "chirality": -1,
      "startAngleRad": 0,
      "hueOffsetDeg": 0,
      "colorSource": "inherit",
      "centerXFrac": 0,
      "centerYFrac": 0,
      "motion": {
        "angularSpeedRadPerSec": 1.5707963267948966
      },
      "response": {
        "minRadiusFrac": 0.01,
        "maxRadiusFrac": 0.8,
        "waveformRadialDisplaceFrac": 0.1
      },
      "particles": {
        "emitPerSecond": 240,
        "sizeMaxPx": 8,
        "sizeMinPx": 1,
        "sizeToMinSec": 3,
        "ttlSec": 6,
        "minPlacementDistanceUnits": 0.5
      },
      "trace": {
        "lines": true,
        "numLines": 10,
        "lineAlpha": 0.35,
        "lineWidthPx": 2,
        "lineColorMode": "dominantBand",
        "fadeSegments": 0
      }
    },
    {
      "id": "ORB1",
      "chanId": "L",
      "bandIds": [],
      "chirality": -1,
      "startAngleRad": 3.141592653589793,
      "hueOffsetDeg": 0,
      "colorSource": "inherit",
      "centerXFrac": 0,
      "centerYFrac": 0,
      "motion": {
        "angularSpeedRadPerSec": 1.5707963267948966
      },
      "response": {
        "minRadiusFrac": 0.01,
        "maxRadiusFrac": 0.8,
        "waveformRadialDisplaceFrac": 0.1
      },
      "particles": {
        "emitPerSecond": 240,
        "sizeMaxPx": 8,
        "sizeMinPx": 1,
        "sizeToMinSec": 3,
        "ttlSec": 6,
        "minPlacementDistanceUnits": 0.5
      },
      "trace": {
        "lines": true,
        "numLines": 10,
        "lineAlpha": 0.35,
        "lineWidthPx": 2,
        "lineColorMode": "dominantBand",
        "fadeSegments": 0
      }
    }
  ],
  "bands": {
    "count": 256,
    "floorHz": 20,
    "ceilingHz": 22500,
    "distributionMode": "erb",
    "overlay": {
      "enabled": false,
      "connectAdjacent": true,
      "alpha": 0.65,
      "pointSizePx": 3,
      "minRadiusFrac": 0.01,
      "maxRadiusFrac": 0.8,
      "waveformRadialDisplaceFrac": 0.18,
      "lineAlpha": 0.35,
      "lineWidthPx": 1,
      "phaseMode": "free",
      "ringSpeedRadPerSec": 0
    },
    "rainbow": {
      "hueOffsetDeg": 0,
      "saturation": 0.9,
      "value": 1
    },
    "particleColorSource": "dominant"
  },
  "timing": {
    "maxDeltaTimeSec": 0.03333333333333333
  },
  "particleSafety": {
    "maxEmissionsPerFrame": 512,
    "maxActiveParticles": 16384
  }
});

export { SCHEMA_16_BASELINE };
