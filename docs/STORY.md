# Story and Setting

## Setting (original)
A fictional kingdom pushing its frontier into wild borderlands: hills, forests, marshes and a rugged coast. The player is a newly appointed warden, charged by the crown with raising a chain of castles to hold the frontier.

All names, places and characters are original. The tone is a little wry, in the spirit of the era's games, but the stories should still carry weight.

## Two modes
- **Chronicle:** grounded frontier politics. Disputes, rebellions, debts, marriages, outlaws, harvests, plague, rival lords.
- **Legend:** the same world, but folklore is real. Old stones hum, creatures come out of the marsh, a hermit's prophecies come true. Includes Legend-only creatures in combat.

Most event chains are shared between modes. Legend mode adds its own chains and sometimes swaps a mundane explanation for a supernatural one.

## Factions
Each has a standing value that events change:
- **The Crown:** your patron. Expects progress and loyalty. Low standing brings less money and more scrutiny.
- **The Church:** wants tithes and respect. Can grant money or stir unrest.
- **The Barons:** your rival lords. Want land and favours. Can send troops or betray you.
- **The Common Folk:** your workers and villagers. Low standing means lower efficiency, harder hiring and rebellion risk.
- **The Borderfolk:** the people whose land you're building on. Raids grow or shrink with how they're treated.

## Event structure
- One messenger per month, with three choices.
- Each choice can change money, food, workers, faction standing, raid chance, or set story flags.
- Flags let later events follow up: the outlaw you spared returns, the baron you snubbed withholds troops, the abbot you funded sends masons.
- Chains run across months and sometimes across sites.
- Events are data (see `src/data/events/`), with conditions (mode, region, season, flags, standing) and weighted selection.

## Regions (placeholder names)
Each region gets a terrain character, a difficulty step and a few region-specific event chains.
1. Greenhollow: gentle grassland, a forgiving start.
2. Ashford Vale: river valley with fords and floodplain.
3. Thornwood: dense forest, timber-rich, raiders use cover.
4. The Saltmarsh: coastal marsh, hard foundations, freezes in winter.
5. Crag Moor: rocky upland, great foundations, no moats, steep approaches.
6. Blackwater Fen: deep marsh and islands; Legend mode's bog wights live here.
7. The High Passes: cliffs and narrow valleys, harsh winters.
8. The Old Seat: the borderfolk's heartland, the hardest site, the end of the campaign.

## First event chains to write (M7)
- The Outlaw: capture, spare, recruit or execute; consequences over a year.
- The Abbot's Request: fund a chapel; pay now or deal with the Church later.
- The Baron's Wedding: a marriage alliance that brings troops or trouble.
- The Hungry Winter: a bad harvest; open the stores, raise prices or let it be.
- The Strange Stones (Legend): workers dig up old standing stones.
