import { STORY } from '../data/events';
import { formatDate } from '../sim/calendar';
import {
  baronHiringFactor,
  borderRaidGapFactor,
  churchMonthly,
  crownTaxFactor,
  EVENTS_BY_ID,
  FACTION_NAMES,
  FACTIONS,
  standingOf,
  type Faction,
} from '../sim/story';
import { button, el, setClass, setText } from './dom';
import type { GameHost } from './host';

const MODE_NOTE = {
  chronicle: 'Chronicle: grounded frontier politics. No magic.',
  legend: 'Legend: the same frontier, but the old stories are true.',
} as const;

/** The messenger waiting, standing with each faction and what it does, and the chronicle of choices made. */
export class StoryPanel {
  private readonly waiting = el('div');
  private readonly readButton: HTMLButtonElement;
  private readonly messengersOn = el('input');
  private readonly mode = el('div', 'dim');
  private readonly rows = {} as Record<Faction, { value: HTMLElement; bar: HTMLElement; note: HTMLElement }>;
  private readonly chronicle = el('div');
  private chronicleKey = '';

  constructor(
    root: HTMLElement,
    private readonly host: GameHost,
  ) {
    const msg = el('section');
    this.readButton = button('Read the message', () => host.showMessenger());
    this.messengersOn.type = 'checkbox';
    this.messengersOn.addEventListener('change', () => {
      host.sim.story.messengers = this.messengersOn.checked;
    });
    const toggle = el('label', 'levy');
    toggle.append(this.messengersOn, ' Messengers come (untick to build in peace)');
    msg.append(el('strong', undefined, 'Messenger'), this.waiting, this.readButton, toggle, this.mode);

    const standing = el('section');
    standing.append(el('strong', undefined, 'Standing'), el('div', 'dim', 'Out of 100. Your answers to messengers move these, and each one changes something.'));
    for (const f of FACTIONS) {
      const row = el('div', 'faction');
      const head = el('div', 'faction-head');
      const value = el('span');
      head.append(el('span', undefined, FACTION_NAMES[f]), value);
      const track = el('div', 'bar-track');
      const bar = el('div', 'bar-fill');
      track.append(bar);
      const note = el('div', 'dim');
      row.append(head, track, note);
      standing.append(row);
      this.rows[f] = { value, bar, note };
    }

    const past = el('section');
    past.append(el('strong', undefined, 'Chronicle'), this.chronicle);
    root.replaceChildren(msg, standing, past);
    this.update();
  }

  update(): void {
    const s = this.host.sim;
    const story = s.story;
    const p = story.pending;
    const ev = p ? EVENTS_BY_ID.get(p.event) : undefined;
    setText(this.waiting, ev ? `${ev.from} is waiting: ${ev.title}.` : 'Nobody is waiting. A messenger comes most months.');
    setClass(this.waiting, ev ? 'warn' : 'dim');
    this.readButton.hidden = !ev;
    this.messengersOn.checked = story.messengers;
    setText(this.mode, MODE_NOTE[story.mode]);

    const pct = (n: number) => `×${n.toFixed(2)}`;
    const notes: Record<Faction, string> = {
      crown: `Spring taxes ${pct(crownTaxFactor(story))}.`,
      church: (() => {
        const c = churchMonthly(story);
        return c > 0
          ? `Preaches you up: common folk +${c} a month.`
          : c < 0
            ? `Preaches against you: common folk ${c} a month.`
            : `Neither for nor against you. Above ${STORY.churchHigh} it preaches you up; below ${STORY.churchLow}, against you.`;
      })(),
      barons: `Soldiers come ${pct(baronHiringFactor(story))} as fast.`,
      commons: 'Taxes, harvest dues and hiring (see Workers).',
      borderfolk: `Time between raids ${pct(borderRaidGapFactor(story))}.`,
    };
    for (const f of FACTIONS) {
      const v = Math.round(standingOf(story, s.economy, f));
      const r = this.rows[f];
      setText(r.value, `${v}`);
      setClass(r.value, v < 30 ? 'bad' : v < 45 ? 'warn' : v >= 70 ? 'good' : '');
      const w = `${v}%`;
      if (r.bar.style.width !== w) r.bar.style.width = w;
      setText(r.note, notes[f]);
    }

    const key = `${story.chronicle.length}:${story.chronicle[story.chronicle.length - 1]?.day ?? -1}`;
    if (key !== this.chronicleKey) {
      this.chronicleKey = key;
      const items = story.chronicle
        .slice()
        .reverse()
        .map((c) => {
          const d = el('div', 'chronicle-entry');
          d.append(el('div', 'dim', `${formatDate(c.day)} · ${c.title}`), el('div', undefined, `${c.choice}: ${c.text}`));
          return d;
        });
      this.chronicle.replaceChildren(...(items.length > 0 ? items : [el('div', 'dim', 'Nothing yet. Your answers to messengers are written here.')]));
    }
  }
}
