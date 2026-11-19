// The things a pilot buys and fits, as the page shows them: each one's icon (static/ui, drawn by the image
// model: tools/gen/interface.py items), its price in words, and its tooltip (what it gives and what it
// costs, as figures green and red against the ship as it is).
import { asset } from '$app/paths'
import { RESOURCES } from '../engine'
import type { ResourceId } from '../engine'
import type { TipContent, TipStat } from './tooltip.svelte'

/** a picture in static/ui */
export const uiPicture = (name: string) => asset(`ui/${name}.png` as Parameters<typeof asset>[0])
/** a resource's icon */
export const resourceIcon = (id: string) => asset(`icons/${id}.png` as Parameters<typeof asset>[0])

/** what a price needs, as a line: credits, and ore from the vault; and, when the vault lacks some of it, what it comes to with
 * the counter making the ore up (data/shop.ts payFor) */
export function priceWords(credits: number, needs: { id: ResourceId; n: number }[], total = credits) {
  const words =
    [credits ? `${credits} CR` : '', ...needs.map((s) => `${s.n} ${RESOURCES[s.id].short}`)].filter(Boolean).join(' + ') || 'Free'
  return total > credits ? `${words} · ${total} CR with the counter's ore` : words
}

/** the figures a module changes, by name (and whether more is better) */
const STATS: Record<string, { label: string; better: 1 | -1 }> = {
  speed: { label: 'Speed', better: 1 },
  agility: { label: 'Turn', better: 1 },
  boost: { label: 'Thrust', better: 1 },
  hull: { label: 'Hull', better: 1 },
  shield: { label: 'Shield', better: 1 },
  recharge: { label: 'Recharge', better: 1 },
  cool: { label: 'Cooling', better: 1 },
  heat: { label: 'Heat', better: -1 },
  reach: { label: 'Scoop', better: 1 },
  mine: { label: 'Mining', better: 1 },
  radar: { label: 'Radar', better: 1 },
  cruise: { label: 'Cruise', better: 1 },
  spool: { label: 'Spool', better: -1 },
}

/** a module's effects as tooltip figures: +22% THRUST (green), −10% HULL (red) */
export function effectStats(does: Record<string, number | boolean | undefined>): TipStat[] {
  const out: TipStat[] = []
  for (const [k, v] of Object.entries(does)) {
    if (k === 'slots' && typeof v === 'number' && v) {
      out.push({ label: 'Hold', value: `${v > 0 ? '+' : ''}${v} slots`, tone: v > 0 ? 'good' : 'bad' })
      continue
    }
    const s = STATS[k]
    if (!s || typeof v !== 'number' || Math.abs(v - 1) < 0.005) continue
    const pct = Math.round((v - 1) * 100)
    out.push({ label: s.label, value: `${pct > 0 ? '+' : ''}${pct}%`, tone: Math.sign(pct) * s.better > 0 ? 'good' : 'bad' })
  }
  return out
}

/** an item's tooltip: what it does, what it costs you, its price (or that it is owned) */
export function itemTip(
  name: string,
  blurb: string,
  catchLine: string,
  owned: boolean,
  credits: number,
  needs: { id: ResourceId; n: number }[],
  icon: string,
  stats: TipStat[] = [],
  total = credits,
): TipContent {
  return {
    title: name,
    icon,
    line: blurb,
    stats,
    cost: owned ? undefined : priceWords(credits, needs, total),
    note: catchLine ? `But: ${catchLine}` : owned ? 'Owned' : undefined,
  }
}
