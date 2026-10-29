import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SpriteName } from '../src/render/assets';
import { STONE_TEXELS, stoneMatrix } from '../src/render/castleArt';
import { isoToScreen, setViewAngle } from '../src/render/iso';
import { parseManifest, POSES } from '../src/render/paintedArt';
import { WORKER_TYPES } from '../src/data/economy';
import { UNITS, type UnitType } from '../src/data/combat';
import { STYLE_ORDER, STYLES } from '../src/render/styles';
import { parseLook } from '../src/ui/look';

const ART = join(process.cwd(), 'public', 'art');

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(join(ART, file));
  expect(bytes.subarray(1, 4).toString('ascii'), file).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('painted art files', () => {
  const { manifest, problems } = parseManifest(JSON.parse(readFileSync(join(ART, 'manifest.json'), 'utf8')));

  it('have a manifest without problems', () => {
    expect(problems).toEqual([]);
  });

  it('list frames that sit inside their sheets, with the anchor inside the frame', () => {
    for (const [file, sprites] of Object.entries(manifest.sheets)) {
      expect(existsSync(join(ART, file)), file).toBe(true);
      const { width, height } = pngSize(file);
      for (const [name, frames] of Object.entries(sprites))
        for (const f of frames ?? []) {
          expect(f.x + f.w, `${file} ${name}`).toBeLessThanOrEqual(width);
          expect(f.y + f.h, `${file} ${name}`).toBeLessThanOrEqual(height);
        }
    }
  });

  it('cover every tree, rock and plant in the first pass', () => {
    const drawn = new Set(Object.values(manifest.sheets).flatMap((s) => Object.keys(s)));
    for (const name of ['pine', 'oak', 'boulder', 'stones', 'reeds', 'tuft'] as SpriteName[]) expect(drawn.has(name), name).toBe(true);
  });

  it('cover every kind of person, the camp and the effects in the second pass', () => {
    const drawn = new Set(Object.values(manifest.sheets).flatMap((s) => Object.keys(s)));
    for (const name of ['tent', 'block', 'log', 'cart', 'cartLoaded', 'fire', 'puff']) expect(drawn.has(name), name).toBe(true);
    for (const kind of WORKER_TYPES) {
      // Workers work (the carter walks with the cart) and sit when idle.
      expect(drawn.has(kind === 'carter' ? 'carter.walk' : `${kind}.work`), kind).toBe(true);
      expect(drawn.has(`${kind}.sit`), kind).toBe(true);
    }
    for (const kind of Object.keys(UNITS) as UnitType[])
      for (const pose of ['stand', 'walk', UNITS[kind].bow ? 'shoot' : 'fight']) expect(drawn.has(`${kind}.${pose}`), `${kind}.${pose}`).toBe(true);
    expect(POSES).toContain('fight');
  });

  it('have a 64 × 64 ground texture for every kind of land', () => {
    for (const land of ['grass', 'forest', 'marsh', 'rock', 'shallow', 'ford', 'deep', 'road'] as const) {
      const file = manifest.textures[`ground.${land}`];
      expect(file, land).toBeDefined();
      expect(pngSize(file ?? ''), land).toEqual({ width: 64, height: 64 });
    }
  });

  it('have stone textures at the sizes in docs/ART.md', () => {
    expect(manifest.textures.stoneFace).toBeDefined();
    expect(manifest.textures.stoneTop).toBeDefined();
    expect(pngSize(manifest.textures.stoneFace ?? '')).toEqual({ width: 64, height: 52 });
    expect(pngSize(manifest.textures.stoneTop ?? '')).toEqual({ width: 32, height: 32 });
  });
});

describe('manifest checks', () => {
  it('turn away a missing or wrong-version manifest', () => {
    expect(parseManifest(null).problems.length).toBe(1);
    expect(parseManifest({ version: 2 }).problems.length).toBe(1);
  });

  it('skip unknown names and malformed frames, keeping the rest', () => {
    const { manifest, problems } = parseManifest({
      version: 1,
      sheets: {
        'a.png': {
          pine: [
            { x: 0, y: 0, w: 10, h: 20, ax: 5, ay: 19 },
            { x: 0, y: 0, w: 10, h: 20, ax: 12, ay: 19 },
          ],
          dragon: [{ x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 }],
        },
      },
      textures: { stoneFace: 'f.png', marble: 'm.png' },
    });
    expect(manifest.sheets['a.png']?.pine?.length).toBe(1);
    expect(manifest.sheets['a.png']).not.toHaveProperty('dragon');
    expect(manifest.textures).toEqual({ stoneFace: 'f.png' });
    expect(problems.length).toBe(3);
  });
});

describe('painted stone', () => {
  const apply = (m: number[], x: number, y: number) => ({ sx: (m[0] ?? 0) * x + (m[2] ?? 0) * y + (m[4] ?? 0), sy: (m[1] ?? 0) * x + (m[3] ?? 0) * y + (m[5] ?? 0) });

  it('pins the texture to the world on both faces and the top, in every view', () => {
    for (const view of ['low', 'standard', 'high'] as const) {
      setViewAngle(view);
      const lv = 3.5;
      const along = 7.25;
      // A face along x at y = 4: texture x counts tiles along it, texture y counts screen pixels down it.
      const level = isoToScreen(0, 0, 0).sy - isoToScreen(0, 0, 1).sy;
      const onX = apply(stoneMatrix('x', 4), along * STONE_TEXELS, -lv * level);
      expect(onX.sx).toBeCloseTo(isoToScreen(along, 4, lv).sx);
      expect(onX.sy).toBeCloseTo(isoToScreen(along, 4, lv).sy);
      const onY = apply(stoneMatrix('y', 9), along * STONE_TEXELS, -lv * level);
      expect(onY.sx).toBeCloseTo(isoToScreen(9, along, lv).sx);
      expect(onY.sy).toBeCloseTo(isoToScreen(9, along, lv).sy);
      const top = apply(stoneMatrix('top', lv), 2 * STONE_TEXELS, 5 * STONE_TEXELS);
      expect(top.sx).toBeCloseTo(isoToScreen(2, 5, lv).sx);
      expect(top.sy).toBeCloseTo(isoToScreen(2, 5, lv).sy);
    }
    setViewAngle('standard');
  });
});

describe('the Painted style', () => {
  it('is Drab with the hand-made art switched on', () => {
    const p = STYLES.painted;
    expect(p.sprites).toBe('painted');
    expect(p.castle.masonry).toBe('painted');
    expect(p.terrain).toBe(STYLES.drab.terrain);
    expect(p.retro).toBe(false);
    expect(STYLE_ORDER).toContain('painted');
    expect(parseLook('{"style":"painted"}').style).toBe('painted');
  });
});
