import {
  EARTHWORKS,
  TOWER_HEIGHT,
  TOWER_SHAPE,
  WALL_HEIGHT,
  WALL_THICKNESS,
  type HeightClass,
  type Thickness,
  type TowerShape,
} from '../data/castle';
import {
  checkPlacement,
  clearEarthwork,
  isCurtain,
  pieceAt,
  pieceCost,
  pieceStats,
  placePieces,
  removePieceAt,
  shapeEarth,
  toggleExtra,
  type Axis,
  type CastlePlan,
  type Piece,
  type PieceSpec,
  type PlacementCheck,
  type PlanReport,
  type PlanView,
} from '../sim/castle';
import { EXTRAS, TROOPS, UNITS, type ExtraId, type TroopType } from '../data/combat';
import { addPost, postProblem, postsAt, removePost } from '../sim/defence';
import { walkLine } from '../sim/site';
import type { SimState } from '../sim/state';
import { reopenPiece } from '../sim/works';
import { inBounds, type TerrainMap } from '../sim/terrain';
import { formatCost, renderLines, statLines, type Line } from './format';

export type ToolId = 'look' | 'wall' | 'tower' | 'gatehouse' | 'keep' | 'raise' | 'lower' | 'remove' | 'extras' | 'troops';

const TOOLS: readonly { id: ToolId; name: string; key: string; help: string }[] = [
  { id: 'look', name: 'Look', key: '1', help: 'Point at land or pieces to see their numbers. Drag to move the view.' },
  { id: 'wall', name: 'Wall', key: '2', help: 'Drag from one tile to another to lay a line of wall.' },
  { id: 'tower', name: 'Tower', key: '3', help: 'Click to place. Placing on a wall turns that wall into a tower.' },
  { id: 'gatehouse', name: 'Gatehouse', key: '4', help: 'Click to place, usually in a wall. R turns the passage.' },
  { id: 'keep', name: 'Keep', key: '5', help: 'Covers 2×2 tiles of level ground. Put it inside the walls.' },
  {
    id: 'raise',
    name: 'Raise',
    key: '6',
    help: 'Click or drag to build tiles up one level; the ground around slopes up with them. Hold Shift for a sheer bank. Uses spoil.',
  },
  {
    id: 'lower',
    name: 'Lower',
    key: '7',
    help: 'Click or drag to dig tiles down one level; the ground around slopes down with them. Hold Shift for a sheer cut, like a ditch. Makes spoil.',
  },
  { id: 'remove', name: 'Remove', key: '8', help: 'Click or drag to remove pieces and earthwork marks.' },
  {
    id: 'extras',
    name: 'Extras',
    key: '9',
    help: 'Click or drag over walls, towers and the gatehouse to add the chosen extra; click again to take it off. Finished pieces go back on the building list for it.',
  },
  {
    id: 'troops',
    name: 'Troops',
    key: '0',
    help: 'Click to post a soldier: archers on walls and towers (or the ground), swordsmen on the ground. Shift-click takes one off. Anyone without a post is placed for you when raiders come.',
  },
];

export type Tile = { x: number; y: number };

/** Something to show in the readout about the last click. */
export interface Notice {
  text: string;
  bad: boolean;
}

/** What the designer needs from the game: the land, the plan, and a way to say the plan changed. */
export interface DesignerHost {
  readonly base: TerrainMap;
  readonly plan: CastlePlan;
  view(): PlanView;
  report(): PlanReport;
  /** The plan changed. `land` lists tiles whose planned height changed, or is 'all'. */
  changed(land: readonly Tile[] | 'all'): void;
  /** How the building of a piece is going, for the readout. */
  buildLines(piece: Piece): Line[];
  /** The whole game, for the garrison's posts and building progress. */
  readonly sim: SimState;
  /** A battle is on: in classic control nothing can be changed until it's over. */
  locked(): boolean;
}

/**
 * The castle designer's tools and panels. Turns clicks into plan changes through the sim's
 * rules, and shows stats and costs before anything is placed. Owns no game state.
 */
export class Designer {
  tool: ToolId = 'look';
  thickness: Thickness = 'standard';
  wallHeight: HeightClass = 'medium';
  towerShape: TowerShape = 'square';
  towerHeight: HeightClass = 'medium';
  extra: ExtraId = 'slits';
  troop: TroopType = 'archer';
  notice: Notice | null = null;

  private hover: Tile | null = null;
  private dragFrom: Tile | null = null;
  private painting = false;
  private painted = new Set<string>();
  private turnGate = false;
  private clearArmed = false;
  /** Shift held: earthworks change just the one tile, leaving a sheer cut. */
  private sheer = false;
  private panelKey = '';

