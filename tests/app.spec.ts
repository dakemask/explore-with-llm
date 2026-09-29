import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page, mockNaming = true) {
  if (mockNaming)
    await page.route("https://api.deepseek.com/**", (route) => {
      const prompt = route.request().postDataJSON().messages?.[0]?.content;
      if (
        typeof prompt === "string" &&
        prompt.startsWith("Based on the chat history")
      ) {
        const title =
          prompt.match(/user: ([^\n]+)/)?.[1]?.slice(0, 30) || "对话";
        return route.fulfill({
          contentType: "text/event-stream",
          body: sse(title),
        });
      }
      return route.fallback();
    });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天我能提供什么帮助？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "模型与设置" }).click();
  await page.getByLabel("API Key").fill("test-key");
  await page.getByRole("button", { name: "保存设置" }).click();
}
function sse(content: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
}
async function ask(page: Page, text = "帮我分析这个问题") {
  await page.getByRole("textbox", { name: "消息输入", exact: true }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
}
async function selectText(page: Page, text: string, occurrence = 0) {
  await page
    .locator(".main-panel .message.assistant .markdown")
    .last()
    .evaluate(
      (root, { text, occurrence }) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        let index = 0;
        while ((n = walker.nextNode())) {
          const at = n.textContent!.indexOf(text);
          if (at >= 0) {
            if (index++ !== occurrence) continue;
            const r = document.createRange();
            r.setStart(n, at);
            r.setEnd(n, at + text.length);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(r);
            root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            return;
          }
        }
        throw new Error("selection text missing");
      },
      { text, occurrence },
    );
  await page.getByRole("button", { name: "创建侧边对话" }).click();
}
async function setScrollTop(page: Page, selector: string, top: number) {
  await page.locator(selector).evaluate(async (el, top) => {
    if (el.scrollTop === top) return;

    await new Promise<void>((resolve) => {
      el.addEventListener("scroll", () => resolve(), { once: true });
      el.scrollTop = top;
    });
  }, top);
}
test("real flow: render, side context, protected edits, branching, tree and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests: any[] = [];
  await page.route("https://api.deepseek.com/**", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "text/event-stream",
      body: sse(
        requests.length === 1
          ? "## 一个清晰的结论\n\n先建立基础，再逐步探索。\n\n**重要结论**：保持上下文独立。\n\n公式：$E=mc^2$\n\n| 方法 | 特点 |\n|---|---|\n| 主线 | 连续 |\n| 侧栏 | 独立 |\n\n```js\nconst answer = 42;\n```"
          : "这是一条新的回答。",
      ),
    });
  });
  await setup(page);
  await ask(page);
  await expect(page.locator(".katex")).toBeVisible();
  await expect(page.locator(".markdown table")).toBeVisible();
  await expect(page.locator(".hljs-keyword")).toBeVisible();
  await selectText(page, "保持上下文独立");
  await expect(page.getByRole("textbox", { name: "侧边提问输入" })).toHaveValue(
    "> 保持上下文独立\n\n",
  );
  await expect(page.locator(".question-highlight")).toHaveText(
    "保持上下文独立",
  );
  await page
    .locator(".main-panel .message.assistant")
    .getByRole("button", { name: "编辑消息", exact: true })
    .click();
  await expect(page.locator(".protected-text")).toContainText("保持上下文独立");
  const before = page.getByRole("textbox", {
    name: "编辑消息内容",
    exact: true,
  });
  await before.click();
  await before.press("Control+Home");
  await before.press("Control+Shift+ArrowRight");
  await before.press("ArrowLeft");
  await before.pressSequentially("已更新的结论 ");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("textbox", { name: "侧边提问输入" }).fill("为什么？");
  await page.getByRole("button", { name: "发送侧边提问" }).click();
  await expect(
    page.locator(".question-sidebar .message.assistant:not(.inherited)"),
  ).toContainText("这是一条新的回答");
  expect(requests[1].messages.at(-2).content).toContain("已更新的结论");
  expect(requests[1].messages.at(-1).content).toBe("为什么？");
  await page
    .locator(".question-sidebar .message.assistant:not(.inherited)")
    .getByRole("button", { name: "重新生成" })
    .click();
  await expect.poll(() => requests.length).toBe(3);
  await expect(
    page.locator(".question-sidebar .message.assistant:not(.inherited)"),
  ).toHaveCount(1);
  await page
    .locator(".main-panel .message.assistant")
    .getByRole("button", { name: "重新生成" })
    .click();
  await expect(page.locator(".main-panel .branch-switch")).toContainText(
    "2 / 2",
  );
  await expect(page.locator(".question-sidebar")).toBeVisible();
  await expect(page.locator(".side-empty")).toBeVisible();
  await page.getByRole("button", { name: "上一个分支" }).click();
  await expect(
    page.getByRole("tab", { name: "帮我分析这个问题" }),
  ).toBeVisible();
  await expect(page.locator(".question-highlight")).toHaveText(
    "保持上下文独立",
  );
  await page.getByRole("button", { name: "对话脉络", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.screenshot({ path: "test-results/docs/workspace.png", fullPage: true });
  await page.reload();
  await expect(page.locator(".main-panel .branch-switch")).toContainText(
    "1 / 2",
  );
  await page.getByRole("button", { name: "切换侧边提问栏" }).click();
  await expect(
    page.getByRole("tab", { name: "帮我分析这个问题" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("recursive deletion confirms and removes side descendants", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse("可以选中的一段文字。"),
    }),
  );
  await setup(page);
  await ask(page);
  await selectText(page, "选中的一段");
  await page
    .locator(".main-panel .message.assistant")
    .getByRole("button", { name: "删除消息", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("递归删除其下 1 个节点");
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.locator(".main-panel .message.assistant")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "生成回答", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".side-empty")).toBeVisible();
});
test("native image and context failure restore editable draft", async ({
  page,
}) => {
  // Finish reading the image only after typing, so stale draft writes are deterministic.
  await page.addInitScript(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      window.addEventListener("test:read-image", () => read.call(this, blob), {
        once: true,
      });
    };
  });
  let body: any;
  await page.route("https://api.deepseek.com/**", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "maximum context length exceeded" },
      }),
    });
  });
  await setup(page);
  await page.locator(".main-panel input[type=file]").setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM38AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByRole("textbox", { name: "消息输入", exact: true })
    .fill("解释图片");
  await page.evaluate(() => window.dispatchEvent(new Event("test:read-image")));
  await expect(page.locator(".main-panel .composer .attachment")).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("maximum context");
  expect(body.messages.at(-1).content[1].type).toBe("image_url");
  await expect(
    page.getByRole("textbox", { name: "消息输入", exact: true }),
  ).toHaveValue("解释图片");
  await expect(page.locator(".main-panel .composer .attachment")).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".main-panel .message.assistant")).toHaveCount(0);
});

