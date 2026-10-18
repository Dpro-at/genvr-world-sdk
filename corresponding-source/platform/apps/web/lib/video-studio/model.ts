import { fromSeconds, toSeconds, type SceneCue as FilmCue } from '@genvr/film';

/** A recording or sound file kept in this browser. */
export interface Asset { id: string; blob: Blob }

/** A cue as the editor shows it: seconds of its recording. The film stores ticks (`@genvr/film`). */
export interface SceneCue {
  id: string; actor: string; label: string; action: string; start: number; end: number;
  text: string; audio?: string; voice?: import('@genvr/contracts').FilmCueVoice; volume: number;
  /** FILM-10: where the avatar stands at the cue start, and the spots it walks to (world metres). */
  at?: { x: number; z: number }; to?: Array<{ x: number; z: number }>;
}
export const cueToSeconds = (cue: FilmCue): SceneCue => ({ ...cue, start: toSeconds(cue.start), end: toSeconds(cue.end) });
export const cueToTicks = (cue: SceneCue): FilmCue => ({ ...cue, start: fromSeconds(cue.start), end: fromSeconds(cue.end) });

/** Quick checks for cues typed in the editor (the film checks them again in ticks). */
export function validateCues(cues: SceneCue[], duration: number): void {
  if (!Array.isArray(cues) || cues.length > 30) throw new Error('Too many scene cues.');
  const ids = new Set<string>();
  for (const c of cues) {
    if (!c || ids.has(c.id) || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start ||
      c.end > duration + .05 || !Number.isFinite(c.volume) || c.volume < 0 || c.volume > 2 || c.text.length > 500)
      throw new Error('Invalid scene dialogue or motion cue.');
    ids.add(c.id);
  }
}

/**
 * A take must be close to the length asked for (FILM-02d): a busy world can drop most frames, and the
 * recording then ends early without any error. Below 80 % the take is refused with the reason.
 */
export function checkTakeLength(recorded: number, asked: number): void {
  if (recorded < asked * 0.8)
    throw new Error(`The world was busy: only ${recorded.toFixed(1)} s of ${asked.toFixed(1)} s was filmed. Record again.`);
}
