// Lays every file in public/art/ out on one master image to paint on, with a labelled legend.
// Run with `npm run art:pack` (options: `--scale 4`, `--out art-master`). See docs/ART.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { encodePng } from './png.mjs';
import { drawMaster, LAYOUT_KEY, readArt } from './master.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const { values } = parseArgs({ options: { scale: { type: 'string', default: '4' }, out: { type: 'string', default: 'art-master' } } });
const scale = Number(values.scale);
if (!Number.isInteger(scale) || scale < 1 || scale > 16) throw new Error('--scale must be a whole number from 1 to 16');
const out = resolve(ROOT, values.out);

const art = readArt(join(ROOT, 'public', 'art'));
const { img, layout } = drawMaster(art, { scale });
const { img: legend } = drawMaster(art, { scale, legend: true });
const json = JSON.stringify(layout);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'marchward-art-master.png'), encodePng(img, { [LAYOUT_KEY]: json }));
writeFileSync(join(out, 'marchward-art-legend.png'), encodePng(legend));
writeFileSync(join(out, 'marchward-art-layout.json'), JSON.stringify(layout, null, 2) + '\n');
console.log(`Wrote the master (${layout.width} x ${layout.height}, ${layout.blocks.length} files at scale ${scale}) and its legend to ${out}`);
