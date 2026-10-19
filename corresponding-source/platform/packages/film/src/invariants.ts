import { FilmProject, LIMITS, TRACK_HOLDS, type Clip, type Track } from './model.js';
import { TICKS_PER_SECOND, end, onFrame, validRate } from './time.js';
import { effectParams } from './effects.js';
import { property } from './properties.js';
import { transitionParams, transitionProblem, type TransitionSpec } from './transitions.js';

export interface Problem { path: string; problem: string }

/** The film length: where the last clip on any track ends. */
export const filmLength = (project: FilmProject): number =>
  project.tracks.reduce((max, track) => Math.max(max, ...track.clips.map(end)), 0);

/** Media time a clip shows at most: a still image has no end. */
export const mediaEnd = (project: FilmProject, mediaId: string): number | undefined => {
  const media = project.media.find((item) => item.id === mediaId);
  return media && media.kind !== 'image' ? media.duration : undefined;
};

/** Every rule a saved or edited film must keep. An empty list means the film is valid. */
export function check(project: FilmProject): Problem[] {
  const problems: Problem[] = [];
  const add = (path: string, problem: string) => problems.push({ path, problem });
  const shape = FilmProject.safeParse(project);
  if (!shape.success) {
    for (const issue of shape.error.issues.slice(0, 20)) add(issue.path.join('.') || 'project', issue.message);
    return problems;
  }
  if (!validRate(project.rate)) add('rate', 'This frame rate cannot be timed exactly.');
  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const value of ids) { if (seen.has(value)) add(kind, `Duplicate id ${value}.`); seen.add(value); }
  };
  const allClips = project.tracks.flatMap((track) => track.clips);
  unique('media', project.media.map((m) => m.id));
  unique('tracks', project.tracks.map((t) => t.id));
  unique('clips', allClips.map((c) => c.id));
  unique('markers', project.markers.map((m) => m.id));
  // Cue sounds (`cue.audio`) are asset ids; the host that holds the media blobs checks them (`missingAssets`).
  const cueRules = (path: string, cues: FilmProject['draft'], duration?: number) => {
    unique(`${path}.cues`, cues.map((c) => c.id));
    for (const cue of cues) {
      if (cue.end <= cue.start) add(`${path}.${cue.id}`, 'A cue must end after it starts.');
      if (duration !== undefined && duration > 0 && cue.end > duration) add(`${path}.${cue.id}`, 'A cue must stay inside its recording.');
    }
  };
  for (const media of project.media) cueRules(`media.${media.id}`, media.cues, media.duration);
  cueRules('draft', project.draft);
  for (const kind of ['picture', 'sound', 'caption', 'effect'] as const)
    if (project.tracks.filter((t) => t.kind === kind).length > LIMITS.tracksPerKind) add('tracks', `At most ${LIMITS.tracksPerKind} ${kind} tracks.`);
  for (const track of project.tracks) trackRules(project, track, add);
  if (filmLength(project) > LIMITS.filmSeconds * TICKS_PER_SECOND) add('project', `The film is longer than ${LIMITS.filmSeconds} seconds.`);
  for (const marker of project.markers) if (!onFrame(marker.at, project.rate)) add(`markers.${marker.id}`, 'A marker must sit on a frame.');
  return problems;
}

function trackRules(project: FilmProject, track: Track, add: (path: string, problem: string) => void) {
  const holds = TRACK_HOLDS[track.kind];
  const sorted = [...track.clips].sort((a, b) => a.start - b.start);
  sorted.forEach((clip: Clip, index) => {
    const path = `${track.id}.${clip.id}`;
    if (clip.type !== holds.clip) add(path, `Track ${track.name} cannot hold a ${clip.type} clip.`);
    if (clip.duration <= 0) add(path, 'A clip must last at least one frame.');
    if (!onFrame(clip.start, project.rate) || !onFrame(clip.duration, project.rate)) add(path, 'A clip must start and end on a frame.');
    const next = sorted[index + 1];
    if (next && end(clip) > next.start) add(path, `Clips ${clip.id} and ${next.id} overlap on ${track.name}.`);
    const effectRule = (effect: string, params: Record<string, number | string | boolean>) => {
      try { effectParams(effect, params); } catch (error) { add(path, error instanceof Error ? error.message : 'Invalid effect.'); }
    };
    if (clip.type === 'effect') effectRule(clip.effect, clip.params);
    if (clip.type === 'media' && clip.transition) {
      try { transitionParams(clip.transition.kind, clip.transition.params); } catch (error) { add(path, error instanceof Error ? error.message : 'Invalid transition.'); }
      const why = transitionProblem(project, track, clip, clip.transition as TransitionSpec);
      if (why) add(path, why);
    }
    if (clip.keys) for (const [path, keys] of Object.entries(clip.keys)) {
      const info = property(clip, path);
      if (!info) { add(path, `${path} cannot be animated on this clip.`); continue; }
      if (new Set(keys.map((k) => k.at)).size !== keys.length) add(`${path}`, `Two keys of ${info.label} sit at the same time.`);
      for (const key of keys) {
        const point = Array.isArray(key.value);
        if (point !== (info.kind === 'point')) add(`${path}.${key.id}`, `${info.label} needs ${info.kind === 'point' ? 'an [x, y] value' : 'a number'}.`);
        const values = Array.isArray(key.value) ? key.value : [key.value];
        if (values.some((v) => v < info.min || v > info.max)) add(`${path}.${key.id}`, `${info.label} must be between ${info.min} and ${info.max}.`);
      }
    }
    if (clip.type === 'media') {
      for (const effect of clip.effects ?? []) effectRule(effect.effect, effect.params);
      if (new Set((clip.effects ?? []).map((e) => e.id)).size !== (clip.effects ?? []).length) add(path, 'Duplicate effect id on a clip.');
      const media = project.media.find((m) => m.id === clip.media);
      if (!media) { add(path, 'The clip shows a recording that is missing.'); return; }
      if (holds.media && !holds.media.includes(media.kind)) add(path, `Track ${track.name} cannot show ${media.kind}.`);
      const limit = mediaEnd(project, media.id);
      if (limit !== undefined && clip.in + clip.duration > limit) add(path, 'The clip runs past the end of its recording.');
    }
  });
}

/** Every asset id the film needs: recordings and cue sounds. */
export const neededAssets = (project: FilmProject): Set<string> => new Set([
  ...project.media.map((m) => m.asset),
  ...[...project.media.flatMap((m) => m.cues), ...project.draft].flatMap((c) => c.audio ? [c.audio] : []),
  // A person's recorded voice takes (FILM-D3) stay until they are deleted.
  ...(project.takes ?? []).map((t) => t.asset),
]);
export const missingAssets = (project: FilmProject, have: Iterable<string>): string[] => {
  const present = new Set(have);
  return [...neededAssets(project)].filter((asset) => !present.has(asset));
};

/** Throws with the first problems in words a person can read. */
export function assertValid(project: FilmProject): void {
  const problems = check(project);
  if (problems.length) throw new Error(problems.slice(0, 3).map((p) => p.problem).join(' '));
}
