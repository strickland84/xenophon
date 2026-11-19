// What the game sounds like, as a table: for every kind of thing the engine says was heard
// (SoundEvent), which sound file plays and how (how loud, the player's own and another's, how much
// its pitch wanders so that repeats do not grate, how many a second at most, whether it pushes the
// music down); and the rules for the steady sounds kept up from how the player stands (the engines
// by the size of the ship, the lock tone, the alarms, the lasers, the cruise drive, a black hole).
//
// Nothing here touches the page: the tests check that every event has a sound and every sound a
// file (audio.spec.ts). sound.ts plays it.

import type { SoundEvent, SoundKind } from '../engine'
import { EFFECTS } from './catalogue'
import type { EffectName } from './catalogue'

export interface Cue {
  /** the sound: one, or chosen by the event (its size, the ground of a step, the race coming down) */
  sound: EffectName | ((e: SoundEvent) => EffectName)
  /** how loud: the player's own, and another's at its nearest (0..1 of the evened level) */
  own: number
  other: number
  /** how far its pitch wanders either way, as a share of it (0.05: under a semitone) */
  pitch: number
  /** how much louder a bigger one is (0: not at all; 1: as loud as its size says) */
  bySize?: number
  /** the most played in a second (none: no limit) */
  perSecond?: number
  /** pushes the music down: how far (0..1) and for how long, when it is near */
  duck?: [number, number]
}

/** the way each race comes down after ejecting (README "On foot"), as the sound of it opening */
export const DESCENTS: Record<string, EffectName> = {
  solari: 'down_parachute',
  kestrin: 'down_wingsuit',
  orrin: 'down_rotor',
  skarn: 'down_shell',
  noctil: 'down_cloak',
  thallin: 'down_cap',
}

/** a footstep's sound by the ground it falls on (engine GROUNDS) */
export const STEPS: Record<string, EffectName> = {
  soft: 'step_soft',
  sand: 'step_sand',
  rock: 'step_rock',
  snow: 'step_snow',
  metal: 'step_metal',
}

/** an explosion this big (0..1) or more is a ship's */
export const BIG_BANG = 0.5