test("overlapping questions and code selections protect positions, tree can navigate and delete", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse(
        "第一段相同文字。\n\n第二段相同文字。\n\n```js\nconst answer = 42;\n```\n\n公式：\\(a^2+b^2=c^2\\)",
      ),
    }),
  );
  await setup(page);
  await ask(page);
  await expect(page.locator(".katex")).toBeVisible();
  await selectText(page, "相同文字", 1);
  await selectText(page, "相同文字", 1);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".question-highlight")).toHaveCount(1);
  await page.locator(".question-highlight").click();
  await expect(page.locator(".highlight-menu button")).toHaveCount(3);
  await page
    .locator(".highlight-menu")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page
    .locator(".main-panel .message.assistant")
    .getByRole("button", { name: "编辑消息", exact: true })
    .click();
  await expect(page.locator(".protected-text")).toHaveText("相同文字");
  await expect(
    page.getByRole("textbox", { name: "编辑消息内容", exact: true }),
  ).toContainText("第一段相同文字。");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await selectText(page, "answer");
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.locator("pre .question-highlight")).toHaveText("answer");
  await page.getByRole("button", { name: "对话脉络", exact: true }).click();
  await expect(page.locator(".question-node")).toHaveCount(3);
  await page.screenshot({ path: "test-results/docs/tree.png", fullPage: true });
  await page.locator(".question-node").last().dblclick();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "提问 3" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "对话脉络", exact: true }).click();
  await page.locator(".question-node").last().click({ button: "right" });
  await page.getByRole("button", { name: "删除节点", exact: true }).click();
  await expect(page.getByRole("dialog").last()).not.toContainText("递归");
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.locator(".question-node")).toHaveCount(2);
});

