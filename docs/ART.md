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

Trees, rocks, plants (and later figures, carts and effects) are frames on a sprite sheet.

- **Size:** as small as the drawing; there is no fixed frame size. Today's first set: pines 24 × 50, oaks 28 × 34, boulders 18 × 13, stones 16 × 7, reeds 13 × 15, heather and grass 11 × 6.
- **Anchor:** the pixel where the sprite meets the ground, usually the bottom middle. The sprite is placed so the bottom of that pixel sits on the ground point.
- **Variants:** as many as you like per sprite; the game picks one per spot at random (the same one every time for a given spot). Today: 6 pines, 4 oaks, 4 boulders, 3 stones, 3 reeds and 4 kinds of ground cover (grass, heather, bracken, dark grass).
- **Names:** `pine`, `oak`, `boulder`, `stones`, `reeds`, `tuft`. New names need a line in `src/render/assets.ts` and `src/render/paintedArt.ts`.

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
  "textures": { "stoneFace": "stone-face.png", "stoneTop": "stone-top.png" }
}
```

Each frame gives its rectangle on the sheet (`x`, `y`, `w`, `h`) and its anchor pixel inside the frame (`ax`, `ay`). Textures need a file each, so they can repeat. A bad entry is skipped with a warning in the browser console, and that sprite falls back to the code drawing.

## Templates

`npm run art:templates` writes guides to paint over into `art-templates/`:
- `sprite.png`: the Low view tile diamond (and the Standard one, fainter) with the anchor pixel in red, and a mark every level up the left edge;
- `stone-face.png`: one tile across and one Low view level up, marked;
- `stone-top.png`: one tile square.
