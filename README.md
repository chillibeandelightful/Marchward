# Marchward (working title)

A modernised tribute to the castle-building strategy games of the early '90s. Design a castle on real terrain, reshape the land with earthworks, manage workers and money through the seasons, steer your realm through branching political stories, and defend against raids that test your design.

Not a copy or remake: all names, art, music and writing are original.

- Platform: browser (desktop first), deployed to GitHub Pages for playtesting
- Stack: TypeScript, Vite, PixiJS, Vitest
- View: 2D isometric with height levels (no true 3D)

## Docs
- `CLAUDE.md`: working rules for Claude Code in this repo
- `docs/DESIGN.md`: game design document
- `docs/MILESTONES.md`: build plan and playtest checkpoints
- `docs/STORY.md`: setting, story modes and event-chain structure
- `docs/PLAYTEST.md`: playtest notes, filled in after each milestone

## Running locally
```
npm install
npm run dev       # local dev server
npm test          # Vitest
npm run build     # type-check and production build into dist/
```

Add `?seed=N` to the page URL to reproduce a specific run.

## Deploying
`.github/workflows/deploy.yml` tests and builds every PR, and on every push to `main` also publishes `dist/` to GitHub Pages. One-time setup: in the repo's Settings → Pages, set **Source** to **GitHub Actions**. Pages needs the repo to be public on a free GitHub plan.
