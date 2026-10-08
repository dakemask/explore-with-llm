# Built-in presets: sources and reasons

The presets live in `src/lib/presetData.ts` (26 presets); `src/presets.test.ts` checks that every one parses and resolves to a sendable body. A preset is one protocol + model + channel (so far only the vendors' official APIs) and holds only a model config: parameters, echo-back, headers. It has no model id or base URL, so it also works on third-party channels that serve the model with the official parameters.

Sections: per vendor, the sources and the notes each preset needs (about the sources: an inferred rule, an alias; about what a parameter does). Then the open points, then the reasons shared by all presets. When adding presets for newer models, add a section here.

Checked against the vendors' docs on 2026-10-04 (Anthropic re-checked 2026-10-08).

## DeepSeek (OpenAI Chat Completions, `https://api.deepseek.com`)

Presets: `deepseek-flash` (V4.1 Flash), `deepseek-v4-pro`.

Sources: https://api-docs.deepseek.com/api/create-chat-completion, https://api-docs.deepseek.com/guides/thinking_mode/, https://api-docs.deepseek.com/quick_start/pricing, https://api-docs.deepseek.com/updates/

About the sources:
- `deepseek-flash` was released 2026-09-10; the old name `deepseek-v4-flash` is "temporarily routed" to it.
- Both have a 1M context and output up to 384K = 393,216 tokens. Flash supports images; Pro does not.
- The chat API page documents both models with one parameter set; the effort levels `low` / `high` / `max` are stated in the changelog for V4-Pro only, so Flash is assumed to take the same.

Parameters:
- 思考: `thinking.type` `enabled` / `disabled`, default `enabled` (as the API).
- 思考强度: `reasoning_effort` `low` / `high` / `max`, default `high` (as the API), only while 思考 = `enabled`. The API also accepts legacy values (minimal → low, medium / xhigh → high) and `none`; they aren't offered.
- 最大输出: `max_tokens`, 1024–393,216 in steps of 1024, on by default at 393,216. The API's own defaults (with the switch off): 8K without thinking, 64K with thinking, 128K at `max` effort. When input + `max_tokens` exceeds the context, the API limits the generation instead of failing.
- `top_p` only takes effect in thinking mode and only between 0.95 and 1, so it isn't offered.
- Silent: `stream_options.include_usage`.
- Echo off: the docs say that without tools `reasoning_content` "does not need to be passed back; even if passed to the API, it will be ignored".

## OpenAI (`https://api.openai.com/v1`)

Presets on both Chat Completions and Responses: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`.

Sources: the model pages (e.g. https://developers.openai.com/api/docs/models/gpt-6-astra), https://developers.openai.com/api/docs/guides/latest-model (and its `?model=gpt-5.6` page), https://developers.openai.com/api/docs/guides/reasoning, the Chat and Responses API references, https://developers.openai.com/cookbook/examples/how_to_stream_completions

About the sources:
- Every model: 1,050,000-token context, 922K maximum input, 128,000 maximum output, on both protocols. Since 922K + 128K = 1.05M, a full `max_output_tokens` never pushes a request past the context.
- `gpt-5.6` is an alias of `gpt-5.6-sol` (no own preset; the Sol note mentions it). From 5.6 on there are no separate "pro" or "codex" ids: pro is `reasoning.mode: "pro"` on the same model.
- gpt-6-astra's model page states no default effort; the GPT-6 guide says `medium`.

Parameters:
- 思考强度: `reasoning_effort` (Chat) / `reasoning.effort` (Responses), default `medium`. The 5.6 models, gpt-6-sol and gpt-6-luna accept `none` / `low` / `medium` / `high` / `xhigh` / `max`; gpt-6-astra and gpt-6.1-sol don't accept `none` ("use low instead"), so thinking can't be turned off there.
- 详细程度: `verbosity` (Chat) / `text.verbosity` (Responses), `low` / `medium` / `high`, default `medium`.
- 最大输出: `max_completion_tokens` (Chat; `max_tokens` is deprecated there) / `max_output_tokens` (Responses), 1000–128,000, on by default at 128,000.
- Chat: silent `stream_options.include_usage`. Echo off: Chat Completions returns no reasoning. The notes point to Responses for summaries and pro mode.
- Responses:
  - 思考摘要: sends `reasoning.summary: "auto"`, on by default. Without it no summary is returned ("will not be included unless you explicitly opt in"). `concise` / `detailed` are "model-dependent", so only `auto` is used.
  - Pro 模式: sends `reasoning.mode: "pro"`, off by default.
  - Both need effort ≠ `none` on the models that have `none` (for Pro this is our own precaution, not a documented rule).
  - Silent: `store: false` (stateless) and `include: ["reasoning.encrypted_content"]`. The docs say stateless mode now includes `encrypted_content` by default and call the include value legacy but still accepted; kept for safety.
  - Echo on (automatic: the reasoning items): the docs recommend keeping every output item, encrypted reasoning included, when replaying history by hand.

## Anthropic (Messages, `https://api.anthropic.com`)

Presets: `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`.

Sources: https://platform.claude.com/docs/en/about-claude/models/overview, https://platform.claude.com/docs/en/build-with-claude/thinking, https://platform.claude.com/docs/en/build-with-claude/effort, https://platform.claude.com/docs/en/build-with-claude/preserved-thinking, https://platform.claude.com/docs/en/build-with-claude/context-windows, https://platform.claude.com/docs/en/about-claude/model-deprecations

About the sources:
- Every model here: 1M context (no beta header), up to 128K output, all active. On these models, if input + `max_tokens` exceeds the context, the request is still accepted and stops with `model_context_window_exceeded` if it gets there.
- What each model does with each `thinking` value (the thinking page's per-model table):

  | Model | No `thinking` / `adaptive` | `disabled` | `between_tools` | Effort levels | Default effort |
  |---|---|---|---|---|---|
  | Fable 5.1, Opus 5.5, Fable 5 | adaptive (always on) | 400 | 400 | all five | Opus 5.5 `medium`, others `high` |
  | Sonnet 5.5 | adaptive | 400 | up-front thinking off, at `high` effort or below | all five | `high` |
  | Opus 5 | adaptive | thinking off, at `high` effort or below | 400 | all five | `high` |
  | Sonnet 5 | adaptive | thinking off | 400 | all five | `high` |
  | Opus 4.8, Opus 4.7 | off / adaptive | thinking off | 400 | all five | `high` |
  | Opus 4.6, Sonnet 4.6 | off / adaptive | thinking off | 400 | no `xhigh` | `high` |

- Effort "affects **all tokens** in the response" (text, tool calls, and thinking when active) and "works whether or not thinking is enabled". On Opus 5 the docs add that effort controls thinking volume, not visible response length.
- `display` works with any thinking mode, is invalid with `disabled`, and defaults to `omitted` (no thinking text) on 4.7 and later, `summarized` on 4.6 and earlier.
- Preserved thinking (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 check it): a thinking block stays valid only while the `system` prompt, `tools` and every message before it are unchanged. Changing request parameters outside those (effort, `max_tokens`, `thinking.display`, …) doesn't count, nor does appending messages. A failing block gives a 400 by default for accounts created on or after 2026-08-31 (older accounts only when `block_binding` is sent); with `block_binding.prefix_mismatch_behavior: "drop_block"` (beta header `thinking-binding-controls-2026-08-01`) the API drops it and every later block from that request, unbilled, answers without that reasoning, and lists them in the response's `input_transformations`. Blocks from a model the target can't read are dropped silently on every account. Sonnet 5.5 (and Haiku 5.5) blocks only work in the account that produced them.
- Previous thinking blocks are kept as input by default on Opus 4.5+ and Sonnet 4.6+ (so echoing them matters on every model here).

Parameters:
- 思考强度: `output_config.effort`, the model's levels, default = the API's default. Not tied to the thinking switch, since effort applies with thinking off too.
- 思考显示: `thinking.display` `summarized` / `omitted`, default `summarized` (the app shows reasoning; on 4.7+ the API would hide it). On 4.6 `summarized` is already the API default, so sending it changes nothing. Only while thinking is on (it's invalid with `disabled`).
- Thinking switch, per model:
  - Fable 5.1, Opus 5.5, Fable 5: none (can't be turned off); `thinking.type: "adaptive"` is sent with 思考显示.
  - Sonnet 5.5: 关闭思考 (off by default) sends `between_tools`, only at effort `low` / `medium` / `high`; `between_tools` takes no other field, so 思考显示 (which carries `block_binding`) requires 关闭思考 off.
  - Opus 5: 关闭思考 sends `disabled`, only at effort ≤ `high`. Sonnet 5: 关闭思考 at any effort.
  - Opus 4.8 / 4.7 / 4.6, Sonnet 4.6: 思考 (on by default — our choice; the API default is off) sends `adaptive`. No budget mode: `budget_tokens` is deprecated or rejected.
- 最大输出: `max_tokens`, 1000–128,000, default 128,000, no switch (Anthropic's official API requires `max_tokens`). The docs advise a large `max_tokens` at high effort.
- Fable 5.1, Opus 5.5, Sonnet 5.5: `block_binding.prefix_mismatch_behavior: "drop_block"` + the beta header. The app sends history append-only (an edit makes a new version; context = the path as it was), so a mismatch shouldn't happen; this is a safety net for cases we haven't foreseen, so a reply still comes back instead of a 400 on newer accounts.
- Echo on (automatic: thinking + redacted_thinking blocks): the docs recommend passing everything back across turns.

## Open points

1. CORS: Anthropic's browser access is the header the app sends. For DeepSeek and OpenAI no official page says whether browser calls are allowed (OpenAI deliberately left untested, see CLAUDE.md).
2. Pro mode: the docs don't say whether it works with streaming or which effort levels it allows; pro requests can take minutes and the app doesn't use background mode.
3. Responses echo with `store: false` keeps the original `id` on echoed message items; the docs don't say whether stateless requests accept item ids (encrypted reasoning items are the documented stateless path). Fallback if rejected: drop the id.
4. DeepSeek Flash's effort levels are assumed from V4-Pro's (see DeepSeek above).

## Reasons shared by all presets

- Only what the vendor documents for that model, with the API's defaults, except where noted above (thinking on for Claude 4.x, reasoning text requested where the API hides it by default).
- **Reasoning visible:** where the API returns no reasoning text unless asked (Anthropic 4.7+ `display`, Responses `reasoning.summary`), the preset asks for summaries by default, since the app's reasoning display is a main feature.
- **最大输出 on, at the model's maximum** (owner, 2026-10-08): it's only a cap — billing counts the tokens actually produced — and a low cap cuts off long thinking or replies. DeepSeek and GPT keep the switch (off = the API's own default). Claude has no switch because Anthropic's official API requires `max_tokens`; the protocol itself doesn't (other vendors serving the Anthropic protocol may not), and the app checks no required fields, so this lives in the preset.
- **Impossible combinations can't be sent:** dependencies (`requires`) grey out a parameter whose condition fails — e.g. 思考强度 only while DeepSeek thinking is on, Pro only with effort ≠ `none`, Claude's 关闭思考 only at efforts where the API allows it, 思考显示 only while thinking is on.
- **Silent items** are fields the user needn't control, always sent: `stream_options.include_usage` (Chat Completions: token usage at the end of the stream, visible in the request details) and `store: false` + `include` (Responses: stateless, with encrypted reasoning for echo). The app itself adds no optional fields; a preset may, since applying it is the user's choice.
- **Echo** is on where the vendor returns reasoning and recommends replaying it (Responses, Anthropic), off where it's ignored (DeepSeek without tools) or not returned (Chat Completions on OpenAI).
- **No temperature control** (owner): fading out on reasoning models, and its rules are too vendor-specific.
- **Headers** only where a documented feature needs a beta header.
- Parameter names are Chinese and shown in the composer as they are.
