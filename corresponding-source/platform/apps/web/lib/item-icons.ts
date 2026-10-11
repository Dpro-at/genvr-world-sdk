import {
  Armchair,
  Blocks,
  Box,
  Cylinder,
  Fence,
  Flower2,
  House,
  LampFloor,
  Mountain,
  Package,
  Shrub,
  Table2,
  TrafficCone,
  TreeDeciduous,
  TreePine,
  type LucideIcon,
} from 'lucide-react';

/** Library icon per Core Library item (store items will use their rendered thumbnails). */
const ICONS: Record<string, LucideIcon> = {
  'genvr.core.tree.round': TreeDeciduous,
  'genvr.core.tree.pine': TreePine,
  'genvr.core.bush': Shrub,
  'genvr.core.flower': Flower2,
  'genvr.core.rock': Mountain,
  'genvr.core.crate': Package,
  'genvr.core.barrel': Cylinder,
  'genvr.core.bench': Armchair,
  'genvr.core.table': Table2,
  'genvr.core.lamp': LampFloor,
  'genvr.core.cone': TrafficCone,
  'genvr.core.fence': Fence,
  'genvr.core.house.small': House,
  'genvr.core.block': Blocks,
};

export const itemIcon = (itemId: string): LucideIcon => ICONS[itemId] ?? Box;
