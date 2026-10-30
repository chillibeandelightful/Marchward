import {
  EARTHWORKS,
  GATEHOUSE,
  KEEP,
  LADDER_REACH,
  RANGE_BONUS,
  TOWER_HEIGHT,
  TOWER_SHAPE,
  WALL_BASE_COST,
  WALL_HEIGHT,
  WALL_THICKNESS,
  type Cost,
  type HeightClass,
  type Thickness,
  type TowerShape,
} from '../data/castle';
import { COMBAT, EXTRAS, type ExtraId } from '../data/combat';
import { MAX_HEIGHT } from '../data/terrain';
import { canStep, heightAt, inBounds, NEIGHBOURS, stepBetween, terrainAt, type TerrainMap } from './terrain';

export type PieceKind = 'wall' | 'tower' | 'gatehouse' | 'keep';
/** The way a gatehouse passage runs: 'x' means you walk through it along the x axis. */
export type Axis = 'x' | 'y';

/** Extras added to a wall, tower or gatehouse with the Extras tool. */
export type PieceExtras = Partial<Record<ExtraId, boolean>>;

/** A piece to place. (x, y) is its tile, or the back corner of the keep's footprint. */
export type PieceSpec = (
  | { kind: 'wall'; x: number; y: number; thickness: Thickness; height: HeightClass }
  | { kind: 'tower'; x: number; y: number; shape: TowerShape; height: HeightClass }
  | { kind: 'gatehouse'; x: number; y: number; axis: Axis }
  | { kind: 'keep'; x: number; y: number }
) &
  PieceExtras;

export type Piece = PieceSpec & { id: number };

/** The player's castle design. Plain data, so it goes straight into saves. */
export interface CastlePlan {
  nextId: number;
  pieces: Piece[];
  /** Planned height change per tile (row-major), from earthworks. */
  earthworks: number[];
}

export function createPlan(map: TerrainMap): CastlePlan {
  return { nextId: 1, pieces: [], earthworks: new Array<number>(map.width * map.height).fill(0) };
}

/** Walls, towers and the gatehouse make up the curtain; the keep stands apart. */
export function isCurtain(kind: PieceKind): boolean {
  return kind !== 'keep';
}

export function footprint(p: PieceSpec): [number, number][] {
  if (p.kind !== 'keep') return [[p.x, p.y]];
  const out: [number, number][] = [];
  for (let dy = 0; dy < KEEP.size; dy++) for (let dx = 0; dx < KEEP.size; dx++) out.push([p.x + dx, p.y + dy]);
  return out;
}

/** The land as it will be once the planned earthworks are done. */
export function plannedMap(map: TerrainMap, plan: CastlePlan): TerrainMap {
  return {
    width: map.width,
    height: map.height,
    heights: map.heights.map((h, i) => clampHeight(h + (plan.earthworks[i] ?? 0))),
    types: map.types,
  };
}

/** A snapshot of a plan on its planned land, for checks and stats. Rebuild it after each change. */
export interface PlanView {
  plan: CastlePlan;
  /** Planned land. */
  map: TerrainMap;
  /** Index into plan.pieces, plus one, per tile; 0 where nothing is built. */
  occupant: Int32Array;
  /** 1 where attackers could walk from the map edge, with the gate shut. */
  outside: Uint8Array;
}

export function viewPlan(base: TerrainMap, plan: CastlePlan): PlanView {
  const map = plannedMap(base, plan);
  const occupant = new Int32Array(map.width * map.height);
  plan.pieces.forEach((p, i) => {
    for (const [x, y] of footprint(p)) if (inBounds(map, x, y)) occupant[y * map.width + x] = i + 1;
  });
  return { plan, map, occupant, outside: floodOutside(map, occupant) };
}

export function pieceAt(view: PlanView, x: number, y: number): Piece | null {
  if (!inBounds(view.map, x, y)) return null;
  const i = view.occupant[y * view.map.width + x] ?? 0;
  return i === 0 ? null : (view.plan.pieces[i - 1] ?? null);
}

/** Can two edge-neighbouring tiles be built across? Not if there's a cliff between them. */
function joined(map: TerrainMap, ax: number, ay: number, bx: number, by: number): boolean {
  if (!inBounds(map, ax, ay) || !inBounds(map, bx, by)) return false;
  return stepBetween(heightAt(map, ax, ay), heightAt(map, bx, by)) !== 'cliff';
}

