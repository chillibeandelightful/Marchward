import { CALENDAR, WORKER_TYPES, type Season, type WorkerType } from '../data/economy';
import { TROOP_TYPES, type TroopType } from '../data/combat';
import { STORY, STORY_EVENTS } from '../data/events';
import { dateOf, isWinter } from './calendar';
import type { DefenceState } from './defence';
import type { EconomyState } from './economy';
import { Rng } from './rng';

/** The powers on the frontier whose goodwill the warden lives on. See docs/STORY.md. */
export type Faction = 'crown' | 'church' | 'barons' | 'commons' | 'borderfolk';
export const FACTIONS: readonly Faction[] = ['crown', 'church', 'barons', 'commons', 'borderfolk'];

/** Chronicle is grounded frontier politics; Legend adds folklore that turns out to be true. */
export type StoryMode = 'chronicle' | 'legend';

/** What a choice does when it is made. Every number here is shown to the player before they choose. */
export interface Effects {
  crowns?: number;
  food?: number;
  stone?: number;
  timber?: number;
  /** Workers who join (and are kept on) or leave. */
  workers?: Partial<Record<WorkerType, number>>;
  /** Soldiers who join the garrison or leave it. */
  troops?: Partial<Record<TroopType, number>>;
  standing?: Partial<Record<Faction, number>>;
  /** Days the next raid is put off (positive) or brought on (negative). */
  raidDays?: number;
  /** Story flags to set or clear, for later events to follow up. */
  set?: string[];
  clear?: string[];
  /** A later event this sets in motion, some months on. Not shown to the player. */
  follow?: { event: string; months: number };
  /** One line for the log and the chronicle, saying what came of it. */
  text: string;
}

export interface Choice {
  label: string;
  effects: Effects;
  /** A chance that it goes the other way, with what happens instead (replacing `effects`). */
  risk?: { chance: number; effects: Effects };
}

/** When an event can turn up. Everything given must hold. */
export interface When {
  mode?: StoryMode;
  seasons?: readonly Season[];
  /** Whole months since the game began, at least. */
  fromMonth?: number;
  flags?: readonly string[];
  notFlags?: readonly string[];
  /** Standing must lie within [min, max]. */
  standing?: Partial<Record<Faction, readonly [number, number]>>;
}

export interface StoryEvent {
  id: string;
  title: string;
  /** Who brings the message. */
  from: string;
  text: string;
  when?: When;
  /** Relative chance of being picked from the pool. Follow-ups usually have 0: they only come when set in motion. */
  weight: number;
  /** Comes at most once a game. */
  once?: boolean;
  /** Months before it can come again (when not `once`). */
  cooldown?: number;
  choices: readonly [Choice, Choice, Choice];
  /** The choice taken if the messenger is sent away unanswered (when the next month comes). Defaults to the last. */
  ignore?: 0 | 1 | 2;
}

export interface PendingMessage {
  event: string;
  day: number;
}

export interface ChronicleEntry {
  day: number;
  title: string;
  choice: string;
  text: string;
}

/** The warden's story so far. Plain data, so it goes into saves. */
export interface StoryState {
  mode: StoryMode;
  /** Off for practice, or to test the castle alone. */
  messengers: boolean;
  /** Standing with each faction, 0 to 100, except the common folk, whose standing is the economy's. */
  standing: Record<Exclude<Faction, 'commons'>, number>;
  /** Flags set by choices, with the day each was set. */
  flags: Record<string, number>;
  /** The messenger waiting for an answer, if any. */
  pending: PendingMessage | null;
  /** Follow-ups set in motion, by the day they're due. */
  queue: PendingMessage[];
  /** Day each event last came. */
  seen: Record<string, number>;
  /** Choices made, newest last. */
  chronicle: ChronicleEntry[];
  /** The story's own random stream, so messengers never change what the dice do elsewhere. */
  rngState: number;
}

