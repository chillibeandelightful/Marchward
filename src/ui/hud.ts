import type { SimState } from '../sim/state';

/** Text overlay showing sim status. Reads state; never changes it. */
export class Hud {
  constructor(private readonly el: HTMLElement) {}

  update(state: SimState, fps: number): void {
    this.el.textContent = `Marchward · M0 test scene — seed ${state.seed} · tick ${state.tick} · ${fps.toFixed(0)} fps`;
  }
}
