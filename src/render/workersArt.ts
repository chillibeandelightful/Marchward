import type { Graphics } from 'pixi.js';
import { WORKER_TYPES, type WorkerType } from '../data/economy';
import { footprint } from '../sim/castle';
import { hash2 } from '../sim/noise';
import type { SimState } from '../sim/state';
import { isoToScreen } from './iso';

/** Tunic colour for each kind of worker, so the trades can be told apart on site. */
const TUNIC: Record<WorkerType, number> = {
  labourer: 0x9a8a6a,
  digger: 0x6b4f2e,
  carter: 0x3f6b8f,
  quarryman: 0x7d7d7d,
  mason: 0xd9d2c0,
  carpenter: 0x8f5a2a,
};
const SKIN = 0xe0b48c;
const LEGS = 0x3b3127;
const TOOL = 0x4a3a28;
const CANVAS = 0xe8dcc0;
const CANVAS_SHADE = 0xbfae8c;
const STONE_BLOCK = 0xc9c0aa;
const LOG = 0x8a6438;

/** Figures shown per worker type per job; more than this would just be a crowd. */
const SHOWN_PER_TYPE = 4;

/** Where to draw: the layer for a diagonal row, and the ground height at a point. */
export interface ActorHost {
  layer(diagonal: number): Graphics | undefined;
  ground(x: number, y: number): number;
}

/**
 * Animated workers on the building site, and the camp where they live. Purely visual: positions and
 * motions come from the sim's crew lists, a hash and the clock, so they never feed back into the game.
 */
export function drawWorkers(host: ActorHost, sim: SimState, timeMs: number): void {
  const t = timeMs / 1000;
  const [cx, cy] = sim.camp;
  drawCamp(host, sim, cx, cy, t);

  for (const [key, crew] of Object.entries(sim.works.crew)) {
    const spot = jobSpot(sim, key);
    if (!spot) continue;
    let n = 0;
    for (const type of WORKER_TYPES) {
      const count = Math.min(SHOWN_PER_TYPE, crew[type] ?? 0);
      for (let i = 0; i < count; i++, n++) {
        const seed = hashKey(key) + n * 7;
        if (type === 'carter') {
          // Carters go back and forth between the camp's stores and the job.
          const period = 9 + hash2(seed, 1, 3) * 4;
          const phase = ((t / period + hash2(seed, 2, 3)) % 1) * 2;
          const k = phase < 1 ? phase : 2 - phase;
          const x = cx + 1 + (spot.x - cx - 1) * k;
          const y = cy + (spot.y - cy) * k;
          drawCarter(host, x, y, t + seed, phase < 1);
          continue;
        }
        // Everyone else stands round the front of the job, at work.
        const a = -Math.PI / 3 + hash2(seed, 4, 5) * (Math.PI * 5) / 6;
        const r = spot.r + 0.2 + hash2(seed, 6, 7) * 0.15;
        drawFigure(host, spot.x + Math.cos(a) * r, spot.y + Math.sin(a) * r, type, t + hash2(seed, 8, 9) * 3, true);
      }
    }
  }

  // Idle workers (and everyone in winter) sit round the camp fire. Quarrymen are off at the quarry.
  let k = 0;
  for (const type of WORKER_TYPES) {
    const idle = Math.min(6, sim.works.idle[type] ?? 0);
    for (let i = 0; i < idle; i++, k++) {
      const a = (k / 14) * Math.PI * 2;
      drawFigure(host, cx + 0.15 + Math.cos(a) * 0.9, cy + 1.2 + Math.sin(a) * 0.5, type, t + k, false);
    }
  }
}

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 10007;
}

/** Centre of a job in tile coordinates, and roughly how far its edge is from the centre. */
function jobSpot(sim: SimState, key: string): { x: number; y: number; r: number } | null {
  const id = Number(key.slice(1));
  if (key[0] === 'e') return { x: id % sim.map.width, y: Math.floor(id / sim.map.width), r: 0.2 };
  const piece = sim.plan.pieces.find((p) => p.id === id);
  if (!piece) return null;
  const tiles = footprint(piece);
  const x = tiles.reduce((s, [tx]) => s + tx, 0) / tiles.length;
  const y = tiles.reduce((s, [, ty]) => s + ty, 0) / tiles.length;
  return { x, y, r: piece.kind === 'keep' ? 1.1 : 0.45 };
}

function at(host: ActorHost, x: number, y: number): { g: Graphics; sx: number; sy: number } | null {
  const g = host.layer(Math.round(x) + Math.round(y));
  if (!g) return null;
  const p = isoToScreen(x, y, host.ground(x, y));
  return { g, sx: p.sx, sy: p.sy };
}

