import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/sim/loop';

describe('FixedStepLoop', () => {
  it('runs whole ticks and carries the remainder', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(10, () => ticks++);
    expect(loop.advance(25)).toBe(2);
    expect(loop.alpha).toBeCloseTo(0.5);
    expect(loop.advance(5)).toBe(1);
    expect(ticks).toBe(3);
  });

  it('gives the same tick count however the time is sliced', () => {
    let a = 0;
    let b = 0;
    const big = new FixedStepLoop(10, () => a++);
    const small = new FixedStepLoop(10, () => b++);
    big.advance(90);
    for (let i = 0; i < 30; i++) small.advance(3);
    expect(a).toBe(9);
    expect(b).toBe(9);
  });

  it('caps catch-up after a long stall', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(10, () => ticks++, 5);
    expect(loop.advance(10_000)).toBe(5);
    expect(loop.advance(0)).toBe(1);
    expect(loop.advance(0)).toBe(0);
  });
});
