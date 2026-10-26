import { Application, Container, Graphics } from 'pixi.js';
import { CALENDAR } from './data/economy';
import { simConfig } from './data/config';
import { formatDate } from './sim/calendar';
import { pieceAt, pieceLevels, planReport, viewPlan, type Piece, type PlanReport, type PlanView } from './sim/castle';
import { FixedStepLoop } from './sim/loop';
import { createSim, stepSim, today, type SimState } from './sim/state';
import { inBounds } from './sim/terrain';
import { pieceProgress, summariseWorks, type WorksSummary } from './sim/works';
import { ProceduralAssets } from './render/assets';
import { Camera } from './render/camera';
import { CastleArt, pickPiece } from './render/castleArt';
import { isoToScreen } from './render/iso';
import { buildTileShape, buildTileShapes, pickTile, surfaceLevel, type TileShape } from './render/tileGeometry';
import { TerrainView } from './render/terrainView';
import { drawWorkers } from './render/workersArt';
import { CameraInput } from './ui/cameraInput';
import { Designer, type Tile } from './ui/designer';
import type { Line } from './ui/format';
import { GamePanel, storeGame } from './ui/gamePanel';
import type { GameHost } from './ui/host';
import { Hud } from './ui/hud';
import { ReportsPanel } from './ui/reportsPanel';
import { Tabs } from './ui/tabs';
import { TopBar } from './ui/topBar';
import { WorkersPanel } from './ui/workersPanel';
import { WorksPanel } from './ui/worksPanel';

