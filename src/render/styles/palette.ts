import { mix, shade } from '../terrainStyle';
import type { VisualStyle } from './style';

/** Colours used outside the style objects (health bars, previews, earthwork marks), so they survive the palette cut. */
const EXTRA = [0x000000, 0xffffff, 0x9fd98b, 0xf0c56a, 0xf08a72, 0xd8452f, 0x8fe08a, 0xf2c14e, 0x5fb4ea, 0xe8e2d0, 0x1b1f24];

/** Every colour in a style: any whole number above 255 in it (sizes and amounts are all smaller). */
export function styleColours(s: VisualStyle): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isInteger(v) && v > 255 && v <= 0xffffff) out.push(v);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(s);
  return out;
}

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

/** Squared distance between two colours, weighted a little towards how the eye sees them. */
export function colourDistance(a: number, b: number): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return 2 * (ar - br) ** 2 + 4 * (ag - bg) ** 2 + 3 * (ab - bb) ** 2;
}

/** Brightness steps kept for every style colour, so lit and shaded faces and slopes stay apart. */
const RAMP = [0.55, 0.7, 0.85, 1, 1.15, 1.3];

/**
 * A limited palette for a style, like an old 128-colour screen: a ramp of light and shade for each
 * of the style's colours, cut down to `max` by merging the closest pairs.
 */
export function buildPalette(s: VisualStyle, max = 128): number[] {
  const seeds = [...styleColours(s), ...EXTRA];
  const colours = [...new Set(seeds.flatMap((c) => RAMP.map((f) => shade(c, f))))];
  // Each colour is weighted by how many it stands for, so merges drift towards the busier one.
  const weights = colours.map(() => 1);
  const alive = colours.map(() => true);
  // Each colour's nearest living neighbour, kept up to date as pairs merge.
  const near = colours.map(() => -1);
  const nearD = colours.map(() => Infinity);
  const findNear = (i: number) => {
    near[i] = -1;
    nearD[i] = Infinity;
    for (let j = 0; j < colours.length; j++) {
      if (j === i || !alive[j]) continue;
      const d = colourDistance(colours[i] as number, colours[j] as number);
      if (d < (nearD[i] as number)) {
        nearD[i] = d;
        near[i] = j;
      }
    }
  };
  colours.forEach((_, i) => findNear(i));
  for (let count = colours.length; count > max; count--) {
    let a = -1;
    for (let i = 0; i < colours.length; i++) if (alive[i] && (a < 0 || (nearD[i] as number) < (nearD[a] as number))) a = i;
    const b = near[a] as number;
    const wa = weights[a] as number;
    const wb = weights[b] as number;
    colours[a] = mix(colours[a] as number, colours[b] as number, wb / (wa + wb));
    weights[a] = wa + wb;
    alive[b] = false;
    for (let i = 0; i < colours.length; i++) if (alive[i] && (i === a || near[i] === a || near[i] === b)) findNear(i);
    // Anyone now nearer to the moved colour than to their old neighbour.
    for (let i = 0; i < colours.length; i++) {
      if (!alive[i] || i === a) continue;
      const d = colourDistance(colours[i] as number, colours[a] as number);
      if (d < (nearD[i] as number)) {
        nearD[i] = d;
        near[i] = a;
      }
    }
  }
  return colours.filter((_, i) => alive[i]).sort((x, y) => x - y);
}

/** The palette colour nearest to `c`. */
export function nearest(palette: readonly number[], c: number): number {
  let best = palette[0] ?? c;
  let bestD = Infinity;
  for (const p of palette) {
    const d = colourDistance(p, c);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
