import { describe, expect, it } from 'vitest';
import { kestrelFord } from '../src/data/sites/kestrelFord';
import { MAX_HEIGHT, TERRAIN, type TerrainId } from '../src/data/terrain';
import { buildSite, walkLine, type SiteDef } from '../src/sim/site';
import { canStep, groundShape, heightAt, NEIGHBOURS, stepBetween, terrainAt } from '../src/sim/terrain';

const blank = (features: SiteDef['features']): SiteDef => ({
  id: 't',
  name: 'T',
  width: 24,
  height: 24,
  baseHeight: 1,
  features,
});

function maxNeighbourStep(def: SiteDef): number {
  const map = buildSite(def);
  let worst = 0;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        worst = Math.max(worst, Math.abs(heightAt(map, x, y) - heightAt(map, nx, ny)));
      }
  return worst;
}

describe('terrain rules', () => {
  it('treats a difference of 1 as a slope and 2 or more as a cliff', () => {
    expect(stepBetween(3, 3)).toBe('flat');
    expect(stepBetween(3, 4)).toBe('slope');
    expect(stepBetween(4, 3)).toBe('slope');
    expect(stepBetween(1, 3)).toBe('cliff');
    expect(stepBetween(6, 0)).toBe('cliff');
  });

  it('lets units climb slopes but not cliffs or deep water', () => {
    const map = buildSite(
      blank([
        { kind: 'plateau', at: [5, 5], radius: 2, level: 4 },
        { kind: 'patch', terrain: 'deep', at: [18, 18], radius: 2, level: 1 },
      ]),
    );
    expect(canStep(map, 10, 10, 11, 10)).toBe(true);
    expect(canStep(map, 5, 8, 5, 7)).toBe(false); // base 1 up onto level 4
    expect(canStep(map, 18, 15, 18, 16)).toBe(false); // into deep water
    expect(canStep(map, 0, 0, -1, 0)).toBe(false); // off the map
  });
});

describe('site building', () => {
  it('is deterministic', () => {
    expect(buildSite(kestrelFord)).toEqual(buildSite(kestrelFord));
  });

  it('makes hills with only walkable slopes', () => {
    expect(maxNeighbourStep(blank([{ kind: 'hill', at: [12, 12], radius: 9, peak: 5 }]))).toBe(1);
  });

  it('makes plateaus with cliffs', () => {
    const map = buildSite(blank([{ kind: 'plateau', at: [12, 12], radius: 4, level: 4 }]));
    expect(heightAt(map, 12, 12)).toBe(4);
    expect(groundShape(map, 12, 16)).toBe('cliff');
    expect(groundShape(map, 12, 12)).toBe('flat');
  });

  it('makes rivers deep in the middle and shallow at the edges, at the river level', () => {
    const map = buildSite(blank([{ kind: 'river', path: [[12, -1], [12, 24]], width: 5, level: 0 }]));
    expect(terrainAt(map, 12, 10).id).toBe('deep');
    expect(terrainAt(map, 14, 10).id).toBe('shallow');
    expect(terrainAt(map, 15, 10).id).toBe('grass');
    expect(heightAt(map, 14, 10)).toBe(0);
  });

  it('turns water into a ford where a road crosses it', () => {
    const map = buildSite(
      blank([
        { kind: 'river', path: [[12, -1], [12, 24]], width: 5, level: 0 },
        { kind: 'road', path: [[0, 8], [23, 8]] },
      ]),
    );
    expect(terrainAt(map, 12, 8).id).toBe('ford');
    expect(terrainAt(map, 5, 8).id).toBe('road');
    expect(terrainAt(map, 12, 9).id).toBe('deep');
  });

  it('walks lines one edge step at a time', () => {
    const tiles: [number, number][] = [];
    walkLine([0, 0], [3, 2], (x, y) => tiles.push([x, y]));
    expect(tiles[0]).toEqual([0, 0]);
    expect(tiles.at(-1)).toEqual([3, 2]);
    expect(tiles).toHaveLength(6);
    for (let i = 1; i < tiles.length; i++) {
      const [ax, ay] = tiles[i - 1] as [number, number];
      const [bx, by] = tiles[i] as [number, number];
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    }
  });
});

describe('the Kestrel Ford test site', () => {
  const map = buildSite(kestrelFord);

  it('is 64 by 64 with heights in range', () => {
    expect(map.width).toBe(64);
    expect(map.heights).toHaveLength(64 * 64);
    expect(Math.min(...map.heights)).toBe(0);
    expect(Math.max(...map.heights)).toBeLessThanOrEqual(MAX_HEIGHT);
  });

  it('uses every terrain type', () => {
    const used = new Set(map.types);
    for (const id of Object.keys(TERRAIN) as TerrainId[]) expect(used, id).toContain(id);
  });

  it('has both slopes and cliffs', () => {
    const shapes = new Set<string>();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) shapes.add(groundShape(map, x, y));
    expect(shapes).toEqual(new Set(['flat', 'slope', 'cliff']));
  });

  it('has a road that never climbs a cliff, so it can be walked end to end', () => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        if (terrainAt(map, x, y).id !== 'road') continue;
        for (const [dx, dy] of NEIGHBOURS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= 64 || ny >= 64) continue;
          if (['road', 'ford'].includes(terrainAt(map, nx, ny).id)) expect(canStep(map, x, y, nx, ny)).toBe(true);
        }
      }
  });
});
