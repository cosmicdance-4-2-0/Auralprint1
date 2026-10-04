import { CONFIG } from "../core/config.js";
import { state } from "../core/state.js";

/* =============================================================================
   DOM Cache
   ========================================================================== */
function bindRange(el, lim) {
  el.min = String(lim.min);
  el.max = String(lim.max);
  el.step = String(lim.step);
}

function primeDomCache() {
  const ui = state.ui;
    ui.audioPanel = document.getElementById("audioPanel");
    ui.simPanel = document.getElementById("simPanel");
    ui.bandsPanel = document.getElementById("bandsPanel");
    ui.visualizersPanel = document.getElementById("visualizersPanel");
    ui.visualizersStatus = document.getElementById("visualizersStatus");
    ui.visualizerList = document.getElementById("visualizerList");
    ui.btnHideVisualizers = document.getElementById("btnHideVisualizers");
    ui.btnVisualizersAddOrb = document.getElementById("btnVisualizersAddOrb");
    ui.btnVisualizersOpenOrbs = document.getElementById("btnVisualizersOpenOrbs");
    ui.btnVisualizersOpenBandOverlay = document.getElementById("btnVisualizersOpenBandOverlay");
    ui.bandOverlaySection = document.getElementById("bandOverlaySection");
    ui.loadHint = document.getElementById("loadHint");
    ui.workspaceLauncher = document.getElementById("workspaceLauncher");
    ui.btnToggleWorkspaceLauncher = document.getElementById("btnToggleWorkspaceLauncher");
    ui.openAudio = document.getElementById("openAudio");
    ui.openVisualizers = document.getElementById("openVisualizers");
    ui.openSim = document.getElementById("openSim");
    ui.openBands = document.getElementById("openBands");
    ui.openQueue = document.getElementById("openQueue");
    ui.btnOpenQueue = document.getElementById("btnOpenQueue");
    ui.btnHideQueue = document.getElementById("btnHideQueue");
    ui.btnTogglePanels = document.getElementById("btnTogglePanels");

    ui.btnLoad = document.getElementById("btnLoad");
    ui.sourceSwitch = document.getElementById("sourceSwitch");
    ui.btnSourceFile = document.getElementById("btnSourceFile");
    ui.btnSourceMic = document.getElementById("btnSourceMic");
    ui.btnSourceStream = document.getElementById("btnSourceStream");
    ui.btnPrev = document.getElementById("btnPrev");
    ui.btnNext = document.getElementById("btnNext");
    ui.btnPlay = document.getElementById("btnPlay");
    ui.btnStop = document.getElementById("btnStop");
    ui.btnRepeat = document.getElementById("btnRepeat");
    ui.btnShuffle = document.getElementById("btnShuffle");
    ui.chkMute = document.getElementById("chkMute");
    ui.rngVol = document.getElementById("rngVol");
    ui.valVol = document.getElementById("valVol");
    ui.audioStatus = document.getElementById("audioStatus");
    ui.btnHideAudio = document.getElementById("btnHideAudio");
    ui.btnToggleQueue = document.getElementById("btnToggleQueue");
    // scrubberCanvas and scrubberTime are NOT cached here — Scrubber.init()
    // receives the canvas directly from main(), and Scrubber.draw() queries
    // scrubberTime by ID. The UI module has no business reaching into Scrubber's elements.
    ui.queuePanel = document.getElementById("queuePanel");
    ui.queueList = document.getElementById("queueList");
    ui.btnClearQueue = document.getElementById("btnClearQueue");

    ui.btnShare = document.getElementById("btnShare");
    ui.btnApplyUrl = document.getElementById("btnApplyUrl");
    ui.btnResetPrefs = document.getElementById("btnResetPrefs");
    ui.btnResetVisuals = document.getElementById("btnResetVisuals");
    ui.btnHideSim = document.getElementById("btnHideSim");

    ui.simStatus = document.getElementById("simStatus");
    ui.orbEditorList = document.getElementById("orbEditorList");
    ui.bandsStatus = document.getElementById("bandsStatus");

    ui.chkLines = document.getElementById("chkLines");
    ui.valLines = document.getElementById("valLines");
    ui.rngNumLines = document.getElementById("rngNumLines");
    ui.valNumLines = document.getElementById("valNumLines");

    ui.selLineColorMode = document.getElementById("selLineColorMode");
    ui.valLineColorMode = document.getElementById("valLineColorMode");

    ui.rngEmit = document.getElementById("rngEmit");
    ui.valEmit = document.getElementById("valEmit");
    ui.rngSizeMax = document.getElementById("rngSizeMax");
    ui.valSizeMax = document.getElementById("valSizeMax");
    ui.rngSizeMin = document.getElementById("rngSizeMin");
    ui.valSizeMin = document.getElementById("valSizeMin");
    ui.rngSizeToMin = document.getElementById("rngSizeToMin");
    ui.valSizeToMin = document.getElementById("valSizeToMin");
    ui.rngTTL = document.getElementById("rngTTL");
    ui.valTTL = document.getElementById("valTTL");
    ui.rngOverlap = document.getElementById("rngOverlap");
    ui.valOverlap = document.getElementById("valOverlap");

    ui.rngOmega = document.getElementById("rngOmega");
    ui.valOmega = document.getElementById("valOmega");
    ui.rngWfDisp = document.getElementById("rngWfDisp");
    ui.valWfDisp = document.getElementById("valWfDisp");

    ui.rngRmsGain = document.getElementById("rngRmsGain");
    ui.valRmsGain = document.getElementById("valRmsGain");
    ui.rngMinRad = document.getElementById("rngMinRad");
    ui.valMinRad = document.getElementById("valMinRad");
    ui.rngMaxRad = document.getElementById("rngMaxRad");
    ui.valMaxRad = document.getElementById("valMaxRad");
    ui.rngSmooth = document.getElementById("rngSmooth");
    ui.valSmooth = document.getElementById("valSmooth");
    ui.selFFT = document.getElementById("selFFT");
    ui.valFFT = document.getElementById("valFFT");

    ui.btnHideBands = document.getElementById("btnHideBands");

    ui.clrBg = document.getElementById("clrBg");
    ui.valBg = document.getElementById("valBg");
    ui.clrParticle = document.getElementById("clrParticle");
    ui.valParticle = document.getElementById("valParticle");

    ui.selParticleColorSrc = document.getElementById("selParticleColorSrc");
    ui.valParticleSrc = document.getElementById("valParticleSrc");

    ui.selDistMode = document.getElementById("selDistMode");
    ui.valDistMode = document.getElementById("valDistMode");

    ui.chkBandOverlay = document.getElementById("chkBandOverlay");
    ui.valBandOverlay = document.getElementById("valBandOverlay");
    ui.chkBandConnect = document.getElementById("chkBandConnect");
    ui.valBandConnect = document.getElementById("valBandConnect");

    ui.rngBandAlpha = document.getElementById("rngBandAlpha");
    ui.valBandAlpha = document.getElementById("valBandAlpha");

    ui.rngBandPoint = document.getElementById("rngBandPoint");
    ui.valBandPoint = document.getElementById("valBandPoint");

    ui.rngBandOverlayMinRad = document.getElementById("rngBandOverlayMinRad");
    ui.valBandOverlayMinRad = document.getElementById("valBandOverlayMinRad");
    ui.rngBandOverlayMaxRad = document.getElementById("rngBandOverlayMaxRad");
    ui.valBandOverlayMaxRad = document.getElementById("valBandOverlayMaxRad");
    ui.rngBandOverlayWfDisp = document.getElementById("rngBandOverlayWfDisp");
    ui.valBandOverlayWfDisp = document.getElementById("valBandOverlayWfDisp");

    ui.selRingPhaseMode = document.getElementById("selRingPhaseMode");
    ui.valRingPhaseMode = document.getElementById("valRingPhaseMode");

    ui.rngRingSpeed = document.getElementById("rngRingSpeed");
    ui.valRingSpeed = document.getElementById("valRingSpeed");

    ui.rngHueOff = document.getElementById("rngHueOff");
    ui.valHueOff = document.getElementById("valHueOff");
    ui.rngSat = document.getElementById("rngSat");
    ui.valSat = document.getElementById("valSat");
    ui.rngVal = document.getElementById("rngVal");
    ui.valVal = document.getElementById("valVal");

    ui.bandDebug = document.getElementById("bandDebug");
    ui.bandMeta = document.getElementById("bandMeta");
    ui.bandTable = document.getElementById("bandTable");
    ui.lastBandHudUpdateMs = 0;
    ui.bandHudIntervalMs = 100;

    ui.btnOpenAudio = document.getElementById("btnOpenAudio");
    ui.btnOpenVisualizers = document.getElementById("btnOpenVisualizers");
    ui.btnOpenSim = document.getElementById("btnOpenSim");
    ui.btnOpenBands = document.getElementById("btnOpenBands");

    // Build 113 recording UI.
    // Keep all record controls routed through this dedicated panel/launcher path;
    // do not fold them into #audioPanel or create parallel recording UI state.
    ui.recordPanel = document.getElementById("recordPanel");
    ui.openRecord = document.getElementById("openRecord");
    ui.btnHideRecord = document.getElementById("btnHideRecord");
    ui.btnOpenRecord = document.getElementById("btnOpenRecord");
    ui.btnRecordStart = document.getElementById("btnRecordStart");
    ui.btnRecordStop = document.getElementById("btnRecordStop");
    ui.btnRecordDownloadLast = document.getElementById("btnRecordDownloadLast");
    ui.recordExportMeta = document.getElementById("recordExportMeta");
    ui.chkRecordIncludeAudio = document.getElementById("chkRecordIncludeAudio");
    ui.valRecordIncludeAudio = document.getElementById("valRecordIncludeAudio");
    ui.selRecordMime = document.getElementById("selRecordMime");
    ui.valRecordMime = document.getElementById("valRecordMime");
    ui.valRecordPreferredMime = document.getElementById("valRecordPreferredMime");
    ui.selRecordTargetFps = document.getElementById("selRecordTargetFps");
    ui.valRecordTargetFps = document.getElementById("valRecordTargetFps");
    ui.recordTimer = document.getElementById("recordTimer");
    ui.recordStatus = document.getElementById("recordStatus");
    ui.recordSupport = document.getElementById("recordSupport");
    ui.recordSettingsNote = document.getElementById("recordSettingsNote");

    ui.fileInput = document.getElementById("fileInput");

    bindRange(ui.rngVol, CONFIG.ui.volume);
    bindRange(ui.rngNumLines, CONFIG.limits.trace.numLines);

    bindRange(ui.rngEmit, CONFIG.limits.particles.emitPerSecond);
    bindRange(ui.rngSizeMax, CONFIG.limits.particles.sizeMaxPx);
    bindRange(ui.rngSizeMin, CONFIG.limits.particles.sizeMinPx);
    bindRange(ui.rngSizeToMin, CONFIG.limits.particles.sizeToMinSec);
    bindRange(ui.rngTTL, CONFIG.limits.particles.ttlSec);
    bindRange(ui.rngOverlap, CONFIG.limits.particles.overlapRadiusPx);

    bindRange(ui.rngOmega, CONFIG.limits.motion.angularSpeedRadPerSec);
    bindRange(ui.rngWfDisp, CONFIG.limits.motion.waveformRadialDisplaceFrac);

    bindRange(ui.rngRmsGain, CONFIG.limits.audio.rmsGain);
    bindRange(ui.rngMinRad, CONFIG.limits.orbs.response.minRadiusFrac);
    bindRange(ui.rngMaxRad, CONFIG.limits.orbs.response.maxRadiusFrac);
    bindRange(ui.rngSmooth, CONFIG.limits.audio.smoothingTimeConstant);

    bindRange(ui.rngBandAlpha, CONFIG.limits.bands.overlayAlpha);
    bindRange(ui.rngBandPoint, CONFIG.limits.bands.pointSizePx);
    bindRange(ui.rngBandOverlayMinRad, CONFIG.limits.bands.overlayMinRadiusFrac);
    bindRange(ui.rngBandOverlayMaxRad, CONFIG.limits.bands.overlayMaxRadiusFrac);
    bindRange(ui.rngBandOverlayWfDisp, CONFIG.limits.bands.overlayWaveformRadialDisplaceFrac);
    bindRange(ui.rngHueOff, CONFIG.limits.bands.hueOffsetDeg);
    bindRange(ui.rngSat, CONFIG.limits.bands.saturation);
    bindRange(ui.rngVal, CONFIG.limits.bands.value);

    bindRange(ui.rngRingSpeed, CONFIG.limits.bands.ringSpeedRadPerSec);

    for (const size of CONFIG.limits.audio.fftSizes) {
      const opt = document.createElement("option");
      opt.value = String(size);
      opt.textContent = String(size);
      ui.selFFT.appendChild(opt);
    }

    const srcs = [
      { v: "dominant", t: "dominant band" },
      { v: "angle", t: "phase locked (Glitch Mode)" },
      { v: "fixed", t: "fixed particle color" },
    ];
    for (const s of srcs) {
      const opt = document.createElement("option");
      opt.value = s.v;
      opt.textContent = s.t;
      ui.selParticleColorSrc.appendChild(opt);
    }

    const lineModes = [
      { v: "fixed", t: "fixed (particle color)" },
      { v: "lastParticle", t: "last particle color" },
      { v: "dominantBand", t: "dominant band color" },
    ];
    for (const m of lineModes) {
      const opt = document.createElement("option");
      opt.value = m.v;
      opt.textContent = m.t;
      ui.selLineColorMode.appendChild(opt);
    }

    const phaseModes = [
      { v: "orb", t: "lock to orb phase" },
      { v: "free", t: "free-run (ring speed)" },
    ];
    for (const m of phaseModes) {
      const opt = document.createElement("option");
      opt.value = m.v;
      opt.textContent = m.t;
      ui.selRingPhaseMode.appendChild(opt);
    }

    for (const mode of CONFIG.limits.bands.distributionModes) {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = mode;
      ui.selDistMode.appendChild(opt);
    }


}

export { primeDomCache };
