// The places inside, as a zone (the plan's section 6): the hangar at a base or station, the station
// deck, and a ship's own rooms. The pilot walks about in tile rooms seen from overhead (the camera
// pulled in as on foot), and Use acts on what he stands by: the loadout bench, the paint booth and
// the vault in the hangar, the shop and the faction board on the deck (the page opens those
// screens), the doors between them, his ship's hatch and its seat.
//
// The place he left is kept as it was: his ship stands landed (or docked) outside, sheltered, and
// the world or space goes on without him. Leaving puts him back in its seat.
//
// In flight he can also get up out of his seat and walk his ship's rooms (James, 2026-11-18: "walk around the ship when
// its flying"): then the scene stays in its zone (a world's sky, or space) and everything out there runs on as ever,
// his ship flown by itself (sim/flight.ts holds its heading, its throttle and its height), the others flying, fighting
// and firing at it; the outside is only told nothing is held (`calm`), and the rooms are walked with what is
// (`stepUp`). A hit shakes the rooms and sounds the alarm; the seat, or the seat key anywhere, puts him back. In the hangar his own
// ship is on show in the middle (a jet of its own, drawn as his ship is: fitted and painted, so a
// change made at the bench or the booth shows on it). Other pilots in the same place (the deck,
// or aboard the same ship) are told to the scene by the page; when nobody is on the deck, a few
// computer pilots stand about it so it is not empty.

import { DECK_CROWD, INSIDE, PROPS, TILE, UP_IN_FLIGHT } from '../data/interiors'
import type { Face, Piece, SpotId } from '../data/interiors'
import { FOOT } from '../data/foot'
import { makeJet } from '../jet/jet'
import type { Jet } from '../jet/jet'
import { fittedMesh } from '../jet/fit'
import type { JetMesh } from '../jet/mesh'
import { createPaint, paintShip } from '../render/paint'
import type { ShipPaint } from '../render/paint'
import { coloursOf, makeOf } from './outfit'
import { deckRoom, DOOR, faceFor, FLOOR, hangarRoom, placeAt, propCovers, shipRoom, standFurniture, tileAt } from '../interior/rooms'
import type { Refusal, RoomProp } from '../interior/rooms'
import type { Place, Room } from '../interior/rooms'
import { lookOf, randomLook } from '../races/races'
import type { SceneState } from '../state'
import { clamp, hash8 } from '../util/math'
import { ownFighter, SIDE_PLAYER } from './combat'
import { createControls } from './controls'
import type { Controls } from './controls'
import { EJ_FLY } from './ejection'
import { INTRO_TIME } from './flight'
import type { FlightLimits } from './flight'
import { ABOARD, createWalker, repaintWalker, WALKING } from './foot'
import type { Walker } from './foot'
import { FLYING, LANDED } from './landing'
import { powered, shutDown } from './power'
import type { Zone, ZoneKind } from './zone'
import { sound } from './effects'

/** what Use was pressed for inside, for the page: a screen to open, or furniture placed or taken up */
export type InteriorUse =
  | { kind: 'open'; spot: SpotId }
  | { kind: 'placed'; id: string; x: number; y: number; face: Face }
  | { kind: 'taken'; id: string; x: number; y: number }

/** another pilot here (another player, or one of the deck's crowd) */
export interface Visitor {
  id: number
  walker: Walker
  /** where he is heading (the crowd's), and seconds until he picks somewhere else */
  goX: number
  goY: number
  still: number
  crowd: boolean
}

