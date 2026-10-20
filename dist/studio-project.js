import {
  BLOCKS,
  LabProjectData,
  PlaySettings,
  SIZE_TIERS,
  VOXEL_CHUNK,
  VOXEL_LAYERS,
  WORLD_GENERATOR,
  WorldDocument,
  WorldPackage,
  applyCommand,
  createWorldState,
  decodeChunk,
  defaultPlaySettings,
  encodeTerrain,
  external_exports,
  getCoreItem,
  getGround,
  groundRef,
  itemBoundsForStyle,
  itemFootprint,
  replayWorldPackage,
  smallStarterCommands,
  starterGroundMaterials,
  starterWorldCommands,
  supportsWorldStarter
} from "./chunk-VKKWKE3N.js";

// src/studio-project.ts
var STUDIO_PROJECT_BYTES = 64 * 1024 * 1024;
var StudioProject = external_exports.object({
  format: external_exports.literal("genvr-studio"),
  version: external_exports.literal(1),
  id: external_exports.string().uuid(),
  title: external_exports.string().trim().min(1).max(120),
  play: PlaySettings,
  world: WorldDocument,
  avatarBodies: external_exports.record(external_exports.string().min(1).max(120), external_exports.enum(["robot", "human", "classic", "simple", "starter"])).optional(),
  terrainChunks: external_exports.array(external_exports.string().max(16 * 1024 * 1024)).max(4096),
  assets: WorldPackage.shape.assets,
  /** A motion lab project (MOTION-LAB): its course, run settings, last runs and motion versions. */
  lab: LabProjectData.optional()
}).strict();
function readStudioProject(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  if (new TextEncoder().encode(text).length > STUDIO_PROJECT_BYTES) throw new Error("Studio project exceeds 64 MB.");
  const project = StudioProject.parse(JSON.parse(text));
  if (project.world.instances.length > 1e4) throw new Error("Studio project exceeds 10000 items.");
  if (project.world.access.mode !== "private") throw new Error("Local Studio projects must remain private.");
  const seen = /* @__PURE__ */ new Set();
  const half = SIZE_TIERS[project.world.sizeTier].sideMeters / 2;
  for (const encoded of project.terrainChunks) {
    const row = JSON.parse(encoded);
    const size = row.kind === "voxel-edits" ? VOXEL_CHUNK : project.world.terrain.chunkSizeMeters;
    const field = row.kind === "terrain-fields-v1";
    if (!field && (!Number.isInteger(row.cx) || !Number.isInteger(row.cz) || row.cx < Math.floor(-half / size) || row.cx >= Math.ceil(half / size) || row.cz < Math.floor(-half / size) || row.cz >= Math.ceil(half / size))) throw new Error("Terrain chunk lies outside the world.");
    const key = field ? `f:${row.setId}:${row.tx},${row.tz}` : `${row.kind ?? "height"}:${row.cx},${row.cz}`;
    if (seen.has(key)) throw new Error("Duplicate terrain chunk.");
    seen.add(key);
    if (field) continue;
    if (row.kind === "voxel-edits") {
      if (!project.world.voxels || row.v !== 1 || typeof row.e !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.e)) throw new Error("Invalid voxel chunk.");
      const bytes = Uint8Array.from(atob(row.e), (c) => c.charCodeAt(0));
      if (bytes.length % 4 || bytes.length > VOXEL_CHUNK * VOXEL_CHUNK * VOXEL_LAYERS * 4) throw new Error("Invalid voxel edit length.");
      const view = new DataView(bytes.buffer), indices = /* @__PURE__ */ new Set();
      for (let i = 0; i < bytes.length; i += 4) {
        const value = view.getUint32(i, true), index = value >>> 8;
        if (indices.has(index) || index >= VOXEL_CHUNK * VOXEL_CHUNK * VOXEL_LAYERS || (value & 255) >= BLOCKS.length) throw new Error("Invalid voxel edit.");
        indices.add(index);
      }
    } else {
      if (row.kind !== void 0) throw new Error("Unknown terrain chunk type.");
      const chunk = decodeChunk(encoded);
      if (chunk.heights.length !== 1089 || chunk.soils.length !== 1089 || chunk.cover.length !== 1089 || !chunk.heights.every((n) => Number.isFinite(n) && n >= -150 && n <= 450) || !chunk.soils.every((n) => n < 16) || !chunk.cover.every((n) => n < 4)) throw new Error("Invalid terrain chunk.");
    }
  }
  const assets = /* @__PURE__ */ new Set();
  for (const asset of project.assets) {
    if (assets.has(asset.id) || getCoreItem(asset.id) || asset.id !== asset.manifest.id || new Set(asset.files.map((f) => f.path)).size !== asset.files.length) throw new Error("Invalid local asset IDs or files.");
    assets.add(asset.id);
  }
  for (const instance of project.world.instances) {
    if (!getCoreItem(instance.itemId) && !assets.has(instance.itemId)) throw new Error(`Local asset is missing: ${instance.itemId}`);
  }
  const state = createWorldState(structuredClone(project.world), project.terrainChunks);
  for (const [id, metadata] of Object.entries(state.doc.terrain.fieldSets ?? {})) {
    for (const coord of metadata.tiles) {
      const [tx, tz] = coord.split(",").map(Number);
      if (!state.terrain.fieldSets.get(id)?.getTile(tx, tz)) throw new Error("Referenced terrain field page is missing.");
    }
  }
  return project;
}
function fromState(state, title, play = defaultPlaySettings(), assets = []) {
  return readStudioProject({
    format: "genvr-studio",
    version: 1,
    id: crypto.randomUUID(),
    title,
    play,
    world: state.doc,
    terrainChunks: encodeTerrain(state).map((r) => r.data).filter(Boolean),
    assets
  });
}
function createStudioProject(style, kind, play = defaultPlaySettings()) {
  if (!supportsWorldStarter(style, kind)) throw new Error(`The ${kind} starter is not available for ${style}. Choose a supported world type.`);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 2147483647;
  const world = style === "realistic" && kind !== "empty" && kind !== "small" ? { seed, kind, generator: WORLD_GENERATOR } : void 0;
  const baseplate = style === "realistic" && kind === "empty", ground = getGround("baseplate");
  const doc = WorldDocument.parse({
    schemaVersion: 1,
    experienceId: `local-${crypto.randomUUID()}`,
    version: 0,
    style: baseplate ? { base: style, grass: { on: false, density: 1 }, snowLine: null, autoRock: false } : { base: style },
    sizeTier: "small",
    access: { mode: "private" },
    environment: { sky: { preset: "day" }, weather: { preset: "clear" } },
    terrain: world ? { world, materials: starterGroundMaterials(world.kind) } : baseplate && ground ? { materials: { "0": groundRef(ground) } } : {},
    ...style === "voxel" ? { voxels: { seed, generator: 1 } } : {},
    spawn: { position: [0, 1, 0] }
  });
  const state = createWorldState(doc);
  if (state.voxels) state.doc.spawn.position = [0.5, state.voxels.surfaceHeight(0.5, 0.5) + 1, 0.5];
  if (kind === "small") for (const command of smallStarterCommands(state, (id) => {
    const item = getCoreItem(id);
    if (!item) throw new Error(`Missing starter item ${id}`);
    return itemBoundsForStyle(item, style);
  })) applyCommand(state, command);
  else if (world) {
    for (const command of starterWorldCommands(doc, world, (x, z) => state.terrain.heightAt(x, z), (id) => {
      const item = getCoreItem(id);
      return item ? itemFootprint(item, style) : null;
    })) applyCommand(state, command);
  }
  return fromState(state, "My place", play);
}
function createLabProject(lab, play = defaultPlaySettings()) {
  const project = createStudioProject("blocky", "empty", play);
  return readStudioProject({ ...project, title: "Motion lab", lab });
}
function importStudioProject(text) {
  if (new TextEncoder().encode(text).length > STUDIO_PROJECT_BYTES) throw new Error("Studio project exceeds 64 MB.");
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === "object" && "format" in parsed && parsed.format === "genvr-studio") return readStudioProject(parsed);
  const legacy = replayWorldPackage(parsed);
  return fromState(legacy.state, legacy.package.title, defaultPlaySettings(), legacy.package.assets);
}
function browserStudioStorage() {
  const transact = async (mode, action) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("genvr-local-studio", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("projects", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("projects", mode), request = action(tx.objectStore("projects"));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Save cancelled."));
      });
    } finally {
      db.close();
    }
  };
  return {
    list: async () => (await transact("readonly", (store) => store.getAll())).map((p) => ({ id: p.id, title: p.title })),
    read: async (id) => readStudioProject(await transact("readonly", (store) => store.get(id))),
    write: async (project) => {
      const checked = readStudioProject(project);
      await transact("readwrite", (store) => store.put(checked));
    }
  };
}
export {
  STUDIO_PROJECT_BYTES,
  StudioProject,
  browserStudioStorage,
  createLabProject,
  createStudioProject,
  importStudioProject,
  readStudioProject
};
//# sourceMappingURL=studio-project.js.map
