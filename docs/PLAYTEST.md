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
- **Earthworks:** with Raise or Lower, click or drag over tiles. Each click is one level (amber chevrons up, blue chevrons down) and the land is shown as it will be. Dig a ditch outside a wall and point at the wall in Look: its height above the approach goes up, and it may become too high for ladders. The panel shows the spoil balance (digging makes spoil, raising uses it).
- Point at any piece with Look to see its numbers. Remove (key 8) deletes pieces and earthwork marks; "Clear plan" (click twice) starts over.
- **The questions for this milestone:** is designing fun and clear? Are the stats understandable?
**Known issues:** nothing gets built yet; the plan is a design only (workers, time and money come in M3). The design is lost when the page reloads (saving comes in M3). Previews of new pieces float on top, so they aren't hidden by hills in front. Ground right behind a tall wall can be hard to point at; zoom in or point at the wall itself. Mouse and keyboard only.
**Feedback:**

