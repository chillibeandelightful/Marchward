import { Application } from 'pixi.js';
import { simConfig } from './data/testScene';
import { FixedStepLoop } from './sim/loop';
import { createSim, stepSim } from './sim/state';
import { isoToScreen } from './render/iso';
import { TestSceneView } from './render/scene';
import { Hud } from './ui/hud';

async function start(): Promise<void> {
  const host = document.getElementById('app');
  const hudEl = document.getElementById('hud');
  if (!host || !hudEl) throw new Error('Missing #app or #hud element');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1b1f24, antialias: true });
  host.appendChild(app.canvas);

  // ?seed=123 in the URL reproduces a specific run.
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  const sim = createSim(Number.isInteger(seedParam) && seedParam > 0 ? seedParam : simConfig.defaultSeed);
  const loop = new FixedStepLoop(1000 / simConfig.ticksPerSecond, () => stepSim(sim));

  const view = new TestSceneView(sim);
  app.stage.addChild(view.root);
  const hud = new Hud(hudEl);

  const centre = isoToScreen((sim.width - 1) / 2, (sim.height - 1) / 2);
  app.ticker.add((ticker) => {
    loop.advance(ticker.deltaMS);
    view.root.position.set(app.screen.width / 2 - centre.sx, app.screen.height / 2 - centre.sy);
    view.update(sim);
    hud.update(sim, ticker.FPS);
  });
}

start().catch((err: unknown) => {
  document.body.textContent = `Failed to start: ${String(err)}`;
});
