import { hash2 } from '../sim/noise';

/**
 * The picture above a messenger's letter: a close-up in the warden's hall, painted in code. The
 * warden broods in his carved seat on the left, chin on his fist; the messenger stands before him
 * on the right, seen over the shoulder. Shapes are painted smooth at 320×160, then reduced to a
 * small palette with ordered dithering, so it reads as old painted pixel art when shown at 2×.
 * Hand-made pictures can replace it later at the same size (see `hallScene`).
 */

export const SCENE_SIZE = { w: 320, h: 160 } as const;

type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];

/** The colours the picture is reduced to: ramps for stone, wood, skin, hair, cloth and gold. */
const PALETTE: readonly string[] = [
  // dark to light: shadows and stone
  '#0c0806', '#1c1410', '#2c241e', '#3e3630', '#544a42', '#6c6258', '#8a8072',
  // oak
  '#24160a', '#3a2412', '#55361c', '#74502c', '#94703e',
  // skin
  '#5a3020', '#80482c', '#a8663e', '#c88a5e', '#e0aa80', '#f0c8a0',
  // grey hair and beard
  '#4a4644', '#6e6a66', '#96928c', '#bebab2', '#e2ded6',
  // the warden's red
  '#3a0c0a', '#5e1410', '#86201a', '#ac3226', '#cc5038',
  // the warden's blue
  '#121a30', '#1e2c4c', '#2e426c', '#46608c',
  // gold
  '#5a4012', '#8a6420', '#b88e30', '#e0be52', '#f6e29a',
  // the reeve's hood and tunic: brown and green
  '#2a2012', '#43341c', '#5e4a2a', '#7c643a', '#2a3418', '#3e4c24', '#5a6a34',
  // flour sack
  '#8c8060', '#b4a882', '#d8ceaa', '#f2ecd6',
  // window light and torch glow
  '#26384a', '#3c5a70', '#6a8ca0', '#f0a040', '#ffd27a',
];

const RGB = PALETTE.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Reduce the painting to the palette, with a 4×4 ordered dither for the in-between shades. */
function quantise(ctx: Ctx): void {
  const { w, h } = SCENE_SIZE;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // The dither, plus a little grain so broad areas read as brushwork rather than flat fills.
      const t = ((BAYER[(y & 3) * 4 + (x & 3)] as number) / 16 - 0.5) * 16 + (hash2(x >> 1, y, 31) - 0.5) * 8;
      const r = (d[i] as number) + t;
      const g = (d[i + 1] as number) + t;
      const b = (d[i + 2] as number) + t;
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < RGB.length; k++) {
        const c = RGB[k] as readonly [number, number, number];
        // Weighted towards green, as the eye is.
        const dist = 2 * (r - c[0]) ** 2 + 4 * (g - c[1]) ** 2 + 3 * (b - c[2]) ** 2;
        if (dist < bestD) {
          bestD = dist;
          best = k;
        }
      }
      const c = RGB[best] as readonly [number, number, number];
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

