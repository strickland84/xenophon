// A pilot's identity is a Nostr key pair: a secp256k1 secret key, made once on first run and
// kept in the save, and its public key, which is the pilot as everyone else knows him. What
// a pilot says that others must be able to trust (who he is, which side he flies for) goes
// out as a Nostr event signed with that key, in Nostr's own format (NIP-01), so the same
// identity will serve the relays later: persistence and presence (the plan's section 18).
//
// Nothing here touches the page: it runs the same in Node, for the tests.

import { etc, schnorr } from '@noble/secp256k1'

/** a Nostr event, as NIP-01 lays it out */
export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/** the kind of the signed card a pilot shows the others in his room: ephemeral (20000–29999), never kept by relays */
export const KIND_PILOT_CARD = 25401

/** a new secret key, as 64 hex digits */
export function newSecretKey(): string {
  return etc.bytesToHex(schnorr.keygen().secretKey)
}

/** the public key that goes with a secret key: 64 hex digits (x only, as Nostr has it) */
export function publicKeyOf(secret: string): string {
  return etc.bytesToHex(schnorr.getPublicKey(etc.hexToBytes(secret)))
}

/** true for a string that could be a key: 64 hex digits */
export const isKey = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** the event's id: the hash of its fields in the order NIP-01 gives */
async function idOf(e: Pick<NostrEvent, 'pubkey' | 'created_at' | 'kind' | 'tags' | 'content'>) {
  return sha256(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))
}

/** an event signed with `secret`; `created_at` is seconds since 1970 (Nostr's clock), given so that the caller owns the time */
export async function signEvent(
  secret: string,
  e: { kind: number; tags?: string[][]; content: string; created_at: number },
): Promise<NostrEvent> {
  const body = { pubkey: publicKeyOf(secret), created_at: Math.floor(e.created_at), kind: e.kind, tags: e.tags ?? [], content: e.content }
  const id = await idOf(body)
  const sig = await schnorr.signAsync(id, etc.hexToBytes(secret))
  return { ...body, id: etc.bytesToHex(id), sig: etc.bytesToHex(sig) }
}

/** true when an event is well formed, its id is its hash, and it was signed by the key it names */
export async function verifyEvent(e: unknown): Promise<boolean> {
  if (!e || typeof e !== 'object') return false
  const v = e as NostrEvent
  if (!isKey(v.pubkey) || !/^[0-9a-f]{64}$/.test(v.id) || !/^[0-9a-f]{128}$/.test(v.sig)) return false
  if (typeof v.content !== 'string' || !Number.isInteger(v.kind) || !Number.isInteger(v.created_at) || !Array.isArray(v.tags)) return false
  try {
    const id = await idOf(v)
    if (etc.bytesToHex(id) !== v.id) return false
    return await schnorr.verifyAsync(etc.hexToBytes(v.sig), id, etc.hexToBytes(v.pubkey))
  } catch {
    return false
  }
}
