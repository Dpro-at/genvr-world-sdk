import type { Style } from '@genvr/contracts';
import { LIBRARY, type LibraryEntry } from './library.js';

/**
 * Style coverage of the Core Library (task P2-30, decision 111): every entry is drawn in every
 * world style, with its own look for that style, one look shared by several styles, or not at all
 * where the style does not use it. A library test fails when an entry has no look for a ready
 * style, and keeps the table in docs/CORE-LIBRARY.md current.
 */

/** Every world style, in the order of the coverage table. */
export const ALL_STYLES_ORDER: readonly Style[] = ['blocky', 'voxel', 'anime', 'realistic'];

/** Styles players build in today: every entry must be drawn in them. Anime and realistic follow (P2-33, P2-18). */
export const READY_STYLES: readonly Style[] = ['blocky', 'voxel'];

/** How an entry is drawn in a style. */
export type StyleCoverage = 'own' | 'shared' | 'not-needed' | 'missing';

/** How one kind of entry (category/subcategory) covers the styles, and why. */
interface KindRule {
  reason: string;
  /** Styles an entry has its own look for (default: none). */
  own?: (entry: LibraryEntry) => readonly Style[];
  /** Styles where one look is shared: every style, or the styles its manifest lists. */
  shared?: 'all' | 'listed';
  /** Styles drawn with the look made for another style (e.g. cube avatars wear the blocky fit). */
  borrow?: Partial<Record<Style, Style>>;
  /** Styles that never use this kind of entry. */
  notNeeded?: (entry: LibraryEntry) => readonly Style[];
}

const itemLooks = (entry: LibraryEntry): readonly Style[] => {
  const { looks, parts } = entry as { looks?: Partial<Record<Style, unknown>>; parts?: readonly unknown[] };
  // The default parts are the blocky look; Realistic-only models (P2-38) have none.
  return [...(parts?.length ? (['blocky'] as Style[]) : []), ...(Object.keys(looks ?? {}) as Style[])];
};
/** Realistic-only models (P2-38) are not made for the other styles. */
const realisticOnly = (entry: LibraryEntry): readonly Style[] =>
  entry.manifest.styles.length === 1 && entry.manifest.styles[0] === 'realistic'
    ? ALL_STYLES_ORDER.filter((style) => style !== 'realistic')
    : [];
const listed = (entry: LibraryEntry): readonly Style[] => entry.manifest.styles;
const exceptVoxel: readonly Style[] = ALL_STYLES_ORDER.filter((style) => style !== 'voxel');

/** One rule per kind; a new kind needs a rule before its entries count as covered. */
const KIND_RULES: Readonly<Record<string, KindRule>> = {
  '3d-models/nature': {
    reason: 'Each model has its own look per style (decision 101); real models only in Realistic (P2-38).',
    own: itemLooks,
    notNeeded: realisticOnly,
  },
  '3d-models/props-and-decor': {
    reason: 'Each model has its own look per style (decision 101); real models only in Realistic (P2-38).',
    own: itemLooks,
    notNeeded: realisticOnly,
  },
  '3d-models/structures': {
    reason: 'Each model has its own look per style (decision 101); real models only in Realistic (P2-38).',
    own: itemLooks,
    notNeeded: realisticOnly,
  },
  '3d-models/parts': {
    reason: 'Plain shapes the builder sizes and colors: one look in every style.',
    shared: 'all',
  },
  '3d-models/gameplay': {
    reason: 'Game pieces are plain shapes: one look in every style.',
    shared: 'all',
  },
  '3d-models/building-blocks': {
    reason: 'A plain grid block the builder colors: one look in every style.',
    shared: 'all',
  },
  '3d-models/walls': {
    reason: 'Drawn from its line: panels, and blocks in Voxel places (decision 102).',
    own: () => ['blocky', 'voxel'],
    shared: 'listed',
  },
  '3d-models/openings': {
    reason: 'Holes in a drawn wall: panels, and whole blocks in Voxel places (decision 102).',
    own: () => ['blocky', 'voxel'],
    shared: 'listed',
  },
  'environment/roads': {
    reason: 'Drawn from its line: a road surface, and blocks in Voxel places (decision 100).',
    own: () => ['blocky', 'voxel'],
    shared: 'listed',
  },
  'environment/sky': { reason: 'One look in every style until skies per style (P2-31).', shared: 'listed' },
  'environment/weather': { reason: 'One look in every style until P2-32.', shared: 'listed' },
  'environment/water': {
    reason:
      'Pond tools share their listed styles; the ocean resource is Realistic-only with capability fallback.',
    shared: 'listed',
    notNeeded: realisticOnly,
  },
  'environment/surfaces': { reason: 'One look in every style until P2-32.', shared: 'listed' },
  'environment/ground': {
    reason:
      'Real ground materials exist only in Realistic places; other styles draw the soil colors (P2-37).',
    own: () => ['realistic'],
    notNeeded: () => ALL_STYLES_ORDER.filter((style) => style !== 'realistic'),
  },
  'environment/blocks': {
    reason: 'Ground blocks exist only in Voxel places (decision 99).',
    own: () => ['voxel'],
    notNeeded: () => exceptVoxel,
  },
  'styles/style-packs': {
    reason: 'Each style pack is the look of one style.',
    own: (entry) => [(entry as unknown as { style: Style }).style],
    notNeeded: (entry) =>
      ALL_STYLES_ORDER.filter((style) => style !== (entry as unknown as { style: Style }).style),
  },
  'avatar-appearance/animations': {
    reason: 'Moves are the same in every style (the skeleton does not change).',
    shared: 'listed',
  },
  'avatar-appearance/emotes': {
    reason: 'Moves are the same in every style (the skeleton does not change).',
    shared: 'listed',
  },
  'avatar-appearance/bodies': {
    reason: 'One body in every style; cube avatars change only the material (decision 104).',
    shared: 'listed',
  },
  'avatar-appearance/clothing': {
    reason: 'Made per body fit; cube avatars in Voxel places wear the blocky fit (decision 104).',
    own: listed,
    borrow: { voxel: 'blocky' },
  },
  'avatar-appearance/accessories': {
    reason: 'Made per body fit; cube avatars in Voxel places wear the blocky fit (decision 104).',
    own: listed,
    borrow: { voxel: 'blocky' },
  },
};

