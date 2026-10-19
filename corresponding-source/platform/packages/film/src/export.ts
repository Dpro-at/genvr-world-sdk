import type { FilmProject } from './model.js';

/**
 * The film as one export file sees it (FILM-A3): with `language`, only that language's captions and voice
 * track stay (other language tracks are hidden or muted); `captions: 'none'` hides every caption track.
 * Tracks without a language (picture, world sound, music, titles) are kept as they are.
 */
export function forExport(project: FilmProject, options: { language?: string | undefined; captions?: 'picture' | 'none' | undefined } = {}): FilmProject {
  const { language, captions = 'picture' } = options;
  if (language && !project.tracks.some((t) => t.lang === language)) throw new Error(`The film has no captions or voice in ${language}.`);
  return {
    ...project,
    tracks: project.tracks.map((t) => {
      if (t.kind === 'caption' && t.lang) return { ...t, hidden: captions === 'none' || (language ? t.lang !== language : t.hidden) };
      if (t.kind === 'sound' && t.lang && language) return { ...t, muted: t.lang !== language, solo: false };
      return t;
    }),
  };
}
