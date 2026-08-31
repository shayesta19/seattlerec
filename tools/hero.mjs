#!/usr/bin/env node
/**
 * One photo in, the whole hero set out.
 *
 *   npm run hero -- data/hero-source.jpg
 *
 * The landing image is the largest thing on the site and the first thing
 * anybody waits for, so it does not ship as whatever came off the camera.
 * This writes AVIF and WebP at three widths, a JPEG for anything that takes
 * neither, and a manifest the landing page reads to build the <picture>.
 *
 * The manifest also carries a 24px-wide copy of the photo inlined as a data
 * URI. The hero paints that first, so the page opens on the photo's own
 * colours rather than a flat block while the real file is still on the wire.
 *
 * Delete public/hero/ and the drawn scene takes the slot back.
 */

import sharp from 'sharp';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'hero');
const URL_BASE = '/hero';

// A phone, a laptop and a 5K display. Every extra width is another pair of
// files in the repo for a case that nobody actually lands on.
const WIDTHS = [1280, 1920, 2560];

// Tuned by eye on this photo. AVIF is here mostly for the sky: a long smooth
// gradient is the one thing JPEG bands on at any quality worth shipping.
const FORMATS = [
  { ext: 'avif', type: 'image/avif', encode: (img) => img.avif({ quality: 52, effort: 6 }) },
  { ext: 'webp', type: 'image/webp', encode: (img) => img.webp({ quality: 74 }) },
];
const FALLBACK = {
  width: 1920,
  ext: 'jpg',
  encode: (img) => img.jpeg({ quality: 80, mozjpeg: true }),
};

const kb = (n) => Math.round(n / 1024) + ' KB';

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('Usage: npm run hero -- path/to/photo.jpg');
    process.exit(1);
  }

  const input = path.resolve(src);
  const meta = await sharp(input).metadata();
  console.log(path.basename(input) + ' -- ' + meta.width + ' x ' + meta.height);

  // Rebuilt wholesale rather than merged, so a narrower photo cannot leave
  // the last run's wider files behind for a browser to go and pick.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  // Never upscale. A 2560 file rendered out of a 1600px original is a larger
  // download of exactly the same amount of detail.
  const widths = WIDTHS.filter((w) => w <= meta.width);
  if (!widths.length) widths.push(meta.width);

  const sources = [];
  for (const fmt of FORMATS) {
    const entries = [];
    for (const w of widths) {
      const name = 'hero-' + w + '.' + fmt.ext;
      const buf = await fmt.encode(sharp(input).resize({ width: w })).toBuffer();
      await writeFile(path.join(OUT_DIR, name), buf);
      console.log('  ' + name.padEnd(17) + kb(buf.length));
      entries.push(URL_BASE + '/' + name + ' ' + w + 'w');
    }
    sources.push({ type: fmt.type, srcset: entries.join(', ') });
  }

  const fbWidth = Math.min(FALLBACK.width, meta.width);
  const fbName = 'hero-' + fbWidth + '.' + FALLBACK.ext;
  const fbBuf = await FALLBACK.encode(sharp(input).resize({ width: fbWidth })).toBuffer();
  await writeFile(path.join(OUT_DIR, fbName), fbBuf);
  console.log('  ' + fbName.padEnd(17) + kb(fbBuf.length) + '  (fallback)');

  // Small enough to inline in the HTML, big enough to still read as the
  // same picture once the browser has blown it back up.
  const blur = await sharp(input).resize({ width: 24 }).webp({ quality: 40 }).toBuffer();

  const manifest = {
    width: meta.width,
    height: meta.height,
    sources,
    fallback: URL_BASE + '/' + fbName,
    blur: 'data:image/webp;base64,' + blur.toString('base64'),
  };
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  console.log('  manifest.json     ' + blur.length + ' bytes of inline blur');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