test("streaming can be stopped, latest side retry cannot create a branch", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const realFetch = window.fetch;
    let count = 0;
    window.fetch = async (input, init) => {
      if (!String(input).includes("api.deepseek.com"))
        return realFetch(input, init);
      count++;
      const encoder = new TextEncoder();
      let timer: ReturnType<typeof setTimeout>;
      return new Response(
        new ReadableStream({
          start(controller) {
            const emit = (content: string) =>
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
                ),
              );
            if (count === 1) {
              emit("这是可以追问的原始回答。");
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
            emit("已经输出的部分。");
            timer = setTimeout(() => {
              emit("生成完毕。");
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }, 10000);
            init?.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              controller.error(new DOMException("Aborted", "AbortError"));
            });
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };
  });
  await setup(page);
  await ask(page);
  await selectText(page, "追问");
  await page.getByRole("textbox", { name: "侧边提问输入" }).fill("展开说说");
  await page.getByRole("button", { name: "发送侧边提问" }).click();
  await expect(
    page.locator(".question-sidebar .message.assistant:not(.inherited)"),
  ).toContainText("已经输出");
  await ask(page, "主线同时继续");
  await expect(
    page.locator(".main-panel .message.assistant").last(),
  ).toContainText("已经输出");
  await expect(
    page.locator(".main-panel").getByRole("button", { name: "停止生成" }),
  ).toBeVisible();
  await page.locator(".main-panel .message.assistant").first().click();
  await expect(
    page.locator(".question-sidebar").getByRole("button", { name: "停止生成" }),
  ).toBeVisible();
  await page
    .locator(".question-sidebar")
    .getByRole("button", { name: "停止生成" })
    .click();
  await expect(page.locator(".question-sidebar .status").last()).toHaveText(
    "已停止",
  );
  await expect(
    page.locator(".main-panel").getByRole("button", { name: "停止生成" }),
  ).toBeVisible();
  await page
    .locator(".main-panel")
    .getByRole("button", { name: "停止生成" })
    .click();
  await expect(
    page.locator(".main-panel .message.assistant").last(),
  ).toContainText("已停止");
  await page
    .locator(".question-sidebar .message.assistant:not(.inherited)")
    .getByRole("button", { name: "编辑消息", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "新建分支", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "取消", exact: true }).click();
});

test("mouse selection, user branches, system overwrite and conversation management", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse("这里是一段可供鼠标选中的回答。"),
    }),
  );
  await setup(page);
  await page.screenshot({ path: "test-results/docs/empty.png", fullPage: true });
  await ask(page, "最初的问题");
  await expect(page.locator(".main-panel .message.assistant")).toContainText(
    "鼠标",
  );
  const text = page
    .locator(".main-panel .message.assistant .markdown [data-source-map]")
    .first();
  const rect = await text.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + 1, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect!.x + Math.min(140, rect!.width - 2),
    rect!.y + rect!.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "创建侧边对话" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "创建侧边对话" }).click();
  await expect(page.getByRole("tab", { name: "提问 1" })).toBeVisible();
  await page
    .locator(".main-panel .message.user")
    .getByRole("button", { name: "编辑消息", exact: true })
    .click();
  await page.getByRole("button", { name: "新建分支", exact: true }).click();
  await page
    .getByRole("textbox", { name: "编辑消息内容", exact: true })
    .fill("另一条问题");
  await page.getByRole("button", { name: "保存并生成" }).click();
  await expect(page.locator(".main-panel .message.user")).toContainText(
    "另一条问题",
  );
  await expect(page.locator(".main-panel .message.assistant")).toHaveCount(1);
  await expect(page.locator(".main-panel .branch-switch")).toContainText(
    "2 / 2",
  );
  await expect(page.locator(".side-empty")).toBeVisible();
  await page.getByRole("button", { name: "上一个分支" }).click();
  await expect(page.locator(".main-panel .message.user")).toContainText(
    "最初的问题",
  );
  await page.locator(".main-panel .message.assistant").click();
  await expect(page.getByRole("tab", { name: "提问 1" })).toBeVisible();
  await page
    .locator(".main-panel .message.system")
    .getByRole("button", { name: "编辑消息", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "新建分支", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "编辑消息内容", exact: true })
    .fill("请用中文回答。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.locator(".conversation-item").hover();
  await page.getByTitle("重命名", { exact: true }).click();
  await page.getByRole("textbox", { name: "对话名称" }).fill("研究笔记");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.locator(".conversation-item").hover();
  await page.getByTitle("置顶", { exact: true }).click();
  await expect(page.getByTitle("取消置顶", { exact: true })).toBeAttached();
  await page.getByRole("textbox", { name: "搜索对话" }).fill("研究笔记");
  await expect(page.locator(".conversation-item")).toHaveCount(1);
  await page.getByRole("textbox", { name: "搜索对话" }).fill("不存在的词");
  await expect(page.locator(".conversation-item")).toHaveCount(0);
});

