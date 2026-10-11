'use client';

import { DEFAULT_PLAYER_SETTINGS, readPlayerSettings, type PlayerSettings } from '@genvr/contracts';
import { useSyncExternalStore } from 'react';
import { api } from './api';

/**
 * Player settings (task P3-21): one store for the whole page. Loaded from this browser at once,
 * then from the account when signed in (the account wins); every change is saved to both. Text
 * size and reduced motion apply to the page right away; the play page applies the rest.
 */

const KEY = 'genvr-settings';
/** Sounds switch from before the settings existed (P3-05). */
const OLD_SOUNDS_KEY = 'genvr-sounds';

let settings: PlayerSettings = DEFAULT_PLAYER_SETTINGS;
let started = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function applyToPage(next: PlayerSettings) {
  const root = document.documentElement;
  root.style.fontSize = next.display.textSize === 'large' ? '112.5%' : '';
  if (next.display.reduceMotion) root.dataset.reduceMotion = 'true';
  else delete root.dataset.reduceMotion;
}

function publish(next: PlayerSettings) {
  settings = next;
  applyToPage(next);
  for (const listener of listeners) listener();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let local: unknown = null;
  try {
    local = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!local && localStorage.getItem(OLD_SOUNDS_KEY) === 'off') local = { audio: { master: 0 } };
  } catch {
    // Storage blocked: defaults until the account settings arrive.
  }
  publish(readPlayerSettings(local));
  // Signed-in players get their account settings (on every device).
  void api.GET('/v1/me/settings').then(({ data }) => {
    if (data) {
      publish(readPlayerSettings(data));
      saveLocal(settings);
    }
  });
}

function saveLocal(next: PlayerSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not remembered in this browser; the account copy still saves.
  }
}

/** Changes settings (a partial group change is merged) and saves them shortly after. */
export function updateSettings(change: (current: PlayerSettings) => PlayerSettings): void {
  start();
  const next = readPlayerSettings(change(settings));
  publish(next);
  saveLocal(next);
  if (saveTimer) clearTimeout(saveTimer);
  // Sliders send many changes: save the account copy once they rest.
  saveTimer = setTimeout(() => {
    void api.PUT('/v1/me/settings', { body: next });
  }, 600);
}

export function getSettings(): PlayerSettings {
  start();
  return settings;
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): PlayerSettings {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULT_PLAYER_SETTINGS);
}
