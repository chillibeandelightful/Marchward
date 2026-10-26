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

## M5 – Siege depth
- Sappers, ladder crews, moats.
- Smarter enemy approach (weak points, varied directions).
- Sieges with food on both sides.
- Commander control mode.
- **Playtest:** do the defensive choices feel like real trade-offs?

## M6 – Messengers and story
- Event system: monthly messenger, three choices, flags and consequences, chained stories.
- Chronicle mode event set (first batch).
- Factions and standing.
- **Playtest:** are the choices interesting? Do consequences show up later?

## M7 – Campaign
- Multiple regions with distinct terrain.
- Campaign length choice, difficulty levels, practice mode.
- Region-to-region progression and carry-over.
- **Playtest:** a full short (3-site) campaign start to finish.

## M8 – Atmosphere and heraldry
- Village generation, wandering villagers (who flee to the gate during raids), roads.
- Banner designer; banners on towers and troops.
- Seasonal visuals.
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

