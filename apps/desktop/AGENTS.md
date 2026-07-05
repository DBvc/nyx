# apps/desktop/AGENTS.md

This directory contains the Nyx Electron desktop app.

The desktop app is currently the only user-facing product surface. It remains scoped to `v1 min chat`.

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

## Directory Map

- `electron/main`: Electron main process and side-effect boundary.
- `electron/preload`: restricted bridge exposed to renderer.
- `src`: React renderer.
- `shared`: TypeScript contracts shared by main, preload, and renderer.
- `electron.vite.config.ts`: Electron Vite build configuration.

## Hard Rules

- Renderer must not read environment variables.
- Renderer must not receive provider tokens, base URLs, or raw provider configs.
- Renderer must not call model providers directly.
- Renderer must not spawn child processes.
- Preload must expose a narrow, typed API only.
- Main process owns provider calls and cancellation handles.
- Main process owns OS side effects.
- Do not import from `runtime/ocaml`.
- Do not use the OCaml runtime outside explicit Electron-main runtime boundary code.
- The runtime-backed chat state path is default-on inside Electron main; `NYX_RUNTIME_CHAT_STATE=0` is only a diagnostic disable.
- Do not expand runtime use into renderer, preload, provider credentials, provider calls, or packaged distribution unless explicitly requested.
- Do not add product features outside `v1 min chat` unless explicitly requested.

## Current Scope

Allowed:

- single-page chat UI
- real streaming output
- temporary in-memory conversation
- stop
- retry
- new chat
- plain text messages

Not allowed in this phase:

- settings UI
- model picker UI
- persistent history
- markdown rendering
- tool UI
- agent UI
- plugin UI
- artifact UI

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
- Keep renderer state in memory for current scope.
- Keep side effects near Electron main.
- Prefer small typed contracts over implicit objects.
- Do not over-abstract for future Agent features yet.
