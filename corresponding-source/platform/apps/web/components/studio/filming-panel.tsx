'use client';
import { LightingPanel } from './lighting-panel';


import { useStudioHost } from '../../lib/studio-host';
import { useEffect, useState } from 'react';
import { FilmCamera } from '@genvr/contracts';
import { FILM_PRESETS } from '@genvr/runtime';
import type { StudioFilming } from '../../lib/use-studio-filming';
import { HistoryPanel, ShotsPanel } from './film/panels';

const BUTTON = 'rounded-lg bg-paper px-3 py-2 text-sm font-bold hover:bg-ink/10 disabled:opacity-40';
/** Left dock of Filming: the camera while shooting; the shots and history in the other workspaces (FILM-04). */
export function FilmingPanel({ filming }: { filming: StudioFilming }) {
  const host = useStudioHost();
  if (filming.studio.workspace !== 'shoot') return <div className="space-y-2 pt-1"><ShotsPanel filming={filming} /><HistoryPanel filming={filming} /></div>;
  return <div className="space-y-4">{host.userAvatarControls ? <details className="rounded-xl border border-ink/10 p-3"><summary className="cursor-pointer text-sm font-bold">Cast character</summary><p className="mt-2 text-xs text-ink/60">Choose the character for My avatar. Direct its movement and facial cues in Scene inspector.</p>{host.userAvatarControls('characters')}</details> : null}<LightingPanel filming={filming} /><CameraPanel filming={filming} /></div>;
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
    <div className="space-y-4 px-3 pb-3 text-ink">
      <p className="text-xs text-ink/60">
        Film this world with its avatars. Photos are PNG; videos are WebM, with the world's sound when "Record the world's sound" is on.
      </p>
      <button className={BUTTON} onClick={() => filming.studio.setOpen(true)}>
        Open video editor
      </button>
      <div className="grid grid-cols-2 gap-2">
        {Object.keys(FILM_PRESETS).map((name) => (
          <button
            key={name}
            disabled={filming.busy}
            aria-pressed={filming.camera?.preset === name}
            className={BUTTON}
            onClick={() => filming.preset(name as FilmCamera['preset'])}
          >
            {name}
          </button>
        ))}
      </div>
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
      <label className="flex gap-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={draft.follow_player}
          disabled={filming.busy}
          onChange={(event) => setDraft({ ...draft, follow_player: event.target.checked })}
        />
        Follow my avatar
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={BUTTON} disabled={filming.busy} onClick={() => filming.apply(draft)}>
          Apply and save camera
        </button>
        <button className={BUTTON} disabled={filming.busy} onClick={filming.load}>
          Load saved camera
        </button>
        <button className={BUTTON} disabled={filming.busy} onClick={filming.reset}>
          Gameplay camera
        </button>
      </div>
      <div className="space-y-2 border-t border-ink/10 pt-3">
        <label className="flex flex-col gap-1 text-xs font-bold">
          Output size
          <select
            aria-label="Output size"
            value={size}
            disabled={filming.busy}
            onChange={(event) => filming.setOutput({ ...filming.output, size: event.target.value })}
            className="rounded bg-paper p-2"
          >
            <option value="1280x720">HD · 1280×720</option>
            <option value="1920x1080">Full HD · 1920×1080</option>
            <option value="3840x2160">4K · 3840×2160</option>
            <option value="1080x1920">Portrait · 1080×1920</option>
          </select>
        </label>
        {number(
          'Video duration (seconds)',
          seconds,
          (value) => filming.setOutput({ ...filming.output, seconds: value }),
          1,
          30,
        )}
        <label className="flex items-center gap-2 text-xs font-bold" data-film-id="film.record.sound">
          <input type="checkbox" checked={filming.output.worldSound} disabled={filming.busy}
            onChange={(event) => filming.setOutput({ ...filming.output, worldSound: event.target.checked })} />
          Record the world's sound
        </label>
        <label className="flex items-center gap-2 text-xs font-bold" data-film-id="film.record.actors"
          title="People in this place's room are asked if their microphone may be recorded; their voices come back under the shot, one track each.">
          <input type="checkbox" checked={filming.output.liveActors} disabled={filming.busy}
            onChange={(event) => filming.setOutput({ ...filming.output, liveActors: event.target.checked })} />
          Record the actors' voices (people in the room)
        </label>
        <div className="flex flex-wrap gap-2">
          {(['photo', 'video'] as const).map((kind) => (
            <button
              key={kind}
              className={BUTTON}
              disabled={filming.busy}
              onClick={() => {
                const [width, height] = size.split('x').map(Number);
                void filming.take(kind, seconds, width!, height!);
              }}
            >
              {kind === 'photo' ? 'Download photo' : 'Record video'}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink/60">
          Encoding size may exceed the rendered detail. Movement can continue during recording.
        </p>
      </div>
      <p role="status" className="break-words text-xs font-bold text-ink/70">
        {filming.message}
      </p>
    </div>
  );
}
