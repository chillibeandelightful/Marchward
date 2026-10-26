# Working rules for this repo

## Project
Marchward is a browser-based isometric castle-building strategy game. Read `docs/DESIGN.md` before making design decisions and `docs/MILESTONES.md` to see what's in scope right now. Only build what the current milestone needs; stretch goals stay out until scheduled.

## Stack
- TypeScript (strict), Vite, PixiJS (pin exact versions), Vitest for tests.
- Deployed to GitHub Pages via a GitHub Actions workflow on push to `main`.

## Architecture rules
- **Simulation is separate from rendering.** All game rules live in `src/sim/` as plain TypeScript with no PixiJS or DOM imports. Rendering (`src/render/`) and UI (`src/ui/`) read sim state; they never own it.
- **Fixed-step simulation.** The sim advances in fixed ticks with a seeded RNG, so a given seed and input sequence always gives the same result. This keeps bugs reproducible and balance testable.
- **Data-driven content.** Unit stats, wall/tower stats, terrain types, regions and story events live in data files under `src/data/` (TypeScript objects or JSON), not hard-coded in logic.
- **Art is drawn in code for now.** Sprites are generated procedurally (PixiJS Graphics rendered to textures) behind an asset interface, so hand-made art can replace them later without touching game logic.
- **Save games** are serialised sim state in localStorage, with a version number for migrations.

## Suggested layout
```
src/
  sim/        terrain, construction, economy, combat, events, pathfinding
  render/     isometric projection, tile and sprite drawing, camera
  ui/         menus, designer tools, panels, dialogs
  data/       stats, regions, story events, heraldry
  main.ts
tests/        Vitest specs, mostly for sim/
docs/
```

## Working practice
- Write tests for sim logic (pathfinding, construction progress, damage, economy, event triggers).
- Run `npm run build` and `npm test` before finishing any task.
- At the end of each milestone: update `docs/MILESTONES.md` with what was done, add a short "how to test" section to `docs/PLAYTEST.md`, and make sure the Pages deploy works so the playtester can open a link.
- When a design question isn't answered by `DESIGN.md`, pick the simplest option that fits the doc's intent, note it under "Decisions log" in `DESIGN.md`, and keep going.
- Keep the game original: no names, text, art or music from the 1991 game or any other existing game.
