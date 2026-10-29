import { clamp, hexToRgb01, rgb01ToCss, lerpRgb01 } from "../core/utils.js";
import { runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { AudioEngine } from "./audio-engine.js";
import { createWaveformAdmission } from "./waveform-admission.js";
import { buildWaveformPeaks } from "./waveform-extractor.js";
import { createWaveformControls } from "../ui/waveform-options.js";

/* =============================================================================
   Scrubber
   Draws waveform overview + played progress + live playhead on #scrubberCanvas.
   Handles click/drag seeking.
   Waveform admission coordinates bounded metadata probing and optional decoding
   separately from playback; the overview renders when extraction completes.
   Presents admission/extraction status without owning playback or source lifetime.
   ========================================================================== */

const Scrubber = (() => {
  let _canvas = null;
  let _ctx2d = null;
  let _waveform = null;    // Float32Array of normalised peak samples, or null
  let _dragging = null; // null | mouse | touch
  let _dragButton = 0;
  let _dragTouchId = null;
  let _waveformStatus = "empty"; // empty | waiting | decoding | ready | unavailable
  let _waveformDetail = null;
  let _controls = null;
  let _interactionCleanup = null;
  const waveformAdmission = createWaveformAdmission({
    onUpdate(status, peaks, detail) {
      _waveformStatus = status;
      _waveform = peaks;
      _waveformDetail = detail;
      _controls?.update(status, detail);
      draw();
    },
  });

  function init(canvasEl) {
    _interactionCleanup?.();
    cancelDrag();
    _canvas = canvasEl;
    _ctx2d = _canvas.getContext("2d");
    _canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", cancelDrag);
    _canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    const interactionWindow = window;
    const interactionDocument = document;
    const onVisibilityChange = () => { if (interactionDocument.hidden) cancelDrag(); };
    interactionDocument.addEventListener("visibilitychange", onVisibilityChange);
    _interactionCleanup = () => {
      canvasEl.removeEventListener("mousedown", onMouseDown);
      canvasEl.removeEventListener("touchstart", onTouchStart);
      for (const [type,handler] of [["mousemove",onMouseMove],["mouseup",onMouseUp],["blur",cancelDrag],["touchmove",onTouchMove],["touchend",onTouchEnd],["touchcancel",onTouchEnd]]) interactionWindow.removeEventListener(type,handler);
      interactionDocument.removeEventListener("visibilitychange", onVisibilityChange);
    };
    _controls?.dispose();
    _controls = createWaveformControls({generate:waveformAdmission.generate});
    _controls.update(_waveformStatus, _waveformDetail);
  }

  // Playback never awaits optional extraction. The coordinator alone owns work
  // admission; this module only presents the current result and seek timeline.
  async function loadFile(file, identity = {}) {
    cancelDrag();
    _waveform = null;
    return waveformAdmission.loadFile(file, {media:getMediaEl(), ...identity});
  }

  function reset() {
    cancelDrag();
    waveformAdmission.reset();
  }

  // AudioEngine exposes the media element for seeking and scoped metadata
  // handling through waveform admission; transport EOF retains its own owner.
  function getMediaEl() {
    return AudioEngine.getMediaEl ? AudioEngine.getMediaEl() : null;
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function readLiveSourceTimeText(sourceState = state.source) {
    // Live inputs intentionally avoid fake timeline semantics in the scrubber lane.
    if (!sourceState || (sourceState.kind !== "mic" && sourceState.kind !== "stream")) {
      return "--:-- / --:-- • no track loaded";
    }
    if (sourceState.kind === "mic") {
      if (sourceState.status === "requesting") return "Waiting for microphone permission.";
      if (sourceState.status === "active") return "Microphone input active • live input";
      if (sourceState.errorMessage) return sourceState.errorMessage;
      return "Microphone input is unavailable.";
    }
    if (sourceState.status === "requesting") return "Waiting for stream share permission.";
    if (sourceState.status === "active") return "Stream input active • live input";
    if (sourceState.errorMessage) return sourceState.errorMessage;
    return "Stream input is unavailable.";
  }

  function draw() {
    if (!_canvas || !_ctx2d) return;

    // Sync canvas pixel dimensions to CSS dimensions each frame.
    const w = _canvas.clientWidth;
    const h = _canvas.clientHeight;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width = w;
      _canvas.height = h;
    }
    if (w === 0 || h === 0) return;

    const c = _ctx2d;
    c.clearRect(0, 0, w, h);

    const s = runtime.settings;
    const bg = hexToRgb01(s.visuals.backgroundColor);
    const particle = hexToRgb01(s.visuals.particleColor);
    const trackBg = lerpRgb01(bg, particle, 0.14);
    const waveUnplayed = lerpRgb01(particle, bg, 0.62);
    const wavePlayed = lerpRgb01(particle, bg, 0.18);
    const playheadColor = lerpRgb01(particle, bg, 0.03);
    const unavailableColor = lerpRgb01({ r: 1, g: 0.45, b: 0.45 }, bg, 0.35);

    c.fillStyle = rgb01ToCss(trackBg, 0.95);
    c.fillRect(0, 0, w, h);

    const midY = h * 0.5;
    const el = getMediaEl();
    const hasLoadedTrack = !!el && state.audio.isLoaded;
    const hasSeekableDuration = hasLoadedTrack && Number.isFinite(el.duration) && el.duration > 0;
    const playbackFrac = hasSeekableDuration
      ? clamp(el.currentTime / el.duration, 0, 1)
      : 0;
    const playedPx = playbackFrac * w;

    // Waveform overview: unplayed baseline first, then played overlay clipped to playback.
    if (_waveform && _waveform.length > 0) {
      c.fillStyle = rgb01ToCss(waveUnplayed, 0.66);
      const buckets = _waveform.length;
      for (let b = 0; b < buckets; b++) {
        const x = (b / buckets) * w;
        const bw = Math.max(1, (w / buckets) - 0.5);
        const amp = _waveform[b] * midY * 0.92;
        c.fillRect(x, midY - amp, bw, amp * 2);
      }

      if (playedPx > 0) {
        c.save();
        c.beginPath();
        c.rect(0, 0, playedPx, h);
        c.clip();
        c.fillStyle = rgb01ToCss(wavePlayed, 0.92);
        for (let b = 0; b < buckets; b++) {
          const x = (b / buckets) * w;
          const bw = Math.max(1, (w / buckets) - 0.5);
          const amp = _waveform[b] * midY * 0.92;
          c.fillRect(x, midY - amp, bw, amp * 2);
        }
        c.restore();
      }
    } else {
      // Flat centre-line fallback with explicit status styling.
      const fallbackAlpha = (_waveformStatus === "decoding" || _waveformStatus === "waiting") ? 0.48 : (_waveformStatus === "unavailable" ? 0.52 : 0.34);
      c.strokeStyle = _waveformStatus === "unavailable" ? rgb01ToCss(unavailableColor, fallbackAlpha) : rgb01ToCss(waveUnplayed, fallbackAlpha);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, midY);
      c.lineTo(w, midY);
      c.stroke();

      if (playedPx > 0) {
        c.strokeStyle = _waveformStatus === "unavailable" ? rgb01ToCss(unavailableColor, 0.78) : rgb01ToCss(wavePlayed, (_waveformStatus === "decoding" || _waveformStatus === "waiting") ? 0.78 : 0.65);
        c.beginPath();
        c.moveTo(0, midY);
        c.lineTo(playedPx, midY);
        c.stroke();
      }
    }

    // Playhead line is drawn last so it stays highest-contrast/readable.
    if (hasSeekableDuration) {
      c.strokeStyle = rgb01ToCss(playheadColor, 0.98);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(playedPx, 0);
      c.lineTo(playedPx, h);
      c.stroke();

      // Time display
      const timeEl = document.getElementById("scrubberTime");
      if (timeEl) {
        const statusText = _waveformStatus === "metadata" ? " • waiting for metadata"
          : _waveformStatus === "waiting" ? " • waiting for waveform"
          : (_waveformStatus === "decoding" ? " • decoding waveform"
          : (_waveformStatus === "unavailable" ? (_waveformDetail?.manualEligible ? " • waveform optional" : " • waveform unavailable") : ""));
        const text = `${formatTime(el.currentTime)} / ${formatTime(el.duration)}${statusText}`;
        if (timeEl.textContent !== text) timeEl.textContent = text;
      }
    } else if (hasLoadedTrack) {
      const timeEl = document.getElementById("scrubberTime");
      if (timeEl) {
        const statusText = _waveformStatus === "metadata" ? " • waiting for metadata"
          : _waveformStatus === "waiting" ? " • waiting for waveform"
          : (_waveformStatus === "decoding" ? " • decoding waveform"
          : (_waveformStatus === "unavailable" ? (_waveformDetail?.manualEligible ? " • waveform optional" : " • waveform unavailable") : ""));
        const text = `--:-- / --:--${statusText}`;
        if (timeEl.textContent !== text) timeEl.textContent = text;
      }
    } else {
      const timeEl = document.getElementById("scrubberTime");
      if (timeEl) {
        const text = readLiveSourceTimeText();
        if (timeEl.textContent !== text) timeEl.textContent = text;
      }
    }
  }

  function seekToFraction(frac) {
    const el = getMediaEl();
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    el.currentTime = clamp(frac, 0, 1) * el.duration;
  }

  function fractionFromEvent(e) {
    const rect = _canvas.getBoundingClientRect();
    return clamp((e.clientX - rect.left) / rect.width, 0, 1);
  }

  function fractionFromTouch(touch) {
    if (!_canvas) return null;
    const rect = _canvas.getBoundingClientRect();
    if (!touch || !rect.width) return null;
    return clamp((touch.clientX - rect.left) / rect.width, 0, 1);
  }

  function ownedChangedTouch(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === _dragTouchId) return touch;
    }
    return null;
  }

  function cancelDrag() { _dragging = null; _dragButton = 0; _dragTouchId = null; }

  function onMouseDown(e) {
    _dragTouchId = null;
    _dragging = "mouse";
    // MouseEvent.button order differs from the buttons bitfield for middle/right.
    // Keep existing nonprimary-button seeking, tracking whichever button began it.
    _dragButton = e.button === 1 ? 4 : e.button === 2 ? 2 : 1 << e.button;
    seekToFraction(fractionFromEvent(e));
  }
  function onMouseMove(e) {
    if (_dragging !== "mouse") return;
    if (!(e.buttons & _dragButton)) { cancelDrag(); return; }
    seekToFraction(fractionFromEvent(e));
  }
  function onMouseUp() { if (_dragging === "mouse") cancelDrag(); }

  function onTouchStart(e) {
    // touches includes contacts that began elsewhere. Acquire only a new
    // contact delivered to this canvas, and retain it until its own end/cancel.
    const touch = e.changedTouches[0];
    const frac = fractionFromTouch(touch);
    if (frac == null) return;
    e.preventDefault();
    if (_dragging === "touch") return;
    _dragging = "touch";
    _dragButton = 0;
    _dragTouchId = touch.identifier;
    seekToFraction(frac);
  }
  function onTouchMove(e)  {
    if (_dragging !== "touch") return;
    const frac = fractionFromTouch(ownedChangedTouch(e));
    if (frac == null) return;
    e.preventDefault();
    seekToFraction(frac);
  }
  function onTouchEnd(e) { if (_dragging === "touch" && ownedChangedTouch(e)) cancelDrag(); }

  return { init, loadFile, reset, draw };
})();

export { Scrubber, buildWaveformPeaks };
