/** Scale an RGB colour's brightness. (Colours themselves live in the visual styles, src/render/styles/.) */
export function shade(colour: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((colour >> 16) & 0xff) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((colour >> 8) & 0xff) * f)));
  const b = Math.min(255, Math.max(0, Math.round((colour & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
}

/** Blend from colour a towards b by t (0 to 1). */
export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}