export interface Interior {
  room: Room | null
  /** the zone the scene was in, to go back to */
  from: ZoneKind
  /** the pilot inside */
  me: Walker
  /** his ship on show in the hangar (the real one stays where it stood), from its larger build: its mesh and paint, and what they were made from */
  shown: Jet
  bigMesh: JetMesh | null
  bigPaint: ShipPaint | null
  bigKey: string
  /** the spot in reach ('' none) */
  spot: SpotId | ''
  /** what Use was pressed for, waiting for the page */
  uses: InteriorUse[]
  /** a piece of furniture being placed: which, the tile in front of him, and whether it can stand there */
  placing: { id: string; x: number; y: number; ok: boolean; face: Face; why: Refusal | '' } | null
  /** a ship's furniture, as the page last said (tile x, y of each piece's foot) */
  furniture: Piece[]
  /** others here */
  visitors: Visitor[]
  /** how he came aboard a ship: from the hangar, or from its seat ('') */
  aboardFrom: Place | ''
  /** whose ship this is ('' his own) */
  owner: string
  useWas: boolean
  /** up out of his seat in flight: the rooms are his ship's, and the outside runs on (the scene stays in its zone) */
  flying: boolean
  /** what the outside is told is held while he is up: nothing (his ship flies itself); and the heading it holds */
  calm: Controls
  heading: number
  /** when the alarm last sounded, the last hit on his ship while he was up, and the last hit taken account of (scene time) */
  alarmAt: number
  struckAt: number
  hitSeen: number
}

export function createInterior(): Interior {
  const shown = makeJet(0, 0, 0, 0)
  return {
    room: null,
    from: 'surface',
    me: createWalker(lookOf('', ''), SIDE_PLAYER),
    shown,
    bigMesh: null,
    bigPaint: null,
    bigKey: '',
    spot: '',
    uses: [],
    placing: null,
    furniture: [],
    visitors: [],
    aboardFrom: '',
    owner: '',
    useWas: false,
    flying: false,
    calm: createControls(),
    heading: 0,
    alarmAt: -99,
    struckAt: -99,
    hitSeen: -99,
  }
}

/** whether he is walking rooms: inside a place (the hangar, the deck, a ship landed), or up out of his seat in flight */
export const inRooms = (scene: SceneState) => scene.zone.kind === 'interior' || scene.interior.flying

/**
 * Whether he can get up out of his seat now: flying his ship (in a world's sky or in space), its power on, not landed,
 * docked or on the way to either, not on the way down, up or through a gate or a hole, not thrown clear of it
 */
export function canGetUp(scene: SceneState) {
  const z = scene.zone.kind
  const own = ownFighter(scene)
  return (
    (z === 'surface' || z === 'space') &&
    !scene.interior.flying &&
    scene.foot.stage === ABOARD &&
    scene.eject.stage === EJ_FLY &&
    scene.loop.landing.stage === FLYING &&
    !scene.travel.kind &&
    !scene.jets[0].away &&
    scene.introT > INTRO_TIME &&
    !!own?.alive &&
    powered(scene)
  )
}

/** up out of his seat in flight: his ship's rooms (as the hangar's Aboard shows them, furnished), him standing by the seat */
export function getUp(scene: SceneState) {
  if (!canGetUp(scene)) return false
  const it = scene.interior
  const room = shipRoom(scene.mesh.model.name)
  it.room = room
  it.flying = true
  it.heading = scene.jets[0].yaw
  it.from = scene.zone.kind
  it.aboardFrom = ''
  it.owner = ''
  it.placing = null
  it.spot = ''
  it.visitors = []
  furnish(scene)
  const w = it.me
  w.look = lookOf(scene.params.look, scene.params.side)
  repaintWalker(scene, w)
  w.stage = WALKING
  bySeat(scene)
  // (a hit already over: not his to hear about)
  const own = ownFighter(scene)
  it.hitSeen = own ? Math.max(own.hullAt, own.shieldAt) : -99
  it.struckAt = -99
  it.useWas = true
  const j = scene.jets[0]
  sound(scene, 'out', j.x, j.y, j.z, 1, true)
  return true
}

/** him standing just behind the seat of the ship whose rooms he is in, turned from the console, as a pilot getting up stands */
function bySeat(scene: SceneState) {
  const room = scene.interior.room
  if (!room) return
  const w = scene.interior.me
  const seat = room.spots.find((s) => s.id === 'seat')
  const x = seat ? seat.x : room.start.x
  const y = seat ? seat.y + TILE * 0.75 : room.start.y
  const ok = standable(scene, x, y)
  w.jet.x = ok ? x : room.start.x
  w.jet.y = ok ? y : room.start.y
  w.jet.z = FOOT.chest
  w.jet.yaw = Math.PI
  w.jet.vx = w.jet.vy = 0
  w.moving = 0
}

