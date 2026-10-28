import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kestrelFord } from '../src/data/sites/kestrelFord';
import { Camera } from '../src/render/camera';
import { frontDiagonal, pickPiece } from '../src/render/castleArt';
import { drawnLevels, isoToScreen, setViewAngle, viewAngle } from '../src/render/iso';
import { buildTileShapes, pickTile, tileCorners } from '../src/render/tileGeometry';
import { KEEP, WALL_THICKNESS } from '../src/data/castle';
import { foundationOutline, TOWER_HALF } from '../src/render/foundation';
import { isoToTile, pickPlanTile, PLAN_TILE, planToTile, tileToIso, tileToPlan, wantsTopDown } from '../src/render/topDown';
import { createPlan, placePieces, viewPlan } from '../src/sim/castle';
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

describe('castle pieces on screen', () => {
  const flat = mapFrom(Array.from({ length: 8 }, () => new Array<number>(8).fill(1)));

  it('are drawn with the row of their front-most tile', () => {
    expect(frontDiagonal({ kind: 'keep', x: 2, y: 3 })).toBe(7);
    expect(frontDiagonal({ kind: 'tower', x: 2, y: 3, shape: 'round', height: 'low' })).toBe(5);
  });

  it('can be picked by pointing at their walls, in front of the ground behind them', () => {
    const plan = createPlan(flat);
    placePieces(flat, plan, [{ kind: 'tower', x: 4, y: 4, shape: 'square', height: 'high' }]);
    const view = viewPlan(flat, plan);
    // Halfway up the tower's front corner, which hides the ground of the tile behind it.
    const p = isoToScreen(4.5, 4.5, 3);
    const ground = pickTile(buildTileShapes(flat), p.sx, p.sy);
    expect(ground).not.toBeNull();
    expect(pickPiece(view, p.sx, p.sy, (ground?.x ?? 0) + (ground?.y ?? 0))?.kind).toBe('tower');
    // Pointing at open ground well away from it picks nothing.
    const q = isoToScreen(1, 1, 1);
    expect(pickPiece(view, q.sx, q.sy, 2)).toBeNull();
  });
});

describe('top-down plan view', () => {
  it('is used only while placing pieces, and while posting troops before the fight', () => {
    for (const tool of ['wall', 'tower', 'gatehouse', 'keep']) {
      expect(wantsTopDown(tool, null)).toBe(true);
      expect(wantsTopDown(tool, 'deploy')).toBe(false);
      expect(wantsTopDown(tool, 'fight')).toBe(false);
    }
    expect(wantsTopDown('troops', null)).toBe(true);
    expect(wantsTopDown('troops', 'deploy')).toBe(true);
    expect(wantsTopDown('troops', 'fight')).toBe(false);
    for (const tool of ['look', 'raise', 'lower', 'remove', 'extras']) expect(wantsTopDown(tool, null)).toBe(false);
  });

  it('converts between isometric and plan coordinates without drift', () => {
    for (const [x, y] of [
      [0, 0],
      [12.25, 40.5],
      [63, 1],
    ] as const) {
      const iso = tileToIso(x, y);
      expect(iso).toEqual({ x: isoToScreen(x, y).sx, y: isoToScreen(x, y).sy });
      const t = isoToTile(iso.x, iso.y);
      expect(t.x).toBeCloseTo(x);
      expect(t.y).toBeCloseTo(y);
      const plan = tileToPlan(x, y);
      expect(planToTile(plan.x, plan.y)).toEqual({ x, y });
    }
  });

  it('picks the tile under the pointer, and nothing off the map', () => {
    expect(pickPlanTile(10, 8, PLAN_TILE * 3.5, PLAN_TILE * 7.99)).toEqual({ x: 3, y: 7 });
    expect(pickPlanTile(10, 8, tileToPlan(4, 2).x, tileToPlan(4, 2).y)).toEqual({ x: 4, y: 2 });
    expect(pickPlanTile(10, 8, -1, 5)).toBeNull();
    expect(pickPlanTile(10, 8, PLAN_TILE * 10, 5)).toBeNull();
  });
});

