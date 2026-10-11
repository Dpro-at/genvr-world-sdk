import { z } from 'zod';
/**
 * Live actors (FILM-11): the director's studio tells everyone in the place's room when a take starts and stops; each
 * actor who agreed records their own microphone and sends it back to the director, who puts it under the shot.
 */
export declare const FILM_VOICE_MAX_BYTES: number;
/** At most this many actors' voices are taken for one take. */
export declare const FILM_TAKE_MAX_ACTORS = 6;
/** Director -> room: a take starts, stops (voices follow) or is dropped (actors throw their recording away). */
export declare const FilmTakeMessage: z.ZodObject<{
    action: z.ZodEnum<{
        start: "start";
        stop: "stop";
        cancel: "cancel";
    }>;
    take: z.ZodString;
}, z.core.$strict>;
export type FilmTakeMessage = z.infer<typeof FilmTakeMessage>;
/** Room -> everyone: the same, with who directs. */
export interface FilmTakeEvent extends FilmTakeMessage {
    director: string;
    name: string;
}
/** Actor -> room: their recorded voice of a take. `delay`: ms between the start signal and the recording's start. */
export declare const FilmVoiceMessage: z.ZodObject<{
    take: z.ZodString;
    mime: z.ZodEnum<{
        "audio/webm": "audio/webm";
        "audio/ogg": "audio/ogg";
        "audio/mp4": "audio/mp4";
    }>;
    delay: z.ZodNumber;
    audio: z.ZodInstanceOf<Uint8Array<ArrayBuffer>>;
}, z.core.$strict>;
export type FilmVoiceMessage = z.infer<typeof FilmVoiceMessage>;
/** Room -> director only: an actor's voice. */
export interface FilmVoiceEvent extends FilmVoiceMessage {
    from: string;
    name: string;
}
