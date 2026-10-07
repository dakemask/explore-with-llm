import { DismissableLayer } from '@radix-ui/react-dismissable-layer'

/**
 * A panel that closes on Escape / a click outside it, stacked with Radix's dialogs, menus, popovers and
 * tooltips: only the topmost open layer gets Escape and its outside clicks, so one Escape closes one
 * thing. The owner of Escape / outside-click handling for anything that isn't a Dialog / Menu / Popover;
 * don't add document key or pointer listeners for this. (Radix's own layer, the one its primitives use —
 * it must stay the same package version as theirs, or the stacks don't see each other.)
 *
 * `onDismiss` runs on Escape / outside pointer down / focus moving outside, unless the matching
 * `onEscapeKeyDown` / `onPointerDownOutside` / `onFocusOutside` calls `preventDefault()`.
 */
export const Layer = DismissableLayer
