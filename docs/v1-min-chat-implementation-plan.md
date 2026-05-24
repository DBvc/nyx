# Nyx V1 Min Chat Implementation Plan

状态：Draft
日期：2026-04-07
分支：`main`

## 1. Source of Truth

这份计划基于两类已有文档：

- 仓库内背景文档：[PRD.md](/Users/sy/Code/github/nyx/PRD.md)、[README.md](/Users/sy/Code/github/nyx/README.md)
- 最新最小需求文档：`/Users/sy/.gstack/projects/DBvc-nyx/sy-main-design-20260407-nyx-v1-min-chat.md`

如果这些文档之间冲突，以最新的 `nyx-v1-min-chat` 设计文档为准。

原因很简单：仓库内 `v0` 文档仍然包含历史、模型选择、本地持久化、Markdown 渲染等更大范围，而最新设计文档已经把范围压回真正的最小可用聊天闭环。

## 2. Recovered Minimum Requirements

当前要实现的不是一个平台，而是一条最小但真实可用的聊天垂直切片：

- 单页面桌面聊天 UI，采用轻量左侧辅助栏和右侧聊天主区
- 真实模型接入，必须是真流式，不允许假流式
- 基本形态参考常见桌面聊天产品，但不做多区域工作台
- 只支持纯文本消息
- 支持临时多轮对话，但只存在于当前应用会话内
- 支持 `Stop`
- 支持失败后的 `Retry`
- 支持 `New chat` / 清空当前临时对话
- `baseUrl`、`token`、`model` 只从环境变量读取
- secret 只能存在于 Electron `main` process

当前明确不做：

- 设置页
- 模型选择 UI
- 会话历史
- 本地持久化
- Markdown / 代码高亮
- Skill / Agent / artifact
- 应用重启后的恢复

## 3. Success Criteria

只有同时满足下面这些条件，这一版才算完成：

- 启动应用后可以直接发送消息给真实模型
- assistant 回复按流式逐步出现，不是一整段一次性落下
- 生成中可以手动停止，并保留已生成部分
- 请求失败时有清晰的内联错误，并能从当前界面重试
- 用户可以清空当前临时对话重新开始
- renderer 永远拿不到 token 或 base URL secret
- 不需要任何应用内设置页就能跑通

## 4. Current Repository Reality

当前仓库已经有这些基础：

- Electron `main` / `preload` / `renderer` 骨架
- `window.nyx` 的最小 preload bridge
- React renderer 入口和样式 token
- 一个展示性质的 bootstrap 页面

当前还没有这些东西：

- 聊天 IPC 契约
- 主进程中的真实 API 调用
- 流式事件模型
- 聊天消息状态机
- 停止 / 重试 / 清空逻辑
- 面向这条聊天闭环的测试

这意味着当前最重要的不是“再想更多未来能力”，而是把现有骨架接成一条真的能跑的链路。

## 5. Auto-Decided Planning Choices

这几个决策直接锁定，不继续发散：

- 范围以最新 `v1 min chat` 文档为准，不按旧的 `v0` 范围继续扩
- 保留轻量左侧辅助栏，但不做真实历史列表、设置区或多工作区
- renderer 只维护内存态，不提前引入数据库或持久化
- `main` process 负责读取环境变量、发起网络请求、持有取消句柄
- 对 provider 保持一层很薄的 adapter，但不为了“未来平台化”做重抽象
- 同一时刻只允许一个活跃 assistant 生成，先把闭环做稳
- 清空动作默认命名为 `New chat`，因为更符合用户心智

## 6. Implementation Plan

### Phase 0: Scope Lock and Doc Alignment

目标：先把“这次到底做什么”钉死，避免执行途中又被旧文档拉回更大范围。

任务：

- 将这份实现计划落到仓库中
- 明确本轮实现只服务 `v1 min chat`
- 把旧 `v0` 文档视为背景，不作为当前实现边界
- 后续如需同步 `README.md` / `PRD.md`，单独做一次文档对齐，不和功能实现混在一起

交付物：

- 仓库内有可执行的实现计划
- 团队对当前 in-scope / out-of-scope 有单一口径

### Phase 1: Define Shared Chat Contract

目标：先把跨进程契约定清楚，再开始堆 UI 或网络代码。

任务：

