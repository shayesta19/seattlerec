#!/usr/bin/env node
/**
 * Does the hero type actually clear WCAG on top of the hero photo?
 *
 *   node tools/hero-contrast.mjs '<json>'
 *
 * The scrim is a stack of gradients over a photograph, so the answer is a
 * different number at every pixel and cannot be eyeballed -- doubly so on a
 * machine with Chrome's auto dark mode on, which darkens the screenshot and
 * quietly flatters every contrast check you try to do by eye.
 *
 * So: take the text boxes measured off the live page, map them back through
 * object-fit: cover into source-image pixels, find the brightest pixel under
 * each one, composite the real scrim over it, and report the ratio. The
 * brightest pixel rather than the average, because a headline is only as
 * legible as the worst patch it crosses.
 *
 * Input JSON: { vw, vh, objectY, boxes: [{ name, x0, y0, x1, y1, fg, op, min }] }
 */

import sharp from 'sharp';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'data', 'hero-source.jpg');

// Transcribed from .hero-scrim in src/styles/global.css. Keep in step with it.
const SCRIM = [6, 14, 18];
const LINEAR_UP = [[0, .93], [.26, .74], [.54, .30], [.78, .07], [1, 0]];
const LINEAR_RIGHT = [[0, .52], [.46, .14], [.72, 0], [1, 0]];
const ELLIPSE = { cx: .34, cy: .40, rx: .70, ry: .45, stops: [[0, .32], [.45, .18], [.78, 0]] };

const rampAt = (stops, t) => {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, a0] = stops[i - 1];
      const [p1, a1] = stops[i];
      return a0 + (a1 - a0) * ((t - p0) / (p1 - p0));
    }
  }
  return stops[stops.length - 1][1];
};

// Same colour in every layer, so the order they stack in does not change the
// result -- only how much light each one takes away.
function scrimAlpha(x, y, vw, vh) {
  const dx = (x / vw - ELLIPSE.cx) / ELLIPSE.rx;
  const dy = (y / vh - ELLIPSE.cy) / ELLIPSE.ry;
  const layers = [
    rampAt(ELLIPSE.stops, Math.hypot(dx, dy)),
    rampAt(LINEAR_UP, 1 - y / vh),
    rampAt(LINEAR_RIGHT, x / vw),
  ];
  return 1 - layers.reduce((acc, a) => acc * (1 - a), 1);
}

const lin = (c) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
const L = ([r, g, b]) => .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);

async function main() {
  const cfg = JSON.parse(process.argv[2]);
  const { vw, vh, objectY } = cfg;
  const meta = await sharp(SRC).metadata();

  // object-fit: cover -- whichever axis needs the bigger scale factor wins.
  const scale = Math.max(vw / meta.width, vh / meta.height);
  const offX = -(meta.width * scale - vw) / 2;          // object-position x is 50%
  const offY = -(meta.height * scale - vh) * objectY;
  const toSrc = (x, y) => [
    Math.max(0, Math.round((x - offX) / scale)),
    Math.max(0, Math.round((y - offY) / scale)),
  ];

  console.log(vw + ' x ' + vh + '  (photo drawn at ' + Math.round(meta.width * scale) +
    ' x ' + Math.round(meta.height * scale) + ')');

  let worst = Infinity;
  for (const b of cfg.boxes) {
    const [sx0, sy0] = toSrc(b.x0, b.y0);
    const [sx1, sy1] = toSrc(b.x1, b.y1);
    const w = Math.min(sx1 - sx0, meta.width - sx0);
    const h = Math.min(sy1 - sy0, meta.height - sy0);
    const { data, info } = await sharp(SRC)
      .extract({ left: sx0, top: sy0, width: w, height: h })
      .raw().toBuffer({ resolveWithObject: true });

    let bright = [0, 0, 0], brightL = -1;
    for (let i = 0; i < data.length; i += info.channels) {
      const px = [data[i], data[i + 1], data[i + 2]];
      const l = L(px);
      if (l > brightL) { brightL = l; bright = px; }
    }

    const alpha = scrimAlpha((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, vw, vh);
    const bg = bright.map((c, i) => c * (1 - alpha) + SCRIM[i] * alpha);
    const fg = b.fg.map((c, i) => c * b.op + bg[i] * (1 - b.op));
    const r = ratio(L(fg), L(bg));
    worst = Math.min(worst, r / b.min);

    console.log(
      '  ' + b.name.padEnd(9) + r.toFixed(2) + ':1' +
      '  (needs ' + b.min + ')  scrim ' + (alpha * 100).toFixed(0) + '%  ' +
      (r >= b.min ? 'pass' : 'FAIL')
    );
  }
  if (worst < 1) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
