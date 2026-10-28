# Playtest Notes

After each milestone, add a section:

## Mx – title (date)
**Link:** (GitHub Pages URL)
**How to test:** what to try
**Known issues:**
**Feedback:** (playtester)

## M0 – Project setup (2026-10-26)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- Open the link. You should see a small isometric patch of grass blocks at a few heights, with three little figures stepping around about twice a second.
- The box in the top left shows the seed, the tick count (rising about 30 per second) and the frame rate.
- Add `?seed=42` to the end of the address and reload: the land and starting positions change. Reload again with the same seed: they come out exactly the same.
- Switch to another tab for a while and come back: the page should carry on smoothly rather than freezing or racing to catch up.
**Known issues:** placeholder scene only; no input and no real terrain yet (that's M1). Figures are drawn on top of all tiles, even ones that should hide them.
**Feedback:** Approved, page loads and works.

## M1 – Terrain and camera (2026-10-26)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- Open the link. You should see the whole test site, Kestrel Ford: a river down the left with a ford, a broad hill in the middle, a rocky crag with cliffs on the right, a pond, forests, marshes and a road.
- **Move around:** drag with the mouse (any button), or hold W A S D or the arrow keys. Press C to jump back to the starting view.
- **Zoom:** mouse wheel (it zooms towards the pointer), or + and − (also Q and E).
- **Read a tile:** point at any tile. The box in the bottom left shows its terrain, height (0 to 6), whether it's flat, a walkable slope or a cliff edge, and what that terrain means for movement and building.
- Press G to show or hide a tile grid.
- Things to look at: the central hill (smooth slopes, with faint contour lines at each height step); the crag (sheer cliffs with a stripe for each height level, a taller peak in the corner); the small rocky terrace near the bottom left (a two-level cliff); the stepping stones across the river where the road fords it.
- **The question for this milestone:** does the land read clearly? Can you tell heights and terrain types apart at a glance, without pointing at them?
**Known issues:** nothing moves yet; the land is just for looking at. Pointing at a tree top shows the ground tile under the pointer, which may be the tile behind the tree. No touch pinch-to-zoom (mouse and keyboard only).
**Feedback:** Approved. Terrain types are easy to tell apart visually (marsh, grassland, hill, rocky ground, shallow and deep water, trees, river), and hovering confirms the type. Open question: the map's scale. In older games of this kind the map felt needlessly large when the castle was the only thing on it and nothing else could be controlled.

## M2 – Castle designer (2026-10-26)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- **Moving around changed a little:** the left mouse button now builds, so drag with the **right** mouse button (or use W A S D / arrow keys) to move. In the Look tool (key 1) left-drag still moves the view. Wheel or + / − zooms as before.
- **Pick a tool** with the buttons at the top left or keys 1 to 8: Look, Wall, Tower, Gatehouse, Keep, Raise, Lower, Remove. Wall and Tower show their options (thickness, height, square or round) under the buttons.
- **Before you place anything**, point at a tile: the panel on the right shows that piece's strength, height, whether ladder crews could climb it from the ground next to it, the archer range bonus, and its cost on that exact tile. The box at the bottom left says "Click to place" in green, or why you can't build there in red.
- **Build a castle on the central hill:** drag out a ring of walls (the whole line's cost shows while you drag), click a Tower onto each corner (it replaces that bit of wall), click a Gatehouse into one wall where the road crosses (press R if the passage faces the wrong way), and put the Keep inside. The checklist in the panel turns green when the keep is enclosed and nothing is wrong.
- **Try the rules:** run a wall up the rocky crag's cliff (refused); place the keep on sloping ground (refused, needs level ground); build on the river (refused); put a wall straight across the gate passage (refused). Build on marsh or forest and compare the cost with grass.
- **Earthworks:** with Raise or Lower, click or drag over tiles. Each click is one level, and the ground around slopes along with it (hold Shift to change just that tile) (amber chevrons up, blue chevrons down) and the land is shown as it will be. Dig a ditch outside a wall and point at the wall in Look: its height above the approach goes up, and it may become too high for ladders. The panel shows the spoil balance (digging makes spoil, raising uses it).
- Point at any piece with Look to see its numbers. Remove (key 8) deletes pieces and earthwork marks; "Clear plan" (click twice) starts over.
- **The questions for this milestone:** is designing fun and clear? Are the stats understandable?
**Known issues:** nothing gets built yet; the plan is a design only (workers, time and money come in M3). The design is lost when the page reloads (saving comes in M3). Previews of new pieces float on top, so they aren't hidden by hills in front. Ground right behind a tall wall can be hard to point at; zoom in or point at the wall itself. Mouse and keyboard only.
**Feedback:** Approved. Two notes: (1) lowering the same spot again and again made the land look disjointed (a sheer pit); digging should ripple outwards to the tiles around it. (2) The keep looked like it sat on a mat lined up with the ground-level grid. Both addressed in a follow-up: lowering and raising now pull the surrounding ground along as a walkable slope (hold Shift for a sheer cut), and earthwork marks are now drawn with the land, so they no longer show on top of pieces standing on marked ground.

## M3 – Construction, workers and economy (2026-10-26)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- **The clock starts paused** so you can design first. The bar at the top shows the date and season, pause and speed buttons (1×, 2×, 4×), and your crowns, stone, timber, food (and how many days it will last), spoil, workers and efficiency. **Space** pauses and restarts.
- **Design a castle** in the Plan tab as in M2 (the land is now shown as it is; while using Raise or Lower, or after pressing V, it's shown as planned). Planned pieces appear as a **pale blue model**.
- **Hire workers** in the **Workers** tab: use + and +5 to say how many of each you want. They turn up over a few days. Hover a trade's name, or read the line under it, for what it does. You'll want masons, carpenters, diggers, some labourers and carters, and quarrymen for stone. Try Low and Generous wages and watch hiring speed and efficiency change.
- **Start the clock** (Space, or a speed button). Workers walk out from the camp by the road west of the hill; pieces rise in stone with scaffolding and get their battlements when finished; carts run back and forth. Dug earthworks actually change the land.
- **See what's slowing you down** in the **Building** tab: progress, expected finish date, the main thing holding things up (a trade you're short of, stone, food, money), and each job's progress or why it's stopped. Point at any piece to see how it's going.
- **Run things short on purpose:** stop buying food, or hire far more than you can pay. Workers slow to half speed, the top bar turns red, the log says people are walking off, and nobody new comes until it's fixed. Buy food and supplies at the bottom of the Workers tab. Try the monthly levy for quick money (people's standing drops, which lowers taxes and slows hiring).
- **Seasons:** in winter all building stops (workers stay on at half pay; dismiss them to save money). Taxes arrive on 1 March from year 2 (more for a bigger finished castle), harvest food on 1 September.
- **Reports** tab: graphs of money, food and stone, workforce, efficiency and progress, and a log of what happened.
- **Save and load** in the **Game** tab. The game also autosaves on the first of each month. Reload the page and use Load to carry on.
- **The questions for this milestone:** does building feel satisfying? Is it clear what's slowing you down?
**Known issues:** workers walk in straight lines (pathfinding comes in M4) and are drawn over walls they stand behind in a few spots. Removing a piece, even a finished one, removes it with no refund. Job order is automatic (earthworks first, then pieces in the order you placed them); there's no way to set priorities yet. The balance numbers are first guesses. Mouse and keyboard only.
**Feedback:** Approved: it all works, and running out of money or materials had a clear knock-on effect. The camp was a nice touch. Two notes: (1) construction went far too fast; in the games this is inspired by, building felt painfully slow, with raids landing on the unfinished castle. Addressed in a follow-up: labour costs are ×2.5, stone comes more slowly, and a day lasts a full second, so a hilltop castle now runs into its second year. (2) For later: the map looks too bright and cheerful; it should move towards a drabber, earthier palette (logged in `DESIGN.md`).

## M4 – Combat core (2026-10-26)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- **Raids now come.** The first arrives around day 100–120 (June of year 1), then every 100–150 days, never in winter. Scouts warn you 10 days ahead: a red line under the top bar and a note in the log say when and from which side.
- **The Defence tab** shows the raid outlook, your garrison and past battles. The crown pays for 3 swordsmen and 4 archers; use + and +5 to hire more (3 crowns a day each, and they eat). Hover a soldier type for what it does.
- **Post your troops** with tool **0 Troops**: pick Archer or Swordsman and click a wall, tower or the ground; Shift-click removes a post. Posted soldiers stand there on the map. Anyone without a post is placed automatically when raiders come (archers on the walls nearest the attack, swordsmen round the keep).
- **Add extras** with tool **9 Extras**: arrow slits (cover for your archers) or an oil cauldron (pours on raiders at the foot, but only if an archer is on that piece). Click a wall or tower (click again to remove); a finished piece goes back on the building list for the extra work.
- **To see a fight right away**, press **Bring the next raid now** (twice) in the Defence tab. Untick **Raids come** to build in peace.
- **When raiders come** the game pauses so you can look, and you can still post or move troops with tool 0 (soldiers move to their new posts straight away); press Space to fight. Once the fight starts, troops act on their own. The calendar stands still and building stops during the battle. Watch raiders mass at one piece and batter it, arrows fly, oil pour. Point at a piece to see its HP. A piece less than half built is a gap they walk straight through.
- **After the battle** the game pauses again and the report opens: losses, which walls fell and why, what your archers, slits and cauldrons did, and what needs repairing. Damaged pieces go back on the building list; breached ones drop to 20% built. Old reports stay in the Defence tab.
- **Try the milestone question: do thickness and height matter?** Build two castles (or one, then reload) and compare: a Thin wall has 100 HP and a Thick one 280, so raiders break through thin walls much sooner; archers on High walls and towers reach further (shown when you point at a piece) and raider archers below struggle to hit them.
**Known issues:** raiders only batter (no ladders, sappers or moats yet; those are M6). You can't give orders during a battle (Classic control; Commander mode is M6). Raiders head for the weakest-looking way in by a simple rule, not the smarter weak-point choice planned for M6. Balance numbers are first guesses: a castle left without enough soldiers gets its keep or camp plundered fairly often from the second year. Mouse and keyboard only (PC only, by design).

## M5 – Classic look (2026-10-27)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- **Switch to Classic:** press **L**, or open the **Game** tab and pick **Classic** under Look. The page changes at once: an iron frame round the map, a parchment strip of messages at the bottom with your banner, and a column of icons down the right. Press L again to go back to Modern; your choice is remembered when you reload.
- **The icons** open the panels over the frame (hover one to see what it is): castle = Building progress, hammer = Workers, logs and stone = buying supplies, helmet = Defence, banner = money and standing, two figures = hiring soldiers, scroll = Plan (the designer), chart = Reports, disk = save, load and the look settings. Click the icon again, or ×, to close the panel. The tool buttons (1–0) stay at the top left of the map as before.
- **Look at the land and castle:** olive and brown moorland, slate water, dark pines, grey block-built walls with dark outlines, chunkier workers and soldiers. Zoom right out to see the overcast sky and hills behind the site.
- **Pixels and dithering:** in Game → Look, try Fine, Chunky and Chunkier pixels and Off, Light and Full dithering. Pick what feels closest to how you remember it.
- **Fighting in Classic:** in Defence, press **Bring the next raid now** twice, then Space. Your soldiers are in red, raiders in dark blue. Watch arrows, oil and steam; when a wall falls there is a burst of dust and smoke from the rubble; if raiders reach the keep or the camp they set it alight, with a column of smoke. (To see the fire quickly, set your garrison to 0 first.)
- **Check Modern still works** exactly as before (fire and smoke now appear there too).
- **The questions for this milestone:** does Classic feel like the look you remember? Is switching styles quick, and does everything still read clearly in both?
**Known issues:** the sky and hills only show when you zoom out far enough to see past the far edge of the site. Raiders battering the back walls are hidden behind them (the view doesn't rotate). Procedural art gets the palette, frame and pixel feel of the mockups but not their painted detail. The banner is a plain gold tower on red until heraldry arrives in a later milestone.
**Feedback:** Approved: an improvement, but zoomed out the chunky pixels are too much, and the dithering puts a repeating pattern over the whole map and every piece. Keep the drab colours; work towards the reference pictures with real art assets in future. Asked for a third style without the pixelation, added as **Drab** (Classic's colours, stone and frame, drawn smooth).

**Follow-up – softer dithering (2026-10-28):** Classic's screen effect can now be dialled down. In Game → Look with Classic chosen:
- **Pixels: Off** keeps everything sharp when zoomed out, with Classic's palette and dithering still on.
- **Dithering** is a slider from off to 100% (it was Off, Light or Full).
- **Dither only the ground, stone and sky** leaves trees, people, fire and smoke exactly as drawn (so trees keep their greens), and puts the dithered texture only on the big surfaces.
- Try Pixels Off, dithering around 40–60%, with the surfaces box ticked, then zoom in and out. Your settings are remembered when you reload.


## Follow-up – Top-down view for placing (2026-10-27)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- Pick **2 Wall**, **3 Tower**, **4 Gatehouse** or **5 Keep**. The map flattens into a plan seen from straight above: land coloured by terrain and a little lighter the higher it is, thin lines where the ground slopes, heavy dark lines along cliffs, pieces as their outlines. The same spot stays in the middle of the screen.
- Lay walls and place pieces as usual. The green or red preview, the costs and the checks all work the same; the tile under the pointer is outlined and is always the one you click.
- Pick **0 Troops** and post soldiers: red circles are archers, red squares swordsmen. Several on one tile spread out a little.
- Bring a raid (Defence tab). While the game waits before the fight, tool 0 still shows the top-down view with everyone on the field (raiders are drab). Press Space: the view goes back to isometric for the fight.
- Pick **1 Look** or any other tool to return to the normal view. Press **T** to turn the top-down switch off (and on again) if you'd rather place in the normal view.
- **The question:** is placing pieces and troops easier from above? Is anything missing from the plan that you needed to see?
**Known issues:** the plan doesn't show trees, the camp's tents or workers (the camp is a brown outline). Extras show only the oil cauldron (an orange dot), not arrow slits. Earthworks tools stay isometric.

## Follow-up – Planned pieces as footings (2026-10-27)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- Plan a few walls, towers, a gatehouse and a keep, then pick **1 Look**. Instead of a pale blue model, each planned piece is a pale outline of its footings on the ground. A run of wall reads as one long double line, towers are squares or circles, the gatehouse shows its passage, and the keep is a large square.
- The top-down view shows the same outlines.
- Hire workers and start the clock: as a piece is built, stone rises inside its outline with scaffolding, and the outline goes once it's finished.
- A planned piece with a problem (for example, left standing on a slope that later earthworks break) is outlined in red.
**Known issues:** where a road runs through a planned piece, the road can be drawn over part of the outline.

## M5b – High view (2026-10-28)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- Open the **Game** tab (the floppy-disk icon in Classic and Drab) and find **View** in the Look section. Pick **High view**, or press **H** anywhere to switch back and forth. Your choice is remembered when you reload.
- In High view the land is seen from higher up: fatter tiles, an overcast sky with hills across the top of the screen, and the far land fading into moorland under it. Zoom in and out and pan around: the sky stays put.
- Plan a ring of walls with towers, a gatehouse and a keep (or load a saved game with a castle). Walls, towers and the keep stand much taller than in Standard. Hire workers and watch the scaffolding rise with them.
- Point at tiles and pieces, raise and lower ground, and try placing pieces (the flat plan view for placing is unchanged). Check that the tile outlined is the one you meant, and that hills and cliffs still read clearly.
- Bring a raid from the Defence tab: archers should stand on the wall tops, and HP bars sit above the taller pieces.
- Try it in Modern, Classic and Drab (L steps through them).
- **The question:** does High view look closer to the mockups and feel better to play than Standard? Can you still read heights, pick tiles and place pieces accurately? If not, we keep Standard. If it's close, which numbers would you change: steeper or flatter, taller or shorter walls, more or less sky?
**Known issues:** the stonework is the same procedural art drawn taller, so battlements and arrow slits look small on high walls (M5c redraws the art for whichever view wins). Tall pieces at the back can poke up into the haze under the sky. The view doesn't change zoom when you switch; press C to go to its starting zoom.

## Follow-up – Low view and view tuning (2026-10-28)
**Link:** https://chillibeandelightful.github.io/Marchward/ (live once this is merged and the deploy on `main` finishes)
**How to test:**
- In Game → Look pick **View → Low view**, or press **H** to step through Standard, High view and Low view. Low view looks across at the castle: flatter ground, tall wall faces, more sky.
- Press the **`** key (top left, under Esc) to open the tuning panel, or add `?tune` to the address. Its sliders change the view you're in: **tile depth** (smaller is a lower, flatter angle), **ground height step** (how tall hills look), **wall and tower height**, **sky** and **haze**. Changes show at once and are kept when you reload. **Reset this view** goes back to the preset.
- Build or load a castle, then try settings side by side with the reference images. When you find numbers you like, press **Copy numbers** and paste the line to me; that becomes the preset and the basis for the M5c art.
- **The questions:** which of the three views is closest to what you want? With the sliders, what numbers feel right? Does the courtyard stay visible enough, or would you want the near wall cut away?
**Known issues:** the art is the same code-drawn stone drawn taller, so battlements and slits look small on tall walls. Very low angles hide more of the courtyard behind the front wall. The panel is a tuning tool and will go once the angle is chosen.

