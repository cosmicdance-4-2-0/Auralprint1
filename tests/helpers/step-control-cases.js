import { RAD_TO_DEG } from '../../src/js/core/constants.js';
import { CONFIG } from '../../src/js/core/config.js';
// Independent inventory of the actual UI owners; all numerical policy is CONFIG.
const l = CONFIG.limits;
const orb = (suffix,path,limit,legacy) => ({ selector:`input[id$="-${suffix}"]`, path:['orbs',0,...path], limit, legacy, owner:'Orb', scale:path[0]==='startAngleRad'||path[1]==='angularSpeedRadPerSec'?RAD_TO_DEG:1 });
export const individualSliders = [
  orb('angular-speed',['motion','angularSpeedRadPerSec'],l.motion.angularSpeedRadPerSec,.123456),
  orb('center-x',['centerXFrac'],l.orbs.centerXFrac,.123456), orb('center-y',['centerYFrac'],l.orbs.centerYFrac,-.123456),
  orb('phase-offset',['startAngleRad'],l.orbs.startAngleRad,Math.PI/120),
  orb('hue',['hueOffsetDeg'],l.orbs.hueOffsetDeg,123.456),
  orb('min-radius',['response','minRadiusFrac'],l.orbs.response.minRadiusFrac,.123456),
  orb('max-radius',['response','maxRadiusFrac'],l.orbs.response.maxRadiusFrac,.654321),
  orb('waveform-displacement',['response','waveformRadialDisplaceFrac'],l.orbs.response.waveformRadialDisplaceFrac,.123456),
  orb('emit-rate',['particles','emitPerSecond'],l.particles.emitPerSecond,245.5),
  orb('size-min',['particles','sizeMinPx'],l.particles.sizeMinPx,1.23456),
  orb('size-max',['particles','sizeMaxPx'],l.particles.sizeMaxPx,8.123456),
  orb('size-decay',['particles','sizeToMinSec'],l.particles.sizeToMinSec,3.123456),
  orb('lifetime',['particles','ttlSec'],l.particles.ttlSec,9.123456),
  orb('min-placement-distance',['particles','minPlacementDistanceUnits'],l.particles.minPlacementDistanceUnits,.123456),
  orb('line-count',['trace','numLines'],l.trace.numLines,16),
  orb('line-alpha',['trace','lineAlpha'],l.trace.lineAlpha,.123456),
  orb('line-width',['trace','lineWidthPx'],l.trace.lineWidthPx,2.34567),
];
const bulkIds = ['rngOmega','', '', '', '', 'rngMinRad','rngMaxRad','rngWfDisp','rngEmit','rngSizeMin','rngSizeMax','rngSizeToMin','rngTTL','rngMinPlacementDistance','rngNumLines'];
export const bulkSliders = individualSliders.flatMap((item,i)=>bulkIds[i] ? [{...item,selector:'#'+bulkIds[i],owner:'Bulk'}] : []);
export const analysisSliders = [
  ['rngRmsGain','rmsGain',.123456], ['rngSmooth','smoothingTimeConstant',.123456],
].map(([id,field,legacy])=>({selector:'#'+id,path:['audio',field],limit:l.audio[field],legacy,owner:'Analysis'}));
export const ringSliders = [
  ['rngBandAlpha','alpha','overlayAlpha',.123456], ['rngBandPoint','pointSizePx','pointSizePx',3.456],
  ['rngBandOverlayMinRad','minRadiusFrac','overlayMinRadiusFrac',.123456], ['rngBandOverlayMaxRad','maxRadiusFrac','overlayMaxRadiusFrac',.654321],
  ['rngBandOverlayWfDisp','waveformRadialDisplaceFrac','overlayWaveformRadialDisplaceFrac',.123456],
  ['rngBandLineAlpha','lineAlpha','overlayLineAlpha',.123456], ['rngBandLineWidth','lineWidthPx','overlayLineWidthPx',2.34567],
  ['rngRingSpeed','ringSpeedRadPerSec','ringSpeedRadPerSec',.123456],
].map(([id,field,limit,legacy])=>({selector:'#'+id,path:['bands','overlay',field],limit:l.bands[limit],legacy,owner:'Ring',scale:field==='ringSpeedRadPerSec'?RAD_TO_DEG:1}));
export const sliderCases = [...individualSliders,...bulkSliders,...analysisSliders,...ringSliders];
export const readPath = (object,path) => path.reduce((o,key)=>o[key],object);
export const writePath = (object,path,value) => { const parent=readPath(object,path.slice(0,-1)); parent[path.at(-1)]=value; };
