// The tree map window (components/chat/TreeMap.tsx): where it opens, moving / resizing (kept inside the
// viewport, remembered across reloads), staying open through jumps, "current" following the chat's scroll,
// changes while open (elements kept and animated, new units growing in, archived ones fading out), the
// mouse wheel scrolling sideways. Escape / outside clicks: layers-suite; conversation switch: switch-suite. Copy this folder into the session scratchpad
// (where playwright-core is installed) and run `node tree-suite.mjs` there, with `pnpm dev` on 5173 and
// `PORT=8788 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { open, openConversation, send, SC, waitDone } from './lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const W = 1400
const H = 900
const { browser, page } = await open({ model: 'mock-chat', width: W })
const wait = (ms = 400) => page.waitForTimeout(ms)
const TREE = '[data-tree-map]'
const treeButton = page.getByRole('button', { name: '树图' })
const treeOpen = async () => (await page.locator(TREE).count()) > 0
const box = () => page.locator(TREE).boundingBox()
const units = () => page.locator(`${TREE} g[role=button]`).count()
/** The aria-label of the unit marked "current". */
const current = () => page.locator(`${TREE} g[aria-current="true"]`).getAttribute('aria-label')
const inside = (b) => b.x >= 0 && b.y >= 56 && b.x + b.width <= W && b.y + b.height <= H

// Turns 1–12 in a line: a map wider than the window.
for (let i = 1; i <= 12; i++) await send(page, `第${i}问`)

// ---- O: opening ----
await treeButton.click()
await wait()
let b = await box()
check('O1 opens top right, below the header', b && b.x + b.width > W - 40 && b.y < 90 && inside(b), b)
check('O2 every turn drawn', (await units()) === 12, await units())
check('O3 "current" = the last turn (chat at its end)', (await current())?.includes('第 12 轮'), await current())

// ---- M: moving / resizing ----
const title = await page.locator(`${TREE} [data-tree-title]`).boundingBox()
await page.mouse.move(title.x + 40, title.y + title.height / 2)
await page.mouse.down()
await page.mouse.move(title.x - 500, title.y + 300, { steps: 6 })
await page.mouse.up()
await wait()
const moved = await box()
check('M1 drag by the title bar moves it', Math.abs(moved.x - (b.x - 540)) < 3 && Math.abs(moved.y - (b.y + 300 - title.height / 2)) < 3, { b, moved })
const corner = { x: moved.x + moved.width - 8, y: moved.y + moved.height - 8 }
await page.mouse.move(corner.x, corner.y)
await page.mouse.down()
await page.mouse.move(corner.x + 120, corner.y + 60, { steps: 6 })
await page.mouse.up()
await wait()
const sized = await box()
check('M2 the corner resizes it (place unchanged)', Math.abs(sized.width - moved.width - 120) < 3 && Math.abs(sized.height - moved.height - 60) < 3 && sized.x === moved.x && sized.y === moved.y, { moved, sized })
const t2 = await page.locator(`${TREE} [data-tree-title]`).boundingBox()
await page.mouse.move(t2.x + 40, t2.y + 10)
await page.mouse.down()
await page.mouse.move(t2.x + 3000, t2.y + 3000, { steps: 4 })
await page.mouse.up()
await wait()
check('M3 dragging past the edge keeps it inside the viewport', inside(await box()), await box())
const kept = await box()
await page.reload()
await wait(1200)
await openConversation(page, '第1问')
await page.keyboard.press('Escape') // (the list card stays open after picking)
await wait()
await treeButton.click()
await wait()
const again = await box()
check('M4 place and size remembered after a reload', JSON.stringify(again) === JSON.stringify(kept), { kept, again })
await page.setViewportSize({ width: 1000, height: 700 })
await wait()
const small = await box()
check('M5 a smaller window pulls it back inside', small.x + small.width <= 1000 && small.y + small.height <= 700, small)
await page.setViewportSize({ width: W, height: H })
await wait()
// Back to the top right for the rest.
const t3 = await page.locator(`${TREE} [data-tree-title]`).boundingBox()
await page.mouse.move(t3.x + 40, t3.y + 10)
await page.mouse.down()
await page.mouse.move(t3.x + 3000, 0, { steps: 4 })
await page.mouse.up()
await wait()
// … and as small as it goes (narrower than the map, for the wheel checks).
const tr = await box()
await page.mouse.move(tr.x + tr.width - 8, tr.y + tr.height - 8)
await page.mouse.down()
await page.mouse.move(tr.x + 50, tr.y + 50, { steps: 4 })
await page.mouse.up()
await wait()
const tiny = await box()
check('M6 it shrinks no further than its minimum', tiny.width === 220 && tiny.height === 140, tiny)

