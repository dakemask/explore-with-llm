// Layout widths (`lib/column.ts` `columnFrame`, scroll areas with `scrollbar-gutter: stable`), with classic
// scrollbars as on Windows. Copy this folder into the session scratchpad (where playwright-core is
// installed) and run `node layout-suite.mjs` there, with `pnpm dev` on 5173 and
// `PORT=8788 node scripts/mock/server.mjs` (or use run-all.mjs). Prints PASS / FAIL per check.
import { open, send, SC } from './lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

/** Left edges of the chat content and the input box, the page's horizontal overflow, the column's edges. */
const measure = (page) =>
  page.evaluate((SC) => {
    const sc = document.querySelector(SC)
    const content = sc.firstElementChild.firstElementChild.getBoundingClientRect()
    const box = document.querySelector('main > div.shrink-0 textarea').closest('.rounded-2xl').getBoundingClientRect()
    const col = document.querySelector('[data-side-column]')?.getBoundingClientRect()
    return {
      scrollbar: sc.offsetWidth - sc.clientWidth,
      contentLeft: Math.round(content.left),
      contentRight: Math.round(content.right),
      // The input box sits inside the chat's 24 px side padding, as the messages do.
      boxLeft: Math.round(box.left) - 24,
      boxRight: Math.round(box.right) + 24,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      colLeft: col && Math.round(col.left),
      colRight: col && Math.round(col.right),
      areaRight: Math.round(sc.getBoundingClientRect().right - (sc.offsetWidth - sc.clientWidth)),
    }
  }, SC)

// ---- W1: the scrollbar appearing (content growing past the screen) moves nothing sideways ----
{
  const { browser, page } = await open({ model: 'mock-chat', scrollbars: true })
  const box = page.locator('main > div.shrink-0 textarea')
  await box.fill('短')
  await box.press('Enter')
  await page.waitForTimeout(500)
  const before = await measure(page)
  await page.evaluate((SC) => {
    const el = document.querySelector(SC).firstElementChild.firstElementChild
    window.__lefts = new Set()
    const tick = () => {
      window.__lefts.add(Math.round(el.getBoundingClientRect().left))
      if (!window.__stop) requestAnimationFrame(tick)
    }
    tick()
  }, SC)
  await page.locator('[aria-label="停止"]').waitFor({ state: 'detached', timeout: 60000 })
  await send(page, '再来一轮，让内容超出屏幕')
  await page.evaluate(() => (window.__stop = true))
  const lefts = await page.evaluate(() => [...window.__lefts])
  const after = await measure(page)
  check('W1 the scrollbar is shown (classic scrollbars)', after.scrollbar > 0, after)
  check('W1 the chat never moves sideways as the content outgrows the screen', lefts.length === 1 && after.contentLeft === before.contentLeft, { lefts, before, after })
  check('W1 the input box lines up with the messages', after.boxLeft === after.contentLeft && after.boxRight === after.contentRight, after)
  await browser.close()
}

// ---- W2: at several window widths, with the side column showing: no overflow, box aligned, column inside ----
for (const width of [1000, 1280, 1920]) {
  const { browser, page } = await open({ model: 'mock-chat', scrollbars: true, width })
  await send(page, '宽度 ' + width)
  const para = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).first()
  const b = await para.boundingBox()
  await page.mouse.move(b.x + 2, b.y + 12)
  await page.mouse.down()
  await page.mouse.move(b.x + 120, b.y + 12, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  await page.waitForTimeout(500)
  const m = await measure(page)
  check(`W2 ${width}px: no horizontal overflow`, m.overflow === 0, m)
  check(`W2 ${width}px: the input box lines up with the messages`, m.boxLeft === m.contentLeft && m.boxRight === m.contentRight, m)
  check(`W2 ${width}px: the side column fits inside the scroll area`, m.colLeft >= m.contentRight - 1 && m.colRight <= m.areaRight + 1, m)
  await page.screenshot({ path: `layout-${width}.png` })
  await browser.close()
}

// ---- W3: narrow window, the first card of a conversation: the column appears and narrows the chat (text
// rewraps); the selected passage stays where it is on screen, and the card opens fully on screen ----
for (const action of ['笔记', '追问']) {
  const { browser, page } = await open({ model: 'mock-chat', width: 1000 })
  await send(page, '窄窗口 ' + action)
  const para = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).first()
  const b = await para.boundingBox()
  await page.mouse.move(b.x + 2, b.y + 12)
  await page.mouse.down()
  await page.mouse.move(b.x + 120, b.y + 12, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const widthBefore = await page.evaluate((SC) => document.querySelector(SC).firstElementChild.firstElementChild.offsetWidth, SC)
  // The paragraph's top in every painted frame: observers made now run after the app's, before paint, so
  // the last reading in a frame is what's on screen (a reading at the frame's start can be before the fix).
  await page.evaluate((SC) => {
    const sc = document.querySelector(SC)
    const p = sc.querySelector('[data-anchor-root]:not([data-anchor-target]) > div > p')
    const top = () => Math.round(p.getBoundingClientRect().top)
    window.__frames = []
    let cur = null
    const ro = new ResizeObserver(() => cur && (cur.v = top()))
    ro.observe(sc)
    ro.observe(sc.firstElementChild)
    for (const c of sc.firstElementChild.children) ro.observe(c)
    sc.addEventListener('scroll', () => cur && (cur.v = top()))
    const tick = () => {
      cur = { v: top() }
      window.__frames.push(cur)
      if (window.__frames.length < 90) requestAnimationFrame(tick)
    }
    tick()
  }, SC)
  await page.getByRole('button', { name: action, exact: true }).click()
  await page.waitForTimeout(1800)
  const tops = [...new Set(await page.evaluate(() => window.__frames.map((f) => f.v)))]
  const widthAfter = await page.evaluate((SC) => document.querySelector(SC).firstElementChild.firstElementChild.offsetWidth, SC)
  const fit = await page.evaluate((SC) => {
    const c = document.querySelector('[data-side-column] .shadow-pop').getBoundingClientRect()
    const v = document.querySelector(SC).getBoundingClientRect()
    return { cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), viewTop: Math.round(v.top), viewBottom: Math.round(v.bottom) }
  }, SC)
  check(`W3 ${action}: the chat narrowed (the case this tests)`, widthAfter < widthBefore, { widthBefore, widthAfter })
  check(`W3 ${action}: the selected passage stays put on screen`, tops.length === 1, tops)
  check(`W3 ${action}: the card opens fully on screen`, fit.cardTop >= fit.viewTop && fit.cardBottom <= fit.viewBottom, fit)
  await browser.close()
}

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
