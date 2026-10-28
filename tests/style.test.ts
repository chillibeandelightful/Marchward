import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERRAIN, type TerrainId } from '../src/data/terrain';
import { setStyle, style, STYLES } from '../src/render/styles';
import { buildPalette, colourDistance, nearest, styleColours } from '../src/render/styles/palette';
import { toSave } from '../src/sim/save';
import { createSim } from '../src/sim/state';
import { DEFAULT_LOOK, parseLook } from '../src/ui/look';

describe('visual styles', () => {
  it('give every terrain a ground colour in both styles', () => {
    for (const s of Object.values(STYLES)) for (const id of Object.keys(TERRAIN) as TerrainId[]) expect(s.terrain.ground[id], `${s.id} ${id}`).toBeTypeOf('number');
  });

  it('switch the active style', () => {
    setStyle('classic');
    expect(style().id).toBe('classic');
    setStyle('modern');
    expect(style().id).toBe('modern');
  });

  it('keep Modern as the original look, with no screen effect or frame', () => {
    expect(STYLES.modern.retro).toBe(false);
    expect(STYLES.modern.backdrop).toBeNull();
    expect(STYLES.modern.ui).toBe('modern');
    expect(STYLES.classic.retro).toBe(true);
  });

  it('keep Drab as Classic drawn smooth: same colours and frame, no screen effect', () => {
    expect(STYLES.drab.retro).toBe(false);
    expect(STYLES.drab.ui).toBe('classic');
    expect(STYLES.drab.terrain).toBe(STYLES.classic.terrain);
    expect(STYLES.drab.castle).toBe(STYLES.classic.castle);
    expect(parseLook('{"style":"drab"}').style).toBe('drab');
  });

  it('are never seen by the sim or kept in saves', () => {
    const dir = join(process.cwd(), 'src', 'sim');
    for (const file of readdirSync(dir)) expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/styles/);
    const save = toSave(createSim(1), 0);
    expect(save).not.toMatch(/classic|modern|dither/i);
  });
});

describe('limited palette', () => {
  const palette = buildPalette(STYLES.classic);

  it('stays within its size', () => {
    expect(palette.length).toBeLessThanOrEqual(128);
    expect(new Set(palette).size).toBe(palette.length);
  });

  it('keeps every ground colour close to its own', () => {
    // A small distance means the land keeps its colour; only shades in between get dithered.
    for (const c of Object.values(STYLES.classic.terrain.ground)) expect(colourDistance(nearest(palette, c), c)).toBeLessThan(9 * 12 * 12);
  });

  it('collects colours but not sizes from a style', () => {
    const colours = styleColours(STYLES.classic);
    expect(colours).toContain(STYLES.classic.castle.stone.face);
    expect(colours).not.toContain(STYLES.classic.figures.scale);
  });

  it('is the same every time', () => {
    expect(buildPalette(STYLES.classic)).toEqual(palette);
  });
});

describe('look settings', () => {
  it('fall back to the defaults for missing or broken settings', () => {
    expect(parseLook(null)).toEqual(DEFAULT_LOOK);
    expect(parseLook('not json')).toEqual(DEFAULT_LOOK);
    expect(parseLook('{"style":"neon","pixel":9,"dither":"lots"}')).toEqual(DEFAULT_LOOK);
  });

  it('read back what was stored', () => {
    expect(parseLook(JSON.stringify({ style: 'classic', pixel: 3, dither: 0.5 }))).toEqual({ style: 'classic', pixel: 3, dither: 0.5 });
  });
});
