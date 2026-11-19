// Keeping a pilot safe (the plan's sections 15 and 19, and the "lost pilots" risk of section 23).
// Everything he owns is in his browser, so clearing its data would lose him for good; he keeps him
// safe three ways, and any one of them brings him back from the title screen:
//
//   - the pilot file: the save itself, downloaded (store.ts pilotFile);
//   - his key as a phrase to copy and keep: Nostr's own way of writing a secret key (NIP-19,
//     `nsec1…`), so it is the same key any Nostr tool would show;
//   - a sealed copy of the save on the relays: encrypted with a key worked out from his secret key
//     (AES-GCM, by SHA-256), as an addressable event (kind 30078, NIP-78's application data) under his
//     public key and the namespace, so the phrase alone finds it and opens it on another device. A
//     relay sees only who it belongs to and when it was written, never what is in it.
//
// Nothing here touches the page: the tests run it against relays in memory.

import { etc } from '@noble/secp256k1'
import { isKey, publicKeyOf, signEvent } from '../net/nostr'
import type { NostrEvent } from '../net/nostr'
import type { RelayPool } from '../net/relays'
import { migrate, SAVE_VERSION } from './store'
import type { Save } from './store'

/** the kind of a sealed save on the relays: NIP-78, an application's own data, addressable by its `d` tag */
export const KIND_SEALED_SAVE = 30078

/** the `d` tag of a pilot's sealed save in a namespace (net/events.ts namespaceOf) */
export const sealedTag = (ns: string) => `${ns}/pilot`

// ── the key as a phrase (NIP-19's bech32, as BIP-173 lays it out)

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

function polymod(values: number[]) {
  let chk = 1
  for (const v of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i]
  }
  return chk
}
const expand = (hrp: string) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)]

/** bytes regrouped from `from` bits to `to` bits (padded on the way out, checked on the way back) */
function regroup(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0
  let bits = 0
  const out: number[] = []
  const most = (1 << to) - 1
  for (const v of data) {
    acc = (acc << from) | v
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((acc >> bits) & most)
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & most)
  } else if (bits >= from || ((acc << (to - bits)) & most) !== 0) return null
  return out
}

/** a secret key (64 hex digits) as the phrase a player copies: `nsec1…` */
export function phraseOf(secret: string): string {
  const words = regroup([...etc.hexToBytes(secret)], 8, 5, true)!
  const check = polymod([...expand('nsec'), ...words, 0, 0, 0, 0, 0, 0]) ^ 1
  const sum = Array.from({ length: 6 }, (_, i) => (check >> (5 * (5 - i))) & 31)
  return 'nsec1' + [...words, ...sum].map((v) => CHARSET[v]).join('')
}

/** the secret key in a phrase a player typed or pasted (`nsec1…`, or 64 hex digits; spaces and case forgiven), or null */
export function secretOfPhrase(text: string): string | null {
  const t = text.replace(/\s+/g, '').toLowerCase()
  if (isKey(t)) return t
  const m = /^nsec1([qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58})$/.exec(t)
  if (!m) return null
  const values = [...m[1]].map((c) => CHARSET.indexOf(c))
  if (polymod([...expand('nsec'), ...values]) !== 1) return null
  const bytes = regroup(values.slice(0, -6), 5, 8, false)
  if (!bytes || bytes.length !== 32) return null
  const hex = etc.bytesToHex(new Uint8Array(bytes))
  return isKey(hex) ? hex : null
}

// ── the sealed copy

/** bytes as base64 (a piece at a time: a long save would be too many arguments at once) */
function b64(bytes: Uint8Array) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

/** the key the copy is sealed with: worked out from the secret key, and only from it */
async function sealKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`xenophon sealed save\n${secret}`))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** the save sealed: a random nonce and the encrypted JSON, as text */
export async function seal(save: Save): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(save))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(save.identity.secret), plain))
  return `${b64(iv)}.${b64(sealed)}`
}

/** a sealed save opened with the secret key and brought up to date (null: not his, damaged, or from a newer game) */
export async function unseal(text: string, secret: string): Promise<Save | null> {
  try {
    const [iv, body] = text.split('.')
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await sealKey(secret), unb64(body))
    const raw = JSON.parse(new TextDecoder().decode(plain))
    if (!raw || typeof raw !== 'object' || Number(raw.version) > SAVE_VERSION) return null
    const save = migrate(raw)
    return save && save.identity.secret === secret ? save : null
  } catch {
    return null
  }
}

/** the event that carries a sealed save to the relays, signed with his key at `at` (seconds since 1970) */
export async function sealedEvent(save: Save, ns: string, at: number): Promise<NostrEvent> {
  return signEvent(save.identity.secret, {
    kind: KIND_SEALED_SAVE,
    tags: [['d', sealedTag(ns)]],
    content: await seal(save),
    created_at: at,
  })
}

/**
 * Asks the relays of a pool for a pilot's sealed save; resolves with the newest that opens (null if
 * none does within `waitMs`, by the pool's own clock). The pool is ticked by the caller as usual.
 */
export function findSealed(pool: RelayPool, secret: string, ns: string, waitMs: number, now: () => number): Promise<Save | null> {
  const author = publicKeyOf(secret)
  const id = `sealed-${author.slice(0, 8)}`
  return new Promise((done) => {
    let best: { at: number; save: Save } | null = null
    const tries: Promise<void>[] = []
    const until = now() + waitMs
    pool.subscribe(id, [{ kinds: [KIND_SEALED_SAVE], authors: [author], '#d': [sealedTag(ns)] }], (e) => {
      if (e.pubkey !== author) return
      tries.push(
        unseal(e.content, secret).then((save) => {
          if (save && (!best || e.created_at > best.at)) best = { at: e.created_at, save }
        }),
      )
    })
    const look = () => {
      if (now() < until) return void setTimeout(look, 100)
      pool.unsubscribe(id)
      void Promise.all(tries).then(() => done(best?.save ?? null))
    }
    look()
  })
}
