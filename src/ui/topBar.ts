import { ECONOMY, SEASON_NAME } from '../data/economy';
import { dateOf, formatDate } from '../sim/calendar';
import { efficiency, totalWorkers } from '../sim/economy';
import { today } from '../sim/state';
import { button, crowns, el, setClass, setText } from './dom';
import { SPEEDS, type GameHost } from './host';

/** The strip along the top: the date, speed controls, and the stores at a glance. */
export class TopBar {
  private readonly date = el('strong');
  private readonly season = el('span', 'season');
  private readonly speedButtons: HTMLButtonElement[] = [];
  private readonly pause: HTMLButtonElement;
  private readonly stores = el('div', 'stores');
  private readonly items: Record<string, HTMLSpanElement> = {};

  constructor(
    root: HTMLElement,
    private readonly host: GameHost,
  ) {
    this.pause = button('❚❚ Pause', () => host.setSpeed(host.speed === 0 ? this.lastSpeed : 0));
    const row = el('div', 'top-row');
    row.append(this.date, this.season, this.pause);
    for (const s of SPEEDS) {
      const b = button(`${s}×`, () => host.setSpeed(s));
      this.speedButtons.push(b);
      row.append(b);
    }
    for (const k of ['crowns', 'stone', 'timber', 'food', 'spoil', 'workers', 'efficiency']) {
      const span = el('span');
      this.items[k] = span;
      this.stores.append(span);
    }
    root.replaceChildren(row, this.stores);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      host.setSpeed(host.speed === 0 ? this.lastSpeed : 0);
    });
  }

  private lastSpeed = 1;

  update(): void {
    const { sim, speed } = this.host;
    if (speed > 0) this.lastSpeed = speed;
    const day = today(sim);
    const d = dateOf(day);
    setText(this.date, formatDate(day));
    setText(this.season, SEASON_NAME[d.season] + (d.season === 'winter' ? ' · no building' : ''));
    setClass(this.season, `season ${d.season}`);
    setText(this.pause, speed === 0 ? '▶ Paused: press Space' : '❚❚ Pause');
    setClass(this.pause, speed === 0 ? 'active' : '');
    SPEEDS.forEach((s, i) => setClass(this.speedButtons[i] as HTMLButtonElement, s === speed ? 'active' : ''));

    const e = sim.economy;
    const st = e.stores;
    const workers = totalWorkers(e);
    const wanted = Object.values(e.wanted).reduce((a, b) => a + b, 0);
    const eat = workers * ECONOMY.rationsPerWorker;
    const foodDays = eat > 0 ? Math.floor(st.food / eat) : null;
    this.item('crowns', `Crowns ${crowns(st.crowns)}`, e.unpaid ? 'bad' : '');
    this.item('stone', `Stone ${Math.floor(st.stone)}`, '');
    this.item('timber', `Timber ${Math.floor(st.timber)}`, st.timber < 1 && this.host.summary.timberNeeded > 0 ? 'bad' : '');
    this.item('food', `Food ${Math.floor(st.food)}${foodDays !== null ? ` (${foodDays} days)` : ''}`, e.hungry ? 'bad' : foodDays !== null && foodDays < 15 ? 'warn' : '');
    this.item('spoil', `Spoil ${Math.floor(st.spoil)}`, '');
    const stalled = e.unpaid || e.hungry;
    this.item(
      'workers',
      `Workers ${workers}${wanted > workers ? (stalled ? ` (nobody will come while ${e.unpaid ? 'wages are unpaid' : 'food is short'})` : ` (hiring ${wanted - workers})`) : ''}`,
      stalled && wanted > workers ? 'warn' : '',
    );
    this.item('efficiency', workers > 0 ? `Efficiency ${Math.round(efficiency(e) * 100)}%` : '', efficiency(e) < 0.8 ? 'bad' : '');
  }

  private item(key: string, text: string, cls: string): void {
    const span = this.items[key] as HTMLSpanElement;
    setText(span, text);
    setClass(span, cls);
  }
}
