# Marchward – Design Document

## Pillars
1. **Your design matters.** Every choice in the castle designer (where, how high, how thick, what shape) has a visible, understandable effect in battle.
2. **The land matters.** Terrain type and height affect building, movement and combat. You can reshape the land, at a real labour cost.
3. **A living frontier.** A village, wandering villagers, roads, banners and seasons make each site feel like a place, not a patch of grass.
4. **Stories with consequences.** Monthly messengers bring choices that chain into ongoing stories.
5. **Clarity over mystery.** Unlike the original, the game shows its numbers: stats in the designer, combat feedback, and clear economy reports.

## Core loop
1. Arrive at a new site (region) and survey the terrain.
2. Plan earthworks and lay out the castle in the designer.
3. Hire and assign workers; construction proceeds through the seasons (halts in winter).
4. Manage money: taxes, levies, wages, food stores.
5. Respond to a messenger each month (three choices, consequences may follow later).
6. Defend against raids and sieges.
7. Complete the required castle pieces to finish the site; move on to the next region.

## Map and terrain
- Isometric diamond grid, roughly 64×64 tiles per site to start (tune later).
- Each tile has a **terrain type** and an integer **height level** (0–6 to start).
- A height difference of 1 between neighbours is a walkable slope. A difference of 2 or more is a cliff: impassable and unbuildable across.

| Terrain | Movement | Building | Other |
|---|---|---|---|
| Grassland | Normal | Normal | — |
| Forest | Slow | Must be cleared first (gives timber) | Blocks archer line of sight partially |
| Marsh | Very slow; heavy units may not enter | Stone needs piling/drainage first (extra cost) | Freezes in hard winters and becomes passable |
| Rocky ground | Normal | Excellent foundation | Cannot be sapped; moats cannot be dug |
| Shallow water / ford | Very slow | No | — |
| Deep water | Impassable | No | Natural moat |
| Road | Fast (for everyone, enemies too) | — | Mostly aesthetic; gives a small travel speed bonus |

Snow is seasonal dressing on top of terrain, not its own type.

### Earthworks
- Workers can raise or lower a tile by one height level per job.
- **Lowering produces spoil; raising consumes it.** Spoil is a stockpiled resource. Digging a moat therefore helps fund a mound for the keep (motte-and-bailey style).
- Cost scales with the volume moved. Diggers and labourers do the work, and carters move spoil faster.
- Earthworks are slow and the UI should make the time cost obvious before you commit.

## Castle pieces
Every piece shows its stats, cost and build time in the designer before placement.

### Walls
| Property | Options | Gameplay effect |
|---|---|---|
| Thickness | Thin / Standard / Thick | Hit points against battering and smashing; how long sappers need to undermine it |
| Height | Low / Medium / High | Low walls can be climbed by ladder crews (and goblins); High walls cannot be laddered. Archers on top get a range bonus |
| Extras | Arrow slits, oil cauldrons | Slits let archers fire from cover; cauldrons strike attackers at the wall base (limited uses per battle, refilled between battles) |

**Effective height = ground height + wall height.** A Medium wall on a raised mound behaves like a High wall for laddering and range.

Starting numbers to tune in playtesting:
- Thickness HP: Thin 100, Standard 180, Thick 280. Stone cost ×1, ×1.6, ×2.3.
- Height: build time ×1, ×1.5, ×2.2. Archer range bonus +0, +1, +2 tiles.

### Towers
- Square or round, three heights.
- Round towers resist sapping and battering better, but take longer to build.
- Archer platforms; tower height gives a range bonus like walls.

### Gatehouse and keep
- One gatehouse and one keep are required to complete a site.
- The gate can be opened and closed during battle to let troops out and in.

### Moat
- Dry or wet (wet needs adjacency to water).
- Blocks sappers and ladder crews from reaching that wall.
- Cannot be dug in rocky ground.

## Workers and economy
- Worker types: labourers, diggers, quarrymen, masons, carpenters, carters.
- Wages are adjustable. Low wages reduce hiring and efficiency.
- Workers are assigned to build jobs; the game shows each job's progress, expected finish date and bottleneck (e.g. "short on masons").
- Money: annual taxes (rising with castle completion), optional monthly levies (unpopular), and story-event income or costs.
- Food stores matter during sieges.
- Seasons: construction halts in winter; taxes collected in spring; hiring happens over time.
- Reports panel: simple graphs for money, food, workforce efficiency and construction progress over time.

## Combat
### Control modes (chosen at campaign start)
- **Classic:** place troops before battle; they act on their own after that.
- **Commander:** place troops, then issue move and target orders during battle. Battles can be paused.

### Starting units (milestone scope)
- **Defenders:** swordsmen, archers.
- **Attackers:** raiders (melee), archers, sappers, ladder crews.

### Siege threats
- **Sappers** tunnel under a wall or tower over time, then collapse it. Countered by moats, rocky ground, round towers, and killing them before they finish.
- **Ladder crews** climb Low walls (and Medium walls on attackers' high ground, if effective height allows).
- **Battering** by raiders damages thickness HP.
- **Sieges:** enemies may surround the castle; food stores drain. Besiegers also have limited supplies and morale, so a siege is a contest of endurance on both sides.

### Enemy behaviour
- Enemies choose approach directions based on weak points (low walls, gaps, unfinished sections), not just the shortest path.
- Attack direction varies between raids.
- Height and terrain affect movement speed; archers gain range from higher ground.

### Later unit ideas (stretch)
- Defenders: spearmen, crossbowmen, mounted knights.
- Attackers: battering ram, siege tower (can reach High walls), mounted raiders.

## Story modes
Chosen at campaign start. See `STORY.md`.
- **Chronicle:** grounded, historical-feeling frontier politics. No magic.
- **Legend:** the same frontier, but with folklore made real: creatures, omens and strange events.

### Legend creatures (stretch)
- **Goblins:** fast and fragile; can scale Low and Medium walls without ladders.
- **Trolls:** slow and very tough; batter walls quickly; vulnerable to oil cauldrons.
- **Bog wights:** appear only from marsh tiles; slow down nearby defenders.

## Atmosphere (mostly cosmetic)
- **Village:** procedurally placed near a road and water. Cottages, a well, fields, a small market.
- **Villagers:** wander between fields, well and market on simple schedules. When raiders appear, they run for the castle gate.
- **Roads:** a paved road through the village toward the castle; mostly visual, with a small speed bonus.
- **Banners:** the player's heraldry flies from finished towers and is shown on their troops.
- **Seasons:** grass colour shifts, autumn trees, snow in winter.

## Heraldry
At campaign start, the player designs a banner:
- Field: one or two colours from a set of heraldic tinctures.
- Division: plain, per pale, per fess, quarterly, per bend, chevron.
- Charge (sigil): pick from a library of original symbols drawn in code (e.g. tower, stag, boar, oak, crescent, star, axe, key).
- Preview shown on a flag, a shield and a tower.

## Campaign
- Choice of length at start (e.g. 3, 5 or 8 sites).
- Each region has its own terrain character and gets harder: more frequent and stronger raids, tighter money, tougher ground.
- Difficulty levels adjust tax income and raid strength. A practice mode has no raids.

## UI principles
- Every number that affects outcomes is visible somewhere.
- Hovering a wall or tower shows its stats and current HP.
- After each battle: a short report (what got breached, by what, and why).
- Speed controls: pause, 1×, 2×, 4×.

## Out of scope (for now)
- True 3D, multiplayer, mobile layout, voice acting.

## Decisions log
Record design decisions made during development here, with a date and a one-line reason.
