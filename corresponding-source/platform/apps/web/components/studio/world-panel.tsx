'use client';

import { readSkySettings, SceneLight, SIZE_TIERS, type SceneLight as Light } from '@genvr/contracts';
import { CORE_SKIES, CORE_WEATHER, getCoreItem, getOceanResource } from '@genvr/core-library';
import type { GenvrRuntime } from '@genvr/runtime';
import {
  ChevronRight, Droplets, Flag, Lightbulb, MapPin, Mountain, Palette, Plus, Sun, SunMoon, Trash2, X, type LucideIcon,
  CloudRain, Crosshair, Globe,
} from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { STYLE_NAMES } from '../../lib/library-details';
import { DAY_LENGTHS, DEFAULT_WATER, ENVIRONMENT_ICONS, GroundRules, READY_STYLES, WaterRules } from '../environment-picker';
import { OceanResourceControls } from './ocean-resource-controls';
import { runStudioTool } from './assistant-panel';

/** The parts of the whole place (WORLD-W1); the picked one opens on the right. */
export type WorldPart = 'lighting' | 'sky' | 'weather' | 'water' | 'place';
let picked: WorldPart | null = null;
const listeners = new Set<() => void>();
export function setWorldPart(next: WorldPart | null): void {
  picked = next;
  for (const listener of listeners) listener();
}
export function useWorldPart(): WorldPart | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => picked, () => null);
}
/** The light picked in the Lighting part. */
let pickedLight: string | null = null;

const label = 'text-[11px] font-black tracking-wide text-ink/50 uppercase';
const chip = (on: boolean) => `rounded-lg px-2.5 py-1.5 text-xs font-bold ${on ? 'bg-ink text-on-brand' : 'bg-paper text-ink/75 hover:bg-ink/10'}`;
const tile = (on: boolean) => `flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-bold ${on ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'}`;

/**
 * Follows the world (undo, the assistant, other builders) with one fingerprint of everything the World panels show
 * (WORLD-W0: the old checks missed the sea, trees and items).
 */
function useWorldVersion(runtime: RefObject<GenvrRuntime | null>): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let seen = '';
    const timer = window.setInterval(() => {
      const world = runtime.current?.world;
      const now = world
        ? JSON.stringify([world.style, world.environment, world.spawn, Boolean(world.terrain.world), Boolean(world.voxels), world.instances.length, world.sizeTier])
        : '';
      if (now !== seen) { seen = now; setVersion((n) => n + 1); }
    }, 500);
    return () => window.clearInterval(timer);
  }, [runtime]);
  return version;
}

/** One live range: shows the value while dragging and applies once on release (one undo step per drag). */
function Range({ name, value, shown, min, max, step, onCommit }: { name: string; value: number; shown: (v: number) => string; min: number; max: number; step: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const now = draft ?? value;
  const commit = () => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null); };
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
      <span className="flex justify-between gap-3">{name}<span className="text-ink tabular-nums">{shown(now)}</span></span>
      <input type="range" aria-label={name} min={min} max={max} step={step} value={now}
        onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} className="accent-ink" />
    </label>
  );
}

/** Waits for one click on the ground in the 3D view (start point, a light's place). */
function pickGround(runtime: GenvrRuntime, done: (spot: { x: number; z: number }) => void, cancel: () => void): () => void {
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLCanvasElement)) return;
    const spot = runtime.groundAt(event.clientX, event.clientY);
    if (!spot) return;
    event.stopPropagation();
    stop();
    done(spot);
  };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { stop(); cancel(); } };
  const stop = () => { window.removeEventListener('click', onClick, true); window.removeEventListener('keydown', onKey, true); };
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  return stop;
}

const hour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
const compass = (deg: number) => ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

