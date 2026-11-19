// What a pilot fits to his ship (the plan's sections 7 and 14): a weapon on each of its hull's
// mounts, and modules in its slots. Every weapon and module is a trade-off, never a straight
// upgrade: each says what it gives and what it costs. The rule (section 14, and tested in
// loadout.spec.ts): no fit moves any stat that decides a fight (speed, turn, thrusters, hull,
// shield, its recharge, firepower, heat) more than a quarter above the same hull bare. What only
// helps a pilot work (the hold, the tractor's reach, the laser's cutting, the scanner's range, the
// cruise drive) may move further, as it is always paid for in a fighting stat.
//
// A hull bare carries the cannon on every mount (drawn into its own picture), and its own rack of
// missiles; anything else shows on it, hung where it goes. Starting values, to tune by playing.

import type { ResourceId } from './resources'

export type WeaponId = 'cannon' | 'flak' | 'laser' | 'rack' | 'mines'

export interface Weapon {
  id: WeaponId
  name: string
  /** what it does, and what it costs, each in a line */
  blurb: string
  cost: string
  /** credits, and resources from the vault (the cannon comes with every hull) */
  price: number
  needs: { id: ResourceId; n: number }[]
  /** fired with the guns (Fire), or the secondary button (a mine is dropped when no missile is locked) */
  kind: 'gun' | 'missiles' | 'mines'
}

export const WEAPONS: Weapon[] = [
  {
    id: 'cannon',
    name: 'Cannon',
    blurb: 'Fast shots straight ahead, out to 330 px',
    cost: 'Builds heat',
    price: 0,
    needs: [],
    kind: 'gun',
  },
  {
    id: 'flak',
    name: 'Flak',
    blurb: 'A wide burst of pellets: hard to miss up close',
    cost: 'Reaches only 170 px; runs 40% hotter',
    price: 520,
    needs: [{ id: 'magma-glass', n: 4 }],
    kind: 'gun',
  },
  {
    id: 'laser',
    name: 'Mining laser',
    blurb: 'Cuts ore 60% faster; never heats',
    cost: 'A third of a cannon against ships, out to 150 px',
    price: 380,
    needs: [{ id: 'cryo-ice', n: 4 }],
    kind: 'gun',
  },
  {
    id: 'rack',
    name: 'Missile rack',
    blurb: 'Two more missiles',
    cost: 'Takes a gun off the mount',
    price: 450,
    needs: [{ id: 'magma-glass', n: 3 }],
    kind: 'missiles',
  },
  {
    id: 'mines',
    name: 'Mine layer',
    blurb: 'Drops mines behind (Missile, with nothing locked); one back each 18 s',
    cost: 'Takes a gun off the mount',
    price: 480,
    needs: [{ id: 'ferrite', n: 6 }],
    kind: 'mines',
  },
]

/** flak: a burst of pellets, each a short-lived shot (the cannon's rules otherwise) */
export const FLAK = {
  /** bursts a second from each mount, pellets a burst, how far they stray, their speed, life and damage */
  rate: 2.2,
  pellets: 5,
  spread: 0.07,
  speed: 400,
  life: 0.42,
  damage: 3.1,
  /** heat a second of its fire builds, as a share of what the cannon's builds */
  heat: 1.4,
}

/** the mining laser as a gun: quick weak pulses that never heat, and a faster cut of ore */
export const BEAM = {
  rate: 9,
  speed: 600,
  life: 0.25,
  damage: 1.3,
  /** how much faster each fitted one cuts ore */
  mine: 1.6,
}

/** a rack: missiles it adds */
export const RACK = { missiles: 2 }

/** mines: how many a layer holds, seconds for one to come back, and how one works */
export const MINES = {
  hold: 4,
  back: 18,
  /** seconds before it can burst, and how long it hangs there */
  arm: 0.7,
  life: 24,
  /** it bursts when an enemy comes this close, and harms everything within the blast */
  fuse: 16,
  blast: 24,
  damage: 48,
  /** seconds between drops, and how fast it falls back from the ship */
  reload: 0.5,
  anarchoi: 26,
}