describe('planned foundation outlines', () => {
  const wall = { kind: 'wall', x: 5, y: 5, thickness: 'standard', height: 'medium' } as const;
  const hw = WALL_THICKNESS.standard.width / 2;
  // Furthest an outline reaches from the tile centre towards +x.
  const reachX = (o: ReturnType<typeof foundationOutline>) => Math.max(...o.segments.flatMap(([x0, , x1]) => [x0, x1])) - 5;

  it('marks a lone wall tile as a small closed square', () => {
    const o = foundationOutline(wall, () => null);
    expect(o.segments).toHaveLength(4);
    expect(reachX(o)).toBeCloseTo(hw);
  });

  it('leaves a run of wall open where it joins the next wall tile, so the footing reads as one', () => {
    const o = foundationOutline(wall, (x, y) => (x === 6 && y === 5 ? 'wall' : null));
    expect(reachX(o)).toBeCloseTo(0.5);
    // Three sides of the core plus the two long sides of the arm; no line across the joint.
    expect(o.segments).toHaveLength(5);
    expect(o.segments.some(([x0, , x1]) => x0 === x1 && Math.abs(x0 - 5.5) < 1e-9)).toBe(false);
  });

  it('stops a wall at the footing of the tower it runs into, and closes it there', () => {
    const o = foundationOutline(wall, (x, y) => (x === 6 && y === 5 ? 'tower' : null));
    expect(reachX(o)).toBeCloseTo(1 - TOWER_HALF);
    expect(o.segments).toHaveLength(6);
  });

  it('draws towers, gatehouse and keep as their footings', () => {
    expect(foundationOutline({ kind: 'tower', x: 2, y: 2, shape: 'round', height: 'low' }, () => null).circles).toHaveLength(1);
    expect(foundationOutline({ kind: 'tower', x: 2, y: 2, shape: 'square', height: 'low' }, () => null).segments).toHaveLength(4);
    expect(foundationOutline({ kind: 'gatehouse', x: 2, y: 2, axis: 'x' }, () => null).segments).toHaveLength(6);
    const keep = foundationOutline({ kind: 'keep', x: 2, y: 2 }, () => null);
    const xs = keep.segments.flatMap(([x0, , x1]) => [x0, x1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(KEEP.size - 0.1);
  });
});

describe('view angle', () => {
  const map = buildSite(kestrelFord);
  const flatMap = mapFrom(Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 1)));

  it('holds the tile shape and height step in one place, and switches them', () => {
    setViewAngle('high');
    const high = viewAngle();
    expect(high.tileH / high.tileW).not.toBe(0.5);
    expect(isoToScreen(1, 0).sx - isoToScreen(0, 0).sx).toBe(high.tileW / 2);
    expect(isoToScreen(0, 0, 0).sy - isoToScreen(0, 0, 1).sy).toBe(high.levelH);
    expect(drawnLevels(2)).toBeGreaterThan(2);
    setViewAngle('standard');
    expect(isoToScreen(1, 1)).toEqual({ sx: 0, sy: 32 });
    expect(drawnLevels(2)).toBe(2);
  });

  it('picks the tile at its own centre in High view, and converts to and from plan coordinates', () => {
    setViewAngle('high');
    try {
      const shapes = buildTileShapes(map);
      for (const s of shapes.filter((t) => t.x % 7 === 0 && t.y % 5 === 0)) {
        const c = s.corners;
        const p = isoToScreen(s.x, s.y, (c.n + c.e + c.s + c.w) / 4);
        const hit = pickTile(shapes, p.sx, p.sy);
        // Only land in front can hide it, and then the front tile is picked.
        expect(hit).not.toBeNull();
        expect((hit?.x ?? 0) + (hit?.y ?? 0)).toBeGreaterThanOrEqual(s.x + s.y);
        if (hit?.x === s.x && hit.y === s.y) continue;
        expect(heightAt(map, hit?.x ?? 0, hit?.y ?? 0)).toBeGreaterThan(s.level);
      }
      const iso = tileToIso(12.25, 40.5);
      const t = isoToTile(iso.x, iso.y);
      expect(t.x).toBeCloseTo(12.25);
      expect(t.y).toBeCloseTo(40.5);
    } finally {
      setViewAngle('standard');
    }
  });

  it('picks a castle piece by its taller High view walls', () => {
    setViewAngle('high');
    try {
      const plan = createPlan(flatMap);
      placePieces(flatMap, plan, [{ kind: 'tower', x: 4, y: 4, shape: 'square', height: 'low' }]);
      const view = viewPlan(flatMap, plan);
      // Above where a low tower's top would be in the Standard view, but within its drawn height here.
      const p = isoToScreen(4.5, 4.5, 1 + 3);
      const ground = pickTile(buildTileShapes(flatMap), p.sx, p.sy);
      expect(pickPiece(view, p.sx, p.sy, ground ? ground.x + ground.y : 0)?.kind).toBe('tower');
    } finally {
      setViewAngle('standard');
    }
  });

  it('is never seen by the sim', () => {
    const dir = join(process.cwd(), 'src', 'sim');
    for (const file of readdirSync(dir)) expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/render\//);
  });
});
