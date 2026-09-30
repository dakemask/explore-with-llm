import { test, expect, type Page } from "@playwright/test";
import { parameterExample } from "../src/parameterPresets";
const sse = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
test("optional parameter particles disappear before following controls move up", async ({
  page,
}) => {
  await createProvider(page);
  await addModel(
    page,
    "particles",
    `@param length
name = "可选长度"
type = number
toggle = true
enabled = true
min = 1
max = 100
step = 1
default = 50
request = {"max_tokens":"VALUE"}
---
@param next
name = "下一项"
type = fixed
request = {"temperature":0.5}`,
  );
  await page.getByRole("button", { name: "保存设置" }).click();
  await choose(page, "particles");
  await page
    .locator(".main-panel")
    .getByRole("button", { name: "模型与参数" })
    .click();
  const input = page.getByRole("spinbutton", { name: "可选长度", exact: true });
  const toggle = page.getByRole("switch", { name: "启用可选长度" });
  const details = page
    .locator(".parameter-control")
    .filter({ has: toggle })
    .locator(".parameter-details");
  const next = page.getByText("下一项", { exact: true });
  const before = (await next.boundingBox())!.y;
  await expect(input).toBeVisible();
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains("parameter-details")) {
        const cancel = animation.cancel.bind(animation);
        animation.cancel = () => {
          const before = this.getBoundingClientRect().height;
          cancel();
          const after = this.getBoundingClientRect().height;
          document.documentElement.dataset.parameterHeightChecks =
            JSON.stringify({ before, after });
        };
      }
      return animation;
    };
  });
  await toggle.click();
  await expect(page.locator("canvas[data-parameter-particles]")).toHaveCount(1);
  await expect(details).toHaveAttribute("inert", "");
  await expect(details).toHaveCount(0);
  await expect(page.locator("canvas[data-parameter-particles]")).toHaveCount(0);
  expect((await next.boundingBox())!.y).toBeLessThan(before);
  const height = await page.evaluate(() =>
    JSON.parse(document.documentElement.dataset.parameterHeightChecks!),
  );
  expect(height.before).toBe(0);
  expect(height.after).toBe(0);
  await toggle.click();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("50");
  await toggle.click();
  await toggle.click();
  await expect(input).toBeVisible();
  await expect(page.locator("canvas[data-parameter-particles]")).toHaveCount(0);
  await expect(details).toHaveCSS("opacity", "1");
});
async function openProvider(page: Page) {
  await page.getByRole("button", { name: "模型提供商", exact: true }).click();
}
async function createProvider(
  page: Page,
  protocol = "OpenAI Chat Completions",
) {
  await page.goto("/");
  await openProvider(page);
  await page.getByRole("button", { name: "添加提供商" }).click();
  await page
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("测试提供商");
  await page.getByRole("button", { name: "协议", exact: true }).click();
  await page.getByRole("option", { name: protocol, exact: true }).click();
  await page.getByLabel("Base URL").fill("https://config.test/v1");
  await page.getByLabel("API Key").fill("test-key");
}
async function addModel(page: Page, id: string, text = "") {
  await page.getByRole("button", { name: "手动添加模型" }).click();
  await page.getByLabel("模型 ID").fill(id);
  await page
    .getByRole("textbox", { name: "自定义参数", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "保存", exact: true }).click();
}
async function choose(page: Page, id: string) {
  const trigger = page
    .locator(".main-panel")
    .getByRole("button", { name: "模型与参数" });
  await trigger.click();
  await page
    .locator(".main-panel .model-list")
    .getByRole("button", { name: new RegExp(id) })
    .click();
  await trigger.click();
}
async function ask(page: Page, text = "问题") {
  await page.getByRole("textbox", { name: "消息输入", exact: true }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
}
test("empty configuration, provider model editor, unique IDs and preset drafts", async ({
  page,
}) => {
  await createProvider(page, "OpenAI Responses");
  await page.getByRole("button", { name: "手动添加模型" }).click();
  await page.getByLabel("模型 ID").fill("gpt-5.6");
  await expect(
    page.getByRole("checkbox", { name: "可用Claude加密思维链" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "自定义参数说明" }).click();
  await expect(
    page.getByRole("dialog", { name: "自定义参数说明", exact: true }),
  ).toContainText("如果不知道如何填写");
  await page
    .getByRole("dialog", { name: "自定义参数说明", exact: true })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "使用预设参数覆盖" }).click();
  await expect(
    page.getByRole("option", { name: "Claude Opus 4.6", exact: true }),
  ).toBeDisabled();
  await page.getByRole("option", { name: "GPT-5.6 Sol", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "自定义参数", exact: true }),
  ).toHaveValue(/max = 128000/);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "手动添加模型" }).click();
  await page.getByLabel("模型 ID").fill("gpt-5.6");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "手动添加模型" }),
  ).toContainText("唯一的模型 ID");
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await choose(page, "gpt-5.6");
  await page.reload();
  await expect(page.getByRole("button", { name: "模型与参数" })).toContainText(
    "gpt-5.6",
  );
});
test("fetch threshold, searchable incremental addition, no template initialization", async ({
  page,
}) => {
  let count = 12;
  await page.route("https://config.test/v1/models", (r) =>
    r.fulfill({
      json: {
        data: Array.from({ length: count }, (_, i) => ({ id: "model-" + i })),
      },
    }),
  );
  await createProvider(page);
  await page.getByRole("button", { name: "设置供应商模板" }).click();
  await page
    .getByRole("textbox", { name: "自定义参数", exact: true })
    .fill('{"temperature":0.5}');
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "获取模型" }).click();
  await expect(page.locator(".provider-model-row")).toHaveCount(12);
  await page
    .getByRole("button", { name: "编辑模型 model-0", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "自定义参数", exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  count = 14;
  await page.getByRole("button", { name: "获取模型" }).click();
  const dialog = page.getByRole("dialog", { name: "添加可用模型" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "model-0 · 已添加", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("搜索模型").fill("model-13");
  await dialog.getByRole("button", { name: "添加全部搜索结果" }).click();
  await expect(
    dialog.getByRole("button", { name: "model-13 · 已添加", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "完成" }).click();
  await expect(page.locator(".provider-model-row")).toHaveCount(13);
});
test("template merges atomically and conflicts identify affected models", async ({
  page,
}) => {
  await createProvider(page);
  await addModel(page, "one", '{"temperature":0.2}');
  await addModel(page, "two", "");
  await page.getByRole("button", { name: "设置供应商模板" }).click();
  await page
    .getByRole("textbox", { name: "自定义参数", exact: true })
    .fill(
      '@param temp\nname = "温度"\ntype = fixed\nrequest = {"temperature":0.7}',
    );
  await page.getByRole("button", { name: "保存并应用到所有模型" }).click();
  await expect(page.getByRole("dialog", { name: "供应商模板" })).toContainText(
    "one",
  );
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await page.getByRole("button", { name: "编辑模型 two", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "自定义参数", exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await page.getByRole("button", { name: "设置供应商模板" }).click();
  await page
    .getByRole("textbox", { name: "自定义参数", exact: true })
    .fill(
      '@param limit\nname = "长度"\ntype = number\nmin = 1\nmax = 100\nstep = 1\ndefault = 100\nrequest = {"max_tokens":"VALUE"}',
    );
  await page.getByRole("button", { name: "保存并应用到所有模型" }).click();
  await page.getByRole("button", { name: "编辑模型 one", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "自定义参数", exact: true }),
  ).toHaveValue(/temperature/);
  await expect(
    page.getByRole("textbox", { name: "自定义参数", exact: true }),
  ).toHaveValue(/@param limit/);
});
test("named controls, dependency forgetting, invalid number guard, per-conversation state and immutable snapshot", async ({
  page,
}) => {
  const requests: any[] = [];
  await page.route("https://config.test/**", (r) => {
    requests.push(r.request().postDataJSON());
    return r.fulfill({ contentType: "text/event-stream", body: sse("回答") });
  });
  await createProvider(page);
  await addModel(page, "custom", parameterExample);
  await page.getByRole("button", { name: "保存设置" }).click();
  await choose(page, "custom");
  const trigger = page
    .locator(".main-panel")
    .getByRole("button", { name: "模型与参数" });
  await trigger.click();
  await page.getByRole("switch", { name: "启用思考模式" }).click();
  await expect(
    page.getByRole("button", { name: "高", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "开启思考", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "高", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "低", exact: true }).click();
  await page.getByRole("button", { name: "关闭思考", exact: true }).click();
  await page.getByRole("button", { name: "开启思考", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "高", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("switch", { name: "启用单次输出最大长度" }),
  ).toHaveCount(0);
  await page
    .getByRole("spinbutton", { name: "单次输出最大长度", exact: true })
    .fill("10001");
  await ask(page);
  await expect(page.locator(".main-panel").getByRole("alert")).toContainText(
    "步长",
  );
  expect(requests).toHaveLength(0);
  await trigger.click();
  await page
    .getByRole("spinbutton", { name: "单次输出最大长度", exact: true })
    .fill("8000");
  await ask(page, "有效请求");
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].max_tokens).toBe(8000);
  expect(requests[0].output_config).toEqual({ effort: "high" });
  await page
    .locator(".main-panel .message.assistant")
    .getByRole("button", { name: "参数", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "本次请求参数" }),
  ).toContainText("8000");
  await page
    .getByRole("dialog", { name: "本次请求参数" })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await trigger.click();
  await page
    .getByRole("spinbutton", { name: "单次输出最大长度", exact: true })
    .fill("9000");
  await trigger.click();
  await openProvider(page);
  await page
    .getByRole("button", { name: "编辑模型 custom", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "自定义参数", exact: true })
    .fill(
      parameterExample
        .replace("max = 10000", "max = 20000")
        .replace("default = 10000", "default = 20000") +
        '\n---\n@param additional\nname = "额外参数"\ntype = fixed\ntoggle = true\nenabled = false\nrequest = {"top_p":0.5}',
    );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await trigger.click();
  await expect(
    page.getByRole("spinbutton", { name: "单次输出最大长度", exact: true }),
  ).toHaveValue("9000");
  await trigger.click();
  await page
    .locator(".main-panel .message.assistant")
    .getByRole("button", { name: "参数", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "本次请求参数" }),
  ).toContainText("8000");
  await page
    .getByRole("dialog", { name: "本次请求参数" })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.reload();
  await trigger.click();
  await expect(
    page.getByRole("spinbutton", { name: "单次输出最大长度", exact: true }),
  ).toHaveValue("9000");
  await trigger.click();
  await page
    .locator(".main-panel .message.assistant > .markdown")
    .evaluate((root) => {
      const range = document.createRange();
      const text = root.querySelector("[data-source-map]")!.firstChild!;
      range.setStart(text, 0);
      range.setEnd(text, text.textContent!.length);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  await page.getByRole("button", { name: "创建侧边对话" }).click();
  const sidebar = page.locator(".question-sidebar");
  await sidebar.getByRole("button", { name: "模型与参数" }).click();
  await sidebar
    .getByRole("spinbutton", { name: "单次输出最大长度", exact: true })
    .fill("7000");
  const menuBox = (await sidebar.locator(".model-menu").boundingBox())!,
    sideBox = (await sidebar.boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(sideBox.x);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(
    sideBox.x + sideBox.width,
  );
  await page.screenshot({ path: "test-results/side-model-parameters.png" });
  await trigger.click();
  await expect(
    page
      .locator(".main-panel")
      .getByRole("spinbutton", { name: "单次输出最大长度", exact: true }),
  ).toHaveValue("7000");
  await trigger.click();
  await page.getByRole("button", { name: "创建新对话", exact: true }).click();
  await trigger.click();
  await expect(
    page.getByRole("switch", { name: "启用单次输出最大长度" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("spinbutton", { name: "单次输出最大长度", exact: true }),
  ).toHaveValue("20000");
  await page.screenshot({ path: "test-results/model-parameters.png" });
});
test("model deletion clears selection, undo and supplier protocol clears capabilities", async ({
  page,
}) => {
  await createProvider(page, "OpenAI Responses");
  await addModel(page, "gpt");
  await page.getByRole("button", { name: "编辑模型 gpt", exact: true }).click();
  await page.getByRole("checkbox", { name: "可用ChatGPT加密思维链" }).check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await choose(page, "gpt");
  await openProvider(page);
  await page.getByRole("button", { name: "协议", exact: true }).click();
  await page
    .getByRole("option", { name: "Anthropic Messages", exact: true })
    .click();
  await page.getByRole("button", { name: "编辑模型 gpt", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "可用Claude加密思维链" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await page.getByRole("button", { name: "删除模型 gpt", exact: true }).click();
  await expect(page.locator(".provider-model-row")).toHaveCount(0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.locator(".provider-model-row")).toHaveCount(1);
  await page.getByRole("button", { name: "删除模型 gpt", exact: true }).click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByRole("button", { name: "模型与参数" })).toContainText(
    "选择模型",
  );
});
test("independent naming model parameters and silent invalidation", async ({
  page,
}) => {
  const requests: any[] = [];
  await page.route("https://config.test/**", (r) => {
    const body = r.request().postDataJSON();
    requests.push(body);
    return r.fulfill({
      contentType: "text/event-stream",
      body: sse(body.model === "namer" ? "自动标题" : "聊天回答"),
    });
  });
  await createProvider(page);
  await addModel(page, "chat");
  await addModel(
    page,
    "namer",
    '@param length\nname = "长度"\ntype = number\nmin = 1\nmax = 100\nstep = 1\ndefault = 10\nrequest = {"max_tokens":"VALUE"}',
  );
  await page.getByRole("button", { name: "保存设置" }).click();
  await choose(page, "chat");
  await page.getByRole("button", { name: "命名模型设置", exact: true }).click();
  await page.getByRole("button", { name: "命名模型", exact: true }).click();
  await page
    .getByRole("option", { name: "测试提供商 / namer", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "长度", exact: true }).fill("20");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await ask(page);
  await expect(page.locator(".topbar")).toContainText("自动标题");
  expect(requests[1].model).toBe("namer");
  expect(requests[1].max_tokens).toBe(20);
  await openProvider(page);
  await page
    .getByRole("button", { name: "删除模型 namer", exact: true })
    .click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await page.getByRole("button", { name: "创建新对话", exact: true }).click();
  await ask(page, "第二条");
  await expect.poll(() => requests.length).toBe(3);
  await expect(page.locator(".main-panel .inline-error")).toHaveCount(0);
});
