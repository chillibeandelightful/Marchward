import { button, el } from './dom';

/** Tabs along the top of the side panel. Each tab owns one content element. */
export class Tabs<Id extends string> {
  readonly pages: Record<Id, HTMLElement>;
  private readonly buttons: Record<Id, HTMLButtonElement>;
  active: Id;

  constructor(root: HTMLElement, tabs: readonly { id: Id; name: string }[], first: Id) {
    const bar = el('div', 'tab-row');
    const body = el('div', 'tab-body');
    this.pages = {} as Record<Id, HTMLElement>;
    this.buttons = {} as Record<Id, HTMLButtonElement>;
    for (const t of tabs) {
      const b = button(t.name, () => this.show(t.id));
      this.buttons[t.id] = b;
      bar.append(b);
      const page = el('div', 'tab-page');
      this.pages[t.id] = page;
      body.append(page);
    }
    root.replaceChildren(bar, body);
    this.active = first;
    this.show(first);
  }

  show(id: Id): void {
    this.active = id;
    for (const k of Object.keys(this.pages) as Id[]) {
      this.pages[k].style.display = k === id ? '' : 'none';
      this.buttons[k].className = k === id ? 'active' : '';
    }
  }
}
