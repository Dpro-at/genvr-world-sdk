import { LIMITS, TRACK_HOLDS, newTrack, trackPrefix, type CaptionClip, type Clip, type EffectClip, type FilmProject, type Marker,
  type Media, type MediaClip, type SceneCue, type Track, type TrackKind } from './model.js';
import { assertValid, filmLength, mediaEnd } from './invariants.js';
import { IDENTITY_TRANSFORM, type Transform } from './model.js';
import { LOOKS, MAX_CLIP_EFFECTS, effectParams, type BlendMode, type EffectValues } from './effects.js';
import { presetSides, type EasePreset, type Key, type KeyValue, type Side } from './animate.js';
import { keyTime, property, setStaticValue, valueAt } from './properties.js';
import { DEFAULT_TITLE, TEMPLATES, presetAnimator, type Animator, type TemplateId, type TitleStyle } from './titles.js';
import { transitionParams, type TransitionKind } from './transitions.js';
import { end, frame, type Tick } from './time.js';

/** A refused edit; the message says why in words a person can act on. */
export class EditError extends Error { override name = 'EditError'; }
function refuse(message: string): never { throw new EditError(message); }

/** Fresh ids for new clips, tracks and markers. */
export interface EditContext { id(): string }

/**
 * Runs edits on a copy and keeps the copy only when every edit succeeded and the result passes
 * every invariant. All-or-nothing: on any error the original project is untouched.
 */
export function transact(project: FilmProject, edit: (draft: FilmProject) => void): FilmProject {
  const draft = structuredClone(project);
  edit(draft);
  for (const track of draft.tracks) track.clips.sort((a, b) => a.start - b.start);
  // A clip whose neighbour went away (delete, trim, move) loses the transition it already had instead of
  // blocking the edit; a transition this edit adds is still checked and refused with its reason.
  const had = new Set(project.tracks.flatMap((t) => t.clips.filter((c) => c.type === 'media' && c.transition).map((c) => c.id)));
  for (const track of draft.tracks) for (const clip of track.clips)
    if (clip.type === 'media' && clip.transition && had.has(clip.id) && !track.clips.some((c) => c.type === 'media' && c.id !== clip.id && end(c) === clip.start)) delete clip.transition;
  try { assertValid(draft); } catch (error) { throw new EditError(error instanceof Error ? error.message : 'Invalid edit.'); }
  return draft;
}

export function track(project: FilmProject, trackId: string): Track {
  return project.tracks.find((t) => t.id === trackId) ?? refuse(`Track ${trackId} not found.`);
}
export function findClip(project: FilmProject, clipId: string): { track: Track; clip: Clip } {
  for (const t of project.tracks) {
    const clip = t.clips.find((c) => c.id === clipId);
    if (clip) return { track: t, clip };
  }
  return refuse(`Clip ${clipId} not found.`);
}
const unlocked = (t: Track): Track => t.locked ? refuse(`Track ${t.name} is locked.`) : t;
const minFrame = (project: FilmProject, duration: Tick) => { if (duration < frame(project.rate)) refuse('A clip must last at least one frame.'); };

/** Clears [start, start+duration) on a track: clips inside go, clips across the edges are shortened or cut in two. */
function clearRange(t: Track, start: Tick, duration: Tick, ctx: EditContext, keep?: string) {
  const stop = start + duration, out: Clip[] = [];
  for (const clip of t.clips) {
    if (clip.id === keep || end(clip) <= start || clip.start >= stop) { out.push(clip); continue; }
    if (clip.start < start) out.push(shorten(clip, 0, start - clip.start));
    if (end(clip) > stop) out.push(shorten({ ...clip, id: clip.start < start ? ctx.id() : clip.id }, stop - clip.start, end(clip) - stop));
  }
  t.clips = out;
}
/** The part of a clip that begins `offset` ticks into it and lasts `duration`. */
function shorten<C extends Clip>(clip: C, offset: Tick, duration: Tick): C {
  // A deep copy: the two halves of a split must never share transform, effects or keys.
  const part = { ...structuredClone(clip), start: clip.start + offset, duration };
  if (part.type === 'media') (part as MediaClip).in = (clip as MediaClip).in + offset;
  // Captions and adjustment layers count keys from their own start: keep every key on its film moment.
  else shiftKeys(part, -offset);
  if (part.type === 'media') {
    // The transition and the fade in belong to the clip's first moment, the fade out to its last.
    const media = part as MediaClip;
    if (offset > 0) delete media.transition;
    if (media.fade) {
      const fade = { in: offset > 0 ? 0 : media.fade.in, out: offset + duration < clip.duration ? 0 : media.fade.out };
      if (fade.in || fade.out) media.fade = fade; else delete media.fade;
    }
  }
  return part;
}
/** Moves every key of a caption or adjustment layer by `delta` on its own clock (`only` limits it to some lanes). */
function shiftKeys(clip: Clip, delta: Tick, only?: (path: string) => boolean) {
  if (clip.type === 'media' || !clip.keys || !delta) return;
  for (const [path, keys] of Object.entries(clip.keys)) if (!only || only(path)) for (const k of keys) k.at += delta;
}
/** Lanes of title animators made from an edge preset ("in" follows the start, "out" follows the end). */
function edgeLanes(clip: Clip, edge: 'in' | 'out'): (path: string) => boolean {
  const ids = new Set(clip.type === 'caption' ? (clip.animators ?? []).filter((a) => a.preset?.endsWith(`:${edge}`)).map((a) => a.id) : []);
  return (path) => ids.has(path.split('.')[1] ?? '');
}
/**
 * After the start edge of a caption or adjustment layer moved by `delta`: its keys stay on their film
 * moments, except an "in" title animation, which stays with the start.
 */
