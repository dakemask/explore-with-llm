import { test, expect, type Page } from "@playwright/test";

const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const reasoning = (suffix = "1") => ({
  type: "reasoning",
  id: `rs_${suffix}`,
  summary: [{ type: "summary_text", text: `推理摘要 ${suffix}` }],
  encrypted_content: `secret-gpt-${suffix}`,
});
const response = (text: string, suffix = "1") =>
  event({
    type: "response.completed",
    response: {
      output: [
        reasoning(suffix),
        ...(text
          ? [{ type: "message", content: [{ type: "output_text", text }] }]
          : []),
      ],
    },
  });
const claude = (text: string) =>
  [
    {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "thinking",
        thinking: "Claude 摘要",
        signature: "secret-claude",
      },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "redacted_thinking", data: "secret-redacted" },
    },
    { type: "content_block_stop", index: 1 },
    {
      type: "content_block_start",
      index: 2,
      content_block: { type: "text", text },
    },
    { type: "content_block_stop", index: 2 },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
    { type: "message_stop" },
  ]
    .map(event)
    .join("");

async function configure(page: Page, protocol: string, supported = true) {
  await page.getByRole("button", { name: "模型提供商", exact: true }).click();
  if ((await page.getByRole("textbox", { name: "Base URL" }).count()) === 0)
    await page.getByRole("button", { name: "添加提供商" }).click();
  await page.getByRole("button", { name: "协议", exact: true }).click();
  await page
    .getByRole("option", {
      name:
        protocol === "responses"
          ? "OpenAI Responses"
          : protocol === "anthropic"
            ? "Anthropic Messages"
            : "OpenAI Chat Completions",
      exact: true,
    })
    .click();
  await page.getByLabel("Base URL").fill("https://protocol.test/v1");
  await page.getByLabel("API Key").fill("test-key");
  const editing = page.getByRole("button", { name: /^编辑模型 / });
  if (await editing.count()) await editing.first().click();
  else await page.getByRole("button", { name: "手动添加模型" }).click();
  const id = protocol === "anthropic" ? "claude-sonnet-4-6" : "gpt-5.6";
  await page.getByLabel("模型 ID").fill(id);
  if (protocol !== "chat-completions")
    await page
      .getByRole("checkbox", {
        name:
          protocol === "responses"
            ? "可用ChatGPT加密思维链"
            : "可用Claude加密思维链",
      })
      .setChecked(supported);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await page.getByRole("button", { name: "模型与参数", exact: true }).click();
  await page
    .locator(".model-list")
    .getByRole("button", { name: new RegExp(id) })
    .click();
  await page.getByRole("button", { name: "模型与参数", exact: true }).click();
}
async function ask(page: Page, text = "问题") {
  await page.getByRole("textbox", { name: "消息输入", exact: true }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0);
}
function isNaming(body: any) {
  return JSON.stringify(body.input ?? body.messages).includes(
    "Based on the chat history",
  );
}
async function routes(
  page: Page,
  handler?: (body: any, index: number) => string,
) {
  const requests: any[] = [];
  await page.route("https://protocol.test/**", async (route) => {
    const body = route.request().postDataJSON();
    const native = route.request().url().endsWith("/messages");
    if (isNaming(body))
      return route.fulfill({
        contentType: "text/event-stream",
        body: native ? claude("测试对话") : response("测试对话", "name"),
      });
    requests.push(body);
    return route.fulfill({
      contentType: "text/event-stream",
      body: handler
        ? handler(body, requests.length)
        : native
          ? claude("Claude 正文")
          : response("可引用的回答正文", String(requests.length)),
    });
  });
  return requests;
}
const gptPill = (page: Page) =>
  page
    .locator(".main-panel")
    .getByRole("button", { name: "使用ChatGPT加密思维链", exact: true });

