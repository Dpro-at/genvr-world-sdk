import { CommandPayload, WorldDocument, WorldPackage, WORLD_PACKAGE_BYTES, WORLD_PACKAGE_COMMANDS, SIZE_TIERS, AVAILABLE_WORLD_STYLES, supportsWorldStarter, type ItemPackage } from '@genvr/contracts';
import { getCoreItem } from '@genvr/core-library';
import { runAssistant, runTool, type AssistantHost, type ChatModel, type ChatMessage, type AssistantEvent, type AvatarPresentationEvent } from '@genvr/assistant';
import { applyCommand, createWorldState, encodeTerrain, planWaterFill, type WorldState } from '@genvr/world';

export const SDK_VERSION = '0.3.0-preview.15';
export const PACKAGE_WORK_BUDGET = 5_000_000;
export type WorldEvent = { type: 'changed' | 'saved' | 'opened'; id: string } | { type: 'assistant'; event: AssistantEvent };
export interface NewWorldOptions {
  id?: string;
  title?: string;
  base?: WorldPackage['base'];
  onEvent?: (event: WorldEvent) => void;
}

export function readWorldPackage(input: unknown): WorldPackage {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  if (new TextEncoder().encode(text).length > WORLD_PACKAGE_BYTES) throw new Error('World package exceeds 8 MB.');
  const record = WorldPackage.parse(JSON.parse(text));
  const ids = new Set<string>();
  for (const asset of record.assets) {
    if (ids.has(asset.id) || getCoreItem(asset.id) || asset.manifest.id !== asset.id) throw new Error('Duplicate or mismatched local asset ID.');
    ids.add(asset.id);
    if (new Set(asset.files.map(f => f.path)).size !== asset.files.length) throw new Error('Duplicate local asset file.');
  }
  return record;
}

/** The sole reconstruction path, also used by the API. Commands retain engine validation. */
export function replayWorldPackage(input: unknown): { package: WorldPackage; state: WorldState } {
  const record = readWorldPackage(input);
  const base = record.base;
  // Preflight before any terrain allocation/application, including all polygon scans and raw block writes.
  let work = 0;
  const half = SIZE_TIERS[base.sizeTier].sideMeters / 2;
  const charge = (value: number) => { work += value; if (work > PACKAGE_WORK_BUDGET) throw new Error('World exceeds the package terrain work budget.'); };
  const polygons = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (value.length && value.every(point => Array.isArray(point) && point.length === 2 && point.every(n => typeof n === 'number'))) {
        if (value.length > 128) throw new Error('Package polygons/paths may have at most 128 points.');
        const points = value as number[][];
        const xs = points.map(p => p[0]!), zs = points.map(p => p[1]!);
        // Two-metre heightfield spacing; a conservative 64m margin includes grading/road shoulders.
        const x = Math.max(0, Math.min(half, Math.max(...xs) + 64) - Math.max(-half, Math.min(...xs) - 64));
        const z = Math.max(0, Math.min(half, Math.max(...zs) + 64) - Math.max(-half, Math.min(...zs) - 64));
        charge((Math.ceil(x / 2) + 3) * (Math.ceil(z / 2) + 3) * points.length);
      } else for (const child of value) polygons(child);
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) polygons(child);
  };
  for (const command of record.commands) {
    if (command.type === 'set_size_tier' && command.params.sizeTier !== base.sizeTier) throw new Error('Create a new package to change its size tier.');
    if (['create_field_set', 'set_field_tile', 'remove_field_tile', 'remove_field_set', 'restore_field_tile', 'set_terrain_surface'].includes(command.type)) throw new Error('Raster terrain fields are not supported by package format 1.');
    if (command.type.startsWith('restore_') || command.type === 'revert_terrain' || ('terrain' in command.params && command.params.terrain) || 'chunks' in command.params)
      throw new Error('Raw terrain restoration is not supported; use authoring commands.');
    polygons(command.params);
    if (command.type === 'paint_rule') {
      const [minX, minZ, maxX, maxZ] = command.params.box;
      const x = Math.max(0, Math.min(half, maxX) - Math.max(-half, minX));
      const z = Math.max(0, Math.min(half, maxZ) - Math.max(-half, minZ));
      // Includes snapshot, paint and four-neighbour slope sampling.
      charge((Math.ceil(x / 2) + 3) * (Math.ceil(z / 2) + 3) * 8);
    }
    if (command.type === 'generate_world' || command.type === 'set_style') charge((Math.ceil(half) + 3) ** 2 * 8);
    if (command.type === 'set_blocks') charge(command.params.blocks.length * 8);
    if (command.type === 'set_heights') charge(command.params.cols * command.params.rows * 8);
  }
  const doc = WorldDocument.parse({
    schemaVersion: 1, experienceId: record.id, version: 0,
    style: base.style, sizeTier: base.sizeTier, access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: base.world ? { world: base.world } : {},
    ...(base.style.base === 'voxel' ? { voxels: { seed: base.voxelSeed ?? 1, generator: 1 } } : {}),
    spawn: { position: [0, 1, 0] },
  });
  const state = createWorldState(doc);
  for (const command of record.commands) {
    applyCommand(state, command);
    if (state.doc.instances.length > 2000) throw new Error('World exceeds 2000 placed items.');
  }
  if (state.doc.instances.length > 2000) throw new Error('World exceeds 2000 placed items.');
  return { package: record, state };
}

