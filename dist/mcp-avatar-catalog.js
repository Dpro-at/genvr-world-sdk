import { AvatarCatalogQuery as Query } from './avatar-catalog-query.js';
import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { CORE_ANIMATIONS } from '@genvr/core-library';
import { EXPRESSIONS } from '@genvr/assistant';
import { motionCategories } from '@genvr/runtime';
const Entry = z.object({ id: z.string().regex(/^motion:[A-Za-z0-9_-]{1,100}$/), name: z.string().min(1).max(200), category: z.string().max(80) });
/** Reads metadata only from an operator-configured catalog, never model or motion bytes. */
export async function listAvatarMotions(input, catalogPath) {
    const query = Query.parse(input);
    const imported = [];
    if (catalogPath) {
        if ((await stat(catalogPath)).size > 8 * 1024 * 1024)
            throw new Error('Motion catalog exceeds 8 MB.');
        const data = z.object({ entries: z.array(Entry).max(10000) }).parse(JSON.parse(await readFile(catalogPath, 'utf8')));
        if (new Set(data.entries.map(entry => entry.id)).size !== data.entries.length)
            throw new Error('Duplicate catalog motion IDs.');
        imported.push(...data.entries);
    }
    const entries = [
        ...CORE_ANIMATIONS.map(animation => ({ id: animation.manifest.id, name: animation.manifest.name, categories: motionCategories(animation.manifest.name), source: 'native' })),
        ...imported.map(entry => ({ id: entry.id, name: entry.name, categories: motionCategories(entry.name, entry.category), source: 'host-library' })),
    ];
    const matching = entries.filter(entry => (!query.category || entry.categories.some(category => category.toLowerCase() === query.category.toLowerCase())) && `${entry.id} ${entry.name}`.toLowerCase().includes(query.query.toLowerCase()));
    return { total: entries.length, matched: matching.length, offset: query.offset, entries: matching.slice(query.offset, query.offset + query.limit), expressions: EXPRESSIONS, viewportConnected: false, note: 'Catalog discovery does not connect a live Studio viewport. present_avatar requires an attached host.' };
}
//# sourceMappingURL=mcp-avatar-catalog.js.map