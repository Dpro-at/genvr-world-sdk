import { z } from 'zod';
import * as edit from './edits.js';
import { EditError, findClip, transact, type EditContext } from './edits.js';
import { History } from './history.js';
import { languageStatus } from './cast.js';
import { filmLength } from './invariants.js';
import { CAST_LIMITS, REVIEW_LIMITS, Suggestion, SuggestionKind, VoiceTake, CastMember, CastVoice, DEFAULT_SCENE_SOUND, DEFAULT_SUBTITLE_STYLE, NamedSpot, SCENE_LIMITS, Scene, SceneSound, ShotLink, FilmSettings, LIMITS, ScriptLine, LanguageTag, Media, SceneCue, SubtitleStyle, TrackKind, filmSettings, type FilmProject } from './model.js';
import { BLEND_MODES, EFFECTS, EFFECT_IDS, LOOKS, isEffect, type EffectId } from './effects.js';
import { EASE_PRESETS } from './animate.js';
import { SELECTOR_SHAPES, TITLE_PRESET_IDS } from './titles.js';
import { TRANSITIONS, TRANSITION_KINDS, type TransitionKind } from './transitions.js';
import { end, frame, fromSeconds, secondsOnFrame, toSeconds, type Tick } from './time.js';

/** What every command sees: the film, the selected clips and the playhead. */
export interface FilmState { project: FilmProject; selection: string[]; playhead: Tick }

export type CommandGroup = 'Edit' | 'Clip' | 'Track' | 'Caption' | 'Marker' | 'Project' | 'View';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each spec types its own arguments; the list holds them all.
export interface CommandSpec<A = any> {
  /** Stable id used by buttons, keys, MCP and the assistant. */
  id: string;
  /** Undo label and button text. */
  label: string | ((args: A) => string);
  group: CommandGroup;
  shortcut?: string;
  /** Arguments; times are seconds and are put on the nearest frame. */
  args: z.ZodType<A>;
  /** null when the command can run now, otherwise the reason it cannot. */
  enabled?: (state: FilmState, args: A) => string | null;
  /** Changes the draft film (journal commands) or answers a question (queries). */
  run: (draft: FilmProject, args: A, context: CommandContext) => unknown;
  /** false for questions and for selection/playhead moves: no undo step, film unchanged. */
  journal: boolean;
  /** Only the host calls it (for example a new recording carries a media file); not offered to MCP. */
  hostOnly?: boolean;
}
export interface CommandContext extends EditContext { state: FilmState }

const seconds = z.number().finite().min(0).max(3600);
const delta = z.number().finite().min(-3600).max(3600);
const ids = z.array(z.string().min(1).max(120)).max(200);
const clipId = z.string().min(1).max(120);
const at = (project: FilmProject, value: number) => secondsOnFrame(value, project.rate);
const selected = (state: FilmState, clips?: string[]) => clips?.length ? clips : state.selection;
const one = (state: FilmState, clip?: string) => clip ?? (state.selection.length === 1 ? state.selection[0] : undefined);
const needOne = (state: FilmState, clip?: string) => one(state, clip) ? null : 'Select one clip first.';
const lockedReason = (state: FilmState, clipIds: string[]) => {
  for (const x of clipIds) {
    const owner = state.project.tracks.find((t) => t.clips.some((c) => c.id === x));
    if (!owner) return `Clip ${x} not found.`;
    if (owner.locked) return `Track ${owner.name} is locked.`;
  }
  return null;
};
const effectArgs = z.record(z.string().max(60), z.union([z.number().finite(), z.string().max(200), z.boolean()]));
const effectId = z.enum(EFFECT_IDS as [EffectId, ...EffectId[]]);
/** Property paths: position, scale, rotation, opacity, volume, effects.<effect id>.<setting>, params.<setting> (adjustment layers). */
const prop = z.string().min(1).max(120);
const keyValue = z.union([z.number().finite(), z.tuple([z.number().finite(), z.number().finite()])]);
const sideArg = z.object({ interp: z.enum(['linear', 'hold', 'bezier', 'auto']), speed: z.number().finite().optional(),
  influence: z.number().finite().min(0.001).max(1).optional() }).strict();
const CueInput = SceneCue.extend({ start: seconds, end: seconds });
const toCues = (cues: z.infer<typeof CueInput>[]) => cues.map((c) => ({ ...c, start: fromSeconds(c.start), end: fromSeconds(c.end) }));

/** Times in a readable form for agents: seconds beside ticks. */
export function describe(project: FilmProject) {
  const s = (t: Tick) => Math.round(toSeconds(t) * 1000) / 1000;
  return {
    seconds: s(filmLength(project)), rate: project.rate, size: project.size,
    // Everything a person can set is visible to agents too (owner N-065): languages, the shown one, the subtitle look,
    // ducking, the In/Out range and saved looks.
    languages: project.tracks.filter((t) => t.kind === 'caption' && t.lang).map((t) => ({ lang: t.lang!, track: t.id, lines: t.clips.length,
      voice: project.tracks.find((v) => v.kind === 'sound' && v.lang === t.lang)?.id ?? null })),
    shownLanguage: project.tracks.find((t) => t.kind === 'caption' && t.lang && !t.hidden)?.lang ?? null,
    subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE, ...project.subtitleStyle },
    settings: filmSettings(project),
    cast: project.cast ?? [], lines: project.lines ?? [], languageStatus: languageStatus(project),
    scenes: project.scenes ?? [], links: project.links ?? [],
    requests: project.requests ?? [], suggestions: project.suggestions ?? [], takes: (project.takes ?? []).map(({ asset: _asset, ...t }) => t),
    ...(project.ducking ? { ducking: project.ducking } : {}),
    ...(project.range ? { range: { in: s(project.range.in), out: s(project.range.out) } } : {}),
    ...(project.looks ? { looks: Object.keys(project.looks) } : {}),
    tracks: project.tracks.map((t) => ({ id: t.id, kind: t.kind, name: t.name, ...(t.lang ? { lang: t.lang } : {}), locked: t.locked, muted: t.muted, solo: t.solo, hidden: t.hidden,
      clips: t.clips.map((c) => ({ ...c, startSeconds: s(c.start), endSeconds: s(end(c)), ...(c.type === 'media' ? { inSeconds: s(c.in) } : {}) })) })),
    media: project.media.map((m) => ({ id: m.id, kind: m.kind, name: m.name, seconds: s(m.duration), camera: m.camera?.preset ?? null, hasSound: m.hasSound ?? false,
      cues: m.cues.map((c) => ({ ...c, start: s(c.start), end: s(c.end) })) })),
    markers: project.markers.map((m) => ({ ...m, seconds: s(m.at) })),
    draft: project.draft.map((c) => ({ ...c, start: s(c.start), end: s(c.end) })),
  };
}

/** Editing commands a suggestion may carry (FILM-D1): looks, transitions and effects of one shot, nothing else. */
const SUGGESTION_STEPS = new Set(['transition.add', 'transition.set', 'transition.remove', 'look.apply', 'effect.add', 'effect.set', 'effect.remove', 'property.set', 'property.clear', 'clip.blend']);

/** A scene may name only characters and recordings of this film; spots have different names. */
function checkSceneRefs(d: FilmProject, scene: z.infer<typeof Scene>) {
  for (const w of scene.who) if (!d.cast?.some((c) => c.id === w.cast)) throw new EditError('Add the character to the cast first.');
  for (const m of scene.shots) if (!d.media.some((x) => x.id === m)) throw new EditError('That recording is not in this film.');
  if (new Set(scene.spots.map((s) => s.name.toLowerCase())).size !== scene.spots.length) throw new EditError('Each spot of a scene needs its own name.');
  NamedSpot.array().parse(scene.spots);
}
/** Links join two recordings of this film at times inside them; a flashback returns inside the first shot. */
function checkLink(d: FilmProject, link: z.infer<typeof ShotLink>) {
  const from = d.media.find((m) => m.id === link.from.media), to = d.media.find((m) => m.id === link.to.media);
  if (!from || !to) throw new EditError('Both ends of a link must be recordings of this film.');
  if (link.from.at > toSeconds(from.duration) + 0.001 || link.to.at > toSeconds(to.duration) + 0.001) throw new EditError('A link time must be inside its shot.');
  if (link.kind === 'flashback' && link.returnAt === undefined) throw new EditError('A flashback needs the time it returns to (returnAt).');
  if (link.returnAt !== undefined && link.returnAt > toSeconds(from.duration) + 0.001) throw new EditError('The return time must be inside the first shot.');
}

