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

## The picker and the translator (30 Aug 2026)

The product goal, in Shaye's words: someone new to the city should *instantly*
know how to navigate it. The story behind it — moving from Boston, missing the
Charles, not knowing for months that Lake Union and Green Lake were the answer —
is the whole brief. Two features come out of it.

### 1. "What are you after?"
Sits directly under the hero, above the contents. Five curated lists, one click
to a map and a shortlist. No account, no quiz, no chat box to compose a question
into. The fastest possible path from arriving to having an answer.

### 2. "Coming from somewhere else"
The translator. Familiar thing → the Seattle version, with a line on how it
differs. Boston, New York, San Francisco, Chicago, LA. Data in
`src/data/from-elsewhere.json`; add a city by adding an object.

This is the differentiator. Every city guide lists parks. None of them tell a
transplant *which* park is their park.

### Why there is now a curated layer

The personal lists cannot answer these questions. Of the 36 places in the
Takeout export, **33 are food and drink** — two parks and a park cafe is the
entire outdoors coverage. No trails, no viewpoints, no water.

So `data/curated/*.csv` was added, running through the same importer:

| | `data/takeout/` | `data/curated/` |
|---|---|---|
| Source | Google export | Hand-written |
| Flag | `curated: false` | `curated: true` |
| Promise | where someone went | the answer to a question |

Both geocode through Nominatim and land in `src/data/lists/`. The CSVs take
optional `Lat`, `Lng` and `Kind` columns — `Kind` is semicolon-separated
(`water;run`) and lands in `place.kinds`, ready for cross-list filtering later.

The board at `/lists` groups them: **Start here** (curated) and **From my own
maps** (personal). Keeping them visibly separate matters — one is an
endorsement, the other is a record, and they should not be read as the same
kind of claim.

### Next on this thread
- `kinds` is populated but nothing filters on it yet. A `/lists?kind=water`
  view, or chips on the board, is the obvious follow-on.
- Free-text search over all 76 places is probably worth more than an AI chat
  box, and costs nothing to run.
- If AI Q&A does get built, it should sit *on top of* this data, not replace
  the picker. The picker answers in one click; a chat box asks the user to
  compose a sentence first.

## Built for 36 lists / 500+ places (30 Aug 2026)

Shaye has **36 lists and 500+ saved places** in Google Maps. None of them are
in the export supplied on 29 Aug — that export had `Saved Places.json`, which
is the flat pile of loose bookmarks (30 of them), not the named lists.

**The named lists need a second Takeout run with the `Saved` product ticked.**
See the "What the export actually contained" section above.

### What was tested

Before the real data arrives, the UI was run against a synthetic stand-in of
36 lists / 672 places. Two things broke:

1. **The board was 6.8 screens of scrolling.** 43 tall tiles in one grid.
2. **No way to find anything.** No search, so a place buried in list 27 was
   effectively lost.

### What was added

