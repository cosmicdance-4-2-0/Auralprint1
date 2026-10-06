import { createSourceState, state } from "../core/state.js";
import { AudioEngine } from "./audio-engine.js";

/* =============================================================================
   Input Source Manager
   Owns runtime source state, capability detection, activation/teardown, and
   normalized handoff into AudioEngine.
   ========================================================================== */
function createInputSourceManager(deps = {}) {
  const stateRef = deps.stateRef || state;
  const audioEngine = deps.audioEngine || AudioEngine;
  const getMediaDevices = typeof deps.getMediaDevices === "function"
    ? deps.getMediaDevices
    : () => (Object.prototype.hasOwnProperty.call(deps, "mediaDevices")
      ? deps.mediaDevices
      : (typeof navigator !== "undefined" ? navigator.mediaDevices : null));

  let activeSession = null;
  let activationSeq = 0;
  let onExternalLiveInputReset = null;

  function ensureSourceState() {
    if (!stateRef.source || typeof stateRef.source !== "object") stateRef.source = createSourceState();
    return stateRef.source;
  }

  function resetStreamMeta(sourceState) {
    sourceState.streamMeta.hasAudio = false;
    sourceState.streamMeta.hasVideo = false;
    sourceState.streamMeta.audioChannelCount = null;
  }

  function clearError(sourceState) {
    sourceState.errorCode = "";
    sourceState.errorMessage = "";
  }

  function detectSupport() {
    const mediaDevices = getMediaDevices();
    return {
      mic: !!(mediaDevices && typeof mediaDevices.getUserMedia === "function"),
      stream: !!(mediaDevices && typeof mediaDevices.getDisplayMedia === "function"),
    };
  }

  function readDisplayCaptureConstraints(mediaDevices) {
    let supported = {};
    try { supported = mediaDevices.getSupportedConstraints?.() || {}; } catch {}
    const audio = {};
    if (supported.channelCount) audio.channelCount = { ideal: 2 };
    if (supported.echoCancellation) audio.echoCancellation = { ideal: false };
    if (supported.noiseSuppression) audio.noiseSuppression = { ideal: false };
    if (supported.autoGainControl) audio.autoGainControl = { ideal: false };
    return { video: true, audio: Object.keys(audio).length ? audio : true };
  }

  function readAudioChannelCount(audioTracks) {
    // createMediaStreamSource selects the first audio track by Unicode ID order.
    let selectedTrack = null;
    for (const track of audioTracks) {
      if (track && (!selectedTrack || track.id < selectedTrack.id)) selectedTrack = track;
    }
    try {
      const channelCount = selectedTrack?.getSettings?.()?.channelCount;
      return Number.isInteger(channelCount) && channelCount > 0 ? channelCount : null;
    } catch {
      return null;
    }
  }

  function syncSupportState() {
    const sourceState = ensureSourceState();
    const support = detectSupport();
    sourceState.support.mic = support.mic;
    sourceState.support.stream = support.stream;
    sourceState.permission.mic = support.mic
      ? (sourceState.permission.mic === "unsupported" ? "unknown" : sourceState.permission.mic)
      : "unsupported";
    sourceState.permission.stream = support.stream
      ? (sourceState.permission.stream === "unsupported" ? "unknown" : sourceState.permission.stream)
      : "unsupported";
    return support;
  }

  function hasManagedSourceState() {
    const sourceState = ensureSourceState();
    return !!(activeSession || sourceState.sessionActive || sourceState.kind !== "none" || sourceState.status !== "idle");
  }

  function invalidatePendingActivations() {
    activationSeq += 1;
    return activationSeq;
  }

  function createActivationToken() {
    activationSeq += 1;
    return activationSeq;
  }

  function isActivationTokenCurrent(token) {
    return token === activationSeq;
  }

  function readAttemptMessage(kind, support) {
    if (!support[kind]) {
      return {
        status: "unsupported",
        code: `${kind}-unsupported`,
        message: kind === "mic"
          ? "Microphone capture is unavailable in this browser."
          : "Stream capture is unavailable in this browser.",
      };
    }
    return {
      status: "error",
      code: `${kind}-not-yet-implemented`,
      message: kind === "mic"
        ? "Microphone activation is not available in Build 114-A."
        : "Stream activation is not available in Build 114-A.",
    };
  }

  function readCancelledActivation(kind) {
    return {
      ok: false,
      kind,
      status: "idle",
      errorCode: `${kind}-activation-cancelled`,
      errorMessage: "",
    };
  }

  function readRecoverableMicPermission(permission) {
    if (permission === "granted" || permission === "denied" || permission === "unsupported") return permission;
    return "unknown";
  }

  function readRecoverableStreamPermission(permission) {
    if (permission === "granted" || permission === "unsupported") return permission;
    return "unknown";
  }

  function readFirstTrackLabel(tracks) {
    if (!Array.isArray(tracks)) return "";
    for (const track of tracks) {
      if (!track || typeof track.label !== "string") continue;
      const trimmed = track.label.trim();
      if (trimmed) return trimmed;
    }
    return "";
  }

  function readStreamSessionLabel(mediaStream) {
    const videoTracks = mediaStream && typeof mediaStream.getVideoTracks === "function"
      ? mediaStream.getVideoTracks()
      : [];
    const audioTracks = mediaStream && typeof mediaStream.getAudioTracks === "function"
      ? mediaStream.getAudioTracks()
      : [];
    return readFirstTrackLabel(videoTracks) || readFirstTrackLabel(audioTracks) || "Shared stream";
  }

  function normalizeMicFailure(err, permission) {
    const name = err && err.name ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      return {
        status: "error",
        code: "mic-denied",
        message: "Microphone permission denied.",
        permission: "denied",
        label: "Microphone",
      };
    }
    if (name === "AbortError" || name === "InvalidStateError") {
      return {
        status: "error",
        code: "mic-interrupted",
        message: "Microphone request was interrupted. Try again.",
        permission: readRecoverableMicPermission(permission),
        label: "Microphone",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        status: "error",
        code: "mic-unavailable",
        message: "No microphone was found.",
        permission: readRecoverableMicPermission(permission),
        label: "Microphone",
      };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return {
        status: "error",
        code: "mic-busy",
        message: "Microphone is unavailable or already in use.",
        permission: readRecoverableMicPermission(permission),
        label: "Microphone",
      };
    }
    return {
      status: "error",
      code: "mic-activation-failed",
      message: err && err.message
        ? `Microphone activation failed: ${err.message}`
        : "Microphone activation failed.",
      permission: readRecoverableMicPermission(permission),
      label: "Microphone",
    };
  }

  function normalizeStreamFailure(err, permission) {
    const name = err && err.name ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        status: "error",
        code: "stream-denied-or-cancelled",
        message: "Stream share was cancelled or denied.",
        permission: "unknown",
        label: "Shared stream",
      };
    }
    if (name === "SecurityError") {
      return {
        status: "error",
        code: "stream-blocked",
        message: "Stream capture is blocked in this browser or context.",
        permission: readRecoverableStreamPermission(permission),
        label: "Shared stream",
      };
    }
    if (name === "AbortError" || name === "InvalidStateError") {
      return {
        status: "error",
        code: "stream-interrupted",
        message: "Stream share request was interrupted. Try again.",
        permission: readRecoverableStreamPermission(permission),
        label: "Shared stream",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        status: "error",
        code: "stream-unavailable",
        message: "No display, tab, or system stream was available to share.",
        permission: readRecoverableStreamPermission(permission),
        label: "Shared stream",
      };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return {
        status: "error",
        code: "stream-busy",
        message: "Shared stream is unavailable or could not start.",
        permission: readRecoverableStreamPermission(permission),
        label: "Shared stream",
      };
    }
    return {
      status: "error",
      code: "stream-activation-failed",
      message: err && err.message
        ? `Stream activation failed: ${err.message}`
        : "Stream activation failed.",
      permission: readRecoverableStreamPermission(permission),
      label: "Shared stream",
    };
  }

  function isLoadRequestCurrent(requestId) {
    const guard = audioEngine && typeof audioEngine._isLoadRequestCurrent === "function"
      ? audioEngine._isLoadRequestCurrent
      : null;
    if (requestId == null || !guard) return true;
    return !!guard(requestId);
  }

  function clearActiveSessionListeners(session) {
    if (!session || !Array.isArray(session.cleanupFns)) return;
    for (const cleanup of session.cleanupFns) {
      try { cleanup(); } catch {}
    }
    session.cleanupFns = [];
  }

  function stopSessionStreamTracks(session) {
    const mediaStream = session && session.mediaStream;
    if (!mediaStream || typeof mediaStream.getTracks !== "function") return;
    for (const track of mediaStream.getTracks()) {
      try { track.stop(); } catch {}
    }
  }

  function resetToIdle() {
    const sourceState = ensureSourceState();
    sourceState.kind = "none";
    sourceState.status = "idle";
    sourceState.label = "";
    sourceState.sessionActive = false;
    clearError(sourceState);
    resetStreamMeta(sourceState);
    return sourceState;
  }

  function commitFailure(kind, { status, code, message, label = "" }) {
    const sourceState = ensureSourceState();
    sourceState.kind = kind;
    sourceState.status = status;
    sourceState.label = label;
    sourceState.sessionActive = false;
    sourceState.errorCode = code;
    sourceState.errorMessage = message;
    resetStreamMeta(sourceState);
    return {
      ok: false,
      kind,
      status,
      errorCode: code,
      errorMessage: message,
    };
  }

  function commitRecoverableIdle(previousKind, { code, message }) {
    const sourceState = ensureSourceState();
    sourceState.kind = "none";
    sourceState.status = "idle";
    sourceState.label = "";
    sourceState.sessionActive = false;
    sourceState.errorCode = code;
    sourceState.errorMessage = message;
    resetStreamMeta(sourceState);
    return {
      ok: false,
      kind: "none",
      previousKind,
      status: "idle",
      errorCode: code,
      errorMessage: message,
    };
  }

  function areAllAudioTracksEnded(mediaStream) {
    if (!mediaStream || typeof mediaStream.getAudioTracks !== "function") return false;
    const audioTracks = mediaStream.getAudioTracks();
    if (!Array.isArray(audioTracks) || !audioTracks.length) return false;
    return audioTracks.every((track) => track && track.readyState === "ended");
  }

  function createLiveInputEndedCleanup(kind, mediaStream) {
    if (!mediaStream || typeof mediaStream.getTracks !== "function") return [];
    const cleanupFns = [];
    const endSession = () => {
      handleExternalStreamEnded();
    };

    if (kind === "stream") {
      const audioTracks = typeof mediaStream.getAudioTracks === "function"
        ? mediaStream.getAudioTracks()
        : [];
      for (const track of audioTracks) {
        if (!track || typeof track.addEventListener !== "function") continue;
        const onEnded = () => {
          if (areAllAudioTracksEnded(mediaStream)) endSession();
        };
        track.addEventListener("ended", onEnded);
        cleanupFns.push(() => {
          try { track.removeEventListener("ended", onEnded); } catch {}
        });
      }
    } else {
      const tracks = mediaStream.getTracks();
      for (const track of tracks) {
        if (!track || typeof track.addEventListener !== "function") continue;
        const onEnded = () => {
          endSession();
        };
        track.addEventListener("ended", onEnded);
        cleanupFns.push(() => {
          try { track.removeEventListener("ended", onEnded); } catch {}
        });
      }
    }

    if (typeof mediaStream.addEventListener === "function") {
      const onInactive = () => {
        endSession();
      };
      mediaStream.addEventListener("inactive", onInactive);
      cleanupFns.push(() => {
        try { mediaStream.removeEventListener("inactive", onInactive); } catch {}
      });
    }
    return cleanupFns;
  }

  function commitActiveSession(session) {
    activeSession = session;
    const sourceState = ensureSourceState();
    sourceState.kind = session.kind;
    sourceState.status = "active";
    sourceState.label = session.label || "";
    sourceState.sessionActive = true;
    clearError(sourceState);
    sourceState.streamMeta.hasAudio = !!session.hasAudio;
    sourceState.streamMeta.hasVideo = !!session.hasVideo;
    sourceState.streamMeta.audioChannelCount = session.audioChannelCount ?? null;
    return {
      ok: true,
      kind: sourceState.kind,
      status: sourceState.status,
      label: sourceState.label,
    };
  }

  async function teardownActiveSource({ reason = "" } = {}) {
    const sourceState = ensureSourceState();
    if (!hasManagedSourceState()) {
      return false;
    }

    invalidatePendingActivations();

    if (sourceState.sessionActive || sourceState.status === "requesting") sourceState.status = "stopping";

    const session = activeSession;
    activeSession = null;

    clearActiveSessionListeners(session);
    stopSessionStreamTracks(session);

    if (audioEngine && typeof audioEngine.unload === "function" && (session || sourceState.sessionActive || sourceState.kind !== "none" || reason)) {
      audioEngine.unload();
    }

    resetToIdle();
    return true;
  }

  async function activateFile(file, options = {}) {
    if (!file) {
      return commitFailure("file", {
        status: "error",
        code: "file-missing",
        message: "No file was provided for activation.",
      });
    }

    if (hasManagedSourceState()) {
      await teardownActiveSource({ reason: "switch-to-file" });
    }

    const sourceState = ensureSourceState();
    sourceState.kind = "file";
    sourceState.status = "requesting";
    sourceState.label = file.name || "";
    sourceState.sessionActive = false;
    clearError(sourceState);
    resetStreamMeta(sourceState);

    const requestId = Object.prototype.hasOwnProperty.call(options, "requestId") ? options.requestId : null;
    const autoPlay = options && options.autoPlay === false ? false : true;
    const ok = await audioEngine.loadFile(file, requestId, { autoPlay });

    if (!isLoadRequestCurrent(requestId)) return false;

    if (!ok) {
      const fallbackMessage = stateRef.audio && stateRef.audio.transportError
        ? stateRef.audio.transportError
        : "Playback failed.";
      return commitFailure("file", {
        status: "error",
        code: "file-activation-failed",
        message: fallbackMessage,
        label: file.name || "",
      });
    }

    return commitActiveSession({
      kind: "file",
      label: file.name || "",
      mediaEl: typeof audioEngine.getMediaEl === "function" ? audioEngine.getMediaEl() : null,
      cleanupFns: [],
      hasAudio: true,
      hasVideo: false,
    });
  }

  async function activateMic() {
    if (hasManagedSourceState()) {
      await teardownActiveSource({ reason: "switch-to-mic" });
    }

    const support = syncSupportState();
    if (!support.mic) {
      return commitFailure("mic", readAttemptMessage("mic", support));
    }

    const sourceState = ensureSourceState();
    sourceState.kind = "mic";
    sourceState.status = "requesting";
    sourceState.label = "Microphone";
    sourceState.sessionActive = false;
    clearError(sourceState);
    resetStreamMeta(sourceState);
    if (sourceState.permission.mic !== "granted" && sourceState.permission.mic !== "denied" && sourceState.permission.mic !== "unsupported") {
      sourceState.permission.mic = "prompt";
    }

    const activationToken = createActivationToken();
    const mediaDevices = getMediaDevices();
    let mediaStream = null;

    try {
      mediaStream = await mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (!isActivationTokenCurrent(activationToken)) return readCancelledActivation("mic");
      const failure = normalizeMicFailure(err, sourceState.permission.mic);
      sourceState.permission.mic = failure.permission;
      return commitFailure("mic", failure);
    }

    if (!isActivationTokenCurrent(activationToken)) {
      stopSessionStreamTracks({ mediaStream });
      return readCancelledActivation("mic");
    }

    const audioTracks = mediaStream && typeof mediaStream.getAudioTracks === "function"
      ? mediaStream.getAudioTracks()
      : [];
    const firstAudioTrack = audioTracks[0] || null;
    const label = firstAudioTrack && typeof firstAudioTrack.label === "string" && firstAudioTrack.label.trim()
      ? firstAudioTrack.label.trim()
      : "Microphone";

    if (!audioTracks.length) {
      stopSessionStreamTracks({ mediaStream });
      sourceState.permission.mic = "granted";
      return commitFailure("mic", {
        status: "error",
        code: "mic-no-audio-track",
        message: "Microphone did not provide usable audio.",
        label,
      });
    }

    try {
      await audioEngine.attachMediaStreamSource(mediaStream, {
        kind: "mic",
        label,
        monitorOutput: false,
      });
    } catch (err) {
      stopSessionStreamTracks({ mediaStream });
      return commitFailure("mic", {
        status: "error",
        code: "mic-attach-failed",
        message: err && err.message
          ? `Microphone activation failed: ${err.message}`
          : "Microphone activation failed.",
        label,
      });
    }

    if (!isActivationTokenCurrent(activationToken)) {
      stopSessionStreamTracks({ mediaStream });
      if (audioEngine && typeof audioEngine.unload === "function") audioEngine.unload();
      return readCancelledActivation("mic");
    }

    sourceState.permission.mic = "granted";
    return registerFutureStreamSession("mic", mediaStream, { label });
  }

  async function activateStream() {
    if (hasManagedSourceState()) {
      await teardownActiveSource({ reason: "switch-to-stream" });
    }

    const support = syncSupportState();
    if (!support.stream) {
      return commitFailure("stream", readAttemptMessage("stream", support));
    }

    const sourceState = ensureSourceState();
    sourceState.kind = "stream";
    sourceState.status = "requesting";
    sourceState.label = "Shared stream";
    sourceState.sessionActive = false;
    clearError(sourceState);
    resetStreamMeta(sourceState);
    if (sourceState.permission.stream !== "granted" && sourceState.permission.stream !== "unsupported") {
      sourceState.permission.stream = "prompt";
    }

    const activationToken = createActivationToken();
    const mediaDevices = getMediaDevices();
    let mediaStream = null;

    try {
      mediaStream = await mediaDevices.getDisplayMedia(readDisplayCaptureConstraints(mediaDevices));
    } catch (err) {
      if (!isActivationTokenCurrent(activationToken)) return readCancelledActivation("stream");
      const failure = normalizeStreamFailure(err, sourceState.permission.stream);
      sourceState.permission.stream = failure.permission;
      return commitFailure("stream", failure);
    }

    if (!isActivationTokenCurrent(activationToken)) {
      stopSessionStreamTracks({ mediaStream });
      return readCancelledActivation("stream");
    }

    const audioTracks = mediaStream && typeof mediaStream.getAudioTracks === "function"
      ? mediaStream.getAudioTracks()
      : [];
    const label = readStreamSessionLabel(mediaStream);
    const audioChannelCount = readAudioChannelCount(audioTracks);

    if (!audioTracks.length) {
      stopSessionStreamTracks({ mediaStream });
      sourceState.permission.stream = "granted";
      return commitFailure("stream", {
        status: "error",
        code: "stream-no-audio-track",
        message: "Shared stream did not provide usable audio.",
        label,
      });
    }

    try {
      await audioEngine.attachMediaStreamSource(mediaStream, {
        kind: "stream",
        label,
        monitorOutput: false,
      });
    } catch (err) {
      stopSessionStreamTracks({ mediaStream });
      sourceState.permission.stream = "granted";
      return commitFailure("stream", {
        status: "error",
        code: "stream-attach-failed",
        message: err && err.message
          ? `Stream activation failed: ${err.message}`
          : "Stream activation failed.",
        label,
      });
    }

    if (!isActivationTokenCurrent(activationToken)) {
      stopSessionStreamTracks({ mediaStream });
      if (audioEngine && typeof audioEngine.unload === "function") audioEngine.unload();
      return readCancelledActivation("stream");
    }

    sourceState.permission.stream = "granted";
    return registerFutureStreamSession("stream", mediaStream, { label, audioChannelCount });
  }

  async function handleExternalStreamEnded() {
    if (!activeSession || !activeSession.mediaStream) return false;
    const endedKind = activeSession.kind || "stream";
    await teardownActiveSource({ reason: `external-${endedKind}-ended` });
    if (typeof onExternalLiveInputReset === "function") {
      try { onExternalLiveInputReset(); } catch {}
    }
    return commitRecoverableIdle(endedKind, {
      code: `${endedKind}-ended`,
      message: endedKind === "mic"
        ? "Microphone input ended. Select Mic to reconnect."
        : "Shared stream ended. Select Stream to share again.",
    });
  }

  function clearRecoverableIdleError() {
    const sourceState = ensureSourceState();
    if (sourceState.kind !== "none" || sourceState.status !== "idle") return false;
    if (!sourceState.errorCode && !sourceState.errorMessage) return false;
    sourceState.label = "";
    clearError(sourceState);
    return true;
  }

  function handleFilePlaybackError({ mediaEl = null, message = "" } = {}) {
    const session = activeSession;
    const sourceState = ensureSourceState();
    if (!session || session.kind !== "file") return false;
    if (mediaEl && session.mediaEl && session.mediaEl !== mediaEl) return false;

    const errorMessage = typeof message === "string" && message.trim()
      ? message.trim()
      : (stateRef.audio && stateRef.audio.transportError
        ? stateRef.audio.transportError
        : "Playback failed.");
    const label = session.label || sourceState.label || "";

    activeSession = null;
    clearActiveSessionListeners(session);

    if (audioEngine && typeof audioEngine.unload === "function") {
      audioEngine.unload();
    }

    if (stateRef.audio && typeof stateRef.audio === "object") {
      stateRef.audio.isLoaded = false;
      stateRef.audio.isPlaying = false;
      stateRef.audio.filename = "";
      stateRef.audio.transportError = errorMessage;
    }

    return commitFailure("file", {
      status: "error",
      code: "file-playback-error",
      message: errorMessage,
      label,
    });
  }

  function init(options = {}) {
    onExternalLiveInputReset = typeof options.onExternalLiveInputReset === "function"
      ? options.onExternalLiveInputReset
      : null;
    const support = syncSupportState();
    return {
      kind: ensureSourceState().kind,
      support,
    };
  }

  function registerFutureStreamSession(kind, mediaStream, options = {}) {
    const cleanupFns = createLiveInputEndedCleanup(kind, mediaStream);
    return commitActiveSession({
      kind,
      label: options.label || "",
      mediaStream,
      cleanupFns,
      hasAudio: !!(mediaStream && typeof mediaStream.getAudioTracks === "function" && mediaStream.getAudioTracks().length),
      hasVideo: !!(mediaStream && typeof mediaStream.getVideoTracks === "function" && mediaStream.getVideoTracks().length),
      audioChannelCount: kind === "stream" ? (options.audioChannelCount ?? null) : null,
    });
  }

  if (audioEngine && typeof audioEngine === "object") {
    audioEngine._onFilePlaybackError = handleFilePlaybackError;
  }

  return {
    init,
    activateFile,
    activateMic,
    activateStream,
    teardownActiveSource,
    handleExternalStreamEnded,
    registerFutureStreamSession,
    clearRecoverableIdleError,
  };
}

const InputSourceManager = createInputSourceManager();

export { createInputSourceManager, InputSourceManager };
