import type { Img } from './master.mjs';
export function image(width: number, height: number): Img;
export function encodePng(img: Img, text?: Record<string, string>): Buffer;
export function decodePng(bytes: Uint8Array): Img & { text: Record<string, string> };
