import type { Graphics } from 'pixi.js';
import { viewAngle } from './iso';
import { mix, shade } from './terrainStyle';

/**
 * One sun for the whole scene. Every surface that is shaded in code (wall and tower faces, their
 * tops, the drums of round towers, slopes and banks of the land) is lit from it by the way it
 * faces, and castle pieces, trees and rocks cast shadows away from it. Render only: the sim
 * never sees it, and it is not part of saved games.
 *
 * World directions: +x runs to the lower right of the screen, +y to the lower left, and up is
 * up. The camera looks from the +x +y side.
 */
export interface LightSettings {
  /** Where the sun is round the horizon, in degrees: 0 is straight out to the left of the screen, 90 behind the camera. */
  azimuth: number;
  /** How high the sun is, in degrees above the horizon. Lower makes longer shadows. */
  elevation: number;
  /** How bright a surface turned right away from the sun still is (0 to 1), from the light of the sky. */
  ambient: number;
  /** How much the sunlit side warms towards yellow and the shaded side cools towards blue (0 to 1). */
  warmth: number;
  /** How dark cast shadows are (0 to 1). */
  shadow: number;
}

export const DEFAULT_LIGHT: LightSettings = { azimuth: 10, elevation: 40, ambient: 0.66, warmth: 0.7, shadow: 0.4 };

/** The numbers the tuning panel can change, with their limits and steps. */
export const LIGHT_TUNABLE = {
  azimuth: { name: 'Sun direction (0 left, 90 behind you)', min: -30, max: 120, step: 1 },
  elevation: { name: 'Sun height', min: 15, max: 80, step: 1 },
  ambient: { name: 'Light on the shaded side', min: 0.3, max: 1, step: 0.01 },
  warmth: { name: 'Warm sun, cool shade', min: 0, max: 1, step: 0.01 },
  shadow: { name: 'Cast shadow darkness', min: 0, max: 0.8, step: 0.01 },
} as const;

/** Sunlit stone warms towards this, and stone in shade cools towards the other. */
const WARM = 0xfff0d8;
const COOL = 0xbccbe6;
/** Cast shadows are this colour, laid over the ground at the `shadow` strength. */
export const SHADOW_COLOUR = 0x141a2c;

let light: LightSettings = DEFAULT_LIGHT;

export function lightSettings(): LightSettings {
  return light;
}

/** Change the light. Everything drawn in world space has to be rebuilt afterwards. */
export function setLight(next: Partial<LightSettings>): void {
  light = { ...DEFAULT_LIGHT, ...next };
}

export type Vec3 = readonly [number, number, number];

/** The unit vector pointing at the sun, in world directions. */
export function sunVector(): Vec3 {
  const az = (light.azimuth * Math.PI) / 180;
  const el = (light.elevation * Math.PI) / 180;
  // Screen left is (-1, 1) in the world, and towards the camera is (1, 1).
  const hx = (-Math.cos(az) + Math.sin(az)) / Math.SQRT2;
  const hy = (Math.cos(az) + Math.sin(az)) / Math.SQRT2;
  return [hx * Math.cos(el), hy * Math.cos(el), Math.sin(el)];
}

/** How directly a surface facing along `n` (a unit vector) faces the sun: 1 square on, 0 edge on or turned away. */
function facing(n: Vec3): number {
  const s = sunVector();
  return Math.max(0, n[0] * s[0] + n[1] * s[1] + n[2] * s[2]);
}

/**
 * How directly the brightest face of a box faces the sun: its top or one of its two visible
 * sides. That face is drawn at full brightness (a drum turned right to the sun is no brighter).
 */
function brightest(): number {
  const [x, y, z] = sunVector();
  return Math.max(0.05, x, y, z);
}

/**
 * How bright a surface facing along `n` is drawn, from `ambient` (turned away from the sun) up
 * to 1 (the most sunlit thing in view). Painted art is drawn fully lit and darkened by this.
 */