/** back in his seat in flight: the flight view as it was, the controls his again */
export function sitDown(scene: SceneState) {
  const it = scene.interior
  if (!it.flying) return
  it.flying = false
  it.room = null
  it.placing = null
  it.visitors = []
  // (Use must be let go before it does anything out there)
  scene.controls.use = false
  scene.controls.tap = 0
  const j = scene.jets[0]
  sound(scene, 'board', j.x, j.y, j.z, 1, true)
}

/**
 * The seat key: up out of the seat, or back into it. In flight, the ship flying on; landed or docked (James: "while
 * landed and powered off G should also work so I can walk around ship"), into his ship's rooms by the seat, as the
 * hangar's Aboard takes him (the ship shut down behind him), and from his own ship's rooms back to the seat
 */
export function toggleSeat(scene: SceneState) {
  const it = scene.interior
  if (it.flying) sitDown(scene)
  else if (scene.zone.kind === 'interior') {
    if (it.room?.kind === 'ship' && !it.owner) goOut(scene)
  } else if (canGoIn(scene)) {
    if (goIn(scene, 'ship')) bySeat(scene)
  } else getUp(scene)
}

/** what the outside is told is held while he is up: nothing, every step (the wheel's notches and the lever's let go too) */
export function calmed(scene: SceneState) {
  const c = scene.interior.calm
  Object.assign(c, createControls())
  const ctl = scene.controls
  ctl.throttleBy = 0
  ctl.throttleTo = -1
  return c
}

/**
 * A step up out of his seat in flight, after the outside's: he walks the rooms; a hit on the ship sounds the alarm; and
 * anything that takes the ship from under him (shot down, landing, a way down or up begun) puts him back in the seat
 */
export function stepUp(scene: SceneState, dt: number) {
  const it = scene.interior
  if (!it.flying) return
  const own = ownFighter(scene)
  if (
    !own?.alive ||
    scene.eject.stage !== EJ_FLY ||
    scene.foot.stage !== ABOARD ||
    scene.loop.landing.stage !== FLYING ||
    scene.travel.kind ||
    scene.zone.kind === 'interior' ||
    scene.jets[0].away
  ) {
    sitDown(scene)
    return
  }
  // (a hit, hull or shield: the alarm, once a hit, not oftener than UP_IN_FLIGHT.alarm)
  const hit = Math.max(own.hullAt, own.shieldAt)
  if (hit > it.hitSeen) {
    it.hitSeen = it.struckAt = hit
    if (scene.time - it.alarmAt >= UP_IN_FLIGHT.alarm) {
      it.alarmAt = scene.time
      const j = scene.jets[0]
      sound(scene, 'alarm', j.x, j.y, j.z, 1, true)
    }
  }
  stepInterior(scene, dt)
}

/** whether the player is somewhere he can go inside from: landed at a base or docked at a station, in his seat */
export function canGoIn(scene: SceneState) {
  return scene.zone.kind !== 'interior' && scene.foot.stage === ABOARD && scene.loop.landing.stage === LANDED && !scene.travel.kind
}

