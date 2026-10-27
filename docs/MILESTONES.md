# Milestones

Each milestone ends with a playable build on GitHub Pages and a short "how to test" note in `PLAYTEST.md`. The playtester gives feedback before the next milestone starts.

## M0 – Project setup
- Vite + TypeScript + PixiJS + Vitest scaffold.
- GitHub Actions deploy to Pages.
- Fixed-step game loop, seeded RNG, empty sim/render/ui split.
- **Playtest:** the page loads and shows a test scene.

## M1 – Terrain and camera
- Isometric tile renderer with height levels, slopes and cliff faces.
- Terrain types drawn procedurally: grass, forest, marsh, rock, water, road.
- One hand-made test site.
- Camera pan and zoom; tile hover readout (type, height).
- **Playtest:** does the land read clearly? Can you tell heights and terrain apart at a glance?

## M2 – Castle designer
- Place walls, towers (square/round), gatehouse and keep.
- Height and thickness options, with stats and cost shown before placement.
- Validity rules: connection, no building across cliffs, foundation rules.
- Plan earthworks: mark tiles to raise or lower, with a spoil balance shown.
- **Playtest:** is designing fun and clear? Are the stats understandable?

## M3 – Construction, workers and economy
- Hire workers; wages; efficiency.
- Construction and earthworks progress over time, with workers animated on site.
- Seasons, winter halt, taxes, levies, food.
- Reports panel with simple graphs.
- Save and load.
- **Playtest:** does building feel satisfying? Is it clear what's slowing you down?

## M4 – Combat core
- Pathfinding with terrain and height costs.
- Swordsmen and archers on both sides; raiders batter walls.
- Wall and tower HP, height-based archer range, arrow slits, oil cauldrons.
- Classic control mode.
- Post-battle report.
- **Playtest:** do thickness and height choices clearly matter?

## M5 – Classic look (switchable visual style)
A second visual style, "Classic", close to the drab, chunky look of early-'90s castle games, alongside the current one (called "Modern" in the menu). Built as a style layer from the start, so the look can be switched from a menu at any time and later art work slots in behind the same switch.
- Style layer (`src/render/styles/`): one `VisualStyle` object per style holds the palette (land, water, stone, timber, sky, troops), the sprite drawing choices, the UI theme and the screen effects. Game logic and the sim never see it; render and UI read the active style.
- Style switch in the Game tab (and a key), applied instantly without reloading, remembered per browser in localStorage. Not part of saved games.
- Classic palette: muted olive and brown ground, grey stone with visible block courses and darker mortar, dark pines, slate water, an overcast sky band with distant hills behind the map. Folds in the M3 note that the map was too bright.
- Classic sprites: stone-block texture on walls, towers and keep; heavier dark outlines; chunkier workers and soldiers with stronger team colours; timber scaffolding and carts in the same hand.
- Screen effect: the map is drawn to a low-resolution texture and scaled up with nearest-neighbour filtering (about 2–3× chunky pixels), then reduced to a limited palette with ordered dithering. Strength adjustable; off in Modern.
- Classic UI frame: bevelled iron border with rivets round the map; a parchment message panel along the bottom showing the latest log lines beside a heraldic banner; a column of icon buttons down the right for the tools and tabs (build, workers, timber, stone, defence, standing, hiring, plan, reports, save). Icons drawn in code; an openly licensed pixel font. Panels open from the icons over the frame. Modern keeps today's layout.
- Not in this milestone: burning buildings, mounted units, villagers and seasonal visuals (later milestones), and hand-painted art. Procedural drawing will get the palette, frame and pixel feel of the reference mockups, not their painted detail.
- **Playtest:** does Classic feel like the look you remember? Is switching styles quick and does everything still read clearly in both?

## M6 – Siege depth
- Sappers, ladder crews, moats.
- Smarter enemy approach (weak points, varied directions).
- Sieges with food on both sides.
- Commander control mode.
- **Playtest:** do the defensive choices feel like real trade-offs?

## M7 – Messengers and story
- Event system: monthly messenger, three choices, flags and consequences, chained stories.
- Chronicle mode event set (first batch).
- Factions and standing.
- **Playtest:** are the choices interesting? Do consequences show up later?

