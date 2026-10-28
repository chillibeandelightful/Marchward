import { Graphics } from 'pixi.js';
import { hash2 } from '../sim/noise';
import { style, type Backdrop as BackdropColours } from './styles';
import { mix } from './terrainStyle';

/** In High view, the share of the screen's height the sky takes, and the band of haze below it where the land fades into the moor. */
const HIGH_SKY = 0.13;
const HIGH_HAZE = 0.06;

/**
 * What lies beyond the site: moorland running back to a line of hills under an overcast sky.
 * Drawn in screen space. In the Standard view (in styles that have a backdrop) it sits behind
 * the map and its horizon follows the map's far corner, so the site seems to sit in a wider land.
 * In High view the sky and hills stay across the top of the screen at every zoom, in front of
 * the land, which fades into the moor beneath them; only the moor is drawn behind the map.
 */
export class Backdrop {
  /** Behind the map. */
  readonly root = new Graphics();
  /** In front of the map: the High view sky. */
  readonly front = new Graphics();
  private key = '';
  /** Screen y below which the land shows; 0 when nothing covers it. */
  private skyLine = 0;

  /**
   * `horizon` is the screen y of the map's far corner; `shift` slides the hills sideways as the
   * view pans; `high` keeps the sky at the top of the screen.
   */
  update(width: number, height: number, horizon: number, shift: number, high: boolean): void {
    const sx = Math.round(shift);
    const y0 = high ? Math.round(height * HIGH_SKY) : Math.round(horizon - 30);
    const key = `${style().id}:${width}x${height}:${y0}:${sx}:${high}`;
    if (key === this.key) return;
    this.key = key;
    const back = this.root.clear();
    const front = this.front.clear();
    this.skyLine = 0;
    const b = high ? style().horizon : style().backdrop;
    if (!b) return;
    back.rect(0, 0, width, height).fill(b.moor);
    if (high) {
      // The far land fades into the moor in thin bands; the dithering blends them in Classic.
      const haze = Math.round(height * HIGH_HAZE);
      const bands = 12;
      for (let i = 0; i < bands; i++) front.rect(0, y0 + (haze * i) / bands, width, haze / bands + 1).fill({ color: b.moor, alpha: 0.85 * (1 - i / bands) });
      this.sky(front, b, width, y0, sx);
      this.skyLine = y0;
    } else if (y0 > 0) {
      this.sky(back, b, width, y0, sx);
    }
  }

  /** Whether the sky covers this screen row, so nothing on the land can be pointed at there. */
  covers(sy: number): boolean {
    return sy < this.skyLine;
  }

  /** The sky down to `y0` in bands, darkest at the top, with clouds and two ridges of hills on the horizon. */
  private sky(g: Graphics, b: BackdropColours, width: number, y0: number, sx: number): void {
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
