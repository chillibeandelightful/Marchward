import { groundShape, heightAt, terrainAt, type TerrainMap } from '../sim/terrain';
import type { SimState } from '../sim/state';
import { renderLines, type Line } from './format';

const SHAPE_LABEL = { flat: 'Flat ground', slope: 'Slope (walkable)', cliff: 'Cliff edge' } as const;

/** Text overlays: site status and the hovered tile's readout. Reads state; never changes it. */
export class Hud {
  constructor(
    private readonly status: HTMLElement,
    private readonly readout: HTMLElement,
  ) {}

  /** `land` is the planned land (after earthworks); `extra` adds lines from the designer. */
  update(
    state: SimState,
    land: TerrainMap,
    fps: number,
    zoom: number,
    hover: { x: number; y: number } | null,
    extra: readonly Line[],
  ): void {
    this.status.textContent = `Marchward · M2 castle designer · ${state.siteName} (test site) · zoom ${Math.round(zoom * 100)}% · ${fps.toFixed(0)} fps`;

    if (!hover) {
      renderLines(this.readout, [{ text: 'Point at a tile to see what it is.' }, ...extra]);
      return;
    }
    const t = terrainAt(land, hover.x, hover.y);
    const now = heightAt(state.map, hover.x, hover.y);
    const planned = heightAt(land, hover.x, hover.y);
    const lines: Line[] = [
      { text: `${t.name} · height ${planned}${planned !== now ? ` (now ${now}, earthworks planned)` : ''}`, cls: 'head' },
      { text: SHAPE_LABEL[groundShape(land, hover.x, hover.y)] },
      { text: `Movement: ${t.movement}` },
      { text: `Foundation: ${t.foundation}` },
      { text: `Tile ${hover.x}, ${hover.y}`, cls: 'dim' },
      ...extra,
    ];
    renderLines(this.readout, lines);
  }
}
