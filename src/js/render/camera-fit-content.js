import { worldUnitsFromFraction } from "../core/world-geometry.js";
import { normalizeOrbChannelId } from "../core/preferences.js";

// Fit is an explicit rendering query. It does not update a visualizer, expire a
// particle, or retain a bounds cache. Primitives stream through the fitter so a
// large retained history does not require a second particle-sized collection.
function fractionUnits(world, fraction) {
  try { return worldUnitsFromFraction(world, fraction); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return NaN; // An invalid primitive makes the complete fit fail atomically.
  }
}

function screenRadius(value) {
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

function waveformPeak(waveform) {
  // Configured potential includes a full-scale waveform even in silence. Web
  // Audio's float waveform can exceed one; include its observed peak as well.
  let peak = 1;
  if (waveform) for (const sample of waveform) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

function radialEnvelope(world, response, peak) {
  // Orb.step and Renderer.drawSpectralRing both sort the two base radii and
  // add baseRadius * waveformFraction * sample. This is the conservative radial
  // envelope, independent of current phase/energy or a future phase change.
  const min = fractionUnits(world, response?.minRadiusFrac);
  const max = fractionUnits(world, response?.maxRadiusFrac);
  return Math.max(Math.abs(min), Math.abs(max))
    * (1 + Math.abs(response?.waveformRadialDisplaceFrac) * peak);
}

function* collectCameraFitContent({ world, orbs = [], overlay, analysisFrame } = {}) {
  yield {
    type: "rect",
    minX: -world?.widthUnits / 2, minY: -world?.heightUnits / 2,
    maxX: world?.widthUnits / 2, maxY: world?.heightUnits / 2,
  };

  // Sample each producer-owned channel at most once, only when Fit is invoked.
  const channels = analysisFrame?.ready ? analysisFrame.channels : null;
  const peaks = {
    L: waveformPeak(channels?.L?.waveform),
    R: waveformPeak(channels?.R?.waveform),
    C: waveformPeak(channels?.C?.waveform),
  };
  for (const orb of orbs) {
    // Renderer reads current Orb settings for all retained particles; particle
    // records have no historical size. Its arc size is a radius in CSS pixels.
    const particlePadding = screenRadius(orb.particles?.sizeMaxPx);
    const tracePadding = orb.trace?.lines
      ? screenRadius(orb.trace.lineWidthPx) / 2 : 0;
    const paddingCssPx = Math.max(particlePadding, tracePadding);
    yield {
      type: "circle",
      x: fractionUnits(world, orb.centerXFrac),
      y: fractionUnits(world, orb.centerYFrac),
      radius: radialEnvelope(world, orb.response, peaks[normalizeOrbChannelId(orb.chanId, orb.bandId)]),
      paddingCssPx,
    };
    for (const particle of orb.trail?.particles || []) {
      // Retained coordinates may be arbitrarily far beyond today's world and
      // current Orb envelope, including after world or Orb configuration edits.
      yield { type: "point", x: particle.xSim, y: particle.ySim, paddingCssPx };
    }
  }

  if (overlay?.enabled) {
    // Orb locking changes only Ring phase. Renderer always uses the Ring's own
    // radii and origin, independently of the first Orb's center and radius.
    yield {
      type: "circle", x: 0, y: 0,
      radius: radialEnvelope(world, overlay, peaks.C),
      paddingCssPx: Math.max(screenRadius(overlay.pointSizePx),
        overlay.connectAdjacent ? screenRadius(overlay.lineWidthPx) / 2 : 0),
    };
  }
}

export { collectCameraFitContent };
