// Rooms: one for each zone of the game (each world of the galaxy), named so that only
// compatible builds ever meet. A room holds about a dozen pilots, since every peer connects to
// every other; a pilot turned away by a full room tries the next copy of the zone.

import { GALAXY_VERSION } from '../engine'

/** the version of the game's world and rules: builds with different ones play different games */
export const GAME_VERSION = 1
/**
 * the version of what goes over the wire (codec.ts, session.ts); 6: space at its true size (the polish pass: where
 * everything is in a system changed); 7: a ship's rooms rebuilt larger with their fit-out, and a pilot on foot half the
 * size (the polish pass: where a piece of furniture stands, and where a pilot's middle is, mean other things); 8: furniture
 * built into the walls, facing the way it stands (pieces of other sizes, and the way each faces carried with it); 9: the
 * bodies go round thirty times faster and a world's globe is its whole ground (where everything is in a system, and
 * where over a world a place is, changed)
 */
export const PROTOCOL_VERSION = 9
/** the most pilots in a room before the next copy of the zone opens */
export const ROOM_CAP = 12
/** the most copies of a zone tried before giving up (the pilot then flies alone) */
export const COPIES_MOST = 8
/** the app id the transports introduce peers under */
export const APP_ID = 'xenophon.game'

/** the zone for the island world a seed and a share of land make (different worlds are different zones) */
export function islandZone(seed: number, land: number) {
  return `islands-${seed}-${Math.round(land * 100)}`
}

/** the zone for a world of the galaxy ('w12'), of this version of the galaxy */
export function worldZone(id: string) {
  return `galaxy${GALAXY_VERSION}-${id}`
}

/** the zone for the world a scene is over (its worldKey: a galaxy world's id, or the island world a seed and land make) */
export function zoneOf(worldKey: string) {
  return worldKey.startsWith('islands-') ? worldKey : worldZone(worldKey)
}

/** a room's full name: the game's and the wire's versions, the zone, and which copy of it */
export function roomName(zone: string, copy: number, test = '') {
  return `g${GAME_VERSION}/p${PROTOCOL_VERSION}/${zone}/${copy}${test ? '/' + test : ''}`
}
