import { KEEP, WALL_THICKNESS } from '../data/castle';
import type { PieceKind, PieceSpec } from '../sim/castle';
import { NEIGHBOURS } from '../sim/terrain';

/**
 * Planned pieces that haven't been started are shown only as the outline of their foundations
 * on the ground: where the walls will go, not what they'll look like. Plain maths in tile
 * coordinates (tile centres are whole numbers), shared by the isometric and top-down views.
 */

/** Half the width of a tower's or gatehouse's footing, in tiles. */
export const TOWER_HALF = 0.42;
export const GATEHOUSE_HALF = 0.47;

export type Segment = readonly [x0: number, y0: number, x1: number, y1: number];

export interface FoundationOutline {
  segments: Segment[];
  circles: { x: number; y: number; r: number }[];
}

/** What stands on a neighbouring tile that a wall's footing joins, as far as the outline cares. */
export type Joined = Exclude<PieceKind, 'keep'> | 'round-tower' | null;

/**
 * The outline of a piece's footings. `joined(x, y)` says what curtain piece a wall on this tile
 * joins on that neighbouring tile (null for none). A wall running into another wall is left open
 * at the tile edge so a run of wall reads as one long footing; one running into a tower or
 * gatehouse stops at that piece's footing.
 */
export function foundationOutline(p: PieceSpec, joined: (x: number, y: number) => Joined): FoundationOutline {
  const segments: Segment[] = [];
  const circles: FoundationOutline['circles'] = [];
  const square = (x0: number, y0: number, x1: number, y1: number) =>
    segments.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
  const { x, y } = p;
  switch (p.kind) {
    case 'wall': {
      const hw = WALL_THICKNESS[p.thickness].width / 2;
      for (const [dx, dy] of NEIGHBOURS) {
        const j = joined(x + dx, y + dy);
        // Two corners of the core square on this side, and the direction across it.
        const ax = dx !== 0 ? dx * hw : -hw;
        const ay = dy !== 0 ? dy * hw : -hw;
        const bx = dx !== 0 ? dx * hw : hw;
        const by = dy !== 0 ? dy * hw : hw;
        if (!j) {
          segments.push([x + ax, y + ay, x + bx, y + by]);
          continue;
        }
        const reach = j === 'wall' ? 0.5 : j === 'round-tower' ? 1 - TOWER_HALF * 0.85 : 1 - (j === 'gatehouse' ? GATEHOUSE_HALF : TOWER_HALF);
        const ex = dx * (reach - hw);
        const ey = dy * (reach - hw);
        segments.push([x + ax, y + ay, x + ax + ex, y + ay + ey], [x + bx, y + by, x + bx + ex, y + by + ey]);
        if (j !== 'wall') segments.push([x + ax + ex, y + ay + ey, x + bx + ex, y + by + ey]);
      }
      break;
    }
    case 'tower':
      if (p.shape === 'round') circles.push({ x, y, r: TOWER_HALF });
      else square(x - TOWER_HALF, y - TOWER_HALF, x + TOWER_HALF, y + TOWER_HALF);
      break;
    case 'gatehouse': {
      const h = GATEHOUSE_HALF;
      square(x - h, y - h, x + h, y + h);
      // A wide gatehouse: a tower's footing either side of the passage.
      if (p.wide) {
        const [dx, dy] = p.axis === 'x' ? [0, 1] : [1, 0];
        for (const k of [-1, 1]) square(x + k * dx - h, y + k * dy - h, x + k * dx + h, y + k * dy + h);
      }
      // The passage through it.
      const w = 0.12;
      if (p.axis === 'x') segments.push([x - h, y - w, x + h, y - w], [x - h, y + w, x + h, y + w]);
      else segments.push([x - w, y - h, x - w, y + h], [x + w, y - h, x + w, y + h]);
      break;
    }
    case 'keep': {
      const m = 0.45;
      square(x - m, y - m, x + KEEP.size - 1 + m, y + KEEP.size - 1 + m);
      break;
    }
  }
  return { segments, circles };
}