const CHRONICLE_KEPT = 60;
const DAYS_PER_MONTH = CALENDAR.daysPerMonth;

export const EVENTS_BY_ID: ReadonlyMap<string, StoryEvent> = new Map(STORY_EVENTS.map((e) => [e.id, e]));

export function createStory(seed: number, mode: StoryMode = 'chronicle'): StoryState {
  return {
    mode,
    messengers: true,
    standing: { ...STORY.startStanding },
    flags: {},
    pending: null,
    queue: [],
    seen: {},
    chronicle: [],
    rngState: (seed ^ 0x5a17e11) >>> 0,
  };
}

export function standingOf(story: StoryState, e: EconomyState, f: Faction): number {
  return f === 'commons' ? e.standing : story.standing[f];
}

function addStanding(story: StoryState, e: EconomyState, f: Faction, n: number): void {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  if (f === 'commons') e.standing = clamp(e.standing + n);
  else story.standing[f] = clamp(story.standing[f] + n);
}

/** Taxes are multiplied by this: the crown's goodwill decides how much of what's raised you keep. */
export function crownTaxFactor(story: StoryState): number {
  return 0.5 + story.standing.crown / 100;
}

/** Soldiers come this much faster (or slower) when the barons speak well of you. */
export function baronHiringFactor(story: StoryState): number {
  return 0.5 + story.standing.barons / 100;
}

/** Raids are this much further apart when the borderfolk are left in peace, nearer when they're wronged. */
export function borderRaidGapFactor(story: StoryState): number {
  return 0.6 + (story.standing.borderfolk / 100) * 0.8;
}

/** The church's change to the common folk's standing each month: preached up, or preached against. */
export function churchMonthly(story: StoryState): number {
  const c = story.standing.church;
  return c >= STORY.churchHigh ? STORY.churchSway : c < STORY.churchLow ? -STORY.churchSway : 0;
}

/** Whether an event can come today. A follow-up that was set in motion (`queued`) isn't held back by `once` or its cooldown. */
export function eligible(ev: StoryEvent, story: StoryState, e: EconomyState, day: number, queued = false): boolean {
  const w = ev.when;
  const last = story.seen[ev.id];
  if (!queued && ev.once && last !== undefined) return false;
  if (!queued && last !== undefined && day - last < (ev.cooldown ?? STORY.defaultCooldown) * DAYS_PER_MONTH) return false;
  if (!w) return true;
  if (w.mode && w.mode !== story.mode) return false;
  if (w.seasons && !w.seasons.includes(dateOf(day).season)) return false;
  if (w.fromMonth !== undefined && Math.floor(day / DAYS_PER_MONTH) < w.fromMonth) return false;
  if (w.flags && !w.flags.every((f) => f in story.flags)) return false;
  if (w.notFlags && w.notFlags.some((f) => f in story.flags)) return false;
  if (w.standing)
    for (const [f, range] of Object.entries(w.standing) as [Faction, readonly [number, number]][]) {
      const v = standingOf(story, e, f);
      if (v < range[0] || v > range[1]) return false;
    }
  return true;
}

/** Why a choice can't be made now (it costs more than is in the stores), or null. */
export function cannotChoose(c: Choice, e: EconomyState): string | null {
  const fx = c.effects;
  if (fx.crowns && fx.crowns < 0 && e.stores.crowns < -fx.crowns) return `needs ${-fx.crowns} crowns`;
  if (fx.food && fx.food < 0 && e.stores.food < -fx.food) return `needs ${-fx.food} rations`;
  if (fx.stone && fx.stone < 0 && e.stores.stone < -fx.stone) return `needs ${-fx.stone} stone`;
  if (fx.timber && fx.timber < 0 && e.stores.timber < -fx.timber) return `needs ${-fx.timber} timber`;
  return null;
}

/** The parts of the sim a messenger can touch. */
export interface StoryWorld {
  story: StoryState;
  economy: EconomyState;
  defence: DefenceState;
}