export const CUES: Record<SoundKind, Cue> = {
  // ── guns, missiles, mines
  cannon: { sound: 'cannon', own: 0.3, other: 0.22, pitch: 0.06, perSecond: 16 },
  flak: { sound: 'flak', own: 0.34, other: 0.25, pitch: 0.05, perSecond: 10 },
  laser: { sound: 'laser_pulse', own: 0.2, other: 0.15, pitch: 0.04, perSecond: 10 },
  mine: { sound: 'mine_drop', own: 0.35, other: 0.25, pitch: 0.04 },
  launch: { sound: 'missile_launch', own: 0.5, other: 0.35, pitch: 0.05 },
  locked: { sound: 'locked', own: 0.3, other: 0, pitch: 0 },
  noLock: { sound: 'no_lock', own: 0.25, other: 0, pitch: 0 },
  warning: { sound: 'missile_warning', own: 0.4, other: 0, pitch: 0 },
  dodged: { sound: 'dodged', own: 0.45, other: 0.3, pitch: 0.05 },
  overheat: { sound: 'overheat', own: 0.4, other: 0, pitch: 0.03 },
  // ── hits and explosions
  hit: { sound: 'hit_hull', own: 0.5, other: 0.3, pitch: 0.07, bySize: 0.4, perSecond: 14 },
  shield: { sound: 'hit_shield', own: 0.4, other: 0.22, pitch: 0.06, bySize: 0.3, perSecond: 14 },
  shieldDown: { sound: 'shield_down', own: 0.55, other: 0.3, pitch: 0.03 },
  shieldUp: { sound: 'shield_up', own: 0.28, other: 0, pitch: 0 },
  explosion: {
    sound: (e) => (e.size >= BIG_BANG ? 'explosion_large' : 'explosion_small'),
    own: 0.9,
    other: 0.85,
    pitch: 0.08,
    bySize: 0.5,
    perSecond: 6,
    duck: [0.45, 1.6],
  },
  // ── the pilot
  eject: { sound: 'eject', own: 0.6, other: 0.4, pitch: 0.03, duck: [0.3, 2] },
  pickup: { sound: 'pickup', own: 0.4, other: 0, pitch: 0 },
  deploy: { sound: (e) => DESCENTS[e.what] ?? 'down_parachute', own: 0.45, other: 0.3, pitch: 0.03 },
  touchdown: { sound: 'touchdown', own: 0.5, other: 0.3, pitch: 0.05 },
  die: { sound: 'die', own: 0.55, other: 0.35, pitch: 0.03, duck: [0.4, 2.5] },
  call: { sound: 'call', own: 0.35, other: 0, pitch: 0 },
  out: { sound: 'climb_out', own: 0.35, other: 0.25, pitch: 0.03 },
  board: { sound: 'climb_in', own: 0.35, other: 0.25, pitch: 0.03 },
  // ── on foot
  step: { sound: (e) => STEPS[e.what] ?? 'step_soft', own: 0.2, other: 0.12, pitch: 0.08, bySize: 0.3, perSecond: 8 },
  wade: { sound: 'wade', own: 0.22, other: 0.14, pitch: 0.08, perSecond: 8 },
  dive: { sound: 'dive', own: 0.3, other: 0.2, pitch: 0.05 },
  blaster: { sound: 'blaster', own: 0.28, other: 0.2, pitch: 0.06, perSecond: 12 },
  flare: { sound: 'flare', own: 0.4, other: 0.3, pitch: 0.04 },
  beacon: { sound: 'beacon', own: 0.35, other: 0.25, pitch: 0.02 },
  // ── the wildlife (sim/creatures.ts): no voices of their own yet, so sounds the game has that fit. A creature coming for him
  // is the ambush's sting, quietly and seldom; its bite a hit; a glob the mine's plop; a kill the kill's; a find the scoop's,
  // and the till's for credits and a rare one (as a gem's)
  growl: { sound: 'ambush', own: 0.18, other: 0, pitch: 0.08, perSecond: 1 },
  bite: { sound: 'hit_hull', own: 0.5, other: 0.3, pitch: 0.1, bySize: 0.4, perSecond: 6 },
  spit: { sound: 'mine_drop', own: 0.3, other: 0.2, pitch: 0.12, perSecond: 4 },
  beastDown: { sound: (e) => (e.own ? 'kill' : 'touchdown'), own: 0.3, other: 0.25, pitch: 0.06, perSecond: 4 },
  loot: { sound: (e) => (e.what ? 'buy' : 'scoop'), own: 0.3, other: 0, pitch: 0.06, perSecond: 6 },
  // ── mining, cargo and trade
  chunk: { sound: 'chunk', own: 0.3, other: 0.25, pitch: 0.1, perSecond: 8 },
  // (the laser's or the cutter's lock on ore: one soft tick of the missile's lock, pitched up; a cut breaking free: the chunk's crack, louder the more it frees)
  // (a missile back on his rack: the lock's soft tick)
  rearm: { sound: 'lock_tick', own: 0.2, other: 0, pitch: 0.02 },
  oreLock: { sound: 'lock_tick', own: 0.22, other: 0, pitch: 0.02, perSecond: 3 },
  cut: { sound: 'chunk', own: 0.42, other: 0.28, pitch: 0.08, bySize: 0.3, perSecond: 6 },
  scoop: { sound: 'scoop', own: 0.25, other: 0.15, pitch: 0.08, perSecond: 8 },
  // (a gem: the beacon's ping as it flies out, the till's as it goes in; chosen by name, not heard)
  gem: { sound: 'beacon', own: 0.3, other: 0, pitch: 0.06, perSecond: 4 },
  gemScoop: { sound: 'buy', own: 0.35, other: 0, pitch: 0.04, perSecond: 4 },
  full: { sound: 'hold_full', own: 0.3, other: 0, pitch: 0, perSecond: 1 },
  crate: { sound: 'crate', own: 0.35, other: 0.25, pitch: 0.03 },
  bank: { sound: 'bank', own: 0.4, other: 0, pitch: 0 },
  brake: { sound: 'brake', own: 0.35, other: 0.25, pitch: 0.03 },
  land: { sound: 'land', own: 0.5, other: 0.3, pitch: 0.03 },
  lift: { sound: 'lift', own: 0.45, other: 0.3, pitch: 0.03 },
  // ── the ship's power (until a sound of their own is made: the cruise drive's spooling rises as a ship coming alive does)
  powerUp: { sound: 'spool', own: 0.35, other: 0, pitch: 0 },
  powerDown: { sound: 'shield_down', own: 0.3, other: 0, pitch: 0 },
  refused: { sound: 'ui_error', own: 0.3, other: 0, pitch: 0, perSecond: 2 },
  safe: { sound: 'no_lock', own: 0.25, other: 0, pitch: 0, perSecond: 2 },
  // (his ship hit while he walks its rooms in flight: the hull's alarm, once a hit)
  alarm: { sound: 'alarm_hull', own: 0.3, other: 0, pitch: 0, perSecond: 1 },
  // ── the target key (sim/target.ts): a tick as it picks, the interface's own step back as it lets go
  target: { sound: 'ui_select', own: 0.3, other: 0, pitch: 0, perSecond: 8 },
  untarget: { sound: 'ui_move', own: 0.25, other: 0, pitch: 0, perSecond: 4 },
  // ── the score, and the bands
  kill: { sound: 'kill', own: 0.35, other: 0, pitch: 0 },
  wave: { sound: 'ambush', own: 0.4, other: 0, pitch: 0 },
  over: { sound: 'over', own: 0.4, other: 0, pitch: 0, duck: [0.5, 3] },
  // ── space travel
  spool: { sound: 'spool', own: 0.35, other: 0, pitch: 0 },
  cruise: { sound: 'cruise_punch', own: 0.5, other: 0, pitch: 0.02 },
  dock: { sound: 'dock', own: 0.5, other: 0, pitch: 0.02 },
  breakout: { sound: 'breakout', own: 0.5, other: 0, pitch: 0.02 },
  entry: { sound: 'entry', own: 0.55, other: 0, pitch: 0.02 },
  charge: { sound: 'charge', own: 0.45, other: 0, pitch: 0 },
  jump: { sound: 'jump', own: 0.6, other: 0, pitch: 0.02, duck: [0.4, 2] },
  // ── places and weather
  thunder: { sound: 'thunder', own: 0.8, other: 0.8, pitch: 0.06, duck: [0.35, 3] },
  burn: { sound: 'burn', own: 0.35, other: 0.2, pitch: 0.06, perSecond: 3 },
}

