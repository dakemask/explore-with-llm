/**
 * Where focus goes when what held it goes away. Rules (one place for them):
 * - A dialog / menu / panel that closes hands focus back to the button that opened it (`Dialog` does this
 *   itself; Radix menus and the tree map already do). A dialog opened from a menu item returns to that
 *   menu's button (the item is gone).
 * - After an action that starts a new reply (send from the edit dialog, retry, regenerate) or after
 *   switching conversation, focus goes to the input box the user would type in next (`focusComposer`):
 *   the side card's box if it happened in a side card, else the main one.
 * - Collapsing a side / note card leaves focus on nothing (its opener was a highlight, not a control).
 */

/** Focuses the input box of the place `from` is in (an element or the side column); the main one by default. */
export function focusComposer(from?: Element | null) {
  const side = from?.closest('[data-side-column]')?.querySelector<HTMLElement>('textarea[data-composer]')
  const box = side ?? document.querySelector<HTMLElement>('textarea[data-composer]:not([data-side-column] textarea)')
  box?.focus({ preventScroll: true })
}
