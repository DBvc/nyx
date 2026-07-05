# Nyx

Nyx is a personal desktop AI chat client.

The repository is now organized as a workspace, but the current product scope remains intentionally narrow: `v1 min chat`. The goal of this phase is still a minimal, real, streaming desktop chat loop, not a general AI workbench.

## Workspace

Nyx is split into two first-class subprojects:

- `apps/desktop`: the current Electron desktop app.
- `runtime/ocaml`: an independent OCaml runtime core skeleton.

The desktop app is the only user-facing product surface right now. The OCaml
runtime exists as a foundation for later typed Agent/runtime work. Electron
main now uses the runtime-backed chat state reducer by default for the desktop
chat path, with `NYX_RUNTIME_CHAT_STATE=0` reserved as a diagnostic disable.

Current architecture notes:

- [docs/architecture/workspace-boundary.md](./docs/architecture/workspace-boundary.md)
- [docs/architecture/runtime-protocol.md](./docs/architecture/runtime-protocol.md)

## Desktop Chat Milestone

The current desktop milestone has a real, manually verified `v1 min chat` loop:

- redacted provider setup status in the renderer
- OpenAI-compatible provider streaming through Electron main
- plain-text in-memory chat with `Stop`, `Retry`, and `New chat`
- unit coverage for chat reducer lifecycle, provider status parsing, provider
  streaming helpers, and chat presenter helpers
- real provider runthrough recorded in
  [docs/next/llm-chat-runthrough.md](./docs/next/llm-chat-runthrough.md)

Milestone details and code entry points are recorded in
[docs/next/desktop-chat-milestone.md](./docs/next/desktop-chat-milestone.md).

Important boundary: the renderer still does not read environment variables,
provider tokens, full provider URLs, or raw provider configs. Provider calls and
cancellation handles stay in Electron main. The OCaml runtime owns only the
main-side chat state reducer semantics for this path; it does not call
providers, read provider env, own credentials, or talk to the renderer.

## Current Product Scope

The active source of truth is [docs/v1-min-chat-implementation-plan.md](./docs/v1-min-chat-implementation-plan.md).

If [PRD.md](./PRD.md), [DESIGN.md](./DESIGN.md), or older background docs disagree with the min-chat plan, follow the min-chat plan.

In scope:

- single-page desktop chat UI
- plain text messages
- real model traffic through the Electron main process
- real streaming output
- temporary in-memory multi-turn conversation
- `Stop`
- `Retry`
- `New chat`
- environment-based provider configuration
- provider secrets kept in Electron main only

Out of scope for this phase:

- persistent conversation history
- settings UI
- model picker UI
- Markdown or code highlighting
- tools
- agents
- plugins
- artifacts
- cloud sync
- multimodal features

## Boundaries

`apps/desktop` owns:

- Electron main, preload, and renderer
- desktop UI
- current provider integration
- environment variables and provider credentials
- OS-facing side effects
- current `v1 min chat` behavior

`runtime/ocaml` owns:

- runtime domain types
- runtime event model
- future state transitions
- future tool scheduling semantics
- future policy and capability model
- replayable runtime tests

Electron main is the only desktop process that may communicate with OCaml, over
stdio/NDJSON. Current desktop use is limited to runtime health/protocol
verification and the default runtime-backed chat state path in Electron main.
Set `NYX_RUNTIME_CHAT_STATE=0` only for diagnostic fallback. The renderer must
never talk to the OCaml runtime directly.

## Tooling

Root tooling is managed through `mise` tasks. `mise` currently manages Node for the workspace; `pnpm` and `opam` are expected to be available on the machine.

Initial setup:

```bash
mise install
pnpm install
mise run runtime:setup
```

The runtime setup creates a local opam switch under:

```text
runtime/ocaml/_opam
```

Do not commit generated directories such as `node_modules`, `out`, `dist`, `_build`, or `_opam`.

## Local Provider Env

Local provider credentials are kept in a root `.env` file, using
[.env.example](./.env.example) as the template:

```bash
NYX_API_BASE_URL=
NYX_API_TOKEN=
NYX_MODEL=
# Optional diagnostic override:
# NYX_RUNTIME_CHAT_STATE=0
```

The root `.env` file is ignored by Git. `mise run desktop:dev` automatically
loads it before starting the desktop app, so the renderer still does not read
environment variables or receive provider secrets. Unless
`NYX_RUNTIME_CHAT_STATE=0` is set for diagnostics, the dev task also prepares
the local OCaml runtime install output before launching Electron.

## Common Commands

Workspace:

```bash
mise run check
mise run build
mise run format
mise run format-check
```

Desktop:

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

OCaml runtime:

```bash
mise run runtime:setup
mise run runtime:build
mise run runtime:test
mise run runtime:format
mise run runtime:format-check
mise run runtime:ping
mise run runtime:check
mise run runtime:chat-state:check
```

Root `pnpm` scripts are compatibility aliases for the same `mise` tasks:

```bash
pnpm dev
pnpm build
pnpm check
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm typecheck:compat
```

## Verification

For desktop-only changes:

```bash
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
```

For runtime-only changes:

```bash
mise run runtime:build
mise run runtime:test
mise run runtime:format-check
```

For cross-boundary, tooling, or structural changes:

```bash
mise run check
mise run build
```

## Development Rules

- Keep the product inside `v1 min chat` unless a task explicitly changes scope.
- Do not implement new or broader Electron <-> OCaml communication as part of structural docs or setup work.
- Renderer code must not read environment variables or provider credentials.
- Provider calls and cancellation handles belong in Electron main.
- Runtime code should stay pure and tiny until a concrete runtime behavior requires more.
- Do not add tools, agents, plugin UI, persistence, or settings UI during this phase.
