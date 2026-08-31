# Nyx

Nyx is a personal desktop AI chat client.

The repository is now organized as a workspace, but the default product scope
remains intentionally narrow: `v1 min chat`. The completed baseline is a
minimal, real, streaming desktop chat loop, not a general AI workbench.

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
- Connections profiles with main-owned encrypted credentials and `.env`
  fallback
- one main-only provider compatibility path for generic text, GLM-style
  reasoning activity, explicit finish reasons, and safe stream failures
- plain-text chat with `Stop`, `Retry`, and `New thread`
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

Electron main owns durable desktop chat and Thread Library state. Renderer state
remains a rebuildable projection loaded through narrow typed bridges. The OCaml
runtime remains a rebuildable semantic projection for the main-side chat-state
path; it does not own the Thread domain.

## Current Product Scope

The completed baseline source of truth is
[docs/v1-min-chat-implementation-plan.md](./docs/v1-min-chat-implementation-plan.md).
Implemented gated workstreams linked from
[docs/next/agent-workbench-task-slices.md](./docs/next/agent-workbench-task-slices.md)
are narrow, additive sources of truth for their exact shipped behavior. They
supersede conflicting baseline statements only for those implemented additions
and do not broaden unrelated work.

If [PRD.md](./PRD.md), [DESIGN.md](./DESIGN.md), or older background docs disagree with the min-chat plan, follow the min-chat plan.

In scope:

- single-page desktop chat UI
- plain text messages
- real model traffic through the Electron main process
- real streaming output
- durable local Threads with switching, Search, reversible Archive/Trash, and
  restart recovery
- `Stop`, `Retry`, and `New thread`
- Connections profiles and explicit Composer target selection
- bounded local image and text/PDF document input
- the landed OpenAI Responses compatibility path
- provider secrets kept in Electron main only

Out of scope for this phase:

- settings or routing UI beyond landed Connections and target selection
- Markdown or code highlighting
- tools, agents, MCP, plugins, artifacts, terminal, or browser automation
- Projects, Folders, Tags, team workflows, or cloud sync
- new media/document types, remote file upload, or a general Asset service
- an OCaml Thread domain or provider integration inside the runtime

## Implemented Gated Workstreams

Explicit agent-workbench workstreams are routed through
[docs/next/agent-workbench-task-slices.md](./docs/next/agent-workbench-task-slices.md).
Each linked workstream contract owns its current status. The contracts applied
only when the user requested their named slices. Ordinary work still follows
the `v1 min chat` source of truth above.

The landed compatibility baseline includes Connections, current-thread
durability, provider compatibility, Composer target selection, Responses,
bounded local image/document input, and the Multi-Thread Library. This is a
human overview, not a second status ledger. Follow the routed contract for the
exact current boundary, evidence, and execution permission.

## Boundaries

`apps/desktop` owns:

- Electron main, preload, and renderer
- desktop UI
- current provider integration
- environment variables and provider credentials
- OS-facing side effects
- current `v1 min chat` behavior
- durable desktop chat and Thread Library state

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

Root tooling is managed through `mise` tasks. `mise` manages Node and pnpm for the workspace, `packageManager` keeps Corepack-based environments such as CI on the same pnpm version, and `opam` is expected to be available on the machine.

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
- For explicit agent-workbench workstream tasks, follow
  [agent-workbench-task-slices.md](./docs/next/agent-workbench-task-slices.md)
  for that slice only.
- Do not implement new or broader Electron <-> OCaml communication as part of structural docs or setup work.
- Renderer code must not read environment variables or provider credentials.
- Provider calls and cancellation handles belong in Electron main.
- Runtime code should stay pure and tiny until a concrete runtime behavior requires more.
- Do not add tools, agents, plugin UI, broader persistence, or settings UI
  outside an explicit agent-workbench slice that allows it.
