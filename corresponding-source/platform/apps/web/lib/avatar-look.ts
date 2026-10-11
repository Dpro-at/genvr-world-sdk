'use client';

import {
  DEFAULT_AVATAR_LOOK,
  DEFAULT_PLACE_AVATAR,
  readAvatarProfile,
  type AvatarLook,
  type AvatarProfile,
  type PlaceAvatar,
} from '@genvr/contracts';
import { useSyncExternalStore } from 'react';
import { api } from './api';

/**
 * The player's avatar look (task P2-20): one store for the whole page, like the settings.
 * Loaded from this browser at once, then from the account when signed in (the account wins);
 * every change is saved to both. It also keeps the look of each other body type (P2-22).
 */

const KEY = 'genvr-avatar';

const DEFAULT_PROFILE: AvatarProfile = readAvatarProfile(DEFAULT_AVATAR_LOOK);

let look: AvatarProfile = DEFAULT_PROFILE;
let started = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish(next: AvatarProfile) {
  look = next;
  for (const listener of listeners) listener();
}

function saveLocal(next: AvatarProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not remembered in this browser; the account copy still saves.
  }
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let local: unknown = null;
  try {
    local = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    // Storage blocked: the default look until the account look arrives.
  }
  publish(readAvatarProfile(local));
  void api.GET('/v1/me/avatar').then(({ data }) => {
    if (data) {
      publish(readAvatarProfile(data));
      saveLocal(look);
    }
  });
}

/**
 * Changes the look and saves it shortly after (color pickers send many changes). Changes keep
 * the looks of the other body types (`change` receives the whole profile).
 */
export function updateAvatarLook(change: (current: AvatarProfile) => AvatarLook): void {
  start();
  const next = readAvatarProfile({ bodies: look.bodies, ...change(look) });
  publish(next);
  saveLocal(next);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void api.PUT('/v1/me/avatar', { body: next });
  }, 600);
}

/** Shows a look the account already saved (a look item worn through the API): no second save. */
export function setSavedAvatarLook(saved: AvatarProfile): void {
  start();
  publish(readAvatarProfile(saved));
  saveLocal(look);
}

export function getAvatarLook(): AvatarProfile {
  start();
  return look;
}

/** Calls `listener` after every change of the look; returns the unsubscribe function. */
export function subscribeAvatarLook(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAvatarLook(): AvatarProfile {
  return useSyncExternalStore(subscribeAvatarLook, getAvatarLook, () => DEFAULT_PROFILE);
}

// -- avatar rules of the place being played (P2-21) ---------------------------------------------

let rules: PlaceAvatar = DEFAULT_PLACE_AVATAR;
const ruleListeners = new Set<() => void>();

/** The play page sets the rules of its place; leaving the place resets them. */
export function setPlaceAvatarRules(next: PlaceAvatar): void {
  rules = next;
  for (const listener of ruleListeners) listener();
}

function subscribeRules(listener: () => void) {
  ruleListeners.add(listener);
  return () => {
    ruleListeners.delete(listener);
  };
}

export function usePlaceAvatarRules(): PlaceAvatar {
  return useSyncExternalStore(
    subscribeRules,
    () => rules,
    () => DEFAULT_PLACE_AVATAR,
  );
}
