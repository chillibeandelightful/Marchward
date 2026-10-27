import { formatDate } from '../sim/calendar';
import type { SimState } from '../sim/state';
import { el } from './dom';
import { banner, icon, ironTexture, parchmentTexture, type IconName } from './pixelArt';

/** What each icon down the right opens: a tab, and the heading of the section to scroll to. */
const ICONS: readonly { name: IconName; tab: string; section?: string; title: string }[] = [
  { name: 'build', tab: 'works', title: 'Building: how the works are going and what is holding them up' },
  { name: 'workers', tab: 'workers', section: 'Workers', title: 'Workers: hire the trades and set wages' },
  { name: 'timber', tab: 'workers', section: 'Buy supplies', title: 'Timber: buy timber and other supplies' },
  { name: 'stone', tab: 'workers', section: 'Buy supplies', title: 'Stone: buy stone and other supplies' },
  { name: 'defence', tab: 'defence', title: 'Defence: raids, troop posts and past battles' },
  { name: 'standing', tab: 'workers', section: 'Money', title: "Standing: money, taxes, the levy and your people's standing" },
  { name: 'hiring', tab: 'defence', section: 'Garrison', title: 'Hiring: hire soldiers for the garrison' },
  { name: 'plan', tab: 'plan', title: 'Plan: design the castle' },
  { name: 'reports', tab: 'reports', title: 'Reports: graphs and the log' },
  { name: 'save', tab: 'game', title: 'Save, load, and the look of the game' },
];

/** Room round the map: the icon column on the right and the message panel along the bottom. */
export const FRAME = { side: 14, right: 106, bottom: 128 } as const;

/**
 * The Classic page layout: a bevelled iron frame with rivets round the map, a parchment panel of
 * the latest log lines beside the castle's banner, and a column of icons that open the panels.
 * The page's CSS shows it only while the body has the `classic` class.
 */
export class ClassicFrame {
  private readonly frame = el('div');
  private readonly bevel = el('div');
  private readonly lines = el('div', 'msg-lines');
  private readonly buttons: { b: HTMLButtonElement; tab: string; section?: string }[] = [];
  private open: number | null = null;
  private seenTab = '';
  private logKey = '';
  private mapTop = 0;

  constructor(
    private readonly tabs: { readonly active: string; show(id: never): void },
    private readonly panel: HTMLElement,
  ) {
    this.frame.id = 'frame';
    this.bevel.id = 'map-bevel';
    document.documentElement.style.setProperty('--iron', `url(${ironTexture()})`);
    document.documentElement.style.setProperty('--parchment', `url(${parchmentTexture()})`);

    const messages = el('div');
    messages.id = 'messages';
    const flag = banner();
    flag.className = 'msg-banner';
    messages.append(flag, this.lines);

    const column = el('div');
    column.id = 'icons';
    ICONS.forEach((spec, i) => {
      const b = el('button', 'icon-button');
      b.title = spec.title;
      b.append(icon(spec.name));
      b.addEventListener('click', () => this.toggle(i));
      column.append(b);
      this.buttons.push({ b, tab: spec.tab, section: spec.section });
    });

    const close = el('button', 'panel-close', '×');
    close.title = 'Close';
    close.addEventListener('click', () => this.close());
    panel.prepend(close);

    document.body.append(this.frame, this.bevel, messages, column);
  }

  private toggle(i: number): void {
    if (this.open === i && document.body.classList.contains('panel-open')) return this.close();
    const spec = this.buttons[i];
    if (!spec) return;
    this.open = i;
    this.tabs.show(spec.tab as never);
    this.seenTab = spec.tab;
    document.body.classList.add('panel-open');
    this.panel.scrollTop = 0;
    if (spec.section) {
      const heading = [...this.panel.querySelectorAll('strong')].find((s) => s.textContent === spec.section && s.offsetParent);
      const section = heading?.closest('section');
      if (section) this.panel.scrollTop = section.offsetTop - 30;
    }
    this.mark();
  }

  close(): void {
    document.body.classList.remove('panel-open');
    this.open = null;
    this.mark();
  }

  private mark(): void {
    this.buttons.forEach(({ b }, i) => b.classList.toggle('active', i === this.open));
  }

  /**
   * Once a frame: follow tab changes made elsewhere (a battle opens Defence), refresh the messages
   * when the log changes, and lay the frame out under the top bar. Returns true if the map's area moved.
   */
  update(sim: SimState, topBarBottom: number): boolean {
    if (this.tabs.active !== this.seenTab) {
      this.seenTab = this.tabs.active;
      const i = this.buttons.findIndex((b) => b.tab === this.tabs.active && !b.section);
      if (i >= 0) this.toggle(i);
    }

    const last = sim.log[sim.log.length - 1];
    const key = `${sim.log.length}:${last?.day}:${last?.text}`;
    if (key !== this.logKey) {
      this.logKey = key;
      const rows = sim.log.slice(-4).map((entry) => {
        const row = el('div', 'msg-line');
        row.append(el('span', 'msg-date', `${formatDate(entry.day)}: `), entry.text);
        return row;
      });
      this.lines.replaceChildren(...rows);
      this.lines.title = rows.map((r) => r.textContent).join('\n');
    }

    const top = Math.round(topBarBottom + 8);
    if (top === this.mapTop) return false;
    this.mapTop = top;
    document.documentElement.style.setProperty('--map-top', `${top}px`);
    this.placeRivets();
    return true;
  }

  /** Rivets round the map's border, spaced evenly along each side. */
  private placeRivets(): void {
    const w = window.innerWidth - FRAME.side - FRAME.right;
    const h = window.innerHeight - this.mapTop - FRAME.bottom;
    const rivets: HTMLElement[] = [];
    const at = (x: number, y: number) => {
      const r = el('span', 'rivet');
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      rivets.push(r);
    };
    const across = Math.max(2, Math.round(w / 140));
    const down = Math.max(2, Math.round(h / 140));
    for (let i = 0; i <= across; i++) {
      at((w * i) / across, 0);
      at((w * i) / across, h);
    }
    for (let j = 1; j < down; j++) {
      at(0, (h * j) / down);
      at(w, (h * j) / down);
    }
    this.bevel.replaceChildren(...rivets);
  }

  /** Lay out again after the window changes size. */
  relayout(): void {
    this.mapTop = 0;
  }
}
