// The one interface the game talks to the network through (the plan's section 18). A
// transport joins rooms; a room, once joined, is a Link: it says what has happened since it
// was last asked (pilots arriving and leaving, messages), and sends messages. That is all, so
// any transport that can do this can replace another:
//
//   local.ts     tabs in one browser, over a BroadcastChannel (or a bus in memory, for the
//                tests), with as much delay, jitter and loss as asked for
//   trystero.ts  the real one: WebRTC between browsers, introduced through public Nostr relays
//
// A link is polled, not called back: the game asks once a frame, so nothing arrives in the
// middle of a step, and a test can drive the clock.

/**
 * How a message travels: `fast` may be lost or arrive out of order, and is for what is sent
 * many times a second and is soon out of date (where a ship is); `sure` always arrives, in
 * the order sent, and is for things that happen once (a hit, a kill).
 */
export type Lane = 'fast' | 'sure'

export type Happening =
  /** another peer is connected, and can be sent to */
  | { kind: 'join'; peer: string }
  | { kind: 'leave'; peer: string }
  | { kind: 'message'; peer: string; lane: Lane; data: Uint8Array }
  /** the room is full: the peers in it turned us away */
  | { kind: 'full' }
  /** a peer was found but could not be connected to (`why` says how it failed) */
  | { kind: 'failed'; peer: string; why: string }

/** how a link's connection to the world stands, for the connection screen */
export interface LinkHealth {
  /** the relays that introduce peers, if the transport uses any, and whether each is connected */
  relays: { url: string; up: boolean }[]
  /** false if the fast lane fell back to the sure one (it still works, with more lag when packets are lost) */
  fastLane: boolean
  /** something wrong with the transport as a whole, in a few words (null: nothing) */
  trouble: string | null
}

export interface Link {
  /** this end's peer id in the room (what others' happenings call it) */
  readonly self: string
  /** the room's full name */
  readonly room: string
  /** everything that has happened since the last call, oldest first */
  poll(): Happening[]
  /** a message to every peer in the room, or to one */
  send(lane: Lane, data: Uint8Array, to?: string): void
  health(): LinkHealth
  /** leave the room; the link is finished */
  leave(): void
}

export interface Transport {
  /** what it is, in a word, for the connection screen */
  readonly name: string
  /** joins a room (connecting goes on in the background: its peers turn up through poll); `cap` is the most peers a room lets in */
  join(room: string, cap: number): Link
}

/** a queue of happenings that a link fills as things arrive, and poll empties */
export class Inbox {
  private list: Happening[] = []
  private fast = 0
  /** at most this many fast messages wait (a tab that is not looked at stops polling; the oldest go) */
  constructor(private readonly fastMost = 600) {}

  push(h: Happening) {
    if (h.kind === 'message' && h.lane === 'fast') {
      if (this.fast >= this.fastMost) {
        const at = this.list.findIndex((x) => x.kind === 'message' && x.lane === 'fast')
        if (at >= 0) this.list.splice(at, 1)
        this.fast--
      }
      this.fast++
    }
    this.list.push(h)
  }

  take(): Happening[] {
    const out = this.list
    this.list = []
    this.fast = 0
    return out
  }
}
