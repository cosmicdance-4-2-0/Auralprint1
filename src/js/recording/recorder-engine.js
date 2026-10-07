import { CONFIG } from "../core/config.js";
import { state } from "../core/state.js";

/* =============================================================================
   Recorder Engine
   ========================================================================== */
const RecorderEngine = (() => {
  // RecorderEngine owns only future recording lifecycle orchestration.
  // It must observe existing render/audio systems through injected read-only taps
  // and must not take ownership of playback, analysis, queue, or presets.
  // Integration map:
  // - Render tap enters only through deps.getRenderTap from init().
  // - Source audio tap enters only through deps.getAudioTap from init().
  // - MIME negotiation, session lifecycle, export ownership, and cleanup live here.
  // - UI observes state.recording and dispatches actions back into this module.
  const runtime = {
    didInit: false,
    isDisposed: false,
    config: null,
    stateRef: null,
    deps: {
      getRenderTap: () => null,
      getAudioTap: () => null,
      nowMs: () => performance.now(),
    },
    lifecycle: {
      phase: "uninitialized",
      lastCode: "not-initialized",
      lastMessage: "Recording support has not been checked yet.",
    },
    mediaRecorder: null,
    renderStream: null,
    audioTap: null,
    audioStream: null,
    mergedStream: null,
    pendingChunks: [],
    chunkCount: 0,
    completedBlob: null,
    timerIntervalId: null,
    sessionToken: 0,
    startedAtMs: null,
    stoppedAtMs: null,
    activeMimeType: null,
    isStopRequested: false,
  };

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function readConfig() {
    return runtime.config || CONFIG.recording || null;
  }

  function readStateRef() {
    return runtime.stateRef && typeof runtime.stateRef === "object" ? runtime.stateRef : null;
  }

  function readHooksEnabled() {
    const config = readConfig();
    return !!(config && config.hooksEnabled);
  }

  function readIncludePlaybackAudio() {
    const recording = readStateRef();
    if (recording && typeof recording.includePlaybackAudio === "boolean") {
      return recording.includePlaybackAudio;
    }
    const config = readConfig();
    return !!(config && config.includePlaybackAudio);
  }

  function readTargetFpsOptions() {
    const config = readConfig();
    const configured = Array.isArray(config && config.targetFpsOptions)
      ? config.targetFpsOptions
      : [];
    const fallback = Number.isFinite(config && config.targetFps)
      ? [Math.floor(config.targetFps)]
      : [];
    const source = configured.length ? configured : fallback;
    const out = [];
    const seen = new Set();
    for (const value of source) {
      if (!Number.isFinite(value) || value <= 0) continue;
      const normalized = Math.floor(value);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  function normalizeTargetFps(value) {
    const options = readTargetFpsOptions();
    if (Number.isFinite(value)) {
      const normalized = Math.floor(value);
      if (options.includes(normalized)) return normalized;
    }
    if (options.length) return options[0];
    const config = readConfig();
    return Number.isFinite(config && config.targetFps) && config.targetFps > 0
      ? Math.floor(config.targetFps)
      : Math.floor(CONFIG.recording.targetFps);
  }

  function readConfiguredMimeTypes() {
    const config = readConfig();
    if (!Array.isArray(config && config.preferredMimeTypes)) return [];

    const seen = new Set();
    const out = [];
    for (const mimeType of config.preferredMimeTypes) {
      if (typeof mimeType !== "string") continue;
      const trimmed = mimeType.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out;
  }

  function mimeContainerForType(mimeType) {
    if (typeof mimeType !== "string") return "";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mp4")) return "mp4";
    return "";
  }

  function mimeListHasContainer(mimeTypes, container) {
    return Array.isArray(mimeTypes) && mimeTypes.some((mimeType) => mimeContainerForType(mimeType) === container);
  }

  function describeNegotiatedMimeSupport(configuredMimeTypes, availableMimeTypes, resolvedMimeType, includeAudio) {
    const container = mimeContainerForType(resolvedMimeType);
    const modeLabel = includeAudio ? "Audio + video" : "Video-only";
    if (!resolvedMimeType) {
      return {
        supportCode: "recording-supported",
        supportMessage: `${modeLabel} recording is available.`,
      };
    }

    if (container === "webm") {
      return {
        supportCode: "recording-supported-webm",
        supportMessage: `${modeLabel} recording is available. Using WebM (${resolvedMimeType}).`,
      };
    }

    if (container === "mp4") {
      const configuredWebm = mimeListHasContainer(configuredMimeTypes, "webm");
      const availableWebm = mimeListHasContainer(availableMimeTypes, "webm");
      return {
        supportCode: "recording-supported-mp4",
        supportMessage: configuredWebm && !availableWebm
          ? `${modeLabel} recording is available. WebM is unsupported in this browser; using MP4 (${resolvedMimeType}).`
          : `${modeLabel} recording is available. Using MP4 (${resolvedMimeType}).`,
      };
    }

    return {
      supportCode: "recording-supported",
      supportMessage: `${modeLabel} recording is available. Using ${resolvedMimeType}.`,
    };
  }

  function updateLifecycle(phase, code, message) {
    runtime.lifecycle.phase = phase;
    runtime.lifecycle.lastCode = code;
    runtime.lifecycle.lastMessage = message;
  }

  function hasRecordableSource() {
    if (state.audio && state.audio.isLoaded) return true;
    if (!state.source || state.source.sessionActive !== true) return false;
    return state.source.kind === "mic" || state.source.kind === "stream";
  }

  function getCanvasCaptureFn(canvas) {
    if (!canvas) return null;
    if (typeof canvas.captureStream === "function") return canvas.captureStream.bind(canvas);
    if (typeof canvas.mozCaptureStream === "function") return canvas.mozCaptureStream.bind(canvas);
    return null;
  }

  function readSupportDetails() {
    const renderTap = runtime.deps.getRenderTap() || null;
    const audioTap = runtime.deps.getAudioTap() || null;
    const canvas = renderTap && renderTap.canvas ? renderTap.canvas : null;
    const captureFn = getCanvasCaptureFn(canvas);
    const configuredMimeTypes = readConfiguredMimeTypes();
    const includeAudio = readIncludePlaybackAudio();
    const recording = readStateRef();

    let availableMimeTypes = [];
    let isSupported = false;
    let supportProbeStatus = "unsupported";
    let supportCode = "recording-unsupported";
    let supportMessage = "Recording is unavailable in this browser.";
    let selectedMimeType = null;
    let resolvedMimeType = null;

    if (!readHooksEnabled()) {
      supportProbeStatus = "disabled";
      supportCode = "hooks-disabled";
      supportMessage = "Recording is disabled by configuration.";
    } else if (!canvas || !captureFn) {
      supportCode = "canvas-capture-unsupported";
      supportMessage = "Canvas capture is unavailable in this browser.";
    } else if (typeof window.MediaRecorder !== "function") {
      supportCode = "media-recorder-unavailable";
      supportMessage = "MediaRecorder is unavailable in this browser.";
    } else if (typeof window.MediaRecorder.isTypeSupported !== "function") {
      supportCode = "mime-probe-unavailable";
      supportMessage = "MediaRecorder MIME probing is unavailable in this browser.";
    } else {
      availableMimeTypes = configuredMimeTypes.filter((mimeType) => window.MediaRecorder.isTypeSupported(mimeType));
      if (availableMimeTypes.length) {
        isSupported = true;
        supportProbeStatus = "supported";
      } else {
        supportCode = "no-supported-mime-types";
        supportMessage = "No configured recording MIME types are supported in this browser.";
      }
    }

    if (
      isSupported
      && includeAudio
      && (!audioTap
        || audioTap.supportsStreamDestination === false
        || typeof audioTap.ensureStream !== "function")
    ) {
      isSupported = false;
      supportProbeStatus = "unsupported";
      availableMimeTypes = [];
      supportCode = "audio-stream-destination-unavailable";
      supportMessage = "Source audio capture is unavailable in this browser.";
    }

    selectedMimeType = recording && availableMimeTypes.includes(recording.selectedMimeType)
      ? recording.selectedMimeType
      : (availableMimeTypes[0] || null);
    resolvedMimeType = isSupported ? selectedMimeType : null;
    if (isSupported) {
      const negotiated = describeNegotiatedMimeSupport(configuredMimeTypes, availableMimeTypes, resolvedMimeType, includeAudio);
      supportCode = negotiated.supportCode;
      supportMessage = negotiated.supportMessage;
    }

    return {
      canvas,
      captureFn,
      configuredMimeTypes,
      availableMimeTypes,
      selectedMimeType,
      resolvedMimeType,
      isSupported,
      supportProbeStatus,
      supportCode,
      supportMessage,
    };
  }

  function revokeObjectUrl(url) {
    if (!url) return;
    try { URL.revokeObjectURL(url); } catch {}
  }

  function stopStreamTracks(stream) {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch {}
    }
  }

  function readElapsedMs(nowMs = runtime.deps.nowMs()) {
    if (!Number.isFinite(runtime.startedAtMs)) {
      const recording = readStateRef();
      return recording && Number.isFinite(recording.elapsedMs) ? recording.elapsedMs : 0;
    }
    const endMs = Number.isFinite(runtime.stoppedAtMs) ? runtime.stoppedAtMs : nowMs;
    return Math.max(0, endMs - runtime.startedAtMs);
  }

  function readCaptureTimesliceMs() {
    const config = readConfig();
    const configured = config && config.chunkTimesliceMs;
    const canonical = CONFIG.recording.chunkTimesliceMs;
    return Number.isFinite(configured) && configured > 0
      ? Math.floor(configured)
      : Math.floor(canonical);
  }

  function createRecorderError(code, message, cause = null) {
    const err = new Error(message);
    err.recordingCode = code;
    if (cause) err.cause = cause;
    return err;
  }

  function readRecorderErrorCode(err, fallbackCode) {
    return err && typeof err.recordingCode === "string" ? err.recordingCode : fallbackCode;
  }

  function logRecorderException(code, err) {
    if (!err) return;
    try { console.error(`[RecorderEngine] ${code}`, err); } catch {}
  }

  function readCaptureFps() {
    const recording = readStateRef();
    if (recording && Number.isFinite(recording.targetFps)) {
      return normalizeTargetFps(recording.targetFps);
    }
    const config = readConfig();
    return normalizeTargetFps(config && config.targetFps);
  }

  function readTimerUpdateIntervalMs() {
    const config = readConfig();
    return Number.isFinite(config && config.timerUpdateIntervalMs) && config.timerUpdateIntervalMs > 0
      ? Math.floor(config.timerUpdateIntervalMs)
      : Math.floor(CONFIG.recording.timerUpdateIntervalMs);
  }

  function extensionForMimeType(mimeType) {
    if (typeof mimeType === "string" && mimeType.includes("mp4")) return ".mp4";
    if (typeof mimeType === "string" && mimeType.includes("webm")) return ".webm";
    return "";
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function buildOutputFileName(mimeType) {
    const config = readConfig();
    const template = typeof (config && config.outputFileNameTemplate) === "string" && config.outputFileNameTemplate.trim()
      ? config.outputFileNameTemplate
      : CONFIG.recording.outputFileNameTemplate;
    const extension = extensionForMimeType(mimeType);
    if (!extension) return "";
    const now = new Date();
    const stamp = {
      yyyy: String(now.getFullYear()),
      mm: pad2(now.getMonth() + 1),
      dd: pad2(now.getDate()),
      hh: pad2(now.getHours()),
      min: pad2(now.getMinutes()),
      ss: pad2(now.getSeconds()),
    };
    const base = template.replace(/\{(yyyy|mm|dd|hh|min|ss)\}/g, (_, key) => stamp[key]);
    return `${base}${extension}`;
  }

  function readMimeTypeForSession(requestedMimeType, support) {
    if (typeof requestedMimeType === "string" && support.availableMimeTypes.includes(requestedMimeType)) {
      return requestedMimeType;
    }
    return support.selectedMimeType;
  }

  function buildStatus(ok, code, message, extra = {}) {
    const support = extra.support || readSupportDetails();
    const recording = readStateRef() || {};
    const phase = hasOwn(extra, "phase") ? extra.phase : runtime.lifecycle.phase;
    const startedAtMs = hasOwn(extra, "startedAtMs")
      ? extra.startedAtMs
      : (Number.isFinite(runtime.startedAtMs) ? runtime.startedAtMs : recording.startedAtMs);
    const stoppedAtMs = hasOwn(extra, "stoppedAtMs")
      ? extra.stoppedAtMs
      : (Number.isFinite(runtime.stoppedAtMs) ? runtime.stoppedAtMs : recording.stoppedAtMs);
    const elapsedMs = hasOwn(extra, "elapsedMs")
      ? extra.elapsedMs
      : (Number.isFinite(recording.elapsedMs) ? recording.elapsedMs : 0);
    const chunkCount = hasOwn(extra, "chunkCount")
      ? extra.chunkCount
      : ((runtime.chunkCount > 0 || phase === "recording" || phase === "finalizing")
        ? runtime.chunkCount
        : (recording.chunkCount || 0));

    return {
      ok,
      code,
      message,
      hooksEnabled: readHooksEnabled(),
      includePlaybackAudio: hasOwn(extra, "includePlaybackAudio")
        ? !!extra.includePlaybackAudio
        : readIncludePlaybackAudio(),
      targetFps: hasOwn(extra, "targetFps")
        ? normalizeTargetFps(extra.targetFps)
        : readCaptureFps(),
      phase,
      supportProbeStatus: hasOwn(extra, "supportProbeStatus") ? extra.supportProbeStatus : support.supportProbeStatus,
      isSupported: hasOwn(extra, "isSupported") ? extra.isSupported : support.isSupported,
      availableMimeTypes: hasOwn(extra, "availableMimeTypes")
        ? extra.availableMimeTypes.slice()
        : support.availableMimeTypes.slice(),
      selectedMimeType: hasOwn(extra, "selectedMimeType") ? extra.selectedMimeType : support.selectedMimeType,
      resolvedMimeType: hasOwn(extra, "resolvedMimeType")
        ? extra.resolvedMimeType
        : (runtime.activeMimeType || support.resolvedMimeType || recording.resolvedMimeType || null),
      startedAtMs,
      stoppedAtMs,
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      chunkCount,
      lastExportUrl: hasOwn(extra, "lastExportUrl")
        ? extra.lastExportUrl
        : (recording.lastExportUrl || null),
      lastExportFileName: hasOwn(extra, "lastExportFileName")
        ? extra.lastExportFileName
        : (recording.lastExportFileName || ""),
      lastExportByteSize: hasOwn(extra, "lastExportByteSize")
        ? extra.lastExportByteSize
        : (recording.lastExportByteSize || 0),
      configuredMimeTypes: support.configuredMimeTypes.slice(),
      requestedMimeType: hasOwn(extra, "requestedMimeType") ? extra.requestedMimeType : null,
    };
  }

  function commitStatus(status, action = null) {
    // Canonical UI sync path: future recording UI reads state.recording only.
    // Keep engine-to-state projection here so DOM code never becomes a second source of truth.
    const recording = readStateRef();
    if (recording && typeof recording === "object") {
      recording.hooksEnabled = !!status.hooksEnabled;
      recording.includePlaybackAudio = !!status.includePlaybackAudio;
      recording.targetFps = normalizeTargetFps(status.targetFps);
      recording.phase = typeof status.phase === "string" ? status.phase : "uninitialized";
      recording.supportProbeStatus = typeof status.supportProbeStatus === "string"
        ? status.supportProbeStatus
        : "not-started";
      recording.isSupported = Object.prototype.hasOwnProperty.call(status, "isSupported")
        ? status.isSupported
        : null;
      recording.availableMimeTypes = Array.isArray(status.availableMimeTypes)
        ? status.availableMimeTypes.slice()
        : [];
      recording.selectedMimeType = typeof status.selectedMimeType === "string"
        ? status.selectedMimeType
        : null;
      recording.resolvedMimeType = typeof status.resolvedMimeType === "string"
        ? status.resolvedMimeType
        : null;
      recording.startedAtMs = Number.isFinite(status.startedAtMs) ? status.startedAtMs : null;
      recording.stoppedAtMs = Number.isFinite(status.stoppedAtMs) ? status.stoppedAtMs : null;
      recording.elapsedMs = Number.isFinite(status.elapsedMs) ? status.elapsedMs : 0;
      recording.chunkCount = Number.isInteger(status.chunkCount) ? status.chunkCount : 0;
      recording.lastExportUrl = typeof status.lastExportUrl === "string" ? status.lastExportUrl : null;
      recording.lastExportFileName = typeof status.lastExportFileName === "string" ? status.lastExportFileName : "";
      recording.lastExportByteSize = Number.isFinite(status.lastExportByteSize) ? status.lastExportByteSize : 0;
      if (action) recording.lastAction = action;
      recording.lastCode = status.code;
      recording.lastMessage = status.message;
      recording.lastUpdatedAtMs = runtime.deps.nowMs();
    }
    return status;
  }

  function syncRecordingStateTick({ phase = runtime.lifecycle.phase, force = false, nowMs = runtime.deps.nowMs() } = {}) {
    const recording = readStateRef();
    const startedAtMs = Number.isFinite(runtime.startedAtMs) ? runtime.startedAtMs : null;
    const stoppedAtMs = Number.isFinite(runtime.stoppedAtMs) ? runtime.stoppedAtMs : null;
    const elapsedMs = readElapsedMs(
      Number.isFinite(stoppedAtMs) ? stoppedAtMs : nowMs
    );
    const roundedElapsedMs = Math.max(0, Math.round(elapsedMs));
    const resolvedMimeType = runtime.activeMimeType || (recording && recording.resolvedMimeType) || null;
    const shouldCommit = force
      || !recording
      || recording.phase !== phase
      || recording.startedAtMs !== startedAtMs
      || recording.stoppedAtMs !== stoppedAtMs
      || recording.elapsedMs !== roundedElapsedMs
      || recording.chunkCount !== runtime.chunkCount
      || recording.resolvedMimeType !== resolvedMimeType
      || recording.lastCode !== runtime.lifecycle.lastCode
      || recording.lastMessage !== runtime.lifecycle.lastMessage;

    if (!shouldCommit) return recording;

    return commitStatus(buildStatus(true, runtime.lifecycle.lastCode, runtime.lifecycle.lastMessage, {
      support: readSupportDetails(),
      phase,
      startedAtMs,
      stoppedAtMs,
      elapsedMs: roundedElapsedMs,
      chunkCount: runtime.chunkCount,
      resolvedMimeType,
    }));
  }

  function stopRecordingTimerSync() {
    if (runtime.timerIntervalId == null) return;
    clearInterval(runtime.timerIntervalId);
    runtime.timerIntervalId = null;
  }

  function startRecordingTimerSync() {
    stopRecordingTimerSync();
    runtime.timerIntervalId = setInterval(() => {
      if (runtime.lifecycle.phase !== "recording") {
        stopRecordingTimerSync();
        return;
      }
      syncRecordingStateTick({ phase: "recording", nowMs: runtime.deps.nowMs() });
    }, readTimerUpdateIntervalMs());
  }

  function releaseMediaRecorderInstance() {
    if (runtime.mediaRecorder) {
      runtime.mediaRecorder.ondataavailable = null;
      runtime.mediaRecorder.onstop = null;
      runtime.mediaRecorder.onerror = null;
      runtime.mediaRecorder = null;
    }
  }

  function releaseActiveSession() {
    runtime.sessionToken += 1;
    stopRecordingTimerSync();
    releaseMediaRecorderInstance();
    // RecorderEngine owns all recorder capture seams; when a session ends there
    // is no valid downstream owner, so render/audio tap streams are always released.
    releaseMergedStream();
    runtime.isStopRequested = false;
  }

  // ── Render stream tap ──────────────────────────────────────────────────
  // Read-only tap: acquires a video stream from the existing render canvas.
  // This does NOT create a second canvas or alter the render pipeline.
  // The canvas continues rendering exactly as before; captureStream()
  // passively reads the canvas backbuffer at the configured frame rate.
  function acquireRenderStream() {
    releaseRenderStream();
    const renderTap = runtime.deps.getRenderTap();
    if (!renderTap || !renderTap.canvas) return null;
    const captureFn = getCanvasCaptureFn(renderTap.canvas);
    if (!captureFn) return null;

    try {
      const stream = captureFn(readCaptureFps());
      // A recorder-owned render tap must produce a real video track or fail
      // honestly; never pretend canvas capture succeeded without a stream.
      if (!stream || typeof stream.getVideoTracks !== "function" || !stream.getVideoTracks().length) {
        stopStreamTracks(stream);
        return null;
      }
      runtime.renderStream = stream;
      return runtime.renderStream;
    } catch {
      runtime.renderStream = null;
      return null;
    }
  }

  function releaseRenderStream() {
    const renderStream = runtime.renderStream;
    runtime.renderStream = null;
    if (!renderStream) return;
    // Cleanup stays inside RecorderEngine because the stream is recorder-owned,
    // even though the pixels come from the canonical app canvas.
    stopStreamTracks(renderStream);
  }

  // ── Audio stream tap ───────────────────────────────────────────────────
  // Passive branch from the existing playback graph.
  // AudioEngine owns the real graph: sourceNode → outputGain → ctx.destination.
  // ensureStream() creates a MediaStreamDestination and connects it as a
  // parallel branch from outputGain — the same node that drives the speakers.
  // This does NOT create a second source, alter volume/mute behavior, or
  // replace the analysis path (analysers sit upstream on the splitter branch).
  // The recording subsystem only holds the stream reference; AudioEngine
  // owns the graph node and its connection lifecycle via releaseStream().
  // Source-audio capture can come from either a playback tap or a live upstream
  // MediaStream. RecorderEngine treats both as the same recorder-audio seam.
  function acquireAudioStream() {
    releaseAudioStream();
    const audioTap = runtime.deps.getAudioTap();
    if (!audioTap) {
      return {
        ok: false,
        stream: null,
        code: "audio-tap-unavailable",
        message: "Source audio tap is unavailable.",
        audioTrackCount: 0,
      };
    }
    if (audioTap.supportsStreamDestination === false) {
      return {
        ok: false,
        stream: null,
        code: "audio-stream-destination-unavailable",
        message: "Source audio capture is unavailable in this browser.",
        audioTrackCount: 0,
      };
    }
    if (typeof audioTap.ensureStream !== "function") {
      return {
        ok: false,
        stream: null,
        code: "audio-tap-unimplemented",
        message: "Source audio tap does not expose a capture stream.",
        audioTrackCount: 0,
      };
    }
    runtime.audioTap = audioTap;
    try {
      runtime.audioStream = audioTap.ensureStream();
      const audioTrackCount = runtime.audioStream && typeof runtime.audioStream.getAudioTracks === "function"
        ? runtime.audioStream.getAudioTracks().length
        : 0;
      if (!runtime.audioStream || !audioTrackCount) {
        releaseAudioStream();
        return {
          ok: false,
          stream: null,
          code: "audio-stream-destination-unavailable",
          message: "Source audio capture did not provide an audio track.",
          audioTrackCount: 0,
        };
      }
      return {
        ok: true,
        stream: runtime.audioStream,
        code: "audio-capture-ready",
        message: "Source audio capture is ready.",
        audioTrackCount,
      };
    } catch (err) {
      logRecorderException("audio-stream-destination-failed", err);
      releaseAudioStream();
      return {
        ok: false,
        stream: null,
        code: "audio-stream-destination-failed",
        message: err && err.message
          ? `Source audio capture failed: ${err.message}`
          : "Source audio capture failed.",
        audioTrackCount: 0,
      };
    }
  }

  function releaseAudioStream() {
    const audioTap = runtime.audioTap;
    const audioStream = runtime.audioStream;
    runtime.audioTap = null;
    runtime.audioStream = null;
    let releasedByOwner = false;

    if (audioTap && typeof audioTap.releaseStream === "function") {
      // AudioEngine owns recorder-audio cleanup. For live upstream streams this
      // can be a deliberate no-op so recording never stops the active source.
      try {
        audioTap.releaseStream();
        releasedByOwner = true;
      } catch {}
    }
    if (!releasedByOwner && audioStream) stopStreamTracks(audioStream);
  }

  function resetSessionRuntime({ keepExport = true } = {}) {
    stopRecordingTimerSync();
    runtime.pendingChunks = [];
    runtime.chunkCount = 0;
    runtime.startedAtMs = null;
    runtime.stoppedAtMs = null;
    runtime.activeMimeType = null;
    runtime.isStopRequested = false;

    // keepExport preserves the last completed in-memory/blob result across
    // session cleanup. Only full disposal clears retained export data.
    if (!keepExport) {
      runtime.completedBlob = null;
      const recording = readStateRef();
      if (recording && recording.lastExportUrl) revokeObjectUrl(recording.lastExportUrl);
    }
  }

  function assembleCompletedRecordingExport() {
    if (!runtime.pendingChunks.length) {
      throw createRecorderError("no-captured-chunks", "Recording finished without any captured data.");
    }

    const blob = new Blob(runtime.pendingChunks, {
      type: runtime.activeMimeType,
    });
    if (!blob.size) {
      throw createRecorderError("empty-recording-export", "Recording export is empty.");
    }

    const fileName = buildOutputFileName(runtime.activeMimeType);
    if (!fileName) {
      throw createRecorderError("export-filename-unresolved", "Recording export filename could not be resolved.");
    }

    let objectUrl = "";
    try {
      objectUrl = URL.createObjectURL(blob);
    } catch (err) {
      throw createRecorderError(
        "object-url-create-failed",
        err && err.message
          ? `Recording export URL could not be created: ${err.message}`
          : "Recording export URL could not be created.",
        err
      );
    }

    return {
      blob,
      fileName,
      byteSize: blob.size,
      objectUrl,
    };
  }

  function applySupportSnapshot(action = null) {
    if (runtime.isDisposed) {
      updateLifecycle("disabled", "disposed", "RecorderEngine has been disposed.");
      return commitStatus(buildStatus(false, "disposed", "RecorderEngine has been disposed.", {
        phase: "disabled",
        supportProbeStatus: "not-started",
        isSupported: false,
        availableMimeTypes: [],
        selectedMimeType: null,
        resolvedMimeType: null,
      }), action);
    }

    const support = readSupportDetails();

    if (!readHooksEnabled()) {
      updateLifecycle("disabled", support.supportCode, support.supportMessage);
    } else if (!support.isSupported) {
      if (runtime.lifecycle.phase !== "recording" && runtime.lifecycle.phase !== "finalizing") {
        updateLifecycle("unsupported", support.supportCode, support.supportMessage);
      }
    } else if (
      runtime.lifecycle.phase === "uninitialized" ||
      runtime.lifecycle.phase === "boot-pending" ||
      runtime.lifecycle.phase === "unsupported" ||
      runtime.lifecycle.phase === "disabled" ||
      runtime.lifecycle.phase === "idle"
    ) {
      updateLifecycle("idle", support.supportCode, support.supportMessage);
    }

    return commitStatus(buildStatus(support.isSupported, runtime.lifecycle.lastCode, runtime.lifecycle.lastMessage, {
      support,
      phase: runtime.lifecycle.phase,
    }), action);
  }

  // ── Stream merging ──────────────────────────────────────────────────────
  // Combines the render and audio taps into the canonical recorder input
  // stream. Both inputs are read-only branches of existing pipelines, so
  // merging them here does not create new render or playback ownership.
  //
  // Fallback rules:
  //   renderStream required — null renderStream means unsupported.
  //   audioStream required only when includeAudio is enabled.
  //     If source-audio capture is disabled, video-only capture remains valid.
  // Returns an explicit merge result descriptor:
  // { ok, stream, mode, code, message, videoTrackCount, audioTrackCount }.
  function buildMergedStream(
    renderStream,
    audioStream,
    { includeAudio = false, audioFailureCode = null, audioFailureMessage = "" } = {}
  ) {
    const videoTracks = renderStream && typeof renderStream.getVideoTracks === "function"
      ? renderStream.getVideoTracks()
      : [];
    const audioTracks = audioStream && typeof audioStream.getAudioTracks === "function"
      ? audioStream.getAudioTracks()
      : [];

    if (!videoTracks.length) {
      return {
        ok: false,
        stream: null,
        mode: "unsupported",
        code: "missing-video-track",
        message: "Canvas capture did not provide a video track.",
        includeAudio,
        videoTrackCount: 0,
        audioTrackCount: audioTracks.length,
      };
    }

    let merged = null;
    try {
      merged = new MediaStream();
    } catch (err) {
      logRecorderException("merged-stream-unavailable", err);
      return {
        ok: false,
        stream: null,
        mode: "unsupported",
        code: "merged-stream-unavailable",
        message: err && err.message
          ? `Merged recording stream could not be created: ${err.message}`
          : "Merged recording stream could not be created.",
        includeAudio,
        videoTrackCount: videoTracks.length,
        audioTrackCount: audioTracks.length,
      };
    }
    for (const track of videoTracks) merged.addTrack(track);
    for (const track of audioTracks) merged.addTrack(track);

    if (includeAudio && audioTracks.length) {
      return {
        ok: true,
        stream: merged,
        mode: "audio-video",
        code: "recorder-input-audio-video",
        message: "Recording audio + video.",
        includeAudio,
        videoTrackCount: videoTracks.length,
        audioTrackCount: audioTracks.length,
      };
    }

    if (!includeAudio) {
      return {
        ok: true,
        stream: merged,
        mode: "video-only",
        code: "recorder-input-video-only",
        message: "Recording video only.",
        includeAudio,
        videoTrackCount: videoTracks.length,
        audioTrackCount: 0,
      };
    }

    return {
      ok: false,
      stream: null,
      mode: "unsupported",
      code: audioFailureCode || "audio-capture-required-but-unavailable",
      message: audioFailureMessage || "Source audio capture is required but unavailable.",
      includeAudio,
      videoTrackCount: videoTracks.length,
      audioTrackCount: 0,
    };
  }

  function acquireMergedStream() {
    releaseMergedStream();
    const includeAudio = readIncludePlaybackAudio();
    const renderStream = acquireRenderStream();
    if (!renderStream) {
      return {
        ok: false,
        stream: null,
        mode: "unsupported",
        code: "render-capture-unavailable",
        message: "Canvas capture did not provide a video stream.",
        includeAudio,
        videoTrackCount: 0,
        audioTrackCount: 0,
      };
    }

    let audioStream = null;
    let audioResult = null;
    if (includeAudio) {
      audioResult = acquireAudioStream();
      audioStream = audioResult.ok ? audioResult.stream : null;
    }

    const mergeResult = buildMergedStream(renderStream, audioStream, {
      includeAudio,
      audioFailureCode: audioResult && audioResult.code,
      audioFailureMessage: audioResult && audioResult.message,
    });
    runtime.mergedStream = mergeResult.ok ? mergeResult.stream : null;
    if (!mergeResult.ok) releaseMergedStream();
    return mergeResult;
  }

  function releaseMergedStream() {
    const mergedStream = runtime.mergedStream;
    const hasUnderlyingCapture = !!runtime.renderStream || !!runtime.audioStream;
    runtime.mergedStream = null;
    // The merged stream is recorder-owned glue only; actual track ownership
    // lives on the render/audio tap streams below.
    releaseRenderStream();
    releaseAudioStream();
    if (!hasUnderlyingCapture && mergedStream) stopStreamTracks(mergedStream);
  }

  function init(options = {}) {
    runtime.config = options.config || CONFIG.recording || null;
    runtime.stateRef = options.stateRef || null;
    runtime.deps.getRenderTap = (typeof options.getRenderTap === "function")
      ? options.getRenderTap
      : (() => null);
    runtime.deps.getAudioTap = (typeof options.getAudioTap === "function")
      ? options.getAudioTap
      : (() => null);
    runtime.deps.nowMs = (typeof options.nowMs === "function")
      ? options.nowMs
      : (() => performance.now());

    runtime.didInit = true;
    runtime.isDisposed = false;
    updateLifecycle("boot-pending", "boot-pending", "Checking recording support.");
    return applySupportSnapshot("init");
  }

  function getSupportStatus() {
    if (!runtime.didInit) {
      return commitStatus(buildStatus(false, "not-initialized", "RecorderEngine has not been initialized.", {
        phase: "uninitialized",
        supportProbeStatus: "not-started",
        isSupported: null,
        availableMimeTypes: [],
        selectedMimeType: null,
        resolvedMimeType: null,
      }));
    }
    return applySupportSnapshot();
  }

  function selectMimeType(mimeType) {
    const support = readSupportDetails();
    if (!support.isSupported) return applySupportSnapshot();
    if (!support.availableMimeTypes.includes(mimeType)) {
      return commitStatus(buildStatus(false, "invalid-mime-type", `Unsupported MIME type: ${mimeType}`, {
        support,
        phase: runtime.lifecycle.phase,
      }));
    }

    return commitStatus(buildStatus(true, "mime-selected", `Recording format updated to ${mimeType}.`, {
      support,
      phase: runtime.lifecycle.phase,
      selectedMimeType: mimeType,
      resolvedMimeType: mimeType,
    }), "select-mime");
  }

  function setIncludePlaybackAudio(enabled) {
    if (!runtime.didInit || runtime.isDisposed) return getSupportStatus();
    if (runtime.lifecycle.phase === "recording" || runtime.lifecycle.phase === "finalizing") {
      return commitStatus(buildStatus(false, "settings-locked", "Recording settings cannot change during an active or finalizing session.", {
        support: readSupportDetails(),
        phase: runtime.lifecycle.phase,
      }), "set-include-audio");
    }

    const recording = readStateRef();
    if (recording) recording.includePlaybackAudio = !!enabled;
    return applySupportSnapshot("set-include-audio");
  }

  function setTargetFps(fps) {
    if (!runtime.didInit || runtime.isDisposed) return getSupportStatus();
    if (runtime.lifecycle.phase === "recording" || runtime.lifecycle.phase === "finalizing") {
      return commitStatus(buildStatus(false, "settings-locked", "Recording settings cannot change during an active or finalizing session.", {
        support: readSupportDetails(),
        phase: runtime.lifecycle.phase,
      }), "set-target-fps");
    }

    const nextFps = normalizeTargetFps(fps);
    const recording = readStateRef();
    if (recording) recording.targetFps = nextFps;
    return applySupportSnapshot("set-target-fps");
  }

  function onTransportMutation(type, details = {}) {
    if (!runtime.didInit || runtime.isDisposed) return getSupportStatus();
    const support = readSupportDetails();
    const phase = runtime.lifecycle.phase;
    const isActivePhase = phase === "recording" || phase === "finalizing";
    if (!isActivePhase) {
      return buildStatus(support.isSupported, runtime.lifecycle.lastCode, runtime.lifecycle.lastMessage, {
        support,
        phase,
      });
    }

    let code = runtime.lifecycle.lastCode;
    let message = runtime.lifecycle.lastMessage;

    switch (type) {
      case "track-change-start":
        code = "track-change-start";
        message = "Recording continues across track changes.";
        break;
      case "track-change-complete":
        code = "track-change-complete";
        message = "Recording continues on the newly loaded track.";
        break;
      case "track-change-failed":
        code = "track-change-failed";
        message = "Track change failed. Recording continues while no audio is currently loaded.";
        break;
      case "audio-unloaded":
        code = "audio-unloaded";
        message = "Recording continues while no audio is currently loaded.";
        break;
      default:
        code = "transport-mutation";
        message = typeof details.message === "string" && details.message.trim()
          ? details.message.trim()
          : "Recording transport state changed.";
        break;
    }

    updateLifecycle(phase, code, message);
    return commitStatus(buildStatus(true, code, message, {
      support,
      phase,
      elapsedMs: readElapsedMs(),
    }), `transport-${type}`);
  }

  function finalizeStoppedRecorder(sessionToken) {
    if (sessionToken !== runtime.sessionToken) return;

    runtime.stoppedAtMs = Number.isFinite(runtime.stoppedAtMs) ? runtime.stoppedAtMs : runtime.deps.nowMs();
    const elapsedMs = readElapsedMs(runtime.stoppedAtMs);
    // commitStatus mutates the canonical state; capture URL ownership by value.
    const previousExportUrl = readStateRef()?.lastExportUrl || null;

    let nextUrl = null;
    let nextFileName = "";
    let nextByteSize = 0;

    try {
      const completedExport = assembleCompletedRecordingExport();
      nextFileName = completedExport.fileName;
      nextByteSize = completedExport.byteSize;
      nextUrl = completedExport.objectUrl;

      updateLifecycle("complete", "complete", "Recording export ready.");
      releaseActiveSession();

      commitStatus(buildStatus(true, "complete", "Recording export ready.", {
        support: readSupportDetails(),
        phase: "complete",
        resolvedMimeType: runtime.activeMimeType,
        startedAtMs: runtime.startedAtMs,
        stoppedAtMs: runtime.stoppedAtMs,
        elapsedMs,
        chunkCount: runtime.chunkCount,
        lastExportUrl: nextUrl,
        lastExportFileName: nextFileName,
        lastExportByteSize: nextByteSize,
      }), "finalize");

      runtime.completedBlob = completedExport.blob;
      // Replacement owns the new URL only after its metadata is committed.
      if (previousExportUrl && previousExportUrl !== nextUrl) revokeObjectUrl(previousExportUrl);
      resetSessionRuntime({ keepExport: true });
      return;
    } catch (err) {
      const code = readRecorderErrorCode(err, "finalize-failed");
      logRecorderException(code, err);
      if (nextUrl) revokeObjectUrl(nextUrl);

      const message = err && err.message ? err.message : "Recording export failed.";
      updateLifecycle("error", code, message);
      releaseActiveSession();
      runtime.pendingChunks = [];

      commitStatus(buildStatus(false, code, message, {
        support: readSupportDetails(),
        phase: "error",
        resolvedMimeType: runtime.activeMimeType,
        startedAtMs: runtime.startedAtMs,
        stoppedAtMs: runtime.stoppedAtMs,
        elapsedMs,
        chunkCount: runtime.chunkCount,
      }), "finalize");
      resetSessionRuntime({ keepExport: true });
    }
  }

  function handleRecorderError(sessionToken, event) {
    if (sessionToken !== runtime.sessionToken) return;

    const err = event && event.error ? event.error : null;
    logRecorderException("recorder-error", err || event);
    const message = err && err.message
      ? `Recording failed: ${err.message}`
      : "Recording failed while capturing or finalizing media.";
    runtime.stoppedAtMs = Number.isFinite(runtime.stoppedAtMs) ? runtime.stoppedAtMs : runtime.deps.nowMs();
    const elapsedMs = readElapsedMs(runtime.stoppedAtMs);

    updateLifecycle("error", "recorder-error", message);
    releaseActiveSession();
    runtime.pendingChunks = [];

    commitStatus(buildStatus(false, "recorder-error", message, {
      support: readSupportDetails(),
      phase: "error",
      resolvedMimeType: runtime.activeMimeType,
      startedAtMs: runtime.startedAtMs,
      stoppedAtMs: runtime.stoppedAtMs,
      elapsedMs,
      chunkCount: runtime.chunkCount,
    }), "error");
    resetSessionRuntime({ keepExport: true });
  }

  function start(options = {}) {
    if (!runtime.didInit || runtime.isDisposed) return getSupportStatus();
    const support = readSupportDetails();
    if (!support.isSupported) {
      if (runtime.lifecycle.phase !== "unsupported") {
        updateLifecycle("unsupported", support.supportCode, support.supportMessage);
      }
      return commitStatus(buildStatus(false, support.supportCode, support.supportMessage, {
        support,
        phase: "unsupported",
        requestedMimeType: options.mimeType || null,
      }), "start");
    }

    if (runtime.lifecycle.phase === "recording") {
      return commitStatus(buildStatus(false, "already-recording", "Recording is already in progress.", {
        support,
        phase: "recording",
      }), "start");
    }

    if (runtime.lifecycle.phase === "finalizing") {
      return commitStatus(buildStatus(false, "finalizing", "Recording is still finalizing the current export.", {
        support,
        phase: "finalizing",
      }), "start");
    }

    if (!hasRecordableSource()) {
      return commitStatus(buildStatus(false, "no-active-source", "Activate a source to start recording.", {
        support,
        phase: runtime.lifecycle.phase === "complete" ? "complete" : "idle",
      }), "start");
    }

    const selectedMimeType = readMimeTypeForSession(options.mimeType || null, support);
    if (!selectedMimeType) {
      updateLifecycle("unsupported", "no-supported-mime-types", "No supported recording MIME type is available.");
      return commitStatus(buildStatus(false, "no-supported-mime-types", "No supported recording MIME type is available.", {
        support,
        phase: "unsupported",
      }), "start");
    }
    const renderTap = runtime.deps.getRenderTap() || null;
    const captureFn = support.captureFn;
    if (!renderTap || !renderTap.canvas || !captureFn) {
      updateLifecycle("unsupported", "canvas-capture-unsupported", "Canvas capture is unavailable in this browser.");
      return commitStatus(buildStatus(false, "canvas-capture-unsupported", "Canvas capture is unavailable in this browser.", {
        support,
        phase: "unsupported",
      }), "start");
    }

    // A new session does not own the last completed export. Retain it until
    // successful replacement in finalizeStoppedRecorder(), or full disposal.
    resetSessionRuntime({ keepExport: true });

    try {
      const mergeResult = acquireMergedStream();
      if (!mergeResult.ok || !mergeResult.stream) {
        updateLifecycle("error", mergeResult && mergeResult.code ? mergeResult.code : "stream-acquisition-failed", mergeResult && mergeResult.message ? mergeResult.message : "Stream acquisition failed.");
        const status = commitStatus(buildStatus(false, mergeResult && mergeResult.code ? mergeResult.code : "stream-acquisition-failed", mergeResult && mergeResult.message ? mergeResult.message : "Stream acquisition failed.", {
          support,
          phase: "error",
          selectedMimeType,
          resolvedMimeType: null,
          startedAtMs: null,
          stoppedAtMs: null,
          elapsedMs: 0,
          chunkCount: 0,
        }), "start");
        resetSessionRuntime({ keepExport: true });
        return status;
      }
      runtime.mergedStream = mergeResult.stream;

      try {
        runtime.mediaRecorder = new MediaRecorder(runtime.mergedStream, { mimeType: selectedMimeType });
      } catch (err) {
        throw createRecorderError(
          "media-recorder-create-failed",
          err && err.message
            ? `MediaRecorder could not be created: ${err.message}`
            : "MediaRecorder could not be created for the selected MIME type.",
          err
        );
      }
      runtime.startedAtMs = runtime.deps.nowMs();
      runtime.stoppedAtMs = null;
      runtime.activeMimeType = selectedMimeType;
      runtime.pendingChunks = [];
      runtime.chunkCount = 0;
      runtime.isStopRequested = false;

      const sessionToken = ++runtime.sessionToken;
      runtime.mediaRecorder.ondataavailable = (event) => {
        if (sessionToken !== runtime.sessionToken) return;
        if (!event.data || !event.data.size) return;
        runtime.pendingChunks.push(event.data);
        runtime.chunkCount += 1;
        syncRecordingStateTick({
          phase: runtime.lifecycle.phase === "finalizing" ? "finalizing" : "recording",
          nowMs: runtime.deps.nowMs(),
        });
      };
      runtime.mediaRecorder.onstop = () => finalizeStoppedRecorder(sessionToken);
      runtime.mediaRecorder.onerror = (event) => handleRecorderError(sessionToken, event);

      updateLifecycle("recording", mergeResult.code, mergeResult.message);
      try {
        runtime.mediaRecorder.start(readCaptureTimesliceMs());
      } catch (err) {
        throw createRecorderError(
          "media-recorder-start-failed",
          err && err.message
            ? `MediaRecorder could not start: ${err.message}`
            : "MediaRecorder could not start.",
          err
        );
      }
      startRecordingTimerSync();

      return commitStatus(buildStatus(true, mergeResult.code, mergeResult.message, {
        support,
        phase: "recording",
        selectedMimeType,
        resolvedMimeType: selectedMimeType,
        startedAtMs: runtime.startedAtMs,
        stoppedAtMs: null,
        elapsedMs: 0,
        chunkCount: 0,
      }), "start");
    } catch (err) {
      const code = readRecorderErrorCode(err, "start-failed");
      const message = err && err.message ? err.message : "Recording could not be started.";
      logRecorderException(code, err);
      releaseActiveSession();
      updateLifecycle("error", code, message);
      const status = commitStatus(buildStatus(false, code, message, {
        support,
        phase: "error",
        selectedMimeType,
        resolvedMimeType: null,
        startedAtMs: null,
        stoppedAtMs: null,
        elapsedMs: 0,
        chunkCount: 0,
      }), "start");
      resetSessionRuntime({ keepExport: true });
      return status;
    }
  }

  function stop() {
    if (!runtime.didInit || runtime.isDisposed) return getSupportStatus();
    const support = readSupportDetails();

    if (runtime.isStopRequested) {
      return commitStatus(buildStatus(false, "finalizing", "Recording is already finalizing.", {
        support,
        phase: "finalizing",
        elapsedMs: readElapsedMs(),
      }), "stop");
    }

    if (runtime.lifecycle.phase === "finalizing") {
      return commitStatus(buildStatus(false, "finalizing", "Recording is already finalizing.", {
        support,
        phase: "finalizing",
        elapsedMs: readElapsedMs(),
      }), "stop");
    }

    if (runtime.lifecycle.phase !== "recording" || !runtime.mediaRecorder) {
      return commitStatus(buildStatus(false, "not-recording", "No active recording session exists.", {
        support,
        phase: runtime.lifecycle.phase,
      }), "stop");
    }

    if (runtime.mediaRecorder && runtime.mediaRecorder.state === "inactive") {
      updateLifecycle("error", "recorder-inactive", "Recording is no longer active.");
      releaseActiveSession();
      const status = commitStatus(buildStatus(false, "recorder-inactive", "Recording is no longer active.", {
        support,
        phase: "error",
        elapsedMs: readElapsedMs(),
      }), "stop");
      resetSessionRuntime({ keepExport: true });
      return status;
    }

    runtime.stoppedAtMs = runtime.deps.nowMs();
    runtime.isStopRequested = true;
    stopRecordingTimerSync();
    updateLifecycle("finalizing", "finalizing", "Finalizing recording export...");

    try {
      runtime.mediaRecorder.stop();
    } catch (err) {
      logRecorderException("stop-failed", err);
      const message = err && err.message ? err.message : "Recording stop failed.";
      updateLifecycle("error", "stop-failed", message);
      releaseActiveSession();
      const status = commitStatus(buildStatus(false, "stop-failed", message, {
        support,
        phase: "error",
        elapsedMs: readElapsedMs(runtime.stoppedAtMs),
      }), "stop");
      resetSessionRuntime({ keepExport: true });
      return status;
    }

    return commitStatus(buildStatus(true, "finalizing", "Finalizing recording export...", {
      support,
      phase: "finalizing",
      elapsedMs: readElapsedMs(runtime.stoppedAtMs),
    }), "stop");
  }

  function reset() {
    if (!runtime.didInit || runtime.isDisposed) return getSupportStatus();
    if (runtime.lifecycle.phase === "recording" || runtime.lifecycle.phase === "finalizing") {
      return commitStatus(buildStatus(false, "reset-blocked", "Stop the active recording before resetting recording state.", {
        support: readSupportDetails(),
        phase: runtime.lifecycle.phase,
        elapsedMs: readElapsedMs(),
      }), "reset");
    }

    resetSessionRuntime({ keepExport: true });
    runtime.isStopRequested = false;
    return applySupportSnapshot("reset");
  }

  function dispose() {
    runtime.sessionToken += 1;
    releaseActiveSession();
    resetSessionRuntime({ keepExport: false });

    runtime.deps.getRenderTap = () => null;
    runtime.deps.getAudioTap = () => null;
    runtime.deps.nowMs = () => performance.now();
    runtime.didInit = false;
    runtime.isDisposed = true;
    updateLifecycle("disabled", "disposed", "RecorderEngine has been disposed.");

    return commitStatus(buildStatus(true, "disposed", "RecorderEngine has been disposed.", {
      phase: "disabled",
      supportProbeStatus: "not-started",
      isSupported: false,
      availableMimeTypes: [],
      selectedMimeType: null,
      resolvedMimeType: null,
      startedAtMs: null,
      stoppedAtMs: null,
      elapsedMs: 0,
      chunkCount: 0,
      lastExportUrl: null,
      lastExportFileName: "",
      lastExportByteSize: 0,
    }), "dispose");
  }

  function onAnimationFrame(tsMs) {
    // Recorder timing is synchronized by a recorder-owned interval so elapsedMs
    // does not depend on render cadence. Keep this hook as a compatibility seam.
    void tsMs;
  }

  return {
    init,
    getSupportStatus,
    selectMimeType,
    setIncludePlaybackAudio,
    setTargetFps,
    onTransportMutation,
    start,
    stop,
    reset,
    dispose,
    onAnimationFrame,
  };
})();

/* =============================================================================
   UI
   ========================================================================== */

export { RecorderEngine };