export const COMMANDS: CommandSpec[] = [
  { id: 'edit.undo', label: 'Undo', group: 'Edit', shortcut: 'Ctrl+Z', args: z.object({}).strict(), journal: false, run: () => undefined },
  { id: 'edit.redo', label: 'Redo', group: 'Edit', shortcut: 'Ctrl+Shift+Z', args: z.object({}).strict(), journal: false, run: () => undefined },
  {
    id: 'history.goto', label: 'Go to history step', group: 'Edit', journal: false, run: () => undefined,
    /** `done` = how many steps stay done (0 = before the first edit); later steps can be redone. */
    args: z.object({ done: z.number().int().min(0).max(400) }).strict(),
  },
  {
    id: 'clip.split', label: 'Split', group: 'Clip', shortcut: 'Ctrl+K', journal: true,
    args: z.object({ at: seconds.optional(), clips: ids.optional(), tracks: ids.optional() }).strict(),
    enabled: (state, args) => {
      const time = args.at === undefined ? state.playhead : at(state.project, args.at);
      const tracks = state.project.tracks.filter((t) => !t.locked && (!args.tracks?.length || args.tracks.includes(t.id)));
      return tracks.some((t) => t.clips.some((c) => (!args.clips?.length || args.clips.includes(c.id)) && c.start < time && end(c) > time))
        ? null : 'No clip under the playhead.';
    },
    run: (d, a, x) => edit.split(d, { at: a.at === undefined ? x.state.playhead : at(d, a.at), ...(a.clips ? { clips: a.clips } : {}), ...(a.tracks ? { tracks: a.tracks } : {}) }, x),
  },
  {
    id: 'clip.remove', label: (a) => a.ripple ? 'Ripple delete' : 'Delete', group: 'Clip', shortcut: 'Delete', journal: true,
    // `sync` (FILM-15): a ripple also moves what comes after on the other tracks (default).
    args: z.object({ clips: ids.optional(), ripple: z.boolean().default(false), sync: z.boolean().default(true) }).strict(),
    enabled: (s, a) => selected(s, a.clips).length ? lockedReason(s, selected(s, a.clips)) : 'Select a clip first.',
    run: (d, a, x) => edit.remove(d, { clips: selected(x.state, a.clips), ripple: a.ripple, sync: a.sync }),
  },
  {
    id: 'clip.trim', label: (a) => a.ripple ? 'Ripple trim' : 'Trim', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), edge: z.enum(['start', 'end']), by: delta.optional(), to: seconds.optional(), ripple: z.boolean().default(false), sync: z.boolean().default(true) }).strict()
      .refine((a) => (a.by === undefined) !== (a.to === undefined), 'Give either by (seconds to move the edge) or to (the edge time in seconds).'),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => {
      const clip = one(x.state, a.clip)!, found = findClip(d, clip).clip;
      const edgeAt = a.edge === 'start' ? found.start : end(found);
      const moveBy = a.to !== undefined ? at(d, a.to) - edgeAt : secondsOnFrame(a.by!, d.rate);
      edit.trim(d, { clip, edge: a.edge, delta: moveBy, ripple: a.ripple, sync: a.sync });
    },
  },
  {
    id: 'clip.move', label: 'Move clip', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), start: seconds, track: clipId.optional(), mode: z.enum(['overwrite', 'insert']).default('overwrite') }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.move(d, { clip: one(x.state, a.clip)!, start: at(d, a.start), mode: a.mode, ...(a.track ? { track: a.track } : {}) }, x),
  },
  {
    id: 'clip.slip', label: 'Slip', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), by: delta }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.slip(d, { clip: one(x.state, a.clip)!, delta: secondsOnFrame(a.by, d.rate) }),
  },
  {
    id: 'clip.roll', label: 'Rolling edit', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), by: delta }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.roll(d, { clip: one(x.state, a.clip)!, delta: secondsOnFrame(a.by, d.rate) }),
  },
  {
    id: 'clip.slide', label: 'Slide', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), by: delta }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.slide(d, { clip: one(x.state, a.clip)!, delta: secondsOnFrame(a.by, d.rate) }),
  },
  {
    id: 'clip.set', label: 'Clip settings', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), volume: z.number().finite().min(0).max(2).optional(), name: z.string().max(120).optional(),
      text: z.string().max(500).optional(), style: z.enum(['subtitle', 'title', 'name']).optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setClip(d, { ...a, clip: one(x.state, a.clip)! }),
  },
  {
    id: 'clip.place', label: 'Place recording', group: 'Clip', journal: true,
    args: z.object({ media: clipId, track: clipId.optional(), start: seconds.optional(), in: seconds.optional(), duration: seconds.optional(),
      mode: z.enum(['overwrite', 'insert']).default('overwrite') }).strict(),
    enabled: (s, a) => s.project.media.some((m) => m.id === a.media) ? null : 'That recording is not in this film.',
    run: (d, a, x) => {
      const media = d.media.find((m) => m.id === a.media)!;
      const kind = media.kind === 'audio' ? 'sound' : 'picture';
      const trackId = a.track ?? d.tracks.find((t) => t.kind === kind && !t.locked)?.id;
      if (!trackId) throw new EditError(`Add an unlocked ${kind} track first.`);
      return edit.place(d, { media: a.media, track: trackId, start: a.start === undefined ? x.state.playhead : at(d, a.start), mode: a.mode,
        ...(a.in !== undefined ? { in: at(d, a.in) } : {}), ...(a.duration !== undefined ? { duration: at(d, a.duration) } : {}) }, x);
    },
  },
  {
    id: 'clip.transform', label: 'Transform', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), x: z.number().finite().min(-4).max(4).optional(), y: z.number().finite().min(-4).max(4).optional(),
      scale: z.number().finite().min(0.01).max(10).optional(), rotation: z.number().finite().min(-3600).max(3600).optional(),
      opacity: z.number().finite().min(0).max(1).optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setTransform(d, { ...a, clip: one(x.state, a.clip)! }),
  },
  {
    id: 'clip.blend', label: 'Blend mode', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), mode: z.enum(BLEND_MODES) }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setBlend(d, { clip: one(x.state, a.clip)!, mode: a.mode }),
  },
  {
    id: 'effect.add', label: (a: { effect: string }) => `Add ${isEffect(a.effect) ? EFFECTS[a.effect].label.toLowerCase() : 'effect'}`, group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), effect: effectId, params: effectArgs.optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.addEffect(d, { clip: one(x.state, a.clip)!, effect: a.effect, ...(a.params ? { params: a.params } : {}) }, x),
  },
  {
    id: 'effect.set', label: 'Effect settings', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), effect: clipId.optional(), params: effectArgs.optional(), enabled: z.boolean().optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setEffect(d, { clip: one(x.state, a.clip)!, ...(a.effect ? { effect: a.effect } : {}), ...(a.params ? { params: a.params } : {}),
      ...(a.enabled !== undefined ? { enabled: a.enabled } : {}) }),
  },
  {
    id: 'effect.remove', label: 'Remove effect', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), effect: clipId }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.removeEffect(d, { clip: one(x.state, a.clip)!, effect: a.effect }),
  },
  {
    id: 'adjustment.add', label: 'Add adjustment layer', group: 'Clip', journal: true,
    args: z.object({ effect: effectId, params: effectArgs.optional(), start: seconds.optional(), duration: seconds.default(3), track: clipId.optional() }).strict(),
    run: (d, a, x) => edit.addAdjustment(d, { effect: a.effect, start: a.start === undefined ? x.state.playhead : at(d, a.start), duration: at(d, a.duration),
      ...(a.params ? { params: a.params } : {}), ...(a.track ? { track: a.track } : {}) }, x),
  },
  {
    id: 'key.add', label: 'Add key', group: 'Clip', shortcut: 'K', journal: true,
    args: z.object({ clip: clipId.optional(), property: prop, at: seconds.optional(), value: keyValue.optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.addKey(d, { clip: one(x.state, a.clip)!, property: a.property, at: a.at === undefined ? x.state.playhead : at(d, a.at),
      ...(a.value !== undefined ? { value: a.value } : {}) }, x),
  },
  {
    id: 'key.set', label: 'Change key', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), property: prop, key: clipId, value: keyValue.optional(), at: seconds.optional(),
      in: sideArg.optional(), out: sideArg.optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setKey(d, { clip: one(x.state, a.clip)!, property: a.property, key: a.key, ...(a.value !== undefined ? { value: a.value } : {}),
      ...(a.at !== undefined ? { at: at(d, a.at) } : {}), ...(a.in ? { in: a.in } : {}), ...(a.out ? { out: a.out } : {}) }),
  },
  {
    id: 'key.remove', label: 'Remove key', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), property: prop, key: clipId }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.removeKey(d, { clip: one(x.state, a.clip)!, property: a.property, key: a.key }),
  },
  {
    id: 'key.ease', label: (a: { preset: string }) => a.preset === 'easy' ? 'Easy ease' : a.preset === 'in' ? 'Ease in' : a.preset === 'out' ? 'Ease out' : a.preset === 'hold' ? 'Hold keys' : 'Linear keys',
    group: 'Clip', shortcut: 'F9 (easy)', journal: true,
    args: z.object({ clip: clipId.optional(), property: prop, keys: ids.optional(), preset: z.enum(EASE_PRESETS) }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.easeKeys(d, { clip: one(x.state, a.clip)!, property: a.property, preset: a.preset, ...(a.keys ? { keys: a.keys } : {}) }),
  },
  {
    id: 'property.set', label: (a: { property: string }) => `Set ${a.property}`, group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), property: prop, value: keyValue, at: seconds.optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setProperty(d, { clip: one(x.state, a.clip)!, property: a.property, value: a.value, at: a.at === undefined ? x.state.playhead : at(d, a.at) }, x),
  },
  {
    id: 'property.clear', label: 'Stop animating', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), property: prop, at: seconds.optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.clearKeys(d, { clip: one(x.state, a.clip)!, property: a.property, at: a.at === undefined ? x.state.playhead : at(d, a.at) }),
  },
  {
    id: 'title.add', label: (a: { template?: string }) => `Add ${a.template === 'strip' ? 'name strip' : a.template === 'credits' ? 'end credits' : 'title card'}`,
    group: 'Caption', journal: true,
    args: z.object({ template: z.enum(['card', 'strip', 'credits']).default('card'), text: z.string().min(1).max(2000), subtitle: z.string().max(500).optional(),
      start: seconds.optional(), duration: seconds.default(4) }).strict(),
    run: (d, a, x) => edit.addTitle(d, { template: a.template, text: a.text, start: a.start === undefined ? x.state.playhead : at(d, a.start), duration: at(d, a.duration),
      ...(a.subtitle ? { subtitle: a.subtitle } : {}) }, x),
  },
  {
    id: 'title.style', label: 'Title style', group: 'Caption', journal: true,
    args: z.object({ clip: clipId.optional(), text: z.string().max(2000).optional(), subtitle: z.string().max(500).optional(),
      font: z.enum(['nunito', 'serif', 'mono', 'display']).optional(), size: z.number().finite().min(8).max(400).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), weight: z.union([z.literal(400), z.literal(700), z.literal(900)]).optional(),
      align: z.enum(['left', 'center', 'right']).optional(), shadow: z.boolean().optional(),
      /** null removes the outline / box. */
      outline: z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().finite().min(0).max(20) }).strict().nullable().optional(),
      box: z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), opacity: z.number().finite().min(0).max(1) }).strict().nullable().optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.styleTitle(d, { ...a, clip: one(x.state, a.clip)! } as Parameters<typeof edit.styleTitle>[1]),
  },
  {
    id: 'title.animate', label: (a: { preset?: string; edge?: string }) => `Animate title (${a.preset ?? 'preset'} ${a.edge ?? 'in'})`, group: 'Caption', journal: true,
    args: z.object({ clip: clipId.optional(), preset: z.enum(TITLE_PRESET_IDS as [string, ...string[]]), edge: z.enum(['in', 'out']).default('in') }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.animateTitle(d, { clip: one(x.state, a.clip)!, preset: a.preset, edge: a.edge }, x),
  },
  {
    id: 'animator.set', label: 'Change animator', group: 'Caption', journal: true,
    args: z.object({ clip: clipId.optional(), animator: clipId,
      props: z.object({ opacity: z.number().finite().min(-1).max(1).optional(), x: z.number().finite().optional(), y: z.number().finite().optional(),
        scale: z.number().finite().min(-1).max(10).optional(), rotation: z.number().finite().optional(), tracking: z.number().finite().optional() }).strict().optional(),
      selector: z.object({ based: z.enum(['chars', 'words', 'lines']).optional(), shape: z.enum(SELECTOR_SHAPES).optional(),
        random: z.boolean().optional(), seed: z.number().int().min(0).max(1_000_000).optional() }).strict().optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setAnimator(d, { clip: one(x.state, a.clip)!, animator: a.animator, ...(a.props ? { props: a.props } : {}),
      ...(a.selector ? { selector: a.selector as Partial<import('./titles.js').Selector> } : {}) }),
  },
  {
    id: 'animator.remove', label: 'Remove animator', group: 'Caption', journal: true,
    args: z.object({ clip: clipId.optional(), animator: clipId }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.removeAnimator(d, { clip: one(x.state, a.clip)!, animator: a.animator }),
  },
  {
    id: 'transition.add', label: (a: { kind?: string }) => `Add ${a.kind && Object.hasOwn(TRANSITIONS, a.kind) ? TRANSITIONS[a.kind as TransitionKind].label.toLowerCase() : 'transition'}`,
    group: 'Clip', shortcut: 'Ctrl+D (dissolve)', journal: true,
    args: z.object({ clip: clipId.optional(), kind: z.enum(TRANSITION_KINDS as [TransitionKind, ...TransitionKind[]]).default('dissolve'),
      duration: z.number().finite().min(0.04).max(10).default(1), align: z.enum(['centre', 'start', 'end']).default('centre'),
      params: z.record(z.string().max(40), z.union([z.number().finite(), z.string().max(40)])).optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.addTransition(d, { clip: one(x.state, a.clip)!, kind: a.kind, duration: at(d, a.duration), align: a.align, ...(a.params ? { params: a.params } : {}) }),
  },
  {
    id: 'transition.set', label: 'Change transition', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), kind: z.enum(TRANSITION_KINDS as [TransitionKind, ...TransitionKind[]]).optional(),
      duration: z.number().finite().min(0.04).max(10).optional(), align: z.enum(['centre', 'start', 'end']).optional(),
      params: z.record(z.string().max(40), z.union([z.number().finite(), z.string().max(40)])).optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setTransition(d, { clip: one(x.state, a.clip)!, ...(a.kind ? { kind: a.kind } : {}), ...(a.duration !== undefined ? { duration: at(d, a.duration) } : {}),
      ...(a.align ? { align: a.align } : {}), ...(a.params ? { params: a.params } : {}) }),
  },
  {
    id: 'transition.remove', label: 'Remove transition', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.removeTransition(d, one(x.state, a.clip)!),
  },
  {
    id: 'look.apply', label: (a: { look?: string }) => `Look: ${a.look && LOOKS[a.look] ? LOOKS[a.look]!.label : a.look ?? ''}`, group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), look: z.string().min(1).max(60) }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.applyLook(d, { clip: one(x.state, a.clip)!, look: a.look }, x),
  },
  {
    id: 'look.save', label: 'Save look', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), name: z.string().min(1).max(60) }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.saveLook(d, { clip: one(x.state, a.clip)!, name: a.name }),
  },
  {
    id: 'clip.fade', label: 'Sound fade', group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), in: seconds.optional(), out: seconds.optional() }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setFade(d, { clip: one(x.state, a.clip)!, ...(a.in !== undefined ? { in: at(d, a.in) } : {}), ...(a.out !== undefined ? { out: at(d, a.out) } : {}) }),
  },
  {
    id: 'clip.soundType', label: (a: { type?: string }) => `Sound type: ${a.type ?? ''}`, group: 'Clip', journal: true,
    args: z.object({ clip: clipId.optional(), type: z.enum(['dialogue', 'music', 'effects', 'ambience']) }).strict(),
    enabled: (s, a) => needOne(s, a.clip) ?? lockedReason(s, [one(s, a.clip)!]),
    run: (d, a, x) => edit.setSoundType(d, { clip: one(x.state, a.clip)!, type: a.type }),
  },
  {
    id: 'sound.duck', label: 'Ducking', group: 'Project', journal: true,
    args: z.object({ on: z.boolean().optional(), amount: z.number().finite().min(0).max(40).optional(), fade: z.number().finite().min(0).max(3).optional() }).strict(),
    run: (d, a) => edit.setDucking(d, a),
  },
  {
    id: 'gap.close', label: 'Close gap', group: 'Clip', journal: true,
    args: z.object({ track: clipId, at: seconds.optional() }).strict(),
    run: (d, a, x) => edit.closeGap(d, { track: a.track, at: a.at === undefined ? x.state.playhead : at(d, a.at) }),
  },
  {
    id: 'track.add', label: (a) => `Add ${a.kind} track`, group: 'Track', journal: true,
    args: z.object({ kind: TrackKind }).strict(), run: (d, a, x) => edit.addTrack(d, a.kind, x),
  },
  { id: 'track.remove', label: 'Remove track', group: 'Track', journal: true, args: z.object({ track: clipId }).strict(), run: (d, a) => edit.removeTrack(d, a.track) },
  {
    id: 'track.set', label: (a) => a.locked !== undefined ? (a.locked ? 'Lock track' : 'Unlock track') : a.muted !== undefined ? (a.muted ? 'Mute track' : 'Unmute track')
      : a.solo !== undefined ? 'Solo track' : a.hidden !== undefined ? (a.hidden ? 'Hide track' : 'Show track') : 'Rename track',
    group: 'Track', journal: true,
    args: z.object({ track: clipId, name: z.string().min(1).max(40).optional(), locked: z.boolean().optional(), muted: z.boolean().optional(),
      solo: z.boolean().optional(), hidden: z.boolean().optional() }).strict(),
    run: (d, a) => edit.setTrack(d, a),
  },
  { id: 'track.move', label: 'Reorder track', group: 'Track', journal: true, args: z.object({ track: clipId, index: z.number().int().min(0).max(40) }).strict(), run: (d, a) => edit.moveTrack(d, a) },
  {
    id: 'caption.add', label: 'Add caption', group: 'Caption', shortcut: 'Ctrl+T', journal: true,
    args: z.object({ text: z.string().min(1).max(500), start: seconds.optional(), duration: seconds.default(3), style: z.enum(['subtitle', 'title', 'name']).default('subtitle'),
      track: clipId.optional(), mode: z.enum(['overwrite', 'insert']).default('overwrite') }).strict(),
    run: (d, a, x) => edit.addCaption(d, { text: a.text, style: a.style, mode: a.mode, start: a.start === undefined ? x.state.playhead : at(d, a.start),
      duration: at(d, a.duration), ...(a.track ? { track: a.track } : {}) }, x),
  },
  {
    id: 'subtitles.set', label: (a: { name?: string }) => `Subtitles: ${a.name ?? 'language'}`, group: 'Caption', journal: true,
    args: z.object({ lang: LanguageTag, name: z.string().min(1).max(40), show: z.boolean().default(true),
      lines: z.array(z.object({ start: seconds, end: seconds, text: z.string().max(500) }).strict()).max(LIMITS.clipsPerTrack) }).strict(),
    run: (d, a, x) => edit.setSubtitles(d, { lang: a.lang, name: a.name, show: a.show,
      lines: a.lines.map((l: { start: number; end: number; text: string }) => ({ start: at(d, l.start), end: at(d, l.end), text: l.text })) }, x),
  },
  {
    id: 'voice.set', label: (a: { name?: string }) => `Voice: ${a.name ?? 'language'}`, group: 'Caption', journal: true,
    args: z.object({ lang: LanguageTag, name: z.string().min(1).max(40), media: clipId, append: z.boolean().default(false), start: seconds.default(0) }).strict(),
    run: (d, a, x) => edit.setVoice(d, { ...a, start: at(d, a.start) }, x),
  },
  {
    id: 'subtitles.style', label: 'Subtitle look', group: 'Caption', journal: true,
    args: SubtitleStyle.partial().strict(),
    run: (d, a) => { d.subtitleStyle = SubtitleStyle.parse({ ...DEFAULT_SUBTITLE_STYLE, ...d.subtitleStyle, ...a }); },
  },
  {
    id: 'actor.voice', label: (a: { name?: string }) => `Voice of ${a.name ?? 'an actor'}`, group: 'Clip', journal: true,
    args: z.object({ media: clipId, name: z.string().min(1).max(40), start: seconds }).strict(),
    run: (d, a, x) => edit.placeActorVoice(d, { media: a.media, name: a.name, start: at(d, a.start) }, x),
  },
  {
    id: 'subtitles.show', label: 'Show subtitle language', group: 'Caption', journal: true,
    args: z.object({ lang: LanguageTag.nullable() }).strict(), run: (d, a) => edit.showSubtitles(d, a.lang),
  },
  {
    id: 'cues.set', label: (a) => a.media ? 'Set shot cues' : 'Set draft cues', group: 'Clip', journal: true,
    args: z.object({ media: clipId.optional(), cues: z.array(CueInput).max(30) }).strict(),
    run: (d, a) => edit.setCues(d, { cues: toCues(a.cues), ...(a.media ? { media: a.media } : {}) }),
  },
  {
    id: 'range.set', label: (a) => { const marksIn = a.in !== undefined || a.here === 'in', marksOut = a.out !== undefined || a.here === 'out'; return marksIn && marksOut ? 'Mark In and Out' : marksIn ? 'Mark In' : 'Mark Out'; }, group: 'Marker', journal: true,
    args: z.object({ in: seconds.optional(), out: seconds.optional(), here: z.enum(['in', 'out']).optional() }).strict()
      .refine((a) => a.in !== undefined || a.out !== undefined || a.here !== undefined, 'Give in, out (seconds) or here ("in" / "out" at the playhead).'),
    run: (d, a, x) => edit.setRange(d, {
      ...(a.in !== undefined ? { in: at(d, a.in) } : a.here === 'in' ? { in: x.state.playhead } : {}),
      ...(a.out !== undefined ? { out: at(d, a.out) } : a.here === 'out' ? { out: x.state.playhead } : {}),
    }),
  },
  { id: 'range.clear', label: 'Clear In and Out', group: 'Marker', journal: true, args: z.object({}).strict(),
    enabled: (s) => s.project.range ? null : 'No In / Out is marked.', run: (d) => edit.clearInOut(d) },
  {
    id: 'marker.add', label: 'Add marker', group: 'Marker', shortcut: 'M', journal: true,
    args: z.object({ at: seconds.optional(), label: z.string().max(120).default(''), color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'violet']).default('blue') }).strict(),
    run: (d, a, x) => edit.addMarker(d, { at: a.at === undefined ? x.state.playhead : at(d, a.at), label: a.label, color: a.color }, x),
  },
  {
    id: 'marker.set', label: 'Change marker', group: 'Marker', journal: true,
    args: z.object({ marker: clipId, at: seconds.optional(), label: z.string().max(120).optional(), color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'violet']).optional() }).strict(),
    run: (d, a) => edit.setMarker(d, { marker: a.marker, ...(a.at !== undefined ? { at: at(d, a.at) } : {}), ...(a.label !== undefined ? { label: a.label } : {}), ...(a.color ? { color: a.color } : {}) }),
  },
  { id: 'marker.remove', label: 'Remove marker', group: 'Marker', journal: true, args: z.object({ marker: clipId }).strict(), run: (d, a) => edit.removeMarker(d, a.marker) },
  // Cast and script (FILM-B1/B2). Agents add and change characters and write lines; only the owner approves a
  // line (line.approve is host-only, so MCP refuses it), and an agent's change sends a line back to draft.
  {
    id: 'cast.add', label: (a: { name?: string }) => `Add ${a.name ?? 'character'}`, group: 'Project', journal: true,
    args: CastMember.omit({ id: true }).partial({ voices: true, linesBy: true, role: true, personality: true, arc: true }).strict(),
    enabled: (st) => (st.project.cast?.length ?? 0) >= CAST_LIMITS.cast ? `A film has at most ${CAST_LIMITS.cast} characters.` : null,
    run: (d, a, x) => {
      const member = CastMember.parse({ voices: {}, linesBy: { kind: 'owner' }, role: 'support', personality: '', arc: '', ...a, id: x.id() });
      if (d.cast?.some((c) => c.name.toLowerCase() === member.name.toLowerCase())) throw new EditError(`There is already a character called ${member.name}.`);
      d.cast = [...(d.cast ?? []), member]; return member.id;
    },
  },
  {
    id: 'cast.set', label: (a: { name?: string }) => a.name ? `Rename to ${a.name}` : 'Character settings', group: 'Project', journal: true,
    args: CastMember.omit({ id: true, voices: true }).partial().extend({ cast: clipId, by: z.enum(['owner', 'agent']).default('owner') }).strict(),
    run: (d, a) => {
      const { cast, by, ...patch } = a, member = d.cast?.find((c) => c.id === cast);
      if (!member) throw new EditError('Character not found.');
      // Who writes a character's lines is the owner's choice: an agent cannot give itself that right.
      if (by === 'agent' && patch.linesBy && JSON.stringify(patch.linesBy) !== JSON.stringify(member.linesBy)) throw new EditError('Only the owner chooses who writes a character\'s lines.');
      if (patch.name && d.cast!.some((c) => c.id !== cast && c.name.toLowerCase() === patch.name!.toLowerCase())) throw new EditError(`There is already a character called ${patch.name}.`);
      Object.assign(member, CastMember.parse({ ...member, ...patch }));
    },
  },
  {
    id: 'cast.voice', label: (a: { lang?: string }) => `Voice ${a.lang?.toUpperCase() ?? ''}`, group: 'Project', journal: true,
    args: z.object({ cast: clipId, lang: LanguageTag, voice: CastVoice.nullable() }).strict(),
    run: (d, a) => {
      const member = d.cast?.find((c) => c.id === a.cast);
      if (!member) throw new EditError('Character not found.');
      if (a.voice) member.voices[a.lang] = a.voice; else delete member.voices[a.lang];
    },
  },
  {
    id: 'cast.remove', label: 'Remove character', group: 'Project', journal: true,
    // Removing a character with lines needs confirm: true (the UI asks first); its lines go too.
    args: z.object({ cast: clipId, confirm: z.boolean().default(false), by: z.enum(['owner', 'agent']).default('owner') }).strict(),
    enabled: (st, a) => !st.project.cast?.some((c) => c.id === a.cast) ? 'Character not found.'
      : !a.confirm && st.project.lines?.some((l) => l.cast === a.cast) ? 'This character has lines; send confirm: true to remove it and its lines.' : null,
    run: (d, a) => {
      const member = d.cast!.find((c) => c.id === a.cast)!;
      if (a.by === 'agent' && (member.linesBy.kind !== 'agent' || d.lines?.some((l) => l.cast === a.cast && (l.status === 'approved' || l.approvedOnce))))
        throw new EditError(`Only the owner can remove ${member.name}.`);
      d.cast = d.cast!.filter((c) => c.id !== a.cast); d.lines = (d.lines ?? []).filter((l) => l.cast !== a.cast);
    },
  },
  {
    id: 'line.write', label: 'Write line', group: 'Caption', journal: true,
    args: z.object({ cast: clipId, text: z.record(LanguageTag, z.string().max(500)), episode: z.number().int().min(1).max(200).default(1), by: z.enum(['owner', 'agent']).default('owner') }).strict(),
    enabled: (st, a) => !st.project.cast?.some((c) => c.id === a.cast) ? 'Character not found.'
      : (st.project.lines?.length ?? 0) >= CAST_LIMITS.lines ? `A film has at most ${CAST_LIMITS.lines} lines.` : null,
    run: (d, a, x) => {
      const member = d.cast!.find((c) => c.id === a.cast)!;
      if (a.by === 'agent' && member.linesBy.kind !== 'agent') throw new EditError(`${member.name}'s lines are written by the owner.`);
      const line = ScriptLine.parse({ id: x.id(), cast: a.cast, episode: a.episode, text: a.text, status: 'draft', by: a.by });
      d.lines = [...(d.lines ?? []), line]; return line.id;
    },
  },
  {
    id: 'line.set', label: 'Change line', group: 'Caption', journal: true,
    args: z.object({ line: clipId, text: z.record(LanguageTag, z.string().max(500)).optional(), episode: z.number().int().min(1).max(200).optional(), by: z.enum(['owner', 'agent']).default('owner') }).strict(),
    run: (d, a) => {
      const line = d.lines?.find((l) => l.id === a.line);
      if (!line) throw new EditError('Line not found.');
      const member = d.cast?.find((c) => c.id === line.cast);
      if (a.by === 'agent' && member?.linesBy.kind !== 'agent') throw new EditError(`${member?.name ?? 'This character'}'s lines are written by the owner.`);
      if (a.text) line.text = { ...line.text, ...a.text };
      if (a.episode) line.episode = a.episode;
      // An agent's change needs the owner's approval again; the owner's own edit keeps the status.
      if (a.by === 'agent') { line.status = 'draft'; line.by = 'agent'; }
    },
  },
  {
    id: 'line.approve', label: (a: { approved?: boolean }) => a.approved === false ? 'Back to draft' : 'Approve line', group: 'Caption', journal: true, hostOnly: true,
    args: z.object({ line: clipId, approved: z.boolean().default(true) }).strict(),
    run: (d, a) => { const line = d.lines?.find((l) => l.id === a.line); if (!line) throw new EditError('Line not found.'); line.status = a.approved ? 'approved' : 'draft'; if (a.approved) line.approvedOnce = true; },
  },
  {
    id: 'line.remove', label: 'Delete line', group: 'Caption', journal: true,
    args: z.object({ line: clipId, by: z.enum(['owner', 'agent']).default('owner') }).strict(),
    run: (d, a) => {
      const line = d.lines?.find((l) => l.id === a.line);
      if (!line) throw new EditError('Line not found.');
      const member = d.cast?.find((c) => c.id === line.cast);
      // Agents delete only drafts of characters they write; approved lines and the owner's characters stay.
      if (a.by === 'agent' && (line.status === 'approved' || line.approvedOnce || member?.linesBy.kind !== 'agent')) throw new EditError('Only the owner can delete this line.');
      d.lines = d.lines!.filter((l) => l.id !== a.line);
    },
  },
  {
    // An approved line becomes a draft cue of the next take: its character's actor says it in `lang`.
    id: 'line.place', label: 'Use line in the next take', group: 'Caption', journal: true,
    args: z.object({ line: clipId, lang: LanguageTag, start: seconds.default(0), seconds: z.number().finite().min(0.5).max(30).default(3) }).strict(),
    enabled: (st, a) => { const line = st.project.lines?.find((l) => l.id === a.line);
      return !line ? 'Line not found.' : line.status !== 'approved' ? 'Approve the line first.' : !line.text[a.lang]?.trim() ? `The line has no words in ${a.lang.toUpperCase()}.`
        : st.project.draft.length >= LIMITS.cues ? `A take has at most ${LIMITS.cues} cues.` : null; },
    run: (d, a, x) => {
      const line = d.lines!.find((l) => l.id === a.line)!, member = d.cast?.find((c) => c.id === line.cast);
      if (!member) throw new EditError('Character not found.');
      const cue = { id: x.id(), actor: member.actor, label: member.name, action: 'none', start: at(d, a.start), end: at(d, a.start + a.seconds), text: line.text[a.lang]!, volume: 1 };
      d.draft = [...d.draft, SceneCue.parse(cue)]; line.cue = cue.id; return cue.id;
    },
  },
  // Scenes, spots, scene sound and timed links (FILM-C1/C2/C3). Agents may make and change them all; deleting a
  // scene that holds shots needs confirm (its recordings stay in Shots).
  {
    id: 'scene.add', label: (a: { name?: string }) => `Add scene ${a.name ?? ''}`.trim(), group: 'Project', journal: true,
    args: Scene.omit({ id: true }).partial({ place: true, when: true, instructions: true, who: true, shots: true, spots: true, sound: true, episode: true }).strict(),
    enabled: (st) => (st.project.scenes?.length ?? 0) >= SCENE_LIMITS.scenes ? `A film has at most ${SCENE_LIMITS.scenes} scenes.` : null,
    run: (d, a, x) => {
      const scene = Scene.parse({ place: '', when: '', instructions: '', who: [], shots: [], spots: [], sound: DEFAULT_SCENE_SOUND, ...a, id: x.id() });
      checkSceneRefs(d, scene); d.scenes = [...(d.scenes ?? []), scene]; return scene.id;
    },
  },
  {
    id: 'scene.set', label: 'Scene settings', group: 'Project', journal: true,
    args: Scene.omit({ id: true, sound: true }).partial().extend({ scene: clipId, sound: SceneSound.partial().strict().optional() }).strict(),
    run: (d, a) => {
      const { scene: sceneId, sound, ...patch } = a, scene = d.scenes?.find((s) => s.id === sceneId);
      if (!scene) throw new EditError('Scene not found.');
      const next = Scene.parse({ ...scene, ...patch, sound: { ...scene.sound, ...sound } });
      checkSceneRefs(d, next); Object.assign(scene, next);
    },
  },
  {
    id: 'scene.move', label: 'Reorder scene', group: 'Project', journal: true,
    args: z.object({ scene: clipId, index: z.number().int().min(0).max(SCENE_LIMITS.scenes) }).strict(),
    run: (d, a) => { const list = d.scenes ?? [], at = list.findIndex((s) => s.id === a.scene); if (at < 0) throw new EditError('Scene not found.');
      const [scene] = list.splice(at, 1); list.splice(Math.min(a.index, list.length), 0, scene!); },
  },
  {
    id: 'scene.remove', label: 'Delete scene', group: 'Project', journal: true,
    args: z.object({ scene: clipId, confirm: z.boolean().default(false) }).strict(),
    enabled: (st, a) => { const scene = st.project.scenes?.find((s) => s.id === a.scene);
      return !scene ? 'Scene not found.' : scene.shots.length && !a.confirm ? 'This scene holds shots; send confirm: true (the recordings stay in Shots).' : null; },
    run: (d, a) => { d.scenes = d.scenes!.filter((s) => s.id !== a.scene); },
  },
  {
    // One recording belongs to one scene: adding it here takes it out of any other scene.
    id: 'scene.shot', label: (a: { remove?: boolean }) => a.remove ? 'Take shot out of scene' : 'Put shot in scene', group: 'Project', journal: true,
    args: z.object({ scene: clipId, media: clipId, remove: z.boolean().default(false), index: z.number().int().min(0).max(50).optional() }).strict(),
    run: (d, a) => {
      const scene = d.scenes?.find((s) => s.id === a.scene);
      if (!scene) throw new EditError('Scene not found.');
      if (!d.media.some((m) => m.id === a.media && m.kind === 'video')) throw new EditError('That recording is not in this film.');
      for (const other of d.scenes!) other.shots = other.shots.filter((m) => m !== a.media);
      if (!a.remove) { if (scene.shots.length >= 50) throw new EditError('A scene holds at most 50 shots.'); scene.shots.splice(a.index ?? scene.shots.length, 0, a.media); }
    },
  },
  {
    id: 'link.add', label: (a: { kind?: string }) => `Add ${a.kind ?? 'link'}`, group: 'Project', journal: true,
    args: ShotLink.omit({ id: true }).partial({ look: true }).strict(),
    enabled: (st) => (st.project.links?.length ?? 0) >= SCENE_LIMITS.links ? `A film has at most ${SCENE_LIMITS.links} links.` : null,
    run: (d, a, x) => { const link = ShotLink.parse({ look: 'cut', ...a, id: x.id() }); checkLink(d, link); d.links = [...(d.links ?? []), link]; return link.id; },
  },
  {
    id: 'link.set', label: 'Change link', group: 'Project', journal: true,
    args: ShotLink.omit({ id: true }).partial().extend({ link: clipId, returnAt: z.number().finite().min(0).max(180).nullable().optional() }).strict(),
    run: (d, a) => {
      const { link: linkId, returnAt, ...patch } = a, link = d.links?.find((l) => l.id === linkId);
      if (!link) throw new EditError('Link not found.');
      const next = ShotLink.parse({ ...link, ...patch, ...(returnAt === null ? { returnAt: undefined } : returnAt !== undefined ? { returnAt } : {}) });
      if (returnAt === null) delete (next as { returnAt?: number }).returnAt;
      checkLink(d, next); Object.assign(link, next); if (returnAt === null) delete link.returnAt;
    },
  },
  {
    id: 'link.remove', label: 'Delete link', group: 'Project', journal: true,
    args: z.object({ link: clipId }).strict(),
    run: (d, a) => { if (!d.links?.some((l) => l.id === a.link)) throw new EditError('Link not found.'); d.links = d.links.filter((l) => l.id !== a.link); },
  },
  // AI suggests / by hand (FILM-D1). The owner asks; an agent answers with steps; only the owner keeps (the keep
  // runs the steps and suggestion.mark in one batch) or drops it. Suggestions may only edit their own shot.
  {
    id: 'suggestion.ask', label: 'Ask for a suggestion', group: 'Clip', journal: true,
    args: z.object({ kind: SuggestionKind, clip: clipId, prompt: z.string().min(1).max(300) }).strict(),
    enabled: (st, a) => !st.project.tracks.some((t) => t.kind === 'picture' && t.clips.some((c) => c.id === a.clip && c.type === 'media')) ? 'Choose a shot on the picture track.'
      : (st.project.requests?.length ?? 0) >= REVIEW_LIMITS.requests ? 'Too many open requests; answer or delete some first.' : null,
    run: (d, a, x) => { const request = { id: x.id(), ...a, status: 'open' as const }; d.requests = [...(d.requests ?? []), request]; return request.id; },
  },
  {
    id: 'suggestion.add', label: (a: { label?: string }) => `Suggestion: ${a.label ?? ''}`, group: 'Clip', journal: true,
    args: Suggestion.omit({ id: true, status: true }).strict(),
    enabled: (st, a) => {
      if (!st.project.tracks.some((t) => t.clips.some((c) => c.id === a.clip && c.type === 'media'))) return 'Clip not found.';
      if (a.request && !st.project.requests?.some((r) => r.id === a.request)) return 'Request not found.';
      const bad = a.steps.find((step: { id: string; args: Record<string, unknown> }) => !SUGGESTION_STEPS.has(step.id) || (step.args as { clip?: unknown }).clip !== a.clip);
      if (bad) return `A suggestion may only use ${[...SUGGESTION_STEPS].join(', ')} on its own shot (${bad.id}).`;
      return (st.project.suggestions?.length ?? 0) >= REVIEW_LIMITS.suggestions ? 'Too many suggestions; keep or drop some first.' : null;
    },
    run: (d, a, x) => {
      const suggestion = Suggestion.parse({ ...a, id: x.id(), status: 'pending' });
      d.suggestions = [...(d.suggestions ?? []), suggestion];
      const request = d.requests?.find((r) => r.id === a.request); if (request) request.status = 'answered';
      return suggestion.id;
    },
  },
  {
    id: 'suggestion.mark', label: (a: { status?: string }) => a.status === 'kept' ? 'Keep suggestion' : 'Drop suggestion', group: 'Clip', journal: true, hostOnly: true,
    args: z.object({ suggestion: clipId, status: z.enum(['kept', 'dropped']) }).strict(),
    run: (d, a) => { const s = d.suggestions?.find((x) => x.id === a.suggestion); if (!s) throw new EditError('Suggestion not found.');
      if (s.status !== 'pending') throw new EditError('This suggestion was already decided.'); s.status = a.status; },
  },
  {
    id: 'suggestion.forget', label: 'Delete request', group: 'Clip', journal: true,
    args: z.object({ request: clipId }).strict(),
    run: (d, a) => { if (!d.requests?.some((r) => r.id === a.request)) throw new EditError('Request not found.'); d.requests = d.requests.filter((r) => r.id !== a.request); },
  },
  // A person's voice takes (FILM-D3). Recording carries audio, so adding, keeping and deleting is the Studio's
  // (host-only); agents read the takes with project.inspect.
  {
    id: 'take.add', label: 'Voice take', group: 'Caption', journal: true, hostOnly: true,
    args: VoiceTake.omit({ id: true, kept: true }).strict(),
    enabled: (st, a) => !st.project.lines?.some((l) => l.id === a.line) ? 'Line not found.' : (st.project.takes?.length ?? 0) >= REVIEW_LIMITS.takes ? 'Too many takes; delete some first.' : null,
    run: (d, a, x) => { const take = VoiceTake.parse({ ...a, id: x.id(), kept: false }); d.takes = [...(d.takes ?? []), take]; return take.id; },
  },
  {
    id: 'take.keep', label: 'Keep take', group: 'Caption', journal: true, hostOnly: true,
    args: z.object({ take: clipId }).strict(),
    run: (d, a) => {
      const take = d.takes?.find((t) => t.id === a.take); if (!take) throw new EditError('Take not found.');
      for (const t of d.takes!) if (t.line === take.line && t.lang === take.lang) t.kept = t.id === take.id;
      // The kept take becomes the voice of the line's cue in the next take, when the line is placed.
      const line = d.lines?.find((l) => l.id === take.line), cue = line?.cue ? d.draft.find((c) => c.id === line.cue) : undefined;
      if (cue) cue.audio = take.asset;
    },
  },
  {
    id: 'take.remove', label: 'Delete take', group: 'Caption', journal: true, hostOnly: true,
    args: z.object({ take: clipId }).strict(),
    run: (d, a) => { const take = d.takes?.find((t) => t.id === a.take); if (!take) throw new EditError('Take not found.');
      d.takes = d.takes!.filter((t) => t.id !== a.take);
      for (const cue of d.draft) if (cue.audio === take.asset) delete cue.audio; },
  },
  {
    // Film settings window (FILM-A2): any part; caption, titles and director merge field by field.
    id: 'project.settings', label: 'Film settings', group: 'Project', journal: true,
    args: FilmSettings.partial().extend({
      caption: FilmSettings.shape.caption.partial().strict().optional(),
      titles: FilmSettings.shape.titles.partial().strict().optional(),
      director: FilmSettings.shape.director.partial().strict().optional(),
    }).strict(),
    run: (d, a) => {
      const old = filmSettings(d);
      d.settings = FilmSettings.parse({ ...old, ...a, caption: { ...old.caption, ...a.caption }, titles: { ...old.titles, ...a.titles }, director: { ...old.director, ...a.director } });
    },
  },
  {
    id: 'project.size', label: 'Film size', group: 'Project', journal: true,
    args: z.object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(240).max(2160) }).strict(),
    run: (d, a) => { d.size = { width: a.width, height: a.height }; },
  },
  {
    id: 'media.add', label: (a: { media?: { kind?: string } }) => a.media?.kind === 'audio' ? 'Import sound' : 'Record shot', group: 'Project', journal: true, hostOnly: true,
    args: z.object({ media: Media, place: z.enum(['append', 'none']).default('append') }).strict(),
    run: (d, a, x) => { edit.addMedia(d, a.media); return a.place === 'append' ? edit.append(d, a.media.id, x) : undefined; },
  },
  {
    id: 'media.replace', label: 'Re-record shot', group: 'Project', journal: true, hostOnly: true,
    args: z.object({ media: clipId, asset: clipId, duration: z.number().int().min(0), camera: Media.shape.camera, cues: Media.shape.cues, hasSound: z.boolean().optional() }).strict(),
    run: (d, a) => edit.replaceMedia(d, a.media, { asset: a.asset, duration: a.duration, camera: a.camera, cues: a.cues, hasSound: a.hasSound ?? false }),
  },
  { id: 'select.set', label: 'Select', group: 'View', journal: false, args: z.object({ clips: ids }).strict(), run: () => undefined },
  { id: 'playhead.set', label: 'Move playhead', group: 'View', journal: false, args: z.object({ at: seconds }).strict(), run: () => undefined },
  { id: 'playhead.step', label: 'Step frames', group: 'View', shortcut: 'Left/Right', journal: false, args: z.object({ frames: z.number().int().min(-3600).max(3600) }).strict(), run: () => undefined },
  {
    id: 'media.remove', label: 'Remove recording', group: 'Project', journal: true,
    args: z.object({ media: clipId }).strict(),
    run: (d, a) => {
      edit.removeMedia(d, a.media);
      // The recording leaves its scene and its links too (FILM-C1/C2).
      for (const scene of d.scenes ?? []) scene.shots = scene.shots.filter((m) => m !== a.media);
      if (d.links) d.links = d.links.filter((l) => l.from.media !== a.media && l.to.media !== a.media);
    },
  },
  {
    id: 'media.set', label: 'Rename recording', group: 'Project', journal: true,
    args: z.object({ media: clipId, name: z.string().min(1).max(120) }).strict(),
    enabled: (s, a) => s.project.media.some((m) => m.id === a.media) ? null : 'Recording not found.',
    run: (d, a) => { d.media.find((m) => m.id === a.media)!.name = a.name; },
  },
  { id: 'project.inspect', label: 'Inspect film', group: 'View', journal: false, args: z.object({}).strict(), run: (d) => describe(d) },
];

