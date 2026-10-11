import { hex, type Vec3 } from './mesh.js';

/**
 * Colour sets of the sea-life items (SEALIFE-01). Names are the values of the items' palette parameters
 * (`core-library/src/3d-models/tidewater/nature/{starfish,giant-clam,sea-shell}.ts`); keep both lists equal.
 */

export const STARFISH_PALETTES = ['orange', 'red', 'purple', 'blue', 'sandy'] as const;
export type StarfishPalette = (typeof STARFISH_PALETTES)[number];

export interface StarfishColors {
  top: Vec3;
  tip: Vec3;
  under: Vec3;
  /** Tubercle colour and how strongly the knobs show. */
  knob: Vec3;
  knobs: number;
}

export const STARFISH_COLORS: Readonly<Record<StarfishPalette, StarfishColors>> = {
  orange: { top: hex('#d8642a'), tip: hex('#e88a45'), under: hex('#e9c08e'), knob: hex('#f6c27a'), knobs: 0.9 },
  red: { top: hex('#a8262a'), tip: hex('#c84a3a'), under: hex('#e0a990'), knob: hex('#f0d2b0'), knobs: 0.85 },
  purple: { top: hex('#5e3384'), tip: hex('#7d4aa0'), under: hex('#d2b7d6'), knob: hex('#e8893c'), knobs: 0.8 },
  blue: { top: hex('#2c63b0'), tip: hex('#3f80c8'), under: hex('#a9c3e2'), knob: hex('#1f4a8a'), knobs: 0.35 },
  sandy: { top: hex('#c39a62'), tip: hex('#d6b27c'), under: hex('#eadbbd'), knob: hex('#8a6438'), knobs: 0.8 },
};

export const CLAM_MANTLES = ['blue', 'teal', 'purple', 'green'] as const;
export type ClamMantle = (typeof CLAM_MANTLES)[number];

export interface MantleColors {
  base: Vec3;
  edge: Vec3;
  spot: Vec3;
}

export const CLAM_MANTLE_COLORS: Readonly<Record<ClamMantle, MantleColors>> = {
  blue: { base: hex('#1d56b8'), edge: hex('#0f2f6e'), spot: hex('#6fe3ff') },
  teal: { base: hex('#0f8a84'), edge: hex('#0a4e4a'), spot: hex('#a5ffd8') },
  purple: { base: hex('#5a2a8c'), edge: hex('#2f1550'), spot: hex('#47d4ff') },
  green: { base: hex('#3f7d2c'), edge: hex('#23461a'), spot: hex('#d6f06a') },
};

export const CLAM_SHELL = { outer: hex('#d6cfbb'), ridge: hex('#bdb39a'), inner: hex('#f1ece2'), crust: hex('#7d7c5a') };

export const SHELL_KINDS = ['cowrie', 'conch', 'scallop', 'snail'] as const;
export type ShellKind = (typeof SHELL_KINDS)[number];
export const SHELL_TONES = ['natural', 'pale', 'dark', 'rose'] as const;
export type ShellTone = (typeof SHELL_TONES)[number];

export interface ShellColors {
  base: Vec3;
  mark: Vec3;
  inner: Vec3;
}

export const SHELL_COLORS: Readonly<Record<ShellKind, Readonly<Record<ShellTone, ShellColors>>>> = {
  cowrie: {
    natural: { base: hex('#d9c3a0'), mark: hex('#4a2a17'), inner: hex('#f2e9dc') },
    pale: { base: hex('#f1e9dc'), mark: hex('#b48a5e'), inner: hex('#fbf6ee') },
    dark: { base: hex('#7a4b2a'), mark: hex('#24140b'), inner: hex('#e6d6c2') },
    rose: { base: hex('#e2b9b0'), mark: hex('#7c3f52'), inner: hex('#f7e6e2') },
  },
  conch: {
    natural: { base: hex('#d8b98e'), mark: hex('#8a5a32'), inner: hex('#f0a184') },
    pale: { base: hex('#efe4d2'), mark: hex('#c4a582'), inner: hex('#f7d2bd') },
    dark: { base: hex('#8c6440'), mark: hex('#4a2e18'), inner: hex('#e88a52') },
    rose: { base: hex('#e0b6a0'), mark: hex('#a0604c'), inner: hex('#e8708a') },
  },
  scallop: {
    natural: { base: hex('#d86a3a'), mark: hex('#f3e2cc'), inner: hex('#f4ece2') },
    pale: { base: hex('#ece2d0'), mark: hex('#c9b294'), inner: hex('#fbf7f0') },
    dark: { base: hex('#7a2a3a'), mark: hex('#c9a0a0'), inner: hex('#efe4e6') },
    rose: { base: hex('#e48aa0'), mark: hex('#fae0e6'), inner: hex('#fbeef0') },
  },
  snail: {
    natural: { base: hex('#cdb08a'), mark: hex('#6a4426'), inner: hex('#efe2cf') },
    pale: { base: hex('#ece6da'), mark: hex('#a89276'), inner: hex('#f9f4ec') },
    dark: { base: hex('#5a4a3a'), mark: hex('#e2d2b8'), inner: hex('#d9c8b0') },
    rose: { base: hex('#d9a8a0'), mark: hex('#7a4048'), inner: hex('#f4e0dc') },
  },
};
