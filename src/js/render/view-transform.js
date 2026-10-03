const IDENTITY_VIEW_TRANSFORM_MATRIX = Object.freeze([1, 0, 0, 1, 0, 0]);

const IDENTITY_VIEW_TRANSFORM = Object.freeze({
  kind: "2d-affine",
  mode: "identity",
  runtimeOnly: true,
  matrix: IDENTITY_VIEW_TRANSFORM_MATRIX,
});

function readFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function readMatrix(rawMatrix) {
  const source = Array.isArray(rawMatrix) ? rawMatrix : IDENTITY_VIEW_TRANSFORM_MATRIX;
  return [
    readFiniteNumber(source[0], 1),
    readFiniteNumber(source[1], 0),
    readFiniteNumber(source[2], 0),
    readFiniteNumber(source[3], 1),
    readFiniteNumber(source[4], 0),
    readFiniteNumber(source[5], 0),
  ];
}

function isIdentityMatrix(matrix) {
  return Array.isArray(matrix)
    && matrix.length >= 6
    && matrix[0] === 1
    && matrix[1] === 0
    && matrix[2] === 0
    && matrix[3] === 1
    && matrix[4] === 0
    && matrix[5] === 0;
}

function hasCanonicalViewTransformKeys(viewTransform) {
  const keys = Object.keys(viewTransform);
  return keys.length === 4
    && keys.includes("kind")
    && keys.includes("mode")
    && keys.includes("runtimeOnly")
    && keys.includes("matrix");
}

function isCanonicalMatrix(matrix) {
  return Array.isArray(matrix)
    && matrix.length === 6
    && Object.isFrozen(matrix)
    && matrix.every((value) => Number.isFinite(value));
}

function isCanonicalViewTransform(viewTransform) {
  return !!viewTransform
    && typeof viewTransform === "object"
    && Object.isFrozen(viewTransform)
    && hasCanonicalViewTransformKeys(viewTransform)
    && viewTransform.kind === "2d-affine"
    && typeof viewTransform.mode === "string"
    && viewTransform.mode.trim().length > 0
    && viewTransform.runtimeOnly === true
    && isCanonicalMatrix(viewTransform.matrix);
}

function normalizeViewTransform(rawViewTransform = null) {
  if (!rawViewTransform || typeof rawViewTransform !== "object") return IDENTITY_VIEW_TRANSFORM;
  if (rawViewTransform === IDENTITY_VIEW_TRANSFORM) return IDENTITY_VIEW_TRANSFORM;
  if (isCanonicalViewTransform(rawViewTransform)) {
    const identity = isIdentityMatrix(rawViewTransform.matrix);
    return identity && rawViewTransform.mode === "identity"
      ? IDENTITY_VIEW_TRANSFORM
      : rawViewTransform;
  }

  const matrix = readMatrix(rawViewTransform.matrix);
  const identity = isIdentityMatrix(matrix);
  const mode = typeof rawViewTransform.mode === "string" && rawViewTransform.mode.trim()
    ? rawViewTransform.mode
    : (identity ? "identity" : "placeholder");

  if (identity && mode === "identity") return IDENTITY_VIEW_TRANSFORM;

  return Object.freeze({
    kind: "2d-affine",
    mode,
    runtimeOnly: true,
    matrix: Object.freeze(matrix),
  });
}

function isIdentityViewTransform(viewTransform) {
  return normalizeViewTransform(viewTransform) === IDENTITY_VIEW_TRANSFORM;
}

export { IDENTITY_VIEW_TRANSFORM, normalizeViewTransform, isIdentityViewTransform };
