import { clamp, lerp, hexToRgb01, rgb01ToCss, lerpRgb01 } from "../core/utils.js";
import { TAU } from "../core/constants.js";
import { runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { Spaces } from "../core/spaces.js";
import { ColorPolicy } from "./color-policy.js";

/* =============================================================================
   Renderer
   ========================================================================== */
const Renderer = (() => {
  function clearFrame() {
    const ctx = state.ctx;
    const s = runtime.settings;
    ctx.fillStyle = s.visuals.backgroundColor;
    ctx.fillRect(0, 0, state.widthPx, state.heightPx);
  }

  function drawTrailLines(particles) {
    const s = runtime.settings;
    if (!s.trace.lines) return;

    const segments = s.trace.numLines;
    const neededPts = segments + 1;
    if (!particles || particles.length < 2) return;

    const startIdx = Math.max(0, particles.length - neededPts);
    const slice = particles.slice(startIdx);
    if (slice.length < 2) return;

    const ctx = state.ctx;
    const rgb = ColorPolicy.pickLineColorRgb01(particles);
    const stroke = rgb01ToCss(rgb, s.trace.lineAlpha);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = s.trace.lineWidthPx * state.dpr;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const p0 = Spaces.simToScreen(slice[0].xSim, slice[0].ySim);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);

    for (let i = 1; i < slice.length; i++) {
      const pi = Spaces.simToScreen(slice[i].xSim, slice[i].ySim);
      ctx.lineTo(pi.x, pi.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(particles, nowSec) {
    const s = runtime.settings;
    const ctx = state.ctx;

    const bg = hexToRgb01(s.visuals.backgroundColor);

    const sizeMax = s.particles.sizeMaxPx * state.dpr;
    const sizeMin = Math.min(s.particles.sizeMinPx, s.particles.sizeMaxPx) * state.dpr;

    const toMin = Math.max(0.0001, s.particles.sizeToMinSec);
    const ttl = Math.max(0.0001, s.particles.ttlSec);
    const fadeSec = Math.max(0.0001, ttl - toMin);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const age = nowSec - p.bornSec;

      let size = sizeMin;
      if (age < toMin) {
        const t = clamp(age / toMin, 0, 1);
        size = lerp(sizeMax, sizeMin, t);
      }

      const fg = p.rgbStart || hexToRgb01(s.visuals.particleColor);

      let color = fg;
      if (age >= toMin) {
        const t = clamp((age - toMin) / fadeSec, 0, 1);
        color = lerpRgb01(fg, bg, t);
      }

      const ps = Spaces.simToScreen(p.xSim, p.ySim);
      ctx.fillStyle = rgb01ToCss(color, 1);
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, size, 0, TAU);
      ctx.fill();
    }
  }

  function overlayWaveformDisplacementPx(baseRadiusPx, angleRad, waveform, overlay) {
    if (!waveform || waveform.length === 0) return 0;
    const phase01 = ((angleRad % TAU) + TAU) % TAU / TAU;
    const idx = Math.floor(phase01 * (waveform.length - 1));
    const sample = waveform[idx];
    // Overlay displacement ownership stays within bands.overlay.
    return baseRadiusPx * overlay.waveformRadialDisplaceFrac * sample;
  }

  function drawBandOverlay(bandC) {
    const bands = runtime.settings.bands;
    const overlay = bands.overlay;
    if (!overlay.enabled || !bandC) return;

    const ctx = state.ctx;
    const n = bands.count;
    const phase = state.bands.ringPhaseRad;

    const wf = bandC.timeDomain;

    const minDim = Math.min(state.widthPx, state.heightPx);
    // Overlay radius contract is independent from orb/audio radius controls.
    const minR = minDim * overlay.minRadiusFrac;
    const maxR = minDim * overlay.maxRadiusFrac;
    const safeMin = Math.min(minR, maxR);
    const safeMax = Math.max(minR, maxR);

    const pts = new Array(n);

    for (let i = 0; i < n; i++) {
      const angle = phase + (i * TAU / n);
      const e = clamp(state.bands.energies01[i] || 0, 0, 1);
      const baseR = safeMin + (safeMax - safeMin) * e;
      const disp = overlayWaveformDisplacementPx(baseR, angle, wf, overlay);

      const r = baseR + disp;
      const xSim = r * Math.cos(angle);
      const ySim = r * Math.sin(angle);

      pts[i] = { xSim, ySim };
    }

    if (overlay.connectAdjacent) {
      ctx.save();
      ctx.lineWidth = overlay.lineWidthPx * state.dpr;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const c = ColorPolicy.bandRgb01(i);
        ctx.strokeStyle = rgb01ToCss(c, overlay.lineAlpha);

        const a = Spaces.simToScreen(pts[i].xSim, pts[i].ySim);
        const b = Spaces.simToScreen(pts[j].xSim, pts[j].ySim);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    const rPx = overlay.pointSizePx * state.dpr;
    for (let i = 0; i < n; i++) {
      const c = ColorPolicy.bandRgb01(i);
      ctx.fillStyle = rgb01ToCss(c, overlay.alpha);
      const p = Spaces.simToScreen(pts[i].xSim, pts[i].ySim);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rPx, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderFrame(nowSec, bandC) {
    clearFrame();
    drawBandOverlay(bandC);
    for (const orb of state.orbs) {
      const particles = orb.trail.particles;
      drawTrailLines(particles);
      drawParticles(particles, nowSec);
    }
  }

  // RecorderEngine owns captureStream() and any MediaStream lifecycle.
  // Renderer exposes only the canonical display canvas as a read-only tap target.
  function getRecorderTap() {
    return {
      canvas: state.canvas,
      widthPx: state.widthPx,
      heightPx: state.heightPx,
      dpr: state.dpr,
    };
  }

  return { renderFrame, getRecorderTap };
})();

export { Renderer };
