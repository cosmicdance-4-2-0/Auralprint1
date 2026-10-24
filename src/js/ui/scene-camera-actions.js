import { preferences, runtime } from "../core/preferences.js";
import { state, setCamera } from "../core/state.js";
import { createCameraState } from "../core/camera-state.js";

// The coordinator commits settings through the existing applyPrefs path.
// Capture never replaces the live snapshot or resets visualizer history.
function saveSceneCamera() {
  preferences.sceneCamera = createCameraState(state.camera);
  return preferences.sceneCamera;
}

// Call after resolution on import/startup. No viewport is required.
// Input cancellation belongs to the interaction owner, before this action.
function restoreSceneCamera() {
  return setCamera(runtime.settings.sceneCamera);
}

export { saveSceneCamera, restoreSceneCamera };
