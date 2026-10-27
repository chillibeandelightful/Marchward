import { hash2 } from '../sim/noise';

/**
 * Small pixel-art pictures for the Classic frame, drawn in code onto canvases: the tool icons, the
 * heraldic banner, and the iron and parchment textures. Shown scaled up with crisp pixels.
 */

type Rect = readonly [x: number, y: number, w: number, h: number];
type Layer = readonly [colour: string, rects: readonly Rect[]];

export type IconName = 'build' | 'workers' | 'timber' | 'stone' | 'defence' | 'standing' | 'hiring' | 'plan' | 'reports' | 'save';

const OUTLINE = '#15110d';

const ICONS: Record<IconName, readonly Layer[]> = {
  // A castle tower with battlements and a door.
  build: [
    ['#a9a598', [[3, 6, 10, 9], [3, 4, 2, 2], [6, 4, 2, 2], [9, 4, 2, 2], [11, 4, 2, 2]]],
    ['#86837a', [[10, 6, 3, 9], [11, 4, 2, 2]]],
    ['#cfcbbf', [[3, 6, 7, 1]]],
    ['#2b241c', [[7, 11, 2, 4], [5, 8, 1, 2], [10, 8, 1, 2]]],
  ],
  // A mason's hammer.
  workers: [
    ['#7a5a32', [[3, 12, 2, 2], [4, 11, 2, 2], [5, 10, 2, 2], [6, 9, 2, 2], [7, 8, 2, 2]]],
    ['#5a3f22', [[3, 13, 1, 1], [4, 12, 1, 1], [5, 11, 1, 1]]],
    ['#b8b8b8', [[7, 3, 7, 3], [8, 6, 3, 1]]],
    ['#e2e2e2', [[7, 3, 7, 1]]],
    ['#7c7c7c', [[12, 4, 2, 2]]],
  ],
  // Three logs, end on, with their rings.
  timber: [
    ['#7a5430', [[3, 8, 4, 6], [2, 9, 6, 4], [10, 8, 4, 6], [9, 9, 6, 4], [6, 2, 4, 6], [5, 3, 6, 4]]],
    ['#c49a5e', [[3, 9, 4, 4], [10, 9, 4, 4], [6, 3, 4, 4]]],
    ['#7a5430', [[4, 10, 2, 2], [11, 10, 2, 2], [7, 4, 2, 2]]],
  ],
  // Cut stone blocks, stacked, with mortar between.
  stone: [
    ['#a9a598', [[1, 9, 6, 5], [8, 9, 7, 5], [4, 3, 8, 5]]],
    ['#d0ccc0', [[1, 9, 6, 1], [8, 9, 7, 1], [4, 3, 8, 1]]],
    ['#7e7b72', [[1, 13, 6, 1], [8, 13, 7, 1], [4, 7, 8, 1], [6, 9, 1, 5], [14, 9, 1, 5], [11, 3, 1, 5]]],
  ],
  // A round helmet with a nasal guard, over a face.
  defence: [
    ['#d8a47a', [[5, 9, 6, 5]]],
    ['#a8a8a8', [[5, 3, 6, 1], [4, 4, 8, 5], [3, 7, 2, 4], [11, 7, 2, 4], [7, 9, 2, 3]]],
    ['#dcdcdc', [[5, 4, 3, 1], [4, 5, 1, 2]]],
    ['#6e6e6e', [[10, 5, 2, 4]]],
    ['#2b241c', [[5, 10, 1, 1], [10, 10, 1, 1]]],
  ],
  // A banner on a pole, with a gold tower.
  standing: [
    ['#6b4a2a', [[3, 1, 1, 14]]],
    ['#d8b84a', [[3, 0, 1, 1]]],
    ['#b3271f', [[4, 2, 9, 9], [4, 11, 3, 2], [10, 11, 3, 2]]],
    ['#7e1a14', [[11, 2, 2, 11]]],
    ['#e0c050', [[7, 5, 3, 4], [7, 4, 1, 1], [9, 4, 1, 1]]],
  ],
  // Two soldiers: one of yours and a friend.
  hiring: [
    ['#d8a47a', [[3, 3, 3, 3], [10, 3, 3, 3]]],
    ['#c4281c', [[2, 7, 5, 6]]],
    ['#355a9e', [[9, 7, 5, 6]]],
    ['#e8d9a8', [[2, 9, 5, 1]]],
    ['#2e261d', [[3, 13, 1, 2], [5, 13, 1, 2], [10, 13, 1, 2], [12, 13, 1, 2]]],
  ],
  // A plan on a scroll.
  plan: [
    ['#d9c49a', [[3, 3, 10, 10]]],
    ['#a88a5a', [[2, 2, 2, 12], [12, 2, 2, 12]]],
    ['#5a4024', [[5, 5, 5, 1], [5, 5, 1, 5], [5, 9, 6, 1], [9, 5, 1, 3], [10, 7, 1, 3]]],
  ],
  // A bar chart.
  reports: [
    ['#c9b48a', [[1, 1, 14, 14]]],
    ['#6b5a3a', [[2, 13, 12, 1], [2, 2, 1, 12]]],
    ['#4a3a22', [[4, 9, 2, 4], [7, 6, 2, 7], [10, 3, 2, 10]]],
  ],
  // A floppy disk, for saving.
  save: [
    ['#3c4a66', [[2, 2, 12, 12]]],
    ['#b8b8b8', [[5, 2, 6, 4]]],
    ['#3c4a66', [[9, 3, 1, 2]]],
    ['#e8e2d0', [[4, 8, 8, 5]]],
    ['#9a9488', [[5, 9, 6, 1], [5, 11, 6, 1]]],
  ],
};

