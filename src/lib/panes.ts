/**
 * The two side panes' widths (px): the conversation list (left) and the side-question column (right).
 * The user drags them (`ui/ResizeHandle`); open / closed and widths are kept in `useSettings().panes`.
 */
export const PANE_DEFAULT = { list: 256, column: 380 }
export const PANE_MIN = { list: 200, column: 260 }
export const PANE_MAX = { list: 420, column: 640 }

export const clampPane = (pane: keyof typeof PANE_DEFAULT, px: number) =>
  Math.round(Math.min(PANE_MAX[pane], Math.max(PANE_MIN[pane], px)))