function startMoved(clip: Clip, delta: Tick) {
  const pinned = edgeLanes(clip, 'in');
  shiftKeys(clip, -delta, (path) => !pinned(path));
}
/** After the end edge moved by `delta`: an "out" title animation stays with the end. */
function endMoved(clip: Clip, delta: Tick) { shiftKeys(clip, delta, edgeLanes(clip, 'out')); }
/** Cuts the clip that spans `at` into two (no-op when `at` is on an edge or a gap). Returns the new right part id. */
function cutAt(t: Track, at: Tick, ctx: EditContext): string | undefined {
  const clip = t.clips.find((c) => c.start < at && end(c) > at);
  if (!clip) return undefined;
  const right = shorten({ ...clip, id: ctx.id() }, at - clip.start, end(clip) - at);
  if (right.type === 'media' && right.name) right.name = `${right.name} (2)`.slice(0, 120);
  Object.assign(clip, shorten(clip, 0, at - clip.start));
  t.clips.push(right);
  return right.id;
}
const shiftFrom = (t: Track, at: Tick, delta: Tick, except?: string) => {
  for (const clip of t.clips) if (clip.id !== except && clip.start >= at) clip.start += delta;
};
/**
 * Ripple on every track (FILM-15, owner N-067), as editors do with synced tracks: on the other unlocked tracks (sound,
 * subtitles, voices, effects, titles) and the markers, a longer clip pushes what starts after `at` later; a shorter or
 * deleted clip takes the same stretch of time out of them: clips inside it go, clips across its edges are shortened,
 * and everything after moves up, so cutting a video never leaves the rest behind.
 */
const shiftOthers = (project: FilmProject, own: Track, at: Tick, delta: Tick) => {
  if (delta > 0) {
    for (const t of project.tracks) if (t !== own && !t.locked) for (const c of t.clips) if (c.start >= at) c.start += delta;
    for (const m of project.markers) if (m.at >= at) m.at += delta;
    return;
  }
  const from = at + delta, to = at, cut = to - from, step = frame(project.rate);
  for (const t of project.tracks) {
    if (t === own || t.locked) continue;
    t.clips = t.clips.flatMap((c): Clip[] => {
      const e = end(c);
      if (e <= from) return [c];
      if (c.start >= to) { c.start -= cut; return [c]; }
      if (c.start >= from && e <= to) return [];
      if (c.start < from && e > to) { c.duration -= cut; endMoved(c, -cut); return [c]; }
      if (c.start < from) { const by = e - from; if (c.duration - by < step) return []; c.duration -= by; endMoved(c, -by); return [c]; }
      const by = to - c.start; // starts inside the cut, ends after it
      if (c.duration - by < step) return [];
      if (c.type === 'media') c.in += by;
      c.duration -= by; c.start = from; startMoved(c, by);
      return [c];
    });
  }
  for (const m of project.markers) if (m.at >= to) m.at -= cut; else if (m.at > from) m.at = from;
};
const accepts = (project: FilmProject, t: Track, clip: Clip) => {
  const holds = TRACK_HOLDS[t.kind];
  if (clip.type !== holds.clip) refuse(`Track ${t.name} cannot hold a ${clip.type} clip.`);
  if (clip.type === 'media') {
    const media = project.media.find((m) => m.id === clip.media) ?? refuse('That recording is not in this film.');
    if (holds.media && !holds.media.includes(media.kind)) refuse(`Track ${t.name} cannot show ${media.kind}.`);
  }
};
/** Puts a clip on a track: overwrite clears the range, insert pushes later clips right. */
function put(project: FilmProject, t: Track, clip: Clip, mode: 'overwrite' | 'insert', ctx: EditContext) {
  unlocked(t); accepts(project, t, clip); minFrame(project, clip.duration);
  if (t.clips.length >= LIMITS.clipsPerTrack) refuse(`Track ${t.name} already has ${LIMITS.clipsPerTrack} clips.`);
  if (mode === 'insert') { cutAt(t, clip.start, ctx); shiftFrom(t, clip.start, clip.duration, clip.id); }
  else clearRange(t, clip.start, clip.duration, ctx, clip.id);
  t.clips.push(clip);
}

// ---------- media ----------

export function addMedia(project: FilmProject, media: Media) {
  if (project.media.some((m) => m.id === media.id)) refuse('That recording is already in the film.');
  if (project.media.length >= LIMITS.media) refuse(`A film holds at most ${LIMITS.media} recordings.`);
  project.media.push(media);
}
/** Removes a recording that no clip uses (its file leaves the browser with the next save). */
export function removeMedia(project: FilmProject, mediaId: string) {
  if (!project.media.some((m) => m.id === mediaId)) refuse('Recording not found.');
  const used = project.tracks.reduce((n, t) => n + t.clips.filter((c) => c.type === 'media' && c.media === mediaId).length, 0);
  if (used) refuse(`This recording is used by ${used} clip${used > 1 ? 's' : ''} on the timeline; remove them first.`);
  project.media = project.media.filter((m) => m.id !== mediaId);
}
/** Swaps the recording a media item points to (re-record a shot); clips keep their place. */
export function replaceMedia(project: FilmProject, mediaId: string, next: Pick<Media, 'asset' | 'duration' | 'camera' | 'cues'> & { hasSound?: boolean }) {
  const media = project.media.find((m) => m.id === mediaId) ?? refuse('Recording not found.');
  Object.assign(media, next);
  for (const t of project.tracks) for (const clip of t.clips) {
    if (clip.type !== 'media' || clip.media !== mediaId || media.kind === 'image') continue;
    clip.in = Math.min(clip.in, Math.max(0, media.duration - frame(project.rate)));
    clip.duration = Math.min(clip.duration, Math.floor((media.duration - clip.in) / frame(project.rate)) * frame(project.rate));
  }
  for (const t of project.tracks) t.clips = t.clips.filter((c) => c.duration > 0);
}

// ---------- edits ----------

