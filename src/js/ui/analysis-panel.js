import { clamp, fmt, rgb01ToCss } from "../core/utils.js";
import { CONFIG } from "../core/config.js";
import { BAND_NAMES, preferences, runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { BandBank } from "../audio/band-bank.js";
import { captureSpectralEvidence } from "../audio/spectral-evidence.js";

function downloadEvidenceJson(snapshot) {
  const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "auralprint-spectral-evidence.json";
    link.style.display = "none";
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); }
  } finally {
    // Let the browser begin consuming the Blob before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function createAnalysisPanelUi({
  ui = state.ui,
  getSettings = () => runtime.settings,
  mutablePreferences = preferences,
  commitPreferences = () => {},
  bandColor = () => ({ r: 1, g: 1, b: 1 }),
  now = () => performance.now(),
  saveEvidence = downloadEvidenceJson,
} = {}) {
  let initializedOn = null;
  let lastSettingsRef = null;
  let lastBandDefinitionRef = null;
  let rowCount = -1;
  let rows = [];
  let dominantBadge = null;
  let lastHudUpdateMs = -Infinity;
  let latestFrame = null;

  function addOptions(select, values) {
    if (!select || select.options.length) return;
    for (const value of values) {
      const option = document.createElement("option");
      option.value = String(value); option.textContent = String(value); select.appendChild(option);
    }
  }
  function bindRange(el, limit) { if (!el) return; el.min=String(limit.min); el.max=String(limit.max); el.step=String(limit.step); }
  function status(text) { if (ui.analysisStatus) ui.analysisStatus.textContent = text; }
  function syncControls(settings = getSettings()) {
    if (!settings || settings === lastSettingsRef) return false;
    lastSettingsRef = settings;
    const a=settings.audio, b=settings.bands;
    ui.rngRmsGain.value=String(a.rmsGain); ui.valRmsGain.textContent=fmt(a.rmsGain,2);
    ui.rngSmooth.value=String(a.smoothingTimeConstant); ui.valSmooth.textContent=fmt(a.smoothingTimeConstant,2);
    ui.selFFT.value=String(a.fftSize); ui.valFFT.textContent=String(a.fftSize);
    ui.selDistMode.value=b.distributionMode; ui.valDistMode.textContent=b.distributionMode;
    ui.inpBandFloorHz.value=String(b.floorHz); ui.valBandFloorHz.textContent=`${b.floorHz} Hz`;
    ui.inpBandCeilingHz.value=String(b.ceilingHz); ui.valBandCeilingHz.textContent=`${b.ceilingHz} Hz`;
    ui.valBandCount.textContent=`${b.count} bands`;
    return true;
  }
  function commitFrequency(kind) {
    const settings=getSettings(), field=kind === "floor" ? "floorHz" : "ceilingHz";
    const input=kind === "floor" ? ui.inpBandFloorHz : ui.inpBandCeilingHz;
    const value=Number(input.value), floor=kind === "floor" ? value : settings.bands.floorHz, ceiling=kind === "ceiling" ? value : settings.bands.ceilingHz;
    let message="";
    if (!Number.isFinite(value) || value <= 0) message=`Band ${kind === "floor" ? "floor" : "ceiling"} must be a positive finite number.`;
    else if (floor > ceiling) message=kind === "floor" ? "Band floor cannot exceed configured ceiling." : "Configured ceiling cannot be below band floor.";
    if (message) { input.value=String(settings.bands[field]); status(message); return false; }
    mutablePreferences.bands[field]=value;
    commitPreferences(`band ${kind}`, { rebuildBandsOnDefinitionChange:true });
    status(`${kind === "floor" ? "Band floor" : "Configured ceiling"} updated.`);
    return true;
  }
  function buildRows(settings) {
    rows=[]; ui.bandTable.textContent="";
    for(let i=0;i<settings.bands.count;i++) {
      const idx=document.createElement("div"), name=document.createElement("div"), range=document.createElement("div"), bar=document.createElement("div"), fill=document.createElement("div");
      idx.className="bandIdx"; idx.textContent=String(i); name.className="bandName"; name.textContent=BAND_NAMES[i]||`Band ${i}`;
      range.className="bandRange"; range.textContent=BandBank.formatBandRangeText(i); bar.className="bandBar"; fill.className="bandFill"; bar.appendChild(fill);
      ui.bandTable.append(idx,name,range,bar); rows.push({idx,name,range,fill});
    }
    rowCount=settings.bands.count;
  }
  function formatHz(hz) { if(!Number.isFinite(hz)) return "n/a"; return hz>=1000 ? `${fmt(hz/1000,2)} kHz` : `${fmt(hz,1)} Hz`; }
  function refreshMetadata(frame, settings) {
    const m=frame?.spectrum?.metadata || state.bands.meta || {};
    const sample=Number.isFinite(m.sampleRateHz) ? formatHz(m.sampleRateHz) : "pending audio context";
    const configuredFloor=settings.bands.floorHz;
    const effectiveFloor=Number.isFinite(m.effectiveFloorHz) ? m.effectiveFloorHz : configuredFloor;
    const configured=Number.isFinite(m.configCeilingHz) ? m.configCeilingHz : settings.bands.ceilingHz;
    const effective=Number.isFinite(m.effectiveCeilingHz) ? m.effectiveCeilingHz : configured;
    const floorMetadata=effectiveFloor === configuredFloor
      ? `Configured floor: ${formatHz(configuredFloor)}`
      : `Configured floor: ${formatHz(configuredFloor)} • Effective floor: ${formatHz(effectiveFloor)}`;
    const text=`${settings.bands.count} bands • ${floorMetadata} • Sample rate: ${sample} • Nyquist: ${formatHz(m.nyquistHz)} • Configured ceiling: ${formatHz(configured)} • Effective ceiling: ${formatHz(effective)}`;
    if (ui.bandMeta.textContent !== text) ui.bandMeta.textContent=text;
  }
  function refresh(frame=null, forceHud=false) {
    latestFrame = frame?.spectrum ? frame : null;
    if (ui.btnDownloadSpectralEvidence) {
      const disabled = latestFrame?.ready !== true;
      if (ui.btnDownloadSpectralEvidence.disabled !== disabled) ui.btnDownloadSpectralEvidence.disabled = disabled;
    }
    const settings=getSettings(); if(!settings) return;
    syncControls(settings); refreshMetadata(frame,settings);
    const definitionRef=frame?.spectrum?.lowHz || state.bands.lowHz;
    // Keep metadata current; defer high-cardinality table work until reveal.
    if(ui.analysisPanel && (ui.analysisPanel.hidden || ui.analysisPanel.style.display === "none")) return;
    if(rowCount!==settings.bands.count) buildRows(settings);
    if(definitionRef!==lastBandDefinitionRef) { lastBandDefinitionRef=definitionRef; for(let i=0;i<rows.length;i++) rows[i].range.textContent=BandBank.formatBandRangeText(i); }
    if(ui.analysisPanel && ui.analysisPanel.style.display === "none") return;
    const time=now(); if(!forceHud && time-lastHudUpdateMs < CONFIG.ui.analysisHudIntervalMs) return; lastHudUpdateMs=time;
    const spectrum=frame?.spectrum || state.bands, energies=spectrum.energies01 || [];
    for(let i=0;i<rows.length;i++) {
      const row=rows[i], e=clamp(energies[i]||0,0,1), dominant=i===spectrum.dominantIndex;
      const width=`${Math.round(e*100)}%`, color=rgb01ToCss(bandColor(i),.8);
      if (row.fill.style.width !== width) row.fill.style.width=width;
      // Native CSS serializes colors; retain only the last generated presentation.
      if (row.color !== color) { row.color=color; row.fill.style.background=color; }
      const nameOpacity=dominant?"1":"0.75", idxOpacity=dominant?"1":"0.65", rangeOpacity=dominant?"0.96":"0.72";
      if (row.name.style.opacity !== nameOpacity) row.name.style.opacity=nameOpacity;
      if (row.idx.style.opacity !== idxOpacity) row.idx.style.opacity=idxOpacity;
      if (row.range.style.opacity !== rangeOpacity) row.range.style.opacity=rangeOpacity;
    }
    const index=clamp(Number.isInteger(spectrum.dominantIndex)?spectrum.dominantIndex:0,0,Math.max(0,rows.length-1));
    const text=`Dominant [${index}] ${spectrum.dominantName||BAND_NAMES[index]||`Band ${index}`} — ${BandBank.formatBandRangeText(index)}`;
    if (!dominantBadge) {
      dominantBadge=document.createElement("span"); dominantBadge.className="dominantBadge";
      ui.bandDebug.textContent=""; ui.bandDebug.appendChild(dominantBadge);
    }
    if (dominantBadge.textContent !== text) dominantBadge.textContent=text;
  }
  function init() {
    if(initializedOn===ui.analysisPanel) return false; initializedOn=ui.analysisPanel;
    bindRange(ui.rngRmsGain,CONFIG.limits.audio.rmsGain); bindRange(ui.rngSmooth,CONFIG.limits.audio.smoothingTimeConstant);
    addOptions(ui.selFFT,CONFIG.limits.audio.fftSizes); addOptions(ui.selDistMode,CONFIG.limits.bands.distributionModes);
    ui.rngRmsGain.addEventListener("input",()=>{mutablePreferences.audio.rmsGain=Number(ui.rngRmsGain.value);commitPreferences("rms gain (analysis)");});
    ui.rngSmooth.addEventListener("input",()=>{mutablePreferences.audio.smoothingTimeConstant=Number(ui.rngSmooth.value);commitPreferences("smoothing");});
    ui.selFFT.addEventListener("change",()=>{mutablePreferences.audio.fftSize=Number(ui.selFFT.value);commitPreferences("fft size");});
    ui.selDistMode.addEventListener("change",()=>{mutablePreferences.bands.distributionMode=ui.selDistMode.value;commitPreferences("band distribution mode",{rebuildBandsOnDefinitionChange:true});});
    ui.inpBandFloorHz.addEventListener("change",()=>commitFrequency("floor")); ui.inpBandCeilingHz.addEventListener("change",()=>commitFrequency("ceiling"));
    if (ui.btnDownloadSpectralEvidence) {
      ui.btnDownloadSpectralEvidence.disabled = true;
      ui.btnDownloadSpectralEvidence.addEventListener("click", () => {
        try {
          const snapshot = captureSpectralEvidence(latestFrame);
          saveEvidence(snapshot);
          status(`Spectral evidence download requested (${snapshot.bands.length} bands).`);
        } catch (error) {
          status(`Spectral evidence unavailable: ${error.message}`);
        }
      });
    }
    syncControls(); return true;
  }
  return { init, refresh, syncControls };
}
export { createAnalysisPanelUi };