test("draft creation, official effort, metadata, quote lines and task markers", async ({
  page,
}) => {
  let request: any;
  await page.route("https://api.deepseek.com/**", (route) => {
    request = route.request().postDataJSON();
    return route.fulfill({
      contentType: "text/event-stream",
      body: sse("> 第一行\n> 第二行\n\n- [ ] 待完成\n- [x] 已完成"),
    });
  });
  await setup(page);
  await expect(page.locator(".conversation-item")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "消息输入", exact: true })
    .fill("还没有发送");
  await page.getByRole("button", { name: "创建新对话", exact: true }).click();
  await expect(page.locator(".conversation-item")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "消息输入", exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "模型与思考档位" }).click();
  await page.getByRole("button", { name: "max", exact: true }).click();
  await ask(page, "渲染检查");
  await expect(page.locator(".conversation-item")).toHaveCount(1);
  await expect(
    page.locator(".main-panel .message.assistant .message-meta"),
  ).toContainText("deepseek-flash · max");
  expect(request.reasoning_effort).toBe("max");
  await expect(page.locator(".topbar")).toContainText("渲染检查");
  await expect(page.locator(".message.system")).toContainText(
    "You are a helpful assistant.",
  );
  const quote = page.locator("blockquote");
  const metrics = await quote.evaluate((el) => {
    const p = el.querySelector("p")!;
    return {
      whiteSpace: getComputedStyle(p).whiteSpace,
      margin: getComputedStyle(p).marginBottom,
      text: (el as HTMLElement).innerText,
      excess:
        el.getBoundingClientRect().height - p.getBoundingClientRect().height,
    };
  });
  expect(metrics.text).toContain("第一行\n第二行");
  expect(metrics.whiteSpace).toBe("pre-line");
  expect(metrics.margin).toBe("0px");
  expect(metrics.excess).toBeLessThan(8);
  expect(
    await page
      .locator(".task-list-item")
      .first()
      .evaluate((el) => getComputedStyle(el).listStyleType),
  ).toBe("none");
  await page.locator(".conversation-item").hover();
  await page.getByTitle("删除对话", { exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText("递归");
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.locator(".conversation-item")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "今天我能提供什么帮助？" }),
  ).toBeVisible();
});

