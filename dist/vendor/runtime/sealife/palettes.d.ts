import { type Vec3 } from './mesh.js';
/**
 * Colour sets of the sea-life items (SEALIFE-01). Names are the values of the items' palette parameters
 * (`core-library/src/3d-models/tidewater/nature/{starfish,giant-clam,sea-shell}.ts`); keep both lists equal.
 */
export declare const STARFISH_PALETTES: readonly ["orange", "red", "purple", "blue", "sandy"];
export type StarfishPalette = (typeof STARFISH_PALETTES)[number];
export interface StarfishColors {
    top: Vec3;
    tip: Vec3;
    under: Vec3;
    /** Tubercle colour and how strongly the knobs show. */
    knob: Vec3;
    knobs: number;
}
export declare const STARFISH_COLORS: Readonly<Record<StarfishPalette, StarfishColors>>;
export declare const CLAM_MANTLES: readonly ["blue", "teal", "purple", "green"];
export type ClamMantle = (typeof CLAM_MANTLES)[number];
export interface MantleColors {
    base: Vec3;
    edge: Vec3;
    spot: Vec3;
}
export declare const CLAM_MANTLE_COLORS: Readonly<Record<ClamMantle, MantleColors>>;
export declare const CLAM_SHELL: {
    outer: Vec3;
    ridge: Vec3;
    inner: Vec3;
    crust: Vec3;
};
export declare const SHELL_KINDS: readonly ["cowrie", "conch", "scallop", "snail"];
export type ShellKind = (typeof SHELL_KINDS)[number];
export declare const SHELL_TONES: readonly ["natural", "pale", "dark", "rose"];
export type ShellTone = (typeof SHELL_TONES)[number];
export interface ShellColors {
    base: Vec3;
    mark: Vec3;
    inner: Vec3;
}
export declare const SHELL_COLORS: Readonly<Record<ShellKind, Readonly<Record<ShellTone, ShellColors>>>>;
