// Streaming scroll scenarios (Product decisions › Scrolling). Copy this folder into the session scratchpad (where
// playwright-core is installed) and run `node scroll-suite.mjs` there, with `pnpm dev` on 5173 and
// `PORT=8788 DELAY=20 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { open, waitDone, SC, SP, state, setScroll, clickAt, hoverAt, topIn, collapseCard } from './lib.mjs'

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

const composer = (page) => page.locator('main > [data-main-composer] textarea')
async function start(page, text) {
  await composer(page).fill(text)
  await composer(page).press('Enter')
}
async function pickModel(page, from, to) {
  await page.locator('main > [data-main-composer] button', { hasText: from }).click()
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

// ---- N: new conversation / switching back, also leaving with blank at the bottom ----
await collapseCard(page, page.locator(CARD))
await page.waitForTimeout(1300)
await setScroll(page, SC, 1e6)
await page.waitForTimeout(300)
const composerTop = () => page.evaluate(() => Math.round(document.querySelector('main > [data-main-composer]').getBoundingClientRect().top))
const cTop = await composerTop()
// make blank: fold a long reply's neighbour… simplest: switch the last turn to a shorter version at the end
const swN = page.locator(`${SC} [data-switcher] button`)
if (await swN.count()) {
  await clickAt(page, swN.first())
  await page.waitForTimeout(800)
}
const leaving = await state(page)
await page.getByRole('button', { name: '新对话' }).click()
await page.waitForTimeout(600)
const empty = await page.getByText('开始一段新的探索').boundingBox()
check('N new conversation: composer in place, empty state on screen', (await composerTop()) === cTop && !!empty && empty.y > 56 && empty.y < 794 && (await state(page)).scrollTop === 0, { leaving, now: await state(page), composer: await composerTop(), emptyY: empty?.y })
await page.locator('aside').getByText('先来一轮').first().click()
await page.waitForTimeout(800)
const back = await state(page)
check('N back to the conversation: at its end, no blank', back.max - back.scrollTop < 2 && back.pad === '0' && (await composerTop()) === cTop, back)

// ---- NC: note card near the bottom of the screen: fits on screen, fixed height; typing, 完成 and collapsing move nothing ----
await page.waitForTimeout(1300)
const lastPara = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).last()
const lp = await lastPara.boundingBox()
await page.mouse.move(lp.x + 2, lp.y + 12)
await page.mouse.down()
await page.mouse.move(lp.x + 120, lp.y + 12, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(300)
await page.getByRole('button', { name: '笔记', exact: true }).click()
await page.waitForTimeout(600)
const noteFit = await page.evaluate((CARD) => {
  const c = document.querySelector(CARD).getBoundingClientRect()
  const v = document.querySelector('main > div.overflow-y-auto').getBoundingClientRect()
  return { cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), viewTop: Math.round(v.top), viewBottom: Math.round(v.bottom) }
}, CARD)
check('NC note card opened near the bottom fits on screen', noteFit.cardBottom <= noteFit.viewBottom && noteFit.cardTop >= noteFit.viewTop, noteFit)
const nh0 = (await page.locator(CARD).boundingBox()).height
const nlp = await lastPara.boundingBox()
await watch(page, nlp.x + 20, nlp.y + 12)
for (let i = 0; i < 25; i++) {
  await page.keyboard.type('笔记第 ' + i + ' 行')
  await page.keyboard.press('Enter')
}
await page.getByRole('button', { name: '完成' }).click()
await page.waitForTimeout(500)
const nh1 = (await page.locator(CARD).boundingBox()).height
await collapseCard(page, page.locator(CARD))
await page.waitForTimeout(800)
const nc = await unwatch(page)
check('NC note card height fixed (empty → 25 lines → rendered)', Math.abs(nh1 - nh0) <= 1, { nh0, nh1 })
check('NC typing, 完成 and collapsing a note move nothing on the page', nc.maxStep === 0 && nc.total === 0, nc)

// ---- IB: the input box floats over the chat's bottom; at the end, typing lines into it (it grows) keeps the
// last reply above it (the room under the messages is an element the rules observe: as padding it went unseen
// and the box covered the reply); deleting them again pulls nothing up ----
await page.keyboard.press('Escape')
await page.waitForTimeout(1300)
// (Following went off with the text selection above: scroll away and back to the end to turn it on.)
await setScroll(page, SC, 0)
await setScroll(page, SC, 1e7)
await page.waitForTimeout(300)
const lastFooter = () =>
  page.evaluate((SC) => {
    const f = [...document.querySelectorAll(`${SC} [aria-label="复制"]`)].at(-1).getBoundingClientRect()
    const b = document.querySelector('main > [data-main-composer] .rounded-2xl').getBoundingClientRect()
    return { footerBottom: Math.round(f.bottom), boxTop: Math.round(b.top) }
  }, SC)
await composer(page).focus()
for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+Enter')
await page.waitForTimeout(300)
const grown = await lastFooter()
check('IB typing lines at the end keeps the last reply above the input box', grown.footerBottom <= grown.boxTop, grown)
const lfb = await page.locator(`${SC} [aria-label="复制"]`).last().boundingBox()
await watch(page, lfb.x + 4, lfb.y + 4)
for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace')
await page.waitForTimeout(400)
const shrink = await unwatch(page)
check('IB deleting them again pulls nothing up', shrink.total >= 0 && shrink.maxStep <= 1, shrink)

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
