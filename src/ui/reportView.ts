import type { BattleReport } from '../sim/battle';
import { formatDate } from '../sim/calendar';
import { button, el } from './dom';

/** The post-battle report, over the middle of the map until closed. */
export class ReportView {
  constructor(private readonly root: HTMLElement) {
    root.style.display = 'none';
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) this.close();
    });
  }

  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  show(r: BattleReport): void {
    const title = el('h2', undefined, `Raid ${r.raid} · ${formatDate(r.day)}`);
    const head = el('div', r.outcome === 'plundered' ? 'bad report-head' : 'good report-head', r.headline);
    const parts: HTMLElement[] = [title, head];
    for (const s of r.sections) {
      const sec = el('section');
      sec.append(el('strong', undefined, s.title));
      for (const l of s.lines) sec.append(el('div', l.cls, l.text));
      parts.push(sec);
    }
    parts.push(button('Close (Esc)', () => this.close()));
    this.root.replaceChildren(...parts);
    this.root.style.display = '';
  }

  close(): void {
    this.root.style.display = 'none';
  }
}