- **Search across every place in every list**, at `/lists`. Build-time index
  inlined as JSON; client-side filter, no dependencies, no network. Measured at
  **5.2 ms over 672 places**, and the index was 51.7 KB at that size (so roughly
  40 KB at Shaye's real 500). Matches place names, list names and `kinds`,
  highlights the matched run, and links straight to the anchored place on its
  list page. Deep-linkable as `/lists/?q=ramen`.
- **Compact board group.** Past eight lists the personal group drops to a dense
  card grid — emoji, name, count, constellation, nothing else. Page height went
  from 5253 px to 3020 px at 43 lists, 6.8 screens to 3.6.

### Still open at scale
- The picker on the home page points at the five curated lists. Once 36 real
  lists land, decide whether it should surface those instead — their names
  ("Hikes", "Happy hour") are already intent-shaped.
- `kinds` is only populated on curated CSVs. Takeout CSVs have no such column,
  so 500 imported places will arrive untagged. Either tag them by hand in a
  rules file, or let list membership stand in for a tag.
- Geocoding 500 places: most Takeout URLs carry coordinates inline and cost
  nothing. Any that fall through to Nominatim run at 1.1 s each, so a worst
  case is ~9 minutes. The cache makes re-runs free.

## The real list names, and what they tell us (30 Aug 2026)

Shaye's 32 named lists:

> pizza · activities and attractions · unique food · restaurants · brunch ·
> waterfront restaurants · cocktails/bars · hikes and trails · restaurants open
> late night · boba · asian restaurants · indian restaurants · dessert · cafes ·
> cakes · cabins · bakery · matcha · halal food · favorites · fried chicken ·
> sandwich shops · buffets · ice cream · parks · clubs · bellevue · places to
> buy gifts · salons · food trucks · bagels · starred places

### The finding that shaped the build

**23 of 32 (72%) are food and drink.** Four are outdoors. Five are neither.

And four things have no list at all: **water, urban running loops, viewpoints,
and third places.** Those are exactly the four curated lists — and exactly what
Shaye described missing on arriving from Boston.

That is not an oversight, it is how saving works. You bookmark a restaurant
because you read about it. You do not bookmark "a river to sit by after work";
you just feel its absence. The curated layer is not filling a gap in the data,
it is filling the gap that made the first months hard, which is the whole
premise of the site.

### The lists overlap on purpose

They are cut on at least four different axes at once:

| Axis | Examples |
|---|---|
| Cuisine | asian, indian, halal |
| Dish | pizza, boba, matcha, bagels, fried chicken, ice cream |
| Occasion | brunch, late night, clubs, cocktails |
| Geography | bellevue, waterfront restaurants |

So one restaurant can legitimately sit in three lists. Two consequences, both
handled:

- **The board groups by axis**, not alphabetically — see `data/list-groups.json`.
  Ordered rules, first match wins, `*` for substring. Anything unmatched falls
  into the last group, so a new list always lands somewhere. Verified against
  all 32 real names: Eat 14, Coffee/sweets/drink 9, Outside 4, Errands 3,
  catch-all 4, plus the 5 curated.
- **Search dedupes** by name + position rounded to 3 decimals. Without it,
  searching "pho" returns the same restaurant three times. The result shows the
  primary list and a `+2` for the others, and prefers a curated list as the
  destination when the place is in one.

### Decisions this settles
- The picker keeps pointing at the curated five. Shaye's lists are mostly
  cuisine and dish categories, which answer "what do I want to eat", not "what
  do I do this evening". Both are useful; they are different questions.
- `kinds` stays curated-only. List membership is the tag for imported places —
  "boba" is a better tag than anything a classifier would infer.

### Still to do when the export lands
- `favorites` and `starred places` are Google's defaults and probably overlap
  everything else heavily. Watch what dedup does to them; they may be worth
  hiding (`"hidden": true`) rather than shown as lists.
- `bellevue` is a geography list in a Seattle guide. Decide whether the site
  covers the Eastside or points at it.
- `salons` and `places to buy gifts` may not belong on a public city guide at
  all. Currently grouped into "Errands and elsewhere", low on the page.

## List decisions from Shaye (30 Aug 2026)

Answers to the three open questions, now encoded in `data/list-overrides.json`
rather than hand-edited into the generated JSON — so they survive re-import:

| List | Decision | How |
|---|---|---|
| `salons` | Skip for now | `"hidden": true` |
| `places to buy gifts` | Skip for now | `"hidden": true` |
| `bellevue` | Keep. Shaye will break it up by category later. | Own board group, "Across the lake", with a blurb saying so |
| `favorites` | Keep, renamed | **The short list** — "The ones that get recommended without hesitating first." |
| `starred places` | Keep, renamed | **Starred and never sorted** — "Years of one-tap saves that never got filed anywhere." |

Hidden lists are dropped by `getStaticPaths`, so they get no page built at all,
not just hidden from the board. Verified.

### Why overrides are a file and not an edit

`src/data/lists/*.json` is **generated**. The importers already carry forward
hand-written per-place blurbs, but list-level metadata — the name, whether it
appears — is exactly the kind of thing that quietly reverts three imports later
if it lives in two places.

So `data/list-overrides.json` is the single source of truth for list `name`,
`emoji`, `order`, `blurb`, `cover` and `hidden`, keyed by the slugified source
list name (i.e. the Takeout CSV filename). It is applied **after** the
carry-forward merge, so it always wins. Both importers share
`tools/lib/overrides.mjs`, and each run prints what it changed:

```
- favorites (1 rows)
    renamed to "The short list", emoji, order, blurb
- salons (1 rows)
    hidden
```

Nothing gets renamed silently.

### Board groups now
`Start here` (curated) · `Eat` · `Coffee, sweets and a drink` · `Outside` ·
`Across the lake` · `From my own maps` (catch-all, holds the two renamed
defaults plus been-there / want-to-go).

## The landing photo

A supplied image of the Olympics at sunset across Puget Sound, two Washington
State ferries in the channel. It replaces `HeroScene.astro`, which stays in the
tree as the fallback: delete `public/hero/` and the drawn scene comes back.

### It does not ship as supplied
2.7 MB, 2686 x 1568. As the LCP element on the front page that is the whole
first impression spent on one file. `npm run hero` writes AVIF and WebP at
1280/1920/2560 plus a JPEG fallback; the 1920 AVIF a laptop actually fetches is
**87 KB**, a 31x reduction, and the sky holds together because AVIF does not
band on long gradients the way JPEG does at any quality worth shipping.

The manifest carries a 24px copy of the photo inlined as a data URI. The hero
paints that as a background first, so the page opens on the picture's own
colours instead of a flat block.

### The contrast problem, and why the screenshot lied
White type sits directly on the photo, so contrast is a property of the pixels.
The eyebrow -- 12px, uppercase, high in the frame -- landed on lit snow at
**2.48:1**. It needs 4.5:1.

It looked fine on screen. It looked fine because this machine has Chrome's
"Auto Dark Mode for Web Contents" on, which darkens every screenshot of a light
page and flatters every contrast check made by eye. The page reported
`prefers-color-scheme: false` and `bodyBg: rgb(247, 246, 242)` while the capture
came back dark. Measuring, not looking, is the only way to settle this.

Raising the type's opacity could not fix it: against that sky, even pure white
tops out at 3.44:1.

### Why an ellipse and not a darker scrim
Deepening the linear scrim would have worked and would have cost the alpenglow,
which is the reason to run this photograph at all. Instead there is a soft
elliptical scrim over the text column only -- `radial-gradient(70% 45% at 34%
40%, ...)`. Measured, it carries the eyebrow to 4.98:1 and the headline to
5.53:1 while leaving the right-hand peaks and both ferries untouched. It is
invisible as a shape; there is no band or edge.

Checked at 1920x800 and at 414x699, where the crop is completely different.
Both pass with margin.

### Keeping it honest
`tools/hero-contrast.mjs` re-runs that measurement and exits non-zero on a
failure, so swapping in a brighter photo is a caught error rather than
something nobody notices. Its gradients are transcribed from `global.css`, not
imported -- if the scrim changes, that file has to change with it.

## The favicon

The Space Needle, white with a Galaxy Gold top house. That is the 1962
World's Fair scheme -- Astronaut White on the legs, Galaxy Gold on the top
house -- and gold is where the halo went back to for the 50th in 2012. A
Needle that is orange all the way down is not one anybody has seen.

### Drawing it took six passes, and five of them looked like a person
A symmetrical form with a wide horizontal element partway up and two splayed
supports below it reads as a human figure with its arms out. Every early
attempt hit this. Two things fixed it:

- **Vertical proportion.** The real observation deck sits at 86% of the
  tower's height. Drawn at the halfway mark it is exactly where a head and
  shoulders sit. Pushed up, with a long waist below, it stops being a person.
- **The saucer is an ellipse, not a bar.** A flat plank with pointed ends is
  a pair of arms. A disc with curvature and a concave underside flowing into
  the shaft is a top house.

Strict realism does not survive the format: the base spans only a fifth of
the real tower's height, which at 16px is a vertical line with a speck on
top. The proportions here are stylised. What had to stay true was their
*order* -- saucer high, long waist, narrow feet.

### One definition, five framings
`tools/icons.mjs` holds the artwork and emits everything. The set needs three
different croppings that have to agree: a rounded badge for browsers, square
corners for iOS (which applies its own mask -- rounding it here rounds it
twice), and the maskable icon inset into the 80% safe zone or Android crops
the spire and the feet off. The tool checks nothing by itself, but the
artwork existing once means the five files cannot drift apart.

Measured on the badge: gold 7.0:1, white 14.1:1. The `.ico` is a directory of
real PNGs at 16/32/48, verified by parsing it back out.

### Chrome inverted it, again
Displayed as an `<img>`, the SVG came back pale mint while the PNGs stayed
dark green -- auto dark mode treats vector graphics as content and photos as
photos. Reading the decoded pixels through a canvas gave `rgb(16,36,29)` for
both, i.e. the file is fine. Tab favicons are drawn by browser UI rather than
the page renderer, so this never reaches the tab strip.
