'use client';

import { POSE_CONTROLS, type MusclePaintMode, type PaintPoseValues } from '@genvr/runtime/character';
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, RotateCcw } from 'lucide-react';
import { useState } from 'react';

type Side = 'both' | 'L' | 'R';
const GROUPS = [...new Set(POSE_CONTROLS.map((control) => control.group))];
/** The joint groups under headings (owner: the hand and finger controls must be easy to find). */
const SECTIONS: [title: string, groups: string[]][] = [
  ['Body', ['Head', 'Spine']],
  ['Arm', ['Shoulder', 'Elbow', 'Wrist']],
  ['Hand and fingers', ['Palm', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky']],
  ['Leg', ['Hip', 'Knee', 'Ankle']],
];
/** The joints the status list shows, with the bones the joint law names for them. */
const JOINTS: [label: string, bones: RegExp][] = [
  ['Head and neck', /^Neck\+Head$/],
  ['Spine', /^Spine/],
  ['Collarbones', /Shoulder$/],
  ['Shoulders', /(Left|Right)Arm$/],
  ['Elbows', /ForeArm$/],
  ['Wrists', /Hand$/],
  ['Hips', /UpLeg$/],
  ['Knees', /(Left|Right)Leg$/],
  ['Ankles', /Foot$/],
];

/**
 * The paint tool's pose (owner, 2026-10-05: "every bone, only the way it really moves - not at random"): every joint
 * by its own anatomical controls, for both sides or one. Each move goes through the joint law the Core moves pass
 * (`limitPose`): a slider stops at the last pose a body can make, whatever the other sliders hold, and the list below
 * shows each joint's state. Only the view moves; strokes stay on the A-pose body.
 */
export function PaintPosePanel({
  pose,
  joints,
  onChange,
  onOpenGroup,
}: {
  pose: PaintPoseValues;
  /** The paint mode (its skeleton checks the joint law); null while it loads. */
  joints: Pick<MusclePaintMode, 'poseRest' | 'limitPose' | 'poseProblems'> | null;
  onChange: (pose: PaintPoseValues) => void;
  /** A joint group was opened (the view goes to that body part). */
  onOpenGroup?: (group: string) => void;
}) {
  const [side, setSide] = useState<Side>('both');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(['Shoulder', 'Palm']));
  const toggle = (group: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(group)) next.delete(group);
      else {
        next.add(group);
        onOpenGroup?.(group);
      }
      return next;
    });
  const [stopped, setStopped] = useState<string | null>(null);
  const keyOf = (key: string, sided: boolean, which: 'L' | 'R') => (sided ? `${which}.${key}` : key);
  const fallback = (key: string) => Math.round(joints?.poseRest[key] ?? 0);
  const set = (key: string, sided: boolean, value: number) => {
    const asked: Record<string, number> = {};
    if (!sided) asked[key] = value;
    else for (const which of side === 'both' ? (['L', 'R'] as const) : [side]) asked[keyOf(key, true, which)] = value;
    if (!joints) return onChange({ ...pose, ...asked });
    const result = joints.limitPose(pose, asked);
    const reached = Object.entries(asked).every(([k, v]) => Math.abs((result.values[k] ?? v) - v) < 0.5);
    setStopped(reached ? null : key);
    onChange(result.values);
  };
  const problems = joints?.poseProblems(pose) ?? [];
  return (
    <div className="flex flex-col gap-1.5 rounded-lg p-1.5 ring-1 ring-ink/10">
      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wide text-ink/60">
        Pose (view only)
        <button type="button" onClick={() => onChange({})} className="flex items-center gap-1 text-ink/60 hover:text-ink" aria-label="Back to the A-pose">
          <RotateCcw className="size-3.5" aria-hidden /> A-pose
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Which side the arm and leg sliders move">
        {(['both', 'L', 'R'] as const).map((one) => (
          <button
            key={one}
            type="button"
            role="radio"
            aria-checked={side === one}
            onClick={() => setSide(one)}
            className={`rounded-md py-1 text-[11px] font-bold ${side === one ? 'bg-ink text-on-brand' : 'text-ink/75 ring-1 ring-ink/15'}`}
          >
            {one === 'both' ? 'Both sides' : one === 'L' ? 'His left' : 'His right'}
          </button>
        ))}
      </div>
      {SECTIONS.map(([title, groups]) => (
        <div key={title} className="flex flex-col gap-0.5">
          <div className="px-1 pt-1 text-[10px] font-black uppercase tracking-wide text-ink/45">{title}</div>
          {groups.filter((group) => GROUPS.includes(group)).map((group) => (
            <div key={group} className="rounded-md ring-1 ring-ink/10">
              <button
                type="button"
                aria-expanded={open.has(group)}
                onClick={() => toggle(group)}
                className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs font-bold text-ink/85 hover:bg-ink/5"
              >
                {open.has(group) ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                {group}
                <span className="ml-auto text-[10px] font-semibold text-ink/45">
                  {POSE_CONTROLS.filter((control) => control.group === group).length}
                </span>
              </button>
              {open.has(group)
                ? POSE_CONTROLS.filter((control) => control.group === group).map((control) => {
                    const key = keyOf(control.key, control.sided, side === 'R' ? 'R' : 'L');
                    const value = Math.round(pose[key] ?? fallback(control.key));
                    return (
                      <label key={control.key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 px-1.5 pb-1 text-[11px] font-semibold text-ink/75">
                        {control.label}
                        <input
                          type="range"
                          min={control.min}
                          max={control.max}
                          step={1}
                          value={value}
                          onChange={(e) => set(control.key, control.sided, Number(e.target.value))}
                          aria-label={`${group}: ${control.label}, ${control.unit === '%' ? 'percent' : 'degrees'}`}
                        />
                        <span className="text-right tabular-nums">
                          {value}
                          {control.unit ?? '°'}
                        </span>
                      </label>
                    );
                  })
                : null}
            </div>
          ))}
        </div>
      ))}
      {stopped ? <p className="px-1 text-[11px] font-semibold text-ink/60">Stopped at the joint&apos;s natural limit.</p> : null}
      <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-1 text-[11px] font-semibold" aria-label="Joint check">
        {JOINTS.map(([label, bones]) => {
          const wrong = problems.filter((one) => bones.test(one.split(':')[0]!));
          return (
            <li key={label} className={`flex items-center gap-1 ${wrong.length ? 'text-ink' : 'text-ink/55'}`} title={wrong.join('\n') || 'Natural'}>
              {wrong.length ? <CircleAlert className="size-3.5 shrink-0" aria-hidden /> : <CircleCheck className="size-3.5 shrink-0" aria-hidden />}
              {label}
              <span className="sr-only">{wrong.length ? `: ${wrong.join(', ')}` : ': natural'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
