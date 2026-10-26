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

