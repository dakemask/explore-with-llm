# Explore with LLM

Pure-frontend branching chat app. Users bring their own provider + API key; all data lives in the browser (IndexedDB). Deployed as a static site to GitHub Pages (`.github/workflows/deploy.yml`). No backend, no proxy.

The owner is not a programmer and delegates all technical decisions. Requirements are disclosed incrementally — see "Product decisions" below and keep it updated when new ones are made.

## Commands

- `pnpm dev` — dev server
- `pnpm test` — unit tests (vitest)
- `pnpm build` — typecheck + production build into `dist/`

## Architecture

- `src/db/` — Dexie schema and data types. **Data model is the core; change it deliberately.**
- `src/lib/tree.ts` — tree navigation (active path, path to node).
- `src/lib/chat.ts` — conversation actions: send, stream, stop, build context messages.
- `src/providers/` — one adapter per protocol (`ProtocolAdapter`). Only `openai-chat` is implemented.
- `src/store/` — Zustand: `settings` (persisted to localStorage: lang, theme, last model) and `ui` (in-memory: current conversation, live streaming text).
- `src/i18n/` — zh/en dictionaries; every UI string goes through `useT()`.
- `src/components/ui/` — shared primitives (Button, IconButton, Input, Dialog, Menu, Segmented). Build new UI from these.
- `src/index.css` — design tokens as CSS variables (light + `.dark`). Components use semantic Tailwind colors (`bg-surface`, `text-muted`, `border-border`, `bg-accent`…), never raw palette colors.

## Data model

- `Conversation.selectedChild[parentId | ROOT_KEY]` remembers which child is shown at each fork.
- `ChatNode` = one user message + one assistant message + exactly one request `Attempt`.
  - `kind: 'main' | 'side'`. Side-question roots point `parentId` at the main node they were asked from and carry an `anchor` (offsets into the assistant content).
  - `assistant.content` is what's displayed and sent as context; `attempt.rawText` is the untouched model output.
  - The API key is never stored on nodes.
- Streaming text lives in `useUi().live[nodeId]` and is written to IndexedDB once at the end. Nodes left `streaming` on reload are marked `aborted` at startup.

## Product decisions

- Main view: linear chat of the active path; ‹n/m› switchers at forks (not yet built). A tree-map view may come later — it is just another view over the same data.
- Retry / editing a user message → new sibling node.
- Editing an assistant message → in place, same node; `edited: true`. Text ranges anchoring side questions are locked.
- Side questions: right drawer; context = root→node main path + selected text + question.
- Protocols planned: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages.
- Images in user input (planned); no tool calling. Single-conversation export/import (planned).
- UI languages: zh + en. Desktop only.
- UI should be clean and polished but not complex.

## Roadmap

1. ✅ Base: layout, providers, streaming chat, persistence, themes, i18n
2. Branching: retry, edit user message, ‹n/m› switcher
3. Node detail panel (request / response / error)
4. Side questions + assistant message editing with locked anchors
5. Images, export/import, other protocols
