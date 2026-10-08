// The tree map window (components/chat/TreeMap.tsx): where it opens, moving / resizing (kept inside the
// viewport, remembered across reloads), staying open through jumps, "current" following the chat's scroll,
// changes while open (elements kept and animated, new units growing in, archived ones fading out), the
// mouse wheel scrolling sideways. Escape / outside clicks: layers-suite; conversation switch: switch-suite. Copy this folder into the session scratchpad
// (where playwright-core is installed) and run `node tree-suite.mjs` there, with `pnpm dev` on 5173 and
// `PORT=8788 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { clickAt, newChat, open, openConversation, send, SC, waitDone } from './lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const W = 1400
const H = 900
const { browser, page } = await open({ models: ['mock-chat', 'mock-name'], model: 'mock-chat', width: W })
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

// ---- C: "current" follows the chat (the reading line, lib/reading.ts) ----
/** Visible chat (the input box's cover left out) and the n-th turn's frame, relative to its top. */
const geo = (i) =>
  page.evaluate(
    ({ sc, i }) => {
      const box = document.querySelector(sc)
      const r = box.getBoundingClientRect()
      const composer = document.querySelector('main > [data-main-composer]').getBoundingClientRect().top
      const t = box.querySelectorAll('[data-turn]')[i]?.getBoundingClientRect()
      return { h: Math.min(r.bottom, composer) - r.top, top: t && t.top - r.top, bottom: t && t.bottom - r.top, s: box.scrollTop, max: box.scrollHeight - box.clientHeight }
    },
    { sc: SC, i },
  )
const turnNo = async () => Number((await current())?.match(/第 (\d+) 轮/)?.[1])
const chat = await page.locator(SC).boundingBox()
const wheel = async (dy, ms = 250) => {
  await page.mouse.move(chat.x + 200, chat.y + 300)
  await page.mouse.wheel(0, dy)
  await wait(ms)
}
await page.evaluate((sc) => (document.querySelector(sc).scrollTop = 0), SC)
await wait(500)
check('C1 chat scrolled to the top: "current" = turn 1', (await turnNo()) === 1, await current())
await page.evaluate((sc) => document.querySelector(sc).scrollTo(0, 1e6), SC)
await wait(500)
check('C2 scrolled to the end: "current" = the last turn', (await turnNo()) === 12, await current())
// The map brought "current" into its view.
const seen = await page.evaluate((T) => {
  const g = document.querySelector(`${T} g[aria-current="true"]`).getBoundingClientRect()
  const area = document.querySelector(`${T} svg[role=group]`).parentElement.getBoundingClientRect()
  return g.left >= area.left && g.right <= area.right && g.top >= area.top && g.bottom <= area.bottom
}, TREE)
check('C3 the map keeps "current" in its view', seen)
// By the wheel from the top to the end and back: one turn at a time, never against the scroll, ends reached.
await page.evaluate((sc) => (document.querySelector(sc).scrollTop = 0), SC)
await wait(400)
const walk = async (dy) => {
  const seen = [await turnNo()]
  for (let k = 0; k < 120; k++) {
    const { s, max } = await geo(0)
    if ((dy > 0 && s >= max - 1) || (dy < 0 && s <= 0)) break
    await wheel(dy, 120)
    seen.push(await turnNo())
  }
  await wait(300)
  seen.push(await turnNo())
  return seen
}
const down = await walk(150)
check('C4 wheel down to the end: one turn at a time, ends on the last', down.every((t, i) => i === 0 || (t - down[i - 1] >= 0 && t - down[i - 1] <= 1)) && down.at(-1) === 12, down)
const up = await walk(-150)
check('C4 … and back up: one turn at a time, ends on the first', up.every((t, i) => i === 0 || (up[i - 1] - t >= 0 && up[i - 1] - t <= 1)) && up.at(-1) === 1, up)
// In the middle a small scroll either way keeps "current" (the line moves with the content in the band).
await wheel(1500, 600)
const mid = await turnNo()
await wheel(60)
const a1 = await turnNo()
await wheel(-100)
const a2 = await turnNo()
check('C5 a small scroll either way in the middle keeps "current"', a1 === mid && a2 === mid, { mid, a1, a2 })

// ---- J: jumping keeps it open; the turn lands at a fixed place near the top and is "current" ----
const offset = (h) => Math.max(40, h / 10)
const landed = async (i) => {
  const g = await geo(i)
  return { at: g.top - 20, want: offset(g.h), g } // (20 = the header's scroll margin above the frame)
}
await page.locator(`${TREE} g[role=button]`).nth(5).click()
await wait(900)
check('J1 a click on a node jumps and the map stays open', await treeOpen())
check('J1 "current" = the turn jumped to', (await turnNo()) === 6, await current())
let l = await landed(5)
check('J2 its top lands at the fixed place near the top', Math.abs(l.at - l.want) <= 2, l)
await wheel(40)
const j3a = await turnNo()
await wheel(-80)
const j3b = await turnNo()
check('J3 … a small scroll either way: still that turn', j3a === 6 && j3b === 6, { j3a, j3b })
await page.locator(`${TREE} g[role=button]`).nth(2).click()
await wait(900)
l = await landed(2)
check('J4 another turn lands at the same place', Math.abs(l.at - l.want) <= 2 && (await turnNo()) === 3, l)
// Near the end (turn 11 of 12): it lands at the same place too and is current, not the last turn.
await page.locator(`${TREE} g[role=button]`).nth(10).click()
await wait(900)
l = await landed(10)
check('J5 a turn near the end lands at the same place too, current', Math.abs(l.at - l.want) <= 2 && (await turnNo()) === 11, l)
// Near the start: nothing above to scroll, turn 1 stops higher; still current.
await page.locator(`${TREE} g[role=button]`).nth(0).click()
await wait(900)
const g0 = await geo(0)
check('J7 turn 1: the view at the very top, turn 1 current', g0.s === 0 && (await turnNo()) === 1, g0)

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

