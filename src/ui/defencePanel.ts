import { RAIDS, TROOP_TYPES, TROOPS, UNITS, type TroopType } from '../data/combat';
import { WAGE_LEVELS } from '../data/economy';
import { battleCounts, battleSeconds, deploying, redeploy, type BattleReport } from '../sim/battle';
import { formatDate } from '../sim/calendar';
import { describeStrength, postCounts, raidStrength } from '../sim/defence';
import { setTroopsWanted } from '../sim/economy';
import { today } from '../sim/state';
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
  private raidArmed = false;
  private pastKey = '';

  constructor(
    root: HTMLElement,
    private readonly host: GameHost,
    private readonly defence: DefenceHost,
  ) {
    const outlook = el('section');
    outlook.append(el('strong', undefined, 'Raids'), this.status, this.statusDetail);

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
    root.replaceChildren(outlook, garrison, posts, testing, history);
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
    } else if (!d.raids) {
      setText(this.status, 'Raids are off.');
      setClass(this.status, 'dim');
      setText(this.statusDetail, '');
    } else if (d.warned) {
      setText(this.status, `Raiders expected about ${formatDate(d.nextRaid)} (in ${d.nextRaid - day} days), from the ${d.from}.`);
      setClass(this.status, 'warn');
      setText(this.statusDetail, `Scouts count ${describeStrength(raidStrength(d.raidCount + 1))}.`);
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
    this.raidButton.disabled = !!b;

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
