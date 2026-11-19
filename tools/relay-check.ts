// Checks public Nostr relays for the persistent world (docs/serverless-multiplayer-research.md,
// "Checked in Phase 7"): what each says of itself (NIP-11: its software, its limits, whether it
// wants payment or authentication, how long it keeps events), and whether it takes, keeps and
// hands back the two kinds the game publishes: a world event (kind 7451, regular) and a pilot's
// presence (kind 17451, replaceable).
//
// What goes out is as little as the check needs, and can never be mistaken for play: a fresh
// throwaway key each run, the callsign RELAYCHECK, and a namespace of its own ('xenophon-devcheck-g1')
// that no build of the game reads. Two events a relay.
//
//   npx jiti tools/relay-check.ts out.json [wss://relay.one wss://relay.two …]
//   npx jiti tools/relay-check.ts out.json --again    # later: are the events of the last run still there?
//   npx jiti tools/relay-check.ts out.json --later    # a new session, empty, reads the namespace back: is w9 held?
import fs from 'node:fs'
import { KIND_PRESENCE, KIND_WORLD_EVENT, signDeed, signPresence } from '../src/lib/net/events'
import { newSecretKey } from '../src/lib/net/nostr'
import { Chronicle } from '../src/lib/net/chronicle'
import { browserDial } from '../src/lib/net/relays'
import type { NostrEvent } from '../src/lib/net/nostr'

const NS = 'xenophon-devcheck-g1'
const [out = 'relay-check.json', ...rest] = process.argv.slice(2)
const again = rest.includes('--again')
const later = rest.includes('--later')
const RELAYS = rest.filter((r) => r.startsWith('wss://')).length
  ? rest.filter((r) => r.startsWith('wss://'))
  : [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.primal.net',
      'wss://relay.nostr.net',
      'wss://relay.snort.social',
      'wss://nostr-pub.wellorder.net',
      'wss://relay.ditto.pub',
      'wss://nostr.mom',
      'wss://offchain.pub',
      'wss://nostr.azzamo.net',
      'wss://yabu.me',
      'wss://relay.nostr.band',
    ]

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** what a relay says of itself (NIP-11) */
async function info(url: string) {
  try {
    const r = await fetch(url.replace(/^wss:/, 'https:'), { headers: { Accept: 'application/nostr+json' }, signal: AbortSignal.timeout(8000) })
    const j = (await r.json()) as Record<string, unknown>
    return {
      name: j.name,
      software: j.software,
      version: j.version,
      nips: j.supported_nips,
      limitation: j.limitation,
      retention: j.retention,
      fees: j.fees ? 'yes' : undefined,
    }
  } catch (err) {
    return { error: String(err).slice(0, 120) }
  }
}

/** a short conversation with a relay: what it answers to what is sent */
async function talk(url: string, send: unknown[][], until: (said: unknown[][]) => boolean, ms = 10_000) {
  const said: unknown[][] = []
  return new Promise<{ said: unknown[][]; error?: string }>((resolve) => {
    let ws: WebSocket
    const done = (error?: string) => {
      try {
        ws?.close()
      } catch {
        // already closed
      }
      resolve({ said, error })
    }
    const timer = setTimeout(() => done('timed out'), ms)
    try {
      ws = new WebSocket(url)
    } catch (err) {
      clearTimeout(timer)
      return done(String(err))
    }
    ws.onopen = () => {
      for (const m of send) ws.send(JSON.stringify(m))
    }
    ws.onmessage = (e) => {
      try {
        said.push(JSON.parse(String(e.data)))
      } catch {
        said.push(['?', String(e.data).slice(0, 100)])
      }
      if (until(said)) {
        clearTimeout(timer)
        done()
      }
    }
    ws.onerror = () => {
      clearTimeout(timer)
      done('could not connect')
    }
  })
}

const ok = (said: unknown[][], id: string) => said.find((m) => m[0] === 'OK' && m[1] === id) as [string, string, boolean, string] | undefined
const eose = (sub: string) => (said: unknown[][]) => said.some((m) => (m[0] === 'EOSE' || m[0] === 'CLOSED') && m[1] === sub)

