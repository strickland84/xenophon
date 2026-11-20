// What the built site makes a player download, and when (the plan's section 20): the first screen; after the first
// click (the sound's files start then); a new pilot in the sky for half a minute; and the whole site on disk. Every
// response is counted as it came over the wire (compressed, as a host would send it: vite preview compresses as
// most static hosts do), by kind. Run it against the built site:
//
//   npm run build && npx vite preview --port 4173
//   node tools/download-size.mjs [http://localhost:4173/]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'http://localhost:4173/'
const cache = path.join(os.homedir(), '.cache/ms-playwright')
const chrome = fs
  .readdirSync(cache)
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  .map((d) => path.join(cache, d, 'chrome-linux64/chrome'))
  .find((f) => fs.existsSync(f))
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
const got = new Map()
const urls = new Map()
cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url))
cdp.on('Network.loadingFinished', (e) => got.set(e.requestId, e.encodedDataLength))
const kind = (u) =>
  /\/audio\/music\//.test(u)
    ? 'music'
    : /\/audio\//.test(u)
      ? 'sound effects'
      : /\.js(\?|$)/.test(u)
        ? 'code'
        : /\.css/.test(u)
          ? 'styles'
          : /\.(woff2?|ttf)/.test(u)
            ? 'fonts'
            : /\.(png|svg|webp|jpg)/.test(u)
              ? 'pictures'
              : /^wss?:/.test(u)
                ? 'relays'
                : 'pages and data'
const tally = (label) => {
  const by = {}
  let all = 0
  for (const [id, n] of got) {
    const k = kind(urls.get(id) ?? '')
    by[k] = (by[k] ?? 0) + n
    all += n
  }
  console.log(`${label}: ${(all / 1e6).toFixed(2)} MB  (${Object.entries(by).map(([k, n]) => `${k} ${(n / 1e6).toFixed(2)}`).join(', ')})`)
}
await page.goto(`${base}?net=off&intro=off`)
await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 30000 })
await page.waitForTimeout(1500)
tally('the first screen, before any click')
await page.getByRole('button', { name: 'Play' }).click()
await page.waitForTimeout(2500)
tally('after the first click (the sound begins)')
await page.keyboard.type('WEIGHT')
await page.getByRole('button', { name: 'Next' }).click()
await page.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
await page.getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(30000)
tally('a new pilot, half a minute in the sky')
await browser.close()
// and the site as it stands on disk (every take of every effect is there, not only those played)
const sizeOf = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? sizeOf(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../build')
if (fs.existsSync(root))
  console.log(`the built site on disk: ${(sizeOf(root) / 1e6).toFixed(1)} MB (of it the sounds and music, every take: ${(sizeOf(path.join(root, 'audio')) / 1e6).toFixed(1)} MB)`)
