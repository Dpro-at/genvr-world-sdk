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

/** Lines approved in `next` that are not approved in `now` — an approval only the owner may give (FILM-B2). */
export function approvalsGained(now: FilmProject, next: FilmProject): string[] {
  const approved = new Set((now.lines ?? []).filter((l) => l.status === 'approved').map((l) => l.id));
  return (next.lines ?? []).filter((l) => l.status === 'approved' && !approved.has(l.id)).map((l) => l.id);
}

/**
 * True when going from `now` to `next` changes something only the owner may change (FILM-B2): who writes a
 * character, the owner's own characters and their lines, or any line the owner has ever approved (any field,
 * or whether it exists). Agents may not reach such a change through undo, redo or history jumps.
 */
export function ownerStateChanged(now: FilmProject, next: FilmProject): boolean {
  const view = (p: FilmProject, guarded: Set<string>) => JSON.stringify({
    writers: (p.cast ?? []).map((c) => [c.id, c.linesBy]).sort(),
    owners: (p.cast ?? []).filter((c) => c.linesBy.kind === 'owner').map((c) => c).sort((a, b) => a.id.localeCompare(b.id)),
    lines: (p.lines ?? []).filter((l) => guarded.has(l.id)).map((l) => JSON.stringify(l)).sort(),
    // FILM-D: keeping or dropping a suggestion and the person's voice takes are the owner's too.
    decided: (p.suggestions ?? []).filter((x) => decided.has(x.id)).map((x) => `${x.id}:${x.status}`).sort(),
    takes: (p.takes ?? []).map((t) => JSON.stringify(t)).sort(),
  });
  const decided = new Set([...(now.suggestions ?? []), ...(next.suggestions ?? [])].filter((x) => x.status !== 'pending').map((x) => x.id));
  // Guarded: every line the owner ever approved, and every line of a character the owner writes (in either film).
  const ownerCast = new Set([...(now.cast ?? []), ...(next.cast ?? [])].filter((c) => c.linesBy.kind === 'owner').map((c) => c.id));
  const guarded = new Set([...(now.lines ?? []), ...(next.lines ?? [])].filter((l) => l.status === 'approved' || l.approvedOnce || ownerCast.has(l.cast)).map((l) => l.id));
  return view(now, guarded) !== view(next, guarded);
}
