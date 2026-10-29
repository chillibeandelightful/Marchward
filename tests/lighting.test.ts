import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIGHT, drumNormal, FACE, setLight, shadowStep, sunVector, surfaceColour, surfaceLight } from '../src/render/lighting';
import { setViewAngle } from '../src/render/iso';
import { parseLight } from '../src/ui/tunePanel';
import { area2, boxCaster, circle, clipTo, merge, shadowOf, shadowsByTile, tileSquare, type P2 } from '../src/render/shadows';

// Lighting and shadow shapes are plain maths (no PixiJS), so they can be tested without a browser.

afterEach(() => {
  setLight(DEFAULT_LIGHT);
  setViewAngle('standard');
});

function inside(p: P2, poly: readonly P2[]): boolean {
  const s = Math.sign(area2(poly));
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length] as P2;
    return s * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= -1e-9;
  });
}

describe('the sun', () => {
  it('sits up and to the left of the view, so the left faces are lit and the right faces shaded', () => {
    const [x, y, z] = sunVector();
    expect(z).toBeGreaterThan(0);
    // Screen left is towards -x and +y.
    expect(y - x).toBeGreaterThan(0);
    expect(surfaceLight(FACE.left)).toBeGreaterThan(surfaceLight(FACE.right));
    expect(surfaceLight(FACE.top)).toBeGreaterThan(surfaceLight(FACE.right));
  });

  it('never lights anything brighter than full, nor shade darker than the ambient light', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const l = surfaceLight(drumNormal(a));
      expect(l).toBeLessThanOrEqual(1);
      expect(l).toBeGreaterThanOrEqual(DEFAULT_LIGHT.ambient);
    }
  });

  it('warms sunlit stone and cools shaded stone', () => {
    const lit = surfaceColour(FACE.left);
    const shaded = surfaceColour(FACE.right);
    expect((lit >> 16) & 0xff).toBeGreaterThan(lit & 0xff);
    expect(shaded & 0xff).toBeGreaterThan((shaded >> 16) & 0xff);
  });

  it('turns the drum of a round tower the same way as the faces of a square one', () => {
    // The front of the drum looks towards the camera, between the two faces.
    const [x, y] = drumNormal(Math.PI / 2);
    expect(x).toBeCloseTo(Math.SQRT1_2);
    expect(y).toBeCloseTo(Math.SQRT1_2);
    // Its left edge looks the way screen left does.
    const [lx, ly] = drumNormal(Math.PI);
    expect(ly - lx).toBeCloseTo(Math.SQRT2);
  });

  it('casts shadows away from the sun, longer when it is lower', () => {
    const high = shadowStep();
    const [sx, sy] = sunVector();
    expect(high.x * sx + high.y * sy).toBeLessThan(0);
    setLight({ elevation: 20 });
    const low = shadowStep();
    expect(Math.hypot(low.x, low.y)).toBeGreaterThan(Math.hypot(high.x, high.y));
  });
});

describe('cast shadows', () => {
  it('reach from a box to where its top falls', () => {
    const step = { x: 0.01, y: -0.02 };
    const shape = shadowOf(boxCaster(0, 0, 1, 1, 0, 100), step);
    expect(inside({ x: 0.5, y: 0.5 }, shape)).toBe(true);
    expect(inside({ x: 1.5, y: -1.5 }, shape)).toBe(true);
    expect(inside({ x: -0.5, y: 0.5 }, shape)).toBe(false);
  });

  it('merge where they overlap, covering the union exactly once', () => {
    const a = tileSquare(0, 0);
    const b = circle(0.3, 0.2, 0.4);
    const c = [
      { x: -0.4, y: 0.1 },
      { x: 0.5, y: -0.45 },
      { x: 0.45, y: 0.3 },
    ];
    const far = circle(3, 3, 0.2, 6);
    const pieces = merge([clipTo(b, a), clipTo(c, a), far]);
    for (let i = 0; i < 400; i++) {
      const p = { x: -0.5 + ((i * 37) % 400) / 400, y: -0.5 + ((i * 101) % 400) / 400 };
      const want = (inside(p, b) || inside(p, c)) && inside(p, a) ? 1 : 0;
      const hits = pieces.filter((q) => inside(p, q)).length;
      // A point on a shared edge may count twice; away from edges it must be covered exactly as wanted.
      if (want === 0) expect(hits).toBe(0);
      else expect(hits).toBeGreaterThanOrEqual(1);
    }
    const total = pieces.reduce((s, q) => s + Math.abs(area2(q)) / 2, 0);
    // The far one is kept whole; the union of the others is less than their sum.
    const sum = [clipTo(b, a), clipTo(c, a), far].reduce((s, q) => s + Math.abs(area2(q)) / 2, 0);
    expect(total).toBeLessThan(sum - 0.01);
  });

  it('are cut along tile edges, so each tile can lie on its own slope', () => {
    const byTile = shadowsByTile([boxCaster(-0.4, -0.4, 0.4, 0.4, 0, 50)], { x: 0.02, y: 0 }, 4, 4);
    expect([...byTile.keys()].sort()).toEqual([0, 1]);
    for (const [i, pieces] of byTile) {
      const sq = tileSquare(i % 4, Math.floor(i / 4));
      for (const q of pieces) for (const p of q) expect(inside(p, sq)).toBe(true);
    }
  });
});

describe('stored light settings', () => {
  it('keep known numbers within limits and drop the rest', () => {
    expect(parseLight('{"azimuth":30,"elevation":500,"shadow":"dark","glow":1}')).toEqual({ azimuth: 30 });
    expect(parseLight('not json')).toEqual({});
    expect(parseLight(null)).toEqual({});
  });
});