/** The kind of an entry: its category and subcategory. */
export const entryKind = (entry: LibraryEntry): string =>
  `${entry.manifest.category}/${entry.manifest.subcategory}`;

/** Why a kind covers the styles the way it does, or null for a kind without a rule. */
export const kindReason = (kind: string): string | null => KIND_RULES[kind]?.reason ?? null;

/** How an entry is drawn in a style; `missing` when it has no look there (or its kind has no rule). */
export function styleCoverage(entry: LibraryEntry, style: Style): StyleCoverage {
  const rule = KIND_RULES[entryKind(entry)];
  if (!rule) return 'missing';
  if (rule.own?.(entry).includes(style)) return 'own';
  if (rule.notNeeded?.(entry).includes(style)) return 'not-needed';
  if (rule.shared === 'all' || (rule.shared === 'listed' && entry.manifest.styles.includes(style)))
    return 'shared';
  const source = rule.borrow?.[style];
  if (source && rule.own?.(entry).includes(source)) return 'shared';
  return 'missing';
}

/** Entries with no look for a ready style: "id (style)" each. */
export function missingLooks(entries: readonly LibraryEntry[] = LIBRARY): string[] {
  return entries.flatMap((entry) =>
    READY_STYLES.filter((style) => styleCoverage(entry, style) === 'missing').map(
      (style) => `${entry.manifest.id} (${style})`,
    ),
  );
}

const LABELS: Record<StyleCoverage, string> = {
  own: 'own',
  shared: 'shared',
  'not-needed': 'not needed',
  missing: 'MISSING',
};

/** The coverage table of docs/CORE-LIBRARY.md: one row per kind, counts per style. */
export function coverageTable(entries: readonly LibraryEntry[] = LIBRARY): string {
  const kinds = new Map<string, LibraryEntry[]>();
  for (const entry of entries) kinds.set(entryKind(entry), [...(kinds.get(entryKind(entry)) ?? []), entry]);
  const header = `| Kind | Entries | ${ALL_STYLES_ORDER.join(' | ')} | Why |`;
  const rule = `|---|---|${ALL_STYLES_ORDER.map(() => '---').join('|')}|---|`;
  const rows = [...kinds].map(([kind, list]) => {
    const cells = ALL_STYLES_ORDER.map((style) => {
      const counts = new Map<StyleCoverage, number>();
      for (const entry of list) {
        const coverage = styleCoverage(entry, style);
        counts.set(coverage, (counts.get(coverage) ?? 0) + 1);
      }
      // Always in the same order: own, shared, not needed, missing.
      return (Object.keys(LABELS) as StyleCoverage[])
        .filter((coverage) => counts.has(coverage))
        .map((coverage) => `${counts.get(coverage)} ${LABELS[coverage]}`)
        .join(', ');
    });
    return `| ${kind} | ${list.length} | ${cells.join(' | ')} | ${kindReason(kind) ?? 'no rule yet'} |`;
  });
  return [header, rule, ...rows].join('\n');
}
