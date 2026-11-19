// The wing link: an address a pilot sends to a friend. Whoever opens it is in the game beside him in a few seconds:
// a new pilot is asked only for a callsign (he flies for the same side, with a look made for him, the first sortie left
// for later), an old one of that side goes to where he is; and once the two are in one room the newcomer is put flying
// on his wing and into his squad. A browser tab with no install and no account is this game's one unfair advantage,
// and this is how it is used. (James, 2026-11-19: "Do 3": one link, straight into my wing.)
//
// The link says who made it (the start of his key: enough to know him by among the pilots of a room), where he was
// (a world or a system's space: the newcomer goes there, unless the relays say he has moved on since), his side and his
// callsign (to say whose wing it is before he has been heard from). Nothing in it is secret, and nothing in it is trusted
// for more than where to go and whom to look for.

import type { FactionId } from '../save/pilot'

export interface Wing {
  /** the first WING_KEY letters of the key of the pilot who made it */
  key: string
  /** the zone he was in ('w12', 's3') */
  zone: string
  side: FactionId
  callsign: string
}

/** letters of a pilot's key (hex) a link carries */
export const WING_KEY = 16

const SIDES: Record<string, FactionId> = { c: 'nomarchy', d: 'anarchoi' }

/** a wing as the address has it: 'ab12cd34ef567890.w3.c.ACE' */
export function wingText(w: Wing) {
  return `${w.key.slice(0, WING_KEY)}.${w.zone}.${w.side === 'nomarchy' ? 'c' : 'd'}.${w.callsign}`
}

/** a wing read from an address (null: none there, or not one) */
export function readWing(raw: string | null | undefined): Wing | null {
  if (!raw) return null
  const m = /^([0-9a-f]{16})\.([ws]\d{1,3})\.([cd])\.([A-Z0-9-]{3,12})$/.exec(raw.trim())
  return m ? { key: m[1], zone: m[2], side: SIDES[m[3]], callsign: m[4] } : null
}

/** true for the key of the pilot a wing is of */
export const isWingOf = (w: Wing, key: string) => key.toLowerCase().startsWith(w.key)

/**
 * The link to send: the page's own address with the wing in it. What says how this game goes online stays (the same
 * relays, the same private room, other tabs only: a friend must meet him where he is); what is this pilot's own goes
 * (which pilot of this browser he is, the world the address asked for, and the tools' switches).
 */
export function wingLink(href: string, w: Wing) {
  const url = new URL(href)
  const kept = new URLSearchParams()
  for (const k of ['net', 'room', 'relays']) {
    const v = url.searchParams.get(k)
    if (v) kept.set(k, v)
  }
  kept.set('wing', wingText(w))
  url.search = kept.toString()
  url.hash = ''
  return url.toString()
}

/** the address without its wing, for the page to show once it has been used (a reload is then not another arrival) */
export function withoutWing(href: string) {
  const url = new URL(href)
  url.searchParams.delete('wing')
  return url.toString()
}