function shape(ctx: Ctx, fill: string | CanvasGradient, pts: readonly Pt[], curved = true): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  if (!curved || pts.length < 3) {
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  } else {
    // A smooth closed curve through the points (midpoint quadratics).
    const n = pts.length;
    const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const start = mid(pts[n - 1] as Pt, pts[0] as Pt);
    ctx.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i] as Pt;
      const m = mid(p, pts[(i + 1) % n] as Pt);
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function ellipse(ctx: Ctx, fill: string | CanvasGradient, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: Ctx, colour: string, width: number, pts: readonly Pt[]): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: readonly [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: readonly [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** The back wall in torchlight: big dressed stones, a tall window, and the warden's banner. */
function wall(ctx: Ctx): void {
  const { w, h } = SCENE_SIZE;
  ctx.fillStyle = '#3a322c';
  ctx.fillRect(0, 0, w, h);
  for (let row = 0; row < 8; row++) {
    const y = row * 20;
    for (let k = -1; k < 10; k++) {
      const x = k * 38 + (row % 2) * 19;
      const n = hash2(k, row, 3);
      ctx.fillStyle = `rgb(${70 + n * 26},${62 + n * 22},${54 + n * 20})`;
      ctx.fillRect(x + 1, y + 1, 36, 18);
      ctx.fillStyle = 'rgba(255,230,200,0.08)';
      ctx.fillRect(x + 1, y + 1, 36, 2);
    }
  }
  // The tall window, centre right, with cool daylight.
  shape(ctx, '#1c1410', [[176, 160], [176, 30], [181, 14], [196, 6], [211, 14], [216, 30], [216, 160]], false);
  ctx.fillStyle = linear(ctx, 0, 10, 0, 150, [[0, '#7a9cb0'], [1, '#3c5a70']]);
  ctx.beginPath();
  ctx.moveTo(181, 160);
  ctx.lineTo(181, 32);
  ctx.quadraticCurveTo(183, 12, 196, 11);
  ctx.quadraticCurveTo(209, 12, 211, 32);
  ctx.lineTo(211, 160);
  ctx.fill();
  line(ctx, '#1c1410', 3, [[196, 12], [196, 160]]);
  line(ctx, '#1c1410', 2, [[181, 70], [211, 70]]);
  line(ctx, '#1c1410', 2, [[181, 110], [211, 110]]);
  // The banner hanging behind the seat: red with the gold tower.
  ctx.fillStyle = '#5e1410';
  ctx.fillRect(16, 0, 70, 80);
  ctx.fillStyle = linear(ctx, 16, 0, 86, 0, [[0, '#ac3226'], [0.6, '#86201a'], [1, '#3a0c0a']]);
  ctx.fillRect(19, 0, 64, 77);
  ctx.fillStyle = '#b88e30';
  ctx.fillRect(16, 77, 70, 3);
  // The light: warm from a torch off to the right, darker towards the left corners.
  ctx.fillStyle = radial(ctx, 260, 40, 10, 260, [[0, 'rgba(255,190,110,0.28)'], [0.5, 'rgba(255,160,80,0.06)'], [1, 'rgba(0,0,0,0.45)']]);
  ctx.fillRect(0, 0, w, h);
}

/** The carved oak seat behind the warden, and its front arm. */
function seatBack(ctx: Ctx): void {
  shape(ctx, '#24160a', [[30, 160], [26, 40], [40, 8], [92, 2], [150, 10], [160, 44], [156, 160]], true);
  shape(ctx, linear(ctx, 30, 0, 160, 0, [[0, '#3a2412'], [0.5, '#74502c'], [1, '#3a2412']]), [[36, 160], [32, 44], [44, 14], [92, 8], [144, 16], [152, 46], [150, 160]], true);
  // Carving: tall linenfold panels, each with its folds catching the light.
  for (let k = 0; k < 4; k++) {
    const x = 46 + k * 26;
    ctx.fillStyle = '#24160a';
    ctx.fillRect(x - 1, 18, 22, 76);
    ctx.fillStyle = '#55361c';
    ctx.fillRect(x, 19, 20, 74);
    for (const f of [3, 9, 15]) {
      line(ctx, '#94703e', 1.4, [[x + f, 22], [x + f, 90]]);
      line(ctx, '#24160a', 1.2, [[x + f + 2.5, 22], [x + f + 2.5, 90]]);
    }
    ctx.fillStyle = '#74502c';
    ctx.fillRect(x, 19, 20, 3);
  }
  // Gilded finials at the top corners.
  for (const fx of [40, 144]) {
    ellipse(ctx, '#5a4012', fx, 10, 6, 7);
    ellipse(ctx, '#e0be52', fx - 1, 8, 3, 4);
  }
}

function seatArm(ctx: Ctx): void {
  // The arm of the seat: a straight oak rail, and the post below it with a carved knob.
  shape(ctx, '#24160a', [[0, 120], [74, 116], [76, 130], [0, 134]], false);
  shape(ctx, linear(ctx, 0, 117, 0, 132, [[0, '#94703e'], [0.4, '#74502c'], [1, '#3a2412']]), [[0, 121], [73, 117.5], [74, 128.5], [0, 132]], false);
  shape(ctx, linear(ctx, 56, 0, 76, 0, [[0, '#3a2412'], [0.4, '#74502c'], [1, '#24160a']]), [[56, 130], [74, 128], [74, 160], [56, 160]], false);
  for (const y of [140, 150]) line(ctx, '#24160a', 1.5, [[57, y], [73, y - 1]]);
  ellipse(ctx, '#24160a', 72, 120, 9, 8);
  ellipse(ctx, '#74502c', 71, 119, 7.5, 6.5);
  ellipse(ctx, '#94703e', 69, 116, 3.5, 2.5);
}

/** A strip of fur along a path: a soft brown band with dark flecks and light tips. */
function fur(ctx: Ctx, pts: readonly Pt[], width: number, seed: number): void {
  line(ctx, '#43341c', width + 2, pts);
  line(ctx, '#7c643a', width, pts);
  line(ctx, '#94703e', width * 0.35, pts.map(([x, y]) => [x - 1, y - 1] as Pt));
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i] as Pt;
    const [bx, by] = pts[i + 1] as Pt;
    for (let k = 0; k < 6; k++) {
      const t = hash2(i, k, seed);
      const off = (hash2(k, i, seed + 1) - 0.5) * width;
      ellipse(ctx, '#2a2012', ax + (bx - ax) * t + off * 0.3, ay + (by - ay) * t + off, 0.8, 1.2);
    }
  }
}

