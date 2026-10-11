import { z } from 'zod';

const metres = z.number().finite().min(-60000).max(60000);
export const FilmPoint = z.tuple([metres, metres, metres]);
export const FilmPreset = z.enum(['static', 'handheld', 'running', 'drone', 'follow', 'side', 'orbit']);
export type FilmPreset = z.infer<typeof FilmPreset>;
export const FilmEase = z.enum(['linear', 'in', 'out', 'in_out']);
/** One stop of a camera flight: where the camera is and looks at `at` seconds after the shot starts. */
export const FilmWaypoint = z.object({
  at: z.number().finite().min(0).max(180),
  position: FilmPoint,
  target: FilmPoint,
  /** How the move from this stop to the next one speeds up and slows down. */
  ease: FilmEase.default('linear'),
  fov: z.number().min(10).max(120).optional(),
}).strict();
export type FilmWaypoint = z.infer<typeof FilmWaypoint>;
/** Absolute world metres, degrees for lenses/roll, seconds for time. */
export const FilmCamera = z.object({
  preset: FilmPreset.default('static'),
  position: FilmPoint.default([0, 3, -8]),
  target: FilmPoint.default([0, 1.5, 0]),
  follow_player: z.boolean().default(false),
  fov: z.number().min(10).max(120).default(50),
  responsiveness: z.number().min(0.1).max(30).optional(),
  shake: z.number().min(0).max(1).optional(),
  speed: z.number().min(-30).max(30).default(12),
  seed: z.number().int().min(0).max(65535).default(1),
  roll: z.number().min(-45).max(45).default(0),
  /** A flight through stops; when given it replaces position, target and the orbit turn. */
  path: z.array(FilmWaypoint).min(2).max(32).optional(),
}).strict().refine((camera) => !camera.path || camera.path.every((stop, i) => i === 0 || stop.at > camera.path![i - 1]!.at),
  'Path stops must have increasing times.');
export type FilmCamera = z.infer<typeof FilmCamera>;
export const FilmView = z.object({ position: FilmPoint, direction: FilmPoint,
  fov: z.number().finite().min(1).max(179), render_width: z.number().int().positive(), render_height: z.number().int().positive() });
export type FilmView = z.infer<typeof FilmView>;
export const FilmPhoto = z.object({
  width: z.number().int().min(320).max(3840).default(1920),
  height: z.number().int().min(240).max(2160).default(1080),
  settle_seconds: z.number().min(0).max(10).default(1),
}).strict();
export const FilmVideo = FilmPhoto.extend({
  seconds: z.number().min(1).max(30).default(5),
  fps: z.number().int().min(15).max(60).default(30),
});
const studioId = z.string().min(1).max(120);
/** A timed avatar/object action and dialogue line, in seconds of its recording (media time). */
/** A spot on the ground of the world, in world metres (FILM-10). */
export const FilmSceneSpot = z.object({ x: z.number().finite().min(-100000).max(100000), z: z.number().finite().min(-100000).max(100000) }).strict();
export const FilmSceneCue = z.object({
  id: studioId, actor: studioId, label: z.string().max(120), action: studioId,
  start: z.number().finite().min(0).max(180), end: z.number().finite().positive().max(180),
  text: z.string().max(500), audio: studioId.optional(), volume: z.number().finite().min(0).max(2),
  /** FILM-10: where the avatar stands when the cue starts, and the spots it walks to in order (world metres). */
  at: FilmSceneSpot.optional(), to: z.array(FilmSceneSpot).max(8).optional(),
}).strict().refine((cue) => cue.end > cue.start, 'Cue end must follow its start.');
/** Panel arrangements inside Studio Filming (FILM-04). */
/** Filming workspaces; `story` is the place's scroll story (SCROLL-03: moved here from its own Studio tab). */
export const FilmWorkspace = z.enum(['shoot', 'edit', 'captions', 'sound', 'colour', 'story']);
export type FilmWorkspace = z.infer<typeof FilmWorkspace>;
const commandId = z.string().min(1).max(60).regex(/^[a-z]+\.[a-zA-Z]+$/);
/** One editor command (ids and arguments come from `{ kind: 'commands' }`; times are seconds). */
export const FilmStudioStep = z.object({ id: commandId, args: z.record(z.string(), z.unknown()).default({}) }).strict();
/**
 * Operations on the Studio Filming project in the connected browser. `commands`, `command` and
 * `batch` use the same command list as the editor's buttons and keys (FILM-02); the older
 * `split`, `remove`, `trim`, `cues`, `undo`, `redo` kinds are kept for existing agents.
 */
