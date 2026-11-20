// Checks the game's sound in a real browser, with no one listening (nobody on this machine can hear):
//
//   1. every file the game plays (and every take, for the sampler page) is fetched and decoded by the
//      browser, and is as long as the catalogue says;
//   2. every kind of event the engine reports is sent to the game's own player (audio/sound.ts), and
//      the sound that plays is the one audio/cues.ts says, with nothing missed;
//   3. scripted scenes (a fight, flying, the engines, on foot, the interface, the music by place and
//      a fight coming and going) are mixed by the game's own player, mixer and music, in an
//      OfflineAudioContext, faster than time, and measured (peak, clipping, loudness), and written as
//      WAVs (tools/audio/samplers.py makes James's sampler files from them);
//   4. the real page, opened and clicked, fetches its music and its clicks without an error.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/sound-check.mjs [out/] [http://localhost:5173/]      # from the project's folder
//
// It writes out/<scene>.wav (art/audio/raw/scenes, not kept in git) and what it found to
// art/audio/checks/sound-check.json.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'art/audio/raw/scenes', base = 'http://localhost:5173/'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const cache = path.join(os.homedir(), '.cache/ms-playwright')
const chrome =
  process.env.CHROME ??
  fs
    .readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((d) => path.join(cache, d, 'chrome-linux64/chrome'))
    .find((f) => fs.existsSync(f))
const browser = await chromium.launch({ executablePath: chrome, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
// (the browser asks every page for /favicon.ico, which the site does not have: not the sound's)
const real404 = (m) => m.type() === 'error' && !(m.location()?.url ?? '').endsWith('favicon.ico')
page.on('console', (m) => real404(m) && errors.push(m.text()))
// (a page of the dev server that runs nothing of its own: the game's modules are imported into it)
await page.goto(`${base}robots.txt`)

/** a WAV file of 16-bit samples, two channels (interleaved, as bytes) */
function wav(pcm, rate) {
  const n = pcm.length / 4
  const buf = Buffer.alloc(44)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 4, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 4, 40)
  return Buffer.concat([buf, pcm])
}

const report = { errors }

// ── 1. every file decodes, and is as long as the catalogue says
report.files = await page.evaluate(async () => {
  const { EFFECTS } = await import('/src/lib/audio/catalogue.ts')
  const { PIECES } = await import('/src/lib/audio/pieces.ts')
  const { effectPath, piecePath } = await import('/src/lib/audio/library.ts')
  const ctx = new OfflineAudioContext(1, 44100, 44100)
  const failed = []
  const longer = []
  let n = 0
  const check = async (p, seconds) => {
    try {
      const r = await fetch('/' + p)
      if (!r.ok) throw new Error(String(r.status))
      const b = await ctx.decodeAudioData(await r.arrayBuffer())
      n++
      // (a decoder may pad a file a little; more than a tenth of a second is wrong)
      if (Math.abs(b.duration - seconds) > 0.1) longer.push(`${p}: ${b.duration.toFixed(2)}s, the catalogue says ${seconds}s`)
    } catch (e) {
      failed.push(`${p}: ${e.message}`)
    }
  }
  for (const [name, clip] of Object.entries(EFFECTS))
    for (const t of clip.takes) {
      await check(effectPath(name, t.n), t.seconds)
    }
  for (const [name, clip] of Object.entries(PIECES))
    for (const t of clip.use) {
      const s = clip.takes.find((x) => x.n === t).seconds
      await check(piecePath(name, t), s)
    }
  return { decoded: n, failed, longer }
})
console.log(`files: ${report.files.decoded} decoded, ${report.files.failed.length} failed, ${report.files.longer.length} not as long as they should be`)

// ── 2. every kind of event plays the sound the table says
report.events = await page.evaluate(async () => {
  const { createMixer } = await import('/src/lib/audio/mixer.ts')
  const { createSound } = await import('/src/lib/audio/sound.ts')
  const { libraryFor } = await import('/src/lib/audio/library.ts')
  const { CUES, cueSound, cueGain, loadingOrder } = await import('/src/lib/audio/cues.ts')
  const { GROUNDS } = await import('/src/lib/engine/sim/effects.ts')
  const { RACE_IDS } = await import('/src/lib/engine/races/races.ts')
  const events = []
  for (const kind of Object.keys(CUES))
    for (const own of [true, false]) {
      const whats = kind === 'step' ? GROUNDS : kind === 'deploy' ? RACE_IDS : kind === 'burn' ? ['lava', 'acid'] : ['']
      const sizes = kind === 'explosion' ? [0.35, 0.8] : [1]
      for (const what of whats) for (const size of sizes) events.push({ kind, pan: own ? 0 : 0.4, gain: 0.9, size, own, what })
    }
  const rate = 22050
  const gap = 1.05
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * (events.length * gap + 1)), rate)
  const mixer = createMixer(ctx)
  const sound = createSound({ mixer })
  await libraryFor(ctx).load(loadingOrder())
  const expected = {}
  events.forEach((e, i) => {
    if (cueGain(e) > 0.001) expected[cueSound(e)] = (expected[cueSound(e)] ?? 0) + 1
    ctx.suspend(0.1 + i * gap).then(() => {
      sound.play([e])
      ctx.resume()
    })
  })
  await ctx.startRendering()
  const r = sound.report
  const wrong = []
  for (const name of new Set([...Object.keys(expected), ...Object.keys(r.played)]))
    if ((expected[name] ?? 0) !== (r.played[name] ?? 0)) wrong.push(`${name}: expected ${expected[name] ?? 0}, played ${r.played[name] ?? 0}`)
  return { sent: events.length, played: Object.values(r.played).reduce((a, b) => a + b, 0), missed: r.missed, failed: r.failed, wrong }
})
console.log(`events: ${report.events.sent} sent, ${report.events.played} played, ${report.events.missed} missed, ${report.events.wrong.length} wrong`)