/** A small person; `busy` swings a tool in their trade's rhythm. */
function drawFigure(host: ActorHost, x: number, y: number, type: WorkerType, t: number, busy: boolean): void {
  const o = at(host, x, y);
  if (!o) return;
  const { g, sx } = o;
  const speed = type === 'mason' || type === 'carpenter' ? 5 : 3;
  const swing = busy ? Math.sin(t * speed) : 0;
  const bend = busy && (type === 'digger' || type === 'labourer') ? Math.max(0, swing) * 2 : 0;
  const sy = o.sy;
  g.ellipse(sx, sy, 3.5, 1.5).fill({ color: 0x000000, alpha: 0.25 });
  if (busy) g.moveTo(sx - 1.2, sy).lineTo(sx - 1.2, sy - 4).moveTo(sx + 1.2, sy).lineTo(sx + 1.2, sy - 4).stroke({ width: 1.3, color: LEGS });
  else g.rect(sx - 2.5, sy - 2, 5, 2).fill(LEGS); // sitting
  const top = busy ? sy - 10 + bend : sy - 7;
  g.rect(sx - 2.2, top, 4.4, busy ? 6.5 : 5.5).fill(TUNIC[type]);
  g.circle(sx + bend * 0.4, top - 2, 1.8).fill(SKIN);
  if (!busy) return;
  // The tool: a hammer or mallet for the trades, a spade for diggers and labourers.
  const hx = sx + 2;
  const hy = top + 1.5;
  const ang = -0.6 + swing * 0.9;
  const len = type === 'digger' || type === 'labourer' ? 7 : 5;
  const ex = hx + Math.cos(ang) * len;
  const ey = hy + Math.sin(ang) * len;
  g.moveTo(hx, hy).lineTo(ex, ey).stroke({ width: 1, color: TOOL });
  if (type === 'digger' || type === 'labourer') g.rect(ex - 1, ey - 1, 2.2, 2.2).fill(0x8c8c8c);
  else g.rect(ex - 1.3, ey - 1.3, 2.6, 2).fill(type === 'mason' ? 0x9a9a9a : TOOL);
}

/** A carter with a hand-cart, loaded on the way out to the job. */
function drawCarter(host: ActorHost, x: number, y: number, t: number, loaded: boolean): void {
  const o = at(host, x, y);
  if (!o) return;
  const { g, sx, sy } = o;
  const step = Math.sin(t * 8) * 1.2;
  g.ellipse(sx + 4, sy, 7, 2.2).fill({ color: 0x000000, alpha: 0.22 });
  g.rect(sx + 2, sy - 6, 9, 4).fill(0x6e5232);
  g.circle(sx + 6.5, sy - 1.5, 2).fill(0x3a2e22);
  if (loaded) g.rect(sx + 3, sy - 9, 7, 3).fill(STONE_BLOCK).stroke({ width: 0.5, color: 0x6b6250 });
  g.moveTo(sx - 1, sy).lineTo(sx - 1 + step, sy - 4).moveTo(sx + 1, sy).lineTo(sx + 1 - step, sy - 4).stroke({ width: 1.3, color: LEGS });
  g.rect(sx - 2.2, sy - 10, 4.4, 6.5).fill(TUNIC.carter);
  g.circle(sx, sy - 12, 1.8).fill(SKIN);
}

/** Tents, a fire, and piles of stone and timber that grow and shrink with the stores. */
function drawCamp(host: ActorHost, sim: SimState, cx: number, cy: number, t: number): void {
  for (const [dx, dy] of [
    [-0.6, -0.6],
    [0.6, -0.7],
    [-0.7, 0.5],
  ] as const) {
    const o = at(host, cx + dx, cy + dy);
    if (!o) continue;
    const { g, sx, sy } = o;
    g.poly([sx - 20, sy, sx, sy - 26, sx + 3, sy + 7]).fill(CANVAS);
    g.poly([sx + 3, sy + 7, sx, sy - 26, sx + 20, sy]).fill(CANVAS_SHADE);
    g.poly([sx - 3, sy + 4, sx, sy - 11, sx + 3, sy + 4]).fill(0x3a2e22);
  }
  const fire = at(host, cx + 0.15, cy + 1.2);
  if (fire) {
    const { g, sx, sy } = fire;
    g.ellipse(sx, sy, 4, 2).fill(0x3a2e22);
    g.poly([sx - 2.5, sy, sx, sy - 6 - Math.abs(Math.sin(t * 9)) * 2, sx + 2.5, sy]).fill(0xf2a03a);
  }
  // Stone blocks, up to five rows high.
  const stones = Math.min(30, Math.ceil(sim.economy.stores.stone / 40));
  const s = at(host, cx + 1.1, cy - 0.1);
  if (s)
    for (let i = 0; i < stones; i++) {
      const row = Math.floor(i / 6);
      const col = i % 6;
      const bx = s.sx - 18 + col * 6 + row * 3;
      const by = s.sy - row * 4;
      s.g.rect(bx, by - 4, 6, 4).fill(STONE_BLOCK).stroke({ width: 0.6, color: 0x6b6250 });
    }
  const logs = Math.min(12, Math.ceil(sim.economy.stores.timber / 25));
  const l = at(host, cx + 0.5, cy + 0.9);
  if (l)
    for (let i = 0; i < logs; i++) {
      const row = Math.floor(i / 4);
      const lx = l.sx + 8 + (i % 4) * 4.4 + row * 2.2;
      const ly = l.sy - row * 4;
      l.g.circle(lx, ly - 2, 2.2).fill(LOG).stroke({ width: 0.5, color: 0x5a4024 });
    }
}