## M8 – Campaign
- Multiple regions with distinct terrain.
- Campaign length choice, difficulty levels, practice mode.
- Region-to-region progression and carry-over.
- **Playtest:** a full short (3-site) campaign start to finish.

## M9 – Atmosphere and heraldry
- Village generation, wandering villagers (who flee to the gate during raids), roads.
- Banner designer; banners on towers and troops.
- Seasonal visuals (in both visual styles).
- Sound effects and music.
- **Playtest:** does each site feel alive?

## Stretch
- Legend mode: event set plus goblins, trolls, bog wights.
- Expanded units: spearmen, crossbowmen, knights, rams, siege towers.
- Hand-made or commissioned art replacing procedural sprites.

## Progress log
Update as milestones complete.

### M0 – Project setup (done 2026-10-26)
- Vite + TypeScript (strict) + PixiJS + Vitest scaffold, with exact pinned versions.
- GitHub Actions workflow: tests and build on every PR; build and deploy to Pages on push to `main`.
- `src/sim/`: seeded RNG (`rng.ts`, saveable state), fixed-step accumulator (`loop.ts`, 30 ticks/s), plain-data sim state (`state.ts`).
- `src/render/`: isometric projection and the test scene; `src/ui/`: status HUD; `src/data/`: test scene and sim settings.
- Test scene: a 10×10 isometric patch with random heights and three figures wandering one tile at a time.
- Tests cover RNG determinism and resume-from-state, loop tick counting and catch-up cap, sim determinism and JSON round-trip, and a check that `src/sim/` never imports PixiJS, the DOM, render or UI.
- Playtest: approved.

### M1 – Terrain and camera (done 2026-10-26)
- Terrain types (`src/data/terrain.ts`): grassland, forest, marsh, rocky ground, shallow water, ford, deep water and road, each with movement and building rules shown in the readout. Heights 0–6; a step of 1 is a slope, 2+ a cliff (`src/sim/terrain.ts`).
- Sites are described as a list of features (hills, plateaus, patches, rivers, roads) and built into a tile map by `src/sim/site.ts`. The hand-made test site is `src/data/sites/kestrelFord.ts`.
- Renderer (`src/render/`): slopes are drawn as smooth ramps by averaging corner heights; cliffs keep sharp faces with a stripe per level; land is lit from the upper left, slightly lighter with height, with faint contour lines at each height step. Map rim drawn as a slab edge.
- Procedural sprites (pines, oaks, boulders, stones, reeds, grass tufts) behind a `SpriteAssets` interface (`src/render/assets.ts`), so drawn art can replace them later.
- Camera: drag or WASD/arrows to pan, wheel or +/− to zoom towards the pointer, C to recentre, G for a grid. Hover readout of terrain, height, slope/cliff, movement and building.
- Tile picking checks front to back against each tile's top and cliff faces, so a tile hidden behind a cliff can't be picked through it.
- Tests: slope/cliff rules, site building (hills only make slopes, plateaus make cliffs, rivers, fords, road lines), the test site (all terrain types, both slopes and cliffs, road never climbs a cliff), seamless corner heights, picking, and camera zoom/clamp.
- Playtest: approved. Terrain types read clearly. Open question raised about map size (see the decisions log in `DESIGN.md`).

