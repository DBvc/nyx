# apps/desktop/AGENTS.md

This directory contains the Nyx Electron desktop app.

The desktop app is currently the only user-facing product surface. Its default
scope remains `v1 min chat`.

Connections settings, thread-first UI work, and current-thread durability are
allowed only when the user explicitly asks to execute the corresponding gated
agent-workbench workstream or a named slice from
`../../docs/next/agent-workbench-task-slices.md`.

## Ownership

This subproject owns:

- Electron main process
- Electron preload bridge
- React renderer
- desktop UI
- current chat IPC
- current provider integration
- environment variable reading
- provider credentials
- OS-facing side effects
- explicit main-owned current-thread persistence and recovery

## Directory Map

- `electron/main`: Electron main process and side-effect boundary.
- `electron/preload`: restricted bridge exposed to renderer.
- `src`: React renderer.
- `shared`: TypeScript contracts shared by main, preload, and renderer.
- `electron.vite.config.ts`: Electron Vite build configuration.

## Hard Rules

- Renderer must not read environment variables.
- Renderer must not receive provider tokens, stored secrets, or raw provider
  configs.
- Renderer must not receive full provider base URLs outside a typed Connections
  Settings API from an explicit agent-workbench slice. Main chat and status
  surfaces may receive only redacted host/model summaries.
- Renderer must not call model providers directly.
- Renderer must not spawn child processes.
- Preload must expose a narrow, typed API only.
- Main process owns provider calls and cancellation handles.
- Main process owns OS side effects.
- Electron main owns any persisted current-thread record and file IO. Renderer
  may receive only a safe typed snapshot and remains an in-memory projection.
- Do not import from `runtime/ocaml`.
- Do not use the OCaml runtime outside explicit Electron-main runtime boundary code.
- The runtime-backed chat state path is default-on inside Electron main; `NYX_RUNTIME_CHAT_STATE=0` is only a diagnostic disable.
- Do not expand runtime use into renderer, preload, provider credentials, provider calls, or packaged distribution unless explicitly requested.
- Do not add product features outside `v1 min chat` unless explicitly requested.
- For explicit agent-workbench slices, keep the slice narrow and follow
  `../../docs/next/agent-workbench-task-slices.md`. Do not treat that workstream
  as blanket permission for tools, agents, artifacts, history, browser
  automation, terminal execution, or broader runtime integration.
- Current-thread durability slices may replay only the existing runtime chat
  reducer protocol. They must not add a Thread reducer, new runtime protocol
  messages, runtime startup during snapshot load, or renderer/runtime contact.

## Current Scope

Allowed:

- single-page chat UI
- real streaming output
- one durable current thread owned by Electron main
- an in-memory renderer projection of that current thread
- stop
- retry
- new thread
- plain text messages

Not allowed in this phase:

- settings UI
- model picker UI
- Recent, thread switching, or persistent multi-thread history
- markdown rendering
- tool UI
- agent UI
- plugin UI
- artifact UI

Explicit first agent-workbench workstream additions:

- Connections settings for OpenAI-compatible provider profiles
- encrypted local API key storage owned by Electron main
- default provider/model target resolution with `.env` fallback
- redacted connection status
- real provider test and model refresh
- thread-first copy and renderer-local thread item adapter

Still not allowed in that first workstream:

- Ask/Work toggle
- multi-Agent picker
- tools, MCP, terminal execution, or browser automation
- persistent thread history
- fake artifacts, fake file context, fake activity, or approval cards
- thread IPC
- OCaml thread runtime domain or Electron wiring

Completed second `current-thread-durability` workstream additions:

- one versioned current-thread record owned by Electron main
- one safe current-thread snapshot method under the existing `window.nyx.chat`
  bridge
- renderer hydration while `ChatState` remains an in-memory projection
- main-derived provider context with compatibility validation
- lazy replay through the existing runtime chat state client before the next
  real turn
- interrupted-turn recovery and explicit New thread/Start fresh reset

The current thread survives a complete app restart. Completed, cancelled, and
failed terminal turns restore from the main-owned record; an abandoned pending
turn restores as the existing retryable interrupted failure. Renderer and
runtime state remain rebuildable projections.

Still not allowed in that second workstream:

- Recent, thread lists, thread switching, search, archive, or hidden history
- full thread IPC or `window.nyx.thread`
- OCaml Thread domain, new runtime protocol actions, or provider calls in OCaml
- tools, MCP, activity, approvals, artifacts, terminal, or browser automation
- SQLite, JSONL, conversation encryption, or multi-window synchronization

## Contract Rules

When changing IPC, preload, or cross-process behavior:

1. update `shared` contracts first
2. update preload bridge second
3. update main process handler third
4. update renderer usage last

Do not make renderer and main communicate through untyped stringly payloads when a shared type can exist.

## Naming Boundary

Follow `../../docs/architecture/naming-boundary.md` for desktop TypeScript naming.

Keep the `Nyx` prefix on shared/preload/window/IPC/environment contract names such as `NyxChatRequest`, `NyxChatEvent`, `NyxDesktopApi`, `NyxProviderStatus`, `NYX_CHAT_IPC_CHANNELS`, and `NYX_PROVIDER_IPC_CHANNELS`.

Do not use `Nyx` as an implementation-local ownership prefix inside `electron/main` or `src`. Prefer local names such as `RuntimePathResolution`, `ChatSessionManager`, `ChatState`, and `chatReducer` when the symbol is not a shared, preload, IPC, environment, or product-facing contract.

## Commands

From repository root:

```bash
mise run desktop:dev
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format
mise run desktop:format-check
mise run desktop:check
```

From this directory, package scripts are also available:

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm typecheck:compat
pnpm lint
pnpm format
```

Prefer root `mise run ...` commands in documentation.

## Verification

For TypeScript or React changes:

```bash
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
```

For build-affecting changes:

```bash
mise run desktop:build
```

For Electron-main runtime chat state or protocol boundary changes:

```bash
mise run runtime:chat-state:check
```

For broad desktop changes:

```bash
mise run desktop:check
```

## Style

- Keep UI state transitions explicit and testable.
- Keep renderer state as an in-memory projection; do not make renderer the
  durable current-thread owner.
- Keep side effects near Electron main.
- Prefer small typed contracts over implicit objects.
- Do not over-abstract for future Agent features yet.