// ---- V: the switcher, a retry: "current" = the turn chosen ----
// (Clicked with the real mouse: Playwright's click() scrolls, which counts as the user scrolling.)
const turn3 = page.locator(`${SC} [data-turn]`).nth(2)
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const t = box.querySelectorAll('[data-turn]')[2]
  box.scrollTop += t.getBoundingClientRect().bottom - box.getBoundingClientRect().top - 500
}, SC)
await wait(1500)
await clickAt(page, turn3.locator('[aria-label="重新生成"]'))
await waitDone(page)
/** Units drawn for turn `n` (a branch and an attempt beside it are two). */
const unitsAt = (n) => page.locator(`${TREE} g[role=button]`).evaluateAll((gs, n) => gs.filter((g) => g.getAttribute('aria-label')?.includes(`第 ${n} 轮`)).length, n)
// Attempts are drawn only while the chat ends at one of them (owner, 2026-10-09).
check('V1 a retry of turn 3: "current" = the new attempt, drawn beside the branch', (await turnNo()) === 3 && (await unitsAt(3)) === 2 && (await page.locator(`${SC} [data-turn]`).count()) === 3, { current: await current(), units: await unitsAt(3) })
await wait(1000)
// Back to the branch: its dot, the first in turn 3's switcher. The attempt goes from the map, fading out.
await clickAt(page, page.locator(`${SC} [data-fork]`).nth(2).locator('[data-switcher] button').first())
await wait(80)
const fading = await page.locator(`${TREE} .tree-ghost`).count()
await wait(1500)
check('V2 switching back to the branch: "current" = the turn switched to', (await turnNo()) === 3 && (await page.locator(`${SC} [data-turn]`).count()) > 3, await current())
check('V2 … the attempt leaves the map, fading out', fading === 1 && (await unitsAt(3)) === 1 && (await page.locator(`${TREE} .tree-ghost`).count()) === 0, { fading, units: await unitsAt(3) })
await wheel(80)
const v3 = await turnNo()
check('V3 … then a small scroll: still turn 3 or the next one', v3 === 3 || v3 === 4, v3)
// And to the attempt again: it grows back in. (Turn 3's header back on screen first.)
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const t = box.querySelectorAll('[data-turn]')[2]
  box.scrollTop += t.getBoundingClientRect().top - box.getBoundingClientRect().top - 200
}, SC)
await wait(1300)
await clickAt(page, page.locator(`${SC} [data-fork]`).nth(2).locator('[data-switcher] button').nth(1))
await wait(80)
const growing = await moving()
await wait(1500)
check('V4 switching to the attempt: it grows back into the map, "current"', growing > 0 && (await unitsAt(3)) === 2 && (await turnNo()) === 3, { growing, units: await unitsAt(3), current: await current() })

// ---- E: short turns (mock-name): a jump makes room with blank below; scrolling on at the end ----
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('ewl-settings'))
  st.state.model = 'mock-name'
  localStorage.setItem('ewl-settings', JSON.stringify(st))
})
await page.reload()
await wait(1200)
await newChat(page)
for (let i = 1; i <= 3; i++) await send(page, `短${i}`)
if (!(await treeOpen())) await treeButton.click()
await wait(600)
await page.locator(`${TREE} g[role=button]`).nth(1).click()
await wait(900)
l = await landed(1)
const pad = await page.evaluate((sc) => parseFloat(document.querySelector(sc).firstElementChild.style.paddingBottom) || 0, SC)
check('E1 a short chat: turn 2 lands at the fixed place, over blank space', Math.abs(l.at - l.want) <= 2 && pad > 0 && l.g.s >= l.g.max - 1, { l, pad })
check('E1 … current = turn 2', (await turnNo()) === 2, await current())
const onEnd = []
for (let k = 0; k < 8; k++) {
  await wheel(120, 150)
  onEnd.push(await turnNo())
}
check('E2 the wheel on at the end (nothing moves): on to the last turn, one at a time', onEnd.at(-1) === 3 && onEnd.every((t, i) => t === 2 || t === 3) && (await geo(0)).s === l.g.s, onEnd)
await page.locator(`${TREE} g[role=button]`).nth(1).click()
await wait(900)
const toTop = []
for (let k = 0; k < 8; k++) {
  await wheel(-120, 150)
  toTop.push(await turnNo())
}
check('E3 from there up to the top (and on): to turn 1, one at a time', toTop.at(-1) === 1 && toTop.every((t) => t === 1 || t === 2), toTop)

await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASS')
process.exit(failures ? 1 : 0)