  constructor(
    private readonly host: DesignerHost,
    private readonly toolsEl: HTMLElement,
    private readonly panelEl: HTMLElement,
  ) {
    const shift = (e: KeyboardEvent) => (this.sheer = e.shiftKey);
    window.addEventListener('keyup', shift);
    window.addEventListener('keydown', shift);
    window.addEventListener('keydown', (e) => {
      const tool = TOOLS.find((t) => t.key === e.key);
      if (tool) this.setTool(tool.id);
      else if (e.code === 'KeyR') this.turnGate = !this.turnGate;
      else if (e.code === 'Escape') {
        if (this.dragFrom) this.dragFrom = null;
        else this.setTool('look');
      }
    });
    this.renderTools();
  }

  setTool(id: ToolId): void {
    this.tool = id;
    this.dragFrom = null;
    this.painting = false;
    this.notice = null;
    this.renderTools();
  }

  /** Is a press of this button a designer action (rather than a camera drag)? */
  wantsPress(button: number): boolean {
    return button === 0 && this.tool !== 'look';
  }

  setHover(tile: Tile | null): void {
    const same = tile?.x === this.hover?.x && tile?.y === this.hover?.y;
    this.hover = tile;
    if (same) return;
    this.notice = null;
    if (tile && this.painting) this.paint(tile);
  }

  press(tile: Tile | null): void {
    if (!tile) return;
    this.notice = null;
    if (this.host.locked()) {
      this.notice = { text: 'Nothing can be changed while the battle is on (classic control)', bad: true };
      return;
    }
    switch (this.tool) {
      case 'troops':
        this.post(tile);
        break;
      case 'extras':
        this.painting = true;
        this.painted.clear();
        this.paint(tile);
        break;
      case 'wall':
        this.dragFrom = tile;
        break;
      case 'tower':
      case 'gatehouse':
      case 'keep':
        this.place();
        break;
      case 'raise':
      case 'lower':
      case 'remove':
        this.painting = true;
        this.painted.clear();
        this.paint(tile);
        break;
      case 'look':
        break;
    }
  }

  release(): void {
    if (this.tool === 'wall' && this.dragFrom) {
      this.place();
      this.dragFrom = null;
    }
    this.painting = false;
  }

  /** The pieces the current tool would place right now, checked against the rules. */
  preview(): { specs: PieceSpec[]; check: PlacementCheck } | null {
    const key = JSON.stringify([this.tool, this.hover, this.dragFrom, this.thickness, this.wallHeight, this.towerShape, this.towerHeight, this.turnGate, this.version]);
    if (key !== this.previewKey) {
      this.previewKey = key;
      const specs = this.previewSpecs();
      this.previewCache = specs ? { specs, check: checkPlacement(this.host.base, this.host.plan, specs) } : null;
    }
    return this.previewCache;
  }

  private previewKey = '';
  private previewCache: { specs: PieceSpec[]; check: PlacementCheck } | null = null;
  /** Bumped on every plan change, so cached previews are rechecked. */
  private version = 0;

  private changed(land: readonly Tile[] | 'all'): void {
    this.version++;
    this.host.changed(land);
  }

  private previewSpecs(): PieceSpec[] | null {
    const h = this.hover;
    if (!h) return null;
    const view = this.host.view();
    switch (this.tool) {
      case 'wall': {
        const out: PieceSpec[] = [];
        const from = this.dragFrom ?? h;
        walkLine([from.x, from.y], [h.x, h.y], (x, y) => {
          const there = pieceAt(view, x, y);
          if (there && isCurtain(there.kind)) return; // drawing along existing walls just joins them
          out.push({ kind: 'wall', x, y, thickness: this.thickness, height: this.wallHeight });
        });
        return out;
      }
      case 'tower':
        return [{ kind: 'tower', x: h.x, y: h.y, shape: this.towerShape, height: this.towerHeight }];
      case 'gatehouse':
        return [{ kind: 'gatehouse', x: h.x, y: h.y, axis: this.gateAxis(view, h) }];
      case 'keep':
        return [{ kind: 'keep', x: h.x, y: h.y }];
      default:
        return null;
    }
  }

