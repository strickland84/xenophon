// Which build this is, for the menu, and what tells it a newer one is about: the release and commit
// it was built from (SvelteKit's version name, set in vite.config.ts), the versions of the world and
// the wire it plays (net/rooms.ts: builds of different ones never meet in a room), and the galaxy's.
//
// An old build finds out it is old two ways: the site has a newer one (SvelteKit looks now and then,
// and when the tab comes back into view: `updated` in $app/state), or a pilot's presence on the relays
// says he flies a newer wire (net/chronicle.ts `newerProtocol`). Either way the page says so plainly
// and offers to reload (UpdateBanner.svelte).

import { version } from '$app/env'
import { GALAXY_VERSION } from './engine'
import { GAME_VERSION, PROTOCOL_VERSION } from './net/rooms'

/** the build, in words: release, commit, and the versions it plays */
export const BUILD = {
  name: version,
  game: GAME_VERSION,
  protocol: PROTOCOL_VERSION,
  galaxy: GALAXY_VERSION,
}

export const buildLine = () => `Version ${BUILD.name} · world ${BUILD.game} · wire ${BUILD.protocol} · galaxy ${BUILD.galaxy}`

/** where the game's code lives: it is open source, and the menu and Settings link to it */
export const SOURCE = 'https://github.com/strickland84/xenophon'
