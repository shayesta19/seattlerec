/**
 * List-level overrides, shared by both importers.
 *
 * The generated JSON in src/data/lists/ is generated: re-running an import
 * rewrites it. So anything a human decided about a list -- a better name than
 * Google's default, whether it should appear at all -- lives in
 * data/list-overrides.json instead, and is reapplied on every run.
 *
 * This deliberately wins over the values carried forward from the previous
 * generated file. Two sources of truth for the same field is how a rename
 * quietly reverts three imports later.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function loadOverrides(root) {
  const file = path.join(root, 'data', 'list-overrides.json');
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    delete raw._comment;
    return raw;
  } catch (err) {
    console.warn('  ! could not read list-overrides.json: ' + err.message);
    return {};
  }
}

const FIELDS = ['name', 'emoji', 'order', 'blurb', 'cover', 'hidden'];

/**
 * Apply the override for `sourceName` onto an output list object, in place.
 * Returns a short description of what changed, or null, so the importer can
 * say so rather than silently renaming things.
 */
export function applyOverride(out, sourceName, overrides) {
  const key = slugify(sourceName);
  const o = overrides[key];
  if (!o) return null;

  const changed = [];
  for (const f of FIELDS) {
    if (o[f] === undefined || o[f] === out[f]) continue;
    if (f === 'name') changed.push('renamed to "' + o[f] + '"');
    else if (f === 'hidden' && o[f]) changed.push('hidden');
    else changed.push(f);
    out[f] = o[f];
  }
  return changed.length ? changed.join(', ') : null;
}