test("Responses encrypted history: toggle, summary, reload, branch edit and deletion", async ({
  page,
}) => {
  const requests = await routes(page);
  await page.goto("/");
  await configure(page, "responses");
  await expect(gptPill(page)).toHaveCount(0);
  await ask(page);
  const card = page.locator(".main-panel .encrypted-reasoning");
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("button")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await card.getByRole("button").click();
  await expect(card).toContainText("推理摘要 1");
  await expect(page.locator("body")).not.toContainText("secret-gpt");
  await expect(gptPill(page)).toHaveAttribute("aria-pressed", "true");
  await ask(page, "继续");
  expect(
    requests[1].input.filter((item: any) => item.type === "reasoning"),
  ).toEqual([reasoning("1")]);
  expect(requests[1].store).toBe(false);
  expect(requests[1].previous_response_id).toBeUndefined();
  await gptPill(page).click();
  await ask(page, "关闭后的请求");
  expect(JSON.stringify(requests[2])).not.toContain("secret-gpt");
  await expect(gptPill(page)).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(gptPill(page)).toHaveAttribute("aria-pressed", "false");
  await gptPill(page).click();
  const last = page.locator(".main-panel .message.assistant").last();
  await last.getByRole("button", { name: "编辑消息", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "编辑正文可能导致正文与加密思维链冲突",
  );
  await expect(page.getByLabel("加密思维链编辑说明")).toHaveAttribute(
    "title",
    /大幅度修改正文的观点、结论、态度/,
  );
  await page.getByRole("button", { name: "新建分支", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "编辑消息内容",
    exact: true,
  });
  await editor.click();
  await editor.press("Control+A");
  await editor.pressSequentially("编辑后的回答");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(last).toContainText("编辑后的回答");
  await expect(last.locator(".encrypted-reasoning")).toHaveCount(1);
  await ask(page, "编辑后的后续请求");
  expect(
    requests[3].input.filter((item: any) => item.type === "reasoning"),
  ).toHaveLength(3);
  expect(JSON.stringify(requests[3])).toContain("secret-gpt-3");
  expect(JSON.stringify(requests[3])).toContain("编辑后的回答");
  await page.getByRole("button", { name: "对话脉络", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page
    .locator(".main-panel .message.assistant")
    .first()
    .getByRole("button", { name: "删除消息", exact: true })
    .click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(gptPill(page)).toHaveCount(0);
});

test("mixed origins show two pills and never cross protocols; capability resets", async ({
  page,
}) => {
  const requests = await routes(page);
  await page.goto("/");
  await configure(page, "responses");
  await ask(page);
  await configure(page, "anthropic");
  await expect(gptPill(page)).toBeDisabled();
  await expect(gptPill(page).locator("..")).toHaveAttribute(
    "title",
    "当前模型不支持使用ChatGPT加密思维链",
  );
  await ask(page, "换模型");
  const claudePill = page
    .locator(".main-panel")
    .getByRole("button", { name: "使用Claude加密思维链", exact: true });
  await expect(claudePill).toBeEnabled();
  await expect(claudePill).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".main-panel .encrypted-reasoning")).toHaveCount(3);
  await ask(page, "Claude 后续");
  const sent = requests[2].messages
    .flatMap((m: any) => m.content)
    .filter((part: any) =>
      ["thinking", "redacted_thinking"].includes(part.type),
    );
  expect(sent).toEqual([
    { type: "thinking", thinking: "Claude 摘要", signature: "secret-claude" },
    { type: "redacted_thinking", data: "secret-redacted" },
  ]);
  expect(JSON.stringify(requests[2])).not.toContain("secret-gpt");
  await page.getByRole("button", { name: "模型提供商", exact: true }).click();
  await page.getByRole("button", { name: "协议", exact: true }).click();
  await page
    .getByRole("option", { name: "OpenAI Responses", exact: true })
    .click();
  await page.getByRole("button", { name: /^编辑模型 / }).click();
  await expect(
    page.getByRole("checkbox", { name: "可用ChatGPT加密思维链" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(gptPill(page)).toBeDisabled();
  await expect(claudePill).toBeDisabled();
  await configure(page, "responses");
  await expect(gptPill(page)).toHaveAttribute("aria-pressed", "true");
  await ask(page, "再次切回");
  expect(JSON.stringify(requests[3])).toContain("secret-gpt-1");
  expect(JSON.stringify(requests[3])).not.toContain("secret-claude");
  await page.screenshot({
    path: "test-results/mixed-reasoning.png",
    fullPage: true,
  });
});

test("reasoning-only and partial replies survive; main regeneration preserves the old branch", async ({
  page,
}) => {
  await routes(page, (_, n) =>
    n === 1
      ? event({
          type: "response.reasoning_summary_text.delta",
          output_index: 0,
          delta: "未完成的摘要",
        })
      : n === 2
        ? response("", "only")
        : response("生成完成", "full"),
  );
  await page.goto("/");
  await configure(page, "responses");
  await ask(page);
  await expect(page.locator(".main-panel .message.assistant")).toHaveCount(1);
  await expect(page.locator(".main-panel .encrypted-reasoning")).toContainText(
    "未完整接收，不会发送",
  );
  await expect(
    page.getByRole("textbox", { name: "消息输入", exact: true }),
  ).toBeDisabled();
  await expect(gptPill(page)).toHaveCount(0);
  await page.reload();
  const assistant = page.locator(".main-panel .message.assistant");
  await expect(assistant).toHaveCount(1);
  await assistant.getByRole("button", { name: "重新生成" }).click();
  await expect(assistant).toContainText("2 / 2");
  await expect(assistant).toContainText("没有正文，请重新生成");
  await expect(
    page.getByRole("textbox", { name: "消息输入", exact: true }),
  ).toBeDisabled();
  await assistant.getByRole("button", { name: "重新生成" }).click();
  await expect(assistant).toContainText("3 / 3");
  await expect(assistant).toContainText("生成完成");
  await expect(
    page.getByRole("textbox", { name: "消息输入", exact: true }),
  ).toBeEnabled();
  await assistant.getByRole("button", { name: "上一个分支" }).click();
  await assistant.getByRole("button", { name: "上一个分支" }).click();
  await assistant.locator(".encrypted-toggle").click();
  await expect(assistant).toContainText("未完成的摘要");
});

test("partially generated body remains usable and an incomplete signature is omitted", async ({
  page,
}) => {
  const requests = await routes(page, (_, n) =>
    n === 1
      ? [
          {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "thinking",
              thinking: "摘要",
              signature: "partial-secret",
            },
          },
          {
            type: "content_block_start",
            index: 1,
            content_block: { type: "text", text: "半截正文" },
          },
        ]
          .map(event)
          .join("")
      : claude("继续回答"),
  );
  await page.goto("/");
  await configure(page, "anthropic");
  await ask(page);
  await expect(page.locator(".main-panel .message.assistant")).toContainText(
    "半截正文",
  );
  await expect(
    page.getByRole("textbox", { name: "消息输入", exact: true }),
  ).toBeEnabled();
  await ask(page, "继续");
  expect(JSON.stringify(requests[1])).toContain("半截正文");
  expect(JSON.stringify(requests[1])).not.toContain("partial-secret");
});

test("side regeneration overwrites only its answer and encrypted blocks", async ({
  page,
}) => {
  const requests = await routes(page);
  await page.goto("/");
  await configure(page, "responses");
  await ask(page);
  await page
    .locator(".main-panel .message.assistant > .markdown")
    .evaluate((root) => {
      const text = root.querySelector("p")!.firstChild!;
      const range = document.createRange();
      range.selectNodeContents(text);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  await page.getByRole("button", { name: "创建侧边对话" }).click();
  await page.getByRole("textbox", { name: "侧边提问输入" }).fill("侧边问题");
  await page.getByRole("button", { name: "发送侧边提问" }).click();
  const answer = page.locator(
    ".question-sidebar .message.assistant:not(.inherited)",
  );
  await expect(answer.locator(".encrypted-reasoning")).toHaveCount(1);
  expect(JSON.stringify(requests[1])).toContain("secret-gpt-1");
  await answer.getByRole("button", { name: "重新生成" }).click();
  await expect.poll(() => requests.length).toBe(3);
  await expect(answer).toHaveCount(1);
  await answer.locator(".encrypted-toggle").click();
  await expect(answer).toContainText("推理摘要 3");
  await expect(answer).not.toContainText("推理摘要 2");
  await page.getByRole("textbox", { name: "侧边提问输入" }).fill("继续侧边");
  await page.getByRole("button", { name: "发送侧边提问" }).click();
  await expect.poll(() => requests.length).toBe(4);
  expect(JSON.stringify(requests[3])).toContain("secret-gpt-3");
  expect(JSON.stringify(requests[3])).not.toContain("secret-gpt-2");
  await expect(page.locator(".main-panel .message.assistant")).toHaveCount(1);
});
