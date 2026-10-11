import { filmLength, findBeats, fitMusic, gainFor, loudness, toSeconds, type FilmProject, type MediaClip } from '@genvr/film';
import type { Asset } from './model';

/** Loudness targets (FILM-08): dialogue at -16 LUFS (web video level), music and ambience 6 LU under it. */
export const TARGET = { dialogue: -16, music: -22, ambience: -24, effects: -18 } as const;

async function decode(blob: Blob): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(1, 1, 48000);
  return context.decodeAudioData(await blob.arrayBuffer());
}
const channels = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i));
/** The part of a decoded recording a clip plays. */
function part(b: AudioBuffer, clip: MediaClip): Float32Array[] {
  const from = Math.floor(toSeconds(clip.in) * b.sampleRate), to = Math.min(b.length, Math.floor(toSeconds(clip.in + clip.duration) * b.sampleRate));
  return channels(b).map((c) => c.subarray(from, to));
}

/**
 * Steps that set each sound clip's volume so its loudness meets the target for its sound type.
 * Studio recordings are silent today, so only imported sound (audio media) is measured.
 */
export async function loudnessSteps(project: FilmProject, assets: Asset[]): Promise<{ id: string; args: Record<string, unknown> }[]> {
  const steps: { id: string; args: Record<string, unknown> }[] = [];
  for (const track of project.tracks) for (const clip of track.clips) {
    if (clip.type !== 'media' || track.locked) continue;
    const media = project.media.find((m) => m.id === clip.media);
    const blob = media?.kind === 'audio' ? assets.find((a) => a.id === media.asset)?.blob : undefined;
    if (!blob) continue;
    const buffer = await decode(blob);
    const measured = loudness(part(buffer, clip), buffer.sampleRate);
    if (!Number.isFinite(measured)) continue;
    const target = TARGET[clip.soundType ?? 'music'];
    const volume = Math.min(2, Math.max(0, Number(gainFor(measured, target).toFixed(3))));
    steps.push({ id: 'clip.set', args: { clip: clip.id, volume } });
  }
  return steps;
}

/** Steps that cut a music clip to the film's picture length on beats (head + tail, middle dropped). */
export async function fitMusicSteps(project: FilmProject, assets: Asset[], clipId: string): Promise<{ id: string; args: Record<string, unknown> }[]> {
  const track = project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
  const clip = track?.clips.find((c) => c.id === clipId);
  if (!track || clip?.type !== 'media') throw new Error('Select a music clip on a sound track.');
  const media = project.media.find((m) => m.id === clip.media);
  const blob = media?.kind === 'audio' ? assets.find((a) => a.id === media.asset)?.blob : undefined;
  if (!blob) throw new Error('Only imported music can be fitted.');
  // The film's length without this clip: the picture and titles decide it.
  const others = { ...project, tracks: project.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })) };
  const target = toSeconds(filmLength(others)) - toSeconds(clip.start);
  if (target <= 1) throw new Error('Put pictures on the film first; the music is fitted to their length.');
  const buffer = await decode(blob), mono = buffer.getChannelData(0);
  const { beats } = findBeats(mono, buffer.sampleRate);
  const fit = fitMusic(beats, toSeconds(clip.in), toSeconds(clip.duration), target);
  if (!fit) throw new Error('The music is already shorter than the film, or has too few clear beats to cut.');
  const start = toSeconds(clip.start), headEnd = start + fit.head[1] - fit.head[0];
  return [
    { id: 'clip.trim', args: { clip: clip.id, edge: 'end', to: headEnd } },
    { id: 'clip.place', args: { media: clip.media, track: track.id, start: headEnd, in: fit.tail[0], duration: fit.tail[1] - fit.tail[0], mode: 'overwrite' } },
  ];
}
