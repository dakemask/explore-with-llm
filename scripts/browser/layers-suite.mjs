// Escape / outside-click layering (ui/Layer.tsx): one Escape closes only the topmost open thing — tree map,
// expanded side card / note card, menus, dialogs, a pinned help tip. Copy this folder into the session
// scratchpad (where playwright-core is installed) and run `node layers-suite.mjs` there, with `pnpm dev` on
// 5173 and `PORT=8788 node scripts/mock/server.mjs`. Prints PASS / FAIL per check.
import { open, send, SC } from './lib.mjs'

let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info))
}

const { browser, page } = await open({ model: 'mock-chat' })
const wait = (ms = 350) => page.waitForTimeout(ms)
const esc = async () => {
  await page.keyboard.press('Escape')
  await wait()
}
const TREE = '[data-tree-map]'
const CARD = '[data-side-column] .shadow-pop'
const treeOpen = async () => (await page.locator(TREE).count()) > 0
const cardOpen = async () => (await page.locator(CARD).count()) > 0
const menuOpen = async () => (await page.locator('[role=menu]').count()) > 0
const dialogOpen = async () => (await page.locator('[role=dialog]').count()) > 0
const treeButton = page.getByRole('button', { name: '树图' })
/** Moves the mouse out of the way (a hovered button's tooltip is a layer of its own). */
const park = () => page.mouse.move(5, 890)

/** Selects the start of the first reply paragraph and clicks `action` in the pill (追问 / 笔记). */
async function selectAnd(action) {
  const para = page.locator(`${SC} [data-anchor-root]:not([data-anchor-target]) > div > p`).first()
  const b = await para.boundingBox()
  await page.mouse.move(b.x + 2, b.y + 12)
  await page.mouse.down()
  await page.mouse.move(b.x + 120, b.y + 12, { steps: 5 })
  await page.mouse.up()
  await wait(300)
  await page.getByRole('button', { name: action, exact: true }).click()
  await wait(600)
}

await send(page, '第一轮')
await park()

// ---- T: the tree map alone ----
await treeButton.click()
await park()
await wait()
check('T1 tree map opens', await treeOpen())
await esc()
check('T1 Escape closes it', !(await treeOpen()))
await treeButton.click()
await wait()
await page.mouse.click(700, 700)
await wait()
check('T2 a click outside closes it', !(await treeOpen()))
await treeButton.click()
await wait()
await treeButton.click()
await wait()
check('T3 its button toggles it closed (not closed + reopened)', !(await treeOpen()))

// ---- C: side card ----
await selectAnd('追问')
await park()
check('C1 card expanded (draft)', await cardOpen())
// Typed text in the card's box holds Escape back.
await page.locator(`${CARD} textarea`).fill('> quote\n\n我想问')
await esc()
check('C2 Escape with typed text in the card box keeps it', await cardOpen())
await page.locator(`${CARD} textarea`).fill('')
await esc()
check('C3 Escape with an empty card box collapses it', !(await cardOpen()))
await selectAnd('追问')
await park()
// Main composer focused with text: Escape doesn't collapse the card.
await page.locator('main > div.shrink-0 textarea').fill('主输入框里的字')
await esc()
check('C4 Escape typing in the main composer keeps the card', await cardOpen())
await page.locator('main > div.shrink-0 textarea').fill('')
await page.mouse.click(700, 700)
await wait()
check('C5 a click outside keeps the card', await cardOpen())
await esc()
check('C5 then Escape collapses it', !(await cardOpen()))

// ---- L: layers stacked ----
await selectAnd('追问')
await park()
await treeButton.click()
await park()
await wait()
check('L1 card + tree map open', (await cardOpen()) && (await treeOpen()))
await esc()
check('L1 first Escape closes only the tree map', (await cardOpen()) && !(await treeOpen()))
await esc()
check('L1 second Escape collapses the card', !(await cardOpen()))

await selectAnd('追问')
await page.locator(`${SC} [data-fork]`).last().getByRole('button', { name: '更多' }).click()
await wait()
check('L2 card + menu open', (await cardOpen()) && (await menuOpen()))
await esc()
check('L2 Escape closes only the menu', (await cardOpen()) && !(await menuOpen()))
await park()
await esc()
check('L2 next Escape collapses the card', !(await cardOpen()))

await selectAnd('追问')
await page.locator(`${SC} [data-fork]`).last().getByRole('button', { name: '请求详情' }).click()
await wait()
check('L3 card + detail dialog open', (await cardOpen()) && (await dialogOpen()))
await esc()
check('L3 Escape closes only the dialog', (await cardOpen()) && !(await dialogOpen()))
await park()
await esc()
check('L3 next Escape collapses the card', !(await cardOpen()))

// ---- N: note card ----
await selectAnd('笔记')
await page.keyboard.type('一条笔记')
await esc()
check('N1 Escape in the note editor = done (card stays, editor closed)', (await cardOpen()) && (await page.locator(`${CARD} textarea`).count()) === 0)
await park()
await esc()
check('N1 next Escape collapses it', !(await cardOpen()))

// ---- H: pinned help tip in a dialog ----
await page.getByRole('button', { name: '设置' }).click()
await wait()
await page.getByRole('button', { name: '通用' }).click().catch(() => {})
await wait()
const help = page.locator('[role=dialog] button[aria-pressed]').first()
await help.click()
await park()
await wait(500)
const tipShown = async () => (await page.locator('[data-radix-popper-content-wrapper]').count()) > 0
check('H1 pinned tip stays open after the mouse leaves', await tipShown())
await esc()
check('H1 Escape unpins the tip, the dialog stays', !(await tipShown()) && (await dialogOpen()))
await help.click()
await park()
await wait()
await help.click()
await wait()
check('H2 clicking the ? again unpins it', !(await tipShown()))
await help.click()
await park()
await page.locator('[role=dialog]').click({ position: { x: 20, y: 20 } })
await wait()
check('H3 a click elsewhere in the dialog unpins it, the dialog stays', !(await tipShown()) && (await dialogOpen()))
await esc()
check('H4 Escape then closes the dialog', !(await dialogOpen()))

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
