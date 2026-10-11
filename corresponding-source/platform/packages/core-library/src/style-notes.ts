import type { Style } from '@genvr/contracts';

/**
 * One short paragraph per world style for builders and their AI tools (MCP `get_style_guide`),
 * written from docs/CORE-LIBRARY.md (Styles, Style coverage, decisions 65, 101, 111). No look rules
 * beyond what that document says.
 */
export const STYLE_NOTES: Readonly<Record<Style, string>> = {
  blocky:
    'Blocky: simple shapes and flat colors, a Roblox-like feel made only from original assets. A ready style: every Core Library entry has its own look here or is not needed. Each Core item keeps one id in every style and brings its blocky look itself; place items from the library (search_catalog), never build a look from parts.',
  voxel:
    'Voxel: a Minecraft-like feel on block ground (1 m blocks, chunks and meshing), its own kind of terrain. A ready style: ground blocks exist only here, drawn walls, openings and roads become whole blocks, and cube avatars wear the blocky fit. Each Core item keeps one id in every style and brings its voxel look itself.',
  anime:
    'Anime: toon shading, outlines, stylized water and sky. Not a ready style yet: some Core Library entries still have no anime look (P2-33). Each Core item keeps one id in every style and brings its anime look itself where it has one.',
  realistic:
    'Realistic: PBR materials, an HDR sky and physically based water; real ground materials exist only here, and a new place arrives as a starter world. Not a ready style yet: some Core Library entries still have no realistic look (P2-18). Each Core item keeps one id in every style and brings its realistic look itself.',
};

/** Mixing (docs/CORE-LIBRARY.md): one base style plus an optional accent style, never free mixing. */
export const STYLE_MIXING =
  'A place has one base style and at most one accent style for specific zones or items; free mixing of everything is not supported.';
