'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ArrowRight, Bone, Car, Check, Copy, Dices, Eye, EyeOff, Footprints, Ghost, Play, Plus, RotateCcw, Ruler, Scale, Square, Star,
  StepBack, StepForward, TrafficCone, Trash2, X,
} from 'lucide-react';
import { LAB_FOLLOW_AVATAR, LAB_LATER_KINDS, LAB_OBSTACLE_KINDS, type LabObstacle, type LabObstacleKind, type LabOverlay, type LabRun } from '@genvr/contracts';
import { LAB_MOVES, PERSON, type LabController, type LabSpeed } from '../../../lib/motion-lab';
import { measure } from './lab-stage';
import { MyMotions, ShareMotionDialog } from './lab-share';

/**
 * The Lab area's panels (boards M1, M2, M3): course list and add tiles on the left; the chosen obstacle's sizes, the
 * seed and the traffic, or the run settings, score board and versions on the right; the run bar over the view; the
 * run timeline under it. Every control here has a `motion_lab` operation with the same result.
 */
const label = 'text-[11px] font-black tracking-wide text-ink/50 uppercase';
const row = 'flex h-9 items-center gap-2 rounded-lg px-2 text-left text-xs';
const KIND_NAMES: Record<LabObstacleKind, string> = { step: 'Step', ramp: 'Ramp', gap: 'Gap', low_wall: 'Low wall', window: 'Window' };
const LATER_NAMES: Record<(typeof LAB_LATER_KINDS)[number], string> = { beam: 'Beam', door: 'Door', uneven: 'Uneven ground', moving_platform: 'Moving platform' };

function useLab(lab: LabController) { useSyncExternalStore(lab.subscribe, lab.getVersion, lab.getVersion); return lab; }
function tryRun(fn: () => unknown, setError: (e: string | null) => void) { try { fn(); setError(null); } catch (e) { setError(e instanceof Error ? e.message.split('\n')[0]! : String(e)); } }

