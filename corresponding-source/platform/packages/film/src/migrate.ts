import { FilmCamera } from '@genvr/contracts';
import { check } from './invariants.js';
import { emptyFilm, type FilmProject, type SceneCue } from './model.js';
import { floorFrame, fromSeconds, frame } from './time.js';

/** The first Studio Filming save: one list of shots, times in seconds. */
interface V1Cue { id: string; actor: string; label: string; action: string; start: number; end: number; text: string; audio?: string; volume: number }
interface V1Shot { id: string; asset: string; name: string; duration: number; in: number; out: number; camera: unknown; cues?: V1Cue[] }
interface V1Project { version: 1; shots: V1Shot[] }

export const CURRENT_VERSION = 2;

const cues = (list: V1Cue[] | undefined, limit?: number): SceneCue[] => (list ?? []).flatMap((c) => {
  const start = fromSeconds(c.start), stop = Math.min(fromSeconds(c.end), limit ?? Infinity);
  if (!(stop > start)) return [];
  const cue: SceneCue = { id: c.id, actor: c.actor, label: c.label, action: c.action, start, end: stop, text: c.text, volume: c.volume };
  if (c.audio) cue.audio = c.audio;
  return [cue];
});

/**
 * Turns any saved film into the current version. Version 1: each shot becomes a recording plus a
 * clip on V1, laid end to end; seconds become ticks on 30 fps frames; the next-recording plan becomes
 * the draft. Throws with the reasons when the result is not a valid film.
 */
export function migrate(saved: unknown, plan?: unknown): FilmProject {
  const version = (saved as { version?: unknown } | null)?.version;
  let project: FilmProject;
  if (version === 2) project = saved as FilmProject;
  else if (version === 1) project = fromV1(saved as V1Project, Array.isArray(plan) ? plan as V1Cue[] : []);
  else throw new Error(`Unsupported film version ${String(version)}.`);
  const problems = check(project);
  if (problems.length) throw new Error(`Saved film is damaged: ${problems.slice(0, 3).map((p) => p.problem).join(' ')}`);
  return project;
}

function fromV1(old: V1Project, plan: V1Cue[]): FilmProject {
  if (!Array.isArray(old.shots)) throw new Error('Saved film is damaged: no shot list.');
  const film = emptyFilm(), rate = film.rate, one = frame(rate);
  const v1 = film.tracks.find((t) => t.kind === 'picture')!;
  let start = 0;
  for (const shot of old.shots) {
    const duration = fromSeconds(shot.duration);
    const camera = shot.camera === null ? null : FilmCamera.safeParse(shot.camera);
    if (camera && !camera.success) throw new Error(`Saved film is damaged: shot ${shot.name} has an invalid camera.`);
    film.media.push({ id: `m-${shot.id}`, kind: 'video', asset: shot.asset, name: shot.name, duration,
      camera: camera ? camera.data : null, cues: cues(shot.cues, duration) });
    const from = floorFrame(fromSeconds(shot.in), rate);
    const length = Math.min(floorFrame(fromSeconds(shot.out) - from, rate), floorFrame(duration - from, rate));
    if (length < one) continue;
    v1.clips.push({ id: shot.id, type: 'media', media: `m-${shot.id}`, start, in: from, duration: length, name: shot.name, volume: 1 });
    start += length;
  }
  film.draft = cues(plan);
  return film;
}
