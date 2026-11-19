// The gallery's pictures, drawn off the main thread (gallery.worker.ts) one world at a time, in
// the order asked for: a frame of each world from above, as the game draws it, and a small map
// of the whole of it.

import type { Shot } from './shot'

export type { Shot }

/** draws every world in `ids`, in turn, calling `each` as each is done; returns a function that stops it */
export function drawWorlds(ids: string[], each: (shot: Shot) => void): () => void {
  const worker = new Worker(new URL('./gallery.worker.ts', import.meta.url), { type: 'module' })
  let next = 0
  const ask = () => {
    if (next < ids.length) worker.postMessage({ id: ids[next++] })
  }
  worker.onmessage = (e: MessageEvent<Shot>) => {
    each(e.data)
    ask()
  }
  ask()
  return () => worker.terminate()
}