/** The world's parts in one list with their value (WORLD-W1, left dock). */
export function WorldPartsList({ runtime }: { runtime: RefObject<GenvrRuntime | null> }) {
  useWorldVersion(runtime);
  const part = useWorldPart();
  const world = runtime.current?.world;
  if (!world) return null;
  const sky = readSkySettings(world.environment.sky.params);
  const skyName = CORE_SKIES.find((s) => s.preset === world.environment.sky.preset)?.manifest.name ?? world.environment.sky.preset;
  const weatherName = CORE_WEATHER.find((w) => w.preset === world.environment.weather.preset)?.manifest.name ?? world.environment.weather.preset;
  const lights = world.environment.lighting ?? [];
  const rows: Array<{ id: WorldPart; Icon: LucideIcon; name: string; value: string }> = [
    { id: 'lighting', Icon: Lightbulb, name: 'Lighting', value: lights.length ? `${lights.filter((l) => l.enabled).length} of ${lights.length} on` : 'No lights' },
    { id: 'sky', Icon: Sun, name: 'Sky', value: `${skyName}${sky.cycle ? ' · day and night' : sky.timeOfDay !== undefined ? ` · ${hour(sky.timeOfDay)}` : ''}` },
    { id: 'weather', Icon: CloudRain, name: 'Weather and ground', value: weatherName },
    { id: 'water', Icon: Droplets, name: 'Water and sea', value: world.environment.sea ? `Sea at ${world.environment.sea.level} m` : world.environment.water.length ? `${world.environment.water.length} lakes` : 'No sea' },
    { id: 'place', Icon: Flag, name: 'Style and place', value: `${STYLE_NAMES[world.style.base] ?? world.style.base} · ${world.sizeTier}` },
  ];
  return (
    <div className="flex flex-col gap-1 px-2 pb-2">
      <h3 className={`${label} px-1 pb-1`}>The whole place · click a part</h3>
      {rows.map((row) => (
        <button key={row.id} type="button" aria-pressed={part === row.id} onClick={() => setWorldPart(part === row.id ? null : row.id)}
          className={`flex items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs ${part === row.id ? 'bg-ink text-on-brand' : 'hover:bg-ink/5'}`}>
          <row.Icon className="size-4 shrink-0" aria-hidden />
          <b className="flex-1">{row.name}</b>
          <span className={`truncate ${part === row.id ? 'text-on-brand/70' : 'text-ink/55'}`}>{row.value}</span>
          <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      ))}
      <p className="mt-2 px-1 text-[11px] text-ink/50">Each part opens on the right. Changes are live and undoable; Filming uses the same lights and sky.</p>
    </div>
  );
}

function Head({ Icon, title, sub }: { Icon: LucideIcon; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-paper"><Icon className="size-4" aria-hidden /></span>
      <span className="min-w-0 flex-1"><b className="block text-sm">{title}</b><span className="block truncate text-[11px] text-ink/55">{sub}</span></span>
      <button type="button" aria-label="Back to the summary" title="Back to the summary" onClick={() => setWorldPart(null)} className="rounded-lg p-1 text-ink/60 hover:bg-ink/10"><X className="size-4" aria-hidden /></button>
    </div>
  );
}

const LIGHT_PRESETS: Record<'key' | 'fill' | 'back', Partial<Light>> = {
  key: { name: 'Key light', color: '#fff4e0', intensity: 24, angle: 35, softness: 0.5, position: [2, 3, 3], target: [0, 1.5, 0] },
  fill: { name: 'Fill light', color: '#dfe8ff', intensity: 9, angle: 50, softness: 0.9, position: [-3, 2, 2.5], target: [0, 1.4, 0] },
  back: { name: 'Back light', color: '#ffffff', intensity: 16, angle: 30, softness: 0.4, position: [0, 3.2, -3], target: [0, 1.6, 0] },
};
const LIGHT_COLORS = ['#ffffff', '#fff4e0', '#ffd7a0', '#ffb36b', '#dfe8ff', '#a8c8ff', '#7fa8ff', '#ff8fa3', '#b8ffb0'];

