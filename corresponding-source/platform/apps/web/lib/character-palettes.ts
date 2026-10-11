/**
 * Character colour palettes per look (owner, CHAR-02). Source: the owner's ChatGPT palettes
 * (docs/reference/character-anime/colours/chatgpt-palettes.json and fantasy-skins.json), reviewed by the agent:
 * kept because they cover every human skin tone first (14 per look, light to very deep, with warm undertones
 * instead of a grey end), give each tone its own shadow colour (rose and terracotta for anime and cartoon, never
 * grey), and keep the three looks apart (realistic small hue steps; anime cleaner and warmer; cartoon saturated
 * with fantasy tones last). Shadows, lips, blush and the fantasy glow wait for the anime material and the face.
 */

export type PaletteLook = 'realistic' | 'anime' | 'cartoon';

export interface LookPalette {
  skin: string[];
  /** Shadow colour of each skin tone, same order. */
  skinShadow: string[];
  eyes: string[];
  hair: string[];
  lips: string[];
  blush: string[];
}

const lower = (colors: string[]) => colors.map((color) => color.toLowerCase());

export const LOOK_PALETTES: Record<PaletteLook, LookPalette> = {
  realistic: {
    skin: lower(['#F8EDE3', '#F2DDCF', '#EBCDBA', '#E2BFA6', '#D5AA8B', '#C49472', '#AD7959', '#936247', '#7A4E39', '#623C2F', '#4C2F27', '#38241F', '#261A17', '#18110F']),
    skinShadow: lower(['#E5CFC2', '#DFC3B4', '#D7B29F', '#CCA28C', '#BF9177', '#AC7A5E', '#98664C', '#80513E', '#693F33', '#533128', '#402720', '#2F1D1A', '#201512', '#110C0B']),
    eyes: lower(['#2A1A14', '#43291D', '#62422C', '#805D3C', '#A17B4F', '#B99561', '#52663C', '#708650', '#365B58', '#467878', '#416A86', '#588BAA', '#739DB6', '#6E706B']),
    hair: lower(['#171311', '#241A16', '#35251D', '#493126', '#60402C', '#765037', '#8C6142', '#A97950', '#BE9368', '#D0AA7A', '#DEC18D', '#E8D3A6', '#C8B8A4', '#9B8776', '#6F625A', '#473F3A', '#71352F', '#9B5140']),
    lips: lower(['#D9A195', '#C9867D', '#B66F68', '#A65C58', '#8E4C49', '#773F3D', '#613433', '#49292A']),
    blush: lower(['#EAB0A5', '#DE948B', '#D47E78', '#C86D68', '#B45C58', '#9F4E4C', '#843F40', '#693436']),
  },
  anime: {
    skin: lower(['#FFF2E9', '#FFE5D7', '#FBD6C2', '#F5C6AB', '#EAB492', '#D99D78', '#C48461', '#AA6B4D', '#90543E', '#753F32', '#5A3028', '#43241F', '#301A18', '#211211']),
    skinShadow: lower(['#F2CFC4', '#EDBEB1', '#E8AE9D', '#DF9C88', '#D18B73', '#C07860', '#AC654F', '#94533F', '#7C4235', '#65342C', '#4E2924', '#3B201D', '#2A1716', '#1C1010']),
    eyes: lower(['#3A241C', '#765039', '#B87A46', '#D6A65B', '#4F8755', '#65B27A', '#338A8A', '#43B8C4', '#3979B8', '#55A5E8', '#6958B7', '#9674DD', '#B65A88', '#E07BA6', '#B74C4C', '#8B8D96']),
    hair: lower(['#17151B', '#292432', '#3B2A25', '#56382C', '#774A34', '#A06A42', '#C78C58', '#E0B778', '#F1D69A', '#E8DDD1', '#BFC5D0', '#788396', '#B9464F', '#E36B78', '#F08EBA', '#7658C8', '#A77AE5', '#397DB5', '#46AFA8', '#65B95E']),
    lips: lower(['#F2AAA6', '#E98F91', '#DF777F', '#CF626D', '#B95060', '#9C4051', '#7B3343', '#5E2938']),
    blush: lower(['#FFB5B5', '#F9A0A5', '#F18C96', '#E87987', '#D96678', '#C65369', '#AA445A', '#8B374C']),
  },
  cartoon: {
    skin: lower(['#FFE1C7', '#F8C9A5', '#EDAD82', '#DA9165', '#C4774D', '#A75E3D', '#884832', '#69362A', '#4C2923', '#321C19', '#7FD17A', '#62B9E8', '#A785E6', '#D486C6']),
    skinShadow: lower(['#F2B991', '#E9A47B', '#DB8C62', '#C9754D', '#B4603D', '#974A34', '#79382D', '#5C2B25', '#42211E', '#2A1716', '#55B55E', '#428FC7', '#7D61C8', '#B660A8']),
    eyes: lower(['#3A251D', '#7B4A2C', '#D29145', '#F0BE4E', '#4DAF61', '#76D57C', '#31A6A1', '#48D2D0', '#3889D6', '#62B9FF', '#7456D8', '#A47AFA', '#D65793', '#FF79AD', '#D94E4E', '#7D8798']),
    hair: lower(['#1B1820', '#332522', '#54362A', '#754B31', '#9B663D', '#C18A4F', '#E2B765', '#F4D985', '#E8E1D5', '#9BA5B5', '#E54E55', '#FF795F', '#F38AB3', '#D75BC3', '#8B64E8', '#526FE1', '#45A7E8', '#3FC5BB', '#58BD68', '#92D657']),
    lips: lower(['#F49A91', '#EC7778', '#DF5F69', '#CC4D5B', '#B43E50', '#963345', '#772B3B', '#5B2432']),
    blush: lower(['#FFAAA6', '#FF9296', '#F97B87', '#ED6679', '#DA526B', '#C3445D', '#A73851', '#862F46']),
  },
};

