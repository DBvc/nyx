# AGENTS.md

Nyx is a workspace for a personal AI client and a planned typed runtime core.

Current product scope is still `v1 min chat`. Do not expand the product into a general AI workbench during structural or runtime migration work.

## Project Layout

- `apps/desktop`: Electron desktop app.
- `runtime/ocaml`: OCaml runtime core skeleton. It exists and is intentionally isolated from Electron.
- `docs/architecture`: architecture notes and runtime boundary documents.
- `docs/v1-min-chat-implementation-plan.md`: current product scope source of truth.

## Source of Truth

When product scope conflicts appear, follow this order:

1. `docs/v1-min-chat-implementation-plan.md`
2. `docs/architecture/*.md` when present
3. `README.md`
4. `PRD.md`
5. `DESIGN.md`

The current desktop product remains a minimal single-page chat client:

- plain text messages
- real streaming
- temporary in-memory conversation
- stop
- retry
- new chat

Still out of scope:

- persistent history
- settings UI
- model picker UI
- markdown rendering
- tools
- agents
- plugins
- artifacts
- cloud sync
- multimodal features

## Workspace Boundary

`apps/desktop` owns:

- Electron main, preload, renderer
- desktop UI
- current provider integration
- environment variables
- provider credentials
- OS side effects
- current v1 min chat behavior

`runtime/ocaml` owns:

- typed runtime domain model
- runtime event model
- future agent state machine
- future tool scheduling semantics
- future policy and capability model
- replayable runtime tests

Current runtime scope includes a Dune/opam project, library modules, a CLI entrypoint, runtime tests, and a local protocol scaffold for runtime verification. Electron is still not wired to the runtime.

## Hard Rules

- Do not change product behavior while doing structural migration.
- Do not implement Electron <-> OCaml communication unless the task explicitly asks for it.
- Do not introduce FFI.
- Do not let renderer read environment variables.
- Do not let renderer access provider credentials.
- Do not move provider tokens into OCaml.
- Do not add Rust, Swift, Tauri, mobile, or server projects in this phase.
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

When the root runtime harness scripts exist and apply to the change, prefer:

```bash
./scripts/audit-ocaml-runtime.sh
./scripts/check-runtime.sh
```

For future cross-boundary changes, first confirm the relevant `runtime:*`, `desktop:*`, or workspace-level `mise` tasks exist.

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
