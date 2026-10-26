/**
 * Fixed-step accumulator. Real elapsed time is fed in; the simulation is
 * stepped a whole number of fixed ticks, so the sim never sees a variable dt.
 */
export class FixedStepLoop {
  private accumulator = 0;

  constructor(
    readonly tickMs: number,
    private readonly step: () => void,
    /** Cap on ticks per advance(), so a long stall (e.g. a background tab) can't freeze the page catching up. */
    private readonly maxTicksPerAdvance = 10,
  ) {
    if (tickMs <= 0) throw new Error('FixedStepLoop: tickMs must be positive');
  }

  /** Feed elapsed real time; returns the number of ticks run. */
  advance(elapsedMs: number): number {
    this.accumulator += Math.max(0, elapsedMs);
    let ticks = 0;
    while (this.accumulator >= this.tickMs && ticks < this.maxTicksPerAdvance) {
      this.step();
      this.accumulator -= this.tickMs;
      ticks++;
    }
    // Drop backlog we refused to run rather than carrying it forever.
    if (ticks === this.maxTicksPerAdvance) this.accumulator = Math.min(this.accumulator, this.tickMs);
    return ticks;
  }

  /** Fraction of the way to the next tick, in [0, 1), for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.tickMs;
  }
}
