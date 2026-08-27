import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// The guide itself: one Markdown file per section, ordered by `order`.
const sections = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sections' }),
  schema: z.object({
    title: z.string(),
    kicker: z.string(),
    order: z.number(),
    summary: z.string(),
  }),
});

// Neighborhood entries. The same shape will feed the v2 swipe deck, so the
// fields are deliberately structured rather than free prose.
const neighborhoods = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/neighborhoods' }),
  schema: z.object({
    name: z.string(),
    vibe: z.array(z.string()),
    oneLine: z.string(),
    transit: z.string(),
  }),
});

export const collections = { sections, neighborhoods };
