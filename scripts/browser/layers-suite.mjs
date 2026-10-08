// Escape / outside-click layering (ui/Layer.tsx): one Escape closes only the topmost open thing — the tree
// map window (not a layer: Escape only with focus inside it, never outside clicks), expanded side card / note card, menus, dialogs, a pinned help tip (representative stacks, not every pair). Copy this folder into the session
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
const focusInTree = () => page.locator(`${TREE} g[role=button]`).first().focus()
const focusOnTreeButton = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '树图')

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
check('T1 Escape with focus outside it keeps it', await treeOpen())
await focusInTree()
await esc()
check('T1 Escape with focus inside closes it', !(await treeOpen()))
check('T1 … and hands focus back to its button', await focusOnTreeButton())
// Right-clicking a node opens the label dialog above the map: Escape / OK close only the dialog.
await treeButton.click()
await wait()
const unit = await page.locator(`${TREE} g[role=button]`).first().boundingBox()
await page.mouse.click(unit.x + unit.width / 2, unit.y + unit.height / 2, { button: 'right' })
await wait()
check('T4 right-click: label dialog over the tree map', (await dialogOpen()) && (await treeOpen()))
await esc()
check('T4 Escape closes only the dialog', !(await dialogOpen()) && (await treeOpen()))
await page.mouse.click(unit.x + unit.width / 2, unit.y + unit.height / 2, { button: 'right' })
await wait()
await page.getByRole('button', { name: '确定' }).click()
await wait()
check('T4 OK closes only the dialog', !(await dialogOpen()) && (await treeOpen()))
await focusInTree()
await esc()
check('T4 next Escape closes the tree map', !(await treeOpen()))

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
await page.locator('main > [data-main-composer] textarea').fill('主输入框里的字')
await esc()
check('C4 Escape typing in the main composer keeps the card', await cardOpen())
await page.locator('main > [data-main-composer] textarea').fill('')
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
await focusInTree()
await esc()
check('L1 Escape with focus in the map closes only the map', (await cardOpen()) && !(await treeOpen()))
await esc()
check('L1 next Escape collapses the card', !(await cardOpen()))
await selectAnd('追问')
await park()
await treeButton.click()
await park()
await wait()
await esc()
check('L1 Escape with focus outside the map collapses only the card', !(await cardOpen()) && (await treeOpen()))
await focusInTree()
await esc()

await selectAnd('追问')
await page.locator(`${SC} [data-fork]`).last().getByRole('button', { name: '更多' }).click()
await wait()
check('L2 card + menu open', (await cardOpen()) && (await menuOpen()))
await esc()
check('L2 Escape closes only the menu', (await cardOpen()) && !(await menuOpen()))
await park()
await esc()
check('L2 next Escape collapses the card', !(await cardOpen()))

// ---- N: note card ----
await selectAnd('笔记')
await page.keyboard.type('一条笔记')
await esc()
check('N1 Escape in the note editor = done (card stays, editor closed)', (await cardOpen()) && (await page.locator(`${CARD} textarea`).count()) === 0)
await park()
await esc()
check('N1 next Escape collapses it', !(await cardOpen()))
// Its header (not its buttons) collapses it on click.
await page.locator('[data-side-column] [data-card] > button').first().click()
await wait()
const head = await page.locator(`${CARD} header`).boundingBox()
await page.mouse.click(head.x + 60, head.y + head.height / 2)
await wait()
check('N3 a click on the card header collapses it', !(await cardOpen()))
await park()

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

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
await browser.close()
