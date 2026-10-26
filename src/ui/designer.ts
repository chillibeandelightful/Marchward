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
  adjustEarthwork,
  checkPlacement,
  clearEarthwork,
  isCurtain,
  pieceAt,
  pieceCost,
  pieceStats,
  placePieces,
  removePieceAt,
  type Axis,
  type CastlePlan,
  type PieceSpec,
  type PlacementCheck,
  type PlanReport,
  type PlanView,
} from '../sim/castle';
import { walkLine } from '../sim/site';
import { inBounds, type TerrainMap } from '../sim/terrain';
import { formatCost, renderLines, statLines, type Line } from './format';

export type ToolId = 'look' | 'wall' | 'tower' | 'gatehouse' | 'keep' | 'raise' | 'lower' | 'remove';

const TOOLS: readonly { id: ToolId; name: string; key: string; help: string }[] = [
  { id: 'look', name: 'Look', key: '1', help: 'Point at land or pieces to see their numbers. Drag to move the view.' },
  { id: 'wall', name: 'Wall', key: '2', help: 'Drag from one tile to another to lay a line of wall.' },
  { id: 'tower', name: 'Tower', key: '3', help: 'Click to place. Placing on a wall turns that wall into a tower.' },
  { id: 'gatehouse', name: 'Gatehouse', key: '4', help: 'Click to place, usually in a wall. R turns the passage.' },
  { id: 'keep', name: 'Keep', key: '5', help: 'Covers 2×2 tiles of level ground. Put it inside the walls.' },
  { id: 'raise', name: 'Raise', key: '6', help: 'Click or drag to mark tiles to build up one level. Uses spoil.' },
  { id: 'lower', name: 'Lower', key: '7', help: 'Click or drag to mark tiles to dig down one level. Makes spoil.' },
  { id: 'remove', name: 'Remove', key: '8', help: 'Click or drag to remove pieces and earthwork marks.' },
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
  notice: Notice | null = null;

  private hover: Tile | null = null;
  private dragFrom: Tile | null = null;
  private painting = false;
  private painted = new Set<string>();
  private turnGate = false;
  private clearArmed = false;
  private panelKey = '';

  constructor(
    private readonly host: DesignerHost,
    private readonly toolsEl: HTMLElement,
    private readonly panelEl: HTMLElement,
  ) {
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
    switch (this.tool) {
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
    if (this.tool === 'remove') {
      if (removePieceAt(plan, tile.x, tile.y)) this.changed([]);
      else if (clearEarthwork(base, plan, tile.x, tile.y)) this.changed([tile]);
      return;
    }
    const problem = adjustEarthwork(base, plan, tile.x, tile.y, this.tool === 'raise' ? 1 : -1);
    if (problem) this.notice = { text: problem, bad: true };
    else this.changed([tile]);
  }

  /** Lines for the readout about the hovered tile: the piece there, or what would happen on click. */
  hoverLines(): Line[] {
    const h = this.hover;
    if (!h) return [];
    const view = this.host.view();
    const lines: Line[] = [];
    const there = pieceAt(view, h.x, h.y);
    if (there && (this.tool === 'look' || this.tool === 'remove')) {
      lines.push({ text: pieceStats(view, there).name, cls: 'head' }, ...statLines(pieceStats(view, there)));
      const problem = this.host.report().problems.find((p) => p.piece.id === there.id);
      if (problem) lines.push({ text: problem.text, cls: 'bad' });
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
    const key = JSON.stringify([this.tool, this.thickness, this.wallHeight, this.towerShape, this.towerHeight, this.hover, report, p?.specs, this.clearArmed]);
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
  if (r.ready) lines.push({ text: 'The design is complete. Building it comes next milestone.', cls: 'good' });
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
