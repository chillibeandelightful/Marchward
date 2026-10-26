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

  it('differs between seeds', () => {
    expect(run(1, 600)).not.toEqual(run(2, 600));
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

  it('keeps wanderers on the map', () => {
    const s = run(9, 3000);
    for (const w of s.wanderers) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.x).toBeLessThan(s.width);
      expect(w.y).toBeLessThan(s.height);
    }
  });
});
