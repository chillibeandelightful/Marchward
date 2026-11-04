import { describe, expect, it } from 'vitest';
import { STORY, STORY_EVENTS } from '../src/data/events';
import { CALENDAR } from '../src/data/economy';
import { RAIDS } from '../src/data/combat';
import { isWinter } from '../src/sim/calendar';
import { scheduleRaid } from '../src/sim/defence';
import { taxDue } from '../src/sim/economy';
import { Rng } from '../src/sim/rng';
import { fromSave } from '../src/sim/save';
import { answerMessenger, createSim, today, type SimState } from '../src/sim/state';
import { borderRaidGapFactor, cannotChoose, crownTaxFactor, eligible, EVENTS_BY_ID } from '../src/sim/story';
import { hasFigure } from '../src/ui/hallScene';
import { days } from './helpers';

const MONTH = CALENDAR.daysPerMonth;

/** Put a particular messenger at the gate today. */
function arrive(s: SimState, id: string): void {
  s.story.pending = { event: id, day: today(s) };
  s.story.seen[id] = today(s);
}

describe('story events (data)', () => {
  it('has unique ids, three choices each, and text for every outcome', () => {
    const ids = new Set<string>();
    for (const ev of STORY_EVENTS) {
      expect(ids.has(ev.id), ev.id).toBe(false);
      ids.add(ev.id);
      expect(ev.choices).toHaveLength(3);
      expect(ev.text.length).toBeGreaterThan(20);
      for (const c of ev.choices) {
        expect(c.effects.text.length, `${ev.id}: ${c.label}`).toBeGreaterThan(5);
        if (c.risk) expect(c.risk.effects.text.length).toBeGreaterThan(5);
      }
    }
  });

  it('links every follow-up to an event that exists, and every flag an event waits on is set somewhere', () => {
    const set = new Set<string>();
    const follows: string[] = [];
    for (const ev of STORY_EVENTS)
      for (const c of ev.choices)
        for (const fx of [c.effects, c.risk?.effects]) {
          for (const f of fx?.set ?? []) set.add(f);
          if (fx?.follow) follows.push(fx.follow.event);
        }
    for (const id of follows) expect(EVENTS_BY_ID.has(id), id).toBe(true);
    for (const ev of STORY_EVENTS) for (const f of ev.when?.flags ?? []) expect(set.has(f), `${ev.id} waits on ${f}`).toBe(true);
    // Every follow-up (weight 0) is reachable from some choice.
    for (const ev of STORY_EVENTS.filter((e) => e.weight === 0)) expect(follows, ev.id).toContain(ev.id);
  });

  it('names only messenger figures that have been drawn for the hall picture', () => {
    for (const ev of STORY_EVENTS) if (ev.figure) expect(hasFigure(ev.figure), `${ev.id}: ${ev.figure}`).toBe(true);
    expect(EVENTS_BY_ID.get('outlaw_caught')?.figure).toBe('reeve');
  });

  it('includes the first chains for M7, in both modes, and Legend-only events', () => {
    for (const id of ['outlaw_caught', 'abbot_request', 'baron_wedding', 'hungry_winter', 'strange_stones', 'old_stones']) expect(EVENTS_BY_ID.has(id), id).toBe(true);
    const legend = createSim(1, undefined, 'legend');
    const chronicle = createSim(1);
    const stones = EVENTS_BY_ID.get('strange_stones')!;
    expect(eligible(stones, legend.story, legend.economy, 3 * MONTH)).toBe(true);
    expect(eligible(stones, chronicle.story, chronicle.economy, 3 * MONTH)).toBe(false);
  });
});

