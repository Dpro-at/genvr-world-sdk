'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CircleAlert, CircleCheck, ClipboardPaste, Copy, FlipHorizontal2, Hand, Layers, Pause, Pin, Play, Plus, RotateCw, Save, StepBack,
  StepForward, Trash2, Waypoints, RotateCcw, ZoomIn, ZoomOut,
} from 'lucide-react';
import { LAB_POSE_ROWS, type LabLimb, type LabPoseEase, type LabPoseRow } from '@genvr/contracts';
import { LAB_POSE_CONTROLS, LAB_POSE_SECTIONS, LAB_ROW_NAMES, labAsk, labJointPositions, labKeyRows, labPoseProblems, labRowsOf, type LabPoseSide } from '@genvr/runtime';
import type { CharacterStage } from '@genvr/runtime/character';
import { PERSON, type LabController } from '../../../lib/motion-lab';

/**
 * The Lab's Pose mode (board M11): bones by numbers and by mouse, and key frames. The joint picker and the motions on
 * the left, the chosen joint's sliders on the right (the Avatar pose panel's sliders, stopping at the joint law), the
 * mouse tools over the view (turn ring, move a hand or foot, pin), and the key track under it. Every control has a
 * `motion_lab` operation with the same result (pose_set, key_add, limb_move, pin, pose_mirror, pose_test …).
 */
const label = 'text-[11px] font-black tracking-wide text-ink/50 uppercase';
function useLab(lab: LabController) { useSyncExternalStore(lab.subscribe, lab.getVersion, lab.getVersion); return lab; }
function attempt(fn: () => unknown, setError: (e: string | null) => void) { try { fn(); setError(null); } catch (e) { setError(e instanceof Error ? e.message.split('\n')[0]! : String(e)); } }
function Problem({ text }: { text: string | null }) {
  return text ? <p role="alert" className="rounded-lg bg-coral/15 px-2 py-1.5 text-xs font-semibold text-coral">{text}</p> : null;
}
const frameNow = (lab: LabController) => Math.round(lab.view.pose.frame);
/** The rows Key keys: the chosen joints on the chosen side. */
const chosenRows = (lab: LabController) => labRowsOf(lab.view.pose.group, lab.view.pose.side);