// ── 3. the scenes, mixed as the game mixes them
const SCENES = ['combat', 'flying', 'engines', 'on-foot', 'interface', 'music']
report.scenes = {}
for (const name of SCENES) {
  const r = await page.evaluate(async (name) => {
    const { createMixer } = await import('/src/lib/audio/mixer.ts')
    const { createSound } = await import('/src/lib/audio/sound.ts')
    const { libraryFor, piecePath } = await import('/src/lib/audio/library.ts')
    const { loadingOrder } = await import('/src/lib/audio/cues.ts')
    const { createMusic } = await import('/src/lib/audio/music.ts')
    const { PIECES } = await import('/src/lib/audio/pieces.ts')
    const { MOODS } = await import('/src/lib/audio/moods.ts')

    // a scene: its length, the player as he stands at the start, and what happens when
    const L = {
      flying: true,
      landed: false,
      hull: 'corsair',
      speed: 92,
      boost: 0,
      throttle: 0.6,
      hullLeft: 1,
      lock: 0,
      incoming: 99,
      mining: false,
      cutting: false,
      cruise: 'off',
      hole: 0,
    }
    const at = []
    const ev = (t, kind, o = {}) => at.push([t, (s) => s.play([{ kind, pan: 0, gain: 1, size: 1, own: true, what: '', ...o }])])
    const set = (t, change) => at.push([t, () => Object.assign(L, change)])
    const ramp = (t0, t1, key, a, b) => {
      for (let t = t0; t <= t1; t += 0.1) set(t, { [key]: a + ((b - a) * (t - t0)) / (t1 - t0) })
    }
    const place = (t, p) => at.push([t, (_, m) => m.setPlace(p)])
    const ui = (t, k) => at.push([t, (s) => s.ui(k)])
    let seconds = 20
    let music = 'combat'
    if (name === 'combat') {
      seconds = 25
      for (const t0 of [1, 3.6, 8, 12.4]) for (let t = t0; t < t0 + 1.2; t += 0.09) ev(t, 'cannon')
      for (let t = 2; t < 16; t += 0.23) ev(t, 'cannon', { own: false, gain: 0.55, pan: Math.sin(t) * 0.6 })
      for (const t of [1.3, 1.7, 3.9, 4.4, 8.3, 8.8]) ev(t, 'hit', { own: false, gain: 0.7, pan: 0.3, size: 0.5 })
      for (const t of [1.1, 3.7]) ev(t, 'shield', { own: false, gain: 0.7, pan: 0.3 })
      for (const t of [5, 5.3, 5.7]) ev(t, 'shield', { size: 0.6 })
      ev(6, 'shieldDown')
      for (const t of [6.5, 7, 7.2]) ev(t, 'hit', { size: 0.7 })
      ramp(9, 10.5, 'lock', 0.05, 0.99)
      ev(10.5, 'locked')
      set(10.5, { lock: 1 })
      set(11.2, { lock: 0 })
      ev(11.2, 'launch')
      ev(12.6, 'explosion', { own: false, gain: 0.8, size: 0.35, pan: 0.2 })
      ev(13, 'explosion', { own: false, gain: 0.85, size: 0.8, pan: 0.2 })
      ev(13.1, 'kill')
      ev(15, 'warning')
      ramp(15, 17.4, 'incoming', 3, 0.2)
      ev(17.5, 'dodged')
      set(17.6, { incoming: 99 })
      set(18, { boost: 1 })
      set(20, { boost: 0 })
      set(19, { hullLeft: 0.2 })
      ev(21, 'shieldUp')
      ev(22, 'explosion', { own: false, gain: 0.95, size: 1, pan: -0.3 })
    } else if (name === 'flying') {
      seconds = 38
      music = 'calm'
      set(0, { landed: true, speed: 0 })
      ev(1, 'lift')
      set(1.5, { landed: false })
      ramp(1.5, 4, 'speed', 10, 92)
      set(6, { boost: 1 })
      set(8, { boost: 0 })
      ev(9, 'thunder', { own: false, gain: 0.7, pan: 0.3 })
      ev(11, 'brake')
      ramp(11, 12.8, 'speed', 92, 0)
      ev(13, 'land')
      set(13, { landed: true })
      ev(14, 'bank')
      ev(16, 'lift')
      set(16.5, { landed: false })
      ramp(16.5, 18, 'speed', 10, 92)
      ev(19, 'breakout')
      place(21, 'space')
      ev(23, 'spool')
      set(23, { cruise: 'spool' })
      ev(24.2, 'cruise')
      set(24.2, { cruise: 'on', speed: 736 })
      set(29, { cruise: 'off', speed: 92 })
      ev(30, 'charge')
      ev(33, 'jump')
      ev(36, 'dock')
      set(36.5, { speed: 0, landed: true })
    } else if (name === 'engines') {
      // each size of drive: powered up on its pad, idling, lifting off and the throttle opened to full and back, the
      // thrusters, then powered down
      seconds = 45
      music = ''
      let t = 0.2
      for (const hull of ['dart', 'corsair', 'galleon']) {
        set(t, { hull, landed: true, speed: 0, boost: 0, throttle: 0, powered: false })
        set(t + 0.5, { powered: true, starting: true })
        set(t + 2.5, { starting: false })
        set(t + 4, { landed: false })
        ramp(t + 4, t + 8, 'throttle', 0, 1)
        ramp(t + 4, t + 8, 'speed', 0, 92)
        set(t + 9, { boost: 1 })
        set(t + 11, { boost: 0 })
        ramp(t + 11, t + 12.5, 'throttle', 1, 0.2)
        set(t + 13, { landed: true, speed: 0, throttle: 0 })
        set(t + 13.6, { powered: false })
        t += 15
      }
    } else if (name === 'on-foot') {
      seconds = 25
      music = 'harsh'
      set(0, { flying: true })
      ev(0.5, 'eject')
      set(0.6, { flying: false })
      ev(2.5, 'deploy', { what: 'solari' })
      ev(6, 'touchdown')
      for (let t = 7; t < 10; t += 0.47) ev(t, 'step', { what: 'soft', size: 0.5 })
      for (let t = 10; t < 12; t += 0.32) ev(t, 'step', { what: 'rock', size: 1 })
      ev(12.4, 'dive')
      for (let t = 13; t < 14.6; t += 0.35) ev(t, 'blaster')
      for (let t = 13.2; t < 15; t += 0.5) ev(t, 'blaster', { own: false, gain: 0.6, pan: -0.5 })
      set(15.5, { cutting: true })
      ev(16.5, 'chunk')
      ev(17.6, 'chunk')
      set(18.5, { cutting: false })
      ev(18.7, 'scoop')
      ev(19.5, 'flare')
      ev(21.2, 'beacon')
      ev(22.5, 'call')
      for (let t = 23; t < 24.5; t += 0.47) ev(t, 'step', { what: 'metal', size: 0.5 })
    } else if (name === 'interface') {
      seconds = 8
      music = 'map'
      const list = ['open', 'move', 'move', 'move', 'select', 'confirm', 'buy', 'error', 'move', 'select', 'close']
      list.forEach((k, i) => ui(0.5 + i * 0.65, k))
    } else if (name === 'music') {
      // each place's music in turn, as the game moves between them; a fight coming, heating up, going badly, cooling
      // and won; a new system reached, shot down, a world taken
      music = 'title'
      const order = ['calm', 'night', 'foot', 'harsh', 'space', 'cruise', 'hole', 'hangar', 'map', 'calm', 'alert', 'combat', 'peril', 'combat', 'calm']
      const stay = [20, 18, 18, 18, 18, 18, 18, 18, 18, 16, 14, 10, 12, 10, 8, 20]
      let t = stay[0]
      order.forEach((p, i) => {
        place(t, p)
        t += stay[i + 1]
      })
      const sting = (t, k) => at.push([t, (_, m) => m.sting(k)])
      sting(t - 18, 'win')
      sting(stay.slice(0, 6).reduce((a, b) => a + b, 0) + 6, 'arrive')
      sting(t - 8, 'taken')
      seconds = t
      set(0, { flying: false })
    }
    // (the music's scene is long: a lower rate keeps it in memory)
    const rate = name === 'music' ? 32000 : 44100
    const ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate)
    const mixer = createMixer(ctx)
    const sound = createSound({ mixer })
    await libraryFor(ctx).load(loadingOrder())
    // (the music's pieces decoded beforehand, so a change of place is heard at once)
    const decoded = new Map()
    // (with the chance at 0 each piece starts on its first take, and a piece broken into by a fight is resumed;
    // the calm world's and the fight's come twice in the music's scene, the second time on their next take)
    for (const [p, clip] of Object.entries(PIECES))
      for (const n of clip.use.slice(0, name === 'music' && (p === 'calm' || p === 'combat') ? 2 : 1)) {
        if (name !== 'music' && p !== music && !(name === 'flying' && p === 'space')) continue
        const path = piecePath(p, n)
        decoded.set(path, await ctx.decodeAudioData(await (await fetch('/' + path)).arrayBuffer()))
      }
    const chance = () => 0
    const tune = music ? createMusic({ mixer, buffers: true, decoded, chance }) : null
    if (music && music !== 'title') tune.setPlace(music)
    at.sort((a, b) => a[0] - b[0])
    let next = 0
    const step = 1 / 30
    for (let t = step; t < seconds - step; t += step)
      ctx.suspend(Math.round((t * rate) / 128) * (128 / rate)).then(() => {
        while (next < at.length && at[next][0] <= ctx.currentTime + 1e-6) at[next++][1](sound, tune)
        sound.update(L)
        tune?.tick()
        ctx.resume()
      })
    const buf = await ctx.startRendering()
    const l = buf.getChannelData(0)
    const r = buf.getChannelData(1)
    let peak = 0
    let clipped = 0
    for (let i = 0; i < l.length; i++) {
      const a = Math.max(Math.abs(l[i]), Math.abs(r[i]))
      peak = Math.max(peak, a)
      if (a >= 0.999) clipped++
    }
    const win = Math.floor(rate * 0.4)
    const levels = []
    for (let i = 0; i + win <= l.length; i += win) {
      let s = 0
      for (let j = i; j < i + win; j++) s += (l[j] * l[j] + r[j] * r[j]) / 2
      levels.push(10 * Math.log10(s / win + 1e-12))
    }
    const sorted = [...levels].sort((a, b) => a - b)
    // (the samples back as 16-bit, two channels, in base64: a list of millions of numbers would not fit)
    const pcm = new Int16Array(l.length * 2)
    for (let i = 0; i < l.length; i++) {
      pcm[i * 2] = Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767)))
      pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767)))
    }
    const bytes = new Uint8Array(pcm.buffer)
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return {
      seconds,
      peak: 20 * Math.log10(peak + 1e-12),
      clipped,
      loudest: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      missed: sound.report.missed,
      pcm: btoa(text),
      rate,
      moods: Object.keys(MOODS).length,
    }
  }, name)
  fs.writeFileSync(path.join(out, `${name}.wav`), wav(Buffer.from(r.pcm, 'base64'), r.rate))
  delete r.pcm
  report.scenes[name] = r
  console.log(
    `${name.padEnd(10)} ${r.seconds.toFixed(0).padStart(3)}s  peak ${r.peak.toFixed(1)} dBFS  clipped ${r.clipped}  loudest 0.4 s ${r.loudest.toFixed(1)} dB  median ${r.median.toFixed(1)} dB  missed ${r.missed}`,
  )
}

