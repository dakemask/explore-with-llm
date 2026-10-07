// Where focus goes when what held it goes away (rules: src/lib/focus.ts). Copy this folder into the session
// scratchpad (where playwright-core is installed) and run `node focus-suite.mjs` there, with `pnpm dev` on
// 5173 and `PORT=8788 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { collapseCard, open, send, SC } from './lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const { browser, page } = await open({ model: 'mock-chat' })
const wait = (ms = 400) => page.waitForTimeout(ms)
/** What has focus: 'body', 'main box', 'side box', or `<tag> <label>` (+ ' in dialog'). */
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement
    if (!a || a === document.body) return 'body'
    if (a.matches('textarea[data-composer]')) return a.closest('[data-side-column]') ? 'side box' : 'main box'
    const label = a.getAttribute('aria-label') || a.textContent.trim().slice(0, 20)
    return `${a.tagName.toLowerCase()} ${label}${a.closest('[role=dialog]') ? ' in dialog' : ''}`
  })
const expect = async (name, want) => {
  const got = await focused()
  check(name, got === want, got === want ? undefined : { got, want })
}
const CARD = '[data-side-column] .shadow-pop'
const stopGone = () => page.locator('[aria-label="停止"]').waitFor({ state: 'detached', timeout: 30000 })
const hoverLast = async (scope = SC) => {
  await page.locator(`${scope} [data-turn]`).last().hover()
  await wait(200)
}
const editButton = (scope = page) => scope.getByRole('button', { name: '编辑', exact: true }).last()

async function ask() {
  const para = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).first()
  const b = await para.boundingBox()
  await page.mouse.move(b.x + 2, b.y + 12)
  await page.mouse.down()
  await page.mouse.move(b.x + 120, b.y + 12, { steps: 5 })
  await page.mouse.up()
  await wait(300)
  await page.getByRole('button', { name: '追问', exact: true }).click()
  await wait(600)
}

await send(page, '第一轮')
await expect('F1 after sending, the main box keeps focus', 'main box')

// ---- dialogs closed without doing anything: back to the button that opened them ----
await hoverLast()
await editButton().click()
await wait()
await page.getByRole('button', { name: '取消', exact: true }).click()
await wait()
await expect('D1 edit dialog → Cancel: back on its edit button', 'button 编辑')
await hoverLast()
await editButton().click()
await wait()
await page.keyboard.press('Escape')
await wait()
await expect('D2 edit dialog → Escape: back on its edit button', 'button 编辑')
await hoverLast()
await editButton().click()
await wait()
await page.locator('[role=dialog] textarea').fill('改了')
await page.keyboard.press('Escape')
await wait()
await page.keyboard.press('Escape')
await wait()
await expect('D3 discard confirm → Escape: back in the editor', 'textarea 改了 in dialog')
await page.keyboard.press('Escape')
await wait()
await page.getByRole('button', { name: '确定' }).click()
await wait()
await expect('D4 discard confirm → OK: back on the edit button', 'button 编辑')
await hoverLast()
await page.getByRole('button', { name: '请求详情' }).last().click()
await wait()
await page.keyboard.press('Escape')
await wait()
await expect('D5 detail dialog → Escape: back on its button', 'button 请求详情')

// ---- actions that start a new reply: the input box of that place ----
await hoverLast()
await editButton().click()
await wait()
await page.locator('[role=dialog] textarea').fill('第一轮改')
await page.getByRole('button', { name: '发送', exact: true }).last().click()
await stopGone()
await wait()
await expect('A1 edit dialog → Send: main box', 'main box')
await hoverLast()
await page.getByRole('button', { name: '编辑回复' }).last().click()
await wait()
await page.locator('[role=dialog] textarea').fill('改过的回复')
await page.getByRole('button', { name: '保存', exact: true }).click()
await wait(800)
await expect('A2 reply edit → Save: main box', 'main box')
await hoverLast()
await page.getByRole('button', { name: '重新生成' }).last().click()
await stopGone()
await wait()
await expect('A3 footer retry: main box', 'main box')

// ---- side card ----
await ask()
await page.locator(`${CARD} textarea`).fill('> q\n\n侧问')
await page.locator(`${CARD} textarea`).press('Enter')
await stopGone()
await wait()
await page.locator(CARD).hover()
await page.locator(CARD).getByRole('button', { name: '重新生成' }).last().click()
await stopGone()
await wait()
await expect('S1 retry in a side card: its box', 'side box')
await page.locator(CARD).hover()
await editButton(page.locator(CARD)).click()
await wait()
await page.locator('[role=dialog] textarea').fill('侧问改')
await page.getByRole('button', { name: '发送', exact: true }).last().click()
await stopGone()
await wait()
await expect('S2 edit in a side card → Send: its box', 'side box')
await collapseCard(page, page.locator(CARD))
await wait()
await expect('S3 collapsing a card leaves focus on nothing', 'body')

// ---- conversations ----
await page.getByRole('button', { name: '新对话' }).click()
await wait()
await expect('C1 new chat: main box', 'main box')
await page.getByRole('button', { name: '第一轮' }).first().click()
await wait()
await expect('C2 opening a conversation from the list: main box', 'main box')

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
