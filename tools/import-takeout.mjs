#!/usr/bin/env node
/**
 * Google Takeout "Maps (your places)" -> src/data/lists/*.json
 *
 * This is the companion to import-lists.mjs. That one reads the per-list CSVs
 * that come out of Takeout's **Saved** product; this one reads the two GeoJSON
 * files that come out of **Maps (your places)**:
 *
 *   Saved Places.json  -- everything bookmarked, one flat pile, no list names
 *   Reviews.json       -- reviews written, with star ratings and review text
 *
 * Neither carries list membership -- Google only puts that in the Saved CSVs --
 * so this derives two lists from the shape of the data instead:
 *
 *   want-to-go   saved but never reviewed  = on the shortlist
 *   been-there   reviewed at 3 stars or up = been, would send someone else
 *
 * Both files carry real coordinates, so nothing here needs geocoding.
 *
 * Three filters run before anything is written, because this feeds a public
 * website and a raw Maps history is not a publishable document:
 *
 *   1. region  -- greater Seattle only; the Boston and Chennai saves drop out
 *   2. private -- apartments, clinics, phone stores, groceries: errands and
 *                 house-hunting, not recommendations
 *   3. rating  -- 1 and 2 star reviews are withheld. They name small
 *                 businesses and accuse staff by implication, which is a
 *                 different act on your own site than on a Google profile.
 *
 * Everything the filters drop is listed at the end of the run, so nothing
 * disappears silently. To publish something that was filtered, add it to
 * data/list-rules.json under "alwaysInclude".
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadOverrides, applyOverride } from './lib/overrides.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'src', 'data', 'lists');
const RULES_FILE = path.join(ROOT, 'data', 'list-rules.json');

const DRY = process.argv.includes('--dry-run');

// Greater Seattle: the city, the Eastside, the north and south suburbs, and
// far enough west to keep the ferry-side saves.
const REGION = { minLat: 47.0, maxLat: 48.3, minLng: -122.9, maxLng: -121.5 };

const MIN_STARS = 3;

/* ------------------------------- rules ------------------------------- */

const DEFAULT_RULES = {
  _comment:
    'Curation rules for import-takeout.mjs. excludeNames and excludePatterns drop a place; alwaysInclude overrides every filter including the region and star-rating ones.',
  excludeNames: [],
  excludePatterns: [
    'apartments?\\b',
    '\\bdental\\b',
    '\\bclinic\\b',
    '\\bdr\\.',
    'verizon',
    'ulta beauty',
    'supermarket',
    'galleria',
    '\\bwalk of fame\\b',
    'university .*store',
    'security services',
  ],
  alwaysInclude: [],
};

async function loadRules() {
  if (!existsSync(RULES_FILE)) {
    await writeFile(RULES_FILE, JSON.stringify(DEFAULT_RULES, null, 2) + '\n');
    return DEFAULT_RULES;
  }
  try {
    return { ...DEFAULT_RULES, ...JSON.parse(await readFile(RULES_FILE, 'utf8')) };
  } catch {
    return DEFAULT_RULES;
  }
}

/* ------------------------------ discovery ------------------------------ */

// The user unzips Takeout wherever it lands, so go and find it rather than
// insisting on a path. Depth is capped so this never walks node_modules.
async function findPlacesDirs(dir, depth = 0, found = []) {
  if (depth > 4) return found;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.name === 'Maps (your places)') found.push(full);
    else await findPlacesDirs(full, depth + 1, found);
  }
  return found;
}

async function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    console.warn('  ! could not read ' + path.basename(file) + ': ' + err.message);
    return null;
  }
}

/* ------------------------------ filtering ------------------------------ */

const norm = (s) => (s || '').trim().toLowerCase();

function makeFilter(rules) {
  const patterns = rules.excludePatterns.map((p) => new RegExp(p, 'i'));
  const excluded = new Set(rules.excludeNames.map(norm));
  const forced = new Set(rules.alwaysInclude.map(norm));

  return function verdict(place) {
    if (forced.has(norm(place.name))) return { keep: true };

    const { lat, lng } = place;
    if (lat < REGION.minLat || lat > REGION.maxLat || lng < REGION.minLng || lng > REGION.maxLng) {
      return { keep: false, why: 'outside greater Seattle' };
    }
    if (excluded.has(norm(place.name))) return { keep: false, why: 'on the exclude list' };

    const hit = patterns.find((re) => re.test(place.name));
    if (hit) return { keep: false, why: 'looks personal (' + hit.source + ')' };

    return { keep: true };
  };
}

/* ------------------------------ extraction ------------------------------ */

function feature(f) {
  const p = f.properties || {};
  const loc = p.location || {};
  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    name: (loc.name || '').trim(),
    address: (loc.address || '').trim(),
    url: p.google_maps_url,
    date: (p.date || '').slice(0, 10),
    lat,
    lng,
    raw: p,
  };
}

// The review questionnaire is the most useful thing in the export and the part
// nobody thinks to look at: meal type, price band, and separate food/service
// scores. It turns into the tag row under each place.
function reviewTags(p) {
  const tags = [];
  const stars = p.five_star_rating_published;
  if (stars) tags.push(stars + '★');

  for (const q of p.questions ?? []) {
    if (!q.selected_option) continue;
    if (/^(meal type|order type|price per person)$/i.test(q.question)) {
      tags.push(q.selected_option);
    }
  }
  return tags;
}

