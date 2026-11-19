// What a pilot wears and carries on foot (the plan's section 9, "Gear"): his hand tool, his sidearm,
// his suit's lining, his backpack, and a gadget. Each a sidegrade: what it gives, it pays for (a
// faster cutter is heavier, a launcher fires slowly, a bigger pack slows a run). Bought at the deck's
// shop and kept; worn one of each slot. Starting values, to tune by playing.

import type { ResourceId } from './resources'

export type GearSlot = 'tool' | 'sidearm' | 'lining' | 'pack' | 'gadget'

export interface Gear {
  id: string
  slot: GearSlot
  name: string
  blurb: string
  cost: string
  price: number
  needs: { id: ResourceId; n: number }[]
  /** what it does: how fast veins are cut, walking and running pace, backpack slots, flares carried, a launcher for a sidearm, the lining, a cover for a gadget */
  cut?: number
  pace?: number
  slots?: number
  flares?: number
  launcher?: boolean
  lining?: 'heat' | 'cold'
  cover?: boolean
}

export const GEAR: Gear[] = [
  { id: 'cutter', slot: 'tool', name: 'Hand cutter', blurb: 'Cuts a vein at the usual pace', cost: '', price: 0, needs: [] },
  {
    id: 'power-cutter',
    slot: 'tool',
    name: 'Power cutter',
    blurb: 'Cuts veins 40% faster',
    cost: 'Heavy: walks and runs 5% slower',
    price: 380,
    needs: [{ id: 'ferrite', n: 6 }],
    cut: 1.4,
    pace: 0.95,
  },
  {
    id: 'plasma-cutter',
    slot: 'tool',
    name: 'Plasma cutter',
    blurb: 'Cuts veins 80% faster',
    cost: 'Heavier: walks and runs 10% slower',
    price: 900,
    needs: [{ id: 'magma-glass', n: 6 }],
    cut: 1.8,
    pace: 0.9,
  },
  { id: 'blaster', slot: 'sidearm', name: 'Blaster', blurb: 'Quick bolts: deadly to a pilot', cost: '', price: 0, needs: [] },
  {
    id: 'launcher',
    slot: 'sidearm',
    name: 'Launcher',
    blurb: 'Rockets that hurt a low or hovering ship (four times a bolt)',
    cost: 'Fires a third as fast; weaker against a pilot',
    price: 640,
    needs: [{ id: 'magma-glass', n: 5 }],
    launcher: true,
  },
  { id: 'plain', slot: 'lining', name: 'Plain suit', blurb: 'No lining', cost: '', price: 0, needs: [] },
  {
    id: 'heat-lining',
    slot: 'lining',
    name: 'Heat lining',
    blurb: 'Volcanic worlds do not burn him on foot',
    cost: 'No good in the cold',
    price: 300,
    needs: [{ id: 'bioresin', n: 5 }],
    lining: 'heat',
  },
  {
    id: 'cold-lining',
    slot: 'lining',
    name: 'Cold lining',
    blurb: 'Ice worlds do not freeze him on foot',
    cost: 'No good in the heat',
    price: 300,
    needs: [{ id: 'bioresin', n: 5 }],
    lining: 'cold',
  },
  { id: 'pack-4', slot: 'pack', name: 'Light pack', blurb: 'Four slots', cost: '', price: 0, needs: [], slots: 4 },
  {
    id: 'pack-6',
    slot: 'pack',
    name: 'Field pack',
    blurb: 'Six slots',
    cost: 'Runs 7% slower',
    price: 260,
    needs: [{ id: 'bioresin', n: 3 }],
    slots: 6,
    pace: 0.93,
  },
  {
    id: 'pack-8',
    slot: 'pack',
    name: 'Hauler pack',
    blurb: 'Eight slots',
    cost: 'Runs 14% slower',
    price: 520,
    needs: [{ id: 'bioresin', n: 6 }],
    slots: 8,
    pace: 0.86,
  },
  { id: 'flares', slot: 'gadget', name: 'Flares', blurb: 'Three flares, one back each 30 s', cost: '', price: 0, needs: [], flares: 3 },
  {
    id: 'cover',
    slot: 'gadget',
    name: 'Cover cloak',
    blurb: 'Hides him for 12 s wherever he stands (Flare button)',
    cost: 'No flares; once a minute',
    price: 420,
    needs: [{ id: 'silica', n: 4 }],
    flares: 0,
    cover: true,
  },
]

/** what each slot holds when nothing else is worn */
export const GEAR_DEFAULT: Record<GearSlot, string> = {
  tool: 'cutter',
  sidearm: 'blaster',
  lining: 'plain',
  pack: 'pack-4',
  gadget: 'flares',
}

/** a harsh world's bite on a pilot on foot with the wrong lining: health a second; and the cloak's numbers */
export const EXPOSURE = { hurt: 0.9 }
export const COVER = { time: 12, rest: 60 }
/** a launcher's rockets against a bolt: damage to a ship, to a pilot, and how fast it fires */
export const LAUNCHER = { ship: 4, pilot: 0.6, rate: 0.35 }

/** what the gear worn does, all together (the settings' text: ids with commas between) */
export function gearOf(text: string) {
  const worn = new Map<GearSlot, Gear>()
  for (const id of (text || '').split(',')) {
    const g = GEAR.find((x) => x.id === id.trim())
    if (g) worn.set(g.slot, g)
  }
  for (const [slot, id] of Object.entries(GEAR_DEFAULT))
    if (!worn.has(slot as GearSlot))
      worn.set(
        slot as GearSlot,
        GEAR.find((x) => x.id === id)!,
      )
  let pace = 1
  for (const g of worn.values()) pace *= g.pace ?? 1
  return {
    cut: worn.get('tool')!.cut ?? 1,
    pace,
    slots: worn.get('pack')!.slots ?? 4,
    flares: worn.get('gadget')!.flares ?? 3,
    launcher: !!worn.get('sidearm')!.launcher,
    lining: worn.get('lining')!.lining ?? '',
    cover: !!worn.get('gadget')!.cover,
  }
}
export type GearEffect = ReturnType<typeof gearOf>
