// Helpers shared by the scroll suites (scroll-*-suite.mjs). Not a suite itself.
import { SC } from './lib.mjs'

export const CARD = '[data-side-column] [data-expanded]'
/** The expanded side card's message area. */
export const CS = `${CARD} .overflow-y-auto`

/** Starts watching the element at (x, y): logs its screen top every frame. */
export const watch = (page, x, y) =>
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
export const unwatch = (page) =>
  page.evaluate(() => {
    window.__w.on = false
    const t = window.__w.tops
    let maxStep = 0
    for (let i = 1; i < t.length; i++) maxStep = Math.max(maxStep, Math.abs(t[i] - t[i - 1]) || (isNaN(t[i]) ? 9999 : 0))
    return { frames: t.length, maxStep: Math.round(maxStep), total: Math.round(t.at(-1) - t[0]) }
  })

export const composer = (page) => page.locator('main > [data-main-composer] textarea')
export async function start(page, text) {
  await composer(page).fill(text)
  await composer(page).press('Enter')
}
export async function pickModel(page, from, to) {
  await page.locator('main > [data-main-composer] button', { hasText: from }).click()
  await page.locator(`[role=menu] >> text=${to}`).first().click()
}
export const atEnd = (s) => s.max - s.scrollTop < 2
export const lastToggle = (page, scope = SC) => page.locator(`${scope} [data-fork] .sticky button`).last()