  /** The passage runs across the wall it sits in; R turns it the other way. */
  private gateAxis(view: PlanView, h: Tile): Axis {
    const curtain = (x: number, y: number) => {
      const p = pieceAt(view, x, y);
      return !!p && isCurtain(p.kind);
    };
    const wallAlongX = curtain(h.x - 1, h.y) || curtain(h.x + 1, h.y);
    const wallAlongY = curtain(h.x, h.y - 1) || curtain(h.x, h.y + 1);
    const axis: Axis = wallAlongX && !wallAlongY ? 'y' : 'x';
    return this.turnGate ? (axis === 'x' ? 'y' : 'x') : axis;
  }

  private place(): void {
    const specs = this.previewSpecs();
    if (!specs || specs.length === 0) return;
    const result = placePieces(this.host.base, this.host.plan, specs);
    if (result.problem) {
      this.notice = { text: `Can't build: ${result.problem}`, bad: true };
      return;
    }
    this.notice = { text: `Placed (${formatCost(result.cost)})`, bad: false };
    this.changed([]);
  }

  private paint(tile: Tile): void {
    const key = `${tile.x},${tile.y}`;
    if (this.painted.has(key) || !inBounds(this.host.base, tile.x, tile.y)) return;
    this.painted.add(key);
    const { base, plan } = this.host;
    if (this.tool === 'extras') {
      const r = toggleExtra(plan, tile.x, tile.y, this.extra);
      if (r.problem) {
        if (this.painted.size === 1) this.notice = { text: r.problem, bad: true };
        return;
      }
      if (r.added && r.piece) reopenPiece(this.host.sim.works, r.piece.id);
      this.notice = { text: `${EXTRAS[this.extra].name} ${r.added ? 'added' : 'taken off'}`, bad: false };
      this.changed([]);
      return;
    }
    if (this.tool === 'remove') {
      if (removePieceAt(plan, tile.x, tile.y)) this.changed([]);
      else if (clearEarthwork(base, plan, tile.x, tile.y)) this.changed([tile]);
      return;
    }
    const result = shapeEarth(base, plan, tile.x, tile.y, this.tool === 'raise' ? 1 : -1, !this.sheer);
    if (result.problem) this.notice = { text: result.problem, bad: true };
    else this.changed(result.changed.map(([x, y]) => ({ x, y })));
  }

  private post(tile: Tile): void {
    const { sim } = this.host;
    if (this.sheer) {
      if (!removePost(sim.defence, tile.x, tile.y, this.troop) && !removePost(sim.defence, tile.x, tile.y))
        this.notice = { text: 'Nobody is posted here', bad: true };
      else this.notice = { text: 'Post taken off', bad: false };
      return;
    }
    const problem = addPost(sim.map, sim.plan, sim.economy, sim.defence, this.troop, tile.x, tile.y);
    this.notice = problem ? { text: problem, bad: true } : { text: `${UNITS[this.troop].name} posted here`, bad: false };
  }

  /** Lines for the readout about the hovered tile: the piece there, or what would happen on click. */
  hoverLines(): Line[] {
    const h = this.hover;
    if (!h) return [];
    const view = this.host.view();
    const lines: Line[] = [];
    const there = pieceAt(view, h.x, h.y);
    if (there && (this.tool === 'look' || this.tool === 'remove' || this.tool === 'extras' || this.tool === 'troops')) {
      lines.push({ text: pieceStats(view, there).name, cls: 'head' }, ...this.host.buildLines(there), ...statLines(pieceStats(view, there)));
      const problem = this.host.report().problems.find((p) => p.piece.id === there.id);
      if (problem) lines.push({ text: problem.text, cls: 'bad' });
    }
    if (this.tool === 'troops') {
      const { sim } = this.host;
      const here = postsAt(sim.defence, h.x, h.y);
      if (here.length > 0)
        lines.push({
          text: `Posted here: ${(['archer', 'swordsman'] as const).map((t) => ({ t, n: here.filter((p) => p.type === t).length })).filter((c) => c.n > 0).map((c) => `${c.n} ${(c.n === 1 ? UNITS[c.t].name : UNITS[c.t].plural).toLowerCase()}`).join(', ')}`,
        });
      if (!this.notice) {
        const problem = postProblem(sim.map, sim.plan, sim.economy, sim.defence, this.troop, h.x, h.y);
        lines.push(problem ? { text: problem, cls: 'bad' } : { text: `Click to post ${this.troop === 'archer' ? 'an archer' : 'a swordsman'} here`, cls: 'good' });
        if (here.length > 0) lines.push({ text: 'Shift-click to take one off', cls: 'dim' });
      }
    }
    if (this.tool === 'extras' && !this.notice && there) {
      const has = !!there[this.extra];
      lines.push({ text: has ? `Click to take off the ${EXTRAS[this.extra].name.toLowerCase()}` : `Click to add ${EXTRAS[this.extra].name.toLowerCase()} (${formatCost(EXTRAS[this.extra].cost)})`, cls: 'good' });
    }
    if (this.notice) lines.push({ text: this.notice.text, cls: this.notice.bad ? 'bad' : 'good' });
    else {
      const p = this.preview();
      if (p && p.specs.length > 0)
        lines.push(p.check.problem ? { text: `Can't build: ${p.check.problem}`, cls: 'bad' } : { text: 'Click to place', cls: 'good' });
    }
    return lines;
  }

