import { afterEach, expect, it, vi } from 'vitest';
import { SceneSpeech } from './scene-speech';
const contexts: FakeContext[] = [];
class FakeContext {
  currentTime = 10;
  destination = {};
  starts: number[][] = [];
  stops = 0;
  constructor() { contexts.push(this); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  decodeAudioData() { return Promise.resolve({ duration: 2, sampleRate: 8000, getChannelData: () => new Float32Array(16000).fill(.3) }); }
  createBufferSource() { return { buffer: null, onended: null, connect: () => ({ connect: () => {} }), start: (...args: number[]) => this.starts.push(args), stop: () => this.stops++, disconnect: () => {} }; }
  createGain() { return { gain: { value: 1 }, connect: () => {}, disconnect: () => {} }; }
}
afterEach(() => { vi.unstubAllGlobals(); contexts.length = 0; });
it('schedules scene audio once at its cue time and drives the matching mouth only during speech', async () => {
  vi.stubGlobal('AudioContext', FakeContext);
  const mouth: Array<[string, string]> = [];
  const playback = new SceneSpeech((id, shape) => mouth.push([id, shape]));
  await playback.prepare([{ id: 'line', actor: 'self', label: 'Hero', action: 'none', start: 1, end: 3, audio: 'wav', text: 'Hello', volume: 1 }], [{ id: 'wav', blob: new Blob(['wav'], { type: 'audio/wav' }) }]);
  playback.start(); const context = contexts[0]!;
  expect(context.starts).toEqual([[11, 0, 2]]);
  playback.tick(); expect(mouth).toEqual([]);
  context.currentTime = 11.5; playback.tick(); expect(mouth.at(-1)).toEqual(['self', 'D']);
  context.currentTime = 13.1; playback.tick(); expect(mouth.at(-1)).toEqual(['self', 'X']);
  expect(context.starts).toHaveLength(1); playback.dispose();
});
it('refuses missing audio before capture instead of silently filming a mute line', async () => {
  vi.stubGlobal('AudioContext', FakeContext);
  const playback = new SceneSpeech(() => {});
  await expect(playback.prepare([{ id: 'line', actor: 'self', label: 'Hero', action: 'none', start: 0, end: 2, audio: 'missing', text: 'Hello', volume: 1 }], [])).rejects.toThrow('missing');
  playback.dispose();
});
