import { clamp, dot } from "../core/utils.js";
import { CONFIG } from "../core/config.js";
import { runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { BandBankController } from "./band-bank-controller.js";
import { BandBank } from "./band-bank.js";

/* =============================================================================
   Audio Engine (L/R/C) + freq data for C
   ========================================================================== */
const AudioEngine = (() => {
  let audioContext = null;

  let activeUpstream = null;
  let mediaEl = null;
  let mediaElAbort = null; // AbortController — cancels all mediaEl listeners on teardown
  let mediaObjectUrl = null;
  let mediaStream = null;
  let sourceNode = null;
  let outputGain = null;
  let recorderTapDestination = null;
  let recorderTapConnectedOutputGain = null;

  let splitter = null;
  let sumNode = null;
  let sumGainL = null;
  let sumGainR = null;

  const bands = new Map();
  const status = {
    ready: false,
    monoLike: true,
    rmsL: 0, rmsR: 0, corrLR: 0,
  };

  function revokeObjectUrl(url) {
    if (!url) return;
    try { URL.revokeObjectURL(url); } catch {}
  }

  function releaseMediaElement(el, objectUrl) {
    if (!el) {
      revokeObjectUrl(objectUrl);
      return;
    }
    try { el.pause(); } catch {}
    try { el.currentTime = 0; } catch {}
    try { el.removeAttribute("src"); } catch {}
    try { el.load(); } catch {}
    revokeObjectUrl(objectUrl);
  }

  function describePlaybackError(err) {
    if (!err) return "Playback failed.";
    if (err.name === "NotSupportedError") return "Playback failed: unsupported or unreadable audio file.";
    if (err.name === "AbortError") return "Playback was interrupted before start.";
    return `Playback failed: ${err.message || err.name || "unknown error"}`;
  }

  function describeUpstreamError(descriptor, err) {
    if (descriptor && descriptor.kind === "file") return describePlaybackError(err);
    if (!err) return "Source activation failed.";
    return `Source activation failed: ${err.message || err.name || "unknown error"}`;
  }

  function ensureContext() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (BandBankController.onAudioContextKnown(audioContext.sampleRate)) {
      BandBankController.rebuildNow();
    }
    return audioContext;
  }

  function canCreateRecorderTapStream() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const proto = AudioContextCtor && AudioContextCtor.prototype;
    return !!(proto && typeof proto.createMediaStreamDestination === "function");
  }

  function readRecorderUpstreamStream() {
    if (!activeUpstream || activeUpstream.sourceType !== "media-stream") return null;
    if (!mediaStream || typeof mediaStream.getAudioTracks !== "function") return null;
    const audioTracks = mediaStream.getAudioTracks();
    return audioTracks && audioTracks.length ? mediaStream : null;
  }

  function disconnectRecorderTapConnection(node = recorderTapConnectedOutputGain) {
    if (!node || !recorderTapDestination) {
      if (node === recorderTapConnectedOutputGain) recorderTapConnectedOutputGain = null;
      return;
    }
    try { node.disconnect(recorderTapDestination); } catch {}
    if (node === recorderTapConnectedOutputGain) recorderTapConnectedOutputGain = null;
  }

  // Read-only recorder branch from the existing playback graph.
  // outputGain is the canonical insertion point because it already reflects the
  // audible app state (volume/mute) and sits on the main playback path after
  // source ownership has been established. Analysis remains on the splitter
  // branch, so this tap must never be moved onto analyser nodes.
  function syncRecorderTapConnection() {
    if (!recorderTapDestination || !outputGain) return recorderTapDestination ? recorderTapDestination.stream : null;
    if (recorderTapConnectedOutputGain === outputGain) return recorderTapDestination.stream;

    if (recorderTapConnectedOutputGain && recorderTapConnectedOutputGain !== outputGain) {
      disconnectRecorderTapConnection(recorderTapConnectedOutputGain);
    }

    outputGain.connect(recorderTapDestination);
    recorderTapConnectedOutputGain = outputGain;
    return recorderTapDestination.stream;
  }

  function ensureRecorderTapStream() {
    const ctx = ensureContext();
    if (typeof ctx.createMediaStreamDestination !== "function") return null;
    if (!recorderTapDestination) recorderTapDestination = ctx.createMediaStreamDestination();
    return syncRecorderTapConnection() || recorderTapDestination.stream;
  }

  function releaseRecorderTapStream() {
    disconnectRecorderTapConnection();
    if (!recorderTapDestination) return;
    // Stop the tap-owned stream tracks so recorder cleanup does not leave an
    // orphaned capture branch alive after the recording subsystem releases it.
    const tapStream = recorderTapDestination.stream;
    if (tapStream && typeof tapStream.getTracks === "function") {
      for (const track of tapStream.getTracks()) {
        try { track.stop(); } catch {}
      }
    }
    try { recorderTapDestination.disconnect(); } catch {}
    recorderTapDestination = null;
  }

  function teardown() {
    disconnectRecorderTapConnection(outputGain);
    try { if (sourceNode) sourceNode.disconnect(); } catch {}
    try { if (splitter) splitter.disconnect(); } catch {}
    try { if (sumNode) sumNode.disconnect(); } catch {}
    try { if (outputGain) outputGain.disconnect(); } catch {}

    bands.clear();
    sourceNode = null;
    splitter = null;
    sumNode = null;
    sumGainL = null;
    sumGainR = null;
    outputGain = null;

    const oldAbort = mediaElAbort;
    const oldMediaEl = mediaEl;
    const oldObjectUrl = mediaObjectUrl;
    activeUpstream = null;
    mediaElAbort = null;
    mediaEl = null;
    mediaObjectUrl = null;
    mediaStream = null;
    if (oldAbort) oldAbort.abort();
    releaseMediaElement(oldMediaEl, oldObjectUrl);

    status.ready = false;
    status.monoLike = true;
    status.rmsL = 0;
    status.rmsR = 0;
    status.corrLR = 0;
  }

  function makeAnalyserBand(id, label) {
    const ctx = ensureContext();
    const a = ctx.createAnalyser();
    a.fftSize = runtime.settings.audio.fftSize;
    a.smoothingTimeConstant = runtime.settings.audio.smoothingTimeConstant;

    const timeDomain = new Float32Array(a.fftSize);
    const freqDb = new Float32Array(a.frequencyBinCount);

    return { id, label, analyser: a, timeDomain, freqDb, rms: 0, energy01: 0 };
  }

  function applyPlaybackSettingsLive() {
    if (!outputGain) return;
    const s = runtime.settings;
    outputGain.gain.value = mediaEl ? (s.audio.muted ? 0 : s.audio.volume) : 1;
  }

  function applyAnalyserSettingsLive() {
    for (const band of bands.values()) {
      band.analyser.smoothingTimeConstant = runtime.settings.audio.smoothingTimeConstant;
      if (band.analyser.fftSize !== runtime.settings.audio.fftSize) {
        band.analyser.fftSize = runtime.settings.audio.fftSize;
        band.timeDomain = new Float32Array(band.analyser.fftSize);
        band.freqDb = new Float32Array(band.analyser.frequencyBinCount);
      }
    }
  }

  function buildGraph(descriptor) {
    const ctx = ensureContext();

    outputGain = ctx.createGain();
    splitter = ctx.createChannelSplitter(2);

    sumNode = ctx.createGain();
    sumGainL = ctx.createGain();
    sumGainR = ctx.createGain();
    sumGainL.gain.value = 0.5;
    sumGainR.gain.value = 0.5;

    const bandL = makeAnalyserBand("L", "Left");
    const bandR = makeAnalyserBand("R", "Right");
    const bandC = makeAnalyserBand("C", "Center");

    bands.set("L", bandL);
    bands.set("R", bandR);
    bands.set("C", bandC);

    sourceNode.connect(splitter);

    splitter.connect(bandL.analyser, 0);
    splitter.connect(bandR.analyser, 1);

    splitter.connect(sumGainL, 0);
    splitter.connect(sumGainR, 1);
    sumGainL.connect(sumNode);
    sumGainR.connect(sumNode);
    sumNode.connect(bandC.analyser);

    sourceNode.connect(outputGain);
    if (!descriptor || descriptor.monitorOutput !== false) outputGain.connect(ctx.destination);
    // Reattach any existing recorder tap destination to the rebuilt output path.
    // This keeps recording as a passive observer across track loads without
    // creating a second source or changing speaker output ownership.
    syncRecorderTapConnection();

    applyPlaybackSettingsLive();
    applyAnalyserSettingsLive();

    status.ready = true;
  }

  function createSourceNode(ctx, descriptor) {
    if (!descriptor || typeof descriptor !== "object") {
      throw new Error("Active source descriptor is required.");
    }
    if (descriptor.sourceType === "media-element") {
      if (!descriptor.mediaEl) throw new Error("media-element source requires mediaEl.");
      return ctx.createMediaElementSource(descriptor.mediaEl);
    }
    if (descriptor.sourceType === "media-stream") {
      if (!descriptor.mediaStream) throw new Error("media-stream source requires mediaStream.");
      return ctx.createMediaStreamSource(descriptor.mediaStream);
    }
    throw new Error(`Unsupported sourceType: ${descriptor.sourceType || "unknown"}`);
  }

  async function attachSource(descriptor) {
    const ctx = ensureContext();
    if (ctx.state === "suspended") await ctx.resume();

    teardown();

    sourceNode = createSourceNode(ctx, descriptor);
    activeUpstream = {
      kind: descriptor.kind || "file",
      sourceType: descriptor.sourceType,
      label: descriptor.label || "",
      monitorOutput: descriptor.monitorOutput !== false,
    };
    mediaEl = descriptor.sourceType === "media-element" ? (descriptor.mediaEl || null) : null;
    mediaElAbort = descriptor.sourceType === "media-element" ? (descriptor.abortController || null) : null;
    mediaObjectUrl = descriptor.sourceType === "media-element" ? (descriptor.objectUrl || null) : null;
    mediaStream = descriptor.sourceType === "media-stream" ? (descriptor.mediaStream || null) : null;

    buildGraph(activeUpstream);
    return true;
  }

  async function attachMediaStreamSource(nextMediaStream, opts = {}) {
    return attachSource({
      kind: opts.kind || "stream",
      sourceType: "media-stream",
      label: opts.label || "",
      monitorOutput: !!opts.monitorOutput,
      mediaStream: nextMediaStream,
    });
  }

  async function loadFile(file, requestId = null, opts = {}) {
    const autoPlay = opts && opts.autoPlay === false ? false : true;
    const isCurrentRequest = () => {
      if (requestId == null) return true;
      if (typeof AudioEngine._isLoadRequestCurrent !== "function") return true;
      return AudioEngine._isLoadRequestCurrent(requestId);
    };

    const ctx = ensureContext();
    if (ctx.state === "suspended") await ctx.resume();

    if (!isCurrentRequest()) return false;

    const nextMediaEl = document.createElement("audio");
    nextMediaEl.preload = "auto";

    const nextAbort = new AbortController();
    const sig = { signal: nextAbort.signal };

    const url = URL.createObjectURL(file);
    nextMediaEl.src = url;
    const playbackErrorMessage = "Playback error: unsupported or unreadable audio file.";

    nextMediaEl.addEventListener("loadeddata", () => {
      if (mediaObjectUrl === url) mediaObjectUrl = null;
      revokeObjectUrl(url);
    }, { once: true, ...sig });
    nextMediaEl.addEventListener("error", () => {
      if (mediaObjectUrl === url) mediaObjectUrl = null;
      revokeObjectUrl(url);
      state.audio.isLoaded = false;
      state.audio.filename = "";
      state.audio.isPlaying = false;
      state.audio.transportError = playbackErrorMessage;
      if (mediaEl === nextMediaEl && typeof AudioEngine._onFilePlaybackError === "function") {
        try {
          AudioEngine._onFilePlaybackError({
            mediaEl: nextMediaEl,
            fileName: file && file.name ? file.name : "",
            message: playbackErrorMessage,
          });
        } catch {}
      }
    }, { once: true, ...sig });

    nextMediaEl.addEventListener("play", () => {
      state.audio.isPlaying = true;
      state.audio.transportError = "";
    }, sig);
    nextMediaEl.addEventListener("pause", () => {
      state.audio.isPlaying = false;
    }, sig);
    nextMediaEl.addEventListener("ended", () => {
      state.audio.isPlaying = false;
      if (typeof AudioEngine._onTrackEnded === "function") {
        AudioEngine._onTrackEnded();
      }
    }, sig);

    try {
      await attachSource({
        kind: "file",
        sourceType: "media-element",
        label: file && file.name ? file.name : "",
        monitorOutput: true,
        mediaEl: nextMediaEl,
        abortController: nextAbort,
        objectUrl: url,
      });
    } catch (err) {
      releaseMediaElement(nextMediaEl, url);
      state.audio.isLoaded = false;
      state.audio.filename = "";
      state.audio.isPlaying = false;
      state.audio.transportError = describeUpstreamError({ kind: "file" }, err);
      return false;
    }

    let playErr = null;
    if (autoPlay) {
      playErr = await nextMediaEl.play().then(() => null).catch((err) => err);
    }

    if (!isCurrentRequest() || mediaEl !== nextMediaEl) {
      releaseMediaElement(nextMediaEl, url);
      return false;
    }

    const hardFailure = !!(nextMediaEl.error || (playErr && playErr.name === "NotSupportedError"));
    state.audio.isLoaded = !hardFailure;
    state.audio.filename = !hardFailure ? file.name : "";
    state.audio.transportError = hardFailure
      ? (playErr ? describePlaybackError(playErr) : (state.audio.transportError || "Playback failed: unsupported or unreadable audio file."))
      : (playErr ? describePlaybackError(playErr) : "");
    state.audio.isPlaying = !hardFailure && autoPlay && !nextMediaEl.paused;

    return !hardFailure;
  }

  async function playPause() {
    if (!mediaEl) return;
    const ctx = ensureContext();
    if (ctx.state === "suspended") await ctx.resume();

    if (mediaEl.paused) {
      const err = await mediaEl.play().then(() => null).catch((e) => e);
      if (err) {
        state.audio.isPlaying = false;
        state.audio.transportError = describePlaybackError(err);
        return;
      }
    } else mediaEl.pause();

    state.audio.isPlaying = !mediaEl.paused;
  }

  function stop() {
    if (!mediaEl) return;
    mediaEl.pause();
    try { mediaEl.currentTime = 0; } catch {}
    state.audio.isPlaying = false;
  }

  // Full transport release: pause + detach media src + tear down graph/listeners.
  // Unlike stop(), this leaves no track loaded in the engine.
  function unload() {
    teardown();
    state.audio.isPlaying = false;
  }

  function computeRmsFromWaveform(wf) {
    let sumSq = 0;
    for (let i = 0; i < wf.length; i++) {
      const v = wf[i];
      sumSq += v * v;
    }
    return Math.sqrt(sumSq / Math.max(1, wf.length));
  }

  function computeEnergy01(rms) {
    const g = runtime.settings.audio.rmsGain;
    return clamp(rms * g, 0, 1);
  }

  function updateMonoDetection(bandL, bandR) {
    const silenceThresh = CONFIG.limits.monoDetect.rightSilenceRms;
    const stride = CONFIG.limits.monoDetect.lrCorrelationStride;
    const corrThresh = CONFIG.limits.monoDetect.lrCorrelationMonoThresh;

    const rmsL = bandL.rms;
    const rmsR = bandR.rms;

    status.rmsL = rmsL;
    status.rmsR = rmsR;

    const lSilent = rmsL < silenceThresh;
    const rSilent = rmsR < silenceThresh;
    if (lSilent || rSilent) {
      status.corrLR = 0;
      status.monoLike = true;
      return;
    }

    const L = bandL.timeDomain;
    const R = bandR.timeDomain;

    const dLR = dot(L, R, stride);
    const dLL = dot(L, L, stride);
    const dRR = dot(R, R, stride);

    const denom = Math.sqrt(Math.max(1e-12, dLL * dRR));
    const corr = dLR / denom;

    status.corrLR = corr;
    status.monoLike = corr >= corrThresh;
  }

  function adjustCenterMixing() {
    if (!sumGainL || !sumGainR) return;
    const silenceThresh = CONFIG.limits.monoDetect.rightSilenceRms;
    const lSilent = status.rmsL < silenceThresh;
    const rSilent = status.rmsR < silenceThresh;
    if (!lSilent && rSilent) {
      sumGainL.gain.value = 1.0;
      sumGainR.gain.value = 0.0;
    } else if (lSilent && !rSilent) {
      sumGainL.gain.value = 0.0;
      sumGainR.gain.value = 1.0;
    } else {
      sumGainL.gain.value = 0.5;
      sumGainR.gain.value = 0.5;
    }
  }

  function sample() {
    if (!status.ready) return { ready: false, monoLike: true };

    const bandL = bands.get("L");
    const bandR = bands.get("R");
    const bandC = bands.get("C");

    bandL.analyser.getFloatTimeDomainData(bandL.timeDomain);
    bandR.analyser.getFloatTimeDomainData(bandR.timeDomain);

    bandL.rms = computeRmsFromWaveform(bandL.timeDomain);
    bandR.rms = computeRmsFromWaveform(bandR.timeDomain);

    updateMonoDetection(bandL, bandR);
    adjustCenterMixing();

    bandC.analyser.getFloatTimeDomainData(bandC.timeDomain);
    bandC.rms = computeRmsFromWaveform(bandC.timeDomain);

    bandL.energy01 = computeEnergy01(bandL.rms);
    bandR.energy01 = computeEnergy01(bandR.rms);
    bandC.energy01 = computeEnergy01(bandC.rms);

    bandC.analyser.getFloatFrequencyData(bandC.freqDb);
    BandBank.computeEnergiesFromCAnalyser(bandC, ensureContext().sampleRate);

    return { ready: true, monoLike: status.monoLike, bands: { L: bandL, R: bandR, C: bandC }, debug: { corrLR: status.corrLR } };
  }

  let _onTrackEnded = null;
  let _onFilePlaybackError = null;
  let _isLoadRequestCurrent = null;

  return { loadFile, playPause, stop, unload, sample, applyPlaybackSettingsLive, applyAnalyserSettingsLive,
    attachSource,
    attachMediaStreamSource,
    // Future recorder methods consume this descriptor only. They must not reach
    // into AudioEngine internals or mutate the playback/analyser graph directly.
    getRecorderTap() {
      const upstreamRecorderStream = readRecorderUpstreamStream();
      return {
        isLoaded: state.audio.isLoaded,
        isPlaying: state.audio.isPlaying,
        filename: state.audio.filename,
        supportsStreamDestination: !!upstreamRecorderStream || canCreateRecorderTapStream(),
        ensureStream() {
          return upstreamRecorderStream || ensureRecorderTapStream();
        },
        releaseStream() {
          if (upstreamRecorderStream) return;
          releaseRecorderTapStream();
        },
      };
    },
    // Exposed for Scrubber use only — reading/seeking currentTime/duration.
    // Do not use this to attach new event listeners; use the _onTrackEnded hook instead.
    getMediaEl() { return mediaEl; },
    get _onTrackEnded() { return _onTrackEnded; },
    set _onTrackEnded(fn) { _onTrackEnded = (typeof fn === "function") ? fn : null; },
    get _onFilePlaybackError() { return _onFilePlaybackError; },
    set _onFilePlaybackError(fn) { _onFilePlaybackError = (typeof fn === "function") ? fn : null; },
    get _isLoadRequestCurrent() { return _isLoadRequestCurrent; },
    set _isLoadRequestCurrent(fn) { _isLoadRequestCurrent = (typeof fn === "function") ? fn : null; },
  };
})();

/* =============================================================================
   Scrubber
   Draws waveform overview + played progress + live playhead on #scrubberCanvas.
   Handles click/drag seeking.
   Decodes audio asynchronously (non-blocking): playback starts immediately;
   waveform renders when decode completes. Explicit states are shown for
   no-track, decoding, ready, and waveform-unavailable.
   ========================================================================== */

export { AudioEngine };
