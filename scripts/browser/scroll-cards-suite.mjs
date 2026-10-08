// Side / note cards, switching conversation and the floating input box (Product decisions › Scrolling).
// Part 2 of the scroll suites.
// Copy this folder into the session scratchpad (where playwright-core is installed) and run
// `node scroll-cards-suite.mjs` there (or `node run-all.mjs scroll` for all scroll parts), with `pnpm dev` on 5173 and
// `PORT=8788 DELAY=20 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { open, waitDone, SC, SP, state, setScroll, clickAt, hoverAt, topIn, collapseCard, openConversation, newChat } from './lib.mjs'
import { CARD, CS, watch, unwatch, composer, start, pickModel, atEnd, lastToggle } from './scroll-lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const { browser, page } = await open({ model: 'mock-chat' })
for (const q of ['先来一轮', '第二轮', '第三轮']) {
  await start(page, q)
  await waitDone(page)
}
// A second version of the last turn (the N checks switch versions to leave blank at the bottom).
const lastFork = page.locator(`${SC} [data-fork]`).last()
await hoverAt(page, lastFork.locator('button[aria-label="重新生成"]').last())
await clickAt(page, lastFork.locator('button[aria-label="重新生成"]').last())
await waitDone(page)

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
const swN = page.locator(`${SC} [data-fork]`).last().locator('[data-switcher] button')
if (await swN.count()) {
  await clickAt(page, swN.first())
  await page.waitForTimeout(800)
}
const leaving = await state(page)
await newChat(page)
await page.waitForTimeout(600)
const empty = await page.getByText('开始一段新的探索').boundingBox()
check('N new conversation: composer in place, empty state on screen', (await composerTop()) === cTop && !!empty && empty.y > 56 && empty.y < 794 && (await state(page)).scrollTop === 0, { leaving, now: await state(page), composer: await composerTop(), emptyY: empty?.y })
await openConversation(page, '先来一轮')
await page.keyboard.press('Escape')
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
