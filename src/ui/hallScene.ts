import { hash2 } from '../sim/noise';

/**
 * The warden's hall, in pixel art drawn in code: the warden glowering on his seat at the right, and
 * whoever brought the message standing before him on the left. Shown above a messenger's letter
 * when the event names a figure that has been drawn (`StoryEvent.figure`). Painted at 128×64 and
 * shown scaled up with crisp pixels, so hand-made art can replace it later at the same size.
 */

export const SCENE_SIZE = { w: 128, h: 64 } as const;

/** Colours for the letters in the figure grids below. `.` is see-through. */
const PALETTE: Record<string, string> = {
  K: '#1a120c', // outline
  s: '#d8a47a', // skin
  S: '#a87250', // skin in shade
  w: '#efe8d6', // whites of the eyes
  g: '#9a948c', // grey hair and beard
  G: '#67625c',
  r: '#9a2a20', // the warden's red cloak
  R: '#641a14',
  f: '#ece4d2', // fur trim
  F: '#b9ad97',
  n: '#2f4466', // the warden's blue robe
  N: '#1f2c45',
  y: '#e0c050', // gold
  Y: '#9a7a28',
  b: '#5a3a1e', // boots and belts
  B: '#3a2412',
  h: '#7a6a3a', // the reeve's hood and tunic
  H: '#544824',
  t: '#5e6b3a', // the reeve's green tunic
  T: '#3f4a26',
  l: '#8a7a5c', // hose
  L: '#5f5440',
  c: '#e2d6b4', // flour sack
  C: '#b0a07a',
  o: '#8a6234', // staff
  O: '#5e3f1c',
};

/** The warden, seated, facing the viewer with his eyes on the messenger: heavy brows down, mouth turned down. 26 wide. */
const WARDEN = [
  '.........KKKKKKKK.........',
  '........KggggggggK........',
  '.......KgggggggggGK.......',
  '.......KgsssssssgGK.......',
  '.......KsKKssssKKsK.......',
  '.......KssKKssKKssK.......',
  '.......KsKwsssKwsSK.......',
  '.......KssssSSssssK.......',
  '.......KgssssssssgK.......',
  '.......KggKKKKKKggK.......',
  '.......KgKggggggKgK.......',
  '........KggggggggK........',
  '.....KKKKggggggggKKKK.....',
  '...KKffffKggggggKffffKK...',
  '..KfffFffffKKKKffffFfffK..',
  '..KrrfFFfffyyyyfffFFfrrK..',
  '.KrrrrFFfffnyynfffFFrrrrK.',
  '.KrrrRrnnnnnyynnnnnrRrrrK.',
  '.KrrrRrnnnnnynnnnnnrRrrrK.',
  'KrrrrRrnnnnyyynnnnnrRrrrrK',
  'KrrrRRrnnnnyYynnnnnrRRrrrK',
  'KrrrRRrnnnnnynnnnNnrRRrrrK',
  'KrrrRRrbbbbbybbbbbbrRRrrrK',
  'KrrsSRrnnnnnnnnnnNnrRSsrrK',
  'KrsssKrnnnnnnnnnnNnrKsssrK',
  'KRKKKKrnnnnnnnnnNNnrKKKKRK',
  'KRRrrrnnnnnnnnnnNNnnrrrRRK',
  'KRRrrnnnnnnnnnnnNNNnnrrRRK',
  'KRRrrnnnnnnnnnnNNNNnnrrRRK',
  'KRRrrrnnnnnnKnnNNNnnrrrRRK',
  '.KRRrrnnnnnnKnnnNNnnrrRRK.',
  '.KRRrrrnnnnnKnnnNNnrrrRRK.',
  '.KRRrrrnnnnnKnnnnNnrrrRRK.',
  '..KRrrrrnnnnKnnnnNrrrrRK..',
  '..KRRrrrbbbKKKbbbbrrrRRK..',
  '...KRrrbBbbK.KbbBbrrRRK...',
  '....KKKbBbbK.KbbBbKKKK....',
  '......KbbbbbK.KbbbbbK.....',
  '......KKKKKKK.KKKKKKK.....',
];

