// What each hull is like to fly and to fight in: the numbers behind the roles in the plan
// (section 7). Speed and agility are shares of the scene's own settings (`speed`, `agility`),
// so the Corsair, the ship a new pilot flies, handles exactly as those settings say. Hull
// points and shield are absolute. These are starting values, to be tuned by playing.

export interface HullStats {
  /** what the hull is for */
  role: string
  /** top speed and turn rate, as shares of the scene's settings */
  speed: number
  agility: number
  /** damage it can take before it is lost */
  hull: number
  /** a small buffer in front of the hull, which recharges after a few seconds without being hit */
  shield: number
  /** guns: one cannon a mount, firing in turn */
  mounts: number
  /** missiles carried */
  missiles: number
  /** 0..1: how much of the radar's range it can hide from (1 shows at any range) */
  radar: number
  /** points for shooting one down, in a skirmish */
  score: number
}

export const HULL_STATS: Record<string, HullStats> = {
  dart: { role: 'Light fighter', speed: 1.05, agility: 1.15, hull: 80, shield: 30, mounts: 2, missiles: 2, radar: 1, score: 100 },
  sparrow: { role: 'Scout', speed: 1.2, agility: 1.1, hull: 60, shield: 25, mounts: 1, missiles: 2, radar: 1, score: 100 },
  lance: { role: 'Interceptor', speed: 1.25, agility: 1.2, hull: 60, shield: 30, mounts: 2, missiles: 4, radar: 1, score: 150 },
  corsair: { role: 'Raider', speed: 1, agility: 1, hull: 100, shield: 35, mounts: 2, missiles: 4, radar: 1, score: 150 },
  wraith: { role: 'Stealth', speed: 1.1, agility: 1.1, hull: 70, shield: 45, mounts: 2, missiles: 2, radar: 0.45, score: 200 },
  prospector: { role: 'Miner', speed: 0.8, agility: 0.8, hull: 130, shield: 35, mounts: 1, missiles: 0, radar: 1, score: 150 },
  mule: { role: 'Hauler', speed: 0.7, agility: 0.65, hull: 140, shield: 40, mounts: 1, missiles: 0, radar: 1, score: 150 },
  bastion: { role: 'Gunship', speed: 0.8, agility: 0.75, hull: 180, shield: 50, mounts: 4, missiles: 4, radar: 1, score: 300 },
  nomad: { role: 'Explorer', speed: 0.95, agility: 0.9, hull: 110, shield: 40, mounts: 2, missiles: 2, radar: 1, score: 150 },
  galleon: { role: 'Freighter', speed: 0.65, agility: 0.6, hull: 200, shield: 60, mounts: 2, missiles: 0, radar: 1, score: 250 },
}

/** the stats of the hull of that name (or the Corsair's, for a name not in the table) */
export const statsOf = (hull: string): HullStats => HULL_STATS[hull] ?? HULL_STATS.corsair

/** what a hull costs to buy (credits, and resources from the vault); the Corsair is every pilot's, free, for good */
export const HULL_PRICES: Record<
  string,
  { credits: number; needs: { id: 'ferrite' | 'silica' | 'cryo-ice' | 'magma-glass' | 'bioresin'; n: number }[] }
> = {
  // (polish step 9: cut by about a quarter, 600 to 3400 from 800 to 4200, so a second ship is a goal of the first hour: no
  // scripted player bought one in half an hour, parts always coming first; with the counter making up ore, data/shop.ts)
  corsair: { credits: 0, needs: [] },
  dart: { credits: 700, needs: [{ id: 'ferrite', n: 8 }] },
  sparrow: { credits: 600, needs: [{ id: 'silica', n: 6 }] },
  lance: { credits: 1800, needs: [{ id: 'cryo-ice', n: 10 }] },
  wraith: { credits: 2600, needs: [{ id: 'silica', n: 12 }] },
  prospector: { credits: 1200, needs: [{ id: 'ferrite', n: 16 }] },
  mule: { credits: 1400, needs: [{ id: 'ferrite', n: 20 }] },
  bastion: { credits: 3400, needs: [{ id: 'magma-glass', n: 12 }] },
  nomad: { credits: 1500, needs: [{ id: 'bioresin', n: 10 }] },
  galleon: { credits: 3000, needs: [{ id: 'ferrite', n: 30 }] },
}