/** Does the curtain run from this tile to its neighbour? (Both curtain, no cliff between.) */
export function linked(view: PlanView, x: number, y: number, nx: number, ny: number): boolean {
  const a = pieceAt(view, x, y);
  const b = pieceAt(view, nx, ny);
  return !!a && !!b && isCurtain(a.kind) && isCurtain(b.kind) && joined(view.map, x, y, nx, ny);
}

/** Tiles at either end of a gatehouse passage. */
export function gateEnds(p: { x: number; y: number; axis: Axis }): [[number, number], [number, number]] {
  return p.axis === 'x'
    ? [
        [p.x - 1, p.y],
        [p.x + 1, p.y],
      ]
    : [
        [p.x, p.y - 1],
        [p.x, p.y + 1],
      ];
}

/** Rules that depend only on the land under a piece and the pieces around it. */
function groundProblem(view: PlanView, p: PieceSpec, self?: Piece): string | null {
  const { map } = view;
  const tiles = footprint(p);
  for (const [x, y] of tiles) {
    if (!inBounds(map, x, y)) return 'Off the edge of the map';
    const t = terrainAt(map, x, y);
    if (!t.buildable) return `${t.name}: ${t.foundation.toLowerCase()}`;
  }
  if (p.kind === 'keep') {
    const h = heightAt(map, p.x, p.y);
    if (tiles.some(([x, y]) => heightAt(map, x, y) !== h)) return 'The keep needs level ground (use earthworks)';
  }
  if (p.kind === 'gatehouse') {
    for (const [x, y] of gateEnds(p)) {
      if (!inBounds(map, x, y)) return 'The gate opens off the edge of the map';
      if (!canStep(map, p.x, p.y, x, y)) return 'The gate opens onto a cliff or deep water';
      const other = pieceAt(view, x, y);
      if (other && other !== self) return 'The gate passage is blocked (press R to turn it)';
    }
  }
  return null;
}

export interface PlacementCheck {
  /** Problem for each spec, or null where that piece is fine on its own. */
  problems: (string | null)[];
  /** The first problem, or null if the whole batch can be placed. */
  problem: string | null;
  /** Ids of walls that towers or a gatehouse in the batch would replace. */
  replaces: number[];
  cost: Cost;
}

/**
 * Check a batch of pieces (one click, or one dragged line of wall) against the rules:
 * free ground, foundations, one keep and gatehouse, no wall across a cliff, and new
 * curtain joined to the existing curtain.
 */
export function checkPlacement(base: TerrainMap, plan: CastlePlan, specs: readonly PieceSpec[]): PlacementCheck {
  const view = viewPlan(base, plan);
  const problems: (string | null)[] = specs.map(() => null);
  const replaces: number[] = [];
  const set = (i: number, text: string) => (problems[i] ??= text);
  const count = (kind: PieceKind) =>
    plan.pieces.filter((p) => p.kind === kind).length + specs.filter((s) => s.kind === kind).length;

  specs.forEach((s, i) => {
    for (const [x, y] of footprint(s)) {
      const other = pieceAt(view, x, y);
      if (!other) continue;
      if (other.kind === 'wall' && (s.kind === 'tower' || s.kind === 'gatehouse')) replaces.push(other.id);
      else set(i, 'Something is already built here');
    }
    for (const g of plan.pieces)
      if (g.kind === 'gatehouse' && gateEnds(g).some(([x, y]) => x === s.x && y === s.y))
        set(i, 'That would block the gate passage');
    const ground = groundProblem(view, s);
    if (ground) set(i, ground);
    if (s.kind === 'keep' && count('keep') > 1) set(i, 'A castle has only one keep');
    if (s.kind === 'gatehouse' && count('gatehouse') > 1) set(i, 'A castle has only one gatehouse');
    const prev = specs[i - 1];
    const adjacent = prev && Math.abs(prev.x - s.x) + Math.abs(prev.y - s.y) === 1;
    if (adjacent && !joined(view.map, prev.x, prev.y, s.x, s.y)) set(i, "A wall can't cross a cliff");
  });

  // New curtain must join what's there (if anything is), edge to edge with no cliff between.
  const hasCurtain = plan.pieces.some((p) => isCurtain(p.kind));
  const curtain = specs.filter((s) => isCurtain(s.kind));
  if (hasCurtain && curtain.length > 0 && replaces.length === 0) {
    const touches = curtain.some((s) =>
      NEIGHBOURS.some(([dx, dy]) => {
        const other = pieceAt(view, s.x + dx, s.y + dy);
        return !!other && isCurtain(other.kind) && joined(view.map, s.x, s.y, s.x + dx, s.y + dy);
      }),
    );
    if (!touches) curtain.forEach((s) => set(specs.indexOf(s), 'New walls must join the existing walls'));
  }

  const cost = specs.reduce((sum, s) => addCost(sum, pieceCost(base, s)), zeroCost());
  return { problems, problem: problems.find((p) => p !== null) ?? null, replaces, cost };
}

