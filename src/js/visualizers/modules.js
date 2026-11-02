import { createVisualizerCatalog } from "./contract.js";
import { createVisualizerHost } from "./host.js";
import { createCanvasDrawing } from "./canvas-drawing.js";

// 117-3.5a: the built application includes the actual activation API. Discovery
// alone creates neither a host, a backing canvas nor a Visualizer instance.
export function createVisualizerModules(types) {
  const catalog = createVisualizerCatalog(types);
  return Object.freeze({
    catalog,
    createHost({ canvas, project, getDpr, createSurface, services, barriers, reportFailure }) {
      const drawing = createCanvasDrawing({ canvas, project, getDpr, createSurface });
      return createVisualizerHost({ catalog, drawing, services, barriers, reportFailure });
    },
  });
}
