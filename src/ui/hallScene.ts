import { Rng } from '../sim/rng';

/**
 * The picture above a messenger's letter: a close-up in the warden's hall, hand-painted in code.
 * The warden broods in his carved seat on the left, chin on his fist; the messenger stands before
 * him on the right, seen over the shoulder.
 *
 * It is painted the way a person would paint it: each form is blocked in, then built up with
 * thousands of brush strokes that follow the form (along the folds of cloth, the fall of hair, the
 * grain of oak) and pick up colour from the light (a torch off to the right, cool daylight from the
 * window). It is painted at twice the size, then reduced to 320×160 and to a palette of 128
 * colours taken from the painting itself, as old painted VGA art was. Hand-made pictures can replace
 * it at the same size (see `hallScene`). The strokes come from a seeded random stream, so the
 * picture is the same every time.
 */

export const SCENE_SIZE = { w: 320, h: 160 } as const;
/** Painted at this multiple of the final size, then reduced. */
const SCALE = 2;

type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];
type Rgb = readonly [number, number, number];

// ── Colour helpers ──────────────────────────────────────────────────────────────

function hex(h: string): Rgb {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** A colour along a ramp of colours, `t` from 0 (first) to 1 (last). */
function ramp(stops: readonly Rgb[], t: number): Rgb {
  const k = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(k);
  return mix(stops[i] as Rgb, stops[i + 1] as Rgb, k - i);
}

function css(c: Rgb, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

// Colour ramps, dark to light.
const STONE = ['#161210', '#2e2620', '#4a3f36', '#665a4e', '#86796a', '#a69886'].map(hex);
const OAK = ['#140c06', '#2e1c0e', '#4c3018', '#6c4826', '#8e6636', '#b48a52'].map(hex);
const SKIN = ['#3a1c12', '#6e3a24', '#9c5a38', '#c27c52', '#dc9e74', '#f2c49e'].map(hex);
const GREY = ['#2a2624', '#56504c', '#827c76', '#aaa49c', '#d0cac0', '#f0ece4'].map(hex);
const RED = ['#1e0606', '#4a0e0c', '#7a1a14', '#a42a1e', '#c8452e', '#e2704a'].map(hex);
const BLUE = ['#0a0e1c', '#16223e', '#243a62', '#365686', '#5476a6'].map(hex);
const GOLD = ['#3a2808', '#6e4e14', '#a47a24', '#d2a63c', '#f2d878', '#fff4c0'].map(hex);
const FUR = ['#1e140c', '#3e2c1a', '#62482c', '#8a6c46', '#b8996e', '#e0ccaa'].map(hex);
const WOOL = ['#140e08', '#2e2214', '#4a3820', '#6a5230', '#8c7044', '#ae9060'].map(hex);
const GREEN = ['#0e140a', '#1e2a12', '#34441e', '#4e602c', '#6c7e40'].map(hex);
const SACK = ['#4a4030', '#7a6c50', '#a89a76', '#cfc3a0', '#ece4cc', '#fbf8ee'].map(hex);
const SKY = ['#2a3c50', '#4a6a84', '#7c9cb2', '#b4cad6', '#e2ecf0'].map(hex);

// ── The brush ───────────────────────────────────────────────────────────────────

/** Where the light comes from: a torch up and to the right, in picture coordinates. */
const TORCH: Pt = [300, 20];

class Painter {
  readonly rng: Rng;
  constructor(
    readonly ctx: Ctx,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  r(a = 0, b = 1): number {
    return a + this.rng.next() * (b - a);
  }

  /** One brush stroke: a short tapered line from (x, y) at `angle`, `len` long and `width` wide. */
  stroke(x: number, y: number, angle: number, len: number, width: number, colour: Rgb, alpha: number, bend = 0): void {
    const ctx = this.ctx;
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;
    const nx = -Math.sin(angle) * bend * len;
    const ny = Math.cos(angle) * bend * len;
    ctx.strokeStyle = css(colour, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - dx / 2, y - dy / 2);
    ctx.quadraticCurveTo(x + nx, y + ny, x + dx / 2, y + dy / 2);
    ctx.stroke();
  }

  /** Trace a closed shape as the current path: straight, or a smooth curve through the points. */
  path(pts: readonly Pt[], curved = true): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (!curved) {
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    } else {
      const n = pts.length;
      const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const s = mid(pts[n - 1] as Pt, pts[0] as Pt);
      ctx.moveTo(s[0], s[1]);
      for (let i = 0; i < n; i++) {
        const p = pts[i] as Pt;
        const m = mid(p, pts[(i + 1) % n] as Pt);
        ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
      }
    }
    ctx.closePath();
  }

  /**
   * Paint a form: block it in with its mid tone, then lay `count` strokes over it, each coloured from
   * `ramp` by `light(x, y)` (0 dark to 1 lit) and laid along `flow(x, y)`, all kept inside the shape.
   */
  form(
    pts: readonly Pt[],
    opts: {
      ramp: readonly Rgb[];
      light: (x: number, y: number) => number;
      flow: (x: number, y: number) => number;
      count: number;
      len: [number, number];
      width: [number, number];
      curved?: boolean;
      jitter?: number;
      bend?: number;
      alpha?: number;
    },
  ): void {
    const ctx = this.ctx;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    ctx.save();
    this.path(pts, opts.curved ?? true);
    ctx.clip();
    // Block in, in two passes of broad strokes so even the base isn't flat.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    ctx.fillStyle = css(ramp(opts.ramp, opts.light(cx, cy) * 0.8));
    ctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    const jitter = opts.jitter ?? 0.08;
    for (let i = 0; i < opts.count; i++) {
      const x = this.r(x0 - 2, x1 + 2);
      const y = this.r(y0 - 2, y1 + 2);
      const t = opts.light(x, y) + this.r(-jitter, jitter);
      const big = i < opts.count * 0.3;
      const len = this.r(...opts.len) * (big ? 1.8 : 1);
      const width = this.r(...opts.width) * (big ? 1.6 : 1);
      this.stroke(x, y, opts.flow(x, y) + this.r(-0.25, 0.25), len, width, ramp(opts.ramp, t), opts.alpha ?? (big ? 0.55 : 0.8), (opts.bend ?? 0.1) * this.r(-1, 1));
    }
    ctx.restore();
  }

  /** Hair: many long thin strokes of greys, falling along `flow`, from inside the shape outwards. */
  hair(pts: readonly Pt[], count: number, light: (x: number, y: number) => number, flow: (x: number, y: number) => number, len: [number, number]): void {
    this.form(pts, { ramp: GREY, light, flow, count, len, width: [0.5, 1.3], bend: 0.35, jitter: 0.18, alpha: 0.85 });
  }

  /** A soft blob of light or shade, to glaze over what's painted. */
  glaze(x: number, y: number, r: number, colour: Rgb, alpha: number): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(colour, alpha));
    g.addColorStop(1, css(colour, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /** A few careful marks: a line of a given colour and width. */
  mark(pts: readonly Pt[], colour: Rgb, width: number, alpha = 1): void {
    const ctx = this.ctx;
    ctx.strokeStyle = css(colour, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  dot(x: number, y: number, rx: number, ry: number, colour: Rgb, alpha = 1): void {
    const ctx = this.ctx;
    ctx.fillStyle = css(colour, alpha);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** How lit a point is by the torch: falls off with distance, plus a broad tilt towards the right. */
function torchlight(x: number, y: number): number {
  const d = Math.hypot(x - TORCH[0], y - TORCH[1]);
  return Math.max(0, 1 - d / 340);
}

/** Light on a rounded form centred at (cx, cy) with radii (rx, ry), lit from up and to the right. */
function rounded(cx: number, cy: number, rx: number, ry: number, base = 0.15, gain = 0.85): (x: number, y: number) => number {
  return (x, y) => {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const lit = Math.max(0, nx * 0.55 - ny * 0.45 + nz * 0.7);
    return base + gain * lit * (0.6 + 0.4 * torchlight(x, y));
  };
}

/** Light across cloth: folds running along `angle`, every `spacing`, over a lit-from-the-right base. */
function folds(spacing: number, angle: number, depth: number, base: (x: number, y: number) => number): (x: number, y: number) => number {
  const ux = Math.cos(angle + Math.PI / 2);
  const uy = Math.sin(angle + Math.PI / 2);
  return (x, y) => {
    const across = (x * ux + y * uy) / spacing;
    const fold = Math.sin(across * Math.PI * 2 + Math.sin(across * 1.7) * 0.8);
    return base(x, y) + fold * depth;
  };
}

const along = (angle: number) => () => angle;
const DOWN = Math.PI / 2;

// ── The hall ────────────────────────────────────────────────────────────────────

function wall(p: Painter): void {
  const { w, h } = SCENE_SIZE;
  const ctx = p.ctx;
  ctx.fillStyle = css(STONE[1] as Rgb);
  ctx.fillRect(0, 0, w, h);
  // Big dressed stones, each painted on its own with a slightly different colour.
  for (let row = 0; row < 8; row++) {
    const y = row * 21 - 4;
    for (let k = -1; k < 9; k++) {
      const x = k * 42 + (row % 2) * 21 + p.r(-1, 1);
      const tone = p.r(-0.08, 0.08);
      const bx = x + 1.5;
      const by = y + 1.5;
      p.form(
        [[bx, by], [bx + 38, by + p.r(-0.5, 0.5)], [bx + 38.5, by + 18], [bx + p.r(-0.5, 0.5), by + 18]],
        {
          ramp: STONE,
          light: (xx, yy) => 0.25 + tone + torchlight(xx, yy) * 0.55 - ((yy - by) / 18) * 0.12,
          flow: along(p.r(-0.3, 0.3)),
          count: 60,
          len: [3, 9],
          width: [1, 2.5],
          curved: false,
          jitter: 0.1,
        },
      );
      // A chipped, lit top edge.
      p.mark([[bx + 1, by + 0.6], [bx + 37, by + 0.6]], STONE[4] as Rgb, 0.8, 0.35 + torchlight(bx, by) * 0.4);
    }
  }

  // The tall window: cool daylight, leaded panes, deep reveals.
  p.form([[180, 160], [180, 30], [184, 14], [198, 5], [212, 14], [216, 30], [216, 160]], {
    ramp: STONE, light: () => 0.08, flow: along(DOWN), count: 80, len: [4, 10], width: [1, 2], curved: false,
  });
  p.form([[185, 160], [185, 32], [188, 17], [198, 10], [208, 17], [211, 32], [211, 160]], {
    ramp: SKY, light: (_x, y) => 0.85 - y / 220, flow: along(DOWN), count: 220, len: [4, 12], width: [1, 2.4], curved: false,
  });
  for (const x of [191.5, 198, 204.5]) p.mark([[x, 12], [x, 160]], STONE[0] as Rgb, 0.7, 0.8);
  for (let y = 24; y < 160; y += 9) p.mark([[185, y], [211, y + 1.5]], STONE[0] as Rgb, 0.6, 0.7);
  p.mark([[198, 9], [198, 160]], STONE[1] as Rgb, 2.2);
  // Daylight falling in, in soft shafts.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let k = 0; k < 3; k++) {
    const g = ctx.createLinearGradient(196, 20, 150, 160);
    g.addColorStop(0, css(SKY[3] as Rgb, 0.14));
    g.addColorStop(1, css(SKY[3] as Rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(186 + k * 7, 30);
    ctx.lineTo(192 + k * 7, 30);
    ctx.lineTo(150 + k * 14, 160);
    ctx.lineTo(132 + k * 14, 160);
    ctx.fill();
  }
  ctx.restore();

  // The torch off to the right: its glow on the wall.
  p.glaze(TORCH[0], TORCH[1] + 10, 140, hex('#ffb060'), 0.28);
  p.glaze(TORCH[0], TORCH[1] + 10, 50, hex('#ffd890'), 0.25);

  // The warden's banner behind the seat: red wool with the gold tower, hanging in folds.
  p.form([[12, 0], [92, 0], [92, 84], [12, 84]], {
    ramp: RED, light: folds(9, DOWN, 0.18, () => 0.38), flow: along(DOWN), count: 700, len: [4, 12], width: [1, 2.6], curved: false,
  });
  p.form([[12, 82], [92, 82], [92, 86], [12, 86]], { ramp: GOLD, light: () => 0.55, flow: along(0), count: 80, len: [2, 5], width: [0.8, 1.6], curved: false });
}

/** The carved oak seat behind the warden. */
function seatBack(p: Painter): void {
  const back: Pt[] = [[30, 160], [26, 40], [36, 10], [92, 2], [150, 10], [160, 40], [156, 160]];
  p.form(back, {
    ramp: OAK,
    light: (x, y) => 0.32 + torchlight(x, y) * 0.35 - Math.abs(x - 93) / 300,
    flow: along(DOWN),
    count: 1500,
    len: [5, 14],
    width: [0.8, 2.2],
    jitter: 0.12,
  });
  // Linenfold panels: carved folds catching the light on one side.
  for (let k = 0; k < 4; k++) {
    const x = 44 + k * 26;
    p.form([[x, 18], [x + 22, 18], [x + 22, 96], [x, 96]], {
      ramp: OAK,
      light: (xx) => {
        const f = ((xx - x) / 22) * 3;
        return 0.22 + (Math.sin(f * Math.PI * 2 - 0.6) * 0.5 + 0.5) * 0.45 + torchlight(xx, 50) * 0.15;
      },
      flow: along(DOWN),
      count: 420,
      len: [6, 16],
      width: [0.7, 1.6],
      curved: false,
      jitter: 0.06,
    });
    p.mark([[x, 18], [x + 22, 18]], OAK[5] as Rgb, 1, 0.7);
    p.mark([[x, 96], [x + 22, 96]], OAK[0] as Rgb, 1.4, 0.9);
  }
  // Gilded finials.
  for (const [fx, fy] of [[38, 10], [148, 12]] as const) {
    p.form([[fx - 6, fy + 6], [fx - 5, fy - 4], [fx, fy - 9], [fx + 5, fy - 4], [fx + 6, fy + 6]], {
      ramp: GOLD, light: rounded(fx, fy, 6, 8), flow: (x, y) => Math.atan2(y - fy, x - fx) + Math.PI / 2, count: 90, len: [1.5, 4], width: [0.6, 1.4],
    });
  }
}

function seatArm(p: Painter): void {
  p.form([[0, 119], [74, 115], [76, 131], [0, 135]], {
    ramp: OAK, light: (x, y) => 0.55 - (y - 115) / 34 + torchlight(x, y) * 0.2, flow: along(-0.05), count: 500, len: [6, 16], width: [0.8, 2], curved: false,
  });
  p.form([[56, 130], [74, 128], [74, 160], [56, 160]], {
    ramp: OAK, light: (x) => 0.2 + ((x - 56) / 18) * 0.35, flow: along(DOWN), count: 220, len: [4, 10], width: [0.8, 1.8], curved: false,
  });
  // The carved knob on the end of the arm.
  p.form([[62, 122], [64, 113], [72, 110], [80, 114], [81, 123], [74, 128], [65, 128]], {
    ramp: OAK, light: rounded(72, 119, 10, 9), flow: (x, y) => Math.atan2(y - 119, x - 72) + Math.PI / 2, count: 220, len: [2, 5], width: [0.7, 1.5],
  });
}

// ── The warden ─────────────────────────────────────────────────────────────────

function warden(p: Painter): void {
  // The red cloak over his shoulders and lap, in deep folds.
  const cloak: Pt[] = [[36, 160], [40, 114], [56, 94], [90, 83], [134, 86], [158, 102], [168, 160]];
  p.form(cloak, {
    ramp: RED,
    light: folds(11, DOWN + 0.25, 0.2, (x, y) => 0.25 + torchlight(x, y) * 0.55 + rounded(104, 120, 70, 50, 0, 0.3)(x, y)),
    flow: (x) => DOWN + (x - 104) / 160,
    count: 2600,
    len: [5, 14],
    width: [1, 2.6],
    jitter: 0.1,
  });
  // The blue robe at the chest, where the cloak falls open.
  p.form([[88, 160], [92, 104], [108, 92], [126, 95], [134, 114], [130, 160]], {
    ramp: BLUE, light: folds(7, DOWN, 0.15, (x, y) => 0.3 + torchlight(x, y) * 0.5), flow: along(DOWN), count: 900, len: [4, 11], width: [0.9, 2],
  });
  // Fur along the cloak's edges and round the shoulders: short dabs every which way.
  const furBand = (pts: readonly Pt[], width: number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i] as Pt;
      const [bx, by] = pts[i + 1] as Pt;
      const n = Math.hypot(bx - ax, by - ay) * 9;
      for (let k = 0; k < n; k++) {
        const t = p.r();
        const off = p.r(-1, 1) * width;
        const nx = -(by - ay);
        const ny = bx - ax;
        const nl = Math.hypot(nx, ny) || 1;
        const x = ax + (bx - ax) * t + (nx / nl) * off;
        const y = ay + (by - ay) * t + (ny / nl) * off;
        const lit = 0.35 + torchlight(x, y) * 0.45 - (off / width) * 0.15 + p.r(-0.2, 0.2);
        p.stroke(x, y, p.r(0, Math.PI * 2), p.r(1.5, 3.5), p.r(0.6, 1.4), ramp(FUR, lit), 0.9, p.r(-0.4, 0.4));
      }
    }
  };
  furBand([[56, 98], [72, 90], [92, 87], [110, 89]], 5);
  furBand([[120, 91], [138, 95], [156, 106]], 5);
  furBand([[93, 96], [91, 122], [89, 160]], 4.5);
  furBand([[129, 98], [132, 128], [130, 160]], 4.5);

  // The chain of office, gold links across the chest, with a jewelled pendant.
  for (let t = 0; t <= 1.001; t += 0.06) {
    const x = 96 + t * 33;
    const y = 99 + Math.sin(t * Math.PI) * 14;
    const lit = 0.4 + torchlight(x, y) * 0.5;
    p.dot(x, y, 2.2, 1.6, ramp(GOLD, lit - 0.25));
    p.dot(x - 0.4, y - 0.5, 1.1, 0.8, ramp(GOLD, lit + 0.3));
  }
  p.form([[107, 114], [112, 110], [118, 114], [117, 122], [112, 126], [107, 122]], {
    ramp: GOLD, light: rounded(112, 117, 6, 7), flow: (x, y) => Math.atan2(y - 117, x - 112) + Math.PI / 2, count: 120, len: [1, 3], width: [0.5, 1.2],
  });
  p.dot(112.5, 118, 2, 2.4, RED[2] as Rgb);
  p.dot(113.3, 117, 0.8, 0.8, RED[5] as Rgb);

  // The arm propping up his head: from the elbow on the seat's arm to the fist under his chin.
  const armAngle = Math.atan2(82 - 128, 121 - 62);
  // The sleeve is the blue of his robe, showing where the cloak is thrown back off the arm.
  p.form([[57, 124], [62, 106], [110, 75], [131, 90], [84, 133], [65, 135]], {
    ramp: BLUE,
    light: folds(6, armAngle, 0.14, (x, y) => 0.35 + torchlight(x, y) * 0.6 + ((y - 128) / -50) * 0.15),
    flow: along(armAngle),
    count: 900,
    len: [4, 11],
    width: [0.9, 2.2],
  });
  // Its edges: a lit top where the torch catches the sleeve, a dark crease beneath where it meets the cloak.
  p.mark([[64, 108], [88, 93], [111, 77]], BLUE[4] as Rgb, 1.2, 0.7);
  p.mark([[64, 133], [86, 130], [106, 114], [129, 92]], BLUE[0] as Rgb, 2.2, 0.9);
  p.mark([[58, 124], [64, 133]], BLUE[0] as Rgb, 2, 0.9);
  // A fur cuff.
  furBand([[111, 84], [120, 93]], 4);

  // ── The head: three-quarter view, turned to the right, a little down ──
  const hx = 124;
  const hy = 48;
  // Hair: grey, swept back from a high forehead, thick over the ears.
  p.hair(
    [[98, 34], [104, 18], [120, 12], [136, 17], [142, 32], [140, 58], [128, 66], [102, 62], [94, 48]],
    1100,
    (x, y) => rounded(118, 38, 24, 26, 0.2, 0.8)(x, y),
    (x, y) => Math.atan2(y - 60, x - 125) + Math.PI * 0.55,
    [5, 12],
  );
  // The face.
  const face: Pt[] = [[110, 30], [126, 22], [140, 28], [146, 46], [143, 64], [133, 78], [119, 79], [110, 64], [106, 46]];
  const faceLight = rounded(hx + 6, hy - 2, 22, 30, 0.12, 0.95);
  p.form(face, {
    ramp: SKIN, light: faceLight, flow: (x, y) => Math.atan2(y - hy, x - hx) + Math.PI / 2, count: 1600, len: [1.5, 4.5], width: [0.6, 1.6], jitter: 0.07,
  });
  // Warmth in the cheek and the end of the nose; shade under the brow.
  p.glaze(138, 58, 6, hex('#c4523a'), 0.35);
  p.glaze(143, 61, 3, hex('#c4523a'), 0.35);
  p.glaze(132, 45, 9, SKIN[0] as Rgb, 0.45);
  p.glaze(112, 52, 9, SKIN[0] as Rgb, 0.4);
  // The far ear, in shadow.
  p.form([[103, 44], [107, 42], [109, 50], [107, 58], [103, 56]], { ramp: SKIN, light: () => 0.3, flow: along(DOWN), count: 80, len: [1, 3], width: [0.6, 1.2] });
  // Lines on the brow, drawn up into a scowl.
  p.mark([[118, 33], [125, 31.5], [133, 32]], SKIN[1] as Rgb, 0.8, 0.6);
  p.mark([[119, 36], [126, 35], [132, 36]], SKIN[1] as Rgb, 0.7, 0.5);
  p.mark([[131, 37], [132.5, 42]], SKIN[1] as Rgb, 0.9, 0.8);
  p.mark([[134.5, 37], [134, 42]], SKIN[1] as Rgb, 0.9, 0.7);
  // Eyes, deep set, glaring at the messenger.
  for (const [ex, ey, rx] of [[127, 46.5, 3.6], [141, 45.5, 2.6]] as const) {
    p.dot(ex, ey, rx + 1, 2.6, SKIN[0] as Rgb, 0.8);
    p.dot(ex + 0.4, ey, rx, 1.4, hex('#e8e0d0'));
    p.dot(ex + rx * 0.45, ey, 1.2, 1.3, hex('#3a2a1c'));
    p.dot(ex + rx * 0.45, ey, 0.6, 0.7, hex('#0c0806'));
    p.dot(ex + rx * 0.3, ey - 0.6, 0.35, 0.35, hex('#ffffff'));
    p.mark([[ex - rx, ey - 0.8], [ex + rx, ey - 1.6]], SKIN[0] as Rgb, 0.9);
    p.mark([[ex - rx + 0.5, ey + 1.8], [ex + rx - 0.5, ey + 1.6]], SKIN[2] as Rgb, 0.6, 0.7);
  }
  // Brows: thick, white, bristling, pulled down to the nose.
  for (const [a, b] of [[[116, 40], [130, 43.5]], [[135, 42.5], [145, 39]]] as const) {
    for (let k = 0; k < 40; k++) {
      const t = p.r();
      const x = a[0] + (b[0] - a[0]) * t + p.r(-0.6, 0.6);
      const y = a[1] + (b[1] - a[1]) * t + p.r(-1.2, 1.2);
      p.stroke(x, y, Math.atan2(b[1] - a[1], b[0] - a[0]) + p.r(-0.6, 0.3), p.r(1.5, 3.5), p.r(0.4, 0.9), ramp(GREY, p.r(0.55, 1)), 0.9);
    }
  }
  // The nose: long and hooked, lit down the bridge, shaded beneath.
  p.form([[134, 44], [138, 50], [143, 58], [146, 63], [142, 66], [137, 65], [134, 60]], {
    ramp: SKIN, light: (x, y) => 0.45 + (x - 134) / 20 - (y - 44) / 60, flow: along(1.1), count: 260, len: [1.2, 3.5], width: [0.5, 1.2],
  });
  p.mark([[137, 47], [141, 56], [144, 61]], SKIN[5] as Rgb, 0.9, 0.8);
  p.dot(141, 65, 2, 1, SKIN[0] as Rgb, 0.8);
  p.mark([[133, 61], [135, 66]], SKIN[1] as Rgb, 0.8, 0.7);
  // Beard: long grey hair from the cheeks down over the fist.
  p.hair(
    [[110, 58], [118, 66], [130, 68], [139, 66], [147, 69], [146, 82], [138, 94], [123, 96], [112, 86], [107, 70]],
    1400,
    (x, y) => rounded(130, 78, 20, 18, 0.15, 0.9)(x, y),
    (x) => DOWN + (x - 128) / -40,
    [5, 12],
  );
  // The moustache drooping over a turned-down mouth.
  p.hair(
    [[127, 67], [135, 64], [144, 66], [147, 73], [141, 72], [134, 71], [128, 74]],
    260,
    () => 0.85,
    (x) => (x < 136 ? Math.PI * 0.8 : Math.PI * 0.25),
    [3, 6],
  );
  p.mark([[131, 74], [136, 73], [141, 75]], SKIN[0] as Rgb, 1, 0.8);

  // The fist under the beard, knuckles up.
  const fist: Pt[] = [[118, 82], [131, 78], [145, 83], [148, 95], [139, 101], [122, 97]];
  p.form(fist, { ramp: SKIN, light: rounded(136, 86, 16, 12, 0.15, 0.9), flow: along(0.2), count: 600, len: [1.5, 4], width: [0.6, 1.4] });
  for (const x of [128, 134, 140]) p.mark([[x, 83], [x + 1, 96]], SKIN[1] as Rgb, 0.8, 0.8);
  for (const x of [125, 131, 137, 143]) p.dot(x, 84.5, 1.6, 1, SKIN[5] as Rgb, 0.6);
  p.dot(141.5, 91, 1.8, 1.3, GOLD[3] as Rgb);
  p.dot(141, 90.5, 0.6, 0.5, GOLD[5] as Rgb);

  // His other hand, resting on the arm of the seat.
  p.form([[38, 127], [55, 123], [65, 129], [60, 137], [42, 138]], { ramp: SKIN, light: rounded(52, 129, 14, 8, 0.15, 0.6), flow: along(0), count: 260, len: [1.5, 4], width: [0.6, 1.3] });
  for (const x of [46, 51, 56]) p.mark([[x, 131], [x - 1, 137]], SKIN[1] as Rgb, 0.7, 0.7);
}

// ── The reeve ────────────────────────────────────────────────────────────────────

/** The camp reeve, seen over his shoulder with his face in profile, holding out the stolen sack of flour. */
function reeve(p: Painter): void {
  const woolLight = (x: number, y: number) => 0.18 + torchlight(x, y) * 0.75;
  // Back and shoulders, big in the foreground on the right.
  p.form([[214, 160], [220, 108], [238, 84], [276, 72], [312, 78], [324, 100], [324, 160]], {
    ramp: WOOL, light: folds(10, DOWN + 0.2, 0.12, woolLight), flow: along(DOWN + 0.15), count: 1800, len: [5, 13], width: [1, 2.6],
  });
  // The green tunic below, and a belt with a buckle.
  p.form([[220, 160], [222, 136], [324, 130], [324, 160]], {
    ramp: GREEN, light: folds(8, DOWN, 0.12, (x, y) => 0.25 + torchlight(x, y) * 0.6), flow: along(DOWN), count: 700, len: [4, 10], width: [0.9, 2.2], curved: false,
  });
  p.form([[221, 136], [324, 129], [324, 136], [221, 142]], { ramp: FUR, light: () => 0.2, flow: along(-0.06), count: 220, len: [4, 10], width: [0.8, 1.6], curved: false });
  p.form([[232, 135], [240, 134.5], [240, 141], [232, 141.5]], { ramp: GOLD, light: () => 0.6, flow: along(0), count: 40, len: [1, 3], width: [0.5, 1], curved: false });
  // The cape of the hood over his shoulders, falling in folds.
  p.form([[224, 112], [232, 84], [262, 70], [302, 73], [318, 96], [310, 122], [272, 128], [236, 126]], {
    ramp: WOOL,
    light: folds(12, DOWN, 0.18, (x, y) => woolLight(x, y) + 0.12 - (y - 70) / 300),
    flow: (x) => DOWN + (x - 270) / 120,
    count: 1700,
    len: [5, 13],
    width: [1, 2.4],
  });
  // The hood, from behind and a little to the side.
  p.form([[236, 66], [236, 36], [246, 18], [264, 6], [288, 0], [300, 16], [305, 48], [296, 76], [262, 84]], {
    ramp: WOOL,
    light: (x, y) => rounded(272, 42, 36, 40, 0.1, 0.7)(x, y) + torchlight(x, y) * 0.25,
    flow: (x, y) => Math.atan2(y - 80, x - 272) + Math.PI / 2,
    count: 1700,
    len: [4, 11],
    width: [1, 2.3],
  });
  p.mark([[268, 13], [276, 44], [283, 77]], WOOL[0] as Rgb, 1.1, 0.6);
  // Folds in the wool where the hood gathers round his face, and the light along its crown.
  for (const [a, b] of [[[252, 24], [256, 70]], [[258, 16], [266, 74]], [[290, 24], [296, 60]]] as const) p.mark([a, b], WOOL[1] as Rgb, 1.4, 0.55);
  p.mark([[248, 18], [266, 7], [286, 2], [298, 16]], WOOL[5] as Rgb, 1.2, 0.6);
  // The opening of the hood, in deep shadow, framing his face.
  p.form([[226, 34], [237, 22], [250, 26], [252, 70], [236, 75], [227, 60]], {
    ramp: WOOL, light: () => 0.05, flow: along(DOWN), count: 120, len: [3, 7], width: [1, 2],
  });
  // His face in profile, looking left at the warden: brow, nose, lips, a stubbled chin.
  const profile: Pt[] = [[240, 28], [235, 32], [233, 38], [232, 42], [227, 49], [230.5, 51.5], [230, 55], [232.5, 57.5], [231, 61], [233.5, 65], [240, 70], [247, 66], [247, 32]];
  p.form(profile, {
    ramp: SKIN,
    light: (x, y) => 0.3 + (247 - x) / 26 + torchlight(x, y) * 0.1 - Math.abs(y - 48) / 90,
    flow: along(DOWN),
    count: 700,
    len: [1.2, 3.5],
    width: [0.5, 1.2],
    curved: false,
  });
  p.glaze(236, 54, 5, hex('#b85038'), 0.25);
  p.mark([[234, 37], [239, 36]], SKIN[0] as Rgb, 1.1, 0.9);
  p.dot(237, 40, 1.1, 0.9, hex('#120c08'));
  p.mark([[230.5, 55], [233.5, 55.5]], SKIN[0] as Rgb, 0.8, 0.8);
  for (let k = 0; k < 40; k++) p.dot(233 + p.r(0, 11), 59 + p.r(0, 10), 0.4, 0.4, SKIN[0] as Rgb, 0.6);
  // The arm reaching forward, holding out the sack.
  p.form([[240, 98], [224, 86], [206, 82], [203, 96], [222, 108], [240, 116]], {
    ramp: WOOL, light: folds(5, 0.6, 0.12, (x, y) => 0.25 + torchlight(x, y) * 0.5 - (y - 82) / 80), flow: along(0.5), count: 500, len: [3, 8], width: [0.9, 2],
  });
  // The flour sack: coarse sacking, tied at the neck, flour dusting the bottom.
  const sack: Pt[] = [[166, 116], [172, 94], [188, 86], [208, 90], [216, 112], [210, 140], [188, 148], [168, 140]];
  const sackLight = rounded(196, 108, 30, 34, 0.12, 0.95);
  p.form(sack, { ramp: SACK, light: sackLight, flow: (x) => DOWN + (x - 192) / 60, count: 700, len: [5, 11], width: [1, 2.4], jitter: 0.04, bend: 0.2 });
  // The sack's creases where it hangs from his fist, and its shaded underside.
  for (const [a, b] of [[[186, 92], [178, 120]], [[196, 92], [196, 126]], [[204, 94], [208, 118]]] as const) p.mark([a, b], SACK[1] as Rgb, 1.2, 0.5);
  p.mark([[170, 138], [188, 146], [209, 139]], SACK[0] as Rgb, 2, 0.6);
  // The weave of the sacking, crossing.
  p.ctx.save();
  p.path(sack);
  p.ctx.clip();
  for (let k = 0; k < 500; k++) {
    const x = p.r(166, 216);
    const y = p.r(86, 148);
    p.stroke(x, y, k % 2 === 0 ? 0 : DOWN, 1.4, 0.35, ramp(SACK, sackLight(x, y) - 0.2), 0.3);
  }
  p.ctx.restore();
  p.form([[184, 90], [189, 76], [199, 79], [197, 90]], { ramp: SACK, light: () => 0.6, flow: along(DOWN), count: 120, len: [2, 5], width: [0.6, 1.2] });
  p.mark([[185, 90], [199, 88.5]], WOOL[1] as Rgb, 1.6);
  for (let k = 0; k < 60; k++) p.dot(p.r(172, 212), p.r(140, 156), p.r(0.4, 1.4), p.r(0.3, 0.8), SACK[5] as Rgb, 0.7);
  // His fist round the neck of the sack.
  p.form([[192, 83], [204, 79], [212, 85], [209, 96], [196, 95]], { ramp: SKIN, light: rounded(204, 86, 10, 9, 0.15, 0.85), flow: along(0.3), count: 260, len: [1.2, 3], width: [0.5, 1.1] });
  for (const x of [198, 202, 206]) p.mark([[x, 84], [x - 0.5, 93]], SKIN[1] as Rgb, 0.7, 0.8);
}

// ── Putting it together ──────────────────────────────────────────────────────────

/** Figures that have been painted, by the name events use. */
const FIGURES: Record<string, (p: Painter) => void> = { reeve };

export function hasFigure(name: string | undefined): boolean {
  return !!name && name in FIGURES;
}

/** Reduce to at most `n` colours taken from the picture itself (median cut), with a light ordered dither. */
function reduce(ctx: Ctx, n: number): void {
  const { w, h } = SCENE_SIZE;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const px: number[][] = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i] as number, d[i + 1] as number, d[i + 2] as number]);
  let boxes: number[][][] = [px];
  while (boxes.length < n) {
    // Split the box with the widest range of any channel at its median.
    let bi = 0;
    let best = -1;
    let bc = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const q of b) {
          const v = q[c] as number;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (hi - lo > best) {
          best = hi - lo;
          bi = i;
          bc = c;
        }
      }
    });
    if (best <= 0) break;
    const b = (boxes[bi] as number[][]).sort((a, c) => (a[bc] as number) - (c[bc] as number));
    const m = b.length >> 1;
    boxes = [...boxes.slice(0, bi), b.slice(0, m), b.slice(m), ...boxes.slice(bi + 1)];
  }
  const pal = boxes.map((b) => {
    const s = [0, 0, 0];
    for (const q of b) for (let c = 0; c < 3; c++) (s[c] as number) += q[c] as number;
    return s.map((v) => v / Math.max(1, b.length));
  });
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = ((bayer[(y & 3) * 4 + (x & 3)] as number) / 16 - 0.5) * 7;
      const r = (d[i] as number) + t;
      const g = (d[i + 1] as number) + t;
      const b = (d[i + 2] as number) + t;
      let bestK = 0;
      let bestD = Infinity;
      for (let k = 0; k < pal.length; k++) {
        const c = pal[k] as number[];
        const dist = 2 * (r - (c[0] as number)) ** 2 + 4 * (g - (c[1] as number)) ** 2 + 3 * (b - (c[2] as number)) ** 2;
        if (dist < bestD) {
          bestD = dist;
          bestK = k;
        }
      }
      const c = pal[bestK] as number[];
      d[i] = c[0] as number;
      d[i + 1] = c[1] as number;
      d[i + 2] = c[2] as number;
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

const painted = new Map<string, string>();

/** The whole picture for an event whose messenger is `figure`, or null if that figure hasn't been painted. */
export function hallScene(figure: string | undefined): HTMLCanvasElement | null {
  const draw = figure ? FIGURES[figure] : undefined;
  if (!figure || !draw) return null;
  const { w, h } = SCENE_SIZE;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d', { willReadFrequently: true });
  if (!octx) return null;
  // Painted once per figure, then kept.
  const cached = painted.get(figure);
  if (cached) {
    const img = new Image();
    img.onload = () => octx.drawImage(img, 0, 0);
    img.src = cached;
    return out;
  }
  const big = document.createElement('canvas');
  big.width = w * SCALE;
  big.height = h * SCALE;
  const ctx = big.getContext('2d');
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  const p = new Painter(ctx, 1729);
  wall(p);
  seatBack(p);
  warden(p);
  seatArm(p);
  draw(p);
  // The air of the hall: warm where the torch reaches, dark gathering in the corners.
  p.glaze(250, 40, 220, hex('#ffb870'), 0.1);
  const v = ctx.createRadialGradient(170, 70, 60, 170, 80, 240);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,4,2,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, w, h);
  reduce(octx, 128);
  painted.set(figure, out.toDataURL());
  return out;
}