export const FilmStudioOperation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inspect') }).strict(),
  z.object({ kind: z.literal('commands') }).strict(),
  /** Sound jobs that read the decoded audio (FILM-08): match dialogue loudness, or fit a music clip to the film length on beats. */
  z.object({ kind: z.literal('sound'), action: z.enum(['match_loudness', 'fit_music']), clip: studioId.optional() }).strict(),
  /** Subtitles from the film's voice (FILM-12): one track per language code; `spoken` the language spoken (absent: found by ear). */
  z.object({ kind: z.literal('subtitles'), languages: z.array(z.string().regex(/^[a-z]{2,3}$/)).min(1).max(6), spoken: z.string().regex(/^[a-z]{2,3}$/).optional(),
    /** Also speak each language that has a free voice (FILM-12b). */
    voice: z.boolean().optional() }).strict(),
  /** What the person sees (workspace, playhead, selection); `workspace` switches it. */
  z.object({ kind: z.literal('ui'), workspace: FilmWorkspace.optional() }).strict(),
  z.object({ kind: z.literal('command'), id: commandId, args: z.record(z.string(), z.unknown()).default({}) }).strict(),
  z.object({ kind: z.literal('batch'), steps: z.array(FilmStudioStep).min(1).max(100), label: z.string().max(80).optional(),
    atomic: z.boolean().default(true) }).strict(),
  z.object({ kind: z.literal('frame'), at: z.number().finite().min(0).max(180),
    width: z.number().int().min(160).max(1920).default(1280), height: z.number().int().min(90).max(1080).default(720) }).strict(),
  z.object({ kind: z.literal('trim'), shot_id: studioId, in: z.number().finite().min(0).max(180), out: z.number().finite().min(0).max(180) }).strict(),
  z.object({ kind: z.literal('split'), shot_id: studioId, at: z.number().finite().min(0).max(180) }).strict(),
  z.object({ kind: z.literal('move'), shot_id: studioId, delta: z.number().int().min(-60).max(60) }).strict(),
  z.object({ kind: z.literal('remove'), shot_id: studioId }).strict(),
  z.object({ kind: z.literal('cues'), shot_id: studioId.optional(), cues: z.array(FilmSceneCue).max(30) }).strict(),
  z.object({ kind: z.literal('record'), shot_id: studioId.optional(), gameplay: z.boolean().default(false), settings: FilmVideo.default(() => FilmVideo.parse({})),
    /** The Studio's recording options for this take and after (absent: as set in the Studio): world sound, live actors' voices (FILM-11). */
    world_sound: z.boolean().optional(), live_actors: z.boolean().optional() }).strict(),
  /** Speak one language's subtitles with its free voice onto its voice track (FILM-12b). */
  z.object({ kind: z.literal('voice'), language: z.string().regex(/^[a-z]{2,3}$/) }).strict(),
  /** One language's subtitles as .srt or .vtt text (FILM-12). */
  z.object({ kind: z.literal('subtitle_file'), language: z.string().regex(/^[a-z]{2,3}$/), format: z.enum(['srt', 'vtt']).default('srt') }).strict(),
  z.object({ kind: z.literal('export'), shot_id: studioId.optional(), width: z.number().int().min(320).max(1920).default(1280), height: z.number().int().min(240).max(1920).default(720) }).strict(),
  z.object({ kind: z.literal('undo') }).strict(), z.object({ kind: z.literal('redo') }).strict(),
]);
export type FilmStudioOperation = z.infer<typeof FilmStudioOperation>;
/** What the browser returns for a studio operation (validated by the API before an agent sees it). */
export const FilmStudioResult = z.object({
  /** The film with times in seconds and ticks (tracks, clips, recordings, markers, draft cues). */
  film: z.record(z.string(), z.unknown()),
  result: z.unknown().optional(),
  commands: z.array(z.object({ id: z.string().max(60), label: z.string().max(80), group: z.string().max(20), shortcut: z.string().max(30).optional(),
    args: z.unknown(), enabled: z.boolean(), reason: z.string().max(300).optional() }).strict()).max(200).optional(),
  failed: z.object({ index: z.number().int().min(0), id: z.string().max(60), reason: z.string().max(500) }).strict().optional(),
  undo: z.string().max(80).optional(), redo: z.string().max(80).optional(),
  ui: z.object({ workspace: FilmWorkspace, playhead: z.number().min(0), selection: z.array(studioId).max(200), source: studioId.nullable() }).strict().optional(),
  actors: z.array(z.object({ id: studioId, label: z.string().max(120) }).strict()).max(1000),
  actions: z.array(z.object({ id: studioId, label: z.string().max(120) }).strict()).max(200),
  assets: z.array(z.object({ id: studioId, mime: z.string().max(100), bytes: z.number().int().min(0) }).strict()).max(2000),
}).strict();
export const FilmCommand = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('camera'), camera: FilmCamera }),
  z.object({ kind: z.literal('photo'), settings: FilmPhoto }),
  z.object({ kind: z.literal('video'), settings: FilmVideo }),
  z.object({ kind: z.literal('reset') }),
  z.object({ kind: z.literal('inspect') }),
  z.object({ kind: z.literal('studio'), operation: FilmStudioOperation }),
]);
export type FilmCommand = z.infer<typeof FilmCommand>;
