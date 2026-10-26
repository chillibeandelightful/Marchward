import { Graphics, type Renderer, type Texture } from 'pixi.js';

export type SpriteName = 'pine' | 'oak' | 'boulder' | 'stones' | 'reeds' | 'tuft';

export interface SpriteArt {
  texture: Texture;
  /** Anchor at the sprite's base, where it touches the ground. */
  anchorX: number;
  anchorY: number;
}

/** Where sprites come from. Procedural for now; hand-made art can implement this later. */
export interface SpriteAssets {
  get(name: SpriteName, variant: number): SpriteArt;
}

type Painter = (g: Graphics, v: number) => void;

const VARIANTS = 3;

/** Draws each sprite once with PixiJS Graphics and renders it to a texture. */
export class ProceduralAssets implements SpriteAssets {
  private readonly cache = new Map<string, SpriteArt>();

  constructor(private readonly renderer: Renderer) {}

  get(name: SpriteName, variant: number): SpriteArt {
    const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
    const key = `${name}:${v}`;
    let art = this.cache.get(key);
    if (!art) {
      art = this.make(PAINTERS[name], v);
      this.cache.set(key, art);
    }
    return art;
  }

  private make(paint: Painter, v: number): SpriteArt {
    const g = new Graphics();
    paint(g, v);
    const b = g.getLocalBounds();
    // Render above 1x so sprites stay crisp when zoomed in.
    const texture = this.renderer.generateTexture({ target: g, resolution: 3, antialias: true });
    g.destroy();
    return { texture, anchorX: -b.x / b.width, anchorY: -b.y / b.height };
  }
}

// All painters draw with the ground contact point at (0, 0).
const PAINTERS: Record<SpriteName, Painter> = {
  pine(g, v) {
    const s = [1, 0.85, 1.15][v] ?? 1;
    const dark = [0x24492a, 0x2b5230, 0x1f4026][v] ?? 0x24492a;
    const light = [0x3f7340, 0x477c45, 0x386838][v] ?? 0x3f7340;
    g.rect(-1.5 * s, -6 * s, 3 * s, 6 * s).fill(0x5a3d22);
    for (let i = 0; i < 3; i++) {
      const base = -4 * s - i * 8 * s;
      const half = (10 - i * 2.5) * s;
      const tip = base - 13 * s;
      g.poly([-half, base, 0, tip, half, base]).fill(dark);
      g.poly([-half, base, 0, tip, -half * 0.1, base]).fill(light);
    }
    g.poly([-10 * s, -4 * s, 0, -41 * s, 10 * s, -4 * s]).stroke({ width: 0.8, color: 0x13261a, alpha: 0.5 });
  },
  oak(g, v) {
    const s = [1, 0.85, 1.1][v] ?? 1;
    g.rect(-2 * s, -10 * s, 4 * s, 10 * s).fill(0x5e4126);
    const col = [0x4c7a35, 0x557f38, 0x46702f][v] ?? 0x4c7a35;
    g.circle(-6 * s, -16 * s, 7 * s).fill(col);
    g.circle(6 * s, -16 * s, 7 * s).fill(col);
    g.circle(0, -23 * s, 8 * s).fill(col);
    g.circle(-3 * s, -24 * s, 4 * s).fill({ color: 0xa6cf72, alpha: 0.35 });
  },
  boulder(g, v) {
    const s = [1, 0.75, 1.25][v] ?? 1;
    g.poly([-9 * s, 0, -7 * s, -7 * s, -1 * s, -11 * s, 7 * s, -8 * s, 9 * s, -1 * s, 3 * s, 2 * s]).fill(0x7d7a72);
    g.poly([-7 * s, -7 * s, -1 * s, -11 * s, 2 * s, -6 * s, -4 * s, -3 * s]).fill(0xa8a59c);
    g.poly([-9 * s, 0, -7 * s, -7 * s, -1 * s, -11 * s, 7 * s, -8 * s, 9 * s, -1 * s, 3 * s, 2 * s]).stroke({
      width: 0.8,
      color: 0x3f3d39,
    });
  },
  stones(g, v) {
    const offs = [
      [-6, -1, 3.5],
      [3, 0, 2.5],
      [0, -4, 2],
    ];
    offs.forEach(([x = 0, y = 0, r = 2], i) => {
      const rr = r * ([1, 0.8, 1.2][(v + i) % 3] ?? 1);
      g.ellipse(x, y - rr * 0.6, rr * 1.3, rr).fill(0x8f8b82).stroke({ width: 0.6, color: 0x4a4740 });
    });
  },
  reeds(g, v) {
    const n = 5 + v;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 2.2;
      const h = 9 + ((i * 7 + v * 3) % 5);
      const lean = ((i % 3) - 1) * 1.5;
      g.moveTo(x, 0).lineTo(x + lean, -h).stroke({ width: 1, color: 0x7d8a3c });
      if (i % 2 === 0) g.ellipse(x + lean, -h, 1, 2.2).fill(0x6b4a2a);
    }
  },
  tuft(g, v) {
    const col = [0x4f7f30, 0x5b8c36, 0x48752c][v] ?? 0x4f7f30;
    for (let i = -2; i <= 2; i++) {
      g.moveTo(i * 1.4, 0)
        .lineTo(i * 2.2, -4 - (2 - Math.abs(i)) * 1.2)
        .stroke({ width: 1, color: col });
    }
  },
};
