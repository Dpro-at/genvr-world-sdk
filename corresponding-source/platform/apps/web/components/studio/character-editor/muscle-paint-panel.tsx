'use client';

import { MUSCLE_PART_COLOURS, MUSCLE_PART_ZONE, MUSCLE_PARTS, type MusclePart } from '@genvr/contracts';
import type { MusclePaint, MusclePaintMode, PaintPoseValues } from '@genvr/runtime/character';
import { Brush, Eraser, Save, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PaintPosePanel } from './paint-pose-panel';
import type { CharacterEditor } from './use-character-editor';

/**
 * The muscle paint tool (developer only, owner 2026-10-05): pick a muscle, paint it on the default boy with the
 * mouse (drag on the body paints, drag beside it turns the view, wheel zooms), compare with a reference sheet beside it, then
 * save: the strokes go to tooling/human-bake/muscle-paint.json and the body is baked again. Agents write the same
 * strokes file (docs: .claude/skills/genvr-character-builder/references/muscle-paint.md).
 */
/** The bones whose skin the view frames when a pose group opens (owner: open the fingers, see the hand). */
const GROUP_BONES: Record<string, string[]> = {
  Head: ['Head', 'Neck'],
  Spine: ['Spine', 'Spine1', 'Spine2'],
  Shoulder: ['LeftShoulder', 'LeftArm'],
  Elbow: ['LeftArm', 'LeftForeArm'],
  Wrist: ['LeftForeArm', 'LeftHand'],
  Palm: ['LeftHand*'],
  Thumb: ['LeftHand*'],
  Index: ['LeftHand*'],
  Middle: ['LeftHand*'],
  Ring: ['LeftHand*'],
  Pinky: ['LeftHand*'],
  Hip: ['Hips', 'LeftUpLeg'],
  Knee: ['LeftUpLeg', 'LeftLeg'],
  Ankle: ['LeftLeg', 'LeftFoot', 'LeftToeBase'],
};

export function MusclePaintPanel({ editor }: { editor: CharacterEditor }) {
  const [on, setOn] = useState(false);
  const [part, setPart] = useState<MusclePart | null>('biceps');
  const [radius, setRadius] = useState(2);
  const [strength, setStrength] = useState(1);
  const [mirror, setMirror] = useState(true);
  // The view pose (owner: move every bone, only the way it really turns); strokes stay on the A-pose body.
  const [pose, setPose] = useState<PaintPoseValues>({});
  const [checker, setChecker] = useState<MusclePaintMode | null>(null);
  const [strokes, setStrokes] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [references, setReferences] = useState<string[]>([]);
  const [reference, setReference] = useState('');
  const mode = useRef<MusclePaintMode | null>(null);

  useEffect(() => {
    mode.current?.setBrush({ part, radius, strength, mirror });
  }, [part, radius, strength, mirror]);
  useEffect(() => {
    mode.current?.setPose(pose);
  }, [pose]);

  const start = async () => {
    const stage = editor.stage.current;
    if (!stage) return;
    const saved = (await fetch('/api/dev/muscle-paint').then((r) => r.json())) as MusclePaint;
    mode.current = await stage.startPaint(saved);
    mode.current.setBrush({ part, radius, strength, mirror });
    mode.current.setPose(pose);
    setChecker(mode.current);
    setStrokes(saved.strokes.length);
    mode.current.onChange((paint) => setStrokes(paint.strokes.length));
    setOn(true);
    setMessage(null);
    if (!references.length) {
      const names = (await fetch('/api/dev/muscle-reference').then((r) => r.json())) as string[];
      setReferences(names);
      setReference(names.find((name) => name.includes('arm-zones-chatgpt-apose')) ?? names[0] ?? '');
    }
  };
  const stop = () => {
    editor.stage.current?.stopPaint();
    mode.current = null;
    setOn(false);
  };
  const save = async () => {
    if (!mode.current) return;
    setMessage('Saving and baking...');
    const response = await fetch('/api/dev/muscle-paint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mode.current.paint()),
    });
    const result = (await response.json()) as { ok: boolean; error?: string; strokes?: number };
    setMessage(result.ok ? `Saved ${result.strokes} strokes and baked. Reload the page to see the body.` : result.error ?? 'Failed');
  };

  if (!on)
    return (
      <button
        type="button"
        onClick={() => void start()}
        className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-ink/75 ring-1 ring-ink/15 hover:text-ink"
      >
        <Brush className="size-4" aria-hidden /> Paint muscles (developer)
      </button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-xl p-2 ring-1 ring-ink/15">
      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-ink/60">
        Paint muscles
        <button type="button" onClick={stop} aria-label="Close the paint tool" className="text-ink/60 hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="text-[11px] font-semibold text-ink/55">Drag on the body paints · drag beside it turns · wheel zooms</p>
      <div className="grid grid-cols-2 gap-1">
        {MUSCLE_PARTS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={part === name}
            onClick={() => {
              setPart(name);
              // Go there (owner: clicking a muscle shows it on the body).
              mode.current?.focusPart(name);
            }}
            className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-bold ${
              part === name ? 'bg-ink text-on-brand' : 'text-ink/75 hover:bg-ink/5'
            }`}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: MUSCLE_PART_COLOURS[name] }} />
            <span className="truncate">
              {name}
              {MUSCLE_PART_ZONE[name] ? <span className="opacity-60"> · {MUSCLE_PART_ZONE[name]}</span> : null}
            </span>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={part === null}
          onClick={() => setPart(null)}
          className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-bold ${
            part === null ? 'bg-ink text-on-brand' : 'text-ink/75 hover:bg-ink/5'
          }`}
        >
          <Eraser className="size-3.5" aria-hidden /> Erase (no muscle)
        </button>
      </div>
      <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs font-bold text-ink/75">
        Brush
        <input type="range" min={0.5} max={8} step={0.25} value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Brush size in cm" />
        <span className="text-right tabular-nums">{radius} cm</span>
      </label>
      <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs font-bold text-ink/75">
        Strength
        <input type="range" min={0.1} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} aria-label="Brush strength" />
        <span className="text-right tabular-nums">{Math.round(strength * 100)}%</span>
      </label>
      <PaintPosePanel pose={pose} joints={checker} onChange={setPose} onOpenGroup={(group) => mode.current?.focusBones(GROUP_BONES[group] ?? ['LeftHand*'])} />
      <label className="flex items-center gap-2 text-xs font-bold text-ink/75">
        <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror to the right side
      </label>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => mode.current?.undo()} className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold ring-1 ring-ink/15">
          <Undo2 className="size-3.5" aria-hidden /> Undo
        </button>
        <button type="button" onClick={() => void save()} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-ink py-1.5 text-xs font-bold text-on-brand">
          <Save className="size-3.5" aria-hidden /> Save and bake
        </button>
      </div>
      <p className="text-[11px] font-semibold text-ink/55">{strokes} strokes{message ? ` · ${message}` : ''}</p>
      {references.length ? (
        <>
          <select value={reference} onChange={(e) => setReference(e.target.value)} className="rounded-md bg-transparent text-xs ring-1 ring-ink/15" aria-label="Reference sheet">
            {references.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {reference ? (
            // eslint-disable-next-line @next/next/no-img-element -- a developer picture from the local docs
            <img src={`/api/dev/muscle-reference?file=${encodeURIComponent(reference)}`} alt="Reference sheet" className="w-full rounded-md" />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
