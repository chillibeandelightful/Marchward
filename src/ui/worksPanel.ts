import { TRADE_NAMES, TRADES } from '../data/economy';
import { formatDate } from '../sim/calendar';
import { today } from '../sim/state';
import { el } from './dom';
import type { GameHost } from './host';

const JOBS_SHOWN = 14;

/** Building progress: what's done, when it should finish, and what is holding it up. Display only. */
export class WorksPanel {
  private key = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly host: GameHost,
  ) {}

  update(): void {
    const { sim, summary: s } = this.host;
    const key = JSON.stringify([today(sim), sim.plan.pieces.length, s.jobs.length, s.progress]);
    if (key === this.key) return;
    this.key = key;

    const top = el('section');
    top.append(el('strong', undefined, 'Building'));
    if (s.jobs.length === 0 && s.piecesTotal === 0) {
      top.append(el('div', 'dim', 'Nothing planned yet. Design the castle in the Plan tab, then hire workers.'));
      this.root.replaceChildren(top);
      return;
    }
    const bar = el('div', 'bar');
    const fill = el('div', 'bar-fill');
    fill.style.width = `${Math.round(s.progress * 100)}%`;
    bar.append(fill);
    top.append(
      bar,
      el('div', undefined, `${Math.round(s.progress * 100)}% of all work done · ${s.piecesDone} of ${s.piecesTotal} pieces built`),
      s.jobs.length === 0
        ? el('div', 'good', 'Everything planned is built.')
        : s.finish !== null
          ? el('div', undefined, `Expected to finish: ${formatDate(s.finish)}`)
          : el('div', 'bad', "Won't finish as things stand."),
    );
    if (s.bottleneck) {
      top.append(el('div', 'warn head-gap', 'Holding things up most:'), el('div', 'warn', s.bottleneck));
    }
    for (const w of s.warnings) top.append(el('div', 'dim', `⚠ ${w}`));

    const trades = el('section');
    trades.append(el('strong', undefined, 'Work left by trade'));
    const table = el('div', 'trade-table');
    for (const t of TRADES) {
      const { left, perDay } = s.trades[t];
      if (left < 0.05) continue;
      table.append(
        el('span', undefined, TRADE_NAMES[t].name),
        el('span', undefined, `${Math.ceil(left)} days' work`),
        el('span', perDay > 0 ? 'dim' : 'bad', perDay > 0 ? `${perDay.toFixed(1)} a day` : `no ${TRADE_NAMES[t].who}`),
      );
    }
    trades.append(table);

    const jobs = el('section');
    jobs.append(el('strong', undefined, `Jobs (${s.jobs.length} left, in the order they are worked on)`));
    for (const j of s.jobs.slice(0, JOBS_SHOWN)) {
      const row = el('div', 'job');
      const name = el('div', undefined, `${j.job.name} · ${Math.round(j.progress * 100)}%`);
      const detail =
        j.status !== null
          ? el('div', j.job.blocked || j.crew === 0 ? 'bad' : 'warn', j.status)
          : el('div', 'dim', `${j.crew} at work${j.finish !== null ? ` · done about ${formatDate(j.finish)}` : ''}`);
      row.append(name, detail);
      jobs.append(row);
    }
    if (s.jobs.length > JOBS_SHOWN) jobs.append(el('div', 'dim', `…and ${s.jobs.length - JOBS_SHOWN} more`));
    this.root.replaceChildren(top, trades, jobs);
  }
}
