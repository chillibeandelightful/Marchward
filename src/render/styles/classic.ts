import type { Backdrop, VisualStyle } from './style';

/** Overcast sky, grey hills and dun moorland beyond the site. */
const SKY: Backdrop = {
  skyTop: 0x34383f,
  skyBottom: 0x6a6d70,
  farHills: 0x50555b,
  nearHills: 0x3d4135,
  moor: 0x47452a,
};

/**
 * The look of early-'90s castle games: drab olive and brown land under an overcast sky, grey
 * block-built stone, dark pines, slate water, chunky outlined figures in strong team colours.
 */
export const CLASSIC: VisualStyle = {
  id: 'classic',
  name: 'Classic',
  background: 0x2a2b22,
  terrain: {
    ground: {
      grass: 0x5e5a30,
      forest: 0x3f4326,
      marsh: 0x4d5034,
      rock: 0x74716a,
      shallow: 0x4e6272,
      ford: 0x5a6c7a,
      deep: 0x33475a,
      road: 0x5e5a30,
    },
    face: { bank: 0x55432c, cliff: 0x5e5a51, edge: 0x352a1d },
    strata: 0x37342e,
    road: 0x6b5435,
    fordStone: 0x8a8578,
    puddle: 0x34443f,
    ripple: 0x9aaab4,
    contour: 0x262712,
    grid: 0x1a1b10,
    hover: 0xf0dc8c,
    grain: 0.07,
    speckle: { dark: 0x3f3a1e, light: 0x7a7444 },
  },
  castle: {
    stone: { top: 0xa3a098, face: 0x8b8880, dark: 0x24221f },
    planned: { top: 0xdcd2b6, face: 0xb0a58a, dark: 0x241e16 },
    banner: 0xa3271f,
    scaffold: 0x7a5a32,
    masonry: 'blocks',
    outline: 1.2,
  },
  figures: {
    scale: 1.35,
    outline: 0x15110d,
    tabard: 0xc4281c,
    tabardStripe: 0xe8d9a8,
    helm: 0xa0a0a0,
    raider: 0x2f3c66,
    hood: 0x1c1d26,
    skin: 0xd8a47a,
    legs: 0x2e261d,
    steel: 0xd0d0d0,
    wood: 0x5e3f22,
    tunic: {
      labourer: 0x8a7a55,
      digger: 0x5e4426,
      carter: 0x355a7d,
      quarryman: 0x6e6e6e,
      mason: 0xc8bf9e,
      carpenter: 0x82501f,
    },
    canvas: 0xc9bc96,
    canvasShade: 0x9a8c68,
    stoneBlock: 0xa3a098,
    log: 0x6e4e2a,
  },
  effects: {
    flame: 0xe8781e,
    flameCore: 0xf8d24a,
    smoke: 0x5e5a55,
    dust: 0x8a8070,
    oil: 0x2e1c0c,
    steam: 0xcfc8b4,
  },
  sprites: 'classic',
  backdrop: SKY,
  horizon: SKY,
  retro: true,
  ui: 'classic',
};
