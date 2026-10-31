// People: the six worker trades, the garrison's swordsmen and archers, and raiders. Each is drawn
// facing right on a 16 × 23 canvas with the feet at the bottom middle; the game mirrors them to face
// left. Light from the upper left, with a dark outline.
import { image, put } from './png.mjs';
import { line, rect, rim, scale } from './kit.mjs';

const W = 16;
const H = 23;
const CX = 7;
const FEET = 21;

const INK = 0x15110d;
const SKIN = 0xd8a47a;
const LEGS = 0x2e261d;
const WOOD = 0x5e3f22;
const IRON = 0x8c8c8c;
const STEEL = 0xd0d0d0;

/** What each kind of person wears and carries. */
export const PEOPLE = {
  labourer: { body: 0x8a7a55, hat: 'none', tool: 'spade' },
  digger: { body: 0x5e4426, hat: 'none', tool: 'spade' },
  carter: { body: 0x355a7d, hat: 'cap', tool: 'none' },
  quarryman: { body: 0x6e6e6e, hat: 'cap', tool: 'pick' },
  mason: { body: 0xc8bf9e, hat: 'cap', tool: 'hammer' },
  carpenter: { body: 0x82501f, hat: 'none', tool: 'hammer' },
  swordsman: { body: 0xc4281c, stripe: 0xe8d9a8, hat: 'helm', tool: 'sword', shield: true },
  archer: { body: 0xc4281c, stripe: 0xe8d9a8, hat: 'helm', tool: 'bow' },
  raider: { body: 0x2f3c66, hat: 'hood', tool: 'axe' },
  raiderArcher: { body: 0x2f3c66, hat: 'hood', tool: 'bow' },
  // Siege raiders (M6): sappers in leather caps with picks; ladder crews with hatchets (the ladder
  // they carry is drawn by the game, since it changes with what they're doing).
  sapper: { body: 0x3b4252, hat: 'cap', tool: 'pick' },
  ladderCrew: { body: 0x34466a, hat: 'cap', tool: 'axe' },
};

/** The poses each kind has, and how many frames each. */
export function posesFor(kind) {
  const worker = !['swordsman', 'archer', 'raider', 'raiderArcher', 'sapper', 'ladderCrew'].includes(kind);
  if (kind === 'carter') return { walk: 4, sit: 1 };
  if (worker) return { work: 4, sit: 1 };
  const bow = PEOPLE[kind].tool === 'bow';
  return bow ? { stand: 1, walk: 4, shoot: 2 } : { stand: 1, walk: 4, fight: 3 };
}

function tool(img, kind, hx, hy, angle, frame, pose) {
  const t = PEOPLE[kind].tool;
  const reach = (len) => [Math.round(hx + Math.cos(angle) * len), Math.round(hy + Math.sin(angle) * len)];
  if (t === 'spade') {
    const [ex, ey] = reach(7);
    line(img, hx, hy, ex, ey, WOOD);
    rect(img, ex - 1, ey - 1, 2, 3, IRON);
  } else if (t === 'pick') {
    const [ex, ey] = reach(6);
    line(img, hx, hy, ex, ey, WOOD);
    line(img, ex - 2, ey + 1, ex + 2, ey - 1, IRON);
  } else if (t === 'hammer') {
    const [ex, ey] = reach(5);
    line(img, hx, hy, ex, ey, WOOD);
    rect(img, ex - 1, ey - 1, 3, 2, kind === 'mason' ? 0x9a9a9a : WOOD);
  } else if (t === 'sword') {
    const [ex, ey] = reach(7);
    line(img, hx, hy, ex, ey, STEEL);
    put(img, hx, hy, 0x6b4a1a);
  } else if (t === 'axe') {
    const [ex, ey] = reach(7);
    line(img, hx, hy, ex, ey, WOOD);
    rect(img, ex - 1, ey - 1, 3, 3, 0x6f6f6f);
  } else if (t === 'bow') {
    // A bow held upright in front; drawn back when shooting.
    const bx = hx + 2;
    for (let dy = -5; dy <= 5; dy++) put(img, bx + (Math.abs(dy) < 3 ? 1 : 0), hy + dy, WOOD);
    const pull = pose === 'shoot' && frame === 1 ? 3 : 0;
    line(img, bx, hy - 5, bx - pull, hy, 0xe8e2d0);
    line(img, bx - pull, hy, bx, hy + 5, 0xe8e2d0);
  }
}

