import { groundShape, heightAt, terrainAt } from '../sim/terrain';
import type { SimState } from '../sim/state';

const SHAPE_LABEL = { flat: 'Flat ground', slope: 'Slope (walkable)', cliff: 'Cliff edge' } as const;

/** Text overlays: site status and the hovered tile's readout. Reads state; never changes it. */
export class Hud {
  constructor(
    private readonly status: HTMLElement,
    private readonly readout: HTMLElement,
  ) {}

  update(state: SimState, fps: number, zoom: number, hover: { x: number; y: number } | null): void {
    this.status.textContent = `Marchward · M1 · ${state.siteName} (test site) · zoom ${Math.round(zoom * 100)}% · ${fps.toFixed(0)} fps`;

    if (!hover) {
      this.readout.textContent = 'Point at a tile to see what it is.';
      return;
    }
    const { map } = state;
    const t = terrainAt(map, hover.x, hover.y);
    this.readout.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = `${t.name} · height ${heightAt(map, hover.x, hover.y)}`;
    this.readout.append(
      title,
      line(SHAPE_LABEL[groundShape(map, hover.x, hover.y)]),
      line(`Movement: ${t.movement}`),
      line(`Building: ${t.building}`),
      line(`Tile ${hover.x}, ${hover.y}`, 'dim'),
    );
  }
}

function line(text: string, cls?: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
