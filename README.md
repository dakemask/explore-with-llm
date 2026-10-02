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
