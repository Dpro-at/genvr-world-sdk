import type { AvatarMotionLibrary, BakedMotion } from '@genvr/runtime';

/**
 * The owner's private motion library (our own motion files, `bakeMotion`), when the local Studio server serves one
 * (serve-studio.mjs, /private-motions/). Without it the Studio has only its own moves. Nothing here is shipped.
 */
export async function privateMotionLibrary(fetcher: typeof fetch = fetch): Promise<AvatarMotionLibrary | null> {
  try {
    const response = await fetcher('/private-motions/index.json');
    if (!response.ok) return null;
    const index = await response.json() as { motions?: Array<{ id: string; name: string; category: string; source: string; kind: 'loop' | 'once'; file: string }> };
    const rows = (index.motions ?? []).filter(row => /^motion:[A-Za-z0-9_-]{1,100}$/.test(row.id) && /^[A-Za-z]+\/[a-z0-9-]+\.json$/.test(row.file));
    // The same name in two packs shows its pack, so the list tells them apart.
    const named = new Map<string, number>(); for (const row of rows) named.set(row.name, (named.get(row.name) ?? 0) + 1);
    return {
      entries: rows.map(row => ({
        id: row.id, category: row.category, loop: row.kind === 'loop',
        name: (named.get(row.name) ?? 0) > 1 ? `${row.name} · ${row.source.replace(/ Pack$/, '')}` : row.name,
        motion: async () => {
          const file = await fetcher(`/private-motions/${row.file}`);
          if (!file.ok) throw new Error(`Motion ${row.id} is missing.`);
          return await file.json() as BakedMotion;
        },
      })),
      onError: (id, error) => console.warn(`Private motion ${id}:`, error),
    };
  } catch { return null; }
}