/** One frame of one kind of person in one pose. */
export function person(kind, pose, frame) {
  const p = PEOPLE[kind];
  const img = image(W, H);
  const sit = pose === 'sit';
  const walking = pose === 'walk';
  const busy = pose === 'work' || pose === 'fight' || pose === 'shoot';
  // Bending to dig: the body drops a pixel on the down-stroke.
  const bend = pose === 'work' && (p.tool === 'spade' || p.tool === 'pick') && frame >= 2 ? 1 : 0;
  const hip = sit ? FEET - 3 : FEET - 6 + bend;
  const shoulder = hip - 6;
  const headTop = shoulder - 5;

  // Legs: a stride when walking, seated with knees out when sitting.
  if (sit) {
    rect(img, CX - 2, FEET - 2, 7, 2, LEGS);
  } else {
    const stride = walking ? [-2, 0, 2, 0][frame] : 0;
    line(img, CX - 1, hip, CX - 1 + stride, FEET, LEGS);
    line(img, CX, hip, CX, FEET, LEGS);
    line(img, CX + 2, hip, CX + 2 - stride, FEET, scale(LEGS, 0.8));
    line(img, CX + 1, hip, CX + 1, FEET, scale(LEGS, 0.8));
  }
  // The body: lit on the left, shaded on the right, with a belt.
  for (let y = shoulder; y <= hip; y++)
    for (let x = CX - 2; x <= CX + 3; x++) {
      let c = p.body;
      if (x === CX - 2) c = scale(c, 1.15);
      if (x >= CX + 2) c = scale(c, 0.78);
      if (y === hip - 1 && !p.stripe) c = scale(p.body, 0.55);
      if (p.stripe && y === shoulder + 2) c = x >= CX + 2 ? scale(p.stripe, 0.8) : p.stripe;
      put(img, x, y, c);
    }
  // The head and what's on it.
  rect(img, CX - 1, headTop + 1, 4, 4, SKIN);
  put(img, CX + 2, headTop + 3, scale(SKIN, 0.8));
  put(img, CX + 2, headTop + 4, scale(SKIN, 0.8));
  if (p.hat === 'helm') {
    rect(img, CX - 2, headTop, 6, 2, 0xa0a0a0);
    put(img, CX - 2, headTop, 0xc8c8c8);
    line(img, CX + 1, headTop + 2, CX + 1, headTop + 3, 0x8a8a8a); // nose guard
  } else if (p.hat === 'hood') {
    rect(img, CX - 2, headTop, 6, 2, 0x1c1d26);
    put(img, CX - 2, headTop + 2, 0x1c1d26);
    put(img, CX - 2, headTop + 3, 0x1c1d26);
    put(img, CX, headTop - 1, 0x1c1d26);
  } else if (p.hat === 'cap') {
    rect(img, CX - 1, headTop, 4, 1, scale(p.body, 0.7));
    put(img, CX + 3, headTop + 1, scale(p.body, 0.7));
  } else {
    rect(img, CX - 1, headTop, 4, 1, 0x4a3524); // hair
    put(img, CX - 1, headTop + 1, 0x4a3524);
  }
  // The back arm.
  line(img, CX - 2, shoulder + 1, CX - 3, shoulder + 4, scale(p.body, 0.9));
  put(img, CX - 3, shoulder + 5, SKIN);
  // The front arm and what it holds.
  const hx = CX + 4;
  const hy = shoulder + 2;
  if (sit) {
    put(img, hx - 1, hy + 2, SKIN);
  } else if (p.tool === 'bow') {
    line(img, CX + 3, shoulder + 1, hx, hy, scale(p.body, 0.85));
    tool(img, kind, hx, hy, 0, frame, pose);
  } else if (p.tool !== 'none') {
    // Swinging: raised back on the first frames, coming down on the later ones.
    const swings = busy ? [-1.9, -1.2, -0.3, 0.5] : [-0.6];
    const angle = swings[Math.min(frame, swings.length - 1)] ?? -0.6;
    line(img, CX + 3, shoulder + 1, hx, hy, scale(p.body, 0.85));
    put(img, hx, hy, SKIN);
    tool(img, kind, hx, hy, busy ? angle : walking ? -1.2 : -1.4, frame, pose);
  } else {
    line(img, CX + 3, shoulder + 1, CX + 4, shoulder + 4, scale(p.body, 0.85));
    put(img, CX + 4, shoulder + 5, SKIN);
  }
  if (p.shield) {
    // A round wooden shield on the back arm, with an iron boss.
    rect(img, CX - 5, shoulder + 1, 3, 5, WOOD);
    put(img, CX - 6, shoulder + 2, WOOD);
    put(img, CX - 6, shoulder + 3, WOOD);
    put(img, CX - 6, shoulder + 4, WOOD);
    put(img, CX - 4, shoulder + 3, STEEL);
  }
  rim(img, INK);
  return { img, ax: CX, ay: FEET };
}

/** The carter's hand-cart, empty or loaded with stone. Its handles are at the left, where the carter walks. */
export function cart(loaded) {
  const img = image(21, 15);
  const bed = 0x6e5232;
  rect(img, 3, 6, 14, 4, bed);
  line(img, 3, 6, 16, 6, scale(bed, 1.25));
  line(img, 3, 9, 16, 9, scale(bed, 0.7));
  for (let x = 6; x < 16; x += 4) line(img, x, 6, x, 9, scale(bed, 0.8));
  line(img, 0, 8, 3, 8, WOOD); // handles
  // The wheel.
  for (const [x, y] of [[10, 10], [11, 10], [9, 11], [12, 11], [9, 12], [12, 12], [10, 13], [11, 13]]) put(img, x, y, 0x3a2e22);
  put(img, 10, 11, 0x5e4a36);
  put(img, 11, 12, 0x5e4a36);
  if (loaded)
    for (const [x, y] of [[4, 3], [9, 3], [7, 1]]) {
      rect(img, x, y, 4, 3, 0xa3a098);
      line(img, x, y, x + 3, y, 0xc0bdb4);
      line(img, x, y + 2, x + 3, y + 2, 0x7d7a72);
    }
  rim(img, INK);
  return { img, ax: 2, ay: 13 };
}
