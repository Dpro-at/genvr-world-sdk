'use client';
import { LightingPanel } from './lighting-panel';


import { useStudioHost } from '../../lib/studio-host';
import { useEffect, useState, type ReactNode } from 'react';
import { FilmCamera } from '@genvr/contracts';
import { FILM_PRESETS } from '@genvr/runtime';
import type { StudioFilming } from '../../lib/use-studio-filming';
import { HistoryPanel, ShotsPanel } from './film/panels';
import { QuickVoice } from './film/quick-voice';
import { Anchor, Camera, Clock, Crosshair, Drone, Film, Focus, Footprints, FolderOpen, Hand, Info, Mic, MoveHorizontal, Orbit, Save, SlidersHorizontal, UserRound, Users, Video, type LucideIcon } from 'lucide-react';

const ICON = 'inline-flex size-8 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-40 aria-pressed:bg-ink/15 aria-pressed:ring-1 aria-pressed:ring-ink/30';
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
function Section({ icon: Icon, title, children, value, help }: { icon: LucideIcon; title: string; children: ReactNode; value?: string; help?: string }) {
  return <section aria-label={title} className="space-y-2 border-b border-ink/10 px-3 py-3 last:border-b-0">
    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink/60"><Icon className="size-4" />{title}
      {help ? <span title={help} aria-label={help} className="text-ink/45"><Info className="size-3.5" /></span> : null}
      {value ? <span className="ml-auto text-xs font-bold normal-case tracking-normal text-ink">{value}</span> : null}</h3>
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
    {/* Design v11: only the open tab shows its name; the others are icons with a tooltip. */}
    <div role="tablist" aria-label="Filming tools" className="sticky top-0 z-10 flex gap-0.5 border-b border-ink/10 bg-surface p-1">
      {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-label={label} title={label} onClick={() => setTab(id)}
        className={`flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-bold ${tab === id ? 'flex-1 bg-ink text-paper' : 'min-w-8 text-ink/60 hover:bg-ink/5 hover:text-ink'}`}><Icon className="size-4" />{tab === id ? label : null}</button>)}
    </div>
    <div role="tabpanel" aria-label={TABS.find(t => t.id === tab)!.label}>
      {tab === 'camera' ? <CameraPanel filming={filming} /> : null}
      {tab === 'cast' ? <div>
        <Section icon={Users} title="Character" help="Choose the character for My avatar. Direct its movement and face on the right.">
          {host.userAvatarControls ? host.userAvatarControls('characters') : <p className="text-xs text-ink/60">Characters come from the host's character library: choose one from Characters above the scene.</p>}
        </Section>
        {filming.voiceAvailable ? <Section icon={Mic} title="Voice"><QuickVoice filming={filming} /></Section> : null}
      </div> : null}
      {tab === 'shots' ? <div className="pt-1"><ShotsPanel filming={filming} /></div> : null}
      {tab === 'history' ? <div className="pt-1"><HistoryPanel filming={filming} /></div> : null}
    </div>
  </div>;
}

function CameraPanel({ filming }: { filming: StudioFilming }) {
  const [draft, setDraft] = useState(() => FilmCamera.parse({}));
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
      <Section icon={Video} title="Camera move" value={MOVES[filming.camera?.preset ?? '']?.label ?? 'Player view'}>
        <div className="flex flex-wrap gap-1">
          {Object.keys(FILM_PRESETS).map((name) => {
            const move = MOVES[name] ?? { label: name, icon: Camera }, Icon = move.icon;
            return <button
              key={name}
              type="button"
              disabled={filming.busy}
              aria-pressed={filming.camera?.preset === name}
              title={move.label}
              aria-label={move.label}
              className="inline-flex size-9 items-center justify-center rounded-md border border-ink/10 bg-paper hover:bg-ink/10 disabled:opacity-40 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
              onClick={() => filming.preset(name as FilmCamera['preset'])}
            ><Icon className="size-4" /></button>;
          })}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={ICON} aria-label="Follow my avatar" title="Follow my avatar (on / off)" aria-pressed={draft.follow_player} disabled={filming.busy}
            onClick={() => { const next = { ...draft, follow_player: !draft.follow_player }; setDraft(next); filming.apply(next); }}><Crosshair className="size-4" /></button>
          <span className="mx-1 h-5 w-px bg-ink/15" />
          <button type="button" className={ICON} disabled={filming.busy} onClick={() => filming.apply(draft)} aria-label="Save camera" title="Apply and save camera"><Save className="size-4" /></button>
          <button type="button" className={ICON} disabled={filming.busy} onClick={filming.load} aria-label="Load camera" title="Load saved camera"><FolderOpen className="size-4" /></button>
          <button type="button" className={ICON} disabled={filming.busy} onClick={filming.reset} aria-label="Player view" title="Back to the player's own camera"><UserRound className="size-4" /></button>
        </div>
        <details className="rounded-lg border border-ink/10 p-2">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-bold"><SlidersHorizontal className="size-3.5" />Fine camera <span className="ml-auto font-normal text-ink/55">{draft.position.join(', ')} · {draft.fov}°</span></summary>
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
      </Section>
      {/* The lighting panel brings its own titled header (shared with Build), so it is not wrapped in a second one. */}
      <div className="border-b border-ink/10 px-3 py-3"><LightingPanel filming={filming} /></div>
      <p className="px-3 pt-3 text-xs text-ink/55">Record shot, Live take, Photo and the take length are in the bar above the scene. Video size and sound are in Film settings.</p>
      <p role="status" className="break-words px-3 pb-3 text-xs font-bold text-ink/70">
        {filming.message}
      </p>
    </div>
  );
}
