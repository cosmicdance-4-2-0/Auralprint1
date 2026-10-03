import { clamp, hexToRgb01, lerp, lerpRgb01, rgb01ToCss } from "../../core/utils.js";
import { TAU } from "../../core/constants.js";
import { runtime } from "../../core/preferences.js";
import { state } from "../../core/state.js";
import { Spaces } from "../../core/spaces.js";
import { ColorPolicy } from "../color-policy.js";
import {
  clearActiveOrbVisualizer,
  createOrbsFromSettings,
  getBandForOrb,
  setActiveOrbVisualizer,
} from "../orb-runtime.js";

function readOrbSettingsFromNode(node) {
  return node && Array.isArray(node.settings) ? node.settings : runtime.settings.orbs;
}

function canonicalOrbSettingsKey(orbSettings) {
  const defs = Array.isArray(orbSettings) ? orbSettings : [];
  return JSON.stringify(defs.map((orb) => ({
    id: typeof (orb && orb.id) === "string" ? orb.id : "",
    chanId: typeof (orb && orb.chanId) === "string" ? orb.chanId : "",
    bandIds: Array.isArray(orb && orb.bandIds) ? orb.bandIds.slice() : [],
    chirality: Number.isFinite(orb && orb.chirality) ? orb.chirality : null,
    startAngleRad: Number.isFinite(orb && orb.startAngleRad) ? orb.startAngleRad : null,
    hueOffsetDeg: Number.isFinite(orb && orb.hueOffsetDeg) ? orb.hueOffsetDeg : null,
    centerX: Number.isFinite(orb && orb.centerX) ? orb.centerX : null,
    centerY: Number.isFinite(orb && orb.centerY) ? orb.centerY : null,
  })));
}

function drawTrailLines(ctx, orb) {
  const s = runtime.settings;
  if (!s.trace.lines) return;

  const particles = orb && orb.trail ? orb.trail.particles : null;
  const segments = s.trace.numLines;
  const neededPts = segments + 1;
  if (!particles || particles.length < 2) return;

  const startIdx = Math.max(0, particles.length - neededPts);
  const slice = particles.slice(startIdx);
  if (slice.length < 2) return;

  const rgb = ColorPolicy.pickLineColorRgb01(particles, {
    bandIndex: orb ? orb.lastColorBandIndex : null,
    hueOffsetDeg: orb ? orb.hueOffsetDeg : 0,
  });
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

function drawParticles(ctx, particles, nowSec) {
  const s = runtime.settings;
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

class OrbVisualizer {
  constructor({ node = null } = {}) {
    this.node = node;
    this.context = null;
    this.boundsPx = null;
    this.frame = null;
    this.dtSec = 0;
    this.nowSec = 0;
    this.orbs = [];
    this.settingsKey = "";
  }

  init(context) {
    this.context = context || null;
    if (context && context.node) this.node = context.node;
    this.rebuildFromSettings();
  }

  configure(node) {
    this.node = node || null;
    const nextSettingsKey = canonicalOrbSettingsKey(readOrbSettingsFromNode(this.node));
    if (nextSettingsKey !== this.settingsKey) this.rebuildFromSettings();
  }

  rebuildFromSettings() {
    const orbSettings = readOrbSettingsFromNode(this.node);
    this.settingsKey = canonicalOrbSettingsKey(orbSettings);
    this.orbs = createOrbsFromSettings({ orbs: orbSettings });
    setActiveOrbVisualizer(this);
    return this.orbs;
  }

  getOrbs() {
    return this.orbs;
  }

  getPrimaryAngleRad() {
    const primaryOrb = this.orbs[0] || null;
    return Number.isFinite(primaryOrb && primaryOrb.angleRad) ? primaryOrb.angleRad : null;
  }

  resetTrails() {
    for (const orb of this.orbs) orb.resetTrail();
  }

  resetToDesignedPhases() {
    for (const orb of this.orbs) {
      orb.resetPhase();
      orb.resetTrail();
    }
    return this.getPrimaryAngleRad();
  }

  update(frame, dtSec) {
    this.frame = frame || null;
    this.dtSec = Number.isFinite(dtSec) ? dtSec : 0;

    const analysis = this.frame && this.frame.analysis ? this.frame.analysis : null;
    this.nowSec = analysis && Number.isFinite(analysis.timestamp) ? analysis.timestamp / 1000 : 0;

    if (state.time.simPaused) return;

    for (const orb of this.orbs) {
      const selection = getBandForOrb(orb, this.frame);
      const orbBand = selection ? selection.band : null;
      orb.step(this.dtSec, this.nowSec, orbBand, {
        energyOverride01: selection ? selection.energyOverride01 : null,
        colorBandIndex: selection ? selection.colorBandIndex : null,
        boundsPx: this.boundsPx,
      });
    }
  }

  render(target, viewTransform) {
    // Build 115 keeps ViewTransform as an identity hook. Orb camera motion is
    // deferred to Build 116 so current particle/orb placement stays unchanged.
    void viewTransform;
    if (!this.orbs.length) return;

    const ctx = (target && target.ctx) || (this.context && this.context.ctx) || state.ctx;
    if (!ctx) return;

    ctx.save();
    if (this.boundsPx) {
      ctx.beginPath();
      ctx.rect(this.boundsPx.x, this.boundsPx.y, this.boundsPx.width, this.boundsPx.height);
      ctx.clip();
    }

    try {
      for (const orb of this.orbs) {
        const particles = orb.trail.particles;
        drawTrailLines(ctx, orb);
        drawParticles(ctx, particles, this.nowSec);
      }
    } finally {
      ctx.restore();
    }
  }

  resize(boundsPx) {
    this.boundsPx = boundsPx ? { ...boundsPx } : null;
  }

  dispose() {
    clearActiveOrbVisualizer(this);
    this.node = null;
    this.context = null;
    this.boundsPx = null;
    this.frame = null;
    this.dtSec = 0;
    this.nowSec = 0;
    this.settingsKey = "";
    this.orbs.length = 0;
  }
}

export { OrbVisualizer };
