// The persistent world on the page's side: between the pilot's chronicle (chronicle.ts: the events,
// kept, shared and fetched) and the scene (the engine's sim/traces.ts), with the pilot's standing in
// his save (save/progress.ts). Once a frame it takes what the scene says the pilot did (its deeds)
// and signs into events what the galaxy should remember of it; it moves his streak, the day's tasks
// and his feats on; now and then it works the galaxy out from the events and tells the scene who
// holds each world, this world's name, whether his side can reach it, and the traces left on it (not
// those of pilots he has blocked); and once a minute it says where he is (his presence).
//
// Nothing here touches the page (time and storage are handed in), so the tests run it with real
// scenes against relays in memory: players who are never online together.

import { bountyOf, dayOfSeconds, discoveryNames, nameable } from '../engine'
import type { GalaxyState, LedgerEntry, Mark, MarkKind, Scene, Side } from '../engine'
import { countOwn, didFeat, fromDeed, fromLedger, rankNow } from '../save/progress'
import type { Outcome, Progress } from '../save/progress'
import type { Chronicle } from './chronicle'
import { HEARTBEAT_EVERY } from './chronicle'

/** something for the pilot to hear of */
export type PersistentNews =
  | { kind: 'feat'; id: string }
  | { kind: 'earned'; credits: number; what: string }
  /** he is the first to land on a world nobody has named: these are the names he may give it */
  | { kind: 'discover'; world: string; names: string[] }

export interface PersistentOptions {
  chronicle: Chronicle
  pilot: { callsign: string; side: Side }
  /** his standing and his mute and block lists, from the save: changed here (then `changed` is called) */
  progress: Progress
  social: { muted: string[]; blocked: string[] }
  changed: () => void
  /** credits he earned (a task done, a bounty claimed): for the property log */
  earn: (credits: number, what: string) => void
  /** news for the page to show */
  tell?: (news: PersistentNews) => void
  /** ms since 1970 */
  clock: () => number
}

/** ms between workings-out of the galaxy for the scene */
const TELL_EVERY = 1000

export class Persistent {
  private readonly o: PersistentOptions
  private toldAt = -1e12
  private told = ''
  private beatAt = -1e12
  private asked = new Set<string>()
  /** a black hole run under way */
  private threading = false

  constructor(o: PersistentOptions) {
    this.o = o
  }

  get chronicle() {
    return this.o.chronicle
  }

  /** the price on the pilot's head now */
  bounty() {
    return bountyOf(Math.floor(this.o.progress.streak))
  }

  rank() {
    return rankNow(this.o.progress)
  }

  /** the galaxy as the events leave it now */
  state(): GalaxyState {
    return this.o.chronicle.state()
  }

  private apply(out: Outcome) {
    for (const e of out.earned) {
      this.o.earn(e.credits, e.what)
      this.o.tell?.({ kind: 'earned', ...e })
    }
    for (const id of out.feats) this.o.tell?.({ kind: 'feat', id })
    this.o.changed()
  }

  /** once a frame, after the scene's steps */
  frame(scene: Scene) {
    const now = this.o.clock()
    const day = dayOfSeconds(now / 1000)
    const c = this.o.chronicle
    const { side, callsign } = this.o.pilot
    for (const d of scene.takeDeeds()) {
      this.apply(fromDeed(this.o.progress, d, day))
      const onWorld = /^w\d+$/.test(d.world)
      switch (d.kind) {
        case 'flag':
        case 'deliver':
        case 'kill':
          if (!onWorld || (d.kind === 'deliver' && d.n <= 0)) break
          void c.record({ kind: d.kind, world: d.world, side, callsign, x: d.x, y: d.y, z: d.z, n: d.n }).then((e) => {
            // (it counts towards his rank once the rule has weighed it)
            if (e) {
              this.o.progress.pending.push(e.id)
              this.o.changed()
            }
          })
          break
        case 'wreck':
        case 'grave':
        case 'beacon':
        case 'ghost':
          if (onWorld)
            void c.record({ kind: d.kind, world: d.world, side, callsign, x: d.x, y: d.y, z: d.z, n: d.n, hull: d.hull, path: d.path })
          break
        case 'landed':
          if (onWorld && nameable(d.world) && !this.state().names[d.world] && !this.asked.has(d.world)) {
            this.asked.add(d.world)
            this.o.tell?.({ kind: 'discover', world: d.world, names: discoveryNames(d.world, c.key, side) })
          }
          break
      }
    }
    // a black hole run, come out of alive
    const travel = scene.zone.travel
    if (travel === 'hole') this.threading = true
    else if (this.threading && !travel) {
      this.threading = false
      if (scene.status.flying) this.apply(didFeat(this.o.progress, 'horizon'))
    }
    if (now - this.toldAt >= TELL_EVERY) {
      this.toldAt = now
      this.tellScene(scene)
    }
    if (now - this.beatAt >= HEARTBEAT_EVERY) {
      this.beatAt = now
      c.heartbeat({ side, zone: scene.worldKey, bounty: this.bounty(), callsign, rank: this.rank() })
    }
    c.tick()
  }

  /** what the scene's ledger said this frame (for the day's tasks and the hauler's feat) */
  ledger(list: LedgerEntry[]) {
    const day = dayOfSeconds(this.o.clock() / 1000)
    for (const l of list) {
      const out = fromLedger(this.o.progress, l, day)
      if (out.earned.length || out.feats.length) this.apply(out)
    }
  }

  /** a bounty another game says he claimed */
  claimed(credits: number, what: string) {
    this.o.earn(credits, what)
    this.o.tell?.({ kind: 'earned', credits, what })
  }

  /** he names a world he was the first to land on (one of the names offered him) */
  name(world: string, name: string) {
    const { side, callsign } = this.o.pilot
    void this.o.chronicle.record({ kind: 'name', world, side, callsign, x: 0, y: 0, z: 0, n: 0, name })
    this.toldAt = -1e12
  }

  /** the scene is told how the galaxy stands (again only when something it shows has changed) */
  private tellScene(scene: Scene) {
    const state = this.state()
    const key = this.o.chronicle.key
    const here = scene.worldKey
    const { side } = this.o.pilot
    const p = this.o.progress
    const blocked = this.o.social.blocked
    // his own events, weighed: his contribution; a world named for him: a feat
    if (countOwn(p, state.points) > 0) this.o.changed()
    if (Object.values(state.names).some((n) => n.by === key)) {
      const out = didFeat(p, 'namer')
      if (out.feats.length) this.apply(out)
    }
    const sign = `${this.o.chronicle.archive.version}|${here}|${blocked.length}|${p.stripped.length}|${Math.floor(state.now / 60)}`
    if (sign === this.told) return
    this.told = sign
    const holders: Record<string, string> = {}
    for (const w of Object.values(state.worlds)) holders[w.id] = w.holder ?? ''
    const named = state.names[here]
    const marks: Mark[] = state.traces
      .filter((e) => e.world === here && !blocked.includes(e.by))
      .map((e) => ({
        id: e.id,
        kind: e.kind as MarkKind,
        by: e.by,
        side: e.side,
        callsign: e.callsign,
        x: e.x,
        y: e.y,
        z: e.z,
        n: e.n,
        at: e.at,
        hull: e.hull ?? '',
        path: e.path ?? null,
        own: e.by === key,
      }))
    scene.setTraces({
      holders,
      name: named?.name ?? '',
      finder: named?.callsign ?? '',
      front: state.worlds[here]?.front[side] ?? false,
      marks,
      stripped: p.stripped,
    })
  }
}