/** Clothes colours that read on every skin tone. */
export const CLOTHES_PALETTE = lower([
  '#F4F1EA', '#D9DCE1', '#A5ABB5', '#606773', '#292D35', '#15171C', '#E5484D', '#A92D3D', '#F07845', '#E8B84B',
  '#F0D95C', '#74B85A', '#348B62', '#35A99A', '#38AFC8', '#3C83D5', '#3156A6', '#6855C9', '#9567D8', '#C65BA5',
  '#E47AA5', '#8A5A3C', '#C58A52', '#7B8798',
]);

/** Fantasy skins: base colour now; shadow, highlight and glow come with the anime material (effects later). */
export interface FantasySkin {
  id: string;
  name: string;
  base: string;
  shadow: string;
  highlight: string;
  glow: string;
}

export const FANTASY_SKINS: FantasySkin[] = (
  [
    ['fire', 'Fire', '#E5391F', '#7A160F', '#FF8A24', '#FFD34E'],
    ['ice', 'Ice', '#48CFFF', '#1769AA', '#A8EEFF', '#E5FAFF'],
    ['electric-blue', 'Electric Blue', '#146CFF', '#0737A8', '#45C8FF', '#7EEBFF'],
    ['gold', 'Gold', '#D9A514', '#805600', '#FFD95A', '#FFF0A0'],
    ['silver', 'Silver', '#AEB8C4', '#596574', '#E8F0F7', '#FFFFFF'],
    ['bronze', 'Bronze', '#B66A32', '#63341E', '#E9A05B', '#FFC17A'],
    ['emerald', 'Emerald', '#16A66A', '#07563A', '#45E59C', '#8AFFC7'],
    ['toxic', 'Toxic', '#78D900', '#347000', '#B8FF37', '#DFFF72'],
    ['purple-energy', 'Purple Energy', '#7138E8', '#351479', '#B06CFF', '#D7A2FF'],
    ['pink-energy', 'Pink Energy', '#E83B9C', '#851958', '#FF79C5', '#FFB4DF'],
    ['lava', 'Lava', '#A92313', '#3D0B08', '#FF5A18', '#FFB21C'],
    ['magma', 'Magma', '#3A1715', '#160909', '#D92C18', '#FF6A00'],
    ['ocean', 'Ocean', '#087EA4', '#03465F', '#22C7D9', '#72F1EE'],
    ['aqua', 'Aqua', '#22CFC7', '#087B7A', '#73FFF1', '#C2FFF9'],
    ['obsidian', 'Obsidian', '#17151D', '#08070B', '#494359', '#8B7BA8'],
    ['pearl', 'Pearl', '#E6E1DC', '#A9A3AD', '#FFF8ED', '#FFFFFF'],
    ['ruby', 'Ruby', '#B41436', '#5D071C', '#F34868', '#FF8A9E'],
    ['sapphire', 'Sapphire', '#174CC7', '#092269', '#448AFF', '#8BB6FF'],
    ['amethyst', 'Amethyst', '#8849C7', '#46216D', '#C782FF', '#E3B4FF'],
    ['celestial', 'Celestial', '#4357D8', '#202668', '#8295FF', '#C7D2FF'],
    ['shadow', 'Shadow', '#24202C', '#09080D', '#554A67', '#9D73D9'],
    ['ghost', 'Ghost', '#C5E4E5', '#789FA4', '#E8FFFF', '#FFFFFF'],
    ['sun', 'Sun', '#FFB51B', '#C25A0B', '#FFE35C', '#FFF5A5'],
    ['rainbow', 'Rainbow', '#FF5576', '#774BD6', '#52DDF2', '#FFF27A'],
  ] as const
).map(([id, name, base, shadow, highlight, glow]) => ({
  id,
  name,
  base: base.toLowerCase(),
  shadow: shadow.toLowerCase(),
  highlight: highlight.toLowerCase(),
  glow: glow.toLowerCase(),
}));
