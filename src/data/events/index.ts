import { RAIDS } from '../combat';
import type { StoryEvent } from '../../sim/story';
import { CHRONICLE_EVENTS } from './chronicle';
import { LEGEND_EVENTS } from './legend';

/** How the monthly messengers behave, and where standing starts. Values to tune in playtesting. */
export const STORY = {
  /** Standing at the start of a game, out of 100. The common folk's is the economy's (`ECONOMY.start.standing`). */
  startStanding: { crown: 50, church: 50, barons: 50, borderfolk: 45 },
  /** The first messenger can come at the start of this month (0 is the month the game starts). */
  firstMonth: 1,
  /** Chance each month that a messenger comes, when no follow-up is due. */
  messengerChance: 0.85,
  /** Months before an event can come again, unless it says otherwise. */
  defaultCooldown: 6,
  /** The church preaches you up (or down) each month by this much of the common folk's standing, above `churchHigh` or below `churchLow`. */
  churchHigh: 70,
  churchLow: 30,
  churchSway: 1,
  /** A choice can't bring the next raid on sooner than this many days from today, so the scouts still warn of it. */
  raidLeadDays: RAIDS.warningDays + 2,
};

export const STORY_EVENTS: readonly StoryEvent[] = [...CHRONICLE_EVENTS, ...LEGEND_EVENTS];
