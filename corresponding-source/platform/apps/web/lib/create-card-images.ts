/**
 * Pictures of the create page's cards (P9-17, decision 96): the owner's pictures of one lake
 * scene in every look, as 512 px WebP in `public/create/` (see its README). The world pictures
 * are for the world step of the create flow (P9-16).
 */
export const CREATE_CARD_IMAGES = {
  style: {
    realistic: '/create/style-realistic.webp',
    anime: '/create/style-anime.webp',
    blocky: '/create/style-blocky.webp',
    voxel: '/create/style-voxel.webp',
    'flat-cartoon': '/create/style-flat-cartoon.webp',
  },
  world: {
    free: '/create/world-free.webp',
    side: '/create/world-side.webp',
    // 2D top-down (decision 97; the view itself is P2-25).
    top: '/create/world-top.webp',
  },
} as const;

/**
 * Styles shown on the create page before the engine draws them and the style id exists
 * (Flat cartoon: P9-16 adds the id, P2-24 draws it). They cannot be picked yet.
 */
export const UPCOMING_STYLE_CARDS = [
  {
    id: 'flat-cartoon',
    name: 'Flat cartoon',
    description: 'Flat colors and dark outlines, like a TV cartoon.',
    image: CREATE_CARD_IMAGES.style['flat-cartoon'],
  },
] as const;
