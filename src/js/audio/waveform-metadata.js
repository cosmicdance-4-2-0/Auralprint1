// Metadata confidence/cost interpretation, separate from playback and extraction.
// A header verified against declared lengths is not a native-memory guarantee.
const positiveWhole = value => Number.isSafeInteger(value) && value > 0;
const invalid = detail => ({ confidence: "invalid", reason: "metadata-unavailable", detail });

function interpretWaveformMetadata(input, policy) {
  let { durationSeconds, channelCount, sourceSampleRateHz = null,
    metadataConfidence = "unknown", durationState = "pending", headerMetadata = null } = input;
  if (!["verified", "estimated", "unknown", "invalid"].includes(metadataConfidence)
    || !["pending", "available", "unavailable"].includes(durationState)) return invalid("invalid-confidence");
  if (headerMetadata && !["verified", "estimated", "unknown", "invalid"].includes(headerMetadata.confidence)) return invalid("invalid-header-confidence");
  if (durationState === "available" && durationSeconds != null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) return invalid("invalid-duration");
  if (metadataConfidence === "invalid" || headerMetadata?.confidence === "invalid") return invalid("contradictory-metadata");
  if (headerMetadata?.confidence === "estimated" && headerMetadata.channelCount != null) {
    if (!positiveWhole(headerMetadata.channelCount) || !positiveWhole(headerMetadata.sourceSampleRateHz)) return invalid("invalid-partial-header");
    if (metadataConfidence === "verified" && channelCount != null && channelCount !== headerMetadata.channelCount) return invalid("channel-conflict");
    if (metadataConfidence !== "verified") {
      channelCount = headerMetadata.channelCount;
      sourceSampleRateHz = headerMetadata.sourceSampleRateHz;
      metadataConfidence = "estimated";
    }
  }
  if (headerMetadata?.confidence === "verified") {
    if (!positiveWhole(headerMetadata.channelCount) || !positiveWhole(headerMetadata.sourceSampleRateHz)
      || !Number.isFinite(headerMetadata.durationSeconds) || headerMetadata.durationSeconds <= 0) return invalid("invalid-header");
    if (metadataConfidence === "verified" && channelCount != null && channelCount !== headerMetadata.channelCount) return invalid("channel-conflict");
    if (metadataConfidence === "verified" && sourceSampleRateHz != null && sourceSampleRateHz !== headerMetadata.sourceSampleRateHz) return invalid("source-rate-conflict");
    if (durationSeconds != null && !Number.isNaN(durationSeconds)) {
      const tolerance = Math.max(1 / headerMetadata.sourceSampleRateHz, 1 / policy.decodeSampleRateHz);
      if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - headerMetadata.durationSeconds) > tolerance) return invalid("duration-conflict");
    }
    durationSeconds = headerMetadata.durationSeconds;
    channelCount = headerMetadata.channelCount;
    sourceSampleRateHz = headerMetadata.sourceSampleRateHz;
    metadataConfidence = "verified";
  }
  if (durationSeconds == null || (Number.isNaN(durationSeconds) && durationState === "pending")) {
    return { confidence: "unknown", reason: durationState === "pending" ? "metadata-pending" : "metadata-unavailable", detail: "duration-missing" };
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return invalid("invalid-duration");
  if (sourceSampleRateHz != null && !positiveWhole(sourceSampleRateHz)) return invalid("invalid-source-rate");
  let assumption = headerMetadata?.confidence === "estimated" ? "partial-pcm-header" : null;
  if (channelCount == null) {
    if (metadataConfidence === "verified") return invalid("verified-channels-missing");
    if (!positiveWhole(policy.fallbackEstimatedChannels)) return invalid("invalid-channel-assumption");
    channelCount = policy.fallbackEstimatedChannels;
    assumption = "configured-channel-fallback";
    metadataConfidence = "estimated";
  } else if (!positiveWhole(channelCount)) return invalid("invalid-channels");
  else if (metadataConfidence === "unknown") metadataConfidence = "estimated";
  // Round output frames upward. This bounds the estimate's rounding, not native
  // scratch, source-rate PCM, resampling allocations or inaccurate metadata.
  const frames = Math.ceil(durationSeconds * policy.decodeSampleRateHz);
  const estimatedPcmBytes = frames * channelCount * Float32Array.BYTES_PER_ELEMENT;
  if (!positiveWhole(frames) || !positiveWhole(estimatedPcmBytes)) return invalid("unsafe-pcm-arithmetic");
  return { confidence: metadataConfidence, durationSeconds, channelCount,
    sourceSampleRateHz, assumption, estimatedPcmBytes, estimatedOutputFrames: frames };
}

