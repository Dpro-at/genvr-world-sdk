import { box, defineModel, METAL, WOOD } from '../_parts.js';

/**
 * The Melee tool's id. Stored worlds and loadouts may still hold its old id (the item was named
 * Sword before decision 119); the contracts read that as this one (`LEGACY_MELEE_TOOL_ID`).
 */
export const MELEE_TOOL_ID = 'genvr.core.gameplay.melee-tool';

/**
 * A generic held melee tool: a long flat head points up along +y from the grip. Its base rests on
 * y = 0 like every Core item, so the grip is 0.1 m above the origin (the hand holds it there).
 * What it is in a game (and what it is called there) is the designer's decision.
 */
export default defineModel({
  id: MELEE_TOOL_ID,
  name: 'Melee tool',
  subcategory: 'gameplay',
  collider: 'none',
  tool: { kind: 'melee', damage: 25, reach: 2.5, arcDeg: 90, cooldownSec: 0.6 },
  parts: [
    box([0.06, 0.8, 0.015], [0, 0.59, 0], METAL), // head
    box([0.22, 0.04, 0.05], [0, 0.18, 0], METAL), // guard
    box([0.04, 0.12, 0.04], [0, 0.10, 0], WOOD), // grip
    box([0.06, 0.04, 0.06], [0, 0.02, 0], METAL), // end cap
  ],
});
