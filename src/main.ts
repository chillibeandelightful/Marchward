import '@fontsource/pixelify-sans/400.css';
import { Application, Container, Graphics } from 'pixi.js';
import { CALENDAR } from './data/economy';
import { simConfig } from './data/config';
import { formatDate } from './sim/calendar';
import { pieceAt, pieceLevels, planReport, viewPlan, type Piece, type PlanReport, type PlanView } from './sim/castle';
import { FixedStepLoop } from './sim/loop';
import { deploying } from './sim/battle';
import { createSim, raidNow, stepSim, today, type SimState, type TickEvents } from './sim/state';
import { findPath, landCost } from './sim/path';
import { footprint } from './sim/castle';
import { inBounds } from './sim/terrain';
import { drawBattle } from './render/battleArt';
import { DefencePanel } from './ui/defencePanel';
import { ReportView } from './ui/reportView';
import { pieceProgress, summariseWorks, type WorksSummary } from './sim/works';
import { ProceduralAssets } from './render/assets';
import { Backdrop } from './render/backdrop';
import { ScreenEffect } from './render/screenEffect';
import { setStyle, STYLE_ORDER, style } from './render/styles';
import { buildPalette } from './render/styles/palette';
import { ClassicFrame } from './ui/classicFrame';
import { loadLook, storeLook, type Look } from './ui/look';
import { Camera } from './render/camera';
import { CastleArt, pickPiece } from './render/castleArt';
import { drawnLevels, isoToScreen, setViewAngle, setViewTuning, viewAngle, VIEW_ORDER } from './render/iso';
import { loadTuning, TunePanel } from './ui/tunePanel';
import { buildTileShape, buildTileShapes, pickTile, surfaceLevel, type TileShape } from './render/tileGeometry';
import { TerrainView } from './render/terrainView';
import { isoToTile, pickPlanTile, PLAN_TILE, planToTile, tileToIso, tileToPlan, wantsTopDown } from './render/topDown';
import { TopDownView } from './render/topDownView';
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

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

