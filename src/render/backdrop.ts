import { Graphics } from 'pixi.js';
import { hash2 } from '../sim/noise';
import { style } from './styles';
import { mix } from './terrainStyle';

/**
 * What lies beyond the site in styles that have a backdrop: moorland running back to a line of
 * hills under an overcast sky. Drawn in screen space behind the map; the horizon follows the
 * map's far corner, so the site seems to sit in a wider land.
 */
export class Backdrop {
  readonly root = new Graphics();
  private key = '';

  /** `horizon` is the screen y of the map's far corner; `shift` slides the hills sideways as the view pans. */
  update(width: number, height: number, horizon: number, shift: number): void {
    const b = style().backdrop;
    const y0 = Math.round(horizon - 30);
    const sx = Math.round(shift);
    const key = `${style().id}:${width}x${height}:${y0}:${sx}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.root.clear();
    if (!b) return;
    g.rect(0, 0, width, height).fill(b.moor);
    if (y0 <= 0) return;

    // The sky in bands, darkest at the top; the dithering blends them.
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      const top = (y0 * i) / bands;
      g.rect(0, top, width, y0 / bands + 1).fill(mix(b.skyTop, b.skyBottom, i / (bands - 1)));
    }
    // Long low streaks of cloud, once there is enough sky to hold them.
    for (let i = 0; i < (y0 > 80 ? 14 : 0); i++) {
      const cy = y0 * (0.12 + 0.7 * hash2(i, 1, 9));
      const cx = ((hash2(i, 2, 9) * (width + 400) - sx * 0.3) % (width + 400)) - 200;
      const w = 120 + hash2(i, 3, 9) * 220;
      g.ellipse(cx, cy, w / 2, 4 + hash2(i, 4, 9) * 6).fill({ color: mix(b.skyBottom, 0xffffff, 0.12), alpha: 0.35 });
    }
    this.hills(g, width, y0, 46, 0.5, sx * 0.25, b.farHills, 11);
    this.hills(g, width, y0, 22, 1, sx * 0.5, b.nearHills, 23);
  }

  /** A ridge line of hills standing up to `rise` pixels above the horizon. */
  private hills(g: Graphics, width: number, y0: number, rise: number, roughness: number, shift: number, colour: number, seed: number): void {
    const pts: number[] = [0, y0 + 2];
    const step = 16;
    for (let x = -step; x <= width + step; x += step) {
      const wx = (x + shift) / 140;
      const i = Math.floor(wx);
      const f = wx - i;
      const s = f * f * (3 - 2 * f);
      const h = hash2(i, seed, 1) * (1 - s) + hash2(i + 1, seed, 1) * s;
      const jag = (hash2(Math.floor((x + shift) / step), seed, 2) - 0.5) * 6 * roughness;
      pts.push(x, y0 - h * rise - jag);
    }
    pts.push(width, y0 + 2);
    g.poly(pts).fill(colour);
  }
}
