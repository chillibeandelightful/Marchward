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
- Consoles and controllers: Marchward is for PC players only (desktop browser, mouse and keyboard). Don't design for gamepads, TV screens or touch.

## Decisions log
Record design decisions made during development here, with a date and a one-line reason.
- 2026-10-26: Simulation runs at a fixed 30 ticks per second; enough for smooth movement while keeping step counts small for testing.
- 2026-10-26: RNG is mulberry32, whose whole state is one 32-bit number, so saves can store it exactly.
- 2026-10-26: Sites are authored as an ordered list of features (hills, plateaus, terrain patches, rivers, roads) rather than tile-by-tile, so they stay readable and easy to tweak. Hills built this way only ever make slopes; plateaus make cliffs.
- 2026-10-26: "Ford" is its own terrain type with the same rules as shallow water, so a road crossing can be drawn and named; it appears wherever a road crosses water.
- 2026-10-26: Slopes are a drawing effect: each tile corner takes the average height of the neighbouring tiles within one level, so slopes become smooth ramps. Rules still use whole tile heights.
- 2026-10-26: One height level is drawn 16 px tall (half a tile's height), tall enough to read cliffs and slopes at a glance.
- 2026-10-26: Open question from the M1 playtest: is 64×64 too big? The playtester recalled maps in older games feeling needlessly large when only the castle mattered. Revisit in M2–M4 once a castle and raids show how much land is actually used; shrinking the site or making the surroundings matter (village, approaches, earthworks) are both options.
- 2026-10-26: Walls are laid one tile at a time; a dragged line steps edge to edge, so every wall tile joins its neighbours along an edge. Walls stand 1/2/3 levels (Low/Medium/High), towers 2/3/4, the gatehouse 3 and the keep 5 over 2×2 tiles. Simplest fit for the tile grid.
- 2026-10-26: "Effective height" is measured as how far a piece's top stands above the highest outside ground next to it (outside = reachable on foot from the map edge with the gate shut; if none, open ground inside). Ladder crews can climb 1 level; archer range bonus is +0/+0/+1/+2/+3 by that height. This one number covers both "a mound makes a Medium wall act High" and "attackers on high ground can ladder a Medium wall".
- 2026-10-26: New walls, towers and the gatehouse must touch the existing curtain (edge to edge, no cliff between) once any exists; the keep stands alone. Removing pieces can still split the curtain, which the plan panel warns about rather than forbids.
- 2026-10-26: Costs in M2 are stone, timber and worker-days, without money or a budget; prices and wages come with the economy in M3. Ground preparation per tile: forest +6 worker-days and gives 8 timber; marsh +6 stone, +10 timber, +14 worker-days. Rocky ground can be built up but not dug.
- 2026-10-26: Earthworks: 10 cartloads of spoil per tile-level; lowering costs 6 worker-days per level, raising 4. A spoil shortfall is shown as a warning, not a block, until M3 decides whether fill can be bought or carted in.
- 2026-10-26: The castle is "enclosed" when no tile next to the keep can be reached on foot from the map edge with the gate shut. Cliffs and deep water count, so a crag or a river bend can do some of the walls' work. This is the first way the land beyond the walls matters; map size is still 64×64 and stays an open question until raids (M4) show how much of it gets used.
- 2026-10-26: Earthworks ripple by default (M2 playtest): raising or lowering a tile pulls along any neighbour that met it as flat ground or a slope but would now meet it at a cliff, and so on outwards, so repeated digging makes a widening pit with walkable sides. Existing cliffs and undiggable ground stop the ripple. Holding Shift changes just the one tile, for a deliberate sheer ditch or bank. Every tile moved counts towards spoil and labour.
- 2026-10-26: Time: one game day is 20 sim ticks; 30-day months; the year starts in spring (March) so the first season is a building season. Winter is the last three months. Speed controls are 1×, 2× and 4× sim steps per tick, and the game starts paused.
- 2026-10-26: Money is "crowns". Starting purse 6,000; spring taxes from year 2 are (5,000 + up to 5,000 more as finished pieces reach about 1,200 worker-days) × standing/100, so planning a tiny castle doesn't earn the bonus. Harvest dues (2,500 rations × standing) come in on the first of autumn. A monthly levy gives 600 crowns and costs 6 standing; standing recovers 2 a month without one.
- 2026-10-26: Work is split into four trades (masonry, carpentry, digging, hauling). Each piece's worker-days from M2 are shared between them by kind (`JOB_MIX`), and each worker type does some trades: masons, carpenters and diggers do their own; carters haul at twice a labourer's rate; labourers dig and haul at 0.6. This is what lets the game say exactly which trade is short.
- 2026-10-26: Workers are assigned automatically each day: specialists first, then labourers, to jobs in order (earthworks, then pieces in the order placed), up to a crew limit per job. No manual job priorities yet; simplest thing that shows progress and bottlenecks clearly.
- 2026-10-26: Winter: building and quarrying stop, workers stay on at half pay (dismiss them to save money; rehiring takes time in spring). Hiring runs at half speed in winter.
- 2026-10-26: Food: one ration per worker per day. With no food, or wages unpaid, workers work at half rate, 8% a day walk off, and nobody new comes. Food can be bought (0.25 crowns a ration).
- 2026-10-26: Spoil (resolves the M2 open question): fill can be bought at 3 crowns a cartload. Raising a tile takes its spoil when that level starts; lowering adds spoil when it finishes. Finished earthworks change the land itself; the plan keeps only the earthworks still to do.
- 2026-10-26: Pieces wait until the earthworks under them are done; earthworks on a tile wait if a piece there is already started. Removing a piece, even a finished one, removes it outright with no refund (demolition costs come later if needed).
- 2026-10-26: Taxes reward finished pieces only; a piece counts once fully built. The keep, gatehouse and towers announce themselves in the log when finished; walls are counted.
- 2026-10-26: Saves are the whole sim state as JSON in localStorage, one manual slot and one autosave (first of each month), with a version number and a migration step per version.
- 2026-10-26: Pace (M3 playtest: building felt far too fast). All piece, ground-preparation and earthwork labour costs ×2.5 (a Thin Low wall tile is now 30 worker-days, the keep 650, lowering a tile one level 15), quarrymen cut 1 stone a day, and a day is 30 ticks (one second at 1×). Starting purse 8,000 and tax base 7,000 so a steady crew can work most of a season; the full tax bonus now needs about 3,000 worker-days of finished pieces. A modest hilltop castle now takes into the second year. Building should feel slow enough that raids (M4) land on a half-built castle.
- 2026-10-26: Open item from the M3 playtest: the map looks too bright and cheerful next to the drab, earthy palette the playtester remembers. Plan a muted, earthier colour pass (land, water, stone, sky tone) as part of M8 atmosphere work, or earlier if it bothers playtests. Colours already live in `src/render/terrainStyle.ts` and the art modules, so it's a palette change, not a rewrite.
- 2026-10-26: Battles run in sim ticks but the calendar stands still while they do (a raid is over in a few minutes, not days), and building stops. The game pauses itself when a battle starts and ends, so the player can look before and after.
- 2026-10-26: A piece counts as standing once it is half built, with HP and height scaled by progress; below that it is a gap. Damage in battle undoes building work in proportion; a breached piece drops to 20% built and goes back in the job list. This is how raids land on a half-built castle and cost building time.
- 2026-10-26: Raids: first around day 100–120, then every 100–150 days, never in winter (pushed into spring). Strength is 4 + 3 per raid raiders and 1 + 1 per raid raider archers, from a random map edge, with 10 days' warning. A "Raids come" switch and a "Bring the next raid now" button are there for practice and testing.
- 2026-10-26: The garrison is part of the economy: the crown pays 3 swordsmen and 4 archers; extras cost 3 crowns a day (times the wage level), full pay in winter, and eat a ration. Unpaid or hungry soldiers desert like workers.
- 2026-10-26: Archer reach is 5 tiles plus the piece's range bonus (the same +0/+0/+1/+2/+3 by effective height as M2), minus the bonus when shooting up at a higher target; hit chance drops 10% per level shot upwards (to at most 40% less). Cover: arrow slits 70%, battlements 40%, unfinished pieces 10%, forest 40%.
- 2026-10-26: Arrow slits and oil cauldrons are optional extras added with their own tool, for stone and labour. The keep has slits built in. A cauldron needs an archer on the piece to use it, holds 3 pours and hits everyone within about a tile of the foot.
- 2026-10-26: Raiders route by a cost that treats standing pieces as passable at a price that grows with their HP, so they head for the weakest way in; they then mass at one piece (up to 4 batter it at once) rather than spreading out. Smarter weak-point choice and varied tactics come with M6 (Siege depth).
- 2026-10-26: Raiders win by plundering: 40 raider-seconds at the keep (or the camp, while no keep is half built), only while no defender swordsman stands within 4 tiles. Plunder takes 20% of crowns and 30% of food and costs 8 standing; beating a raid off gives 3. Raiders break at 65% losses or after 3 minutes.
- 2026-10-26: M4 ships Classic control only (place troops beforehand, they act alone). The control-mode choice arrives with Commander mode in M6 (Siege depth), when there is a campaign start to choose it at.
- 2026-10-26: PC only (playtester's call): the game targets desktop browsers with mouse and keyboard, with no console, controller or touch support planned. UI can assume a pointer, hover and keyboard shortcuts.
- 2026-10-27: New milestone M5, "Classic look", straight after M4 (playtester's call, from two reference mockups); later milestones move up one (Siege depth is now M6, Messengers M7, Campaign M8, Atmosphere M9). It takes over the M3 palette note above. The look is a switchable style layer ("Classic" and "Modern") chosen from a menu and kept per browser, not in saves, so the sim and save format never depend on it. "Classic" here is the visual style; Classic control mode is a separate thing.
- 2026-10-27: Deployment window (M4 playtest: troops couldn't be placed once raiders appeared, and "Bring the next raid now" gives no warning). A battle opens paused with the raiders at the edge; until the first tick, posts can be changed and the garrison is re-placed from them at once. Only troop posts can change then; building tools stay locked. Once the fight starts, Classic control locks everything.
- 2026-10-27: M5 fire and smoke are visual only: flames where raiders plunder (the keep's front faces, or the camp's tents), dust and smoke from a breach, dust from battering. Burning as a game rule (buildings that catch and spread) stays with the later milestone that adds buildings to burn.
- 2026-10-27: Modern stays the default style, so nothing changes for anyone until they pick Classic (Game tab or L). The choice is kept per browser.
- 2026-10-27: Classic panels are dark iron plates rather than parchment, so the existing green, amber and red status text stays readable; parchment is used for the message log and the battle report, where the text is short.
- 2026-10-27: Classic icons map to the existing tabs: build → Building, workers → Workers (hiring trades), timber and stone → Workers (Buy supplies), defence → Defence, standing → Workers (Money and standing), hiring → Defence (Garrison), plan → Plan, reports → Reports, save → Game. Timber and stone share a section because buying supplies is one list.
- 2026-10-27: Classic raiders wear dark blue instead of drab brown: brown vanished against the olive Classic ground. Team colours are red for you and blue for raiders in Classic.
- 2026-10-27: The Classic palette is built from the style's own colours (six brightness steps each), merged down to 128, rather than a fixed historical palette, so the land keeps its colours and only in-between shades are dithered.
- 2026-10-27: Top-down view (playtester's request). While placing pieces (Wall, Tower, Gatehouse, Keep) and while posting troops (including the pause before a fight), the map switches to a flat plan seen from straight above, where nothing hides the tile you point at; every other tool, and the fight itself, uses the normal isometric view. The same spot stays in the middle of the screen when it switches. T turns the switch off and on. It is a second way of drawing the same state (`src/render/topDown.ts`, `topDownView.ts`), separate from the Classic/Modern style layer, and borrows that layer's colours.
- 2026-10-27: Planned pieces are marked out only as the outline of their footings on the ground, like a builder's lines, not as a model of the finished piece (playtester: in the original castle games you knew where a wall would go, not exactly what it would look like). Pieces being built show the outline with the built part rising in stone inside it. The green/red preview while placing is unchanged. The outline is a pale chalk colour in both looks (`planned` in each style).
- 2026-10-27: Two backlog ideas agreed with the playtester (details in `MILESTONES.md` → Backlog). Build order will grow the curtain outward from the keep, with towers ahead of the walls they join and a one-click "build this next". The aim is sensible order without a priority list. Wall collapse will be a rare event, weighted to poorly supported walls and warned about by a crack first, so it rewards good building rather than being pure luck.
