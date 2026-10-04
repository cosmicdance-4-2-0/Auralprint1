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
    ui.analysisPanel = document.getElementById("analysisPanel");
    ui.analysisStatus = document.getElementById("analysisStatus");
    ui.btnHideAnalysis = document.getElementById("btnHideAnalysis");
    ui.scenePanel = document.getElementById("scenePanel");
    ui.visualizersPanel = document.getElementById("visualizersPanel");
    ui.visualizersStatus = document.getElementById("visualizersStatus");
    ui.visualizerList = document.getElementById("visualizerList");
    ui.btnHideVisualizers = document.getElementById("btnHideVisualizers");
    ui.btnVisualizersAddOrb = document.getElementById("btnVisualizersAddOrb");
    ui.btnVisualizersOpenOrbs = document.getElementById("btnVisualizersOpenOrbs");
    ui.spectralRingEditor = document.getElementById("spectralRingEditor");
    ui.loadHint = document.getElementById("loadHint");
    ui.workspaceLauncher = document.getElementById("workspaceLauncher");
    ui.btnToggleWorkspaceLauncher = document.getElementById("btnToggleWorkspaceLauncher");
    ui.openAudio = document.getElementById("openAudio");
    ui.openAnalysis = document.getElementById("openAnalysis");
    ui.btnOpenAnalysis = document.getElementById("btnOpenAnalysis");
    ui.openVisualizers = document.getElementById("openVisualizers");
    ui.openSim = document.getElementById("openSim");
    ui.openScene = document.getElementById("openScene");
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
    ui.sceneStatus = document.getElementById("sceneStatus");

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

    ui.btnHideScene = document.getElementById("btnHideScene");

    ui.clrBg = document.getElementById("clrBg");
    ui.valBg = document.getElementById("valBg");
    ui.clrParticle = document.getElementById("clrParticle");
    ui.valParticle = document.getElementById("valParticle");

    ui.selParticleColorSrc = document.getElementById("selParticleColorSrc");
    ui.valParticleSrc = document.getElementById("valParticleSrc");

    ui.selDistMode = document.getElementById("selDistMode");
    ui.valDistMode = document.getElementById("valDistMode");
    ui.inpBandFloorHz = document.getElementById("inpBandFloorHz");
    ui.valBandFloorHz = document.getElementById("valBandFloorHz");
    ui.inpBandCeilingHz = document.getElementById("inpBandCeilingHz");
    ui.valBandCeilingHz = document.getElementById("valBandCeilingHz");
    ui.valBandCount = document.getElementById("valBandCount");

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
    ui.rngBandLineAlpha = document.getElementById("rngBandLineAlpha");
    ui.valBandLineAlpha = document.getElementById("valBandLineAlpha");
    ui.rngBandLineWidth = document.getElementById("rngBandLineWidth");
    ui.valBandLineWidth = document.getElementById("valBandLineWidth");

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

    ui.btnOpenAudio = document.getElementById("btnOpenAudio");
    ui.btnOpenVisualizers = document.getElementById("btnOpenVisualizers");
    ui.btnOpenSim = document.getElementById("btnOpenSim");
    ui.btnOpenScene = document.getElementById("btnOpenScene");

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
    bindRange(ui.rngWfDisp, CONFIG.limits.orbs.response.waveformRadialDisplaceFrac);

    bindRange(ui.rngMinRad, CONFIG.limits.orbs.response.minRadiusFrac);
    bindRange(ui.rngMaxRad, CONFIG.limits.orbs.response.maxRadiusFrac);

    const lineModes = [
      { v: "fixed", t: "Scene Fixed Particle Color" },
      { v: "lastParticle", t: "Last Particle" },
      { v: "dominantBand", t: "Global Dominant Band" },
    ];
    for (const m of lineModes) {
      const opt = document.createElement("option");
      opt.value = m.v;
      opt.textContent = m.t;
      ui.selLineColorMode.appendChild(opt);
    }

}

export { primeDomCache };
