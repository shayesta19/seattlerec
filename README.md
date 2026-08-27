# seattlerec.com

An intro to Seattle as a city — orientation, quirks, and the things nobody tells
a first-time visitor. Later: curated place recommendations you can swipe through.

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
| `src/content.config.ts` | Collection schemas — frontmatter is validated at build time. |
| `src/pages/index.astro` | The single page. Pulls both collections and renders them. |
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

See `NOTES.md` for decisions, verified facts, and open questions.
