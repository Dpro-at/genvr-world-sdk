import { filmSettings, type FilmProject } from './model.js';

/** What each language of the film still misses (FILM-B3, boards 11 and 20): captions and, for text + voice, a voice track. */
export function languageStatus(project: FilmProject) {
  const settings = filmSettings(project);
  const lines = (project.lines ?? []);
  return settings.languages.map((row, index) => {
    const captions = project.tracks.find((t) => t.kind === 'caption' && t.lang === row.lang)?.clips.length ?? 0;
    const voice = project.tracks.some((t) => t.kind === 'sound' && t.lang === row.lang && t.clips.length > 0);
    const words = lines.filter((l) => l.text[row.lang]?.trim()).length;
    const missing: Array<'captions' | 'voice' | 'words'> = [];
    if (lines.length && words < lines.length) missing.push('words');
    if (!captions) missing.push('captions');
    if (row.level === 'text_voice' && !voice) missing.push('voice');
    const speakers = (project.cast ?? []).map((c) => ({ cast: c.id, name: c.name, voice: c.voices[row.lang] ?? null }));
    return { lang: row.lang, main: index === 0, level: row.level, captions, voice, words, lines: lines.length, missing, speakers };
  });
}
