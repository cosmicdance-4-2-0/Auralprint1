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
    if (type === "spectral-ring") {
      return {
        id,
        type,
        displayName: "Spectral Ring",
        visible,
        summary: "Combined C spectrum",
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
  editSpectralRing = () => {},
  addOrb = () => null,
  editOrb = () => {},
  duplicateOrb = () => null,
  removeOrb = () => false,
  confirmRemoveOrb = () => false,
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
      if (item.type === "orb" || item.type === "spectral-ring") {
        const actions = document.createElement("div");
        actions.className = "visualizer-item-actions";
        const actionDefs = item.type === "spectral-ring" ? [["edit-ring", "Edit"]] : [["edit", "Edit"], ["duplicate", "Duplicate"], ["remove", "Remove"]];
        for (const [action, label] of actionDefs) {
          const button = document.createElement("button");
          button.type = "button"; button.dataset.action = action;
          if (item.type === "orb") button.dataset.orbId = item.id;
          button.textContent = label; button.setAttribute("aria-label", `${label} ${item.displayName}, ${item.id}`);
          if (action === "remove") button.className = "is-destructive";
          actions.appendChild(button);
        }
        row.appendChild(actions);
      }
      fragment.append(row);
    }
    ui.visualizerList.replaceChildren(fragment);
  }

  function focusEdit(id) {
    const buttons = ui?.visualizerList?.querySelectorAll?.('[data-action="edit"]') || [];
    const target = Array.from(buttons).find((button) => button.dataset.orbId === id);
    target?.focus(); return !!target;
  }

  function forceRefresh() { lastSettingsRef = null; lastVisualizerCollectionRef = null; refresh(); }

  function onListClick(event) {
    const button = event.target?.closest?.("button[data-action]");
    if (!button || !ui.visualizerList.contains(button)) return;
    if (button.dataset.action === "edit-ring") { editSpectralRing(); return; }
    const id = button.dataset.orbId;
    if (button.dataset.action === "edit") { editOrb(id); return; }
    if (button.dataset.action === "duplicate") { const created = duplicateOrb(id); if (created?.id) { forceRefresh(); focusEdit(created.id); } return; }
    if (button.dataset.action === "remove") {
      const items = createVisualizerInventory(getVisualizers() || []); const index = items.filter((item) => item.type === "orb").findIndex((item) => item.id === id);
      const item = items.find((entry) => entry.id === id); if (!item || !confirmRemoveOrb({ id, displayName: item.displayName })) return;
      if (!removeOrb(id)) return; forceRefresh();
      const survivors = createVisualizerInventory(getVisualizers() || []).filter((entry) => entry.type === "orb");
      const focus = survivors[index] || survivors[index - 1]; if (focus) focusEdit(focus.id); else ui.btnVisualizersAddOrb?.focus();
    }
  }

  function onAdd() { const created = addOrb(); if (!created?.id) return; forceRefresh(); focusEdit(created.id); }

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
    ui?.visualizerList?.addEventListener("click", onListClick);
    ui?.btnVisualizersAddOrb?.addEventListener("click", onAdd);
    if (ui?.btnVisualizersOpenOrbs) ui.btnVisualizersOpenOrbs.addEventListener("click", openOrbControls);
    refresh();
    return true;
  }

  return { init, refresh, focusEdit };
}

export { createVisualizerInventory, createVisualizersPanelUi, describeOrbTarget };
