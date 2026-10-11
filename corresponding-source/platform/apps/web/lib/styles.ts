import { CREATE_CARD_IMAGES } from './create-card-images';

export type StyleId = 'blocky' | 'realistic' | 'anime' | 'voxel';

/** Style cards of the create page, each with the owner's picture of the same scene (P9-17). */
export const STYLE_CARDS: Array<{
  id: StyleId;
  name: string;
  description: string;
  gradient: string;
  image: string;
  ready: boolean;
}> = [
  {
    id: 'blocky',
    name: 'Simple',
    image: CREATE_CARD_IMAGES.style.blocky,
    description: 'Simple shapes and bright colors. Fast on every phone.',
    gradient: 'from-ink/10 to-ink/25',
    ready: true,
  },
  {
    id: 'realistic',
    name: 'Realistic',
    image: CREATE_CARD_IMAGES.style.realistic,
    description: 'Real materials, soft light, and water that shines.',
    gradient: 'from-ink/5 to-ink/20',
    ready: true,
  },
  {
    id: 'anime',
    name: 'Cartoon',
    image: CREATE_CARD_IMAGES.style.anime,
    description: 'Painted colors, soft light, and dreamy skies.',
    gradient: 'from-ink/10 to-ink/20',
    ready: false,
  },
  {
    id: 'voxel',
    name: 'Voxel',
    image: CREATE_CARD_IMAGES.style.voxel,
    description: 'Bright cube worlds with hills, a lake, and mountains.',
    gradient: 'from-ink/15 to-ink/30',
    ready: true,
  },
];

export const styleName = (id: string) => STYLE_CARDS.find((card) => card.id === id)?.name ?? id;
export const styleGradient = (id: string) =>
  STYLE_CARDS.find((card) => card.id === id)?.gradient ?? 'from-ink/10 to-ink/25';
