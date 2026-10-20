/* A non-persistent, read-only observation of one AnalysisFrame.
 * This is an evidence document, not a Scene preset or recorded audio.
 * Capture only on an explicit user action: never retain producer-owned arrays.
 */
const SPECTRAL_EVIDENCE_FORMAT = "auralprint.spectral-evidence.v1";

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`Invalid spectral observation: ${label} must be finite.`);
  }
  return value;
}

function unit(value, label) {
  const n = finite(value, label);
  if (n < 0 || n > 1) throw new RangeError(`Invalid spectral observation: ${label} must be in [0, 1].`);
  return n;
}

function optionalFinite(value, label) {
  return value == null ? null : finite(value, label);
}

function numericSeries(source, count, label) {
  if ((!Array.isArray(source) && !ArrayBuffer.isView(source)) || source.length !== count) {
    throw new RangeError(`Invalid spectral observation: ${label} length mismatch.`);
  }
  return Array.from(source, (value, index) => unit(value, `${label}[${index}]`));
}

function captureSpectralEvidence(frame) {
  if (!frame || frame.ready !== true) {
    throw new Error("Analysis is not ready; start an audio source first.");
  }
  const spectrum = frame.spectrum;
  const low = spectrum?.lowHz, high = spectrum?.highHz;
  const count = low?.length;
  if (!Array.isArray(low) || !Array.isArray(high) || !Number.isInteger(count) || count < 1 || high.length !== count) {
    throw new RangeError("Invalid spectral observation: incomplete band geometry.");
  }
  if (!Number.isInteger(spectrum.dominantIndex) || spectrum.dominantIndex < 0 || spectrum.dominantIndex >= count) {
    throw new RangeError("Invalid spectral observation: dominant band index out of range.");
  }
  const bandsByChannel = {};
  const channels = {};
  for (const id of ["L", "R", "C"]) {
    const channel = frame.channels?.[id];
    if (!channel) throw new RangeError(`Invalid spectral observation: missing ${id} channel.`);
    bandsByChannel[id] = numericSeries(channel.bandEnergies01, count, `${id} bands`);
    channels[id] = {
      rms: finite(channel.rms, `${id} RMS`),
      energy01: unit(channel.energy01, `${id} energy`),
    };
    if (channels[id].rms < 0) throw new RangeError(`Invalid spectral observation: ${id} RMS must be nonnegative.`);
  }
  const m = spectrum.metadata || {};
  const metadata = {};
  for (const key of [
    "sampleRateHz", "nyquistHz", "effectiveFloorHz", "configCeilingHz", "effectiveCeilingHz",
  ]) {
    metadata[key] = optionalFinite(m[key], key);
  }
  const bands = low.map((rawLow, index) => {
    const lowHz = finite(rawLow, `lowHz[${index}]`);
    const isOpenEnded = high[index] === Infinity;
    const highHz = isOpenEnded ? null : finite(high[index], `highHz[${index}]`);
    if (lowHz < 0 || (!isOpenEnded && highHz < lowHz)) {
      throw new RangeError(`Invalid spectral observation: inverted band ${index}.`);
    }
    return {
      index,
      lowHz,
      highHz,
      isOpenEnded,
      energies01: {
        L: bandsByChannel.L[index],
        R: bandsByChannel.R[index],
        C: bandsByChannel.C[index],
      },
    };
  });
  return {
    format: SPECTRAL_EVIDENCE_FORMAT,
    monoLike: frame.monoLike === true,
    metadata,
    dominant: { index: spectrum.dominantIndex, name: typeof spectrum.dominantName === "string" ? spectrum.dominantName : "" },
    channels,
    bands,
  };
}

export { SPECTRAL_EVIDENCE_FORMAT, captureSpectralEvidence };
