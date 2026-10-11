// Experimental, read-only consumer of AnalysisFrame; session-only selection.
const clamp01 = x => Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
export function createSignalLab({ attackSec = 0.03, releaseSec = 0.3, referenceSec = 0.05, gapSec = 0.5 } = {}) {
  const out = { ready: false, channel: 'C', lowHz: 40, highHz: 180, energy01: 0, envelope01: 0, attack01: 0, flux01: 0, bandCount: 0 };
  let previous = null, edges = null, highs = null, cache = [];
  function reset() { previous = null; out.ready = false; out.energy01 = out.envelope01 = out.attack01 = out.flux01 = 0; return out; }
  function select({ channel = out.channel, lowHz = out.lowHz, highHz = out.highHz } = {}) {
    if (!['L','R','C'].includes(channel) || !Number.isFinite(lowHz) || !Number.isFinite(highHz) || lowHz < 0 || highHz <= lowHz) return false;
    if (channel !== out.channel || lowHz !== out.lowHz || highHz !== out.highHz) {out.channel=channel;out.lowHz=lowHz;out.highHz=highHz;edges=null;reset();}
    return true;
  }
  function update(frame, dt) {
    if (!frame?.ready || !Number.isFinite(dt) || dt <= 0 || dt > gapSec) return reset();
    const low = frame.spectrum?.lowHz, high = frame.spectrum?.highHz;
    const values = frame.channels?.[out.channel]?.bandEnergies01;
    if (!low || !high || !values || low.length !== high.length || values.length !== low.length) return reset();
    if (low !== edges || high !== highs) {
      edges=low;highs=high;cache=[];reset();
      for(let i=0;i<values.length;i++) {
        const lo=low[i], hi=high[i];
        const overlap = Math.max(0, Math.min(Number.isFinite(hi)?hi:out.highHz,out.highHz)-Math.max(lo,out.lowHz));
        if(overlap>0) cache.push({i,w:overlap});
      }
    }
    let total=0,weight=0,flux=0;
    const samples=[];
    for (const {i,w} of cache) {
      const v=clamp01(values[i]);
      samples.push(v);total+=v*w;weight+=w;
    }
    out.bandCount=cache.length;
    if (!weight) return reset();
    const energy=total/weight;
    if (!previous) { out.energy01=out.envelope01=energy;out.flux01=out.attack01=0;previous=samples;out.ready=true;return out; }
    let weightIdx=0;
    for(let k=0;k<samples.length;k++) {const w=cache[k].w;flux+=Math.max(0,samples[k]-previous[k])*w;weightIdx+=w;previous[k]=samples[k];}
    out.attack01=clamp01(Math.max(0,energy-out.energy01)*referenceSec/dt);
    out.flux01=clamp01((flux/weightIdx)*referenceSec/dt);
    const tau=energy>out.envelope01?attackSec:releaseSec;
    out.envelope01+=(energy-out.envelope01)*(-Math.expm1(-dt/tau));
    out.energy01=energy;out.ready=true;return out;
  }
  return { select, update, reset, getFrame:()=>out };
}
