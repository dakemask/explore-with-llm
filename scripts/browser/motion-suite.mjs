// Switch animations (lib/switchMotion.ts, task 19): switching versions slides the turn — in the main chat its
// frame with it, the header staying (task 33) — and everything below it sideways (direction by the switcher's
// order), the old content leaving as a snapshot overlay (and the old frame as one of its own) that is never
// found as the real thing, and is gone afterwards; the attempts' arrows open /
// fold; tree map jumps slide to a sibling, fade to a cousin; while streaming, with an expanded card, between very
// different lengths, in a side card, interrupted by another click or a conversation switch, and with reduced
// motion. Copy this folder into the session scratchpad (where playwright-core is installed) and run
// `node motion-suite.mjs` there, with `pnpm dev` on 5173 and `PORT=8788 DELAY=20 node scripts/mock/server.mjs`.
// Prints PASS / FAIL per check.
import { open, waitDone, send, SC, newChat } from './lib.mjs'
import { CARD, pickModel } from './scroll-lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const { browser, page } = await open({ model: 'mock-chat', models: ['mock-chat', 'mock-long'] })
let errors = 0
page.on('pageerror', () => errors++)
const wait = (ms = 400) => page.waitForTimeout(ms)
const TREE = '[data-tree-map]'
const lastTurn = () => page.locator(`${SC} [data-turn]`).last()
const switcher = () => lastTurn().locator('[data-switcher]')
const retryLast = async () => {
  await lastTurn().getByRole('button', { name: '重新生成' }).last().click()
  await waitDone(page)
}

// Every WAAPI animation started in the chat (the switch animations), and every frame: snapshot overlays,
// duplicates of what the app finds by attribute, horizontal overflow, the last switcher's top.
await page.evaluate(() => {
  const orig = Element.prototype.animate
  window.__anims = []
  Element.prototype.animate = function (kf, opts) {
    const a = orig.call(this, kf, opts)
    if (this.closest('main')) {
      if (this.closest('[data-tree-map]')) return a
      const what = this.hasAttribute('inert')
        ? this.hasAttribute('data-frame-copy')
          ? 'frameCopy'
          : 'overlay'
        : this.matches('[data-node-header]')
          ? 'header'
          : this.matches('[data-framed]') && !kf.some((k) => 'opacity' in k)
            ? 'frame'
            : this.matches('[data-node-body]')
          ? 'body'
          : this.matches('[data-item]')
            ? 'bar'
            : this.matches('[data-card]')
              ? 'card'
              : this.matches('[data-expanded]')
                ? 'expanded'
                : 'turn'
      const x = (k) => +(/translateX\((-?[\d.]+)px\)/.exec(k?.transform ?? '')?.[1] ?? 0)
      window.__anims.push({ what, from: x(kf[0]), to: x(kf.at(-1)), inCard: !!this.closest('[data-expanded]') && what !== 'expanded' })
    }
    return a
  }
})
const startRec = () =>
  page.evaluate(() => {
    window.__anims = []
    const sc = document.querySelector('main > div.overflow-y-auto')
    const rec = (window.__rec = { frames: [], on: true })
    const tick = () => {
      if (!rec.on) return
      const sw = [...sc.querySelectorAll('[data-switcher]')].at(-1)
      const turns = [...sc.querySelectorAll('[data-turn]')].map((t) => t.dataset.turn)
      rec.frames.push({
        overlays: document.querySelectorAll('main [inert][aria-hidden]:not([data-frame-copy])').length,
        overlayCard: !!document.querySelector('main [inert][aria-hidden] .shadow-pop'),
        dupTurns: turns.length !== new Set(turns).size,
        forks: sc.querySelectorAll('[data-fork]').length,
        turns: turns.length,
        wide: document.documentElement.scrollWidth > innerWidth,
        swTop: sw ? sw.getBoundingClientRect().top : null,
      })
      requestAnimationFrame(tick)
    }
    tick()
  })