test("long main, sidebar and conversation list stay scrollable with visible composers", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse(
        Array.from(
          { length: 80 },
          (_, i) => `第 ${i} 段。长对话滚动验证。`,
        ).join("\n\n"),
      ),
    }),
  );
  await setup(page);
  await ask(page, "长对话");
  await expect(page.locator(".main-panel .message.assistant")).toContainText(
    "第 79 段",
  );
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("threadline");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const t = database.transaction("conversations", "readwrite"),
      store = t.objectStore("conversations");
    const r = store.getAll();
    r.onsuccess = () => {
      const original = r.result[0];
      for (let i = 0; i < 60; i++)
        store.put({
          ...original,
          id: `fixture-${i}`,
          title: `历史对话 ${i}`,
          updated: original.updated - 1000 - i,
        });
    };
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    database.close();
  });
  await page.reload();
  await expect(page.locator(".conversation-item")).toHaveCount(61);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    for (const selector of [".main-scroll", ".conversation-list"]) {
      const metrics = await page.locator(selector).evaluate((el) => {
        el.scrollTop = 1000;
        return {
          top: el.scrollTop,
          client: el.clientHeight,
          scroll: el.scrollHeight,
        };
      });
      expect(metrics.scroll).toBeGreaterThan(metrics.client);
      expect(metrics.top).toBeGreaterThan(0);
    }
    const box = await page
      .getByRole("textbox", { name: "消息输入", exact: true })
      .boundingBox();
    expect(box!.y + box!.height).toBeLessThan(size.height);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await setScrollTop(page, ".main-scroll", 0);
  await selectText(page, "第 0 段");
  const side = page.locator(".side-scroll");
  expect(await side.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await side.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await side.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(
    page.getByRole("textbox", { name: "侧边提问输入" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("textbox", { name: "消息输入", exact: true }),
  ).toBeInViewport();
  await page
    .locator(".main-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.screenshot({ path: "test-results/docs/scroll-check.png" });
});

test("continuous editor protects text and undo, tab rename/delete, compact tree jumps to first side message", async ({
  page,
}) => {
  let count = 0;
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse(
        ++count === 1
          ? "前缀。保护文字。后缀。"
          : "侧栏回答。\n\n" + "历史段落。\n\n".repeat(20),
      ),
    }),
  );
  await setup(page);
  await ask(page);
  await selectText(page, "保护文字");
  await page
    .locator(".main-panel .message.assistant")
    .getByRole("button", { name: "编辑消息", exact: true })
    .click();
  const editor = page.getByRole("textbox", {
    name: "编辑消息内容",
    exact: true,
  });
  await editor.click();
  await editor.press("Control+a");
  await editor.press("Backspace");
  await expect(editor).toContainText("前缀。保护文字。后缀。");
  await expect(page.locator(".inline-error")).toContainText("高亮片段");
  await editor.press("Control+Home");
  await editor.pressSequentially("新增");
  await expect(editor).toContainText("新增前缀");
  await editor.press("Control+z");
  await expect(editor).toContainText("前缀。保护文字");
  await editor.pressSequentially("新增");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".question-highlight")).toHaveText("保护文字");
  await expect(page.getByLabel("已修改")).toHaveCount(0);
  await page.getByRole("tab", { name: "提问 1" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  await page.getByRole("textbox", { name: "对话名称" }).fill("深入理解");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("tab", { name: "深入理解" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "侧边提问输入" })
    .fill("第一个侧边问题");
  await page.getByRole("button", { name: "发送侧边提问" }).click();
  await expect(
    page.locator(".side-scroll .message.assistant:not(.inherited)"),
  ).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "侧边提问输入" })
    .fill("第二个侧边问题");
  await page.getByRole("button", { name: "发送侧边提问" }).click();
  await expect(
    page.locator(".side-scroll .message.assistant:not(.inherited)"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "对话脉络", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".question-node")).toHaveCount(1);
  await page.locator(".question-node").dblclick();
  await expect(
    page.locator(".side-scroll .message.user:not(.inherited)").first(),
  ).toBeInViewport();
  await expect(page.locator(".inherited-context, .source-quote")).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "深入理解" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("4 个节点");
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.locator(".question-highlight")).toHaveCount(0);
});

test("selection action dismisses on outside click, collapse, scroll and Escape", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse("可以选中的文字。\n\n" + "滚动段落。\n\n".repeat(40)),
    }),
  );
  await setup(page);
  await ask(page);
  await expect(page.locator(".main-panel .message.assistant")).toContainText(
    "可以选中",
  );
  const select = async () => {
    await setScrollTop(page, ".main-scroll", 0);
    await page
      .locator(".main-panel .message.assistant .markdown")
      .evaluate((root) => {
        const text = root.querySelector("[data-source-map]")!.firstChild!;
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, 4);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
    await expect(
      page.getByRole("button", { name: "创建侧边对话" }),
    ).toBeVisible();
  };
  await select();
  await page.locator(".topbar").click();
  await expect(page.getByRole("button", { name: "创建侧边对话" })).toHaveCount(
    0,
  );
  await select();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "创建侧边对话" })).toHaveCount(
    0,
  );
  await select();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await expect(page.getByRole("button", { name: "创建侧边对话" })).toHaveCount(
    0,
  );
  await select();
  await page.locator(".main-scroll").evaluate((el) => (el.scrollTop = 500));
  await expect(page.getByRole("button", { name: "创建侧边对话" })).toHaveCount(
    0,
  );
});

