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
    const box = document.querySelector('main > [data-main-composer] textarea').closest('.rounded-2xl').getBoundingClientRect()
    const col = document.querySelector('[data-side-column]')?.getBoundingClientRect()
    return {
      scrollbar: sc.offsetWidth - sc.clientWidth,
      contentLeft: Math.round(content.left),
      contentRight: Math.round(content.right),
      // The input box is the chat column less 12 px a side (the messages: less 24 px).
      boxLeft: Math.round(box.left) - 12,
      boxRight: Math.round(box.right) + 12,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      colLeft: col && Math.round(col.left),
      colRight: col && Math.round(col.right),
      areaRight: Math.round(sc.getBoundingClientRect().right - (sc.offsetWidth - sc.clientWidth)),
    }
  }, SC)

// ---- W1: the scrollbar appearing (content growing past the screen) moves nothing sideways ----
{
  const { browser, page } = await open({ model: 'mock-chat', scrollbars: true })
  const box = page.locator('main > [data-main-composer] textarea')
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

// ---- W3: narrow window, a card created with the column collapsed: the column opens (sliding) and narrows the
// chat (text rewraps); the selected passage stays where it is on screen, and the card opens fully on screen ----
for (const action of ['笔记', '追问']) {
  const { browser, page } = await open({ model: 'mock-chat', width: 1000 })
  await send(page, '窄窗口 ' + action)
  await page.locator('[aria-label="收起侧栏"]').click()
  await page.waitForTimeout(1300) // the slide, then past the scroll hold
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

// ---- W6: the floating input box covers what passes behind it — the sticky reasoning toggle too (it has a
// z-index of its own and once showed over the box) — and the background covers the strip below it ----
{
  const { browser, page } = await open({ model: 'mock-chat', scrollbars: true })
  for (const q of ['遮挡一', '遮挡二']) await send(page, q)
  await page.waitForTimeout(1300)
  await page.evaluate((SC) => {
    const sc = document.querySelector(SC)
    const t = [...sc.querySelectorAll('button')].filter((b) => b.textContent.includes('思考过程')).at(-1)
    const box = document.querySelector('main > [data-main-composer] .rounded-2xl').getBoundingClientRect()
    sc.scrollTop += t.getBoundingClientRect().top - (box.top + 30)
  }, SC)
  await page.waitForTimeout(300)
  const top = await page.evaluate(() => {
    const box = document.querySelector('main > [data-main-composer] .rounded-2xl').getBoundingClientRect()
    const at = (x, y) => !!document.elementFromPoint(x, y).closest('[data-main-composer]')
    return { overToggle: at(box.left + 60, box.top + 30), below: at(box.left + 200, box.bottom + 8), besideLowerHalf: at(box.left - 6, box.bottom - 10) }
  })
  check('W6 a reasoning toggle passing behind the input box stays behind it', top.overToggle, top)
  check('W6 nothing shows below the box or beside its lower half', top.below && top.besideLowerHalf, top)
  await browser.close()
}

// ---- W5: the side column: open (even empty) by default; a highlight or bar toggles its card; the header
// button collapses it to the marker strip (sliding: chat, input box and column stay joined in every frame);
// collapsed, a bar / highlight click or a new side question opens it; dragging its edge resizes it ----
{
  const { browser, page } = await open({ model: 'mock-chat', scrollbars: true })
  const CARD = '[data-side-column] .shadow-pop'
  const cards = () => page.locator(CARD).count()
  const colWidth = () => page.evaluate(() => Math.round(document.querySelector('[data-side-column]').getBoundingClientRect().width))
  await send(page, '侧栏')
  check('W5 the column is open with nothing in it', (await colWidth()) === 380, await colWidth())
  const select = async (i) => {
    const b = await page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).nth(i).boundingBox()
    await page.mouse.move(b.x + 2, b.y + 12)
    await page.mouse.down()
    await page.mouse.move(b.x + 120, b.y + 12, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(300)
  }
  await select(0)
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  await page.waitForTimeout(400)
  await page.keyboard.type('笔记')
  await page.keyboard.press('Escape') // 完成
  await page.keyboard.press('Escape') // collapses the card
  await page.waitForTimeout(400)
  const mark = page.locator(`${SC} mark[data-threads]`).first()
  const bar = page.locator('[data-side-column] > button').first()
  await mark.click()
  await page.waitForTimeout(300)
  const byMark = await cards()
  await mark.click()
  await page.waitForTimeout(300)
  check('W5 a highlight click expands its card, a second one collapses it', byMark === 1 && (await cards()) === 0, byMark)
  await bar.click()
  await page.waitForTimeout(300)
  const byBar = await cards()
  await bar.click()
  await page.waitForTimeout(300)
  check('W5 a bar click expands its card, a second one collapses it', byBar === 1 && (await cards()) === 0, byBar)

  // The slide: per painted frame (observer made after the app's, see W3), how far apart the chat's right edge
  // and the column's left edge are, and the input box and the chat; and that nothing passes the area's edge.
  const slideGaps = async (button) => {
    await page.evaluate((SC) => {
      const sc = document.querySelector(SC)
      const read = () => {
        const a = sc.getBoundingClientRect()
        const c = sc.firstElementChild.firstElementChild.getBoundingClientRect()
        const col = document.querySelector('[data-side-column]').getBoundingClientRect()
        const box = document.querySelector('main > [data-main-composer] textarea').closest('.rounded-2xl').getBoundingClientRect()
        const gap = Math.max(Math.abs(c.right - col.left), col.right - (a.left + sc.clientWidth), Math.abs(box.left - 12 - c.left), Math.abs(box.right + 12 - c.right))
        return { gap: Math.round(gap), width: Math.round(col.width) }
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
        else ro.disconnect()
      }
      requestAnimationFrame(tick)
    }, SC)
    await page.locator(`[aria-label="${button}"]`).click()
    await page.waitForTimeout(700)
    const frames = await page.evaluate(() => window.__frames.map((f) => f.v))
    // (`widths` = how many different column widths were painted: it did slide.)
    return { max: Math.max(...frames.map((f) => f.gap)), widths: new Set(frames.map((f) => f.width)).size }
  }
  const off = await slideGaps('收起侧栏')
  check('W5 collapsing slides with chat, input box and column joined in every frame', off.max <= 1 && off.widths > 3, off)
  check('W5 collapsed: only the marker strip', (await colWidth()) === 14 && (await page.locator('[data-side-column] > div button').count()) === 0, await colWidth())
  await bar.click()
  await page.waitForTimeout(400)
  check('W5 collapsed, a bar click opens the column and the card', (await colWidth()) === 380 && (await cards()) === 1, await colWidth())
  await page.keyboard.press('Escape')
  await page.locator('[aria-label="收起侧栏"]').click()
  await page.waitForTimeout(400)
  await mark.click()
  await page.waitForTimeout(400)
  check('W5 collapsed, a highlight click opens the column and the card', (await colWidth()) === 380 && (await cards()) === 1, await colWidth())
  await page.keyboard.press('Escape')
  await page.locator('[aria-label="收起侧栏"]').click()
  await page.waitForTimeout(400)
  await select(1)
  await page.getByRole('button', { name: '追问', exact: true }).click()
  await page.waitForTimeout(400)
  check('W5 collapsed, 追问 opens the column with the draft card', (await colWidth()) === 380 && (await cards()) === 1, await colWidth())
  await page.keyboard.press('Escape')
  await page.locator('[aria-label="收起侧栏"]').click()
  await page.waitForTimeout(400)
  const on = await slideGaps('展开侧栏')
  check('W5 opening slides with chat, input box and column joined in every frame', on.max <= 1 && on.widths > 3, on)

  const handle = page.locator('[role="separator"][aria-label="调整侧栏宽度"]')
  const hb = await handle.boundingBox()
  const x = hb.x + hb.width / 2
  await page.mouse.move(x, 400)
  await page.mouse.down()
  await page.mouse.move(x - 100, 400, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const m = await measure(page)
  check('W5 dragging its edge widens the column', (await colWidth()) === 480, await colWidth())
  check('W5 no overflow, the input box lines up, the column ends at the area', m.overflow === 0 && m.boxLeft === m.contentLeft && m.colRight === m.areaRight, m)
  await browser.close()
}

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
