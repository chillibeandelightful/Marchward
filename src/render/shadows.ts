/**
 * Cast shadows as flat shapes on the ground, worked out in world tiles (plain maths, no PixiJS).
 * A caster is a stack of outlines at heights above its ground; its shadow is the hull of those
 * outlines, each slid away from the sun by its height. Shadows are cut along tile edges, so each
 * tile's part can be laid on that tile's own slope and drawn with its row, and where shadows
 * overlap they are merged, so overlapping shadows are no darker than one.
 */

export interface P2 {
  x: number;
  y: number;
}

/** An outline on the ground plane (world tiles), raised `height` screen pixels above the caster's ground. */
export interface Ring {
  outline: readonly P2[];
  height: number;
}

/** Something that casts a shadow, as outlines at heights; a box is its footprint at its bottom and at its top. */
export interface Caster {
  rings: readonly Ring[];
}

/** A box standing from `low` to `high` pixels above its ground. */
export function boxCaster(x0: number, y0: number, x1: number, y1: number, low: number, high: number): Caster {
  const outline = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return { rings: [{ outline, height: Math.max(0, low) }, { outline, height: Math.max(0, high) }] };
}

/** A circle as a polygon of `n` points. */
export function circle(cx: number, cy: number, r: number, n = 12): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** The shadow of a caster on its ground, with `step` the shift along the ground per pixel of height. */
export function shadowOf(c: Caster, step: P2): P2[] {
  const pts: P2[] = [];
  for (const r of c.rings) for (const p of r.outline) pts.push({ x: p.x + step.x * r.height, y: p.y + step.y * r.height });
  return convexHull(pts);
}

