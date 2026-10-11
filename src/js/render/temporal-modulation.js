// Stateless, opt-in mapper. It never mutates presets or Orb-owned motion fields.
function computeOrbSpeedOffset(orb, temporalFrame, config) {
  if (!config?.enabled || !temporalFrame?.ready || orb?.id !== config.targetOrbId) return 0;
  const channel = temporalFrame.channels?.[config.sourceChannel];
  const signal = channel?.[config.sourceFeature];
  if (!Number.isFinite(signal) || !Number.isFinite(config.maxSpeedOffsetRadPerSec)) return 0;
  const normalized = Math.max(0, Math.min(1, signal));
  return normalized * Math.max(0, config.maxSpeedOffsetRadPerSec);
}

export { computeOrbSpeedOffset };