const stopRec = () =>
  page.evaluate(() => {
    window.__rec.on = false
    const f = window.__rec.frames
    const tops = f.map((x) => x.swTop).filter((x) => x !== null)
    return {
      frames: f.length,
      maxOverlays: Math.max(...f.map((x) => x.overlays)),
      endOverlays: document.querySelectorAll('main [inert][aria-hidden]:not([data-frame-copy])').length,
      overlayCard: f.some((x) => x.overlayCard),
      dup: f.some((x) => x.dupTurns || x.forks !== x.turns),
      wide: f.some((x) => x.wide),
      swMove: tops.length ? Math.round(Math.max(...tops) - Math.min(...tops)) : null,
      anims: window.__anims,
    }
  })
/** Clicks, records until everything settled. */
const switchBy = async (click, ms = 700) => {
  await startRec()
  await click()
  await wait(ms)
  return stopRec()
}
const of = (r, what) => r.anims.filter((a) => a.what === what)
/**
 * Where the main chat's switched turn came in from: its frame slides (from ±40), its header moves back just as
 * much (stays), its body only fades (it moves with the frame); the snapshot and the old frame leave the other
 * way. null if that isn't what happened.
 */
const slide = (r) => {
  const frame = of(r, 'frame')[0]
  const header = of(r, 'header')[0]
  const body = of(r, 'body')[0]
  const out = of(r, 'overlay')[0]
  const copy = of(r, 'frameCopy')[0]
  if (!frame || !header || !body || !out || !copy) return null
  const d = frame.from
  return header.from === -d && body.from === 0 && out.to === -d && copy.to === -d ? d : null
}

// ---- setup: two turns, the second with three attempts (3 / 3 shown) ----
await send(page, 'T1')
await send(page, 'T2')
await retryLast()
await retryLast()
await wait(1500)

// ---- S: sideways between siblings, the snapshot leaving the other way; nothing else moves ----
let r = await switchBy(() => switcher().getByRole('button', { name: '上一个尝试' }).click())
check('S1 ‹: the new turn (frame and body, not its header) comes in from the left, the snapshot leaves to the right', of(r, 'body').length === 1 && slide(r) === -40, r.anims)
check('S1 the snapshot is gone afterwards, never two at once', r.maxOverlays === 1 && r.endOverlays === 0, r)
check('S1 the snapshot is never found as the real thing (no duplicate turns / forks)', !r.dup)
check('S1 the switcher stays in place, no sideways page overflow', r.swMove !== null && r.swMove <= 1 && !r.wide, { swMove: r.swMove, wide: r.wide })
check('S1 now 2 / 3', (await switcher().textContent()).includes('2 / 3'))
r = await switchBy(() => switcher().getByRole('button', { name: '下一个尝试' }).click())
check('S2 ›: from the right', slide(r) === 40, r.anims)
check('S2 now 3 / 3, nothing left semi-transparent', (await switcher().textContent()).includes('3 / 3') && (await lastTurn().locator('[data-node-body]').evaluate((el) => getComputedStyle(el).opacity)) === '1')

// ---- R: a second click in the middle of the first animation: one snapshot at a time, ends where clicked last ----
r = await switchBy(async () => {
  await switcher().getByRole('button', { name: '上一个尝试' }).click()
  await wait(260)
  await switcher().getByRole('button', { name: '下一个尝试' }).click()
}, 900)
check('R1 two quick switches: at most one snapshot at a time, none left', r.maxOverlays === 1 && r.endOverlays === 0, r)
check('R1 ends on the last click (3 / 3), fully shown', (await switcher().textContent()).includes('3 / 3') && (await lastTurn().locator('[data-node-body]').evaluate((el) => getComputedStyle(el).opacity)) === '1')