export interface PlaceArgs { media: string; track: string; start: Tick; in?: Tick; duration?: Tick; mode: 'overwrite' | 'insert'; volume?: number }
export function place(project: FilmProject, args: PlaceArgs, ctx: EditContext): string {
  const t = track(project, args.track);
  const limit = mediaEnd(project, args.media), from = args.in ?? 0;
  const rest = limit === undefined ? 5 * frame(project.rate) * Math.round(project.rate.num / project.rate.den) : limit - from;
  const available = Math.floor(rest / frame(project.rate)) * frame(project.rate);
  const duration = Math.min(args.duration ?? available, available);
  if (duration <= 0) refuse('Nothing of the recording is left after that point.');
  const clip: MediaClip = { id: ctx.id(), type: 'media', start: args.start, duration, media: args.media, in: from, volume: args.volume ?? 1 };
  put(project, t, clip, args.mode, ctx);
  return clip.id;
}

/** Places a recording at the end of the first picture track (what a new studio recording does). */
export function append(project: FilmProject, mediaId: string, ctx: EditContext): string {
  const t = project.tracks.find((x) => x.kind === 'picture' && !x.locked) ?? refuse('Add an unlocked picture track first.');
  const start = t.clips.reduce((max, c) => Math.max(max, end(c)), 0);
  return place(project, { media: mediaId, track: t.id, start, mode: 'overwrite' }, ctx);
}

export function move(project: FilmProject, args: { clip: string; track?: string; start: Tick; mode: 'overwrite' | 'insert' }, ctx: EditContext) {
  const from = findClip(project, args.clip), to = args.track ? track(project, args.track) : from.track;
  unlocked(from.track);
  from.track.clips = from.track.clips.filter((c) => c.id !== args.clip);
  put(project, to, { ...from.clip, start: args.start }, args.mode, ctx);
}

/** Moves one edge. Normal leaves or uses a gap; ripple moves the later clips on the same track with it. */
export function trim(project: FilmProject, args: { clip: string; edge: 'start' | 'end'; delta: Tick; ripple: boolean; sync?: boolean }) {
  const { track: t, clip } = findClip(project, args.clip);
  unlocked(t);
  if (args.delta === 0) refuse('Nothing to trim.');
  const limit = clip.type === 'media' ? mediaEnd(project, clip.media) : undefined;
  const oldEnd = end(clip);
  if (args.edge === 'end') {
    const duration = clip.duration + args.delta;
    minFrame(project, duration);
    if (clip.type === 'media' && limit !== undefined && clip.in + duration > limit) refuse('Not enough recording after this clip to make it longer.');
    if (args.ripple) { shiftFrom(t, oldEnd, args.delta, clip.id); if (args.sync) shiftOthers(project, t, oldEnd, args.delta); }
    clip.duration = duration; endMoved(clip, args.delta);
  } else if (args.ripple) {
    // Ripple on the start edge keeps the clip in place, changes what it shows, and moves later clips.
    const duration = clip.duration - args.delta;
    minFrame(project, duration);
    if (clip.type === 'media') {
      if (clip.in + args.delta < 0) refuse('Not enough recording before this clip to make it longer.');
      clip.in += args.delta;
    }
    shiftFrom(t, oldEnd, -args.delta, clip.id);
    if (args.sync) shiftOthers(project, t, oldEnd, -args.delta);
    clip.duration = duration; startMoved(clip, args.delta);
  } else {
    const start = clip.start + args.delta, duration = clip.duration - args.delta;
    minFrame(project, duration);
    if (start < 0) refuse('A clip cannot start before the film.');
    if (clip.type === 'media') {
      if (clip.in + args.delta < 0) refuse('Not enough recording before this clip to make it longer.');
      clip.in += args.delta;
    }
    clip.start = start; clip.duration = duration; startMoved(clip, args.delta);
  }
  if (!args.ripple) {
    const others = t.clips.filter((c) => c.id !== clip.id);
    if (others.some((c) => c.start < end(clip) && end(c) > clip.start)) refuse(`The clip would cover its neighbour on ${t.name}; use ripple trim.`);
  }
}

/** Cuts clips at `at`: on the given clips, on the given tracks, or on every unlocked track. Returns the new right parts. */
export function split(project: FilmProject, args: { at: Tick; clips?: string[]; tracks?: string[] }, ctx: EditContext): string[] {
  const made: string[] = [];
  if (args.clips?.length) {
    for (const clipId of args.clips) {
      const { track: t, clip } = findClip(project, clipId);
      unlocked(t);
      if (!(clip.start < args.at && end(clip) > args.at)) refuse(`Clip ${clipId} is not under the playhead.`);
      made.push(cutAt(t, args.at, ctx)!);
    }
  } else {
    const tracks = args.tracks?.length ? args.tracks.map((x) => unlocked(track(project, x))) : project.tracks.filter((t) => !t.locked);
    for (const t of tracks) { const right = cutAt(t, args.at, ctx); if (right) made.push(right); }
  }
  if (!made.length) refuse('No clip to cut at this time.');
  return made;
}

/** Lift leaves a gap; ripple closes it on that track. */
export function remove(project: FilmProject, args: { clips: string[]; ripple: boolean; sync?: boolean }) {
  if (!args.clips.length) refuse('Select a clip first.');
  const found = args.clips.map((x) => findClip(project, x));
  for (const { track: t } of found) unlocked(t);
  for (const { track: t, clip } of [...found].sort((a, b) => b.clip.start - a.clip.start)) {
    t.clips = t.clips.filter((c) => c.id !== clip.id);
    if (args.ripple) { shiftFrom(t, end(clip), -clip.duration); if (args.sync) shiftOthers(project, t, end(clip), -clip.duration); }
  }
}

/** Shows a different part of the recording; the clip keeps its place and length. */
export function slip(project: FilmProject, args: { clip: string; delta: Tick }) {
  const { track: t, clip } = findClip(project, args.clip);
  unlocked(t);
  if (clip.type !== 'media') refuse('Only recordings can be slipped.');
  const limit = mediaEnd(project, clip.media);
  const next = clip.in + args.delta;
  if (next < 0 || (limit !== undefined && next + clip.duration > limit)) refuse('The recording is not long enough to slip that far.');
  clip.in = next;
}

