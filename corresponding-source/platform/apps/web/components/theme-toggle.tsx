'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeChoice } from '../lib/theme';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemeChoice, string> = {
  system: 'Theme: same as device',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

/** Cycles device, light, and dark mode. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [choice, setChoice] = useTheme();
  const Icon = choice === 'light' ? Sun : choice === 'dark' ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setChoice(NEXT[choice])}
      aria-label={LABEL[choice]}
      title={LABEL[choice]}
      className={`flex size-10 items-center justify-center rounded-2xl text-ink hover:bg-ink/5 ${className}`}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