/** Lighting (WORLD-W2): the lights, presets, and the picked light changed live. */
function LightingPart({ runtime, busy, actors, message }: { runtime: RefObject<GenvrRuntime | null>; busy: boolean; actors: Array<{ id: string; label: string }>; message: (text: string) => void }) {
  const [, redraw] = useState(0);
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const rt = runtime.current;
  if (!rt) return null;
  const lights = rt.world.environment.lighting ?? [];
  const current = lights.find((l) => l.id === pickedLight) ?? lights[0] ?? null;
  const save = (next: Light[]) => {
    const ok = rt.applyCommand({ type: 'set_lighting', params: { lights: next } });
    setError(ok ? '' : 'The lights could not change.');
    if (!ok) message('The lights could not change.');
    redraw((n) => n + 1);
  };
  const update = (patch: Partial<Light>) => {
    if (!current) return;
    const parsed = SceneLight.safeParse({ ...current, ...patch });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the light values.'); return; }
    save(lights.map((l) => (l.id === current.id ? parsed.data : l)));
  };
  const add = (kind: 'key' | 'fill' | 'back' | 'spot') => {
    if (lights.length >= 4) return;
    const light = SceneLight.parse({ id: `light-${Math.random().toString(36).slice(2, 8)}`, name: `Light ${lights.length + 1}`, ...(kind === 'spot' ? {} : LIGHT_PRESETS[kind]) });
    pickedLight = light.id;
    save([...lights, light]);
  };
  const threePoint = () => {
    const made = (['key', 'fill', 'back'] as const).map((kind) => SceneLight.parse({ id: `light-${kind}`, ...LIGHT_PRESETS[kind] }));
    pickedLight = made[0]!.id;
    save(made);
  };
  const vec = (key: 'position' | 'target', axis: number, value: number) => {
    if (!current) return;
    const next = [...current[key]] as [number, number, number];
    next[axis] = value;
    update({ [key]: next });
  };
  return (
    <div className="flex flex-col gap-3">
      <Head Icon={Lightbulb} title="Lighting" sub={`${lights.length} of 4 lights · shared with Filming`} />
      <div className="flex flex-col gap-1">
        {lights.map((light) => (
          <div key={light.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${current?.id === light.id ? 'bg-ink/10 ring-1 ring-ink' : 'hover:bg-ink/5'}`}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { pickedLight = light.id; redraw((n) => n + 1); }}>
              <span className="size-3 shrink-0 rounded-full ring-1 ring-ink/20" style={{ backgroundColor: light.color }} />
              <b className="truncate">{light.name}</b>
              <span className="ml-auto text-ink/50">{light.actor === null ? 'World' : light.actor === 'self' ? 'My avatar' : light.actor}</span>
            </button>
            <button type="button" role="switch" aria-checked={light.enabled} aria-label={`${light.name} on`} disabled={busy}
              onClick={() => save(lights.map((l) => (l.id === light.id ? { ...l, enabled: !l.enabled } : l)))}
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${light.enabled ? 'bg-ink text-on-brand' : 'bg-paper text-ink/60'}`}>{light.enabled ? 'On' : 'Off'}</button>
          </div>
        ))}
        {!lights.length ? <p className="text-xs text-ink/55">Add a key light for the face, then a softer fill or a back light — or the three-point setup.</p> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={busy} onClick={threePoint} className={chip(false)}>Three-point setup</button>
        {(['key', 'fill', 'back'] as const).map((kind) => (
          <button key={kind} type="button" disabled={busy || lights.length >= 4} onClick={() => add(kind)} className={`${chip(false)} capitalize disabled:opacity-40`}><Plus className="mr-0.5 inline size-3" aria-hidden />{kind}</button>
        ))}
        <button type="button" disabled={busy || lights.length >= 4} onClick={() => add('spot')} className={`${chip(false)} disabled:opacity-40`}><Plus className="mr-0.5 inline size-3" aria-hidden />Spotlight</button>
      </div>
      {lights.length >= 4 ? <p className="text-[11px] text-ink/55">A place has at most 4 lights: each one costs drawing time. Remove one to add another.</p> : null}
      {current ? (
        <fieldset disabled={busy} className="flex flex-col gap-2.5 border-t border-ink/10 pt-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">Name
            <input key={current.id} defaultValue={current.name} maxLength={80} onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== current.name) update({ name }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="rounded-lg bg-paper px-2.5 py-1.5 text-sm font-semibold text-ink ring-1 ring-ink/10" />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-ink/70">Follows
            <select aria-label="Light follows" value={current.actor ?? ''} onChange={(e) => update({ actor: e.target.value || null })} className="flex-1 rounded-lg bg-paper px-2 py-1.5 text-ink">
              <option value="">Stays in the world</option>
              <option value="self">My avatar</option>
              {actors.filter((a) => a.id !== 'self' && a.id !== 'scene').map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <section className="flex flex-col gap-1.5">
            <h3 className={label}>Colour</h3>
            <div className="grid grid-cols-10 gap-1">
              {LIGHT_COLORS.map((colour) => (
                <button key={colour} type="button" aria-label={`Colour ${colour}`} aria-pressed={current.color.toLowerCase() === colour} onClick={() => update({ color: colour })}
                  className={`aspect-square rounded-md ${current.color.toLowerCase() === colour ? 'ring-2 ring-ink' : 'ring-1 ring-ink/15'}`} style={{ backgroundColor: colour }} />
              ))}
              <label className="relative aspect-square cursor-pointer overflow-hidden rounded-md ring-1 ring-ink/15" title="Any colour" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                <input type="color" aria-label="Any light colour" value={current.color} onChange={(e) => update({ color: e.target.value })} className="absolute inset-0 opacity-0" />
              </label>
            </div>
          </section>
          <Range name="Brightness" value={current.intensity} shown={(v) => `${Math.round(v)}`} min={0} max={200} step={1} onCommit={(v) => update({ intensity: v })} />
          <Range name="Beam" value={current.angle} shown={(v) => `${Math.round(v)}°`} min={5} max={85} step={1} onCommit={(v) => update({ angle: v })} />
          <Range name="Soft edge" value={current.softness} shown={(v) => v.toFixed(2)} min={0} max={1} step={0.05} onCommit={(v) => update({ softness: v })} />
          <Range name="Reach" value={current.distance} shown={(v) => `${Math.round(v)} m`} min={1} max={200} step={1} onCommit={(v) => update({ distance: v })} />
          <section className="flex flex-col gap-1.5">
            <h3 className={label}>{current.actor === null ? 'Where, in the world' : 'Where, from the actor’s feet'}</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {(['position', 'target'] as const).flatMap((key) => current[key].map((v, axis) => (
                <label key={`${key}${axis}`} className="flex flex-col gap-0.5 text-[10px] font-bold text-ink/55">{key === 'position' ? '' : 'Aim '}{'XYZ'[axis]}
                  <input key={`${current.id}${key}${axis}${v}`} type="number" step={0.1} defaultValue={v} aria-label={`${key === 'position' ? 'Light' : 'Aim'} ${'XYZ'[axis]}`}
                    onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n !== v) vec(key, axis, n); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="rounded-md bg-paper px-1.5 py-1 text-xs text-ink tabular-nums ring-1 ring-ink/10" />
                </label>
              )))}
            </div>
            {current.actor === null ? (
              <button type="button" aria-pressed={placing} onClick={() => { setPlacing(true); pickGround(rt, (spot) => { setPlacing(false); update({ position: [spot.x, current.position[1], spot.z] }); }, () => setPlacing(false)); }}
                className={`${chip(placing)} flex items-center justify-center gap-1.5`}><Crosshair className="size-3.5" aria-hidden />{placing ? 'Click the ground… (Esc)' : 'Place it in the view'}</button>
            ) : null}
          </section>
          {error ? <p role="alert" className="text-xs font-bold text-coral">{error}</p> : null}
          <button type="button" onClick={() => { const rest = lights.filter((l) => l.id !== current.id); pickedLight = rest[0]?.id ?? null; save(rest); }}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-coral/10 py-1.5 text-sm font-bold text-coral hover:bg-coral/20"><Trash2 className="size-4" aria-hidden />Remove light</button>
        </fieldset>
      ) : null}
    </div>
  );
}

/** Sky (WORLD-W3): presets keep the hour, sun path and wind; the cycle keeps the look. */
function SkyPart({ runtime }: { runtime: RefObject<GenvrRuntime | null> }) {
  const rt = runtime.current;
  if (!rt) return null;
  const sky = rt.world.environment.sky;
  const settings = readSkySettings(sky.params);
  const apply = (preset: typeof sky.preset, patch: Record<string, number | undefined>) => {
    const params: Record<string, unknown> = { ...sky.params, ...patch };
    for (const [key, value] of Object.entries(patch)) if (value === undefined) delete params[key];
    rt.applyCommand({ type: 'set_sky', params: { preset, ...(Object.keys(params).length ? { params } : {}) } });
  };
  const cycling = (settings.cycle ?? 0) > 0;
  return (
    <div className="flex flex-col gap-3">
      <Head Icon={Sun} title="Sky" sub={cycling ? `Day and night · ${settings.cycle} min a day` : settings.timeOfDay !== undefined ? hour(settings.timeOfDay) : 'Its own hour'} />
      <div role="radiogroup" aria-label="Sky look" className="grid grid-cols-5 gap-1">
        {CORE_SKIES.map((one) => {
          const Icon = ENVIRONMENT_ICONS[one.manifest.id] ?? Sun;
          return <button key={one.preset} type="button" role="radio" aria-checked={sky.preset === one.preset} onClick={() => apply(one.preset, {})} className={tile(sky.preset === one.preset)}><Icon className="size-4" aria-hidden /><span className="w-full truncate px-0.5 text-center">{one.manifest.name}</span></button>;
        })}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" role="switch" aria-checked={cycling} onClick={() => apply(sky.preset, { cycle: cycling ? undefined : DAY_LENGTHS[0] })} className={`${chip(cycling)} flex items-center gap-1.5`}><SunMoon className="size-3.5" aria-hidden />Day and night</button>
        {cycling ? (
          <select aria-label="Day length" value={settings.cycle} onChange={(e) => apply(sky.preset, { cycle: Number(e.target.value) })} className="flex-1 rounded-lg bg-paper px-2 py-1.5 text-xs font-bold">
            {[...new Set([...DAY_LENGTHS, settings.cycle!])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} minutes a day</option>)}
          </select>
        ) : null}
      </div>
      {!cycling ? (
        <Range name="Time of day" value={settings.timeOfDay ?? 12} shown={(v) => (settings.timeOfDay === undefined && v === 12 ? 'Its own' : hour(v))} min={0} max={24} step={0.25} onCommit={(v) => apply(sky.preset, { timeOfDay: v })} />
      ) : <p className="text-[11px] text-ink/55">The hour moves with the cycle; turn it off to fix an hour.</p>}
      <Range name="Sun path" value={settings.sunAzimuth ?? 0} shown={(v) => `${Math.round(v)}°`} min={-180} max={180} step={5} onCommit={(v) => apply(sky.preset, { sunAzimuth: v })} />
      <Range name="Wind from" value={settings.windDirection ?? 0} shown={(v) => `${compass(v)} · ${Math.round(v)}°`} min={0} max={355} step={5} onCommit={(v) => apply(sky.preset, { windDirection: v })} />
      <Range name="Wind speed" value={settings.windSpeed ?? 0} shown={(v) => `${v.toFixed(1)} m/s`} min={0} max={30} step={0.5} onCommit={(v) => apply(sky.preset, { windSpeed: v })} />
      <button type="button" onClick={() => apply(sky.preset, { timeOfDay: undefined, sunAzimuth: undefined, windDirection: undefined, windSpeed: undefined })} className={chip(false)}>Back to the sky’s own hour, sun and wind</button>
    </div>
  );
}

