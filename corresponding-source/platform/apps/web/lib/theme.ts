'use client';

import { useEffect, useState } from 'react';
import { THEME_KEY as KEY } from './theme-script';

const THEME_EVENT = 'genvr:theme-change';

/** Light or dark mode (decision 67); `system` follows the device. */
export type ThemeChoice = 'system' | 'light' | 'dark';

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') setChoice(saved);
    } catch {
      // Storage can be blocked (private mode); the device setting still applies.
    }
    const sync = (event: Event) => setChoice((event as CustomEvent<ThemeChoice>).detail);
    const storage = (event: StorageEvent) => {
      if (event.key !== KEY && event.key !== null) return;
      const next = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system';
      apply(next);
      setChoice(next);
    };
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener('storage', storage);
    };
  }, []);
  return [
    choice,
    (next) => {
      setChoice(next);
      apply(next);
      window.dispatchEvent(new CustomEvent<ThemeChoice>(THEME_EVENT, { detail: next }));
      try {
        if (next === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch {
        // Not saved; the choice still applies to this visit.
      }
    },
  ];
}
