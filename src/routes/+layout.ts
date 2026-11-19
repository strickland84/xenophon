// The game runs entirely in the browser (a canvas, the keyboard, a game controller), so
// there is nothing to render on a server: the site is built as static files.
import { browser, dev } from '$app/env'
import { inject } from '@vercel/analytics'

export const prerender = true
export const ssr = false

// Vercel's page counts for xenophon.me, which Vercel serves; in development they are only logged. (The package's own
// SvelteKit helper reads $app/environment and $app/stores, which SvelteKit 3 has as $app/env and $app/state: its plain
// inject does the same for a site of one page.)
if (browser) inject({ mode: dev ? 'development' : 'production' })
