import { LIBRARY } from './library.js';

/**
 * The tag words item drafts may use (P4-06, docs/ITEM-ANALYSIS.md): the vision model suggests
 * tags, and only words from this list are kept, so no brand, character, or unsuitable word
 * reaches the catalog. People can still type any tag in the review queue.
 */
const CURATED = `
  red orange yellow green blue purple pink brown black white gray grey gold silver colorful
  wood wooden stone metal glass plastic brick concrete fabric paper leather ice snow water sand
  grass dirt rock clay
  small big tall short long wide round square flat tiny huge simple detailed low-poly blocky
  cartoon realistic anime cute old new modern classic
  tree bush flower plant grass leaf pine palm oak forest garden nature rock hill mountain river
  lake sea beach island cloud sky sun moon star
  house home building wall door window roof floor stairs fence gate bridge tower castle shop
  cafe school office room kitchen bedroom bathroom city street road path park farm barn
  chair seat bench sofa table desk bed shelf cabinet box crate barrel lamp light candle clock
  sign cone pot vase rug carpet mirror frame picture
  car bus truck train boat plane bike wheel
  ball toy sport playground slide swing
  food fruit bread cake drink cup plate bowl
  decoration furniture prop outdoor indoor street-furniture container storage lighting
  animal bird fish cat dog horse
  backrest legs trunk top base handle roof-tile
`;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z-]+/)
    .filter((word) => word.length >= 2);
}

/** Words that say nothing about an item (every item is for the game). */
const TOO_GENERAL = new Set(['game', 'item', 'model', 'object', 'thing', 'core']);

/** Every allowed tag word. */
export const ITEM_TAG_VOCABULARY: ReadonlySet<string> = new Set(
  [
    ...words(CURATED),
    // Names and places in the Core Library (bench, pine, walls, props-and-decor, ...).
    ...LIBRARY.flatMap(({ manifest }) => [
      ...words(manifest.name),
      ...words(manifest.subcategory),
      manifest.category,
      ...manifest.styles,
    ]),
  ].filter((word) => !TOO_GENERAL.has(word)),
);

/** Keeps known tag words: lowercase, single words, no repeats, at most `max`. */
export function cleanItemTags(tags: readonly string[], max = 8): string[] {
  const kept: string[] = [];
  for (const tag of tags) {
    const word = tag.trim().toLowerCase();
    if (ITEM_TAG_VOCABULARY.has(word) && !kept.includes(word)) kept.push(word);
    if (kept.length === max) break;
  }
  return kept;
}