// ---- G: the attempts' arrows open out / fold away ----
await lastTurn().locator('[data-switcher]').locator('..').getByRole('button', { name: '更多' }).click()
await page.getByRole('menuitem', { name: '设为分支' }).click()
await wait(1500)
r = await switchBy(() => switcher().getByRole('button', { name: /个尝试$/ }).click())
check('G1 branch → attempts: from the right', slide(r) === 40, r.anims)
check('G1 the arrows are open, the ×n gone', /1 \/ 2|2 \/ 2/.test(await switcher().textContent()) && !(await switcher().textContent()).includes('×'), await switcher().textContent())
r = await switchBy(() => switcher().locator('button').first().click())
check('G2 attempts → branch: from the left', slide(r) === -40, r.anims)
check('G2 the arrows folded away, ×2 back', (await switcher().textContent()).trim() === '×2', await switcher().textContent())

// ---- T: streaming: switching away from and back to a reply that is still coming in ----
await pickModel(page, 'mock-chat', 'mock-long')
await switcher().getByRole('button', { name: /个尝试$/ }).click()
await wait(800)
await lastTurn().getByRole('button', { name: '重新生成' }).last().click()
await page.locator('[aria-label="停止"]').waitFor()
await wait(1500)
r = await switchBy(() => switcher().getByRole('button', { name: '上一个尝试' }).click())
check('T1 switching away from a streaming reply slides', slide(r) === -40 && r.endOverlays === 0, r.anims)
const len = () => lastTurn().locator('[data-node-body]').evaluate((el) => el.textContent.length)
r = await switchBy(() => switcher().getByRole('button', { name: '下一个尝试' }).click())
const l0 = await len()
check('T2 back to it: it slides in, still streaming', slide(r) === 40 && (await page.locator('[aria-label="停止"]').count()) === 1, r.anims)
await waitDone(page)
check('T2 …and its reply finishes there', (await len()) > l0 + 200, { l0, l1: await len() })
await pickModel(page, 'mock-long', 'mock-chat')

// ---- L: very different lengths (the long mock-long reply ↔ a short one): heights snap, the view stays ----
const scTop = () => page.evaluate((sc) => Math.round(document.querySelector(sc).scrollTop), SC)
await page.evaluate((sc) => {
  const box = document.querySelector(sc)
  const sw = [...box.querySelectorAll('[data-switcher]')].at(-1)
  box.scrollTop += sw.getBoundingClientRect().top - box.getBoundingClientRect().top - 60
}, SC)
await wait(1500)
let top0 = await scTop()
r = await switchBy(() => switcher().getByRole('button', { name: '上一个尝试' }).click(), 900)
check('L1 long → short: the switcher stays, no sideways overflow, one snapshot gone after', r.swMove <= 1 && !r.wide && r.endOverlays === 0, { swMove: r.swMove, wide: r.wide })
check('L1 the view did not move', (await scTop()) === top0, { before: top0, after: await scTop() })
await switchBy(() => switcher().getByRole('button', { name: '下一个尝试' }).click(), 900)

// ---- C: an expanded side card below the fork leaves with the old version and comes back with it ----
await switcher().getByRole('button', { name: '上一个尝试' }).click()
await wait(1500)
const para = lastTurn().locator('[data-anchor-root]:not([data-anchor-target]) > div > p').first()
await para.scrollIntoViewIfNeeded()
await wait(1300)
const pb = await para.boundingBox()
await page.mouse.move(pb.x + 2, pb.y + 12)
await page.mouse.down()
await page.mouse.move(pb.x + 120, pb.y + 12, { steps: 5 })
await page.mouse.up()
await wait(300)
await page.getByRole('button', { name: '追问' }).click()
await wait(600)
await page.locator(`${CARD} textarea`).press('End')
await page.keyboard.type('侧边 C')
await page.keyboard.press('Enter')
await waitDone(page)
await wait(800)
// (Asked from, the shown attempt became a branch: the other attempts are behind the ×n.)
const askedFrom = await switcher().locator('button').evaluateAll((bs) => bs.findIndex((b) => b.getAttribute('aria-current')))
r = await switchBy(() => switcher().getByRole('button', { name: /个尝试$/ }).click(), 900)
check('C1 the expanded card is in the snapshot and leaves with it', r.overlayCard && r.endOverlays === 0, { overlayCard: r.overlayCard })
check('C1 the card is collapsed afterwards (its thread left the path)', (await page.locator(CARD).count()) === 0)
await switchBy(() => switcher().locator('button').nth(askedFrom).click(), 900)

