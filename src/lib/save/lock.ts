// Only one tab may fly a pilot at a time (the plan's section 19): two tabs flying the same
// pilot would be the same key in a room twice, each overwriting the other's save. A tab holds
// a lock named after the pilot's slot for as long as it is open (the Web Locks API, which
// every current browser has, and which the browser lets go of when the tab closes).
//
// A second tab finds the lock held, and may take it over: the first tab is then told it has
// lost the pilot, and stops.

export interface PilotLock {
  /** let go of it (the tab is leaving the game) */
  release(): void
}

/** what came of asking for the lock */
export type LockResult = { held: true; lock: PilotLock } | { held: false }

const lockName = (slot: string) => `xenophon/pilot/${slot}`

/**
 * Asks for the pilot's lock. With `take`, it is taken from whichever tab holds it. `lost` is
 * called if another tab takes it away later. Where the browser has no Web Locks, every tab is
 * let through (there is nothing to stop two).
 */
export async function lockPilot(slot: string, lost: () => void, take = false): Promise<LockResult> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return { held: true, lock: { release() {} } }
  let release = () => {}
  const held = await new Promise<boolean>((answer) => {
    const kept = new Promise<void>((done) => (release = done))
    const options: LockOptions = take ? { steal: true } : { ifAvailable: true }
    locks
      .request(lockName(slot), options, (lock) => {
        answer(!!lock)
        // held until released (or the tab closes)
        return lock ? kept : undefined
      })
      .catch((err: unknown) => {
        // taken by another tab
        if (err instanceof DOMException && err.name === 'AbortError') lost()
        answer(false)
      })
  })
  return held ? { held: true, lock: { release } } : { held: false }
}