/** The warden: grey, heavy-browed and out of patience, chin on his fist, in a red cloak over blue. */
function warden(ctx: Ctx): void {
  // Cloak and body.
  shape(ctx, '#3a0c0a', [[34, 160], [40, 112], [58, 92], [92, 82], [134, 86], [160, 104], [170, 160]], true);
  shape(ctx, linear(ctx, 40, 90, 170, 150, [[0, '#cc5038'], [0.35, '#ac3226'], [0.7, '#86201a'], [1, '#3a0c0a']]), [[40, 160], [44, 114], [60, 96], [92, 87], [132, 90], [156, 106], [164, 160]], true);
  // The blue robe at the chest, in the opening of the cloak.
  shape(ctx, linear(ctx, 90, 90, 140, 160, [[0, '#46608c'], [0.5, '#2e426c'], [1, '#121a30']]), [[86, 160], [92, 104], [108, 92], [126, 96], [134, 116], [130, 160]], true);
  // Fur along the cloak's edges and round the shoulders.
  fur(ctx, [[58, 98], [74, 91], [92, 88], [108, 90]], 8, 21);
  fur(ctx, [[122, 92], [138, 96], [154, 108]], 8, 22);
  fur(ctx, [[92, 98], [90, 120], [88, 160]], 7, 23);
  fur(ctx, [[130, 100], [132, 128], [130, 160]], 7, 24);
  // The chain of office across the chest, with a pendant.
  for (let t = 0; t <= 1; t += 0.07) {
    const x = 96 + t * 34;
    const y = 100 + Math.sin(t * Math.PI) * 14;
    ellipse(ctx, '#8a6420', x, y, 2.4, 1.8);
    ellipse(ctx, '#e0be52', x - 0.5, y - 0.5, 1.2, 1);
  }
  ellipse(ctx, '#8a6420', 113, 118, 5, 6);
  ellipse(ctx, '#e0be52', 112, 117, 3, 4);
  ellipse(ctx, '#86201a', 112, 118, 1.6, 2);

  // The arm propping the head: from the elbow on the seat's arm up to the fist under the chin.
  shape(ctx, '#3a0c0a', [[60, 122], [66, 110], [112, 80], [128, 92], [80, 128], [66, 130]], true);
  shape(ctx, linear(ctx, 66, 128, 124, 82, [[0, '#5e1410'], [0.5, '#ac3226'], [1, '#cc5038']]), [[63, 121], [69, 112], [113, 84], [125, 92], [80, 125], [68, 127]], true);
  line(ctx, '#5e1410', 1.4, [[78, 112], [92, 108]]);
  line(ctx, '#5e1410', 1.4, [[86, 118], [102, 104]]);
  // A gold-edged cuff at the wrist.
  shape(ctx, '#8a6420', [[110, 84], [118, 78], [128, 88], [121, 95]], true);
  shape(ctx, '#e0be52', [[112, 84], [118, 80], [125, 88], [120, 92]], true);

  // Head: three-quarter view looking right, a little down.
  const hx = 118;
  const hy = 50;
  // Hair at the back and sides, swept back, thinning on top.
  shape(ctx, '#4a4644', [[96, 30], [104, 18], [122, 14], [136, 20], [140, 36], [138, 58], [126, 66], [100, 62], [92, 46]], true);
  shape(ctx, linear(ctx, 96, 20, 140, 60, [[0, '#bebab2'], [0.5, '#96928c'], [1, '#4a4644']]), [[98, 32], [106, 20], [122, 17], [134, 22], [137, 36], [134, 56], [104, 58], [95, 46]], true);
  // The face.
  shape(ctx, '#80482c', [[108, 30], [126, 22], [140, 30], [144, 48], [140, 66], [130, 80], [116, 80], [108, 64], [104, 46]], true);
  shape(ctx, radial(ctx, hx + 12, hy - 6, 2, 30, [[0, '#f0c8a0'], [0.35, '#e0aa80'], [0.7, '#c88a5e'], [1, '#80482c']]), [[110, 31], [126, 24], [138, 31], [142, 48], [138, 64], [129, 77], [117, 77], [110, 63], [106, 46]], true);
  // Ear on the far side, in shadow.
  ellipse(ctx, '#a8663e', 106, 50, 4, 7);
  ellipse(ctx, '#5a3020', 107, 51, 1.5, 3);
  // Brow: heavy, drawn down into a scowl.
  shape(ctx, '#a8663e', [[116, 38], [128, 40], [142, 36], [143, 42], [130, 46], [117, 43]], false);
  line(ctx, '#e2ded6', 2.4, [[115, 40], [123, 41], [129, 44]]);
  line(ctx, '#e2ded6', 2.4, [[133, 43], [138, 39], [143, 38]]);
  line(ctx, '#5a3020', 1, [[127, 37], [129, 41]]);
  line(ctx, '#5a3020', 1, [[131, 36], [131, 40]]);
  // Eyes, deep set, glaring at the messenger.
  ellipse(ctx, '#5a3020', 125, 47, 4, 2.2);
  ellipse(ctx, '#5a3020', 139, 46, 3, 2);
  ellipse(ctx, '#e2ded6', 126, 47, 2.4, 1.3);
  ellipse(ctx, '#e2ded6', 139.5, 46, 1.6, 1.1);
  ellipse(ctx, '#1c1410', 127.3, 47, 1.1, 1.2);
  ellipse(ctx, '#1c1410', 140.4, 46, 0.9, 1.1);
  line(ctx, '#80482c', 1, [[121, 50], [126, 51.5], [130, 50]]);
  // Nose: long, with a shadowed side.
  shape(ctx, '#c88a5e', [[134, 46], [140, 58], [144, 62], [139, 64], [134, 62]], false);
  shape(ctx, '#80482c', [[134, 48], [134, 62], [138, 64], [132, 63]], false);
  ellipse(ctx, '#5a3020', 139, 63, 2, 1);
  line(ctx, '#80482c', 1, [[128, 52], [131, 58]]);
  // Beard and moustache, grey, down over the fist.
  shape(ctx, '#4a4644', [[110, 58], [118, 66], [130, 66], [140, 64], [146, 68], [144, 80], [136, 92], [122, 94], [112, 84], [108, 70]], true);
  shape(ctx, linear(ctx, 110, 60, 140, 94, [[0, '#e2ded6'], [0.4, '#bebab2'], [0.8, '#96928c'], [1, '#6e6a66']]), [[112, 60], [119, 67], [130, 67], [139, 65], [144, 69], [142, 80], [134, 90], [123, 91], [114, 83], [110, 70]], true);
  for (let k = 0; k < 14; k++) {
    const x = 114 + hash2(k, 1, 5) * 28;
    const y = 70 + hash2(k, 2, 5) * 16;
    line(ctx, hash2(k, 3, 5) > 0.5 ? '#6e6a66' : '#e2ded6', 1, [[x, y], [x + 1, y + 5]]);
  }
  // The moustache drooping over a turned-down mouth.
  shape(ctx, '#e2ded6', [[126, 66], [134, 64], [143, 66], [145, 72], [140, 70], [133, 69], [127, 72]], true);
  line(ctx, '#5a3020', 1.2, [[131, 72], [136, 71], [140, 73]]);

  // The fist, knuckles up, under the beard.
  shape(ctx, '#5a3020', [[118, 82], [132, 78], [146, 84], [148, 96], [138, 100], [122, 96]], true);
  shape(ctx, radial(ctx, 138, 84, 1, 18, [[0, '#f0c8a0'], [0.5, '#c88a5e'], [1, '#80482c']]), [[120, 83], [132, 80], [144, 85], [146, 95], [138, 98], [123, 95]], true);
  for (const x of [128, 134, 140]) line(ctx, '#80482c', 1, [[x, 84], [x + 1, 95]]);
  // A gold ring.
  ellipse(ctx, '#e0be52', 141, 91, 2, 1.4);

  // The other hand resting on the arm of the seat.
  shape(ctx, '#80482c', [[40, 128], [56, 124], [66, 130], [60, 138], [42, 138]], true);
  shape(ctx, '#c88a5e', [[42, 128], [55, 125], [63, 130], [58, 135], [44, 135]], true);
}