// ---- D: a side card's ‹n/m› ----
await page.locator('[data-side-column] [data-card]').first().locator('button').first().click()
await wait(800)
await page.locator(CARD).getByRole('button', { name: '重新生成' }).last().click()
await waitDone(page)
await wait(1500)
r = await switchBy(() => page.locator(CARD).getByRole('button', { name: '上一个版本' }).click(), 900)
check('D1 in a side card: its body slides in from the left, the snapshot inside the card', r.anims.some((a) => a.what === 'body' && a.inCard && a.from === -40) && r.anims.some((a) => a.what === 'overlay' && a.inCard), r.anims)
check('D1 the card is still expanded, no snapshot left', (await page.locator(CARD).count()) === 1 && r.endOverlays === 0)
await page.keyboard.press('Escape')
await wait(500)
await page.mouse.click(5, 300)

// ---- M: tree map jumps: to a sibling slides, to a cousin fades ----
// Second branch with a follow-up: T2 attempt → T3x below it, followed up too (attempts off the shown path
// aren't drawn in the map, so T3x must be a branch to be jumped to).
await switcher().getByRole('button', { name: /个尝试$/ }).click()
await wait(1000)
await send(page, 'T3x')
await send(page, 'T4x')
await page.getByRole('button', { name: '树图' }).click()
await wait(800)
// Over to another branch at T2's fork (not the one T3x is under).
const t2switcher = page.locator(`${SC} [data-turn]`).nth(1).locator('[data-switcher]')
const onT3x = () => page.locator(`${SC} [data-turn]`).filter({ hasText: 'T3x' }).count()
for (let i = 0; (await onT3x()) && i < (await t2switcher.locator('button').count()); i++) {
  await t2switcher.locator('button').nth(i).click()
  await wait(900)
}
// Jump to T3x (a cousin's child): fade.
r = await switchBy(() => page.locator(`${TREE} g[role=button][aria-label*="T3x"]`).click(), 900)
check('M1 tree map jump to a cousin: a plain fade (no sideways shift)', of(r, 'body').length === 1 && r.anims.every((a) => a.from === 0 && a.to === 0) && r.endOverlays === 0, r.anims)
// Jump to T2's other branch (the one asked from): a sibling of the shown T2 → slides.
const t2 = page.locator(`${TREE} g[role=button][aria-label*="T2"]`)
const t2count = await t2.count()
let slid = false
for (let i = 0; i < t2count && !slid; i++) {
  const cur = await t2.nth(i).getAttribute('aria-current')
  if (cur) continue
  r = await switchBy(() => t2.nth(i).click(), 900)
  slid = slide(r) === -40 || slide(r) === 40
}
check('M2 tree map jump to a sibling: slides sideways', slid, r.anims)
await page.getByRole('button', { name: '树图' }).click()
await wait(400)

// ---- X: switching conversation in the middle of an animation drops it ----
await startRec()
await switcher().locator('button').last().click()
await wait(200)
await newChat(page)
await wait(500)
r = await stopRec()
check('X1 conversation switch mid-animation: no snapshot left', r.endOverlays === 0 && (await page.locator('main [inert][aria-hidden]').count()) === 0)
await page.getByRole('button', { name: '对话列表' }).click()
await page.locator('[data-conversation-list]').getByText('T1').first().click()
await page.keyboard.press('Escape')
await wait(1500)

// ---- Z: reduced motion: a plain fade ----
await page.emulateMedia({ reducedMotion: 'reduce' })
r = await switchBy(() => switcher().locator('button').first().click(), 900)
check('Z1 reduced motion: fades, no sideways shift', of(r, 'body').length === 1 && r.anims.every((a) => a.from === 0 && a.to === 0) && r.endOverlays === 0, r.anims)
await page.emulateMedia({ reducedMotion: 'no-preference' })

check('no page errors', errors === 0, errors)
console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
process.exit(failures ? 1 : 0)