async function start(): Promise<void> {
  const host = document.getElementById('app');
  const topEl = document.getElementById('topbar');
  const readoutEl = document.getElementById('readout');
  const toolsEl = document.getElementById('tools');
  const panelEl = document.getElementById('panel');
  const reportEl = document.getElementById('report');
  if (!host || !topEl || !readoutEl || !toolsEl || !panelEl || !reportEl) throw new Error('Missing page elements');

  // The look is chosen before anything is drawn, so the land is built once in the right style.
  let look: Look = loadLook();
  setStyle(look.style);
  const tuning = loadTuning();
  setViewTuning(tuning);
  setViewAngle(look.view);
  document.body.classList.toggle('classic', style().ui === 'classic');

  const app = new Application();
  await app.init({ resizeTo: host, background: style().background, antialias: true, preference: 'webgl' });
  host.appendChild(app.canvas);

  // ?seed=123 in the URL reproduces a specific run.
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : simConfig.defaultSeed;
  let sim: SimState = createSim(seed);
  let speed = 0;
  let summary: WorksSummary = summariseWorks(sim.map, sim.plan, sim.economy, sim.works, 0);

  // Changes reported by the sim since the last frame.
  const pending = { land: new Set<number>(), pieces: false, newDay: false, newMonth: false, battleStarted: false, battleEnded: false };
  const note = (e: TickEvents) => {
    for (const t of e.land) pending.land.add(t);
    pending.pieces ||= e.pieces;
    pending.newDay ||= e.newDay;
    pending.newMonth ||= e.newMonth;
    pending.battleStarted ||= e.battleStarted;
    pending.battleEnded ||= e.battleEnded;
    return e;
  };
  const loop = new FixedStepLoop(1000 / simConfig.ticksPerSecond, () => {
    for (let i = 0; i < speed; i++) {
      const e = note(stepSim(sim));
      // Stop at the start and end of a battle, so neither goes by unseen.
      if (e.battleStarted || e.battleEnded) {
        speed = 0;
        break;
      }
    }
  });

  // The land is drawn as it is now, or as planned (after earthworks) while shaping it or with V.
  let view: PlanView = viewPlan(sim.map, sim.plan);
  let report: PlanReport = planReport(sim.map, view);
  let forcePlanned = false;
  let showPlanned = false;
  const shownMap = () => (showPlanned ? view.map : sim.map);
  const shownView = (): PlanView => ({ ...view, map: shownMap() });
  let shapes = buildTileShapes(shownMap(), view.occupant);
  const shapeIndex = (list: readonly TileShape[]) => {
    const out: TileShape[] = [];
    for (const s of list) out[s.y * sim.map.width + s.x] = s;
    return out;
  };
  let shapeAt = shapeIndex(shapes);
  const art = new CastleArt(shownView());
  art.setShapes((x, y) => shapeAt[y * sim.map.width + x]);
  art.setProgress((p) => pieceProgress(sim.map, sim.works, p));
  art.setRubble((p) => (sim.defence.battle?.pieces[p.id]?.breachedAt ?? null) !== null);
  const terrain = new TerrainView(shownMap(), shapes, new ProceduralAssets(app.renderer), art);
  const ghosts = new Graphics();
  // Smoke rises over everything on the land, so it is drawn above all the rows.
  const sky = new Graphics();
  const world = new Container();
  world.addChild(terrain.root, sky, ghosts);
  const backdrop = new Backdrop();
  const scene = new Container();
  scene.addChild(backdrop.root, world, backdrop.front);
  const effect = new ScreenEffect(app.renderer, app.stage, scene);
  effect.details = () => [...terrain.detailLayers(), sky, ghosts];
  // The flat plan, shown instead of the isometric world (and its backdrop) while placing pieces or troops.
  const plan = new TopDownView();
  plan.root.visible = false;
  let planDirty = true;
  scene.addChild(plan.root);

  /** Something changed: rebuild the plan snapshot and redraw what's needed. `land` lists tiles whose drawn height may have changed. */
  const refresh = (asked: readonly Tile[] | 'all') => {
    routes.clear();
    planDirty = true;
    const before = view.occupant;
    view = viewPlan(sim.map, sim.plan);
    // The ground is drawn flat under pieces, so tiles where a piece came or went are redrawn too.
    let land = asked;
    if (land !== 'all') {
      const moved: Tile[] = [];
      for (let i = 0; i < before.length; i++) if (!before[i] !== !view.occupant[i]) moved.push({ x: i % sim.map.width, y: Math.floor(i / sim.map.width) });
      if (moved.length > 0) land = [...land, ...moved];
    }
    report = planReport(sim.map, view);
    art.setView(shownView(), new Set(report.problems.map((p) => p.piece.id)));
    if (land === 'all') {
      shapes = buildTileShapes(shownMap(), view.occupant);
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
            const fresh = buildTileShape(map, x, y, view.occupant);
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
      { id: 'defence', name: 'Defence' },
      { id: 'reports', name: 'Reports' },
      { id: 'game', name: 'Game' },
    ] as const,
    'plan',
  );
  const battlePhase = () => (sim.defence.battle ? (deploying(sim.defence.battle) ? 'deploy' : 'fight') : null);
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
      get sim() {
        return sim;
      },
      locked: () => battlePhase(),
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
  const gamePanel = new GamePanel(tabs.pages.game, game, {
    get look() {
      return look;
    },
    setLook: (l) => applyLook(l),
  });
  const frame = new ClassicFrame(tabs, panelEl);
  const palettes = new Map<string, number[]>();
  /** The limited palette for the active style's screen effect, worked out once per style. */
  const palette = () => {
    const s = style();
    let p = palettes.get(s.id);
    if (!p) {
      p = s.retro ? buildPalette(s) : [];
      palettes.set(s.id, p);
    }
    return p;
  };

  /** Change the view angle with `change`, redraw the land at it and keep the same spot of land in the middle of the screen. */
  function reangle(change: () => void): void {
    const t = topDown ? null : isoToTile(camera.x, camera.y);
    change();
    refresh('all');
    frameLand();
    if (t) {
      const p = tileToIso(t.x, t.y);
      camera.centreOn(p.x, p.y);
    }
    ghostKey = '';
    terrain.setHover(hovered);
  }

  /** Switch style, view angle or effect strength: everything is redrawn in the new look at once, without reloading. */
  function applyLook(next: Look): void {
    const restyled = next.style !== look.style;
    const turned = next.view !== look.view;
    look = next;
    storeLook(look);
    setStyle(look.style);
    if (turned) {
      reangle(() => setViewAngle(look.view));
      tunePanel.show();
    }
    const s = style();
    document.body.classList.toggle('classic', s.ui === 'classic');
    app.renderer.background.color = s.background;
    effect.configure(s.retro, look.pixel, look.dither, look.surfaces, palette());
    gamePanel.showLook();
    if (!restyled) return;
    frame.relayout();
    if (s.ui !== 'classic') toolsEl?.style.removeProperty('top');
    app.resize();
    refresh('all');
    ghostKey = '';
    terrain.setHover(hovered);
  }

  const tunePanel = new TunePanel(tuning, (t) => reangle(() => setViewTuning(t)));
  const reportView = new ReportView(reportEl);
  const defencePanel = new DefencePanel(tabs.pages.defence, game, {
    postTroops: () => designer.setTool('troops'),
    raidNow: () => note(raidNow(sim)),
    showReport: (r) => reportView.show(r),
  });

  /** Readout lines about how the building of a piece is going. */
  function buildLines(p: Piece): Line[] {
    const pc = sim.defence.battle?.pieces[p.id];
    if (pc) {
      if (pc.breachedAt !== null) return [{ text: `Breached ${Math.round(pc.breachedAt)} seconds into the battle`, cls: 'bad' }];
      if (!pc.standing) return [{ text: 'Not yet half built: raiders walk straight over it', cls: 'bad' }];
      return [
        { text: `Holding: ${Math.round(pc.hp)} of ${pc.max} HP`, cls: pc.hp < pc.max * 0.5 ? 'bad' : pc.hp < pc.max ? 'warn' : 'good' },
        { text: plural(sim.defence.battle?.units.filter((u) => u.on === p.id).length ?? 0, 'archer', 'archers') + ' on it', cls: 'dim' },
      ];
    }
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

  // Lay out the Classic frame now, so the view fits the map area it leaves.
  if (style().ui === 'classic') {
    topBar.update();
    frame.update(sim, topEl.getBoundingClientRect().bottom);
    app.resize();
  }
  effect.configure(style().retro, look.pixel, look.dither, look.surfaces, palette());

  // The site's extent on screen at the current view angle, worked out again when the angle changes.
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let fit = 1;
  const camera = new Camera(0.3, 3);
  function frameLand(): void {
    minX = Math.min(...shapes.map((s) => s.minX));
    minY = Math.min(...shapes.map((s) => s.minY));
    maxX = Math.max(...shapes.map((s) => s.maxX));
    maxY = Math.max(...shapes.map((s) => s.maxY));
    // Allow zooming out until the whole site fits, but no further.
    fit = Math.min(app.screen.width / (maxX - minX), app.screen.height / (maxY - minY)) * 0.95;
    camera.minZoom = Math.min(0.3, fit);
    camera.zoom = Math.max(camera.zoom, camera.minZoom);
    if (!topDown) camera.setBounds(minX, minY, maxX, maxY);
  }
  const home = () => {
    camera.zoom = Math.max(camera.minZoom, Math.min(0.75, fit * 1.6) * viewAngle().homeCloser);
    if (topDown) camera.centreOn((sim.map.width * PLAN_TILE) / 2, (sim.map.height * PLAN_TILE) / 2);
    else camera.centreOn((minX + maxX) / 2, (minY + maxY) / 2);
  };
  /** Showing the flat plan rather than the isometric view. T turns this off and on for the placing tools. */
  let topDown = false;
  frameLand();
  let topDownAllowed = true;
  /** Switch views, keeping the same spot of land in the middle of the screen. */
  const setTopDown = (on: boolean) => {
    if (on === topDown) return;
    topDown = on;
    world.visible = !on;
    backdrop.root.visible = !on;
    backdrop.front.visible = !on;
    plan.root.visible = on;
    if (on) {
      const t = isoToTile(camera.x, camera.y);
      const p = tileToPlan(t.x, t.y);
      camera.setBounds(0, 0, sim.map.width * PLAN_TILE, sim.map.height * PLAN_TILE);
      camera.centreOn(p.x, p.y);
    } else {
      const t = planToTile(camera.x, camera.y);
      const p = tileToIso(t.x, t.y);
      camera.setBounds(minX, minY, maxX, maxY);
      camera.centreOn(p.x, p.y);
    }
  };
  home();

  const input = new CameraInput(app.canvas, camera, {
    onHome: home,
    onToggleGrid: () => {
      terrain.setGrid(!terrain.gridVisible);
      plan.setGrid(terrain.gridVisible);
      planDirty = true;
    },
    canPan: (e) => !designer.wantsPress(e.button),
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') forcePlanned = !forcePlanned;
    else if (e.code === 'KeyT') topDownAllowed = !topDownAllowed;
    else if (e.code === 'Backquote') tunePanel.toggle();
    else if (e.code === 'KeyH') applyLook({ ...look, view: VIEW_ORDER[(VIEW_ORDER.indexOf(look.view) + 1) % VIEW_ORDER.length] ?? 'standard' });
    else if (e.code === 'KeyL') applyLook({ ...look, style: STYLE_ORDER[(STYLE_ORDER.indexOf(look.style) + 1) % STYLE_ORDER.length] ?? 'modern' });
  });
  window.addEventListener('resize', () => frame.relayout());
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

  /** Routes for carts, round walls and water; worked out once per plan change. */
  const routes = new Map<string, [number, number][] | null>();
  const route = (from: readonly [number, number], to: readonly [number, number]) => {
    const key = `${from[0]},${from[1]}>${to[0]},${to[1]}`;
    const cached = routes.get(key);
    if (cached !== undefined) return cached;
    const { map, plan } = sim;
    const w = map.width;
    const blocked = new Uint8Array(w * map.height);
    for (const p of plan.pieces)
      if (p.kind !== 'gatehouse' && pieceProgress(map, sim.works, p) >= 0.5) for (const [x, y] of footprint(p)) blocked[y * w + x] = 1;
    const goal = (i: number) => Math.abs((i % w) - to[0]) + Math.abs(Math.floor(i / w) - to[1]) <= 1 && !blocked[i];
    const path = inBounds(map, from[0], from[1])
      ? findPath(map, from[1] * w + from[0], goal, to, (a, b) => (blocked[b] ? null : landCost(map, a, b)), 400)
      : null;
    const out = path ? path.map((i): [number, number] => [i % w, Math.floor(i / w)]) : null;
    routes.set(key, out);
    return out;
  };

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
        if (topDown) {
          const q = tileToPlan(x, y);
          return camera.worldToScreen(q.x, q.y, app.screen.width, app.screen.height);
        }
        const c = s.corners;
        const piece = pieceAt(view, x, y);
        const p = isoToScreen(x, y, (c.n + c.e + c.s + c.w) / 4 + (piece ? drawnLevels(pieceLevels(piece), piece.kind) : 0));
        return camera.worldToScreen(p.sx, p.sy, app.screen.width, app.screen.height);
      },
      days(n: number) {
        for (let i = 0; i < n * CALENDAR.ticksPerDay; i++) note(stepSim(sim));
      },
      ticks(n: number) {
        for (let i = 0; i < n; i++) note(stepSim(sim));
      },
      raidNow() {
        note(raidNow(sim));
      },
      camera,
      game,
      get topDown() {
        return topDown;
      },
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
    if (pending.battleStarted) {
      pending.battleStarted = false;
      speed = 0;
      tabs.show('defence');
      refresh([]);
    }
    if (pending.battleEnded) {
      pending.battleEnded = false;
      speed = 0;
      summary = summariseWorks(sim.map, sim.plan, sim.economy, sim.works, today(sim));
      refresh([]);
      const last = sim.defence.reports[sim.defence.reports.length - 1];
      if (last) reportView.show(last);
    }

    setTopDown(topDownAllowed && wantsTopDown(designer.tool, battlePhase()));
    if (topDown && planDirty) {
      planDirty = false;
      plan.setLand(shownMap());
      plan.setPieces(
        shownView(),
        new Set(report.problems.map((p) => p.piece.id)),
        (p) => pieceProgress(sim.map, sim.works, p),
        (p) => (sim.defence.battle?.pieces[p.id]?.breachedAt ?? null) !== null,
      );
    }

    const w = app.screen.width;
    const h = app.screen.height;
    for (const c of [world, plan.root]) {
      c.scale.set(camera.zoom);
      c.position.set(w / 2 - camera.x * camera.zoom, h / 2 - camera.y * camera.zoom);
    }

    const p = input.pointer;
    const wp = p ? camera.screenToWorld(p.x, p.y, w, h) : null;
    let next: TileShape | null;
    if (topDown) {
      // From straight above, the tile under the pointer is the one meant: nothing hides it.
      const t = wp ? pickPlanTile(sim.map.width, sim.map.height, wp.x, wp.y) : null;
      next = t ? (shapeAt[t.y * sim.map.width + t.x] ?? null) : null;
    } else {
      // Nothing on the land can be pointed at through the High view sky.
      const groundTile = wp && p && !backdrop.covers(p.y) ? pickTile(shapes, wp.x, wp.y) : null;
      // Pointing at a wall or tower means that piece's tile, not the ground behind it.
      const piece =
        wp && groundTile && designer.tool !== 'raise' && designer.tool !== 'lower'
          ? pickPiece(shownView(), wp.x, wp.y, groundTile.x + groundTile.y)
          : null;
      next = piece ? (shapeAt[piece.y * sim.map.width + piece.x] ?? groundTile) : groundTile;
    }
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

    if (topDown) {
      const battle = sim.defence.battle;
      plan.setOverlay(
        {
          hover: hovered ? { x: hovered.x, y: hovered.y } : null,
          ghosts: preview ? { specs: preview.specs, problems: preview.check.problems } : null,
          posts: sim.defence.posts,
          battle: battle && deploying(battle) ? battle : null,
          camp: sim.camp,
        },
        shownMap(),
      );
    }

    terrain.clearActors();
    sky.clear();
    const actors = { layer: (d: number) => terrain.actorsFor(d), ground, route };
    drawWorkers(actors, sim, performance.now());
    drawBattle(actors, sim, loop.alpha, performance.now(), sky);

    hud.update(sim, view.map, hovered, designer.hoverLines());
    topBar.update();
    if (style().ui === 'classic') {
      // The frame sits under the top bar; the tools are placed by the page's CSS inside the map.
      if (frame.update(sim, topEl.getBoundingClientRect().bottom)) app.resize();
    } else {
      // Keep the tools clear of the top bar, which grows a line when raiders are about.
      const toolsTop = `${Math.round(topEl.getBoundingClientRect().bottom + 8)}px`;
      if (toolsEl.style.top !== toolsTop) toolsEl.style.top = toolsTop;
    }
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
      case 'defence':
        defencePanel.update();
        break;
      case 'reports':
        reportsPanel.update();
        break;
    }

    // The land beyond the map: its horizon sits a little below the site's far corner, so hills show
    // behind its back edges, and they drift as the view pans.
    const far = camera.worldToScreen(isoToScreen(0, 0, 0).sx, minY, w, h);
    backdrop.update(w, h, far.y + (maxY - minY) * camera.zoom * 0.18, camera.x * camera.zoom * 0.2, viewAngle().sky, viewAngle().haze);
    effect.render(w, h);
  });
}

start().catch((err: unknown) => {
  document.body.textContent = `Failed to start: ${String(err)}`;
});