/* ------------------------------- output ------------------------------- */

const CURATED_LIST = ['name', 'blurb', 'emoji', 'order', 'cover', 'hidden'];
const CURATED_PLACE = ['blurb', 'cover'];

async function writeList(spec, overrides) {
  const file = path.join(OUT_DIR, spec.slug + '.json');
  let prev = null;
  if (existsSync(file)) {
    try {
      prev = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      prev = null;
    }
  }

  const prevPlaces = new Map((prev?.places ?? []).map((p) => [p.name, p]));
  const places = spec.places.map((p) => {
    const old = prevPlaces.get(p.name);
    if (old) for (const k of CURATED_PLACE) if (old[k] !== undefined) p[k] = old[k];
    return JSON.parse(JSON.stringify(p));
  });

  const out = {
    name: spec.name,
    slug: spec.slug,
    emoji: spec.emoji,
    order: spec.order,
    blurb: spec.blurb,
    updated: new Date().toISOString().slice(0, 10),
    places,
  };
  for (const k of CURATED_LIST) if (prev?.[k] !== undefined) out[k] = prev[k];
  const note = applyOverride(out, spec.name, overrides || {});
  if (note) console.log('    ' + note);

  if (DRY) console.log('  (dry run) ' + spec.slug + ': ' + places.length + ' places');
  else await writeFile(file, JSON.stringify(out, null, 2) + '\n');
}

/* -------------------------------- main -------------------------------- */

async function main() {
  const dirs = await findPlacesDirs(ROOT);
  if (!dirs.length) {
    console.log('No "Maps (your places)" folder found. Unzip a Takeout export anywhere in the project and re-run.');
    return;
  }
  for (const d of dirs) console.log('Reading ' + path.relative(ROOT, d));

  const rules = await loadRules();
  const overrides = await loadOverrides(ROOT);
  const verdict = makeFilter(rules);
  await mkdir(OUT_DIR, { recursive: true });

  const saved = [];
  const reviewed = [];
  const dropped = [];

  for (const dir of dirs) {
    const sp = await readJson(path.join(dir, 'Saved Places.json'));
    for (const f of sp?.features ?? []) {
      const p = feature(f);
      if (p && p.name) saved.push(p);
    }

    const rv = await readJson(path.join(dir, 'Reviews.json'));
    for (const f of rv?.features ?? []) {
      const p = feature(f);
      if (p && p.name) reviewed.push(p);
    }
  }

  // A place reviewed is a place visited, so it belongs in been-there even if it
  // is still sitting in the saved pile.
  const reviewedNames = new Set(reviewed.map((p) => norm(p.name)));

  const beenThere = [];
  for (const p of reviewed) {
    const v = verdict(p);
    if (!v.keep) {
      dropped.push({ name: p.name, why: v.why, list: 'been-there' });
      continue;
    }
    const stars = p.raw.five_star_rating_published ?? 0;
    if (stars && stars < MIN_STARS && !rules.alwaysInclude.map(norm).includes(norm(p.name))) {
      dropped.push({ name: p.name, why: stars + '-star review, withheld', list: 'been-there' });
      continue;
    }
    const text = (p.raw.review_text_published || '').replace(/\s+/g, ' ').trim();
    beenThere.push({
      name: p.name,
      note: text || undefined,
      url: p.url,
      lat: p.lat,
      lng: p.lng,
      address: p.address || undefined,
      source: 'url',
      tags: reviewTags(p.raw),
    });
  }

  const wantToGo = [];
  for (const p of saved) {
    if (reviewedNames.has(norm(p.name))) continue; // it graduated to been-there
    const v = verdict(p);
    if (!v.keep) {
      dropped.push({ name: p.name, why: v.why, list: 'want-to-go' });
      continue;
    }
    wantToGo.push({
      name: p.name,
      url: p.url,
      lat: p.lat,
      lng: p.lng,
      address: p.address || undefined,
      source: 'url',
      tags: p.date ? ['saved ' + p.date.slice(0, 7)] : undefined,
    });
  }

  // Newest save first; highest rating first, then newest.
  wantToGo.sort((a, b) => (b.tags?.[0] ?? '').localeCompare(a.tags?.[0] ?? ''));
  beenThere.sort((a, b) => parseInt(b.tags[0]) - parseInt(a.tags[0]));

  await writeList({
    slug: 'been-there',
    name: 'Been there',
    emoji: '⭐',
    order: 1,
    blurb: 'Places actually visited and reviewed, with the ratings left as they were written.',
    places: beenThere,
  }, overrides);

  await writeList({
    slug: 'want-to-go',
    name: 'Want to go',
    emoji: '📌',
    order: 2,
    blurb: 'Saved, bookmarked, not yet been. The running shortlist.',
    places: wantToGo,
  }, overrides);

  console.log('\nbeen-there: ' + beenThere.length + ' places');
  console.log('want-to-go: ' + wantToGo.length + ' places');

  if (dropped.length) {
    console.log('\nFiltered out (' + dropped.length + ') -- add to "alwaysInclude" in data/list-rules.json to publish any of these:');
    for (const d of dropped) console.log('  - ' + d.name + ' (' + d.why + ')');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