test("automatic titles use non-thinking history windows and respect manual rename", async ({
  page,
}) => {
  const prompts: any[] = [];
  let answer = 0;
  await page.route("https://api.deepseek.com/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.messages[0]?.content.startsWith("Based on the chat history")) {
      prompts.push(body);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return route.fulfill({
        contentType: "text/event-stream",
        body: sse(`自动标题${prompts.length}`),
      });
    }
    answer++;
    return route.fulfill({
      contentType: "text/event-stream",
      body:
        answer === 1
          ? `data: ${JSON.stringify({ choices: [{ delta: { content: "*中文斜体* 与可选择内容" }, finish_reason: "length" }] })}\n\n`
          : sse(`回答${answer}`),
    });
  });
  await setup(page, false);
  await ask(page, "首条问题");
  await expect(page.locator(".topbar .title-dots")).toBeVisible();
  await expect(page.locator(".chat-title")).toHaveText("自动标题1");
  expect(prompts[0].reasoning_effort).toBe("none");
  expect(prompts[0].messages[0].content).toContain(
    "user: 首条问题\n\nassistant: *中文斜体* 与可选择内容",
  );
  expect(prompts[0].messages[0].content).toContain("Use 简体中文");
  await expect(page.locator(".markdown em")).toHaveCSS("font-style", "italic");
  await selectText(page, "可选择内容");
  for (let i = 1; i <= 3; i++) {
    await page
      .getByRole("textbox", { name: "侧边提问输入" })
      .fill(`侧边问题${i}`);
    await page.getByRole("button", { name: "发送侧边提问" }).click();
    await expect(
      page.getByRole("tab", { name: `自动标题${i + 1}` }),
    ).toBeVisible();
  }
  const finalPrompt = prompts[3].messages[0].content;
  expect(finalPrompt).not.toContain("侧边问题1");
  expect(finalPrompt).toContain(
    "assistant: 回答2\n\nuser: 侧边问题2\n\nassistant: 回答3\n\nuser: 侧边问题3\n\nassistant: 回答4",
  );
  expect(prompts.every((p) => p.reasoning_effort === "none")).toBe(true);
  await page.getByRole("tab").click({ button: "right" });
  await page.getByRole("menuitem", { name: "重命名" }).click();
  await page.getByRole("textbox", { name: "对话名称" }).fill("手动名称");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("textbox", { name: "侧边提问输入" }).fill("保留名称");
  await page.getByRole("button", { name: "发送侧边提问" }).click();
  await expect(
    page.locator(".side-scroll .message.assistant:not(.inherited)").last(),
  ).toContainText("回答5");
  await expect(page.getByRole("tab", { name: "手动名称" })).toBeVisible();
  expect(prompts).toHaveLength(4);
});

test("compact headers, logo, language, editor parity and sidebar transitions", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse("一条简洁的回答。\n\n*斜体内容*"),
    }),
  );
  await setup(page);
  await expect(page.locator(".welcome-logo")).toBeVisible();
  expect(
    await page
      .locator(".brand-logo")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
  await page.locator(".language-menu summary").click();
  await expect(page.locator(".language-menu button")).toHaveText("简体中文");
  await page.locator(".language-menu button").click();
  await ask(page);
  await page.getByLabel("切换侧边提问栏").click();
  await expect(page.locator(".side-empty")).toContainText(
    "选中对话中的文字以进行提问",
  );
  const headers = await page
    .locator(".brand, .topbar, .side-header")
    .evaluateAll((els) =>
      els.map((el) => ({
        y: el.getBoundingClientRect().y,
        height: el.getBoundingClientRect().height,
      })),
    );
  for (const header of headers) {
    expect(header.y).toBeCloseTo(0);
    expect(header.height).toBeCloseTo(60);
  }
  await page.locator(".main-panel .message.user").click();
  await expect(page.locator(".side-empty")).toContainText(
    "无法对用户消息进行侧边提问",
  );
  await page.locator(".main-panel .message.system").click();
  await expect(page.locator(".side-empty")).toContainText(
    "无法对系统消息进行侧边提问",
  );
  await page
    .locator(".main-panel .message.assistant")
    .getByLabel("编辑消息", { exact: true })
    .click();
  await page.getByRole("textbox", { name: "编辑消息内容" }).click();
  await expect(page.locator(".continuous-editor")).toHaveCSS(
    "border-radius",
    "10px",
  );
  await expect(page.locator(".cm-scroller")).toHaveCSS("line-height", "21px");
  await page.screenshot({ path: "test-results/docs/editor-detail.png" });
  await page.getByRole("button", { name: "新建分支", exact: true }).click();
  await expect(page.locator(".continuous-editor")).toHaveCount(1);
  await expect(page.locator(".cm-scroller")).toHaveCSS("line-height", "21px");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByLabel("收起对话列表").click();
  await expect(page.locator(".conversation-sidebar")).toBeHidden();
  await page.getByLabel("展开对话列表").click();
  await expect(page.locator(".conversation-sidebar")).toBeVisible();
  await expect(page.locator(".app")).toHaveCSS(
    "transition-property",
    "grid-template-columns",
  );
  await page.screenshot({ path: "test-results/docs/compact-workspace.png" });
});

