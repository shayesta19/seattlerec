#!/usr/bin/env node
/**
 * The favicon set, from one definition.
 *
 *   npm run icons
 *
 * The Space Needle in Galaxy Gold -- the colour the top house was painted for
 * the 1962 World's Fair, and the colour they put back on the halo for the
 * 50th in 2012.
 *
 * The artwork lives here rather than in a checked-in .svg because the set
 * needs three different framings of the same drawing and they have to agree:
 *
 *   - browsers get a rounded badge, full bleed
 *   - iOS applies its own mask to a square, so it gets square corners and a
 *     little inset -- rounding it here would round it twice
 *   - a maskable icon can be cropped to a circle, so its artwork sits inside
 *     the 80% safe zone or Android clips the spire and the feet off
 *
 * Hand-maintaining five files that must not drift is how they drift.
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'public');

// Only the top house is gold. In 1962 the tower's legs went up in Astronaut
// White and the top house in Galaxy Gold, and the halo was repainted gold
// again for the 50th in 2012 -- so a Needle that is orange all over is not a
// Needle anybody has actually seen.
const GOLD = '#e9992f';   // Galaxy Gold, the top house
const WHITE = '#f1efe8';  // the structure
const NIGHT = '#10241d';  // the site's ink, a shade greener

// Drawn on a 32x32 grid. Proportions are stylised, not survey-accurate: the
// real observation deck sits at 86% of the tower's height and the base spans
// only a fifth of it, which at 16px is a vertical line with a speck on top.
// What had to stay true is the *order* of those proportions -- saucer high,
// long waist, narrow feet. Drawn halfway up with the feet apart, this reads
// unmistakably as a person with their arms out.
// Spire, shaft and legs. These run *under* the top house and overlap into
// it: abutting two fills exactly leaves an antialiased hairline along the
// seam at small sizes, so they tuck beneath instead.
const TOWER = [
  '<path d="M15.25 2.6h1.5v5.4h-1.5z"/>',
  '<path d="M14.1 11.8h3.8l-.35 17.2h-3.1z"/>',
  '<path d="M14.5 19q-.7 5.6-5.6 10h3.4q3.9-4.3 4.5-8.8z"/>',
  '<path d="M17.5 19q.7 5.6 5.6 10h-3.4q-3.9-4.3-4.5-8.8z"/>',
].join('');

// The top house, drawn last so it covers where the spire and shaft run into
// it. A flat bar with pointed ends reads as shoulders, so it is an ellipse
// with a concave underside flowing down into the shaft.
const TOP =
  '<path d="M7 8.4C7 6.6 11 5.6 16 5.6s9 1 9 2.8c0 .6-1 1.1-2.6 1.5Q18.9 10.9 17.9 12.4h-3.8Q13.1 10.9 9.6 9.9C8 9.5 7 9 7 8.4z"/>';

/** @param radius corner radius in grid units; @param inset margin in grid units */
function svg({ radius = 0, inset = 0, label = '' } = {}) {
  const scale = (32 - inset * 2) / 32;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"' +
    (label ? ' role="img" aria-label="' + label + '"' : '') + '>' +
    '<rect width="32" height="32" rx="' + radius + '" fill="' + NIGHT + '"/>' +
    '<g transform="translate(' + inset + ' ' + inset + ') scale(' + scale.toFixed(4) + ')">' +
    '<g fill="' + WHITE + '">' + TOWER + '</g>' +
    '<g fill="' + GOLD + '">' + TOP + '</g>' +
    '</g></svg>';
}

const png = (markup, size) =>
  sharp(Buffer.from(markup), { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/**
 * ICO is a directory of images; since Vista each entry may be a PNG rather
 * than a BMP, which is why this is short. A 0 in the size byte means 256.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // 1 = icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size % 256, 0);
    e.writeUInt8(size % 256, 1);
    e.writeUInt8(0, 2);                    // palette size
    e.writeUInt8(0, 3);                    // reserved
    e.writeUInt16LE(1, 4);                 // colour planes
    e.writeUInt16LE(32, 6);                // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]);
}

async function main() {
  const rounded = svg({ radius: 7, label: 'The Space Needle' });
  const square = svg({ radius: 0 });
  const write = async (name, buf) => {
    await writeFile(path.join(OUT, name), buf);
    console.log('  ' + name.padEnd(24) + Math.max(1, Math.round(buf.length / 1024)) + ' KB');
  };

  await write('favicon.svg', Buffer.from(rounded + '\n'));

  // Legacy, and what a browser blindly requests at /favicon.ico anyway.
  const sizes = [16, 32, 48];
  const images = [];
  for (const size of sizes) images.push({ size, buf: await png(rounded, size) });
  await write('favicon.ico', ico(images));

  // iOS masks it itself, and shows it on wallpaper, so: square and inset.
  await write('apple-touch-icon.png', await png(svg({ radius: 0, inset: 2.6 }), 180));

  await write('icon-192.png', await png(square, 192));
  await write('icon-512.png', await png(square, 512));
  // Maskable icons can be cropped to a circle: keep the art in the safe zone.
  await write('icon-maskable-512.png', await png(svg({ radius: 0, inset: 5.2 }), 512));

  await write('site.webmanifest', Buffer.from(JSON.stringify({
    name: 'seattlerec.com',
    short_name: 'seattlerec',
    description: "A local's guide to Seattle.",
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f6f2',
    theme_color: NIGHT,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n'));
}

main().catch((err) => { console.error(err); process.exit(1); });