async function check(url: string, secret: string, world: NostrEvent, presence: NostrEvent) {
  const meta = await info(url)
  // publish both
  const pub = await talk(
    url,
    [
      ['EVENT', world],
      ['EVENT', presence],
    ],
    (said) => !!ok(said, world.id) && !!ok(said, presence.id),
  )
  const w = ok(pub.said, world.id)
  const p = ok(pub.said, presence.id)
  await wait(1500)
  // and ask for them back, as the game would: by kind and namespace tag
  const back = await talk(
    url,
    [['REQ', 'c', { kinds: [KIND_WORLD_EVENT, KIND_PRESENCE], '#t': [NS], authors: [world.pubkey], limit: 10 }]],
    eose('c'),
  )
  const got = back.said.filter((m) => m[0] === 'EVENT').map((m) => (m[2] as NostrEvent).id)
  return {
    url,
    info: meta,
    connect: pub.error ?? 'ok',
    world: w ? { ok: w[2], said: w[3] } : null,
    presence: p ? { ok: p[2], said: p[3] } : null,
    notices: pub.said.filter((m) => m[0] === 'NOTICE' || m[0] === 'AUTH').map((m) => m.join(' ').slice(0, 160)),
    backWorld: got.includes(world.id),
    backPresence: got.includes(presence.id),
    closed: back.said.filter((m) => m[0] === 'CLOSED').map((m) => String(m[2]).slice(0, 160)),
    secret: undefined as unknown,
    ids: { world: world.id, presence: presence.id, author: world.pubkey },
    _: secret.length,
  }
}

if (later) {
  // a new session: a fresh key, an empty archive, the relays that took the last run's events; the galaxy worked out from what they kept
  const last = JSON.parse(fs.readFileSync(out, 'utf8')) as { at: number; results: { url: string; world: { ok: boolean } | null }[] }
  const urls = last.results.filter((r) => r.world?.ok).map((r) => r.url)
  const c = new Chronicle({ secret: newSecretKey(), ns: NS, relays: urls, dial: browserDial, clock: Date.now })
  for (let i = 0; i < 40; i++) {
    c.tick()
    await wait(300)
  }
  await c.settled()
  const s = c.state()
  const hours = ((Date.now() - last.at) / 3_600_000).toFixed(1)
  console.log(`a new session ${hours} h after the check, reading ${urls.length} relays: ${c.archive.size} events; w9 held by ${s.worlds.w9.holder ?? 'nobody'} (influence ${s.worlds.w9.influence.nomarchy}); traces ${s.traces.map((e) => e.callsign + ' ' + e.kind).join(', ')}`)
  console.log(c.health().relays.map((r) => `${r.url.replace('wss://', '')}: ${r.up ? 'up' : 'down'}, sent us ${r.heard}`).join('; '))
  c.close()
} else if (again) {
  // the last run's events: still there?
  const last = JSON.parse(fs.readFileSync(out, 'utf8')) as { at: number; results: { url: string; ids: { world: string; presence: string; author: string } }[] }
  const hours = ((Date.now() - last.at) / 3_600_000).toFixed(1)
  for (const r of last.results) {
    const back = await talk(r.url, [['REQ', 'c', { ids: [r.ids.world, r.ids.presence] }]], eose('c'))
    const got = back.said.filter((m) => m[0] === 'EVENT').map((m) => (m[2] as NostrEvent).id)
    console.log(`${r.url}: after ${hours} h, world event ${got.includes(r.ids.world) ? 'kept' : 'gone'}, presence ${got.includes(r.ids.presence) ? 'kept' : 'gone'}${back.error ? ` (${back.error})` : ''}`)
  }
} else {
  const secret = newSecretKey()
  const now = Math.floor(Date.now() / 1000)
  const world = await signDeed(secret, { kind: 'flag', world: 'w9', side: 'nomarchy', callsign: 'RELAYCHECK', x: 0, y: 0, z: 0, n: 0 }, now, NS)
  const presence = await signPresence(secret, { side: 'nomarchy', zone: 'w9', bounty: 0, callsign: 'RELAYCHECK', rank: 0 }, now, NS)
  const results = []
  for (const url of RELAYS) {
    const r = await check(url, secret, world, presence)
    delete (r as { secret?: unknown }).secret
    delete (r as { _?: unknown })._
    results.push(r)
    console.log(
      `${url}: ${r.connect}; world ${r.world ? (r.world.ok ? 'taken' : `refused (${r.world.said})`) : 'no answer'}, presence ${r.presence ? (r.presence.ok ? 'taken' : `refused (${r.presence.said})`) : 'no answer'}; back: world ${r.backWorld}, presence ${r.backPresence}${r.closed.length ? `; closed: ${r.closed.join(' | ')}` : ''}`,
    )
  }
  fs.writeFileSync(out, JSON.stringify({ at: Date.now(), namespace: NS, results }, null, 1))
}