/** Course or Pose, on top of the Lab's left dock. */
export function LabModeSwitch({ lab }: { lab: LabController }) {
  useLab(lab);
  return (
    <div role="radiogroup" aria-label="Lab mode" className="grid grid-cols-2 gap-1 rounded-lg bg-ink/5 p-0.5">
      {([['run', 'Course and runs'], ['pose', 'Pose and keys']] as const).map(([mode, name]) => (
        <button key={mode} type="button" role="radio" aria-checked={lab.view.mode === mode} onClick={() => lab.setMode(mode)}
          className={`rounded-md py-1 text-[11px] font-bold ${lab.view.mode === mode ? 'bg-ink text-on-brand' : 'text-ink/70 hover:bg-ink/10'}`}>{name}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- left: motions and the joint picker
export function LabPoseLeft({ lab }: { lab: LabController }) {
  useLab(lab);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const open = lab.openMotion;
  const { group, side } = lab.view.pose;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-3">
      <LabModeSwitch lab={lab} />
      <span className={label}>Made motions</span>
      <div className="flex gap-1">
        <select aria-label="Open a made motion" className="h-8 min-w-0 flex-1 rounded-lg border border-ink/10 bg-paper px-2 text-xs font-semibold" value={open?.id ?? ''}
          onChange={(e) => attempt(() => lab.openMotionAt(e.target.value), setError)}>
          {!open ? <option value="">No made motion yet</option> : null}
          {lab.data.motions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); attempt(() => { lab.newMotion(name || `Motion ${lab.data.motions.length + 1}`, {}, PERSON); setName(''); }, setError); }}>
        <input aria-label="New motion name" placeholder="New motion name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-ink/10 bg-paper px-2 text-xs" />
        <button type="submit" className="flex h-8 items-center gap-1 rounded-lg bg-ink px-2 text-xs font-bold text-on-brand"><Plus className="size-3.5" />New</button>
      </form>
      {open ? (
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-ink/10 bg-paper px-2"><span className="text-[10px] font-black uppercase text-ink/50">Frames</span>
            <input type="number" min={2} max={3600} step={10} defaultValue={open.frames} key={`${open.id}:${open.frames}`} className="min-w-0 flex-1 bg-transparent text-right font-mono outline-none"
              onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v !== open.frames) attempt(() => lab.openMotionAt(open.id, { frames: v }), setError); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={open.loop} onChange={(e) => attempt(() => lab.openMotionAt(open.id, { loop: e.target.checked }), setError)} />Loop</label>
        </div>
      ) : null}
      <Problem text={error} />
      <span className={`${label} mt-1`}>Pose · frame {frameNow(lab)}</span>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Which side the arm, hand and leg sliders move">
        {([['both', 'Both sides'], ['L', 'His left'], ['R', 'His right']] as const).map(([one, text]) => (
          <button key={one} type="button" role="radio" aria-checked={side === one} onClick={() => lab.setPoseView({ side: one })}
            className={`rounded-md py-1 text-[11px] font-bold ${side === one ? 'bg-ink text-on-brand' : 'text-ink/75 ring-1 ring-ink/15'}`}>{text}</button>
        ))}
      </div>
      <div className="flex items-start gap-2">
        <BodyMap lab={lab} />
        <HandMap lab={lab} />
      </div>
      <p className="text-center text-xs font-bold">{group}{['Head', 'Spine', 'Hips'].includes(group) ? '' : side === 'both' ? ' · both sides' : side === 'L' ? ' · his left' : ' · his right'}</p>
      <p className="text-[11px] text-ink/50" title="Key (K) keys the chosen joints; Shift+K keys the whole body.">K = key · Shift+K = whole body</p>
    </div>
  );
}

/**
 * The joint picker as a picture (owner, 2026-10-20: "fewer words, icons that are easier to understand"): the body seen
 * from the front, his right on the left, each joint a dot to click; the hand below picks the palm, thumb or a finger.
 * The names show on hover; the sections are the Avatar pose panel's groups.
 */
const BODY_JOINTS: Array<{ group: string; side: LabPoseSide; x: number; y: number }> = [
  { group: 'Head', side: 'both', x: 50, y: 14 }, { group: 'Spine', side: 'both', x: 50, y: 50 }, { group: 'Hips', side: 'both', x: 50, y: 78 },
  ...([['R', 1], ['L', -1]] as const).flatMap(([side, s]) => [
    { group: 'Shoulder', side, x: 50 - 18 * s, y: 34 }, { group: 'Elbow', side, x: 50 - 25 * s, y: 60 }, { group: 'Wrist', side, x: 50 - 30 * s, y: 86 },
    { group: 'Hip', side, x: 50 - 10 * s, y: 88 }, { group: 'Knee', side, x: 50 - 12 * s, y: 122 }, { group: 'Ankle', side, x: 50 - 13 * s, y: 156 },
  ]),
];
const BODY_LINES = [[50, 14, 50, 26], [32, 34, 68, 34], [50, 26, 50, 78], [40, 88, 60, 88], [32, 34, 25, 60], [25, 60, 20, 86], [68, 34, 75, 60], [75, 60, 80, 86],
  [40, 88, 38, 122], [38, 122, 37, 156], [60, 88, 62, 122], [62, 122, 63, 156]];
function pick(lab: LabController, group: string, side: LabPoseSide) { lab.setPoseView({ group, ...(side === 'both' ? {} : { side }) }); }
function BodyMap({ lab }: { lab: LabController }) {
  const { group, side } = lab.view.pose;
  return (
    <svg viewBox="0 0 100 168" className="h-44 w-auto shrink-0" role="group" aria-label="Pick a joint on the body (his right is on the left)">
      <circle cx={50} cy={13} r={10} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} />
      {BODY_LINES.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} strokeLinecap="round" />)}
      {BODY_JOINTS.map((j) => {
        const on = j.group === group && (j.side === 'both' || side === 'both' || side === j.side);
        const name = `${j.group}${j.side === 'both' ? '' : j.side === 'L' ? ' · his left' : ' · his right'}`;
        return (
          <g key={`${j.group}${j.side}`} role="button" tabIndex={0} aria-label={name} aria-pressed={on} className="cursor-pointer outline-none"
            onClick={() => pick(lab, j.group, j.side)} onKeyDown={(e) => { if (e.key === 'Enter') pick(lab, j.group, j.side); }}>
            <title>{name}</title>
            <circle cx={j.x} cy={j.y} r={7} fill="transparent" />
            <circle cx={j.x} cy={j.y} r={on ? 5 : 3.6} className={on ? 'fill-amber-400 stroke-ink' : 'fill-paper stroke-ink/60 hover:fill-ink/30'} strokeWidth={1.2} />
          </g>
        );
      })}
      <text x={6} y={166} fontSize={8} className="fill-ink/50">R</text><text x={89} y={166} fontSize={8} className="fill-ink/50">L</text>
    </svg>
  );
}
const HAND_PARTS: Array<{ group: string; d: string; tip: [number, number] }> = [
  { group: 'Thumb', d: 'M14 58 L4 40', tip: [4, 40] }, { group: 'Index', d: 'M22 34 L20 8', tip: [20, 8] }, { group: 'Middle', d: 'M32 33 L32 4', tip: [32, 4] },
  { group: 'Ring', d: 'M42 34 L44 8', tip: [44, 8] }, { group: 'Pinky', d: 'M50 38 L55 16', tip: [55, 16] },
];
function HandMap({ lab }: { lab: LabController }) {
  const { group, side } = lab.view.pose;
  const hand = side === 'both' ? 'R' : side;
  return (
    <svg viewBox="0 0 60 80" className="h-28 w-auto shrink-0" role="group" aria-label={`Pick the palm or a finger (${hand === 'L' ? 'his left' : 'his right'} hand)`}
      style={hand === 'L' ? { transform: 'scaleX(-1)' } : undefined}>
      <g role="button" tabIndex={0} aria-label="Palm (fist, spread, cup)" aria-pressed={group === 'Palm'} className="cursor-pointer outline-none" onClick={() => pick(lab, 'Palm', side)}>
        <title>Palm · fist, spread, cup</title>
        <rect x={14} y={32} width={40} height={36} rx={9} className={group === 'Palm' ? 'fill-amber-400/70 stroke-ink' : 'fill-ink/10 stroke-ink/50 hover:fill-ink/25'} strokeWidth={1.5} />
      </g>
      {HAND_PARTS.map((p) => (
        <g key={p.group} role="button" tabIndex={0} aria-label={p.group} aria-pressed={group === p.group} className="cursor-pointer outline-none" onClick={() => pick(lab, p.group, side)}>
          <title>{p.group}</title>
          <path d={p.d} strokeWidth={9} strokeLinecap="round" className={group === p.group ? 'stroke-amber-400' : 'stroke-ink/25 hover:stroke-ink/45'} />
          <circle cx={p.tip[0]} cy={p.tip[1]} r={2} className="fill-ink/60" />
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- right: the chosen joint's sliders and the joint check
/** The joints the check lists, with the bones the joint law names for them (as in the Avatar pose panel). */
const JOINTS: [label: string, bones: RegExp][] = [
  ['Head and neck', /^Neck\+Head$/], ['Spine', /^Spine/], ['Collarbones', /Shoulder$/], ['Shoulders', /(Left|Right)Arm$/], ['Elbows', /ForeArm$/],
  ['Wrists', /Hand$/], ['Hips', /UpLeg$/], ['Knees', /(Left|Right)Leg$/], ['Ankles', /Foot$/],
];
/** What the Properties panel shows for a chosen group: its section's joints (an arm shows its hand's palm too). */
function shownGroups(group: string): string[] {
  const section = LAB_POSE_SECTIONS.find(([, groups]) => groups.includes(group))?.[1] ?? [group];
  return [group, ...section.filter((g) => g !== group), ...(section.includes('Elbow') ? ['Palm'] : [])];
}

export function LabPoseRight({ lab }: { lab: LabController }) {
  useLab(lab);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const open = lab.openMotion;
  if (!open) return <div className="p-3 text-xs text-ink/60"><div className={label}>Properties</div><p className="mt-2">Make a motion on the left (New), then pick a joint.</p></div>;
  const frame = frameNow(lab), pose = lab.poseAt(frame), { group, side } = lab.view.pose;
  const shownSide = side === 'R' ? 'R' : 'L';
  const draft = open.draft?.frame === frame ? Object.keys(open.draft.values).length : 0;
  const keyHere = open.keys.find((k) => k.frame === frame);
  const problems = labPoseProblems(pose);
  const set = (key: string, value: number) => attempt(() => {
    const result = lab.poseSet(frame, labAsk(key, side, value));
    setStopped(result.stopped.length ? key : null);
  }, setError);
  return (
    <section aria-label="Pose properties" className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-3">
      <div><div className={label}>Properties</div><b className="text-sm">Joint · {side === 'both' ? 'both sides' : side === 'L' ? 'his left' : 'his right'}</b>
        <div className="text-[11px] text-ink/55">frame {frame} · {keyHere ? `key (${keyHere.ease})` : 'between keys'}{draft ? ` · ${draft} not keyed yet — K keeps them` : ''}</div></div>
      {shownGroups(group).map((g) => (
        <div key={g} className={`flex flex-col gap-0.5 rounded-md p-1 ${g === group ? 'ring-1 ring-ink/30' : 'ring-1 ring-ink/10'}`}>
          <div className="px-1 text-xs font-bold text-ink/85">{g === 'Palm' ? 'Hand · palm' : g}</div>
          {LAB_POSE_CONTROLS.filter((c) => c.group === g).map((c) => {
            const key = c.sided ? `${shownSide}.${c.key}` : c.key;
            const value = pose[key] ?? 0;
            const metres = c.unit === 'm';
            return (
              <label key={c.key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 px-1 pb-0.5 text-[11px] font-semibold text-ink/75">
                {c.label}
                <input type="range" min={c.min} max={c.max} step={metres ? 0.01 : 1} value={value} onChange={(e) => set(c.key, Number(e.target.value))}
                  aria-label={`${g}: ${c.label}, ${metres ? 'metres' : c.unit === '%' ? 'percent' : 'degrees'}`} />
                <span className="text-right tabular-nums">{metres ? value.toFixed(2) : Math.round(value)}{c.unit ?? '°'}</span>
              </label>
            );
          })}
        </div>
      ))}
      <p className="text-[11px] text-ink/50">Same sliders as the Avatar pose panel. Every slider stops at the last pose a body can really make (joint law).</p>
      {stopped ? <p role="status" className="px-1 text-[11px] font-semibold text-ink/70">Stopped at the joint&apos;s natural limit.</p> : null}
      <Problem text={error} />
      <div className={label}>Joint check</div>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-1 text-[11px] font-semibold" aria-label="Joint check">
        {JOINTS.map(([name, bones]) => {
          const wrong = problems.filter((one) => bones.test(one.split(':')[0]!));
          return (
            <li key={name} className={`flex items-center gap-1 ${wrong.length ? 'text-coral' : 'text-ink/55'}`} title={wrong.join('\n') || 'Natural'}>
              {wrong.length ? <CircleAlert className="size-3.5 shrink-0" aria-hidden /> : <CircleCheck className="size-3.5 shrink-0" aria-hidden />}{name}
              <span className="sr-only">{wrong.length ? `: ${wrong.join(', ')}` : ': natural'}</span>
            </li>
          );
        })}
      </ul>
      {problems.length ? <p className="text-[11px] text-coral">{problems[0]}</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------- the mouse tools over the view
const TOOLS: Array<[tool: 'turn' | 'move' | 'pin', name: string, key: string, icon: typeof RotateCw]> = [
  ['turn', 'Turn joint', '1', RotateCw], ['move', 'Move hand / foot', '2', Hand], ['pin', 'Pin', '3', Pin],
];
/** The view's own buttons (turn round the character, zoom); the mouse does the same: drag on empty space, wheel. */
export const labViewControl: { stage: CharacterStage | null } = { stage: null };
export function LabPoseBar({ lab }: { lab: LabController }) {
  useLab(lab);
  const [error, setError] = useState<string | null>(null);
  const open = lab.openMotion;
  const pv = lab.view.pose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // A focused slider keeps its arrow keys; the Pose keys still work (only text boxes and menus take them).
      if (target?.closest('input:not([type="range"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase(), frame = frameNow(lab), motion = lab.openMotion;
      if (!motion) return;
      const keyFrames = motion.keys.map((k) => k.frame).sort((a, b) => a - b);
      const tool = TOOLS.find(([, , k]) => k === key);
      if (key === 'k') { event.preventDefault(); attempt(() => lab.keyAdd(frame, event.shiftKey ? [...LAB_POSE_ROWS] : chosenRows(lab)), setError); }
      else if (key === ' ') { event.preventDefault(); lab.setPoseView({ playing: !lab.view.pose.playing }); }
      else if (key === ',') { event.preventDefault(); lab.setPoseView({ playing: false, frame: frame - 1 }); }
      else if (key === '.') { event.preventDefault(); lab.setPoseView({ playing: false, frame: frame + 1 }); }
      else if (key === '[') { event.preventDefault(); const k = [...keyFrames].reverse().find((f) => f < frame); if (k !== undefined) lab.setPoseView({ playing: false, frame: k }); }
      else if (key === ']') { event.preventDefault(); const k = keyFrames.find((f) => f > frame); if (k !== undefined) lab.setPoseView({ playing: false, frame: k }); }
      else if (key === 'o') { event.preventDefault(); lab.setPoseView({ onion: !lab.view.pose.onion }); }
      else if (key === 'delete' || key === 'backspace') { if (motion.keys.some((k) => k.frame === frame)) { event.preventDefault(); attempt(() => lab.keyRemove(frame, chosenRows(lab)), setError); } }
      else if (tool) { event.preventDefault(); lab.setPoseView({ tool: tool[0] }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lab]);
  return (
    <div role="toolbar" aria-label="Pose tools" className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-center gap-1 border-b border-ink/10 bg-surface/95 px-2 py-1 text-xs">
      {TOOLS.map(([tool, name, key, Icon]) => (
        <button key={tool} type="button" aria-pressed={pv.tool === tool} title={`${name} (${key})`} onClick={() => lab.setPoseView({ tool })}
          aria-label={name} className={`flex h-7 items-center gap-1.5 rounded-lg px-2 font-bold ${pv.tool === tool ? 'bg-ink text-on-brand' : 'text-ink/75 hover:bg-ink/10'}`}><Icon className="size-3.5" /><span className="hidden xl:inline">{name}</span></button>
      ))}
      <button type="button" aria-pressed={pv.onion} title="Onion skin: the keys before and after (O)" onClick={() => lab.setPoseView({ onion: !pv.onion })}
        aria-label="Onion skin" className={`flex h-7 items-center gap-1.5 rounded-lg px-2 font-bold ${pv.onion ? 'bg-ink/15 ring-1 ring-ink/30' : 'text-ink/75 hover:bg-ink/10'}`}><Layers className="size-3.5" /><span className="hidden xl:inline">Onion skin</span></button>
      <span className="mx-1 h-5 w-px bg-ink/15" />
      <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10" title="Previous frame (,)" aria-label="Previous frame" onClick={() => lab.setPoseView({ playing: false, frame: frameNow(lab) - 1 })}><StepBack className="size-3.5" /></button>
      <button type="button" disabled={!open} className="flex h-7 items-center gap-1.5 rounded-lg bg-ink px-2.5 font-bold text-on-brand disabled:opacity-40" title="Play the made motion (Space)" onClick={() => lab.setPoseView({ playing: !pv.playing })}>
        {pv.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{pv.playing ? 'Pause' : 'Play'}</button>
      <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10" title="Next frame (.)" aria-label="Next frame" onClick={() => lab.setPoseView({ playing: false, frame: frameNow(lab) + 1 })}><StepForward className="size-3.5" /></button>
      <span className="ml-1 rounded-lg border border-ink/10 px-2 py-1 font-mono tabular-nums">frame {frameNow(lab)} / {open ? open.frames - 1 : 0}</span>
      <span className="mx-1 h-5 w-px bg-ink/15" />
      <div role="group" aria-label="View" className="flex items-center" title="Turn round the character and zoom (or drag on empty space in the view, mouse wheel)">
        <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10" aria-label="Turn the view left" title="Turn the view left" onClick={() => labViewControl.stage?.turnView(-30)}><RotateCcw className="size-3.5" /></button>
        <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10" aria-label="Turn the view right" title="Turn the view right" onClick={() => labViewControl.stage?.turnView(30)}><RotateCw className="size-3.5" /></button>
        <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10" aria-label="Zoom in" title="Zoom in" onClick={() => labViewControl.stage?.zoomView(0.8)}><ZoomIn className="size-3.5" /></button>
        <button type="button" className="rounded-lg p-1.5 hover:bg-ink/10" aria-label="Zoom out" title="Zoom out" onClick={() => labViewControl.stage?.zoomView(1.25)}><ZoomOut className="size-3.5" /></button>
      </div>
      {error ? <span role="alert" className="ml-2 font-semibold text-coral">{error}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- the key track under the view
const EASES: Array<[LabPoseEase, string]> = [['linear', 'Linear'], ['smooth', 'Smooth'], ['hold', 'Hold']];
export function LabKeyTrack({ lab }: { lab: LabController }) {
  useLab(lab);
  const [error, setError] = useState<string | null>(null);
  const [ease, setEase] = useState<LabPoseEase>('smooth');
  const [copied, setCopied] = useState<{ frame: number; rows: LabPoseRow[] } | null>(null);
  const open = lab.openMotion;
  if (!open) return <section aria-label="Key track" className="p-3 text-xs text-ink/60">Keys · make a motion on the left first.</section>;
  const frame = frameNow(lab), end = Math.max(1, open.frames - 1);
  const keyHere = open.keys.find((k) => k.frame === frame);
  const pct = (f: number) => `${(f / end) * 100}%`;
  const ruler = Array.from({ length: 5 }, (_, i) => Math.round((end * i) / 4));
  const rowsOf = (values: Record<string, number>) => new Set(labKeyRows(values));
  const button = 'flex h-6 items-center gap-1 rounded-lg border border-ink/15 px-2 font-bold hover:bg-ink/5 disabled:opacity-40';
  return (
    <section aria-label="Key track" className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink/10 px-2 py-1">
        <b title="A key = the pose of the chosen joints on one frame; the lab fills the frames between keys">Keys · {open.name}</b>
        <span className="hidden text-ink/50 2xl:inline">a key = the pose of the chosen joints on one frame; the lab fills the frames between keys</span>
        <span className="flex-1" />
        <button type="button" className="flex h-6 items-center gap-1 rounded-lg bg-ink px-2 font-bold text-on-brand" title="Key the chosen joints on this frame (K; Shift+K: whole body)"
          onClick={(e) => attempt(() => lab.keyAdd(frame, e.shiftKey ? [...LAB_POSE_ROWS] : chosenRows(lab), ease), setError)}><Waypoints className="size-3.5" />Key<kbd className="font-mono text-[10px] opacity-70">K</kbd></button>
        <div role="radiogroup" aria-label="How the frames after a key are filled" className="flex rounded-lg border border-ink/10 p-0.5">
          {EASES.map(([value, name]) => {
            const on = keyHere ? keyHere.ease === value : ease === value;
            return <button key={value} type="button" role="radio" aria-checked={on} onClick={() => { setEase(value); if (keyHere) attempt(() => lab.keyEase(frame, value), setError); }}
              className={`rounded-md px-2 py-0.5 font-bold ${on ? 'bg-ink text-on-brand' : 'text-ink/70 hover:bg-ink/10'}`}>{name}</button>;
          })}
        </div>
        <button type="button" className={button} title="Copy the chosen joints' pose on this frame" onClick={() => setCopied({ frame, rows: chosenRows(lab) })}><Copy className="size-3.5" /><span className="sr-only">Copy</span></button>
        <button type="button" className={button} disabled={!copied} title={copied ? `Paste frame ${copied.frame} here as a key` : 'Copy first'} onClick={() => copied && attempt(() => lab.keyCopy(copied.frame, frame, copied.rows), setError)}><ClipboardPaste className="size-3.5" /><span className="sr-only">Paste</span></button>
        <button type="button" className={button} title="Mirror: swap his left and right on this frame" onClick={() => attempt(() => lab.poseMirror(frame), setError)}><FlipHorizontal2 className="size-3.5" /><span className="sr-only">Mirror</span></button>
        <button type="button" className={button} disabled={!keyHere} title="Remove the chosen joints' key on this frame (Delete)" onClick={() => attempt(() => lab.keyRemove(frame, chosenRows(lab)), setError)}><Trash2 className="size-3.5" /><span className="sr-only">Remove key</span></button>
        <button type="button" className={button} title="Run the course with this motion" onClick={() => attempt(() => lab.poseTest(PERSON), setError)}><Play className="size-3.5" />Test in course</button>
        <button type="button" className={button} title="Keep it as a version (tests it first when its keys changed)" onClick={() => attempt(() => lab.poseSaveVersion('', PERSON), setError)}><Save className="size-3.5" />Save as version</button>
      </div>
      {error ? <p role="alert" className="px-2 py-1 font-semibold text-coral">{error}</p> : null}
      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="w-24 shrink-0 border-r border-ink/10">
          <div className="h-5 border-b border-ink/5" />
          {LAB_POSE_ROWS.map((row) => <div key={row} className="flex h-6 items-center border-b border-ink/5 px-2 font-semibold text-ink/70">{LAB_ROW_NAMES[row]}</div>)}
        </div>
        <div className="relative min-w-0 flex-1 cursor-pointer" role="slider" aria-label="Frame" aria-valuemin={0} aria-valuemax={end} aria-valuenow={frame} tabIndex={0}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); lab.setPoseView({ playing: false, frame: Math.round(((e.clientX - r.left) / r.width) * end) }); }}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') lab.setPoseView({ playing: false, frame: frame - 1 }); if (e.key === 'ArrowRight') lab.setPoseView({ playing: false, frame: frame + 1 }); }}>
          <div className="relative h-5 border-b border-ink/10 text-[10px] text-ink/50">{ruler.map((f) => <span key={f} className="absolute top-0.5 -translate-x-1/2" style={{ left: pct(f) }}>{f}</span>)}</div>
          {LAB_POSE_ROWS.map((row) => (
            <div key={row} className="relative h-6 border-b border-ink/5">
              {open.keys.filter((k) => rowsOf(k.values).has(row)).map((k) => (
                <button key={k.frame} type="button" title={`${LAB_ROW_NAMES[row]} · frame ${k.frame} · ${k.ease}`} aria-label={`${LAB_ROW_NAMES[row]} key on frame ${k.frame}`}
                  onClick={(e) => { e.stopPropagation(); lab.setPoseView({ playing: false, frame: k.frame }); }}
                  className={`absolute top-1.5 size-3 -translate-x-1/2 ${k.ease === 'smooth' ? 'rounded-full' : k.ease === 'hold' ? 'rounded-[2px]' : 'rotate-45 rounded-[1px]'} ${k.frame === frame ? 'bg-amber-500 ring-1 ring-ink' : 'bg-ink/70'}`}
                  style={{ left: pct(k.frame) }} />
              ))}
              {open.draft && rowsOf(open.draft.values).has(row) ? <span className="absolute top-1.5 size-3 -translate-x-1/2 rounded-full border-2 border-dashed border-amber-500" style={{ left: pct(open.draft.frame) }} title="Not keyed yet" /> : null}
            </div>
          ))}
          <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-coral" style={{ left: pct(frame) }} />
        </div>
      </div>
    </section>
  );
}
// ---------------------------------------------------------------- the mouse over the view: joint dots, turn ring, reach, pins, onion skin
/** The joints with a dot, the group each opens and the slider its ring turns. */
const DOTS: Array<{ joint: string; group: string; side: LabPoseSide; ring: string; limb?: LabLimb }> = [
  { joint: 'Head', group: 'Head', side: 'both', ring: 'head.turn' },
  { joint: 'Spine2', group: 'Spine', side: 'both', ring: 'spine.bend' },
  { joint: 'Hips', group: 'Hips', side: 'both', ring: 'spine.turn' },
  ...(['Left', 'Right'] as const).flatMap((s) => {
    const side = s === 'Left' ? 'L' : 'R', low = s.toLowerCase() as 'left' | 'right';
    return [
      { joint: `${s}Arm`, group: 'Shoulder', side, ring: 'arm.up' },
      { joint: `${s}ForeArm`, group: 'Elbow', side, ring: 'elbow.bend' },
      { joint: `${s}Hand`, group: 'Wrist', side, ring: 'wrist.bend', limb: `${low}_hand` as LabLimb },
      { joint: `${s}UpLeg`, group: 'Hip', side, ring: 'leg.forward' },
      { joint: `${s}Leg`, group: 'Knee', side, ring: 'knee.bend' },
      { joint: `${s}Foot`, group: 'Ankle', side, ring: 'ankle.bend', limb: `${low}_foot` as LabLimb },
    ] as Array<{ joint: string; group: string; side: LabPoseSide; ring: string; limb?: LabLimb }>;
  }),
];
const BONES: Array<[string, string]> = [
  ['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'],
  ...(['Left', 'Right'] as const).flatMap((s) => [[`Spine2`, `${s}Shoulder`], [`${s}Shoulder`, `${s}Arm`], [`${s}Arm`, `${s}ForeArm`], [`${s}ForeArm`, `${s}Hand`],
    ['Hips', `${s}UpLeg`], [`${s}UpLeg`, `${s}Leg`], [`${s}Leg`, `${s}Foot`], [`${s}Foot`, `${s}ToeBase`]] as Array<[string, string]>),
];
const RING_R = 34;

export function LabPoseOverlay({ lab, stage }: { lab: LabController; stage: CharacterStage }) {
  useLab(lab);
  useEffect(() => { labViewControl.stage = stage; return () => { if (labViewControl.stage === stage) labViewControl.stage = null; }; }, [stage]);
  const [, redraw] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'ring' | 'limb'; dot: (typeof DOTS)[number]; centre: [number, number]; angle: number; start: number; through: [number, number, number] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The camera can turn at any time: follow it every animation frame.
  useEffect(() => { let id = 0; const loop = () => { redraw((n) => (n + 1) % 1e6); id = requestAnimationFrame(loop); }; id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id); }, []);
  const open = lab.openMotion;
  if (!open) return null;
  const pv = lab.view.pose, frame = frameNow(lab), scale = lab.legScale;
  const at = stage.jointPositions(DOTS.map((d) => d.joint));
  const screen = Object.fromEntries(DOTS.map((d) => [d.joint, at[d.joint] ? stage.project([at[d.joint]!])[0] : null])) as Record<string, [number, number] | null>;
  // The chosen joint's dot (a hand's fingers show at the wrist; with both sides chosen, his right).
  const dotGroup = ['Palm', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].includes(pv.group) ? 'Wrist' : pv.group;
  const chosen = DOTS.find((d) => d.group === dotGroup && (d.side === 'both' || d.side === (pv.side === 'both' ? 'R' : pv.side)));
  const value = (key: string, side: LabPoseSide) => lab.poseAt(frame)[side === 'both' ? key : `${side}.${key}`] ?? 0;
  const control = (key: string) => LAB_POSE_CONTROLS.find((c) => c.key === key)!;
  const local = (e: ReactPointerEvent | PointerEvent): [number, number] => { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e: ReactPointerEvent, dot: (typeof DOTS)[number]) => {
    e.stopPropagation(); e.preventDefault();
    lab.setPoseView({ group: dot.group, side: dot.side === 'both' ? pv.side : dot.side, playing: false });
    if (pv.tool === 'pin') { if (dot.limb) attempt(() => lab.pin(dot.limb!, !open.pins.includes(dot.limb!)), setError); return; }
    const centre = screen[dot.joint];
    if (!centre) return;
    const p = local(e);
    if (pv.tool === 'move' && dot.limb) drag.current = { kind: 'limb', dot, centre, angle: 0, start: 0, through: at[dot.joint]! };
    else drag.current = { kind: 'ring', dot, centre, angle: Math.atan2(p[1] - centre[1], p[0] - centre[0]), start: value(dot.ring, dot.side), through: at[dot.joint]! };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    if (d.kind === 'ring') {
      // Around the ring: clockwise turns the slider up, one degree per degree.
      let delta = (Math.atan2(p[1] - d.centre[1], p[0] - d.centre[0]) - d.angle) * (180 / Math.PI);
      if (delta > 180) delta -= 360; if (delta < -180) delta += 360;
      attempt(() => lab.poseSet(frame, labAsk(d.dot.ring, d.dot.side, Math.round(d.start + delta))), setError);
    } else {
      const world = stage.unproject(p[0], p[1], d.through);
      attempt(() => lab.limbMove(frame, d.dot.limb!, world.map((x) => x / scale), undefined, true), setError);
    }
  };
  const up = () => { drag.current = null; };
  // Onion skin: the key before and the key after this frame, as thin figures.
  const keyFrames = open.keys.map((k) => k.frame).sort((a, b) => a - b);
  const onion = pv.onion ? [[...keyFrames].reverse().find((f) => f < frame), keyFrames.find((f) => f > frame)].filter((f): f is number => f !== undefined) : [];
  const figures = onion.map((f) => {
    const joints = labJointPositions(lab.poseAt(f));
    const points = Object.fromEntries([...joints].map(([name, p]) => [name, stage.project([p.map((x) => x * scale)])[0]]));
    return { f, lines: BONES.map(([a, b]) => [points[a], points[b]] as const).filter(([a, b]) => a && b) as Array<readonly [[number, number], [number, number]]> };
  });
  const ringDot = chosen && screen[chosen.joint];
  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-10" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        {figures.map(({ f, lines }) => lines.map(([a, b], i) => <line key={`${f}-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={f < frame ? '#67e8f9' : '#f5b942'} strokeOpacity={0.6} strokeWidth={2} />))}
        {ringDot && pv.tool === 'turn' ? <circle cx={ringDot[0]} cy={ringDot[1]} r={RING_R} fill="none" stroke="#f5b942" strokeWidth={3} strokeDasharray="6 4" /> : null}
      </svg>
      {DOTS.map((dot) => {
        const p = screen[dot.joint];
        if (!p) return null;
        const pinned = dot.limb && open.pins.includes(dot.limb);
        const isChosen = chosen?.joint === dot.joint;
        const usable = pv.tool === 'turn' || dot.limb;
        return (
          <button key={dot.joint} type="button" aria-label={`${dot.joint}${pinned ? ' (pinned)' : ''}`} title={`${dot.group}${dot.limb && pv.tool === 'move' ? ' · drag: the limb follows' : ''}${dot.joint.endsWith('Hand') ? ' · double-click = fingers' : ''}`}
            onPointerDown={(e) => down(e, dot)} onDoubleClick={() => { if (dot.joint.endsWith('Hand')) lab.setPoseView({ group: 'Palm' }); }}
            className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${usable ? 'cursor-grab' : 'cursor-default opacity-40'} ${isChosen ? 'size-4 border-amber-400 bg-amber-400/60' : dot.limb ? 'size-3.5 border-cyan-300 bg-cyan-300/40' : 'size-3 border-white/80 bg-white/30'}`}
            style={{ left: p[0], top: p[1] }}>
            {pinned ? <Pin className="absolute -right-3 -top-3 size-3.5 fill-coral text-coral" aria-hidden /> : null}
          </button>
        );
      })}
      {ringDot && chosen ? (
        <span className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-ink/85 px-1.5 py-0.5 font-mono text-[11px] text-white" style={{ left: ringDot[0], top: ringDot[1] + RING_R + 6 }}>
          {control(chosen.ring).label} {Math.round(value(chosen.ring, chosen.side))}° · {control(chosen.ring).min}–{control(chosen.ring).max}°
        </span>
      ) : null}
      <span className="absolute bottom-2 left-2 rounded bg-ink/70 px-2 py-1 text-[11px] text-white">
        {pv.tool === 'turn' ? 'Turn joint: drag around the ring' : pv.tool === 'move' ? 'Move: drag a hand or foot, the arm or leg follows' : 'Pin: click a hand or foot'}
        {open.pins.length ? ` · pinned: ${open.pins.map((p) => p.replace('_', ' ')).join(', ')}` : ''}
      </span>
      {error ? <span role="alert" className="absolute bottom-9 left-2 rounded bg-coral px-2 py-1 text-[11px] font-semibold text-white">{error}</span> : null}
    </div>
  );
}
