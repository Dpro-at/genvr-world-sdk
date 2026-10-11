import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CORE_ITEMS,
  coverageTable,
  entryKind,
  kindReason,
  LIBRARY,
  missingLooks,
  READY_STYLES,
  styleCoverage,
} from '../src/index.js';

const DOC = new URL('../../../../docs/CORE-LIBRARY.md', import.meta.url);
const START = '<!-- STYLE-COVERAGE:START -->';
const END = '<!-- STYLE-COVERAGE:END -->';

describe('style coverage of the Core Library (P2-30)', () => {
  it('has a rule for every kind of entry', () => {
    const kinds = [...new Set(LIBRARY.map(entryKind))];
    expect(kinds.filter((kind) => kindReason(kind) === null)).toEqual([]);
  });

  it('draws every entry in every ready style', () => {
    // A new entry needs its own look for each ready style, or a kind rule that says why not.
    expect(missingLooks()).toEqual([]);
    expect(READY_STYLES).toEqual(['blocky', 'voxel']);
  });

  it('finds a new model without a Voxel look', () => {
    const tree = CORE_ITEMS.find((item) => item.manifest.id === 'genvr.core.tree.round')!;
    const bare = { ...tree, looks: {} };
    expect(styleCoverage(tree, 'voxel')).toBe('own');
    expect(styleCoverage(bare, 'voxel')).toBe('missing');
    expect(missingLooks([bare])).toEqual(['genvr.core.tree.round (voxel)']);
  });

  it('keeps the coverage table in docs/CORE-LIBRARY.md current', () => {
    const doc = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n');
    const table = doc.slice(doc.indexOf(START) + START.length, doc.indexOf(END)).trim();
    // When this fails, paste the new table between the markers.
    expect(table).toBe(coverageTable());
  });
});
