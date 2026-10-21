/*
 * Build 116A: independent world reference geometry.
 * Pure reference math shared by resolved world state and Orb/Ring geometry.
 */

function createWorldGeometry(widthUnits, heightUnits) {
  if (!Number.isFinite(widthUnits) || widthUnits <= 0 ||
      !Number.isFinite(heightUnits) || heightUnits <= 0) {
    throw new RangeError("World dimensions must be finite and positive.");
  }
  return Object.freeze({
    widthUnits,
    heightUnits,
    referenceSpanUnits: Math.min(widthUnits, heightUnits),
  });
}

// Fractions are anchored to the smaller world dimension, matching the
// schema-10 Orb/Ring fraction convention without using canvas dimensions.
function worldUnitsFromFraction(world, fraction) {
  if (!world || !Number.isFinite(world.referenceSpanUnits) || world.referenceSpanUnits <= 0) {
    throw new RangeError("A valid world reference span is required.");
  }
  if (!Number.isFinite(fraction)) {
    throw new RangeError("World fractions must be finite.");
  }
  const value = world.referenceSpanUnits * fraction;
  if (!Number.isFinite(value)) {
    throw new RangeError("World fraction exceeds representable coordinates.");
  }
  return value;
}

function worldPointFromFractions(world, centerXFrac, centerYFrac) {
  // Reference dimensions do not clip or clamp coordinates. Points may lie
  // outside the nominal reference rectangle.
  return {
    xSim: worldUnitsFromFraction(world, centerXFrac),
    ySim: worldUnitsFromFraction(world, centerYFrac),
  };
}

export { createWorldGeometry, worldUnitsFromFraction, worldPointFromFractions };
