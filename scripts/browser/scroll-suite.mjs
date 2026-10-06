// Streaming scroll scenarios (Product decisions › Scrolling). Copy this folder into the session scratchpad (where
// playwright-core is installed) and run `node scroll-suite.mjs` there, with `pnpm dev` on 5173 and
// `PORT=8788 DELAY=20 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { open, waitDone, SC, SP, state, setScroll, clickAt, topIn } from './lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

/** Starts watching the element at (x, y): logs its screen top every frame. */
const watch = (page, x, y) =>
  page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      window.__w = { el, tops: [], on: true }
      const tick = () => {
        if (!window.__w.on) return
        window.__w.tops.push(el.isConnected ? el.getBoundingClientRect().top : NaN)
        requestAnimationFrame(tick)
      }
      tick()
      return el.textContent.slice(0, 30)
    },
    { x, y },
  )
/** Stops watching: the largest move between two frames, and the total move. */
const unwatch = (page) =>
  page.evaluate(() => {
    window.__w.on = false
    const t = window.__w.tops
    let maxStep = 0
    for (let i = 1; i < t.length; i++) maxStep = Math.max(maxStep, Math.abs(t[i] - t[i - 1]) || (isNaN(t[i]) ? 9999 : 0))
    return { frames: t.length, maxStep: Math.round(maxStep), total: Math.round(t.at(-1) - t[0]) }
  })

const composer = (page) => page.locator('main > div.shrink-0 textarea')
async function start(page, text) {
  await composer(page).fill(text)
  await composer(page).press('Enter')
}
async function pickModel(page, from, to) {
  await page.locator('main > div.shrink-0 button', { hasText: from }).click()
  await page.locator(`[role=menu] >> text=${to}`).first().click()
}
const atEnd = (s) => s.max - s.scrollTop < 2
const lastToggle = (page, scope = SC) => page.locator(`${scope} [data-fork] .sticky button`).last()

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
await last.locator('.group\\/assistant').hover()
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
await lastR.locator('.group\\/assistant').hover()
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

// ---- C: side card ----
await page.waitForTimeout(1300)
await setScroll(page, SC, 0)
await page.waitForTimeout(1300)
const para = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).first()
const b = await para.boundingBox()
await page.mouse.move(b.x + 2, b.y + 12)
await page.mouse.down()
await page.mouse.move(b.x + 120, b.y + 12, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(300)
await page.screenshot({ path: `${SP}/C0.png` })
const sc0 = await state(page)
await page.getByRole('button', { name: '追问' }).click()
await page.waitForTimeout(600)
check('C1 expanding a card does not scroll the page', (await state(page)).scrollTop === sc0.scrollTop, { before: sc0, after: await state(page) })
const CARD = '[data-side-column] .shadow-pop'
const CS = `${CARD} .overflow-y-auto`
const fit = await page.evaluate((sel) => {
  const c = document.querySelector(sel).getBoundingClientRect()
  const v = document.querySelector('main > div.overflow-y-auto').getBoundingClientRect()
  return { cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), viewTop: Math.round(v.top), viewBottom: Math.round(v.bottom) }
}, CARD)
check('C1 card fits on screen (input box visible)', fit.cardBottom <= fit.viewBottom && fit.cardTop >= fit.viewTop, fit)
await page.screenshot({ path: `${SP}/C1.png` })
const h0 = (await page.locator(CARD).boundingBox()).height
await pickModel(page, 'mock-chat', 'mock-long').catch(() => {})
const cardBox = page.locator(`${CARD} textarea`)
await clickAt(page, cardBox)
await page.keyboard.press('End')
await page.keyboard.type('侧边 C2')
await page.keyboard.press('Enter')
check('C2 typing in the card does not scroll the page', (await state(page)).scrollTop === sc0.scrollTop, await state(page))
await page.waitForTimeout(1500)
const cb = await page.locator(CS).boundingBox()
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
await page.mouse.wheel(0, -120)
await page.waitForTimeout(300)
const pageBefore = await state(page)
await watch(page, cb.x + cb.width / 2, cb.y + cb.height / 2)
await waitDone(page)
const c2 = await unwatch(page)
check('C2 card view still after scrolling up inside it', c2.maxStep === 0, c2)
check('C2 page did not move', (await state(page)).scrollTop === pageBefore.scrollTop, { pageBefore, after: await state(page) })
const h1 = (await page.locator(CARD).boundingBox()).height
check('C2 card height fixed', Math.abs(h1 - h0) <= 1, { h0, h1 })
await page.screenshot({ path: `${SP}/C2.png` })

// following inside the card
await page.keyboard.type('侧边 C3')
await page.keyboard.press('Enter')
await waitDone(page)
check('C3 card follows its reply to the end', atEnd(await state(page, CS)), await state(page, CS))
await page.screenshot({ path: `${SP}/C3.png` })

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