/** the sound an event plays */
export function cueSound(e: SoundEvent): EffectName {
  const c = CUES[e.kind]
  return typeof c.sound === 'function' ? c.sound(e) : c.sound
}

/** how loud an event plays (before the take's own evening gain and the effects' volume) */
export function cueGain(e: SoundEvent): number {
  const c = CUES[e.kind]
  const base = e.own ? c.own : c.other * e.gain * e.gain
  const size = c.bySize ? 1 - c.bySize + c.bySize * Math.max(0, Math.min(1, e.size)) : 1
  return base * size
}

// ── the steady sounds

/** which drive a hull has: its size (data/hulls.ts roles) */
export const ENGINE_SIZE: Record<string, 'light' | 'medium' | 'heavy'> = {
  dart: 'light',
  sparrow: 'light',
  lance: 'light',
  wraith: 'light',
  corsair: 'medium',
  nomad: 'medium',
  prospector: 'medium',
  mule: 'heavy',
  bastion: 'heavy',
  galleon: 'heavy',
}

/** how fast a drive's powering up and down plays, by its size (one sound for all three: a big drive is slower and lower) */
export const POWER_RATE = { light: 1.12, medium: 1, heavy: 0.86 }

/** how the player stands, as the steady sounds need it */
export interface Listening {
  /** in a ship of his own (not on foot, not inside, not ejected) */
  flying: boolean
  /** landed on a pad (the engines idle) */
  landed: boolean
  hull: string
  /** px a second, 0..1 thrusters, 0..1 the throttle as set */
  speed: number
  boost: number
  throttle: number
  /** the ship's power: off, the engines are silent (none said: on); coming up, they hum at half */
  powered?: boolean
  starting?: boolean
  /** 0..1 hull left */
  hullLeft: number
  /** 0..1 the missile lock, and seconds until a missile fired at him arrives (99: none) */
  lock: number
  incoming: number
  /** the ship's laser cutting ore, his hand cutter cutting a vein */
  mining: boolean
  cutting: boolean
  /** his hull is being mended at a base or a station (the cutter's hiss and sparks) */
  repairing?: boolean
  /** the cruise drive (in space) */
  cruise: 'off' | 'spool' | 'on'
  /** 0..1 how near a black hole */
  hole: number
  /** 0..1 how fiercely a world's air burns round the ship on the way down (or up) */
  air?: number
}