/** Place a batch if every piece passes the rules. Returns the check either way. */
export function placePieces(base: TerrainMap, plan: CastlePlan, specs: readonly PieceSpec[]): PlacementCheck {
  const check = checkPlacement(base, plan, specs);
  if (check.problem || specs.length === 0) return check;
  plan.pieces = plan.pieces.filter((p) => !check.replaces.includes(p.id));
  for (const s of specs) plan.pieces.push({ ...s, id: plan.nextId++ });
  return check;
}

/** Remove the piece covering a tile. Returns whether anything was removed. */
export function removePieceAt(plan: CastlePlan, x: number, y: number): boolean {
  const i = plan.pieces.findIndex((p) => footprint(p).some(([px, py]) => px === x && py === y));
  if (i < 0) return false;
  plan.pieces.splice(i, 1);
  return true;
}

export function earthworkProblem(base: TerrainMap, plan: CastlePlan, x: number, y: number, delta: number): string | null {
  if (!inBounds(base, x, y)) return 'Off the edge of the map';
  const t = terrainAt(base, x, y);
  const current = plan.earthworks[y * base.width + x] ?? 0;
  const next = current + delta;
  if (!t.canRaise && !t.canLower) return `${t.name} can't be raised or lowered`;
  if (next < 0 && !t.canLower) return `${t.name} can't be dug`;
  if (next > 0 && !t.canRaise) return `${t.name} can't be built up`;
  const h = heightAt(base, x, y) + next;
  if (h > MAX_HEIGHT) return 'Already as high as the land can go';
  if (h < 0) return 'Already as low as the land can go';
  return null;
}

/** Mark a tile to be raised (+1) or lowered (-1) one more level. Returns a problem, or null if done. */
export function adjustEarthwork(base: TerrainMap, plan: CastlePlan, x: number, y: number, delta: 1 | -1): string | null {
  const problem = earthworkProblem(base, plan, x, y, delta);
  if (problem) return problem;
  const i = y * base.width + x;
  plan.earthworks[i] = (plan.earthworks[i] ?? 0) + delta;
  return null;
}

/**
 * Raise or lower a tile one level. With `ripple`, neighbours that met it as flat ground or a
 * slope are pulled along wherever they would otherwise become a cliff, and so on outwards, so
 * digging the same spot again widens a pit with walkable sides instead of sinking a shaft.
 * Ground that already met it at a cliff, and tiles that can't be changed, are left alone.
 * Returns a problem (and changes nothing), or the tiles that changed.
 */
export function shapeEarth(
  base: TerrainMap,
  plan: CastlePlan,
  x: number,
  y: number,
  delta: 1 | -1,
  ripple = true,
): { problem: string | null; changed: [number, number][] } {
  const problem = adjustEarthwork(base, plan, x, y, delta);
  if (problem) return { problem, changed: [] };
  const changed: [number, number][] = [[x, y]];
  if (!ripple) return { problem: null, changed };

  const level = (tx: number, ty: number) => clampHeight(heightAt(base, tx, ty) + (plan.earthworks[ty * base.width + tx] ?? 0));
  const before = (tx: number, ty: number) =>
    level(tx, ty) - (changed.some(([cx, cy]) => cx === tx && cy === ty) ? delta : 0);
  for (let q = 0; q < changed.length; q++) {
    const [cx, cy] = changed[q] as [number, number];
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(base, nx, ny) || changed.some(([tx, ty]) => tx === nx && ty === ny)) continue;
      if (stepBetween(before(cx, cy), level(nx, ny)) === 'cliff') continue; // a cliff already
      if (stepBetween(level(cx, cy), level(nx, ny)) !== 'cliff') continue; // still a slope
      if (adjustEarthwork(base, plan, nx, ny, delta) === null) changed.push([nx, ny]);
    }
  }
  return { problem: null, changed };
}

