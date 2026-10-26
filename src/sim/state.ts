import { Rng } from './rng';
import { testScene } from '../data/testScene';

export interface Wanderer {
  x: number;
  y: number;
}

/** Everything the simulation owns. Plain data, so it can be serialised for saves. */
export interface SimState {
  seed: number;
  tick: number;
  rngState: number;
  width: number;
  height: number;
  /** Height level per tile, row-major. */
  heights: number[];
  wanderers: Wanderer[];
}

export function createSim(seed: number): SimState {
  const rng = new Rng(seed);
  const { width, height } = testScene;
  const heights = Array.from({ length: width * height }, () => rng.int(0, testScene.maxHeight));
  const wanderers = Array.from({ length: testScene.wanderers }, () => ({
    x: rng.int(0, width - 1),
    y: rng.int(0, height - 1),
  }));
  return { seed, tick: 0, rngState: rng.getState(), width, height, heights, wanderers };
}

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Advance the simulation by exactly one fixed tick. */
export function stepSim(state: SimState): void {
  state.tick++;
  if (state.tick % testScene.stepEveryTicks !== 0) return;

  const rng = new Rng(0);
  rng.setState(state.rngState);
  for (const w of state.wanderers) {
    const [dx, dy] = rng.pick(DIRECTIONS);
    const nx = w.x + dx;
    const ny = w.y + dy;
    if (nx >= 0 && ny >= 0 && nx < state.width && ny < state.height) {
      w.x = nx;
      w.y = ny;
    }
  }
  state.rngState = rng.getState();
}

export function heightAt(state: SimState, x: number, y: number): number {
  return state.heights[y * state.width + x] ?? 0;
}
