// A pilot's standing (the plan's section 14), kept in his save: what he has added to his side (his
// contribution, which gives his rank), his streak of kills (which puts a price on him), the feats he
// has done (each unlocks an emblem that cannot be bought: save/ships.ts EMBLEM_FEATS), the day's tasks and how far each has come,
// the wrecks he has stripped, and whether he was paid for joining the smaller side. Rank and feats
// are badges, titles and colours only: never power.
//
// The page feeds it what happened (the scene's deeds and ledger, and what the events' rule counted
// for his own events); everything here is a plain function of that, so the tests can drive it.

import { dailyTasks, hotspotsOn, rankOf } from '../engine'
import type { DailyTask, Deed, LedgerEntry } from '../engine'

export interface Progress {
  /** influence his events have counted for, all told */
  contribution: number
  /** kills in a row since he was last downed (a raider a third of one), and his best */
  streak: number
  best: number
  /** feats done, by id (FEATS) */
  feats: string[]
  /** the day's tasks: which day, how far each has come (by id), and those paid */
  tasks: { day: number; done: Record<string, number>; paid: string[] }
  /** wrecks he has stripped (by event id; the newest kept) */
  stripped: string[]
  /** his own events still to be counted towards his contribution (by id) */
  pending: string[]
  /** the joining bonus has been settled (paid, or not owed) */
  joined: boolean
}

export const newProgress = (): Progress => ({
  contribution: 0,
  streak: 0,
  best: 0,
  feats: [],
  tasks: { day: -1, done: {}, paid: [] },
  stripped: [],
  pending: [],
  joined: false,
})

/** feats: what each is for, and the emblem it unlocks (save/ships.ts EMBLEM_FEATS) */
export const FEATS: { id: string; name: string; text: string }[] = [
  { id: 'namer', name: 'Namer of worlds', text: 'Be the first to land on a world, and name it' },
  { id: 'streak', name: 'Ten in a row', text: 'Down ten without being downed' },
  { id: 'horizon', name: 'Past the horizon', text: 'Come out of a black hole run alive' },
  { id: 'hauler', name: 'Full hold', text: 'Bank 120 units at once' },
]

/** a raider's kill counts this much towards a streak (a pilot's counts one) */
const RAIDER_STREAK = 1 / 3
/** units banked at once that make the hauler's feat */
const HAULER_UNITS = 120
const STRIPPED_KEPT = 300

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const strings = (v: unknown, most = 500) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(-most) : [])

/** progress read back from a save (anything missing or wrong falls back to a fresh start) */
export function readProgress(raw: unknown): Progress {
  const p = newProgress()
  if (!raw || typeof raw !== 'object') return p
  const r = raw as Record<string, unknown>
  p.contribution = Math.max(0, num(r.contribution))
  p.streak = Math.max(0, num(r.streak))
  p.best = Math.max(0, num(r.best))
  p.feats = strings(r.feats).filter((f) => FEATS.some((x) => x.id === f))
  const t = r.tasks as Record<string, unknown> | undefined
  if (t && typeof t === 'object') {
    p.tasks.day = num(t.day, -1)
    if (t.done && typeof t.done === 'object')
      for (const [k, v] of Object.entries(t.done as Record<string, unknown>)) if (typeof v === 'number') p.tasks.done[k] = v
    p.tasks.paid = strings(t.paid)
  }
  p.stripped = strings(r.stripped, STRIPPED_KEPT)
  p.pending = strings(r.pending, 200)
  p.joined = r.joined === true
  return p
}

/** what came of something: credits earned and why, feats done, news for the page */
export interface Outcome {
  earned: { credits: number; what: string }[]
  feats: string[]
}

const outcome = (): Outcome => ({ earned: [], feats: [] })

/** a feat is done (once) */
function feat(p: Progress, id: string, out: Outcome) {
  if (p.feats.includes(id)) return
  p.feats.push(id)
  out.feats.push(id)
}

/** the day's tasks, started afresh on a new UTC day */
export function tasksOf(p: Progress, day: number): DailyTask[] {
  if (p.tasks.day !== day) p.tasks = { day, done: {}, paid: [] }
  return dailyTasks(day)
}

/** a task moves on by `n`; done, it pays once */
function advance(p: Progress, task: DailyTask, n: number, out: Outcome) {
  const was = p.tasks.done[task.id] ?? 0
  const now = Math.min(task.target, was + n)
  p.tasks.done[task.id] = now
  if (now >= task.target && !p.tasks.paid.includes(task.id)) {
    p.tasks.paid.push(task.id)
    out.earned.push({ credits: task.reward, what: `task: ${task.text}` })
  }
}

/** what the scene says the player did (its deeds), on a day: the streak, the tasks, the stripped wrecks */
export function fromDeed(p: Progress, d: Deed, day: number): Outcome {
  const out = outcome()
  const tasks = tasksOf(p, day)
  const task = (kind: string) => tasks.find((t) => t.kind === kind)
  switch (d.kind) {
    case 'kill': {
      p.streak += d.n === 1 ? 1 : RAIDER_STREAK
      p.best = Math.max(p.best, p.streak)
      if (p.streak >= 10 - 1e-9) feat(p, 'streak', out)
      const t = task(d.n === 1 ? 'pilot' : 'raiders')
      if (t) advance(p, t, 1, out)
      break
    }
    case 'wreck':
    case 'grave':
      // (downed: the streak, and the price on him, are gone)
      if (d.kind === 'wreck') p.streak = 0
      break
    case 'flag':
    case 'beacon': {
      const t = task(d.kind)
      if (t) advance(p, t, 1, out)
      break
    }
    case 'landed': {
      const t = task('land')
      if (t && t.world === d.world) advance(p, t, 1, out)
      break
    }
    case 'salvage':
      if (d.id && !p.stripped.includes(d.id)) {
        p.stripped.push(d.id)
        if (p.stripped.length > STRIPPED_KEPT) p.stripped.shift()
      }
      break
  }
  return out
}

/** what the scene's ledger says happened to his property, on a day: the hotspot and banking tasks, the hauler's feat */
export function fromLedger(p: Progress, l: LedgerEntry, day: number): Outcome {
  const out = outcome()
  const tasks = tasksOf(p, day)
  const units = 'items' in l ? l.items.reduce((a, s) => a + s.n, 0) : 0
  if (l.kind === 'mined' && hotspotsOn(day).includes(l.world)) {
    const t = tasks.find((x) => x.kind === 'hotspot')
    if (t) advance(p, t, units, out)
  }
  if (l.kind === 'bank') {
    const t = tasks.find((x) => x.kind === 'bank')
    if (t) advance(p, t, units, out)
    if (units >= HAULER_UNITS) feat(p, 'hauler', out)
  }
  return out
}

/** a black hole run ended with him alive, or a world took his name: feats */
export function didFeat(p: Progress, id: 'horizon' | 'namer'): Outcome {
  const out = outcome()
  feat(p, id, out)
  return out
}

/** his own events the rule has counted now add to his contribution (each once) */
export function countOwn(p: Progress, points: Record<string, number>) {
  let added = 0
  p.pending = p.pending.filter((id) => {
    if (points[id] === undefined) return true
    added += points[id]
    return false
  })
  p.contribution += added
  return added
}

/** his rank, 0..5 */
export const rankNow = (p: Progress) => rankOf(p.contribution)