export function surfaceLight(n: Vec3): number {
  const t = Math.min(1, facing(n) / brightest());
  return light.ambient + (1 - light.ambient) * t;
}

/** As `surfaceLight`, but not capped at 1, for comparing the land's slopes with flat ground. */
export function sunFacingLight(n: Vec3): number {
  return light.ambient + ((1 - light.ambient) * facing(n)) / brightest();
}

/**
 * The colour a surface facing along `n` is drawn in: `base` darkened by `surfaceLight`, warmed
 * where the sun is on it and cooled in shade. Used as a tint over painted art (base white) and
 * as the fill for stone drawn in flat colours.
 */
export function surfaceColour(n: Vec3, base = 0xffffff): number {
  const t = Math.min(1, facing(n) / brightest());
  const tint = t > 0.5 ? mix(0xffffff, WARM, light.warmth * (t - 0.5) * 2) : mix(0xffffff, COOL, light.warmth * (1 - t * 2));
  return shade(multiply(base, tint), light.ambient + (1 - light.ambient) * t);
}

function multiply(a: number, b: number): number {
  const ch = (s: number) => Math.round((((a >> s) & 0xff) * ((b >> s) & 0xff)) / 255) << s;
  return ch(16) | ch(8) | ch(0);
}

/** The faces of a box the camera sees, as unit normals. */
export const FACE = {
  top: [0, 0, 1] as Vec3,
  /** The face looking along +y, on the left of the screen. */
  left: [0, 1, 0] as Vec3,
  /** The face looking along +x, on the right of the screen. */
  right: [1, 0, 0] as Vec3,
};

/**
 * The outward normal of an upright surface at angle `a` round a drum, where `a` is measured on
 * the screen the way `Math.cos` and `Math.sin` trace an ellipse: 0 is the right edge, PI/2 the front.
 */
export function drumNormal(a: number): Vec3 {
  const c = Math.cos(a) / Math.SQRT2;
  const s = Math.sin(a) / Math.SQRT2;
  return [c + s, s - c, 0];
}

/** World tiles that one screen pixel of upright height stands, in the active view. */
export function tilesPerUprightPixel(): number {
  const { tileW, tileH } = viewAngle();
  // The view looks down at the angle whose sine is the diamond's squash; one tile is tileW / sqrt 2 pixels across.
  const cosPitch = Math.sqrt(Math.max(0.01, 1 - (tileH / tileW) ** 2));
  return 1 / (cosPitch * (tileW / Math.SQRT2));
}

/**
 * How far, in world tiles along x and y, a point one screen pixel above the ground casts its
 * shadow along the ground. Multiply by a height in pixels (a level is `levelPx()` pixels).
 */
export function shadowStep(): { x: number; y: number } {
  const [sx, sy, sz] = sunVector();
  const k = tilesPerUprightPixel() / Math.max(0.05, sz);
  return { x: -sx * k, y: -sy * k };
}

/** Where on the screen, relative to its foot, a point `height` screen pixels up casts its shadow. */
export function castOffset(height: number): { x: number; y: number } {
  const { tileW, tileH } = viewAngle();
  const step = shadowStep();
  const dx = step.x * height;
  const dy = step.y * height;
  return { x: ((dx - dy) * tileW) / 2, y: ((dx + dy) * tileH) / 2 };
}

/**
 * The shadow of something small and upright (a person, a cart) standing at (sx, sy): a soft
 * oval from its feet out along the light, `height` pixels tall, `rx` by `ry` at the foot.
 */
export function groundShadow(g: Graphics, sx: number, sy: number, rx: number, ry: number, height: number): void {
  const strength = light.shadow;
  if (strength <= 0) return;
  const mid = castOffset(height / 2);
  g.ellipse(sx + mid.x, sy + mid.y, rx + Math.abs(mid.x), ry + Math.abs(mid.y)).fill({ color: SHADOW_COLOUR, alpha: Math.min(0.6, strength * 0.9) });
}
