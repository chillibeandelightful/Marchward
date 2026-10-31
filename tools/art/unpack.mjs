// Splits an edited art master back into the files in public/art/.
// Run with `npm run art:unpack -- path/to/master.png` (options: `--layout file.json`, `--dry-run`).
// Only files whose pixels changed are written. The manifest is left alone. See docs/ART.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { decodePng, encodePng } from './png.mjs';
import { layoutFor, readArt, splitMaster } from './master.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const ART = join(ROOT, 'public', 'art');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { layout: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, scale: { type: 'string' } },
});
if (positionals.length !== 1) {
  console.error('Usage: npm run art:unpack -- path/to/master.png [--layout layout.json] [--dry-run]');
  process.exit(1);
}
const master = decodePng(readFileSync(resolve(process.cwd(), positionals[0])));
const art = readArt(ART);
const { layout, from } = values.layout
  ? { layout: JSON.parse(readFileSync(resolve(process.cwd(), values.layout), 'utf8')), from: values.layout }
  : layoutFor(master, art, values.scale ? Number(values.scale) : undefined);
console.log(`Splitting a ${master.width} x ${master.height} master using ${from}.`);

const { images, problems } = splitMaster(master, layout, art.images);
for (const p of problems) console.warn(`Warning: ${p}`);
let written = 0;
for (const [file, img] of Object.entries(images)) {
  const old = art.images[file];
  if (old && (old.width !== img.width || old.height !== img.height))
    console.warn(`Warning: ${file} is ${old.width}x${old.height} now but ${img.width}x${img.height} on the master; the manifest may need updating`);
  let changed = old ? 0 : img.width * img.height;
  if (old && old.width === img.width && old.height === img.height)
    for (let i = 0; i < img.rgba.length; i += 4) {
      // Fully transparent pixels count as equal whatever colour they hold.
      const a = old.rgba[i + 3] < 128;
      const b = img.rgba[i + 3] < 128;
      if (a !== b || (!a && (old.rgba[i] !== img.rgba[i] || old.rgba[i + 1] !== img.rgba[i + 1] || old.rgba[i + 2] !== img.rgba[i + 2]))) changed++;
    }
  if (!changed) continue;
  console.log(`${file}: ${changed} pixels changed`);
  if (!values['dry-run']) writeFileSync(join(ART, file), encodePng(img));
  written++;
}
console.log(written ? `${values['dry-run'] ? 'Would update' : 'Updated'} ${written} file(s) in public/art/.` : 'Nothing changed.');
