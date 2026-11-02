import type { Graphics } from 'pixi.js';
import { deploying, orderUnits, releaseUnits, type BattleState, type Unit } from '../sim/battle';
import type { SimState } from '../sim/state';
import { drawnLevels, isoToScreen } from '../render/iso';
import { PLAN_TILE, tileToPlan } from '../render/topDown';

/** How close (in world pixels at zoom 1) a click must be to a figure to pick it. */
const PICK = 14;
/** The same from above, where figures are drawn as larger marks. */
const PICK_ABOVE = 22;

/**
 * Commander mode in battle: pick your soldiers with a click (shift adds) or by dragging a box round
 * them, then click the ground to send them there, a wall or tower to send archers up onto it, or a
 * raider to send them after it; U takes the picked soldiers' orders back. Orders go through the sim;
 * this only keeps what is picked.
 */
export class Commander {
  readonly selected = new Set<number>();
  private dragFrom: { x: number; y: number } | null = null;
  private dragTo: { x: number; y: number } | null = null;

  constructor(
    private readonly sim: () => SimState,
    /** Ground level under a point, as drawn. */
    private readonly ground: (x: number, y: number) => number,
    /** Seen from straight above (the top-down view) rather than in the isometric view. */
    private readonly fromAbove: () => boolean = () => false,
  ) {
    window.addEventListener('keydown', (e) => {
      if (!this.active()) return;
      if (e.code === 'Escape') this.selected.clear();
      // Take back the picked soldiers' orders: they go back to their posts.
      else if ((e.code === 'KeyU' || e.code === 'Backspace') && this.selected.size > 0) this.recall();
    });
  }

  /** Orders can be given: a battle is being fought (not still deploying) and Commander mode is on. */
  active(): boolean {
    const s = this.sim();
    const b = s.defence.battle;
    return !!b && !deploying(b) && b.phase === 'fight' && s.defence.control === 'commander';
  }

  /** Take back the orders given to the picked soldiers. Returns how many had orders. */
  recall(): number {
    return releaseUnits(this.sim(), [...this.selected]);
  }

  press(world: { x: number; y: number }): void {
    this.dragFrom = world;
    this.dragTo = world;
  }

  drag(world: { x: number; y: number }): void {
    if (this.dragFrom) this.dragTo = world;
  }

  /** Let go: a box picks soldiers; a click picks one, or gives the picked ones an order. */
  release(world: { x: number; y: number }, tile: { x: number; y: number } | null, add: boolean, zoom: number): void {
    const from = this.dragFrom;
    this.dragFrom = null;
    this.dragTo = null;
    const s = this.sim();
    const b = s.defence.battle;
    if (!b || !from) return;
    this.prune(b);
    if (Math.hypot(world.x - from.x, world.y - from.y) * zoom > 6) {
      if (!add) this.selected.clear();
      const x0 = Math.min(from.x, world.x);
      const x1 = Math.max(from.x, world.x);
      const y0 = Math.min(from.y, world.y);
      const y1 = Math.max(from.y, world.y);
      for (const u of b.units) {
        if (u.side !== 'defender' || u.hp <= 0) continue;
        const p = this.screenOf(b, u);
        if (p.x >= x0 && p.x <= x1 && p.y - this.lift() >= y0 && p.y - this.lift() <= y1) this.selected.add(u.id);
      }
      return;
    }
    const near = (side: 'defender' | 'attacker') => {
      let best: Unit | null = null;
      let bestD = (this.fromAbove() ? PICK_ABOVE : PICK) / Math.max(0.3, zoom);
      for (const u of b.units) {
        if (u.side !== side || u.hp <= 0) continue;
        const p = this.screenOf(b, u);
        const d = Math.hypot(p.x - world.x, p.y - this.lift() - world.y);
        if (d < bestD) {
          best = u;
          bestD = d;
        }
      }
      return best;
    };
    const mine = near('defender');
    if (mine) {
      if (!add) this.selected.clear();
      if (add && this.selected.has(mine.id)) this.selected.delete(mine.id);
      else this.selected.add(mine.id);
      return;
    }
    if (this.selected.size === 0) return;
    const ids = [...this.selected];
    const foe = near('attacker');
    if (foe) {
      orderUnits(s, ids, { kind: 'attack', target: foe.id });
      return;
    }
    if (!tile) return;
    orderUnits(s, ids, { kind: 'move', tile: tile.y * s.map.width + tile.x });
  }

