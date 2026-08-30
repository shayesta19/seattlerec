# seattlerec.com — build notes

## Decisions (locked)
- **v1 scope**: intro / orientation guide only. Interests picker + swipe deck is v2.
- **Stack**: Astro, static output. Requires Node 20+ (currently blocked on Node 16 upgrade).
- **Hosting**: Cloudflare Pages, free tier. `seattlerec.com` points at it via DNS.
- **Content**: Claude drafts copy from the brief; Shaye supplies photos and Google Maps lists.
- **AI Q&A**: v3. Needs an edge function so the API key is never in browser code.

## Facts verified (Aug 2026)
| Claim in brief | Verdict |
|---|---|
| 10.55% sales tax | Correct. Varies 10.3–10.55% by exact address. |
| Sugar tax on sweetened bevs | Correct — $0.0175/oz; $0.01/oz reduced rate for certified manufacturers. |
| Teriyaki invented here | **Needs correcting.** Teriyaki is centuries old in Japan. *Seattle-style* teriyaki was popularized by Toshihiro Kasahara, Toshi's Teriyaki, 372 Roy St, Lower Queen Anne, opened 2 March 1976. Better story anyway — used the accurate version. |
| More dogs than children | Correct. ~150k–180k dogs vs ~107k children; true since the late 1990s. |
| Rain myth | Correct and stronger than stated. Seattle ~38"/yr vs NYC ~43", Boston ~44". Ranks ~44th of major US cities. But ~200 cloudy days/yr — that's the real story. |
| 3 national parks | Correct: Mount Rainier, Olympic, North Cascades. |
| Active volcanoes | Correct: Rainier, Baker, Glacier Peak, Adams, St. Helens. |
| Thomas "Danbo" sculptures | Spelling: **Thomas Dambo**. Six trolls, *Northwest Trolls: Way of the Bird King*. Locations listed in `09-quirks.md`. |
| Bruce Lee's graveyard | Correct — Lake View Cemetery, Capitol Hill, alongside Brandon Lee. |
| Sports teams | Seahawks, Sounders, Reign (Lumen Field); Kraken, Storm (Climate Pledge); Mariners (T-Mobile Park). No NBA team. |

## Time-sensitive — recheck before launch
- **Light rail**: 1 Line reaches Federal Way (opened Dec 2025). 2 Line crosses Lake Washington via I-90 as of 28 March 2026. Verify current line configuration before publishing `03-getting-around.md`.
- **Trolls move.** Frankie Feetsplinter's Nordic Museum posting was stated as running through September 2026. Link to nwtrolls.org rather than hard-coding permanence.
- **Lumen Field** hosted 2026 FIFA World Cup matches — check whether venue/schedule notes need updating.

## Still to write
- Third places — the brief says "list them" and this deserves its own section.
- Influencers to follow (food, lifestyle, hikes, real estate, Infatuation Seattle) — Shaye to supply the list.
- Movies filmed here — not yet researched.
- Local/state info sites — not yet researched.
- Photos everywhere.

## Open questions for Shaye
1. Where is seattlerec.com registered? Needed for the DNS step at deploy time.
2. Voice check on the drafts — too blunt, not blunt enough, or right?
3. Do you want the neighborhoods as their own scroll section in v1, or held for the v2 deck?

## Lists board (30 Aug 2026)

`/lists` is a board of tiles, one per saved list; each tile opens
`/lists/<slug>` — a Leaflet map beside the places, cross-linked both ways.
Currently two lists, **Been there** (23) and **Want to go** (13), built from
Shaye's real Takeout export.

### PRIVACY — read this before touching the export

The Takeout folders sitting in the project root contain raw personal data. In
particular `Maps/My labeled places/Labeled places.json` holds the **home
address** and a friend's home address. This repo is public and deploys to
Vercel on push.

`takeout-*/`, `Takeout/` and `data/takeout/` are all in `.gitignore`. Do not
remove those lines, and do not `git add -f` anything under them. Nothing in
"My labeled places" is read by any importer, on purpose.

### What the export actually contained

Takeout was run with **Maps** and **Maps (your places)** ticked, but not
**Saved** — and *Saved* is the separate top-level product that holds the named
lists (Favorites, Want to go, Starred places, and any custom lists). So the
named lists are not in this export. What is:

| File | Contents |
|---|---|
| `Maps (your places)/Saved Places.json` | 30 bookmarked places, one flat pile, real coordinates |
| `Maps (your places)/Reviews.json` | 41 reviews with star ratings, review text and the meal-type/price questionnaire |
| `Maps/My labeled places/Labeled places.json` | Home + a friend's home. **Never published.** |

**To get the real named lists**: re-run Takeout, deselect all, tick **Saved**
(not "Maps"), export, and drop the CSVs from `Takeout/Saved/` into
`data/takeout/`. Then `npm run import:lists`. They will appear as extra tiles
alongside the two derived ones.

