# Explore with LLM

宽屏优先的个人 AI 对话工作区：主线分支、选区侧边提问、消息树和本地存储。使用 React、TypeScript、Vite，直接连接 DeepSeek API，无应用后端。

## 在线部署（不需要在电脑上构建）

1. 将本仓库内容放入自己的 GitHub 仓库，默认分支使用 `main` 或 `master`。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送代码，或在 **Actions → Verify and deploy → Run workflow** 手动运行。
4. 工作流会安装依赖、运行单元与浏览器测试、构建并发布。完成后在工作流的 `github-pages` 部署入口打开网站。
5. 网页左下角打开 **模型与设置**，填写自己的 DeepSeek API Key 并保存，然后开始聊天。

不需要 Repository Secrets，不需要将 API Key 写入 GitHub。相对资源路径同时支持 `https://<user>.github.io/` 与 `https://<user>.github.io/<repo>/`。如果使用其他分支，在 `.github/workflows/deploy.yml` 修改 `push.branches`，并允许该分支部署到 `github-pages` 环境。首次部署前需启用 Pages；仓库的账户方案需允许相应可见性的 Pages。

## 使用

- 主线：Enter 发送，Shift+Enter 换行。图片可选择、粘贴或拖入输入框。输入框中的模型菜单选择提供商与官方 `none / low / high / max` 思考档位。新建对话先进入空白页，首次发送才保存到列表。
- 选中主线助手正文后，点击“创建侧边对话”。右侧按当前消息展示提问标签，同一选区可多次提问。
- 侧栏继承系统消息与主线祖先的最新内容；每次请求使用发送瞬间的快照。侧栏内容不会回流主线。
- 点击消息切换当前消息，右侧随之切换，空消息也不会自动收起侧栏。
- 编辑弹窗默认覆盖；主线可新建分支。连续编辑框内高亮受保护的源码片段，支持正常选区、光标移动与撤销；只有修改受保护片段的操作会被阻止；新建分支不复制原来的提问。
- 主线重试增加分支；侧栏仅末尾回答可重试，并替换它。侧栏内部不能分支或再次创建提问。
- “对话脉络”打开整棵树；双击定位、右键删除。聊天内的 `< 数字 / 总数 >` 切换分支。系统根节点仅允许覆盖编辑。每个侧边对话汇总为所属助手消息右侧的一个节点，双击定位到它的首条消息。侧边标签右键可重命名或删除。
- 所有删除需确认；删除整段会话只显示确认标题，递归删除消息或侧边提问时显示后代数量。中止或失败保留已有正文，无正文则回到待生成状态。
- 系统消息显示在消息流顶部，通过消息的编辑按钮修改提示词，默认 `You are a helpful assistant.`。

## 数据与请求

对话、图片、草稿、分支选择、标签选择以及可选记住的密钥保存在此站点来源下的 IndexedDB。未勾选记住的密钥只保存在当前页面内存。清除浏览器站点数据会删除这些内容；应用没有云端同步、导出或备份。更换域名/浏览器也不会带走历史。

“本地存储”不等于本地推理：发送时选中路径的历史及图片会传给所选模型提供商。DeepSeek 使用原生 `image_url`（data URL）多模态输入，支持 JPEG/PNG/GIF/WebP；单图上限 32 MiB，请求体上限 48 MiB。不会自动截断历史、总结或 OCR。远程 Markdown 图片不自动加载，避免输出中的任意跟踪资源。

默认模型 `deepseek-flash`。提供商地址、名称、模型 ID 和密钥可自定义，但本版完整适配与验证范围为 DeepSeek 的 Chat Completions 协议。其他服务需要允许浏览器跨域访问并支持相应参数。选用不支持图片的模型时会显示提供商返回的错误。

## 本地开发

Node.js 24。

```bash
npm ci
npm run dev
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

`PLAYWRIGHT_EXECUTABLE_PATH` 可指定现有 Chromium 可执行文件。生产构建输出在 `dist/`。

## 实现

- `src/model.ts`：树、上下文、删除和位置保护
- `src/selection.ts`：渲染文字与源码选区映射
- `src/api.ts`：原生图片与流式协议
- `src/db.ts`：本地数据库
- `.github/workflows/deploy.yml`：检查与自动部署