### M2 – Castle designer (done 2026-10-26)
- Pieces: walls (Thin/Standard/Thick × Low/Medium/High), towers (Square/Round × Low/Medium/High), one gatehouse and one 2×2 keep. Stats live in `src/data/castle.ts`; ground preparation costs per terrain type in `src/data/terrain.ts`.
- Rules (`src/sim/castle.ts`, plain data in `SimState.plan`): no building on water; forest is cleared first (extra labour, gives timber); marsh needs piling (extra stone, timber and labour); rocky ground can't be dug or undermined; walls can't cross a cliff; new walls must join the existing curtain; the keep needs level ground; the gate passage must open onto walkable ground at both ends and stay clear. Placing a tower or gatehouse on a wall turns that wall tile into it.
- Stats and cost shown before placing, for the exact tile under the pointer: strength (HP), height, height above the ground attackers can reach (which decides ladders), archer range bonus, notes (round towers, rock), and stone / timber / worker-days. Dragging a wall shows the whole line's cost.
- Plan panel: piece counts, total cost, earthworks and spoil balance, and checks (keep, gatehouse, keep enclosed, walls in one piece, any pieces broken by later earthworks). Enclosure counts cliffs and deep water as defences, with the gate shut.
- Earthworks: mark tiles to raise or lower one level per click (or drag), shown as amber/blue chevrons; the land is drawn as it will be once dug. Spoil balance and labour shown; a shortfall is a warning, not a block.
- Pieces drawn in code (stone courses, battlements, arrow slits, round tower drums, gatehouse arch and portcullis, keep with corner turrets and a pennant), depth-sorted with the land row by row. Pointing at a wall or tower picks that piece rather than the ground hidden behind it.
- Tests: placement rules, costs by thickness and terrain, cliffs, joining, one keep/gatehouse, level keep ground, towers replacing walls, gate passage, removal, enclosure (walls and natural cliffs), problems after earthworks, height-above-approach and ladder rules, round tower notes, spoil balance and earthwork limits, plan JSON round-trip, piece picking.
- Playtest: approved. Follow-up from the feedback: earthworks ripple outwards into walkable slopes (Shift for a sheer cut), and earthwork marks are drawn with the land rather than on top of pieces.


### M3 – Construction, workers and economy (done 2026-10-26)
- Calendar (`src/sim/calendar.ts`, numbers in `src/data/economy.ts`): a day is 30 ticks (one second at 1×), 30-day months, the year starts in March. Spring, summer and autumn are for building; winter stops all work. Pause, 1×, 2× and 4× (Space pauses). The game starts paused so you can design first.
- Workers (`src/sim/economy.ts`): labourers, diggers, carters, quarrymen, masons and carpenters. You set how many of each you want; they arrive over a few days (faster with better wages and standing; nobody comes while wages or food run short). Fewer dismisses at once. Wages (Low / Fair / Generous) change pay, hiring speed and work rate. Wages are paid and rations eaten daily; half pay in winter. Hungry or unpaid workers work at half rate and start walking off.
- Money and supplies: start with 8,000 crowns, some stone, timber and food. Spring taxes (from year 2) rise with standing and with the castle pieces finished; autumn harvest dues come in as food; an optional monthly levy brings in crowns but costs standing. Stone, timber, food and fill (earth for raising ground) can be bought. Quarrymen cut stone cheaply.
- Construction (`src/sim/works.ts`): every planned piece and every level of earthworks is a job needing masonry, carpentry, digging and hauling worker-days, plus stone and timber used as the work goes in. Workers go to the first jobs that need their trade, up to a crew limit per job (earthworks first, then pieces in the order placed). Pieces wait for the earthworks under them. Finished earthworks change the land itself and make or use spoil; raising waits for spoil. Clearing forest under a piece gives timber as the work goes.
- Building tab: overall progress, expected finish date (skipping winters), what's holding things up most ("Masonry: 40 days left at the current crew", "No carpenters on site", "Stone: 600 more needed, quarrying 16 a day", "The food store is empty"), shortfall warnings, work left per trade, and each job's progress, crew, expected finish or reason it's stopped. Pointing at a piece shows the same.
- Workers tab: hiring, wages and efficiency with its reasons, the levy and standing, next taxes, last month's money in and out, and buying supplies. Reports tab: graphs of crowns, food and stone, workforce, and efficiency and progress, plus a log of what happened.
- On the map: planned pieces are a pale blue model; pieces being built rise in stone with scaffolding; finished pieces get their battlements. Workers stand at their jobs swinging hammers and spades, carters run carts between the camp and the work, and idle workers (everyone in winter) sit round the camp fire. The camp's stone and timber piles grow and shrink with the stores. The land is shown as it is now; with Raise or Lower (or V) it's shown as planned.
- Save and load (`src/sim/save.ts`, `src/ui/gamePanel.ts`): one save slot plus an autosave at the start of every month, kept in the browser. Saves carry a version number and an upgrade step per version.
- Tests: calendar and working-day counting; hiring speed by wage; daily wages and rations, half pay in winter; hunger and unpaid wages slowing and losing workers; buying; taxes, harvest and levies; building a wall and using its materials; no masons means no finish (and says so); stone shortage; quarrying; digging and raising earthworks with spoil; pieces waiting for earthworks; winter stop; removed pieces; estimates and bottlenecks; determinism and JSON round-trip with workers; save round-trip, upgrade from version 0, bad and newer saves; a balance check that a modest crew needs more than one building season for a hilltop castle while a huge crew runs out of money.
- Playtest: approved; everything worked and shortages had a clear knock-on effect. Building felt far too fast, so a follow-up slowed it: all labour costs ×2.5, quarrymen cut half as much stone, and a day lasts a second. A hilltop castle now takes a sensible crew into its second year, with money running short in between. The map's bright, cheerful colours are noted for a drabber pass later.

