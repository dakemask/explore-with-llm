# Explore with LLM

Pure-frontend branching chat app. Users bring their own provider + API key; all data lives in the browser (IndexedDB). Deployed as a static site to GitHub Pages (`.github/workflows/deploy.yml`). No backend, no proxy.

The owner is not a programmer and delegates all technical decisions. Requirements are disclosed incrementally — see "Product decisions" below and keep it updated when new ones are made.

## Commands

- `pnpm dev` — dev server
- `pnpm test` — unit tests (vitest)
- `pnpm build` — typecheck + production build into `dist/`
- `pnpm mock` — fake OpenAI-compatible streaming server on :8787 (see `scripts/mock/server.mjs`)

## Verifying UI changes

The owner can't review code, so check changes in a real browser before reporting done:
run `pnpm dev` + `pnpm mock`, then drive the page with `playwright-core` using the locally installed
Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`) — install playwright-core in the
session scratchpad, not in this project. Add a Custom provider with base URL `http://localhost:8787`;
model `mock-chat` streams reasoning + markdown/code/math (prefixed with a request counter and the last user message, so branches differ), `mock-bad` returns 401. Take screenshots
and look at them; check both themes when touching styles.

Shortcuts for scripts: seed the provider by writing straight into the `providers` store of the
`explore-with-llm` IndexedDB and reloading (faster than clicking through Settings). To wait for a
reply to finish, wait for the Stop button (`aria-label="停止"`) to disappear — the Send button exists
(disabled) even while streaming.

## Gotchas

- Git Bash heredocs on this machine can eat backslashes. Write files containing `\` (LaTeX, regex) with the Write tool, not heredocs. Long multi-edit Python heredocs also tend to fail to parse; use Write/Edit.
- Python's `open(..., 'w')` on Windows writes CRLF; the repo is LF (`.gitattributes`). Pass `newline='\n'`.
- Tailwind v4 `translate-*` utilities use the CSS `translate` property, which stacks with `transform` in keyframes. Animations on centered elements must not use `translate()` in `transform`.
- Radix Dialog autofocuses the first button, which opens its tooltip. `Dialog` focuses the panel instead (`onOpenAutoFocus`); keep that for new dialogs.
- Inputs bound to Dexie data must keep local state (IndexedDB writes are async; binding directly drops keystrokes). See `ProviderForm`.
- Streaming mock replies can finish before a test clicks Stop; run `DELAY=60 pnpm mock` for stop tests.

## Architecture

- `src/db/` — Dexie schema and data types. **Data model is the core; change it deliberately.**
- `src/lib/tree.ts` — tree navigation (active path, path to node).
- `src/lib/chat.ts` — conversation actions: send, stream, stop, build context messages.
- `src/providers/` — one adapter per protocol (`ProtocolAdapter`). Only `openai-chat` is implemented.
- `src/store/` — Zustand: `settings` (persisted to localStorage: lang, theme, last model) and `ui` (in-memory: current conversation, live streaming text, right panel).
- `src/i18n/` — zh/en dictionaries; every UI string goes through `useT()`.
- `src/components/ui/` — shared primitives (Button, IconButton, Input, Dialog, Menu, Segmented). Build new UI from these.
- `src/index.css` — design tokens as CSS variables (light + `.dark`). Components use semantic Tailwind colors (`bg-surface`, `text-muted`, `border-border`, `bg-accent`…), never raw palette colors.

## Data model

- `Conversation.selectedChild[parentId | ROOT_KEY]` remembers which child is shown at each fork.
- `ChatNode` = one user message + one assistant message + exactly one request `Attempt`.
  - `kind: 'main' | 'side'`. Side-question roots point `parentId` at the main node they were asked from and carry an `anchor` (offsets into the assistant content).
  - `assistant.content` is what's displayed and sent as context; `attempt.rawText` is the untouched model output.
  - `Attempt` records the HTTP exchange verbatim: `requestHeaders` (**includes the API key** — owner's choice, so details show exactly what was sent; export must strip it), `requestBody`, `response` (status + CORS-readable headers), `rawChunks` (response body as received, with ms offsets). The detail panel derives events / merged view from these; adapters provide `aggregate()` (generic delta merge, keeps unknown vendor fields).
- Streaming text lives in `useUi().live[nodeId]` and is written to IndexedDB once at the end. Nodes left `streaming` on reload are marked `aborted` at startup.

## Product decisions

- Main view: linear chat of the active path; ‹n/m› switcher under the user message of any node with siblings. A tree-map view may come later — it is just another view over the same data.
- Retry / editing a user message → new sibling node, using the model currently selected in the picker (lets users compare models). Error boxes have a visible Retry button.
- Editing an assistant message → in place, same node; `edited: true`. Text ranges anchoring side questions are locked.
- Right side is one panel slot (`useUi().panel`), docked, pushes the chat. Node detail (ⓘ in the reply footer, "详情" on error boxes) lives there now; side questions will be another `panel` variant. Switching conversation closes it.
- Side questions: right drawer; context = root→node main path + selected text + question.
- Protocols planned: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages.
- Provider config should let users freely decide which request parameters are sent and their values; avoid per-vendor adaptation in the app (no OpenRouter-specific request params etc.). The app adapts per *protocol*, not per vendor. Planned: per-provider params template + custom headers + "which assistant fields to echo back" option (default: content only, since e.g. DeepSeek rejects echoed `reasoning_content`).
- Reasoning / encrypted reasoning (agreed design, step 3b): store the assistant reply in its native protocol shape (the merged message / output items / content blocks, unknown fields included) and echo it back verbatim in context when the protocol matches; downgrade to plain text across protocols; only replace text when the user edited it. Display recognizes a small list of known fields (`reasoning_content`, `reasoning`, `reasoning_details`, Anthropic `thinking`/`redacted_thinking`, Responses `reasoning` summary/encrypted_content, `<think>` tags) and falls back to raw. In request details, history reasoning folds together with history messages.
- Images in user input (planned); no tool calling. Single-conversation export/import (planned).
- UI languages: zh + en. Desktop only.
- UI should be clean and polished but not complex.

## Roadmap

1. ✅ Base: layout, providers, streaming chat, persistence, themes, i18n
2. ✅ Branching: retry, edit user message, ‹n/m› switcher
3. ✅ Node detail panel (request / response / error)
   - 3a ✅ raw capture: headers (key masked, reveal toggle), body with folded history, SSE events / merged / raw views
   - 3b native reply storage + reasoning (incl. encrypted) display and echo-back
4. Side questions + assistant message editing with locked anchors
5. Images, export/import, other protocols
