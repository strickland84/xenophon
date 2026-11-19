// A count of connection attempts and how they went, so that the real share of players who
// cannot reach each other (the plan's open question 4, and Phase 2's gate) can be measured
// once real players try it. Every pilot met is an attempt: it ends connected, or failed. The
// totals are kept across sessions by the page (in localStorage), and the latest entries are
// listed on the connection screen, where they can be copied.

export interface ConnectionTotals {
  /** pilots another game tried to connect to, and of those, how many connected and how many failed */
  attempts: number
  connected: number
  failed: number
  /** times a room turned us away as full */
  full: number
  /** sessions begun */
  sessions: number
}

export interface LogEntry {
  /** ms since 1970 */
  at: number
  what: 'connected' | 'failed' | 'left' | 'full' | 'joined' | 'relay'
  /** the peer, the room or the relay it is about, and anything more */
  about: string
}

export interface ConnectionLog {
  totals: ConnectionTotals
  entries: LogEntry[]
}

/** the most entries kept */
const ENTRIES_MOST = 200

export function createLog(): ConnectionLog {
  return { totals: { attempts: 0, connected: 0, failed: 0, full: 0, sessions: 0 }, entries: [] }
}

export function note(log: ConnectionLog, at: number, what: LogEntry['what'], about: string) {
  const t = log.totals
  if (what === 'connected') {
    t.attempts++
    t.connected++
  } else if (what === 'failed') {
    t.attempts++
    t.failed++
  } else if (what === 'full') t.full++
  else if (what === 'joined') t.sessions++
  log.entries.push({ at, what, about })
  if (log.entries.length > ENTRIES_MOST) log.entries.splice(0, log.entries.length - ENTRIES_MOST)
}

/** a log read back from storage (an empty one if it is missing or damaged) */
export function readLog(text: string | null): ConnectionLog {
  const log = createLog()
  if (!text) return log
  try {
    const raw = JSON.parse(text)
    for (const k of Object.keys(log.totals) as (keyof ConnectionTotals)[])
      if (typeof raw?.totals?.[k] === 'number') log.totals[k] = raw.totals[k]
    if (Array.isArray(raw?.entries))
      log.entries = raw.entries
        .filter((e: LogEntry) => e && typeof e.at === 'number' && typeof e.what === 'string' && typeof e.about === 'string')
        .slice(-ENTRIES_MOST)
  } catch {
    // a damaged log starts again
  }
  return log
}

/** the share of attempts that failed, 0..1 (null before any) */
export const failRate = (t: ConnectionTotals) => (t.attempts > 0 ? t.failed / t.attempts : null)
