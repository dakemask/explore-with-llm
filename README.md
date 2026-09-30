# Explore with LLM

<!-- 本 `README.md` 提供给使用与二次开发应用的用户阅读，Agent 不应将其当成纯开发文档 -->

一个 AI 聊天项目，使用 React、TypeScript、Vite 构建。支持消息分支、侧边提问、在可视化树中预览全部分支。数据与 API Key 存储在浏览器本地。支持 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages 协议。

## 使用

### 地址

[https://dakemask.github.io/explore-with-llm/](https://dakemask.github.io/explore-with-llm/)

### 配置提供商

点击应用左下角 **模型提供商** 可以配置模型。

### 使用技巧

在对话中选中文字，可进行侧边提问。

编辑对话中的消息可以新建分支（亦可以选择仅覆盖）。重新生成回复默认会新建分支。

在左上角**对话脉络**中可查看当前全部消息分支。双击消息可跳转到指定位置，右键消息可删除。

在右侧边栏，右键侧边提问标题可以进行删除。

## 开发

### 用户操作逻辑

- 主线：Enter 发送，Shift+Enter 换行。图片可选择、粘贴或拖入输入框。输入框中的模型菜单选择供应商下的模型并调节该模型的参数。新建对话先进入空白页，首次发送才保存到列表。
- 选中主线助手正文后，点击“创建侧边对话”。右侧按当前消息展示提问标签，同一选区可多次提问。
- 侧栏继承系统消息与主线祖先的最新内容；每次请求使用发送瞬间的快照。侧栏内容不会回流主线。
- 点击消息切换当前消息，右侧随之切换，空消息也不会自动收起侧栏。
- 编辑弹窗默认覆盖；主线可新建分支。连续编辑框内高亮受保护的源码片段，支持正常选区、光标移动与撤销；只有修改受保护片段的操作会被阻止；新建分支不复制原来的提问。
- 主线重试增加分支；侧栏仅末尾回答可重试，并替换它。侧栏内部不能分支或再次创建提问。
- “对话脉络”打开整棵树；双击定位、右键删除。聊天内的 `< 数字 / 总数 >` 切换分支。系统根节点仅允许覆盖编辑。每个侧边对话汇总为所属助手消息右侧的一个节点，双击定位到它的首条消息。侧边标签右键可重命名或删除。
- 会话、消息和侧边提问删除需确认；删除整段会话只显示确认标题，递归删除消息或侧边提问时显示后代数量。模型删除提供撤销，供应商删除需确认。中止或失败时，有正文的消息可以继续作为上下文；只有思考、摘要或加密内容的消息保留，但需重新生成正文才能继续；完全没有内容的消息删除。未完整接收的加密块不会回传。主线重生成保留旧分支，侧边提问仍覆盖原回答及其加密内容。
- 系统消息显示在消息流顶部，通过消息的编辑按钮修改提示词，默认 `You are a helpful assistant.`。

### 数据与请求

对话、图片、草稿、分支选择、标签选择以及可选记住的密钥保存在此站点来源下的 IndexedDB。未勾选记住的密钥只保存在当前页面内存。清除浏览器站点数据会删除这些内容；应用没有云端同步、导出或备份。更换域名/浏览器也不会带走历史。

“本地存储”不等于本地推理：发送时选中路径的历史、图片及已启用的对应来源加密思维链会传给所选模型提供商。图片按各协议的原生格式发送，支持 JPEG/PNG/GIF/WebP；单图上限 32 MiB，请求体上限 48 MiB。不会自动截断历史、总结或 OCR。远程 Markdown 图片不自动加载，避免输出中的任意跟踪资源。

应用不预选模型。供应商地址、名称、协议、密钥和模型列表可自定义；模型参数独立配置。切换供应商协议会清除所属模型的加密思维链能力声明并重置会话参数选择，自定义参数文本保留供修改。选用不支持图片或相关参数的模型时会显示供应商返回的错误。

协议与预设依据：[OpenAI 推理与无状态回传](https://developers.openai.com/api/docs/guides/reasoning)、[GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)、[GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)、[GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)、[Claude 思考](https://platform.claude.com/docs/en/build-with-claude/thinking)、[Claude 档位](https://platform.claude.com/docs/en/build-with-claude/effort)。

### 相关命令

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

### 实现

- `src/model.ts`：树、上下文、删除和位置保护
- `src/selection.ts`：渲染文字与源码选区映射
- `src/api.ts`：原生图片与流式协议
- `src/encryptedReasoning.ts`、`src/EncryptedReasoningView.tsx`：加密内容完整性、回传状态与界面
- `src/parameters.ts`、`src/ParameterControls.tsx`：参数格式、依赖、模板合并和调节控件
- `src/SettingsDialog.tsx`、`src/ModelConfigDialog.tsx`：供应商、模型和模板编辑
- `src/modelCatalog.ts`、`src/parameterPresets.ts`：模型获取与逐型号参数预设
- `src/config.ts`、`src/NamingSettings.tsx`：模型解析、选择状态和独立命名设置
- `src/db.ts`：本地数据库
- `.github/workflows/deploy.yml`：检查与自动部署