/** a steady sound to keep up: how loud (0: off) and how fast it plays (1: as made) */
export interface Steady {
  name: EffectName
  gain: number
  rate: number
}

/** px a second a ship flies at, as the settings start it (params.ts): with the throttle, how hard the drive works */
const FLYING_SPEED = 92

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** every steady sound there is, at the level and pitch it should have now */
export function steady(l: Listening): Steady[] {
  const on = l.flying ? 1 : 0
  const drive = l.cruise === 'on' ? 1 : 0
  // The engines: the drive of the ship's size (tools/gen/sound_recipe.py DRIVE_STYLE, made again after James heard the
  // first ones as "a whining repeating wind noise" on his first flight, 2026-11-18), in three layers: its hum, powered
  // and at rest, always under; the thrust, rising with the throttle as set and a little with the speed come to, and
  // higher as it rises; the boost's roar over both with the thrusters. Silent with the power off, half the hum while it
  // comes up; quieter under the cruise drive, which has its own.
  const size = ENGINE_SIZE[l.hull] ?? 'medium'
  const power = on * (l.powered === false ? 0 : 1) * (drive ? 0.45 : 1)
  const coming = l.starting ? 1 : 0
  const push = l.landed || coming ? 0 : clamp01(0.75 * clamp01(l.throttle) + 0.25 * clamp01(l.speed / FLYING_SPEED))
  const boost = coming ? 0 : clamp01(l.boost)
  const out: Steady[] = []
  for (const s of ['light', 'medium', 'heavy'] as const) {
    const mine = power * (s === size ? 1 : 0)
    out.push({ name: `drive_${s}_idle`, gain: mine * 0.15 * (1 - 0.6 * push) * (coming ? 0.5 : 1), rate: 0.95 + 0.08 * push })
    // (the thrust eases back a little under the boost, so the roar coming in is heard as a change: James heard nothing for
    // Shift, its first takes all under 150 Hz, which a laptop's speakers do not give)
    out.push({
      name: `drive_${s}_thrust`,
      gain: mine * 0.34 * Math.sin((push * Math.PI) / 2) * (1 - 0.35 * boost),
      rate: 0.88 + 0.2 * push,
    })
    out.push({ name: `drive_${s}_boost`, gain: mine * 0.36 * boost, rate: 0.96 + 0.06 * boost + 0.04 * push })
  }
  out.push({ name: 'cruise_drive', gain: on * drive * 0.32, rate: 1 })
  out.push({ name: 'lock_tone', gain: on * (l.lock >= 1 ? 0.12 : 0), rate: 1 })
  out.push({ name: 'mining_laser', gain: on * (l.mining ? 0.28 : 0), rate: 1 })
  out.push({ name: 'cutter', gain: l.cutting ? 0.26 : l.repairing ? 0.22 : 0, rate: l.repairing && !l.cutting ? 1.12 : 1 })
  // (a black hole's deep rumble; and the air roaring round the ship on the way down or up, its own loop)
  out.push({ name: 'blackhole', gain: 0.5 * Math.max(0, Math.min(1, l.hole)), rate: 1 })
  out.push({ name: 'air', gain: 0.5 * Math.max(0, Math.min(1, l.air ?? 0)), rate: 0.9 + 0.2 * Math.max(0, Math.min(1, l.air ?? 0)) })
  return out
}