/** into a place: the hangar, the deck, or a ship's rooms (his own, or `hull` another's, `owner` whose) */
export function goIn(scene: SceneState, place: Place, hull = '', owner = '') {
  const it = scene.interior
  if (scene.zone.kind !== 'interior') {
    if (!canGoIn(scene)) return false
    it.from = scene.zone.kind
    it.aboardFrom = ''
    // (he leaves his seat: the ship is shut down behind him)
    shutDown(scene)
  } else if (place === 'ship' && it.room?.kind === 'hangar') it.aboardFrom = 'hangar'
  const room = place === 'hangar' ? hangarRoom(scene.params.hull) : place === 'deck' ? deckRoom() : shipRoom(hull || scene.params.hull)
  it.room = room
  it.owner = place === 'ship' ? owner : ''
  it.placing = null
  it.spot = ''
  it.visitors = []
  if (place === 'ship') furnish(scene)
  if (place === 'deck') crowd(scene)
  // he comes in at the room's door (into the hangar from the deck: at its door up there)
  const from = it.room === room && place === 'hangar' && scene.zone.kind === 'interior' ? room.spots.find((s) => s.id === 'deck') : null
  const w = it.me
  w.look = lookOf(scene.params.look, scene.params.side)
  repaintWalker(scene, w)
  w.stage = WALKING
  w.jet.x = from ? from.x : room.start.x
  w.jet.y = from ? from.y + TILE * 1.4 : room.start.y
  w.jet.z = FOOT.chest
  w.jet.yaw = from ? Math.PI : 0
  w.jet.vx = w.jet.vy = 0
  // his ship on show in the hangar, standing on the floor
  if (room.ship) {
    const s = it.shown
    s.x = room.ship.x
    s.y = room.ship.y
    s.z = hangarShip(scene).mesh.model.pivotY + 0.6
    s.yaw = 0
    s.roll = s.pitch = 0
    s.vx = s.vy = 0
  }
  scene.zone.kind = 'interior'
  it.useWas = true
  sound(scene, 'board', w.jet.x, w.jet.y, 0, 1, true)
  return true
}

/** back out to his seat in the ship, where it stood */
export function goOut(scene: SceneState) {
  const it = scene.interior
  if (it.flying) return sitDown(scene)
  if (scene.zone.kind !== 'interior') return
  it.room = null
  it.placing = null
  it.visitors = []
  scene.zone.kind = it.from
  // (Use must be let go before it does anything out there)
  scene.controls.use = false
  sound(scene, 'board', scene.jets[0].x, scene.jets[0].y, scene.jets[0].z, 1, true)
}

/**
 * The ship's furniture, as the page says, into its rooms, each facing as the wall behind it says. A piece that cannot
 * stand where it was (laid out by older rules) is taken up, and the page told, so it is his to place again (on his own
 * ship: another's is only left out).
 */
export function furnish(scene: SceneState) {
  const it = scene.interior
  const r = it.room
  if (!r || r.kind !== 'ship') return
  r.props = r.props.filter((p) => !p.placed)
  const left = standFurniture(r, it.furniture)
  if (!left.length || it.owner) return
  for (const f of left) {
    const at = it.furniture.indexOf(f)
    if (at >= 0) it.furniture.splice(at, 1)
    it.uses.push({ kind: 'taken', id: f.id, x: f.x, y: f.y })
  }
}

/** his ship as the hangar shows it: its larger build, fitted and painted as it flies (made again when either changes) */
export function hangarShip(scene: SceneState) {
  const it = scene.interior
  const p = scene.params
  const make = makeOf(p)
  const colours = coloursOf(p)
  const key = JSON.stringify([make, colours, p.timeOfDay])
  if (it.bigKey !== key || !it.bigMesh || !it.bigPaint) {
    it.bigMesh = fittedMesh(make, true)
    it.bigPaint = it.bigPaint ?? createPaint()
    paintShip(it.bigPaint, it.bigMesh.model, colours, p.timeOfDay)
    it.bigKey = key
  }
  return { mesh: it.bigMesh, paint: it.bigPaint }
}

/**
 * What the page must show whole (px): nothing, now. Every place inside is drawn at one art pixel (INSIDE.zoom) and the
 * camera follows the pilot round it where it is larger than the frame (the fresh review: the hangar and the deck, each
 * fitted whole to the page, and a ship's rooms drawn as large as they would go, showed the same pilot and the people
 * round him at three sizes). Kept for the page, which asks.
 */
export function fitOf(scene: SceneState): { w: number; h: number; least?: number } | null {
  void scene
  return null
}