/** The camp reeve, standing, facing right, with a staff and the stolen sack of flour. 22 wide. */
const REEVE = [
  '.......KKKKKK.........',
  '......KhhhhhhK........',
  '.....KhhhhhhhhK.......',
  '.....KhHHssssshK......',
  '.....KhHsKssKssK......',
  '.....KhHswssKwsK......',
  '.....KhHsssssSsK......',
  '.....KhHssssssSK......',
  '.....KhhHsKKKsK.......',
  '....KhhhhHssssK.......',
  '...KhhhhhhKKKKhK......',
  '..KhhhhhhhhhhhhhK.....',
  '..KhtttttttttthhK.....',
  '.KotttttttTtttttK.....',
  '.KOttttttttTKKKKKKK...',
  '.KotttttttKcccccccCK..',
  '.KOtttttttKcccccccCCK.',
  '.KotttttttKccCccccCCK.',
  '.KOtbbbbbbKcccccccCCK.',
  '.KotttttttKsscccccCCK.',
  '.KOttttttttKsscccCCK..',
  '.KottttttTtKKKKKKKK...',
  '.KOtttttttTtTK........',
  '.KottttttttTtK........',
  '.KOtttttttttTK........',
  '.KoKtttttttttK........',
  '.KOKllllKlllLK........',
  '.KoKllllKlllLK........',
  '.KOKllllKlllLK........',
  '.KoKllllKlllLK........',
  '.KOKllllKlllLK........',
  '.KoKlllLKlllLK........',
  '.KOKlllLKlllLK........',
  '.KoKbbbbKbbbbK........',
  '.KOKbbbbKbbbbbK.......',
  '.KoKbbbbbKbbbbbK......',
  '.KKKKKKKKKKKKKKK......',
];

/** Figures that have been drawn, by the name events use. */
const FIGURES: Record<string, readonly string[]> = { reeve: REEVE };

export function hasFigure(name: string | undefined): boolean {
  return !!name && name in FIGURES;
}

function sprite(ctx: CanvasRenderingContext2D, rows: readonly string[], x0: number, y0: number): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const colour = PALETTE[row[x] as string];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  });
}

function rect(ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
}

/** Each pixel of a rectangle nudged a little lighter or darker, so stone and wood don't look flat. */
function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number, seed: number): void {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) {
      const n = hash2(i, j, seed);
      if (n > 0.86) rect(ctx, `rgba(255,240,210,${amount})`, i, j, 1, 1);
      else if (n < 0.14) rect(ctx, `rgba(0,0,0,${amount * 1.4})`, i, j, 1, 1);
    }
}

/** The back wall: courses of dressed stone, a tall window, a torch either side and the warden's banner. */
function hall(ctx: CanvasRenderingContext2D): void {
  const { w, h } = SCENE_SIZE;
  const floorY = 50;
  rect(ctx, '#5a534a', 0, 0, w, floorY);
  // Courses of stone, each row offset by half a block.
  for (let row = 0; row * 7 < floorY; row++) {
    const y = row * 7;
    rect(ctx, '#3e3932', 0, y, w, 1);
    for (let x = row % 2 === 0 ? 0 : 6; x < w; x += 12) rect(ctx, '#3e3932', x, y, 1, 7);
    for (let x = row % 2 === 0 ? 1 : 7; x < w; x += 12) rect(ctx, '#6c645a', x, y + 1, 10, 1);
  }
  grain(ctx, 0, 0, w, floorY, 0.18, 11);
  // Light comes in at the left: the right of the hall is in shadow.
  for (let x = 0; x < w; x++) rect(ctx, `rgba(10,6,2,${(x / w) * 0.3})`, x, 0, 1, floorY);

  // A tall arched window with a pale sky, mullion and transom, and a stone sill.
  const wx = 8;
  rect(ctx, '#2a2620', wx - 1, 7, 14, 34);
  rect(ctx, '#9cb8c8', wx, 10, 12, 30);
  rect(ctx, '#c6d8de', wx + 1, 12, 3, 26);
  rect(ctx, '#9cb8c8', wx + 2, 8, 8, 2);
  rect(ctx, '#2a2620', wx - 1, 5, 3, 3);
  rect(ctx, '#2a2620', wx + 10, 5, 3, 3);
  rect(ctx, '#2a2620', wx + 5, 10, 2, 30);
  rect(ctx, '#2a2620', wx, 24, 12, 1);
  rect(ctx, '#7c7468', wx - 2, 40, 16, 2);
  // Sunlight from it, across the floor.
  ctx.fillStyle = 'rgba(255,236,190,0.13)';
  ctx.beginPath();
  ctx.moveTo(wx, floorY);
  ctx.lineTo(wx + 12, floorY);
  ctx.lineTo(wx + 34, h);
  ctx.lineTo(wx + 12, h);
  ctx.fill();

  // Torches on the wall, with a glow.
  for (const tx of [28, 122]) {
    const glow = ctx.createRadialGradient(tx + 1, 18, 1, tx + 1, 18, 14);
    glow.addColorStop(0, 'rgba(255,190,90,0.45)');
    glow.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(tx - 14, 4, 30, 30);
    rect(ctx, '#2a1c10', tx - 1, 22, 4, 2);
    rect(ctx, '#4a321c', tx, 20, 2, 8);
    rect(ctx, '#e0603a', tx - 1, 15, 4, 5);
    rect(ctx, '#f2b84a', tx, 13, 2, 5);
    rect(ctx, '#fff0b0', tx, 16, 1, 2);
  }

  // The warden's banner on the wall between the messenger and the seat: red, a gold tower, swallow-tailed.
  const bx = 62;
  rect(ctx, '#4a321c', bx - 2, 3, 18, 2);
  rect(ctx, '#d8b84a', bx, 5, 14, 24);
  rect(ctx, '#a3271f', bx + 1, 6, 12, 22);
  rect(ctx, '#7e1a14', bx + 10, 6, 3, 22);
  rect(ctx, '#d8b84a', bx, 29, 5, 4);
  rect(ctx, '#d8b84a', bx + 9, 29, 5, 4);
  rect(ctx, '#a3271f', bx + 1, 29, 3, 3);
  rect(ctx, '#7e1a14', bx + 10, 29, 3, 3);
  rect(ctx, '#e0c050', bx + 4, 13, 6, 8);
  for (const m of [4, 6, 8]) rect(ctx, '#e0c050', bx + m, 11, 1, 2);
  rect(ctx, '#e0c050', bx + 9, 11, 1, 2);
  rect(ctx, '#7e1a14', bx + 6, 17, 2, 4);

  // The floor: flagstones, and a worn red runner up to the seat.
  rect(ctx, '#6e6456', 0, floorY, w, h - floorY);
  for (let y = floorY + 3, k = 0; y < h; y += 3 + k, k++) rect(ctx, '#4f473c', 0, y, w, 1);
  for (let x = -40; x < w + 40; x += 14) {
    ctx.strokeStyle = '#4f473c';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, floorY);
    ctx.lineTo(x + (x - w / 2) * 0.4 + 0.5, h);
    ctx.stroke();
  }
  grain(ctx, 0, floorY, w, h - floorY, 0.14, 12);
  rect(ctx, '#2c2822', 0, floorY, w, 1);
}