/** True for commands only the studio itself may run (they carry recordings); MCP refuses them. */
export const isHostOnly = (id: string) => COMMANDS.some((c) => c.id === id && c.hostOnly);

export interface CommandInfo { id: string; label: string; group: CommandGroup; shortcut?: string; args: unknown; enabled: boolean; reason?: string }
export type RunResult = { ok: true; result?: unknown } | { ok: false; reason: string };
export interface BatchStep { id: string; args?: unknown }
export type BatchResult = { ok: true; results: unknown[] } | { ok: false; failed: { index: number; id: string; reason: string }; results: unknown[]; kept: number };

const reasonOf = (error: unknown) => error instanceof z.ZodError
  ? error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; ')
  : error instanceof Error ? error.message : 'The command failed.';

/**
 * One film being edited: the film, selection, playhead and history. Buttons, keys, MCP and the
 * assistant all call `run`; nothing else changes the film.
 */
export class FilmSession {
  readonly history = new History();
  state: FilmState;
  private readonly specs = new Map(COMMANDS.map((c) => [c.id, c]));
  constructor(project: FilmProject, private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly changed: (session: FilmSession) => void = () => {}) {
    this.state = { project, selection: [], playhead: 0 };
  }
  get project() { return this.state.project; }
  /** Opens another film; history starts empty. */
  load(project: FilmProject) { this.state = { project, selection: [], playhead: 0 }; this.history.clear(); this.changed(this); }

