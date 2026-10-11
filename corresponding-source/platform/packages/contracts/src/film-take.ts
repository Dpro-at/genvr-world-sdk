import { z } from 'zod';

/**
 * Live actors (FILM-11): the director's studio tells everyone in the place's room when a take starts and stops; each
 * actor who agreed records their own microphone and sends it back to the director, who puts it under the shot.
 */
export const FILM_VOICE_MAX_BYTES = 4 * 1024 * 1024;
/** At most this many actors' voices are taken for one take. */
export const FILM_TAKE_MAX_ACTORS = 6;

/** Director -> room: a take starts, stops (voices follow) or is dropped (actors throw their recording away). */
export const FilmTakeMessage = z.object({ action: z.enum(['start', 'stop', 'cancel']), take: z.string().uuid() }).strict();
export type FilmTakeMessage = z.infer<typeof FilmTakeMessage>;
/** Room -> everyone: the same, with who directs. */
export interface FilmTakeEvent extends FilmTakeMessage { director: string; name: string }

/** Actor -> room: their recorded voice of a take. `delay`: ms between the start signal and the recording's start. */
export const FilmVoiceMessage = z.object({
  take: z.string().uuid(),
  mime: z.enum(['audio/webm', 'audio/ogg', 'audio/mp4']),
  delay: z.number().finite().min(0).max(5000),
  audio: z.instanceof(Uint8Array).refine((a) => a.byteLength > 0 && a.byteLength <= FILM_VOICE_MAX_BYTES, 'Voice too large.'),
}).strict();
export type FilmVoiceMessage = z.infer<typeof FilmVoiceMessage>;
/** Room -> director only: an actor's voice. */
export interface FilmVoiceEvent extends FilmVoiceMessage { from: string; name: string }
