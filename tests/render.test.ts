import { describe, expect, it } from 'vitest';
import { kestrelFord } from '../src/data/sites/kestrelFord';
import { Camera } from '../src/render/camera';
import { isoToScreen } from '../src/render/iso';
import { buildTileShapes, pickTile, tileCorners } from '../src/render/tileGeometry';
import { buildSite } from '../src/sim/site';
import { heightAt, inBounds, type TerrainMap } from '../src/sim/terrain';

// These modules are plain maths (no PixiJS), so they can be tested without a browser.

function mapFrom(rows: number[][]): TerrainMap {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    heights: rows.flat(),
    types: rows.flat().map(() => 'grass' as const),
  };
}

describe('tile corners', () => {
  it('meet in a seamless ramp between tiles one level apart', () => {
    const map = mapFrom([
      [1, 2],
      [1, 2],
    ]);
    const low = tileCorners(map, 0, 0);
    const high = tileCorners(map, 1, 0);
    // The low tile's east edge (E, S) touches the high tile's west edge (N, W).
    expect(low.e).toBe(1.5);
    expect(low.s).toBe(1.5);
    expect(high.n).toBe(1.5);
    expect(high.w).toBe(1.5);
  });

  it('keep cliffs sharp', () => {
    const map = mapFrom([[1, 3]]);
    expect(tileCorners(map, 0, 0)).toEqual({ n: 1, e: 1, s: 1, w: 1 });
    expect(tileCorners(map, 1, 0)).toEqual({ n: 3, e: 3, s: 3, w: 3 });
  });

  it('draw a cliff face with the right kind', () => {
    const shapes = buildTileShapes(mapFrom([[3, 1]]));
    const top = shapes.find((s) => s.x === 0);
    expect(top?.faces.find((f) => f.side === 'right')?.kind).toBe('cliff');
  });
});

describe('picking', () => {
  const map = buildSite(kestrelFord);
  const shapes = buildTileShapes(map);
  // A tile with higher land just in front of it can be partly hidden, so only check open ground.
  const unhidden = shapes.filter((s) => {
    for (let i = 0; i <= 3; i++)
      for (let j = 0; j <= 3; j++)
        if (inBounds(map, s.x + i, s.y + j) && heightAt(map, s.x + i, s.y + j) > s.level) return false;
    return true;
  });

  it('finds the tile at its own centre', () => {
    expect(unhidden.length).toBeGreaterThan(2000);
    for (const s of unhidden) {
      const c = s.corners;
      const p = isoToScreen(s.x, s.y, (c.n + c.e + c.s + c.w) / 4);
      expect(pickTile(shapes, p.sx, p.sy)).toMatchObject({ x: s.x, y: s.y });
    }
  });

  it('picks the front tile when a tall one hides land behind it', () => {
    const tall = buildTileShapes(
      mapFrom([
        [0, 0],
        [0, 4],
      ]),
    );
    // Screen point of the hidden back tile (0,0)'s centre lies within the tall tile's cliff.
    const p = isoToScreen(1, 1, 0);
    expect(pickTile(tall, p.sx, p.sy)).toMatchObject({ x: 1, y: 1 });
  });

  it('returns null off the map', () => {
    expect(pickTile(shapes, -99999, -99999)).toBeNull();
  });
});

describe('camera', () => {
  it('keeps the point under the cursor fixed while zooming', () => {
    const cam = new Camera(0.25, 4);
    cam.centreOn(100, 50);
    const before = cam.screenToWorld(200, 120, 800, 600);
    cam.zoomAt(2, 200, 120, 800, 600);
    expect(cam.zoom).toBe(2);
    const after = cam.screenToWorld(200, 120, 800, 600);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom and position', () => {
    const cam = new Camera(0.5, 2);
    cam.setBounds(0, 0, 100, 100);
    cam.zoomAt(100, 0, 0, 800, 600);
    expect(cam.zoom).toBe(2);
    cam.panBy(10_000, 10_000);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it('round-trips screen and world coordinates', () => {
    const cam = new Camera();
    cam.centreOn(30, -40);
    cam.zoomAt(1.7, 400, 300, 800, 600);
    const w = cam.screenToWorld(123, 456, 800, 600);
    const s = cam.worldToScreen(w.x, w.y, 800, 600);
    expect(s.x).toBeCloseTo(123);
    expect(s.y).toBeCloseTo(456);
  });
});