export type Power = 'none' | 'off' | 'starting' | 'on'

/** where the ship's power stands, for its powering up and down: none (not aboard a ship of his own), off, coming up, on */
export function powerOf(l: Listening): Power {
  if (!l.flying) return 'none'
  return l.powered === false ? 'off' : l.starting ? 'starting' : 'on'
}

/** the sound of the power changing from `was` to `now`: up as it starts coming up (or comes on from off), down as it goes
 * off (none: nothing heard; a ship already running when he climbs in or out is heard by those events) */
export function powerCue(was: Power, now: Power): { name: EffectName; gain: number } | null {
  if (now === 'starting' && was !== 'starting') return { name: 'power_up', gain: 0.3 }
  if (now === 'on' && was === 'off') return { name: 'power_up', gain: 0.3 }
  if (now === 'off' && (was === 'on' || was === 'starting')) return { name: 'power_down', gain: 0.32 }
  return null
}

/** beeps kept up from how he stands: seconds between them now (0: none) */
export function beeps(l: Listening): { lock: number; warning: number; hull: number } {
  return {
    // the lock coming: quicker as it comes
    lock: l.flying && l.lock > 0 && l.lock < 1 ? 0.22 - l.lock * 0.14 : 0,
    // a missile coming: quicker the nearer it is
    warning: l.flying && l.incoming < 6 ? Math.max(0.09, Math.min(0.35, l.incoming * 0.12)) : 0,
    // the hull nearly gone
    hull: l.flying && l.hullLeft > 0 && l.hullLeft < 0.25 ? 1.8 : 0,
  }
}

/** the beeps' sounds and levels */
export const BEEPS = {
  lock: { name: 'lock_tick' as EffectName, gain: 0.16 },
  warning: { name: 'missile_warning' as EffectName, gain: 0.3 },
  hull: { name: 'alarm_hull' as EffectName, gain: 0.26 },
}

// ── the interface

export type UiSound = 'open' | 'close' | 'move' | 'select' | 'confirm' | 'error' | 'buy'

export const UI: Record<UiSound, { name: EffectName; gain: number }> = {
  open: { name: 'ui_open', gain: 0.22 },
  close: { name: 'ui_close', gain: 0.2 },
  move: { name: 'ui_move', gain: 0.14 },
  select: { name: 'ui_select', gain: 0.2 },
  confirm: { name: 'ui_confirm', gain: 0.24 },
  error: { name: 'ui_error', gain: 0.24 },
  buy: { name: 'buy', gain: 0.3 },
}

/** every effect the game can play (for loading them, and for the tests) */
export function effectsInUse(): EffectName[] {
  const names = new Set<EffectName>()
  for (const c of Object.values(CUES)) if (typeof c.sound === 'string') names.add(c.sound)
  for (const n of [...Object.values(DESCENTS), ...Object.values(STEPS), 'explosion_large', 'explosion_small'] as EffectName[]) names.add(n)
  const quiet: Listening = {
    flying: true,
    landed: false,
    hull: '',
    speed: 0,
    boost: 0,
    throttle: 0,
    hullLeft: 1,
    lock: 0,
    incoming: 99,
    mining: false,
    cutting: false,
    cruise: 'off',
    hole: 0,
  }
  for (const s of steady(quiet)) names.add(s.name)
  names.add(powerCue('off', 'on')!.name)
  names.add(powerCue('on', 'off')!.name)
  for (const b of Object.values(BEEPS)) names.add(b.name)
  for (const u of Object.values(UI)) names.add(u.name)
  return [...names]
}

/** the order effects are fetched in: the interface's, then a fight's, then the rest (all of them, in the end) */
export function loadingOrder(): EffectName[] {
  const first = [
    ...Object.values(UI).map((u) => u.name),
    'cannon',
    'hit_hull',
    'hit_shield',
    'explosion_small',
    'explosion_large',
  ] as EffectName[]
  const rest = effectsInUse().filter((n) => !first.includes(n))
  return [...first, ...rest].filter((n) => n in EFFECTS)
}