- 在 [shared/contracts/desktop.ts](/Users/sy/Code/github/nyx/shared/contracts/desktop.ts) 中补上聊天领域类型
- 定义 renderer 到 preload 的动作：
  - `startChat`
  - `cancelChat`
- 定义 main 到 renderer 的事件：
  - `chat:start`
  - `chat:delta`
  - `chat:done`
  - `chat:error`
- 定义最小消息模型：
  - `id`
  - `role`
  - `content`
  - `status`
  - `error`
- 定义 renderer 内部状态最少要能表达：
  - 空态
  - 正在发送
  - 正在流式生成
  - 已中断
  - 已失败
  - 可重试

建议文件：

- [shared/contracts/desktop.ts](/Users/sy/Code/github/nyx/shared/contracts/desktop.ts)
- `shared/chat/types.ts`
- `shared/chat/events.ts`

完成标准：

- 类型层面能完整表达一次聊天请求和一次流式返回
- preload 和 renderer 不再靠字符串猜协议

### Phase 2: Main Process Streaming Pipeline

目标：在 `main` process 中打通真实模型流式返回，保证 secret 不越界。

任务：

- 在 `main` process 启动时读取并校验环境变量：
  - `NYX_API_BASE_URL`
  - `NYX_API_TOKEN`
  - `NYX_MODEL`
- 增加一个很薄的 provider client，固定走 OpenAI-compatible `/v1/chat/completions`
- 把 provider 的流式事件转换成 renderer 能消费的统一事件
- 维护当前活跃请求的取消句柄，用于 `Stop`
- 请求失败时输出结构化错误，而不是把原始异常直接抛给 renderer
- 确保 token 和原始配置永远不被序列化到 renderer

建议文件：

- [electron/main/index.ts](/Users/sy/Code/github/nyx/electron/main/index.ts)
- `electron/main/chat/env.ts`
- `electron/main/chat/client.ts`
- `electron/main/chat/session.ts`
- `electron/main/chat/errors.ts`

建议策略：

- 使用官方 `openai` SDK 配合 `baseURL`，不要自己手搓 SSE 解析
- 但 SDK 只允许留在 `main` 层，UI 完全不知道它存在

完成标准：

- 从 `main` process 可以对真实 relay 发起一次流式聊天请求
- 能把 delta / done / error / cancel 明确回推给 renderer

### Phase 3: Preload Bridge and Renderer Chat Screen

目标：把当前展示性质的 bootstrap 页面替换成真实的桌面聊天界面。

任务：

- 在 [electron/preload/index.ts](/Users/sy/Code/github/nyx/electron/preload/index.ts) 中暴露受限聊天 API
- 让 renderer 只拿到：
  - 发起请求的方法
  - 取消的方法
  - 订阅流式事件的方法
- 在 [src/ui/App.tsx](/Users/sy/Code/github/nyx/src/ui/App.tsx) 中替换现有 bootstrap 布局
- 实现基础桌面聊天壳：
  - 左侧轻量辅助栏
  - 右侧主聊天区
  - 主聊天区内的轻标题区、消息列表、输入区
- 用内存 reducer 管理当前临时会话
- 发送后立刻插入 user message 和 assistant 占位 message
- 收到 delta 时持续追加到 assistant message
- done / cancel / error 时切换消息状态

建议文件：

- [electron/preload/index.ts](/Users/sy/Code/github/nyx/electron/preload/index.ts)
- [src/ui/App.tsx](/Users/sy/Code/github/nyx/src/ui/App.tsx)
- `src/ui/chat/chat-reducer.ts`
- `src/ui/chat/use-chat-session.ts`
- `src/ui/chat/chat-types.ts`

设计要求补充：

- 基本形态参考 ChatGPT / Codex 这类普通桌面聊天产品
- 但左侧辅助栏不能假装已经有真实历史或设置系统
- 聊天主区保持朴素、安静、可长期阅读，不做花哨视觉

完成标准：

- 打开应用看到的就是聊天页，不再是启动介绍页
- 发消息后能看到真实流式回包
- 页面刷新前能维持当前临时多轮聊天

### Phase 4: Interaction Polish for the Core Loop

目标：把 demo 级聊天补成“自己真的愿意用”的最小版本。

任务：

