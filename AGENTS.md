# AGENTS.md

Nyx is a workspace for a personal AI client and a planned typed runtime core.

Current default product scope is still `v1 min chat`. Do not expand the
product into a general AI workbench during structural or runtime migration
work.

There is one explicit exception: when the user asks to execute the
agent-workbench workstream or a named slice from
`docs/next/agent-workbench-task-slices.md`, follow that gated workstream for the
requested slice only. Do not use the agent-workbench documents as permission to
broaden unrelated tasks.

## Project Layout

- `apps/desktop`: Electron desktop app.
- `runtime/ocaml`: OCaml runtime core skeleton. Electron main uses a default-on runtime-backed chat state path while provider integration and UI remain in the desktop app.
- `docs/architecture`: architecture notes and runtime boundary documents.
- `docs/v1-min-chat-implementation-plan.md`: current product scope source of truth.
- `docs/next/agent-workbench-task-slices.md`: explicit workstream gate for
  thread-first Agent Workbench foundation, current-thread durability, and
  provider compatibility core tasks, plus the bounded Composer target-selection
  and Context Composer experiment workstreams.

## Source of Truth

For ordinary work, when product scope conflicts appear, follow this order:

1. `docs/v1-min-chat-implementation-plan.md`
2. `docs/architecture/*.md` when present
3. `README.md`
4. `PRD.md`
5. `DESIGN.md`

For explicit agent-workbench workstream tasks only, follow this order:

1. `docs/next/agent-workbench-task-slices.md`
2. `docs/next/agent-workbench-direction.md`
3. `docs/next/provider-adapter-direction.md`
4. `docs/next/provider-connections-implementation.md`
5. `docs/v1-min-chat-implementation-plan.md` as the completed baseline whose
   existing behavior must be preserved

The agent-workbench task slices in this repository supersede earlier external
draft task ordering. Do not follow older AGW-00..13 draft ordering unless a
current repository document reintroduces it.

`docs/v1-min-chat-implementation-plan.md` is the completed baseline. The
implemented additions recorded in this file and in
`docs/next/agent-workbench-task-slices.md` supersede conflicting baseline lines
only for those exact additions. Ordinary work must preserve the implemented
Connections, thread-first, current-thread durability, and provider compatibility
core behavior, plus the bounded Composer target-selection behavior, without
using them as permission to broaden product scope.

The current desktop product remains a minimal single-page chat client:

- plain text messages
- real streaming
- one Electron-main-owned durable current thread
- renderer-local in-memory projection of that current thread
- stop
- retry
- new thread

Still out of scope:

- Recent, thread switching, or persistent multi-thread history
- settings UI
- model routing or picker UI beyond the bounded Composer target selector
- markdown rendering
- tools
- agents
- plugins
- artifacts
- cloud sync
- multimodal features

Multimodal behavior remains out of scope for ordinary work. Context Composer
E0 stopped on main-thread encoding; E0B then stopped because Chromium's native
JPEG output violated the failed v1.8 candidate's sealed metadata allowlist.
The user approved only the bounded E0C exact-ICC feasibility gate. E0C then
stopped because visible 12×1080p and 8×1080p DOM grids exceeded the fixed
whole-process memory stop line. E0D later proved the preview-only message grid
but stopped because its temporary fresh-byte/Blob/object-URL full-open path
exceeded the same memory line. Neither result is product implementation
permission or proof that derived previews are generally infeasible. E1-E5
remained blocked at the E0D stop. The user approved only E0E: an OS-temp
feasibility gate for one stable, main-authorized, opaque local image URL that
streams a canonical file without sending JS-owned full bytes or paths through
preload/IPC. E0E then
stopped because Chromium removed a non-default explicit port before the standard
custom-protocol handler, so the sealed exact-route authorization rule could not
reject it. E0F then passed its reviewed OS-temp gate: Chromium's canonical
request identity gave canonical/alias native-cache reuse, main revocation still
invalidated the warmed URL, Renderer byte-read paths stayed blocked, three
isolated preview/full-view runs stayed below the fixed memory line, and the same
build loaded from `app.asar`. This is feasibility evidence, not product
implementation permission by itself. The later v3.0 stable-image-URL plan passed
independent review as `RC-V3-PLAN-03`. E1 completed at `1bf91cf` and passed
`RC-E1-CODE-02`; E2 completed at `36e32e6` and passed `RC-E2-CODE-03`. E3 is
now the only executable slice, and E4-E5 remain blocked. Provider image mapping
is limited to E3; Composer UI remains unauthorized until E4.

