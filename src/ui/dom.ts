/** Tiny helpers for building panel DOM. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(text: string, onClick: () => void, cls?: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.addEventListener('click', onClick);
  return b;
}

/** Set text only when it changed, so the browser isn't asked to relayout every frame. */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function setClass(e: HTMLElement, cls: string): void {
  if (e.className !== cls) e.className = cls;
}

export function crowns(n: number): string {
  return Math.round(n).toLocaleString('en-GB');
}
