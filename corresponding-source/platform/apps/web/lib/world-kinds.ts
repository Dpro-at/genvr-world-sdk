import type { WorldSeed } from '@genvr/contracts';
import { Mountain, Square, Sun, TreePalm, Trees, type LucideIcon } from 'lucide-react';

/** A starter world kind, or `empty`: flat ground with nothing on it, to build from scratch (Real place). */
export type WorldKind = WorldSeed['kind'] | 'empty';

/**
 * The kinds of starter world a Realistic place can begin as (P2-40, owner choice 3: the creator
 * picks the kind from cards when the place is made). Each says what the creator will find, in the
 * words the generator keeps: its shape and the water it starts with (`starterWater`).
 */
export const WORLD_KIND_CARDS: Array<{
  id: WorldKind;
  name: string;
  description: string;
  /** The product is black and white (decision 67), so the icon, not a color, tells kinds apart. */
  Icon: LucideIcon;
}> = [
  {
    id: 'valley',
    name: 'Valley',
    description: 'Hills on both sides and a river down the middle into a lake.',
    Icon: Trees,
  },
  {
    id: 'island',
    name: 'Island',
    description: 'Land in the sea, with a hill in the middle.',
    Icon: TreePalm,
  },
  {
    id: 'plain',
    name: 'Plain',
    description: 'Open and gentle, with a lake to one side.',
    Icon: Sun,
  },
  {
    id: 'mountains',
    name: 'Mountains',
    description: 'High ground, with a river falling through the pass.',
    Icon: Mountain,
  },
  {
    id: 'empty',
    name: 'Empty',
    description: 'Flat ground and nothing else. Build everything yourself, or a real place from the map.',
    Icon: Square,
  },
];