/** whether a pilot of radius `rad` can stand at (x, y) */
export function standable(scene: SceneState, x: number, y: number, rad = INSIDE.radius) {
  const r = scene.interior.room
  if (!r) return false
  for (const [dx, dy] of [
    [-rad, -rad],
    [rad, -rad],
    [-rad, rad],
    [rad, rad],
  ]) {
    const tx = Math.floor((x + dx) / TILE)
    const ty = Math.floor((y + dy) / TILE)
    const t = tileAt(r, tx, ty)
    if (t !== FLOOR && t !== DOOR) return false
    // (a rug is walked on)
    for (const p of r.props) if (!PROPS[p.id]?.flat && propCovers(p, tx, ty)) return false
  }
  // (round his ship in the hangar)
  if (r.ship) {
    const m = hangarShip(scene).mesh.model
    const ex = (x - r.ship.x) / (m.w * 0.42 + rad)
    const ey = (y - r.ship.y) / (m.l * 0.45 + rad)
    if (ex * ex + ey * ey < 1) return false
  }
  return true
}

/** moves a walker by (vx, vy) for dt, sliding along what stops him */
function move(scene: SceneState, w: Walker, vx: number, vy: number, dt: number) {
  const j = w.jet
  const nx = j.x + vx * dt
  const ny = j.y + vy * dt
  if (standable(scene, nx, ny)) {
    j.x = nx
    j.y = ny
  } else if (standable(scene, nx, j.y)) j.x = nx
  else if (standable(scene, j.x, ny)) j.y = ny
  const speed = Math.hypot(vx, vy)
  if (speed > 1) j.yaw = Math.atan2(vx, -vy)
  w.moving = speed / INSIDE.walk
  w.step += (speed * dt) / INSIDE.stride
}

/** the deck's crowd, when nobody else is there: a few pilots of both sides standing about */
function crowd(scene: SceneState) {
  const it = scene.interior
  const r = it.room!
  for (let i = 0; i < DECK_CROWD.count; i++) {
    const side = i % 2 === 0 ? 'nomarchy' : 'anarchoi'
    const w = createWalker(randomLook(side, 991 + i * 37), 1)
    repaintWalker(scene, w)
    w.stage = WALKING
    w.jet.z = FOOT.chest
    // (somewhere on the floor, picked by a hash so it is the same every time)
    for (let tries = 0; tries < 40; tries++) {
      const x = (1.5 + (hash8(i * 31 + tries * 7) / 255) * (r.w - 3)) * TILE
      const y = (3 + (hash8(i * 53 + tries * 11 + 5) / 255) * (r.h - 5)) * TILE
      if (standable(scene, x, y)) {
        w.jet.x = x
        w.jet.y = y
        break
      }
    }
    it.visitors.push({ id: -1 - i, walker: w, goX: w.jet.x, goY: w.jet.y, still: 1 + i, crowd: true })
  }
}

/** what Use would do here: the nearest spot in reach */
function spotHere(scene: SceneState) {
  const it = scene.interior
  const r = it.room!
  const j = it.me.jet
  let best: SpotId | '' = ''
  let bestD = INSIDE.reach
  for (const s of r.spots) {
    const d = Math.hypot(s.x - j.x, s.y - j.y)
    if (d < bestD) {
      bestD = d
      best = s.id
    }
  }
  // (by his ship in the hangar: aboard)
  if (r.ship && !best) {
    const m = hangarShip(scene).mesh.model
    const ex = (j.x - r.ship.x) / (m.w * 0.42 + INSIDE.reach)
    const ey = (j.y - r.ship.y) / (m.l * 0.45 + INSIDE.reach)
    if (ex * ex + ey * ey < 1) best = 'aboard'
  }
  return best
}

/** the tile in front of him, where a piece being placed would stand */
function tileAhead(scene: SceneState) {
  const j = scene.interior.me.jet
  return { x: Math.floor((j.x + Math.sin(j.yaw) * TILE) / TILE), y: Math.floor((j.y - Math.cos(j.yaw) * TILE) / TILE) }
}

/** a furniture piece next to him (to take up again) */
const AROUND = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]

function pieceNear(scene: SceneState, ahead = false) {
  const r = scene.interior.room!
  const a = tileAhead(scene)
  // (the one on the tile ahead, else one on a tile beside that: a piece placed snaps to the wall nearest, a tile off)
  for (const [dx, dy] of ahead ? AROUND.slice(0, 1) : AROUND) {
    const p = r.props.find((q) => q.placed && propCovers(q, a.x + dx, a.y + dy))
    if (p) return p
  }
  return null
}

