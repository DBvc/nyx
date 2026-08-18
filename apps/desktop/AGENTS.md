# apps/desktop/AGENTS.md

This directory contains the Nyx Electron desktop app and the only user-facing
product surface. Its ordinary scope remains `v1 min chat` plus already-landed
behavior that must be preserved.

A broader agent-workbench workstream is allowed only when the user explicitly
names it or one of its currently executable slices. Read-only use of a
workstream contract for compatibility protection is not new implementation
permission.

## Ownership

This subproject owns:

- Electron main process and OS-facing side effects
- restricted preload bridge
- React renderer and desktop UI
- typed shared desktop contracts
- provider integration, environment variables, and credentials
- durable desktop state, file IO, and local attachment behavior

Directory map:

- `electron/main`: side effects, providers, persistence, validation, and IPC
  handlers.
- `electron/preload`: restricted typed bridge.
- `src`: React renderer and renderer-local projections.
- `shared`: contracts shared by main, preload, and renderer.
- `electron.vite.config.ts`: Electron Vite build configuration.

## Required Reading by Change Area

Before changing an area below, read `Global Rules` in
`../../docs/next/agent-workbench-task-slices.md`, follow its route, and read the
linked workstream status/contracts. Read only that file and linked plan/evidence
unless the task requires more.

- Connections, secrets, provider resolution, thread-first shell:
  `../../docs/next/agent-workbench-foundation-task-slices.md`.
- Current-thread store, hydration, recovery, reset, runtime replay:
  `../../docs/next/current-thread-durability-task-slices.md`.
- Provider mapping and semantic stream normalization:
  `../../docs/next/provider-compatibility-core-task-slices.md`.
- Composer target catalog, selection, and attribution:
  `../../docs/next/composer-target-selection-task-slices.md`.
- Images, authorized local image URLs, import limits, and lifecycle:
  `../../docs/next/context-composer-experiment-task-slices.md` plus its plan.
- Responses protocol and continuation sidecars:
  `../../docs/next/responses-protocol-task-slices.md` plus its plan.
- Text/PDF document attachments:
  `../../docs/next/document-attachments-task-slices.md` plus its plan.
- Thread Library, SQLite, Thread IPC, multi-thread lifecycle, or native-fetch:
  `../../docs/next/multi-thread-library-task-slices.md` plus its plan. E1R
  contract history is non-executable unless that status owner reopens it.

If the matching contract has no executable slice, preserve the landed behavior
and stop before adding broader behavior.

## Stable Process Boundaries

- Renderer must not read environment variables.
- Renderer must not receive provider tokens, stored secrets, raw provider
  configs, resolved base URLs, raw reasoning, unrestricted file paths, or
  main-owned attachment bytes.
- Renderer must not call model providers or spawn child processes.
- Preload exposes a narrow typed API only.
- Shared contracts define all main/preload/renderer payloads.
- Electron main owns provider calls, cancellation, credentials, validation,
  durable state, file IO, and OS side effects.
- Renderer owns only local interaction state and rebuildable projections.
- Do not import from `runtime/ocaml` outside explicit Electron-main runtime
  boundary code.
- Runtime-backed chat state is default-on in Electron main.
  `NYX_RUNTIME_CHAT_STATE=0` is diagnostic only.
- Do not expand runtime use into renderer, preload, providers, credentials,
  packaged distribution, or a Thread domain without an exact slice.

## Implemented Behavior Guards

Ordinary maintenance must preserve these accepted boundaries:

- Connections credentials and resolved provider targets remain main-owned;
  renderer sees only typed redacted views.
- The current chat bridge, durable state, hydration, recovery, reset, and
  runtime replay remain main-authorized; renderer state is not durable truth.
- Provider compatibility and Responses mapping remain main-only. Continuation
  state must not leak into Renderer or OCaml.
- Composer target selection crosses the bridge only as safe ids, availability,
  labels, and attribution. It never mutates the global default.
- Existing image and document input remains main-validated, local, bounded, and
  fail-closed. Landed behavior does not imply support for new file/media types,
  remote upload, or a general Asset service.
- Thread Library code follows the canonical MTL section. Never add synchronous
  Main SQLite fallback, raw-SQL RPC, another database owner, automatic mutation
  replay, or an OCaml Thread reducer.
- A renderer/window lifetime must not silently become ownership of a durable
  Run, Thread, sidecar, or attachment.

When an older baseline conflicts with already-landed workstream behavior,
preserve the landed behavior and consult the routed canonical contract. Do not
rerun completed slices as permission to redesign them.

## Ordinary Scope

The ordinary product supports plain text chat, real streaming, stop, retry, new
thread, and already-landed bounded settings, target, image, document, Responses,
and Thread foundations.

Without an exact named slice, do not add:

- broader persistent history or Thread lifecycle behavior
- new settings, routing, model-policy, or capability UI
- Markdown or rich assistant output
- tools, agents, MCP, plugins, artifacts, terminal, or browser automation
- Projects, Folders, Tags, cloud sync, or another workspace region
- new input formats, remote file ids, or a general attachment/Asset platform
- provider-specific policy inferred from hostname or model name
- new chat/thread IPC namespaces or OCaml protocol messages

## Contract Rules

When changing IPC, preload, or cross-process behavior:

1. update `shared` contracts first
2. update preload bridge second
3. update main handler third
4. update renderer usage last

Do not use untyped string payloads when a shared type can express the contract.
Safe ids and display labels may cross the bridge; credentials, resolved targets,
protocol policy, provider state, and raw file authority stay in main.

## Naming Boundary

Follow `../../docs/architecture/naming-boundary.md`.

Keep `Nyx` on shared/preload/window/IPC/environment contracts and product-facing
names. Do not use it as a main- or renderer-local ownership prefix when the
module path already provides context. Treat shared or public renames as boundary
decisions.

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

Prefer root `mise run ...` commands in documentation.

## Verification

For TypeScript or React changes:

```bash
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
```

Build-affecting changes also require `mise run desktop:build`.

Electron-main runtime state or protocol-boundary changes also require
`mise run runtime:chat-state:check`.

Use `mise run desktop:check` for broad desktop changes.

## Style

- Keep UI state transitions explicit and testable.
- Keep renderer state as a projection, not durable truth.
- Keep side effects near Electron main.
- Prefer small typed contracts over implicit objects.
- Do not pre-build abstractions for future Agent features.