/** Weather and ground (WORLD-W4): presets keep their strength; ground rules say why they are missing. */
function WeatherPart({ runtime }: { runtime: RefObject<GenvrRuntime | null> }) {
  const rt = runtime.current;
  if (!rt) return null;
  const weather = rt.world.environment.weather;
  const style = rt.world.style;
  const strength = Number(weather.params?.strength ?? 1);
  return (
    <div className="flex flex-col gap-3">
      <Head Icon={CloudRain} title="Weather and ground" sub={CORE_WEATHER.find((w) => w.preset === weather.preset)?.manifest.name ?? weather.preset} />
      <div role="radiogroup" aria-label="Weather" className="grid grid-cols-3 gap-1">
        {CORE_WEATHER.map((one) => {
          const Icon = ENVIRONMENT_ICONS[one.manifest.id] ?? Sun;
          return <button key={one.preset} type="button" role="radio" aria-checked={weather.preset === one.preset} onClick={() => rt.applyCommand({ type: 'set_weather', params: { preset: one.preset, ...(weather.params && Object.keys(weather.params).length ? { params: weather.params } : {}) } })} className={tile(weather.preset === one.preset)}><Icon className="size-4" aria-hidden />{one.manifest.name}</button>;
        })}
      </div>
      <Range name="Strength" value={strength} shown={(v) => `${Math.round(v * 100)}%`} min={0.2} max={2} step={0.1} onCommit={(v) => rt.applyCommand({ type: 'set_weather', params: { preset: weather.preset, params: { ...weather.params, strength: v } } })} />
      <section className="flex flex-col gap-2 border-t border-ink/10 pt-3">
        <h3 className={label}>Ground rules</h3>
        {style.base === 'realistic' ? (
          <GroundRules snowLine={style.snowLine} autoRock={style.autoRock !== false} grass={style.grass ?? { on: true, density: 1 }} woods={style.woods ?? { on: true, density: 1 }}
            hasWorld={rt.world.terrain.world !== undefined} onChange={(change) => rt.applyCommand({ type: 'set_style', params: { ...style, ...change } })} />
        ) : <p className="text-xs text-ink/60">Grass, trees, rock and snow rules are for Realistic places. This place is {STYLE_NAMES[style.base] ?? style.base}.</p>}
      </section>
    </div>
  );
}

