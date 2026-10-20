import {
  createRuntime
} from "./chunk-KOKFMLWZ.js";
import "./chunk-ALQEDJO3.js";

// src/runtime.ts
async function previewWorld(session, container, options = {}) {
  return createRuntime({
    ...options,
    container,
    world: session.world,
    terrainChunks: session.terrainChunks,
    fetchPackage: options.fetchPackage ?? ((id) => session.itemPackage(id)),
    // A viewer is read-only. All edits use the session tools/commands, followed by a fresh preview.
    editable: false,
    viewOnly: true
  });
}
export {
  createRuntime,
  previewWorld
};
//# sourceMappingURL=runtime.js.map