  /** null when the command can run with these arguments, otherwise why not. */
  reason(id: string, rawArgs: unknown = {}): string | null {
    const spec = this.specs.get(id);
    if (!spec) return `Unknown command ${id}.`;
    if (id === 'edit.undo') return this.history.past.length ? null : 'Nothing to undo.';
    if (id === 'edit.redo') return this.history.future.length ? null : 'Nothing to redo.';
    if (id === 'history.goto') {
      const done = (rawArgs as { done?: unknown } | null)?.done;
      return Number.isInteger(done) && (done as number) >= 0 && (done as number) <= this.history.past.length + this.history.future.length
        ? null : 'That history step does not exist.';
    }
    const args = spec.args.safeParse(rawArgs ?? {});
    if (!args.success) return reasonOf(args.error);
    return spec.enabled?.(this.state, args.data) ?? null;
  }
  /** Every command with its arguments and whether it can run now, as MCP and the assistant see them. */
  list(options: { host?: boolean } = {}): CommandInfo[] {
    return COMMANDS.filter((c) => options.host || !c.hostOnly).map((c) => {
      // Commands that need arguments are listed as available; running them gives the exact reason.
      const reason = c.args.safeParse({}).success ? this.reason(c.id) : null;
      const label = typeof c.label === 'string' ? c.label : c.id;
      return { id: c.id, label, group: c.group, ...(c.shortcut ? { shortcut: c.shortcut } : {}), args: z.toJSONSchema(c.args, { io: 'input' }),
        enabled: !reason, ...(reason ? { reason } : {}) };
    });
  }
  labelOf(id: string, rawArgs: unknown = {}): string {
    const spec = this.specs.get(id);
    if (!spec) return id;
    if (typeof spec.label === 'string') return spec.label;
    const args = spec.args.safeParse(rawArgs ?? {});
    return args.success ? spec.label(args.data) : spec.id;
  }

