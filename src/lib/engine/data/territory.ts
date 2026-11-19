// The numbers the persistent world runs on (the plan's sections 5, 8, 12, 13 and 14): how much
// influence each deed is worth, how long it counts, how much one pilot can add to one world in a
// day, the underdog's pace, how long each trace lasts, the day's hotspots and tasks, bounties and
// ranks. Change them here, never in the rules (galaxy/territory.ts, galaxy/daily.ts).

const DAY = 86_400

/** influence: what each deed is worth (before the underdog's pace), and how long it counts */
export const INFLUENCE = {
  /** a flag planted at a world's capture site */
  flag: 30,
  /** resources delivered to a base on the world (banked there): points a unit, and the most one delivery is worth */
  perUnit: 0.25,
  deliverMost: 20,
  /** a rival pilot downed on or over the world, and one of the computer's raiders */
  pilotKill: 10,
  raiderKill: 2,
  /** seconds a deed counts for: a week, so territory must be kept and a quiet side fades */
  lasts: 7 * DAY,
  /** the most points one pilot adds to one world in one UTC day (before the underdog's pace) */
  dailyMost: 60,
  /** the least influence that holds a world: below it, it is nobody's */
  holdLeast: 20,
  /** a side's standing influence on the worlds of its own home system (its capital world is always its own) */
  homeBase: 40,
  /** the side holding fewer worlds earns this much more a world it is behind, up to `underdogMost` more */
  underdogStep: 0.1,
  underdogMost: 1,
  /** seconds an event may claim to be ahead of the clock (clocks are minutes apart): later than that it is rejected */
  future: 10 * 60,
}

/** how long each trace stays on a world, in seconds (the plan's section 13; a discovery name is for good) */
export const TRACE_LIFE: Record<string, number> = {
  flag: 7 * DAY,
  wreck: 3 * DAY,
  grave: 3 * DAY,
  beacon: 14 * DAY,
  ghost: 14 * DAY,
}

/** a wreck: what is left of a ship lost there, and what a pilot who finds it takes from it (once each) */
export const WRECK = {
  /** units of salvage in it */
  salvage: 6,
  /** px across (and up) from it within which Use strips it, on foot or landed or low */
  reach: 40,
}

/** the capture site: px from the mast within which a pilot on foot plants a flag, and seconds Use is held to plant one */
export const CAPTURE = {
  reach: 26,
  plantTime: 2.5,
  /** px from the mast the flags stand in their ring */
  ring: 14,
}

/** a beacon is read by a pilot this near it (px across), on foot or flying low */
export const BEACON_READ = { reach: 70, height: 140 }

/** ghosts: samples a second, the longest flight recorded, and seconds between one run and the next */
export const GHOST = { rate: 5, longest: 24, rest: 8, most: 6 }

/** the day's hotspots: how many worlds, and how much richer their ore is (stock, and the laser's pace) */
export const HOTSPOT = { count: 3, stock: 2.5, pace: 1.4 }

/** bounties: kills in a row without being downed before a pilot has a price, and credits a kill in the streak */
export const BOUNTY = { from: 3, perKill: 40 }

/** a pilot's rank by his contribution to his side (influence points): the steps' thresholds (badges and titles only, never power) */
export const RANK_POINTS = [0, 40, 150, 400, 1000, 2500]

/** credits for choosing the side with fewer pilots online */
export const JOINING_BONUS = 250

/** what a beacon can say: preset phrases only, never free text (the plan's section 13), so it cannot be used for abuse */
export const BEACON_PHRASES = [
  'SAFE LANDING HERE',
  'ORE NEARBY',
  'RAIDERS ABOUT',
  'ENEMY BASE AHEAD',
  'WRECK BELOW',
  'REGROUP HERE',
  'HOLD THIS WORLD',
  'WATCH THE SKY',
  'GOOD HUNTING',
  'HELP NEEDED',
  'TAKE IT BACK',
  'FLY SAFE',
]

/** the quick-chat wheel: eight phrases, round from the top */
export const QUICK_CHAT = ['HELLO', 'ON MY WAY', 'FOLLOW ME', 'HELP!', 'ENEMY HERE', 'NICE SHOT', 'THANKS', 'GOOD FIGHT']