// ---- C: "current" follows the chat ----
await page.evaluate((sc) => (document.querySelector(sc).scrollTop = 0), SC)
await wait(500)
check('C1 chat scrolled to the top: "current" = turn 1', (await current())?.includes('第 1 轮'), await current())
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const turn = box.querySelectorAll('[data-turn]')[5]
  box.scrollTop = turn.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop + 5
}, SC)
await wait(500)
check('C2 turn 6 at the top: "current" = turn 6', (await current())?.includes('第 6 轮'), await current())
// The map brought "current" into its view.
const seen = await page.evaluate((T) => {
  const g = document.querySelector(`${T} g[aria-current="true"]`).getBoundingClientRect()
  const area = document.querySelector(`${T} svg[role=group]`).parentElement.getBoundingClientRect()
  return g.left >= area.left && g.right <= area.right && g.top >= area.top && g.bottom <= area.bottom
}, TREE)
check('C3 the map keeps "current" in its view', seen)
// A short last turn: scrolled to the end, it's "current" even while the turn above still fills the top.
await page.evaluate((sc) => document.querySelector(sc).scrollTo(0, 1e6), SC)
await wait(500)
check('C4 scrolled to the end: "current" = the last turn', (await current())?.includes('第 12 轮'), await current())
// The reading line: halfway down the view. A turn starting just below it isn't current yet; just above, it is.
const placeTurn = (i, y) =>
  page.evaluate(
    ({ sc, i, y }) => {
      const box = document.querySelector(sc)
      const turn = box.querySelectorAll('[data-turn]')[i]
      const composer = document.querySelector('main > [data-main-composer]').getBoundingClientRect().top
      const r = box.getBoundingClientRect()
      const line = r.top + (Math.min(r.bottom, composer) - r.top) * y
      box.scrollTop += turn.getBoundingClientRect().top - line
    },
    { sc: SC, i, y },
  )
await placeTurn(5, 0.53)
await wait(400)
check('C5 turn 6 starting just below the reading line: still turn 5', (await current())?.includes('第 5 轮'), await current())
await placeTurn(5, 0.47)
await wait(400)
check('C5 … just above it: turn 6', (await current())?.includes('第 6 轮'), await current())

// ---- J: jumping keeps it open ----
await page.locator(`${TREE} g[role=button]`).nth(2).click()
await wait(900)
check('J1 a click on a node jumps and the map stays open', await treeOpen())
check('J1 "current" = the turn jumped to', (await current())?.includes('第 3 轮'), await current())
// It stays so (turn 3 is short at the top; the reading line may be in turn 4) until the user scrolls by hand.
await wait(800)
check('J2 … and stays so after the glide', (await current())?.includes('第 3 轮'), await current())
const chat = await page.locator(SC).boundingBox()
await page.mouse.move(chat.x + 200, chat.y + 300)
await page.mouse.wheel(0, 1200)
await wait(800)
check('J3 scrolling by hand: back to the reading line', !(await current())?.includes('第 3 轮'), await current())
// A jump puts the turn's top a little above the reading line (halfway), so scrolling a little by hand
// doesn't make "current" flip to a neighbour.
await page.locator(`${TREE} g[role=button]`).nth(5).click()
await wait(900)
const placed = await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const r = box.getBoundingClientRect()
  const composer = document.querySelector('main > [data-main-composer]').getBoundingClientRect().top
  const turn = box.querySelectorAll('[data-turn]')[5].getBoundingClientRect()
  return (turn.top - r.top) / (Math.min(r.bottom, composer) - r.top)
}, SC)
check('J4 a jump puts the turn top a little above halfway', placed > 0.3 && placed < 0.5, placed)
await page.mouse.move(chat.x + 200, chat.y + 300)
await page.mouse.wheel(0, 40)
await wait(500)
check('J4 … a small scroll down by hand: still that turn', (await current())?.includes('第 6 轮'), await current())
await page.mouse.wheel(0, -60)
await wait(500)
check('J4 … a small scroll up by hand: still that turn', (await current())?.includes('第 6 轮'), await current())