/** The clip right after `clip` on its track when they touch (a cut), else undefined. */
function touchingAfter(t: Track, clip: Clip) { return t.clips.find((c) => c.id !== clip.id && c.start === end(clip)); }
function touchingBefore(t: Track, clip: Clip) { return t.clips.find((c) => c.id !== clip.id && end(c) === clip.start); }

/** Shortens or lengthens the start of a recording clip by `delta`, keeping its end (its `in` follows). */
function moveStartEdge(project: FilmProject, clip: Clip, delta: Tick) {
  const duration = clip.duration - delta;
  minFrame(project, duration);
  if (clip.type === 'media' && clip.in + delta < 0) refuse('Not enough recording before the cut.');
  if (clip.type === 'media') clip.in += delta;
  clip.start += delta; clip.duration = duration; startMoved(clip, delta);
}
/** Shortens or lengthens the end of a clip by `delta`, keeping its start. */
function moveEndEdge(project: FilmProject, clip: Clip, delta: Tick) {
  const duration = clip.duration + delta;
  minFrame(project, duration);
  const limit = clip.type === 'media' ? mediaEnd(project, clip.media) : undefined;
  if (clip.type === 'media' && limit !== undefined && clip.in + duration > limit) refuse('Not enough recording after the cut.');
  clip.duration = duration; endMoved(clip, delta);
}

/**
 * Rolling edit: moves the cut at the end of `clip` by `delta`. The clip and the one after it change
 * length together, so nothing else on the track moves and the film keeps its length.
 */
export function roll(project: FilmProject, args: { clip: string; delta: Tick }) {
  const { track: t, clip } = findClip(project, args.clip);
  unlocked(t);
  if (args.delta === 0) refuse('Nothing to roll.');
  const next = touchingAfter(t, clip);
  if (!next) refuse('There is no cut at the end of this clip (the next clip must touch it).');
  moveEndEdge(project, clip, args.delta);
  moveStartEdge(project, next, args.delta);
}

/**
 * Slide edit: moves `clip` by `delta` keeping what it shows; the clips touching it on each side
 * give or take the time, so the film keeps its length.
 */
export function slide(project: FilmProject, args: { clip: string; delta: Tick }) {
  const { track: t, clip } = findClip(project, args.clip);
  unlocked(t);
  if (args.delta === 0) refuse('Nothing to slide.');
  const before = touchingBefore(t, clip), after = touchingAfter(t, clip);
  if (clip.start + args.delta < 0) refuse('A clip cannot start before the film.');
  if (before) moveEndEdge(project, before, args.delta);
  if (after) moveStartEdge(project, after, args.delta);
  clip.start += args.delta;
  const others = t.clips.filter((c) => c.id !== clip.id);
  if (others.some((c) => c.start < end(clip) && end(c) > clip.start)) refuse(`The clip would cover a neighbour on ${t.name}.`);
}

/** Removes the empty space at `at` on a track by moving the later clips left. */
export function closeGap(project: FilmProject, args: { track: string; at: Tick }) {
  const t = unlocked(track(project, args.track));
  if (t.clips.some((c) => c.start <= args.at && end(c) > args.at)) refuse('There is no gap at this time.');
  const before = t.clips.filter((c) => end(c) <= args.at).reduce((max, c) => Math.max(max, end(c)), 0);
  const after = t.clips.filter((c) => c.start > args.at).reduce((min, c) => Math.min(min, c.start), Infinity);
  if (!Number.isFinite(after)) refuse('There is nothing after this gap.');
  shiftFrom(t, after, before - after);
}

export function setClip(project: FilmProject, args: { clip: string; volume?: number; name?: string; text?: string; style?: CaptionClip['style'] }) {
  const { track: t, clip } = findClip(project, args.clip);
  unlocked(t);
  if (clip.type === 'media') {
    if (args.volume !== undefined) clip.volume = args.volume;
    if (args.name !== undefined) clip.name = args.name;
  } else if (clip.type === 'caption') {
    if (args.text !== undefined) clip.text = args.text;
    if (args.style !== undefined) clip.style = args.style;
  } else refuse('Effect settings arrive with the compositor (FILM-05).');
}

// ---------- tracks ----------

export function addTrack(project: FilmProject, kind: TrackKind, ctx: EditContext): string {
  const same = project.tracks.filter((t) => t.kind === kind);
  if (same.length >= LIMITS.tracksPerKind) refuse(`At most ${LIMITS.tracksPerKind} ${kind} tracks.`);
  let number = same.length + 1;
  while (project.tracks.some((t) => t.name === `${trackPrefix(kind)}${number}`)) number++;
  const made = newTrack(kind, number, ctx.id());
  // New picture tracks sit above the pictures (drawn on top); effect tracks go to the very top so they adjust
  // everything below them; the rest go below their kind.
  const index = kind === 'effect' ? 0 : kind === 'picture' ? project.tracks.findIndex((t) => t.kind === 'picture')
    : project.tracks.reduce((at, t, i) => t.kind === kind ? i + 1 : at, -1);
  project.tracks.splice(index < 0 ? project.tracks.length : index, 0, made);
  return made.id;
}
export function removeTrack(project: FilmProject, trackId: string) {
  const t = unlocked(track(project, trackId));
  if (t.clips.length) refuse(`Track ${t.name} still has clips.`);
  project.tracks = project.tracks.filter((x) => x.id !== trackId);
}
export function setTrack(project: FilmProject, args: { track: string; name?: string; locked?: boolean; muted?: boolean; solo?: boolean; hidden?: boolean }) {
  const t = track(project, args.track);
  for (const key of ['name', 'locked', 'muted', 'solo', 'hidden'] as const) if (args[key] !== undefined) (t as Record<string, unknown>)[key] = args[key];
}
export function moveTrack(project: FilmProject, args: { track: string; index: number }) {
  const t = track(project, args.track);
  const rest = project.tracks.filter((x) => x.id !== t.id);
  rest.splice(Math.max(0, Math.min(rest.length, args.index)), 0, t);
  project.tracks = rest;
}

// ---------- captions, cues, markers ----------