test("sidebar borders resize, persist and preserve main space", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("切换侧边提问栏").click();
  const left = page.getByRole("separator", { name: "调整对话列表宽度" });
  const right = page.getByRole("separator", { name: "调整侧边提问宽度" });
  async function drag(handle: typeof left, dx: number) {
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + 4 + dx, box.y + 120, { steps: 8 });
    await page.mouse.up();
  }
  await drag(left, 70);
  await expect(left).toHaveAttribute("aria-valuenow", "340");
  await drag(right, -80);
  await expect(right).toHaveAttribute("aria-valuenow", "465");
  await page.reload();
  await expect(
    page.getByRole("separator", { name: "调整对话列表宽度" }),
  ).toHaveAttribute("aria-valuenow", "340");
  await page.getByLabel("切换侧边提问栏").click();
  await expect(right).toHaveAttribute("aria-valuenow", "465");
  await right.focus();
  await right.press("ArrowLeft");
  await expect(right).toHaveAttribute("aria-valuenow", "481");
  await drag(left, 900);
  const main = await page.locator(".main-panel").boundingBox();
  expect(main!.width).toBeGreaterThanOrEqual(399);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(async () => (await page.locator(".main-panel").boundingBox())!.width)
    .toBeGreaterThanOrEqual(399);
  await page.getByLabel("收起对话列表").click();
  await expect(left).toHaveCount(0);
  await page.getByLabel("展开对话列表").click();
  await expect(left).toBeVisible();
});

