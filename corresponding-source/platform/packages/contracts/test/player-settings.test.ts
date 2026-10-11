import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_SETTINGS, readPlayerSettings } from '../src/index.js';

describe('player settings', () => {
  it('fill in defaults and keep valid groups when others are broken', () => {
    expect(readPlayerSettings(undefined)).toEqual(DEFAULT_PLAYER_SETTINGS);
    const settings = readPlayerSettings({
      audio: { master: 30 },
      display: { quality: 99 },
      view: { invertCamera: true },
    });
    expect(settings.audio).toEqual({ master: 30, effects: 100, music: 70 });
    expect(settings.display).toEqual(DEFAULT_PLAYER_SETTINGS.display);
    expect(settings.view.invertCamera).toBe(true);
  });
});