// ── 4. the real page: opened, clicked, its music and clicks fetched
const real = await browser.newPage()
const fetched = []
const bad = []
const sound = (u) => /\/audio\/(sfx|music)\//.test(u)
real.on('requestfinished', async (q) => {
  if (!sound(q.url())) return
  const res = await q.response()
  fetched.push(`${res?.status()} ${q.url().split('/audio/')[1]}`)
  if (!res || res.status() >= 400) bad.push(`${res?.status()} ${q.url()}`)
})
// (an <audio> element streaming a piece cancels and remakes its range requests as it goes: not a failure)
real.on('requestfailed', (q) => sound(q.url()) && !/ABORTED/.test(q.failure()?.errorText ?? '') && bad.push(`${q.failure()?.errorText} ${q.url()}`))
real.on('pageerror', (e) => errors.push(`page: ${e}`))
real.on('console', (m) => real404(m) && errors.push(`page: ${m.text()} ${m.location()?.url ?? ''}`))
await real.goto(`${base}?net=off&intro=off&pilot=soundcheck`)
await real.waitForTimeout(1500)
const before = fetched.length
await real.mouse.click(10, 10)
await real.waitForTimeout(4000)
await real.keyboard.press('KeyI')
await real.waitForTimeout(500)
const button = await real.$('button')
await button?.click()
await real.waitForTimeout(2500)
report.page = { beforeClick: before, fetched, bad }
console.log(`page: ${before} audio files before the first click, ${fetched.length} after; ${bad.length} failed`)