### M4 – Combat core (done 2026-10-26)
- Pathfinding (`src/sim/path.ts`): A* and distance fields over the tile map. Each step costs the terrain's move cost, plus half again per level climbed; cliffs and deep water can't be crossed. Workers' carts now follow the road round walls instead of walking through them.
- Raids (`src/sim/defence.ts`, numbers in `src/data/combat.ts`): the first comes about day 100–120, then every 100–150 days, never in winter, each from a random map edge and a little stronger than the last. Scouts give 10 days' warning in the log and the top bar. While a battle runs, the calendar stands still and building stops; the game pauses itself at the start and end of every battle.
- Units: swordsmen and archers in your garrison; raiders (axes) and raider archers against you. The crown pays for 3 swordsmen and 4 archers; more can be hired in the new **Defence** tab for 3 crowns a day each (winter too), and soldiers eat rations like workers.
- Battle (`src/sim/battle.ts`): raiders head for the keep (or the camp, if no keep is half built), pick the weakest-looking way in, mass at one piece and batter it. Walls and towers have HP from their thickness and kind; a piece less than half built is a gap they walk through. Archers' reach is 5 tiles plus the height bonus, shorter shooting uphill, and they hit less often shooting up; arrow slits and battlements give cover. Oil cauldrons pour on raiders at the foot of a piece, if an archer is there to tip them. Defender swordsmen guard the stores; raiders who reach them unopposed carry off crowns and food. Raiders break at 65% losses or after three minutes.
- Classic control: place troops before battle with the new **Troops** tool (0), or let them be placed automatically (archers on the walls nearest the attack, swordsmen round the keep). In peacetime posted soldiers stand at their posts on the map. **Extras** tool (9) adds arrow slits or an oil cauldron to a wall or tower (the keep has slits already).
- After the battle: damage undoes building work on each piece (a breached piece drops to 20% built and needs rebuilding), losses come out of the garrison, standing rises if the raid was beaten off and falls if the stores were plundered. The **report** opens by itself: how the fight went, each wall breached and why (with a lesson such as "thin walls have 100 HP; a thick wall has 280"), gaps the raiders walked through, what the archers, slits and cauldrons did, and what needs repairing. Past reports stay in the Defence tab.
- On the map: soldiers in red tabards and helmets, raiders in drab hoods, arrows in flight, oil splashes, HP bars over damaged pieces, and rubble where a piece fell. Pointing at a piece during battle shows its HP.
- Saves are version 2 (adds the garrison and raids); version 1 saves upgrade and get their first raid at least 30 days out.
- Tests: paths round walls and cliffs, uphill costs, distance fields; gaps vs. finished walls; raiders choosing a thin wall; thin walls falling faster than thick; plunder and the camp as target; height range; a full garrison beating off raid 1; high walls losing fewer men than low; slits and cauldrons (manned and unmanned); post rules; after-battle damage and standing; raid timing, warnings, the frozen calendar, raids off; crown-paid troops; determinism and saving mid-battle.
- Follow-up (2026-10-27): a top-down plan view, shown only while placing castle pieces and posting troops (also during the pause before a fight); everything else stays isometric. T turns it off and on. Tests cover when it's used, coordinate conversion and tile picking.