  /** Who the next changes are recorded for in History (default the person at the Studio). */
  private author = 'you';
  /** Runs `work` with changes recorded as made by `by` (e.g. 'agent' for MCP). */
  withAuthor<T>(by: string, work: () => T): T { const before = this.author; this.author = by; try { return work(); } finally { this.author = before; } }
  run(id: string, rawArgs: unknown = {}): RunResult {
    try {
      const { state, result, label } = this.apply(this.state, id, rawArgs);
      if (id === 'edit.undo' || id === 'edit.redo' || id === 'history.goto') { this.changed(this); return { ok: true, result: label }; }
      if (state.project !== this.state.project) this.history.record({ label, before: this.state.project, after: state.project, by: this.author, at: Date.now() });
      this.state = state; this.changed(this);
      return { ok: true, result };
    } catch (error) { return { ok: false, reason: reasonOf(error) }; }
  }

  /**
   * Runs steps in order and stops at the first error. Atomic (default): on error nothing changes.
   * Otherwise the steps before the error stay. Either way the kept edits are one undo step.
   */
  batch(steps: BatchStep[], options: { label?: string; atomic?: boolean } = {}): BatchResult {
    const atomic = options.atomic ?? true, start = this.state, results: unknown[] = [];
    let state = this.state, kept = 0;
    const finish = (to: FilmState) => {
      if (to.project !== start.project) this.history.record({ label: options.label ?? `Batch: ${kept} edits`, before: start.project, after: to.project, by: this.author, at: Date.now() });
      this.state = to; this.changed(this);
    };
    for (const [index, step] of steps.entries()) {
      try {
        if (step.id === 'edit.undo' || step.id === 'edit.redo' || step.id === 'history.goto') throw new EditError('Undo, redo and history steps cannot run inside a batch.');
        const next = this.apply(state, step.id, step.args);
        state = next.state; results.push(next.result); kept = index + 1;
      } catch (error) {
        const failed = { index, id: step.id, reason: reasonOf(error) };
        if (!atomic) finish(state);
        return { ok: false, failed, results, kept: atomic ? 0 : kept };
      }
    }
    finish(state);
    return { ok: true, results };
  }

