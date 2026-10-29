# Art spec

Hand-made art for the **Painted** style. The files live in `public/art/` and are listed in `public/art/manifest.json`. Anything without art is drawn in code as in Drab, so art can be added or replaced one piece at a time and the game always runs. Check new art on the art viewer: add `?art` to the game's address (and `&view=standard` or `&view=high` to see it at the other angles).

The first set was drawn by Claude, pixel by pixel, with `tools/art/draw.mjs` (run `npm run art:draw`). The PNG files are the art: paint over them, or drop in replacements made to this spec, and the game uses whatever is there. Running `art:draw` again overwrites `public/art/`, so once a file has been edited by hand, stop running it (or remove that file from the script).

## The view the art is drawn for

The **Low view** (see `src/render/iso.ts`):
- a tile is a 64 × 16 pixel diamond;
- one level of height is 26 pixels;
- castle pieces are drawn 1.5 times their height in levels, and the keep half of that.

At zoom 1 one art pixel is one screen pixel; the game starts at zoom 2. Art is drawn with hard pixel edges and no anti-aliasing, and is scaled up without smoothing.

Light comes from the **upper left**: the lit side of anything is its left and top, the shadow side its right and bottom. Sprites have a dark outline, darkest on the shadow side.

Colours follow the Drab palette (`src/render/styles/classic.ts`): muted olive and brown ground, grey stone, dark green-black pines, slate water.

## Sprites

Trees, rocks, plants, people, the camp and effects are frames on a sprite sheet.

- **Size:** as small as the drawing; there is no fixed frame size. Today's first set: pines 24 × 50, oaks 28 × 34, boulders 18 × 13, stones 16 × 7, reeds 13 × 15, heather and grass 11 × 6.
- **Anchor:** the pixel where the sprite meets the ground, usually the bottom middle. The sprite is placed so the bottom of that pixel sits on the ground point.
- **Variants:** as many as you like per sprite; the game picks one per spot at random (the same one every time for a given spot). Today: 6 pines, 4 oaks, 4 boulders, 3 stones, 3 reeds and 4 kinds of ground cover (grass, heather, bracken, dark grass).
- **Names:** `pine`, `oak`, `boulder`, `stones`, `reeds`, `tuft`. New names need a line in `src/render/assets.ts` and `src/render/paintedArt.ts`.

### People

Each kind of person is `kind.pose`, with the pose's animation frames in order: for example `mason.work` or `archer.shoot`. People are drawn **facing right** on a 16 × 23 frame with the feet's anchor at (7, 21); the game mirrors them to face left.

| Kind | Poses (frames) |
| --- | --- |
| `labourer`, `digger`, `quarryman`, `mason`, `carpenter` | `work` (4: tool raised, then coming down), `sit` (1, idle at the camp) |
| `carter` | `walk` (4, pushing the cart), `sit` (1) |
| `swordsman`, `raider` | `stand` (1), `walk` (4), `fight` (3; also used for battering and looting) |
| `archer`, `raiderArcher` | `stand` (1), `walk` (4), `shoot` (2: nocked, drawn) |

Any pose a kind lacks falls back to the code drawing for that kind.

### Camp and effects

- `tent` (variants, 42 × 30, anchor at the middle of the ground line), `block` (a stone block for the stone pile, 8 × 6) and `log` (a cut log end for the timber pile, 6 × 6). The piles grow and shrink with the stores.
- `cart` and `cartLoaded` (21 × 15): the carter's hand-cart, handles at the left, drawn in front of the carter.
- `fire` (4 frames, 14 × 20): flames for burning pieces and the camp hearth, scaled to the size of the blaze.
- `puff` (3 sizes: 8, 12 and 16 px): one round puff of smoke or dust, drawn light grey. The game tints it to the smoke or dust colour, fades it, and scales it as it rises, so draw it as a light, neutral shape.

## Ground textures

One repeating 64 × 64 patch for each kind of land: `ground.grass`, `ground.forest`, `ground.marsh`, `ground.rock`, `ground.shallow`, `ground.ford`, `ground.deep` and `ground.road` (today the road reuses the grass patch, and the code draws the road's ruts over it). The patch is laid on the screen, one texture pixel to one screen pixel at zoom 1, so it runs on unbroken across tiles and slopes. The game darkens it to shade slopes and can't lighten it, so draw it about a quarter brighter than the land should look on flat ground. It must repeat seamlessly.

## Stone textures

Castle stone is not cut into a sprite for every wall shape. Instead, every face of every wall, tower, gatehouse and keep is covered in one repeating texture, pinned to the world so courses and joints line up from one piece to the next. This works for every wall join, height and thickness, at every view angle.

- **`stoneFace`** (`stone-face.png`, 64 × 52): the face of the walls. 32 pixels across is one tile along a wall; up the face, one pixel is one screen pixel (so 52 pixels is two levels in the Low view). It must **repeat seamlessly** left to right and top to bottom. The game darkens the shaded (+x) faces and the sides of round towers itself, so draw it lit.
- **`stoneTop`** (`stone-top.png`, 32 × 32): flagstones on the tops of walls and towers, seen from above; 32 pixels is one tile each way. Also repeating.

## The manifest

```json
{
  "version": 1,
  "sheets": {
    "plants.png": {
      "pine": [{ "x": 0, "y": 0, "w": 24, "h": 50, "ax": 12, "ay": 49 }]
    }
  },
  "textures": { "stoneFace": "stone-face.png", "stoneTop": "stone-top.png", "ground.grass": "ground-grass.png" }
}
```

Each frame gives its rectangle on the sheet (`x`, `y`, `w`, `h`) and its anchor pixel inside the frame (`ax`, `ay`). Textures need a file each, so they can repeat. A bad entry is skipped with a warning in the browser console, and that sprite falls back to the code drawing.

## Templates

`npm run art:templates` writes guides to paint over into `art-templates/`:
- `sprite.png`: the Low view tile diamond (and the Standard one, fainter) with the anchor pixel in red, and a mark every level up the left edge;
- `stone-face.png`: one tile across and one Low view level up, marked;
- `stone-top.png`: one tile square.
