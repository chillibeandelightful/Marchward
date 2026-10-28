import { TUNABLE, VIEWS, viewAngle, type Tunable, type ViewId, type ViewTuning } from '../render/iso';
import { button, el, setText } from './dom';

/** Tuning-panel changes for each view. Kept per browser, not in saves. */
export type Tuning = Partial<Record<ViewId, ViewTuning>>;

const KEY = 'marchward.viewTuning';

/** Read stored tuning, keeping only known views and numbers within each setting's limits. */
export function parseTuning(text: string | null): Tuning {
  let raw: unknown = {};
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    // Unreadable: no tuning.
  }
  const out: Tuning = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(VIEWS) as ViewId[]) {
    const v: unknown = (raw as Record<string, unknown>)[id];
    if (!v || typeof v !== 'object') continue;
    const t: ViewTuning = {};
    for (const k of Object.keys(TUNABLE) as Tunable[]) {
      const n: unknown = (v as Record<string, unknown>)[k];
      if (typeof n === 'number' && n >= TUNABLE[k].min && n <= TUNABLE[k].max) t[k] = n;
    }
    out[id] = t;
  }
  return out;
}

export function loadTuning(): Tuning {
  try {
    return parseTuning(localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

function storeTuning(t: Tuning): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // Storage off: the tuning lasts until the page is closed.
  }
}

/** One line with the active view's numbers, to copy into a message. */
export function describeView(): string {
  const v = viewAngle();
  return `${v.name}: tile ${v.tileW}×${v.tileH}, height step ${v.levelH}, walls ×${v.structureScale.toFixed(2)}, sky ${v.sky.toFixed(2)}, haze ${v.haze.toFixed(2)}`;
}

/**
 * A hidden panel (the ` key, or ?tune in the address) with sliders for the active view's angle,
 * height step, wall height and sky, for finding the right numbers by eye before art is drawn.
 */
export class TunePanel {
  private readonly root = el('div');
  private readonly title = el('strong');
  private readonly line = el('div', 'dim');
  private readonly sliders = new Map<Tunable, { input: HTMLInputElement; value: HTMLSpanElement }>();

  constructor(
    private tuning: Tuning,
    private readonly apply: (t: Tuning) => void,
  ) {
    this.root.id = 'tune';
    this.root.style.display = 'none';
    const head = el('div', 'tune-head');
    head.append(this.title, button('×', () => this.toggle()));
    this.root.append(head, el('div', 'dim', 'Changes the view you are in. Kept in this browser.'));
    for (const k of Object.keys(TUNABLE) as Tunable[]) {
      const spec = TUNABLE[k];
      const input = el('input');
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.addEventListener('input', () => this.set(k, Number(input.value)));
      const value = el('span', 'dim');
      const row = el('label', 'tune-row');
      row.append(el('span', undefined, spec.name), input, value);
      this.root.append(row);
      this.sliders.set(k, { input, value });
    }
    const copy = button('Copy numbers', () => void navigator.clipboard?.writeText(describeView()).catch(() => undefined));
    this.root.append(this.line, copy, button('Reset this view', () => this.reset()));
    document.body.append(this.root);
    if (new URLSearchParams(location.search).has('tune')) this.toggle();
  }

  toggle(): void {
    this.root.style.display = this.root.style.display === 'none' ? '' : 'none';
    this.show();
  }

  /** Show the active view's numbers (after a view change, too). */
  show(): void {
    const v = viewAngle();
    setText(this.title, `Tune ${v.name}`);
    for (const [k, s] of this.sliders) {
      s.input.value = String(v[k]);
      setText(s.value, k === 'tileH' || k === 'levelH' ? `${v[k]}` : v[k].toFixed(2));
    }
    setText(this.line, describeView());
  }

  private set(k: Tunable, n: number): void {
    const id = viewAngle().id;
    this.change({ ...this.tuning, [id]: { ...this.tuning[id], [k]: n } });
  }

  private reset(): void {
    const { [viewAngle().id]: _, ...rest } = this.tuning;
    this.change(rest);
  }

  private change(t: Tuning): void {
    this.tuning = t;
    storeTuning(t);
    this.apply(t);
    this.show();
  }
}
