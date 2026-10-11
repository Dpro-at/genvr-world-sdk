'use client';

import type { PlayerSettings } from '@genvr/contracts';
import { Maximize, Minimize } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { updateSettings, useSettings } from '../lib/settings';
import { useTheme, type ThemeChoice } from '../lib/theme';

const option = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-bold ${active ? 'bg-ink text-on-brand' : 'bg-paper text-ink/60 hover:text-ink'}`;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-black">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-bold">{label}</p>
        {hint ? <p className="text-xs text-ink/50">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Choice<T extends string | number | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <>
      {options.map(([entry, label]) => (
        <button
          key={String(entry)}
          type="button"
          aria-pressed={value === entry}
          onClick={() => onChange(entry)}
          className={option(value === entry)}
        >
          {label}
        </button>
      ))}
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm font-bold">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyDown={(event) => event.stopPropagation()}
        className="min-w-0 flex-1 accent-[var(--color-ink)]"
      />
      <span className="w-12 shrink-0 text-right font-mono text-xs font-bold text-ink/60">
        {format(value)}
      </span>
    </label>
  );
}

const onOff: Array<[boolean, string]> = [
  [true, 'On'],
  [false, 'Off'],
];

/** Changes one settings group. */
const set = <K extends keyof PlayerSettings>(key: K, change: Partial<PlayerSettings[K]>) =>
  updateSettings((current) => ({
    ...current,
    [key]: typeof current[key] === 'object' ? { ...(current[key] as object), ...change } : change,
  }));

/**
 * Settings tab of the system menu (P3-21, docs/PLAYER-UI.md section 4): audio, chat and
 * language, display and graphics, view and controls; the developer console for owners and
 * builders. Saved on the account and in this browser.
 */
export function SettingsTab({ builder }: { builder: boolean }) {
  const settings = useSettings();
  const [theme, setTheme] = useTheme();
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    onChange();
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const themes: Array<[ThemeChoice, string]> = [
    ['system', 'Same as device'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  const percent = (value: number) => `${value}%`;
  const { audio, display, view } = settings;

  return (
    <div className="flex flex-col gap-6">
      <Group title="Audio">
        <Slider
          label="Master"
          value={audio.master}
          min={0}
          max={100}
          step={5}
          format={percent}
          onChange={(master) => set('audio', { master })}
        />
        <Slider
          label="Effects"
          value={audio.effects}
          min={0}
          max={100}
          step={5}
          format={percent}
          onChange={(effects) => set('audio', { effects })}
        />
        <Slider
          label="World sounds"
          value={audio.music}
          min={0}
          max={100}
          step={5}
          format={percent}
          onChange={(music) => set('audio', { music })}
        />
      </Group>

      <Group title="Chat and language">
        <Row label="Chat" hint="Off hides the chat and its messages">
          <Choice value={settings.chat.on} options={onOff} onChange={(on) => set('chat', { on })} />
        </Row>
        <Row label="Language" hint="More languages are coming">
          <Choice value={settings.language} options={[['en', 'English']]} onChange={() => undefined} />
        </Row>
      </Group>

      <Group title="Display and graphics">
        <Row label="Look">
          <Choice value={theme} options={themes} onChange={setTheme} />
        </Row>
        {typeof document !== 'undefined' && document.fullscreenEnabled ? (
          <Row label="Full screen">
            <button
              type="button"
              onClick={() =>
                void (fullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen())
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-sm font-bold text-ink hover:bg-ink/10"
            >
              {fullscreen ? (
                <Minimize className="size-4" aria-hidden />
              ) : (
                <Maximize className="size-4" aria-hidden />
              )}
              {fullscreen ? 'Leave full screen' : 'Full screen'}
            </button>
          </Row>
        ) : null}
        <Row label="Graphics" hint="Lower is faster; automatic fits your device">
          <Choice
            value={display.quality === 0 ? 'auto' : 'manual'}
            options={[
              ['auto', 'Automatic'],
              ['manual', 'Choose'],
            ]}
            onChange={(mode) => set('display', { quality: mode === 'auto' ? 0 : 6 })}
          />
        </Row>
        {display.quality > 0 ? (
          <Slider
            label="Quality"
            value={display.quality}
            min={1}
            max={10}
            step={1}
            format={(value) => String(value)}
            onChange={(quality) => set('display', { quality })}
          />
        ) : null}
        <Row label="Text size">
          <Choice
            value={display.textSize}
            options={[
              ['normal', 'Normal'],
              ['large', 'Large'],
            ]}
            onChange={(textSize) => set('display', { textSize })}
          />
        </Row>
        <Row label="Reduce motion" hint="Fewer moving effects in menus">
          <Choice
            value={display.reduceMotion}
            options={onOff}
            onChange={(reduceMotion) => set('display', { reduceMotion })}
          />
        </Row>
        <Row label="Frame rate limit" hint="A limit saves battery">
          <Choice
            value={display.fpsCap}
            options={[
              [0, 'None'],
              [60, '60'],
              [30, '30'],
            ]}
            onChange={(fpsCap) => set('display', { fpsCap })}
          />
        </Row>
        <Row label="Show frame rate">
          <Choice
            value={display.showFps}
            options={onOff}
            onChange={(showFps) => set('display', { showFps })}
          />
        </Row>
      </Group>

      <Group title="View and controls">
        <Slider
          label="Camera speed"
          value={view.cameraSensitivity}
          min={0.25}
          max={3}
          step={0.25}
          format={(value) => `${value}x`}
          onChange={(cameraSensitivity) => set('view', { cameraSensitivity })}
        />
        <Row label="Invert camera" hint="Moving up looks down">
          <Choice
            value={view.invertCamera}
            options={onOff}
            onChange={(invertCamera) => set('view', { invertCamera })}
          />
        </Row>
        <Row label="Names above players">
          <Choice
            value={view.showNames}
            options={onOff}
            onChange={(showNames) => set('view', { showNames })}
          />
        </Row>
      </Group>

      {builder ? (
        <Group title="For builders">
          <Row label="Developer console" hint="Frame rate, drawing, and room details while playing">
            <Choice
              value={settings.devConsole}
              options={onOff}
              onChange={(devConsole) => updateSettings((current) => ({ ...current, devConsole }))}
            />
          </Row>
        </Group>
      ) : null}
    </div>
  );
}
