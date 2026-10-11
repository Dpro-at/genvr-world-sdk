import { describe, expect, it } from 'vitest';
import { KeyboardInput, mergeIntents } from '../src/input.js';

describe('mergeIntents', () => {
  it('picks the strongest direction and jumps if any source jumps', () => {
    const merged = mergeIntents([
      { direction: { x: 0, z: 1 }, speed: 0.5, jump: false },
      { direction: { x: 1, z: 0 }, speed: 0.9, jump: false },
      { direction: { x: 0, z: 0 }, speed: 0, jump: true },
    ]);
    expect(merged).toEqual({ direction: { x: 1, z: 0 }, speed: 0.9, jump: true });
    // A dash from any source (decision 95).
    expect(
      mergeIntents([
        { direction: { x: 1, z: 0 }, speed: 0.9, jump: false },
        { direction: { x: 0, z: 0 }, speed: 0, jump: false, dash: true },
      ]).dash,
    ).toBe(true);
  });

  it('is idle without input', () => {
    expect(mergeIntents([])).toEqual({ direction: { x: 0, z: 0 }, speed: 0, jump: false });
  });
});

describe('keyboard (movement modes)', () => {
  const keys = () => {
    // Node has no DOM: the input checks whether a key went to a text field.
    const scope = globalThis as Record<string, unknown>;
    scope.HTMLInputElement ??= class {};
    scope.HTMLTextAreaElement ??= class {};
    const target = new EventTarget() as unknown as Window;
    const input = new KeyboardInput(target);
    const key = (type: 'keydown' | 'keyup', code: string) =>
      target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
    return { input, key };
  };

  it('gets on or off with a tap of E shorter than a frame, once', () => {
    const { input, key } = keys();
    key('keydown', 'KeyE');
    key('keyup', 'KeyE');
    expect(input.read().interact).toBe(true);
    expect(input.read().interact).toBeUndefined();
    input.dispose();
  });

  it('goes down with Q or Shift', () => {
    const { input, key } = keys();
    key('keydown', 'KeyQ');
    expect(input.read().descend).toBe(true);
    key('keyup', 'KeyQ');
    expect(input.read().descend).toBeUndefined();
    key('keydown', 'ShiftLeft');
    expect(input.read().descend).toBe(true);
    input.dispose();
  });
  it('dives with C/Ctrl independently of aircraft Shift descent', () => {
    const { input, key } = keys();
    key('keydown', 'ShiftLeft');
    expect(input.read().dive).toBeUndefined();
    key('keyup', 'ShiftLeft');
    for (const code of ['KeyC', 'ControlLeft', 'ControlRight']) {
      key('keydown', code);
      expect(input.read().dive).toBe(true);
      key('keyup', code);
      expect(input.read().dive).toBeUndefined();
    }
    expect(mergeIntents([{ direction: { x: 0, z: 0 }, speed: 0, jump: false, dive: true }]).dive).toBe(true);
    input.dispose();
  });
});
