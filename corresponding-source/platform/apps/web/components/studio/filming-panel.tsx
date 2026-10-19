'use client';
import { LightingPanel } from './lighting-panel';


import { useStudioHost } from '../../lib/studio-host';
import { useEffect, useState, type ReactNode } from 'react';
import { FilmCamera } from '@genvr/contracts';
import { FILM_PRESETS } from '@genvr/runtime';
import type { StudioFilming } from '../../lib/use-studio-filming';
import { HistoryPanel, ShotsPanel } from './film/panels';
import { Anchor, Camera, Circle, Clock, Drone, Film, Focus, Footprints, Hand, MoveHorizontal, Orbit, SlidersHorizontal, Users, Video, type LucideIcon } from 'lucide-react';

const BUTTON = 'rounded-lg bg-paper px-3 py-2 text-sm font-bold hover:bg-ink/10 disabled:opacity-40';
const TOOL = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-paper px-2.5 py-2 text-xs font-bold hover:bg-ink/10 disabled:opacity-40';
type LeftTab = 'camera' | 'cast' | 'shots' | 'history';
const TABS: ReadonlyArray<{ id: LeftTab; label: string; icon: LucideIcon }> = [
  { id: 'camera', label: 'Camera', icon: Video },
  { id: 'cast', label: 'Cast', icon: Users },
  { id: 'shots', label: 'Shots', icon: Film },
  { id: 'history', label: 'History', icon: Clock },
];
const MOVES: Record<string, { label: string; icon: LucideIcon }> = {
  static: { label: 'Static', icon: Anchor },
  handheld: { label: 'Handheld', icon: Hand },
  running: { label: 'Running', icon: Footprints },
  drone: { label: 'Drone', icon: Drone },
  follow: { label: 'Follow', icon: Focus },
  side: { label: 'Side', icon: MoveHorizontal },
  orbit: { label: 'Orbit', icon: Orbit },
};

/** A titled block of the left dock, with an icon like a video editor's panel header. */
function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <section aria-label={title} className="space-y-2 border-b border-ink/10 px-3 py-3 last:border-b-0">
    <h3 className="flex items-center gap-2 text-sm font-bold"><Icon className="size-4" />{title}</h3>
    {children}
  </section>;
}