export function addCaption(project: FilmProject, args: { track?: string; start: Tick; duration: Tick; text: string; style: CaptionClip['style']; mode: 'overwrite' | 'insert' }, ctx: EditContext): string {
  const t = args.track ? track(project, args.track) : project.tracks.find((x) => x.kind === 'caption' && !x.locked) ?? refuse('Add an unlocked caption track first.');
  const clip: CaptionClip = { id: ctx.id(), type: 'caption', start: args.start, duration: args.duration, text: args.text, style: args.style };
  put(project, t, clip, args.mode, ctx);
  return clip.id;
}

/** One timed subtitle line in film ticks (FILM-12). */
export interface SubtitleLine { start: Tick; end: Tick; text: string }

/**
 * Writes the subtitles of one language (FILM-12): its caption track (made when missing, tagged with `lang`) gets one
 * subtitle clip per line, in time order; a line that runs into the next is cut at the next one's start. `show` makes
 * it the shown language (the other language tracks are hidden).
 */
export function setSubtitles(project: FilmProject, args: { lang: string; name: string; lines: SubtitleLine[]; show: boolean }, ctx: EditContext): string {
  let t = project.tracks.find((x) => x.kind === 'caption' && x.lang === args.lang);
  // A new language that is not to be shown starts hidden, so only one language is ever drawn.
  if (!t) { const id = addTrack(project, 'caption', ctx); t = track(project, id); t.lang = args.lang; t.hidden = !args.show; }
  unlocked(t);
  t.name = args.name;
  const lines = args.lines.filter((l) => l.text.trim() && l.end > l.start).sort((a, b) => a.start - b.start);
  t.clips = lines.flatMap((line, i): Clip[] => {
    const end = Math.min(line.end, lines[i + 1]?.start ?? line.end);
    return end > line.start ? [{ id: ctx.id(), type: 'caption', start: line.start, duration: end - line.start, text: line.text.trim().slice(0, 2000), style: 'subtitle' }] : [];
  }).slice(0, LIMITS.clipsPerTrack);
  if (args.show) showSubtitles(project, args.lang);
  return t.id;
}
/**
 * Shows the subtitles of one language and hides the other language tracks; null hides them all (FILM-12). Spoken voices
 * (FILM-12b, sound tracks with a language) follow: only the shown language's voice plays.
 */
export function showSubtitles(project: FilmProject, lang: string | null) {
  for (const t of project.tracks) if (t.kind === 'caption' && t.lang) t.hidden = t.lang !== lang;
  for (const t of project.tracks) if (t.kind === 'sound' && t.lang) t.muted = t.lang !== lang;
}

/**
 * The spoken voice of one language (FILM-12b): its sound track (made when missing, tagged with `lang`) holds the one
 * recording of the whole film's lines in that language, from the film's start, as dialogue.
 */
export function setVoice(project: FilmProject, args: { lang: string; name: string; media: string; append?: boolean; start?: Tick }, ctx: EditContext): string {
  const media = project.media.find((m) => m.id === args.media) ?? refuse('Recording not found.');
  if (media.kind !== 'audio') refuse('A voice must be a sound file.');
  let t = project.tracks.find((x) => x.kind === 'sound' && x.lang === args.lang);
  if (!t) { const id = addTrack(project, 'sound', ctx); t = track(project, id); t.lang = args.lang; }
  unlocked(t);
  t.name = args.name;
  const shown = project.tracks.find((x) => x.kind === 'caption' && x.lang && !x.hidden)?.lang;
  t.muted = shown !== undefined && shown !== args.lang;
  // The clip ends on the last whole frame of the voice.
  const step = frame(project.rate), duration = Math.floor(media.duration / step) * step;
  if (duration < step) refuse('The voice is shorter than one frame.');
  const start = args.start ?? 0;
  if (args.append && t.clips.some(c => start < c.start + c.duration && start + duration > c.start)) refuse('The new dialogue overlaps existing language audio.');
  const clip: MediaClip = { id: ctx.id(), type: 'media', media: media.id, start, in: 0, duration, volume: 1, soundType: 'dialogue' };
  t.clips = args.append ? [...t.clips, clip].sort((a,b) => a.start-b.start) : [clip];
  return t.id;
}

/**
 * An actor's voice from a live take (FILM-11): on the actor's own sound track (made when missing, named after them),
 * from `start` on the film, as dialogue; whatever was under it on that track is replaced.
 */
export function placeActorVoice(project: FilmProject, args: { media: string; name: string; start: Tick }, ctx: EditContext): string {
  const media = project.media.find((m) => m.id === args.media) ?? refuse('Recording not found.');
  if (media.kind !== 'audio') refuse('An actor voice must be a sound file.');
  let t = project.tracks.find((x) => x.kind === 'sound' && !x.lang && x.name === args.name);
  if (!t) { const id = addTrack(project, 'sound', ctx); t = track(project, id); t.name = args.name; }
  unlocked(t);
  const step = frame(project.rate), start = Math.round(args.start / step) * step, duration = Math.floor(media.duration / step) * step;
  if (duration < step) refuse('The voice is shorter than one frame.');
  const clip: MediaClip = { id: ctx.id(), type: 'media', media: media.id, start, in: 0, duration, volume: 1, soundType: 'dialogue' };
  put(project, t, clip, 'overwrite', ctx);
  return clip.id;
}

/** Replaces the cues of a recording, or the draft for the next recording when `media` is left out. */
export function setCues(project: FilmProject, args: { media?: string; cues: SceneCue[] }) {
  if (args.media) (project.media.find((m) => m.id === args.media) ?? refuse('Recording not found.')).cues = args.cues;
  else project.draft = args.cues;
}

/** Marks In and / or Out of the film's range; In must stay before Out. */
export function setRange(project: FilmProject, args: { in?: Tick; out?: Tick }) {
  const length = filmLength(project), current = project.range ?? { in: 0, out: length };
  const next = { in: args.in ?? current.in, out: args.out ?? current.out };
  if (next.in < 0) refuse('In cannot be before the film.');
  if (next.out <= next.in) refuse(args.out !== undefined ? 'Out must come after In.' : 'In must come before Out.');
  project.range = next;
}
export function clearInOut(project: FilmProject) {
  if (!project.range) refuse('No In / Out is marked.');
  delete project.range;
}

