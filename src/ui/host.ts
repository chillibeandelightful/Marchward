import type { SimState } from '../sim/state';
import type { WorksSummary } from '../sim/works';

/** What the panels need from the game. The sim object is replaced when a game is loaded, so always read it through here. */
export interface GameHost {
  readonly sim: SimState;
  /** Building estimate for today, refreshed once a game day. */
  readonly summary: WorksSummary;
  /** 0 is paused. */
  readonly speed: number;
  setSpeed(speed: number): void;
  /**
   * In a Commander battle, how it's shown: 'command' from above, for picking soldiers and giving
   * orders; 'normal' to watch it. Null outside a Commander battle.
   */
  readonly battleView: 'command' | 'normal' | null;
  toggleBattleView(): void;
  /** Replace the running game with a loaded one. */
  load(state: SimState): void;
  newGame(): void;
}

export const SPEEDS = [1, 2, 4] as const;