function cross(o: P2, a: P2, b: P2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** The convex hull, anticlockwise (with y up), without repeated or collinear points. */
export function convexHull(points: readonly P2[]): P2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as P2, lower[lower.length - 1] as P2, p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as P2;
    while (upper.length >= 2 && cross(upper[upper.length - 2] as P2, upper[upper.length - 1] as P2, p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Twice the signed area: positive for anticlockwise. */
export function area2(poly: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as P2;
    const q = poly[(i + 1) % poly.length] as P2;
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** The part of a convex polygon where `f` is at least 0 (`f` is linear). */
function clip(poly: readonly P2[], f: (p: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as P2;
    const b = poly[(i + 1) % poly.length] as P2;
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Too small to see (in square tiles): dropped. */
const SPECK = 1e-5;

function usable(poly: readonly P2[]): boolean {
  return poly.length >= 3 && Math.abs(area2(poly)) > SPECK;
}

/** The part of a convex polygon inside the convex polygon `region`. */
export function clipTo(poly: readonly P2[], region: readonly P2[]): P2[] {
  const sign = Math.sign(area2(region)) || 1;
  let out: P2[] = [...poly];
  for (let i = 0; i < region.length && out.length > 0; i++) {
    const a = region[i] as P2;
    const b = region[(i + 1) % region.length] as P2;
    out = clip(out, (p) => sign * cross(a, b, p));
  }
  return usable(out) ? out : [];
}

/** An edge as the line it lies on, y = a + b x, for edges that aren't upright. */
interface Edge {
  id: number;
  a: number;
  b: number;
  x0: number;
  x1: number;
}

const EPS = 1e-9;

/**
 * The union of convex polygons, as pieces that don't overlap, so drawing them all darkens each
 * spot once. Polygons that touch no other are kept as they are. Overlapping ones are cut into
 * upright slabs at every corner and crossing; within a slab each polygon covers a span bounded
 * by two straight edges, and the spans merge into one trapezoid each, joined up with the same
 * trapezoid in the next slab when it is bounded by the same edges.
 */
export function merge(polys: readonly (readonly P2[])[]): P2[][] {
  const list = polys.filter(usable);
  const boxes = list.map(bounds);
  // Group polygons whose boxes overlap, directly or through others.
  const group = list.map((_, i) => i);
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i] as number)));
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) if (boxesOverlap(boxes[i] as Bounds, boxes[j] as Bounds)) group[find(i)] = find(j);
  const groups = new Map<number, P2[][]>();
  list.forEach((p, i) => {
    const g = find(i);
    groups.set(g, [...(groups.get(g) ?? []), [...p]]);
  });
  const out: P2[][] = [];
  for (const g of groups.values()) out.push(...(g.length === 1 ? g : slabUnion(g)));
  return out;
}

function slabUnion(polys: readonly P2[][]): P2[][] {
  let nextId = 0;
  // Each polygon's upright-free edges, split into its lower and upper chains by which way they run.
  const shapes = polys.map((poly) => {
    const sign = Math.sign(area2(poly)) || 1;
    const edges: { e: Edge; upper: boolean }[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i] as P2;
      const q = poly[(i + 1) % poly.length] as P2;
      if (Math.abs(q.x - p.x) < EPS) continue;
      const b = (q.y - p.y) / (q.x - p.x);
      // Anticlockwise (with y up), edges running towards +x are on the lower side.
      edges.push({ e: { id: nextId++, a: p.y - b * p.x, b, x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x) }, upper: (q.x > p.x) !== sign > 0 });
    }
    return edges;
  });
  const xs: number[] = [];
  for (const poly of polys) for (const p of poly) xs.push(p.x);
  const all = shapes.flatMap((s, k) => s.map((x) => ({ ...x, k })));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const p = all[i] as (typeof all)[number];
      const q = all[j] as (typeof all)[number];
      if (p.k === q.k || Math.abs(p.e.b - q.e.b) < EPS) continue;
      const x = (q.e.a - p.e.a) / (p.e.b - q.e.b);
      if (x > Math.max(p.e.x0, q.e.x0) + EPS && x < Math.min(p.e.x1, q.e.x1) - EPS) xs.push(x);
    }
  xs.sort((a, b) => a - b);
  const cuts = xs.filter((x, i) => i === 0 || x - (xs[i - 1] as number) > 1e-7);
  const at = (e: Edge, x: number) => e.a + e.b * x;
  const out: P2[][] = [];
  // Trapezoids still growing, by the ids of their lower and upper edges.
  let open = new Map<string, { lo: Edge; hi: Edge; x0: number; x1: number }>();
  const close = (t: { lo: Edge; hi: Edge; x0: number; x1: number }) =>
    out.push([
      { x: t.x0, y: at(t.lo, t.x0) },
      { x: t.x1, y: at(t.lo, t.x1) },
      { x: t.x1, y: at(t.hi, t.x1) },
      { x: t.x0, y: at(t.hi, t.x0) },
    ]);
  for (let c = 0; c + 1 < cuts.length; c++) {
    const xa = cuts[c] as number;
    const xb = cuts[c + 1] as number;
    const xm = (xa + xb) / 2;
    const spans: { lo: Edge; hi: Edge }[] = [];
    for (const s of shapes) {
      let lo: Edge | undefined;
      let hi: Edge | undefined;
      for (const { e, upper } of s) {
        if (e.x0 > xm || e.x1 < xm) continue;
        if (upper) hi = e;
        else lo = e;
      }
      if (lo && hi) spans.push({ lo, hi });
    }
    spans.sort((p, q) => at(p.lo, xm) - at(q.lo, xm));
    const next = new Map<string, { lo: Edge; hi: Edge; x0: number; x1: number }>();
    let cur: { lo: Edge; hi: Edge } | null = null;
    const emit = (s: { lo: Edge; hi: Edge }) => {
      const key = `${s.lo.id},${s.hi.id}`;
      const t = open.get(key);
      if (t && Math.abs(t.x1 - xa) < 1e-7) {
        t.x1 = xb;
        open.delete(key);
        next.set(key, t);
      } else next.set(key, { ...s, x0: xa, x1: xb });
    };
    for (const s of spans) {
      if (cur && at(s.lo, xm) <= at(cur.hi, xm)) {
        if (at(s.hi, xm) > at(cur.hi, xm)) cur = { lo: cur.lo, hi: s.hi };
      } else {
        if (cur) emit(cur);
        cur = s;
      }
    }
    if (cur) emit(cur);
    for (const t of open.values()) close(t);
    open = next;
  }
  for (const t of open.values()) close(t);
  return out;
}

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function bounds(p: readonly P2[]): Bounds {
  return p.reduce((m, q) => ({ x0: Math.min(m.x0, q.x), y0: Math.min(m.y0, q.y), x1: Math.max(m.x1, q.x), y1: Math.max(m.y1, q.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
}

function boxesOverlap(p: Bounds, q: Bounds): boolean {
  return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
}

/**
 * Every caster's shadow, cut into tiles (tile x covers x - 0.5 to x + 0.5) and merged per tile.
 * Keyed by tile index (y * width + x); tiles off the map are left out.
 */
export function shadowsByTile(casters: readonly Caster[], step: P2, width: number, height: number): Map<number, P2[][]> {
  const parts = shadowParts(casters, step, width, height);
  for (const [i, list] of parts) parts.set(i, merge(list));
  return parts;
}

/** As `shadowsByTile`, but not yet merged, so parts from different casters can be gathered first. */
export function shadowParts(casters: readonly Caster[], step: P2, width: number, height: number): Map<number, P2[][]> {
  const parts = new Map<number, P2[][]>();
  for (const c of casters) {
    const shape = shadowOf(c, step);
    if (!usable(shape)) continue;
    const xs = shape.map((p) => p.x);
    const ys = shape.map((p) => p.y);
    const tx0 = Math.max(0, Math.round(Math.min(...xs)));
    const tx1 = Math.min(width - 1, Math.round(Math.max(...xs)));
    const ty0 = Math.max(0, Math.round(Math.min(...ys)));
    const ty1 = Math.min(height - 1, Math.round(Math.max(...ys)));
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const piece = clipTo(shape, tileSquare(tx, ty));
        if (piece.length === 0) continue;
        const i = ty * width + tx;
        const list = parts.get(i);
        if (list) list.push(piece);
        else parts.set(i, [piece]);
      }
  }
  return parts;
}

export function tileSquare(tx: number, ty: number): P2[] {
  return [
    { x: tx - 0.5, y: ty - 0.5 },
    { x: tx + 0.5, y: ty - 0.5 },
    { x: tx + 0.5, y: ty + 0.5 },
    { x: tx - 0.5, y: ty + 0.5 },
  ];
}
