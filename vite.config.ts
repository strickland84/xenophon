import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// the build's name: the release and the commit it was built from (shown in the menu; a page that
// finds a newer one on the site offers to reload: lib/components/UpdateBanner.svelte)
const release = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
let commit = 'local'
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
} catch {
  // (not a git checkout)
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
      },
      adapter: adapter(),
      // (looked for every ten minutes, and whenever the tab comes back into view)
      version: { name: `${release}+${commit}`, pollInterval: 10 * 60_000 },
    }),
  ],
  test: {
    expect: { requireAssertions: true },
    // the renderer's tests fly whole scripted flights
    testTimeout: 60_000,
    projects: [
      {
        extends: './vite.config.ts',
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{js,ts}'],
          // (the worlds the flights fly over are built once and kept: testing/surfaces.ts)
          setupFiles: ['src/lib/engine/testing/surfaces.ts'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
        },
      },
    ],
  },
})
