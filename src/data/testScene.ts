/** Content for the M0 test scene. Throwaway once real sites exist (M1). */
export const testScene = {
  width: 10,
  height: 10,
  maxHeight: 2,
  wanderers: 3,
  /** Ticks between each wanderer step. */
  stepEveryTicks: 15,
} as const;

export const simConfig = {
  ticksPerSecond: 30,
  defaultSeed: 1991,
} as const;
