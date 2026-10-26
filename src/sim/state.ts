import { kestrelFord } from '../data/sites/kestrelFord';
import { Rng } from './rng';
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
}

export function createSim(seed: number, site: SiteDef = kestrelFord): SimState {
  const rng = new Rng(seed);
  return { seed, tick: 0, rngState: rng.getState(), siteId: site.id, siteName: site.name, map: buildSite(site) };
}

/** Advance the simulation by exactly one fixed tick. Nothing changes over time yet (M1 is land only). */
export function stepSim(state: SimState): void {
  state.tick++;
}
