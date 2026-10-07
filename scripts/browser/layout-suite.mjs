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

// ---- W4: the conversation list: dragging its edge resizes it (within its limits) and leaves the text on screen
// where it is; collapsing it (header button) recenters the chat; both are remembered over a reload ----
{
  const { browser, page } = await open({ model: 'mock-chat', scrollbars: true })
  for (const q of ['列表一', '列表二', '列表三']) await send(page, q)
  await page.waitForTimeout(1300) // past the scroll hold
  const listWidth = async () => ((await page.locator('aside').count()) ? Math.round((await page.locator('aside').boundingBox()).width) : 0)
  const topText = () =>
    page.evaluate((SC) => {
      const sc = document.querySelector(SC)
      const r = sc.getBoundingClientRect()
      const el = [...sc.querySelectorAll('.prose p, .prose li, .prose pre')].find((e) => e.getBoundingClientRect().bottom > r.top + 20)
      return { text: el.textContent.slice(0, 20), off: Math.round(el.getBoundingClientRect().top - r.top) }
    }, SC)
  await page.evaluate((SC) => {
    const sc = document.querySelector(SC)
    sc.scrollTop = sc.scrollHeight / 2
  }, SC)
  await page.waitForTimeout(200)
  const before = await topText()
  const handle = page.locator('[role="separator"][aria-label="调整对话列表宽度"]')
  const hb = await handle.boundingBox()
  const x = hb.x + hb.width / 2
  await page.mouse.move(x, 400)
  await page.mouse.down()
  await page.mouse.move(x + 100, 400, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const after = await topText()
  const m = await measure(page)
  check('W4 dragging the list edge widens it', (await listWidth()) === 356, await listWidth())
  check('W4 the text on screen stays where it was', before.text === after.text && Math.abs(before.off - after.off) <= 1, { before, after })
  check('W4 no overflow, the input box lines up', m.overflow === 0 && m.boxLeft === m.contentLeft && m.boxRight === m.contentRight, m)
  await page.mouse.move(x + 100, 400)
  await page.mouse.down()
  await page.mouse.move(x + 900, 400, { steps: 5 })
  await page.mouse.up()
  check('W4 the list stops at its widest', (await listWidth()) === 420, await listWidth())
  // In every painted frame of the slide, the chat is centered in the area (it once showed a frame at its
  // old place: re-laid out a frame late). Read in an observer made after the app's, see W3.
  const offCenter = async (button) => {
    await page.evaluate((SC) => {
      const sc = document.querySelector(SC)
      const read = () => {
        const a = sc.getBoundingClientRect()
        const c = sc.firstElementChild.firstElementChild.getBoundingClientRect()
        return Math.round(Math.abs(c.left - a.left - (a.left + sc.clientWidth - c.right)))
      }
      window.__frames = []
      let cur = null
      const ro = new ResizeObserver(() => cur && (cur.v = read()))
      ro.observe(sc)
      ro.observe(sc.firstElementChild)
      const tick = () => {
        cur = { v: read() }
        window.__frames.push(cur)
        if (window.__frames.length < 30) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, SC)
    await page.locator(`[aria-label="${button}"]`).click()
    await page.waitForTimeout(700)
    return Math.max(...(await page.evaluate(() => window.__frames.map((f) => f.v))))
  }
  const slideOff = await offCenter('收起对话列表')
  check('W4 collapsing: the chat stays centered in every frame', slideOff <= 1, slideOff)
  const c = await measure(page)
  check('W4 collapsed: no list, the chat is centered', (await listWidth()) === 0 && Math.abs(c.contentLeft - (c.areaRight - c.contentRight)) <= 1, c)
  await page.reload()
  await page.waitForTimeout(800)
  check('W4 collapsed after a reload', (await listWidth()) === 0)
  const slideOn = await offCenter('展开对话列表')
  check('W4 expanding: the chat stays centered in every frame', slideOn <= 1, slideOn)
  check('W4 expanded at the width it had', (await listWidth()) === 420, await listWidth())
  await browser.close()
}

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