async function start(): Promise<void> {
  const host = document.getElementById('app');
  const topEl = document.getElementById('topbar');
  const readoutEl = document.getElementById('readout');
  const toolsEl = document.getElementById('tools');
  const panelEl = document.getElementById('panel');
  if (!host || !topEl || !readoutEl || !toolsEl || !panelEl) throw new Error('Missing page elements');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1b1f24, antialias: true });
  host.appendChild(app.canvas);

  // ?seed=123 in the URL reproduces a specific run.
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : simConfig.defaultSeed;
  let sim: SimState = createSim(seed);
  let speed = 0;
  let summary: WorksSummary = summariseWorks(sim.map, sim.plan, sim.economy, sim.works, 0);

  // Changes reported by the sim since the last frame.
  const pending = { land: new Set<number>(), pieces: false, newDay: false, newMonth: false };
  const loop = new FixedStepLoop(1000 / simConfig.ticksPerSecond, () => {
    for (let i = 0; i < speed; i++) {
      const e = stepSim(sim);
      for (const t of e.land) pending.land.add(t);
      pending.pieces ||= e.pieces;
      pending.newDay ||= e.newDay;
      pending.newMonth ||= e.newMonth;
    }
  });

  // The land is drawn as it is now, or as planned (after earthworks) while shaping it or with V.
  let view: PlanView = viewPlan(sim.map, sim.plan);
  let report: PlanReport = planReport(sim.map, view);
  let forcePlanned = false;
  let showPlanned = false;
  const shownMap = () => (showPlanned ? view.map : sim.map);
  const shownView = (): PlanView => ({ ...view, map: shownMap() });
  let shapes = buildTileShapes(shownMap());
  const shapeIndex = (list: readonly TileShape[]) => {
    const out: TileShape[] = [];
    for (const s of list) out[s.y * sim.map.width + s.x] = s;
    return out;
  };
  let shapeAt = shapeIndex(shapes);
  const art = new CastleArt(shownView());
  art.setShapes((x, y) => shapeAt[y * sim.map.width + x]);
  art.setProgress((p) => pieceProgress(sim.map, sim.works, p));
  const terrain = new TerrainView(shownMap(), shapes, new ProceduralAssets(app.renderer), art);
  const ghosts = new Graphics();
  const world = new Container();
  world.addChild(terrain.root, ghosts);
  app.stage.addChild(world);

  /** Something changed: rebuild the plan snapshot and redraw what's needed. `land` lists tiles whose drawn height may have changed. */
  const refresh = (land: readonly Tile[] | 'all') => {
    view = viewPlan(sim.map, sim.plan);
    report = planReport(sim.map, view);
    art.setView(shownView(), new Set(report.problems.map((p) => p.piece.id)));
    if (land === 'all') {
      shapes = buildTileShapes(shownMap());
      shapeAt = shapeIndex(shapes);
      terrain.setLand(shownMap(), shapes);
    } else if (land.length > 0) {
      // A tile's shape depends on its neighbours' heights out to two tiles away.
      const rows = new Set<number>();
      const list = [...shapes];
      const map = shownMap();
      for (const t of land)
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const x = t.x + dx;
            const y = t.y + dy;
            const i = y * sim.map.width + x;
            const old = shapeAt[i];
            if (!old || !inBounds(map, x, y)) continue;
            const fresh = buildTileShape(map, x, y);
            list[shapes.indexOf(old)] = fresh;
            shapeAt[i] = fresh;
            rows.add(x + y);
          }
      shapes = list;
      terrain.updateRows(map, shapes, rows);
    } else {
      terrain.redrawExtras();
    }
  };

  const tabs = new Tabs(
    panelEl,
    [
      { id: 'plan', name: 'Plan' },
      { id: 'works', name: 'Building' },
      { id: 'workers', name: 'Workers' },
      { id: 'reports', name: 'Reports' },
      { id: 'game', name: 'Game' },
    ] as const,
    'plan',
  );
  const designer = new Designer(
    {
      get base() {
        return sim.map;
      },
      get plan() {
        return sim.plan;
      },
      view: () => view,
      report: () => report,
      changed(land) {
        refresh(land);
        summary = summariseWorks(sim.map, sim.plan, sim.economy, sim.works, today(sim));
      },
      buildLines: (p) => buildLines(p),
    },
    toolsEl,
    tabs.pages.plan,
  );

  const game: GameHost = {
    get sim() {
      return sim;
    },
    get summary() {
      return summary;
    },
    get speed() {
      return speed;
    },
    setSpeed(s) {
      speed = s;
    },
    load(state) {
      sim = state;
      restart();
    },
    newGame() {
      sim = createSim(seed);
      restart();
    },
  };
  const restart = () => {
    speed = 0;
    summary = summariseWorks(sim.map, sim.plan, sim.economy, sim.works, today(sim));
    refresh('all');
  };

  const topBar = new TopBar(topEl, game);
  const workersPanel = new WorkersPanel(tabs.pages.workers, game);
  const worksPanel = new WorksPanel(tabs.pages.works, game);
  const reportsPanel = new ReportsPanel(tabs.pages.reports, game);
  const gamePanel = new GamePanel(tabs.pages.game, game);

  /** Readout lines about how the building of a piece is going. */
  function buildLines(p: Piece): Line[] {
    const progress = pieceProgress(sim.map, sim.works, p);
    if (progress >= 1) return [{ text: 'Built', cls: 'good' }];
    const est = summary.jobs.find((j) => j.job.key === `p${p.id}`);
    const lines: Line[] = [
      { text: progress > 0 ? `Being built: ${Math.round(progress * 100)}%` : 'Planned, not started', cls: progress > 0 ? 'warn' : 'dim' },
    ];
    if (est?.status) lines.push({ text: est.status, cls: 'bad' });
    else if (est?.finish != null) lines.push({ text: `Should be done about ${formatDate(est.finish)}`, cls: 'dim' });
    return lines;
  }

  const minX = Math.min(...shapes.map((s) => s.minX));
  const minY = Math.min(...shapes.map((s) => s.minY));
  const maxX = Math.max(...shapes.map((s) => s.maxX));
  const maxY = Math.max(...shapes.map((s) => s.maxY));
  // Allow zooming out until the whole site fits, but no further.
  const fit = Math.min(app.screen.width / (maxX - minX), app.screen.height / (maxY - minY)) * 0.95;
  const camera = new Camera(Math.min(0.3, fit), 3);
  camera.setBounds(minX, minY, maxX, maxY);
  const home = () => {
    camera.zoom = Math.max(camera.minZoom, Math.min(0.75, fit * 1.6));
    camera.centreOn((minX + maxX) / 2, (minY + maxY) / 2);
  };
  home();

  const input = new CameraInput(app.canvas, camera, {
    onHome: home,
    onToggleGrid: () => terrain.setGrid(!terrain.gridVisible),
    canPan: (e) => !designer.wantsPress(e.button),
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') forcePlanned = !forcePlanned;
  });
  const hud = new Hud(readoutEl);

  let hovered: TileShape | null = null;
  app.canvas.addEventListener('pointerdown', (e) => {
    if (!designer.wantsPress(e.button)) return;
    app.canvas.setPointerCapture(e.pointerId);
    designer.press(hovered);
  });
  const release = () => designer.release();
  app.canvas.addEventListener('pointerup', release);
  app.canvas.addEventListener('pointercancel', release);

  /** Height of the drawn ground at any point, for standing figures on it. */
  const ground = (x: number, y: number) => {
    const tx = Math.round(x);
    const ty = Math.round(y);
    const s = shapeAt[ty * sim.map.width + tx];
    return s ? surfaceLevel(s.corners, x - tx, y - ty) : 0;
  };

  if (import.meta.env.DEV) {
    // For automated screenshots in development: where a tile's centre is on screen, and a fast-forward.
    (window as unknown as Record<string, unknown>).__marchward = {
      tileToScreen(x: number, y: number) {
        const s = shapeAt[y * sim.map.width + x];
        if (!s) return null;
        const c = s.corners;
        const piece = pieceAt(view, x, y);
        const p = isoToScreen(x, y, (c.n + c.e + c.s + c.w) / 4 + (piece ? pieceLevels(piece) : 0));
        return camera.worldToScreen(p.sx, p.sy, app.screen.width, app.screen.height);
      },
      days(n: number) {
        for (let i = 0; i < n * CALENDAR.ticksPerDay; i++) {
          const e = stepSim(sim);
          for (const t of e.land) pending.land.add(t);
          pending.pieces ||= e.pieces;
          pending.newDay ||= e.newDay;
        }
      },
      camera,
      game,
      get sim() {
        return sim;
      },
    };
  }

  let ghostKey = '';
  app.ticker.add((ticker) => {
    loop.advance(ticker.deltaMS);
    input.update(ticker.deltaMS);

    // Switch between the land now and as planned.
    const wantPlanned = forcePlanned || designer.tool === 'raise' || designer.tool === 'lower';
    if (wantPlanned !== showPlanned) {
      showPlanned = wantPlanned;
      refresh('all');
    }
    if (pending.land.size > 0) {
      refresh([...pending.land].map((i) => ({ x: i % sim.map.width, y: Math.floor(i / sim.map.width) })));
      pending.land.clear();
      pending.pieces = false;
    } else if (pending.pieces) {
      refresh([]);
      pending.pieces = false;
    }
    if (pending.newDay) {
      summary = summariseWorks(sim.map, sim.plan, sim.economy, sim.works, today(sim));
      pending.newDay = false;
    }
    if (pending.newMonth) {
      storeGame('autosave', sim);
      gamePanel.refresh();
      pending.newMonth = false;
    }

    const w = app.screen.width;
    const h = app.screen.height;
    world.scale.set(camera.zoom);
    world.position.set(w / 2 - camera.x * camera.zoom, h / 2 - camera.y * camera.zoom);

    const p = input.pointer;
    const wp = p ? camera.screenToWorld(p.x, p.y, w, h) : null;
    const groundTile = wp ? pickTile(shapes, wp.x, wp.y) : null;
    // Pointing at a wall or tower means that piece's tile, not the ground behind it.
    const piece =
      wp && groundTile && designer.tool !== 'raise' && designer.tool !== 'lower'
        ? pickPiece(shownView(), wp.x, wp.y, groundTile.x + groundTile.y)
        : null;
    const next = piece ? (shapeAt[piece.y * sim.map.width + piece.x] ?? groundTile) : groundTile;
    if (next !== hovered) {
      hovered = next;
      terrain.setHover(hovered);
    }
    designer.setHover(hovered ? { x: hovered.x, y: hovered.y } : null);

    const preview = designer.preview();
    const key = JSON.stringify([preview?.specs, preview?.check.problems, sim.plan.pieces.length, report.cost, showPlanned]);
    if (key !== ghostKey) {
      ghostKey = key;
      ghosts.clear();
      if (preview) {
        art.previewTiles = new Set(preview.specs.map((s) => `${s.x},${s.y}`));
        art.drawGhosts(ghosts, preview.specs, preview.check.problems);
      }
    }

    terrain.clearActors();
    drawWorkers({ layer: (d) => terrain.actorsFor(d), ground }, sim, performance.now());

    hud.update(sim, view.map, hovered, designer.hoverLines());
    topBar.update();
    switch (tabs.active) {
      case 'plan':
        designer.updatePanel();
        break;
      case 'works':
        worksPanel.update();
        break;
      case 'workers':
        workersPanel.update();
        break;
      case 'reports':
        reportsPanel.update();
        break;
    }
  });
}

start().catch((err: unknown) => {
  document.body.textContent = `Failed to start: ${String(err)}`;
});
