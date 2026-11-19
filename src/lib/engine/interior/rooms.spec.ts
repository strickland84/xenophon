// The rules a ship's fit-out keeps (the polish pass, after James on the bunks: "like a 4 poster bed on a spaceship?
// ... randomly plonked in middle of a room"): built-in pieces stand with their backs to a wall, nothing stands in a
// doorway's way, the way from the hatch to every door, to the seat and to the front of every piece stays open, and a
// fit-out is as even as the hull it is in.

import { describe, expect, it } from 'vitest'
import { artOf, blockOf, PROPS, ROOM_KINDS, TILE } from '../data/interiors'
import { HULL_NAMES } from '../jet/model'
import { pixelsOf } from '../space/pictures'
import { PROPS as ART } from './art'
import {
  deckRoom,
  DOOR,
  faceFor,
  FLOOR,
  hangarRoom,
  propCovers,
  shipKit,
  shipRoom,
  standFurniture,
  tileAt,
  VOID,
  walkable,
  WALL,
  wallJoin,
} from './rooms'
import type { Room } from './rooms'

const hulls = HULL_NAMES

describe('a ship fitted out', () => {
  for (const hull of hulls)
    it(`${hull}: every piece stands where it belongs`, () => {
      const r = shipRoom(hull)
      const kit = shipKit(hull)
      expect(kit.length).toBeGreaterThan(0)
      // (laid again from the save, every piece stands where the fit-out put it, facing the same way)
      const left = standFurniture(r, kit)
      expect(left).toEqual([])
      for (const p of r.props.filter((q) => q.placed)) {
        const k = PROPS[p.id]
        const [bw, bd] = blockOf(k, p.face)
        // its back to a wall, along its whole length, if it is built in
        if (k.against) {
          const back =
            p.face === 's'
              ? Array.from({ length: bw }, (_, i) => tileAt(r, p.x + i, p.y - bd))
              : p.face === 'n'
                ? Array.from({ length: bw }, (_, i) => tileAt(r, p.x + i, p.y + 1))
                : Array.from({ length: bd }, (_, i) => tileAt(r, p.face === 'e' ? p.x - 1 : p.x + bw, p.y - i))
          expect(
            back.every((t) => t === WALL),
            `${hull} ${p.id} at ${p.x},${p.y} facing ${p.face} has a wall behind it`,
          ).toBe(true)
        } else expect(p.face).toBe('s')
        // nothing in a doorway's way (the tile before and after one, and beside it)
        for (let x = p.x; x < p.x + bw; x++)
          for (let y = p.y - bd + 1; y <= p.y; y++)
            for (const [dx, dy] of [
              [0, -1],
              [0, 1],
              [-1, 0],
              [1, 0],
            ])
              expect(tileAt(r, x + dx, y + dy), `${hull} ${p.id} at ${p.x},${p.y} by a doorway`).not.toBe(DOOR)
      }
      // the hatch to every door, the seat and every piece's front: open
      expect(walkable(r)).toBe(true)
    })

  for (const hull of hulls)
    it(`${hull}: the fit-out is as even as the hull`, () => {
      const r = shipRoom(hull)
      const kit = shipKit(hull)
      const cx = Math.floor(r.w / 2)
      const mirror = { e: 'w', w: 'e', s: 's', n: 'n' } as const
      for (const p of kit) {
        const [bw] = blockOf(PROPS[p.id], p.face!)
        const mx = 2 * cx - p.x - bw
        expect(
          kit.some((q) => q.id === p.id && q.x === mx && q.y === p.y && q.face === mirror[p.face!]),
          `${hull} ${p.id} at ${p.x},${p.y} has its pair`,
        ).toBe(true)
      }
    })

  it('each kind of room is furnished by its recipe somewhere among the hulls', () => {
    const seen = new Map<string, Set<string>>()
    for (const hull of hulls) {
      const r = shipRoom(hull)
      for (const p of shipKit(hull)) {
        const room = r.rooms.find((q) => p.y >= q.y0 && p.y <= q.y1)!
        if (!seen.has(room.kind)) seen.set(room.kind, new Set())
        seen.get(room.kind)!.add(p.id)
      }
    }
    // (the first piece of every recipe, at least: berths in cabins and quarters, the map table, the racks, the consoles)
    for (const [kind, k] of Object.entries(ROOM_KINDS)) if (seen.has(kind)) expect(seen.get(kind)!.has(k.kit[0][0]), kind).toBe(true)
  })

  it('a pilot cannot put a piece where it blocks the way, or a built-in piece away from a wall', () => {
    const r = shipRoom('mule')
    standFurniture(r, shipKit('mule'))
    const hatch = r.spots.find((s) => s.id === 'hatch')!
    const hx = Math.floor(hatch.x / 8)
    const hy = Math.floor(hatch.y / 8)
    // (right in front of the hatch, nothing)
    expect(faceFor(r, 'table', hx - 1, hy - 1)).toBeNull()
    // (a locker anywhere with no wall beside it: no)
    let tried = 0
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        if (tileAt(r, x, y) !== FLOOR) continue
        if ([tileAt(r, x - 1, y), tileAt(r, x + 1, y), tileAt(r, x, y - 1), tileAt(r, x, y + 1)].includes(WALL)) continue
        tried++
        expect(faceFor(r, 'locker', x, y), `a locker at ${x},${y}`).toBeNull()
      }
    expect(tried).toBeGreaterThan(10)
  })
})