export function addMarker(project: FilmProject, args: { at: Tick; label: string; color: Marker['color'] }, ctx: EditContext): string {
  if (project.markers.length >= LIMITS.markers) refuse(`At most ${LIMITS.markers} markers.`);
  const marker = { id: ctx.id(), ...args };
  project.markers.push(marker);
  return marker.id;
}
export function setMarker(project: FilmProject, args: { marker: string; at?: Tick; label?: string; color?: Marker['color'] }) {
  const marker = project.markers.find((m) => m.id === args.marker) ?? refuse('Marker not found.');
  if (args.at !== undefined) marker.at = args.at;
  if (args.label !== undefined) marker.label = args.label;
  if (args.color !== undefined) marker.color = args.color;
}
export function removeMarker(project: FilmProject, markerId: string) {
  if (!project.markers.some((m) => m.id === markerId)) refuse('Marker not found.');
  project.markers = project.markers.filter((m) => m.id !== markerId);
}

// ---------- picture layers (FILM-05) ----------

function mediaClip(project: FilmProject, clipId: string): MediaClip {
  const { track: t, clip } = findClip(project, clipId);
  unlocked(t);
  if (clip.type !== 'media') refuse('Only recordings and pictures have effects.');
  return clip;
}
/** Recordings and titles can be placed, turned and blended. */
function layerClip(project: FilmProject, clipId: string): MediaClip | CaptionClip {
  const { track: t, clip } = findClip(project, clipId);
  unlocked(t);
  if (clip.type === 'media' || (clip.type === 'caption' && clip.title)) return clip;
  return refuse(clip.type === 'caption' ? 'Make this caption a title first (title.style) to move or blend it.' : 'Only recordings, pictures and titles have a transform and blend mode.');
}
export function setTransform(project: FilmProject, args: { clip: string } & Partial<Transform>) {
  const clip = layerClip(project, args.clip);
  const change = Object.fromEntries(Object.entries(args).filter(([key, value]) => key !== 'clip' && value !== undefined)) as Partial<Transform>;
  clip.transform = { ...(clip.transform ?? IDENTITY_TRANSFORM), ...change };
}
export function setBlend(project: FilmProject, args: { clip: string; mode: BlendMode }) {
  layerClip(project, args.clip).blend = args.mode;
}
export function addEffect(project: FilmProject, args: { clip: string; effect: string; params?: EffectValues }, ctx: EditContext): string {
  const clip = mediaClip(project, args.clip);
  if (args.effect === 'particles') refuse('Particles cover the whole frame: add them as an adjustment layer (adjustment.add).');
  if ((clip.effects?.length ?? 0) >= MAX_CLIP_EFFECTS) refuse(`A clip holds at most ${MAX_CLIP_EFFECTS} effects.`);
  const effect = { id: ctx.id(), effect: args.effect, params: checked(args.effect, args.params), enabled: true };
  clip.effects = [...(clip.effects ?? []), effect];
  return effect.id;
}
const checked = (effect: string, params?: EffectValues) => {
  try { return effectParams(effect, params); } catch (error) { return refuse(error instanceof Error ? error.message : 'Invalid effect.'); }
};
/** Changes a clip effect (by its id), or the settings of an adjustment layer when `clip` is one. */
export function setEffect(project: FilmProject, args: { clip: string; effect?: string; params?: EffectValues; enabled?: boolean }) {
  const { track: t, clip } = findClip(project, args.clip);
  unlocked(t);
  if (clip.type === 'effect') {
    if (args.params) clip.params = checked(clip.effect, { ...clip.params, ...args.params });
    return;
  }
  if (clip.type !== 'media') refuse('Captions have no effects yet (titles come with FILM-01).');
  const effect = clip.effects?.find((e) => e.id === args.effect) ?? refuse('Effect not found on this clip.');
  if (args.params) effect.params = checked(effect.effect, { ...effect.params, ...args.params });
  if (args.enabled !== undefined) effect.enabled = args.enabled;
}
export function removeEffect(project: FilmProject, args: { clip: string; effect: string }) {
  const clip = mediaClip(project, args.clip);
  if (!clip.effects?.some((e) => e.id === args.effect)) refuse('Effect not found on this clip.');
  clip.effects = clip.effects!.filter((e) => e.id !== args.effect);
}
/** An adjustment layer on an effect track (one is added at the top when none exists). */
export function addAdjustment(project: FilmProject, args: { effect: string; params?: EffectValues; start: Tick; duration: Tick; track?: string }, ctx: EditContext): string {
  // Without a chosen track: the first effect track that is free for this time, or a new one, so effects never cut each other.
  const free = (x: Track) => x.kind === 'effect' && !x.locked && !x.clips.some((c) => c.start < args.start + args.duration && end(c) > args.start);
  const t = args.track ? track(project, args.track) : project.tracks.find(free) ?? track(project, addTrack(project, 'effect', ctx));
  const clip: EffectClip = { id: ctx.id(), type: 'effect', start: args.start, duration: args.duration, effect: args.effect, params: checked(args.effect, args.params) };
  put(project, t, clip, 'overwrite', ctx);
  return clip.id;
}

// ---------- keyframes (FILM-06) ----------

