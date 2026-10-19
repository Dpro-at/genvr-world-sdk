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

/**
 * Things set once for the whole film or series (FILM-A2, Film settings window). The video size stays in
 * `size` and the subtitle colours in `subtitleStyle`; everything else a person sets once lives here.
 * Agents read it through `project.inspect` and change it with `project.settings`.
 */
export const FilmLanguage = z.object({
  lang: LanguageTag,
  /** What the film gives in this language: captions only, or captions and dubbed voices. */
  level: z.enum(['text', 'text_voice']),
}).strict();
export type FilmLanguage = z.infer<typeof FilmLanguage>;
export const FilmSettings = z.object({
  kind: z.enum(['film', 'series']),
  name: z.string().max(80),
  /** The first language is the main one (the one the film is recorded in). */
  languages: z.array(FilmLanguage).max(12).refine((rows) => new Set(rows.map((r) => r.lang)).size === rows.length, 'Each language only once.'),
  /** The series story that agents read before they write lines. */
  story: z.string().max(4000),
  /** Length of a new shot, seconds. */
  shotSeconds: z.number().int().min(1).max(30),
  worldSound: z.boolean(),
  /** Voices of people in the same room (live actors). */
  roomVoices: z.boolean(),
  caption: z.object({ size: z.enum(['small', 'medium', 'large']), place: z.enum(['bottom', 'top']), inExport: z.boolean() }).strict(),
  titles: z.object({ intro: z.boolean(), episodeCard: z.boolean(), credits: z.boolean(), creditsText: z.string().max(2000) }).strict(),
  /** How much the AI director decides alone. */
  director: z.object({ autonomy: z.enum(['auto', 'end', 'each']) }).strict(),
}).strict();
export type FilmSettings = z.infer<typeof FilmSettings>;
export const DEFAULT_FILM_SETTINGS: FilmSettings = {
  kind: 'film', name: '', languages: [], story: '', shotSeconds: 5, worldSound: true, roomVoices: false,
  caption: { size: 'medium', place: 'bottom', inExport: true },
  titles: { intro: false, episodeCard: false, credits: false, creditsText: '' },
  director: { autonomy: 'end' },
};
/** The film's settings with the defaults filled in. */
export const filmSettings = (project: { settings?: FilmSettings | undefined }): FilmSettings => ({ ...DEFAULT_FILM_SETTINGS, ...project.settings });

/**
 * Who speaks one language for a character (FILM-B1): a saved AI voice from the voice library, or a person who
 * records it (a voice actor invited into the project).
 */
export const CastVoice = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ai'), voiceId: z.string().uuid(), name: z.string().min(1).max(80) }).strict(),
  z.object({ kind: z.literal('person'), name: z.string().min(1).max(80) }).strict(),
]);
export type CastVoice = z.infer<typeof CastVoice>;

/** A character of the film or series (FILM-B1, boards 2 and 3). `actor` is the scene actor that plays it ('self' = my avatar). */
export const CastMember = z.object({
  id, name: z.string().min(1).max(60), actor: id,
  voices: z.record(LanguageTag, CastVoice),
  /** Who writes this character's lines: the owner, or a named agent (the owner still approves each line). */
  linesBy: z.discriminatedUnion('kind', [z.object({ kind: z.literal('owner') }).strict(), z.object({ kind: z.literal('agent'), name: z.string().min(1).max(80) }).strict()]),
  role: z.enum(['lead', 'support', 'extra']),
  personality: z.string().max(1000), arc: z.string().max(1000),
}).strict();
export type CastMember = z.infer<typeof CastMember>;

/** One line of the script (FILM-B2): words per language, written by the owner or an agent, approved only by the owner. */
export const ScriptLine = z.object({
  id, cast: id, episode: z.number().int().min(1).max(200).default(1),
  text: z.record(LanguageTag, z.string().max(500)),
  status: z.enum(['draft', 'approved']), by: z.enum(['owner', 'agent']),
  /** Set by the owner's approval and never cleared by an agent: a once-approved line stays the owner's to delete. */
  approvedOnce: z.boolean().optional(),
  /** The draft cue made from this line, once it is placed for a take. */
  cue: id.optional(),
}).strict();
export type ScriptLine = z.infer<typeof ScriptLine>;

export const CAST_LIMITS = { cast: 40, lines: 500 } as const;

/** A named spot of a scene (FILM-C1): cues can start at or walk to it, so an agent can use exact places. */
export const NamedSpot = z.object({ name: z.string().min(1).max(40), x: z.number().finite().min(-100000).max(100000), z: z.number().finite().min(-100000).max(100000) }).strict();
/** How a scene sounds (FILM-C3): like the world, or its own loudness of nature/weather and of footsteps (0-100). */
export const SceneSound = z.object({ mode: z.enum(['world', 'own']), ambience: z.number().int().min(0).max(100), steps: z.number().int().min(0).max(100) }).strict();
export type SceneSound = z.infer<typeof SceneSound>;
export const DEFAULT_SCENE_SOUND: SceneSound = { mode: 'world', ambience: 56, steps: 80 };
/** A scene (FILM-C1, boards 7 and 8): its shots, who is in it and their job, the director's instructions, spots, sound. */
export const Scene = z.object({
  id, name: z.string().min(1).max(60), place: z.string().max(120), when: z.string().max(60),
  instructions: z.string().max(2000),
  who: z.array(z.object({ cast: id, job: z.string().max(200) }).strict()).max(20),
  /** Recordings (media ids) that belong to this scene, in story order. */
  shots: z.array(id).max(50),
  spots: z.array(NamedSpot).max(20),
  sound: SceneSound,
  episode: z.number().int().min(1).max(200).default(1),
}).strict();
export type Scene = z.infer<typeof Scene>;
/**
 * A timed link between two shots (FILM-C2, boards 7 and 9): leave `from` at a time and play `to` from a time;
 * a flashback returns to `from` at `returnAt` seconds of the first shot.
 */
