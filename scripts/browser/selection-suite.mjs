// Selection pill (SelectionAsk.tsx, placed by Floating UI): above the selection's first line, below its last
// when there's no room, centered on that line; Escape / a click
// elsewhere puts it away (only it, not a card under it). Copy this folder into the session scratchpad (where
// playwright-core is installed) and run `node selection-suite.mjs [light|dark]` there, with `pnpm dev` on 5173
// and `PORT=8788 DELAY=20 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { open, send, SC, setScroll } from './lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}
const theme = process.argv[2] || 'light'
const { browser, page } = await open({ model: 'mock-long', theme })
await send(page, '第一轮')
await send(page, '第二轮')

const PILL = 'div.z-40.rounded-lg'
const pill = () => page.locator(PILL)
const pillBox = async () => {
  if (!(await pill().count())) return null
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, cx: r.left + r.width / 2, hidden: getComputedStyle(el).visibility === 'hidden', text: el.textContent }
  }, PILL)
}
/** Drag-selects within an element from x offset a to b on the line at dy (from its top). */
async function drag(el, a, b, dy = 12, endDy = dy) {
  // (A press inside an existing selection would start dragging the text instead.)
  await page.evaluate(() => getSelection().removeAllRanges())
  const box = await el.boundingBox()
  await page.mouse.move(box.x + a, box.y + dy)
  await page.mouse.down()
  await page.mouse.move(box.x + b, box.y + endDy, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  return box
}
const selRects = () =>
  page.evaluate(() => {
    const rs = [...getSelection().getRangeAt(0).getClientRects()].filter((r) => r.width > 0)
    // Whole lines: the union of the rects on the first / last line.
    const line = (r0) => {
      const on = rs.filter((r) => Math.abs(r.top + r.height / 2 - (r0.top + r0.height / 2)) < 6)
      const l = Math.min(...on.map((r) => r.left)), rt = Math.max(...on.map((r) => r.right))
      return { top: Math.min(...on.map((r) => r.top)), bottom: Math.max(...on.map((r) => r.bottom)), cx: (l + rt) / 2 }
    }
    return { first: rs[0] && line(rs[0]), last: rs.at(-1) && line(rs.at(-1)) }
  })

await page.waitForTimeout(1300)
// P1: a single-line selection mid-screen: the pill sits right above it, centered on it.
await setScroll(page, SC, 0)
await page.waitForTimeout(1300)
const para = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).first()
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const p = [...box.querySelectorAll('[data-anchor-root]:not([data-anchor-target]) > div > p')][0]
  box.scrollTop += p.getBoundingClientRect().top - box.getBoundingClientRect().top - 300
}, SC)
await page.waitForTimeout(300)
await drag(para, 4, 140)
let s = await selRects()
let p = await pillBox()
check('P1 pill shown (追问 + 笔记)', p && /追问/.test(p.text) && /笔记/.test(p.text), p)
check('P1 above the selection, 8px gap', p && Math.abs(s.first.top - 8 - p.bottom) < 3, { s, p })
check('P1 centered on it', p && Math.abs(p.cx - s.first.cx) < 2, { s, p })
await page.screenshot({ path: `P1-${theme}.png` })

// P4: Escape puts it away.
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
check('P4 Escape hides it', !(await pill().count()))

// P5: selection on the first line under the chat top: no room above → below its last line.
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const p = [...box.querySelectorAll('[data-anchor-root]:not([data-anchor-target]) > div > p')][0]
  box.scrollTop += p.getBoundingClientRect().top - box.getBoundingClientRect().top - 10
}, SC)
await page.waitForTimeout(300)
await drag(para, 4, 140)
s = await selRects()
p = await pillBox()
check('P5 below the selection when no room above', p && Math.abs(p.top - (s.last.bottom + 8)) < 3, { s, p })
await page.screenshot({ path: `P5-${theme}.png` })
await page.mouse.click(5, 880)
await page.waitForTimeout(200)
check('P5 a click elsewhere hides it', !(await pill().count()))

// P6: two-line selection: above the first line, centered on that line.
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const p = [...box.querySelectorAll('[data-anchor-root]:not([data-anchor-target]) li')].at(-1)
  box.scrollTop += p.getBoundingClientRect().top - box.getBoundingClientRect().top - 300
}, SC)
await page.waitForTimeout(300)
const li1 = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) li`).nth(-2)
const lb = await li1.boundingBox()
await page.mouse.move(lb.x + 60, lb.y + 10)
await page.mouse.down()
await page.mouse.move(lb.x + 40, lb.y + lb.height + 18, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(400)
s = await selRects()
p = await pillBox()
check('P6 multi-line: two lines selected', s.first && s.last && s.last.top > s.first.top, s)
check('P6 multi-line: above the first line, centered on it', p && Math.abs(s.first.top - 8 - p.bottom) < 3 && Math.abs(p.cx - s.first.cx) < 2, { s, p })
await page.screenshot({ path: `P6-${theme}.png` })

// P7: in a user message: only 笔记.
await page.mouse.click(5, 880)
const user = page.locator(`${SC} [data-anchor-target="user"]`).last()
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const u = [...box.querySelectorAll('[data-anchor-target="user"]')].at(-1)
  box.scrollTop += u.getBoundingClientRect().top - box.getBoundingClientRect().top - 300
}, SC)
await page.waitForTimeout(300)
await drag(user.locator('p').first(), 2, 30)
p = await pillBox()
check('P7 user message: only 笔记', p && !/追问/.test(p.text) && /笔记/.test(p.text), p)

// P8: 追问 still opens a draft card; the selection pill goes away.
await page.mouse.click(5, 880)
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const p = [...box.querySelectorAll('[data-anchor-root]:not([data-anchor-target]) > div > p')][0]
  box.scrollTop += p.getBoundingClientRect().top - box.getBoundingClientRect().top - 300
}, SC)
await page.waitForTimeout(300)
await drag(para, 4, 140)
await page.getByRole('button', { name: '追问' }).click()
await page.waitForTimeout(500)
check('P8 追问 opens the draft card', (await page.locator('[data-side-column] .shadow-pop textarea').count()) === 1)
check('P8 pill gone', !(await pill().count()))
// P9: Escape with the pill up and a card open closes only the pill.
await page.keyboard.press('Escape') // collapse card (empty draft)
await page.waitForTimeout(300)
await drag(para, 4, 140)
await page.getByRole('button', { name: '追问' }).click()
await page.waitForTimeout(400)
await page.locator('[data-side-column] .shadow-pop textarea').fill('> x\n\n问题')
await page.mouse.click(5, 880)
await page.waitForTimeout(200)
const para0 = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).first()
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const p = box.querySelector('[data-anchor-root]:not([data-anchor-target]) > div > p')
  box.scrollTop += p.getBoundingClientRect().top - box.getBoundingClientRect().top - 300
}, SC)
await page.waitForTimeout(300)
await drag(para0, 4, 100)
const cardOpen = () => page.locator('[data-side-column] .shadow-pop textarea').count()
check('P9 pill + card open', (await pill().count()) === 1 && (await cardOpen()) === 1)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
check('P9 first Escape: only the pill', !(await pill().count()) && (await cardOpen()) === 1)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('P9 second Escape: the card', (await cardOpen()) === 0)

await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASS')
