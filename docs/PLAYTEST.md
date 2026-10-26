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
**Feedback:**

