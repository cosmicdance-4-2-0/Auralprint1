import { clamp, hexToRgb01, rgb01ToCss, lerpRgb01 } from "../core/utils.js";
import { runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { AudioEngine } from "./audio-engine.js";

/* =============================================================================
   Scrubber
   Draws waveform overview + played progress + live playhead on #scrubberCanvas.
   Handles click/drag seeking.
   Decodes audio asynchronously (non-blocking): playback starts immediately;
   waveform renders when decode completes. Explicit states are shown for
   no-track, decoding, ready, and waveform-unavailable.
   ========================================================================== */
function buildWaveformPeaks(audioBuffer, bucketCount = 512) {
  const buckets = Math.max(1, Math.floor(bucketCount));
  const peaks = new Float32Array(buckets);
  const channelCount = Number.isInteger(audioBuffer && audioBuffer.numberOfChannels)
    ? audioBuffer.numberOfChannels
    : 0;
  if (!channelCount) return peaks;

  const channels = [];
  for (let i = 0; i < channelCount; i++) channels.push(audioBuffer.getChannelData(i));

  const sampleLength = channels[0] ? channels[0].length : 0;
  if (!sampleLength) return peaks;

  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const start = Math.floor((b * sampleLength) / buckets);
    const proportionalEnd = Math.floor(((b + 1) * sampleLength) / buckets);
    const endExclusive = proportionalEnd > start
      ? proportionalEnd
      : Math.min(sampleLength, start + 1);
    for (let sampleIndex = start; sampleIndex < endExclusive; sampleIndex++) {
      for (const channel of channels) {
        const abs = Math.abs(channel[sampleIndex]);
        if (abs > max) max = abs;
      }
    }
    peaks[b] = max;
  }

  return peaks;
}

const Scrubber = (() => {
  let _canvas = null;
  let _ctx2d = null;
  let _waveform = null;    // Float32Array of normalised peak samples, or null
  let _dragging = false;
  let _decodeToken = 0;
  let _decodeInFlight = false;
  let _waveformStatus = "empty"; // empty | decoding | ready | unavailable

  function init(canvasEl) {
    _dragging = false;
    _canvas = canvasEl;
    _ctx2d = _canvas.getContext("2d");
    _canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    _canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
  }

  // Called on every new file load. Decodes the file for the waveform overview,
  // completely independently of the media element used for playback. Does not
  // block — decode runs async; draw() will pick up _waveform once it is ready.
  async function loadFile(file) {
    _dragging = false;
    const decodeToken = ++_decodeToken;
    _decodeInFlight = true;
    _waveformStatus = "decoding";
    _waveform = null; // clear old waveform immediately
    draw();           // render explicit decoding state immediately
    try {
      const arrayBuffer = await file.arrayBuffer();
      if (decodeToken !== _decodeToken) return;
      // Use a throw-away AudioContext for offline decode — does not affect playback.
      const offlineCtx = new OfflineAudioContext(1, 1, 44100);
      const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
      if (decodeToken !== _decodeToken) return;
      _waveform = buildWaveformPeaks(audioBuffer, 512);
      _waveformStatus = "ready";
    } catch {
      // 3.5 — Waveform decode error handling:
      // decodeAudioData() can fail for corrupt files, unsupported codecs, or
      // stream sources. _waveform stays null and status becomes unavailable.
      // in the null branch — playback is completely unaffected because the
      // Scrubber decode runs on a throw-away OfflineAudioContext that is
      // entirely independent of the media element used for playback.
      // DoD satisfied: decode failure degrades gracefully; no crash, no block.
      if (decodeToken === _decodeToken) {
        _waveform = null;
        _waveformStatus = "unavailable";
      }
    } finally {
      if (decodeToken === _decodeToken) _decodeInFlight = false;
    }
    if (decodeToken === _decodeToken) draw();
  }

  // Reset: clear waveform and redraw blank canvas. Called on queue clear.
  function reset() {
    _dragging = false;
    _decodeToken++;
    _decodeInFlight = false;
    _waveformStatus = "empty";
    _waveform = null;
    draw();
  }

  // Get the <audio> element from AudioEngine internals. AudioEngine exposes
  // a getMediaEl() accessor added in this build for scrubber and seek use only.
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
      const fallbackAlpha = _waveformStatus === "decoding" ? 0.48 : (_waveformStatus === "unavailable" ? 0.52 : 0.34);
      c.strokeStyle = _waveformStatus === "unavailable" ? rgb01ToCss(unavailableColor, fallbackAlpha) : rgb01ToCss(waveUnplayed, fallbackAlpha);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, midY);
      c.lineTo(w, midY);
      c.stroke();

      if (playedPx > 0) {
        c.strokeStyle = _waveformStatus === "unavailable" ? rgb01ToCss(unavailableColor, 0.78) : rgb01ToCss(wavePlayed, _waveformStatus === "decoding" ? 0.78 : 0.65);
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
        const statusText = _waveformStatus === "decoding" ? " • decoding waveform"
          : (_waveformStatus === "unavailable" ? " • waveform unavailable" : "");
        timeEl.textContent = `${formatTime(el.currentTime)} / ${formatTime(el.duration)}${statusText}`;
      }
    } else if (hasLoadedTrack) {
      const timeEl = document.getElementById("scrubberTime");
      if (timeEl) {
        const statusText = _waveformStatus === "decoding" ? " • decoding waveform"
          : (_waveformStatus === "unavailable" ? " • waveform unavailable" : "");
        timeEl.textContent = `--:-- / --:--${statusText}`;
      }
    } else {
      const timeEl = document.getElementById("scrubberTime");
      if (timeEl) timeEl.textContent = readLiveSourceTimeText();
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

  function fractionFromTouch(e) {
    if (!_canvas) return null;
    const rect = _canvas.getBoundingClientRect();
    const t = e && e.touches && e.touches[0];
    if (!t || !rect.width) return null;
    return clamp((t.clientX - rect.left) / rect.width, 0, 1);
  }

  function onMouseDown(e) { _dragging = true; seekToFraction(fractionFromEvent(e)); }
  function onMouseMove(e) { if (_dragging) seekToFraction(fractionFromEvent(e)); }
  function onMouseUp()    { _dragging = false; }

  function onTouchStart(e) {
    const frac = fractionFromTouch(e);
    if (frac == null) return;
    e.preventDefault();
    _dragging = true;
    seekToFraction(frac);
  }
  function onTouchMove(e)  {
    if (!_dragging) return;
    const frac = fractionFromTouch(e);
    if (frac == null) return;
    e.preventDefault();
    seekToFraction(frac);
  }
  function onTouchEnd()    { _dragging = false; }

  return { init, loadFile, reset, draw };
})();

export { Scrubber, buildWaveformPeaks };