/** The dais and the high-backed oak seat, `x` at its left. */
function seat(ctx: CanvasRenderingContext2D, x: number): void {
  // Dais: two steps.
  rect(ctx, '#2c2822', x - 10, 55, 50, 1);
  rect(ctx, '#857a68', x - 10, 56, 50, 3);
  rect(ctx, '#5f574a', x - 10, 59, 50, 1);
  rect(ctx, '#7a705e', x - 16, 60, 62, 3);
  rect(ctx, '#504838', x - 16, 63, 62, 1);
  // High back, carved, with gilded finials and a cushion.
  rect(ctx, '#2a1a0c', x - 1, 9, 34, 47);
  rect(ctx, '#6b4a2a', x, 10, 32, 45);
  rect(ctx, '#4a321c', x + 3, 13, 26, 24);
  rect(ctx, '#7a2e4a', x + 5, 15, 22, 22);
  rect(ctx, '#5a2036', x + 22, 15, 5, 22);
  for (const fx of [x - 1, x + 29]) {
    rect(ctx, '#2a1a0c', fx, 4, 4, 6);
    rect(ctx, '#d8b84a', fx + 1, 5, 2, 4);
  }
  rect(ctx, '#d8b84a', x + 13, 11, 6, 2);
  // Arms.
  rect(ctx, '#2a1a0c', x - 4, 36, 40, 5);
  rect(ctx, '#7a5634', x - 3, 37, 38, 3);
  grain(ctx, x, 10, 32, 45, 0.2, 13);
}

/** The whole picture for an event whose messenger is `figure`, or null if that figure hasn't been drawn. */
export function hallScene(figure: string | undefined): HTMLCanvasElement | null {
  const rows = figure ? FIGURES[figure] : undefined;
  if (!rows) return null;
  const c = document.createElement('canvas');
  c.width = SCENE_SIZE.w;
  c.height = SCENE_SIZE.h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  hall(ctx);
  seat(ctx, 86);
  sprite(ctx, WARDEN, 89, 18);
  // A shadow at the messenger's feet, then the messenger.
  rect(ctx, 'rgba(0,0,0,0.3)', 36, 60, 18, 2);
  sprite(ctx, rows, 34, 25);
  return c;
}