/** Use pressed inside */
function use(scene: SceneState) {
  const it = scene.interior
  const r = it.room!
  if (it.placing) {
    const p = it.placing
    const face = p.ok ? faceFor(r, p.id, p.x, p.y) : null
    if (!face) return
    r.props.push({ id: p.id, x: p.x, y: p.y, placed: true, face })
    it.furniture.push({ id: p.id, x: p.x, y: p.y, face })
    it.uses.push({ kind: 'placed', id: p.id, x: p.x, y: p.y, face })
    it.placing = null
    sound(scene, 'land', it.me.jet.x, it.me.jet.y, 0, 0.5, true)
    return
  }
  // (his own piece straight ahead is taken up before a spot he is also by is used: by the hatch, Use would go out)
  const ahead = r.kind === 'ship' && !it.owner ? pieceNear(scene, true) : null
  if (ahead) {
    takeUp(scene, ahead)
    return
  }
  switch (it.spot) {
    case 'deck':
      goIn(scene, 'deck')
      return
    case 'hangar':
      goIn(scene, 'hangar')
      return
    case 'aboard':
      goIn(scene, 'ship')
      return
    case 'hatch':
      // (in flight the hatch is sealed: SPOT_IN_FLIGHT says so)
      if (it.flying) return
      if (it.aboardFrom === 'hangar') goIn(scene, 'hangar')
      else goOut(scene)
      return
    case 'out':
    case 'seat':
      if (it.flying) sitDown(scene)
      else goOut(scene)
      return
    case '':
      break
    default:
      it.uses.push({ kind: 'open', spot: it.spot })
      return
  }
  // aboard his own ship, by a piece of his furniture: it is taken up, to place again
  if (r.kind === 'ship' && !it.owner) {
    const p = pieceNear(scene)
    if (p) takeUp(scene, p)
  }
}

/** a piece of his furniture taken up, to place again */
function takeUp(scene: SceneState, p: RoomProp) {
  const it = scene.interior
  const r = it.room!
  r.props.splice(r.props.indexOf(p), 1)
  const at = it.furniture.findIndex((f) => f.id === p.id && f.x === p.x && f.y === p.y)
  if (at >= 0) it.furniture.splice(at, 1)
  it.uses.push({ kind: 'taken', id: p.id, x: p.x, y: p.y })
}