/** what a hull gives that no part can, in a line (the shop's tooltip and the tips say it) */
export const HULL_PITCH: Record<string, string> = {
  corsair: 'every pilot’s first ship, and yours to keep for nothing',
  dart: 'small and twitchy, and replaced free when you lose it',
  sparrow: 'a scout’s ship: quick, cheap and thin-skinned',
  lance: 'the fastest ship either side flies, and it carries four missiles',
  wraith: 'radar misses it until it is nearly on top of you',
  prospector: 'a miner’s ship: cuts ore 60% faster and holds twice as much, with three module slots',
  mule: 'three times the hold and three module slots, and it turns like a barge',
  bastion: 'four guns and the heaviest armour in the shop',
  nomad: 'built to go a long way: a hold of six and two module slots',
  galleon: 'the biggest hold there is and three module slots, and in no hurry about anything',
}

/** the ship to work towards next, by how a pilot earns his living (the tips name it once his Corsair's slots are full) */
export const NEXT_SHIP: Record<'fight' | 'mine', string> = { fight: 'lance', mine: 'prospector' }

/**
 * Seconds a dive must be held hard against the safe height above the ground before the ship is let through below it (to
 * fly down a canyon, or into the ground: the `crash` setting). It was 0.4: a new pilot told by the first sortie to hold
 * the dive to come down low was in the trees or the sea a moment after the step was done, and told he had been shot
 * down. A second still lets a pilot who means it down, without a moment's wait for him to feel.
 */
export const CRASH_COMMIT = 1

/**
 * The throttle (after James's first flight, 2026-11-18: he wanted the engines' power his to set, down to a ship hanging
 * still). `rate`: how much of it a second the throttle keys move it, held (from nothing to full in a second and a half);
 * `notch`: how much one notch of a mouse's wheel moves it; `climb`: with the throttle low a ship still climbs and dives,
 * at least at this share of its cruising speed's rate.
 */
export const THROTTLE = { rate: 0.7, notch: 0.1, climb: 0.5 }

/**
 * The mouse as a stick, from behind and from the seat (Elite Dangerous's mouse: James, 2026-11-19, "mirror elite
 * dangerous"): how far the pointer is from the middle of its steering is how fast the ship turns, and in space how fast it
 * pitches. `reach`: the share of the frame's width from the middle that is the stick hard over; `dead`: the share of that
 * in the middle that does nothing. The HUD draws the dead zone as a ring and a line out to the pointer (`render/hud.ts`),
 * as Elite's mouse widget does, so a pilot sees why his ship turns.
 */
export const MOUSE_STICK = { reach: 0.26, dead: 0.06 }

/**
 * The vertical thrusters, as Elite's (James, 2026-11-19: "Ctrl to thrust down and alt to thrust up like vertically up and
 * down for the ship"): the ship moves square to its nose, which does not pitch. Over a world at `share` of the rate it
 * climbs; in space `space` px a second; taken up at `ease` a second. The lateral thrusters (Q and E: "thrust left and
 * right - sort of the inverse of ctrl and alt") slide it sideways as fast, its nose not turning.
 */
export const LIFT = { share: 0.6, space: 70, ease: 4 }

/**
 * The ship's power (James, 2026-11-18: "defaulted to powered off, and then when we switch power on they power up"). `up`:
 * seconds from the switch to everything alive (the screens one after another, the radar, the attitude ball, the bars, the
 * engines last); `down`: seconds for it all to go dark; `glow`: the share of the way up the engines light at (and on the
 * way down, go out at half of it); `told`: seconds a word on the HUD stays (WEAPONS SAFE, POWER LOCKED IN FLIGHT), and the
 * least between two of the same.
 */
export const POWER = { up: 2, down: 0.8, glow: 0.8, told: 1.4 }
