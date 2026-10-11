import type { CommandPayload } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyMapBuild,
  MAP_BUILD_CANCELLED,
  MAP_BUILD_CHANGED,
  MAP_BUILD_FAILED,
  type MapBuildTarget,
} from './map-build';

/**
 * A studio stand-in with the runtime's undo rules: a 200-step history whose mark keeps growing when the oldest step
 * is dropped, an edit group the player can hold open (a brush stroke), and applyBatch / undo / merge closing it first.
 */
class FakeStudio implements MapBuildTarget {
  /** What is built, newest last, by command id. */
  world: string[] = [];
  steps: string[][] = [];
  dropped = 0;
  open: string[] | null = null;
  /** Ids applyBatch refuses (the command is skipped, the rest still apply). */
  refuse = new Set<string>();
  /** Runs after each applyBatch, e.g. a player edit between pieces. */
  between: (() => void) | null = null;

  constructor(earlier = 0) {
    for (let i = 0; i < earlier; i += 1) this.#push([`old${i}`]);
  }

  #push(step: string[]) {
    this.steps.push(step);
    if (this.steps.length > 200) {
      this.steps.shift();
      this.dropped += 1;
    }
  }
  #close() {
    if (this.open?.length) this.#push(this.open);
    this.open = null;
  }
  /** The player starts a stroke and paints one dab (left open). */
  stroke(id: string) {
    this.#close();
    this.open = [id];
    this.world.push(id);
  }
  /** The player makes a one-step edit. */
  edit(id: string) {
    this.#close();
    this.world.push(id);
    this.#push([id]);
  }
  undoMark() {
    return this.dropped + this.steps.length;
  }
  mergeUndoSince(mark: number) {
    this.#close();
    const from = Math.max(0, mark - this.dropped);
    if (mark < 0 || this.steps.length - from < 2) return;
    this.steps.push(this.steps.splice(from).flat());
  }
  applyBatch(commands: readonly CommandPayload[]) {
    this.#close();
    const step: string[] = [];
    let ok = true;
    for (const command of commands) {
      const id = (command.params as { instanceId: string }).instanceId;
      if (this.refuse.has(id)) {
        ok = false;
        continue;
      }
      step.push(id);
      this.world.push(id);
    }
    if (step.length) this.#push(step);
    this.between?.();
    return ok;
  }
  undo() {
    this.#close();
    const step = this.steps.pop();
    if (!step) return false;
    this.world = this.world.filter((id) => !step.includes(id));
    return true;
  }
}

const commands = (n: number): CommandPayload[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'remove_item', params: { instanceId: `b${i}` } }) as CommandPayload);
const built = (studio: FakeStudio) => studio.world.filter((id) => id.startsWith('b'));
const options = (signal?: AbortSignal) => ({
  stage: () => 'Building',
  pause: () => Promise.resolve(),
  ...(signal ? { progress: { signal, report: () => {} } } : {}),
});

describe('applyMapBuild (REAL-06)', () => {
  it('joins every piece into one undo step, also on a full history', async () => {
    const studio = new FakeStudio(200);
    const mark = await applyMapBuild(studio, commands(45), options());
    expect(mark).toBe(201);
    expect(built(studio)).toHaveLength(45);
    studio.undo();
    expect(built(studio)).toHaveLength(0);
    expect(studio.steps.at(-1)).toEqual(['old199']);
  });

  it('takes every piece back when a piece fails part way on a full history', async () => {
    const studio = new FakeStudio(200);
    studio.refuse.add('b25');
    await expect(applyMapBuild(studio, commands(45), options())).rejects.toThrow(MAP_BUILD_FAILED);
    expect(built(studio)).toHaveLength(0);
    expect(studio.steps.at(-1)).toEqual(['old199']);
  });

  it('never joins a stroke the player holds open into the build', async () => {
    const studio = new FakeStudio(200);
    let pieces = 0;
    studio.between = () => {
      pieces += 1;
      if (pieces === 1) studio.stroke('player');
    };
    await expect(applyMapBuild(studio, commands(45), options())).rejects.toThrow(MAP_BUILD_CHANGED);
    // The player's stroke is its own step on top: one undo takes back the stroke only, not the build.
    expect(studio.steps.at(-1)).toEqual(['player']);
    expect(studio.steps.flat().filter((id) => id === 'player')).toHaveLength(1);
    expect(studio.steps.some((step) => step.includes('player') && step.some((id) => id.startsWith('b')))).toBe(false);
  });

  it('a stroke open when the build starts stays its own step', async () => {
    const studio = new FakeStudio(10);
    studio.stroke('player');
    await applyMapBuild(studio, commands(45), options());
    expect(studio.steps.at(-2)).toEqual(['player']);
    studio.undo();
    expect(built(studio)).toHaveLength(0);
    expect(studio.world).toContain('player');
  });

  it('Cancel takes the build back, also after the last piece', async () => {
    for (const { n, at } of [
      { n: 45, at: 2 },
      { n: 5, at: 1 },
    ]) {
      const studio = new FakeStudio(200);
      const cancel = new AbortController();
      let pieces = 0;
      studio.between = () => {
        pieces += 1;
        if (pieces === at) cancel.abort();
      };
      await expect(applyMapBuild(studio, commands(n), options(cancel.signal))).rejects.toThrow(
        MAP_BUILD_CANCELLED,
      );
      expect(built(studio)).toHaveLength(0);
      expect(studio.steps.at(-1)).toEqual(['old199']);
    }
  });

  it('an edit and a Cancel between the same pieces says the place changed and keeps the edit', async () => {
    const studio = new FakeStudio(5);
    const cancel = new AbortController();
    let pieces = 0;
    studio.between = () => {
      pieces += 1;
      if (pieces === 1) {
        studio.stroke('player');
        cancel.abort();
      }
    };
    await expect(applyMapBuild(studio, commands(45), options(cancel.signal))).rejects.toThrow(MAP_BUILD_CHANGED);
    expect(studio.world).toContain('player');
    expect(studio.steps.at(-1)).toEqual(['player']);
  });
});
