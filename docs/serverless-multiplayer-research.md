# Serverless multiplayer: research notes

Researched 16 November 2026. Status: the recommendation below is built (Phase 2, 16 November
2026): Trystero over public Nostr relays, a Nostr key as the pilot's identity, state sync with
each player authoritative over his own ship; and (Phase 7, 17 November 2026) the persistent world
as signed events kept on public relays. What was checked while building them is in
[Checked in Phase 2](#checked-in-phase-2) and [Checked in Phase 7](#checked-in-phase-7).

## Goal

Turn the game into a multiplayer, procedurally generated pixel-art space and planet game with
no traditional server. The question was how far that can go, and which peer-to-peer stack fits.

## Summary

- A serverless version is realistic for small groups sharing a procedural universe.
- In a browser, "no server" means "no server we run". Peers still need a third party to
  introduce them, so the game would lean on public infrastructure someone else operates.
- The best fit for the current codebase is **Trystero** (WebRTC, with public Nostr relays doing
  the introduction), a universe derived from a seed, and a signed event log for persistence.
- **Pear** (Holepunch) is the purest peer-to-peer stack, but it does not run in a browser tab.
  It only becomes the right choice if the game ships as a desktop app.
- Open decision: browser tab or installed desktop app.

A note on names: the original question mentioned "PEARS Hyperledger". The relevant project is
Pear by Holepunch, built on Hypercore and Hyperswarm. Hyperledger is an enterprise blockchain
project and is not relevant here.

## The constraint that decides everything

The game is a static SvelteKit site (`@sveltejs/adapter-static`) that runs in a browser tab.

Browsers cannot open raw UDP or TCP sockets. A browser tab therefore cannot join a DHT or
hole-punch through a NAT by itself. Browser-to-browser traffic has to be WebRTC, and WebRTC
needs a signalling channel: some third party that passes connection details between two peers
before they can talk directly.

Every browser option below differs mainly in who provides that third party.

## Options

| Option            | Runs in a browser tab?       | What it leans on                                  | Verdict                           |
| ----------------- | ---------------------------- | ------------------------------------------------- | --------------------------------- |
| Pear / Hyperswarm | No                           | Public DHT, true hole-punching                    | Best pure P2P, desktop only       |
| Trystero          | Yes                          | Public Nostr relays, BitTorrent trackers, or MQTT | Best fit for this codebase        |
| iroh 1.0          | Yes, relay-only              | Relay servers                                     | Not direct in browsers yet        |
| js-libp2p         | Yes, needs a relay for setup | Circuit relay nodes                               | Heavy, no advantage over Trystero |
| Managed backends  | Yes                          | Firebase, Supabase and similar                    | Ruled out: these are servers      |

### Pear / Hyperswarm (Holepunch)

- Runs on the Bare runtime, which targets desktop and mobile, not browsers.
- The documented path for an app with a UI is `pear-runtime` inside Electron: Hyperswarm runs
  in a Bare worker and the renderer reaches it through a preload script.
- A browser can reach the Hyperswarm DHT only through `@hyperswarm/dht-relay`, where the
  browser opens a WebSocket to a relay server that bridges to the real DHT. That relay is a
  server, and both it and the `dht-relay-wss` server package are marked experimental or alpha.
- The wider stack (Hypercore, Autobase) offers multi-writer shared state, which would suit a
  persistent world. This was not researched in depth.
- Mobile support through the Pear JavaScript API was described as not yet available in one doc.

### Trystero

- A library that finds peers over existing public networks, then sets up direct WebRTC
  connections between them.
- Signalling strategies: Nostr, BitTorrent, MQTT, IPFS, plus managed ones (Supabase, Firebase)
  and a self-hosted WebSocket relay.
- Recent READMEs say the default package uses Nostr and describe it as the best option for
  redundancy and decentralisation. Older versions defaulted to BitTorrent.
- Only signalling touches the public network. Game data goes directly between peers and is
  end-to-end encrypted.
- Works from a static site with no backend, so it fits the current build as it stands.
- One downstream project reported connection problems with the default public BitTorrent
  trackers and fixed them by adding its own TURN servers.

### iroh 1.0

- iroh 1.0 was announced in June 2026 with a stable wire protocol.
- The browser (WASM) build is relay-only: IP transports are removed, so all browser traffic
  routes through relays. The relay cannot decrypt it.
- The official docs say browser support may expand toward full peer-to-peer later.
- For a browser game this means every packet goes through someone's relay server.

### js-libp2p

- Browser-to-browser WebRTC is set up by signalling over a Circuit Relay v2 connection. Data
  flows directly once the handshake completes, with the relay as a fallback.
- WebTransport does not support browser-to-browser connections.
- `webrtc-direct` needs no signalling server but only connects browser to Node, not browser to
  browser.
- Much heavier than Trystero for the same result.

## What is achievable with no server

### The universe

World generation is already seeded: `buildWorld` in `src/lib/engine/world/generate.ts` builds
a world from a seed through `mulberry32`. A single galaxy seed can derive a seed for every
system and planet, so every player generates the same universe locally and nothing about the
base world needs to be sent over the network.

### Live play

- One room per planet or sector, with the room name derived from the seed and location.
- Each player is authoritative over their own ship. Other ships are drawn from received
  snapshots and interpolated.
- Every peer connects to every other peer, so a room is realistically limited to roughly 8 to
  16 players. This figure is a rule of thumb, not a measurement.

### Persistence

This is the hardest part. Changes to the world (bases, terrain edits, discoveries) have no
central place to live.

- Each change is a signed event stored locally in the browser (IndexedDB or OPFS).
- Peers swap events they have not seen when they meet.
- Publishing events to public Nostr relays lets changes survive when no player is online.
  Relays are other people's servers, can disagree with each other, and do not guarantee they
  keep data, so the local copy has to be the source of truth.
- A CRDT library can handle merging. Yjs is the mature default with the smallest bundle
  (about 27.5 KB gzipped). Loro benchmarks fastest but is younger and much larger (about
  240 KB gzipped). Automerge 3 suits JSON-tree data with full history. These comparisons come
  from secondary sources and vendor benchmarks and were not checked on our workload.

### Identity

A keypair generated in the browser. No accounts, no login. The public key is the player's
identity and signs their events.

## What is not achievable

- **Guaranteed connectivity.** Some player pairs cannot connect directly because of strict
  NATs, especially on mobile carriers. Vendor estimates put the share of WebRTC connections
  that need a TURN relay at roughly 15 to 25 percent. A TURN relay is a server. No
  authoritative measurement was found, so treat that range as approximate.
- **Cheat-proofing.** There is no authority to overrule a dishonest client. Peers can check
  signed events against the deterministic rules, which is enough for co-op and exploration
  and weak for a competitive economy.
- **Deterministic lockstep with the engine as it stands.** `stepScene` in
  `src/lib/engine/sim/step.ts` takes a variable timestep, and the simulation uses floating
  point trigonometry, which is not guaranteed to be bit-identical across browsers. Lockstep
  would need a fixed timestep and deterministic maths. State sync avoids the problem.
- **MMO scale** in a single shared space.

## Recommendation

1. Stay in the browser and use Trystero with the Nostr strategy.
2. Derive the whole universe from a seed.
3. Sync live play with state snapshots, each player authoritative over their own ship.
4. Persist world changes as a signed event log, stored locally and mirrored to public Nostr
   relays.
5. Keep the network transport behind a thin interface, so a Pear desktop build remains
   possible later without rewriting the game.

### Suggested first spike

Two machines on different networks flying in the same seeded world. This proves the transport,
and it shows the real connection failure rate before anything is built on top of it.

## Open questions

- Browser tab or installed desktop app? Pear is only the right answer for desktop.
- Is an optional TURN relay acceptable as a fallback for players who cannot connect directly?
  It would be the one piece of server infrastructure.
- How much do cheating and griefing matter for the intended game? That decides how much event
  validation is needed.
- What should happen to a planet's changes when the public relays drop them?

## Checked in Phase 2

Checked on 16 November 2026, from the npm registry and the package's own code and README.

**Trystero is current and maintained.** The latest release is 0.27.0, published 11 November
2026, five days before this check; there were releases roughly monthly through 2026 (0.23 in
March, 0.24 April, 0.25.x May to August, 0.26 October, 0.27 November), 82 in all since 2020.
MIT licence, one maintainer (Dan Motzenbecker). 0.27 split it into packages
(`@trystero-p2p/core`, `/nostr` and others; `trystero` itself is the Nostr build) and changed
the API a good deal (`makeAction`, `makeUserState`, `getSelf`, plugins for roles and large
rooms), so the README of an older version will mislead.

- **Signalling:** Nostr by default, with 30 public relays built in, of which each app uses 5,
  picked from its app id. The handshakes go out as ephemeral events (kinds 20000 to 29999,
  which relays pass on and do not keep), signed with throwaway keys and encrypted.
- **Identity:** it now makes an ECDSA identity of its own per browser profile (two tabs of one
  profile count as one user). The game has its own identity (a Nostr key, as decided), so it
  joins with `identity: 'none'` and sends a card signed with the pilot's key instead.
- **Channels:** one data channel per pair of peers, reliable and in order. Its API has **no
  unreliable channel**. But it hands out each peer's `RTCPeerConnection`, so the game opens a
  second channel on it, unordered and never resent (`negotiated: true` with the same id on
  both sides, so Trystero's own negotiation never sees it, and no renegotiation is needed
  because the connection already carries a data channel). This is in `src/lib/net/trystero.ts`;
  where it cannot be opened, fast messages go on the reliable channel.
- **Room caps:** `maxUsers` makes the peers in a room turn newcomers away, who get a
  `room-full` error: the game then tries the next copy of the zone.
- **Failures are reported:** `onError` gives `peer-connect-failed` (saying whether a TURN server
  was configured), `handshake-failed` and others, and `getRelaySockets()` shows which relays
  are connected. The game counts and logs these.

**Verdict: fit, and chosen.** Nothing better turned up: the alternatives above are unchanged.

**First real connection.** Two separate headless Chromium browsers on this machine (one WSL2
PC), each a fresh profile, joined the same private room through the public relays and
connected in about a second. Four of the five relays answered (`relay.masize.com` returned
HTTP 502). Each saw the other fly (the one drew the other 11 px from where it really was, 100
ms behind), and one shot the other down: the hit, the kill, the explosion, the ejection, the
parachute and the kill feed showed on both. This proves the code, not the networks: both
browsers were on one machine, where a direct route always exists.

## Checked in Phase 7

Checked on 17 November 2026 with `tools/relay-check.ts`, for the persistent world's events (the
plan's section 18, "Built in Phase 7"). What went out was as little as the check needed and could
not be mistaken for play: a fresh throwaway key, the callsign RELAYCHECK, a namespace of its own
(`xenophon-devcheck-g1`, which no build of the game reads), and two events a relay: one world event
(kind 7451, a regular kind: relays keep it) and one presence (kind 17451, replaceable: a relay
keeps a pilot's latest). Each relay was asked for its NIP-11 description, sent both events, and then
asked for them back the way the game asks (by kind, `#t` tag and author).

| Relay                   | Software     | Took both | Gave both back | Largest message | Results a question | Notes                                                 |
| ----------------------- | ------------ | --------- | -------------- | --------------- | ------------------ | ----------------------------------------------------- |
| nos.lol                 | strfry 1.1.3 | yes       | yes            | 128 KB          | 500                |                                                       |
| relay.primal.net        | strfry 1.1.3 | yes       | yes            | 1 MB            | 500                | 20 open questions at most                             |
| relay.nostr.net         | strfry 1.1.2 | yes       | yes            | 256 KB          | 100                |                                                       |
| relay.ditto.pub         | Ditto 2.5.1  | yes       | yes            | 4 MB            | 1000 (100 unasked) | rejects events over 15 minutes ahead                  |
| nostr.mom               | strfry 1.1.3 | yes       | yes            | 128 KB          | 500                |                                                       |
| offchain.pub            | strfry 1.1.3 | yes       | yes            | 128 KB          | 500                | 20 open questions at most                             |
| nostr.azzamo.net        | strfry 1.0.4 | yes       | yes            | 128 KB          | 500                |                                                       |
| relay.snort.social      | memlay 0.2.0 | yes       | yes            | 512 KB          | 5000               | keeps events in memory only: lost on restart          |
| relay.damus.io          | strfry       | -         | -              | 1 MB            | 500                | described itself, but refused the websocket from Node |
| nostr-pub.wellorder.net | -            | -         | -              | -               | -                  | no answer                                             |
| yabu.me                 | -            | -         | -              | -               | -                  | no answer                                             |
| relay.nostr.band        | -            | -         | -              | -               | -                  | no answer                                             |

- **Custom kinds are accepted.** Every relay that answered took both kinds without complaint, needed
  no proof of work, no payment and no authentication, and indexed the `t` tag (asked by `#t`, each
  gave the events back).
- **Retention is not published.** None of them states how long it keeps events (NIP-11's
  `retention` is absent everywhere). strfry and Ditto keep what they are sent on disk until the
  operator prunes; memlay keeps it in memory. The game cannot count on any one relay keeping an
  event, so it keeps its own copy, sends to six, and hands events to other players directly.
- **Rate limits are not published either** (strfry's are set by each operator and not described).
  The game sends little: a pilot's events are a handful an hour, and his presence once a minute, so
  it stays far below any limit a public relay is likely to set; a relay that refuses or drops the
  connection gets the event again later (`relays.ts`).
- **The size of a question's answer is capped** (100 to 5000 events). The game asks for the
  namespace's last 16 days; if a galaxy ever has more events than a relay will return at once, it
  will need to ask in pages (by `until`). Not needed at the volumes expected now.
- **Chosen:** the six durable ones that took and returned both kinds: nos.lol, relay.primal.net,
  relay.nostr.net, nostr.mom, offchain.pub, relay.ditto.pub (`net/chronicle.ts DEFAULT_RELAYS`). The
  list is changeable in the menu (kept in the save) and with `?relays=` in the address.
- **Between sessions, through the public relays:** twelve minutes after the check, a new session (a
  fresh key, an empty archive) read the check namespace back from the eight relays that had taken it:
  each sent the event (eight copies, one event once checked), and the map worked out from it had w9
  held by the Nomarchy. This is Phase 7's gate answered over the real network, with one event; the
  tests answer it in depth against relays in memory (`net/chronicle.spec.ts`, `net/persistent.spec.ts`).
- **A later look** (`tools/relay-check.ts out.json --again`) asks each relay for the check's two
  events by id. Twenty minutes on, all eight that took them still had both; how long each keeps them
  beyond that is unknown (run it again days later to see). The rule that works the map out of the
  events takes 3.4 ms over 3000 of them in Node, so working it out every half minute costs nothing.

## Not verified

- The real share of connections that fail between players on different networks, and on
  phone networks. The game now counts every attempt and failure, on each device, and shows
  the totals on its connection screen with a button to copy them: someone has to collect them
  from real players (Phase 2's gate).
- How long public relays keep events (none says), and the rate limits they set (none says). Phase
  7 checked that six take and return the game's kinds; whether they still hold a week-old event,
  and how they take a busy galaxy, can only be seen over time.
- Whether Hypercore and Autobase would be a better persistence layer than signed Nostr events.
  (Phase 7 built the events without a CRDT library: an add-only set with one deterministic rule.)
- The players-per-room limit and the TURN percentage, both of which are estimates.

## Sources

- [Pear docs](https://docs.pears.com/)
- [Pear runtime reference](https://docs.pears.com/reference/pear/runtime/)
- [@hyperswarm/dht-relay](https://socket.dev/npm/package/@hyperswarm/dht-relay)
- [dht-relay-wss](https://github.com/HDegroote/dht-relay-wss)
- [dht-universal](https://npmjs.com/package/dht-universal)
- [Trystero](https://github.com/dmotz/trystero)
- [Trystero public BitTorrent tracker issue](https://githaven.org/Shiloh/remnantchat/issues/2)
- [iroh 1.0 announcement](https://iroh.computer/blog/v1)
- [iroh WASM and browser support](https://iroh.computer/docs/wasm-browser-support)
- [iroh 0.32 browser alpha](https://iroh.computer/blog/iroh-0-32-0-browser-alpha-qad-and-n0-future)
- [libp2p WebRTC browser connectivity](https://docs.libp2p.io/docs/webrtc-browser-connectivity/)
- [libp2p browser connectivity](https://blog.libp2p.io/docs/browser-connectivity/)
- [TURN relay share discussion](https://groups.google.com/g/discuss-webrtc/c/5d_EJwM6iJM)
- [nostr-crdt](https://www.npmjs.org/package/nostr-crdt)
- [Building on Nostr: real engineering challenges](https://verygood.ventures/blog/building-on-nostr-real-engineering-challenges/)
- [Yjs vs Automerge vs Loro, 2026](https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026)
- [Loro performance benchmarks](https://loro.dev/docs/performance)
- [You might not need a CRDT](https://jamsocket.xyz/blog/you-might-not-need-a-crdt)
