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
model `mock-chat` streams `reasoning_content` + markdown/code/math, `mock-think` streams OpenRouter-style summary + encrypted `reasoning_details`, `mock-tags` puts `<think>` in the content, `mock-bad` returns 401. Every reply starts with a line echoing the request counter, context size, extra fields echoed back on earlier assistant messages, body fields beyond model/messages/stream (i.e. the model's parameters), and the last user message. Take screenshots
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
- Anything animating past the viewport edge (e.g. the panel's slide-in) makes Windows Chrome flash a scrollbar and jump the page; the app root has `overflow-hidden` for this — keep it. Headless tests use overlay scrollbars, so check `document.documentElement.scrollWidth` instead of eyeballing.
- Streaming mock replies can finish before a test clicks Stop; run `DELAY=60 pnpm mock` for stop tests.

## Architecture

- `src/db/` — Dexie schema and data types. **Data model is the core; change it deliberately.**
- `src/lib/tree.ts` — tree navigation (active path, side-question threads, path to node).
- `src/lib/anchor.ts` — maps rendered Markdown ↔ source offsets: a rehype plugin wraps every text run with `data-s`/`data-e` (math and other unpositioned output become atomic ranges), highlights anchors, and `rangeToSource` turns a DOM selection into source offsets. Also the lock logic for editing around anchors.
- `src/lib/chat.ts` — conversation actions: send, stream, stop, build context messages.
- `src/lib/params.ts` — per-model parameter configs: parse the user's JSON (`parseParamConfig`), apply choices + dependencies and merge bodies (`resolveParams`), custom header parsing. `paramsDoc.ts` is the user-facing format guide (zh/en, also meant to be pasted to an LLM).
- `src/providers/` — one adapter per protocol (`ProtocolAdapter`). Only `openai-chat` is implemented.
- `src/store/` — Zustand: `settings` (persisted to localStorage: lang, theme, last model) and `ui` (in-memory: current conversation, live streaming text, right panel).
- `src/i18n/` — zh/en dictionaries; every UI string goes through `useT()`.
- `src/components/ui/` — shared primitives (Button, IconButton, Input, Dialog, Menu, Segmented). Build new UI from these.
- `src/index.css` — design tokens as CSS variables (light + `.dark`). Components use semantic Tailwind colors (`bg-surface`, `text-muted`, `border-border`, `bg-accent`…), never raw palette colors.

## Data model

- `Conversation.selectedChild[parentId | ROOT_KEY]` remembers which child is shown at each fork.
- `ChatNode` = one user message + one assistant message + exactly one request `Attempt`.
  - `kind: 'main' | 'side'`. Side-question roots point `parentId` at the main node they were asked from and carry an `anchor` (offsets into the assistant content + the quoted source text; used for highlighting and locking only, never sent). Every side node has `thread` (one side question + follow-ups); retrying/editing a root makes another root with the same thread and anchor. The shown root version is remembered under `selectedChild[thread]` (see `forkKey`).
  - `assistant.content` is what's displayed and sent as context; `attempt.rawText` is the untouched model output. Each in-place edit pushes the previous text onto `assistant.history` (oldest first, with times); `replyVersions()` lists all versions.
  - `Attempt` records the HTTP exchange verbatim: `requestHeaders` (**includes the API key** — owner's choice, so details show exactly what was sent; export must strip it), `requestBody`, `response` (status + CORS-readable headers), `rawChunks` (response body as received, with ms offsets). The detail panel derives events / merged view from these; adapters provide `aggregate()` (generic delta merge, keeps unknown vendor fields).
- Streaming text lives in `useUi().live[nodeId]` and is written to IndexedDB once at the end. Nodes left `streaming` on reload are marked `aborted` at startup.

## Product decisions

- Main view: linear chat of the active path; ‹n/m› switcher under the user message of any node with siblings. A tree-map view may come later — it is just another view over the same data.
- Retry / editing a user message → new sibling node, using the model currently selected in the picker (lets users compare models). Error boxes have a visible Retry button.
- Editing an assistant message → in place, same node; `edited: true`. Text ranges anchoring side questions are locked.
- Right side is one panel slot (`useUi().panel`), docked, pushes the chat: node detail (ⓘ in the reply footer, "详情" on error boxes) or a side-question thread. Detail opened from a side panel has a back button. Switching conversation closes it.
- Side questions: select text in a main-line assistant reply (body only, not reasoning or user messages) → floating "追问" → right panel. The input box is prefilled with the selection as a `> ` blockquote + blank line, so the user decides what gets quoted; context = root→node main path + the side thread, sent as typed. Side threads never enter the main context. A thread is a full mini-chat (follow-ups, retry, edit, ‹n/m›). No side questions inside side answers. Anchored text is highlighted; click opens the thread, overlapping highlights show a picker. The panel can delete the thread.
- Editing an assistant reply: Markdown source editor; text quoted by side questions is greyed and refuses edits (delete the side question to unlock); edits elsewhere shift the anchors. Earlier versions are shown in a "历史版本" tab of the detail panel.
- Protocols planned: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages.
- Providers: **no presets, no defaults.** "Add provider" makes a blank form. The app adapts per *protocol*, never per vendor, and adds no optional request fields itself (not even `stream_options`); the request body is only the protocol's required fields + the model's parameter config.
- Model parameters (`Provider.modelParams[model]`, JSON text in the format of `lib/params.ts` / `paramsDoc.ts`): per model. Four types — `choice` (placeholder `"EFFORT"`), `range` (placeholder `"VALUE"`, min/max/step), `fixed`, `silent` (always sent, not shown). The first three have a name, optional `toggle` (+`defaultOn`), `default`, and `requires` (`{name: true|false|value|[values]}`; chains allowed, cycles rejected). Unmet dependency → control greyed, not sent. Bodies deep-merge in config order; the protocol's own fields (`adapter.reserved`) are rejected. Settings show parse errors live; an invalid config blocks sending (composer shows a red chip linking to the editor). "Copy from another model" exists; a format guide dialog has a copy button.
- The model picker and parameter controls live in the composer's bottom bar (main and side panel share them). Parameter choices are remembered per provider+model in `useSettings().paramChoices`.
- Echo-back ("回传思维链", `Provider.echoReasoning`) and custom headers (`Provider.headers`, `Name: value` lines, may replace built-ins case-insensitively, also used for model listing) are separate from parameters. Echo on with no `echoFields` → automatic: the first field present from the adapter's `echoPriority` (openai-chat: `reasoning_details` › `reasoning_content` › `reasoning`; only one, since they duplicate each other). Anthropic thinking blocks (incl. redacted) count as one entry when that adapter comes.
- Reasoning / encrypted reasoning: `attempt.message` holds the reply in native protocol shape (unknown fields included). `Provider.echoReasoning` / `echoFields` pick which of its fields are sent back in context (see above; `*` = all); only to the **same provider** that produced the reply (stricter than same-protocol: another vendor's encrypted blobs/signatures are useless or rejected). Text always comes from `assistant.content`, so edits win. Display (`lib/reasoning.ts`) recognizes `reasoning_content` / `reasoning`, OpenRouter `reasoning_details` (text / summary / encrypted → lock badge), and leading `<think>` blocks (moved out of `assistant.content`; raw stays in `rawText`). Add Anthropic `thinking`/`redacted_thinking` and Responses `reasoning` items with those adapters. In request details, history reasoning folds with history messages.
- User messages render as Markdown too, with single newlines kept as line breaks (`remark-breaks`).
- Images in user input (planned); no tool calling. Single-conversation export/import (planned).
- UI languages: zh + en. Desktop only.
- UI should be clean and polished but not complex.

## Roadmap

1. ✅ Base: layout, providers, streaming chat, persistence, themes, i18n
2. ✅ Branching: retry, edit user message, ‹n/m› switcher
3. ✅ Node detail panel (request / response / error)
   - 3a ✅ raw capture: headers (key masked, reveal toggle), body with folded history, SSE events / merged / raw views
   - 3b ✅ native reply storage, echo-back setting, reasoning (summary / encrypted / `<think>`) display
4. ✅ Side questions + assistant message editing with locked anchors
5. Images, export/import, other protocols
   - 5a ✅ per-model parameter configs, echo switch + auto field, custom headers, presets removed, picker moved into the composer
   - next: Anthropic Messages + OpenAI Responses adapters, then images, then export/import
