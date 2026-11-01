import { RAIDS, SIEGE, TROOP_TYPES, TROOPS, UNITS, type TroopType } from '../data/combat';
import { WAGE_LEVELS } from '../data/economy';
import { battleCounts, battleSeconds, deploying, redeploy, type BattleReport } from '../sim/battle';
import { formatDate } from '../sim/calendar';
import { describeStrength, postCounts, raidStrength } from '../sim/defence';
import { Rng } from '../sim/rng';
import { bribeCost, buyOffSiege, isSiegeRaid, siegeSupplies } from '../sim/siege';
import { addLog, today } from '../sim/state';
import { mouths, setTroopsWanted } from '../sim/economy';
import { button, el, setClass, setText } from './dom';
import type { GameHost } from './host';

/** What the panel needs beyond the game: tools and the report view. */
export interface DefenceHost {
  /** Switch the map tool to posting troops. */
  postTroops(): void;
  /** Bring the next raid now. */
  raidNow(): void;
  showReport(report: BattleReport): void;
}

/** The garrison, posts, the raid outlook and past battles. Built once, with numbers updated in place. */
export class DefencePanel {
  private readonly status = el('div');
  private readonly statusDetail = el('div', 'dim');
  private readonly counts = {} as Record<TroopType, HTMLElement>;
  private readonly garrisonNote = el('div', 'dim');
  private readonly posts = el('div');
  private readonly raidsOn = el('input');
  private readonly past = el('div');
  private readonly raidButton: HTMLButtonElement;
  private readonly bribeButton: HTMLButtonElement;
  private bribeArmed = false;
  private readonly control = {} as Record<'classic' | 'commander', HTMLInputElement>;
  private raidArmed = false;
  private pastKey = '';

  constructor(
    root: HTMLElement,
    private readonly host: GameHost,
    private readonly defence: DefenceHost,
  ) {
    const outlook = el('section');
    this.bribeButton = button('', () => {
      const s = host.sim.defence.siege;
      if (!s) return;
      if (!this.bribeArmed) {
        this.bribeArmed = true;
        setText(this.bribeButton, `Click again: pay ${bribeCost(s)} crowns`);
        return;
      }
      this.bribeArmed = false;
      const rng = new Rng(host.sim.rngState);
      const r = buyOffSiege(host.sim, rng, today(host.sim));
      host.sim.rngState = rng.getState();
      if (r.problem) setText(this.statusDetail, r.problem);
      if (r.report) {
        addLog(host.sim, r.report.headline);
        defence.showReport(r.report);
      }
    });
    outlook.append(el('strong', undefined, 'Raids'), this.status, this.statusDetail, this.bribeButton);

    const command = el('section');
    command.append(el('strong', undefined, 'Command in battle'));
    for (const [mode, text] of [
      ['classic', 'Classic: post your troops beforehand; in battle they act alone.'],
      ['commander', 'Commander: also give orders in battle. Click your soldiers (or drag round several), then click the ground to move them (archers can go up onto a wall or tower) or a raider to attack it. The right button pans; Space pauses.'],
    ] as const) {
      const input = el('input');
      input.type = 'radio';
      input.name = 'control-mode';
      input.addEventListener('change', () => {
        if (input.checked) host.sim.defence.control = mode;
      });
      this.control[mode] = input;
      const label = el('label', 'levy');
      label.append(input, ` ${text}`);
      command.append(label);
    }

    const garrison = el('section');
    garrison.append(el('strong', undefined, 'Garrison'), el('div', 'dim', 'Set how many soldiers you want; they arrive over a few days.'));
    for (const t of TROOP_TYPES) {
      const row = el('div', 'hire-row');
      const name = el('span', 'hire-name', UNITS[t].plural);
      name.title = TROOPS[t].note;
      const count = el('span', 'hire-count');
      this.counts[t] = count;
      const want = (d: number) => setTroopsWanted(host.sim.economy, t, host.sim.economy.troopsWanted[t] + d);
      row.append(name, count, button('−', () => want(-1)), button('+', () => want(1)), button('+5', () => want(5)), el('span', 'dim hire-wage', `${TROOPS[t].wage}/day`));
      garrison.append(row, el('div', 'hire-note dim', TROOPS[t].note));
    }
    garrison.append(this.garrisonNote);

    const posts = el('section');
    posts.append(
      el('strong', undefined, 'Posts'),
      this.posts,
      el('div', 'dim', 'Soldiers without a post are placed when raiders come: archers on the walls nearest the attack, swordsmen round the keep (or the camp).'),
      button('Post troops (tool 0)', () => defence.postTroops()),
      button('Clear all posts', () => {
        host.sim.defence.posts = [];
        redeploy(host.sim);
      }),
    );

    const testing = el('section');
    this.raidsOn.type = 'checkbox';
    this.raidsOn.addEventListener('change', () => (host.sim.defence.raids = this.raidsOn.checked));
    const raidsLabel = el('label', 'levy');
    raidsLabel.append(this.raidsOn, ' Raids come (untick to build in peace, for practice)');
    this.raidButton = button('Bring the next raid now', () => {
      if (!this.raidArmed) {
        this.raidArmed = true;
        setText(this.raidButton, 'Click again: raiders attack now');
        return;
      }
      this.raidArmed = false;
      setText(this.raidButton, 'Bring the next raid now');
      defence.raidNow();
    });
    testing.append(el('strong', undefined, 'Testing'), raidsLabel, this.raidButton);

    const history = el('section');
    history.append(el('strong', undefined, 'Past battles'), this.past);
    root.replaceChildren(outlook, command, garrison, posts, testing, history);
  }

