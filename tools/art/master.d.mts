// Types for the art master tools, so the tests can use them.
export interface Img {
  width: number;
  height: number;
  rgba: Uint8Array;
}
export interface Block {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tiles: boolean;
}
export interface Layout {
  version: 1;
  scale: number;
  width: number;
  height: number;
  blocks: Block[];
}
export interface Art {
  manifest: { sheets: Record<string, Record<string, unknown[]>>; textures: Record<string, string> };
  images: Record<string, Img>;
  sizes: Record<string, { width: number; height: number }>;
}
export const KEY: number;
export const LAYOUT_KEY: string;
export function readArt(dir: string): Art;
export function drawMaster(art: Art, options?: { scale?: number; legend?: boolean }): { img: Img; layout: Layout };
export function splitMaster(master: Img, layout: Layout, fallback?: Record<string, Img>): { images: Record<string, Img>; problems: string[] };
export function layoutFor(master: Img & { text?: Record<string, string> }, art: Art, scale?: number): { layout: Layout; from: string };