  /** Redraw the side panel if anything it shows has changed. */
  updatePanel(): void {
    const report = this.host.report();
    const p = this.preview();
    const key = JSON.stringify([this.tool, this.thickness, this.wallHeight, this.towerShape, this.towerHeight, this.extra, this.troop, this.hover, report, p?.specs, this.clearArmed, this.host.sim.defence.posts.length, this.host.sim.economy.troops]);
    if (key === this.panelKey) return;
    this.panelKey = key;

    const sel = document.createElement('section');
    renderLines(sel, this.selectedLines(p));
    const plan = document.createElement('section');
    renderLines(plan, planLines(report, this.host.plan));
    const clear = button(this.clearArmed ? 'Click again to clear everything' : 'Clear plan', this.clearArmed);
    clear.addEventListener('click', () => {
      if (!this.clearArmed) {
        this.clearArmed = true;
        this.panelKey = '';
        return;
      }
      this.clearArmed = false;
      this.host.plan.pieces = [];
      this.host.plan.earthworks.fill(0);
      this.changed('all');
    });
    plan.append(clear);
    this.panelEl.replaceChildren(sel, plan);
  }

  private selectedLines(p: ReturnType<Designer['preview']>): Line[] {
    const view = this.host.view();
    const tool = TOOLS.find((t) => t.id === this.tool);
    const lines: Line[] = [{ text: tool?.name ?? '', cls: 'head' }, { text: tool?.help ?? '', cls: 'dim' }];
    if (this.tool === 'extras') {
      for (const id of Object.keys(EXTRAS) as ExtraId[])
        lines.push({ text: EXTRAS[id].name, cls: 'head' }, { text: EXTRAS[id].note }, { text: `Cost per piece: ${formatCost(EXTRAS[id].cost)}`, cls: 'dim' });
      return lines;
    }
    if (this.tool === 'troops') {
      const { sim } = this.host;
      for (const t of ['archer', 'swordsman'] as const) {
        const posted = sim.defence.posts.filter((p) => p.type === t).length;
        lines.push(
          { text: UNITS[t].plural, cls: 'head' },
          { text: TROOPS[t].note, cls: 'dim' },
          { text: `${posted} posted · ${sim.economy.troops[t]} in the garrison` },
        );
      }
      lines.push({ text: 'Hire soldiers in the Defence tab.', cls: 'dim' });
      return lines;
    }
    if (this.tool === 'raise' || this.tool === 'lower') {
      const raise = this.tool === 'raise';
      lines.push(
        { text: `Each level: ${raise ? EARTHWORKS.raiseLabour : EARTHWORKS.lowerLabour} worker-days` },
        { text: `${raise ? 'Uses' : 'Makes'} ${EARTHWORKS.spoilPerLevel} cartloads of spoil` },
        { text: 'Rocky ground can be built up but not dug. Water cannot be changed.', cls: 'dim' },
      );
      return lines;
    }
    const sample = p?.specs[0] ?? this.sampleSpec();
    if (!sample) return lines;
    const stats = pieceStats(view, sample);
    lines.push({ text: stats.name, cls: 'head' }, ...statLines(stats));
    const each = pieceCost(this.host.base, sample);
    lines.push({ text: `Cost here: ${formatCost(each)}` });
    if (p && p.specs.length > 1) lines.push({ text: `Whole line (${p.specs.length} tiles): ${formatCost(p.check.cost)}`, cls: 'head' });
    if (!p) lines.push({ text: 'Point at a tile to see the numbers for that spot.', cls: 'dim' });
    return lines;
  }

  /** A piece to show stats for when the pointer isn't over the map. */
  private sampleSpec(): PieceSpec | null {
    const x = Math.floor(this.host.base.width / 2);
    const y = Math.floor(this.host.base.height / 2);
    switch (this.tool) {
      case 'wall':
        return { kind: 'wall', x, y, thickness: this.thickness, height: this.wallHeight };
      case 'tower':
        return { kind: 'tower', x, y, shape: this.towerShape, height: this.towerHeight };
      case 'gatehouse':
        return { kind: 'gatehouse', x, y, axis: 'x' };
      case 'keep':
        return { kind: 'keep', x, y };
      default:
        return null;
    }
  }

