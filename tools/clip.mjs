// A clip, end to end in a browser this tool starts itself: a pilot takes off, flies a while, presses Clip (X), and must
// be shown a short film of the last seconds that plays, of the size and length it should be; the film is saved to the
// folder given with a screenshot of the panel. Run it after changing display/clips.ts or the page's side of it.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/clip.mjs out/ [http://localhost:5173/]
//
// It uses the Chromium that Playwright keeps in ~/.cache/ms-playwright (CHROME=… for another), launched here, headless:
// it never attaches to a browser that is already running.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'clip', base = 'http://localhost:5173/'] = process.argv.slice(2)
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
const fail = (why) => {
  console.error('FAILED:', why)
  process.exitCode = 1
}

const browser = await chromium.launch({
  executablePath: chrome,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
try {
  await page.goto(`${base}?net=off&tutorial=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type('ACE')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForFunction(() => window.__xenophon, null, { timeout: 30000 })
  await page.waitForTimeout(1200)
  // off the pad, and round in a turn for a while: something to film
  await page.keyboard.press('p')
  await page.waitForTimeout(2600)
  await page.keyboard.down('f')
  await page.waitForFunction(() => window.__xenophon.scene.loop.stage === 'flying', null, { timeout: 15000 })
  await page.keyboard.up('f')
  await page.keyboard.down('d')
  await page.waitForTimeout(11000)
  await page.keyboard.up('d')
  await page.keyboard.press('x')
  const video = page.locator('video')
  await video.waitFor({ timeout: 15000 })
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 15000 })
  await page.waitForTimeout(900)
  const film = await page.evaluate(async () => {
    const v = document.querySelector('video')
    const blob = await (await fetch(v.src)).blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { type: blob.type, size: blob.size, w: v.videoWidth, h: v.videoHeight, at: v.currentTime, playing: !v.paused, data: btoa(text) }
  })
  const said = await page.getByText(/seconds/).first().innerText()
  const name = `clip.${film.type.includes('mp4') ? 'mp4' : 'webm'}`
  fs.writeFileSync(path.join(out, name), Buffer.from(film.data, 'base64'))
  await page.screenshot({ path: path.join(out, 'the-clip-panel.png') })
  console.log(`the film: ${film.type}, ${(film.size / 1024).toFixed(0)} KB, ${film.w} × ${film.h}, playing ${film.playing} (at ${film.at.toFixed(1)} s); the panel says "${said}"; saved as ${name}`)
  const seconds = Number(/(\d+)/.exec(said)?.[1] ?? 0)
  if (!film.type.startsWith('video/')) fail('not a film')
  if (film.size < 100_000) fail('the film is next to nothing')
  if (film.w < 800 || film.h < 450 || film.w % 2 || film.h % 2) fail('the film is not the size it should be')
  if (seconds < 8 || seconds > 17) fail(`it should hold the last 8 to 16 seconds, and says ${seconds}`)
  if (!film.playing && film.at === 0) fail('the film does not play')
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'the clip FAILED' : 'the clip works')
