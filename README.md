# Nyx

Nyx 是一个先为自己使用而构建的桌面 AI 聊天工具。

长期方向上，Nyx 会继续朝更完整的桌面 AI 客户端演进；但当前正在实现的范围已经收敛到 `v1 min chat`，优先把最小但真实可用的聊天闭环做稳。

## 当前范围 Source of Truth

当前执行范围以 [docs/v1-min-chat-implementation-plan.md](./docs/v1-min-chat-implementation-plan.md) 为准。

如果 [PRD.md](./PRD.md) 或旧版 `v0` 文档与这份实现计划冲突，以 `v1 min chat` 计划为准。

这一轮当前只做：

- 单页桌面聊天 UI，带轻量侧边栏与聊天主区
- 真实模型接入与真流式输出
- 纯文本消息
- 临时多轮对话
- `Stop`
- 失败后的 `Retry`
- `New chat`

这一轮明确不做：

- Markdown 与代码块渲染
- 会话历史
- 模型选择
- 本地持久化
- 设置页
- Agent、Tool、插件、云同步、多模态

## 当前仓库状态

仓库当前同时包含两层内容：

- 已落好的工程骨架
- 正在实现中的 `v1 min chat` 聊天垂直切片

当前基础骨架包括：

- `Electron + electron-vite` 基础结构
- `main / preload / renderer / shared` 分层目录
- `React + React Router` 的 renderer 入口
- `Tailwind CSS v4` 基础样式入口
- `Radix UI` 作为底层交互 primitive 的明确选型
- `TypeScript Native Preview` 与 `TypeScript 6.0 RC` 双轨类型检查脚本
- `Oxlint` / `Oxfmt` / `Vitest` 脚本
- `Lefthook` 提交前检查
- `SQLite + better-sqlite3 + Drizzle` 依赖基线
- preload bridge 已经收敛到 `sandbox + contextIsolation` 的单一运行模型
- 核心 bootstrap 工具链版本已经固定到当前验证通过的组合

当前聊天切片的目标状态见：

- [docs/v1-min-chat-implementation-plan.md](./docs/v1-min-chat-implementation-plan.md)

背景文档见：

- [PRD.md](./PRD.md)
- [docs/v0-technical-baseline.md](./docs/v0-technical-baseline.md)

## 常用命令

- `pnpm dev`
- `pnpm build`
- `pnpm format`
- `pnpm typecheck`
- `pnpm typecheck:compat`
- `pnpm lint`
- `pnpm format:check`

开发时直接运行 `pnpm dev`。`electron-vite` 会先构建 `out/main/index.js` 和 `out/preload/index.cjs`，再启动 Electron，所以 `package.json` 里的 `main` 入口会指向 `out/main/index.js`。

执行 `pnpm install` 后会自动运行 `pnpm prepare`，把 `Lefthook` 同步到 `.git/hooks`。当前约定是：

- `pre-commit`：格式化 + lint
- `pre-push`：`pnpm typecheck` + `pnpm typecheck:compat`

## 当前原则

- 保持当前 scope 克制，先把聊天体验做顺
- 核心逻辑尽量纯，边界层务实处理副作用
- 尽量使用显式、严格、可测试的类型与契约
- 为未来扩展留路，但不为了未来过度抽象

## 长期方向

更完整的产品能力仍然在长期方向里，包括但不限于：

- Markdown 与更好的消息渲染
- 会话历史与本地持久化
- 模型选择与设置
- 更丰富的工作流、工具与扩展能力

但这些都不是当前这轮实现的 in-scope。
