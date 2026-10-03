import { clamp, rgb01ToCss } from "../../core/utils.js";
import { TAU } from "../../core/constants.js";
import { runtime } from "../../core/preferences.js";
import { state } from "../../core/state.js";
import { ColorPolicy } from "../color-policy.js";

function overlayWaveformDisplacementPx(baseRadiusPx, angleRad, waveform, overlay) {
  if (!waveform || waveform.length === 0) return 0;
  const phase01 = ((angleRad % TAU) + TAU) % TAU / TAU;
  const idx = Math.floor(phase01 * (waveform.length - 1));
  const sample = waveform[idx];
  return baseRadiusPx * overlay.waveformRadialDisplaceFrac * sample;
}

function simToTargetScreen(xSim, ySim, targetMetrics) {
  return {
    x: targetMetrics.xPx + targetMetrics.widthPx * 0.5 + xSim,
    y: targetMetrics.yPx + targetMetrics.heightPx * 0.5 - ySim,
  };
}

function readFrameEnergy01(band) {
  return Number.isFinite(band && band.energy) ? clamp(band.energy, 0, 1) : 0;
}

function readFrameBands(frame) {
  return Array.isArray(frame && frame.bands) ? frame.bands : [];
}

function readPositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readRenderMetrics(targetMetrics, boundsPx = null) {
  const fallbackWidthPx = readPositiveNumber(targetMetrics && targetMetrics.widthPx, 0);
  const fallbackHeightPx = readPositiveNumber(targetMetrics && targetMetrics.heightPx, 0);
  const fallbackDpr = readPositiveNumber(targetMetrics && targetMetrics.dpr, 1);

  if (
    boundsPx
    && typeof boundsPx === "object"
    && Number.isFinite(boundsPx.x)
    && Number.isFinite(boundsPx.y)
    && Number.isFinite(boundsPx.width)
    && Number.isFinite(boundsPx.height)
  ) {
    return {
      xPx: boundsPx.x,
      yPx: boundsPx.y,
      widthPx: Math.max(0, boundsPx.width),
      heightPx: Math.max(0, boundsPx.height),
      dpr: fallbackDpr,
    };
  }

  return {
    xPx: 0,
    yPx: 0,
    widthPx: fallbackWidthPx,
    heightPx: fallbackHeightPx,
    dpr: fallbackDpr,
  };
}

function readOverlaySettingsFromNode(node) {
  return node && node.settings && typeof node.settings === "object"
    ? node.settings
    : runtime.settings.bands.overlay;
}

function readFallbackBandCount() {
  const count = runtime.settings && runtime.settings.bands
    ? runtime.settings.bands.count
    : 0;
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function drawBandOverlay(ctx, centerWaveform, overlay, energies01, bandCount, targetMetrics) {
  const n = bandCount;
  if (!n) return;

  const phase = state.bands.ringPhaseRad;
  const minDim = Math.min(targetMetrics.widthPx, targetMetrics.heightPx);
  const minR = minDim * overlay.minRadiusFrac;
  const maxR = minDim * overlay.maxRadiusFrac;
  const safeMin = Math.min(minR, maxR);
  const safeMax = Math.max(minR, maxR);
  const pts = new Array(n);

  for (let i = 0; i < n; i++) {
    const angle = phase + (i * TAU / n);
    const e = energies01[i] || 0;
    const baseR = safeMin + (safeMax - safeMin) * e;
    const disp = overlayWaveformDisplacementPx(baseR, angle, centerWaveform, overlay);
    const r = baseR + disp;

    pts[i] = {
      xSim: r * Math.cos(angle),
      ySim: r * Math.sin(angle),
    };
  }

  if (overlay.connectAdjacent) {
    ctx.save();
    ctx.lineWidth = overlay.lineWidthPx * targetMetrics.dpr;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const c = ColorPolicy.bandRgb01(i);
      const a = simToTargetScreen(pts[i].xSim, pts[i].ySim, targetMetrics);
      const b = simToTargetScreen(pts[j].xSim, pts[j].ySim, targetMetrics);

      ctx.strokeStyle = rgb01ToCss(c, overlay.lineAlpha);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  const rPx = overlay.pointSizePx * targetMetrics.dpr;
  for (let i = 0; i < n; i++) {
    const c = ColorPolicy.bandRgb01(i);
    const p = simToTargetScreen(pts[i].xSim, pts[i].ySim, targetMetrics);

    ctx.fillStyle = rgb01ToCss(c, overlay.alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rPx, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

class BandOverlayVisualizer {
  constructor({ node = null } = {}) {
    this.node = node;
    this.context = null;
    this.boundsPx = null;
    this.frame = null;
    this.centerWaveform = null;
    this.energies01 = [];
    this.bandCount = 0;
    this.dtSec = 0;
  }

  init(context) {
    this.context = context || null;
    if (context && context.node) this.node = context.node;
  }

  configure(node) {
    this.node = node || null;
  }

  update(frame, dtSec) {
    this.frame = frame || null;
    const frameBands = readFrameBands(this.frame);
    const fallbackCount = readFallbackBandCount();
    const nextBandCount = frameBands.length ? frameBands.length : fallbackCount;

    this.centerWaveform = this.frame && this.frame.analysis && this.frame.analysis.compat
      ? this.frame.analysis.compat.centerWaveform
      : null;
    this.bandCount = nextBandCount;
    this.energies01.length = nextBandCount;
    for (let i = 0; i < nextBandCount; i++) {
      this.energies01[i] = frameBands.length ? readFrameEnergy01(frameBands[i]) : 0;
    }
    this.dtSec = Number.isFinite(dtSec) ? dtSec : 0;
  }

  render(target, viewTransform) {
    // Build 115 keeps ViewTransform as a runtime seam only. Build 116 applies
    // camera math here without changing the overlay's current identity output.
    void viewTransform;
    const overlay = readOverlaySettingsFromNode(this.node);
    const ctx = (target && target.ctx) || (this.context && this.context.ctx) || state.ctx;
    const targetMetrics = readRenderMetrics({
      widthPx: readPositiveNumber(target && target.widthPx, readPositiveNumber(this.context && this.context.widthPx, 0)),
      heightPx: readPositiveNumber(target && target.heightPx, readPositiveNumber(this.context && this.context.heightPx, 0)),
      dpr: readPositiveNumber(target && target.dpr, readPositiveNumber(this.context && this.context.dpr, 1)),
    }, this.boundsPx);

    if (!ctx || !this.centerWaveform || !targetMetrics.widthPx || !targetMetrics.heightPx) return;

    ctx.save();
    if (this.boundsPx) {
      ctx.beginPath();
      ctx.rect(this.boundsPx.x, this.boundsPx.y, this.boundsPx.width, this.boundsPx.height);
      ctx.clip();
    }

    try {
      drawBandOverlay(ctx, this.centerWaveform, overlay, this.energies01, this.bandCount, targetMetrics);
    } finally {
      ctx.restore();
    }
  }

  resize(boundsPx) {
    this.boundsPx = boundsPx ? { ...boundsPx } : null;
  }

  dispose() {
    this.node = null;
    this.context = null;
    this.boundsPx = null;
    this.frame = null;
    this.centerWaveform = null;
    this.energies01.length = 0;
    this.bandCount = 0;
    this.dtSec = 0;
  }
}

export { BandOverlayVisualizer };