describe('monthly messengers', () => {
  it('come from the start of the second month in most games, and pause nothing in the sim', () => {
    let came = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = createSim(seed);
      days(s, MONTH - 1);
      expect(s.story.pending).toBeNull();
      days(s, 1);
      if (s.story.pending) came++;
      const tick = s.tick;
      days(s, 1);
      expect(s.tick).toBeGreaterThan(tick);
    }
    expect(came).toBeGreaterThanOrEqual(12);
  });

  it('are the same for the same seed', () => {
    const a = createSim(7);
    const b = createSim(7);
    a.defence.raids = b.defence.raids = false;
    days(a, 8 * MONTH);
    days(b, 8 * MONTH);
    expect(a.story).toEqual(b.story);
    expect(a.story.chronicle.length).toBeGreaterThan(3);
  });

  it('apply what the chosen answer does, and record it', () => {
    const s = createSim(3);
    s.story.messengers = false;
    arrive(s, 'wandering_masons');
    const before = s.economy.stores.crowns;
    expect(answerMessenger(s, 0)).toBeNull();
    expect(s.economy.stores.crowns).toBe(before - 100);
    expect(s.economy.workers.mason).toBe(5);
    expect(s.economy.wanted.mason).toBe(5);
    expect(s.story.pending).toBeNull();
    expect(s.story.chronicle.at(-1)?.choice).toBe('Take on all five');
    expect(answerMessenger(s, 0)).not.toBeNull();
  });

  it("won't take an answer the stores can't pay for", () => {
    const s = createSim(3);
    s.economy.stores.crowns = 50;
    arrive(s, 'wandering_masons');
    const c = EVENTS_BY_ID.get('wandering_masons')!.choices[0];
    expect(cannotChoose(c, s.economy)).toMatch(/100 crowns/);
    expect(answerMessenger(s, 0)).not.toBeNull();
    expect(s.story.pending).not.toBeNull();
    expect(answerMessenger(s, 1)).toBeNull();
  });

  it('send an unanswered messenger away with the default answer at the next month', () => {
    const s = createSim(3);
    s.story.messengers = false;
    days(s, MONTH);
    arrive(s, 'baron_wedding');
    const barons = s.story.standing.barons;
    days(s, MONTH);
    expect(s.story.pending).toBeNull();
    expect(s.story.chronicle.at(-1)).toMatchObject({ title: 'An offer of marriage', choice: 'No answer' });
    expect(s.story.standing.barons).toBe(barons - 5);
  });

  it('follow a choice up months later, through flags', () => {
    const s = createSim(5);
    s.defence.raids = false;
    days(s, MONTH);
    arrive(s, 'outlaw_caught');
    expect(answerMessenger(s, 1)).toBeNull();
    expect('outlaw_spared' in s.story.flags).toBe(true);
    expect(s.story.queue).toEqual([{ event: 'outlaw_returns', day: MONTH + 5 * MONTH }]);
    // Answer anything else that comes meanwhile with the default, then the thief comes back.
    days(s, 5 * MONTH);
    expect(s.story.pending?.event).toBe('outlaw_returns');
  });

  it('change the day of the next raid, but never into winter or before the scouts can warn', () => {
    const s = createSim(2);
    s.story.messengers = false;
    const day = today(s);
    s.defence.nextRaid = day + 60;
    arrive(s, 'hungry_winter');
    expect(answerMessenger(s, 2)).toBeNull();
    expect(s.defence.nextRaid).toBe(day + 35);
    arrive(s, 'hungry_winter');
    s.economy.stores.food = 0;
    answerMessenger(s, 2);
    expect(s.defence.nextRaid).toBeGreaterThanOrEqual(day + RAIDS.warningDays + 1);
    expect(isWinter(s.defence.nextRaid)).toBe(false);
  });
});

describe('standing with the factions', () => {
  it('the crown scales taxes and the borderfolk the gap between raids', () => {
    const s = createSim(1);
    s.story.standing.crown = 100;
    expect(crownTaxFactor(s.story)).toBe(1.5);
    expect(taxDue(s.economy, 0, crownTaxFactor(s.story))).toBe(Math.round(taxDue(s.economy, 0) * 1.5));
    const gaps = (bf: number) => {
      s.story.standing.borderfolk = bf;
      const d = { ...s.defence };
      scheduleRaid(d, new Rng(9), 0, borderRaidGapFactor(s.story));
      return d.nextRaid;
    };
    expect(gaps(0)).toBeLessThan(gaps(100));
  });

  it('the church preaches the common folk up or down each month', () => {
    const s = createSim(1);
    s.story.messengers = false;
    s.economy.standing = 50;
    s.story.standing.church = 90;
    days(s, MONTH);
    // Two a month for no levy, and the church's one.
    expect(s.economy.standing).toBe(50 + 2 + STORY.churchSway);
  });

  it('is kept in saves, and older saves get a fresh Chronicle story', () => {
    const s = createSim(4) as unknown as Record<string, unknown>;
    delete s.story;
    const file = fromSave(JSON.stringify({ version: 5, savedAt: 0, state: s }));
    expect(file.state.story.mode).toBe('chronicle');
    expect(file.state.story.standing.crown).toBe(STORY.startStanding.crown);
  });
});
