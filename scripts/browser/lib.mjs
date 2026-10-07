// Helpers for browser scripts: open the app with a seeded mock provider (port 8788), send, measure scrolling.
import { chromium } from 'playwright-core'
export const SP = process.cwd()
export const SC = 'main > div.overflow-y-auto'

/** `scrollbars`: show classic scrollbars, as on Windows (headless Chrome hides them by default). */
export async function open({ models = ['mock-long', 'mock-chat'], model = 'mock-long', theme = 'light', width = 1400, scrollbars = false } = {}) {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ignoreDefaultArgs: scrollbars ? ['--hide-scrollbars'] : [],
  })
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto('http://localhost:5173/')
  await page.evaluate(
    async ({ models, model, theme }) => {
      localStorage.setItem('ewl-settings', JSON.stringify({ state: { lang: 'zh', theme, providerId: 'p1', model, paramChoices: {}, namingModel: null }, version: 0 }))
      await new Promise((res, rej) => {
        const r = indexedDB.open('explore-with-llm')
        r.onsuccess = () => {
          const tx = r.result.transaction('providers', 'readwrite')
          tx.objectStore('providers').put({ id: 'p1', name: 'Mock', protocol: 'openai-chat', baseUrl: 'http://localhost:8788', apiKey: 'k', models, createdAt: Date.now() })
          tx.oncomplete = res
          tx.onerror = rej
        }
      })
    },
    { models, model, theme },
  )
  await page.reload()
  return { browser, page }
}

export async function waitDone(page) {
  await page.waitForTimeout(300)
  await page.locator('[aria-label="停止"]').waitFor({ state: 'detached', timeout: 60000 })
  await page.waitForTimeout(300)
}

export async function send(page, text) {
  const box = page.locator('main > [data-main-composer] textarea')
  await box.fill(text)
  await box.press('Enter')
  await waitDone(page)
}

/** Top of `el` (selector or handle) relative to the scroll area `sc`. */
export function topIn(page, sc, sel, index = -1) {
  return page.evaluate(
    ({ sc, sel, index }) => {
      const box = document.querySelector(sc)
      const all = [...box.querySelectorAll(sel)]
      const el = all.at(index)
      return el ? Math.round(el.getBoundingClientRect().top - box.getBoundingClientRect().top) : null
    },
    { sc, sel, index },
  )
}

export function state(page, sc = SC) {
  return page.evaluate((sc) => {
    const el = document.querySelector(sc)
    // (The blank is the bottom padding of the area's wrapper.)
    return { scrollTop: Math.round(el.scrollTop), max: el.scrollHeight - el.clientHeight, pad: el.firstElementChild?.style.paddingBottom || '0' }
  }, sc)
}

export async function setScroll(page, sc, top) {
  await page.evaluate(({ sc, top }) => (document.querySelector(sc).scrollTop = top), { sc, top })
  await page.waitForTimeout(150)
}

/** Clicks the center of a locator with the real mouse, without scrolling it into view. */
export async function clickAt(page, loc) {
  const b = await loc.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}

/** Moves the real mouse onto a locator's center, without scrolling it into view (`hover()` does). */
export async function hoverAt(page, loc) {
  const b = await loc.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
}

/** Collapses an expanded side / note card (locator) by clicking its header's title area. */
export async function collapseCard(page, card) {
  const b = await card.locator('header').boundingBox()
  await page.mouse.click(b.x + 60, b.y + b.height / 2)
}
