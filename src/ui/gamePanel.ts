import { formatDate } from '../sim/calendar';
import { fromSave, toSave, type SaveFile } from '../sim/save';
import { today, type SimState } from '../sim/state';
import { button, el, setClass, setText } from './dom';
import type { GameHost } from './host';
import type { Look } from './look';

/** Reading and changing the look (visual style and screen effect). */
export interface LookHost {
  readonly look: Look;
  setLook(look: Look): void;
}

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

/** The keys, listed here too because the Classic frame has no room for the help box. */
const KEYS_HELP = [
  'Space pauses or starts the clock · V shows the land as planned',
  'Right-drag, or WASD / arrow keys, to move · mouse wheel or + / − to zoom',
  '1–9, 0 pick a tool · R turns the gatehouse · Esc cancels',
  'C recentres · G shows the grid · L steps through Modern, Classic and Drab · H steps through the views',
];

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

  private readonly lookRows: { b: HTMLButtonElement; on: (l: Look) => boolean }[] = [];

  constructor(
    root: HTMLElement,
    private readonly host: GameHost,
    private readonly looks: LookHost,
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
    const keys = el('section', 'classic-only');
    keys.append(el('strong', undefined, 'Keys'));
    for (const line of KEYS_HELP) keys.append(el('div', 'dim', line));
    root.replaceChildren(this.lookSection(), s, keys);
    this.refresh();
  }

  /** Style and view buttons, and for Classic how chunky the pixels are, how strong the dithering is and where it goes. Kept in this browser, not in saves. */
  private lookSection(): HTMLElement {
    const s = el('section');
    const row = (label: string, options: readonly [string, Partial<Look>][]) => {
      const r = el('div', 'option-row');
      r.append(el('span', undefined, label));
      for (const [text, change] of options) {
        const b = button(text, () => this.looks.setLook({ ...this.looks.look, ...change }));
        const keys = Object.keys(change) as (keyof Look)[];
        this.lookRows.push({ b, on: (l) => keys.every((k) => l[k] === change[k]) });
        r.append(b);
      }
      return r;
    };
    const strength = el('div', 'option-row');
    this.ditherSlider.type = 'range';
    this.ditherSlider.min = '0';
    this.ditherSlider.max = '100';
    this.ditherSlider.step = '5';
    this.ditherSlider.addEventListener('input', () => this.looks.setLook({ ...this.looks.look, dither: Number(this.ditherSlider.value) / 100 }));
    strength.append(el('span', undefined, 'Dithering'), this.ditherSlider, this.ditherValue);
    this.surfacesBox.type = 'checkbox';
    this.surfacesBox.addEventListener('change', () => this.looks.setLook({ ...this.looks.look, surfaces: this.surfacesBox.checked }));
    const surfaces = el('label', 'levy');
    surfaces.append(this.surfacesBox, ' Dither only the ground, stone and sky (trees, people and fire are left as drawn)');
    this.classicOnly = [
      row('Pixels', [
        ['Off', { pixel: 1 }],
        ['Chunky', { pixel: 2 }],
        ['Chunkier', { pixel: 3 }],
      ]),
      el('div', 'dim', 'Pixels off keeps everything sharp when zoomed out, with the same colours and dithering.'),
      strength,
      surfaces,
    ];
    s.append(
      el('strong', undefined, 'Look'),
      el('div', 'dim', 'Classic is darker and grittier, with chunky pixels and a frame of icons. Drab has the same colours and frame, drawn smooth. Press L to step through them.'),
      row('Style', [
        ['Modern', { style: 'modern' }],
        ['Classic', { style: 'classic' }],
        ['Drab', { style: 'drab' }],
      ]),
      el('div', 'dim', 'High and Low view are trials, both with the sky always in view and taller stonework: High looks down more steeply, Low looks across at the castle. Placing pieces still uses the flat plan. Press H to step through the views, and the ` key to tune the angle.'),
      row('View', [
        ['Standard', { view: 'standard' }],
        ['High view', { view: 'high' }],
        ['Low view', { view: 'low' }],
      ]),
      ...this.classicOnly,
    );
    this.showLook();
    return s;
  }

  private classicOnly: HTMLElement[] = [];
  private readonly ditherSlider = el('input');
  private readonly ditherValue = el('span', 'dim');
  private readonly surfacesBox = el('input');

  /** Mark the chosen look's buttons; the screen-effect rows only apply to Classic. */
  showLook(): void {
    const look = this.looks.look;
    for (const { b, on } of this.lookRows) setClass(b, on(look) ? 'active' : '');
    for (const r of this.classicOnly) r.style.display = look.style === 'classic' ? '' : 'none';
    this.ditherSlider.value = String(Math.round(look.dither * 100));
    setText(this.ditherValue, look.dither === 0 ? 'off' : `${Math.round(look.dither * 100)}%`);
    this.surfacesBox.checked = look.surfaces;
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
