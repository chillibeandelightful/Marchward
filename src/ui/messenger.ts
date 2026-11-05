import { formatDate } from '../sim/calendar';
import { cannotChoose, describeEffects, EVENTS_BY_ID } from '../sim/story';
import { answerMessenger, type SimState } from '../sim/state';
import { button, el } from './dom';
import { hallScene } from './hallScene';

/**
 * The messenger's letter, over the middle of the map: who it's from, what they want, and three
 * answers with everything each one does at once. It can be put aside (Esc) and read again from the
 * top bar or the Story tab; the sim goes on meanwhile, and an unanswered messenger leaves on the
 * first of next month with the default answer.
 */
export class MessengerView {
  constructor(
    private readonly root: HTMLElement,
    private readonly sim: () => SimState,
    /** After an answer: refresh the panels. */
    private readonly answered: () => void,
  ) {
    root.style.display = 'none';
    // Capture, so 1 to 3 answer here instead of picking map tools while the letter is open.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open || e.target instanceof HTMLInputElement) return;
        if (e.code === 'Escape') {
          this.close();
          e.stopImmediatePropagation();
          return;
        }
        const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
        if (n >= 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.answer(n);
        }
      },
      true,
    );
  }

  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  /** Show the waiting messenger, if there is one. */
  show(): void {
    const s = this.sim();
    const p = s.story.pending;
    const ev = p ? EVENTS_BY_ID.get(p.event) : undefined;
    if (!p || !ev) return this.close();
    const scene = hallScene(ev.figure);
    if (scene) scene.className = 'scene';
    this.root.classList.toggle('with-scene', !!scene);
    const picture = el('div', 'scene-frame');
    if (scene) picture.append(scene, el('div', 'scene-caption', ev.arrival ?? `${ev.from} comes before you and begs leave to speak.`));
    const parts: HTMLElement[] = [
      ...(scene ? [picture] : []),
      el('h2', undefined, ev.title),
      el('div', 'dim', `${ev.from} · ${formatDate(p.day)}`),
      el('p', 'letter', ev.text),
    ];
    ev.choices.forEach((c, i) => {
      const sec = el('section', 'choice');
      const problem = cannotChoose(c, s.economy);
      const b = button(`${i + 1}. ${c.label}`, () => this.answer(i));
      b.disabled = !!problem;
      sec.append(b);
      const fx = el('div', 'effects');
      const list = describeEffects(c.effects);
      if (list.length === 0) fx.append(el('span', 'dim', 'Nothing changes at once'));
      for (const f of list) fx.append(el('span', f.good ? 'good' : 'bad', f.text));
      sec.append(fx);
      if (c.risk) sec.append(el('div', 'warn', `Risky: about ${Math.round(c.risk.chance * 100)}% that it goes another way`));
      if (problem) sec.append(el('div', 'bad', `Can't: ${problem}`));
      parts.push(sec);
    });
    const fallback = ev.choices[ev.ignore ?? 2];
    const foot = el('section');
    foot.append(
      el('div', 'dim', `What you choose may be remembered. If you send no answer by the first of next month, it counts as "${fallback?.label ?? ''}".`),
      button('Decide later (Esc)', () => this.close()),
    );
    parts.push(foot);
    this.root.replaceChildren(...parts);
    this.root.style.display = '';
  }

  private answer(i: number): void {
    const problem = answerMessenger(this.sim(), i);
    if (problem) return;
    this.close();
    this.answered();
  }

  close(): void {
    this.root.style.display = 'none';
  }
}
