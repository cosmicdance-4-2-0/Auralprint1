/* Full-file extractor, replaceable behind the coordinator's output contract.
 * It owns encoded reading, native decoding and synchronous all-channel reduction.
 * File.arrayBuffer is intentionally retained: no cancellation is claimed.
 * Native decode occupancy ends only when its promise actually settles.
 */
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

async function extractWaveform(file, { isCurrent }) {
  let encoded = null;
  let decoded = null;
  let context = null;
  let reading = null;
  try {
    reading = file.arrayBuffer();
    file = null;
    encoded = await reading;
    reading = null;
    if (!isCurrent()) return null;
    // Existing decode rate/render dimensions; these are not resource budgets.
    context = new OfflineAudioContext(1, 1, 44100);
    decoded = await context.decodeAudioData(encoded);
    encoded = null;
    if (!isCurrent()) return null;
    return buildWaveformPeaks(decoded, 512);
  } finally {
    // Drop our local intermediates after settlement, not a physical-GC claim.
    file = reading = encoded = decoded = context = null;
  }
}

export { extractWaveform, buildWaveformPeaks };
