import type { Cost } from '../data/castle';
import type { PieceStats } from '../sim/castle';

export interface Line {
  text: string;
  cls?: 'dim' | 'good' | 'bad' | 'warn' | 'head';
}

export function formatCost(c: Cost): string {
  const parts = [`${c.stone} stone`];
  if (c.timber > 0) parts.push(`${c.timber} timber`);
  if (c.timber < 0) parts.push(`gives ${-c.timber} timber`);
  parts.push(`${c.labour} worker-days`);
  return parts.join(' · ');
}

/** The numbers that matter for a piece, in plain words. */
export function statLines(s: PieceStats): Line[] {
  const out: Line[] = [
    { text: `Strength: ${s.hp} HP` },
    { text: `Height: ${s.levels} ${s.levels === 1 ? 'level' : 'levels'}, on ground at level ${s.ground}` },
  ];
  if (s.aboveApproach !== null) {
    out.push({ text: `Stands ${s.aboveApproach} above the ground attackers can reach` });
    out.push(
      s.ladderable
        ? { text: 'Ladder crews can climb it', cls: 'warn' }
        : { text: 'Too high for ladder crews', cls: 'good' },
    );
  }
  out.push({ text: `Archer range bonus: +${s.rangeBonus} ${s.rangeBonus === 1 ? 'tile' : 'tiles'}` });
  for (const n of s.notes) out.push({ text: n, cls: 'dim' });
  return out;
}

export function renderLines(el: HTMLElement, lines: readonly Line[]): void {
  el.replaceChildren(
    ...lines.map((l) => {
      const div = document.createElement(l.cls === 'head' ? 'strong' : 'div');
      div.textContent = l.text;
      if (l.cls && l.cls !== 'head') div.className = l.cls;
      if (l.cls === 'head') div.style.display = 'block';
      return div;
    }),
  );
}