/** Water and sea (WORLD-W5). */
function WaterPart({ runtime }: { runtime: RefObject<GenvrRuntime | null> }) {
  const rt = runtime.current;
  if (!rt) return null;
  const { style, environment } = rt.world;
  const sea = environment.sea ?? null;
  const ocean = sea?.resourceId ? getOceanResource(sea.resourceId) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <Head Icon={Droplets} title="Water and sea" sub={sea ? `Sea at ${sea.level} m` : 'No sea'} />
      {style.base === 'realistic' ? (
        <>
          <WaterRules water={style.water ?? DEFAULT_WATER} sea={sea} lakes={environment.water.length}
            onWater={(water) => rt.applyCommand({ type: 'set_style', params: { ...style, water } })}
            onSea={(level) => rt.applyCommand({ type: 'set_sea', params: { level } })}
            onSwell={(direction) => {
              if (!sea) return;
              const swell = { ...sea.swell };
              if (direction === null) delete swell.direction; else swell.direction = direction;
              rt.applyCommand({ type: 'set_sea', params: { level: sea.level, swell: Object.keys(swell).length > 0 ? swell : null } });
            }} />
          {sea?.swell?.direction !== undefined && sea.swell.direction % 45 !== 0 ? <p className="text-[11px] text-ink/55">Waves come from a custom direction: {Math.round(sea.swell.direction)}°.</p> : null}
          {sea ? (
            <div className="grid grid-cols-2 gap-2">
              <Range name="Wave period" value={sea.swell?.period ?? 8} shown={(v) => `${v} s`} min={2} max={20} step={0.5} onCommit={(v) => rt.applyCommand({ type: 'set_sea', params: { level: sea.level, swell: { ...sea.swell, period: v } } })} />
              <Range name="Wave height" value={sea.swell?.height ?? 0.6} shown={(v) => `${v.toFixed(1)} m`} min={0.1} max={4} step={0.1} onCommit={(v) => rt.applyCommand({ type: 'set_sea', params: { level: sea.level, swell: { ...sea.swell, height: v } } })} />
            </div>
          ) : null}
          {ocean ? <div className="border-t border-ink/10 pt-3"><OceanResourceControls runtime={runtime} resource={ocean} /></div> : null}
        </>
      ) : <p className="text-xs text-ink/60">The sea and water looks are for Realistic places; this place has {environment.water.length} lakes or ponds (Build › Water draws them).</p>}
    </div>
  );
}

