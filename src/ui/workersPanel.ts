import { ECONOMY, WAGE_LEVELS, WORKER_TYPES, WORKERS, type WageLevel, type WorkerType } from '../data/economy';
import { isWinter } from '../sim/calendar';
import {
  buy,
  dailyWages,
  efficiencyParts,
  harvestDue,
  purchasePrice,
  setWanted,
  taxDue,
  totalWorkers,
  type Purchase,
} from '../sim/economy';
import { today } from '../sim/state';
import { button, crowns, el, setClass, setText } from './dom';
import type { GameHost } from './host';

/**
 * Hiring, wages, the levy and buying supplies. Built once, with numbers updated in place,
 * so buttons never get replaced under the pointer mid-click.
 */
export class WorkersPanel {
  private readonly counts = {} as Record<WorkerType, HTMLElement>;
  private readonly wageButtons = {} as Record<WageLevel, HTMLButtonElement>;
  private readonly wageNote = el('div', 'dim');
  private readonly totals = el('div');
  private readonly eff = el('div');
  private readonly effParts = el('div', 'dim');
  private readonly levy = el('input');
  private readonly standing = el('div');
  private readonly income = el('div', 'dim');
  private readonly ledger = el('div', 'dim');
  private readonly notice = el('div');

  constructor(
    root: HTMLElement,
    private readonly host: GameHost,
  ) {
    const hire = el('section');
    hire.append(el('strong', undefined, 'Workers'), el('div', 'dim', 'Set how many you want; they arrive over a few days. Fewer dismisses at once.'));
    const table = el('div', 'hire-table');
    for (const t of WORKER_TYPES) {
      const k = WORKERS[t];
      const row = el('div', 'hire-row');
      const name = el('span', 'hire-name', k.plural);
      name.title = k.note;
      const count = el('span', 'hire-count');
      this.counts[t] = count;
      const less = button('−', () => this.want(t, -1));
      const more = button('+', () => this.want(t, 1));
      const more5 = button('+5', () => this.want(t, 5));
      row.append(name, count, less, more, more5, el('span', 'dim hire-wage', `${k.wage}/day`));
      table.append(row, el('div', 'hire-note dim', k.note));
    }
    hire.append(table, this.totals);

    const wages = el('section');
    const wageRow = el('div', 'option-row');
    wageRow.append(el('span', undefined, 'Wages'));
    for (const w of Object.keys(WAGE_LEVELS) as WageLevel[]) {
      const b = button(WAGE_LEVELS[w].name, () => {
        host.sim.economy.wage = w;
      });
      this.wageButtons[w] = b;
      wageRow.append(b);
    }
    wages.append(wageRow, this.wageNote, this.eff, this.effParts);

    const money = el('section');
    this.levy.type = 'checkbox';
    this.levy.addEventListener('change', () => (host.sim.economy.levy = this.levy.checked));
    const levyLabel = el('label', 'levy');
    levyLabel.append(this.levy, ` Raise a levy each month (+${ECONOMY.levy} crowns, −${ECONOMY.levyStanding} standing)`);
    money.append(el('strong', undefined, 'Money'), levyLabel, this.standing, this.income, this.ledger);

    const shop = el('section');
    shop.append(el('strong', undefined, 'Buy supplies'));
    const shopRow = el('div', 'shop-row');
    const names: Record<Purchase, string> = { stone: 'stone', timber: 'timber', food: 'food', fill: 'cartloads of fill' };
    for (const item of ['stone', 'timber', 'food', 'fill'] as const) {
      shopRow.append(
        button(`${ECONOMY.lots[item]} ${names[item]} (${purchasePrice(item)})`, () => {
          const problem = buy(host.sim.economy, item);
          setText(this.notice, problem ?? `Bought ${ECONOMY.lots[item]} ${names[item]}.`);
          setClass(this.notice, problem ? 'bad' : 'good');
        }),
      );
    }
    shop.append(
      shopRow,
      el('div', 'dim', 'Quarrymen make stone far more cheaply. Timber also comes from clearing forest under new pieces. Fill is earth carted in for raising ground.'),
      this.notice,
    );
    root.replaceChildren(hire, wages, money, shop);
  }

  private want(t: WorkerType, delta: number): void {
    const e = this.host.sim.economy;
    setWanted(e, t, e.wanted[t] + delta);
  }

  update(): void {
    const { sim } = this.host;
    const e = sim.economy;
    const winter = isWinter(today(sim));
    for (const t of WORKER_TYPES) {
      const have = e.workers[t];
      const want = e.wanted[t];
      setText(this.counts[t], want > have ? `${have} of ${want}` : String(have));
      setClass(this.counts[t], want > have ? 'hire-count warn' : 'hire-count');
    }
    const n = totalWorkers(e);
    setText(
      this.totals,
      `${n} on site · wages ${crowns(dailyWages(e, winter))} crowns a day${winter ? ' (half pay for winter)' : ''} · ${n * ECONOMY.rationsPerWorker} rations a day`,
    );
    const level = WAGE_LEVELS[e.wage];
    for (const w of Object.keys(WAGE_LEVELS) as WageLevel[]) setClass(this.wageButtons[w], w === e.wage ? 'active' : '');
    setText(this.wageNote, `Pay ×${level.pay}, hiring ×${level.hiring}, work rate ×${level.efficiency}`);
    const parts = efficiencyParts(e);
    const total = parts.reduce((f, p) => f * p.factor, 1);
    setText(this.eff, `Efficiency ${Math.round(total * 100)}%`);
    setClass(this.eff, total < 0.8 ? 'bad' : total > 1 ? 'good' : '');
    setText(this.effParts, parts.map((p) => `${p.label} ×${p.factor}`).join(' · '));

    if (this.levy.checked !== e.levy) this.levy.checked = e.levy;
    setText(this.standing, `Standing with the people: ${Math.round(e.standing)} / 100`);
    setClass(this.standing, e.standing < 40 ? 'bad' : e.standing < 60 ? 'warn' : '');
    setText(
      this.income,
      `Next spring's taxes: about ${crowns(taxDue(e, this.host.summary.builtLabour))} crowns (more as the castle is built). Autumn harvest dues: about ${crowns(harvestDue(e))} rations.`,
    );
    const l = e.lastMonth;
    setText(
      this.ledger,
      `Last month: wages ${crowns(l.wages)}, supplies ${crowns(l.purchases)}, levy +${crowns(l.levies)}, taxes +${crowns(l.taxes)}`,
    );
  }
}
