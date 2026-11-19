// Walks the pilot inside (the hangar, the deck, a ship's rooms) to a spot, as a player would: along the way through
// the room's open tiles (round the furniture and his ship), with the keys, or on a phone with a finger as the stick.
// For the tools that play the game in a browser (phone-check.mjs, hangar.mjs, playthrough.mjs); it reads the room
// through window.__xenophon (development and playtest builds only).
//
//   import { walkToSpot, walkToTile } from './inside-walk.mjs'
//   await walkToSpot(page, 'booth')               // with the keys
//   await walkToSpot(page, 'booth', { cdp })      // with a finger (a CDP session of a phone's page)

/** the way from where he stands to a tile (x, y), as tile middles in px: the room's open tiles, four ways, nearest first */
async function wayTo(page, tx, ty) {
  return page.evaluate(
    ([tx, ty]) => {
      const g = window.__xenophon
      const room = g.open()
      const me = g.scene.interior
      if (!room) return null
      const { w, h, tile, open } = room
      const from = Math.floor(me.y / tile) * w + Math.floor(me.x / tile)
      const to = ty * w + tx
      const back = new Int32Array(w * h).fill(-1)
      back[from] = from
      const queue = [from]
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q]
        if (i === to) break
        const x = i % w
        const y = (i - x) / w
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx
          const ny = y + dy
          const j = ny * w + nx
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || back[j] >= 0) continue
          // (his ship on show in the hangar stands in the way too)
          if (room.ship && Math.hypot(((nx + 0.5) * tile - room.ship.x) / (room.ship.rx ?? 50), ((ny + 0.5) * tile - room.ship.y) / (room.ship.ry ?? 91)) < 1.15) continue
          if (!open[j] && j !== to) continue
          back[j] = i
          queue.push(j)
        }
      }
      if (back[to] < 0) return null
      const path = []
      for (let i = to; i !== from; i = back[i]) path.push({ x: ((i % w) + 0.5) * tile, y: (Math.floor(i / w) + 0.5) * tile })
      return path.reverse()
    },
    [tx, ty],
  )
}

/** walks to a point (px) with the keys, or a finger held off the middle of the screen (a phone's stick) */
async function stepTo(page, x, y, cdp) {
  for (let i = 0; i < 30; i++) {
    const me = await page.evaluate(() => window.__xenophon.scene.interior)
    const dx = x - me.x
    const dy = y - me.y
    if (Math.hypot(dx, dy) < 2.5) break
    if (cdp) {
      const vp = page.viewportSize()
      const d = Math.hypot(dx, dy)
      const fx = Math.round(vp.width / 2 + (dx / d) * 40)
      const fy = Math.round(vp.height / 2 + (dy / d) * 40)
      await cdp.send('Input.dispatchTouchEvent', { type: i === 0 ? 'touchStart' : 'touchMove', touchPoints: [{ x: fx, y: fy, id: 3 }] })
      await page.waitForTimeout(Math.min(250, (d / 30) * 1000))
    } else {
      const keys = []
      if (dx > 1.5) keys.push('d')
      if (dx < -1.5) keys.push('a')
      if (dy > 1.5) keys.push('s')
      if (dy < -1.5) keys.push('w')
      for (const k of keys) await page.keyboard.down(k)
      await page.waitForTimeout(Math.min(250, (Math.max(Math.abs(dx), Math.abs(dy)) / 30) * 1000))
      for (const k of keys) await page.keyboard.up(k)
    }
  }
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** walks to a tile of the room along the way through it; false if there is no way */
export async function walkToTile(page, tx, ty, opts = {}) {
  const path = await wayTo(page, tx, ty)
  if (!path) return false
  // (a turn at each corner of the way, straight runs between)
  const corners = path.filter((p, i) => i === path.length - 1 || (path[i + 1].x - p.x !== p.x - (path[i - 1] ?? p).x) || path[i + 1].y - p.y !== p.y - (path[i - 1] ?? p).y)
  for (const p of corners) await stepTo(page, p.x, p.y, opts.cdp)
  return true
}

/** walks to stand by a spot of the room (the bench, the booth, a door…) until it is in reach; true if it is */
export async function walkToSpot(page, id, opts = {}) {
  const room = await page.evaluate(() => window.__xenophon.open())
  const s = room?.spots.find((x) => x.id === id)
  if (!s) return false
  const { w, tile, open } = room
  // (the open tile nearest the spot)
  let best = null
  for (let i = 0; i < open.length; i++) {
    if (!open[i]) continue
    const x = ((i % w) + 0.5) * tile
    const y = (Math.floor(i / w) + 0.5) * tile
    const d = Math.hypot(x - s.x, y - s.y)
    if (!best || d < best.d) best = { i, d }
  }
  if (!best) return false
  await walkToTile(page, best.i % w, Math.floor(best.i / w), opts)
  await stepTo(page, s.x, s.y, opts.cdp)
  if ((await page.evaluate(() => window.__xenophon.scene.interior.spot)) === id) return true
  // (the walk fell short, a visitor or a slow machine in the way: put by the spot, said so, so a tool that is checking
  // the screen behind it carries on)
  console.warn(`walkToSpot: put by the ${id} (the walk there fell short)`)
  await page.evaluate(([x, y]) => {
    const j = window.__xenophon.inner().interior.me.jet
    j.x = x
    j.y = y
  }, [s.x, s.y])
  await page.waitForTimeout(200)
  return (await page.evaluate(() => window.__xenophon.scene.interior.spot)) === id
}
