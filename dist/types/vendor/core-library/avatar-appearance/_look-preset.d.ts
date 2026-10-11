import { AvatarLook } from '../../contracts/index.js';
/**
 * Whether a look can be a look item (spec `docs/superpowers/specs/2026-10-03-look-items-design.md`): a body players
 * can choose, valid sizes and colors, and only Core wearables, one per slot and layer, on a body that wears items.
 * The same lookups the room uses (`wornItems`), so a look item never needs anything new at runtime.
 */
export declare function checkLookPreset(input: unknown): {
    ok: true;
    look: AvatarLook;
} | {
    ok: false;
    problems: string[];
};
