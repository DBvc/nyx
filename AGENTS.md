# AGENTS.md

Nyx is a workspace for a personal AI client and a planned typed runtime core.

Default product scope remains `v1 min chat`. Structural, maintenance, and
runtime work must not turn it into a general AI workbench. A broader workstream
is allowed only when the user explicitly names that workstream or one of its
currently executable slices.

## Project Layout

- `apps/desktop`: Electron desktop app and the only user-facing product.
- `runtime/ocaml`: typed runtime core and replayable chat-state projection.
- `docs/architecture`: stable architecture and boundary notes.
- `docs/v1-min-chat-implementation-plan.md`: ordinary product baseline.
- `docs/next/agent-workbench-task-slices.md`: canonical execution gate and
  current status owner for named workstreams until its reviewed split lands.
- `docs/next/*-technical-plan.md`: reviewed design for its named workstream.
- `docs/next/*-runthrough.md`: evidence and history; never implementation
  permission by itself.

## Source of Truth

For ordinary work, resolve conflicts in this order:

1. `docs/v1-min-chat-implementation-plan.md`
2. `docs/architecture/*.md`
3. `README.md`
4. `PRD.md`
5. `DESIGN.md`

For a named agent-workbench workstream:

1. `docs/next/agent-workbench-task-slices.md`
2. the named workstream technical plan, when present
3. direction and implementation notes linked by that workstream
4. the ordinary baseline, whose unaffected behavior must be preserved

Repository task slices supersede older external draft ordering. Technical plans
describe a design; runthroughs preserve evidence. Neither grants execution
scope. Only the canonical task contract may identify an executable slice.

Reading a workstream contract to protect landed behavior does not authorize new
work from that contract. New work still requires an explicit user request and a
currently executable exact slice.

## Required Workstream Routing

Before changing an area below, read `Global Rules`, `Workstream Status`, and the
matching section in `docs/next/agent-workbench-task-slices.md`. Read only the
relevant section and its linked plan/evidence unless the task requires more.

- Connections, secret storage, provider resolution, or thread-first shell:
  foundation `A` sections.
- Durable current thread, hydration, recovery, reset, or runtime replay: `B`
  sections.
- Provider request mapping or semantic stream normalization: `C` sections.
- Composer target selection or assistant target attribution: `D` sections.
- Image input, image storage, authorized image URLs, or image lifecycle: `E`
  sections and the Context Composer plan.
- OpenAI Responses protocol or continuation sidecars: `R` sections and the
  Responses technical plan.
- Text/PDF document attachment handling: `F` sections and the document
  attachments plan.
- Thread Library, SQLite, Thread IPC, multi-thread lifecycle, or native-fetch
  gates: `MTL` sections and the Multi-Thread Library plan.

If the relevant section has no executable slice, preserve existing behavior and
stop before adding broader behavior.

## Ordinary Product Boundary

The ordinary desktop product remains a minimal single-page chat client with:

- plain text chat and real streaming
- stop, retry, and new thread
- Electron-main-owned durable state
- renderer-local projections
- already-landed Connections, provider compatibility, Responses, target
  selection, image, and document behavior within their accepted boundaries

Unless an exact named slice says otherwise, do not add:

- new persistent history, Recent, or Thread switching behavior
- settings or routing UI beyond already-landed Connections and target selection
- Markdown or rich assistant output
- tools, agents, MCP, plugins, artifacts, terminal, or browser automation
- cloud sync, Projects, Folders, or Tags
- new media/document types or a general Asset service
- a new OCaml Thread domain or provider protocol

Already-landed workstream behavior is part of the compatibility baseline. Do
not remove or reinterpret it merely because an older baseline document excludes
it. Use the required routing above to identify the exact preserved boundary.

## Workspace Boundary

`apps/desktop` owns:

- Electron main, preload, renderer, and desktop UI
- provider integration, environment variables, and credentials
- OS side effects, file IO, and durable desktop state
- the current typed bridges and already-landed local attachment behavior

`runtime/ocaml` owns:

- typed runtime domain and event models
- replayable runtime tests and local protocol verification
- future agent, tool scheduling, policy, and capability semantics

The runtime-backed chat-state path is default-on and Electron-main-only.
`NYX_RUNTIME_CHAT_STATE=0` is a diagnostic disable. Provider calls, credentials,
preload contracts, renderer state, Thread Library ownership, and UI stay outside
the runtime unless an exact slice explicitly changes that boundary.

## Stable Safety Rules

- Do not change product behavior during a structural migration.
- Renderer must not read environment variables, credentials, raw provider
  configs, resolved targets, unrestricted file paths, or main-owned bytes.
- Renderer must not call providers or spawn child processes.
- Preload exposes only narrow typed APIs; shared contracts define cross-process
  payloads.
- Electron main owns provider calls, cancellation, credentials, validation,
  persistence, file IO, and OS side effects.
- Renderer state remains a rebuildable projection, never a second durable
  owner.
- Provider identity, protocol selection, continuation state, and raw reasoning
  remain Electron-main-only.
- Composer selection may cross the bridge only as safe ids and labels. It must
  not mutate the global Connections default.
- Existing image/document input remains main-authorized and fail-closed. Do not
  infer support for new formats or remote upload from landed local behavior.
- Thread Library work must follow its canonical section. Never add synchronous
  Main SQLite fallback, raw-SQL IPC, another database owner, or an OCaml Thread
  reducer.
- Do not introduce FFI, Rust, Swift, Tauri, mobile, or server projects here.
- Do not commit generated directories such as `node_modules`, `out`, `dist`,
  `_build`, or `_opam`.
- Use relative documentation links. Do not add machine-local absolute paths.

## Naming Boundary

Follow `docs/architecture/naming-boundary.md` for desktop TypeScript naming.

Keep `Nyx` on product-level shared contracts, preload/window contracts, IPC
constants, environment variables, and user-facing brand text. Do not add it to
main- or renderer-local helpers when the module path already establishes
ownership. Treat any rename across shared, preload, IPC, environment, or
product-facing boundaries as a boundary decision, not a mechanical cleanup.

## Tooling

Root tooling is managed by `mise`:

```bash
mise install
pnpm install
```

Prefer explicit `mise run desktop:*` and `mise run runtime:*` commands in new
documentation.

Desktop checks:

```bash
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run desktop:build
```

Runtime checks:

```bash
mise run runtime:build
mise run runtime:test
mise run runtime:format-check
mise run runtime:ping
mise run runtime:chat-state:check
```

For desktop-only changes, run typecheck, compatibility typecheck, and lint. For
runtime-only changes, run build, test, and format-check. Runtime CLI/protocol
changes also require `runtime:ping`; runtime-backed chat-state or Electron/runtime
boundary changes also require `runtime:chat-state:check`. Use the root runtime
harness scripts when they apply.

Documentation-only structural changes require:

```bash
git diff --check
mise run docs:check
mise run format-check
```

## Subproject Instructions

Before editing `apps/desktop`, read `apps/desktop/AGENTS.md`.

Before editing `runtime/ocaml`, read `runtime/ocaml/AGENTS.md`.

Before editing `docs/next`, read `docs/next/AGENTS.md` when it exists.

## Commit Discipline

Each commit should do one thing. Do not mix structural moves with behavior
changes. After every meaningful step:

1. run the relevant verification commands
2. inspect `git diff`
3. commit only verified changes