/** one step inside: walking, what is in reach, Use, the others about */
export function stepInterior(scene: SceneState, dt: number) {
  const it = scene.interior
  const r = it.room
  if (!r) return
  const ctl = scene.controls
  const w = it.me
  w.t += dt
  // moving: the keys or a stick, the way the screen shows (the camera does not turn inside)
  let sx = ctl.keyTurn
  let sy = -clamp(ctl.keyWalk + ctl.keyThrottle, -1, 1) // (the throttle keys walk too)
  const n = Math.hypot(sx, sy)
  if (n > 1) {
    sx /= n
    sy /= n
  }
  const speed = ctl.boost > 0.5 ? INSIDE.run : INSIDE.walk
  const k = 1 - Math.exp(-dt * FOOT.grip)
  w.jet.vx += (sx * speed - w.jet.vx) * k
  w.jet.vy += (sy * speed - w.jet.vy) * k
  move(scene, w, w.jet.vx, w.jet.vy, dt)
  // a footstep on the deck plates now and then, as outside
  scene.foot.stepT += Math.hypot(w.jet.vx, w.jet.vy) * dt
  if (scene.foot.stepT > 14) {
    scene.foot.stepT = 0
    sound(scene, 'step', w.jet.x, w.jet.y, w.jet.z, w.moving, true, 'metal')
  }
  it.spot = spotHere(scene)
  if (it.placing) {
    // (the piece goes in front of him: of the feet near the tile ahead, nearest first and not behind him, the first where it can
    // stand, facing as the wall behind it says; a built-in piece snaps to the nearest wall)
    const a = tileAhead(scene)
    const yaw = w.jet.yaw
    const fx = Math.sin(yaw)
    const fy = -Math.cos(yaw)
    const near: { x: number; y: number; d: number }[] = []
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * fx + dy * fy < -0.5) continue
        near.push({ x: a.x + dx, y: a.y + dy, d: Math.hypot(dx, dy) })
      }
    near.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x)
    // (none fits: shown where it would go straight ahead, with why not)
    const ahead = placeAt(r, it.placing.id, a.x, a.y)
    let best = { x: a.x, y: a.y, ok: false, face: (PROPS[it.placing.id]?.faces[0] ?? 's') as Face, why: ahead.why }
    for (const c of near) {
      const at = c.x === a.x && c.y === a.y ? ahead : placeAt(r, it.placing.id, c.x, c.y)
      if (at.face) {
        best = { x: c.x, y: c.y, ok: true, face: at.face, why: '' }
        break
      }
    }
    it.placing.x = best.x
    it.placing.y = best.y
    it.placing.ok = best.ok
    it.placing.face = best.face
    it.placing.why = best.why
  }
  // Use: a press (or the start of a hold)
  const down = ctl.use || ctl.land
  if (down && !it.useWas) use(scene)
  it.useWas = down
  // the deck's crowd stand about, now and then walking somewhere else
  for (const v of it.visitors) {
    const j = v.walker.jet
    v.walker.t += dt
    if (!v.crowd) continue
    v.still -= dt
    if (v.still <= 0) {
      v.still = DECK_CROWD.wander * (0.5 + hash8(Math.floor(scene.time * 3) + v.id * 17) / 255)
      v.goX = (1.5 + (hash8(Math.floor(scene.time * 7) + v.id * 29) / 255) * (r.w - 3)) * TILE
      v.goY = (3 + (hash8(Math.floor(scene.time * 5) + v.id * 41) / 255) * (r.h - 5)) * TILE
    }
    const dx = v.goX - j.x
    const dy = v.goY - j.y
    const d = Math.hypot(dx, dy)
    if (d > 3) move(scene, v.walker, (dx / d) * INSIDE.walk * 0.6, (dy / d) * INSIDE.walk * 0.6, dt)
    else v.walker.moving = 0
  }
}

/** the people here as the page says (other players in the same place): x, y in the room's px; the crowd goes once anyone comes */
export function setVisitors(
  scene: SceneState,
  list: { id: number; x: number; y: number; facing: number; walk: number; look: string; side: string }[],
) {
  const it = scene.interior
  if (!it.room) return
  if (list.length) it.visitors = it.visitors.filter((v) => !v.crowd)
  const keep: Visitor[] = []
  for (const p of list) {
    let v = it.visitors.find((x) => x.id === p.id)
    if (!v) {
      const w = createWalker(lookOf(p.look, p.side === 'nomarchy' || p.side === 'anarchoi' ? p.side : ''), 1)
      repaintWalker(scene, w)
      w.stage = WALKING
      w.jet.z = FOOT.chest
      v = { id: p.id, walker: w, goX: p.x, goY: p.y, still: 0, crowd: false }
    }
    const j = v.walker.jet
    const moved = Math.hypot(p.x - j.x, p.y - j.y)
    v.walker.step += moved / INSIDE.stride
    v.walker.moving = p.walk / INSIDE.walk
    j.x = p.x
    j.y = p.y
    j.yaw = p.facing
    keep.push(v)
  }
  it.visitors = list.length ? keep : it.visitors.filter((v) => v.crowd)
  if (!list.length && !it.visitors.length && it.room.kind === 'deck') crowd(scene)
}

const STILL: FlightLimits = { maxRate: 0, clearance: 0, altLo: 0, altHi: 0, climbMax: 0, chase: false }

/** the places inside, as a zone: the pilot walks; the outside waits */
export const INTERIOR: Zone = {
  kind: 'interior',
  settle() {},
  limits: () => STILL,
  fly(scene, dt) {
    stepInterior(scene, dt)
  },
  after() {},
  drawBack() {},
  drawHaze() {},
  drawFront() {},
}
