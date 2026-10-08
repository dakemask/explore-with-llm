// 转为分支 (Product decisions › Side questions): the card fades out, nothing on screen moves. Part 3 of the
// scroll suites.
// Copy this folder into the session scratchpad (where playwright-core is installed) and run
// `node scroll-branch-suite.mjs` there (or `node run-all.mjs scroll` for all scroll parts), with `pnpm dev` on 5173 and
// `PORT=8788 DELAY=20 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { open, waitDone, SC, SP, state, setScroll, clickAt, hoverAt, topIn, collapseCard, openConversation, newChat } from './lib.mjs'
import { CARD, CS, watch, unwatch, composer, start, pickModel, atEnd, lastToggle } from './scroll-lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const { browser, page } = await open({ model: 'mock-chat' })

// ---- BR: 转为分支 — the card, bar and highlight fade out, nothing on screen moves: asked from the last turn
// (at the end, following) the thread continues the chat below without being followed; asked again (a second
// branch at that fork) the new switcher dot pops in ----
await start(page, 'BR')
await waitDone(page)
const askOnFirst = async () => {
  const p = page.locator(`${SC} [data-turn]`).first().locator('[data-anchor-root]:not([data-anchor-target]) > div > p').first()
  const pb = await p.boundingBox()
  await page.mouse.move(pb.x + 2, pb.y + 12)
  await page.mouse.down()
  await page.mouse.move(pb.x + 120, pb.y + 12, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '追问' }).click()
  await page.waitForTimeout(600)
  await page.locator(`${CARD} textarea`).press('End')
  await page.keyboard.type('侧边 BR')
  await page.keyboard.press('Enter')
  await waitDone(page)
}
const convertCard = async () => {
  await page.locator(`${CARD} header`).getByRole('button', { name: '更多' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('menuitem', { name: '转为分支' }).click()
}
/** Logs the expanded card's opacity every frame (null once it's gone). */
const watchCard = () =>
  page.evaluate((CARD) => {
    window.__op = []
    const tick = () => {
      const el = document.querySelector(CARD)
      window.__op.push(el ? +getComputedStyle(el).opacity : null)
      if (el) requestAnimationFrame(tick)
    }
    tick()
  }, CARD)
/** It faded through the middle to (nearly) nothing before it went. */
const faded = () =>
  page.evaluate(() => {
    const op = window.__op
    return op.some((o) => o !== null && o > 0.2 && o < 0.8) && op.at(-1) === null && op.at(-2) < 0.05
  })

await askOnFirst()
await setScroll(page, SC, 1e7) // at the end: following
await page.waitForTimeout(300)
const userBox = await page.locator(`${SC} [data-turn]`).first().boundingBox()
await watchCard()
await watch(page, userBox.x + userBox.width - 30, Math.max(userBox.y, 60) + 10)
await convertCard()
await page.waitForTimeout(1000)
const br1 = await unwatch(page)
check('BR1 the card fades out', await faded(), await page.evaluate(() => window.__op))
check('BR1 highlight and bar gone', (await page.locator(`${SC} .anchor-hl`).count()) === 0 && (await page.locator('[data-side-column] button[aria-label]').count()) === 0)
check('BR1 the thread continues the chat', (await page.locator(`${SC} [data-turn]`).count()) === 2)
check('BR1 nothing on screen moved, the added turn not followed', br1.maxStep === 0 && br1.total === 0, br1)

await page.waitForTimeout(1300)
await setScroll(page, SC, 0)
await page.waitForTimeout(1300)
await askOnFirst()
const firstBox = await page.locator(`${SC} [data-turn]`).first().boundingBox()
await watch(page, firstBox.x + firstBox.width - 30, Math.max(firstBox.y, 60) + 10)
await convertCard()
await page.waitForTimeout(400)
check('BR2 the new branch dot pops in', (await page.locator(`${SC} .anim-branch-in`).count()) === 1)
await page.waitForTimeout(1500)
const br2 = await unwatch(page)
check('BR2 nothing on screen moved, still the first branch shown', br2.maxStep === 0 && br2.total === 0 && (await page.locator(`${SC} [data-turn]`).count()) === 2, br2)
check('BR2 the dot animation ends', (await page.locator(`${SC} .anim-branch-in`).count()) === 0)

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
