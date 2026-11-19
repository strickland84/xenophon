// Walks on foot in a real browser at the common screen sizes and pixel ratios and writes a run of screenshots of each
// (the page's own pixels, at the device's resolution), to look at whether the ground stays still and every art pixel is
// one size (James's first play: "the pixel engine is not smooth … almost scan lines"). Each size gets a pilot of its own,
// out of his ship on his base's pad; the camera is turned first as landing at an angle leaves it (`--turn 0.5`).
//
//   npm run dev -- --port 5315                     # in another terminal
//   node tools/foot-smooth.mjs out/ [http://localhost:5315/] [--turn 0.5]
//
// Writes <out>/<w>x<h>@<dpr>-<n>.png (n: shots in a row while walking) and prints each canvas's size and place.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const turnAt = args.indexOf('--turn')
const turn = turnAt >= 0 ? Number(args.splice(turnAt, 2)[1]) : 0
const [out = 'smooth', base = 'http://localhost:5315/'] = args
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
// (our own headless browser: nothing here attaches to a browser already running)
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const SIZES = [
  { width: 1366, height: 768, dpr: 1 },
  { width: 1366, height: 768, dpr: 1.25 },
  { width: 1920, height: 1080, dpr: 1 },
  { width: 1536, height: 864, dpr: 1.25 },
  { width: 1280, height: 720, dpr: 1.5 },
  { width: 844, height: 390, dpr: 1, phone: true },
  { width: 844, height: 390, dpr: 2, phone: true },
  { width: 844, height: 390, dpr: 3, phone: true },
]
const errors = []
for (const s of SIZES) {
  const context = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: s.dpr,
    hasTouch: !!s.phone,
    isMobile: !!s.phone,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${base}?net=off&tutorial=off&intro=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type('WALKER')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /Fly for The Anarchoi/ }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForFunction(() => window.__xenophon)
  await page.waitForTimeout(2000)
  if (turn) await page.evaluate((t) => (window.__xenophon.inner().rig.topYaw = t), turn)
  await page.mouse.move(s.width / 2, s.height / 3)
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(1600)
  if (turn) await page.evaluate((t) => (window.__xenophon.inner().rig.topYaw = t), turn)
  await page.keyboard.down('KeyD')
  await page.keyboard.down('KeyS')
  await page.waitForTimeout(1500)
  const tag = `${s.width}x${s.height}@${s.dpr}`
  for (let n = 0; n < 4; n++) await page.screenshot({ path: path.join(out, `${tag}-${n}.png`) })
  await page.keyboard.up('KeyD')
  await page.keyboard.up('KeyS')
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { w: c.width, h: c.height, css: [r.left, r.top, r.width, r.height], dpr: devicePixelRatio, stage: window.__xenophon.scene.foot.stage }
  })
  console.log(tag, JSON.stringify(info), 'art px', ((info.css[2] / info.w) * info.dpr).toFixed(3), 'device px')
  await context.close()
}
await browser.close()
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors on the page')