For the explicit first agent-workbench workstream, only the following additions
are allowed:

- Connections settings for OpenAI-compatible provider profiles
- encrypted local API key storage owned by Electron main
- default provider/model target resolution with `.env` fallback
- redacted connection status
- real provider test and model refresh
- thread-first copy and renderer-local thread item adapter

Still out of scope for that first workstream:

- tools
- MCP
- terminal or browser automation
- permission approval cards
- artifacts
- persistent thread history
- projects or file context
- details drawer
- thread IPC replacing chat IPC
- OCaml thread runtime domain or Electron wiring

The completed second `current-thread-durability` workstream added only:

- one Electron-main-owned durable current thread record
- a narrow typed current-thread snapshot on the existing chat bridge
- renderer hydration from that safe snapshot while renderer state remains an
  in-memory projection
- main-derived provider messages with compatibility validation against the
  existing renderer request payload
- lazy replay into the existing runtime chat reducer before the next real turn
- interrupted-turn recovery and explicit New thread/Start fresh reset

This second workstream is not persistent thread history. Still out of scope:

- Recent, thread lists, thread switching, search, archive, or hidden history
- full thread IPC replacing chat IPC
- OCaml thread runtime domain or new runtime protocol messages
- activity, approvals, artifacts, tools, MCP, terminal, or browser automation
- SQLite, JSONL, conversation encryption, or multi-window synchronization

The completed third `provider-compatibility-core` workstream added only:

- one Electron-main-only resolved chat target that preserves provider identity
- one pure OpenAI-compatible request mapping with current generic request parity
- one small normalized text/reasoning-activity/finish/error stream
- provider stream fixtures and explicit terminal-response semantics

This completed third workstream does not authorize provider-specific request
parameters, an adapter registry, capability profiles, Connections schema
changes, Settings or model-picker UI, new shared/IPC contracts, raw reasoning
exposure or persistence, renderer/OCaml provider integration, tools, or
structured output.

The implemented D1-D4 slices of the explicit fourth
`composer-target-selection` workstream added only:

- one redacted catalog of configured selectable targets on the existing
  Connections overview bridge
- one renderer-local Composer target draft that never owns credentials or raw
  provider configuration
- one required safe target selection on each chat request, validated and
  resolved by Electron main
- one version-2 current-thread record that preserves the latest committed
  selection and safe per-turn target attribution
- one compact Composer target selector and compact assistant-response
  attribution
- deterministic restart, New thread, Retry, unavailable-target, and `.env`
  fallback behavior defined by the D slices

The required automated D5 acceptance passes. Interactive two-target provider,
streaming-switch, failure/recovery, and restart acceptance remains pending and
is recorded in `docs/next/composer-target-selection-runthrough.md`.

This fourth workstream does not authorize changing the Connections persisted
schema or global default when the Composer selection changes. It also does not
authorize provider-specific parameters, capability profiles, an adapter
registry, attempt history, persistent multi-thread history, a new IPC channel,
or provider identity in OCaml. Safe provider/model selection ids and display
labels may cross the existing typed desktop bridge; resolved base URLs,
credentials, protocols, and provider execution remain Electron-main-only.

The E0 scope gate for the explicit fifth `context-composer-experiment`
workstream did not pass. A high-entropy image at the minimum supported size
blocked Electron main for about one second, so the synchronous main-owned
canonicalization direction is rejected.

E0B also did not pass. In the recorded environment, the OS-temp
production-shape Vite Worker harness loaded its static Worker in dev, build,
and `app.asar`; this was not production Renderer integration. Chromium's JPEG
encoder emitted an ICC APP2 segment that the failed v1.8 candidate's sealed
main allowlist correctly rejected. The old v1.8 Worker/JPEG/allowlist design,
every numeric limit, and its E1-E5 slice and file lists are historical candidate
material only: they are non-operative and are not implementation permission.
The candidate-limit table in
`docs/next/context-composer-experiment-runthrough.md` is the status reference;
no capacity limit of any kind is frozen.

E0F passed its bounded feasibility gate and independent review. The later v3.0
stable-image-URL plan passed `RC-V3-PLAN-03`; E1 completed at `1bf91cf` and
passed `RC-E1-CODE-02`; E2 completed at `36e32e6` and passed
`RC-E2-CODE-03`. E3 is the only executable slice, and E4-E5 remain blocked by
their ordered prerequisites. Electron main remains
authoritative for validation, metadata policy, file IO, durable ownership,
target resolution, Provider mapping, and safe errors. Product changes are
authorized only inside the named active slice; no scope expansion is allowed.

