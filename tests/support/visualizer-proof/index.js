const points = Object.freeze([Object.freeze({ x: -10, y: 0 }), Object.freeze({ x: 10, y: 0 })]);

// Deliberately no update/reset/dispose/fit or simulated particle/audio methods.
export function createVisualizer() {
  globalThis.__visualizerProofCreates = (globalThis.__visualizerProofCreates ?? 0) + 1;
  return {
    render(context) {
      context.drawing.strokeWorldPath(points, { colorCss: context.settings.colorCss, widthCssPx: 4 });
      if (context.settings.fail) throw new Error("intentional partial draw failure");
    },
  };
}