export function clearEarthwork(base: TerrainMap, plan: CastlePlan, x: number, y: number): boolean {
  if (!inBounds(base, x, y)) return false;
  const i = y * base.width + x;
  if ((plan.earthworks[i] ?? 0) === 0) return false;
  plan.earthworks[i] = 0;
  return true;
}

export interface EarthworksSummary {
  /** Tile-levels to raise and to lower. */
  raised: number;
  lowered: number;
  /** Cartloads: spoil dug out minus spoil needed. Negative means more fill is needed than digging makes. */
  spoil: number;
  labour: number;
}

export function earthworksSummary(plan: CastlePlan): EarthworksSummary {
  let raised = 0;
  let lowered = 0;
  for (const d of plan.earthworks) {
    if (d > 0) raised += d;
    else lowered -= d;
  }
  return {
    raised,
    lowered,
    spoil: (lowered - raised) * EARTHWORKS.spoilPerLevel,
    labour: lowered * EARTHWORKS.lowerLabour + raised * EARTHWORKS.raiseLabour,
  };
}

export function zeroCost(): Cost {
  return { stone: 0, timber: 0, labour: 0 };
}

export function addCost(a: Cost, b: Cost): Cost {
  return { stone: a.stone + b.stone, timber: a.timber + b.timber, labour: a.labour + b.labour };
}

/** What a piece costs on this land, including ground preparation under its footprint. */
export function pieceCost(map: TerrainMap, p: PieceSpec): Cost {
  let cost: Cost;
  switch (p.kind) {
    case 'wall':
      cost = {
        stone: Math.round(WALL_BASE_COST.stone * WALL_THICKNESS[p.thickness].stoneMult),
        timber: WALL_BASE_COST.timber,
        labour: Math.round(WALL_BASE_COST.labour * WALL_HEIGHT[p.height].timeMult),
      };
      break;
    case 'tower': {
      const c = TOWER_SHAPE[p.shape].cost;
      cost = { ...c, labour: Math.round(c.labour * TOWER_HEIGHT[p.height].timeMult) };
      break;
    }
    case 'gatehouse':
      cost = { ...GATEHOUSE.cost };
      break;
    case 'keep':
      cost = { ...KEEP.cost };
      break;
  }
  for (const [x, y] of footprint(p)) if (inBounds(map, x, y)) cost = addCost(cost, terrainAt(map, x, y).groundwork);
  for (const e of Object.keys(EXTRAS) as ExtraId[]) if (p[e]) cost = addCost(cost, EXTRAS[e].cost);
  return cost;
}

/** Can this piece take extras? The keep has its own arrow slits and needs none. */
export function takesExtras(p: PieceSpec): boolean {
  return p.kind !== 'keep';
}

/** A piece with the given extras built in (as switched on while placing). The keep takes none. */
export function fitExtras(spec: PieceSpec, extras: PieceExtras): PieceSpec {
  if (!takesExtras(spec)) return spec;
  const out = { ...spec };
  for (const e of Object.keys(EXTRAS) as ExtraId[]) if (extras[e]) out[e] = true;
  return out;
}

/** Whether a piece has arrow slits: added as an extra, or built in (the keep). */
export function hasSlits(p: PieceSpec): boolean {
  return p.kind === 'keep' || !!p.slits;
}

/** Strength in HP when fully built. */
export function pieceHp(p: PieceSpec): number {
  switch (p.kind) {
    case 'wall':
      return WALL_THICKNESS[p.thickness].hp;
    case 'tower':
      return TOWER_SHAPE[p.shape].hp;
    case 'gatehouse':
      return GATEHOUSE.hp;
    case 'keep':
      return KEEP.hp;
  }
}

/** Share of battering damage a piece takes (round towers shrug some of it off). */
export function batterTaken(p: PieceSpec): number {
  return p.kind === 'tower' ? TOWER_SHAPE[p.shape].batterTaken : 1;
}