// The tiling rule (CLAUDE.md, docs/pixel-art-techniques.md): every piece is drawn top-down and square-on, its picture
// exactly its footprint of whole tiles across and its depth plus its rise tall, filling that rectangle (a diamond or a
// piece seen corner-on leaves its corners empty), in every facing it has.
describe('every piece of the places inside', () => {
  for (const [id, k] of Object.entries(PROPS)) {
    if (k.wall) continue
    for (const face of k.faces)
      it(`${id} facing ${face}: its picture covers its footprint`, () => {
        const art = ART[artOf(k, face)]
        expect(art, `${artOf(k, face)} is drawn`).toBeTruthy()
        const [bw, bd] = blockOf(k, face)
        expect([art.w, art.h]).toEqual([bw * TILE, Math.round((bd + k.rise) * TILE)])
        const px = pixelsOf(art)
        const on = (x: number, y: number) => px.px[y * px.w + x] !== 0
        let filled = 0
        for (let i = 0; i < px.w * px.h; i++) if (px.px[i]) filled++
        expect(filled / (px.w * px.h), 'its rectangle filled').toBeGreaterThan(k.flat ? 0.95 : 0.84)
        // (its four corners)
        const c = Math.max(1, Math.floor(Math.min(px.w, px.h) / 8))
        for (const [x0, y0] of [
          [0, 0],
          [px.w - c, 0],
          [0, px.h - c],
          [px.w - c, px.h - c],
        ]) {
          let n = 0
          for (let y = y0; y < y0 + c; y++) for (let x = x0; x < x0 + c; x++) if (on(x, y)) n++
          expect(n, `a corner at ${x0},${y0}`).toBeGreaterThan(0)
        }
      })
  }
})

describe('the walls', () => {
  const rooms: [string, Room][] = [['hangar', hangarRoom()], ['deck', deckRoom()], ...hulls.map((h) => [h, shipRoom(h)] as [string, Room])]
  for (const [name, r] of rooms)
    it(`${name}: every wall tile joins its neighbours, and no floor touches nothing`, () => {
      for (let ty = 0; ty < r.h; ty++)
        for (let tx = 0; tx < r.w; tx++) {
          const t = tileAt(r, tx, ty)
          if (t === FLOOR)
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ])
              expect(tileAt(r, tx + dx, ty + dy), `floor at ${tx},${ty} beside nothing`).not.toBe(VOID)
          if (t !== WALL) continue
          const j = wallJoin(r, tx, ty)
          const open = (x: number, y: number) => tileAt(r, x, y) === FLOOR || tileAt(r, x, y) === DOOR
          expect([j.n, j.s, j.e, j.w]).toEqual([open(tx, ty - 1), open(tx, ty + 1), open(tx + 1, ty), open(tx - 1, ty)])
          // (an inner corner only where the corner opens and both sides beside it are closed)
          if (j.se) expect(open(tx + 1, ty) || open(tx, ty + 1)).toBe(false)
          if (j.sw) expect(open(tx - 1, ty) || open(tx, ty + 1)).toBe(false)
          // (two walls side by side agree on the join between them: neither shows a rim to the other)
          if (tileAt(r, tx + 1, ty) === WALL) expect(j.e || wallJoin(r, tx + 1, ty).w).toBe(false)
        }
    })
  for (const [name, r] of rooms.slice(0, 2))
    it(`${name}: its pieces stand on the grid, apart, built-in ones flush to a wall`, () => {
      for (const p of r.props) {
        const k = PROPS[p.id]
        expect(k.faces.includes(p.face), `${p.id} at ${p.x},${p.y} faces ${p.face}`).toBe(true)
        if (k.against)
          expect(
            faceFor({ ...r, spots: [], props: r.props.filter((q) => q !== p) }, p.id, p.x, p.y, [p.face]),
            `${p.id} at ${p.x},${p.y}`,
          ).toBe(p.face)
        const [bw, bd] = blockOf(k, p.face)
        for (let y = p.y - bd + 1; y <= p.y; y++)
          for (let x = p.x; x < p.x + bw; x++) {
            expect(tileAt(r, x, y), `${p.id} at ${p.x},${p.y} on the floor`).toBe(FLOOR)
            if (!k.flat)
              expect(
                r.props.filter((q) => q !== p && !PROPS[q.id].flat && propCovers(q, x, y)),
                `${p.id} at ${p.x},${p.y} overlaps`,
              ).toEqual([])
          }
      }
    })
})