export type ModuleId = 'afterburner' | 'shield-booster' | 'cargo-pod' | 'scanner' | 'tractor' | 'cruise-drive' | 'heat-sink' | 'armour'

/** where a module is hung on the hull (jet/fit.ts works out each place from the hull's shape) */
export type Place = 'back' | 'spine' | 'roots' | 'flanks' | 'outer' | 'tail' | 'nose' | 'chin'

/** what a fit does, as shares (1: no change) or additions (0) */
export interface FitEffect {
  /** top speed, turn, how much the thrusters add, hull points, shield, how fast the shield comes back */
  speed: number
  agility: number
  boost: number
  hull: number
  shield: number
  recharge: number
  /** how fast the guns cool, and how much heat firing builds */
  cool: number
  heat: number
  /** slots added to the hold, how far it scoops, how fast the laser cuts ore */
  slots: number
  reach: number
  mine: number
  /** the radar's range, and whether the ship shows on others' radar at any range (a scanner gives it away) */
  radar: number
  loud: boolean
  /** the cruise drive's pace, and the seconds it spools */
  cruise: number
  spool: number
  /** missiles added, mines held */
  missiles: number
  mines: number
}

export interface Module {
  id: ModuleId
  name: string
  blurb: string
  cost: string
  price: number
  needs: { id: ResourceId; n: number }[]
  place: Place
  does: Partial<FitEffect>
}

export const MODULES: Module[] = [
  {
    id: 'afterburner',
    name: 'Afterburner tank',
    blurb: 'The thrusters push 22% harder',
    cost: '10% less hull: a tank of helion to burn',
    price: 560,
    needs: [{ id: 'helion', n: 6 }],
    place: 'outer',
    does: { boost: 1.22, hull: 0.9 },
  },
  {
    id: 'shield-booster',
    name: 'Shield booster',
    blurb: 'A fifth more shield, back a quarter faster',
    cost: 'The guns heat 15% faster',
    price: 620,
    needs: [{ id: 'silica', n: 6 }],
    place: 'roots',
    does: { shield: 1.2, recharge: 1.25, heat: 1.15 },
  },
  {
    id: 'cargo-pod',
    name: 'Cargo pod',
    blurb: 'Two more slots in the hold',
    cost: '5% slower, 4% wider in turns',
    price: 600,
    needs: [{ id: 'ferrite', n: 10 }],
    place: 'back',
    does: { slots: 2, speed: 0.95, agility: 0.96 },
  },
  {
    id: 'scanner',
    name: 'Scanner',
    blurb: 'Radar reaches half as far again, and shows pilots on foot under trees',
    cost: '10% less shield; seen on radar at any range',
    price: 480,
    needs: [{ id: 'silica', n: 5 }],
    place: 'spine',
    does: { radar: 1.5, shield: 0.9, loud: true },
  },
  {
    id: 'tractor',
    name: 'Tractor',
    blurb: 'Scoops up ore and crates from twice as far',
    cost: '5% wider in turns: the field drags',
    price: 450,
    needs: [{ id: 'silica', n: 6 }],
    place: 'chin',
    does: { reach: 2, agility: 0.95 },
  },
  {
    id: 'cruise-drive',
    name: 'Cruise drive',
    blurb: 'Cruises a quarter faster; spools in two thirds the time',
    cost: '10% less hull',
    price: 700,
    needs: [{ id: 'cryo-ice', n: 6 }],
    place: 'tail',
    does: { cruise: 1.25, spool: 0.67, hull: 0.9 },
  },
  {
    id: 'heat-sink',
    name: 'Heat sink',
    blurb: 'The guns cool a quarter faster',
    cost: '15% less shield',
    price: 550,
    needs: [{ id: 'magma-glass', n: 4 }],
    place: 'flanks',
    does: { cool: 1.25, shield: 0.85 },
  },
  {
    id: 'armour',
    name: 'Armour plating',
    blurb: 'A quarter more hull',
    cost: '6% wider in turns, 3% slower',
    price: 700,
    needs: [
      { id: 'ferrite', n: 8 },
      { id: 'silica', n: 4 },
    ],
    place: 'nose',
    does: { hull: 1.25, agility: 0.94, speed: 0.97 },
  },
]