/** Style and place (WORLD-W6): style with reasons, start point, new land, size. */
function PlacePart({ runtime, onStyle, placeId }: { runtime: RefObject<GenvrRuntime | null>; onStyle?: (() => void) | undefined; placeId?: string | undefined }) {
  const [placing, setPlacing] = useState(false);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const rt = runtime.current;
  if (!rt) return null;
  const world = rt.world;
  const why = (style: string): string | null => {
    if (style === world.style.base) return null;
    if ((style === 'voxel') !== Boolean(world.voxels)) return style === 'voxel' ? 'Voxel needs a new block place.' : 'A block place stays Voxel.';
    if (world.terrain.world && style !== 'realistic') return 'This place has a starter world, which is Realistic.';
    const item = world.instances.find((i) => { const core = getCoreItem(i.itemId); return core && !core.manifest.styles.includes(style as never); });
    return item ? `${getCoreItem(item.itemId)?.manifest.name ?? 'An item'} does not have a ${STYLE_NAMES[style] ?? style} look.` : null;
  };
  const [sx, , sz] = world.spawn.position;
  const side = SIZE_TIERS[world.sizeTier].sideMeters;
  return (
    <div className="flex flex-col gap-3">
      <Head Icon={Flag} title="Style and place" sub={`${STYLE_NAMES[world.style.base] ?? world.style.base} · ${side} m`} />
      <section className="flex flex-col gap-1.5">
        <h3 className={label}>Style</h3>
        <div role="radiogroup" aria-label="Style" className="grid grid-cols-3 gap-1">
          {READY_STYLES.map((pack) => {
            const reason = why(pack.style);
            const Icon = ENVIRONMENT_ICONS[pack.manifest.id] ?? Palette;
            return <button key={pack.style} type="button" role="radio" aria-checked={world.style.base === pack.style} disabled={Boolean(reason)} title={reason ?? undefined}
              onClick={() => { rt.applyCommand({ type: 'set_style', params: { ...world.style, base: pack.style } }); onStyle?.(); }} className={`${tile(world.style.base === pack.style)} disabled:opacity-40`}><Icon className="size-4" aria-hidden />{STYLE_NAMES[pack.style] ?? pack.manifest.name}</button>;
          })}
        </div>
        {READY_STYLES.filter((p) => why(p.style)).map((p) => <p key={p.style} className="text-[11px] text-ink/55">{STYLE_NAMES[p.style] ?? p.style}: {why(p.style)}</p>)}
        {!READY_STYLES.some((p) => p.style === world.style.base) ? <p className="text-[11px] text-ink/55">This place is {STYLE_NAMES[world.style.base] ?? world.style.base}.</p> : null}
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={label}>Start point</h3>
        <p className="text-xs tabular-nums">Players start at ({Math.round(sx * 10) / 10}, {Math.round(sz * 10) / 10}).</p>
        <button type="button" aria-pressed={placing} onClick={() => { setPlacing(true); pickGround(rt, (spot) => { setPlacing(false); rt.applyCommand({ type: 'set_spawn', params: { spawn: { ...world.spawn, position: [spot.x, rt.terrainHeightAt(spot.x, spot.z) + 1, spot.z] } } }); }, () => setPlacing(false)); }}
          className={`${chip(placing)} flex items-center justify-center gap-1.5`}><MapPin className="size-3.5" aria-hidden />{placing ? 'Click the ground… (Esc)' : 'Set it in the view'}</button>
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={label}>New land</h3>
        {world.style.base === 'realistic' && !world.voxels ? (
          <>
            <div className="flex flex-wrap gap-1">
              {(['valley', 'island', 'plain', 'mountains'] as const).map((kind) => <button key={kind} type="button" onClick={() => setConfirm(kind)} className={`${chip(confirm === kind)} capitalize`}><Mountain className="mr-1 inline size-3" aria-hidden />{kind}</button>)}
            </div>
            {confirm ? (
              <div role="alertdialog" aria-label="Replace the land" className="flex flex-col gap-2 rounded-lg bg-paper p-2 text-xs">
                <p>Replace the ground with a new {confirm}? Items stay; one Undo takes it back. Agents use make_world.</p>
                <div className="flex gap-1">
                  <button type="button" onClick={() => { const answer = runStudioTool(rt, placeId ?? world.experienceId, 'make_world', { kind: confirm }); if (!answer.ok) setNote(answer.result); setConfirm(null); }} className={chip(true)}>Replace the land</button>
                  <button type="button" onClick={() => setConfirm(null)} className={chip(false)}>Cancel</button>
                </div>
              </div>
            ) : null}
          </>
        ) : <p className="text-xs text-ink/60">New land (valley, island, plain, mountains) is for Realistic places.</p>}
        {note ? <p role="alert" className="text-xs font-bold text-coral">{note}</p> : null}
      </section>
      <section className="flex flex-col gap-1">
        <h3 className={label}>Size</h3>
        <p className="text-xs"><b className="capitalize">{world.sizeTier}</b> · {side} × {side} m · up to {SIZE_TIERS[world.sizeTier].maxPlayers} players</p>
        <p className="text-[11px] text-ink/55">The owner changes the size; phone screen, view and moves are in Place settings.</p>
      </section>
    </div>
  );
}

