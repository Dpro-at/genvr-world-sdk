'use client';

import { useSettings } from '../lib/settings';

/** Loads the player settings on every page, so text size and reduced motion apply everywhere. */
export function SettingsRoot() {
  useSettings();
  return null;
}