/** Add or take away an extra on the piece at a tile. Returns a problem, or null if done. */
export function toggleExtra(plan: CastlePlan, x: number, y: number, extra: ExtraId): { problem: string | null; piece: Piece | null; added: boolean } {
  const piece = plan.pieces.find((p) => footprint(p).some(([px, py]) => px === x && py === y)) ?? null;
  if (!piece) return { problem: 'Point at a wall, tower or gatehouse', piece, added: false };
  if (!takesExtras(piece)) return { problem: 'The keep already has arrow slits, and needs no cauldron', piece, added: false };
  const added = !piece[extra];
  if (added) piece[extra] = true;
  else delete piece[extra];
  return { problem: null, piece, added };
}

export function pieceName(p: PieceSpec): string {
  switch (p.kind) {
    case 'wall':
      return `${WALL_HEIGHT[p.height].name} ${WALL_THICKNESS[p.thickness].name.toLowerCase()} wall`;
    case 'tower':
      return `${TOWER_HEIGHT[p.height].name} ${TOWER_SHAPE[p.shape].name.toLowerCase()} tower`;
    case 'gatehouse':
      return GATEHOUSE.name;
    case 'keep':
      return KEEP.name;
  }
}

export function pieceLevels(p: PieceSpec): number {
  switch (p.kind) {
    case 'wall':
      return WALL_HEIGHT[p.height].levels;
    case 'tower':
      return TOWER_HEIGHT[p.height].levels;
    case 'gatehouse':
      return GATEHOUSE.levels;
    case 'keep':
      return KEEP.levels;
  }
}

export interface PieceStats {
  name: string;
  hp: number;
  /** Height of the piece itself, in levels. */
  levels: number;
  /** Ground level it stands on (after earthworks). */
  ground: number;
  /** Levels its top stands above the highest ground attackers can reach next to it; null if none. */
  aboveApproach: number | null;
  /** Whether ladder crews can climb it from that ground. */
  ladderable: boolean;
  /** Extra archer range in tiles. */
  rangeBonus: number;
  /** How far archers on it can shoot at attackers on the approach, in tiles. */
  range: number;
  notes: string[];
}

export function pieceStats(view: PlanView, p: PieceSpec): PieceStats {
  const { map } = view;
  const tiles = footprint(p);
  const ground = Math.max(...tiles.map(([x, y]) => heightAt(map, x, y)));
  const levels = pieceLevels(p);

  // Measure from outside ground next to the piece; failing that, from open ground inside the walls.
  const own = new Set(tiles.map(([x, y]) => y * map.width + x));
  const outside: number[] = [];
  const open: number[] = [];
  for (const [x, y] of tiles)
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      const i = ny * map.width + nx;
      if (!inBounds(map, nx, ny) || own.has(i) || pieceAt(view, nx, ny)) continue;
      if (terrainAt(map, nx, ny).moveCost === null) continue;
      (view.outside[i] ? outside : open).push(heightAt(map, nx, ny));
    }
  const approach = outside.length > 0 ? outside : open;
  const aboveApproach = approach.length > 0 ? Math.max(0, ground + levels - Math.max(...approach)) : null;
  const above = aboveApproach ?? levels;

  const notes: string[] = [];
  const hp = pieceHp(p);
  switch (p.kind) {
    case 'wall':
      break;
    case 'tower': {
      const shape = TOWER_SHAPE[p.shape];
      if (shape.batterTaken < 1) notes.push(`Takes ${Math.round((1 - shape.batterTaken) * 100)}% less battering damage`);
      if (shape.sapTimeMult > 1) notes.push(`Sappers need ${shape.sapTimeMult}× as long to undermine it`);
      break;
    }
    case 'gatehouse':
      notes.push('Your troops can pass through; raiders have to batter the gate down');
      break;
    case 'keep':
      notes.push('Required. Should stand inside the walls. Raiders make for it to plunder it');
      notes.push('Built-in arrow slits for the archers on it');
      break;
  }
  for (const e of Object.keys(EXTRAS) as ExtraId[]) if (p[e]) notes.push(`${EXTRAS[e].name}: ${EXTRAS[e].note.charAt(0).toLowerCase()}${EXTRAS[e].note.slice(1)}`);
  if (tiles.some(([x, y]) => inBounds(map, x, y) && !terrainAt(map, x, y).canLower)) notes.push('On rock: cannot be undermined');
  if (outside.length === 0 && open.length > 0 && isCurtain(p.kind)) notes.push('Measured from inside: no outside ground next to it');

  return {
    name: pieceName(p),
    hp,
    levels,
    ground,
    aboveApproach,
    ladderable: above <= LADDER_REACH,
    rangeBonus: rangeBonus(above),
    range: COMBAT.bowRange + rangeBonus(above),
    notes,
  };
}