function animated(project: FilmProject, clipId: string, path: string) {
  const { track: t, clip } = findClip(project, clipId);
  unlocked(t);
  if (clip.type === 'caption' && !clip.title) refuse('Make this caption a title first (title.style) to animate it.');
  const info = property(clip, path) ?? refuse(`${path} cannot be animated on this clip.`);
  return { clip, info };
}
const LINEAR: Side = { interp: 'linear' };
/** Adds a key at a film moment (or changes the one already there). Without a value it keeps the current value. */
export function addKey(project: FilmProject, args: { clip: string; property: string; at: Tick; value?: KeyValue }, ctx: EditContext): string {
  const { clip } = animated(project, args.clip, args.property);
  if (args.at < clip.start || args.at > clip.start + clip.duration) refuse('Put the playhead over the clip to add a key.');
  const at = keyTime(clip, args.at), value = args.value ?? valueAt(clip, args.property, args.at)!;
  const keys = [...(clip.keys?.[args.property] ?? [])];
  const same = keys.find((k) => k.at === at);
  if (same) { same.value = value; clip.keys = { ...clip.keys, [args.property]: keys }; return same.id; }
  const key: Key = { id: ctx.id(), at, value, in: { ...LINEAR }, out: { ...LINEAR } };
  clip.keys = { ...clip.keys, [args.property]: [...keys, key].sort((a, b) => a.at - b.at) };
  return key.id;
}
export function setKey(project: FilmProject, args: { clip: string; property: string; key: string; value?: KeyValue; at?: Tick; in?: Side; out?: Side }) {
  const { clip } = animated(project, args.clip, args.property);
  const keys = clip.keys?.[args.property] ?? [];
  const key = keys.find((k) => k.id === args.key) ?? refuse('Key not found.');
  if (args.value !== undefined) key.value = args.value;
  if (args.at !== undefined) {
    const at = keyTime(clip, args.at);
    if (keys.some((k) => k !== key && k.at === at)) refuse('Another key already sits at that time.');
    key.at = at;
  }
  if (args.in) key.in = args.in;
  if (args.out) key.out = args.out;
  keys.sort((a, b) => a.at - b.at);
}
/** Removes a key; when the last one goes, the value stays what that key held. */
export function removeKey(project: FilmProject, args: { clip: string; property: string; key: string }) {
  const { clip } = animated(project, args.clip, args.property);
  const keys = clip.keys?.[args.property] ?? [];
  const key = keys.find((k) => k.id === args.key) ?? refuse('Key not found.');
  const rest = keys.filter((k) => k !== key);
  if (!rest.length) setStaticValue(clip, args.property, key.value);
  const lanes = { ...clip.keys, [args.property]: rest };
  if (!rest.length) delete lanes[args.property];
  clip.keys = lanes;
}
export function easeKeys(project: FilmProject, args: { clip: string; property: string; keys?: string[]; preset: EasePreset }) {
  const { clip } = animated(project, args.clip, args.property);
  const keys = clip.keys?.[args.property] ?? [];
  if (!keys.length) refuse('This value has no keys.');
  const sides = presetSides(args.preset);
  for (const key of keys) if (!args.keys?.length || args.keys.includes(key.id)) { key.in = { ...sides.in }; key.out = { ...sides.out }; }
}
/** Sets a value at a film moment: a key when the value is animated, otherwise the plain value. */
export function setProperty(project: FilmProject, args: { clip: string; property: string; value: KeyValue; at: Tick }, ctx: EditContext) {
  const { clip } = animated(project, args.clip, args.property);
  if (clip.keys?.[args.property]?.length) addKey(project, { clip: args.clip, property: args.property, at: Math.min(Math.max(args.at, clip.start), clip.start + clip.duration), value: args.value }, ctx);
  else setStaticValue(clip, args.property, args.value);
}
/** Stops animating a value; it keeps the value it has at `at`. */
export function clearKeys(project: FilmProject, args: { clip: string; property: string; at: Tick }) {
  const { clip } = animated(project, args.clip, args.property);
  if (!clip.keys?.[args.property]?.length) refuse('This value is not animated.');
  const value = valueAt(clip, args.property, args.at)!;
  const lanes = { ...clip.keys }; delete lanes[args.property];
  clip.keys = lanes;
  setStaticValue(clip, args.property, value);
}

// ---------- titles (FILM-01) ----------

function titleClip(project: FilmProject, clipId: string): CaptionClip {
  const { track: t, clip } = findClip(project, clipId);
  unlocked(t);
  if (clip.type !== 'caption') refuse('Only captions and titles have text.');
  return clip;
}
/** A title from a template (card, name strip, credits) on the first unlocked caption track. */
export function addTitle(project: FilmProject, args: { template: TemplateId; text: string; subtitle?: string; start: Tick; duration: Tick }, ctx: EditContext): string {
  const t = project.tracks.find((x) => x.kind === 'caption' && !x.locked) ?? refuse('Add an unlocked caption track first.');
  const template = TEMPLATES[args.template];
  const clip: CaptionClip = { id: ctx.id(), type: 'caption', start: args.start, duration: args.duration, text: args.text, style: 'title',
    title: { ...template.style } as TitleStyle, template: args.template, ...(args.subtitle ? { subtitle: args.subtitle } : {}),
    transform: { ...IDENTITY_TRANSFORM, x: template.position[0], y: template.position[1] } };
  put(project, t, clip, 'overwrite', ctx);
  return clip.id;
}
/** Changes the text or look of a title; a plain caption becomes a title. */
export function styleTitle(project: FilmProject, args: { clip: string; text?: string; subtitle?: string } & { [K in keyof TitleStyle]?: TitleStyle[K] | null }) {
  const clip = titleClip(project, args.clip);
  const { text, subtitle } = args;
  if (text !== undefined) clip.text = text;
  if (subtitle !== undefined) clip.subtitle = subtitle;
  const style = Object.entries(args).filter(([key, v]) => key !== 'clip' && key !== 'text' && key !== 'subtitle' && v !== undefined);
  if (style.length || !clip.title) {
    const next: Record<string, unknown> = { ...(clip.title ?? DEFAULT_TITLE) };
    for (const [key, value] of style) { if (value === null) delete next[key]; else next[key] = value; } // null turns outline / box off
    clip.title = next as unknown as TitleStyle;
  }
  if (!clip.transform) clip.transform = { ...IDENTITY_TRANSFORM };
}
/** Applies a preset: an animator plus keys on its selector offset at the start ("in") or end ("out"). */
export function animateTitle(project: FilmProject, args: { clip: string; preset: string; edge: 'in' | 'out' }, ctx: EditContext): string {
  const clip = titleClip(project, args.clip);
  if (!clip.title) styleTitle(project, { clip: args.clip });
  if ((clip.animators?.length ?? 0) >= 8) refuse('A title holds at most 8 animators.');
  let made: ReturnType<typeof presetAnimator>;
  try { made = presetAnimator(args.preset, args.edge, clip.duration, ctx.id); } catch (error) { return refuse(error instanceof Error ? error.message : 'Unknown preset.'); }
  clip.animators = [...(clip.animators ?? []), made.animator];
  clip.keys = { ...clip.keys, [`animators.${made.animator.id}.offset`]: made.keys };
  return made.animator.id;
}
export function setAnimator(project: FilmProject, args: { clip: string; animator: string; props?: Animator['props']; selector?: Partial<Animator['selector']> }) {
  const clip = titleClip(project, args.clip);
  const a = clip.animators?.find((x) => x.id === args.animator) ?? refuse('Animator not found.');
  if (args.props) a.props = { ...a.props, ...args.props };
  if (args.selector) a.selector = { ...a.selector, ...Object.fromEntries(Object.entries(args.selector).filter(([, v]) => v !== undefined)) };
}
export function removeAnimator(project: FilmProject, args: { clip: string; animator: string }) {
  const clip = titleClip(project, args.clip);
  if (!clip.animators?.some((x) => x.id === args.animator)) refuse('Animator not found.');
  clip.animators = clip.animators!.filter((x) => x.id !== args.animator);
  if (clip.keys) clip.keys = Object.fromEntries(Object.entries(clip.keys).filter(([path]) => !path.startsWith(`animators.${args.animator}.`)));
}

