import { z } from 'zod';
import { FilmCamera, FilmCueVoice } from '@genvr/contracts';

/** Limits stay as in the first Studio Filming version until the owner raises them (FILM-02 plan, question 1). */
export const LIMITS = {
  filmSeconds: 180,
  mediaBytes: 128 * 1024 * 1024,
  media: 120,
  clipsPerTrack: 200,
  tracksPerKind: 8,
  cues: 30,
  markers: 100,
} as const;

const tick = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().min(1).max(120);
const name = z.string().max(120);

/** A spot on the ground of the world, in world metres (FILM-10). */
export const SceneSpot = z.object({ x: z.number().finite().min(-100000).max(100000), z: z.number().finite().min(-100000).max(100000) }).strict();
export type SceneSpot = z.infer<typeof SceneSpot>;

/**
 * One timed action or line of dialogue, in the time of its recording (media time). For the avatar,
 * `at` is where it stands when the cue starts and `to` the spots it walks to in order (FILM-10).
 */
export const SceneCue = z.object({
  id, actor: id, label: name, action: id,
  start: tick, end: tick,
  text: z.string().max(500), audio: id.optional(), voice: FilmCueVoice.optional(), volume: z.number().finite().min(0).max(2),
  at: SceneSpot.optional(), to: z.array(SceneSpot).max(8).optional(),
}).strict();
export type SceneCue = z.infer<typeof SceneCue>;

/** Something recorded or imported. `duration` 0 means no end (a still image). */
export const Media = z.object({
  id, kind: z.enum(['video', 'audio', 'image']), asset: id, name, duration: tick,
  camera: FilmCamera.nullable(), cues: z.array(SceneCue).max(LIMITS.cues),
  /** A video recording that carries the world's sound (FILM-08); older recordings are silent. */
  hasSound: z.boolean().optional(),
}).strict();
export type Media = z.infer<typeof Media>;

const clipBase = { id, start: tick, duration: tick };
const side = z.object({ interp: z.enum(['linear', 'hold', 'bezier', 'auto']), speed: z.number().finite().min(-1e6).max(1e6).optional(),
  influence: z.number().finite().min(0.001).max(1).optional() }).strict();
/** One key of an animated value (FILM-06); `at` is on the clip's own clock (see `properties.ts`). */
export const KeySchema = z.object({ id, at: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  value: z.union([z.number().finite(), z.tuple([z.number().finite(), z.number().finite()])]), in: side, out: side }).strict();
const keyLanes = z.record(z.string().max(120), z.array(KeySchema).max(200));
const effectValues = z.record(z.string().max(60), z.union([z.number().finite(), z.string().max(200), z.boolean()]));
/** Where a picture sits in the frame (FILM-05): x/y are fractions of the frame from its centre (-1..1 reaches the edge). */
export const Transform = z.object({
  x: z.number().finite().min(-4).max(4), y: z.number().finite().min(-4).max(4), scale: z.number().finite().min(0.01).max(10),
  rotation: z.number().finite().min(-3600).max(3600), opacity: z.number().finite().min(0).max(1),
}).strict();
export type Transform = z.infer<typeof Transform>;
export const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
export const ClipEffect = z.object({ id, effect: id, params: effectValues, enabled: z.boolean() }).strict();
export type ClipEffect = z.infer<typeof ClipEffect>;
/** Shows part of a media item: `in` is where in the recording the clip begins. */
export const MediaClip = z.object({ ...clipBase, type: z.literal('media'), media: id, in: tick,
  name: name.optional(), volume: z.number().finite().min(0).max(2),
  transform: Transform.optional(), blend: z.enum(['normal', 'add', 'multiply', 'screen']).optional(),
  effects: z.array(ClipEffect).max(8).optional(), keys: keyLanes.optional(),
  /** Sound fades at the clip's start and end (FILM-08). */
  fade: z.object({ in: tick, out: tick }).strict().optional(),
  /** What the sound is, for ducking and loudness (FILM-08). Recordings with dialogue cues count as dialogue. */
  soundType: z.enum(['dialogue', 'music', 'effects', 'ambience']).optional(),
  /** Transition on the cut with the clip right before this one (FILM-01). */
  transition: z.object({ kind: z.enum(['dissolve', 'dip_black', 'dip_white', 'wipe', 'iris', 'shape', 'blocks']), duration: tick,
    align: z.enum(['centre', 'start', 'end']), params: z.record(z.string().max(40), z.union([z.number().finite(), z.string().max(40)])) }).strict().optional() }).strict();

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Title look (FILM-01); a caption without it is a plain subtitle. */
export const TitleStyleSchema = z.object({
  font: z.enum(['nunito', 'serif', 'mono', 'display']), size: z.number().finite().min(8).max(400), color: hex,
  weight: z.union([z.literal(400), z.literal(700), z.literal(900)]), align: z.enum(['left', 'center', 'right']),
  outline: z.object({ color: hex, width: z.number().finite().min(0).max(20) }).strict().optional(), shadow: z.boolean(),
  box: z.object({ color: hex, opacity: z.number().finite().min(0).max(1) }).strict().optional(),
}).strict();
const AnimatorSchema = z.object({
  id, preset: z.string().max(60).optional(),
  props: z.object({ opacity: z.number().finite().min(-1).max(1).optional(), x: z.number().finite().min(-4000).max(4000).optional(),
    y: z.number().finite().min(-4000).max(4000).optional(), scale: z.number().finite().min(-1).max(10).optional(),
    rotation: z.number().finite().min(-3600).max(3600).optional(), tracking: z.number().finite().min(-200).max(400).optional() }).strict(),
  selector: z.object({ based: z.enum(['chars', 'words', 'lines']), shape: z.enum(['square', 'rampUp', 'rampDown', 'triangle', 'round', 'smooth']),
    start: z.number().finite().min(-200).max(300), end: z.number().finite().min(-200).max(300), offset: z.number().finite().min(-300).max(300),
    random: z.boolean(), seed: z.number().int().min(0).max(1_000_000) }).strict(),
}).strict();
export const CaptionClip = z.object({ ...clipBase, type: z.literal('caption'), text: z.string().max(2000),
  style: z.enum(['subtitle', 'title', 'name']),
  title: TitleStyleSchema.optional(), subtitle: z.string().max(500).optional(), template: z.enum(['card', 'strip', 'credits']).optional(),
  animators: z.array(AnimatorSchema).max(8).optional(), transform: Transform.optional(),
  blend: z.enum(['normal', 'add', 'multiply', 'screen']).optional(), keys: keyLanes.optional() }).strict();
