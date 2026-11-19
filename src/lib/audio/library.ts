// The sound files, fetched and decoded when they are first wanted, never before the first click or key
// (the first screen is not held up for them), a few at a time. Each is a small Ogg Opus file: every browser the game is
// for plays them (James, 2026-11-19: "assume modern browsers"), so there is no MP3 beside them.

import { EFFECTS } from './catalogue'
import type { EffectName, PieceName } from './catalogue'
import { audioUrl } from './mixer'

/** where a take of an effect, or of a piece of music, is under the site's static files */
export const effectPath = (name: EffectName, n: number) => `audio/sfx/${name}_${n}.ogg`
export const piecePath = (name: PieceName, n: number) => `audio/music/${name}_${n}.ogg`

export interface Library {
  /** a take's sound if it has come; if not, null, and it is fetched */
  get(name: EffectName, n: number): AudioBuffer | null
  /** fetches every take the game uses of these sounds (all of them, if none named), in the background */
  load(names?: EffectName[]): Promise<void>
  /** the takes that would not load (for the checks) */
  readonly failed: string[]
}

/** how many files are fetched at once */
const AT_ONCE = 4

/** one library for each context, shared by everything that plays in it */
const shared = new WeakMap<BaseAudioContext, Library>()
export function libraryFor(ctx: BaseAudioContext, url?: (path: string) => string): Library {
  let lib = shared.get(ctx)
  if (!lib) shared.set(ctx, (lib = createLibrary(ctx, url)))
  return lib
}

export function createLibrary(ctx: BaseAudioContext, url: (path: string) => string = audioUrl): Library {
  const buffers = new Map<string, AudioBuffer>()
  const pending = new Map<string, Promise<void>>()
  const failed: string[] = []
  const queue: (() => void)[] = []
  let running = 0

  /** runs `job` when fewer than AT_ONCE are running */
  function slot<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const go = () => {
        running++
        job()
          .then(resolve, reject)
          .finally(() => {
            running--
            queue.shift()?.()
          })
      }
      if (running < AT_ONCE) go()
      else queue.push(go)
    })
  }

  async function decode(path: string) {
    const r = await fetch(url(path))
    if (!r.ok) throw new Error(`${path}: ${r.status}`)
    return ctx.decodeAudioData(await r.arrayBuffer())
  }

  function fetchTake(name: EffectName, n: number): Promise<void> {
    const key = `${name}_${n}`
    const had = pending.get(key)
    if (had) return had
    const p = slot(async () => {
      try {
        buffers.set(key, await decode(effectPath(name, n)))
      } catch (e) {
        failed.push(`${key}: ${(e as Error).message}`)
      }
    })
    pending.set(key, p)
    return p
  }

  return {
    get(name, n) {
      const b = buffers.get(`${name}_${n}`)
      if (b) return b
      void fetchTake(name, n)
      return null
    },
    async load(names) {
      const list = names ?? (Object.keys(EFFECTS) as EffectName[])
      await Promise.all(list.flatMap((name) => EFFECTS[name].use.map((n) => fetchTake(name, n))))
    },
    get failed() {
      return failed
    },
  }
}