// ---- R: the tree changes while open, animated (each drawn unit keeps its element: data-key) ----
const lastKey = () => page.locator(`${TREE} g[data-key]`).last().getAttribute('data-key')
const moving = () => page.evaluate((T) => document.querySelector(`${T} svg[role=group]`).getAnimations({ subtree: true }).length, TREE)
await page.evaluate((sc) => document.querySelector(sc).scrollTo(0, 1e6), SC)
await wait(1500)
const loneKey = await lastKey()
await page.locator('[aria-label="重新生成"]').last().click()
await waitDone(page)
check('R1 a retry at the end shows as a ×2 stack at once', (await page.locator(`${TREE} text`).filter({ hasText: '×2' }).count()) === 1)
check('R1 … the same element as the lone attempt was (no regrowing)', (await lastKey()) === loneKey, { loneKey, now: await lastKey() })
const keysBefore = await page.locator(`${TREE} g[data-key]`).evaluateAll((els) => els.map((e) => e.dataset.key))
await page.locator('main > [data-main-composer] textarea').fill('追一轮')
await page.locator('main > [data-main-composer] textarea').press('Enter')
await wait(120)
const animating = await moving()
await waitDone(page)
await wait(300)
const keysAfter = await page.locator(`${TREE} g[data-key]`).evaluateAll((els) => els.map((e) => e.dataset.key))
check('R2 a follow-up: the stack becomes the branch in place, one new unit', keysBefore.every((k) => keysAfter.includes(k)) && keysAfter.length === keysBefore.length + 1, { keysBefore, keysAfter })
check('R2 … which grows in (animating right after sending)', animating > 0, animating)
check('R2 … and nothing animates once it settled', (await moving()) === 0, await moving())
await page.evaluate((sc) => document.querySelector(sc).scrollTo(0, 1e6), SC)
await wait(1500)
await page.locator(`${SC} [data-fork]`).last().getByRole('button', { name: '更多' }).click()
await wait(300)
await page.getByRole('menuitem', { name: '归档' }).click()
await wait(60)
const ghosts = await page.locator(`${TREE} .tree-ghost`).count()
await wait(600)
check('R3 archiving: the unit fades out as a ghost, then is gone', ghosts === 1 && (await page.locator(`${TREE} .tree-ghost`).count()) === 0 && (await page.locator(`${TREE} g[data-key]`).count()) === keysBefore.length, ghosts)

// ---- S: wheel ----
const area = () =>
  page.evaluate((T) => {
    const el = document.querySelector(`${T} svg[role=group]`).parentElement
    return { left: el.scrollLeft, top: el.scrollTop, w: el.scrollWidth - el.clientWidth }
  }, TREE)
const svgBox = await page.locator(`${TREE} svg[role=group]`).boundingBox()
const mb = await box()
await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
await page.evaluate((T) => (document.querySelector(`${T} svg[role=group]`).parentElement.scrollLeft = 0), TREE)
await wait(200)
const before = await area()
await page.mouse.wheel(0, 100)
await wait(600)
const after = await area()
check('S1 the map is wider than the window', before.w > 0, before)
check('S1 a wheel notch scrolls it sideways', after.left > before.left && after.top === before.top, { before, after, svgBox })
// (Shift + wheel: one row of turns can't scroll up / down, so the wheel keeps its native direction there.)

await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASS')
process.exit(failures ? 1 : 0)