  /**
   * The film that undo, redo or a history jump would bring back (null for other commands or when it cannot run).
   * Agents may not use history to bring back an approval only the owner can give (FILM-B2).
   */
  historyTarget(id: string, rawArgs: unknown = {}): FilmProject | null {
    if (id === 'edit.undo') return this.history.past.at(-1)?.before ?? null;
    if (id === 'edit.redo') return this.history.future.at(-1)?.after ?? null;
    if (id === 'history.goto') {
      const done = (rawArgs as { done?: unknown } | null)?.done;
      if (!Number.isInteger(done)) return null;
      const all = [...this.history.past, ...[...this.history.future].reverse()];
      const n = done as number;
      if (n < 0 || n > all.length) return null;
      return n === 0 ? (all[0]?.before ?? this.project) : all[n - 1]!.after;
    }
    return null;
  }
  /** Runs one command on a state and returns the next state; throws with the reason on refusal. */
  private apply(state: FilmState, id: string, rawArgs: unknown): { state: FilmState; result?: unknown; label: string } {
    const spec = this.specs.get(id);
    if (!spec) throw new EditError(`Unknown command ${id}.`);
    if (id === 'edit.undo' || id === 'edit.redo') {
      const step = id === 'edit.undo' ? this.history.undo() : this.history.redo();
      if (!step) throw new EditError(id === 'edit.undo' ? 'Nothing to undo.' : 'Nothing to redo.');
      const project = id === 'edit.undo' ? step.before : step.after;
      this.state = { ...this.state, project, selection: this.state.selection.filter((c) => project.tracks.some((t) => t.clips.some((x) => x.id === c))) };
      return { state: this.state, label: step.label };
    }
    if (id === 'history.goto') {
      const why = this.reason(id, rawArgs);
      if (why) throw new EditError(why);
      const done = (rawArgs as { done: number }).done;
      while (this.history.past.length > done) this.apply(this.state, 'edit.undo', {});
      while (this.history.past.length < done) this.apply(this.state, 'edit.redo', {});
      return { state: this.state, label: this.history.undoLabel ?? 'Start' };
    }
    const args = spec.args.parse(rawArgs ?? {});
    const why = spec.enabled?.(state, args);
    if (why) throw new EditError(why);
    const label = typeof spec.label === 'string' ? spec.label : spec.label(args);
    if (id === 'select.set') return { state: { ...state, selection: (args as { clips: string[] }).clips.filter((c) => state.project.tracks.some((t) => t.clips.some((x) => x.id === c))) }, label };
    if (id === 'playhead.set') return { state: { ...state, playhead: secondsOnFrame((args as { at: number }).at, state.project.rate) }, label };
    if (id === 'playhead.step') return { state: { ...state, playhead: Math.max(0, state.playhead + (args as { frames: number }).frames * frame(state.project.rate)) }, label };
    const context: CommandContext = { id: this.newId, state };
    if (!spec.journal) return { state, result: spec.run(state.project, args, context), label };
    let result: unknown;
    const project = transact(state.project, (draft) => { result = spec.run(draft, args, context); });
    const alive = (c: string) => project.tracks.some((t) => t.clips.some((x) => x.id === c));
    return { state: { ...state, project, selection: state.selection.filter(alive) }, result, label };
  }
}
