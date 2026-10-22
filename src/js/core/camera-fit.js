// Pure framing calculation. The caller gathers drawable geometry and owns the
// validated camera commit; this module never changes camera or simulation state.
function computeCameraFit(options) {
  if (!options || typeof options !== "object") return null;
  const { primitives, viewport, world, rotationRad, zoomLimits, paddingCssPx } = options;
  if (!primitives || typeof primitives[Symbol.iterator] !== "function"
    || !viewport || !Number.isFinite(viewport.widthPx) || viewport.widthPx <= 0
    || !Number.isFinite(viewport.heightPx) || viewport.heightPx <= 0
    || !Number.isFinite(viewport.dpr) || viewport.dpr <= 0
    || !world || !Number.isFinite(world.referenceSpanUnits) || world.referenceSpanUnits <= 0
    || !Number.isFinite(rotationRad) || !zoomLimits
    || !Number.isFinite(zoomLimits.min) || zoomLimits.min <= 0
    || !Number.isFinite(zoomLimits.max) || zoomLimits.max < zoomLimits.min
    || !Number.isFinite(paddingCssPx) || paddingCssPx < 0) return null;

  const widthCssPx = viewport.widthPx / viewport.dpr;
  const heightCssPx = viewport.heightPx / viewport.dpr;
  const fitScaleCss = Math.min(widthCssPx, heightCssPx) / world.referenceSpanUnits;
  if (!Number.isFinite(widthCssPx) || !Number.isFinite(heightCssPx)
    || !Number.isFinite(fitScaleCss) || fitScaleCss <= 0) return null;

  const cos = Math.cos(rotationRad), sin = Math.sin(rotationRad);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let drawablePaddingCssPx = 0, count = 0;
  for (const primitive of primitives) {
    count++;
    if (!primitive || typeof primitive !== "object") return null;
    const primitivePadding = primitive.paddingCssPx === undefined ? 0 : primitive.paddingCssPx;
    if (!Number.isFinite(primitivePadding) || primitivePadding < 0) return null;
    drawablePaddingCssPx = Math.max(drawablePaddingCssPx, primitivePadding);

    let x, y, radiusX, radiusY;
    if (primitive.type === "rect") {
      const { minX: left, minY: bottom, maxX: right, maxY: top } = primitive;
      if (!Number.isFinite(left) || !Number.isFinite(bottom) || !Number.isFinite(right)
        || !Number.isFinite(top) || left > right || bottom > top) return null;
      x = left * 0.5 + right * 0.5;
      y = bottom * 0.5 + top * 0.5;
      const halfWidth = right * 0.5 - left * 0.5;
      const halfHeight = top * 0.5 - bottom * 0.5;
      radiusX = Math.abs(cos) * halfWidth + Math.abs(sin) * halfHeight;
      radiusY = Math.abs(sin) * halfWidth + Math.abs(cos) * halfHeight;
    } else if (primitive.type === "circle" || primitive.type === "point") {
      x = primitive.x; y = primitive.y;
      const radius = primitive.type === "point" ? 0 : primitive.radius;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return null;
      // A circle remains a circle under the approved camera rotation.
      radiusX = radiusY = radius;
    } else return null;

    const viewX = x * cos + y * sin;
    const viewY = -x * sin + y * cos;
    const left = viewX - radiusX, right = viewX + radiusX;
    const bottom = viewY - radiusY, top = viewY + radiusY;
    if (!Number.isFinite(left) || !Number.isFinite(right)
      || !Number.isFinite(bottom) || !Number.isFinite(top)) return null;
    minX = Math.min(minX, left); maxX = Math.max(maxX, right);
    minY = Math.min(minY, bottom); maxY = Math.max(maxY, top);
  }

  if (count === 0) return null;
  const spanX = maxX - minX, spanY = maxY - minY;
  const centerX = minX * 0.5 + maxX * 0.5;
  const centerY = minY * 0.5 + maxY * 0.5;
  const x = centerX * cos - centerY * sin;
  const y = centerX * sin + centerY * cos;
  // Using the largest drawable padding on all sides is conservative. It keeps
  // collection and fitting linear in drawable count, including retained trails.
  const marginCssPx = paddingCssPx + drawablePaddingCssPx;
  if (!Number.isFinite(spanX) || !Number.isFinite(spanY) || !Number.isFinite(x)
    || !Number.isFinite(y) || !Number.isFinite(marginCssPx)) return null;
  const availableWidth = widthCssPx - marginCssPx * 2;
  const availableHeight = heightCssPx - marginCssPx * 2;
  let zoom, fits, reason;
  if (availableWidth <= 0 || availableHeight <= 0) {
    zoom = zoomLimits.min; fits = false; reason = "screen-margin";
  } else {
    const scaleX = spanX === 0 ? Infinity : availableWidth / spanX;
    const scaleY = spanY === 0 ? Infinity : availableHeight / spanY;
    const requestedZoom = Math.min(scaleX, scaleY) / fitScaleCss;
    if (requestedZoom < zoomLimits.min) {
      zoom = zoomLimits.min; fits = false; reason = "minimum-zoom";
    } else if (requestedZoom > zoomLimits.max) {
      zoom = zoomLimits.max; fits = true; reason = "maximum-zoom";
    } else {
      zoom = requestedZoom; fits = true; reason = null;
    }
  }
  // Extremely small/large supplied dimensions can underflow or overflow even
  // with finite arguments. Do not return a camera without an invertible scale.
  const scale = Math.min(viewport.widthPx, viewport.heightPx) / world.referenceSpanUnits * zoom;
  if (!Number.isFinite(zoom) || !Number.isFinite(scale) || scale <= 0) return null;
  return {
    camera: { x, y, zoom, rotationRad },
    limited: reason !== null,
    fits,
    reason,
    bounds: { minX, minY, maxX, maxY, marginCssPx },
  };
}

export { computeCameraFit };
