# seattlerec.com

An intro to Seattle as a city — orientation, quirks, and the things nobody tells
a first-time visitor, plus saved place lists on a map.

Built with [Astro](https://astro.build), static output, deployed on Vercel.

## Local development

Requires Node 20+.

```bash
npm install
npm run dev      # dev server with hot reload
npm run build    # static build into dist/
npm run preview  # serve the built site
```

## Where things live

| Path | What |
|---|---|
| `src/content/sections/` | The guide, one Markdown file per section. `order` in the frontmatter sets the sequence. |
| `src/content/neighborhoods/` | Neighborhood entries. Same shape will feed the v2 swipe deck. |
| `src/content.config.ts` | Collection schemas — frontmatter and list JSON are validated at build time. |
| `src/pages/index.astro` | The guide page. Pulls both collections and renders them. |
| `src/pages/lists/` | The lists board and the per-list map pages. |
| `src/data/lists/` | One JSON file per saved list. **Generated** — see below. |
| `tools/import-*.mjs` | The Google Takeout importers. |
| `data/list-rules.json` | What gets filtered out of the lists, and what overrides the filters. |
| `src/styles/global.css` | All styling. Light by default with a real dark mode. |

## Adding a section

Drop a new `.md` file in `src/content/sections/` with this frontmatter:

```yaml
---
title: Third places
kicker: Where to sit for three hours
order: 12
summary: One line for the contents list.
---
```

It appears in the contents list and the page automatically. A missing or
misspelled frontmatter field fails the build rather than shipping broken.

## The lists

`/lists` is a board of tiles, one per saved Google Maps list. Each tile opens a
map with the places beside it, cross-linked both ways.

Google has **no public API for personal saved lists**, so the data comes out of
a Google Takeout export:

```bash
# takeout.google.com -> Deselect all -> tick "Saved" -> export -> unzip
# copy the CSVs from Takeout/Saved/ into data/takeout/
npm run import:lists
```

The importers also pick up a `Maps (your places)` export if one is unzipped
anywhere in the project, deriving a *Been there* list from reviews and a
*Want to go* list from saved places.

> **Takeout exports contain raw personal data**, including your home address
> under `Maps/My labeled places/`. `takeout-*/`, `Takeout/` and `data/takeout/`
> are all gitignored. Leave them that way — this repo is public and deploys on
> push.

Anything the importers filter out — out of region, personal, or a low-star
review — is printed by name at the end of the run, never dropped silently.
Adjust `data/list-rules.json` to change what is kept; `alwaysInclude` beats
every filter.

Regenerating is safe: hand-written blurbs, emoji and ordering are merged back
in, so re-importing never undoes curation.

The map is Leaflet on OpenStreetMap tiles — no API key, no account, no billing.

See `NOTES.md` for decisions, verified facts, and open questions.
