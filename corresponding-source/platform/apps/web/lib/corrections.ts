'use client';

import { CorrectionTracker, type ChangeSource } from '@genvr/assistant';
import type { CommandPayload, CorrectionReport } from '@genvr/contracts';
import { API_URL } from './api';

/**
 * Correction logging (task P4-08) for the place open in the studio: the assistant panel marks
 * where each reply starts and ends, the play page reports every local change, and finished
 * reports go to the API (also when the page closes).
 */

let current: { placeId: string; tracker: CorrectionTracker } | null = null;

const sender = (placeId: string) => (report: CorrectionReport) => {
  void fetch(`${API_URL}/v1/experiences/${encodeURIComponent(placeId)}/assistant/corrections`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report),
    // Reports sent while the page closes still arrive.
    keepalive: true,
  }).catch(() => {
    // Preference data is best effort; building never waits for it.
  });
};

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => current?.tracker.finish());

/** The tracker of a place (a new place ends the previous place's watch). */
export function correctionsFor(placeId: string): CorrectionTracker {
  if (current?.placeId !== placeId) {
    current?.tracker.finish();
    current = { placeId, tracker: new CorrectionTracker(sender(placeId)) };
  }
  return current.tracker;
}

/** A local change in a place (called for every command the runtime reports). */
export function noteChange(placeId: string, command: CommandPayload, source: ChangeSource): void {
  correctionsFor(placeId).onChange(command, source);
}
