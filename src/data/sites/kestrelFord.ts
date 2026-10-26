import type { SiteDef } from '../../sim/site';

/**
 * Hand-made M1 test site. A river runs down the west side with a ford, a broad
 * hill in the middle makes a natural castle seat, and a rocky crag in the
 * north-east shows tall cliffs. Every terrain type appears somewhere.
 */
export const kestrelFord: SiteDef = {
  id: 'kestrel-ford',
  name: 'Kestrel Ford',
  width: 64,
  height: 64,
  baseHeight: 1,
  features: [
    // Land shape.
    { kind: 'hill', at: [36, 34], radius: 13, peak: 4 },
    { kind: 'hill', at: [52, 50], radius: 8, peak: 3 },
    { kind: 'hill', at: [26, 14], radius: 6, peak: 2 },
    { kind: 'plateau', at: [51, 13], radius: 7, level: 5, ragged: 0.25 },
    { kind: 'plateau', at: [55, 9], radius: 3, level: 6 },
    { kind: 'plateau', at: [24, 52], radius: 4.5, level: 3, ragged: 0.2 },
    // Water.
    { kind: 'river', path: [[10, -1], [14, 18], [9, 33], [15, 47], [11, 64]], width: 5, level: 0 },
    { kind: 'patch', terrain: 'shallow', at: [58, 23], radius: 3.2, level: 0 },
    { kind: 'patch', terrain: 'deep', at: [58, 23], radius: 1.6, level: 0 },
    // Ground cover.
    { kind: 'patch', terrain: 'rock', at: [51, 13], radius: 8.5, ragged: 0.2 },
    { kind: 'patch', terrain: 'rock', at: [43, 24], radius: 2.5, ragged: 0.3 },
    { kind: 'patch', terrain: 'rock', at: [24, 52], radius: 3, ragged: 0.3 },
    { kind: 'patch', terrain: 'forest', at: [28, 8], radius: 8, ragged: 0.35 },
    { kind: 'patch', terrain: 'forest', at: [56, 40], radius: 5, ragged: 0.35 },
    { kind: 'patch', terrain: 'forest', at: [40, 57], radius: 6, ragged: 0.4 },
    { kind: 'patch', terrain: 'forest', at: [3, 12], radius: 4, ragged: 0.4 },
    { kind: 'patch', terrain: 'marsh', at: [20, 41], radius: 5.5, level: 1, ragged: 0.35 },
    { kind: 'patch', terrain: 'marsh', at: [5, 52], radius: 4, level: 0, ragged: 0.3 },
    // Road from the west edge, over the ford and up to the hilltop, then east.
    { kind: 'road', path: [[0, 30], [8, 30], [16, 31], [24, 33], [36, 34], [46, 31], [63, 30]] },
  ],
};
