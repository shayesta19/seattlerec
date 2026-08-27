// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://seattlerec.com',
  // Static output: Vercel serves dist/ directly, no adapter needed.
  output: 'static',
});
