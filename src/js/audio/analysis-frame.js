/* =============================================================================
   AnalysisFrame — reusable, read-only-by-contract analysis consumer view

   Arrays and waveform buffers remain producer-owned. Consumers may read them
   but must not mutate them. updateAnalysisFrame() refreshes references when an
   analyser buffer or BandBank array is replaced; it does not copy live data.
   ========================================================================== */
function createChannelView() {
  return { waveform: null, rms: 0, energy01: 0, bandEnergies01: null };
}

function createAnalysisFrame() {
  return {
    ready: false,
    monoLike: true,
    channels: {
      L: createChannelView(),
      R: createChannelView(),
      C: createChannelView(),
    },
    spectrum: {
      energies01: null,
      lowHz: null,
      highHz: null,
      dominantIndex: 0,
      dominantName: "",
      metadata: {
        sampleRateHz: null,
        nyquistHz: null,
        effectiveFloorHz: null,
        configCeilingHz: null,
        effectiveCeilingHz: null,
      },
    },
  };
}

function updateChannelView(target, source, bandChannel) {
  target.waveform = source && source.timeDomain ? source.timeDomain : null;
  target.rms = source && Number.isFinite(source.rms) ? source.rms : 0;
  target.energy01 = source && Number.isFinite(source.energy01) ? source.energy01 : 0;
  target.bandEnergies01 = bandChannel && bandChannel.energies01 ? bandChannel.energies01 : null;
}

function updateAnalysisFrame(frame, audioSample, bandState) {
  const ready = !!(audioSample && audioSample.ready);
  frame.ready = ready;
  frame.monoLike = ready ? !!audioSample.monoLike : true;

  const sampledChannels = ready && audioSample.bands ? audioSample.bands : null;
  const spectrum = frame.spectrum;
  const source = bandState || {};
  const bandChannels = source.channels || {};
  updateChannelView(frame.channels.L, sampledChannels && sampledChannels.L, bandChannels.L);
  updateChannelView(frame.channels.R, sampledChannels && sampledChannels.R, bandChannels.R);
  updateChannelView(frame.channels.C, sampledChannels && sampledChannels.C, bandChannels.C);
  const metadata = source.meta || {};
  spectrum.energies01 = frame.channels.C.bandEnergies01 || source.energies01 || null;
  spectrum.lowHz = source.lowHz || null;
  spectrum.highHz = source.highHz || null;
  spectrum.dominantIndex = Number.isInteger(source.dominantIndex) ? source.dominantIndex : 0;
  spectrum.dominantName = typeof source.dominantName === "string" ? source.dominantName : "";
  spectrum.metadata.sampleRateHz = Number.isFinite(metadata.sampleRateHz) ? metadata.sampleRateHz : null;
  spectrum.metadata.nyquistHz = Number.isFinite(metadata.nyquistHz) ? metadata.nyquistHz : null;
  spectrum.metadata.effectiveFloorHz = Number.isFinite(metadata.effectiveFloorHz) ? metadata.effectiveFloorHz : null;
  spectrum.metadata.configCeilingHz = Number.isFinite(metadata.configCeilingHz) ? metadata.configCeilingHz : null;
  spectrum.metadata.effectiveCeilingHz = Number.isFinite(metadata.effectiveCeilingHz) ? metadata.effectiveCeilingHz : null;
  return frame;
}

export { createAnalysisFrame, updateAnalysisFrame };
