import type { Style } from '../../contracts/index.js';
import type { ModelLook } from './_parts.js';
/** The Realistic look of an existing Core item (P2-38), when one was made for it. */
export declare const realisticLook: (id: string) => Partial<Record<Style, ModelLook>>;
