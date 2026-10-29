import { Assets, Rectangle, Texture } from 'pixi.js';
import type { SpriteArt, SpriteAssets, SpriteName } from './assets';
import { style } from './styles';

/**
 * Hand-made art from `public/art/`: sprite sheets and repeating textures listed in a manifest
 * (see docs/ART.md). It is used in the Painted style; anything without art falls back to the
 * drawing in code, so art can arrive a piece at a time and the game always runs.
 */

/** One frame on a sheet: its rectangle, and the pixel where it meets the ground. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export type TextureName = 'stoneFace' | 'stoneTop';

export interface Manifest {
  version: 1;
  /** Sheet file name to the sprites on it, each with its variants in order. */
  sheets: Record<string, Partial<Record<SpriteName, Frame[]>>>;
  /** Repeating textures, each in its own file so it can wrap. */
  textures: Partial<Record<TextureName, string>>;
}

const SPRITE_NAMES: readonly SpriteName[] = ['pine', 'oak', 'boulder', 'stones', 'reeds', 'tuft'];
const TEXTURE_NAMES: readonly TextureName[] = ['stoneFace', 'stoneTop'];

function isFrame(f: unknown): f is Frame {
  if (!f || typeof f !== 'object') return false;
  const o = f as Record<string, unknown>;
  const whole = (k: string) => Number.isInteger(o[k]) && (o[k] as number) >= 0;
  return ['x', 'y', 'w', 'h', 'ax', 'ay'].every(whole) && (o.w as number) > 0 && (o.h as number) > 0 && (o.ax as number) < (o.w as number) && (o.ay as number) < (o.h as number);
}

/** Check a manifest, keeping what is usable and listing what isn't. Unknown names are reported, not fatal. */
export function parseManifest(json: unknown): { manifest: Manifest; problems: string[] } {
  const problems: string[] = [];
  const manifest: Manifest = { version: 1, sheets: {}, textures: {} };
  if (!json || typeof json !== 'object' || (json as { version?: unknown }).version !== 1) {
    problems.push('manifest is missing or not version 1');
    return { manifest, problems };
  }
  const raw = json as { sheets?: unknown; textures?: unknown };
  for (const [file, sprites] of Object.entries(raw.sheets && typeof raw.sheets === 'object' ? raw.sheets : {})) {
    const out: Partial<Record<SpriteName, Frame[]>> = {};
    for (const [name, frames] of Object.entries(sprites && typeof sprites === 'object' ? (sprites as object) : {})) {
      if (!SPRITE_NAMES.includes(name as SpriteName)) {
        problems.push(`${file}: unknown sprite "${name}"`);
        continue;
      }
      const good = Array.isArray(frames) ? frames.filter(isFrame) : [];
      if (!Array.isArray(frames) || good.length !== frames.length) problems.push(`${file}: some frames of "${name}" are malformed`);
      if (good.length > 0) out[name as SpriteName] = good;
    }
    manifest.sheets[file] = out;
  }
  for (const [name, file] of Object.entries(raw.textures && typeof raw.textures === 'object' ? raw.textures : {})) {
    if (!TEXTURE_NAMES.includes(name as TextureName) || typeof file !== 'string') problems.push(`unknown or malformed texture "${name}"`);
    else manifest.textures[name as TextureName] = file;
  }
  return { manifest, problems };
}

const sprites = new Map<SpriteName, SpriteArt[]>();
const textures = new Map<TextureName, Texture>();

/** Load the art listed in `<base>manifest.json`. Missing or broken art is logged and skipped. */
export async function loadPaintedArt(base = 'art/'): Promise<void> {
  let json: unknown;
  try {
    const res = await fetch(`${base}manifest.json`);
    json = res.ok ? await res.json() : null;
  } catch {
    json = null;
  }
  const { manifest, problems } = parseManifest(json);
  for (const p of problems) console.warn(`Art: ${p}`);
  const load = async (file: string): Promise<Texture | null> => {
    try {
      const t = await Assets.load<Texture>(`${base}${file}`);
      t.source.scaleMode = 'nearest';
      return t;
    } catch {
      console.warn(`Art: could not load ${file}`);
      return null;
    }
  };
  await Promise.all([
    ...Object.entries(manifest.sheets).map(async ([file, list]) => {
      const sheet = await load(file);
      if (!sheet) return;
      for (const [name, frames] of Object.entries(list) as [SpriteName, Frame[]][]) {
        sprites.set(
          name,
          frames.map((f) => ({
            texture: new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }),
            // The ground point is the bottom of the anchor pixel, in its middle.
            anchorX: (f.ax + 0.5) / f.w,
            anchorY: (f.ay + 1) / f.h,
          })),
        );
      }
    }),
    ...(Object.entries(manifest.textures) as [TextureName, string][]).map(async ([name, file]) => {
      const t = await load(file);
      if (t) textures.set(name, t);
    }),
  ]);
}

/** A repeating texture, if the active style uses painted art and it was loaded. */
export function paintedTexture(name: TextureName): Texture | undefined {
  return style().sprites === 'painted' ? textures.get(name) : undefined;
}

/** How many variants of each sprite were loaded, for the art viewer. */
export function paintedCounts(): Partial<Record<SpriteName, number>> {
  return Object.fromEntries([...sprites].map(([k, v]) => [k, v.length]));
}

/** Painted sprites where there are some and the style wants them; the fallback's drawing otherwise. */
export class PaintedAssets implements SpriteAssets {
  constructor(private readonly fallback: SpriteAssets) {}

  get(name: SpriteName, variant: number): SpriteArt {
    const list = style().sprites === 'painted' ? sprites.get(name) : undefined;
    if (!list || list.length === 0) return this.fallback.get(name, variant);
    return list[((variant % list.length) + list.length) % list.length] as SpriteArt;
  }
}