// … and in the sky: a new pilot lifts off, fires, opens the map; what the page played, and the music
await real.goto(`${base}?net=off&tutorial=off&pilot=soundcheck2`)
await real.getByRole('button', { name: 'Play' }).click()
await real.keyboard.type('Earless')
await real.getByRole('button', { name: 'Next' }).click()
await real.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
await real.getByRole('button', { name: 'Done' }).click()
await real.waitForFunction(() => window.__xenophon && window.__xenophonSound)
await real.waitForTimeout(2500)
const sky = { music: [] }
sky.music.push(await real.evaluate(() => window.__xenophon.music()))
// (the engines: humming landed, then lifted off and the throttle opened)
sky.engines = [await real.evaluate(() => ({ ...window.__xenophonSound.report.loops }))]
await real.keyboard.down('f')
await real.waitForTimeout(2500)
await real.keyboard.up('f')
await real.waitForTimeout(1500)
await real.keyboard.down('w')
await real.waitForTimeout(2000)
await real.keyboard.up('w')
await real.waitForTimeout(500)
sky.engines.push(await real.evaluate(() => ({ ...window.__xenophonSound.report.loops, throttle: window.__xenophon.scene.status.throttle })))
await real.keyboard.down('j')
await real.waitForTimeout(1500)
await real.keyboard.up('j')
await real.waitForTimeout(500)
sky.music.push(await real.evaluate(() => window.__xenophon.music()))
await real.keyboard.press('m')
await real.waitForTimeout(1500)
sky.music.push(await real.evaluate(() => window.__xenophon.music()))
await real.keyboard.press('Escape')
await real.waitForTimeout(1500)
sky.music.push(await real.evaluate(() => window.__xenophon.music()))
sky.report = await real.evaluate(() => window.__xenophonSound.report)
report.sky = sky
console.log(`sky: music ${sky.music.join(' → ')}; played ${JSON.stringify(sky.report.played)}; missed ${sky.report.missed}; failed ${sky.report.failed.length}`)
console.log(`sky: the engines landed ${JSON.stringify(sky.engines[0])}; flying, throttle opened ${JSON.stringify(sky.engines[1])}`)
console.log(`errors: ${errors.length}`)
for (const e of errors.slice(0, 10)) console.log('  ' + e)
fs.writeFileSync('art/audio/checks/sound-check.json', JSON.stringify(report, null, 1))
await browser.close()
