import { CALENDAR } from '../data/economy';
import { isWinter } from './calendar';
import { createDefence } from './defence';
import { createEconomy, startingTroops } from './economy';
import { Rng } from './rng';
import type { SimState } from './state';
import { createWorks } from './works';

/** Bump when the shape of SimState changes, and add a step to MIGRATIONS that upgrades the old shape. */
export const SAVE_VERSION = 2;

export interface SaveFile {
  version: number;
  /** When it was saved (ms since 1970), for the load menu. Set by the caller; the sim has no clock. */
  savedAt: number;
  state: SimState;
}

/**
 * Upgrades from each older version to the next. Version 0 is a bare M2-era state
 * (land and plan only), which gets a fresh economy and no building progress.
 */
const MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  0: (s) => ({
    ...s,
    camp: s.camp ?? [20, 28],
    economy: s.economy ?? createEconomy(),
    works: s.works ?? createWorks(),
    history: s.history ?? [],
    log: s.log ?? [],
  }),
  // Version 2 (M4): the garrison and raids. An M3 game gets the starting garrison and its first raid
  // some months on from today, so a castle built under M3 isn't attacked the moment it's loaded.
  1: (s) => {
    const economy = s.economy as Record<string, unknown>;
    const defence = createDefence(new Rng(Number(s.rngState) || 1));
    const day = Math.floor(Number(s.tick ?? 0) / CALENDAR.ticksPerDay);
    defence.nextRaid = Math.max(defence.nextRaid, day + 30);
    while (isWinter(defence.nextRaid)) defence.nextRaid++;
    return {
      ...s,
      economy: { ...economy, troops: economy.troops ?? startingTroops(), troopsWanted: economy.troopsWanted ?? startingTroops() },
      defence: s.defence ?? defence,
    };
  },
};

export function toSave(state: SimState, savedAt: number): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt, state };
  return JSON.stringify(file);
}

/** Read a save, upgrading it if it's from an older version. Throws if it isn't a save at all. */
export function fromSave(text: string): SaveFile {
  const raw = JSON.parse(text) as Partial<SaveFile> & { state?: Record<string, unknown> };
  if (!raw || typeof raw !== 'object' || !raw.state || typeof raw.state !== 'object') throw new Error('Not a Marchward save');
  let version = typeof raw.version === 'number' ? raw.version : 0;
  if (version > SAVE_VERSION) throw new Error('This save is from a newer version of the game');
  let state = raw.state as Record<string, unknown>;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No upgrade from save version ${version}`);
    state = step(state);
    version++;
  }
  const s = state as unknown as SimState;
  if (!s.map || !Array.isArray(s.map.heights) || !s.plan || !Array.isArray(s.plan.pieces)) throw new Error('The save is damaged');
  return { version, savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0, state: s };
}