// Pure bounded-prefix parser: classic integer PCM and PCM extensible RIFF/WAVE.
function inspectPcmWavHeader(bytes, fileSizeBytes, { maxBytes, maxChunks }) {
  if (!(bytes instanceof ArrayBuffer) || !positiveWhole(fileSizeBytes)
    || !positiveWhole(maxBytes) || maxBytes < 12 || !positiveWhole(maxChunks)) return invalid("invalid-probe-input");
  if (bytes.byteLength > maxBytes || bytes.byteLength > fileSizeBytes) return invalid("probe-read-overrun");
  let format = null;
  const unknown = detail => format
    ? { confidence: "estimated", reason: "metadata-unavailable", detail, channelCount: format.channels, sourceSampleRateHz: format.rate }
    : { confidence: "unknown", reason: "metadata-unavailable", detail };
  if (bytes.byteLength < 12) return unknown("short-prefix");
  const view = new DataView(bytes);
  const tag = at => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return unknown("unsupported-container");
  const end = view.getUint32(4, true) + 8;
  if (end !== fileSizeBytes || end < 12) return invalid("riff-length-conflict");
  let offset = 12;
  for (let chunks = 0; offset < end && chunks < maxChunks; chunks++) {
    if (offset + 8 > end) return invalid("truncated-chunk-header");
    if (offset + 8 > bytes.byteLength) return unknown("probe-prefix-exhausted");
    const id = tag(offset), size = view.getUint32(offset + 4, true);
    const start = offset + 8, next = start + size + (size % 2);
    if (next > end || next <= offset) return invalid("chunk-length-conflict");
    if (id === "fmt ") {
      if (format) return invalid("duplicate-format");
      if (size < 16) return invalid("short-format");
      if (start + size > bytes.byteLength) return unknown("probe-prefix-exhausted");
      const code = view.getUint16(start, true), channels = view.getUint16(start + 2, true);
      const rate = view.getUint32(start + 4, true), byteRate = view.getUint32(start + 8, true);
      const align = view.getUint16(start + 12, true), bits = view.getUint16(start + 14, true);
      if (code !== 1 && code !== 65534) return unknown("unsupported-wave-codec");
      if (!channels || !rate || !align || !bits) return invalid("invalid-format-dimensions");
      if (code === 65534) {
        if (size < 40 || view.getUint16(start + 16, true) < 22 || 18 + view.getUint16(start + 16, true) > size) return invalid("invalid-extensible-length");
        const validBits = view.getUint16(start + 18, true), mask = view.getUint32(start + 20, true);
        if (!validBits || validBits > bits) return invalid("invalid-valid-bits");
        const pcmGuid = [1,0,0,0,0,0,16,0,128,0,0,170,0,56,155,113];
        if (!pcmGuid.every((b, i) => view.getUint8(start + 24 + i) === b)) return unknown("unsupported-wave-codec");
        if (mask && mask.toString(2).replace(/0/g, "").length !== channels) return invalid("channel-mask-conflict");
      } else if (code !== 1) return unknown("unsupported-wave-codec");
      if (![8,16,24,32].includes(bits)) return unknown("unsupported-pcm-width");
      if (align !== channels * (bits / 8) || byteRate !== rate * align) return invalid("pcm-layout-conflict");
      format = { channels, rate, align };
    } else if (id === "data") {
      if (!format) return unknown("data-before-format");
      if (!size || size % format.align) return invalid("pcm-frame-length-conflict");
      // A terminal data chunk avoids scanning/sample-reading the payload or
      // undercounting additional data chunks. Other layouts remain unverified.
      if (next !== end) return unknown("nonterminal-data-layout");
      return { confidence: "verified", reason: "pcm-wav-header", channelCount: format.channels,
        sourceSampleRateHz: format.rate, durationSeconds: (size / format.align) / format.rate,
        sourceFrames: size / format.align };
    }
    offset = next;
  }
  return unknown(offset >= end ? "data-missing" : "probe-work-exhausted");
}

// Waveform admission uses this probe before optional extraction. No full-file
// read or native decode here: one encoded-input-budgeted prefix and bounded
// chunk work per invocation.
async function probeWaveformMetadata(file, policy) {
  const probe = policy?.metadataProbe;
  if (!Number.isSafeInteger(policy?.maxEncodedBytes) || policy.maxEncodedBytes < 0
    || !positiveWhole(probe?.maxBytes) || probe.maxBytes < 12 || !positiveWhole(probe?.maxChunks)) return invalid("invalid-probe-policy");
  if (!positiveWhole(file?.size)) return invalid("invalid-file-size");
  if (file.size > policy.maxEncodedBytes) return { confidence: "unknown", reason: "encoded-budget", detail: "probe-not-admitted" };
  if (typeof file.slice !== "function") return invalid("file-slice-unavailable");
  try {
    const length = Math.min(file.size, probe.maxBytes);
    const bytes = await file.slice(0, length).arrayBuffer();
    if (bytes.byteLength !== length) return invalid("prefix-read-length-conflict");
    return inspectPcmWavHeader(bytes, file.size, probe);
  } catch { return { confidence: "unknown", reason: "metadata-unavailable", detail: "probe-read-failed" }; }
}

export { interpretWaveformMetadata, inspectPcmWavHeader, probeWaveformMetadata };
