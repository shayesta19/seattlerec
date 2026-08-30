#!/usr/bin/env node
/**
 * Google Maps saved lists -> src/data/lists/*.json
 *
 * Google has no public API for a person's saved lists, so the only reliable
 * route is Google Takeout:
 *
 *   takeout.google.com -> deselect all -> tick "Saved" -> export -> unzip
 *   -> copy the CSVs out of Takeout/Saved/ into data/takeout/
 *
 * Then: npm run import:lists
 *
 * Takeout gives a name, a note and a Google Maps URL per place -- no
 * coordinates. Most URLs carry the lat/lng inline and we pull it straight out;
 * anything left over gets geocoded against Nominatim, at the one-request-per-
 * second their usage policy asks for, with results cached to disk so a re-run
 * costs nothing.
 *
 * Curation survives re-import: hand-written blurbs, emoji, cover images and
 * ordering are merged back in from the existing JSON.
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
// Two kinds of list, same pipeline. `takeout` is whatever Google exported --
// a personal history. `curated` is hand-written: the answers to "where do I
// run", "where is the water", which no Maps export is ever going to contain.
const SOURCES = [
  { dir: path.join(ROOT, 'data', 'takeout'), curated: false },
  { dir: path.join(ROOT, 'data', 'curated'), curated: true },
];
const OUT_DIR = path.join(ROOT, 'src', 'data', 'lists');
const CACHE_FILE = path.join(ROOT, 'data', 'geocode-cache.json');
const ALIAS_FILE = path.join(ROOT, 'data', 'geocode-aliases.json');

const UA = 'seattlerec.com list importer (https://seattlerec.com)';
const THROTTLE = 1100; // Nominatim asks for no more than 1 req/sec
const BIAS = 'Seattle, Washington, USA';

const DRY = process.argv.includes('--dry-run');

/* ------------------------------- csv ------------------------------- */

// Small RFC-4180 reader: quoted fields, embedded commas and newlines, "" escapes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Takeout has shipped these headers with different casing over the years, and
// occasionally with extra columns, so match on intent rather than position.
function columnMap(header) {
  const idx = {};
  header.forEach((h, i) => {
    const k = h.trim().toLowerCase();
    if (/^(title|name)$/.test(k)) idx.title = i;
    else if (/^(note|comment|description)$/.test(k)) idx.note = i;
    else if (/^(url|link)$/.test(k)) idx.url = i;
    else if (/^(lat|latitude)$/.test(k)) idx.lat = i;
    else if (/^(lng|lon|long|longitude)$/.test(k)) idx.lng = i;
    else if (/^(kind|kinds|category|categories)$/.test(k)) idx.kind = i;
  });
  return idx;
}

/* ---------------------------- coordinates ---------------------------- */

const inSeattle = (lat, lng) => lat > 47.0 && lat < 48.2 && lng > -122.9 && lng < -121.6;

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Google packs the same coordinate into a URL several different ways. The
// !3d!4d pair is the place itself; the @ pair is only the map viewport, which
// is close enough for a pin but loses to !3d!4d when both are present.
function coordsFromUrl(url) {
  if (!url) return null;
  const decoded = safeDecode(url);

  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // the place
    /[?&#](?:ll|q|center|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // the viewport
  ];

  for (const re of patterns) {
    const m = decoded.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90) {
        return { lat, lng, from: 'url' };
      }
    }
  }
  return null;
}

/* ----------------------------- geocoding ----------------------------- */

let cache = {};
let aliases = {};
let lastCall = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadCache() {
  if (existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(await readFile(CACHE_FILE, 'utf8')); } catch { cache = {}; }
  }
  // Escape hatch for the handful of places a plain name search never finds --
  // map the place name to a street address and the geocoder stops guessing.
  if (existsSync(ALIAS_FILE)) {
    try { aliases = JSON.parse(await readFile(ALIAS_FILE, 'utf8')); } catch { aliases = {}; }
  }
}

async function geocode(query) {
  if (query in cache) return cache[query];

  const wait = THROTTLE - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', query);
  u.searchParams.set('format', 'json');
  u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'us');

  let hit = null;
  try {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const [first] = await res.json();
      if (first) {
        hit = {
          lat: parseFloat(first.lat),
          lng: parseFloat(first.lon),
          address: first.display_name,
          from: 'nominatim',
        };
      }
    }
  } catch (err) {
    console.warn('  ! geocode failed for ' + query + ': ' + err.message);
  }

  cache[query] = hit; // cache the misses too, so retries stay cheap
  return hit;
}