/**
 * First of the month: a messenger left waiting since last month goes away with the default answer,
 * then a new one comes, if any event fits. Follow-ups that are due come first. Returns log lines.
 */
export function monthlyMessenger(w: StoryWorld, day: number): { log: string[]; arrived: boolean } {
  const s = w.story;
  const log: string[] = [];
  if (s.pending) {
    const ev = EVENTS_BY_ID.get(s.pending.event);
    if (ev) {
      const line = choose(w, ev.ignore ?? 2, day, true);
      if (line) log.push(line);
    } else s.pending = null;
  }
  // Monthly sway of the church on the common folk.
  const sway = churchMonthly(s);
  if (sway !== 0) addStanding(s, w.economy, 'commons', sway);

  if (!s.messengers || w.defence.siege || day < STORY.firstMonth * DAYS_PER_MONTH) return { log, arrived: false };
  const rng = new Rng(s.rngState);
  let next: StoryEvent | null = null;
  // Follow-ups that are due, oldest first; one that no longer fits is dropped.
  s.queue.sort((a, b) => a.day - b.day);
  while (s.queue.length > 0 && s.queue[0]!.day <= day) {
    const q = s.queue.shift()!;
    const ev = EVENTS_BY_ID.get(q.event);
    if (ev && eligible(ev, s, w.economy, day, true)) {
      next = ev;
      break;
    }
  }
  if (!next && rng.next() < STORY.messengerChance) {
    const pool = STORY_EVENTS.filter((ev) => ev.weight > 0 && eligible(ev, s, w.economy, day));
    const total = pool.reduce((n, ev) => n + ev.weight, 0);
    let roll = rng.next() * total;
    for (const ev of pool) {
      roll -= ev.weight;
      if (roll < 0) {
        next = ev;
        break;
      }
    }
  }
  s.rngState = rng.getState();
  if (!next) return { log, arrived: false };
  s.pending = { event: next.id, day };
  s.seen[next.id] = day;
  log.push(`A messenger arrives: ${next.title}. ${next.from} waits for your answer.`);
  return { log, arrived: true };
}

/** What a choice will do, in the order the dialog lists it. Risky outcomes and follow-ups are not included. */
export function describeEffects(fx: Effects): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  if (fx.crowns) out.push({ text: `${signed(fx.crowns)} crowns`, good: fx.crowns > 0 });
  if (fx.food) out.push({ text: `${signed(fx.food)} food`, good: fx.food > 0 });
  if (fx.stone) out.push({ text: `${signed(fx.stone)} stone`, good: fx.stone > 0 });
  if (fx.timber) out.push({ text: `${signed(fx.timber)} timber`, good: fx.timber > 0 });
  for (const t of WORKER_TYPES) {
    const n = fx.workers?.[t];
    if (n) out.push({ text: `${signed(n)} ${Math.abs(n) === 1 ? t : WORKER_PLURALS[t]}`, good: n > 0 });
  }
  for (const t of TROOP_TYPES) {
    const n = fx.troops?.[t];
    if (n) out.push({ text: `${signed(n)} ${Math.abs(n) === 1 ? t : TROOP_PLURALS[t]}`, good: n > 0 });
  }
  for (const f of FACTIONS) {
    const n = fx.standing?.[f];
    if (n) out.push({ text: `${FACTION_NAMES[f]} ${signed(n)}`, good: n > 0 });
  }
  if (fx.raidDays) out.push({ text: fx.raidDays > 0 ? `next raid ${fx.raidDays} days later` : `next raid ${-fx.raidDays} days sooner`, good: fx.raidDays > 0 });
  return out;
}

const WORKER_PLURALS: Record<WorkerType, string> = {
  labourer: 'labourers',
  digger: 'diggers',
  carter: 'carters',
  quarryman: 'quarrymen',
  mason: 'masons',
  carpenter: 'carpenters',
};

const TROOP_PLURALS: Record<TroopType, string> = { swordsman: 'swordsmen', archer: 'archers' };

