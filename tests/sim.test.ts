import { describe, expect, it } from 'vitest';
import { createSim, stepSim } from '../src/sim/state';

function run(seed: number, ticks: number) {
  const s = createSim(seed);
  for (let i = 0; i < ticks; i++) stepSim(s);
  return s;
}

describe('sim', () => {
  it('is deterministic for a given seed', () => {
    expect(run(1991, 600)).toEqual(run(1991, 600));
  });

  it('counts ticks', () => {
    expect(run(1, 45).tick).toBe(45);
  });

  it('round-trips through JSON mid-run (save/load groundwork)', () => {
    const a = run(5, 300);
    const b = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 300; i++) {
      stepSim(a);
      stepSim(b);
    }
    expect(b).toEqual(a);
  });
});
