'use client';

import type { GenvrRuntime } from '@genvr/runtime';
import { api } from './api';

/** How often the frame rate is read, and how often a sample is sent (milliseconds). */
const READ_MS = 5_000;
const SEND_MS = 60_000;

/** The kind of device, as the phone budgets count it (decision 82). */
function deviceClass(): 'phone' | 'tablet' | 'computer' {
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (!touch) return 'computer';
  return Math.min(window.screen.width, window.screen.height) < 600 ? 'phone' : 'tablet';
}

/**
 * Performance samples for the event log (task P1-10): while a place is played and the page is
 * visible, the frame rate is read every few seconds and its average is sent once a minute with
 * the draw calls and triangles, the renderer, the kind of device, and the quality setting.
 * Returns a function that stops sampling. Best effort: playing never waits for it.
 */
export function startFpsSamples(
  placeId: string,
  runtime: GenvrRuntime,
  options: { playing: () => boolean; quality: () => number },
): () => void {
  let readings: number[] = [];
  const read = setInterval(() => {
    if (document.visibilityState !== 'visible' || !options.playing()) return;
    const { fps } = runtime.stats();
    if (fps > 0) readings.push(fps);
  }, READ_MS);
  const send = setInterval(() => {
    // Most of the minute must have been played for the average to mean something.
    if (readings.length < (SEND_MS / READ_MS) * 0.5) {
      readings = [];
      return;
    }
    const fps = readings.reduce((sum, value) => sum + value, 0) / readings.length;
    readings = [];
    const { drawCalls, triangles } = runtime.stats();
    void api
      .POST('/v1/events/fps', {
        body: {
          experienceId: placeId,
          fps: Math.round(fps * 10) / 10,
          drawCalls,
          triangles,
          backend: runtime.backend === 'WebGPU' ? 'WebGPU' : 'WebGL2',
          device: deviceClass(),
          quality: Math.min(1, Math.max(0, options.quality())),
        },
      })
      .catch(() => {});
  }, SEND_MS);
  return () => {
    clearInterval(read);
    clearInterval(send);
  };
}