export const ShotLink = z.object({
  id, from: z.object({ media: id, at: z.number().finite().min(0).max(180) }).strict(),
  to: z.object({ media: id, at: z.number().finite().min(0).max(180) }).strict(),
  kind: z.enum(['continue', 'flashback', 'back', 'jump', 'loop']),
  returnAt: z.number().finite().min(0).max(180).optional(),
  look: z.enum(['cut', 'blur', 'fade', 'old_film']),
}).strict();
export type ShotLink = z.infer<typeof ShotLink>;
export const SCENE_LIMITS = { scenes: 60, links: 200 } as const;

/**
 * AI suggests / by hand (FILM-D1, boards 17–19): the owner asks for a suggestion on a shot; an agent answers with
 * editor steps; the steps change nothing until the owner keeps them. Only editing commands of the shot are allowed.
 */
export const SuggestionKind = z.enum(['transition', 'colour', 'effect']);
export const SuggestionRequest = z.object({ id, kind: SuggestionKind, clip: id, prompt: z.string().min(1).max(300), status: z.enum(['open', 'answered']) }).strict();
export type SuggestionRequest = z.infer<typeof SuggestionRequest>;
export const Suggestion = z.object({
  id, kind: SuggestionKind, clip: id, label: z.string().min(1).max(120), request: id.optional(),
  steps: z.array(z.object({ id: z.string().min(1).max(60), args: z.record(z.string(), z.unknown()) }).strict()).min(1).max(20),
  status: z.enum(['pending', 'kept', 'dropped']),
}).strict();
export type Suggestion = z.infer<typeof Suggestion>;
/** A person's recorded voice for one line in one language (FILM-D3, board 23); the kept take is the line's voice. */
export const VoiceTake = z.object({ id, line: id, lang: LanguageTag, asset: id, seconds: z.number().finite().min(0.1).max(60), kept: z.boolean(), by: z.string().max(80) }).strict();
export type VoiceTake = z.infer<typeof VoiceTake>;
export const REVIEW_LIMITS = { requests: 100, suggestions: 200, takes: 300 } as const;

/** An episode of a series (FILM-E1, board 12): its number is its place in the list; scenes say which episode they are in. */
export const Episode = z.object({ id, title: z.string().min(1).max(80), outline: z.string().max(4000),
  /** Characters in this episode (empty = everyone in the cast). */
  cast: z.array(id).max(40) }).strict();
export type Episode = z.infer<typeof Episode>;
/**
 * A run of the AI director (FILM-E3, boards 10 and 11c). An agent connected through MCP does the work with the
 * same commands as everyone; it reports each step here. With autonomy 'each' (or 'end' for the last step) a step
 * waits for the owner, who alone approves it. The director never publishes or shares.
 */
export const DirectorStep = z.object({ id, label: z.string().min(1).max(120), op: z.string().max(60),
  state: z.enum(['todo', 'running', 'waiting', 'done', 'failed']), note: z.string().max(500).optional(),
  /** Set only by the owner's approval; such a step is never changed again by an agent. */
  approved: z.boolean().optional() }).strict();
export const DirectorRun = z.object({
  id, idea: z.string().min(1).max(2000), kind: z.enum(['film', 'series']),
  episodes: z.number().int().min(1).max(50), minutes: z.number().int().min(1).max(60),
  autonomy: z.enum(['auto', 'end', 'each']),
  status: z.enum(['waiting_for_agent', 'running', 'paused', 'stopped', 'done']),
  by: z.string().max(80).optional(), steps: z.array(DirectorStep).max(100), started: z.number().int().min(0),
}).strict();
export type DirectorRun = z.infer<typeof DirectorRun>;

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
  /** Set once for the whole film (FILM-A2); absent: DEFAULT_FILM_SETTINGS. */
  settings: FilmSettings.optional(),
  /** Characters (FILM-B1) and the script (FILM-B2). */
  cast: z.array(CastMember).max(CAST_LIMITS.cast).optional(),
  lines: z.array(ScriptLine).max(CAST_LIMITS.lines).optional(),
  /** Scenes (FILM-C1) and timed links between shots (FILM-C2). */
  scenes: z.array(Scene).max(SCENE_LIMITS.scenes).optional(),
  links: z.array(ShotLink).max(SCENE_LIMITS.links).optional(),
  /** AI suggestions waiting for the owner (FILM-D1) and a person's voice takes (FILM-D3). */
  requests: z.array(SuggestionRequest).max(REVIEW_LIMITS.requests).optional(),
  suggestions: z.array(Suggestion).max(REVIEW_LIMITS.suggestions).optional(),
  takes: z.array(VoiceTake).max(REVIEW_LIMITS.takes).optional(),
  /** Episodes of a series (FILM-E1) and the AI director's run (FILM-E3). */
  episodes: z.array(Episode).max(200).optional(),
  director: DirectorRun.optional(),
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
