# Nyx V1 Min Chat Implementation Plan

状态：Implemented ordinary baseline
创建日期：2026-04-07
最近更新：2026-08-31
分支：`main`

## 1. Source of Truth

这份文档是普通工作的 `v1 min chat` 基础范围。旧的 `README.md`、
`PRD.md`、`DESIGN.md` 和 `v0` 背景文档如果与本文件冲突，以本文件为准。
已经落地的命名工作流只在各自明确范围内补充或覆盖这份基础范围；其当前
状态和执行权限以
[agent-workbench-task-slices.md](./next/agent-workbench-task-slices.md) 路由的
对应合同为准。

相关文档：

- 背景文档：[README.md](../README.md)、[PRD.md](../PRD.md)、
  [DESIGN.md](../DESIGN.md)、[v0 technical baseline](./v0-technical-baseline.md)
- 桌面聊天里程碑：[desktop-chat-milestone.md](./next/desktop-chat-milestone.md)
- 手动 provider runthrough：[llm-chat-runthrough.md](./next/llm-chat-runthrough.md)
- 工作区边界：[workspace-boundary.md](./architecture/workspace-boundary.md)
- runtime 协议边界：[runtime-protocol.md](./architecture/runtime-protocol.md)
- macOS release 边界：[macos-release.md](./architecture/macos-release.md)

最初的 min-chat 需求来自本地未提交设计输入；仓库文档不得写入本地绝对路径。
普通工作以本文件和相邻架构文档为准；命名工作流按上面的路由处理。

## 2. Ordinary Baseline Scope

Nyx 的普通基础范围不是通用 AI workbench，而是一条最小但真实可用的桌面
聊天闭环。下面记录的是基础范围，不是所有已落地命名工作流的功能清单。

In scope:

- 单页面桌面聊天 UI，采用轻量左侧辅助栏和右侧聊天主区
- 纯文本 user / assistant 消息
- 真实 provider 接入，必须是真流式，不允许假流式
- 临时多轮对话，只存在于当前应用会话内
- `Stop`
- 失败后的 `Retry`
- `New chat` / 清空当前临时对话
- `NYX_API_BASE_URL`、`NYX_API_TOKEN`、`NYX_MODEL` 从环境变量读取
- provider secret 只存在于 Electron `main` process
- Electron-main-only runtime-backed chat state，用 OCaml reducer 语义保护当前聊天状态

Out of scope:

- 设置页
- 模型选择 UI
- 会话历史
- 本地持久化或重启恢复
- Markdown / 代码高亮
- tools
- agents
- plugins
- artifacts
- cloud sync
- multimodal features
- renderer 访问 provider credentials、provider config、环境变量或 OCaml runtime

## 3. Success Criteria

这一版完成的判断标准：

- 启动应用后可以直接发送消息给真实模型
- assistant 回复按流式逐步出现，不是一整段一次性落下
- 生成中可以手动停止，并保留已生成部分
- 请求失败时有清晰的内联错误，并能从当前界面重试
- 用户可以清空当前临时对话重新开始
- renderer 永远拿不到 token、完整 base URL 或 raw provider config
- 不需要任何应用内设置页就能跑通
- Electron main 默认使用 runtime-backed chat state；`NYX_RUNTIME_CHAT_STATE=0`
  只作为诊断 disable

## 4. Baseline Repository Reality

仓库已经实现并验证了下面的 `v1 min chat` 基础能力：

- shared chat/provider contracts
- Electron preload `window.nyx` bridge
- Electron main provider env parsing、provider streaming client、chat session manager
- renderer chat reducer、hooks 和单页聊天 UI
- provider missing、empty、streaming、failed retry、cancelled 等可见状态
- `Stop`、`Retry`、`New chat`
- redacted provider setup status
- desktop unit tests、typecheck、lint 和 build
- OCaml runtime project、runtime protocol scaffold、typed chat reducer semantics
- Electron-main-only runtime-backed chat state path，默认开启
- macOS arm64 dev/prod packaging source、packaged runtime staging、release workflow source

这份基础计划仍未完成的事项：

- credentialed production release operations：真实 Apple Developer ID、notarization
  credentials、production update feed 和 tagged GitHub Release 环境仍需单独执行
- 非 macOS arm64 release targets

Connections、目标选择、持久化、Responses、本地图片/文档输入和 Thread
Library 等已经落地的命名工作流不在这里重复维护。它们不会自动授权相关
方向继续扩张。

## 5. Ownership Boundary

`apps/desktop` owns:

- Electron main / preload / renderer
- desktop UI
- provider integration
- environment variables and provider credentials
- provider request cancellation
- OS-facing side effects
- main-only runtime child process lifecycle for current runtime boundary tasks

`runtime/ocaml` owns:

- typed runtime domain model
- runtime event model
- typed chat reducer semantics
- replayable runtime tests
- future agent/tool/policy/capability semantics

Current runtime boundary:

- Electron main may spawn the OCaml runtime only through explicit runtime boundary code.
- Renderer and preload never talk to the runtime directly.
- OCaml runtime does not read provider env, hold credentials, call providers, own UI,
  or perform OS side effects in this phase.
- Runtime-backed chat state is default-on for Electron main. Setting
  `NYX_RUNTIME_CHAT_STATE=0` is diagnostic fallback only.

## 6. Completed Implementation Slices

### Scope Lock and Doc Alignment

Status: complete.

