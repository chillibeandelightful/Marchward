import { describe, expect, it } from 'vitest';
import { CALENDAR } from '../src/data/economy';
import { placePieces } from '../src/sim/castle';
import { setWanted } from '../src/sim/economy';
import { fromSave, SAVE_VERSION, toSave } from '../src/sim/save';
import { createSim, stepSim } from '../src/sim/state';

describe('save games', () => {
  it('round-trips a game mid-build, and carries on exactly as the original does', () => {
    const a = createSim(42);
    placePieces(a.map, a.plan, [{ kind: 'wall', x: 36, y: 30, thickness: 'thick', height: 'high' }]);
    a.plan.earthworks[30 * a.map.width + 30] = -1;
    setWanted(a.economy, 'mason', 3);
    setWanted(a.economy, 'labourer', 5);
    setWanted(a.economy, 'digger', 2);
    for (let i = 0; i < 40 * CALENDAR.ticksPerDay + 7; i++) stepSim(a);

    const file = fromSave(toSave(a, 123));
    expect(file.version).toBe(SAVE_VERSION);
    expect(file.savedAt).toBe(123);
    const b = file.state;
    expect(b).toEqual(a);
    for (let i = 0; i < 100 * CALENDAR.ticksPerDay; i++) {
      stepSim(a);
      stepSim(b);
    }
    expect(b).toEqual(a);
  });

  it('upgrades a version 0 save (land and plan only) with a fresh economy', () => {
    const s = createSim(1);
    const old = { state: { seed: 1, tick: 0, rngState: s.rngState, siteId: s.siteId, siteName: s.siteName, map: s.map, plan: s.plan } };
    const file = fromSave(JSON.stringify(old));
    expect(file.state.economy.stores.crowns).toBe(s.economy.stores.crowns);
    expect(file.state.works.pieces).toEqual({});
    expect(() => stepSim(file.state)).not.toThrow();
  });

  it('refuses things that are not saves, and saves from a newer version', () => {
    expect(() => fromSave('not json')).toThrow();
    expect(() => fromSave('{"version":1}')).toThrow(/Not a Marchward save/);
    expect(() => fromSave(JSON.stringify({ version: SAVE_VERSION + 1, state: {} }))).toThrow(/newer/);
  });
});