/** The camp reeve, seen over his shoulder with his face in profile, holding out the stolen sack of flour. */
function reeve(ctx: Ctx): void {
  // Back and shoulders, big in the foreground on the right.
  shape(ctx, '#1c1410', [[214, 160], [220, 108], [238, 84], [276, 72], [312, 78], [322, 100], [322, 160]], true);
  shape(ctx, linear(ctx, 220, 74, 320, 160, [[0, '#5e4a2a'], [0.5, '#43341c'], [1, '#2a2012']]), [[220, 160], [224, 110], [240, 88], [276, 76], [310, 81], [320, 102], [320, 160]], true);
  // The green tunic and a belt.
  shape(ctx, linear(ctx, 220, 132, 320, 160, [[0, '#5a6a34'], [1, '#2a3418']]), [[220, 160], [222, 134], [320, 128], [320, 160]], false);
  shape(ctx, '#1c1410', [[221, 136], [320, 130], [320, 136], [221, 142]], false);
  ellipse(ctx, '#8a6420', 236, 138, 4, 3);
  // The cape of the hood over the shoulders, with folds.
  shape(ctx, '#2a2012', [[224, 112], [232, 84], [262, 70], [302, 74], [318, 96], [310, 122], [272, 128], [236, 126]], true);
  shape(ctx, linear(ctx, 230, 72, 300, 128, [[0, '#7c643a'], [0.45, '#5e4a2a'], [1, '#43341c']]), [[227, 112], [234, 87], [262, 74], [300, 77], [314, 96], [307, 119], [272, 124], [238, 122]], true);
  for (const [a, b] of [[[250, 84], [244, 118]], [[270, 80], [268, 122]], [[292, 82], [298, 116]]] as const) line(ctx, '#2a2012', 1.6, [a, b]);
  line(ctx, '#94703e', 1.2, [[236, 90], [258, 78], [280, 76]]);
  // The hood.
  shape(ctx, '#1c1410', [[236, 66], [236, 36], [250, 14], [276, 8], [298, 20], [304, 48], [296, 76], [262, 84]], true);
  shape(ctx, linear(ctx, 236, 12, 300, 80, [[0, '#94703e'], [0.35, '#7c643a'], [0.7, '#5e4a2a'], [1, '#43341c']]), [[239, 66], [240, 37], [252, 17], [275, 11], [295, 22], [300, 48], [293, 73], [263, 80]], true);
  line(ctx, '#43341c', 1.4, [[268, 14], [276, 44], [282, 76]]);
  line(ctx, '#43341c', 1.2, [[290, 28], [294, 60]]);
  // The opening of the hood, in shadow, and his face in profile looking left at the warden.
  shape(ctx, '#1c1410', [[226, 34], [238, 22], [250, 26], [252, 70], [236, 74], [228, 60]], true);
  shape(ctx, '#80482c', [[240, 28], [248, 30], [250, 50], [248, 70], [238, 72], [236, 40]], true);
  shape(
    ctx,
    linear(ctx, 226, 0, 250, 0, [[0, '#e0aa80'], [0.5, '#c88a5e'], [1, '#80482c']]),
    [[238, 30], [234, 36], [232, 42], [227, 50], [231, 52], [230, 56], [233, 59], [231, 62], [234, 66], [240, 70], [246, 64], [246, 34]],
    false,
  );
  // Eye, brow, and a few days' stubble.
  line(ctx, '#5a3020', 1.4, [[235, 38], [240, 37]]);
  ellipse(ctx, '#1c1410', 237, 41, 1.2, 1);
  line(ctx, '#5a3020', 1, [[231, 56], [234, 56]]);
  for (let k = 0; k < 10; k++) ellipse(ctx, '#5a3020', 233 + hash2(k, 4, 11) * 10, 60 + hash2(k, 5, 11) * 9, 0.6, 0.6);
  // The arm reaching forward to hold out the sack.
  shape(ctx, '#1c1410', [[238, 96], [222, 86], [206, 84], [204, 96], [222, 108], [240, 114]], true);
  shape(ctx, linear(ctx, 206, 88, 240, 110, [[0, '#7c643a'], [1, '#43341c']]), [[237, 98], [222, 89], [208, 87], [206, 94], [222, 104], [238, 110]], true);
  // The flour sack, tied at the neck, with flour on it.
  shape(ctx, '#5e4a2a', [[166, 116], [172, 94], [188, 86], [208, 90], [216, 112], [210, 140], [188, 148], [168, 140]], true);
  shape(ctx, radial(ctx, 182, 104, 2, 34, [[0, '#f2ecd6'], [0.4, '#d8ceaa'], [0.8, '#b4a882'], [1, '#8c8060']]), [[168, 116], [174, 96], [189, 89], [206, 92], [213, 112], [208, 138], [188, 145], [170, 138]], true);
  line(ctx, '#8c8060', 1.2, [[178, 100], [176, 130]]);
  line(ctx, '#8c8060', 1.2, [[196, 98], [200, 132]]);
  shape(ctx, '#b4a882', [[184, 90], [188, 78], [198, 80], [196, 90]], true);
  line(ctx, '#43341c', 2, [[182, 90], [200, 88]]);
  for (let k = 0; k < 6; k++) ellipse(ctx, '#f2ecd6', 176 + hash2(k, 7, 9) * 34, 146 + hash2(k, 8, 9) * 12, 2, 1);
  // His fist round the neck of the sack.
  shape(ctx, '#5a3020', [[192, 84], [204, 80], [212, 86], [209, 96], [196, 95]], true);
  shape(ctx, '#c88a5e', [[194, 85], [204, 82], [209, 87], [206, 93], [197, 92]], true);
  line(ctx, '#80482c', 1, [[199, 85], [199, 92]]);
}

/** Figures that have been painted, by the name events use. */
const FIGURES: Record<string, (ctx: Ctx) => void> = { reeve };

export function hasFigure(name: string | undefined): boolean {
  return !!name && name in FIGURES;
}

/** The whole picture for an event whose messenger is `figure`, or null if that figure hasn't been painted. */
export function hallScene(figure: string | undefined): HTMLCanvasElement | null {
  const draw = figure ? FIGURES[figure] : undefined;
  if (!draw) return null;
  const c = document.createElement('canvas');
  c.width = SCENE_SIZE.w;
  c.height = SCENE_SIZE.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  wall(ctx);
  seatBack(ctx);
  warden(ctx);
  seatArm(ctx);
  draw(ctx);
  // Torchlight on the near side of both faces, and the dark gathering at the edges.
  ctx.fillStyle = radial(ctx, 170, 60, 20, 220, [[0, 'rgba(255,200,130,0.10)'], [1, 'rgba(0,0,0,0.38)']]);
  ctx.fillRect(0, 0, c.width, c.height);
  quantise(ctx);
  return c;
}
