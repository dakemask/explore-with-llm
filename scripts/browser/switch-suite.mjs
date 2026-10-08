// Switching conversation (`setConversation` + the reset in ChatView): what's cleared, what's kept per
// conversation. Copy this folder into the session scratchpad (where playwright-core is installed) and run
// `node switch-suite.mjs` there, with `pnpm dev` on 5173 and `PORT=8788 node scripts/mock/server.mjs`.
// Prints PASS / FAIL per check.
import { open, openConversation, newChat as newChatFromList, send, SC } from './lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const { browser, page } = await open({ model: 'mock-chat' })
const wait = (ms = 400) => page.waitForTimeout(ms)
const MAIN = 'main > [data-main-composer] textarea'
const CARD = '[data-side-column] .shadow-pop'
const TREE = '[data-tree-map]'
const box = () => page.locator(MAIN).inputValue()
const thumbs = () => page.locator('main > [data-main-composer] img').count()
const go = async (title) => {
  await openConversation(page, title)
  await wait()
  await page.keyboard.press('Escape') // (the list card stays open after picking)
  await wait()
}
const newChat = async () => {
  await newChatFromList(page)
  await wait()
}
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

await send(page, 'A 对话')
await newChat()
await send(page, 'B 对话')

// ---- unsent text in the main box: kept per conversation ----
await page.locator(MAIN).fill('写给 B 的半句话')
await go('A 对话')
check('M1 switching B → A: A starts with an empty box', (await box()) === '', await box())
await page.locator(MAIN).fill('写给 A 的')
await go('B 对话')
check('M2 back to B: its unsent text is there', (await box()) === '写给 B 的半句话', await box())
await newChat()
check('M3 new chat: empty box', (await box()) === '', await box())
await page.locator(MAIN).fill('新对话里的草稿')
await go('A 对话')
check('M4 A keeps its own text', (await box()) === '写给 A 的', await box())
await newChat()
check('M5 the new chat keeps its own text', (await box()) === '新对话里的草稿', await box())
// An image attached in B stays with B.
await go('B 对话')
await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = c.height = 8
  c.getContext('2d').fillRect(0, 0, 8, 8)
  window.__png = c.toDataURL('image/png')
})
const png = Buffer.from((await page.evaluate(() => window.__png)).split(',')[1], 'base64')
await page.locator('main > [data-main-composer] input[accept="image/*"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png })
await wait(600)
const before = await thumbs()
await go('A 对话')
const inA = await thumbs()
await go('B 对话')
check('M6 an attached image stays with its conversation', before === 1 && inA === 0 && (await thumbs()) === 1, { before, inA, after: await thumbs() })
// Sending the first message of a new chat: the box is empty afterwards, and the new-chat draft is gone.
await page.locator(MAIN).fill('')
await newChat()
await page.locator(MAIN).fill('C 对话')
await page.locator(MAIN).press('Enter')
await page.locator('[aria-label="停止"]').waitFor({ state: 'detached', timeout: 30000 })
await wait()
check('M7 after the first send in a new chat the box is empty', (await box()) === '', await box())
await newChat()
check('M8 the next new chat starts empty', (await box()) === '', await box())

// ---- transient UI: cleared ----
await go('A 对话')
await page.getByRole('button', { name: '树图' }).click()
await wait()
await go('B 对话')
check('T1 tree map stays open after switching', (await page.locator(TREE).count()) === 1)
check('T1 … showing the new conversation', (await page.locator(`${TREE} g[role=button]`).first().getAttribute('aria-label'))?.includes('B '))
await page.locator(`${TREE} [aria-label="关闭"]`).click()
await wait()
await ask()
check('T2 side draft card open', (await page.locator(CARD).count()) === 1)
await page.locator(`${CARD} textarea`).fill('> q\n\nB 的侧问草稿')
await go('A 对话')
check('T3 switching collapses the card', (await page.locator(CARD).count()) === 0)
const draftsInA = await page.getByText('草稿', { exact: true }).count()
await go('B 对话')
const draftsInB = await page.getByText('草稿', { exact: true }).count()
check('T4 the typed side-question draft stays with B', draftsInA === 0 && draftsInB === 1, { draftsInA, draftsInB })

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