/** An adjustment layer: its effect changes everything drawn below its track while it lasts (FILM-05). */
export const EffectClip = z.object({ ...clipBase, type: z.literal('effect'), effect: id, params: effectValues, keys: keyLanes.optional() }).strict();
export const Clip = z.discriminatedUnion('type', [MediaClip, CaptionClip, EffectClip]);
export type MediaClip = z.infer<typeof MediaClip>;
export type CaptionClip = z.infer<typeof CaptionClip>;
export type EffectClip = z.infer<typeof EffectClip>;
export type Clip = z.infer<typeof Clip>;

export const TrackKind = z.enum(['picture', 'sound', 'caption', 'effect']);
export type TrackKind = z.infer<typeof TrackKind>;
/** A language tag of a subtitle track (FILM-12), e.g. `en`, `ar`, `pt-BR`. */
export const LanguageTag = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/);
export const Track = z.object({
  id, kind: TrackKind, name: z.string().min(1).max(40),
  /** Subtitle tracks (FILM-12): the language of their lines; one track per language. */
  lang: LanguageTag.optional(),
  locked: z.boolean(), muted: z.boolean(), solo: z.boolean(), hidden: z.boolean(),
  clips: z.array(Clip).max(LIMITS.clipsPerTrack),
}).strict();
export type Track = z.infer<typeof Track>;

export const Marker = z.object({ id, at: tick, label: name, color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'violet']) }).strict();
export type Marker = z.infer<typeof Marker>;

/**
 * The look of subtitles (FILM-12d): `box` none (text with a dark outline), a box around each line, or a band across
 * the picture; its colour and opacity; the text colour.
 */
export const SubtitleStyle = z.object({ box: z.enum(['none', 'line', 'band']), boxColor: hex, boxOpacity: z.number().finite().min(0).max(1), textColor: hex }).strict();
export type SubtitleStyle = z.infer<typeof SubtitleStyle>;
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = { box: 'line', boxColor: '#000000', boxOpacity: 0.7, textColor: '#ffffff' };

export const FilmProject = z.object({
  version: z.literal(2),
  rate: z.object({ num: z.number().int().positive(), den: z.number().int().positive() }).strict(),
  size: z.object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(240).max(2160) }).strict(),
  media: z.array(Media).max(LIMITS.media),
  tracks: z.array(Track).max(LIMITS.tracksPerKind * 4),
  markers: z.array(Marker).max(LIMITS.markers),
  /** Cues prepared for the next recording; part of the project so undo covers them. */
  draft: z.array(SceneCue).max(LIMITS.cues),
  /** Music and ambience go down under dialogue (FILM-08); on by default with 10 dB and 0.3 s ramps. */
  ducking: z.object({ on: z.boolean(), amount: z.number().finite().min(0).max(40), fade: z.number().finite().min(0).max(3) }).strict().optional(),
  /** Colour looks saved by the person (FILM-07): name -> Colour effect settings. */
  looks: z.record(z.string().min(1).max(60), z.record(z.string().max(40), z.number().finite())).optional(),
  /** How subtitles and dialogue lines look (FILM-12d); absent: a dark box behind white text. */
  subtitleStyle: SubtitleStyle.optional(),
  /** The part of the film marked In / Out (FILM-09): playback and export use it when set. */
  range: z.object({ in: tick, out: tick }).strict().optional(),
}).strict();
export type FilmProject = z.infer<typeof FilmProject>;

/** Which clip types a track kind holds and which media kinds its media clips may show. */
export const TRACK_HOLDS: Record<TrackKind, { clip: Clip['type']; media?: Media['kind'][] }> = {
  picture: { clip: 'media', media: ['video', 'image'] },
  sound: { clip: 'media', media: ['audio', 'video'] },
  caption: { clip: 'caption' },
  effect: { clip: 'effect' },
};
const PREFIX: Record<TrackKind, string> = { picture: 'V', sound: 'A', caption: 'T', effect: 'E' };
export const trackPrefix = (kind: TrackKind) => PREFIX[kind];

export const newTrack = (kind: TrackKind, number: number, trackId = `${PREFIX[kind]}${number}`): Track =>
  ({ id: trackId, kind, name: `${PREFIX[kind]}${number}`, locked: false, muted: false, solo: false, hidden: false, clips: [] });

export const emptyFilm = (): FilmProject => ({
  version: 2, rate: { num: 30, den: 1 }, size: { width: 1920, height: 1080 },
  media: [], tracks: [newTrack('picture', 1), newTrack('sound', 1), newTrack('caption', 1)], markers: [], draft: [],
});