// ---------- transitions (FILM-01) ----------

export function addTransition(project: FilmProject, args: { clip: string; kind: TransitionKind; duration: Tick; align: 'centre' | 'start' | 'end'; params?: Record<string, number | string> }) {
  const clip = mediaClip(project, args.clip);
  let params: Record<string, number | string>;
  try { params = transitionParams(args.kind, args.params); } catch (error) { return refuse(error instanceof Error ? error.message : 'Invalid transition.'); }
  minFrame(project, args.duration);
  clip.transition = { kind: args.kind, duration: args.duration, align: args.align, params };
}
export function setTransition(project: FilmProject, args: { clip: string; kind?: TransitionKind; duration?: Tick; align?: 'centre' | 'start' | 'end'; params?: Record<string, number | string> }) {
  const clip = mediaClip(project, args.clip);
  const t = clip.transition ?? refuse('This clip has no transition.');
  const kind = args.kind ?? t.kind;
  let params: Record<string, number | string>;
  try { params = transitionParams(kind, args.kind && args.kind !== t.kind ? args.params ?? {} : { ...t.params, ...args.params }); }
  catch (error) { return refuse(error instanceof Error ? error.message : 'Invalid transition.'); }
  clip.transition = { kind, duration: args.duration ?? t.duration, align: args.align ?? t.align, params };
  minFrame(project, clip.transition.duration);
}
export function removeTransition(project: FilmProject, clipId: string) {
  const clip = mediaClip(project, clipId);
  if (!clip.transition) refuse('This clip has no transition.');
  delete clip.transition;
}

// ---------- colour (FILM-07) ----------

/** Puts a look on a clip: its Colour effect gets the look's settings (one is added when missing). */
export function applyLook(project: FilmProject, args: { clip: string; look: string }, ctx: EditContext): string {
  const clip = mediaClip(project, args.clip);
  const settings = LOOKS[args.look]?.params ?? project.looks?.[args.look] ?? refuse(`Unknown look ${args.look}. Looks: ${[...Object.keys(LOOKS), ...Object.keys(project.looks ?? {})].join(', ')}.`);
  const params = checked('colour', settings);
  const existing = clip.effects?.find((e) => e.effect === 'colour');
  if (existing) {
    existing.params = params; existing.enabled = true;
    // The look replaces any animation of the Colour settings.
    if (clip.keys) clip.keys = Object.fromEntries(Object.entries(clip.keys).filter(([path]) => !path.startsWith(`effects.${existing.id}.`)));
    return existing.id;
  }
  return addEffect(project, { clip: args.clip, effect: 'colour', params }, ctx);
}
/** Saves the clip's Colour settings as a named look of this film. */
export function saveLook(project: FilmProject, args: { clip: string; name: string }) {
  const clip = mediaClip(project, args.clip);
  const colour = clip.effects?.find((e) => e.effect === 'colour') ?? refuse('This clip has no Colour effect to save.');
  if (Object.hasOwn(LOOKS, args.name)) refuse(`${args.name} is a built-in look; choose another name.`);
  if (Object.keys(project.looks ?? {}).length >= 50 && !project.looks?.[args.name]) refuse('A film holds at most 50 saved looks.');
  project.looks = { ...project.looks, [args.name]: Object.fromEntries(Object.entries(colour.params).filter(([, v]) => typeof v === 'number')) as Record<string, number> };
}

// ---------- sound (FILM-08) ----------

export const DEFAULT_DUCKING = { on: true, amount: 10, fade: 0.3 };
export function setFade(project: FilmProject, args: { clip: string; in?: Tick; out?: Tick }) {
  const clip = mediaClip(project, args.clip);
  const next = { in: args.in ?? clip.fade?.in ?? 0, out: args.out ?? clip.fade?.out ?? 0 };
  if (next.in + next.out > clip.duration) refuse('The fades are longer than the clip.');
  clip.fade = next;
}
export function setSoundType(project: FilmProject, args: { clip: string; type: NonNullable<MediaClip['soundType']> }) {
  mediaClip(project, args.clip).soundType = args.type;
}
export function setDucking(project: FilmProject, args: { on?: boolean; amount?: number; fade?: number }) {
  const now = project.ducking ?? DEFAULT_DUCKING;
  project.ducking = { on: args.on ?? now.on, amount: args.amount ?? now.amount, fade: args.fade ?? now.fade };
}
