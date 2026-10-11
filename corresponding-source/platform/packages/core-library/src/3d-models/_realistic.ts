import type { Style } from '@genvr/contracts';
import type { ModelLook } from './_parts.js';
import { REALISTIC_LOOKS } from './_realistic-looks.js';

/** The Realistic look of an existing Core item (P2-38), when one was made for it. */
export const realisticLook = (id: string): Partial<Record<Style, ModelLook>> => {
  const look = REALISTIC_LOOKS[id];
  return look ? { realistic: look } : {};
};