- `v1 min chat` is the active product scope.
- Older `v0` docs are background only.
- Product expansion requires an explicit scope decision.

### Shared Chat Contract

Status: complete.

Key files:

- [apps/desktop/shared/contracts/desktop.ts](../apps/desktop/shared/contracts/desktop.ts)
- [apps/desktop/shared/chat/types.ts](../apps/desktop/shared/chat/types.ts)
- [apps/desktop/shared/chat/events.ts](../apps/desktop/shared/chat/events.ts)
- [apps/desktop/shared/provider/types.ts](../apps/desktop/shared/provider/types.ts)

Current contract covers start/cancel/reset, provider status, stream events,
message ids, turn intent, error payloads, and run status.

### Main Process Streaming Pipeline

Status: complete.

Key files:

- [apps/desktop/electron/main/chat/env.ts](../apps/desktop/electron/main/chat/env.ts)
- [apps/desktop/electron/main/chat/client.ts](../apps/desktop/electron/main/chat/client.ts)
- [apps/desktop/electron/main/chat/session.ts](../apps/desktop/electron/main/chat/session.ts)
- [apps/desktop/electron/main/chat/errors.ts](../apps/desktop/electron/main/chat/errors.ts)

Electron main owns provider env reads, provider calls, cancellation handles,
error normalization, and runtime-backed chat state integration. Renderer receives
only normalized chat/provider events.

### Preload Bridge and Renderer Chat Screen

Status: complete.

Key files:

- [apps/desktop/electron/preload/index.ts](../apps/desktop/electron/preload/index.ts)
- [apps/desktop/src/ui/App.tsx](../apps/desktop/src/ui/App.tsx)
- [apps/desktop/src/ui/chat/use-chat-session.ts](../apps/desktop/src/ui/chat/use-chat-session.ts)
- [apps/desktop/src/ui/chat/chat-reducer.ts](../apps/desktop/src/ui/chat/chat-reducer.ts)
- [apps/desktop/src/ui/chat/components](../apps/desktop/src/ui/chat/components)

Renderer owns local in-memory interaction state and display only. It does not
read environment variables, hold provider credentials, call providers, spawn
child processes, or talk to OCaml.

### Core Interaction Polish

Status: complete.

Implemented:

- multi-line input
- `Enter` send and `Shift+Enter` newline
- `Stop` while streaming
- inline failure state and retry
- `New chat`
- auto-scroll behavior
- send disabled while an assistant response is active

### Validation and Hardening

Status: complete for the current slice.

Coverage includes:

- renderer chat reducer lifecycle tests
- chat presenter tests
- provider env parsing tests
- provider streaming helper tests
- Electron main chat session tests
- runtime protocol/session tests
- runtime-backed chat state integration tests
- OCaml runtime build/test/format checks

## 7. Verification Model

Primary checks:

```sh
mise run desktop:check
mise run runtime:check
mise run check
mise run desktop:build
```

Runtime-backed chat state check:

```sh
mise run runtime:chat-state:check
```

Manual provider verification is recorded in
[llm-chat-runthrough.md](./next/llm-chat-runthrough.md). That runthrough verifies
provider setup, basic streaming, stop, retry, and new chat without committing
tokens, full provider URLs, authorization headers, request logs, or screenshots.

The latest local doc-alignment audit on 2026-07-07 confirmed:

- `mise run check`
- `mise run desktop:check`
- `mise run desktop:package:mac:dev`
- `mise run desktop:package:mac:verify`
- production package/release verification fail-closed when Developer ID signing
  credentials are unavailable

## 8. Release State

macOS release engineering is tracked separately in
[macos-release.md](./architecture/macos-release.md).

Current release state:

- macOS arm64 is the first supported packaged target.
- dev package identity is `dev.dbvc.nyx` / `Nyx Dev`.
- production identity is `com.dbvc.nyx` / `Nyx`.
- packaged apps include `Contents/Resources/runtime/nyx-runtime`.
- packaged runtime resolution is fail-closed and must not use repo fallback or
  `.runtime-artifacts`.
- production release remains blocked until real Apple Developer ID signing,
  notarization credentials, production update feed, and GitHub Release environment
  are provisioned and verified.

This release work does not add settings UI, provider config UX, Keychain storage,
model picker UI, persistent history, Markdown, tools, agents, plugins, artifacts,
or broader runtime/provider integration.

## 9. Next Work Guidance

普通工作只在明确任务下继续：

- credentialed production release operations
- targeted documentation cleanup
- named runtime-state correctness hardening
- named packaging/release verification hardening

不要借“下一步工作”扩张为：

- 超出已落地 Thread Library 的历史、Projects、Folders 或 Tags
- 超出 Connections 和 Composer 目标选择的设置或路由 UI
- 超出已落地本地图片和文本/PDF 文档的媒体、远程文件或通用 Asset 服务
- Markdown rendering
- tools / agents / plugins / artifacts
- cloud sync

## 10. Original Baseline Ship Checklist

- [x] 单页、单会话、纯文本范围
- [x] renderer 不接触 provider secrets
- [x] 无 settings UI / model picker
- [x] 无持久化
- [x] `Stop`
- [x] `Retry`
- [x] `New chat`
- [x] 真实 provider streaming
- [x] inline failure state
- [x] 核心状态迁移测试
- [x] runtime-backed chat state 默认开启
- [x] macOS dev package 可生成并验证 packaged runtime
- [ ] credentialed production release verified with real Apple/GitHub release inputs