/** The whole place in one look (WORLD-W1 / W7): every line opens its part. */
export function WorldSummary({ runtime }: { runtime: RefObject<GenvrRuntime | null> }) {
  const world = runtime.current?.world;
  if (!world) return null;
  const sky = readSkySettings(world.environment.sky.params);
  const lights = world.environment.lighting ?? [];
  const rows: Array<[string, string, WorldPart]> = [
    ['Style', STYLE_NAMES[world.style.base] ?? world.style.base, 'place'],
    ['Sky', `${CORE_SKIES.find((s) => s.preset === world.environment.sky.preset)?.manifest.name ?? world.environment.sky.preset}${sky.cycle ? ` · cycle ${sky.cycle} min` : sky.timeOfDay !== undefined ? ` · ${hour(sky.timeOfDay)}` : ''}`, 'sky'],
    ['Weather', CORE_WEATHER.find((w) => w.preset === world.environment.weather.preset)?.manifest.name ?? world.environment.weather.preset, 'weather'],
    ['Sea', world.environment.sea ? `${world.environment.sea.level} m` : 'None', 'water'],
    ['Lights', lights.length ? lights.map((l) => l.name).join(', ') : 'None', 'lighting'],
    ['Size', `${world.sizeTier} · ${SIZE_TIERS[world.sizeTier].sideMeters} m`, 'place'],
    ['Start point', `(${Math.round(world.spawn.position[0])}, ${Math.round(world.spawn.position[2])})`, 'place'],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-paper"><Globe className="size-4" aria-hidden /></span><span><b className="block text-sm">The world</b><span className="block text-[11px] text-ink/55">Click a line to change it</span></span></div>
      <div className="flex flex-col">
        {rows.map(([key, value, part]) => (
          <button key={key} type="button" onClick={() => setWorldPart(part)} className="flex items-center gap-3 rounded-md px-1.5 py-1.5 text-left text-xs hover:bg-ink/5">
            <span className="w-20 shrink-0 text-ink/55">{key}</span><b className="min-w-0 flex-1 truncate">{value.charAt(0).toUpperCase() + value.slice(1)}</b><ChevronRight className="size-3 text-ink/40" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The right dock on World (WORLD-W1–W6): the picked part, else the World summary — never empty (W7). */
export function WorldSidePanel({ runtime, busy = false, actors = [], message = () => {}, onStyle, fallback, placeId }: {
  runtime: RefObject<GenvrRuntime | null>; placeId?: string | undefined; busy?: boolean; actors?: Array<{ id: string; label: string }>; message?: (text: string) => void; onStyle?: () => void;
  /** Shown instead of the summary when something is selected (the selection's Properties). */
  fallback?: ReactNode;
}) {
  useWorldVersion(runtime);
  const part = useWorldPart();
  return (
    <div className="flex flex-col gap-3 px-3 pb-3 text-ink">
      {part === 'lighting' ? <LightingPart runtime={runtime} busy={busy} actors={actors} message={message} />
        : part === 'sky' ? <SkyPart runtime={runtime} />
          : part === 'weather' ? <WeatherPart runtime={runtime} />
            : part === 'water' ? <WaterPart runtime={runtime} />
              : part === 'place' ? <PlacePart runtime={runtime} onStyle={onStyle} placeId={placeId} />
                : fallback ?? <WorldSummary runtime={runtime} />}
    </div>
  );
}
