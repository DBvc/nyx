# Nyx

Nyx 是一个先为自己使用而构建的桌面 AI 聊天工具。

当前阶段聚焦 `v0`：先把通用聊天这条最核心的闭环做扎实，而不是一开始就做成大而全的平台。

## v0 范围

`v0` 只聚焦这些基础能力：

- 单轮与多轮纯文本聊天
- Markdown 与代码块渲染
- 会话历史
- 模型选择
- 本地持久化

当前不把 Agent、Tool、插件、云同步、多模态等能力放进第一版。

## 当前仓库状态

仓库已经完成第一轮项目初始化，目前具备这些基础骨架：

- `Electron + electron-vite` 基础结构
- `main / preload / renderer / shared` 分层目录
- `React + React Router` 的 renderer 入口
- `Tailwind CSS v4` 基础样式入口
- `TypeScript Native Preview` 与 `TypeScript 6.0 RC` 双轨类型检查脚本
- `Oxlint` / `Oxfmt` / `Vitest` 脚本
- `Lefthook` 提交前检查
- `SQLite + better-sqlite3 + Drizzle` 依赖基线
- preload bridge 已经收敛到 `sandbox + contextIsolation` 的单一运行模型
- 核心 bootstrap 工具链版本已经固定到当前验证通过的组合

- 产品需求文档：[PRD.md](./PRD.md)
- v0 技术基线：[docs/v0-technical-baseline.md](./docs/v0-technical-baseline.md)

## 常用命令

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm typecheck:compat`
- `pnpm lint`
- `pnpm format:check`

开发时直接运行 `pnpm dev`。`electron-vite` 会先构建 `out/main/index.js` 和 `out/preload/index.cjs`，再启动 Electron，所以 `package.json` 里的 `main` 入口会指向 `out/main/index.js`。

执行 `pnpm install` 后会自动运行 `pnpm prepare`，把 `Lefthook` 同步到 `.git/hooks`。当前约定是：

- `pre-commit`：格式化 + lint

`typecheck` 当前仍然作为显式开发命令保留，等后续 CI 接进来后再决定是否放回 push 阶段。

## 当前原则

- 保持 `v0` scope 克制，把聊天体验做顺
- 核心逻辑尽量纯，边界层务实处理副作用
- 尽量使用显式、严格、可测试的类型与契约
- 为未来扩展留路，但不为了未来过度抽象

## 下一步

下一阶段是在这套骨架之上，开始实现第一条真正的聊天垂直切片：会话与消息模型、数据库 schema、typed IPC、provider adapter，以及第一版真实会话列表读取。