- 支持多行输入
- `Enter` 发送，`Shift+Enter` 换行
- 生成中显示 `Stop`
- 失败时显示内联错误块和 `Retry`
- 提供 `New chat`
- 自动滚动跟随最新消息
- 用户手动上滚后暂停自动跟随
- assistant 生成中仍允许继续编辑输入框，但禁用发送按钮

建议文件：

- [src/ui/App.tsx](/Users/sy/Code/github/nyx/src/ui/App.tsx)
- `src/ui/chat/components/*`
- `src/ui/chat/use-auto-scroll.ts`

完成标准：

- 最关键的体验动作都可用：发、停、重试、清空、继续输入
- 没有明显的“壳子感”

### Phase 5: Validation and Hardening

目标：把这条垂直切片从“能跑”提升到“可持续维护”。

任务：

- 为环境变量解析补单测
- 为聊天 reducer 补单测
- 为流式事件归一化补单测
- 手动验证失败、取消、连续重试等边界路径
- 跑通：
  - `pnpm typecheck`
  - `pnpm typecheck:compat`
  - `pnpm lint`
  - `pnpm build`

建议文件：

- `electron/main/chat/env.test.ts`
- `src/ui/chat/chat-reducer.test.ts`
- `electron/main/chat/client.test.ts`

完成标准：

- 核心状态迁移有测试
- 主干命令可通过
- 明确知道哪些风险被覆盖，哪些留到后续

## 7. File-Level Change Map

这一轮大概率会改到这些区域：

- [shared/contracts/desktop.ts](/Users/sy/Code/github/nyx/shared/contracts/desktop.ts)
  - 从 runtime info 扩展到真正的 chat bridge 契约
- [electron/main/index.ts](/Users/sy/Code/github/nyx/electron/main/index.ts)
  - 注册聊天 IPC 和应用生命周期内的 chat session 管理
- [electron/preload/index.ts](/Users/sy/Code/github/nyx/electron/preload/index.ts)
  - 暴露最小聊天 bridge
- [src/ui/App.tsx](/Users/sy/Code/github/nyx/src/ui/App.tsx)
  - 从 bootstrap 页面切成真实单页聊天
- `electron/main/chat/*`
  - 新增 provider client、env、session、errors
- `src/ui/chat/*`
  - 新增 reducer、hooks、components

## 8. Out of Scope for This Slice

这一轮明确延期，不和聊天闭环一起做：

- SQLite schema
- Drizzle repository
- 会话历史列表
- 模型切换器
- 设置页
- Markdown / 代码块渲染
- Prompt 模板
- 热键体系优化
- 打包 / 分发 / 安装器
- 多 provider
- 记忆 / Skill / Agent / artifact

这些都不是“不重要”，只是现在做会把最小闭环打散。

## 9. Risks and Watchouts

### 风险 1：旧文档范围更大

仓库里的 `README.md` 和 `PRD.md` 仍然会把人拉向“历史 + 持久化 + 模型选择”的更大 `v0`。

处理方式：

- 当前实现以本计划为准
- 功能完成后单独做一次文档对齐

### 风险 2：流式接入最容易把边界做脏

如果图省事把 token、raw response 或 SDK 对象泄漏到 renderer，后面基本一定要返工。

处理方式：

- 强制 main-only network
- renderer 只消费标准化事件

### 风险 3：最小版很容易被“顺手多做一点”拖慢

最常见的是顺手把持久化、Markdown、历史列表一起带上。

处理方式：

- 任何新增项如果不直接服务“当前聊天闭环可用”，一律延期

## 10. Suggested Execution Order

按这个顺序做最稳：

1. shared chat contract
2. main process env + provider client
3. preload bridge
4. renderer reducer + 单页聊天 UI
5. stop / retry / new chat / auto-scroll
6. tests + hardening

这条顺序的核心思想是，先把边界钉死，再把 UI 接上去。不要反过来。

## 11. Ship Checklist

开始做功能前，最后再看一遍这张清单：

- [ ] 仍然坚持单页、单会话、纯文本范围
- [ ] 不把 secret 暴露到 renderer
- [ ] 不引入设置页和模型选择
- [ ] 不引入持久化
- [ ] 有 stop / retry / new chat
- [ ] 真实流式已经跑通
- [ ] 失败态是内联、可理解、可恢复的
- [ ] 核心状态迁移有测试

做到这里，这一版就已经是“真实产品”，不是聊天壳子了。