### The two importers

`npm run import:lists` runs both, in this order:

1. **`tools/import-lists.mjs`** — the CSVs in `data/takeout/`, one list per
   file. Pulls lat/lng out of the Maps URL where Google embedded it
   (`!3d!4d`, `@`, `ll=`) and geocodes the rest against Nominatim at 1 req/sec,
   cached in `data/geocode-cache.json`. Places a name search cannot find go in
   `data/geocode-aliases.json` as `"Name": "street address, Seattle, WA"`.
   Currently a no-op — there are no CSVs yet.
2. **`tools/import-takeout.mjs`** — the two GeoJSON files above. Finds any
   `Maps (your places)` folder under the project, so the export can be unzipped
   anywhere. Both files carry real coordinates, so nothing gets geocoded.

Neither GeoJSON file records list membership, so the second importer derives
two lists from the shape of the data: reviewed → **Been there**, saved but
never reviewed → **Want to go**.

### What gets filtered, and why

Three filters run before anything is written, because a raw Maps history is not
a publishable document. Everything dropped is printed by name at the end of the
run — nothing disappears silently.

- **Region** — greater Seattle only (lat 47.0–48.3, lng −122.9 to −121.5). Drops
  the Boston, LA, Chennai, Frisco and Big Sur saves.
- **Personal** — apartments, dental, clinics, Verizon, Ulta, supermarkets,
  malls, and any place whose name is a bare street number. This is what caught
  the 2024 apartment hunt (Greenlake Terrace, Vue on Harvard, 700 Broadway).
- **Rating** — 1★ and 2★ reviews are withheld. They name small businesses and
  accuse staff, which is a different act on your own site than on a Google
  profile. Four reviews are held back by this: Qamaria, SabbVerr Thai, Subway,
  Coffee Tree.

Override any of it in `data/list-rules.json` — `alwaysInclude` beats every
filter, including region and rating.

### Map

Leaflet 1.9, bundled locally, no CDN. **OpenStreetMap's own tiles** — no API
key, no account, no billing. CARTO's basemaps went key-only (they now serve
tiles watermarked "API KEY REQUIRED"), which is why the first version had to be
swapped out. There is no dark variant of the standard OSM tiles, so dark mode
inverts and hue-rotates the tile pane; markers and popups sit above the filter
and keep their real colours.

If traffic ever outgrows OSM's tile policy, Protomaps (self-hosted `.pmtiles`
in `public/`) or Stadia (free tier, domain-locked key) are the upgrades.

Markers are `L.divIcon`, so they inherit the site palette and sidestep
Leaflet's bundled-image-path problem. The review questionnaire — star rating,
meal type, price band — renders as the tag row under each place.

### Open / next
- Re-export with **Saved** ticked to get the real named lists.
- Voice check on `04-the-freeze.md` and `06-rules.md` — still unanswered.
- Photos: `Maps/Photos and videos/` in the export has ~90 of Shaye's own place
  photos with sidecar JSON. Not wired up. The `cover` field exists on both the
  list and place schemas, unused.
- Decide whether the board is the front door or stays behind the guide.
- Filter or search across lists once there are more than ~8.

## Landing hero (30 Aug 2026)

Full-bleed image hero: the view west from Seattle at golden hour — Puget Sound,
a Washington State ferry, Bainbridge as a dark treeline, the Olympics behind.
Text sits on the image over a two-axis scrim (bottom-up and left-in), so the
type colours in `.hero-photo` are pinned light rather than themed. A photo is
dark at the bottom in either mode.

**To use a real photo**: drop it at `public/hero.jpg` (`.webp`, `.jpeg` and
`.png` also work — first match wins, webp first). `src/pages/index.astro`
checks for the file at build time and swaps automatically. No code change.
Wants to be at least 2000px wide, landscape, with the horizon roughly a third
up from the bottom, and quiet space on the right where the ferry currently sits.

Until then `src/components/HeroScene.astro` draws the scene: layered ridgelines
with atmospheric haze, a blurred sun-glitter column, water bands that widen as
they approach, and the ferry near the horizon on the right, clear of the
headline column. Every colour is a `--sc-*` custom property, so the scene goes
from golden hour to dusk with the page theme.

`preserveAspectRatio="xMaxYMid slice"` pins the right edge. On desktop the
width already matches so it changes nothing; on a phone the horizontal crop
keeps the sun and the ferry instead of throwing them away.

**Note on reviewing this in Chrome**: Shaye's Chrome has *Auto Dark Mode for
Web Contents* enabled (`chrome://flags/#enable-force-dark`), which force-darkens
the scene at paint time — the warm colours will not look warm in screenshots.
`prefers-color-scheme` reports light and `--sc-glitter` resolves to `#ffcf94`,
so the palette is fine; the browser is lying about it.
