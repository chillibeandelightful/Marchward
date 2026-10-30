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

## M5b – High view (camera angle and horizon)
A trial of the reference mockups' high-angle three-quarter view, staying with flat 2D drawing (no 3D, no shrinking with distance). It's an experiment: if it doesn't feel better, we go back to today's 2:1 isometric view.
- View switch: a **View** option in the Look section, "Standard" (today's 2:1 isometric) and "High view", remembered per browser like the style. Not part of saved games, and the sim never sees it. Works with both Modern and Classic. It replaces the isometric view only; the top-down plan view used while placing pieces and posting troops stays as it is.
- Camera angle: the projection's tile shape and height step become settings held in one place (today they are fixed in `src/render/iso.ts`), so the view can be tilted. High view uses a less flattened, slightly odd-looking angle in the spirit of early-'90s castle games rather than strict 2:1; the exact numbers are tuned by eye against the mockups. Tile picking, depth sorting and the camera follow the active view.
- Horizon always in view: an overcast sky with distant hills and moorland across the top of the map at the default zoom, not only when zoomed right out. Drawn as a backdrop that stays behind the land as the camera pans.
- Taller structures: walls, towers, gatehouse and keep drawn taller next to their footprint, so they stand up like the mockups instead of looking squat. Art only; terrain heights and the sim's wall heights don't change.
- Not in this milestone: true perspective (things getting smaller further away), camera rotation, new art.
- **Playtest:** does High view look closer to the mockups and feel better to play than Standard? Can you still read heights, pick tiles and place pieces accurately? If not, we keep Standard.

## M5c – Hand-made art (first pass)
Drawn art in the spirit of the two reference mockups: painted stone blocks, dark pines, chunky figures and a muddy, olive moorland. It replaces the procedural shapes in the drab styles one piece at a time. It comes after M5b, because the art has to be drawn for the camera angle and structure heights that M5b settles. It lands in two PRs: the pipeline with castle stone and trees first, then figures and effects.
- **Who draws it (decided 2026-10-28):** Claude draws a complete first set as original, hand-placed pixel files to the spec. Any piece can later be replaced by better art (an artist's, or made with an image tool) dropped in to the same spec, with no code changes.
- **Art pipeline:** sprite sheets as PNG files under `public/art/` with a JSON manifest for each sheet. The manifest gives every frame's rectangle, its anchor point (where it meets the ground) and its variants. They load at start-up through Pixi's asset loader, behind the existing `SpriteAssets` interface, which grows to cover castle pieces, figures and effects as well as trees and rocks. Any sprite without art falls back to today's procedural drawing, so art can arrive bit by bit and the game always runs.
- **Where it shows:** a new **Painted** style in the Look section, with Drab's colours and frame, using the drawn art wherever it exists. Modern, Classic and Drab stay as they are. It is not part of saved games, and the sim never sees it.
- **Art spec** (`docs/ART.md`): pixel sizes at zoom 1 for each kind of sprite. A tile is 64×32 today; M5b may change the angle. It also covers:
  - anchor points;
  - light from the upper left;
  - a dark outline on the shadow side;
  - the Drab palette as the colour guide;
  - how files are named and laid out.
  `npm run art:templates` writes template PNGs with the tile diamond, the height steps and the anchor marked, so drawn art lines up first time.
- **Art viewer:** a development page (`?art`) that lays out every sprite and its variants on a test plot. It also shows the frames of each animation, in Painted and Drab side by side, so new art can be checked without playing.
- **First pass, in priority order** (what the mockups show most):
  1. **Castle stone:** wall sections for every way a wall can join (end, straight, corner, T, cross), at each height and thickness, with battlements. Square and round towers, the gatehouse with portcullis on both axes, and the keep. Building stages (lower courses with timber scaffolding), and rubble for a breached piece.
  2. **Trees and ground cover:** pines and oaks in 4 to 6 variants each, boulders, stones, reeds, heather and bracken.
  3. **Ground:** textured fills for each terrain type, with several variants so the map doesn't repeat. Rock faces for cliffs and banks, and a muddy road.
  4. **Figures:** each worker trade, swordsmen, archers and raiders. Frames for standing, walking (4), working or fighting (2 to 4) and shooting, with one facing drawn and the other mirrored. Carters with hand-carts.
  5. **Camp and effects:** tents, stone and timber piles, carts, and the banner on the keep. Animated fire, smoke and dust frames.
- **Not in this milestone:** the UI frame (it stays drawn in code), heraldry and banners on troops (M9), seasonal versions (M9), burning buildings, and units that don't exist yet.
- **Playtest:** side by side with the mockups, does Painted feel like the castle game you remember? Do pieces and figures still read clearly at every zoom? Which pieces most need another pass?

## M6 – Siege depth
- Sappers, ladder crews, moats.
- Drawbridge: a gatehouse facing a moat gets a drawbridge, raised with the gate shut and lowered for sorties.
- Wider gatehouses and more than one gate (see Backlog).
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
- Further art passes after M5c: seasonal sets, more units, a full painted terrain set.

## Backlog (ideas, not yet scheduled)
Ideas from playtesting to fold into a milestone later. Nothing here is built until it's scheduled.

### Wall collapse as an occasional event
A wall section now and then gives way on its own, outside battle. Mostly a random event, but weighted towards walls that are poorly supported, so it rewards sensible building rather than being pure bad luck.
- What raises the chance: a free end (the next section along is unfinished or missing), no tower or gatehouse within a few tiles along the curtain, High and Thin walls, marsh or slope underfoot, and damage left unrepaired after a raid. A finished wall between two towers on firm ground should almost never fall.
- Fair warning: a crack shows on the piece and a line goes in the log some days before it falls, so the player can put masons on it. Repairing it in time stops the collapse.
- A collapse drops the piece to rubble (as a breach does after battle) and it has to be rebuilt.
- Rolled on the seeded RNG once a month, with the chances in `src/data/`, so it stays reproducible and tunable. Rare: a few times a campaign, not every season.
- Free-standing pieces (see *Freer castle designing* below) are the extreme case: a lone wall tile with two free ends should be the likeliest thing on the site to fall.
- Suggested slot: M7, as one of the first events through the new event system. The support check (free ends, tower spacing) could also feed the M6 enemy weak-point choice.

### Smarter build order
Today workers take earthworks first, then pieces in the order they were placed (`src/sim/works.ts`). A tower placed on a wall goes to the back of the queue, so if you lay out all the walls and then add the corner towers, the walls all go up first and the corners stay empty until last. The goal is a sensible order without the player managing a priority list.

Options:
- **A. Towers first.** Towers and the gatehouse rank ahead of the walls they join, and a wall section waits until the towers at its ends are started. Small change to the job order; fixes the empty corners directly.
- **B. Connected order outward from the keep.** Rank curtain jobs by how far along the curtain they are from the keep (or the gatehouse, if the keep is far inside the walls), with towers ahead of walls at the same distance. The castle grows as one connected piece, two ends spreading round the ring, so there are no isolated finished sections. Earthworks still come first.
- **Escape hatch for either:** a single "build this next" click on a piece moves it to the front. One click, not a priority list.

Agreed (playtester, 2026-10-27): **B with towers ahead of walls at each step**, plus the "build this next" click. It fixes the corners, makes the castle rise in a believable order whether it is laid out all at once or piece by piece, and fits wall collapse above, since connected building leaves few free ends. If it turns out too clever in play, A on its own is the fallback.
- Suggested slot: a small follow-up any time; it touches only the job order in `works.ts` and its tests.

### Gate sorties and archer sight lines (priority)
Playtest bug (2026-10-28): once the walls are closed, your swordsmen stand inside being shot by raider archers who shoot straight through the walls, and never go out to meet them. Swordsmen can already walk through the gatehouse; the trouble is that they only chase raiders within a few tiles of their post (`guardRadius` in `src/data/combat.ts`), so archers further off are ignored, and bows on both sides ignore walls entirely, so anyone in range can be hit. The gate is also never drawn opening.
- **Sorties:** swordsmen go out through the gate after raiders outside, especially raider archers shooting into the castle, and come back in when the raiders are beaten or they're badly outnumbered. The gate is drawn opening as they pass and shutting behind them, as `DESIGN.md` already promises. Raiders can't slip in while it stands open for a moment; if that proves too generous, an open gate can count as a weak point later.
- **Sight lines, both ways:** a shot needs a clear line from shooter to target, worked out on the tile grid in the sim (no need to draw it). A wall or tower between them blocks the shot unless the shooter stands high enough to shoot over it, or is lobbing in a high arc at a target well beyond the wall, with lower accuracy. Archers on the walls shoot out freely; raider archers at the foot of a wall can't hit swordsmen tucked in behind it. Forest already partly blocks sight in `DESIGN.md` and can use the same check.
- Suggested slot: **next**, as a combat follow-up before M5b. Touches `src/sim/battle.ts` and its tests (a sortie through a closed curtain, a blocked shot, a shot over a low wall from a tower).

### Oil cauldrons tended by peasants
A cauldron shouldn't need a soldier posted to it. Each one comes with one of the king's peasants who heats and tips it, so it pours on its own when raiders reach the foot of the piece. The peasant isn't a fighting unit and can't be posted elsewhere; if the piece falls, the cauldron is lost with it.
- Suggested slot: alongside the gate fix (same file), since it's small. Change the Extras note in `src/data/combat.ts` and the "needs an archer" rule in `battle.ts`.

### Gatehouses: three tiles wide, and more than one
- The gatehouse becomes 3 tiles wide across the passage (a wider front with towers either side of the arch), passage still one tile, so it reads as a real gatehouse next to 1-tile walls. Its footings, cost and HP grow to match.
- A castle can have more than one gatehouse: a front and back entrance, or a gate in each ring of walls. At least one is still needed to finish a site. Enclosure checks treat every gate as shut; sorties use whichever gate is nearest the enemy.
- Saves with today's 1-tile gatehouse need an upgrade step (keep it as a narrow gate, or widen it where there's room).
- Suggested slot: M6, with drawbridges and the smarter enemy approach, since gates become weak points worth choosing.

### Freer castle designing: diagonal walls and free-standing pieces
- **Diagonal walls:** walls can be laid corner to corner as well as edge to edge, so a curtain can run at 45°. Towers, the gatehouse and the keep stay square to the grid. A diagonal pair must still block walking between its corners (no slipping through the gap), and drawing, footings and enclosure need to handle the joins.
- **Free placement:** walls and towers no longer have to join the existing curtain. A tower can go anywhere, and a lone wall tile can stand on its own. The cost is risk, not a rule: a piece with free ends or no tower nearby is shown as poorly supported before you place it, and it's much more prone to collapse (see *Wall collapse* above, which already weights the chance by free ends and tower spacing). The plan panel keeps warning about a split curtain.
- Suggested slot: a designer follow-up after the gate fix. The support warning can show from the start; the collapse itself arrives with the wall collapse event in M7.

### Second camera view from the far side
Raiders come from any edge, and today you can't see what's going on behind the castle. Add a second fixed view looking from the opposite side, with one key or button to swap between the two. No free rotation and no other angles.
- The sim doesn't change. Render flips the projection and depth order and draws the pieces' back faces (the gatehouse arch, keep turrets and so on need a far-side drawing); tile picking and the camera follow the active view. The top-down planning view is unaffected.
- Suggested slot: M5b, which already moves the projection settings into one place, or straight after it. It would need M5b's "no camera rotation" line to allow two fixed views.

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

### M5 – Classic look (done 2026-10-27)
- Style layer (`src/render/styles/`): one `VisualStyle` object each for **Modern** (today's look, unchanged) and **Classic**, holding the land, water, stone, timber, sky and troop colours, the masonry and outline choices, the tree and rock drawings, the backdrop, the screen effect and the UI layout. Terrain, castle, worker, battle and effect drawing read the active style at draw time; the sim never sees it.
- Switching: **Look** section at the top of the Game tab (and the **L** key). Applied at once without reloading, remembered per browser (`marchward.look` in localStorage), not part of saved games.
- Classic palette: muted olive and brown ground with grain and flecks of heather and mud, grey stone, dark pines, slate water, drab marsh and rock, a muddy road; an overcast sky band with two lines of distant hills and moorland behind the site (visible when zoomed out).
- Classic sprites: walls, towers, gatehouse and keep built of stone blocks (courses, staggered joints, odd blocks a shade lighter or darker) with heavy dark outlines; round towers get courses round the drum; taller, darker, outlined pines and oaks; heather instead of grass tufts. Workers, carters, soldiers and raiders drawn 1.35× bigger with a dark outline; your soldiers in strong red, raiders now in dark blue so they stand out from the olive land.
- Screen effect (`src/render/screenEffect.ts`): in Classic the map is drawn to a texture at 1/2 (or 1/3) size, scaled up with nearest-neighbour filtering, then cut down to a 128-colour palette built from the style's colours (`buildPalette`) with 4×4 ordered dithering. Pixel size (Fine, Chunky, Chunkier) and dithering (Off, Light, Full) are set in the Look section. Works on WebGL 1 and 2.
- Classic frame (`src/ui/classicFrame.ts`, `src/ui/pixelArt.ts`): bevelled iron border with rivets round the map; a parchment panel along the bottom showing the latest four log lines beside the castle's banner; a column of ten icon buttons down the right (build, workers, timber, stone, defence, standing, hiring, plan, reports, save), each opening its panel over the frame and scrolling to the right section (click again or × to close). Icons, banner and the iron and parchment textures are all drawn in code; text uses Pixelify Sans (SIL Open Font Licence, bundled from `@fontsource/pixelify-sans`). The battle report opens on parchment.
- Combat visuals in both styles: raiders who reach the keep or camp set it alight (flames on the keep's front faces or the tents, spreading as they plunder, with a column of smoke); a fallen piece throws up a burst of dust and then smokes from its rubble; battering raiders kick up dust; oil and steam take the style's colours. These are drawn from the battle state and the clock only, so nothing changes in the sim.
- Tests: both styles cover every terrain; the style switch; Modern has no effect or frame; the sim never imports the styles and saves never mention them; the palette's size, determinism and that it keeps every ground colour; look settings fall back to defaults when missing or broken.
- Follow-up (2026-10-27): a top-down plan view, shown only while placing castle pieces and posting troops (also during the pause before a fight); everything else stays isometric. T turns it off and on. Tests cover when it's used, coordinate conversion and tile picking.
- Follow-up (2026-10-27): planned pieces are shown as the outline of their footings on the ground (in both views), not as a pale blue model. Tests cover the outlines of walls, wall runs, walls into towers, towers, the gatehouse and the keep.
- Follow-up after the playtest (2026-10-28): a third style, **Drab**, with Classic's colours, stone and frame but no chunky pixels or dithering (`src/render/styles/drab.ts`). Pick it in Game → Look, or press L to step through Modern, Classic and Drab.
- Follow-up (2026-10-28): Classic's dithering is now a strength slider (0–100%), with a box to dither only the ground, castle stone and sky, and the Pixels row's Off setting keeps it sharp when zoomed out. Surfaces-only works by drawing the scene a second time with trees, figures and effects tinted black, and dithering only where the two agree.

### M5b – High view (done 2026-10-28)
- View angle in one place (`src/render/iso.ts`): a `ViewAngle` holds the tile's width and height, the height step for the ground, how much taller castle pieces are drawn, whether the sky stays on screen, and how close the camera starts. **Standard** is the old 2:1 view, unchanged (64×32 tiles, 16 px a level). **High view** is 64×40 tiles (not 2:1, on purpose, so the land is less squashed, about 32° instead of 27°), 14 px a level for the ground, and castle pieces drawn 1.75× their height in levels. Everything that projects tiles (terrain, castle, workers, battle, effects, tile and piece picking, the top-down view's switch-over, the camera's limits) reads the active angle, so depth sorting and picking follow it.
- Switching: a **View** row in Game → Look (Standard or High view), and the **H** key. Applied at once without reloading, keeping the same spot of land in the middle of the screen; remembered per browser in the look settings, not in saves. Works with Modern, Classic and Drab. The top-down plan view for placing pieces and troops is unchanged.
- Horizon: in High view the overcast sky and two lines of hills stay across the top of the screen at every zoom, with the far land fading into the moor beneath them; only the moor is drawn behind the map. Modern gets its own paler sky for this (`horizon` in each style); Classic and Drab use their existing backdrop colours. Nothing on the land can be pointed at through the sky.
- Taller structures: walls, towers, gatehouse, keep, scaffolding, archers on the walls, oil splashes and HP bars all use the drawn height, so figures stand on the wall tops. The sim's wall heights, ranges and ladder rules don't change.
- High view starts twice as close in as Standard, so the castle fills the view under the sky, as in the mockups. C goes back to that.
- Tests: the angle's settings switch and project correctly; tile picking at tile centres in High view, and converting to and from plan coordinates; a piece picked by its taller drawn walls; the sim never imports render code; look settings keep the view and fall back to Standard.
- Follow-up (2026-10-28): **Low view**, a third trial view that looks across at the castle rather than down on it (64×24 tiles, about 20°, 18 px a level, pieces drawn 1.4× taller, a deeper sky). High view looks down *more* steeply than Standard and only gets tall walls by stretching them; Low view gets them mostly from the angle, which is closer to the reference images. H now steps through Standard, High and Low. A hidden **tuning panel** (the ` key, or `?tune` in the address) has sliders for the active view's tile depth, ground height step, wall height, sky and haze, kept per browser (`marchward.viewTuning`), with a line of numbers to copy and a reset. The sky's share of the screen moved from constants in `backdrop.ts` into each view's settings. Tests cover the tuning overlay and reset, Low view being flatter than Standard, and reading stored tuning.
- Follow-up (2026-10-28): Low view preset set to the playtester's numbers: 64×16 tiles, 26 px a level, walls ×1.5, sky 0.07, haze 0.14 (the tile-depth slider now goes down to 12). Fixed land drawn as a wedge over the foot of a keep or wall: where a piece stands on any tile sharing a corner, that corner now follows only the pieces' ground, so the land round a piece comes down to meet its foot and a wall running up a slope still sits on a smooth ramp (`tileCorners` takes the plan's footings; tiles are redrawn when pieces come or go). Drawing only; the sim's heights don't change. Tests cover both cases.
- Follow-up (2026-10-28): the keep is drawn at half its height in levels (playtester: it towered over everything), in every view. Art only (`drawnLevels` takes the piece's kind); the sim's keep height, archer range and ladder rules don't change.

### M5c – Hand-made art, first pass (part 1 of 2, 2026-10-29)
- Art pipeline: `public/art/manifest.json` lists sprite sheets (each frame's rectangle and ground anchor) and repeating textures; `src/render/paintedArt.ts` loads them at start-up, checks the manifest, and serves them behind `SpriteAssets`. Anything missing or broken falls back to the code drawing with a console warning.
- **Painted** style in Game → Look (and on the L key): Drab's colours and frame with the hand-made art.
- Castle stone: a repeating painted stone texture covers every face of every wall, tower, gatehouse and keep, and flagstones cover the tops. It is pinned to the world, so courses and joints run on from piece to piece, and round towers are lit across the drum. Planned, problem and preview pieces keep their flat tints so they stand out.
- Trees and ground cover: 6 pines, 4 oaks, 4 boulders, 3 sets of stones, 3 clumps of reeds, and grass, heather and bracken tufts, drawn pixel by pixel (`tools/art/draw.mjs`, `npm run art:draw`).
- `docs/ART.md` spec for the Low view angle; `npm run art:templates` writes guides to paint over; the art viewer at `?art` shows every sprite and a test castle in Painted and Drab.
- Tests: the art files and manifest agree, bad manifests are handled, the stone texture is pinned to the world in every view, the Painted style is registered.
- Still to come in part 2: ground textures, figures, the camp and effects.

### M5c – Hand-made art, first pass (part 2 of 2, 2026-10-29)
- Ground: a repeating painted patch for each kind of land (moorland grass, forest floor, marsh with pools, scree, and three waters), laid on the screen so it runs on across tiles and slopes and shaded with the land.
- People: the six worker trades working (4 frames) and sitting idle at the camp, the carter pushing an empty or loaded hand-cart, and swordsmen, archers, raiders and raider archers standing, walking (4 frames), fighting (3) or shooting (2). Drawn facing right and mirrored; soldiers turn to face the way they walk.
- Camp: three tents, a stepped heap of stone blocks and a pile of logs that grow and shrink with the stores, and a crackling hearth.
- Effects: painted flames on burning pieces, and painted puffs for smoke and dust, tinted and faded as before.
- Art viewer: rows for every person and pose, the camp and effects, and the ground textures.
- Tests: the manifest covers every kind of person in the poses the game uses, the camp and effects, and a 64 × 64 ground texture for every kind of land.
- M5c is done. Anything without painted art (the road's ruts, cliffs and banks, the keep's banner, rubble) is still drawn in code, in the Drab look.

### Playtest fixes: walls, height lines, extras and banks (2026-10-30)
- Walls: the dark vertical lines every half tile are gone. A straight run through a tile is now one block of masonry instead of two arms, and where a wall runs on into the next piece the join gets no outline and the earlier piece reaches a hair under the later one, so no seam shows. Corners, ends and towers keep their outlines. Affects every style (the lines were strongest in Classic and Drab).
- Height lines: the faint lines where the land steps up or down a level are now off by default. Game → Look → **Height lines** (or the **K** key) turns them back on; kept per browser with the other look settings. The top-down plan view still shows its contours while placing.
- Extras while placing: the Wall, Tower and Gatehouse tools have a **Build in** row with **Arrow slits** and **Oil cauldron** switches. Whatever is switched on is built into every piece laid, and the preview, costs and stats include it. The Extras tool (9) still adds or takes them off afterwards.
- Banks and cliffs: a drop of two levels or more is drawn as rock (jointed columns, broken bedding lines at each level, a sunlit lip, a shadowed foot, and the painted scree texture in Painted); a one-level bank is earth with darker soil low down, stones and roots, and the turf of the land above hanging ragged over the lip. Where a bank stands in water its foot is wet mud with a waterline, and reeds grow in the water along banks the camera can see.
- Tests: extras switched on while placing go on every piece of a line and are charged for, never on the keep; height lines are off unless asked for; reeds grow only along the foot of a bank behind water.
