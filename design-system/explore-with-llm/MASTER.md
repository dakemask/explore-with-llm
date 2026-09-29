# Explore with LLM — desktop UI system

## Direction

Minimal, content-first three-column workspace. Derived from the UI/UX pro max skill's AI-native interface and Minimalism & Swiss Style guidance. The initial design-system search included marketing-page sections; these did not fit a conversation application and were excluded. A focused style search confirmed minimal workspace guidance; React effect cleanup guidance informed transient menus and selection listeners.

## Layout and typography

- Viewport-bound grid with `minmax(0, 1fr)` rows. Columns and scroll children explicitly use `min-height: 0`.
- Conversation list, main history and side history scroll independently. Headers and composers remain within the viewport.
- Desktop verification widths: 1024, 1280, 1440. Preserve the user's desktop-only scope.
- One system sans-serif family; body 15px, controls 13–14px, metadata 12px, empty-page heading 28px.
- White content surfaces, quiet slate navigation, blue primary controls and teal question references. Read-only inherited history uses a muted surface with normal readable text.
- Standard icon controls 30–32px; dialog actions at least 36px. Visible focus rings and accessible icon labels.

## Interaction

- New conversation is an in-memory empty workspace until its first sent message.
- Model and `none / low / high / max` effort are selected together beside the composer.
- Each message has a role icon; only the system role has a visible name. Time/model/effort sit below content.
- Side tabs have a context menu, including keyboard ContextMenu / Shift+F10 support.
- One CodeMirror editor preserves natural selection and undo; protected source ranges are decorated inline and transactions that alter them are rejected.
- Each side thread has one tree node in a vertical group to the right of its owner, outside the main continuation path.
- Text-selection action dismisses on outside pointer, cleared selection, scroll, Escape, window blur and resize.

## Motion

140ms hover/menu feedback and 220ms modal/sidebar entry; animate opacity and transforms. Reduced-motion preference disables transitions, animation and smooth scrolling. No streaming text entrance animation or blocking transitions.

## Compatibility

Keep the existing IndexedDB database identity to preserve local history. Old Boolean thinking settings map to high/none. Older messages without timestamps are not assigned invented send times.

### Detail refinement
Use 60px aligned column headers, 14px header labels, 18px header icons and 32px header actions. Messages use 16px vertical padding and 1.6 body line height; the shared edit surface uses 1.5. Preserve the supplied PNG logo. Sidebar transitions retain mounted inert panels and honor reduced motion. Title loading is a quiet three-dot indicator; language choice currently contains only Simplified Chinese.