function NumberField({ name, value, unit, step = 0.05, min, max, onChange }: { name: string; value: number; unit?: string; step?: number; min?: number; max?: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-ink/10 bg-paper px-2 text-xs">
      <span className="shrink-0 text-[10px] font-black uppercase text-ink/50">{name}</span>
      <input type="number" inputMode="decimal" step={step} min={min} max={max} value={draft} className="min-w-0 flex-1 bg-transparent text-right font-mono tabular-nums outline-none"
        onChange={(e) => { setDraft(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(v) && v !== value) onChange(v); }}
        onBlur={() => { if (!Number.isFinite(Number(draft)) || draft.trim() === '') setDraft(String(value)); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      {unit ? <span className="shrink-0 text-[10px] text-ink/50">{unit}</span> : null}
    </label>
  );
}

function Problem({ text }: { text: string | null }) {
  return text ? <p role="alert" className="rounded-lg bg-coral/15 px-2 py-1.5 text-xs font-semibold text-coral">{text}</p> : null;
}

// ---------------------------------------------------------------- left: course (M1, M2)
export function LabLeft({ lab }: { lab: LabController }) {
  useLab(lab);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const { course } = lab.data;
  const value = (o: LabObstacle) => measure(o).replace(/^(step|ramp|gap|low wall|window) /, '');
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-3" onClick={() => setMenu(null)}>
      <div className="flex items-center gap-1"><span className={`${label} flex-1`}>Course · seed {course.seed}</span>
        <button type="button" className="rounded p-1.5 hover:bg-ink/10" title="New course from the seed (right panel)" aria-label="New course from a seed" onClick={() => lab.select(null)}><Dices className="size-4" /></button></div>
      <ul className="flex flex-col gap-0.5" aria-label="Obstacles">
        {course.obstacles.map((o) => (
          <li key={o.id}>
            <div className={`${row} ${lab.view.selected === o.id ? 'bg-ink/10 ring-1 ring-ink' : 'hover:bg-ink/5'}`} onContextMenu={(e) => { e.preventDefault(); setMenu({ id: o.id, x: e.clientX, y: e.clientY }); }}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => lab.select(o.id)} aria-pressed={lab.view.selected === o.id}>
                <b className="truncate">{KIND_NAMES[o.kind]}</b><span className="ml-auto truncate font-mono text-[11px] text-ink/50">{value(o)}</span>
              </button>
              <button type="button" className="rounded p-1 hover:bg-ink/10" title={o.hidden ? 'Show' : 'Hide'} aria-label={`${o.hidden ? 'Show' : 'Hide'} ${o.id}`} onClick={() => tryRun(() => lab.setObstacle(o.id, { hidden: !o.hidden }), setError)}>
                {o.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
            </div>
          </li>
        ))}
      </ul>
      <span className={label}>Street</span>
      <div className="flex flex-col gap-0.5 text-xs">
        <button type="button" className={`${row} hover:bg-ink/5`} onClick={() => lab.select(null)}><TrafficCone className="size-3.5" /><b className="flex-1">{course.street ? `Street · ${course.street.lanes} lanes` : 'No street'}</b><span className="font-mono text-[11px] text-ink/50">{course.street ? `light ${course.street.light.cycle_s} s` : ''}</span></button>
        {course.cars.map((car) => <button key={car.id} type="button" className={`${row} hover:bg-ink/5`} onClick={() => lab.select(null)}><Car className="size-3.5" /><b className="flex-1">{car.id}</b><span className="font-mono text-[11px] text-ink/50">{car.speed} m/s{car.runs_red ? ' · runs red' : ''}</span></button>)}
      </div>
      <span className={label}>Add an obstacle</span>
      <div className="grid grid-cols-3 gap-1">
        {LAB_OBSTACLE_KINDS.map((kind) => (
          <button key={kind} type="button" className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl bg-paper text-[11px] font-bold hover:bg-ink/10" onClick={() => tryRun(() => lab.addObstacle(kind), setError)} title={`Add a ${KIND_NAMES[kind].toLowerCase()}`}>
            <Plus className="size-3.5" />{KIND_NAMES[kind]}</button>
        ))}
        {LAB_LATER_KINDS.map((kind) => <button key={kind} type="button" disabled className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl bg-paper text-[11px] font-bold opacity-40" title={`${LATER_NAMES[kind]} — later`}><Plus className="size-3.5" />{LATER_NAMES[kind].split(' ')[0]}</button>)}
      </div>
      <Problem text={error} />
      {menu ? (
        <div role="menu" className="fixed z-50 min-w-48 rounded-xl border border-ink/10 bg-surface p-1 text-xs shadow-xl" style={{ left: menu.x, top: menu.y }}>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-ink/10" onClick={() => lab.select(menu.id)}>Settings</button>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-ink/10" onClick={() => tryRun(() => lab.duplicateObstacle(menu.id), setError)}><Copy className="size-3.5" />Duplicate</button>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-coral hover:bg-ink/10" onClick={() => tryRun(() => lab.removeObstacle(menu.id), setError)}><Trash2 className="size-3.5" />Remove</button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- right: obstacle / course / run (M2, M3)
const SIZE_FIELDS: Record<LabObstacleKind, Array<[key: string, name: string, step?: number]>> = {
  step: [['height', 'Height'], ['depth', 'Depth'], ['width', 'Width', 0.1]],
  ramp: [['rise', 'Rise'], ['length', 'Length', 0.1], ['top', 'Flat top', 0.1], ['width', 'Width', 0.1]],
  gap: [['width', 'Gap'], ['height', 'Height'], ['landing', 'Landing ±'], ['landing_depth', 'Landing depth', 0.1], ['lane', 'Lane width', 0.1]],
  low_wall: [['height', 'Height'], ['thickness', 'Thickness'], ['width', 'Width', 0.1]],
  window: [['sill', 'Sill'], ['opening_width', 'Opening width'], ['opening_height', 'Opening height'], ['wall_height', 'Wall height', 0.1], ['wall_width', 'Wall width', 0.1], ['thickness', 'Thickness']],
};

export function LabRight({ lab }: { lab: LabController }) {
  useLab(lab);
  const selected = lab.data.course.obstacles.find((o) => o.id === lab.view.selected);
  // Board M14: the share dialog opens after Save as version, from My motions, or to review an agent's prepared share.
  const [sharing, setSharing] = useState<string | null>(null);
  return <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">{selected ? <ObstacleProperties lab={lab} o={selected} /> : <><RunPanel lab={lab} share={setSharing} /><MyMotions lab={lab} open={setSharing} /><CoursePanel lab={lab} /></>}
    {sharing && lab.data.versions.some((v) => v.id === sharing) ? <ShareMotionDialog key={sharing} lab={lab} version={sharing} close={() => setSharing(null)} /> : null}</div>;
}

function ObstacleProperties({ lab, o }: { lab: LabController; o: LabObstacle }) {
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Record<string, unknown>) => tryRun(() => lab.setObstacle(o.id, patch), setError);
  const record = o as unknown as Record<string, number>;
  return (
    <section aria-label={`${KIND_NAMES[o.kind]} settings`} className="flex flex-col gap-2">
      <div className="flex items-center gap-2"><div className="flex-1"><div className={label}>Obstacle</div><b className="text-sm">{KIND_NAMES[o.kind]} · {o.id}</b></div>
        <button type="button" className="rounded p-1.5 hover:bg-ink/10" title="Duplicate" aria-label="Duplicate" onClick={() => tryRun(() => lab.duplicateObstacle(o.id), setError)}><Copy className="size-4" /></button>
        <button type="button" className="rounded p-1.5 text-coral hover:bg-ink/10" title="Remove" aria-label="Remove" onClick={() => tryRun(() => lab.removeObstacle(o.id), setError)}><Trash2 className="size-4" /></button>
        <button type="button" className="rounded p-1.5 hover:bg-ink/10" title="Close (Esc)" aria-label="Close" onClick={() => lab.select(null)}><X className="size-4" /></button></div>
      <p className="font-mono text-xs text-ink/60">{measure(o)}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {SIZE_FIELDS[o.kind].map(([key, name, step]) => <NumberField key={key} name={name} unit="m" step={step ?? 0.05} value={record[key]!} onChange={(v) => set({ [key]: v })} />)}
        <NumberField name="Z" unit="m" step={0.1} value={o.z} onChange={(v) => set({ z: v })} />
        <NumberField name="X" unit="m" step={0.1} value={o.x} onChange={(v) => set({ x: v })} />
      </div>
      <Problem text={error} />
    </section>
  );
}

function CoursePanel({ lab }: { lab: LabController }) {
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(lab.data.course.seed), [count, setCount] = useState(5), [hard, setHard] = useState(2);
  const { course } = lab.data;
  const st = course.street, car = course.cars[0];
  return (
    <section aria-label="Course and traffic" className="flex flex-col gap-2 border-t border-ink/10 pt-3">
      <span className={label}>Course from a seed</span>
      <div className="grid grid-cols-3 gap-1.5">
        <NumberField name="Seed" step={1} min={0} value={seed} onChange={(v) => setSeed(Math.max(0, Math.round(v)))} />
        <NumberField name="Obst." step={1} min={1} max={12} value={count} onChange={(v) => setCount(Math.round(v))} />
        <NumberField name="Hard" step={1} min={1} max={5} value={hard} onChange={(v) => setHard(Math.round(v))} />
      </div>
      <div className="flex gap-1.5">
        <button type="button" className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink/15 text-xs font-bold hover:bg-ink/5" onClick={() => tryRun(() => lab.fromSeed(seed, count, hard, Boolean(st)), setError)}><Dices className="size-3.5" />New course</button>
        <button type="button" className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-ink/15 px-2 text-xs font-bold hover:bg-ink/5" title="A random seed" onClick={() => setSeed(Math.floor(Math.random() * 100000))}>Random seed</button>
      </div>
      <span className="text-[11px] text-ink/50">Same seed = same course, for people, MCP and the lab manager.</span>
      <span className={label}>Traffic</span>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(st)} onChange={(e) => tryRun(() => lab.setTraffic(e.target.checked ? { z: Math.ceil(course.finish_z - 10) } : null, e.target.checked ? course.cars : []), setError)} />Street with a crossing</label>
      {st ? <div className="grid grid-cols-2 gap-1.5">
        <NumberField name="Lanes" step={1} min={1} max={4} value={st.lanes} onChange={(v) => tryRun(() => lab.setTraffic({ ...st, lanes: Math.round(v) }, course.cars.map((c) => ({ ...c, lane: Math.min(c.lane, Math.round(v) - 1) }))), setError)} />
        <NumberField name="Z" unit="m" step={0.5} value={st.z} onChange={(v) => tryRun(() => lab.setTraffic({ ...st, z: v }), setError)} />
        <NumberField name="Light" unit="s" step={1} value={st.light.cycle_s} onChange={(v) => tryRun(() => lab.setTraffic({ ...st, light: { ...st.light, cycle_s: v } }), setError)} />
        <NumberField name="Red" unit="s" step={1} value={st.light.red_s} onChange={(v) => tryRun(() => lab.setTraffic({ ...st, light: { ...st.light, red_s: v } }), setError)} />
      </div> : null}
      {st && car ? <div className="grid grid-cols-2 gap-1.5">
        <NumberField name="Car speed" unit="m/s" step={0.5} value={car.speed} onChange={(v) => tryRun(() => lab.setTraffic(undefined, course.cars.map((c, i) => (i ? c : { ...c, speed: v }))), setError)} />
        <NumberField name="At crossing" unit="s" step={0.5} value={car.offset_s} onChange={(v) => tryRun(() => lab.setTraffic(undefined, course.cars.map((c, i) => (i ? c : { ...c, offset_s: v }))), setError)} />
        <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={car.runs_red} onChange={(e) => tryRun(() => lab.setTraffic(undefined, course.cars.map((c, i) => (i ? c : { ...c, runs_red: e.target.checked }))), setError)} />Edge case: the car runs the red light</label>
      </div> : null}
      {st && !car ? <button type="button" className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-ink/15 text-xs font-bold hover:bg-ink/5" onClick={() => tryRun(() => lab.setTraffic(undefined, [{ id: 'car-1', lane: 0 }]), setError)}><Car className="size-3.5" />Add a box car</button> : null}
      <NumberField name="Finish" unit="m" step={1} value={course.finish_z} onChange={(v) => tryRun(() => lab.setCourse({ ...course, finish_z: v }), setError)} />
      <Problem text={error} />
    </section>
  );
}

const SCORE_ROWS: Array<[key: keyof LabRun['score'], name: string, hint: string]> = [
  ['foot_slide_cm', 'Foot slide', 'Planted feet moving over the ground, both feet, whole run'],
  ['penetration_cm', 'Penetration', 'Deepest a foot went into the floor or an obstacle'],
  ['fell', 'Fall', 'Fell or tripped'],
  ['car_hit', 'Hit by car', 'Touched a car'],
  ['time_s', 'Time', 'Start to the end of the run'],
  ['smoothness', 'Smoothness', '1 = no jerk'],
];
function show(key: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (key === 'foot_slide_cm' || key === 'penetration_cm') return `${v} cm`;
  if (key === 'time_s') return `${v} s`;
  return String(v);
}
function dot(key: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'bg-coral' : 'bg-emerald-500';
  if (key === 'foot_slide_cm') return Number(v) > 5 ? 'bg-amber-500' : 'bg-emerald-500';
  if (key === 'penetration_cm') return Number(v) > 1 ? 'bg-coral' : 'bg-emerald-500';
  if (key === 'smoothness') return Number(v) < 0.5 ? 'bg-amber-500' : 'bg-emerald-500';
  return 'bg-ink/30';
}

function RunPanel({ lab, share }: { lab: LabController; share: (version: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const s = lab.data.settings;
  const set = (patch: Record<string, unknown>) => tryRun(() => lab.setSettings(patch), setError);
  const shown = lab.view.run ? lab.data.runs.find((r) => r.id === lab.view.run!.id) : undefined;
  const best = lab.best();
  const pending = lab.data.best_pending;
  // Versions and best compare one character's runs only (board M17).
  const versions = lab.data.versions.filter((v) => v.motion === s.motion && v.settings.character === lab.character.id);
  const [allRuns, setAllRuns] = useState(false);
  const runs = allRuns ? lab.data.runs : lab.data.runs.filter((r) => r.settings.character === lab.character.id);
  const nameOf = (id: string) => lab.characters.find((c) => c.id === id)?.name ?? 'removed character';
  return (
    <section aria-label="Run" className="flex flex-col gap-2">
      <div className={label}>Motion</div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex h-8 items-center gap-1.5 rounded-lg border border-ink/10 bg-paper px-2 text-xs"><span className="text-[10px] font-black uppercase text-ink/50">Who</span>
          <select aria-label="Who runs" className="min-w-0 flex-1 truncate bg-transparent font-semibold outline-none" value={lab.missingCharacter ? LAB_FOLLOW_AVATAR : lab.data.who} onChange={(e) => tryRun(() => lab.setWho(e.target.value), setError)}>
            <option value={LAB_FOLLOW_AVATAR}>Follow the Avatar tab ({lab.avatarCharacter?.name ?? 'Standard robot'})</option>
            <optgroup label="Lab">{lab.characters.filter((c) => c.source === 'lab').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            {lab.characters.some((c) => c.source === 'mine') ? <optgroup label="My characters · private">{lab.characters.filter((c) => c.source === 'mine').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null}
          </select></label>
        <label className="flex h-8 items-center gap-1.5 rounded-lg border border-ink/10 bg-paper px-2 text-xs"><span className="text-[10px] font-black uppercase text-ink/50">Move</span>
          <select className="min-w-0 flex-1 bg-transparent font-semibold outline-none" value={s.motion} onChange={(e) => set({ motion: e.target.value })}>{LAB_MOVES.map((m) => <option key={m}>{m}</option>)}</select></label>
        <NumberField name="Speed" unit="m/s" step={0.1} value={s.speed} onChange={(v) => set({ speed: v })} />
        <NumberField name="Stride" unit="m" step={0.02} value={s.stride} onChange={(v) => set({ stride: v })} />
        <NumberField name="Step h" unit="m" step={0.02} value={s.step_height} onChange={(v) => set({ step_height: v })} />
        <NumberField name="Jump t" unit="ms" step={10} value={s.jump_timing_ms} onChange={(v) => set({ jump_timing_ms: Math.round(v) })} />
        <NumberField name="Blend" unit="s" step={0.05} value={s.blend_s} onChange={(v) => set({ blend_s: v })} />
        <NumberField name="Lean" unit="°" step={1} value={s.lean_deg} onChange={(v) => set({ lean_deg: v })} />
      </div>
      {lab.missingCharacter ? <p role="status" className="text-[11px] text-coral">The character picked here is no longer in My characters: the Standard robot runs meanwhile.</p>
        : lab.data.who !== LAB_FOLLOW_AVATAR ? <p className="text-[11px] text-ink/50">Picked in the Lab · <button type="button" className="underline" onClick={() => tryRun(() => lab.setWho(LAB_FOLLOW_AVATAR), setError)}>Follow the Avatar tab</button></p>
        : <p className="text-[11px] text-ink/50">Follows the Avatar tab.</p>}
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={s.wait_for_green} onChange={(e) => set({ wait_for_green: e.target.checked })} />Waits for green at the crossing</label>
      <button type="button" className="flex h-9 items-center justify-center gap-2 rounded-lg bg-ink text-sm font-bold text-on-brand" onClick={() => tryRun(() => lab.run({}, PERSON), setError)}><Play className="size-4" />Run<kbd className="font-mono text-[10px] opacity-70">R</kbd></button>
      <Problem text={error} />
      <div className="mt-1 grid grid-cols-[1fr_64px_64px_10px] gap-1.5"><span className={label}>Score</span><span className={label}>{shown?.id ?? '—'}</span><span className={`${label} !text-cyan-600`}>{best ? `best ${best.id.replace(/^.*-v/, 'v')}` : 'best —'}</span><span /></div>
      {SCORE_ROWS.map(([key, name, hint]) => (
        <div key={key} title={hint} className="grid h-7 grid-cols-[1fr_64px_64px_10px] items-center gap-1.5 border-b border-ink/5 text-xs">
          <span>{name}</span><b className="font-mono tabular-nums">{shown ? show(key, shown.score[key]) : '—'}</b><span className="font-mono tabular-nums text-cyan-600">{best ? show(key, best.score[key]) : '—'}</span>
          <span className={`size-2 rounded-full ${shown ? dot(key, shown.score[key]) : 'bg-ink/20'}`} />
        </div>
      ))}
      <div className="flex items-center gap-2"><b className="font-mono text-2xl tabular-nums">{shown?.score.total ?? '—'}</b><span className="text-[11px] leading-tight text-ink/50">total / 100{best ? <><br />best is {best.score.total}</> : null}</span>
        {shown && !shown.score.finished ? <span className="ml-auto rounded-full bg-coral/15 px-2 py-0.5 text-[11px] font-bold text-coral">{shown.events.at(-1)?.label}</span> : null}</div>
      <div className="mt-2 flex items-center gap-2"><span className={`${label} flex-1`}>Versions · {s.motion}</span>
        <button type="button" disabled={!shown} className="flex h-7 items-center gap-1 rounded-lg border border-ink/15 px-2 text-xs font-bold hover:bg-ink/5 disabled:opacity-40" onClick={() => tryRun(() => share(lab.saveVersion(shown?.id, '', PERSON).id), setError)}><Star className="size-3.5" />Save as version</button></div>
      {pending ? (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-amber-500/15 px-2 py-1.5 text-xs">
          <span className="flex-1">{pending.by} asks to make <b>{pending.version}</b> the best.</span>
          <button type="button" className="flex items-center gap-1 rounded bg-ink px-2 py-1 font-bold text-on-brand" onClick={() => lab.confirmPendingBest()}><Check className="size-3.5" />Make best</button>
          <button type="button" className="rounded px-2 py-1 font-bold hover:bg-ink/10" onClick={() => lab.rejectPendingBest()}>No</button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-0.5" aria-label="Versions">
        {versions.length === 0 ? <li className="text-xs text-ink/50">No versions yet: run, then Save as version.</li> : null}
        {[...versions].reverse().map((v) => (
          <li key={v.id} className={`flex h-9 items-center gap-2 rounded-lg px-2 text-xs ${v.best ? 'bg-emerald-500/10' : 'hover:bg-ink/5'}`}>
            <span className="rounded bg-ink/10 px-1.5 py-0.5 font-bold">v{v.n}</span>
            <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold" title="Show this version's run" onClick={() => tryRun(() => lab.showRun(v.run), setError)}>{v.note || `${v.settings.speed} m/s · stride ${v.settings.stride}`}{v.best ? ' · best' : ''}{v.by === 'agent' ? ' · agent' : ''}</button>
            <b className="font-mono tabular-nums">{v.score.total}</b>
            <button type="button" className="rounded p-1 hover:bg-ink/10" title="Make best" aria-label={`Make ${v.id} the best`} onClick={() => tryRun(() => lab.saveBest(v.id, PERSON), setError)}><Star className={`size-3.5 ${v.best ? 'fill-current text-amber-500' : ''}`} /></button>
            <button type="button" className="rounded p-1 hover:bg-ink/10" title="Roll back: use these settings" aria-label={`Roll back to ${v.id}`} onClick={() => tryRun(() => lab.rollback(v.id), setError)}><RotateCcw className="size-3.5" /></button>
            <button type="button" className="rounded p-1 text-coral hover:bg-ink/10" title="Delete" aria-label={`Delete ${v.id}`} onClick={() => { if (window.confirm(`Delete ${v.id}?`)) tryRun(() => lab.deleteVersion(v.id, PERSON), setError); }}><Trash2 className="size-3.5" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-1.5"><span className={`${label} flex-1`}>Last runs · {lab.data.runs.length} of 20</span>
        {([['This character', false], ['All characters', true]] as const).map(([name, all]) => (
          <button key={name} type="button" aria-pressed={allRuns === all} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${allRuns === all ? 'bg-ink text-on-brand' : 'bg-ink/5 hover:bg-ink/10'}`} onClick={() => setAllRuns(all)}>{name}</button>
        ))}</div>
      <ul className="flex flex-col gap-0.5" aria-label="Last runs">
        {runs.length === 0 ? <li className="text-xs text-ink/50">No runs with {lab.character.name} yet.</li> : null}
        {[...runs].reverse().slice(0, 8).map((r) => (
          <li key={r.id}><button type="button" className={`${row} w-full ${lab.view.run?.id === r.id ? 'bg-ink/10' : 'hover:bg-ink/5'}`} onClick={() => tryRun(() => lab.showRun(r.id), setError)}>
            <span className="w-12 font-mono text-[11px] text-ink/50">{r.id}</span><span className="flex-1 truncate">{allRuns ? `${nameOf(r.settings.character)} · ` : ''}{r.events.at(-1)?.label}</span><b className="font-mono">{r.score.total}</b>
            <span className={`size-2 rounded-full ${r.score.finished ? 'bg-emerald-500' : 'bg-coral'}`} /></button></li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- run bar over the view (M1)
const OVERLAY_BUTTONS: Array<[LabOverlay, string, string, ReactNode]> = [
  ['skeleton', 'Skeleton', 'k', <Bone key="b" className="size-4" />],
  ['feet', 'Feet (green planted, red sliding)', 'f', <Footprints key="f" className="size-4" />],
  ['balance', 'Balance point', 'b', <Scale key="s" className="size-4" />],
  ['speed', 'Speed arrow', 'v', <ArrowRight key="a" className="size-4" />],
  ['ghost', 'Ghost of the best version', 'g', <Ghost key="g" className="size-4" />],
  ['measures', 'Measures', 'm', <Ruler key="r" className="size-4" />],
];
const SPEEDS: Array<[LabSpeed, string]> = [[0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×']];

export function LabRunBar({ lab }: { lab: LabController }) {
  useLab(lab);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const overlay = OVERLAY_BUTTONS.find(([, , k]) => k === key);
      if (key === 'r') { event.preventDefault(); tryRun(() => lab.run({}, PERSON), setError); }
      else if (key === ' ') { event.preventDefault(); lab.setPlaying(!lab.view.playing); }
      else if (key === ',') { event.preventDefault(); lab.step(-1); }
      else if (key === '.') { event.preventDefault(); lab.step(1); }
      else if (key === 'escape') lab.select(null);
      else if (overlay) { event.preventDefault(); lab.toggleOverlay(overlay[0]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lab]);
  const on = lab.view.overlays;
  return (
    <div role="toolbar" aria-label="Run bar" className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-center gap-1 border-b border-ink/10 bg-surface/95 px-2 py-1 text-xs">
      <button type="button" className="flex h-7 items-center gap-1.5 rounded-lg bg-ink px-2.5 font-bold text-on-brand" onClick={() => tryRun(() => lab.run({}, PERSON), setError)} title="Run the motion through the course once (R)"><Play className="size-3.5" />Run<kbd className="font-mono text-[10px] opacity-70">R</kbd></button>
      <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10 disabled:opacity-40" disabled={!lab.view.run} title={lab.view.playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={lab.view.playing ? 'Pause' : 'Play'} onClick={() => lab.setPlaying(!lab.view.playing)}>{lab.view.playing ? <Square className="size-3.5" /> : <Play className="size-3.5" />}</button>
      <span className="mx-1 h-5 w-px bg-ink/15" />
      {OVERLAY_BUTTONS.map(([id, name, key, icon]) => (
        <button key={id} type="button" aria-pressed={on.includes(id)} title={`${name} (${key.toUpperCase()})`} aria-label={name} onClick={() => lab.toggleOverlay(id)}
          className={`rounded-lg p-1.5 ${on.includes(id) ? 'bg-ink/15 text-ink ring-1 ring-ink/30' : 'text-ink/55 hover:bg-ink/10'}`}>{icon}</button>
      ))}
      <span className="mx-1 h-5 w-px bg-ink/15" />
      <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10" title="Previous frame (,)" aria-label="Previous frame" onClick={() => lab.step(-1)}><StepBack className="size-3.5" /></button>
      <div role="group" aria-label="Play speed" className="flex rounded-lg border border-ink/10 p-0.5">
        {SPEEDS.map(([v, name]) => <button key={v} type="button" aria-pressed={lab.view.speed === v} onClick={() => lab.setSpeed(v)} className={`rounded-md px-2 py-0.5 font-bold ${lab.view.speed === v ? 'bg-ink text-on-brand' : 'text-ink/70 hover:bg-ink/10'}`}>{name}</button>)}
      </div>
      <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10" title="Next frame (.)" aria-label="Next frame" onClick={() => lab.step(1)}><StepForward className="size-3.5" /></button>
      <span className="ml-1 rounded-lg border border-ink/10 px-2 py-1 font-mono tabular-nums" title="Same seed, same run">seed {lab.data.course.seed} · {lab.view.t.toFixed(2)} s</span>
      {error ? <span role="alert" className="ml-2 font-semibold text-coral">{error}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- run timeline under the view (M1, M3)
const EVENT_TAGS: Record<string, string> = { step: 'step', ramp: 'ramp', gap_jump: 'jump', land: 'land', vault: 'wall', window: 'window', wait: 'wait', crossing: 'cross', car_hit: 'car!', fall: 'fall!', slide: 'slide', blocked: 'blocked', finish: 'finish' };

export function LabRunStrip({ lab }: { lab: LabController }) {
  useLab(lab);
  const shown = lab.view.run;
  const run = shown ? lab.data.runs.find((r) => r.id === shown.id) : undefined;
  const frames = shown?.result.frames ?? [];
  const end = Math.max(0.1, lab.duration());
  const pct = (t: number) => `${(t / end) * 100}%`;
  const spans = (foot: 0 | 1) => {
    const out: Array<{ a: number; b: number; slide: boolean }> = [];
    let start = -1, slid = false;
    frames.forEach((f, i) => {
      const p = f.feet[foot]!, prev = frames[i - 1]?.feet[foot];
      if (p.planted && start < 0) { start = f.t; slid = false; }
      if (p.planted && prev?.planted && Math.hypot(p.z - prev.z, p.x - prev.x) > 0.002) slid = true;
      if ((!p.planted || i === frames.length - 1) && start >= 0) { out.push({ a: start, b: f.t, slide: slid }); start = -1; }
    });
    return out;
  };
  const best = lab.view.ghost;
  const speedPath = frames.length ? frames.filter((_, i) => i % 6 === 0).map((f) => `${(f.t / end) * 1000},${40 - Math.min(38, f.speed * 9)}`).join(' ') : '';
  const lanes: Array<[string, ReactNode]> = [
    ['Course', run?.events.filter((e) => e.kind !== 'car_near' && e.kind !== 'start').map((e, i) => <span key={i} title={`${e.t.toFixed(1)} s · ${e.label}`} className={`absolute top-1 whitespace-nowrap text-[10px] font-semibold ${e.kind === 'fall' || e.kind === 'car_hit' || e.kind === 'blocked' ? 'text-coral' : 'text-ink/70'}`} style={{ left: pct(e.t) }}><span className="mr-0.5 inline-block h-2.5 w-0.5 bg-ink/40 align-[-1px]" />{EVENT_TAGS[e.kind] ?? e.kind}</span>)],
    ['Left foot', spans(0).map((s, i) => <span key={i} className={`absolute top-1.5 h-3 rounded ${s.slide ? 'bg-coral' : 'bg-emerald-500'}`} style={{ left: pct(s.a), width: pct(Math.max(0.01, s.b - s.a)) }} />)],
    ['Right foot', spans(1).map((s, i) => <span key={i} className={`absolute top-1.5 h-3 rounded ${s.slide ? 'bg-coral' : 'bg-emerald-500'}`} style={{ left: pct(s.a), width: pct(Math.max(0.01, s.b - s.a)) }} />)],
    ['Speed', <svg key="s" viewBox="0 0 1000 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden><polyline points={speedPath} fill="none" stroke="currentColor" strokeWidth={2} className="text-indigo-400" /></svg>],
    ['Ghost (best)', best ? <span className="absolute top-2 h-2 rounded bg-cyan-600/60" style={{ left: 0, width: pct(Math.min(end, best.frames.at(-1)?.t ?? 0)) }} /> : <span className="absolute left-1 top-1 text-[10px] text-ink/50">No best version yet</span>],
  ];
  return (
    <section aria-label="Run timeline" className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex items-center gap-2 border-b border-ink/10 px-2 py-1">
        <b>{run ? `Run ${run.id} · ${run.settings.motion}` : 'No run yet — press Run (R)'}</b>
        {run ? <span className="text-ink/50">0:00 → {end.toFixed(1)} s · fixed step 1/60 s · seed {run.seed}</span> : null}
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 text-ink/60"><span className="size-2 rounded-full bg-emerald-500" />planted</span>
        <span className="inline-flex items-center gap-1 text-ink/60"><span className="size-2 rounded-full bg-coral" />sliding</span>
        {run ? <button type="button" className="flex h-6 items-center gap-1 rounded-lg border border-ink/15 px-2 font-bold hover:bg-ink/5" onClick={() => lab.saveVersion(run.id, '', PERSON)}><Star className="size-3.5" />Save as version</button> : null}
      </div>
      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="w-24 shrink-0 border-r border-ink/10">{lanes.map(([name]) => <div key={name} className="flex h-7 items-center border-b border-ink/5 px-2 font-semibold text-ink/70">{name}</div>)}</div>
        <div className="relative min-w-0 flex-1 cursor-pointer" role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={end} aria-valuenow={lab.view.t} tabIndex={0}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); lab.setPlaying(false); lab.seek(((e.clientX - r.left) / r.width) * end); }}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') lab.step(-6); if (e.key === 'ArrowRight') lab.step(6); }}>
          {lanes.map(([name, content]) => <div key={name} className="relative h-7 overflow-hidden border-b border-ink/5">{content}</div>)}
          <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-coral" style={{ left: pct(lab.view.t) }} />
        </div>
      </div>
    </section>
  );
}
