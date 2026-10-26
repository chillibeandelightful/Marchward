import { formatDate } from '../sim/calendar';
import { fromSave, toSave, type SaveFile } from '../sim/save';
import { today, type SimState } from '../sim/state';
import { button, el, setClass, setText } from './dom';
import type { GameHost } from './host';

export type Slot = 'save' | 'autosave';
const KEYS: Record<Slot, string> = { save: 'marchward.save', autosave: 'marchward.autosave' };

/** Write the game to a browser storage slot. Returns a problem, or null. */
export function storeGame(slot: Slot, state: SimState): string | null {
  try {
    localStorage.setItem(KEYS[slot], toSave(state, Date.now()));
    return null;
  } catch (err) {
    return `Couldn't save: ${String(err)}`;
  }
}

/** Read a slot: the save, null if empty, or a problem string if it can't be read. */
export function readGame(slot: Slot): SaveFile | null | string {
  let text: string | null;
  try {
    text = localStorage.getItem(KEYS[slot]);
  } catch {
    return 'Browser storage is turned off';
  }
  if (text === null) return null;
  try {
    return fromSave(text);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function describe(file: SaveFile | null | string): string {
  if (file === null) return 'empty';
  if (typeof file === 'string') return file;
  const when = new Date(file.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return `${formatDate(today(file.state))} (saved ${when})`;
}

/** Save, load and start again. The game is kept in this browser only. */
export class GamePanel {
  private readonly saveInfo = el('div', 'dim');
  private readonly autoInfo = el('div', 'dim');
  private readonly notice = el('div');
  private readonly newButton: HTMLButtonElement;
  private newArmed = false;

  constructor(
    root: HTMLElement,
    private readonly host: GameHost,
  ) {
    const s = el('section');
    s.append(
      el('strong', undefined, 'Game'),
      el('div', 'dim', 'Games are kept in this browser. The game also saves itself at the start of every month.'),
      button('Save game', () => {
        const problem = storeGame('save', host.sim);
        this.say(problem ?? 'Saved.', !!problem);
      }),
      el('div', 'dim', 'Saved game:'),
      this.saveInfo,
      button('Load saved game', () => this.load('save')),
      el('div', 'dim', 'Autosave:'),
      this.autoInfo,
      button('Load autosave', () => this.load('autosave')),
    );
    this.newButton = button('New game', () => {
      if (!this.newArmed) {
        this.newArmed = true;
        setText(this.newButton, 'Click again to start over (unsaved progress is lost)');
        setClass(this.newButton, 'active');
        return;
      }
      this.newArmed = false;
      setText(this.newButton, 'New game');
      setClass(this.newButton, '');
      host.newGame();
      this.say('Started a new game.', false);
    });
    s.append(this.newButton, this.notice);
    root.replaceChildren(s);
    this.refresh();
  }

  private load(slot: Slot): void {
    const file = readGame(slot);
    if (file === null) return this.say('Nothing saved there yet.', true);
    if (typeof file === 'string') return this.say(`Couldn't load: ${file}`, true);
    this.host.load(file.state);
    this.say(`Loaded ${formatDate(today(file.state))}.`, false);
  }

  private say(text: string, bad: boolean): void {
    setText(this.notice, text);
    setClass(this.notice, bad ? 'bad' : 'good');
    this.refresh();
  }

  /** Re-read the slot descriptions (after a save or autosave). */
  refresh(): void {
    setText(this.saveInfo, describe(readGame('save')));
    setText(this.autoInfo, describe(readGame('autosave')));
  }
}