export class WorldSession {
  #record: WorldPackage;
  #state: WorldState;
  #undo: WorldPackage[] = [];
  #redo: WorldPackage[] = [];
  #history: ChatMessage[] = [];
  #presentationInfo: (() => string) | undefined;
  #presentation: ((event: AvatarPresentationEvent) => string | null) | undefined;
  /** Attach a live viewport controller; presentation is never written into world packages. */
  attachPresentation(execute: (event: AvatarPresentationEvent) => string | null, describe?: () => string): () => void {
    this.#presentation = execute; this.#presentationInfo = describe;
    return () => { if (this.#presentation === execute) { this.#presentation = undefined; this.#presentationInfo = undefined; } };
  }
  readonly #onEvent: ((event: WorldEvent) => void) | undefined;
  constructor(input: unknown, onEvent?: (event: WorldEvent) => void) {
    const parsed = replayWorldPackage(input);
    this.#record = parsed.package; this.#state = parsed.state; this.#onEvent = onEvent;
  }
  static create(options: NewWorldOptions = {}): WorldSession {
    if (options.base && !AVAILABLE_WORLD_STYLES.includes(options.base.style.base)) throw new Error('This world style is not available yet.');
    if (options.base?.world && !supportsWorldStarter(options.base.style.base, options.base.world.kind)) throw new Error('This world kind is not available in the selected style.');
    return new WorldSession({ format: 'genvr-world', formatVersion: 1, sdkVersion: SDK_VERSION,
      id: options.id ?? `local.${crypto.randomUUID()}`, title: options.title ?? 'My world',
      base: options.base ?? { style: { base: 'blocky' }, sizeTier: 'small' }, commands: [], assets: [],
    }, options.onEvent);
  }
  get world(): WorldDocument { return structuredClone(this.#state.doc); }
  get terrainChunks(): string[] { return encodeTerrain(this.#state).map(row => row.data).filter(Boolean); }
  get canUndo(): boolean { return this.#undo.length > 0; }
  get canRedo(): boolean { return this.#redo.length > 0; }
  export(): WorldPackage { return structuredClone(this.#record); }
  serialize(): string { return JSON.stringify(this.#record); }
  heightAt(x: number, z: number): number { return this.#state.voxels?.surfaceHeight(x, z) ?? this.#state.terrain.heightAt(x, z); }
  #install(record: WorldPackage): void {
    const parsed = replayWorldPackage(record);
    this.#record = parsed.package; this.#state = parsed.state;
    this.#onEvent?.({ type: 'changed', id: this.#record.id });
  }
  /** Validate/replay off to the side: a refused batch leaves both world and undo unchanged. */
  apply(commands: readonly CommandPayload[]): void {
    if (!commands.length) return;
    if (this.#record.commands.length + commands.length > WORLD_PACKAGE_COMMANDS) throw new Error('World command history is full (500 commands).');
    const next = this.export();
    next.commands.push(...commands.map(command => CommandPayload.parse(command)));
    const previous = this.export();
    this.#install(next);
    this.#undo.push(previous); if (this.#undo.length > 50) this.#undo.shift(); this.#redo = [];
  }
  undo(): void { const old = this.#undo.pop(); if (old) { this.#redo.push(this.export()); this.#install(old); } }
  redo(): void { const next = this.#redo.pop(); if (next) { this.#undo.push(this.export()); this.#install(next); } }
  addAsset(asset: WorldPackage['assets'][number]): void {
    const next = this.export(); next.assets.push(asset); const previous = this.export();
    this.#install(next); this.#undo.push(previous); this.#redo = [];
  }
  #host(): AssistantHost {
    return {
      ...(this.#presentation ? { presentAvatar: this.#presentation, ...(this.#presentationInfo ? { presentationInfo: this.#presentationInfo } : {}) } : {}),
      world: () => this.world, heightAt: (x, z) => this.heightAt(x, z), focus: () => ({ x: 0, z: 0 }),
      blockGround: () => !!this.#state.voxels,
      isPlaceable: id => !!getCoreItem(id) || this.#record.assets.some(asset => asset.id === id),
      apply: commands => { try { this.apply(commands); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } },
      // world_history (BUILD-B9): a local file world is edited only through these tools, so every step is the agent's.
      history: action => {
        if (action === 'undo') { if (!this.#undo.length) return 'Nothing to undo.'; this.undo(); return null; }
        if (!this.#redo.length) return 'Nothing to redo.'; this.redo(); return null;
      },
      addWater: (x, z) => {
        if (this.#state.voxels) return 'Water filling needs heightfield terrain in this host.';
        try {
          const scratch = replayWorldPackage(this.#record).state, commands: CommandPayload[] = [];
          let plan = planWaterFill(scratch.terrain, x, z);
          if (!plan) {
            const area: [number, number][] = Array.from({ length: 24 }, (_, i) => [x + Math.cos(i * Math.PI / 12) * 5, z + Math.sin(i * Math.PI / 12) * 5]);
            for (let i = 0; i < 2; i++) {
              const command: CommandPayload = { type: 'sculpt_terrain', params: { area, operation: 'lower', strength: 1, soft: true } };
              applyCommand(scratch, command); commands.push(command);
            }
            plan = planWaterFill(scratch.terrain, x, z);
          }
          if (!plan) return 'Water cannot stay here.';
          commands.push({ type: 'add_water', params: { id: `water.${crypto.randomUUID()}`, kind: 'lake', area: plan.area, level: plan.level, params: {} } });
          this.apply(commands); return null;
        } catch (e) { return e instanceof Error ? e.message : String(e); }
      },
    };
  }
  async tool(name: string, args: unknown) { return runTool(name, args, this.#host()); }
  /** The host supplies its model; tools can never publish or spend money. */
  async generate(prompt: string, model: ChatModel, options: { signal?: AbortSignal; onEvent?: (event: AssistantEvent) => void } = {}): Promise<void> {
    this.#history = await runAssistant({ prompt, model, host: this.#host(), history: this.#history,
      ...(options.signal ? { signal: options.signal } : {}),
      onEvent: event => { options.onEvent?.(event); this.#onEvent?.({ type: 'assistant', event }); },
    });
  }
  /** File URLs are embedded data URLs, not expiring platform URLs. */
  async itemPackage(id: string): Promise<ItemPackage | null> {
    const asset = this.#record.assets.find(asset => asset.id === id);
    return asset ? { id, manifest: asset.manifest, files: asset.files.map(file => ({
      path: file.path, contentType: file.contentType, size: Math.floor(file.data.length * 3 / 4) - (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0),
      url: `data:${file.contentType};base64,${file.data}`,
    })) } : null;
  }
}