E0 through E0F evidence is recorded in
`docs/next/context-composer-experiment-runthrough.md`.

This fifth workstream does not authorize PDF/doc/audio/video input, remote file
upload, a general Asset service, arbitrary content parts, capability inference
or registry, assistant rich output, Markdown/HTML/Artifact/Generative UI
rendering, multi-thread history, a new IPC namespace, or new OCaml protocol
messages. Provider credentials, resolved targets, file IO, and any future
accepted image bytes remain Electron-main-owned.

## Workspace Boundary

`apps/desktop` owns:

- Electron main, preload, renderer
- desktop UI
- current provider integration
- environment variables
- provider credentials
- OS side effects
- current v1 min chat behavior
- the current-thread durable record, recovery, and explicit reset lifecycle

`runtime/ocaml` owns:

- typed runtime domain model
- runtime event model
- future agent state machine
- future tool scheduling semantics
- future policy and capability model
- replayable runtime tests

Current runtime scope includes a Dune/opam project, library modules, a CLI entrypoint, runtime tests, a local protocol scaffold for runtime verification, and a default-on Electron-main-only runtime-backed chat state path. `NYX_RUNTIME_CHAT_STATE=0` exists only as a diagnostic disable. Provider calls, credentials, renderer state, preload contracts, and UI remain outside the runtime.

## Naming Boundary

Follow `docs/architecture/naming-boundary.md` for TypeScript naming in the desktop app.

`Nyx` is a product and boundary marker, not a general implementation ownership prefix. Keep `Nyx` on product-level shared contracts, preload/window contracts, IPC constants, environment variable names, and user/product-facing brand text. Do not add `Nyx` to Electron main or renderer implementation-local helpers, state, reducers, or tests when the file path and module already provide ownership.

Before naming, renaming, or planning runtime-boundary work, check the naming boundary document. If a candidate name appears to cross shared, preload, IPC, environment, or product-facing boundaries, treat it as a boundary decision and re-plan instead of mechanically renaming it.

## Hard Rules

- Do not change product behavior while doing structural migration.
- Do not implement new or broader Electron <-> OCaml communication unless the task explicitly asks for it.
- Do not introduce FFI.
- Do not let renderer read environment variables.
- Do not let renderer access provider credentials.
- Do not move provider tokens into OCaml.
- Do not add Rust, Swift, Tauri, mobile, or server projects in this phase.
- Do not treat current-thread durability as permission to add multi-thread
  history, thread switching, or a parallel Thread reducer.
- Do not commit generated directories such as `node_modules`, `out`, `dist`, `_build`, or `_opam`.
- Prefer `git mv` for file moves.
- Use relative documentation links. Do not write local absolute paths such as `/Users/...`.

## Tooling

Root tooling is managed by `mise`.

Use:

```bash
mise install
pnpm install
```

OCaml compiler, opam setup, and runtime tasks are available for `runtime/ocaml`.

## Common Commands

Desktop:

```bash
mise run desktop:dev
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format
mise run desktop:format-check
```

Root npm scripts are compatibility aliases for workspace checks. Prefer explicit `mise run desktop:*` and `mise run runtime:*` commands in new docs.

Runtime:

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

Root runtime harness scripts:

```bash
./scripts/audit-ocaml-runtime.sh
./scripts/check-runtime.sh
```

## Verification Rules

For desktop-only changes, run:

```bash
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
```

For runtime-only changes, run:

```bash
mise run runtime:build
mise run runtime:test
mise run runtime:format-check
```

For runtime CLI or protocol changes, also run:

```bash
mise run runtime:ping
```

For runtime-backed chat state or Electron-main/runtime boundary changes, also run:

```bash
mise run runtime:chat-state:check
```

When the root runtime harness scripts exist and apply to the change, prefer:

```bash
./scripts/audit-ocaml-runtime.sh
./scripts/check-runtime.sh
```

For future cross-boundary changes, first confirm the relevant `runtime:*`, `desktop:*`, or workspace-level `mise` tasks exist. `mise run check` includes the runtime-backed chat state integration check.

## Subproject Instructions

Before editing `apps/desktop`, read:

```text
apps/desktop/AGENTS.md
```

Before editing `runtime/ocaml`, read:

```text
runtime/ocaml/AGENTS.md
```

## Commit Discipline

Each commit should do one thing:

- move project structure
- add tooling
- add runtime skeleton
- update docs
- add protocol
- wire communication

Do not mix structural moves with behavior changes.

After every meaningful step:

1. run the relevant verification commands
2. inspect `git diff`
3. commit only verified changes
