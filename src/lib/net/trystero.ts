// The real transport: WebRTC between browsers, introduced to each other through public Nostr
// relays by Trystero (https://github.com/dmotz/trystero, 0.27). Only the introduction touches
// the relays; the game's messages go straight from browser to browser, encrypted.
//
// Trystero gives each pair of peers one data channel, reliable and in order: that is the sure
// lane. For the fast lane, where a lost packet should stay lost rather than hold up the ones
// behind it, a second channel is opened on the same connection, unordered and never resent
// (negotiated on both sides with the same number, so Trystero's own handshake never sees it).
// Where that cannot be opened, fast messages go the sure way.
//
// Loaded only when the game goes online (the page imports it when it needs it).

import { getRelaySockets, joinRoom } from 'trystero'
import { Inbox } from './link'
import type { Link, LinkHealth, Transport } from './link'

/** the fast lane's channel: its number on every connection, the same at both ends */
const FAST_ID = 77

export interface TrysteroOptions {
  appId: string
  /** relays to use instead of Trystero's built-in list (wss:// addresses) */
  relays?: string[]
}

const bytesOf = (data: unknown): Uint8Array =>
  data instanceof Uint8Array
    ? data
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(0)

export function trysteroTransport(options: TrysteroOptions): Transport {
  return {
    name: 'trystero',
    join(roomId, cap) {
      const inbox = new Inbox()
      const room = joinRoom(
        {
          appId: options.appId,
          // (the game has its own identity, a Nostr key: Trystero's is thrown away)
          identity: 'none',
          maxUsers: cap,
          ...(options.relays?.length ? { relayConfig: { urls: options.relays } } : {}),
        },
        roomId,
      )
      const sure = room.makeAction<Uint8Array>('sure')
      const fast = new Map<string, RTCDataChannel>()
      let fastLane = true
      let trouble: string | null = null
      let self = ''
      let gone = false
      room.getSelf().then(
        (s) => (self = s.peerId),
        () => (trouble = 'could not start'),
      )

      sure.onMessage((data, context) => inbox.push({ kind: 'message', peer: context.peerId, lane: 'sure', data: bytesOf(data) }))

      function openFast(peer: string) {
        const pc = room.getPeers()[peer]?.connection
        if (!pc) {
          fastLane = false
          return
        }
        try {
          const channel = pc.createDataChannel('xenophon/fast', { negotiated: true, id: FAST_ID, ordered: false, maxRetransmits: 0 })
          channel.binaryType = 'arraybuffer'
          channel.onmessage = (e) => inbox.push({ kind: 'message', peer, lane: 'fast', data: bytesOf(e.data) })
          fast.set(peer, channel)
        } catch {
          fastLane = false
        }
      }

      room.onPeerJoin(({ peerId }) => {
        openFast(peerId)
        inbox.push({ kind: 'join', peer: peerId })
      })
      room.onPeerLeave(({ peerId }) => {
        fast.get(peerId)?.close()
        fast.delete(peerId)
        inbox.push({ kind: 'leave', peer: peerId })
      })
      room.onError((err) => {
        switch (err.code) {
          case 'room-full':
            inbox.push({ kind: 'full' })
            break
          case 'peer-connect-failed':
            inbox.push({
              kind: 'failed',
              peer: err.peerId,
              why: err.turnConfigured ? 'no route, even through TURN' : 'no direct route (no TURN relay)',
            })
            break
          case 'handshake-failed':
          case 'decrypt-failed':
          case 'peer-error':
            inbox.push({ kind: 'failed', peer: err.peerId, why: err.code })
            break
          case 'relay-failed':
            trouble = 'no relay answered'
            break
          default:
            trouble = err.message
        }
      })

      const link: Link = {
        get self() {
          return self
        },
        room: roomId,
        poll: () => inbox.take(),
        send(lane, data, to) {
          if (gone) return
          if (lane === 'fast') {
            const peers = to ? [to] : Object.keys(room.getPeers())
            for (const peer of peers) {
              const channel = fast.get(peer)
              if (channel?.readyState === 'open') channel.send(data as Uint8Array<ArrayBuffer>)
              // (no fast channel at all: the sure way; one still opening: this one is let go)
              else if (!channel) sure.send(data, { target: peer }).catch(() => {})
            }
            return
          }
          sure.send(data, { target: to ?? null }).catch(() => {})
        },
        health(): LinkHealth {
          const sockets = getRelaySockets()
          return {
            relays: Object.entries(sockets).map(([url, ws]) => ({ url, up: ws.readyState === WebSocket.OPEN })),
            fastLane,
            trouble,
          }
        },
        leave() {
          gone = true
          for (const channel of fast.values()) channel.close()
          fast.clear()
          room.leave().catch(() => {})
        },
      }
      return link
    },
  }
}