  /** Drop picked soldiers who have fallen. */
  private prune(b: BattleState): void {
    for (const id of this.selected) if (!b.units.some((u) => u.id === id && u.hp > 0)) this.selected.delete(id);
  }

  /** How far above its feet a figure is picked: its middle in the isometric view; from above, the mark itself. */
  private lift(): number {
    return this.fromAbove() ? 0 : 10;
  }

  /** Where a tile's centre (or a point on it) is drawn: on the plan from above, or on the land as drawn. */
  private pointOf(b: BattleState, x: number, y: number, tile: number): { x: number; y: number } {
    if (this.fromAbove()) return tileToPlan(x, y);
    const pc = Object.values(b.pieces).find((pp) => pp.standing && pp.tiles.includes(tile));
    const q = isoToScreen(x, y, pc ? pc.ground + drawnLevels(pc.levels, pc.kind) : this.ground(x, y));
    return { x: q.sx, y: q.sy };
  }

  private screenOf(b: BattleState, u: Unit): { x: number; y: number } {
    if (this.fromAbove()) return tileToPlan(u.x, u.y);
    const on = u.on ? b.pieces[u.on] : undefined;
    const level = on ? on.ground + drawnLevels(on.levels, on.kind) : this.ground(u.x, u.y);
    const p = isoToScreen(u.x, u.y, level);
    return { x: p.sx, y: p.sy };
  }

  /** Rings round the picked soldiers, marks on their orders, and the box being dragged. Drawn over everything. */
  draw(g: Graphics): void {
    const s = this.sim();
    const b = s.defence.battle;
    if (!b || s.defence.control !== 'commander') {
      this.selected.clear();
      return;
    }
    this.prune(b);
    // From above, the marks are drawn at the plan's scale.
    const k = this.fromAbove() ? PLAN_TILE / 40 : 1;
    for (const u of b.units) {
      if (!this.selected.has(u.id)) continue;
      const p = this.screenOf(b, u);
      if (k > 1) g.circle(p.x, p.y, PLAN_TILE * 0.32).stroke({ width: 2.5, color: 0xf6e27a, alpha: 0.95 });
      else g.ellipse(p.x, p.y, 7, 3.5).stroke({ width: 1.6, color: 0xf6e27a, alpha: 0.95 });
      const o = u.order;
      if (!o) continue;
      if (o.kind === 'attack') {
        const f = b.units.find((t) => t.id === o.target);
        if (!f) continue;
        const q = this.screenOf(b, f);
        if (k > 1) g.circle(q.x, q.y, PLAN_TILE * 0.36).stroke({ width: 2.5, color: 0xe5533d, alpha: 0.95 });
        else g.ellipse(q.x, q.y, 8, 4).stroke({ width: 1.6, color: 0xe5533d, alpha: 0.95 });
        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: k, color: 0xe5533d, alpha: 0.5 });
      } else {
        const tx = o.tile % s.map.width;
        const ty = Math.floor(o.tile / s.map.width);
        const q = this.pointOf(b, tx, ty, o.tile);
        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: k, color: 0xf6e27a, alpha: 0.45 });
        g.moveTo(q.x, q.y).lineTo(q.x, q.y - 12 * k).stroke({ width: 1.4 * k, color: 0x3a2a1a });
        g.poly([q.x, q.y - 12 * k, q.x + 7 * k, q.y - 9.5 * k, q.x, q.y - 7 * k]).fill(0xf6e27a);
      }
    }
    if (this.dragFrom && this.dragTo) {
      const x = Math.min(this.dragFrom.x, this.dragTo.x);
      const y = Math.min(this.dragFrom.y, this.dragTo.y);
      g.rect(x, y, Math.abs(this.dragTo.x - this.dragFrom.x), Math.abs(this.dragTo.y - this.dragFrom.y))
        .fill({ color: 0xf6e27a, alpha: 0.08 })
        .stroke({ width: 1, color: 0xf6e27a, alpha: 0.8 });
    }
  }
}