test("reasoning aligns with avatar and animates in both directions", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "先分析问题。\n\n再检查结论。", content: "这是最终回答。" } }] })}\n\ndata: [DONE]\n\n`,
    }),
  );
  await setup(page);
  await ask(page);
  const message = page.locator(".main-panel .message.assistant");
  const toggle = message.getByRole("button", { name: "思考过程" });
  await expect(toggle).toBeVisible();
  const avatar = (await message.locator(".avatar").boundingBox())!;
  const button = (await toggle.boundingBox())!;
  expect(
    Math.abs(avatar.y + avatar.height / 2 - button.y - button.height / 2),
  ).toBeLessThan(1);
  const collapse = message.locator(".reasoning-collapse");
  await expect(collapse).toHaveCSS("opacity", "0");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(collapse).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/docs/reasoning-open.png" });
  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(collapse).toHaveCSS("opacity", "0");
  expect((await collapse.boundingBox())!.height).toBeLessThan(1);
  await page.screenshot({ path: "test-results/docs/reasoning-closed.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(collapse).toHaveCSS("transition-duration", "0s");
});

test("branch and reasoning controls stay anchored and scrolling only consumes reserve", async ({
  page,
}) => {
  let count = 0;
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse(++count === 1 ? "短回答。" : "长回答。\n\n".repeat(45)),
    }),
  );
  await setup(page);
  await ask(page);
  await page
    .locator(".main-panel .message.assistant")
    .getByLabel("重新生成")
    .click();
  const prev = page.getByLabel("上一个分支");
  await prev.scrollIntoViewIfNeeded();
  const before = (await prev.boundingBox())!.y;
  await prev.click();
  await expect(
    page.locator(".main-panel .message.assistant .markdown"),
  ).toHaveText("短回答。");
  await expect
    .poll(async () => Math.abs((await prev.boundingBox())!.y - before))
    .toBeLessThan(2);
  await page.waitForTimeout(450);
  const reserves = () =>
    page
      .locator(".main-scroll .scroll-reserve")
      .evaluateAll((els) =>
        els.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0),
      );
  const initialReserve = await reserves();
  expect(initialReserve).toBeGreaterThan(0);
  await page.locator(".main-scroll").hover();
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(200);
  const consumed = await reserves();
  expect(consumed).toBeLessThan(initialReserve);
  await page.mouse.wheel(0, -1500);
  await page.waitForTimeout(200);
  expect(await reserves()).toBeLessThanOrEqual(consumed + 1);
  const next = page.getByLabel("下一个分支");
  await next.scrollIntoViewIfNeeded();
  const nextY = (await next.boundingBox())!.y;
  await next.click();
  await expect
    .poll(async () => Math.abs((await next.boundingBox())!.y - nextY))
    .toBeLessThan(2);
});

test("collapsing long reasoning holds its toggle and reclaims bottom space", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "思考段落。\n\n".repeat(60), content: "结论。" } }] })}\n\ndata: [DONE]\n\n`,
    }),
  );
  await setup(page);
  await ask(page);
  const toggle = page.getByRole("button", { name: "思考过程" });
  await toggle.click();
  await page.waitForTimeout(450);
  await page.locator(".main-scroll").evaluate((el) => {
    const toggle = el.querySelector(".reasoning-toggle")!;
    el.scrollTop +=
      toggle.getBoundingClientRect().top - el.getBoundingClientRect().top - 30;
  });
  const before = (await toggle.boundingBox())!.y;
  await toggle.click();
  await page.waitForTimeout(450);
  expect(Math.abs((await toggle.boundingBox())!.y - before)).toBeLessThan(2);
  const spare = page.locator(".main-scroll .scroll-reserve").last();
  expect((await spare.boundingBox())!.height).toBeGreaterThan(100);
  await page.locator(".main-scroll").hover();
  await page.mouse.wheel(0, -1500);
  await expect
    .poll(async () => (await spare.boundingBox())!.height)
    .toBeLessThan(2);
  await page.mouse.wheel(0, 1500);
  expect((await spare.boundingBox())!.height).toBeLessThan(2);
});
test("composer grows to a cap and shrinks with the draft", async ({ page }) => {
  await setup(page);
  const input = page.getByRole("textbox", { name: "消息输入", exact: true });
  const initial = (await input.boundingBox())!.height;
  await input.fill("一行内容\n".repeat(5));
  expect((await input.boundingBox())!.height).toBeGreaterThan(initial);
  await input.fill("一行内容\n".repeat(50));
  const height = (await input.boundingBox())!.height;
  expect(height).toBeLessThanOrEqual(240);
  expect(await input.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await input.fill("");
  expect((await input.boundingBox())!.height).toBe(initial);
  const model = page.getByRole("button", { name: "模型与思考档位" });
  await model.click();
  await expect(model).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(200);
  expect(
    await model.locator("svg").evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe("none");
});

test("collapsed reasoning branch snapshot retains its visible position", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "思考内容。\n\n".repeat(40), content: "回答正文。" } }] })}\n\ndata: [DONE]\n\n`,
    }),
  );
  await setup(page);
  await ask(page);
  await page
    .locator(".main-panel .message.assistant")
    .getByLabel("重新生成")
    .click();
  const toggle = page.getByRole("button", { name: "思考过程" });
  await toggle.click();
  await page.waitForTimeout(450);
  await toggle.click();
  await page.waitForTimeout(450);
  const result = await page
    .getByLabel("上一个分支")
    .evaluate((button: HTMLButtonElement) => {
      const source = button.closest(".message")!;
      const before = source.getBoundingClientRect().top;
      button.click();
      const snapshot = document.querySelector(
        ".branch-transition-snapshot .message",
      )!;
      return {
        before,
        after: snapshot.getBoundingClientRect().top,
        focused: snapshot.classList.contains("focused"),
      };
    });
  expect(Math.abs(result.after - result.before)).toBeLessThan(1);
  expect(result.focused).toBe(false);
});
test("tree context menu follows the pointer and closes with motion", async ({
  page,
}) => {
  await page.route("https://api.deepseek.com/**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse("树图定位测试"),
    }),
  );
  await setup(page);
  await ask(page);
  await page.getByRole("button", { name: "对话脉络", exact: true }).click();
  const node = page
    .locator(".react-flow__node")
    .filter({ hasText: "树图定位测试" });
  await expect(node).toBeVisible();
  await page.waitForTimeout(300);
  const box = (await node.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.click(x, y, { button: "right" });
  const menu = page.getByRole("button", { name: "删除节点", exact: true });
  await expect(menu).toBeVisible();
  await page.waitForTimeout(160);
  const menuBox = (await menu.boundingBox())!;
  expect(Math.abs(menuBox.x - x)).toBeLessThan(2);
  expect(Math.abs(menuBox.y - y)).toBeLessThan(2);
  await page
    .getByRole("button", { name: "关闭", exact: true })
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(page.locator(".modal[data-state='closed']")).toBeAttached();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