/* ------------------------------- merge ------------------------------- */

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Anything a human typed into the JSON by hand is not the importer's to own.
const CURATED_LIST = ['name', 'blurb', 'emoji', 'order', 'cover', 'hidden'];
const CURATED_PLACE = ['blurb', 'cover', 'tags'];

async function existing(slug) {
  const f = path.join(OUT_DIR, slug + '.json');
  if (!existsSync(f)) return null;
  try { return JSON.parse(await readFile(f, 'utf8')); } catch { return null; }
}

/* -------------------------------- main -------------------------------- */

async function main() {
  const jobs = [];
  for (const src of SOURCES) {
    if (!existsSync(src.dir)) continue;
    const files = (await readdir(src.dir)).filter((f) => f.toLowerCase().endsWith('.csv'));
    for (const file of files) jobs.push({ ...src, file });
  }

  if (!jobs.length) {
    console.log('Nothing to import. Takeout CSVs go in data/takeout/, hand-written lists in data/curated/.');
    return;
  }

  await loadCache();
  await mkdir(OUT_DIR, { recursive: true });

  let totalPlaces = 0;
  let geocoded = 0;
  let unplaced = 0;

  for (const job of jobs) {
    const { file, dir, curated } = job;
    const listName = path.basename(file, '.csv').replace(/[_-]+/g, ' ').trim();
    const slug = slugify(listName);
    const rows = parseCsv(await readFile(path.join(dir, file), 'utf8'));
    if (rows.length < 2) { console.log('- ' + file + ': empty, skipped'); continue; }

    const idx = columnMap(rows[0]);
    if (idx.title === undefined) {
      console.warn('- ' + file + ': no Title column (saw ' + rows[0].join(', ') + '), skipped');
      continue;
    }

    const prev = await existing(slug);
    const prevPlaces = new Map((prev && prev.places ? prev.places : []).map((p) => [p.name, p]));

    console.log('- ' + listName + ' (' + (rows.length - 1) + ' rows)');
    const places = [];

    for (const row of rows.slice(1)) {
      const name = (row[idx.title] || '').trim();
      if (!name) continue;

      const note = (row[idx.note] || '').trim();
      const url = (row[idx.url] || '').trim();
      const kinds = (row[idx.kind] || '')
        .split(/[;|]/)
        .map((k) => k.trim())
        .filter(Boolean);

      // Coordinates given outright beat both the URL and the geocoder.
      const csvLat = parseFloat(row[idx.lat]);
      const csvLng = parseFloat(row[idx.lng]);
      let point = Number.isFinite(csvLat) && Number.isFinite(csvLng)
        ? { lat: csvLat, lng: csvLng, from: 'url' }
        : null;

      if (!point) point = coordsFromUrl(url);
      if (!point) {
        point = await geocode(aliases[name] || name + ', ' + BIAS);
        if (point) geocoded++;
      }
      if (!point) {
        unplaced++;
        console.warn('  ! no coordinates for "' + name + '" -- add an address to data/geocode-aliases.json');
      } else if (!inSeattle(point.lat, point.lng)) {
        // A geocoder that wandered out of the region is worse than no pin.
        console.warn('  ! "' + name + '" landed outside the Seattle area (' + point.lat + ', ' + point.lng + ') -- check it');
      }

      const place = {
        name,
        note: note || undefined,
        url: url || undefined,
        lat: point ? point.lat : undefined,
        lng: point ? point.lng : undefined,
        address: point ? point.address : undefined,
        source: point ? point.from : undefined,
        kinds: kinds.length ? kinds : undefined,
      };

      const old = prevPlaces.get(name);
      if (old) for (const k of CURATED_PLACE) if (old[k] !== undefined) place[k] = old[k];

      places.push(JSON.parse(JSON.stringify(place))); // drops the undefined keys
      totalPlaces++;
    }

    const out = {
      name: listName,
      slug,
      curated,
      places,
      updated: new Date().toISOString().slice(0, 10),
    };
    for (const k of CURATED_LIST) if (prev && prev[k] !== undefined) out[k] = prev[k];

    if (DRY) console.log('  (dry run) would write ' + places.length + ' places');
    else await writeFile(path.join(OUT_DIR, slug + '.json'), JSON.stringify(out, null, 2) + '\n');
  }

  if (!DRY) await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n');

  console.log(
    '\n' + totalPlaces + ' places across ' + jobs.length + ' lists (' +
    geocoded + ' geocoded, ' + unplaced + ' still missing coordinates).'
  );
}

main().catch((err) => { console.error(err); process.exit(1); });