  private renderTools(): void {
    const row = document.createElement('div');
    row.className = 'tool-row';
    for (const t of TOOLS) {
      const b = button(`${t.key} ${t.name}`, t.id === this.tool);
      b.addEventListener('click', () => this.setTool(t.id));
      row.append(b);
    }
    const parts: HTMLElement[] = [row];
    if (this.tool === 'wall') {
      parts.push(
        choice('Thickness', WALL_THICKNESS, this.thickness, (v) => (this.thickness = v), this),
        choice('Height', WALL_HEIGHT, this.wallHeight, (v) => (this.wallHeight = v), this),
      );
    } else if (this.tool === 'tower') {
      parts.push(
        choice('Shape', TOWER_SHAPE, this.towerShape, (v) => (this.towerShape = v), this),
        choice('Height', TOWER_HEIGHT, this.towerHeight, (v) => (this.towerHeight = v), this),
      );
    } else if (this.tool === 'extras') {
      parts.push(choice('Extra', EXTRAS, this.extra, (v) => (this.extra = v), this));
    } else if (this.tool === 'troops') {
      parts.push(choice('Post', { archer: UNITS.archer, swordsman: UNITS.swordsman }, this.troop, (v) => (this.troop = v), this));
    }
    this.toolsEl.replaceChildren(...parts);
  }

  /** Called by option buttons. */
  optionsChanged(): void {
    this.renderTools();
  }
}

function planLines(r: PlanReport, plan: CastlePlan): Line[] {
  const count = (k: string) => plan.pieces.filter((p) => p.kind === k).length;
  const tick = (ok: boolean | null, yes: string, no: string): Line => (ok ? { text: `✓ ${yes}`, cls: 'good' } : { text: `✗ ${no}`, cls: 'bad' });
  const e = r.earthworks;
  const lines: Line[] = [
    { text: 'Your plan', cls: 'head' },
    { text: `${count('wall')} wall tiles · ${count('tower')} towers · ${r.gatehouses} gatehouse · ${r.keeps} keep` },
    { text: `Total: ${formatCost(r.cost)}` },
    {
      text:
        e.raised + e.lowered === 0
          ? 'Earthworks: none'
          : `Earthworks: raise ${e.raised}, lower ${e.lowered} (tile-levels) · ${e.labour} worker-days`,
    },
  ];
  if (e.raised + e.lowered > 0)
    lines.push(
      e.spoil >= 0
        ? { text: `Spoil: ${e.spoil} cartloads to spare`, cls: 'good' }
        : { text: `Spoil: short by ${-e.spoil} cartloads (lower more tiles to make it)`, cls: 'warn' },
    );
  lines.push(
    { text: 'Checks', cls: 'head' },
    tick(r.keeps === 1, 'Keep placed', 'Needs a keep'),
    tick(r.gatehouses === 1, 'Gatehouse placed', 'Needs a gatehouse'),
    tick(r.keepEnclosed, 'Keep is enclosed (walls, cliffs or deep water)', r.keeps ? 'Attackers can walk up to the keep' : 'Nothing enclosed yet'),
  );
  if (r.curtainParts > 1) lines.push({ text: `⚠ The walls are in ${r.curtainParts} separate pieces`, cls: 'warn' });
  for (const p of r.problems.slice(0, 4)) lines.push({ text: `✗ ${p.text} (tile ${p.piece.x}, ${p.piece.y})`, cls: 'bad' });
  if (r.problems.length > 4) lines.push({ text: `…and ${r.problems.length - 4} more problems`, cls: 'bad' });
  if (r.ready) lines.push({ text: 'The design is complete. Hire workers in the Workers tab and press Space to start the clock.', cls: 'good' });
  return lines;
}

function button(text: string, active: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  if (active) b.className = 'active';
  return b;
}

function choice<K extends string>(
  label: string,
  options: Record<K, { name: string }>,
  current: K,
  set: (v: K) => void,
  designer: Designer,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'option-row';
  const name = document.createElement('span');
  name.textContent = label;
  row.append(name);
  for (const k of Object.keys(options) as K[]) {
    const b = button(options[k].name, k === current);
    b.addEventListener('click', () => {
      set(k);
      designer.optionsChanged();
    });
    row.append(b);
  }
  return row;
}