  update(): void {
    const { sim } = this.host;
    const d = sim.defence;
    const e = sim.economy;
    const day = today(sim);
    const b = d.battle;
    if (b) {
      const c = battleCounts(b);
      setText(
        this.status,
        deploying(b) ? 'Raiders have arrived! Post your troops (tool 0), then press Space to fight.' : `Battle under way: ${Math.floor(battleSeconds(b))} seconds in.`,
      );
      setClass(this.status, 'bad');
      setText(
        this.statusDetail,
        `Raiders left: ${c.raider} ${UNITS.raider.plural.toLowerCase()}, ${c.raiderArcher} archers${c.sapper > 0 ? `, ${c.sapper} ${(c.sapper === 1 ? UNITS.sapper.name : UNITS.sapper.plural).toLowerCase()}` : ''}${c.ladderCrew > 0 ? `, ${c.ladderCrew} ${(c.ladderCrew === 1 ? UNITS.ladderCrew.name : UNITS.ladderCrew.plural).toLowerCase()}` : ''}. Your soldiers: ${c.swordsman} swordsmen, ${c.archer} archers.${(b.ladders ?? []).some((l) => l.up) ? ' Ladders are up against your walls!' : ''}${b.phase === 'retreat' ? ' The raiders are falling back.' : ''}`,
      );
    } else if (d.siege) {
      const s = d.siege;
      const food = Math.round(e.stores.food);
      setText(this.status, `Besieged: ${s.raiders} raiders are camped to the ${s.from}. Day ${day - s.day} of the siege.`);
      setClass(this.status, 'bad');
      setText(
        this.statusDetail,
        `They have ${s.supplies > 0 ? `about ${s.supplies} days of food left` : 'run out of food'}, and their morale is ${Math.max(0, Math.round(s.morale))}%. Your stores: ${food} rations, about ${Math.floor(food / Math.max(1, mouths(e)))} days.${s.hungryDays > 0 ? ` Your stores are empty: ${Math.max(0, SIEGE.blockade.starveDays - s.hungryDays)} days before you must yield.` : ''} Nothing can be bought, and nobody new arrives, until they go.`,
      );
    } else if (!d.raids) {
      setText(this.status, 'Raids are off.');
      setClass(this.status, 'dim');
      setText(this.statusDetail, '');
    } else if (d.warned) {
      setText(this.status, `Raiders expected about ${formatDate(d.nextRaid)} (in ${d.nextRaid - day} days), from the ${d.from}.`);
      setClass(this.status, 'warn');
      const n = d.raidCount + 1;
      setText(
        this.statusDetail,
        `Scouts count ${describeStrength(raidStrength(n))}.${isSiegeRaid(n) ? ` They bring a siege train with about ${siegeSupplies(n)} days of food: if they can't break in, they will camp outside and try to starve you out. Lay in food while you can.` : ''}`,
      );
    } else {
      setText(this.status, 'No raiders sighted.');
      setClass(this.status, '');
      setText(this.statusDetail, `Scouts give ${RAIDS.warningDays} days' warning. Raids come more often, and stronger, as the castle rises.`);
    }

    for (const t of TROOP_TYPES) {
      const have = e.troops[t];
      const want = e.troopsWanted[t];
      setText(this.counts[t], want > have ? `${have} of ${want}` : String(have));
      setClass(this.counts[t], want > have ? 'hire-count warn' : 'hire-count');
    }
    const pay = WAGE_LEVELS[e.wage].pay;
    setText(
      this.garrisonNote,
      `The crown pays for ${TROOPS.swordsman.crownPays} swordsmen and ${TROOPS.archer.crownPays} archers. Others cost ${TROOPS.archer.wage * pay} crowns a day each (${WAGE_LEVELS[e.wage].name.toLowerCase()} wages), winter too, and eat a ration a day.`,
    );
    const pc = postCounts(e, d);
    setText(this.posts, TROOP_TYPES.map((t) => `${UNITS[t].plural}: ${pc[t].posted} posted, ${pc[t].have} in the garrison`).join(' · '));
    this.raidsOn.checked = d.raids;
    this.raidButton.disabled = !!b || !!d.siege;
    this.bribeButton.hidden = !d.siege;
    if (d.siege && !this.bribeArmed) setText(this.bribeButton, `Pay them to leave (${bribeCost(d.siege)} crowns)`);
    if (!d.siege) this.bribeArmed = false;
    const mode = d.control ?? 'classic';
    this.control.classic.checked = mode === 'classic';
    this.control.commander.checked = mode === 'commander';

    const key = JSON.stringify(d.reports.map((r) => [r.raid, r.day]));
    if (key !== this.pastKey) {
      this.pastKey = key;
      const items = [...d.reports].reverse().map((r) => {
        const row = el('div', 'job');
        row.append(el('div', r.outcome === 'plundered' ? 'bad' : 'good', `${formatDate(r.day)}: ${r.headline}`));
        row.append(button('Read the report', () => this.defence.showReport(r)));
        return row;
      });
      this.past.replaceChildren(...(items.length > 0 ? items : [el('div', 'dim', 'None yet.')]));
    }
  }
}