/** module slots each hull has (the plan's section 7) */
export const MODULE_SLOTS: Record<string, number> = {
  dart: 1,
  sparrow: 1,
  lance: 1,
  corsair: 2,
  wraith: 1,
  prospector: 3,
  mule: 3,
  bastion: 2,
  nomad: 2,
  galleon: 3,
}

export const weaponOf = (id: string) => WEAPONS.find((w) => w.id === id) ?? null
export const moduleOf = (id: string) => MODULES.find((m) => m.id === id) ?? null

/** a fit as the scene's settings carry it: the weapon on each mount ('' or 'cannon': the hull's own), and the modules */
export interface Fit {
  weapons: string[]
  modules: string[]
}

/** what a fit does on a hull of `mounts` mounts, all together */
export function fitEffect(fit: Fit, mounts: number, slots: number): FitEffect {
  const e: FitEffect = {
    speed: 1,
    agility: 1,
    boost: 1,
    hull: 1,
    shield: 1,
    recharge: 1,
    cool: 1,
    heat: 1,
    slots: 0,
    reach: 1,
    mine: 1,
    radar: 1,
    loud: false,
    cruise: 1,
    spool: 1,
    missiles: 0,
    mines: 0,
  }
  for (let m = 0; m < mounts; m++) {
    const w = fit.weapons[m] || 'cannon'
    if (w === 'laser') e.mine *= BEAM.mine
    else if (w === 'rack') e.missiles += RACK.missiles
    else if (w === 'mines') e.mines += MINES.hold
  }
  const seen = new Set<string>()
  for (const id of fit.modules) {
    const mod = moduleOf(id)
    // (one of each, and no more than the slots)
    if (!mod || seen.has(id) || seen.size >= slots) continue
    seen.add(id)
    const d = mod.does
    e.speed *= d.speed ?? 1
    e.agility *= d.agility ?? 1
    e.boost *= d.boost ?? 1
    e.hull *= d.hull ?? 1
    e.shield *= d.shield ?? 1
    e.recharge *= d.recharge ?? 1
    e.cool *= d.cool ?? 1
    e.heat *= d.heat ?? 1
    e.slots += d.slots ?? 0
    e.reach *= d.reach ?? 1
    e.mine *= d.mine ?? 1
    e.radar *= d.radar ?? 1
    e.loud = e.loud || !!d.loud
    e.cruise *= d.cruise ?? 1
    e.spool *= d.spool ?? 1
  }
  return e
}

/** a fit from the settings' text: weapons by mount, then modules ('flak,cannon|cargo-pod,scanner'); the old parts list is modules alone */
export function readFit(weapons: string, parts: string): Fit {
  const list = (s: string) => (s ? s.split(',').map((x) => x.trim()) : [])
  // (Phase 4's parts were these modules under other names)
  const renamed: Record<string, string> = { 'focus-laser': '' }
  return {
    weapons: list(weapons).map((w) => (weaponOf(w) ? w : 'cannon')),
    modules: list(parts)
      .map((p) => renamed[p] ?? p)
      .filter((p) => !!moduleOf(p)),
  }
}

/** the weapons on each mount, filled out with the hull's cannon */
export const weaponsOn = (fit: Fit, mounts: number): WeaponId[] =>
  Array.from({ length: mounts }, (_, m) => (weaponOf(fit.weapons[m] ?? '')?.id ?? 'cannon') as WeaponId)
