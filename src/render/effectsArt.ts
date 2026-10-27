import type { Graphics } from 'pixi.js';
import { simConfig } from '../data/config';
import type { BattleState } from '../sim/battle';
import { hash2 } from '../sim/noise';
import type { SimState } from '../sim/state';
import { isoToScreen } from './iso';
import { style } from './styles';
import type { ActorHost } from './workersArt';

/**
 * Fire, smoke and dust from fighting. Purely visual: everything here is worked out from the battle
 * state and the clock, so nothing feeds back into the game.
 */

/** Seconds into the battle. */
function battleSeconds(b: BattleState): number {
  return b.tick / simConfig.ticksPerSecond;
}

/** A column of smoke puffs rising and spreading from a screen point; `amount` 0 to 1 sets how thick. */
export function smokeColumn(g: Graphics, sx: number, sy: number, t: number, amount: number, seed: number, colour: number): void {
  const puffs = 4 + Math.round(amount * 6);
  for (let i = 0; i < puffs; i++) {
    // Each puff loops: born at the source, rising, drifting with the wind and fading.
    const k = (t * 0.22 + i / puffs + hash2(seed, i, 3) * 0.1) % 1;
    const rise = k * (60 + amount * 60);
    const drift = k * k * 26 + Math.sin(t * 0.8 + i) * 3;
    const r = 4 + k * (10 + amount * 8);
    g.circle(sx + drift, sy - rise, r).fill({ color: colour, alpha: (0.75 + amount * 0.2) * (1 - k * k) * Math.min(1, k * 6) });
  }
}

/** Flickering flames over a screen point, `size` in pixels across. */
export function flames(g: Graphics, sx: number, sy: number, t: number, size: number, seed: number): void {
  const fx = style().effects;
  for (let i = 0; i < 3; i++) {
    const x = sx + (i - 1) * size * 0.3;
    const h = size * (0.7 + 0.35 * Math.abs(Math.sin(t * (7 + i) + seed + i * 2)));
    const w = size * 0.28;
    g.poly([x - w, sy, x - w * 0.3, sy - h * 0.6, x, sy - h, x + w * 0.4, sy - h * 0.55, x + w, sy]).fill(fx.flame);
    g.poly([x - w * 0.5, sy, x, sy - h * 0.55, x + w * 0.5, sy]).fill(fx.flameCore);
  }
}

/** Raiders battering a piece kick up dust and chips of stone at its foot. */
export function drawDust(host: ActorHost, b: BattleState, t: number): void {
  const colour = style().effects.dust;
  for (const u of b.units) {
    if (u.act !== 'batter') continue;
    const g = host.layer(Math.round(u.x) + Math.round(u.y));
    if (!g) continue;
    const p = isoToScreen(u.x, u.y, host.ground(u.x, u.y));
    const k = (t * 1.6 + u.id * 0.37) % 1;
    g.circle(p.sx + 6 + k * 6, p.sy - 4 - k * 8, 2 + k * 4).fill({ color: colour, alpha: 0.45 * (1 - k) });
  }
}

/** A cloud of dust where a piece has just fallen, thinning to a wisp of smoke from the rubble. */
export function drawBreachSmoke(host: ActorHost, sim: SimState, b: BattleState, t: number, sky?: Graphics): void {
  const now = battleSeconds(b);
  const fx = style().effects;
  for (const p of Object.values(b.pieces)) {
    if (p.breachedAt === null) continue;
    const age = now - p.breachedAt;
    const front = Math.max(...p.tiles.map((i) => (i % sim.map.width) + Math.floor(i / sim.map.width)));
    const g = sky ?? host.layer(front);
    if (!g) continue;
    const base = isoToScreen(p.x, p.y, p.ground + 0.3);
    if (age < 6) {
      // The fall: a burst of dust spreading out and settling.
      const k = Math.max(0, age) / 6;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + p.x;
        g.circle(base.sx + Math.cos(a) * 18 * (0.4 + k), base.sy - 6 + Math.sin(a) * 7 * (0.4 + k) - k * 10, 7 + k * 9).fill({
          color: fx.dust,
          alpha: 0.55 * (1 - k),
        });
      }
    }
    smokeColumn(g, base.sx, base.sy - 4, t + p.x * 0.7, 0.25, p.x * 31 + p.y, fx.smoke);
  }
}

/**
 * Raiders at the target set it alight: the camp's tents, or the keep's door. The fire grows the
 * longer they plunder, with a column of smoke over it.
 */
export function drawBattleFire(host: ActorHost, sim: SimState, b: BattleState, t: number, sky?: Graphics): void {
  if (b.plunder <= 0) return;
  const amount = Math.min(1, b.plunder / 20);
  const fx = style().effects;
  const spots: [number, number][] = [];
  if (b.target === 'camp') {
    const [cx, cy] = sim.camp;
    // The tents (see drawCamp in workersArt), catching one after another.
    const tents: [number, number][] = [
      [cx - 0.6, cy - 0.6],
      [cx + 0.6, cy - 0.7],
      [cx - 0.7, cy + 0.5],
    ];
    spots.push(...tents.slice(0, 1 + Math.floor(amount * 2.99)));
  } else {
    const xs = b.targetTiles.map((i) => i % sim.map.width);
    const ys = b.targetTiles.map((i) => Math.floor(i / sim.map.width));
    // Against the keep's two front faces, the second once the fire has taken hold.
    const fx0 = Math.max(...xs);
    const fy0 = Math.max(...ys);
    spots.push([fx0 - 0.4, fy0 + 0.42]);
    if (amount > 0.4) spots.push([fx0 + 0.42, fy0 - 0.4]);
  }
  spots.forEach(([x, y], i) => {
    const p = isoToScreen(x, y, host.ground(x, y));
    const g = host.layer(Math.ceil(x) + Math.ceil(y));
    if (g) flames(g, p.sx, p.sy, t, 10 + amount * 10, i * 3);
    const s = sky ?? g;
    if (s) smokeColumn(s, p.sx, p.sy - 14, t + i * 1.3, 0.4 + amount * 0.6, i * 17 + 5, fx.smoke);
  });
}
