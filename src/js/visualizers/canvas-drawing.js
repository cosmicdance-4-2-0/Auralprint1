// 117-3.5a: a trusted-code drawing facade, not a JavaScript security sandbox.
// One lazily allocated scratch surface per host discards partial instance draws.
// Legacy Orb/Ring keep their exact existing renderer until migration is proven.
export function createCanvasDrawing({ canvas, project, getDpr, createSurface = () => canvas.ownerDocument.createElement("canvas") }) {
  let surface;
  let context;
  let active = false;
  const drawing = Object.freeze({
    strokeWorldPath(points, { colorCss, widthCssPx, closed = false }) {
      if (!active) throw new Error("Draw outside a Visualizer render operation");
      if (!Number.isFinite(widthCssPx) || widthCssPx <= 0 || typeof colorCss !== "string") throw new Error("Invalid stroke presentation");
      const dpr = getDpr();
      if (!Number.isFinite(dpr) || dpr <= 0) throw new Error("Invalid drawing DPR");
      context.strokeStyle = colorCss;
      context.lineWidth = widthCssPx * dpr;
      context.lineJoin = "round"; context.lineCap = "round";
      context.beginPath();
      let started = false;
      for (const point of points) {
        const screen = project(point.x, point.y);
        if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) throw new Error("Invalid Visualizer projection");
        if (!started) { context.moveTo(screen.x, screen.y); started = true; }
        else context.lineTo(screen.x, screen.y);
      }
      if (closed) context.closePath();
      if (started) context.stroke();
    },
  });
  return Object.freeze({
    drawing,
    run(render) {
      if (active) throw new Error("Reentrant Visualizer drawing operation");
      if (canvas.width === 0 || canvas.height === 0) return;
      if (!surface) { surface = createSurface(); context = surface.getContext("2d"); }
      if (!context) throw new Error("Canvas2D drawing is unavailable");
      if (surface.width !== canvas.width) surface.width = canvas.width;
      if (surface.height !== canvas.height) surface.height = canvas.height;
      context.clearRect(0, 0, surface.width, surface.height);
      context.save(); active = true;
      try {
        const result = render();
        // Reject unsupported async hooks before publishing their partial draw.
        if (result && typeof result.then === "function") throw new Error("Asynchronous Visualizer render");
        const target = canvas.getContext("2d");
        target.save();
        try { target.resetTransform(); target.globalAlpha = 1; target.globalCompositeOperation = "source-over"; target.drawImage(surface, 0, 0); }
        finally { target.restore(); }
        return result;
      } finally { active = false; context.restore(); context.beginPath(); }
    },
    dispose() {
      if (active) throw new Error("Dispose during a Visualizer drawing operation");
      if (surface) { surface.width = 0; surface.height = 0; }
      surface = null; context = null;
    },
  });
}
