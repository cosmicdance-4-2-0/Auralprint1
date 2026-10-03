function readVisibility(visualizer) {
  return typeof visualizer?.isVisible === "function" ? !!visualizer.isVisible() : true;
}

function describeOrbTarget(orb) {
  const bandIds = Array.isArray(orb?.bandIds) ? orb.bandIds : [];
  if (!bandIds.length) return "full spectrum";
  return bandIds.length === 1 ? "1 band" : `${bandIds.length} bands`;
}

function createVisualizerInventory(visualizers = []) {
  let orbPosition = 0;
  return Array.from(visualizers, (visualizer) => {
    const type = typeof visualizer?.type === "string" ? visualizer.type : "unknown";
    const id = typeof visualizer?.id === "string" ? visualizer.id : "";
    const visible = readVisibility(visualizer);
    if (type === "band-overlay") {
      return {
        id,
        type,
        displayName: "Band Overlay",
        visible,
        summary: "Spectral band visualization",
      };
    }
    if (type === "orb") {
      orbPosition += 1;
      const orb = visualizer.orb || {};
      const channel = ["L", "R", "C"].includes(orb.chanId) ? orb.chanId : "C";
      return {
        id,
        type,
        displayName: `Orb ${orbPosition}`,
        visible,
        summary: `${id || "Unidentified"} · ${channel} · ${describeOrbTarget(orb)}`,
      };
    }
    return {
      id,
      type,
      displayName: "Visualizer",
      visible,
      summary: type !== "unknown" ? type : (id || "Unknown type"),
    };
  });
}

function createVisualizersPanelUi({
  ui,
  getVisualizers = () => [],
  getSettings = () => null,
  openOrbControls = () => {},
  openBandOverlayControls = () => {},
} = {}) {
  let initializedOn = null;
  let lastSettingsRef = null;
  let lastVisualizerCollectionRef = null;

  function render(items) {
    if (!ui?.visualizerList) return;
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "visualizer-item";
      row.setAttribute("role", "listitem");

      const heading = document.createElement("div");
      heading.className = "visualizer-item-heading";
      const name = document.createElement("strong");
      name.textContent = item.displayName;
      const visibility = document.createElement("span");
      visibility.className = `visualizer-visibility ${item.visible ? "is-visible" : "is-hidden"}`;
      visibility.textContent = item.visible ? "Visible" : "Hidden";
      heading.append(name, visibility);

      const summary = document.createElement("div");
      summary.className = "visualizer-item-summary";
      summary.textContent = item.summary;
      row.append(heading, summary);
      fragment.append(row);
    }
    ui.visualizerList.replaceChildren(fragment);
  }

  function refresh() {
    const settingsRef = getSettings();
    const visualizers = getVisualizers() || [];
    if (settingsRef === lastSettingsRef && visualizers === lastVisualizerCollectionRef) return false;
    lastSettingsRef = settingsRef;
    lastVisualizerCollectionRef = visualizers;

    const items = createVisualizerInventory(visualizers);
    const orbCount = items.filter((item) => item.type === "orb").length;
    const visualizerLabel = items.length === 1 ? "visualizer" : "visualizers";
    const orbLabel = orbCount === 1 ? "Orb" : "Orbs";
    if (ui?.visualizersStatus) ui.visualizersStatus.textContent = `${items.length} ${visualizerLabel} · ${orbCount} ${orbLabel}`;
    if (ui?.btnVisualizersOpenOrbs) {
      ui.btnVisualizersOpenOrbs.disabled = orbCount === 0;
      ui.btnVisualizersOpenOrbs.title = orbCount
        ? "Open the existing Orb controls"
        : "Orb controls are unavailable because this scene has no Orbs";
    }
    render(items);
    return true;
  }

  function init() {
    if (initializedOn === ui?.visualizerList) return false;
    initializedOn = ui?.visualizerList || null;
    if (ui?.btnVisualizersOpenOrbs) ui.btnVisualizersOpenOrbs.addEventListener("click", openOrbControls);
    if (ui?.btnVisualizersOpenBandOverlay) ui.btnVisualizersOpenBandOverlay.addEventListener("click", openBandOverlayControls);
    refresh();
    return true;
  }

  return { init, refresh };
}

export { createVisualizerInventory, createVisualizersPanelUi, describeOrbTarget };