/** Left dock of Filming: Camera first, then Cast, Shots and History as tabs. Shooting opens on Camera; editing opens on Shots. */
export function FilmingPanel({ filming }: { filming: StudioFilming }) {
  const host = useStudioHost();
  const shooting = filming.studio.workspace === 'shoot';
  const [tab, setTab] = useState<LeftTab>(shooting ? 'camera' : 'shots');
  useEffect(() => { setTab(shooting ? 'camera' : 'shots'); }, [shooting]);
  return <div className="text-ink">
    <div role="tablist" aria-label="Filming tools" className="sticky top-0 z-10 grid grid-cols-4 gap-0.5 border-b border-ink/10 bg-surface p-1">
      {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
        className={`flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-bold ${tab === id ? 'bg-ink text-paper' : 'text-ink/60 hover:bg-ink/5 hover:text-ink'}`}><Icon className="size-4" />{label}</button>)}
    </div>
    <div role="tabpanel" aria-label={TABS.find(t => t.id === tab)!.label}>
      {tab === 'camera' ? <CameraPanel filming={filming} /> : null}
      {tab === 'cast' ? <div className="space-y-2 p-3">{host.userAvatarControls
        ? <><p className="text-xs text-ink/60">Choose the character for My avatar. Direct its movement and facial cues on the right.</p>{host.userAvatarControls('characters')}</>
        : <p className="text-xs text-ink/60">Characters come from the host's character library. Choose the live character from Characters above the scene.</p>}</div> : null}
      {tab === 'shots' ? <div className="pt-1"><ShotsPanel filming={filming} /></div> : null}
      {tab === 'history' ? <div className="pt-1"><HistoryPanel filming={filming} /></div> : null}
    </div>
  </div>;
}

function CameraPanel({ filming }: { filming: StudioFilming }) {
  const [draft, setDraft] = useState(() => FilmCamera.parse({}));
  const { seconds, size } = filming.output;
  useEffect(() => {
    if (filming.camera) setDraft(filming.camera);
  }, [filming.camera]);
  const number = (
    label: string,
    value: number,
    change: (value: number) => void,
    min?: number,
    max?: number,
  ) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink/70">
      {label}
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step="any"
        disabled={filming.busy}
        onChange={(event) => change(Number(event.target.value))}
        className="w-full rounded bg-paper px-2 py-1.5 text-sm text-ink"
      />
    </label>
  );
  const axis = (field: 'position' | 'target') => (
    <fieldset className="space-y-1">
      <legend className="text-xs font-bold">
        {field === 'position' ? 'Camera position (world metres)' : 'Look at (world metres)'}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {(['X', 'Y', 'Z'] as const).map((label, index) => (
          <div key={label}>
            {number(
              `${field} ${label}`,
              draft[field][index]!,
              (value) => {
                const point = [...draft[field]];
                point[index] = value;
                setDraft({ ...draft, [field]: point });
              },
              -60000,
              60000,
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
  const defaults = FILM_PRESETS[draft.preset];
  return (
    <div className="text-ink">
      <Section icon={Video} title="Camera move">
        <div className="grid grid-cols-4 gap-1.5">
          {Object.keys(FILM_PRESETS).map((name) => {
            const move = MOVES[name] ?? { label: name, icon: Camera }, Icon = move.icon;
            return <button
              key={name}
              type="button"
              disabled={filming.busy}
              aria-pressed={filming.camera?.preset === name}
              title={name}
              className="flex flex-col items-center gap-1 rounded-lg border border-ink/10 bg-paper px-1 py-2 text-[11px] font-bold hover:bg-ink/10 disabled:opacity-40 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
              onClick={() => filming.preset(name as FilmCamera['preset'])}
            ><Icon className="size-4" />{move.label}</button>;
          })}
        </div>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={draft.follow_player}
            disabled={filming.busy}
            onChange={(event) => setDraft({ ...draft, follow_player: event.target.checked })}
          />
          Follow my avatar
        </label>
        <details className="rounded-lg border border-ink/10 p-2">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-bold"><SlidersHorizontal className="size-3.5" />Fine camera <span className="font-normal text-ink/55">position, lens, shake</span></summary>
          <div className="mt-2 space-y-3">
            {axis('position')}
            {axis('target')}
            <div className="grid grid-cols-2 gap-2">
              {number('Lens FOV (degrees)', draft.fov, (fov) => setDraft({ ...draft, fov }), 10, 120)}
              {number('Roll (degrees)', draft.roll, (roll) => setDraft({ ...draft, roll }), -45, 45)}
              {number(
                'Response (lower = heavier)',
                draft.responsiveness ?? defaults.responsiveness,
                (responsiveness) => setDraft({ ...draft, responsiveness }),
                0.1,
                30,
              )}
              {number(
                'Shake (metres)',
                draft.shake ?? defaults.shake,
                (shake) => setDraft({ ...draft, shake }),
                0,
                1,
              )}
              {number('Orbit speed (degrees/sec)', draft.speed, (speed) => setDraft({ ...draft, speed }), -30, 30)}
              {number('Shake seed', draft.seed, (seed) => setDraft({ ...draft, seed }), 0, 65535)}
            </div>
          </div>
        </details>
        <div className="grid grid-cols-3 gap-1.5">
          <button className={TOOL} disabled={filming.busy} onClick={() => filming.apply(draft)} title="Apply and save camera">Save camera</button>
          <button className={TOOL} disabled={filming.busy} onClick={filming.load} title="Load saved camera">Load</button>
          <button className={TOOL} disabled={filming.busy} onClick={filming.reset} title="Back to the player's own camera">Player view</button>
        </div>
      </Section>
      {/* The lighting panel brings its own titled header (shared with Build), so it is not wrapped in a second one. */}
      <div className="border-b border-ink/10 px-3 py-3"><LightingPanel filming={filming} /></div>
      <Section icon={Circle} title="Record">
        {number(
          'Video duration (seconds)',
          seconds,
          (value) => filming.setOutput({ ...filming.output, seconds: value }),
          1,
          30,
        )}
        <p className="text-xs text-ink/60">{size.replace('x', '×')} · {filming.output.worldSound ? "world sound on" : 'world sound off'} · change in Film settings</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(['photo', 'video'] as const).map((kind) => (
            <button
              key={kind}
              className={kind === 'video' ? `${TOOL} bg-red-600 text-white hover:bg-red-700` : TOOL}
              disabled={filming.busy}
              onClick={() => {
                const [width, height] = size.split('x').map(Number);
                void filming.take(kind, seconds, width!, height!);
              }}
            >
              {kind === 'photo' ? <><Camera className="size-3.5" />Download photo</> : <><Circle className="size-3 fill-current" />Record video</>}
            </button>
          ))}
        </div>
        <button className={`${BUTTON} w-full`} onClick={() => filming.studio.setOpen(true)}>
          Open video editor
        </button>
        <p className="text-xs text-ink/60">
          Photos are PNG; videos are WebM. Encoding size may exceed the rendered detail. Movement can continue during recording.
        </p>
      </Section>
      <p role="status" className="break-words px-3 pb-3 text-xs font-bold text-ink/70">
        {filming.message}
      </p>
    </div>
  );
}
