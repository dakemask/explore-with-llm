/**
 * The side-question column's width (px). The user drags it (`ui/ResizeHandle`);
 * open / closed and width are kept in `useSettings().panes`.
 */
export const PANE_DEFAULT = { column: 380 }
export const PANE_MIN = { column: 260 }
export const PANE_MAX = { column: 640 }

export const clampPane = (pane: keyof typeof PANE_DEFAULT, px: number) =>
  Math.round(Math.min(PANE_MAX[pane], Math.max(PANE_MIN[pane], px)))
