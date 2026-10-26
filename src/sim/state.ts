import { kestrelFord } from '../data/sites/kestrelFord';
import { Rng } from './rng';
import { createPlan, type CastlePlan } from './castle';
import { buildSite, type SiteDef } from './site';
import type { TerrainMap } from './terrain';

/** Everything the simulation owns. Plain data, so it can be serialised for saves. */
export interface SimState {
  seed: number;
  tick: number;
  rngState: number;
  siteId: string;
  siteName: string;
  map: TerrainMap;
  /** The castle design: pieces and planned earthworks. Building it over time comes in M3. */
  plan: CastlePlan;
}

export function createSim(seed: number, site: SiteDef = kestrelFord): SimState {
  const rng = new Rng(seed);
  const map = buildSite(site);
  return { seed, tick: 0, rngState: rng.getState(), siteId: site.id, siteName: site.name, map, plan: createPlan(map) };
}

/** Advance the simulation by exactly one fixed tick. Nothing changes over time yet (M2 is design only). */
export function stepSim(state: SimState): void {
  state.tick++;
}
