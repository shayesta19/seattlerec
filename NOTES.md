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

## Lists board (added 29 Aug 2026)

`/lists` is a board of tiles, one per saved Google Maps list; each tile opens
`/lists/<slug>` — a Leaflet map beside the places, cross-linked both ways.

### How the data gets in
Google has **no public API for personal saved lists**. The only reliable route
is Takeout:

1. takeout.google.com → Deselect all → tick **Saved** → export → unzip
2. Copy the CSVs out of `Takeout/Saved/` into `data/takeout/`
3. `npm run import:lists` (`--dry-run` variant available)

Takeout gives Title / Note / URL and **no coordinates**. The importer pulls
lat/lng straight out of the Maps URL where Google embedded it (`!3d!4d`, `@`,
`ll=`) and geocodes the rest against Nominatim — 1 req/sec per their policy,
cached in `data/geocode-cache.json` so re-runs are free.

- Places a name search can't find go in `data/geocode-aliases.json` as
  `"Place name": "street address, Seattle, WA"`. The importer names them.
- Curation survives re-import: `name`, `blurb`, `emoji`, `order`, `cover`,
  `hidden` on a list, and `blurb`, `cover`, `tags` on a place.
- The zod schema in `src/content.config.ts` **requires** lat/lng, so a place
  without coordinates fails the build instead of shipping a hole in the map.

### Current state
The four lists in `src/data/lists/` are **sample data** (`"sample": true`),
generated from hand-written CSVs in `data/takeout/` so the board is real to
click through. They render a "sample data" badge. Re-importing a real list with
the same slug clears the flag automatically; otherwise delete the JSON.

### Map
Leaflet 1.9 bundled locally (no CDN), CARTO `light_all` / `dark_all` basemaps
picked from `prefers-color-scheme` and swapped live. No API key, no billing.
CARTO's free tier is fine at this volume — if traffic grows, move to a MapTiler
or Protomaps key. Markers are `L.divIcon`, so they inherit the site palette and
sidestep Leaflet's bundled-image-path problem.

### Open / next
- Replace the sample lists with the real Takeout export.
- Decide whether the board is the front door or stays behind the guide.
- Photos per place (`cover` field is already in the schema, unused).
- Filter or search across all lists once there are more than ~8.
