// Going online, from the page: picks the transport the address asks for (Trystero and the
// public relays, other tabs of this browser, or none), starts a session for the scene, keeps it
// going while the tab is hidden (marked idle), and keeps the connection log in localStorage.
// The only part of lib/net that touches the page.

import type { Scene } from '../engine'
import type { NetSettings } from '../settings/query'
import type { PilotCard } from './codec'
import { broadcastBus, localTransport } from './local'
import type { Transport } from './link'
import { createLog, note, readLog } from './log'
import type { ConnectionLog } from './log'
import { APP_ID } from './rooms'
import { Session } from './session'
import type { ChatChannel, ChatLine, SessionStatus } from './session'
import type { Chronicle } from './chronicle'

/** where the connection log is kept */
const LOG_KEY = 'xenophon/connections'

/** how the network stands, for the page: off (and why), or the session's own account */
export type NetState = { on: false; why: string } | ({ on: true } & SessionStatus)

export interface Online {
  /** the zone whose room it is in (rooms.ts): another world is another Online */
  zone: string
  /** once a frame, after the scene's steps */
  frame(): void
  /** how it stands now */
  state(): NetState
  log: ConnectionLog
  /** the pilot's card changed (another hull) */
  setCard(card: PilotCard): void
  /** zone chat: a line, a quick-chat phrase (to the room, his side or his squad), and what was said since the last call */
  say(text: string, to?: ChatChannel): void
  sayQuick(n: number, to?: ChatChannel): void
  takeChat(): ChatLine[]
  /** squads: ask a pilot here to fly together, say yes to one who asked, leave; who is in it and who asked; a pilot's ship here by key */
  invite(key: string): void
  accept(key: string): void
  leaveSquad(): void
  squad(): { keys: string[]; asked: string[] }
  shipOf(key: string): number
  dispose(): void
}

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function goOnline(
  scene: Scene,
  o: {
    settings: NetSettings
    secret: string
    card: PilotCard
    zone: string
    /** the persistent world: its events go to and come from the room */
    chronicle?: Chronicle
    bounty?: () => number
    onEarn?: (credits: number, what: string) => void
  },
): Online {
  const kept = storage()
  const log = kept ? readLog(kept.getItem(LOG_KEY)) : createLog()
  const keep = () => {
    try {
      kept?.setItem(LOG_KEY, JSON.stringify(log))
    } catch {
      // full, or not allowed: the log stays in memory
    }
  }
  let session: Session | null = null
  let off: string | null = null
  let gone = false
  const clock = () => performance.now()

  const start = (transport: Transport) => {
    if (gone) return
    session = new Session({
      transport,
      zone: o.zone,
      scene,
      secret: o.secret,
      card: o.card,
      clock,
      log,
      test: o.settings.room,
      chronicle: o.chronicle,
      bounty: o.bounty,
      onEarn: o.onEarn,
    })
    session.setIdle(document.hidden)
  }

  if (o.settings.net === 'off') off = 'turned off (?net=off)'
  // (WebRTC's encryption, and signing the pilot's card, need a secure page)
  else if (!window.isSecureContext || !globalThis.crypto?.subtle) off = 'needs a secure page: https, or localhost'
  else if (o.settings.net === 'local') {
    const { delay, jitter, loss, fail } = o.settings
    start(localTransport({ bus: () => broadcastBus(), clock, conditions: { delay, jitter, loss, fail } }))
  } else {
    off = 'starting'
    import('./trystero').then(
      ({ trysteroTransport }) => {
        off = null
        start(trysteroTransport({ appId: APP_ID, relays: o.settings.relays }))
      },
      (err: unknown) => {
        off = 'could not load the network code'
        note(log, Date.now(), 'relay', `load failed: ${String(err)}`)
      },
    )
  }

  // a hidden tab: idle; the page's frames stop, so the session keeps a slow pace of its own
  const hidden = () => session?.setIdle(document.hidden)
  document.addEventListener('visibilitychange', hidden)
  const slow = window.setInterval(() => {
    if (document.hidden) session?.update()
  }, 1000)
  const saving = window.setInterval(keep, 5000)
  const leaving = () => {
    session?.leave()
    keep()
  }
  window.addEventListener('pagehide', leaving)

  return {
    zone: o.zone,
    frame: () => session?.update(),
    state: () => (session ? { on: true, ...session.status() } : { on: false, why: off ?? 'starting' }),
    log,
    setCard: (card) => session?.setCard(card),
    say: (text, to) => session?.say(text, to),
    sayQuick: (n, to) => session?.sayQuick(n, to),
    takeChat: () => session?.takeChat() ?? [],
    invite: (key) => session?.invite(key),
    accept: (key) => session?.accept(key),
    leaveSquad: () => session?.leaveSquad(),
    squad: () => ({ keys: session?.squad ?? [], asked: session?.asked ?? [] }),
    shipOf: (key) => session?.shipOf(key) ?? 0,
    dispose() {
      gone = true
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', leaving)
      window.clearInterval(slow)
      window.clearInterval(saving)
      leaving()
    },
  }
}
