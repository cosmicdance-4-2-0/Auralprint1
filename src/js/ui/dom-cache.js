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
    ui.analysisPanel = document.getElementById("analysisPanel");
    ui.bankingPanel = document.getElementById("bankingPanel");
    ui.scenePanel = document.getElementById("scenePanel");
    ui.workspacePanel = document.getElementById("workspacePanel");
    ui.statusPanel = document.getElementById("statusPanel");
    ui.loadHint = document.getElementById("loadHint");

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
    ui.btnHideAnalysis = document.getElementById("btnHideAnalysis");
    ui.btnHideBanking = document.getElementById("btnHideBanking");
    ui.btnHideScene = document.getElementById("btnHideScene");
    ui.btnHideWorkspace = document.getElementById("btnHideWorkspace");

    ui.analysisStatus = document.getElementById("analysisStatus");
    ui.bankingStatus = document.getElementById("bankingStatus");
    ui.sceneStatus = document.getElementById("sceneStatus");
    ui.workspaceStatus = document.getElementById("workspaceStatus");
    ui.sceneSummaryPrimary = document.getElementById("sceneSummaryPrimary");
    ui.sceneSummaryActive = document.getElementById("sceneSummaryActive");
    ui.sceneSummarySelected = document.getElementById("sceneSummarySelected");
    ui.sceneCameraCard = document.getElementById("sceneCameraCard");
    ui.sceneCameraPrimary = document.getElementById("sceneCameraPrimary");
    ui.sceneCameraMode = document.getElementById("sceneCameraMode");
    ui.sceneCameraScope = document.getElementById("sceneCameraScope");
    ui.sceneCameraNote = document.getElementById("sceneCameraNote");
    ui.sceneNodeEmpty = document.getElementById("sceneNodeEmpty");
    ui.sceneNodeList = document.getElementById("sceneNodeList");
    ui.sceneInspectorEmpty = document.getElementById("sceneInspectorEmpty");
    ui.sceneInspectorPanel = document.getElementById("sceneInspectorPanel");
    ui.sceneInspectorTitle = document.getElementById("sceneInspectorTitle");
    ui.sceneInspectorType = document.getElementById("sceneInspectorType");
    ui.sceneInspectorNodeId = document.getElementById("sceneInspectorNodeId");
    ui.sceneInspectorOrder = document.getElementById("sceneInspectorOrder");
    ui.sceneInspectorEnabled = document.getElementById("sceneInspectorEnabled");
    ui.sceneInspectorFields = document.getElementById("sceneInspectorFields");

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
    ui.bandDominantRange = document.getElementById("bandDominantRange");
    ui.bandDominantEnergy = document.getElementById("bandDominantEnergy");
    ui.bandMeta = document.getElementById("bandMeta");
    ui.bandMetaCount = document.getElementById("bandMetaCount");
    ui.bandMetaDistribution = document.getElementById("bandMetaDistribution");
    ui.bandMetaFloor = document.getElementById("bandMetaFloor");
    ui.bandMetaCeiling = document.getElementById("bandMetaCeiling");
    ui.bandMetaEffectiveCeiling = document.getElementById("bandMetaEffectiveCeiling");
    ui.bandMetaNyquist = document.getElementById("bandMetaNyquist");
    ui.bandMetaContext = document.getElementById("bandMetaContext");
    ui.btnToggleBandInspector = document.getElementById("btnToggleBandInspector");
    ui.bandInspectorPanel = document.getElementById("bandInspectorPanel");
    ui.bandTable = document.getElementById("bandTable");
    ui.bandInspectorOpen = false;
    ui.lastBandHudUpdateMs = 0;
    ui.bandHudIntervalMs = 100;

    ui.launcherBar = document.getElementById("launcherBar");
    ui.launcherBarItems = document.getElementById("launcherBarItems");
    ui.btnLauncherToggle = document.getElementById("btnLauncherToggle");
    ui.btnLauncherAudioSource = document.getElementById("btnLauncherAudioSource");
    ui.btnLauncherAnalysis = document.getElementById("btnLauncherAnalysis");
    ui.btnLauncherBanking = document.getElementById("btnLauncherBanking");
    ui.btnLauncherScene = document.getElementById("btnLauncherScene");
    ui.btnLauncherRecording = document.getElementById("btnLauncherRecording");
    ui.btnLauncherWorkspace = document.getElementById("btnLauncherWorkspace");
    ui.btnLauncherStatus = document.getElementById("btnLauncherStatus");
    ui.launcherButtons = {
      audioSource: ui.btnLauncherAudioSource,
      analysis: ui.btnLauncherAnalysis,
      banking: ui.btnLauncherBanking,
      scene: ui.btnLauncherScene,
      recording: ui.btnLauncherRecording,
      workspace: ui.btnLauncherWorkspace,
      status: ui.btnLauncherStatus,
    };

    // Build 113 recording UI.
    // Keep all record controls routed through this dedicated panel/launcher path;
    // do not fold them into #audioPanel or create parallel recording UI state.
    ui.recordPanel = document.getElementById("recordPanel");
    ui.btnHideRecord = document.getElementById("btnHideRecord");
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

    ui.btnHideStatus = document.getElementById("btnHideStatus");
    ui.btnClearStatusLog = document.getElementById("btnClearStatusLog");
    ui.statusLogEmpty = document.getElementById("statusLogEmpty");
    ui.statusLogList = document.getElementById("statusLogList");

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
    bindRange(ui.rngMinRad, CONFIG.limits.audio.minRadiusFrac);
    bindRange(ui.rngMaxRad, CONFIG.limits.audio.maxRadiusFrac);
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