export const FACTION_NAMES: Record<Faction, string> = {
  crown: 'The Crown',
  church: 'The Church',
  barons: 'The Barons',
  commons: 'The Common Folk',
  borderfolk: 'The Borderfolk',
};

/**
 * Answer the waiting messenger. Applies what the choice does (or, if it was risky and the dice say
 * so, what it does instead), sets its flags and follow-ups, and records it. Returns the log line,
 * or null if there was nothing to answer or the choice can't be afforded.
 */
export function choose(w: StoryWorld, index: number, day: number, unanswered = false): string | null {
  const s = w.story;
  const ev = s.pending ? EVENTS_BY_ID.get(s.pending.event) : undefined;
  const c = ev?.choices[index];
  if (!ev || !c) return null;
  // A messenger sent away unanswered takes the default even if it can't be afforded: whatever can be paid is.
  if (!unanswered && cannotChoose(c, w.economy)) return null;
  const rng = new Rng(s.rngState);
  const went = c.risk && rng.next() < c.risk.chance;
  s.rngState = rng.getState();
  const fx = went && c.risk ? c.risk.effects : c.effects;
  apply(w, fx, day);
  s.pending = null;
  const text = unanswered ? `No answer was sent. ${fx.text}` : fx.text;
  s.chronicle.push({ day, title: ev.title, choice: unanswered ? 'No answer' : c.label, text });
  if (s.chronicle.length > CHRONICLE_KEPT) s.chronicle.splice(0, s.chronicle.length - CHRONICLE_KEPT);
  return `${ev.title}: ${text}`;
}

function apply(w: StoryWorld, fx: Effects, day: number): void {
  const e = w.economy;
  const st = e.stores;
  if (fx.crowns) {
    const n = Math.max(fx.crowns, -st.crowns);
    st.crowns += n;
    e.thisMonth.purchases += n;
  }
  if (fx.food) st.food = Math.max(0, st.food + fx.food);
  if (fx.stone) st.stone = Math.max(0, st.stone + fx.stone);
  if (fx.timber) st.timber = Math.max(0, st.timber + fx.timber);
  for (const t of WORKER_TYPES) {
    const n = fx.workers?.[t];
    if (!n) continue;
    e.workers[t] = Math.max(0, e.workers[t] + n);
    // Those who join are kept on; those who leave aren't hired again straight away.
    e.wanted[t] = n > 0 ? Math.max(e.wanted[t], e.workers[t]) : Math.max(0, Math.min(e.wanted[t], e.workers[t]));
  }
  for (const t of TROOP_TYPES) {
    const n = fx.troops?.[t];
    if (!n) continue;
    e.troops[t] = Math.max(0, e.troops[t] + n);
    e.troopsWanted[t] = n > 0 ? Math.max(e.troopsWanted[t], e.troops[t]) : Math.max(0, Math.min(e.troopsWanted[t], e.troops[t]));
  }
  for (const f of FACTIONS) {
    const n = fx.standing?.[f];
    if (n) addStanding(w.story, e, f, n);
  }
  const d = w.defence;
  if (fx.raidDays && d.raids && !d.battle && !d.siege) {
    // Scouts have already seen them coming: by then it's too late to change the day.
    if (!d.warned) {
      let next = Math.max(day + STORY.raidLeadDays, d.nextRaid + fx.raidDays);
      while (isWinter(next)) next += fx.raidDays > 0 ? 1 : -1;
      if (next <= day + STORY.raidLeadDays) {
        next = day + STORY.raidLeadDays;
        while (isWinter(next)) next++;
      }
      d.nextRaid = next;
    }
  }
  for (const f of fx.set ?? []) w.story.flags[f] = day;
  for (const f of fx.clear ?? []) delete w.story.flags[f];
  if (fx.follow) w.story.queue.push({ event: fx.follow.event, day: day + fx.follow.months * DAYS_PER_MONTH });
}
