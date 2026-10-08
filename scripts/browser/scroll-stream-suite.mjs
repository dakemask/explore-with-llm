// Scrolling while replies stream (Product decisions › Scrolling): following, selecting, scrolling away,
// unfolding / folding reasoning, switching versions, retrying. Part 1 of the scroll suites.
// Copy this folder into the session scratchpad (where playwright-core is installed) and run
// `node scroll-stream-suite.mjs` there (or `node run-all.mjs scroll` for all scroll parts), with `pnpm dev` on 5173 and
// `PORT=8788 DELAY=20 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { open, waitDone, SC, SP, state, setScroll, clickAt, hoverAt, topIn, collapseCard, openConversation, newChat } from './lib.mjs'
import { CARD, CS, watch, unwatch, composer, start, pickModel, atEnd, lastToggle } from './scroll-lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const { browser, page } = await open({ model: 'mock-chat' })
await start(page, '先来一轮')
await waitDone(page)
await pickModel(page, 'mock-chat', 'mock-long')

// ---- M1: following: the view keeps up with the reply, reasoning stays folded ----
await start(page, 'M1')
await page.waitForTimeout(2500)
check('M1 reasoning folded while thinking', (await page.locator(`${SC} [data-fork]`).last().locator('.prose-reasoning').count()) === 0)
await waitDone(page)
check('M1 at the end after the reply', atEnd(await state(page)), await state(page))

// ---- S: dragging out a selection while following: nothing moves (also after letting go) ----
const forksS = await page.locator(`${SC} [data-fork]`).count()
await start(page, 'S')
// (the reply's text has started and still streams: the view follows it)
await page.waitForFunction(
  ({ sc, n }) => document.querySelectorAll(`${sc} [data-fork]`)[n]?.querySelector('.group\\/assistant p') && document.querySelector('[aria-label="停止"]'),
  { sc: SC, n: forksS },
  { timeout: 20000 },
)
const sp = await page.evaluate((sc) => {
  const box = document.querySelector(sc).getBoundingClientRect()
  const ps = [...document.querySelectorAll(`${sc} .group\\/assistant p`)]
  const p = ps.map((p) => p.getBoundingClientRect()).find((r) => r.top > box.top + 20 && r.bottom < box.bottom - 200 && r.width > 200)
  return p && { x: p.x, y: p.y, w: p.width }
}, SC)
if (!sp) check('S found a paragraph to select', false)
else {
  await page.mouse.move(sp.x + 2, sp.y + 12)
  await page.mouse.down()
  await page.mouse.move(sp.x + 150, sp.y + 12, { steps: 5 })
  await watch(page, sp.x + 4, sp.y + 12)
  await page.waitForTimeout(1500)
  const held = await unwatch(page)
  check('S selecting stops following', held.maxStep === 0 && held.total === 0, held)
  await page.mouse.up()
  await watch(page, sp.x + 4, sp.y + 12)
  await waitDone(page)
  const after = await unwatch(page)
  check('S still after letting go (through the reply)', after.maxStep === 0 && after.total === 0, after)
  await page.keyboard.press('Escape') // (drops the selection pill)
}
await setScroll(page, SC, 1e6)
await page.waitForTimeout(1300)

// ---- M2: scrolled up while thinking: nothing on screen moves, through the reply starting ----
await start(page, 'M2')
await page.waitForTimeout(1200)
await page.mouse.move(700, 400)
await page.mouse.wheel(0, -250)
await page.waitForTimeout(300)
await watch(page, 800, 420)
await waitDone(page)
check('M2 view still', (await unwatch(page)).maxStep === 0, await unwatch(page))

// ---- M3: unfold while thinking (following): the view stops following and stays; read on past the top
// (the toggle sticks), scroll up a bit: still nothing moves ----
await setScroll(page, SC, 1e6)
await page.waitForTimeout(1300)
await start(page, 'M3')
await page.waitForTimeout(800)
const tg = lastToggle(page)
const before = await topIn(page, SC, '[data-fork] .sticky button')
const tb = await tg.boundingBox()
await watch(page, tb.x + 4, tb.y + tb.height / 2)
await clickAt(page, tg)
await page.waitForTimeout(2500)
const m3a = await unwatch(page)
check('M3 toggle stays when unfolded, no follow afterwards', m3a.maxStep === 0 && m3a.total === 0, m3a)
await page.waitForTimeout(2500) // (more reasoning to read)
await page.mouse.move(700, 400)
await page.mouse.wheel(0, before + 600)
await page.waitForTimeout(300)
check('M3 toggle sticks at the top when reading on', (await topIn(page, SC, '[data-fork] .sticky button')) <= 1, await topIn(page, SC, '[data-fork] .sticky button'))
await page.mouse.wheel(0, -150)
await page.waitForTimeout(300)
await watch(page, 800, 420)
await waitDone(page)
const m3 = await unwatch(page)
check('M3 view still after scrolling up (incl. reply start)', m3.maxStep === 0, m3)