export interface PlanProblem {
  piece: Piece;
  text: string;
}

export interface PlanReport {
  cost: Cost;
  earthworks: EarthworksSummary;
  keeps: number;
  gatehouses: number;
  /** Whether attackers can't reach the keep with the gate shut; null with no keep. */
  keepEnclosed: boolean | null;
  /** Separate runs of joined curtain (1 is a single connected circuit). */
  curtainParts: number;
  /** Placed pieces that break a rule on the planned land (for example after earthworks). */
  problems: PlanProblem[];
  /** One keep, one gatehouse, keep enclosed and no problems. */
  ready: boolean;
}

export function planReport(base: TerrainMap, view: PlanView): PlanReport {
  const { plan, map } = view;
  const earthworks = earthworksSummary(plan);
  let cost = zeroCost();
  for (const p of plan.pieces) cost = addCost(cost, pieceCost(base, p));
  cost = addCost(cost, { stone: 0, timber: 0, labour: earthworks.labour });

  const problems: PlanProblem[] = [];
  for (const p of plan.pieces) {
    const text = groundProblem(view, p, p);
    if (text) problems.push({ piece: p, text });
  }

  const keep = plan.pieces.find((p) => p.kind === 'keep');
  let keepEnclosed: boolean | null = null;
  if (keep) {
    keepEnclosed = footprint(keep).every(([x, y]) =>
      NEIGHBOURS.every(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(map, nx, ny)) return false;
        return !view.outside[ny * map.width + nx];
      }),
    );
  }

  const keeps = plan.pieces.filter((p) => p.kind === 'keep').length;
  const gatehouses = plan.pieces.filter((p) => p.kind === 'gatehouse').length;
  return {
    cost,
    earthworks,
    keeps,
    gatehouses,
    keepEnclosed,
    curtainParts: countCurtainParts(view),
    problems,
    ready: keeps === 1 && gatehouses === 1 && keepEnclosed === true && problems.length === 0,
  };
}

function countCurtainParts(view: PlanView): number {
  const { map } = view;
  const seen = new Uint8Array(map.width * map.height);
  let parts = 0;
  for (const p of view.plan.pieces) {
    if (!isCurtain(p.kind) || seen[p.y * map.width + p.x]) continue;
    parts++;
    const stack: [number, number][] = [[p.x, p.y]];
    seen[p.y * map.width + p.x] = 1;
    while (stack.length > 0) {
      const [x, y] = stack.pop() as [number, number];
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        const i = ny * map.width + nx;
        if (!inBounds(map, nx, ny) || seen[i] || !linked(view, x, y, nx, ny)) continue;
        seen[i] = 1;
        stack.push([nx, ny]);
      }
    }
  }
  return parts;
}

/** Tiles reachable on foot from the map edge, treating every piece (and the shut gate) as solid. */
function floodOutside(map: TerrainMap, occupant: Int32Array): Uint8Array {
  const out = new Uint8Array(map.width * map.height);
  const queue: number[] = [];
  const open = (x: number, y: number) => {
    const i = y * map.width + x;
    return !out[i] && !occupant[i] && terrainAt(map, x, y).moveCost !== null;
  };
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (x !== 0 && y !== 0 && x !== map.width - 1 && y !== map.height - 1) continue;
      if (!open(x, y)) continue;
      out[y * map.width + x] = 1;
      queue.push(y * map.width + x);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q] as number;
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny) || !open(nx, ny) || !canStep(map, x, y, nx, ny)) continue;
      out[ny * map.width + nx] = 1;
      queue.push(ny * map.width + nx);
    }
  }
  return out;
}

/** Extra archer range in tiles for standing this many levels above the target. */
export function rangeBonus(levelsAbove: number): number {
  return RANGE_BONUS[Math.max(0, Math.min(Math.floor(levelsAbove), RANGE_BONUS.length - 1))] ?? 0;
}

function clampHeight(h: number): number {
  return Math.min(MAX_HEIGHT, Math.max(0, h));
}
