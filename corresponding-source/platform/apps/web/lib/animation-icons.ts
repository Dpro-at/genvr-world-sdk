import {
  Armchair,
  Bot,
  Hand,
  HandHeart,
  Laugh,
  Lightbulb,
  Medal,
  Move,
  Music,
  PartyPopper,
  Pointer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Icons of the Core animation library (CORE_EMOTES in @genvr/core-library). */
export const ANIMATION_ICONS: Record<string, LucideIcon> = {
  'genvr.core.animation.sit': Armchair,
  'genvr.core.animation.wave': Hand,
  'genvr.core.animation.clap': HandHeart,
  'genvr.core.animation.cheer': PartyPopper,
  'genvr.core.animation.dance': Music,
  'genvr.core.animation.robot-dance': Bot,
  'genvr.core.animation.point': Pointer,
  'genvr.core.animation.think': Lightbulb,
  'genvr.core.animation.salute': Medal,
  'genvr.core.animation.laugh': Laugh,
  'genvr.core.animation.stretch': Move,
};

export const animationIcon = (id: string): LucideIcon => ANIMATION_ICONS[id] ?? Music;