// ---- M4: fold from the stuck toggle: it stays at the top, the reply right below ----
// Put the reasoning's start 600px above the top (scrolling by hand): its toggle sticks.
const st4 = await state(page)
const top4 = await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const r = [...box.querySelectorAll('[data-fork] .sticky')].at(-1).parentElement.getBoundingClientRect()
  return r.top - box.getBoundingClientRect().top
}, SC)
await setScroll(page, SC, st4.scrollTop + top4 + 600)
const t4 = top4
const stuck = await topIn(page, SC, '[data-fork] .sticky button')
await clickAt(page, lastToggle(page))
await page.waitForTimeout(500)
check('M4 folded toggle stays at the top', Math.abs((await topIn(page, SC, '[data-fork] .sticky button')) - stuck) <= 1, { t4, stuck, after: await topIn(page, SC, '[data-fork] .sticky button') })
await page.screenshot({ path: `${SP}/M4.png` })

// ---- M5: switch versions at the end: switcher stays ----
await page.waitForTimeout(1300)
await pickModel(page, 'mock-long', 'mock-chat')
await setScroll(page, SC, 1e6)
await page.waitForTimeout(1300)
const last = page.locator(`${SC} [data-fork]`).last()
await hoverAt(page, last.locator('button[aria-label="重新生成"]').last())
const r0 = await topIn(page, SC, '[data-fork]')
await page.screenshot({ path: `${SP}/M5-before.png` })
await clickAt(page, last.locator('button[aria-label="重新生成"]').last())
await page.waitForTimeout(150)
check('M5 retry: new node top in place', Math.abs((await topIn(page, SC, '[data-fork]')) - Math.max(0, r0)) <= 1, { r0, now: await topIn(page, SC, '[data-fork]') })
await waitDone(page)
check('M5 retry: node top not scrolled above the top', (await topIn(page, SC, '[data-fork]')) >= -1, await topIn(page, SC, '[data-fork]'))
await setScroll(page, SC, 1e6)
await page.waitForTimeout(1300)
const sw0 = await topIn(page, SC, '[data-switcher]')
await clickAt(page, page.locator(`${SC} [data-switcher] button`).first())
await page.waitForTimeout(600)
const sw1 = await topIn(page, SC, '[data-switcher]')
await clickAt(page, page.locator(`${SC} [data-switcher] button`).last())
await page.waitForTimeout(600)
const sw2 = await topIn(page, SC, '[data-switcher]')
check('M6 switcher stays across switches', Math.abs(sw1 - sw0) <= 1 && Math.abs(sw2 - sw0) <= 1, { sw0, sw1, sw2 })

// ---- R: retry from a tall reply (blank below), unfold the reasoning while it streams: nothing moves ----
await pickModel(page, 'mock-chat', 'mock-long')
await page.waitForTimeout(1300)
await setScroll(page, SC, 1e6)
await page.waitForTimeout(300)
const lastR = page.locator(`${SC} [data-fork]`).last()
await hoverAt(page, lastR.locator('button[aria-label="重新生成"]').last())
await clickAt(page, lastR.locator('button[aria-label="重新生成"]').last())
await page.waitForTimeout(2000)
check('R blank below after the retry', (await state(page)).pad !== '0', await state(page))
const tr = await lastToggle(page).boundingBox()
await watch(page, tr.x + 4, tr.y + tr.height / 2)
await clickAt(page, lastToggle(page))
await waitDone(page)
const r = await unwatch(page)
check('R view still after unfolding (through the reply)', r.maxStep === 0 && r.total === 0, r)
await page.screenshot({ path: `${SP}/R.png` })
await pickModel(page, 'mock-long', 'mock-chat')

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
