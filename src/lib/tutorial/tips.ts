// One-line tips for the game's later systems, each shown once, the first time it comes up after the
// first sortie (the plan's section 15): the cruise drive, the gates, the hangar, the shop, flags,
// squads, missiles and the roll that shakes one off, a first part he can afford, and the first time
// raiders come for him (where they wait, and how to get away), getting up out of the seat on a long run, the target key. Worded with
// the keys and buttons of the device in use. The save keeps which have been shown.

import type { Bindable } from '../input/bindings'
import type { InputKind } from '../input/hints'

/** what a tip looks at, as the page last saw it */
export interface TipView {
  zone: { kind: string; prompt: string; cruise?: string }
  loop: { stage: string; base: { friendly: boolean } | null }
  interior: { place: string; flying?: boolean }
  traces: { atSite: boolean }
  status: { lock: number; incoming: number; ambushed?: boolean }
  /** a weapon or module is within reach: its credits in hand, and the ore it needs in the vault */
  affordable: boolean
  /** other pilots of his side in the room */
  mates: number
  /** units of ore banked in his vault and not sold, his credits, and whether he is in his side's home system */
  vault?: number
  credits?: number
  home?: boolean
  /**
   * The ship to work towards (data/hulls.ts NEXT_SHIP, by how he earns), while he has only the Corsair: its name, what it
   * gives in a line, its price in words, whether he can buy it now, and whether his Corsair's module slots are all taken
   */
  ship?: { name: string; why: string; price: string; can: boolean; full: boolean } | null
}

interface Tip {
  id: string
  when(v: TipView): boolean
  text(n: (a: Bindable) => string, input: InputKind, v: TipView): string
}

const pad = (input: InputKind) => input === 'ps' || input === 'pad'

export const TIPS: Tip[] = [
  {
    id: 'cruise',
    when: (v) => v.zone.kind === 'space' && v.loop.stage === 'flying',
    text: (n, input) =>
      `${input === 'touch' ? 'CRUISE' : n('cruise')} starts the cruise drive: the further from anything, the faster; the map (${n('map')}) plots a course`,
  },
  {
    // (James, 2026-11-19: no names float in space now; the target key names what it picks. docs/targeting.md)
    id: 'target',
    when: (v) => v.zone.kind === 'space' && v.loop.stage === 'flying' && v.zone.cruise !== 'on',
    text: (n, input) => {
      const t = input === 'touch' ? 'TARGET' : n('target')
      return `${t} targets the nearest thing in view and says what it is; ${t} again for the next, held to let go. Then ${input === 'touch' ? 'CRUISE' : n('cruise')} flies you to it`
    },
  },
  {
    // (James, 2026-11-18: "walk around the ship when its flying"; said on a long run under the cruise drive, when calm)
    id: 'seat',
    when: (v) => v.zone.kind === 'space' && v.zone.cruise === 'on' && !v.status.ambushed && v.status.incoming > 10 && !v.interior.flying,
    text: (n, input) => {
      const seat = input === 'touch' ? 'SEAT (under More)' : n('seat')
      return `A long run: ${seat} gets you up out of your seat to walk the ship while it flies itself; ${input === 'touch' ? 'SEAT' : n('seat')} again sits you down`
    },
  },
  {
    id: 'gate',
    when: (v) => v.zone.kind === 'space' && v.zone.prompt === 'jump',
    text: (n) => `A jump gate: hold ${n('use')} in its ring while it charges, and you are out of the gate at the far end of the lane`,
  },
  {
    // (polish step 8: a pilot who did only what the prompts said banked ore for half an hour and never sold any, so never
    // had a credit, a part or a reason to leave home: nothing had said the vault's ore is sold, or that the frontier pays more)
    id: 'sell',
    when: (v) => v.loop.stage === 'landed' && !!v.loop.base?.friendly && (v.vault ?? 0) > 0 && (v.credits ?? 0) < 380,
    text: (n, input) =>
      `Your ore is banked: sell it at the MARKET (${input === 'touch' ? 'BAG' : n('inventory')}) for credits, keeping what a part needs`,
  },
  {
    id: 'frontier',
    when: (v) => v.loop.stage === 'landed' && !!v.home && (v.credits ?? 0) >= 500,
    text: (n) =>
      `Home pays least: the frontier beyond the gate pays nearly twice, and raiders wait by its rich ore. The map (${n('map')}) plots the way`,
  },
  {
    id: 'hangar',
    when: (v) => v.zone.kind !== 'interior' && v.loop.stage === 'landed' && !!v.loop.base?.friendly,
    text: (n, input) =>
      `Landed at a base: HANGAR at the top${input === 'pointer' ? ` (or ${n('nextShip')})` : ''} for your ship's loadout and paint; DECK for the shop`,
  },
  {
    id: 'shop',
    when: (v) => v.interior.place === 'deck',
    text: (n) => `The shop sells ships, gear and furniture: walk to its counter and press ${n('use')}`,
  },
  {
    id: 'flag',
    when: (v) => v.traces.atSite,
    text: (n) => `The outpost's mast: hold ${n('use')} here to plant your side's flag, and the world leans your way`,
  },
  {
    id: 'squad',
    when: (v) => v.mates > 0,
    text: () => 'A pilot of your side is here: Menu, then Squad, to fly together (faster in each other’s slipstream)',
  },
  {
    id: 'missile',
    when: (v) => v.status.lock >= 1,
    text: (n, input) => `Locked on: ${input === 'pointer' ? 'right-click' : pad(input) ? n('secondary') : 'MISSILE'} fires a missile`,
  },
  {
    id: 'roll',
    when: (v) => v.status.incoming < 2.5,
    text: (n, input) => `A missile is coming: ${input === 'touch' ? 'swipe or ROLL' : n('roll')} as ROLL! shows, to shake it off`,
  },
  {
    id: 'ambush',
    when: (v) => !!v.status.ambushed,
    text: (n) => `Ambushed: fight, or run for a base, whose guns raiders keep clear of. The map (${n('map')}) shows where they wait`,
  },
  {
    // (polish step 9: nobody bought a second ship, parts always coming first; once the Corsair is full of parts, the ship to
    // work towards, and again once it can be bought)
    id: 'shipGoal',
    when: (v) => !!v.ship?.full && v.loop.stage === 'landed' && !!v.loop.base?.friendly,
    text: (_n, _input, v) => `Your Corsair has no slot left. The ${v.ship!.name}: ${v.ship!.why}. ${v.ship!.price} at the DECK's shop`,
  },
  {
    id: 'shipNow',
    when: (v) => !!v.ship?.can && v.loop.stage === 'landed' && !!v.loop.base?.friendly,
    text: (_n, _input, v) => `You can buy the ${v.ship!.name} now (${v.ship!.why}): DECK, then the shop's counter`,
  },
  {
    id: 'part',
    when: (v) => v.affordable,
    text: (n, _input, v) =>
      v.interior.place === 'hangar'
        ? `You can afford your first part: walk to the loadout bench and press ${n('use')}`
        : 'You can afford your first part: at a base, HANGAR, then the loadout bench',
  },
]

/** the tip to show now, if one has come up that has not been shown ('' none) */
export function nextTip(v: TipView, shown: string[], n: (a: Bindable) => string, input: InputKind): { id: string; text: string } | null {
  for (const t of TIPS) if (!shown.includes(t.id) && t.when(v)) return { id: t.id, text: t.text(n, input, v) }
  return null
}
