'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeChoice } from '../lib/theme';

const CHOICES: Array<{ id: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { id: 'system', label: 'Device', Icon: Monitor },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Light, dark or the device's mode (owner N-148): one row of three buttons, in the footer of every page and in
 * Settings. `compact` shows only the icons.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-2xl border border-ink/10 p-1">
      {CHOICES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={choice === id}
          aria-label={compact ? `Theme: ${label}` : undefined}
          title={label}
          onClick={() => setChoice(id)}
          className={`flex items-center gap-2 rounded-xl font-semibold transition ${
            compact ? 'size-8 justify-center' : 'px-4 py-2'
          } ${choice === id ? 'bg-ink text-surface' : 'text-ink/60 hover:text-ink'}`}
        >
          <Icon className="size-4" aria-hidden />
          {compact ? null : label}
        </button>
      ))}
    </div>
  );
}
