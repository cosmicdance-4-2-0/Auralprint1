import { CONFIG } from '../../src/js/core/config.js';
// [controller key, canonical group (null = Orb), field, limits, off-step value]
export const continuousOrbCases = [
  ['speed','motion','angularSpeedRadPerSec',CONFIG.limits.motion.angularSpeedRadPerSec,.123456],
  ['x',null,'centerXFrac',CONFIG.limits.orbs.centerXFrac,.123456],
  ['y',null,'centerYFrac',CONFIG.limits.orbs.centerYFrac,-.123456],
  ['minRadius','response','minRadiusFrac',CONFIG.limits.orbs.response.minRadiusFrac,.123456],
  ['maxRadius','response','maxRadiusFrac',CONFIG.limits.orbs.response.maxRadiusFrac,.654321],
  ['waveform','response','waveformRadialDisplaceFrac',CONFIG.limits.orbs.response.waveformRadialDisplaceFrac,.123456],
  ['emit','particles','emitPerSecond',CONFIG.limits.particles.emitPerSecond,15.5],
  ['sizeMin','particles','sizeMinPx',CONFIG.limits.particles.sizeMinPx,1.23456],
  ['sizeMax','particles','sizeMaxPx',CONFIG.limits.particles.sizeMaxPx,6.123456],
  ['decay','particles','sizeToMinSec',CONFIG.limits.particles.sizeToMinSec,2.34567],
  ['ttl','particles','ttlSec',CONFIG.limits.particles.ttlSec,180.123456],
  ['spacing','particles','minPlacementDistanceUnits',CONFIG.limits.particles.minPlacementDistanceUnits,.123456],
  ['lineAlpha','trace','lineAlpha',CONFIG.limits.trace.lineAlpha,.123456],
  ['lineWidth','trace','lineWidthPx',CONFIG.limits.trace.lineWidthPx,2.34567],
  ['hue',null,'hueOffsetDeg',CONFIG.limits.orbs.hueOffsetDeg,123.456789],
];
export const readNumeric = (orb,group,field) => (group ? orb[group] : orb)[field];
export const writeNumeric = (orb,group,field,value) => { (group ? orb[group] : orb)[field] = value; };