function paint(ctx: CanvasRenderingContext2D, layers: readonly Layer[]): void {
  for (const [colour, rects] of layers) {
    ctx.fillStyle = colour;
    for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
  }
}

/** Put a one-pixel dark edge round everything drawn on the canvas, as in old pixel art. */
function outline(canvas: HTMLCanvasElement, colour: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (img.data[(y * w + x) * 4 + 3] as number) > 0;
  ctx.fillStyle = colour;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ctx.fillRect(x, y, 1, 1);
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  return [c, ctx];
}

/** A 16×16 icon. */
export function icon(name: IconName): HTMLCanvasElement {
  const [c, ctx] = canvas(16, 16);
  paint(ctx, ICONS[name]);
  outline(c, OUTLINE);
  return c;
}

/** The castle's banner: a red swallow-tailed flag with a gold tower and a border, on a crossbar. */
export function banner(): HTMLCanvasElement {
  const [c, ctx] = canvas(22, 30);
  paint(ctx, [
    ['#6b4a2a', [[0, 1, 22, 2]]],
    ['#d8b84a', [[0, 0, 2, 2], [20, 0, 2, 2]]],
    ['#d8b84a', [[2, 3, 18, 21], [2, 24, 7, 4], [13, 24, 7, 4]]],
    ['#a3271f', [[3, 4, 16, 19], [3, 23, 5, 4], [14, 23, 5, 4]]],
    ['#7e1a14', [[16, 4, 3, 19], [16, 23, 3, 4]]],
    // The charge: a gold tower.
    ['#e0c050', [[8, 10, 6, 8], [7, 8, 2, 2], [10, 8, 2, 2], [13, 8, 2, 2], [7, 9, 8, 1]]],
    ['#7e1a14', [[10, 14, 2, 4]]],
  ]);
  outline(c, OUTLINE);
  return c;
}

/** A tile of noisy colour for a texture: `base` with each pixel nudged lighter or darker, plus a few scratches or blotches. */
function noiseTile(w: number, h: number, base: [number, number, number], amount: number, marks: 'scratch' | 'blotch'): string {
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = (hash2(x, y, 77) - 0.5) * amount;
      const i = (y * w + x) * 4;
      img.data[i] = base[0] + n;
      img.data[i + 1] = base[1] + n;
      img.data[i + 2] = base[2] + n;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  for (let k = 0; k < 10; k++) {
    const x = hash2(k, 1, 78) * w;
    const y = hash2(k, 2, 78) * h;
    if (marks === 'scratch') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(Math.floor(x), Math.floor(y), 3 + Math.floor(hash2(k, 3, 78) * 8), 1);
    } else {
      ctx.fillStyle = `rgba(110,80,40,${0.05 + hash2(k, 4, 78) * 0.08})`;
      const r = 3 + hash2(k, 5, 78) * 8;
      ctx.fillRect(Math.floor(x - r), Math.floor(y - r / 2), Math.ceil(r * 2), Math.ceil(r));
    }
  }
  return c.toDataURL();
}

/** Dark worn iron, for the frame. */
export function ironTexture(): string {
  return noiseTile(48, 48, [62, 64, 66], 22, 'scratch');
}

/** Old parchment, for the message panel. */
export function parchmentTexture(): string {
  return noiseTile(64, 32, [201, 180, 136], 18, 'blotch');
}
