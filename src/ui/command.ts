import type { Graphics } from 'pixi.js';
import { deploying, orderUnits, type BattleState, type Unit } from '../sim/battle';
import type { SimState } from '../sim/state';
import { drawnLevels, isoToScreen } from '../render/iso';

/** How close (in world pixels at zoom 1) a click must be to a figure to pick it. */
const PICK = 14;

/**
 * Commander mode in battle: pick your soldiers with a click (shift adds) or by dragging a box round
 * them, then click the ground to send them there, a wall or tower to send archers up onto it, or a
 * raider to send them after it. Orders go through the sim; this only keeps what is picked.
 */
export class Commander {
  readonly selected = new Set<number>();
  private dragFrom: { x: number; y: number } | null = null;
  private dragTo: { x: number; y: number } | null = null;

  constructor(
    private readonly sim: () => SimState,
    /** Ground level under a point, as drawn. */
    private readonly ground: (x: number, y: number) => number,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.active()) this.selected.clear();
    });
  }

  /** Orders can be given: a battle is being fought (not still deploying) and Commander mode is on. */
  active(): boolean {
    const s = this.sim();
    const b = s.defence.battle;
    return !!b && !deploying(b) && b.phase === 'fight' && s.defence.control === 'commander';
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
        if (p.x >= x0 && p.x <= x1 && p.y - 10 >= y0 && p.y - 10 <= y1) this.selected.add(u.id);
      }
      return;
    }
    const near = (side: 'defender' | 'attacker') => {
      let best: Unit | null = null;
      let bestD = PICK / Math.max(0.3, zoom);
      for (const u of b.units) {
        if (u.side !== side || u.hp <= 0) continue;
        const p = this.screenOf(b, u);
        const d = Math.hypot(p.x - world.x, p.y - 10 - world.y);
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

  private screenOf(b: BattleState, u: Unit): { x: number; y: number } {
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
    for (const u of b.units) {
      if (!this.selected.has(u.id)) continue;
      const p = this.screenOf(b, u);
      g.ellipse(p.x, p.y, 7, 3.5).stroke({ width: 1.6, color: 0xf6e27a, alpha: 0.95 });
      const o = u.order;
      if (!o) continue;
      if (o.kind === 'attack') {
        const f = b.units.find((t) => t.id === o.target);
        if (!f) continue;
        const q = this.screenOf(b, f);
        g.ellipse(q.x, q.y, 8, 4).stroke({ width: 1.6, color: 0xe5533d, alpha: 0.95 });
        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1, color: 0xe5533d, alpha: 0.5 });
      } else {
        const tx = o.tile % s.map.width;
        const ty = Math.floor(o.tile / s.map.width);
        const pc = b.pieces[Object.values(b.pieces).find((pp) => pp.standing && pp.tiles.includes(o.tile))?.id ?? -1];
        const q = isoToScreen(tx, ty, pc ? pc.ground + drawnLevels(pc.levels, pc.kind) : this.ground(tx, ty));
        g.moveTo(p.x, p.y).lineTo(q.sx, q.sy).stroke({ width: 1, color: 0xf6e27a, alpha: 0.45 });
        g.moveTo(q.sx, q.sy).lineTo(q.sx, q.sy - 12).stroke({ width: 1.4, color: 0x3a2a1a });
        g.poly([q.sx, q.sy - 12, q.sx + 7, q.sy - 9.5, q.sx, q.sy - 7]).fill(0xf6e27a);
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
