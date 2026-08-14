# Agent Workbench Task Slices

Status: Source of truth for explicit agent-workbench workstreams.

This document supersedes earlier external AGW-00..13 draft ordering. Do not
follow earlier draft task names, milestone cuts, placeholder APIs, or runtime
thread-domain steps unless they are reintroduced here.

These slices apply only when the user explicitly asks to execute the
agent-workbench workstream or one of these slices. Ordinary Nyx work remains
governed by [v1-min-chat-implementation-plan.md](../v1-min-chat-implementation-plan.md).

## Global Rules

Always follow:

```text
AGENTS.md
apps/desktop/AGENTS.md
runtime/ocaml/AGENTS.md when editing runtime/ocaml
```

Unless a slice explicitly says otherwise, do not implement:

```text
Ask / Work toggle
multi-Agent picker
planner/executor/reviewer model routing UI
tools
MCP
terminal execution
browser automation
persistent thread history
fake artifacts
fake file context
approval cards
details drawer
thread IPC
OCaml thread runtime domain
renderer access to stored secrets
renderer direct provider calls
renderer direct OCaml communication
OCaml provider calls or OS side effects
```

The named `multi-thread-library` workstream below is the sole exception for
persistent Thread history, Thread switching, a typed Thread Library IPC, and
SQLite. Its exception applies only inside the currently executable qualified
slice. It is not permission to add projects, folders, tags, tools, agents,
cloud sync, a new OCaml Thread domain, or unrelated workbench behavior.

Use relative documentation links. Do not add local absolute paths.

## Workstream Status

- `A0` through `A7` define the completed first foundation workstream. Do not
  rerun them as permission to redesign existing behavior.
- `B0` through `B5` define the completed second
  `current-thread-durability` workstream. Do not rerun them as permission to
  broaden persistence behavior. Their implemented boundary is one durable
  current thread, not a thread collection.
- The B workstream permits one durable current thread only. It does not permit
  persistent thread history, a thread collection, or a parallel Thread runtime
  domain.
- `C0` through `C4` define the completed third
  `provider-compatibility-core` workstream. Do not rerun them as permission to
  add provider-specific policy or a general adapter platform.
- The C workstream extracts one Electron-main-only OpenAI-compatible
  compatibility path. It does not authorize a general adapter platform,
  provider-specific request policy, schema/UI expansion, or a new renderer or
  OCaml provider boundary.
- `D0` defines the approved scope gate for the fourth
  `composer-target-selection` workstream. `D1` through `D4` are implemented and
  passed the required automated D5 checks on 2026-08-07. D5 documentation is
  synchronized, while its interactive provider/restart acceptance remains
  pending in
  [composer-target-selection-runthrough.md](./composer-target-selection-runthrough.md).
  The named D workstream or slice still requires an explicit user request.
- The D workstream permits safe target selection and attribution only. It does
  not authorize global-default mutation, a Connections store migration,
  provider-specific policy, automatic routing, attempt history, multi-thread
  history, or a new renderer/OCaml provider boundary.
- `E0` stopped on 2026-08-09 after a representative high-entropy fixture
  disproved synchronous Electron-main canonicalization. `E0B` then stopped
  because Chromium's canonical JPEG contained an ICC APP2 segment forbidden by
  the failed v1.8 candidate's sealed metadata allowlist. User-approved `E0C`
  proved the exact ICC candidate, then stopped because visible 12×1080p and
  8×1080p grids exceeded the fixed whole-process memory line. User-approved
  `E0D` proved the preview-only grid, then stopped when its temporary
  fresh-byte/Blob/object-URL full-open path exceeded the same line. User-approved
  `E0E` then stopped because Chromium removed a
  non-default explicit port before the standard custom-protocol handler, so its
  exact-route authorization rule could not reject the alias. User-approved
  `E0F` then passed post-normalization identity, native-cache revocation,
  security, memory, and `app.asar` loading in OS temp. The later v3.0 plan passed
  `RC-V3-PLAN-03`. E1 then completed at `1bf91cf` and passed
  `RC-E1-CODE-02`; E2 completed at `36e32e6` and passed `RC-E2-CODE-03`. E3 is
  complete at `7677868` and passed `RC-E3-CODE-02`; E4 completed at `b13d3b8`
  and passed `RC-E4-CODE-02`. E5 stopped at `RC-E5-EVIDENCE-01` when Chromium
  erased credentials before the product handler. The user approved policy A;
  the v3.1 canonical-identity amendment passed `RC-E5-PLAN-A-02`. E5 then stopped
  at the fresh-process 4K memory gate; `RC-E5-4K-MEMORY-01` returned
  `VALID_STOP`. The user then approved only the bounded E4M candidate; its v3.2
  amendment passed `RC-E4M-PLAN-02`, but the first valid 4K repetition still
  measured +299.828 MiB. `RC-E4M-EVIDENCE-01` returned `VALID_STOP`, the
  uncommitted Worker change was reversed. The user then approved the bounded
  E4R 2048-edge proportional-resize candidate; its revised plan passed
  `RC-E4R-PLAN-03`, but E4R stopped at its oversized EXIF-orientation gate and
  its uncommitted product diff was reversed. The user then approved bounded E4L:
  reject new imports above 4,194,304 pixels before Worker decode, enforce the
  same new-write limit in main, and preserve historical reads. E4L completed at
  `5ed2b06` and passed `RC-E4L-CODE-02`; no E slice is now executable. E0F
  itself froze no product capacity or protocol; v3.0 selects them.
  Evidence is recorded in
  [context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md).
- The old v1.8 PNG/JPEG/Worker design and its E1-E5 slice/file details are failed
  historical candidate material, not an active workstream or implementation
  permission. Only the reviewed v3.0 plan and active named slice authorize work.
- The separate `document-attachments` local-baseline plan v2.5 records the
  user-approved option A after `RC-DOC-G1-EVIDENCE-01`: strict text and
  text-bearing PDF remain in the first slice; DOCX is deferred. The amendment
  is bound at SHA-256
  `38714f5888a17438848e37ca27be629114a7e2fe9f2c08a05e9b5b3006c50f4c`.
  Its docs-only `document-attachments/S0` scope lock is bound to review contract
  `RC-DOC-S0-RATCHET-01` and landed at `43a2020`. The OS-temp
  `document-attachments/G1` gate then stopped under
  `RC-DOC-G1-EVIDENCE-01` because the reviewed candidate accepted a valid
  ZIP64 DOCX. The user then approved option A. The reduced v2.5 G1 amendment is
  bound at the hash above and passed `RC-DOC-V25-PLAN-01`; only the reduced
  OS-temp G1 gate was executable. It passed
  `RC-DOC-G1-REDUCED-EVIDENCE-01`. `document-attachments/D1` completed at
  `42e4ade` and passed `RC-DOC-D1-CODE-03`. `document-attachments/D2` landed
  at `bde0021`; the D3 real-target and packaged-product matrix passed. The sole
  final-review finding was repaired under `RC-DOC-D3-F001-R1`, and scoped
  `RC-DOC-D3-FINAL-CODE-01` passed. The local baseline is complete. Native PDF
  `N0/N1` remains outside this local workstream and is non-executable.
  This status does not reopen any stopped E slice.
- The explicitly requested `responses-protocol` workstream is complete. Its
  implementation source is
  [responses-protocol-technical-plan.md](./responses-protocol-technical-plan.md).
  S0, G0, the atomic C1+P1 cutover, D1, I1, and A1 are complete. I1 landed at
  `0b8a542`; A1 repaired one terminal-message compatibility defect at
  `89e012e`, then passed its real-provider and packaged-product matrix. No
  `responses-protocol` slice is executable.
- The explicitly requested `multi-thread-library` workstream is active as of
  2026-08-12. Its implementation source is
  [multi-thread-library-technical-plan.md](./multi-thread-library-technical-plan.md)
  v5.4 at SHA-256
  `fb513b014c18717b18521b3000318fc7c96de51c028981e6bb9153dc0098c228`. S0
  remains complete. G1 and G2 both reached
  independently reviewed `VALID_STOP`; their durable summary is in
  [multi-thread-library-runthrough.md](./multi-thread-library-runthrough.md).
  Reviewed v5.3 entered HEAD at `5a1aeae`. G1W then passed under the corrected
  release-shape contract in `2196ea6`; G2R reached independently reviewed
  `VALID_STOP`, so Permanent delete remains absent. The revised D1 scope lock
  completed at `0e3b2ef` after scoped closure review
  `NYX-MTL-D1-SCOPE-20260812-03`; D1-R completed at `0e4f02e`, and D1 code
  completed at `8d4d73e` after independent review
  `NYX-MTL-D1-CODE-20260813-03`. D2 completed at `15c8b00`; the C1 scope lock
  completed at `b647cde`. The title-identity amendment entered HEAD at
  `d099eec`; C1 then completed at `8b7150e` after independent final review
  `NYX-MTL-C1-FINAL-CODE-20260813-02`. E1 then stopped on its first valid cap-2
  performance sample. The docs-only E1R amendment below self-completes when its
  reviewed exact bytes enter HEAD; before that it is the only executable
  tracked-file step. After completion only the OS-temp E1R/G0 direction gate may
  run. E1/E1R product code remains blocked until a reviewed G0 PASS and a later
  exact product scope lock both enter HEAD.

## A0: Scope Gate Docs

Type: documentation only.

Goal: make the explicit agent-workbench workstream possible without changing
the default product scope for unrelated tasks.

Allowed files:

```text
README.md
AGENTS.md
apps/desktop/AGENTS.md
DESIGN.md
docs/next/agent-workbench-direction.md
docs/next/provider-connections-implementation.md
docs/next/agent-workbench-task-slices.md
```

Required:

- say ordinary tasks still follow `docs/v1-min-chat-implementation-plan.md`
- say these `docs/next/agent-workbench-*` docs apply only to explicit
  agent-workbench workstream tasks
- preserve the completed `v1 min chat` baseline
- state that the earlier external AGW draft is superseded by this repo document
- keep renderer/provider/runtime security boundaries

Do not:

- change application behavior
- edit Electron main, preload, renderer, or `runtime/ocaml`
- add Settings UI or IPC
- add runtime protocol messages

Validation:

```sh
mise run format-check
```

## A1: Connections Shared Domain

Type: shared TypeScript domain only.

Goal: add connection provider/model/default-target types and IPC constants
without changing the preload/window contract yet.

Allowed files:

```text
apps/desktop/shared/connections/types.ts
apps/desktop/shared/connections/ipc.ts
```

Do not:

- add `connections` as a required `NyxDesktopApi` field yet
- create Settings UI
- create Electron main storage
- change chat request behavior
- add model routing roles
- add public chat error codes

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
```

## A2: Main Connections Store

Type: Electron main storage.

Goal: add main-owned settings persistence and encrypted provider secrets.

Allowed files:

```text
apps/desktop/electron/main/connections/config-file.ts
apps/desktop/electron/main/connections/schemas.ts
apps/desktop/electron/main/connections/connection-store.ts
apps/desktop/electron/main/connections/secret-store.ts
apps/desktop/electron/main/connections/*.test.ts
```

Rules:

- use injected paths and injected crypto adapters for tests
- production crypto uses Electron main safe storage
- no plaintext token persistence
- file missing means empty state
- malformed or schema-invalid persisted JSON fails closed
- malformed persisted JSON must not be automatically overwritten

Do not:

- register IPC
- call providers
- edit renderer
- edit OCaml

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## A3: Provider Resolver

Type: Electron main behavior.

Goal: make chat execution resolve persisted default provider/model while
preserving `.env` fallback.

Allowed files:

```text
apps/desktop/electron/main/connections/connection-service.ts
apps/desktop/electron/main/connections/provider-resolver.ts
apps/desktop/electron/main/connections/*.test.ts
apps/desktop/electron/main/chat/env.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session*.test.ts
```

Rules:

- resolver/service must be lazy
- module import must not call `app.getPath`, `safeStorage`, provider network,
  child process startup, or OCaml runtime
- effective config resolution order is future explicit target, persisted
  default, env fallback, then `config_missing`
- chat path errors must map to existing `NyxChatErrorCode` values only
- preserve runtime-backed chat state behavior

Do not:

- add Settings UI
- expose renderer IPC for Connections
- remove `.env` fallback
- send provider secrets to renderer

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## A4: Connections IPC And Preload

Type: Electron IPC and preload contract.

Goal: expose Connections service through a narrow typed `window.nyx.connections`
bridge.

Allowed files:

```text
apps/desktop/shared/contracts/desktop.ts
apps/desktop/electron/preload/index.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/connections/*ipc*.ts
apps/desktop/electron/main/connections/*ipc*.test.ts
```

Rules:

- this is the first slice that may add `connections` to `NyxDesktopApi`
- use fixed IPC channels only
- use a Connections-specific safe error/result contract
- do not return stored API keys or raw secret file content

Do not:

- expose generic `invoke`
- expose raw `ipcRenderer`
- expose safeStorage
- let renderer choose arbitrary IPC channels

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## A5: Settings Connections UI And Main Status

Type: renderer UI plus redacted status.

Goal: let users configure an OpenAI-compatible provider and see redacted
connection status on the main surface.

Allowed files:

```text
apps/desktop/src/router.tsx
apps/desktop/src/ui/settings/*
apps/desktop/src/ui/chat/*
apps/desktop/electron/main/chat/env.ts
apps/desktop/electron/main/index.ts
apps/desktop/shared/provider/types.ts
```

Rules:

- UI may submit a newly typed API key but never display a saved key
- status may show safe host/model summary, not tokens or raw config
- settings page may include Connections and minimal Advanced only when backed by
  real data

Do not:

- add Agents, Tools, MCP, Memory, persistent history, fake artifacts, fake file
  context, or Ask/Work switch
- show fake provider health
- show full private base URL on the main surface
- show raw exceptions

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## A6: Provider Test And Model Refresh

Type: Electron main provider utility plus UI controls.

Goal: make Test connection and Refresh models real.

Allowed files:

```text
apps/desktop/electron/main/connections/provider-test.ts
apps/desktop/electron/main/connections/provider-test.test.ts
apps/desktop/electron/main/connections/connection-service.ts
apps/desktop/src/ui/settings/*
```

Rules:

- Test connection uses a tiny non-streaming OpenAI-compatible completion
- Refresh models calls `/v1/models`
- discovered models merge into existing models
- manual models are not deleted by refresh
- errors must not leak token, Authorization header, full request body, or raw
  secret

Do not:

- show Test connection or Refresh models buttons before this slice
- move provider test code into renderer or OCaml

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## A7: Thread-First Shell

Type: renderer UI/refactor.

Goal: transition visible copy and renderer-local presentation model from
chat-first to thread-first while preserving behavior.

Allowed files:

```text
apps/desktop/src/ui/chat/*
apps/desktop/src/ui/thread/*
apps/desktop/src/ui/App.tsx
apps/desktop/src/router.tsx
```

Rules:

- `New chat` becomes `New thread`
- composer copy becomes `Tell Nyx what to do...`
- renderer may adapt current chat state to a thread item stream with only real
  message items
- no behavior change to streaming, Stop, Retry, or reset/new thread

Do not:

- add thread IPC
- add details drawer
- add approval or artifact shared types
- add fake activity
- edit OCaml or provider behavior

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run check
```

## B0: Current Thread Durability Scope Gate

Type: documentation only.

Goal: authorize one durable current thread without authorizing persistent
thread history or broader runtime work.

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
```

Required:

- preserve `v1 min chat` as the default scope for ordinary tasks
- preserve A0-A7 as the completed first workstream
- authorize one Electron-main-owned current-thread record
- authorize one safe snapshot method on the existing chat bridge
- keep renderer state as an in-memory projection
- allow lazy replay through the existing runtime chat reducer only when the
  next real turn starts
- state that local conversation content is plaintext app data with owner-only
  file permissions, not encrypted secret storage

Do not:

- change application behavior
- edit Electron main, preload, renderer, or `runtime/ocaml`
- authorize Recent, thread lists, switching, full thread IPC, a Thread reducer,
  tools, activity, approvals, artifacts, SQLite, or JSONL

Validation:

```sh
mise run format-check
```

## B1: Main Current Thread Store

Type: Electron main storage only.

Goal: add a versioned, main-owned record and atomic store for the one current
thread.

Allowed files:

```text
apps/desktop/electron/main/current-thread/*
```

Rules:

- use a feature-local `CurrentThreadRecordV1` and `TurnRecordV1`
- create the stable thread id in main on the first submitted user message
- keep user and assistant message ids stable across retry while the attempt
  request id changes
- inject file path, clock, id, and file adapters for tests
- use serialized writes, a temporary file, atomic rename, and mode `0600`
- missing file means no current thread
- malformed or schema-invalid data fails closed and is not automatically
  overwritten
- persist safe message/error projections only

Do not:

- register IPC or edit renderer/session/runtime behavior
- expose the persisted schema through shared contracts
- import or move the Connections file helper across feature ownership
- persist token, Authorization, raw request/response, raw exception, or full
  error details
- write every streaming delta
- add JSONL, SQLite, encryption, migrations, or a thread collection

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## B2: Current Thread Snapshot Bridge

Type: shared contract, narrow IPC/preload bridge, and renderer hydration.

Goal: let renderer restore a safe projection of the one current thread without
becoming its durable owner.

Allowed files:

```text
apps/desktop/shared/chat/*
apps/desktop/shared/contracts/desktop.ts
apps/desktop/electron/preload/index.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/current-thread/*
apps/desktop/src/ui/chat/*
```

Rules:

- add one fixed `getCurrentThreadSnapshot` channel and method under
  `window.nyx.chat`
- use a current-thread-specific safe result/error contract
- map the main-only persisted schema to a renderer snapshot
- restore messages, terminal run status, and required retry metadata
- keep input empty and active request/turn identity unset after hydration
- prevent send while snapshot loading or load error is unresolved

Do not:

- expose the persisted schema, file path, raw JSON, or raw error
- add generic invoke, raw `ipcRenderer`, `window.nyx.thread`, or full thread IPC
- use renderer localStorage/IndexedDB or start the runtime during snapshot load
- connect provider execution or change runtime protocol in this slice

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## B3: Durable Session And Lazy Runtime Replay

Type: Electron main chat/session integration.

Goal: make the durable record authoritative for provider context and rebuild a
fresh runtime chat state before the next real turn.

Allowed files:

```text
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session*.test.ts
apps/desktop/electron/main/current-thread/*
apps/desktop/electron/main/runtime/chat-state-client.ts
apps/desktop/electron/main/runtime/chat-state-client.test.ts
```

Rules:

- inject the same current-thread store/controller used by the snapshot bridge
  into `ChatSessionManager` from the Electron main composition root
- for new and retry, compare the renderer `messages` payload with the complete
  main-derived role/content sequence; reject any missing, extra, or changed
  message with the existing `invalid_request` error before durable write,
  runtime replay, or provider work
- call the provider with main-derived messages, not renderer-owned history
- atomically persist a pending new/retry turn before provider side effects
- before snapshot or provider use after restart, normalize an abandoned pending
  turn to a terminal failure using the existing `unknown` code and retryable
  interrupted semantics
- replay persisted turns only for a fresh runtime client and only inside the
  next chat start path
- use existing submit/append/complete/cancel/fail runtime actions only
- project complete, cancel, and normal provider failure, including the final
  assistant draft, into one terminal durable write
- order terminal behavior as runtime transition, terminal durable write, then
  renderer event
- replay, runtime, or store failure is authoritative and must fail closed

Do not:

- remove the existing `NyxChatRequest.messages` compatibility field yet
- add public chat error codes
- start runtime during app startup, BrowserWindow creation, or snapshot load
- modify `runtime/ocaml`, NDJSON protocol, runtime resolution, provider secrets,
  or packaged distribution
- silently fall back to renderer history or the no-runtime diagnostic path

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## B4: Current Thread Recovery And Reset

Type: main recovery/reset plus safe renderer error state.

Goal: close interruption, malformed storage, retry, and explicit reset paths.

Allowed files:

```text
apps/desktop/electron/main/current-thread/*
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session*.test.ts
apps/desktop/shared/chat/*
apps/desktop/src/ui/chat/*
```

Rules:

- preserve and test the B3 interrupted normalization contract across snapshot,
  retry, and reset paths
- do not promise recovery of a partial draft lost during process exit
- preserve malformed/schema-invalid files until explicit Start fresh
- serialize abort, runtime clear/close, store reset, and renderer clear
- clear renderer state only after durable reset succeeds; on reset failure keep
  the UI in a blocked safe error state
- use a reset/hydration generation barrier so a snapshot response started before
  reset cannot repopulate the cleared thread
- prevent late provider events or store writes from reviving a reset thread
- cover in-flight snapshot versus reset and store-reset failure with
  deterministic tests

Do not:

- add Recent, list, switching, archive, hidden history, or per-message deletion
- add a new interrupted error code
- automatically overwrite or delete malformed storage
- persist streaming deltas

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## B5: Current Thread Durability Documentation Sync

Type: documentation and final verification.

Goal: document the implemented current-thread ownership and prove the bounded
end-to-end behavior.

Implemented behavior review:

- completed restart/continue restores prior messages, derives provider context
  from the main-owned record, and lazily replays a fresh runtime projection
- failed restart/retry restores the safe terminal error and assistant draft,
  then reuses stable user/assistant identity with a new attempt request id
- cancelled partial content is terminal durable content and restores as
  cancelled
- process exit during a pending turn restores as the existing `unknown`,
  retryable interrupted failure; crash-time partial draft recovery is not
  promised
- New thread waits for active work to settle, clears all runtime projections,
  removes the current-thread record, and stays empty after restart
- malformed or schema-invalid storage returns one safe load error, remains
  untouched, and can be removed only by explicit New thread/Start fresh

This review does not cover multi-thread switching, active renderer reload,
large-history performance, or conversation encryption.

Allowed files:

```text
README.md
DESIGN.md
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/architecture/runtime-protocol.md
```

Required:

- say Electron main owns the durable current-thread record
- say renderer and runtime hold rebuildable projections
- document complete, cancel, fail, retry, interrupted, reset, and corruption
  behavior
- keep Recent, switching, history collection, encryption, and Thread runtime
  domain explicitly out of scope
- manually verify restart/continue, retry, cancelled partial, interrupted exit,
  New thread, and corrupt-file Start fresh paths

Do not:

- claim multi-thread history, active renderer reload recovery, large-history
  performance, or conversation encryption
- include user conversation content, private paths, provider secrets, or local
  workflow evidence in committed docs
- change application behavior in this slice

Validation:

```sh
mise run desktop:check
mise run check
mise run format-check
git diff --check
```

## C Workstream: Provider Compatibility Core

Status: Completed on 2026-07-30. Acceptance evidence is recorded in
[llm-chat-runthrough.md](./llm-chat-runthrough.md).

The bounded implementation path is:

```text
ResolvedChatTarget
  -> OpenAI-compatible request mapping
  -> normalized provider stream
  -> existing chat session
```

The workstream preserves the existing minimal chat product and the completed
A/B behavior. Electron main remains the sole owner of provider identity,
credentials, requests, raw payloads, reasoning activity, terminal policy, and
current-thread durable failure state.

Locked decisions:

- C0-C4 implement compatibility core only. They do not send
  provider-specific `thinking`, `reasoning_effort`, or output-token parameters.
- Any `finish_reason=length`, with or without partial answer text, is a
  retryable failed turn. Existing session behavior must preserve the latest
  partial assistant draft and expose Retry.

This workstream handles reasoning-only and output-budget exhaustion as safe
terminal failures. It does not prevent provider-side reasoning from exhausting
the available output budget.

Global stop conditions:

- stop before changing the Connections persisted schema or rewriting
  version-1 provider records
- stop before choosing behavior from provider hostnames or model-name patterns
- stop before sending provider identity, credentials, raw payloads, or reasoning
  through shared, preload, renderer, or OCaml boundaries
- stop before adding usage, tools, sources, files, structured output, or native
  protocol events to the normalized stream
- stop if the generic request cannot retain its current represented fields and
  semantics
- stop if compatibility requires provider-specific request parameters, an
  adapter registry, capability profiles, or runtime-selected implementations

## C0: Provider Compatibility Scope Gate

Type: documentation only.

Goal: authorize the bounded C1-C4 workstream and freeze its decisions,
non-goals, ownership, validation, and stop conditions before code changes.

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/next/provider-adapter-direction.md
```

Required:

- make this document the executable source of truth for C1-C4
- keep [provider-adapter-direction.md](./provider-adapter-direction.md) as
  architecture context rather than independent implementation permission
- record the compatibility-only scope and both locked decisions above
- preserve A0-A7, B0-B5, v1 minimal chat, and existing runtime-backed
  current-thread behavior
- keep provider calls, credentials, raw payloads, and reasoning in Electron
  main
- state that C can report output exhaustion but does not prevent it

Do not:

- edit Electron main, preload, renderer, shared TypeScript, or `runtime/ocaml`
- add provider request parameters, registries, capabilities, persistence, UI,
  IPC, or error codes
- claim that generic, Ark, or GLM compatibility has already been implemented or
  manually verified

Validation:

```sh
mise run format-check
git diff --check
```

## C1: Stream Normalization

Type: Electron-main stream extraction with immediate integration.

Goal: define the minimal normalized provider stream and make the existing chat
client consume it in the same slice.

Allowed files:

```text
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/provider-stream.ts
apps/desktop/electron/main/chat/provider-stream.test.ts
```

Required:

- keep the main-only event set limited to `text-delta`,
  `reasoning-activity`, `finish`, and `error`
- normalize finish reasons to `stop`, `length`, `content_filter`,
  `tool_calls`, `error`, or `unknown`, while retaining a safe main-only native
  reason for diagnostics
- make the pure decoder responsible only for converting one provider payload to
  normalized events
- wire the decoder into `streamChatCompletion` immediately; do not leave an
  unused contract or parallel parsing path
- keep `streamChatCompletion` as the sole owner of aggregation, `onDelta`,
  empty/reasoning-only handling, terminal policy, and mapping to the existing
  `ChatBridgeError`
- preserve cancellation during reasoning and text
- preserve all current request and terminal behavior in this extraction slice;
  C3 applies the approved partial-`length` behavior

Do not:

- add a `SafeProviderError` or another public/shared error taxonomy
- expose or persist reasoning text
- add usage, tools, sources, files, or structured-output placeholders
- add a one-implementation interface, registry, capability profile, or SDK
- modify resolver, Connections, session, current-thread, renderer, shared, IPC,
  preload, or OCaml code

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## C2: Target Identity And Request Mapping

Type: Electron-main target resolution and pure request extraction.

Goal: preserve non-secret provider identity through request construction while
keeping the current generic OpenAI-compatible request unchanged.

Allowed files:

```text
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/env.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/connections/provider-resolver.ts
apps/desktop/electron/main/connections/provider-resolver.test.ts
```

Required:

- replace the lossy resolved config boundary with this main-only target:

  ```ts
  interface ResolvedChatTarget {
    providerId: string | null
    baseUrl: string
    token: string
    modelId: string
    protocol: 'openai-chat-completions'
  }
  ```

- use the persisted provider id for Connections targets and `null` for `.env`
  fallback
- route request construction by the explicit `protocol` value only
- extract a pure OpenAI-compatible request builder and consume it from
  `streamChatCompletion` in this slice
- keep endpoint construction, bearer authentication, model, `stream: true`,
  system-message insertion, and provider-visible messages equivalent to the
  existing generic request
- preserve target resolution order, safe errors, cancellation, durable session
  behavior, and the runtime-backed chat state path

Do not:

- infer a provider, protocol, adapter, or capability from base URL or model id
- add Ark-, GLM-, or other provider-specific request fields
- change Connections schemas, stored version-1 records, secret keys, shared
  contracts, IPC, preload, renderer, or OCaml
- add a registry, adapter interface, capability profile, or new dependency

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## C3: Fixtures And Terminal Hardening

Type: Electron-main compatibility fixtures and terminal behavior.

Goal: prove the bounded generic/Ark/GLM response shapes and apply the approved
output-length failure semantics without broadening the provider contract.

Allowed files:

```text
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/provider-stream.ts
apps/desktop/electron/main/chat/provider-stream.test.ts
apps/desktop/electron/main/chat/fixtures/*
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts
```

Required:

- add minimal redacted fixtures for generic content streaming, Ark-compatible
  text streaming, and GLM-style `reasoning_content` followed by final text
- cover reasoning-only termination, `length` with and without partial text,
  provider mid-stream errors, unknown native finish reasons, cancellation
  during reasoning and text, and malformed payloads
- treat every normalized `length` finish as an existing retryable
  `upstream_error`, even when answer text arrived first
- preserve prior text as the latest assistant draft, write the failed terminal
  current-thread record, and keep the existing Retry path available
- preserve the existing B3 session regression proving delta-then-failure
  persists the latest draft before the renderer error; extend it only if the
  C3 wiring creates an uncovered path
- keep raw reasoning out of assistant content, persistence, renderer events,
  subsequent provider messages, fixtures, and diagnostics
- source provider-specific fixtures from official examples or captured,
  redacted responses

Do not:

- include credentials, user prompts, personal conversation content, private
  URLs, or raw reasoning in fixtures
- add provider-specific request fields or claim to prevent output exhaustion
- add new public chat errors, shared contracts, UI, migration, registry, or
  capability selection
- modify Connections test/model-refresh semantics

Stop if:

- a claimed Ark/GLM fixture cannot be tied to an official example or a
  captured, redacted response
- correct handling requires provider-specific request policy or a broader event
  contract

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## C4: Provider Compatibility Acceptance And Docs

Type: acceptance verification and documentation sync.

Goal: verify the completed compatibility core against its evidence boundary and
document only behavior that was actually proven.

Completion: accepted on 2026-07-30 using the required automated checks, a live
Ark/GLM path, and isolated local fixtures for terminal cases that could not be
reliably induced on the live provider. See
[llm-chat-runthrough.md](./llm-chat-runthrough.md).

Allowed files:

```text
README.md
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/next/llm-chat-runthrough.md
docs/next/provider-adapter-direction.md
```

Required automated verification:

```sh
mise run desktop:check
mise run check
mise run format-check
git diff --check
```

Required manual verification:

- generic OpenAI-compatible streaming still completes normally
- an available Ark-compatible text model streams without request-shape changes
- an available GLM reasoning model remains cancellable during reasoning and
  exposes only final answer text
- reasoning-only and `length` responses fail safely without empty completed
  messages
- partial text followed by `length` remains visible as a failed durable draft,
  offers Retry, and restores after restart
- Stop during reasoning and text remains terminal and durable
- Retry after a provider failure keeps the established current-thread identity
  behavior
- unsupported model discovery preserves manually configured model ids
- existing version-1 Connections remain usable without record rewriting
- renderer never receives provider tokens, raw reasoning, or raw provider
  payloads

Required documentation:

- distinguish compatibility-core implementation from provider-specific request
  optimization
- say the workstream handles output exhaustion but does not prevent it
- record which generic, Ark, and GLM paths were actually exercised
- keep registry, capabilities, schema migration, UI, tools, history, and native
  protocol adapters out of scope

Do not:

- change application behavior in this slice
- report a provider path as verified when credentials, fixtures, or a manual run
  were unavailable
- weaken any automated check to make acceptance pass

## D Workstream: Composer Target Selection

Status: `D0` scope gate approved on 2026-08-05. `D1` through `D4` are
implemented and passed the required automated D5 checks on 2026-08-07. D5
documentation is synchronized; interactive provider/restart acceptance remains
pending.

Goal: let the user explicitly choose a configured chat target from the Composer
while keeping provider resolution, credentials, provider calls, and durable
thread ownership in Electron main.

The bounded implementation path is:

```text
safe Connections target catalog
  -> renderer-local Composer target draft
  -> required target selection on Send or Retry
  -> main validation and durable per-turn target binding
  -> existing runtime replay and provider stream
  -> safe assistant target attribution
```

### Locked product semantics

- An unsent Composer selection is an in-memory renderer draft. It is not
  persisted independently and does not survive restart.
- Each Send or Retry captures the currently visible Composer selection. That
  captured selection is immutable for the active request.
- Changing the Composer selection while a response is active affects only a
  later Send or Retry. It must not retarget, restart, or cancel the active
  request.
- The latest submitted selection becomes sticky for the one current thread and
  survives restart through the current-thread record.
- Retry keeps the existing user and assistant message ids, creates a new
  request id, and uses the currently visible Composer selection rather than the
  failed attempt's selection.
- Changing the Composer selection never changes the Connections global default.
- New thread clears the current-thread record and, after reset succeeds, seeds
  a new draft from the latest persisted default target or the configured `.env`
  fallback. Missing or unusable configuration blocks Send.
- A selected target that becomes deleted, disabled, unconfigured, or otherwise
  unusable is displayed as unavailable and fails closed. It must never silently
  fall back to another connection or `.env`.
- A main-authoritative target-resolution failure remains recoverable by choosing
  another target and using Retry. D may add one typed `target_unavailable` chat
  error with `retryable: true`; it must not make unrelated invalid requests
  retryable.
- Every assistant response whose target was resolved exposes compact safe
  provider/model attribution. Failed resolution has a selection but no actual
  attribution.

### Target readiness and refresh invariants

- Initial target readiness waits for both the current-thread snapshot and the
  safe Connections target catalog. Arrival order must not affect the result.
- The latest non-null committed thread selection wins over the global default,
  including when that committed selection is currently unavailable.
- Only a thread with no committed selection is seeded from the current global
  default. If no persisted default exists, a configured `.env` fallback is the
  seed. If neither exists, no request target is available and Send is blocked.
- A catalog refresh may update labels and availability, but it must not mutate
  the current Composer draft or committed thread selection.
- The safe catalog contains currently selectable connection targets with
  provider/model ids and display labels, plus a distinct `.env` fallback summary
  with its effective model id when configured. It contains no token, full base
  URL, protocol configuration, or raw provider record.
- A committed selection absent from the catalog remains visible as unavailable.
  The renderer may use safe current labels when present and fall back to stored
  ids or a fixed `.env` label; it must not invent provider identity.

### Ownership and data invariants

- Connections version 1 remains the source of configured providers, models, and
  the global default. D must not rewrite or migrate that store.
- Renderer owns only the in-memory draft and safe catalog projection. It does
  not own durable selection, resolved targets, credentials, or provider calls.
- Electron main validates every requested selection, resolves base URL/token/
  protocol, binds safe attribution durably, and performs provider calls.
- Current Thread version 2 owns one target binding per turn. The binding is
  either `null` for a migrated version-1 turn whose historical target is
  unknown, or one object containing the submitted selection and nullable
  resolved attribution. Attribution must never exist without its selection.
- A new D-created pending turn always has a non-null selection. Resolution binds
  attribution before runtime or provider side effects. A resolution failure
  leaves attribution null and settles the turn with the retryable
  `target_unavailable` error.
- The only attribution-binding transition is `bind-resolved-target`: the final
  pending turn keeps the same thread, request, message, content, status, and
  selection identity while attribution changes exactly once from null to the
  main-confirmed value. It cannot replace an existing attribution or settle the
  turn.
- For a saved connection target, resolved attribution must preserve the same
  provider/model ids. For `.env`, attribution records the effective model id
  resolved for that attempt without copying environment configuration.
- Snapshot `selectedTarget` is derived from the latest non-null turn selection;
  it is not duplicated as another persisted root field. Assistant attribution
  is derived from the same per-turn binding.
- Retry replaces the failed turn's latest attempt request id and complete target
  binding while preserving message identity. D does not add attempt history.
- Version-1 records are read without guessing historical targets or rewriting a
  stable record. The next real mutation, including interrupted-turn recovery,
  writes version 2. Unknown versions fail closed and remain untouched unless
  the user explicitly chooses New thread.
- Version 2 is forward-only. An older binary may fail closed when it encounters
  version 2; D does not provide automatic downgrade or rewrite the record for an
  older binary.
- The final shared chat request requires an explicit safe target selection. Main
  validates it and never derives a different fallback target for that request.
- The existing `chat:start` event carries the main-confirmed safe attribution.
  The existing runtime reducer and provider stream receive no new provider
  identity, selection, credential, or protocol fields.

### Global stop conditions

- stop before migrating the Connections persisted schema or copying `.env`
  configuration into Connections or the current-thread record
- stop before persisting an unsent Composer draft in a sidecar file,
  `localStorage`, or a second durable target owner
- stop before adding fallback-on-invalid behavior, hostname/model-name
  inference, model roles, automatic routing, or provider-specific request fields
- stop before adding an adapter registry, capability profile, attempt history,
  Recent, thread switching, or persistent multi-thread history
- stop before adding a new chat/thread IPC namespace or new OCaml runtime
  protocol messages
- stop before exposing credentials, resolved targets, full base URLs, raw
  provider configuration, or provider execution through D-added Composer,
  catalog, chat, snapshot, or attribution surfaces; the existing typed
  Connections Settings provider-detail editing contract remains unchanged

## D0: Composer Target Selection Scope Gate

Type: documentation only.

Goal: authorize the bounded D1-D5 workstream and freeze its product semantics,
ownership, compatibility rules, validation, and stop conditions before any
application changes.

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
```

Required:

- preserve the completed v1, A0-A7, B0-B5, and C0-C4 behavior
- keep ordinary model-picker work out of scope unless the D workstream or a
  named D slice is explicitly requested
- distinguish safe renderer-visible target selection from the resolved target,
  credentials, protocol, and provider execution owned by Electron main
- lock the Composer draft, active request, restart, New thread, Retry,
  unavailable-target, attribution, and `.env` semantics above
- authorize only the shared contracts, current-thread version change, existing
  bridge extension, renderer UI, and one target-specific retryable error needed
  by D1-D5
- record that D1-D5 are pending and must be implemented in order

Do not:

- change application behavior
- edit shared TypeScript, Electron main, preload, renderer, or `runtime/ocaml`
- claim D1-D5 are implemented or verified
- broaden the workstream beyond the D global stop conditions

Validation:

```sh
mise run format-check
git diff --check
```

## D1: Safe Target Catalog

Type: main-owned safe catalog and existing Connections overview contract.

Goal: expose every currently selectable configured target and the configured
`.env` fallback without exposing provider secrets or raw configuration.

Allowed files:

```text
apps/desktop/shared/connections/types.ts
apps/desktop/electron/main/chat/env.ts
apps/desktop/electron/main/chat/env.test.ts
apps/desktop/electron/main/connections/connection-service.ts
apps/desktop/electron/main/connections/connection-service.test.ts
apps/desktop/electron/main/connections/ipc-handlers.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/preload/index.ts
apps/desktop/shared/contracts/desktop.ts
apps/desktop/src/ui/chat/connection-status.test.ts
```

Required:

- extend the existing Connections overview result; do not add an IPC channel
- return deterministic safe catalog items containing connection provider/model
  ids and display labels only
- expose a distinct configured `.env` fallback summary with its effective model
  id even when a persisted Connections default also exists
- include only enabled provider/model pairs with an available stored credential
  as selectable connection targets
- keep `defaultTarget` and `defaultTargetSource` semantics unchanged
- preserve Connections version 1 bytes and all existing Settings behavior
- add tests proving no token, full base URL, raw config, or disabled/unusable
  target crosses the overview bridge

Do not:

- add selection state, Composer UI, chat request fields, current-thread fields,
  a new IPC channel, or a Connections migration
- infer provider/model capabilities or behavior from ids, names, or hosts

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

## D2: Main-Owned Target Binding Vertical Slice

Type: one minimum usable end-to-end target selection, persistence, execution,
and recovery slice.

Goal: make every existing Send and Retry carry, validate, persist, resolve, and
attribute one explicit target, with the smallest functional Composer selector
needed to recover from an unavailable target.

Allowed files:

```text
apps/desktop/shared/chat/types.ts
apps/desktop/shared/chat/events.ts
apps/desktop/shared/chat/snapshot.ts
apps/desktop/electron/main/connections/provider-resolver.ts
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/snapshot.ts
apps/desktop/electron/main/current-thread/runtime-replay.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/index.ts
apps/desktop/src/ui/chat/chat-types.ts
apps/desktop/src/ui/chat/chat-reducer.ts
apps/desktop/src/ui/chat/connection-status.ts
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/use-connection-status.ts
apps/desktop/src/ui/chat/components/ChatComposer.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/styles/index.css
apps/desktop/electron/main/connections/provider-resolver.test.ts
apps/desktop/electron/main/current-thread/store.test.ts
apps/desktop/electron/main/current-thread/session-coordinator.test.ts
apps/desktop/electron/main/current-thread/snapshot.test.ts
apps/desktop/electron/main/current-thread/runtime-replay.test.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/src/ui/chat/chat-reducer.test.ts
apps/desktop/src/ui/chat/connection-status.test.ts
apps/desktop/src/ui/chat/components/ChatComposer.test.ts
apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts
```

An unlisted production file requires stopping and re-planning before editing.

Required:

- add the safe selection and attribution contracts plus the retryable
  `target_unavailable` error
- make request target required and reject malformed or unavailable selections in
  Electron main
- read current-thread versions 1 and 2, preserve unknown files, and write the
  version-2 target binding only through valid append, `bind-resolved-target`,
  settlement, recovery, or retry transitions
- write durable pending plus selection before resolving; bind safe attribution
  durably before runtime replay/start or a provider request
- preserve terminal ordering after a runtime turn starts: runtime terminal,
  durable terminal, renderer terminal event
- when target resolution fails before runtime starts, settle the durable pending
  turn first and then emit the renderer `target_unavailable` error; no runtime
  terminal step exists on that path
- settle target-resolution failures durably as retryable
  `target_unavailable`, preserving the ability to choose a different target and
  Retry
- initialize renderer target readiness from both snapshot and catalog using the
  locked precedence rules; no arrival-order or catalog-refresh rewrite
- add the smallest keyboard-accessible Composer selector that can show the safe
  catalog, preserve an unavailable committed selection, and let the user choose
  another available target before Retry
- keep the selector usable while a response is active; capture selection at
  submission so later draft changes affect only the next Send or Retry
- disable Send while target readiness is incomplete or the selected draft is
  unavailable, without changing Stop behavior
- preserve current user/assistant identity, current provider-message derivation,
  Stop, New thread reset, interrupted recovery, and default-on runtime-backed
  chat state
- keep target identity, selection, and attribution out of runtime actions and
  provider request bodies except for the resolved model id already owned by the
  provider request mapper
- keep runtime replay independent of current-thread record versions by consuming
  only the existing message-level turn fields and ignoring selection and
  attribution metadata
- retain safe attribution in renderer state for later presentation without
  deriving it from the current draft

Do not:

- land a version-2 writer that the session, snapshot, retry, or recovery paths do
  not all understand
- add another durable selection owner, attempt history, silent fallback, a new
  IPC channel, or runtime protocol messages
- change Connections global-default or store behavior

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## D3: Assistant Attribution And Target UX Polish

Type: bounded presentation and interaction polish over the functional D1-D2
contracts.

Goal: present the actual resolved target on assistant responses and refine the
minimum D2 selector without changing target semantics or ownership.

Allowed files:

```text
apps/desktop/src/ui/chat/components/ChatComposer.tsx
apps/desktop/src/ui/chat/components/ChatComposer.test.ts
apps/desktop/src/ui/chat/components/ChatMessage.tsx
apps/desktop/src/ui/chat/components/ChatMessage.test.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts
apps/desktop/src/ui/chat/thread-items.ts
apps/desktop/src/ui/chat/thread-items.test.ts
apps/desktop/src/styles/index.css
```

An unlisted production file requires stopping and re-planning before editing.

Required:

- refine the D2 selector's compact labels, loading/unavailable states, keyboard
  behavior, actionable copy, and responsive layout without changing its state
  transitions
- show compact main-confirmed provider/model attribution on assistant responses;
  never infer it from the current draft
- preserve the unavailable-selection and active-generation behavior already
  implemented by D2
- preserve the single-page chat, plain-text messages, existing Connections
  settings, and current responsive Composer behavior

Do not:

- add model roles, automatic routing, capability badges, pricing, token counts,
  provider parameters, or a new Settings surface
- change request, persistence, resolution, retry, or target-readiness semantics
- mutate the global default or persist an unsent draft
- display full base URLs, credentials, raw config, or provider payloads

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run desktop:build
```

## D4: Target Lifecycle And Compatibility Hardening

Type: focused lifecycle, migration, failure, and regression hardening.

Goal: prove that target state remains deterministic across refresh, failure,
retry, reset, restart, and version boundaries without adding new architecture.

Allowed files: the production files listed by D1-D3 and their corresponding
tests only. A new production module, shared abstraction, state owner, or bridge
surface requires stopping and re-planning instead of treating hardening as
blanket permission.

Required automated coverage:

- snapshot/catalog completion in either order yields the same selected draft
- a committed unavailable selection stays selected and blocks Send until the
  user chooses an available target
- catalog refresh updates labels/availability but not the draft selection
- New thread reseeds from the latest global default, then `.env`, then missing
- `.env` remains explicitly selectable when a Connections default exists;
  attribution records the effective model used by each attempt
- deleting/disabling a provider or model, losing a credential, or losing `.env`
  configuration fails closed without another-target fallback
- target resolution failure preserves Retry eligibility and a later Retry with a
  valid current draft keeps stable message ids and a new request id
- target changes during generation do not affect the active request, Stop, or
  its eventual attribution
- version-1 stable read does not rewrite; mutation/recovery upgrades lazily;
  historical targets remain unknown; version 2 rehydrates selection and
  attribution
- malformed/unknown future records fail closed without overwrite; explicit New
  thread remains the only destructive recovery action
- generic, Ark-compatible, and GLM-compatible streaming retain existing request,
  terminal, and reasoning-isolation behavior

Do not:

- add a new state owner, generalized migration framework, adapter layer,
  capability profile, provider policy, or broad UI redesign
- weaken an existing current-thread, provider, renderer, or runtime regression
  test

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

## D5: Composer Target Selection Acceptance And Docs

Type: acceptance verification and documentation sync.

Status: required automated verification passed and documentation synchronized
on 2026-08-07. Interactive provider/restart acceptance remains pending; see
[composer-target-selection-runthrough.md](./composer-target-selection-runthrough.md).

Goal: verify D1-D4 against the locked D semantics and record only behavior that
was actually demonstrated.

Allowed documentation files:

```text
README.md
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/next/composer-target-selection-runthrough.md
```

Required automated verification:

```sh
mise run desktop:check
mise run check
mise run format-check
git diff --check
```

Required manual verification:

- Send through two configured provider/model targets and confirm each assistant
  response shows its actual attribution
- switch the draft during streaming and confirm the active response keeps its
  submitted target while the next turn uses the new draft
- trigger a retryable provider failure, change the draft, and confirm Retry uses
  the new target with stable message ids
- make the selected target unavailable and confirm no fallback occurs, then
  choose another target and recover through Retry
- restart and confirm the latest committed selection and per-response
  attribution restore while an unsent draft does not
- start New thread and confirm the latest global default or `.env` fallback is
  reseeded without mutating that global default
- exercise Stop, interrupted-turn recovery, generic streaming, an available
  Ark-compatible text path, and an available GLM-compatible reasoning path
- inspect D-added catalog, chat request/event, snapshot, and durable target
  surfaces to confirm no credential, full base URL, raw provider config, raw
  reasoning, or raw provider payload crossed their boundaries; preserve the
  existing typed Connections Settings provider-detail base URL contract

Required documentation:

- record the exact automated commands and manual target paths actually exercised
- distinguish safe user selection from Electron-main resolved target ownership
- state the forward-only current-thread version-2 downgrade limitation
- keep D1-D4 marked pending until their own acceptance evidence exists

Do not:

- change application behavior in this slice; failed acceptance returns to the
  owning D1-D4 slice
- claim a provider path, restart path, migration path, or secret boundary was
  verified without evidence
- weaken automated checks or broaden D into routing, capabilities, history,
  tools, or runtime work

## E Workstream: Context Composer Experiment

Status: E0 through E0E stopped on 2026-08-09. E0F passed its bounded independent
review on 2026-08-09. The v3.0 stable-image-URL plan passed `RC-V3-PLAN-03`;
E1 completed at `1bf91cf` and passed `RC-E1-CODE-02`; E2 completed at `36e32e6`
and passed `RC-E2-CODE-03`; E3 completed at `7677868` and passed
`RC-E3-CODE-02`; E4 completed at `b13d3b8` and passed `RC-E4-CODE-02`. The v3.1
amendment passed `RC-E5-PLAN-A-02`; E5 then stopped at
`RC-E5-4K-MEMORY-01`. The user approved bounded option A; the v3.2 amendment
passed `RC-E4M-PLAN-02`, then E4M stopped at `RC-E4M-EVIDENCE-01`. Its
uncommitted Worker change was reversed. The user then approved E4R as a single
2048-edge proportional-resize candidate; its revised plan passed
`RC-E4R-PLAN-03`, but E4R stopped at its oversized EXIF-orientation gate and its
uncommitted product diff was reversed. The user then approved bounded E4L;
E4L completed at `5ed2b06` and passed `RC-E4L-CODE-02`. No E slice is executable
pending a new user decision.

The user approved E0C policy A on 2026-08-09. The exact ICC assumption passed,
but E0C stopped when both bounded visible DOM grid candidates exceeded the
whole-process memory stop line. E0D then proved the preview-only grid but stopped
when its temporary full-open path copied fresh bytes through IPC into a new Blob
and object URL on each open and exceeded the same line. This narrow result does
not disprove derived previews or select a product transport. The user then
approved only E0E: an OS-temp gate for a stable opaque URL authorized and served
by main. E0E stopped when Chromium removed an explicit non-default port before
the handler, making the sealed exact-route rejection unimplementable within that
standard-scheme shape. The user then approved policy A for E0F: authorize the
canonical request identity delivered to the handler and treat syntactic
spellings erased by Chromium as aliases of the same resource. The resulting
OS-temp gate passed identity/cache reuse, revocation, security, memory, and
packaged loading. E0F alone did not authorize product code; the later reviewed
v3.0 plan authorized E1-E2, which are now complete. This document remains the
higher-priority scope gate if a conflict appears.

The v1.8 Worker/JPEG/allowlist design, capacity values, stop lines, and its old
E1-E5 file and requirement lists are failed historical candidate material.
They are non-operative and are not implementation permission. The rewritten
E1-E5 sections near the end of this workstream describe the reviewed v3.0 plan.
The active E invariants are:

- E1-E4 are complete and independently reviewed; the v3.1 canonical-identity
  amendment passed `RC-E5-PLAN-A-02`; E5 stopped at the fresh-process 4K memory
  gate; the user-approved E4M candidate passed `RC-E4M-PLAN-02` but stopped at
  `RC-E4M-EVIDENCE-01`; E4R passed `RC-E4R-PLAN-03` but stopped at its oversized
  EXIF-orientation gate; E4L completed at `5ed2b06` and passed
  `RC-E4L-CODE-02`; no E slice is executable
- E0D evidence is probe-scoped; no E0C capacity, product ICC allowlist, preview
  constant, or full-image transport is frozen by implication
- E0E evidence is probe-scoped; no scheme, URL shape, protocol, shared contract,
  preload/IPC method, cache, or Asset service is authorized
- E0F evidence is probe-scoped; it proves the bounded canonical-identity/native-
  cache direction feasible in the recorded environment but does not authorize
  a product protocol, shared contract, preload/IPC shape, or capacity policy
- Electron main remains authoritative for validation, metadata policy, file IO,
  durable ownership, target resolution, Provider mapping, and safe errors
- product implementation is authorized only inside the named active slice; no
  scope expansion is authorized
- v3.0 in the technical plan is the only current implementation plan and passed
  independent review as `RC-V3-PLAN-03`

Failure evidence is defined in
[context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md);
the failed candidate implementation is recorded in
[context-composer-experiment-technical-plan.md](./context-composer-experiment-technical-plan.md).

Failed v1.8 historical candidate semantics (non-operative):

- support only PNG/JPEG through picker, paste, and drop
- preserve `userContent` and add ordered `imageRefs`; do not introduce arbitrary
  content parts
- one sandboxed Renderer Web Worker may execute ephemeral same-MIME
  canonicalization; it owns no accepted or durable state
- Electron main owns authoritative canonical validation, metadata policy,
  canonical files, durable state, target resolution, Provider mapping, and safe
  errors
- Renderer owns unsent `File` drafts, Worker lifecycle, object URLs, and a
  rebuildable projection
- emit `chat:accepted` only after canonical files and the pending user turn are
  durable; Renderer clears the matching draft only after that event
- keep target capability `unknown`; do not infer support from host/model names
- keep the OCaml protocol unchanged and project only `userContent`
- preserve text-only wire shape, streaming, Stop, Retry, New thread, target
  selection/attribution, and current-thread recovery

Historical v1.8 candidate limits (none are frozen):

```text
types: image/png, image/jpeg
images per turn: 4
draft source bytes per image: 8 MiB
canonical bytes per image: 8 MiB
new bytes per turn: 16 MiB
current-thread image bytes: 32 MiB
current-thread image count: revised-gate evidence pending
current-thread cumulative pixels: revised-gate evidence pending
maximum edge: 8192 px
maximum pixels: 8,294,400
```

The candidate table in
[context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md#historical-v18-candidate-limits-status-reference)
is the status reference for these values. No capacity limit of any kind is
frozen.

The failed v1.8 candidate would stop if no real target accepted inline data
URLs, the target required remote upload/file ids, the sandboxed native Web
Worker missed E0B performance, metadata, build, lifecycle, decoded-grid memory,
or evidence-review boundary, or implementation required a dependency,
`utilityProcess`, general Asset service, database, worker pool,
thumbnail/lazy-load layer, new IPC namespace, new OCaml protocol, or behavior
outside the historical candidate semantics above.

## E0: Context Composer Scope And Feasibility Gate

Type: real-target/performance probe and documentation-only scope gate.

Status: stopped on 2026-08-09. See
[context-composer-experiment-runthrough.md](./context-composer-experiment-runthrough.md).

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- prove one configured OpenAI-compatible target accepts a streamed
  text-plus-inline-image request and semantically uses the synthetic image
- measure 25 MP canonicalization, four-image Renderer/main roundtrip, 32 MiB
  hydration, and 32 MiB historical request construction on actual Electron
- rerun a 25 MP and minimum 8 MP high-entropy fixture before freezing limits
- record only redacted labels, request shape, environment, measurements,
  caveats, and the go/stop result

Do not change production code/tests/persisted data/provider configuration;
retain temporary probes, raw responses, Base64, private images, full base URLs,
credentials, or local absolute paths; or treat E0 as implementation permission.

Validation:

```sh
mise run desktop:build
mise run format-check
git diff --check
```

Observed result: real-target, ordinary IPC/hydration, and historical request
construction passed, but both 25 MP and minimum 8 MP high-entropy PNGs blocked
Electron main for about one second. The original PASS is withdrawn. E0 does not
authorize E1-E5.

## E0B: Native Off-Main Canonicalization Feasibility

Type: temporary Electron/Vite feasibility probe and plan/docs revision only.

Status: stopped on 2026-08-09. The OS-temp production-shape Vite Worker harness
loaded its static Worker in dev, build, and `app.asar`, but its synthetic JPEG
output contained an ICC APP2 segment that the failed v1.8 candidate's sealed
main allowlist correctly rejected. No capacity limit is frozen.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Sanitized temporary probe code and synthetic fixtures existed only in the OS
temporary directory through the bounded independent E0B review. They were never
committed and the reviewed harness was deleted after review.

Required:

- use the current sandbox/context-isolation settings and Vite's static
  `new Worker(new URL(..., import.meta.url), { type: 'module' })` shape
- use one ordinary Web Worker with no Node integration, dependency, pool,
  file-system access, bridge access, Provider access, or durable state
- canonicalize with `createImageBitmap({ imageOrientation: 'from-image' })`,
  same-size `OffscreenCanvas`, PNG or JPEG quality 0.95, and transferable
  buffers
- before Worker decode, use one pure PNG/JPEG header parser to reject truncated,
  oversized-edge, oversized-pixel, or MIME/magic-mismatched source bytes
- prove a small crafted source with oversized header dimensions is rejected
  before `createImageBitmap`, so compressed input cannot bypass the pixel bound
- keep main authoritative: bound canonical bytes, parse PNG/JPEG headers,
  cross-check with `nativeImage` decode, and fail closed on metadata-bearing
  PNG chunks, JPEG APP1-APP15/COM, or arbitrary/repeated/extended APP0 segments;
  allow at most the exact minimal JFIF APP0 shape with no thumbnail or arbitrary
  payload only when production Worker fixtures prove it necessary; add a custom
  APP0 adversarial fixture and do not synchronously re-encode
- prove production Worker loading, PNG/JPEG MIME, EXIF orientation,
  GPS/device/XMP/COM/PNG text removal, visual equivalence, remove/New
  thread/unmount, stale-result disposal, timeout/error recovery, and four-image
  sequencing
- measure peak main+Renderer+Worker working set instead of only completion RSS
- in the OS-temp harness, use many highly-compressible full-pixel images at each
  candidate count/pixel limit to create object URLs and real `<img>` elements,
  mount them in a representative visible DOM grid, wait for `img.decode()` or
  load/error completion, and measure whole-process peak working set across
  main+Renderer+Worker; use that evidence to freeze both current-thread total
  image count and cumulative pixels, with main recomputing authority from refs
  and bounded header reads rather than persisted dimensions or a cache
- retain in the runthrough the executed redacted command shapes without
  absolute/private data, deterministic seed and fixture hash, repetition count,
  peak-sampling method, and packaged Worker evidence; after the reviewed
  harness is deleted, those command shapes are not a self-contained reproduction
- freeze limits only if Renderer heartbeat gap is ≤50 ms, main validation
  segments are ≤250 ms, four daily images finish ≤1.5 s, a 3840×2160
  high-entropy image finishes ≤1 s, and peak working-set increase is ≤192 MiB
- stop for a new decision if no practical current-thread count/pixel bound can
  meet peak memory without a thumbnail or lazy-load layer

Do not commit production image behavior, begin E1-E5, add a dependency or
`utilityProcess`, weaken sandbox/context isolation, relax stop lines, keep a
Blob Worker, commit probe code, retain temporary source/payloads outside OS
temp, retain them after bounded independent review, import production Renderer
components, or implement/run the E4-blocked `ChatMessage`/product message grid.

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:lint
mise run format-check
git diff --check
```

Observed result: the no-dependency same-MIME Worker candidate failed the JPEG
metadata gate. A deterministic 120×80 synthetic fixture produced a 990-byte
canonical JPEG containing `FFE2 ICC_PROFILE`; main rejected it as required by
the failed v1.8 candidate's APP1-APP15 deny rule. The remaining lifecycle/grid
matrix was not promoted after this Stop condition. At E0B Stop, E1-E5 remained
blocked pending E0C.

## E0C: Exact Chromium ICC Allowlist Feasibility

Type: temporary Electron/Vite feasibility probe and plan/docs evidence only.

Status: stopped on 2026-08-09 after independent review. E0C is not product
implementation permission.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Historical sealed requirements:

- recreate the minimal OS-temp production-shape Vite Worker harness using the
  current sandbox/context-isolation settings, current installed toolchain, one
  static module Worker, no production Renderer imports, and synthetic fixtures
- generate the deterministic JPEG through the real Worker three times; record
  the canonical JPEG hash, every JPEG marker, the full APP2 payload hash, and
  the ICC bytes hash after the `ICC_PROFILE\0` sequence/count framing
- freeze an allowlist only if all three outputs contain exactly one identical
  APP2 segment with sequence `1`, count `1`, and byte-for-byte identical sRGB
  ICC payload; any output/profile variation is a Stop condition
- keep main fail closed: reject modified, truncated, repeated, additional,
  split/extended, multi-segment, or out-of-order APP2; reject APP1,
  APP3-APP15, COM, arbitrary/repeated/extended APP0, and metadata-bearing PNG
  chunks; allow only a production-proven exact minimal JFIF APP0 if present
- verify adversarial single-byte ICC mutation, missing/extra ICC bytes,
  sequence/count mutation, repeated/additional APP2, split APP2, APP2 order
  mutation, EXIF orientation, GPS/device, XMP, COM, PNG text, and PNG eXIf
  fixtures; accepted JPEG output must remain `image/jpeg`
- finish the previously blocked lifecycle, four-image timing, 4K timing,
  heartbeat, main validation, and representative visible DOM `<img>` grid
  matrix; sample main+Renderer+Worker peak working set and freeze every
  practical capacity value or stop
- rerun dev, build, and `app.asar` Worker loading and record the current
  environment, deterministic fixture provenance, redacted reproducible command
  shapes, repetition count, and peak-sampling method
- retain the sanitized OS-temp harness through one bound independent review,
  then delete it; keep only redacted evidence in the runthrough

Fixed stop lines remain heartbeat gap ≤50 ms, main synchronous validation
segment ≤250 ms, four daily images ready ≤1.5 s, 3840×2160 high-entropy image
ready ≤1 s, source/canonical bytes ≤8 MiB, maximum canonical pixels 8,294,400,
and whole-process peak working-set increase ≤192 MiB. These are gate thresholds,
not frozen product capacities; image count and cumulative pixels remain pending
until the visible-grid evidence passes.

Stop instead of widening E0C if the exact ICC output is unstable, a Chromium
upgrade changes it, safe acceptance requires parsing arbitrary ICC profiles,
any threshold or lifecycle case fails, no practical count/pixel capacity passes,
or the direction needs a dependency, new process/IPC, product code, thumbnail
or lazy-load layer, general Asset service, or new OCaml protocol.

Observed result:

- three deterministic JPEG outputs were identical; canonical SHA-256 was
  `f699c04d6b8c309403f2c69c9c58c2eddd2b4e7e4f5aa64851dc177ef0258d8f`
- the one 470-byte APP2 payload SHA-256 was
  `c3bb12de30d7357252ec3a5ec781bd2f8a6dd8c69dd7d3de97bbac262d9e1fd4`;
  the 456-byte ICC bytes SHA-256 was
  `12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc`
- all ten exact-APP2 adversarial cases were rejected; the probe reached the
  visible-grid gate after its bounded metadata, timing, and lifecycle checks
- 12×1920×1080 produced +259.031 MiB and 8×1920×1080 produced +269.453 MiB,
  both over the fixed +192 MiB whole-process peak stop line
- independent strict review bound source-tree fingerprint
  `6e12136f051cf8ecb9cc74945391eb1076100c87cda2fd4c0a1399fe4e39768c`
  and returned `VALID_STOP`; the reviewed OS-temp harness was then deleted

At E0C Stop, no capacity or product ICC allowlist was frozen and E1-E5 remained
blocked. Later E0F/v3.0 evidence and review supersede only the current execution
status recorded at the top of this workstream.

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

## R Workstream: Responses Protocol And Native Continuation

Status: complete; no `responses-protocol` slice is executable. The locked
architecture, breaking development cutover, invariants, validation model, and
global stop conditions are defined in
[responses-protocol-technical-plan.md](./responses-protocol-technical-plan.md).
Evidence status belongs in
[responses-protocol-runthrough.md](./responses-protocol-runthrough.md).

This workstream supersedes completed C/D restrictions only for the exact named
slice. It does not reopen stopped image slices or deferred native-document
slices. The completed historical order was:

```text
responses-protocol/S0
  -> responses-protocol/G0
  -> responses-protocol/C1+P1
  -> responses-protocol/D1
  -> responses-protocol/I1
  -> responses-protocol/A1
```

No later slice may start until the previous slice passes its checks, diff
inspection, and commit.

Locked semantics:

- Protocol configuration belongs to the selected model, not the provider or
  Composer draft.
- Responses uses `store: false`; remote response storage is not Nyx's durable
  source of truth.
- Complete validated Responses output items remain Electron-main-only and are
  referenced from their completed assistant turn.
- Native state is replayed only to an exact execution identity bound to
  provider, normalized endpoint, model, protocol config, and credential
  revision.
- Only a valid `response.completed` completes a Responses turn.
- The durable current-thread result commits before OCaml runtime projection.
- Old development formats are deleted before cutover; product code contains no
  legacy reader, migration, fallback, or downgrade path.

### responses-protocol/S0: Documentation scope lock

Type: documentation only.

Allowed files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-direction.md
docs/next/agent-workbench-task-slices.md
docs/next/provider-adapter-direction.md
docs/next/responses-protocol-technical-plan.md
docs/next/responses-protocol-runthrough.md
```

Required: preserve ordinary `v1 min chat` scope and completed behavior; make
this section the executable order; authorize only the strict schemas, model
protocol config, main-only continuation sidecar, semantic stream, and
durable-first settlement; preserve Renderer/preload/OCaml redaction; freeze no
sidecar capacity before G0. Do not edit product code or claim G0 evidence.

Validation:

```sh
mise run desktop:format-check
git diff --check
```

### responses-protocol/G0: Real-relay feasibility gate

Type: repository-external evidence harness only.

Allowed: OS-temp harness, redacted runthrough evidence, and read-only use of one
explicitly configured Responses target and one Chat Completions target.

Required proof:

- exact `store:false + stream:true` request and semantic terminal shape;
- complete output items with usable encrypted reasoning for the configured
  reasoning model;
- JSON serialization plus fresh-process replay;
- same-target two-turn and A -> B -> A interleaving;
- image, extracted-text envelope, abort, output bytes, and Electron-main memory
  evidence sufficient to choose fail-closed sidecar bounds.

Do not edit product TypeScript. Stop if a global plan stop condition fires.

### responses-protocol/C1+P1: Atomic configuration and wire cutover

Type: Connections contracts, persistence, resolver, Settings UI, concrete wire
paths, Connection Test, and tests.

Allowed files:

```text
apps/desktop/shared/connections/*
apps/desktop/electron/main/connections/*
apps/desktop/src/ui/settings/*
apps/desktop/electron/main/chat/*
```

Required: strict Connections v2 and secret-store v2 only; explicit model
`protocolConfig` and provider new-model default; random credential revision on
every credential write; exact main-only execution identity; preserve model
protocol on refresh; editable and bulk-applicable protocol settings; one
discriminated switch with concrete Chat Completions and Responses functions;
exact instructions/text/image/document mapping; semantic-event and full
completed-terminal validation; complete output-item preservation; two-request
Responses Connection Test; all Chat behavior preserved.

This is one atomic checkpoint because the resolver protocol union and chat wire
switch must remain buildable together. Do not edit current-thread, preload/IPC
shape, or OCaml. Do not add old-schema parsing, persistence, tools, SDKs, new
public errors, a registry, or a factory.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
git diff --check
```

### responses-protocol/D1: Current-thread v5 continuation durability

Status: complete at `23077e5`.

Type: Electron-main current-thread persistence only.

Allowed files:

```text
apps/desktop/electron/main/current-thread/*
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session.test.ts
```

The two chat files are limited to deleting compile-time current-thread v1-v4
guards made impossible by the strict v5 type. They may not add Responses replay
or settlement behavior in D1.

Required: one strict current-thread v5 schema with v1-v4 schemas/upgrades
deleted; completed-only provider-state refs; bounded sidecar prepare, verify,
commit, rollback, orphan-reconcile, and reset; controlled same-identity ref
repair after corruption; provider-state-free snapshot and runtime replay.

Do not add chat integration behavior or edit Renderer/shared snapshot shapes or
OCaml.
Validation is the C1 matrix plus all current-thread tests.

### responses-protocol/I1: History replay and durable-first integration

Status: complete at `0b8a542`.

Type: Electron-main session integration.

Allowed files:

```text
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session*.test.ts
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/session-coordinator.test.ts
apps/desktop/electron/main/current-thread/runtime-replay.ts
apps/desktop/electron/main/current-thread/runtime-replay.test.ts
```

The two client files are limited to carrying already-validated main-only native
Responses output items into the existing Responses `input` builder. Without
that concrete wire mapping, exact-identity native replay cannot be implemented;
they may not add another protocol or public contract.

Required: resolved-target-aware history; exact-identity native replay and
visible-text mapping for other targets; atomic completed text plus sidecar ref;
durable-first runtime ordering; zero provider calls after failed next-turn
rehydration; deterministic Stop, Retry, switch, restart, repair, and New thread.

Do not add attempt history, multi-thread history, IPC, Renderer provider state,
or OCaml fields.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:build
mise run runtime:test
mise run runtime:format-check
mise run runtime:chat-state:check
./scripts/audit-ocaml-runtime.sh
./scripts/check-runtime.sh
git diff --check
```

### responses-protocol/A1: Product acceptance and status sync

Status: completed on 2026-08-11 after the real-provider and packaged-product
matrix passed. The sole owning-slice parser defect was repaired at `89e012e`.

Type: verification and truthful documentation only.

Run all applicable checks. Interactively verify real Chat and Responses targets,
same-target continuation, restart, switching, Stop/Retry, images, documents,
Connections Test, New thread, and one packaged macOS build. Record only
redacted evidence and synchronize status. A1 adds no product behavior; failures
return to their owning slice.

## E0D: Derived Preview And On-Demand Full Decode Feasibility

Type: temporary Electron/Vite display-memory probe and plan/docs evidence only.

Status: stopped on 2026-08-09 after independent review. E0D is not product
implementation permission.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- recreate a minimal OS-temp production-shape Electron/Vite harness from
  scratch with the current sandbox/context-isolation settings, one static module
  Worker, no production Renderer imports, no new dependency, and synthetic data
- reuse the E0C exact APP0/APP2 evidence only inside the probe; it is still not a
  product allowlist until the whole E0D gate passes
- decode each source once in the Worker and emit two outputs: the same-MIME full
  canonical image and one aspect-preserving PNG preview whose maximum edge is
  512 px; do not add multiple preview sizes, a cache, service, or worker pool
- verify static Worker loading in build and `app.asar`, JPEG orientation/visual
  equivalence, and PNG alpha/visual equivalence with the current toolchain
- keep main authoritative for both outputs: full canonical rules remain bounded
  by the E0C candidate; preview must be PNG with only `IHDR`/`IDAT`/`IEND`, at
  most 1 MiB, maximum edge 512 px, maximum 262,144 pixels, correct orientation,
  and dimensions derived from the full canonical image
- simulate accepted ownership after import: main owns full canonical and preview
  bytes as one pair; Renderer drops source/full bytes and receives only previews
  for the message grid. Temporary harness IPC is evidence plumbing, not a new
  product contract
- prepare synthetic evidence outside measured runs, then run each display
  scenario in a fresh Electron process; load main-owned full/preview pairs before
  a 500 ms baseline sample so prior Worker/import caches cannot contaminate the
  display delta
- test the count/cumulative-pixel candidate with 12 distinct 1920×1080 images
  (24,883,200 total pixels) rendered as real visible preview `<img>` elements;
  wait for decode/load/error, two animation frames, and a settled sample
- separately test the maximum-image path with one 3840×2160 image plus eight
  1920×1080 images (also 24,883,200 total pixels): render previews, request and
  decode only the 4K full canonical on open, then close and release its DOM node
  and object URL; repeat open/close three times and never hold two full images
- repeat the fresh preview-grid and full-open scenarios three times; sample
  main+Renderer+Worker/GPU whole-process working set every 20 ms and record
  baseline/peak/delta, preview bytes, ready time, open time, heartbeat gap, main
  sync segments, visible dimensions, and live full-image count
- retain the sanitized harness and synthetic files through one bound independent
  review, then delete them and keep only redacted evidence in the runthrough

Fixed stop lines: heartbeat gap ≤50 ms; main synchronous segment ≤250 ms; four
daily full+preview outputs ready ≤1.5 s; one 4K full+preview output ready ≤1 s;
preview grid ready ≤500 ms; one 4K full open ready ≤500 ms; source/full canonical
≤8 MiB; preview ≤1 MiB and ≤262,144 pixels; every fresh-process whole-process
peak delta ≤192 MiB. Candidate count 12 and cumulative pixels 24,883,200 remain
unfrozen until every E0D item and independent review pass.

Stop instead of widening E0D if a preview exceeds its bound, the fresh preview
grid or one-full-image path misses a fixed line, memory grows across open/close
cycles, safe use requires virtualization, multiple preview tiers, a general
thumbnail/Asset service, new dependency/process/product IPC, product code, or a
new OCaml protocol. Do not try another display architecture inside E0D.

Observed result:

- full+preview import, JPEG orientation/visual equivalence, PNG alpha/visual
  equivalence, and the exact probe ICC candidate passed; four daily imports took
  246.0-252.4 ms and 4K imports took 315.2-326.3 ms
- three fresh preview-grid processes passed: 12 previews were ready in
  131.0-131.5 ms with +29.656 to +45.813 MiB whole-process peak deltas and no
  full image in the DOM
- the first fresh full-open process stopped the gate: after the preview grid was
  mounted and the baseline sampled, three one-at-a-time 4K opens took
  77.5-82.8 ms but peaked at +271.047 MiB, above the fixed +192 MiB line
- each close removed the node, revoked the object URL, and returned full-image
  DOM count to zero; the measured path still copied a fresh 8,366,208-byte
  typed array from main and created a fresh Blob/object URL on every open
- the production build emitted its static Worker; `app.asar` was not rerun
  after the valid Stop
- independent strict review bound source-tree fingerprint
  `d08f54374b7d93eccce1784413374a73d47c2049c4c5f395b7d289d3a036c879`
  and returned `VALID_STOP`

No count, pixel, preview, ICC, or transport choice is frozen. The result rejects
only E0D's sealed temporary full-open path; it does not prove the derived-preview
model generally infeasible.

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

## E0E: Stable Main-Authorized Asset URL Feasibility

Type: temporary Electron custom-protocol security/memory probe and plan/docs
evidence only.

Status: stopped on 2026-08-09 after independent review. E0E is not product
implementation permission.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- recreate a minimal OS-temp production-shape Electron/Vite harness with the
  current default session, sandbox/context isolation, no production Renderer
  imports, no product code, no new dependency, and synthetic images
- register one probe-only standard and secure scheme before `app.ready`; do not
  enable CSP bypass, Service Workers, Fetch API support, CORS, extensions, or
  streaming-media privileges
- give each prepared file one immutable opaque id and one stable URL shaped like
  `nyx-e0e-asset://full/<opaque-id>`; the name is evidence plumbing, not a
  product naming or contract decision
- keep an Electron-main-only id-to-file map; Renderer may receive only stable
  URLs, MIME, safe dimensions, and display labels, never full JS-owned bytes,
  local paths, raw file errors, or map contents through preload/IPC
- validate and register synthetic files before measurement; the protocol handler
  must accept only `GET`, the exact host and one opaque-id path segment, reject
  query/credentials/port/unknown/encoded traversal shapes, and return generic
  404/405 responses without path disclosure
- serve an authorized immutable file with Electron `net.fetch(file:)` and a
  streaming `Response` body; do not call `arrayBuffer()`, `readFile`, create
  a full userland Buffer/typed array, or create a Renderer Blob/object URL in the
  measured path
- prove one authorized image loads as `<img>`, Renderer cannot read its bytes
  through any JS API, and at minimum both `fetch` and `XMLHttpRequest` fail while
  canvas readback is cross-origin blocked; any successful JS byte-read stops the
  gate. Unauthorized URL variants must fail closed, and the stable URL must not
  reveal the local file path
- build the production harness and, only if the security/memory gate has not
  stopped, load one authorized image from `app.asar` packaging
- prepare the E0D maximum-image shape: one 3840×2160 near-boundary 7.5-8 MiB
  canonical image plus eight distinct 1920×1080 images, each with one
  aspect-preserving PNG preview whose maximum edge is 512 px
- in each fresh production-build Electron process, mount the nine stable preview
  URLs, await decode/load/error and two animation frames, then take a 500 ms
  whole-process baseline before opening the same stable 4K URL
- open, close, and reopen the one 4K image three times, never hold two full DOM
  images, never change its URL, wait 500 ms after each close, and record the
  median post-close working set over the final 200 ms plus protocol handler
  request count
- repeat the fresh full-open scenario three times; sample
  main+Renderer+Worker/GPU whole-process working set every 20 ms and record
  baseline/peak/delta, each open time, heartbeat gap, main synchronous segment,
  handler hits, stable URL equality, post-close values, and live full-image count
- retain the sanitized harness and synthetic files through one bound independent
  review, then delete them and keep only redacted evidence in the runthrough

Fixed stop lines: security cases fail closed; Renderer cannot JS-fetch or canvas
read back the full image through fetch, XHR, canvas, or another observed JS byte
path; no local path/full IPC bytes/Blob URL appear; heartbeat gap ≤50 ms; main
synchronous segment ≤250 ms; each 4K open ready ≤500 ms; every fresh-process
whole-process peak delta ≤192 MiB. After the first-open warm-up, post-close
working set must plateau: second and third post-close medians are each no more
than 16 MiB above the first, and the third is no more than 8 MiB above the
second. Both noise allowances are strictly below one 4K RGBA frame and are leak
stop lines, not product budgets.

Stop instead of widening E0E if the protocol exposes JS-readable bytes or paths,
authorization is ambiguous, any fixed line fails, safe use requires a token
service/cache/service worker/range transport/new dependency/product code or IPC,
or a different ownership model. Do not test another transport inside E0E.

Observed result:

- production build and synthetic preparation passed; the 3840×2160 canonical
  JPEG was 8,009,319 bytes and its 512×288 PNG preview was 500,603 bytes
- one authorized 3840×2160 `<img>` loaded; Renderer `fetch` failed with
  `TypeError`, XHR failed, canvas readback raised `SecurityError`, and no local
  path was present in the safe surface
- valid GET returned 200; unknown id, query, wrong host, encoded traversal, and
  non-GET requests failed as planned; credentials were rejected before handling
- an initial explicit `:443` case returned 200 and was treated as potentially
  ambiguous; the bounded retry used non-default `:444`, which also returned
  200, while handler instrumentation observed only the canonical no-port URL
- Chromium therefore removed the explicit port before `protocol.handle`;
  the handler's `url.port` check could not enforce the sealed exact-route rule
- independent strict review bound source-tree fingerprint
  `7e11f7d0c9c87f7fd809d9a51c8aa1330687f3a5bcd136d1a6d8070d0a27053d`
  and returned `VALID_STOP`

Memory repetitions and `app.asar` were correctly not run after the security
Stop. No capacity, ICC, preview, scheme, URL, or transport choice is frozen. The
result rejects only E0E's sealed standard-scheme exact-route model.

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

## E0F: Canonical Request Identity And Stable Full-View Feasibility

Type: temporary Electron custom-protocol identity/cache/memory probe and
plan/docs evidence only.

Status: passed bounded independent review on 2026-08-09. E0F is feasibility
evidence, not product implementation permission.

Allowed tracked files:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-technical-plan.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- recreate the smallest OS-temp production-shape Electron/Vite harness with the
  current default session, sandbox/context isolation, no production Renderer
  imports, no product code, no new dependency, and synthetic images
- reuse E0E's standard+secure privilege shape with Fetch API, CORS, CSP bypass,
  Service Workers, extensions, and streaming-media privileges disabled
- define authorization identity only from the canonical `Request` delivered to
  `protocol.handle`: `GET`, exact scheme, exact host, and one main-known opaque
  id path segment, with no observable query; main remains the sole id-to-file
  owner
- treat raw spellings Chromium erases before the handler, including the tested
  non-default port alias, as the same resource identity rather than a separate
  authorization input; do not add raw-string parsing, a token/cache service, or
  another owner
- keep rejecting every observable unauthorized shape: unknown id, query, wrong
  host, encoded traversal, and non-GET; credentials must remain rejected before
  handling. Return generic errors and expose no local path or raw file error
- stream an authorized immutable file with `net.fetch(file:)` and
  `Response.body`; measured paths must not call `readFile`/`arrayBuffer`,
  construct a full userland Buffer/typed array, or create Renderer Blob/object
  URLs
- prove authorized canonical and `:444` alias `<img>` loads resolve to the
  same main asset id and identical handler-observed canonical URL; record
  `src`/`currentSrc` but do not require author spelling to change if resource
  identity and cache behavior are identical
- give identity and every memory repetition a unique initially empty
  user-data/profile; phase-scope the full-id handler counter and prove
  canonical → alias → canonical produces `0 → 1 → 1 → 1`, removing each node
  and waiting 500 ms. Any different count means the cache evidence is
  contaminated or identity did not converge and stops E0F
- after the identity process warms the cache and exits, restart with the same
  profile and scheme but do not register the target id and temporarily move its
  file outside the served set; the old stable URL must fail to load. Do not call
  `clearCache`. Restore the synthetic file only after recording the result
- repeat E0E's JS-read negatives: Renderer `fetch` and XHR must fail, canvas
  readback must raise `SecurityError`, and any other observed JS byte-read or
  local-path exposure stops E0F
- prepare one 3840×2160 near-boundary 7.5-8 MiB canonical plus eight distinct
  1920×1080 images, each with one max-edge 512 PNG preview, before measurement
- in each of three fresh production-build processes, mount nine stable preview
  URLs, await decode/load/error, two frames, and settled state, then take a
  500 ms whole-process baseline before opening the canonical stable 4K URL
- open/close the same 4K URL three times with one full DOM image at most, 500 ms
  close settle, and final-200 ms post-close median; within each isolated phase,
  require the full-id counter to start at 0 and remain at 1 after the first
  load, so later opens reuse the native resource rather than replaying main file
  transport
- sample main+Renderer+Worker/GPU whole-process working set every 20 ms and
  record baseline/peak/delta, each open time, heartbeat, main sync, handler hits,
  `src`/`currentSrc`, post-close medians, URL equality, and live full count
- after identity, security, and all memory runs pass, package the same build in
  `app.asar` and prove one canonical image loads; do not claim packaged evidence
  if an earlier Stop prevents the run
- retain the sanitized harness and synthetic files through one bound independent
  review, then delete them and keep only redacted evidence in the runthrough

Fixed stop lines: isolated identity counter is `0→1→1→1`; same-profile
post-restart revoked URL fails without cache clearing; canonical/alias identity
and other unauthorized/JS-read checks pass; no path/full IPC bytes/Blob URL
appear; heartbeat gap ≤50 ms; main synchronous segment ≤250 ms; each 4K open
ready ≤500 ms; every fresh-process whole-process peak delta ≤192 MiB. After
first-open warm-up, second/third post-close medians are each ≤first+16 MiB and
third ≤second+8 MiB.

Stop instead of widening E0F if Chromium gives canonical and alias different
handler/cache identities, cache serves a revoked id after restart, any
handler/file replay occurs after the first full load, security or memory misses
a line, or the direction needs manual cache, token service, alternate URL shape,
non-standard scheme, new dependency, product code/IPC, or a different owner. Do
not try another transport in E0F.

Observed result:

- canonical → `:444` alias → canonical loaded 3840×2160 with a phase-scoped
  handler counter of `0→1→1→1`; Renderer fetch/XHR/canvas reads and all sealed
  unauthorized routes remained blocked without path exposure
- a same-profile restart with the id unregistered and source moved failed the
  warmed URL without `clearCache`
- three fresh-profile runs with nine previews and one on-demand 4K image had
  whole-process peak deltas of 105.297, 103.555, and 104.844 MiB; every timing,
  handler, and post-close plateau line passed
- the same production build loaded 3840×2160 from `app.asar`; the scoped repair
  recorded runtime `appPath` and executable-path evidence
- independent review bound source fingerprints
  `14637395415f46fa6697af6917b08b143e9e81890690bd7e1210850eff2a6961`
  and `d6d41f4f8b52626e0ecd873f134791f7fec2b553f2cb5f900285f478ec8642fc`,
  then returned PASS; the OS-temp harness and synthetic data were deleted

Validation:

```sh
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

## E1: Image Refs And Current-Thread V3

Type: shared chat contract and current-thread schema/migration only.

Status: completed at `1bf91cf`; independent review `RC-E1-CODE-02` passed.

Allowed files:

```text
apps/desktop/shared/chat/types.ts
apps/desktop/shared/chat/snapshot.ts
apps/desktop/shared/contracts/desktop.ts only for required type propagation
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/snapshot.ts
corresponding near-source tests
```

Required:

- add `NyxChatImageRef`, optional new-message refs/pair payload boundary types,
  and user-message image availability projection without changing the existing
  text-only compatibility message list
- add current-thread v3 with required per-turn ordered refs; content may be empty
  only when refs are non-empty; keep image identity stable across terminal
  transitions and Retry and unique across the current thread
- keep v1/v2 stable reads byte-stable; v1 text mutation/recovery still reaches
  only v2, v2 text stays v2, first image-bearing mutation upgrades the complete
  record to v3, and later v3 text turns carry empty refs
- keep JSON free of bytes, URLs, paths, data URLs, original filenames, and
  Renderer-declared byte sizes; malformed/unknown future records fail closed
- update provider-history and snapshot pure projections for v3 refs; the
  snapshot mapper accepts an explicit set of available ids and E1 passes an
  empty set, so it performs no file IO. E2 wires the real bounded availability
  result without adding a second snapshot model
- preserve image-only turns as `{ role: 'user', content: '' }` in the pure
  text compatibility history; cover next-turn, Retry, and hydration mapping

Do not implement file import, `chat:accepted`, stable URLs, Provider mapping,
Composer UI, a new bridge method/channel, Connections changes, OCaml types, or
text-only behavior changes.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

Recorded result: shared refs, strict current-thread v3 migration, stable Retry
identity, image-only compatibility history, and explicit snapshot availability
projection are implemented. The full desktop suite passed with 356 tests and 16
skips; typecheck, compatibility typecheck, lint, format check, and
`runtime:chat-state:check` also passed. E1 added no file IO, protocol, Provider
image mapping, Renderer image UI, new IPC namespace, or OCaml type.

## E2: Main Image Import And Durable Acceptance

Type: Electron-main validation, canonical storage, and acceptance lifecycle.

Status: completed at `36e32e6`; independent review `RC-E2-CODE-03` passed.

Allowed files:

```text
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/file-adapter.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/snapshot.ts
apps/desktop/electron/main/current-thread/image-files.ts
apps/desktop/electron/main/current-thread/image-protocol.ts
apps/desktop/shared/chat/image-file.ts
apps/desktop/shared/chat/image-url.ts
apps/desktop/shared/chat/events.ts
corresponding near-source tests
```

Required:

- validate request shape, UUID ids, byte budgets, PNG/JPEG magic, pre-decode
  dimensions/pixels, decoded size, canonical/preview pair agreement, and MIME
  agreement
- keep one stateless shared byte parser for Renderer preflight and independent
  main validation; do not add a validator service or mutable cache
- treat canonical payload as untrusted; use header parsing plus Electron
  `nativeImage` decode for MIME/dimension agreement; accept only the v3.0 exact
  PNG chunks and byte-equal JPEG JFIF/ICC evidence, and never synchronously
  re-encode
- write `.full` and `.preview` final files before the pending record; emit the
  identity-only `chat:accepted` only from `ChatSessionManager` after record
  commit and before target resolution
- compose one current-thread image owner from `userData`; use it for coordinator
  prepare/reset/reconcile, protocol routing, Provider reads, and snapshot
  availability without a second Store
- register `nyx-image` before ready with only standard+secure privileges; handle
  exact canonical `preview|full` GET routes, authorize ids from the current
  durable record, and stream `net.fetch(file:)` without Renderer/full userland
  bytes or local paths
- snapshot returns refs + pair availability only; no bytes/URL/path. Missing
  pairs do not fail unrelated text/images, while Provider/Retry fail closed
- use one local write contract: `rename` resolve is committed; reject leaves the
  final path unchanged; do no fallible work after record rename before returning
- provide one main-only bounded image read that rejects symlinks, non-files,
  empty/truncated/mismatched/oversized files; protocol cache-miss serving uses
  bounded stat/header checks plus native streaming rather than that full read
- cover Stop before/after record commit, New thread reset-before-directory-delete,
  orphan reconcile, target-bind write failure, and stale session suppression

Do not add fsync/power-loss claims, cache/token manager, a second Store,
transaction manager, fresh-disk recovery, database, general Asset service,
remote upload, another IPC namespace, a codec dependency, `utilityProcess`, or
Runtime/Provider side effects after failed prepare/bind.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

Recorded result: strict shared/main validation, bounded immutable image pairs,
durable accepted/Stop ordering, stable main-authorized protocol streaming,
Retry fail-closed reads, reset/reconcile, and snapshot availability are
implemented. The full desktop suite passed with 385 tests and 16 skips;
typecheck, compatibility typecheck, lint, format check, production build, and
`runtime:chat-state:check` also passed. E2 added no Provider image mapping,
Renderer image UI, new IPC namespace, dependency, database, general Asset
service, or OCaml type.

## E3: Provider Image Mapping And Runtime Projection

Type: existing OpenAI-compatible mapping, safe errors, and text-only Runtime
projection.

Status: completed at `7677868`; independent review `RC-E3-CODE-02` passed.

Allowed files:

```text
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/shared/chat/types.ts
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/image-files.ts
apps/desktop/electron/main/current-thread/runtime-replay.ts
corresponding near-source tests
```

Required:

- preserve the existing text-only Provider request byte-for-byte; derive every
  image-bearing Provider message in main from the durable v3 record and the E2
  bounded canonical reader
- use a text-first content array followed by ordered transient data URLs;
  image-only messages omit the empty text part, and missing/corrupt files fail
  the whole build instead of silently dropping refs
- add `content_rejected` once to the shared error codes and v3 safe-error
  schema; map only image-bearing 400/413/415 to that retryable safe error, write
  the terminal record before emitting it, and never expose Provider bodies,
  Base64, ids, or paths
- let target-switch Retry reuse the same refs/files without copy or rewrite;
  retain current text-only 400 behavior
- keep Runtime start/replay text-only, projecting exactly `userContent`; an
  image-only turn projects the empty string and does not change OCaml types or
  protocol

Do not add capability inference/cache/registry, provider-specific parameters,
remote upload, raw Provider errors, or any new OCaml message/type.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run runtime:chat-state:check
```

Recorded result: Electron main now derives ordered text/image Provider messages
from the committed v3 record and bounded canonical reader while Runtime remains
text-only. Image-bearing 400/413/415 responses become the fixed retryable
`content_rejected` error without exposing upstream bodies, ids, paths, or
Base64. Stop, Reset, Retry, target switching, image-only turns, and durable-
before-Renderer ordering are covered. The desktop suite passed with 401 tests
and 17 skips; typecheck, compatibility typecheck, lint, format check, production
build, and `runtime:chat-state:check` with 9 cases also passed. E3 added no
Renderer/Composer UI, Worker, new IPC namespace, capability registry, remote
upload, dependency, or OCaml type.

## E4: Composer Images, Thread Display, And Hydration

Type: bounded Renderer interaction and projection.

Status: completed at `b13d3b8`; independent review `RC-E4-CODE-02` passed.

Allowed files:

```text
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/chat-reducer.ts
apps/desktop/src/ui/chat/chat-types.ts
apps/desktop/src/ui/chat/chat-presenters.ts
apps/desktop/src/ui/chat/image-canonicalizer.worker.ts
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/ui/chat/components/ChatComposer.tsx
apps/desktop/src/ui/chat/components/ChatThread.tsx
apps/desktop/src/ui/chat/components/ChatMessage.tsx
corresponding near-source tests and existing chat styles
```

Required:

- preserve the textarea and normalize picker/paste/drop images into one draft
  path; ordinary text paste/drop retains browser behavior
- use one lazy sandboxed Worker for `preparing -> ready | failed`; transfer
  source/canonical/preview buffers, discard stale results, and release every
  Worker, bitmap, buffer, and draft object URL on its terminal path
- support ordered preview/remove and image-only Send; Send is enabled only when
  all images are ready, and the captured draft remains visible and locked until
  the identity-only `chat:accepted`
- make accepted the reducer commit point: before it, failure retains draft,
  target, and existing Retry error; after it, clear only the captured draft and
  insert/update the turn. A streaming response may coexist with a new editable
  draft, but that draft cannot Send
- retain the original `File`/`Blob` only until Worker ready; failed drafts keep
  it for Retry/remove, while ready drafts release it and retain only the two
  outbound buffers plus preview URL. Do not retain bitmap/canvas/full DOM bytes
- keep image-only user entries in the text compatibility mapper so next-turn,
  Retry, and hydrated requests match main's durable history
- use E2 stable preview/full URLs for sent and hydrated images, never accepted
  or snapshot bytes and never a Renderer cache; render one native dialog with
  at most one full image, an unavailable placeholder, focus return, keyboard
  behavior, labels, and `aria-live` feedback

Do not add contenteditable/rich text, drag sorting, crop/annotation/OCR, a
global image cache, Worker pool/manager, third-party image/image-processing
dependency, unrelated Composer redesign, Renderer file paths/credentials/raw
Provider config, or durable Renderer ownership.

Validation:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
mise run desktop:build
```

Recorded result: picker, paste, and supported-image drop now share one bounded
draft path backed by one lazy sequential Worker. Image-only Send, ordered draft
previews, accepted-only reducer commit, pre-accepted draft retention, Retry,
stable sent/hydrated image URLs, unavailable placeholders, and one native full-
image dialog are implemented. Reset failure retains unsent text and every draft
resource; successful reset, accepted, remove, stale result, and unmount paths
release their owned resources. The desktop suite passed with 417 tests and 17
skips; typecheck, compatibility typecheck, lint, format check, and production
build also passed, including a separate Worker chunk. E4 added no new IPC,
dependency, Renderer cache, rich text, assistant image output, Provider policy,
or OCaml change.

## E4M: Worker Live-Set Repair Gate

Type: one bounded E4 owning-slice repair experiment.

Status: stopped. The v3.2 amendment passed `RC-E4M-PLAN-02`, but the first valid
4K repetition failed the fixed memory line and `RC-E4M-EVIDENCE-01` returned
`VALID_STOP`. Repetitions 2/3 and the ordinary matrix were not run; the
uncommitted Worker change was reversed.

Allowed product file:

```text
apps/desktop/src/ui/chat/image-canonicalizer.worker.ts
```

Required:

- preserve the exact current decode, canonical/preview bytes policy, parser,
  transfer, sequential Worker, safe error, and main-owned validation behavior
- clear the source after decode; draw both canvases while the bitmap is valid,
  then close it before encoding; release each canvas/context after its encode
  and each encoded Blob immediately after its buffer conversion; `finally`
  releases every remaining reference without adding a full-resolution copy
- add no helper, abstraction, dependency, cache, Worker/process, IPC, scheme,
  capacity, quality, or dimension change
- build the production Worker and run the exact reviewed 3840×2160 fixture
  through the packaged real E4 drop path in three fresh processes/profiles
- preserve the E5 timing lines and require every repetition's recursive whole-
  process peak delta to remain <=192 MiB; stop on the first failure
- after all 4K repetitions pass, rerun the four-ordinary-image packaged real E4
  import matrix in the new build and a fresh process/profile; do not reuse the
  pre-change evidence, and apply its existing timing and <=192 MiB lines
- bind source, build, `app.asar`, commands, process tree, samples, and result for
  independent code/evidence review

If all three repetitions pass, commit only after independent review and resume
E5 at its unrun remainder. If any fails, reverse the uncommitted Worker change,
record `VALID_STOP`, and require a new user decision. Do not try a second code
variant inside E4M.

## E4R: 2048-Edge Decoder Resize Gate

Type: one bounded E4 owning-slice product repair candidate.

Status: stopped. The user approved proportional downscale instead of full-4K
canonical support, and the revised plan passed `RC-E4R-PLAN-03`. The packaged
oversized EXIF-orientation gate then failed: Chromium independently decoded the
source as portrait, while the product persisted landscape full and preview
output. The ordinary matrix was not run and the uncommitted E4R product diff was
reversed. The user subsequently approved bounded E4L; E4L is the only executable
E slice at that point. E4L later completed at `5ed2b06` and passed
`RC-E4L-CODE-02`.

Allowed product files:

```text
apps/desktop/shared/chat/image-file.ts
apps/desktop/electron/main/current-thread/image-file.test.ts
apps/desktop/electron/main/current-thread/image-files.ts
apps/desktop/electron/main/current-thread/image-files.test.ts
apps/desktop/src/ui/chat/image-canonicalizer.worker.ts
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/use-chat-session.test.ts
```

Required:

- keep the existing 8192-edge / 8,294,400-pixel source preflight and historical
  durable reader so pre-E4R images remain valid for hydration, Provider build,
  and Retry
- add one fixed 2048-pixel canonical long-edge limit for new imports only;
  proportionally downscale without crop or upscale via `createImageBitmap`
  resize options before the full canonical canvas is allocated
- before allocating the full canvas, verify the oriented bitmap's long edge and
  aspect ratio; do not assume source SOF width/height has the same orientation
  as the bitmap after EXIF orientation
- preserve same-MIME canonical output, JPEG 0.95, 512-edge PNG preview, strict
  parser, sequential Worker, transferable buffers, and all existing owner and
  accepted/durable boundaries
- have Worker reject an over-limit output and Electron main independently
  enforce the new limit only while validating a newly written pair; do not apply
  the new limit in `readCanonical`
- add a boundary regression using one valid `>2048` canonical that remains under
  the historical source limits: new `writeNewImages` rejects it while historical
  `readCanonical` succeeds
- add no UI, setting, dependency, helper layer, Worker/process, IPC, schema,
  cache, original retention, format, Provider/Runtime behavior, or general Asset
  abstraction
- because the old OS-temp E5 fixture is no longer present, pre-bind the two-file
  generator at combined SHA-256 `d7595a...d6eaf`: Electron 41.7.2 / Chromium
  146 creates one 3840x2160 canvas; seed `0x4e595845` advances xorshift32 once
  per RGB pixel and writes its three state bytes with alpha 255; the sole encoder
  call is `canvas.toBlob("image/jpeg", 0.85)`
- after this amendment passes review, execute that exact generator command once
  in a separate unmeasured process; the first output must be a 3840x2160 JPEG
  under the existing 8 MiB source cap, otherwise Stop without changing seed,
  quality, algorithm, source, or command and without rerunning it; before counted
  runs bind bytes, SHA-256, size, type, metadata, source hash, command, and
  Electron/Chromium versions
- retain the three already recorded fresh-process packaged 4K observations as
  bounded engineering evidence: all produced 2048x1152 canonical and 512x288
  preview output, passed product timing lines, and observed 112,041,984 to
  114,753,536-byte recursive peak deltas; none is a strict memory proof because
  the sampler validity conditions did not all pass
- under the user-approved v3.4 evidence-policy amendment, stop iterating the
  sampler and do not require each `ps` call to return within 30 ms or all three
  observations to be formally countable; retain the 192 MiB product stop line,
  so any later observed peak above it still stops E4R
- use the same build to run one oversized EXIF 90° or
  270° production-Worker fixture and prove correct orientation, aspect ratio,
  no crop, and no stretch; if native resize cannot do this, Stop without an EXIF
  parser or dependency
- then run the four-ordinary-image packaged real E4 matrix once in another fresh
  process/profile and preserve its output/timing/memory observations; sampler
  execution duration is diagnostic rather than a product gate, while any
  observed peak above 192 MiB remains a Stop; bind source/build/`app.asar`/
  commands/process samples/results for independent code/evidence review

If all product checks pass, commit only after independent review and resume E5
at its unrun remainder. If product correctness, product timing, or an observed
memory peak fails, reverse the uncommitted E4R product diff, record the bounded
Stop, and require a new user decision. Do not try a second size, encoder,
transport, memory line, or sampler inside E4R.

Recorded outcome: the oversized EXIF orientation-6 source independently decoded
as 1800x3000, but the packaged product persisted a 2048x1229 full image and a
512x307 preview instead of the required 1229x2048 and 307x512 portrait outputs.
Ready was 263.8 ms, heartbeat max gap was 13.4 ms, main sync was 170.0 ms, and
the observed recursive peak delta was 88,850,432 bytes, so orientation was the
first product failure. The ordinary matrix was not run. The E4R product diff was
precisely reversed; this section is historical evidence, not implementation
permission.

## E4L: 4-MiPixel New-Import Limit

Type: one bounded E4 owning-slice fallback.

Status: complete at `5ed2b06`; independent diff review `RC-E4L-CODE-02` passed.
E4R, E4M, and E5 remain stopped; no E slice is executable pending a new user
decision.

Allowed product files:

```text
apps/desktop/shared/chat/image-file.ts
apps/desktop/electron/main/current-thread/image-files.ts
apps/desktop/electron/main/current-thread/image-files.test.ts
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/use-chat-session.test.ts
```

Required:

- add one fixed 4,194,304-pixel limit for new imports only
- reject an oversized PNG/JPEG from parsed header dimensions before starting
  the existing Worker and show the existing failed-draft/composer-notice path
- have Electron main independently reject a newly written canonical pair above
  the same limit
- keep `readCanonical` on the historical 8,294,400-pixel limit so hydration,
  Provider build, and Retry remain compatible
- do not change byte/edge limits, Worker, encoder, preview, schema, IPC, UI
  structure, format, dependency, Provider, Runtime, or E5 behavior
- cover the exact boundary, one over-limit new write, historical over-limit read,
  and ordinary picker/paste/drop paths

If automated checks, ordinary acceptance, and independent diff review pass,
commit E4L. Any data-loss, compatibility, or preflight-bypass finding returns to
E4L for one bounded repair; do not add resize behavior inside this slice.

Recorded outcome: desktop checks passed with 418 tests and 17 skips plus 9
runtime chat-state tests. Packaged fresh-profile picker JPEG, paste PNG, and drop
JPEG imports reached ready and were accepted by main. A 3840x2160 JPEG was
rejected in Renderer preflight with the visible 4-MP notice, started zero
Workers, and remained removable. The acceptance artifact was loaded from an
`app.asar` at SHA-256
`46c1488bb39c70b59ce76203d2efaed00d1f31e67396a1e467ce4b703f907e68`;
the result JSON SHA-256 was
`df5e898b7bd2d3dc6893f12e1aa724cdbf6c2d5199f5f0fc8601bd1b1c8a1a15`.

## E5: Context Composer Lifecycle Acceptance And Docs

Type: acceptance verification and documentation sync.

Status: stopped. After policy A and `RC-E5-PLAN-A-02`, the fresh-process 4K
import measured +309.859 MiB against the fixed +192 MiB line. Independent review
`RC-E5-4K-MEMORY-01` returned `VALID_STOP`. E5 remains stopped while E4M is
stopped and E4R is also stopped. E4L is complete; no E slice is executable.

Allowed files: E1-E4 production files only for fixes returned to their owning
slice, corresponding tests, and:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/context-composer-experiment-runthrough.md
```

Required:

- prove text-only parity plus text+image, image-only, ordered multi-image,
  hydration, missing/corrupt placeholder and fail-closed Provider/Retry paths
- prove accepted ordering, failure-before-accept retention, Stop before/after
  commit, bind failure, restart/interrupted pending, stale events, New thread
  reset ordering, orphan reconcile, and every draft object-URL terminal path
- rerun the protocol canonical-alias/security/JS-read/cache/restart-revocation
  matrix and production Worker from the packaged app; evidence must bind the
  running app to the reviewed build. Raw port/case/fragment/credentials spelling
  erased before `protocol.handle` is the same canonical identity and carries no
  authority; any observable credentials, query, wrong host, unknown id,
  traversal, or non-GET request still fails closed
- through the real E4 import handler in that packaged product, run four ordinary
  images and one high-entropy 4K image across picker/paste/drop -> Worker -> main
  validation; record 4-image ready <=1.5 s, 4K ready <=1 s, heartbeat <=50 ms,
  single-image main sync <=250 ms, and each whole-process peak delta <=192 MiB.
  Use a fresh process and stop this import-phase sample after accepted/main-
  validation settle and before Provider build
- mount the real product grid at 12 refs/24,883,200 full pixels, open the max
  image in the single dialog, and build the 32 MiB Provider request concurrently;
  require open <=500 ms, heartbeat <=50 ms, main sync <=250 ms, whole-process
  peak delta <=192 MiB, and the E0F 16/8 MiB post-close plateau allowance
- complete one real target text+image and image-only run; use a second target for
  reject/switch/retry when available, and record exact redacted evidence without
  claiming unobserved behavior
- verify that disabling new image ingress still preserves v3 read/display,
  historical Provider reconstruction, Retry, safe errors, and reset/reconcile

Do not fix failed acceptance outside its owning E1-E4 boundary or broaden E into
documents/remote files, general assets/parts, capability policy, assistant rich
output, Markdown/HTML/Artifact/Generative UI, history, tools, agents, new IPC,
or new OCaml protocol.

Validation:

```sh
mise run desktop:test
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:build
mise run runtime:chat-state:check
mise run desktop:check
mise run check
mise run format-check
git diff --check
```

## F Workstream: Document Attachments Local Baseline

Status: `document-attachments/S0` passed review and landed at `43a2020`.
`document-attachments/G1` then stopped under `RC-DOC-G1-EVIDENCE-01` because
the reviewed candidate accepted a valid ZIP64 DOCX. The user approved option A:
defer DOCX and continue strict text plus text-bearing PDF. The reduced v2.5 G1
amendment passed `RC-DOC-V25-PLAN-01`, so only the reduced OS-temp G1 gate is
executable. It then passed `RC-DOC-G1-REDUCED-EVIDENCE-01`; only
`document-attachments/D1` became executable. D1 completed at `42e4ade` and
passed `RC-DOC-D1-CODE-03`. D2 completed at `bde0021`; the D3 acceptance
matrix passed. `RC-DOC-D3-F001-R1` repaired the sole final-review finding, and
scoped `RC-DOC-D3-FINAL-CODE-01` passed. The local baseline is complete; no
document-attachments slice is executable. Native PDF `N0/N1` remains deferred
and non-executable.

The amended plan is
[document-attachments-technical-plan.md](./document-attachments-technical-plan.md)
v2.5 at SHA-256
`38714f5888a17438848e37ca27be629114a7e2fe9f2c08a05e9b5b3006c50f4c`.
Its independent review receipt `RC-DOC-V25-PLAN-01` authorized the reduced G1
gate, which later completed under `RC-DOC-G1-REDUCED-EVIDENCE-01`. Evidence
belongs in
[document-attachments-runthrough.md](./document-attachments-runthrough.md).

Inside this F section, unqualified `S0`, `G1`, and `D1` through `D3` refer only
to the `document-attachments` slices defined here. Outside this section, an
unqualified `D1` through `D3` still refers to the completed Composer
target-selection workstream.

The only allowed order is:

```text
document-attachments/S0
  -> document-attachments/G1
  -> document-attachments/D1
  -> document-attachments/D2
  -> document-attachments/D3
```

No later slice may begin before the previous slice passes its evidence and
independent-review gate. This workstream does not reopen E4R, E4M, E5, or any
other stopped Context Composer slice.

### Locked local-baseline behavior

- The existing attach button and drop path may eventually accept one supported
  document per turn. Clipboard paste remains image-only.
- The candidate first slice supports strict UTF-8 TXT, Markdown, and CSV plus
  text-bearing PDF. DOCX is deferred.
- Renderer owns only the unsent draft and its feature-local Worker. Electron
  main remains authoritative for validation, file IO, capacity, durable state,
  target resolution, Provider mapping, Retry, reconciliation, and safe errors.
- Main durably stores the source bytes and the exact accepted local text
  projection. Retry, restart, later turns, and target changes reuse that
  projection instead of reparsing.
- Existing OpenAI-compatible Chat Completions targets receive the verified
  local text projection as ordinary user-message text. They never receive the
  failed inline `file_data` shape.
- Existing text-only and image-only Provider request bodies remain unchanged.
- Drafts clear only after durable `chat:accepted`; preparation or pre-accept
  failure preserves the draft.
- Missing, changed, invalid, empty, or over-limit document content fails before
  Provider fetch. Extracted text is never silently truncated.
- The OCaml protocol remains unchanged. A document-only turn uses the existing
  attachment-only empty-user-string compatibility projection.
- Do not introduce a generic Asset service, arbitrary content-part registry,
  new IPC namespace, capability matrix, automatic route/fallback, RAG, OCR,
  rich preview, remote file id, or native Provider protocol in this local
  workstream.

### Frozen first-slice limits

G1 passed with these values unchanged, so they are frozen for D1-D3. Raising
any value requires a new user decision and reviewed plan amendment.

```text
documents per turn:                    1
documents in the current thread:       8
source bytes per document:             8 MiB
extracted UTF-8 bytes per document:    128 KiB
extracted UTF-8 bytes/current thread:  256 KiB
PDF pages:                              50
extraction wall-clock timeout:          10 seconds
```

Canonical image bytes and document source bytes share the existing 32 MiB
current-thread attachment budget. The current-thread coordinator owns the one
cross-store preflight. Existing image count, pixel, format, per-item,
canonical-byte, preview-byte, and per-turn checks remain unchanged. Extracted
document text has the separate 256 KiB current-thread budget above.

Resource stop lines for G1 and the real packaged D2 path are:

```text
Renderer heartbeat gap:                 <= 50 ms
Electron-main synchronous segment:      <= 250 ms
whole-process peak working-set delta:   <= 192 MiB
```

### document-attachments/S0: Docs-only scope lock

Type: documentation only.

Allowed tracked files are exactly:

```text
AGENTS.md
apps/desktop/AGENTS.md
docs/next/agent-workbench-task-slices.md
docs/next/document-attachments-technical-plan.md
docs/next/document-attachments-runthrough.md
```

Required:

- bind the reviewed v2.4 plan, strict-review result, exact slice order, allowed
  files, candidate limits, ownership invariants, and Stop conditions
- preserve all Context Composer stopped status and historical boundaries
- make G1 the only next executable slice only after this docs diff passes
  independent review and its scope-lock commit is present in current HEAD
- change no product code, tests, dependency, schema, IPC, or persisted data

### document-attachments/G1: Bounded extractor gate

Type: OS-temp feasibility evidence only.

Status: complete. The first candidate reached `PASS_VALID_STOP` under
`RC-DOC-G1-EVIDENCE-01` after accepting a valid ZIP64 DOCX. The user approved
option A: DOCX is deferred. The reduced strict-text/PDF G1 remainder becomes
executable only after the v2.5 amendment passes independent review. It passed
`RC-DOC-G1-REDUCED-EVIDENCE-01` without changing product code or dependencies.

Tracked-file ownership is the same five documentation files allowed by S0. The
harness and candidate dependency installation must stay in one `mktemp -d`
directory. G1 may not change `apps/desktop/package.json`, `pnpm-lock.yaml`, any
tracked product/test file, or real current-thread data.

Use the exact `pdfjs-dist` candidate and the platform `TextDecoder`. Prove
strict TXT/MD/CSV decoding, exact page-separated PDF output, source-digest
parity, cancellation, timeout, and the complete malformed, encrypted,
no-text, page-limit, output-limit, and near-limit matrix in the amended plan.
Bind source, dependency, fixtures, commands, results, measurements, and
environment; obtain independent review; then delete the temp harness.

PDF failure stops the workstream for user direction. Do not add a DOCX
candidate, silently remove another format, or raise a limit.

### document-attachments/D1: Contract, v4 durability, and document files

Status: complete at `42e4ade`; independent review `RC-DOC-D1-CODE-03` passed.

Allowed tracked production and near-source test files are exactly:

```text
apps/desktop/shared/chat/document-file.ts
apps/desktop/shared/chat/document-file.test.ts
apps/desktop/shared/chat/types.ts
apps/desktop/shared/chat/snapshot.ts
apps/desktop/electron/main/current-thread/schemas.ts
apps/desktop/electron/main/current-thread/store.ts
apps/desktop/electron/main/current-thread/store.test.ts
apps/desktop/electron/main/current-thread/file-adapter.ts
apps/desktop/electron/main/current-thread/image-files.ts
apps/desktop/electron/main/current-thread/image-files.test.ts
apps/desktop/electron/main/current-thread/document-files.ts
apps/desktop/electron/main/current-thread/document-files.test.ts
apps/desktop/electron/main/current-thread/session-coordinator.ts
apps/desktop/electron/main/current-thread/session-coordinator.test.ts
apps/desktop/electron/main/current-thread/snapshot.ts
apps/desktop/electron/main/current-thread/snapshot.test.ts
apps/desktop/electron/main/current-thread/runtime-replay.ts
apps/desktop/electron/main/current-thread/runtime-replay.test.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/index.test.ts
```

The five S0 documentation files are also allowed for evidence and status. Any
new production path or dependency is a Stop and requires a reviewed amendment.

D1 adds only document-specific contracts, current-thread v4, source/text
sidecars, cross-store preflight, mixed rollback, reconciliation, Retry,
snapshot, reset, compatibility replay, and the fail-closed main guard described
in the plan. The guard must reject every product document request before file
IO, record mutation, acceptance, target resolution, or Provider fetch. D1 is not
a deployable attachment feature.

### document-attachments/D2: Local vertical slice

Status: complete at `bde0021`; D3 acceptance evidence is recorded in
[document-attachments-runthrough.md](./document-attachments-runthrough.md).

In addition to the D1 files needed to remove the guard and materialize verified
document text, allowed tracked files are exactly:

```text
apps/desktop/package.json
pnpm-lock.yaml
apps/desktop/electron-builder.config.mjs
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/src/styles/index.css
apps/desktop/src/ui/chat/document-extractor.worker.ts
apps/desktop/src/ui/chat/chat-types.ts
apps/desktop/src/ui/chat/chat-reducer.ts
apps/desktop/src/ui/chat/chat-reducer.test.ts
apps/desktop/src/ui/chat/chat-presenters.ts
apps/desktop/src/ui/chat/chat-presenters.test.ts
apps/desktop/src/ui/chat/thread-items.ts
apps/desktop/src/ui/chat/thread-items.test.ts
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/use-chat-session.test.ts
apps/desktop/src/ui/chat/components/ChatComposer.tsx
apps/desktop/src/ui/chat/components/ChatComposer.test.ts
apps/desktop/src/ui/chat/components/ChatMessage.tsx
apps/desktop/src/ui/chat/components/ChatMessage.test.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts
```

The five S0 documentation files and the D1 file list remain allowed. Add only
the exact `pdfjs-dist` version proven by G1. D2 owns the feature-local Worker,
picker/drop draft and cards, accepted-only clearing, local text materialization,
safe attachment errors, deterministic Stop races, and the real packaged
resource gate. The user approved the one-file packaging amendment on 2026-08-10:
the existing electron-builder `files` owner must exclude PDF.js's unused optional
Node canvas packages from the Renderer-only product path. Any need for a new
protocol, IPC namespace, generic attachment
abstraction, or file outside these lists is a Stop.

### document-attachments/D3: Product acceptance and status

Status: complete. The acceptance matrix passed; `RC-DOC-D3-F001-R1` repaired
the sole final-review finding, and scoped `RC-DOC-D3-FINAL-CODE-01` passed.

D3 may change the five S0 documentation files. Product/test fixes are allowed
only by returning to the owning D1 or D2 file list; D3 may add no new product
file or behavior.

Run the reviewed synthetic TXT, CSV, and multi-page PDF matrix in dev and
the packaged product. Cover document-only, mixed text/image/document, later
turn, restart, target-switch Retry, Stop, New thread cleanup, no-fetch rejection,
and existing text/image regression. Record every configured current target;
at least one must semantically pass TXT and PDF. After independent final
code review, promote only the target/format claims actually observed.

### Native PDF N0/N1: Deferred and non-executable

Native PDF does not block the local baseline. N0 may be planned only when one
configured real target can test a specific native protocol. N1 may begin only
after N0 semantically proves that target's PDF and image shapes. Neither slice
is authorized here; no capability field, Connections migration, Provider file
id, SDK, adapter registry, or placeholder protocol may be added in advance.

### Workstream stop conditions

Stop and request user direction if any slice requires:

- synchronous PDF parsing on Electron main
- acceptance before source, extracted text, and pending turn are durable
- silent text truncation or a higher candidate/resource limit
- a transitive-only parser dependency
- weakening current image durability, validation, Retry, or safe-error behavior
- a generic Asset service, content-part registry, new IPC namespace, or OCaml
  protocol change
- remote Provider file ids, automatic routing, hidden fallback requests,
  hostname/model inference, or a capability matrix
- a native Provider protocol before a configured live N0 gate passes
- a file or behavior outside the active slice's exact allowed list

Validation for S0:

```sh
mise run desktop:format-check
git diff --check
```

## MTL Workstream: Multi-Thread Library

Status: S0 is complete. G1 and G2 both reached independently reviewed
`VALID_STOP`. The v5.3 landing candidate passed its recorded exact-byte reviews
and entered HEAD at `5a1aeae`, so its self-ratchet is complete. G2R then reached
independently reviewed `VALID_STOP`; Permanent delete remains absent. G1W's
release-shape contract correction entered HEAD at `2196ea6`, and corrected
evidence then passed independent review. The docs-only D1 scope lock completed
at `0e3b2ef` after review `NYX-MTL-D1-SCOPE-20260812-03`; D1-R completed at
`0e4f02e`, and D1 code completed at `8d4d73e` after review
`NYX-MTL-D1-CODE-20260813-03`. The D2 scope lock completed at `5efed87`, and
D2 code completed at `15c8b00` after reviews
`NYX-MTL-D2-CODE-20260813-04` and
`NYX-MTL-D2-EVIDENCE-20260813-02`. The C1 scope lock completed at `b647cde`
after review `NYX-MTL-C1-SCOPE-20260813-01`. The title-identity amendment entered
HEAD at `d099eec`; C1 completed at `8b7150e` after independent final review
`NYX-MTL-C1-FINAL-CODE-20260813-02`. The E1 scope lock completed at `786cd50`,
but its first valid cap-2 sample failed the existing Main/RSS lines and stopped
that implementation attempt. The E1R amendment below now self-completes on
exact review plus HEAD; before that it is the only executable tracked-file
step. After completion only E1R/G0 is executable. Old E1 product bytes,
E1R-P1/E1R-P2, resumed E1 and U1 remain blocked.

The reviewed source is
[multi-thread-library-technical-plan.md](./multi-thread-library-technical-plan.md)
v5.4 at SHA-256
`fb513b014c18717b18521b3000318fc7c96de51c028981e6bb9153dc0098c228`.
Durable gate evidence is in
[multi-thread-library-runthrough.md](./multi-thread-library-runthrough.md).

Inside this section, unqualified S0, G1, G2, G1W, G2R, D1, D2, C1, E1, E1R,
U1, L1, Q1, A1, M1, and P1 refer only to this workstream. `E1R-P1` and
`E1R-P2` are qualified performance-stage names; unqualified P1 remains
Permanent delete.

The only allowed dependency order is:

```text
S0
├─ G1 [VALID_STOP] → v5.3 → G1W → D1 → D2 → C1 scope → v5.4 title amendment → C1 code → E1 scope → E1 cap-2 [VALID+FAIL → STOP] → E1R amendment → G0
└─ G2 [VALID_STOP] → v5.3 → G2R

G2R + M1 → P1

G0 reviewed PASS ⇢ E1R-P1 scope → E1R-P1 → E1R-P2 → new E1 scope → resumed E1 → U1 → L1 → Q1 → A1 → M1
                      [conditional and not authorized by this amendment]
```

No later slice may begin before every dependency passes its evidence and
independent-review gate. Every arrow into a tracked product slice also requires
`multi-thread-library/<slice>-scope-lock`: a one-file update to this document
that freezes exact allowed files, checks, review binding, and status. The
product slice begins only after that independent scope review is in HEAD.
G1/G2/G1W/G2R must leave the tracked worktree clean.

### Locked scope and supersessions

Only this named workstream may:

- replace the one durable v5 current-thread record with one Main-authorized
  Thread Library whose single SQLite connection runs only in one application
  Node Worker and whose canonical bytes remain in Thread-owned sidecars;
- add persistent history, switching, Pinned/Recent, Rename, Archive, Unarchive,
  Trash, Restore and bounded Search;
- add `window.nyx.threads`, retain and thread-scope `window.nyx.chat`, and
  persist only a materialized Draft's safe target selection id;
- replace global execution with at most one Run per Thread and bounded
  cross-Thread concurrency without changing the OCaml protocol;
- add Permanent delete only after G2R, complete reversible-library A1 and
  post-acceptance legacy cleanup M1 pass. Through M1, no purge table, IPC, menu
  item, or disabled affordance may exist.

Resolved targets, raw provider configuration, base URLs, protocols and
credentials stay Main-only. Ordinary work remains on min-chat. Projects,
Folders, Tags, full manual ordering, multi-window/cloud sync, auto-empty Trash,
tools, MCP, agents, artifacts, a general Asset service, ORM/repository, Worker
pool, queue/daemon and a new OCaml Thread domain remain out of scope.

### multi-thread-library/S0: Canonical scope lock

Status: complete. Exact-byte reviews:
`NYX-MTL-S0-PRODUCT-20260812-03`, `NYX-MTL-S0-DESIGN-20260812-03`, and
`NYX-MTL-S0-SCOPE-20260812-03`.

### multi-thread-library/G1: SQLite on Electron Main

Status: `VALID_STOP`. Evidence SHA-256
`08344163b01574bf1327e33151d982d55871151dd382dca15a82868996d62f0a`.
Production build observed one synchronous Draft commit at `19.623 ms`, above
the fixed `16.667 ms` line. SQLite correctness passed; Main-event-loop
`DatabaseSync` did not. Independent evidence review:
`NYX-MTL-GATES-EVIDENCE-20260812-01`.

### multi-thread-library/G2: Same-process image revocation

Status: `VALID_STOP`. Evidence SHA-256
`86143ad9ebf80ffb6957b354e509633432c5b7c8b71df87b27bb5f44dd5ec8ae`.
`no-cache` and `session.clearCache()` failed warmed-resource revocation;
`no-store` passed revocation/security but crossed fixed repeated-open memory
plateau lines. Permanent delete remains absent. Independent evidence review:
`NYX-MTL-GATES-EVIDENCE-20260812-01`.

### multi-thread-library/V5.3: Stop-driven docs amendment

Type: documentation only.

Status: complete at `5a1aeae` through its no-follow-up self-ratchet. The
following exact reviews passed for the same six-file bytes before they entered
HEAD.

The required final full-review bindings are
`NYX-MTL-V53-PRODUCT-FULL-20260812-07`,
`NYX-MTL-V53-DESIGN-FULL-20260812-07`, and
`NYX-MTL-V53-LINUS-FULL-20260812-07`. This amendment passes only when all three
return PASS/accept for this exact six-file artifact and the reviewed bytes enter
HEAD.

Allowed tracked files are exactly:

```text
AGENTS.md
apps/desktop/AGENTS.md
DESIGN.md
docs/next/agent-workbench-task-slices.md
docs/next/multi-thread-library-runthrough.md
docs/next/multi-thread-library-technical-plan.md
```

Required: preserve the two valid Stops; move all SQLite execution to one
feature-local Node Worker behind an Electron-native single-instance lock; give
materialize a Main-generated stable Thread id and unknown-commit recovery; add
Draft then process-wide unsaved-result app-quit barriers before the shutdown
fence and a non-destructive Library unavailable Retry-only state plus a stable
Thread-scoped unavailable row; preserve
outcome-unknown Responses sidecars until exact canonical reconciliation; add
native close/full-image focus, settlement-failed lifecycle, latest-Search
announcements/failure/truncation, 50-row collection paging with one common
out-of-loaded selection rule, unavailable focus, collision-free generic title,
bridge method ratchets, resource-level degradation and Pin/Unpin remount focus;
make deep-page title hits retain Thread-heading focus, keep generic survivor
ordinals stable and allocate max + 1 until that second has no identity, use only legal document
capacity in Search evidence, order Running intent before the Draft barrier, and
list exact affected Thread identities in every unsaved-result quit barrier;
freeze one Main-authoritative 1–48-code-point manual Rename validator with
explicit errors and no silent truncation;
add G1W/G2R without product wiring; define
Unarchive/Restore and remove undefined transient Undo; bind image-bearing
Thread/mode/Search teardown and distinct-image memory checks to U1/L1/Q1/A1;
add fixed Sidebar regions, Back to threads, Search cancel/open state, bounded
Search coalescing and performance lines, deterministic pre-send titles,
Available/Archived-only Rename, stable lifecycle ordering, safe
running/navigation dialogs, Main-acked Draft Search and one-command Worker
consistency; make C1 the atomic
import/activation cutover, A1 the full reversible-library acceptance and M1 the
only post-acceptance legacy cleanup; remove unsupported power-loss claims; keep
P1 absent until G2R+M1;
record exact plan hash and independent product/design/strict review ids. No
code, test, dependency, schema, IPC, persisted data or runtime behavior may
change.

V5.3 required format-check, `git diff --check`, exact allowed-file and plan-hash
checks, all three independent reviews, and the same bytes entering HEAD. Those
conditions were satisfied at `5a1aeae`; this subsection now records the
historical ratchet and does not authorize another V5.3 edit.

### multi-thread-library/G1W: Whole-DB Node Worker gate

Type: OS-temp production-shape feasibility only.

Status: executed after the V5.3 self-ratchet. The product-relevant matrix
and corrected release-shape evidence passed independent review
`NYX-MTL-G1W-EVIDENCE-V3-20260812-03`; G1W is complete. Evidence SHA-256:
`5051863dc6cc81dd88b0524f8a08f44e167712528ddae28058bffba7efaa2e3d`.
The standalone raw-Electron `app.asar` wording in this historical paragraph is
superseded by G1W-A. The gate otherwise used one Worker, one `DatabaseSync`
connection and one static Main build entry. No
tracked file, product schema/IPC, raw-SQL RPC, Main fallback, pool,
`utilityProcess`, ORM/repository or dependency change is allowed. It must prove
dev/build/final-packaged-archive loading, G1 correctness/crash fixtures, bounded
Main reply/clone/publication latency, FIFO snapshot ordering, CAS conflicts,
stable-id materialize recovery without automatic replay, other unknown-commit
reconciliation including terminal providerStateRef retention after reply loss,
generation invalidation and window/app lifecycle. The same
profile must also launch two packaged processes and prove the secondary touches
no DB, Worker, staging, sidecar, image authorization, or legacy root while the
primary retains one event domain.

Failure leaves D1 blocked and returns to planning.

### multi-thread-library/G1W-A: Release-shape archive evidence correction

Type: documentation-only correction to the G1W evidence contract.

Status: complete at `2196ea6`. Scoped review
`NYX-MTL-G1W-ARCHIVE-CONTRACT-20260812-02` accepted the exact bytes before they
entered HEAD. Review `NYX-MTL-G1W-ARCHIVE-CONTRACT-20260812-01` required only
the historical-status alignment present in that accepted revision.

This subsection narrowly supersedes the standalone `app.asar` launch wording
in v5.3 and the G1W subsection above. A raw Electron executable directly
targeting an archive copied from a packaged application creates a hybrid state:
`app.isPackaged` is false while `app.getAppPath()` points inside release
artifacts. That state changes application identity and Renderer/resource
lifecycle semantics, is not a Nyx release path, and duplicates the archive-load
proof already exercised by the packaged application. Such a run is neither a
required G1W sample nor decision-eligible PASS/Stop evidence. Existing failed
attempts remain disclosed as invalid orchestration; they are not erased or
reclassified.

For G1W, final-archive validation instead requires one fresh-profile FULL run
of the final packaged `.app` that records all of the following:

- `app.isPackaged=true`;
- `app.getAppPath()` equals that package's exact
  `Contents/Resources/app.asar` path;
- the exact SHA-256 of that frozen archive and an auditable archive inventory;
- the static Worker URL resolves inside that exact archive;
- the Main, Worker, preload, and Renderer bytes in the archive match the final
  packaged candidate;
- complete raw results for the frozen correctness, workload, latency,
  heartbeat, FIFO/CAS, unknown-commit, sidecar, generation, window teardown,
  clean-close, and no-skipped-check matrix.

Development and production-build samples remain separately required. The same
final packaged candidate must still pass the same-profile dual-process native
single-instance matrix, and the real SIGKILL/restart fixtures remain required.
No latency, memory, security, correctness, workload, lifecycle, or ownership
line is removed or relaxed. This correction does not change the one-Worker
architecture, authorize a Main SQLite fallback, or authorize D1 by itself.

After this correction enters HEAD, G1W evidence may pass only when an
independent strict review verifies the deterministic source manifest, exact
final archive/result/raw hashes, every retained required sample, every invalid
or superseded sample, and the clean tracked worktree. D1 remains blocked until
that evidence review passes and D1's own one-file scope lock is independently
reviewed and present in HEAD.

Allowed tracked files are exactly:

```text
docs/next/agent-workbench-task-slices.md
```

This correction may not change product code, tests, dependencies, schema, IPC,
persisted data, runtime behavior, the v5.3 product model, G2R's result, or P1's
absence.

### multi-thread-library/G2R: Renderer resource-cache repair gate

Type: OS-temp production-shape feasibility only.

Status: independently reviewed `VALID_STOP`. Evidence SHA-256
`099e87ce83f679fb887ae7054f2429f6cab52a8bc4936215119f29210e606e7e`;
review `NYX-MTL-G2R-EVIDENCE-20260812-01`. Both ordered native candidates
crossed the fixed repeated-close memory plateau line. P1 and Permanent delete
remain absent; D1 through M1 remain unaffected. G2R is not executable again
under this workstream.

### Product implementation slices

D1 through M1 are blocked on G1W and their qualified scope locks. P1 is
separately blocked on G2R+M1 and its scope lock. Exact responsibilities are the
matching v5.3 sections:

- D1: native single-instance startup, one DB Worker/client, stable-id
  materialize recovery, 50-row keyset paging, strict SQLite domain, read-only v5
  importer with resource-level degradation and non-destructive Main-only
  Library/Thread unavailable states; no Renderer wiring and no purge schema;
- D2: Thread-owned resources, unified Draft CAS, Draft-to-Turn transaction and
  exact three-outcome terminal settlement/sidecar reconciliation/retry;
- C1: atomic v5 import/activation, Thread Library API including redacted
  unavailable/Retry projection and only the C1 bridge methods, thread-scoped
  chat, Worker FIFO snapshot barrier and removal of Renderer-owned provider
  messages;
- E1: per-Thread execution, exact cancellation and Stop/terminal ordering,
  concurrency evidence and Draft/process-wide-result save-before-fence
  shutdown, including stable affected-Thread identities, partial/new-failure
  dialog updates and settlement failure during drain;
- U1: New/list/select/Draft/Pinned/Recent UI, deterministic pre-send titles,
  fixed then-present Sidebar regions, Library/Thread unavailable surfaces,
  collection paging/failure/end and common deep-selection restore, stable
  collision-resolved image-time fallback whose survivors never renumber and
  whose next ordinal is max + 1, minimum-width visible creation-label
  disambiguation for same-second/cross-year/DST-equal/manual duplicates and
  pagination-set changes, unavailable focus/announcements
  without interrupting Connections, attention, safe save/discard and
  native-close/full-image focus barrier, image-detail teardown/distinct-image
  memory gate and keyboard/accessibility;
- L1: reversible Rename/Pin/Archive/Unarchive/Trash/Restore only, with no
  transient Undo state and no Trash Rename, plus fixed lifecycle entries/Back
  to threads, Pin/Unpin loaded-row or cross-page Load-more focus,
  settlement-failed gating, stable collection order, one-shot Stop-and-move
  intent and safe running-action dialogs that decide Running intent before any
  Draft save/discard, plus the shared manual-title validation/focus contract;
- Q1: one-command Worker literal Search over Main-acked Draft and committed
  Available/Archived content, with fixed Search/results region, explicit
  cancel/open/error/Retry/truncation state, latest-epoch VoiceOver feedback,
  Q1-only bridge method, one-in-flight/one-latest-pending backpressure and fixed
  performance lines over legal document-capacity fixtures, with deep title
  matches retaining Thread-heading focus; no FTS unless a measured failure
  produces a reviewed amendment;
- A1: full reversible-library, dual-process, unavailable-state, complete
  Draft/result quit barriers,
  resource degradation/Responses repair, unknown-commit sidecar,
  settlement-failed, bridge ratchets, fixed focus/Search/paging/Sidebar/title
  and packaged distinct-image navigation acceptance,
  including the Running-before-Draft lifecycle order and exact result-loss
  identity list and all manual-title input boundaries,
  plus removal of old current-thread code while the old data root remains
  byte-identical, with transient Undo and Permanent delete/Purge schema/IPC/UI
  proven absent;
- M1: only after A1, separately confirmed legacy-root cleanup and authorization
  scan, with no product behavior change;
- P1: optional final Trash-only Permanent delete, its purge schema/bridge/UI and
  complete packaged regression.

### multi-thread-library/D1-R: SQLite crash-recovery contract correction

Type: documentation-only correction to the D1 open/validation contract.

Status: complete at `0e4f02e` after independent strict review
`NYX-MTL-D1-RECOVERY-CONTRACT-20260812-02`. D1 product code subsequently
completed at `8d4d73e`; this subsection remains the governing recovery
contract.

This subsection narrowly supersedes v5.3 and D1-scope-lock wording that requires
the original database and DELETE journal to remain byte-identical after every
open or physical-validation failure. SQLite must recover a hot rollback journal
before it can expose one authoritative, transactionally consistent view; that
native recovery can write restored pages and remove the journal before schema,
foreign-key and `quick_check` validation can finish. A read-only connection
cannot perform that recovery, and `immutable=1` ignores the journal rather than
validating the authoritative state. Treating either as canonical would weaken
crash recovery.

D1 therefore keeps at most one live Worker and one live `DatabaseSync`
connection. Each Worker generation constructs its sole connection once and
opens the canonical path once; a replacement generation may start only after
the old generation has confirmed exit and its connection no longer exists. The
connection lets SQLite perform native DELETE-journal recovery before accepting
any semantic command. Native recovery of a pre-existing hot journal is the only
allowed pre-validation physical mutation to a pre-existing canonical database.
After recovery, D1 must validate the exact schema fingerprint, required pragmas,
`PRAGMA foreign_key_check` with zero rows and `PRAGMA quick_check = 'ok'` before
accepting commands.

If the canonical path is absent, the sole connection may exclusively create the
database and initialize the reviewed schema. If that first initialization or
validation fails, D1 removes only the database and journal created by that
attempt; it never removes or replaces a file that predated the call.

If open, recovery or any later validation fails, D1 enters Library unavailable
and closes the connection. It leaves the files exactly as SQLite left them and
must not create or substitute an empty database, copy/rename/restore a backup,
re-import v5, repair rows, retry a mutation, or introduce a recovery manager,
second connection, second Worker or second durable truth. Clean invalid inputs
with no hot journal must remain byte-identical. For a hot or corrupt journal,
the test must not promise byte identity after SQLite's recovery attempt; it must
instead prove fail-closed behavior, no replacement/re-import, and no accepted
command against an unvalidated database.

D1 tests must add: a real spilled uncommitted DELETE-journal SIGKILL fixture
that reopens to the pre-transaction state; a corrupt hot-journal fixture that
becomes Library unavailable without an empty replacement; and an FK-disabled
orphan fixture rejected by `foreign_key_check`, byte-identical because it has no
hot journal. Existing clean header, permission, schema, pragma and quick-check
failure preservation remains required. Product source must contain only one
`new DatabaseSync` construction site and no immutable validation path.

Allowed tracked files are exactly:

```text
docs/next/agent-workbench-task-slices.md
```

This correction changes no product behavior, schema, operation, file inventory,
IPC, dependency, UI or later-slice boundary. It does not relax old-root or
sidecar byte identity, and it does not authorize destructive recovery.

### multi-thread-library/D1-scope-lock: SQLite domain and importer foundation

Type: documentation-only control step.

Status: scope lock complete at `0e3b2ef` after independent review
`NYX-MTL-D1-SCOPE-20260812-03`. Its open/validation byte-preservation wording is
narrowly superseded by D1-R above. D1 code completed at `8d4d73e` after
independent review `NYX-MTL-D1-CODE-20260813-03`; D2 remains blocked until its
own scope lock below completes.

Dependencies are satisfied only by G1W evidence
`5051863dc6cc81dd88b0524f8a08f44e167712528ddae28058bffba7efaa2e3d`,
independent review `NYX-MTL-G1W-EVIDENCE-V3-20260812-03`, and G1W-A contract
review `NYX-MTL-G1W-ARCHIVE-CONTRACT-20260812-02` in HEAD `2196ea6`.

D1 may change exactly these tracked files:

```text
apps/desktop/electron.vite.config.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/main/thread-library/protocol.ts
apps/desktop/electron/main/thread-library/client.ts
apps/desktop/electron/main/thread-library/client.test.ts
apps/desktop/electron/main/thread-library/worker.ts
apps/desktop/electron/main/thread-library/worker.test.ts
apps/desktop/electron/main/thread-library/v5-importer.ts
apps/desktop/electron/main/thread-library/v5-importer.test.ts
```

Responsibilities are fixed as follows:

- `index.ts` acquires Electron's native single-instance lock before privileged
  scheme registration or any data owner can initialize. A rejected secondary
  exits without touching current-thread, Thread Library, staging, sidecar,
  image-authorization, Connections, Runtime, IPC or window state. The primary's
  `second-instance` handler only restores/shows/focuses its existing window.
- `electron.vite.config.ts` adds one fixed Main build entry named
  `thread-library-worker`; it does not add a dependency or a dynamic Worker
  loader.
- `protocol.ts` is the implementation-local typed semantic Worker contract.
  Its D1 operations are limited to open/close, stable-id materialize, exact
  Thread read, 50-row keyset list page and one-record v5 import. It is not a
  shared/preload contract and exposes no raw SQL.
- `client.ts` owns one Worker generation and one pending-request map. It
  validates replies, invalidates a failed generation, waits for old Worker exit
  before one replacement, classifies mutation outcomes as
  `definitely_not_committed | committed | outcome_unknown`, and performs only
  exact canonical reread reconciliation. It never auto-replays a mutation and
  has no second queue, pool or Main SQLite fallback.
- `worker.ts` is the only non-test product source allowed to import
  `node:sqlite` or construct `DatabaseSync`. It owns the sole connection,
  prepared statements and complete transactions; uses bound parameters,
  STRICT tables, foreign keys, DELETE journal, defensive/trusted-schema and
  secure-delete settings; enforces 0700/0600; and runs required physical,
  schema, pragma and `quick_check` validation before accepting commands.
- `v5-importer.ts` strict-parses the old v5 record directly with the existing
  parser and reads the old root without mutating it. It must not call
  `CurrentThreadStore.read()`, because that read repairs pending state. The
  importer converts abandoned pending to Interrupted, preserves safe target and
  Responses identity, validates resources through the existing Main-owned
  image/document/provider-state validators and degrades only bad resources. It
  sends the Worker only semantic SQLite row values plus validated extracted
  document text under existing resource limits; raw image, document-source and
  Responses continuation bytes never cross. D1 adds no v5 file, Turn or message
  text cap; needing one is a Stop/replan rather than rejection of an otherwise
  valid v5 record. The importer neither copies sidecars nor activates a new
  library.
- The three new test files and existing `index.test.ts` are the only D1 test
  surfaces. Fixtures are generated inside those tests; D1 adds no fixture tree,
  test-only IPC, production fault flag, helper framework or generic filesystem
  abstraction.

The D1 schema includes only the v5.3 `threads`, one-row-per-Thread `drafts`,
`turns`, `images`, `documents`, and `provider_state_refs` domain needed by this
foundation. It enforces location/trash-origin/Pin/title/revision invariants,
one pending final Turn per Thread, Draft tombstones and stable identities. It
does not create FTS, `purge_jobs`, durable Runs, a global catalog, generic event
log, migration journal or later-slice columns without a D1 invariant.

D1 builds and tests this foundation but does not construct a Thread Library
client from normal app startup, open or create a user's real library, write the
old root, register Thread IPC, change `window.nyx`, cut chat over, or change any
Renderer/Provider/Runtime behavior. C1 remains the sole import-and-activation
cutover; D2 remains the owner of new thread-owned sidecar staging, unified Draft
CAS, Draft-to-Turn and terminal settlement.

Required automated checks are:

```text
pnpm --dir apps/desktop exec vitest run electron/main/index.test.ts electron/main/thread-library/client.test.ts electron/main/thread-library/worker.test.ts electron/main/thread-library/v5-importer.test.ts
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

The tests must cover single-instance owner ordering and focus-only handoff;
STATIC Worker output; STRICT/FK/DELETE/0700/0600/rollback/reopen/quick-check;
137 ordered rows with 50-row pages, end and invalid/stale cursors; stable-id
materialize rollback, commit-before-reply-loss reread and same-id explicit
Retry; malformed/unknown/timeout/crash/late-generation replies, CAS conflict
and no automatic replay; safe Library versus Thread unavailable classification;
and v5 text/image/document/Responses/pending, corrupt-resource, corrupt-ref,
repeat and disk-full cases with the entire old root hash unchanged.

OS-temp acceptance must also load the exact static Worker from the final D1
packaged `.app`, bind the frozen archive hash/inventory as in G1W-A, and launch
two fresh-profile packaged processes to prove the rejected secondary touches no
protected root while the primary receives one focus event and retains one event
domain. No raw-Electron packaged-archive hybrid is required.

The implementation stops and returns to this scope lock if any required change
falls outside the ten-file inventory; a real published upgrade population is
found; canonical Thread identity/location cannot be distinguished from a
whole-library failure; old-root bytes change; or correctness requires
dual-read/write, a second durable truth, raw-SQL RPC, another connection/Worker,
automatic mutation replay, Main `DatabaseSync`, an ORM/repository, D2/C1/Q1/P1
behavior, or a product-only test hook.

Before implementation could be marked complete, exact allowed-file and
forbidden-surface scans, all checks above, packaged acceptance, and an
independent code review had to pass for the same implementation bytes entering
HEAD. Those conditions passed under `NYX-MTL-D1-CODE-20260813-03`; D1
completion does not authorize D2 without D2's own reviewed scope lock.

### multi-thread-library/D2-scope-lock: Thread resources and settlement domain

Type: documentation-only control step.

Status: scope lock complete at `5efed87` after independent strict review
`NYX-MTL-D2-SCOPE-20260813-01`. D2 product code subsequently completed at
`15c8b00` after reviews `NYX-MTL-D2-CODE-20260813-04` and
`NYX-MTL-D2-EVIDENCE-20260813-02`. This subsection remains the governing D2
contract and no longer authorizes another D2 edit.

Dependencies are satisfied only by D1 commit `8d4d73e`, D1 code review
`NYX-MTL-D1-CODE-20260813-03`, D1-R commit `0e4f02e`, and D1-R review
`NYX-MTL-D1-RECOVERY-CONTRACT-20260812-02` in the ancestry of the scope-lock
commit. D2 must preserve D1's one application Worker/connection, semantic-only
protocol, exact three-outcome mutation handling and non-destructive unavailable
states.

This scope-lock step may change exactly:

```text
docs/next/agent-workbench-task-slices.md
```

After this scope lock completes, D2 may change exactly these tracked files:

```text
apps/desktop/electron/main/thread-library/protocol.ts
apps/desktop/electron/main/thread-library/client.ts
apps/desktop/electron/main/thread-library/client.test.ts
apps/desktop/electron/main/thread-library/worker.ts
apps/desktop/electron/main/thread-library/worker.test.ts
apps/desktop/electron/main/thread-library/sidecars.ts
apps/desktop/electron/main/thread-library/sidecars.test.ts
apps/desktop/electron/main/thread-library/coordinator.ts
apps/desktop/electron/main/thread-library/coordinator.test.ts
```

D2 is a dormant Main/Worker domain foundation. It does not construct the
Thread Library client during normal startup, open or create the user's real
library, import or activate data, register IPC, change `window.nyx`, call a
Provider or Runtime, or change Renderer behavior. C1 remains the only import,
activation and bridge/chat cutover.

Responsibilities are fixed as follows:

- `protocol.ts` extends the implementation-local semantic Worker contract only
  with `saveDraft`, `startTurn`, `retryTurn`, `bindTurnTarget`, `settleTurn`,
  `recoverPending`, `setResourceAvailability` and
  `repairProviderStateRef`. It represents Draft- and Turn-owned ordered image
  and document rows without raw bytes or paths. It adds no shared/preload type,
  raw-SQL message, generic mutation id or later-slice operation.
- `worker.ts` implements every D2 database transition as one complete short
  transaction on the existing connection. It does not add a table, column,
  FTS index, durable Run, settlement journal or second queue. D2 may replace
  only the existing `documents.available/extracted_text` CHECK so an unavailable
  source sidecar may retain already validated SQLite extracted text, and may add
  or tighten an existing-table CHECK/trigger/index required by the frozen D2
  transitions. Any table, column or schema-version change is a Stop/replan.
- `client.ts` adds typed wrappers and exact canonical reread for D2 mutations.
  It never auto-replays a mutation. One call may consume at most the existing
  single replacement generation; an inconclusive reread remains
  `outcome_unknown`, and no sidecar may be removed on that outcome. The sole
  set-based exception is `recoverPending`: it has no external sidecar and cannot
  reconstruct the affected set after reply loss, so unknown stays unknown until
  an explicit caller Retry of the same idempotent input.
- `sidecars.ts` is the sole new Thread Library file owner. Under a caller-owned
  library root it derives paths only from validated UUIDs and uses the fixed
  layout `threads/<threadId>/{images,documents,responses,.staging}`. Image full
  and preview bytes and document source bytes remain files; validated document
  extracted text exists only in SQLite; Responses continuation remains an
  integrity-checked JSON sidecar. Directories are 0700 and files 0600. A narrow
  file-operation seam may exist in this file only for failure tests; D2 adds no
  filesystem framework or generic Asset service.
- `coordinator.ts` is the one Main-side D2 coordinator over the existing
  `ThreadLibraryClient` and `sidecars.ts`. It stages, verifies and atomically
  publishes new files before asking the Worker to reference them; owns the
  process-local exact `settlement_failed` inputs, including bounded Responses
  continuation bytes and one Main-generated stable state id; and exposes Retry
  of the same terminal input/ref without Provider or Runtime contact. It is not
  wired into startup and does not add an ActiveRun manager, event bus, service
  registry or durable failure state.
- The four listed test files are the only D2 test surfaces. Tests use OS-temp
  roots and existing image/document/Responses fixtures and limits. D2 adds no
  fixture tree, production fault flag, product-only hook or dependency.

The Draft contract is one CAS over text, safe target selection and the complete
ordered image/document ownership set. Main validates and publishes only new
sidecars; the Worker verifies `threadId + expectedDraftRevision`, replaces the
Draft-owned metadata set and increments the Draft revision exactly once. A CAS
conflict returns the canonical revision without overwriting Main/Renderer dirty
input. Non-empty text or an attachment-set change updates
`last_user_activity_at`; target-only and empty-text-only saves do not. Resource
ids remain globally stable and cannot be reparented across Threads.

`startTurn` uses `threadId + requestId + expectedDraftRevision` and Main-owned
message ids. In one transaction it requires Available or Archived, requires no
pending Turn, inserts the final pending Turn, moves every ordered Draft resource
row to that Turn, clears the Draft to a tombstone while preserving its accepted
safe target selection, increments the Draft revision, restores Archived to
Available and increments `thread_revision` for that location change, freezes
the existing auto title, and updates user activity. An Available start does not
change `thread_revision`. No Provider/Runtime side effect may begin before the
committed ack. On reply loss, the client rereads the exact request id; it never
starts Provider work from an unknown result.

`retryTurn` identifies one exact retryable failed Turn by Thread, ordinal and
previous attempt request id, and that Turn must be the final Turn. It rejects
Trash, accepts Available, and atomically restores Archived to Available while
incrementing `thread_revision`; an Available retry does not change that
revision. It also CAS-checks the current Draft revision, uses that Draft's safe
target selection, preserves message/content/resource identity, installs the new
request id, clears the old terminal fields and updates user activity.
`bindTurnTarget` may bind safe attribution only to the exact still-pending
request and matching selection before Provider contact. Neither operation
consumes Draft text or attachments.

All terminal states use one `settleTurn` conditional transaction keyed by
`threadId + requestId` and requiring exactly one pending row. Exactly one of
Complete/Fail/Cancel wins; all losers reread canonical terminal state and emit
no second terminal result. A winning terminal increments `result_revision`
once, never changes `last_user_activity_at`, and preserves
`seen_result_revision`. Failed attachment rejection remains legal only for an
attachment-bearing Turn. Before the Worker call, Main must prove that a
Responses continuation's visible text equals the durable assistant text. The
ref is then inserted in the same terminal transaction and must match the exact
request, safe target attribution, execution identity, byte length and hash.

Responses bytes are prepared, verified and atomically published before
`settleTurn`. Any prepare or database failure stores the exact terminal input
in the process-local `settlement_failed` map. `definitely_not_committed` permits
best-effort removal of the unreferenced file, but Retry must recreate the same
stable ref from the retained bounded bytes; `committed` retains the referenced
file;
`outcome_unknown` retains it and rereads `threadId + requestId + exact ref/hash`.
A matching terminal is accepted as committed; the same exact pending Turn is
stored in the process-local map and Retry reuses the same input/ref without
calling Provider; a different canonical terminal makes the prepared file an
orphan. No conclusive read means the file and failure input remain. D2 never
writes a durable settlement journal or marks a failed save as Cancelled.

`recoverPending({ recoveredAt })` is an explicit startup/exit semantic command,
not an implicit read mutation. It atomically changes every still-pending Turn
to the existing Interrupted safe failure once and increments each affected
Thread's result revision once; it does not change user activity. Because the
affected set is not durably known outside SQLite, reply loss remains
`outcome_unknown`: the client does not invent a canonical reread and does not
auto-replay. C1/E1 may offer an explicit Retry with the same `recoveredAt`;
repeating the command is idempotent because it updates only rows still pending,
so already recovered Turns and revisions do not change again. D2 proves reply
loss, explicit Retry and restart idempotence; C1/E1 own when it is called.

Reconciliation is reference-led and fail closed. It first obtains a canonical
Worker read, then verifies only that Thread's fixed sidecar paths. Missing or
corrupt image files update only those exact image availability rows. For a
document, `available` describes the source sidecar only: a missing/corrupt
source becomes unavailable without clearing already validated
`extracted_text`; an imported document that never had valid extracted text may
remain unavailable with `extracted_text = NULL`. Provider materialization and
Search may continue using non-null validated SQLite text while source-only
actions show the resource unavailable. Healthy content stays usable. A corrupt
Responses continuation first uses
`threadId + requestId + stateId + executionIdentity + byteLength + sha256` to
delete only the exact ref and fall back to durable visible assistant text. A
failed/mismatched repair makes only that identifiable Thread unavailable.
Unreferenced staging/canonical files are best-effort orphans; no file is removed
while a mutation is `outcome_unknown` or canonical read is unavailable.

Required automated checks are:

```text
pnpm --dir apps/desktop exec vitest run electron/main/index.test.ts electron/main/thread-library/client.test.ts electron/main/thread-library/worker.test.ts electron/main/thread-library/v5-importer.test.ts electron/main/thread-library/sidecars.test.ts electron/main/thread-library/coordinator.test.ts
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
git diff --check
```

The D2 test matrix must cover:

- Draft text/target/existing/new image/document saves, ordered ownership,
  target-only and clear-to-empty activity behavior, stale CAS with canonical
  revision, autosave-versus-Send and two-Send races, and sidecar write/verify/
  rename/database failures without losing dirty input;
- Available and Archived Draft-to-Turn, tombstone revision, attachment owner
  move, Archived/Available `thread_revision`, provider-before-ack canary, exact
  final retryable failed Turn, Archived/Available/Trash Retry behavior, target
  binding, duplicate request/message/resource identities and no-pending
  invariant;
- Complete/Fail/Cancel concurrency; explicit rollback, commit ack and
  commit-after-reply-loss outcomes; canonical terminal/ref acceptance; exact
  pending settlement Retry; mismatched terminal/orphan reconcile; result/seen/
  activity revisions; and Retry proving zero Provider calls;
- valid, missing and corrupt image/document parity; valid Responses fixture,
  visible-text mismatch, corrupt exact-ref repair to durable text, repair CAS
  failure to Thread unavailable, orphan cleanup failure and a second healthy
  Thread remaining usable;
- real process restart with pending-to-Interrupted idempotence, recover reply
  loss staying unknown, and explicit same-input Retry with no double result
  revision; Worker crash, timeout, malformed/late reply and replacement-read
  failure with at most one replacement and no automatic mutation replay;
  existing v5 importer/read/list/materialize and D1 open/recovery regressions.

OS-temp acceptance has two honest boundaries. A production-shape temporary
bundle built from the exact D2 `sidecars.ts`/`coordinator.ts` bytes must exercise
a real thread-owned root, 0700/0600 modes, reply-loss retention/reconciliation
and pending restart recovery. Separately, the final packaged `.app` and frozen
`app.asar` inventory must prove the existing static Worker loads and executes
the D2 semantic commands and must rerun D1's same-profile secondary-process
protected-root canary. The dormant coordinator is not claimed to be in the app
archive before C1 wires it. Neither path may use Main `DatabaseSync`, raw
paths/bytes in Worker messages, a production test hook or a raw-Electron
packaged-archive hybrid.

D2 stops and returns to planning if implementation needs a file outside the
nine-file inventory; a schema table/column/version change; shared/preload/IPC,
Renderer, current-thread, Provider, Runtime, startup/activation or C1+ behavior;
new or changed attachment/Responses limits; a second durable truth, settlement
journal, automatic mutation replay, additional Worker/connection/queue, Main
SQLite, generic repository/Asset service; sidecar deletion without conclusive
canonical ownership; or a terminal/resource failure cannot be isolated to its
exact Thread/resource.

Before D2 implementation may be committed, the exact nine-file bytes, all
required checks, packaged acceptance, allowed/forbidden-surface scans and an
independent strict code review bound to the final artifact must pass. D2
completion does not authorize C1 without C1's own reviewed scope lock.

### multi-thread-library/C1-scope-lock: Import activation and Thread API/chat cutover

Type: documentation-only control step.

Status: complete at `b647cde` after independent strict review
`NYX-MTL-C1-SCOPE-20260813-01`. This subsection records the historical ratchet;
it is no longer an executable control step and did not authorize E1.

Dependencies are satisfied only by D1 commit `8d4d73e`, D1 review
`NYX-MTL-D1-CODE-20260813-03`, D2 scope-lock commit `5efed87`, D2 code commit
`15c8b00`, D2 code review `NYX-MTL-D2-CODE-20260813-04`, and D2 evidence review
`NYX-MTL-D2-EVIDENCE-20260813-02` in the ancestry of the scope-lock commit. C1
must preserve the D1/D1-R single-owner and crash-recovery contracts and D2's
Draft/sidecar/settlement three-outcome contracts.

This scope-lock step may change exactly:

```text
docs/next/agent-workbench-task-slices.md
```

After this scope lock completes, C1 may change exactly these tracked files:

```text
apps/desktop/shared/chat/events.ts
apps/desktop/shared/chat/ipc.ts
apps/desktop/shared/chat/types.ts
apps/desktop/shared/contracts/desktop.ts
apps/desktop/shared/threads/events.ts
apps/desktop/shared/threads/ipc.ts
apps/desktop/shared/threads/types.ts
apps/desktop/electron/preload/index.ts
apps/desktop/electron/preload/index.test.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/main/current-thread/image-protocol.ts
apps/desktop/electron/main/current-thread/image-protocol.test.ts
apps/desktop/electron/main/thread-library/protocol.ts
apps/desktop/electron/main/thread-library/client.ts
apps/desktop/electron/main/thread-library/client.test.ts
apps/desktop/electron/main/thread-library/worker.ts
apps/desktop/electron/main/thread-library/worker.test.ts
apps/desktop/electron/main/thread-library/v5-importer.ts
apps/desktop/electron/main/thread-library/v5-importer.test.ts
apps/desktop/electron/main/thread-library/sidecars.ts
apps/desktop/electron/main/thread-library/sidecars.test.ts
apps/desktop/electron/main/thread-library/coordinator.ts
apps/desktop/electron/main/thread-library/coordinator.test.ts
apps/desktop/electron/main/thread-library/activation.ts
apps/desktop/electron/main/thread-library/activation.test.ts
apps/desktop/electron/main/thread-library/service.ts
apps/desktop/electron/main/thread-library/service.test.ts
apps/desktop/electron/main/chat/client.ts
apps/desktop/electron/main/chat/client.test.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts
apps/desktop/src/ui/chat/chat-types.ts
apps/desktop/src/ui/chat/chat-reducer.ts
apps/desktop/src/ui/chat/chat-reducer.test.ts
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/use-chat-session.test.ts
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts
```

C1 is one atomic authority cutover, not the complete Thread Library UI. Its
minimum product shape is the existing two-column chat with one selected Thread
detail and an untouched New-thread placeholder. It persists and can list more
than one Thread, but it does not add the U1 collection browser, switching UI,
Pinned/Recent interaction, background cross-Thread Runs, lifecycle actions or
Search. Keeping the existing one-row Sidebar adapter during C1 must not be
misrepresented as a one-Thread durable model.

Responsibilities are fixed as follows:

- `activation.ts` is the sole one-time cutover owner. After the existing native
  single-instance lock and before operational Thread/chat IPC or image
  authorization, it chooses exactly one path: validate/open an already
  activated `thread-library/` target without touching legacy data; build a
  fully verified empty staging library when the target is absent and the legacy
  v5 record plus every known legacy sidecar directory are absent or empty (the
  legacy parent directory may remain after the old explicit Start fresh); or
  build an absent target under
  `thread-library.importing/`, strict-read the one v5 current Thread with the
  existing importer, publish only validated resources, import semantic rows,
  close that Worker generation, reopen the same staging database through one
  replacement generation, verify every canonical row/ref/hash and required
  pragma, close it with no live journal, then atomically rename the whole staging
  root. At most one Worker/connection is live throughout. A canonical target
  directory whose database is missing or invalid is an open failure, never the
  empty-library case. A legacy sidecar without its v5 record is an ambiguous
  canonical-content failure and must not be ignored or deleted. The empty case
  still hashes and preserves the complete legacy parent. An interrupted
  unactivated staging root may be discarded and rebuilt; an existing activated
  target is never imported into, merged, overwritten or silently replaced.
  Activation adds no migration framework, version graph, backup manager or
  second database.
- The legacy `userData/threads` root is read-only from the first import read and
  remains byte-identical. Successful activation makes the new library the only
  runtime truth; the running product never reads or writes the legacy root
  again and never falls back to old current-thread chat/snapshot/reset. Before
  activation, no new-library product write or Provider/Runtime side effect is
  allowed. A canonical identity/content failure stops activation without
  renaming; an invalid image/document degrades only that resource, and an
  invalid Responses continuation clears only its exact ref while preserving
  durable visible assistant text.
- `service.ts` is the single Main product boundary for C1 Thread permission,
  safe shared projections, IPC validation, Library/Thread unavailable state,
  exact Retry and Renderer subscriptions. It owns no SQL, filesystem bytes,
  Provider call or second mutation queue. It delegates every database command
  to the existing client and every resource/Draft action to the existing
  sidecars/coordinator. Library failure exposes only `Couldn't open Thread
Library` plus exact Retry; safely identifiable canonical Thread failure keeps
  that row visible and Retry-only while other Threads remain usable. Neither
  path creates an empty library, deletes/renames a canonical root, invokes old
  `Start fresh`, or authorizes chat/detail/image for unavailable content.
- The shared/preload boundary adds exactly `window.nyx.threads` with
  `listPage/get/materialize/saveDraft/retryOpen/markSeen/subscribe`. Its runtime
  object and `NyxDesktopApi` type contain no Rename/Pin/Archive/Unarchive/Trash/
  Restore, Search or Purge method. `window.nyx.chat` is retained but contains
  exactly `start/cancel/retrySettlement/subscribe`; each command and event uses
  `threadId + requestId`, and every event also carries the current process
  `eventEpoch + cursor`. Shared projections may contain safe Thread summary,
  Draft, messages, attachment refs/availability, target selection/attribution,
  revisions, run/settlement state and safe errors. They must not contain file
  paths, sidecar bytes/hashes, Responses output, resolved targets, Provider
  configuration/protocol/base URL, credentials or Worker-internal rows.
- The shared chat module keeps the old `NyxChatRequest` only as a dormant
  compile-time input for unchanged legacy current-thread modules until A1. C1
  adds a distinct public thread-scoped start/retry union and makes
  `NyxDesktopChatApi`, preload and the live Main parser accept only that union;
  the public/runtime contract has no `messages`, Renderer message ids,
  attachment bytes or target selection. This compatibility type is not a
  second IPC path and cannot be invoked by the C1 runtime object.
- `protocol.ts`, `worker.ts` and `client.ts` add only C1's `snapshot` FIFO
  barrier, `markSeen` and exact empty-shell discard semantic operations plus an
  internal generation/watermark and actual-mutation flag on successful replies.
  `snapshot({threadId})`
  returns one canonical detail (or absence) and a Worker-generation epoch plus
  committed cursor; `listPage` returns its own FIFO boundary. The Worker clock
  is metadata, not a second publisher: `service.ts` is the sole public
  `eventEpoch + cursor` publisher and synchronously maps the acknowledged
  Worker boundary to a safe event before resolving that Main continuation.
  Worker replacement rotates the public epoch and forces rehydration. There is
  no durable event log, Renderer-owned cursor truth, second Main queue or
  synthetic cursor; canonical Thread/Draft/result revisions remain the
  cross-restart truth.
- Renderer hydration always subscribes and buffers before calling `listPage`
  and `get`. The list projection and selected-detail projection each replay the
  buffer against their own `includedThroughCursor`; a later detail watermark
  must never discard summary events newer than the earlier list watermark. Each
  applies only matching-epoch later events; a gap, epoch change or stale/
  mismatched Thread/request identity discards that affected projection and
  rehydrates. A late A snapshot/event can never replace selected B. Main derives
  the Sidebar title from the safe canonical summary; Renderer messages stop
  being a second title or durable-history truth.
- `materialize` is lazy. Repeated New on an untouched placeholder only focuses
  Composer and creates no row. First non-empty text or first Main-accepted ready
  attachment reserves one Main-generated stable Thread id; target-only changes
  and attachment preparation that is removed or fails do not materialize.
  Unknown commit reuses that id and follows D1 canonical reread. The Renderer
  keeps one dirty overlay/preparing-byte set and one mutation queue for the
  current placeholder/Thread. Save ack is the only durability boundary: failure
  keeps the overlay and current detail in place. C1 Send and New reuse this
  queue, but C1 adds no U1 discard dialog: Send offers only Retry/Stay, and New
  remains on the current Thread until save succeeds. After an acknowledged
  empty save, New may discard only a canonical zero-Turn, auto-title, empty
  Draft, attachment-free shell through the exact Draft revision; any mismatch
  preserves it. If the sole C1 Run is active, New first uses current exact Stop
  and terminal settlement behavior; background continuation waits for E1.
- `saveDraft` remains the one D2 CAS over text, target and the complete ordered
  image/document ownership set. Renderer sends only the dirty overlay and new
  prepared attachment bytes, never message history. Send first awaits the
  latest save/materialize ack, then `window.nyx.chat.start` carries only the
  exact Thread/request/Draft/Retry identity required by section 6. Main creates
  canonical message ids, commits D2 Draft-to-pending, and only after that ack
  resolves the target, replays Runtime and starts Provider work. Retry identifies
  the exact final failed Turn; cancel and settlement Retry identify the exact
  Thread/request. No command accepts Renderer `messages`, target attribution,
  Provider history, extracted text or continuation state.
- `coordinator.ts`, `sidecars.ts`, `chat/session.ts` and `chat/client.ts` reuse
  the existing D2 transactions and current Provider/Runtime path. They add only
  the read/materialization needed to build exact Provider history and Runtime
  replay from the selected canonical Thread: available image bytes, validated
  SQLite document text and an exact validated Responses continuation. The
  Provider client has no fallback to `request.messages`. The current single
  global active chat limitation remains until E1; C1 only makes its identity
  thread-scoped and preserves Send/stream/Stop/Retry/current target, attachment
  and Responses behavior for that one active Run.
- `chat/session.ts` stops importing the legacy current-thread coordinator,
  Provider-message type and runtime replay helper. The general provider-message
  input belongs to `chat/client.ts`; exact Thread history materialization and
  Runtime replay use the already allowed `thread-library/coordinator.ts` and
  `chat/session.ts`. All other unchanged current-thread modules remain dormant
  and compilable only until A1 removes them.
- A terminal save failure is distinct from Provider failure. C1 projects
  `Couldn't save result` and routes its existing message Retry action to
  `retrySettlement(threadId, requestId)`, which reuses D2's retained exact
  terminal input/ref and performs zero Provider/Runtime calls. Ordinary failed
  Provider Retry remains the exact final-Turn retry. C1 does not implement E1
  quit fencing, post-stop lifecycle actions, background Runs or a durable
  settlement journal.
- `current-thread/image-protocol.ts` keeps the already reviewed opaque URL
  parser, streaming response, immutable cache behavior and blocked Renderer
  byte/path routes, but replaces the current-record resolver with the exact
  safe Thread-library authorization supplied by `service.ts` and the verified
  sidecar path supplied by `sidecars.ts`. Because the URL intentionally contains
  only image id and variant, `service.ts` registers an image-id-to-Thread/ref
  authorization only from a canonical selected snapshot and revokes it on
  epoch change, Thread unavailability, resource unavailability or projection
  teardown; the protocol never performs an unscoped resource scan or adds a
  Worker lookup. It does not change the URL shape, cache policy, image limits or
  G2R/Permanent-delete behavior. Other legacy current-thread modules remain
  unchanged and dormant after activation until A1 removes them.
- Renderer changes are limited to the selected safe detail, one dirty overlay,
  placeholder, clocked hydration/event buffer, canonical title and thread-scoped
  chat identity. They remove `submittedMessages`, `toRequestMessages`, current
  snapshot/reset calls and Renderer-generated Provider history. C1 keeps the
  existing Composer/chat visual design and keyboard/accessibility behavior; it
  adds no thread collection, collection paging UI, lifecycle menu, Search UI,
  attention region, manual ordering, new window or Settings surface.

Required automated checks are:

```text
pnpm --dir apps/desktop exec vitest run electron/preload/index.test.ts electron/main/index.test.ts electron/main/thread-library/client.test.ts electron/main/thread-library/worker.test.ts electron/main/thread-library/v5-importer.test.ts electron/main/thread-library/sidecars.test.ts electron/main/thread-library/coordinator.test.ts electron/main/thread-library/activation.test.ts electron/main/thread-library/service.test.ts electron/main/current-thread/image-protocol.test.ts electron/main/chat/client.test.ts electron/main/chat/session.test.ts src/ui/chat/chat-reducer.test.ts src/ui/chat/use-chat-session.test.ts src/ui/chat/components/ChatWorkspace.test.ts
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run runtime:chat-state:check
git diff --check
```

The C1 test matrix must cover:

- absent and empty-retained legacy parent, orphan legacy sidecar rejection,
  text-only, image/document/Responses and pending v5 import;
  valid sidecar byte parity; resource-local unavailable degradation; exact
  corrupt Responses ref clearing with visible text retained; canonical content
  rejection; disk-full at every publication/DB/rename boundary; interrupted
  staging rebuild; post-close row/ref/hash/journal validation; atomic target
  rename; target-exists no-import/no-merge; and the complete old root hash
  unchanged before, during and after activation and restart;
- startup ordering from single-instance lock through activation, operational
  IPC/image authorization/window creation; activation failure and Worker
  open/crash/epoch replacement; whole-Library versus exact Thread unavailable
  projections and Retry; no empty replacement/reset/legacy fallback; one
  Worker/event domain; and a second healthy Thread remaining readable when one
  Thread or one resource is unavailable;
- exact bridge runtime methods and shared redaction; invalid/unknown/stale
  Thread/request/revision/clock inputs; `snapshot` FIFO ordering under repeated
  unawaited mutation A -> snapshot S -> mutation B; matching event before reply,
  later event after the watermark, independent list/detail watermarks without
  summary loss, cursor gap and epoch restart; subscribe-buffer-snapshot; A-to-B
  late snapshot/event rejection; and listener/window teardown without Worker
  termination;
- untouched New reuse, first edit/attachment materialization, target-only no
  materialization, removed/failed preparing attachment no materialization,
  stable-id commit/reply-loss Retry, one dirty overlay, save conflict/failure
  retention, acknowledged empty-shell discard conditions/race, active-Run New,
  New/Send save barrier and immediate Send race; canonical title and restart
  selection; no Renderer `messages` or full-library cache; and current Composer/
  target/image/document behavior parity;
- Main-derived text/image/document/Responses Provider history, exact Runtime
  replay, no Provider effect before pending ack, Send/stream/Stop/ordinary Retry,
  attachment rejection, Responses continuation, current target attribution,
  terminal race and thread-scoped event isolation; settlement failure and Retry
  proving zero second Provider/Runtime call; and old chat snapshot/reset plus
  Renderer-message request paths proven absent from the preload runtime object;
  dormant legacy request type proven unreachable at every C1 IPC/parser entry;
  opaque image authorization add/revoke across selection, resource failure,
  Thread failure and epoch replacement without an unscoped lookup.

OS-temp and packaged acceptance must bind one exact final source manifest and
archive. A fresh-profile temporary product-shape run must seed each accepted v5
shape, force every activation interruption/failure above, hash the entire old
root before and after, and prove only a fully verified staging root can become
canonical. The final packaged `.app` must record `app.isPackaged=true`, exact
`app.asar`/static Worker identity, one activated DB/root, exact preload method
sets, real selected-detail hydration, New/materialize/save/Send/stream/Stop/
Retry/restart, image/document/Responses and Runtime parity, settlement Retry
without a second Provider call, unavailable Retry and late-event isolation. The
same final package must rerun the native same-profile secondary-process focus
and protected-root canary. No product test hook, raw-Electron archive hybrid,
real user root, Provider credential, generated tracked fixture or relaxed
latency/security/memory line is allowed.

C1 stops and returns to this scope lock if implementation needs a file outside
the listed inventory; cannot close/verify/atomically activate staging before
runtime use; touches legacy data after activation or needs dual-read/dual-write,
old snapshot/chat fallback or a second durable truth; cannot derive exact
Provider/Runtime history without Renderer messages; cannot establish one real
Worker FIFO watermark/epoch for snapshot and events; creates an empty/reset
path on failure; or requires a new schema table/column/version, ActiveRun map,
background Run/window lifecycle, L1/Q1/P1 method/schema/UI, collection browser,
multi-window sync, OCaml change, ORM/repository, event log/bus, second queue,
Worker/connection or generic migration/Asset service.

Before C1 implementation may be committed, the exact allowed bytes, all checks,
OS-temp and packaged acceptance, old-root/bridge/forbidden-surface scans and an
independent strict code review bound to the final artifact must pass. C1
completion does not authorize E1 without E1's own reviewed scope lock.

### multi-thread-library/C1-title-identity-amendment: Existing-field constraint repair

Type: documentation-only Stop repair.

Status: complete at `d099eec` after the required independent exact-byte product,
design and strict technical reviews. This subsection records the historical
Stop repair; it is no longer executable and did not authorize E1.

This amendment may change exactly:

```text
docs/next/agent-workbench-task-slices.md
docs/next/multi-thread-library-technical-plan.md
```

The plan-killer is concrete: D1's CHECK requires `fallback_local_second` and
`fallback_ordinal` to be simultaneously null/non-null and, when non-null,
requires the current title itself to be Image/Untitled generic. The reviewed C1
product rule instead persists one local creation second at materialize, delays
ordinal allocation until the first generic title, and retains an allocated
identity while a pre-send Draft temporarily has a text/document title. The old
schema cannot store either required intermediate state.

The only accepted repair is:

- materialize carries the complete Main-accepted initial Draft semantic payload.
  Main publishes new sidecars first; one Worker transaction creates the Thread,
  revision-0 Draft, ordered resource rows, title and fallback identity. Its ack
  is the first Draft durability boundary; only edits made while it is in flight
  use a later save CAS;
- every new auto materialize persists its stable local creation second. Imported
  already-sent text/document v5 Threads may keep both fields null; imported
  Image/Untitled generic v5 Threads retain the D1 importer's deterministic
  second + ordinal 1. Neither is recomputed after activation;
- `fallback_ordinal` stays null until the first Image/Untitled title, then the
  same Draft transaction assigns 1 when no identity for that second survives,
  otherwise `max(existing ordinal) + 1`; it remains stable across pre-send
  text/document/generic changes and never fills a survivor's lower-numbered
  hole;
- the SQLite CHECK permits non-null second + null ordinal, rejects ordinal
  without second, and requires manual title rows to have both null. The partial
  unique index covers only non-null ordinal pairs. Typed Worker commands remain
  the sole title derivation owner; Renderer overlay never becomes title truth;
- first Send freezes the current auto title. A generic freeze retains its
  identity; a text/document freeze clears it. Rename clears it. Existing generic
  survivors never renumber; numbering restarts at 1 only after every identity
  for that second is gone;
- document-derived auto titles use the first ordered ready document's
  Main-validated display name, trim/collapse whitespace, cap at 48 Unicode code
  points and preserve a valid final extension exactly as section 3.4 specifies;
  there is no second filename/title rule in Renderer;
- U1, not this C1 amendment, owns the multi-row visible disambiguation and its
  mouse/keyboard/VoiceOver acceptance. C1 keeps its reviewed one-row adapter and
  has no creation-label or rendered-collision implementation;
- update the exact schema fingerprint and typed protocol in the already allowed
  C1 Worker/protocol/test files. This is still the unreleased development schema
  version 1: no new field, table, schema version, migration reader, fallback
  open, second database or activated-target rewrite is allowed. An existing
  target with mismatched bytes remains Library unavailable and Retry-only.

Required regression coverage before C1 can return to its full acceptance gate:

- full initial text/target/ordered resource materialize commits in one
  transaction, and reply loss reconciles the exact Draft/refs/title without a
  generic ghost title or duplicate row;
- text/document first materialize stores second + null ordinal;
- text → empty/image → text → generic reuses one second and, once assigned, one
  ordinal; same-second concurrent generic Threads receive unique max + 1
  ordinals with stable unknown-commit reread;
- generic Send retains identity; non-generic Send and Rename release it; restart,
  timezone change, `1/2/3 → delete 2 → 4`, `delete 1 while 3 survives → 4`,
  all-gone → 1 and survivor-no-renumber behavior remain exact;
- imported generic plus a future same-second generic remain uniquely titled;
- 255-byte legal document names, whitespace, CJK/emoji, long extensions,
  reorder/removal before Send, first Send and restart follow one exact title;
- direct invalid SQL states and malformed protocol rows fail closed; schema
  fingerprint/open/activation tests use the revised exact version-1 schema;
- no Renderer messages, Main title cache, extra column/version or migration path
  appears in the final C1 diff.

The amendment stops if these states require a third persisted field, a schema
version/migration, a second title owner, or any file outside the two docs for
this control step and the existing C1 code inventory after it completes.

### multi-thread-library/E1-scope-lock: Per-Thread execution and safe shutdown

Type: documentation-only control step.

Status: complete at `786cd50`; independent strict review
`NYX-MTL-E1-SCOPE-20260814-05` accepted the exact bytes that entered HEAD. Its
implementation authorization ended when the first valid cap-2 sample failed the
existing performance lines. The inventory below is historical and no longer
executable; none of its uncommitted product bytes may enter HEAD. U1 and every
later product slice remain blocked.

Dependencies are satisfied only by C1 commit `8b7150e` and final review
`NYX-MTL-C1-FINAL-CODE-20260813-02` in the ancestry of the scope-lock commit.
E1 must preserve C1's one-Worker, Main-owned Provider/Runtime, canonical
Thread-history, event epoch/cursor, unavailable/Retry, image authorization and
settlement-retry boundaries.

This scope-lock step may change exactly:

```text
docs/next/agent-workbench-task-slices.md
```

The stopped attempt's historical inventory was exactly these tracked files:

```text
apps/desktop/shared/threads/types.ts
apps/desktop/shared/threads/events.ts
apps/desktop/shared/threads/ipc.ts
apps/desktop/electron/preload/index.ts
apps/desktop/electron/preload/index.test.ts
apps/desktop/electron/main/index.ts
apps/desktop/electron/main/index.test.ts
apps/desktop/electron/main/chat/session.ts
apps/desktop/electron/main/chat/session.test.ts
apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts
apps/desktop/electron/main/thread-library/coordinator.ts
apps/desktop/electron/main/thread-library/coordinator.test.ts
apps/desktop/electron/main/thread-library/client.ts
apps/desktop/electron/main/thread-library/client.test.ts
apps/desktop/electron/main/thread-library/service.ts
apps/desktop/electron/main/thread-library/service.test.ts
apps/desktop/electron/main/thread-library/shutdown.ts
apps/desktop/electron/main/thread-library/shutdown.test.ts
apps/desktop/src/ui/chat/use-chat-session.ts
apps/desktop/src/ui/chat/use-chat-session.test.ts
apps/desktop/src/ui/chat/components/ChatWorkspace.tsx
apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts
apps/desktop/src/ui/chat/components/ChatThread.tsx
apps/desktop/src/ui/chat/components/ChatMessage.tsx
apps/desktop/src/ui/chat/components/ChatMessage.test.tsx
```

E1 changes execution and process shutdown only. It does not add the U1 Thread
collection or selection UI, L1 lifecycle methods or menus, Q1 Search, P1 purge,
durable Runs, a queue/daemon, another Worker/connection, a second Main queue,
multi-window synchronization, Provider state outside Main, or any OCaml/runtime
protocol change. SQLite schema, Worker protocol/implementation, sidecar format,
chat request/event shapes and the public `window.nyx.chat` and
`window.nyx.threads` method sets remain unchanged.

The implementation contract is:

- `ChatSessionManager` replaces the one global active session with the sole
  Main-owned `Map<threadId, ActiveRun>`. One Thread may have at most one Run;
  each accepted Run owns one AbortController and one Runtime client. Run
  identity is always exact `threadId + requestId`; the initiating WebContents is
  not a Run owner. Chat events remain clocked by the existing
  `ThreadLibraryService` publisher and are broadcast to every live Nyx window;
  Renderer destruction only removes its event sink and never aborts a Run.
- `ThreadLibraryService` may keep only a rebuildable per-Thread live projection
  needed by `get` and events; cancellation, capacity and terminal ownership stay
  in the ActiveRun map. A background Thread event never overwrites the selected
  Thread or forces repeated hydration. C1's one-row adapter may start New while
  the old Thread runs, but E1 adds no list/switch UI; U1 owns that UI.
- E1 implements only the exact user Stop-versus-Complete/Fail/Cancel terminal
  race. It does not add a `postStopAction` slot, registration/consumption path,
  lifecycle callback or no-op surface. The one-shot Stop-and-move intent and its
  atomic lifecycle transaction are deferred together to L1, where the first
  real Archive/Trash caller exists.
- One Main-owned shutdown state machine handles ordinary window close and app
  quit. Ordinary close runs only the current Draft navigation-save barrier,
  destroys the Renderer projection after save/explicit Discard and leaves
  background Runs and the Worker alive. App quit runs the same Draft barrier,
  then the process-wide result barrier, then sets one shared shutdown fence in
  a single no-`await` turn, rejects new public commands, aborts accepted Runs
  with explicit `app_exit`, drains them, closes the one Worker and permits one
  real quit. `app_exit` never writes a fake Cancelled terminal; an unsaved or
  abandoned pending Turn restores as Interrupted.
- The existing `threads.subscribe` method may carry a narrow typed lifecycle
  request and return its typed reply over E1-only internal IPC channels. This
  adds no public bridge method or namespace. Main validates request id, phase
  and sender; a stale, duplicate, wrong-window or post-fence reply has no effect.
  Renderer unresponsiveness, a lost reply or a failed Retry never implies
  Discard or permission to close. With no live window, only the process-wide
  result barrier uses an Electron native message box; there is no dirty
  Renderer overlay to guess.
- The Draft barrier reuses the existing Renderer mutation queue and exact
  `materialize/saveDraft` operations. Save success proceeds; failure keeps the
  selected detail and offers Stay, Retry and explicit Discard. Discard restores
  the last Main-acked text, ordered attachments and safe target selection before
  continuing. Copy lists only safe labels and never resolved targets, paths,
  bytes, configs or credentials. Send remains Stay/Retry only.
- The process-wide result barrier derives an ordered exact snapshot of every
  in-memory `settlement_failed` `threadId + requestId` plus a monotonic revision.
  Each row uses the full canonical Thread title and persisted `createdAt` local
  millisecond time; only equal title+time appends the full Thread id. Retry runs
  each retained terminal input once in displayed order, never calls Provider or
  Runtime, and rebuilds the same dialog after partial success, failure or a new
  settlement failure. Stay/Escape cancels pre-fence app quit. An explicit
  Quit-without-saving applies only to the displayed exact set; a pre-fence
  revision mismatch returns to the barrier.
- During fenced drain, a newly failed terminal blocks Worker close and real
  quit again. The same result barrier then offers only Retry saving or explicit
  Quit without saving for the new exact set; it cannot pretend the stopped Runs
  can resume. Repeated close/quit events focus the current prompt and cannot
  duplicate a fence, abort, Worker close or real quit.
- `ThreadLibraryClient.close()` is the one physical Worker-close owner. After
  every accepted operation and settlement has resolved, it sends the existing
  FIFO `close` command and still awaits that exact Worker generation's `exit`.
  A valid close reply plus matching exit completes shutdown. If the close reply
  is missing/invalid after all earlier acknowledgements, the existing transport
  invalidation requests `terminate()` once; observing that same generation's
  exit is sufficient proof that the physical owner is closed and permits quit.
  Until exact exit, shutdown stays fenced and real quit is blocked. Repeated
  quit/close calls join the same in-flight attempt and cannot start or close
  another Worker. Termination rejection or a missing matching exit is an E1
  Stop, not a promised Retry state. The missing-exit observation boundary is
  the existing fixed 5,000 ms transport timeout after the terminate request;
  crossing it never grants runtime quit. No Worker protocol operation is added.
- One Workspace-owned native `<dialog>` remains the only top-level DOM modal.
  The existing full-image view is lifted into that owner without changing image
  URL, authorization or cache behavior. A close/quit confirmation reuses the
  open dialog while retaining its image/src, then restores the last valid
  in-dialog control on Stay; it never stacks a second modal. No image protocol,
  byte transport, capacity or G2R/Permanent-delete behavior changes.

The global concurrency cap is evidence-selected, not guessed or configurable.
Before any candidate sample counts, one immutable OS-temp workload manifest and
its SHA-256 are sealed. It records the Provider-harness SHA-256; exact UTF-8
bytes, length and SHA-256 for every history/input/output text segment; media
type, dimensions, exact byte length and SHA-256 for each source, canonical and
preview image; and exact source/extracted byte length and SHA-256 for the
document. Each candidate and final run verifies every value before Start;
mismatch is INVALID. No length range or regenerated substitute is countable.

That manifest describes the same workload for every Thread: two completed Turns
with exact 4 KiB UTF-8 user and assistant messages, the first carrying two
historical images and one plain-text document with exact 128 KiB extracted UTF-8
text; then one exact 4 KiB pending text with two different images and a second
plain-text document with exact 128 KiB extracted UTF-8 text. Every image is a
valid 1410 x 1410 `image/png` canonical image individually within 8 MiB and has
its derived preview. The Provider then returns exactly 64 KiB UTF-8 assistant
output in 64 x 1 KiB chunks at 10 ms cadence after every Run is accepted.

Image sources are the fixed high-entropy xorshift32 RGBA generator outputs for
seeds `0x4e595831` through `0x4e595834`; the manifest binds the generator
bytes/version and production canonicalizer outputs, including one fixed exact
length and hash per file. The two historical canonical images must total at
least 15 MiB and no more than the existing 16 MiB per-Turn limit; the two pending
images must independently meet the same burden; and their fixed Thread-wide
exact total must be at least 30 MiB and no more than the existing 32 MiB limit.
All four images must also pass the existing per-image, pixel, preview and
Thread-count limits. If the fixed generator cannot meet every burden, E1 returns
to this scope lock before samples run. Each Run uses a real Runtime client and
the same local deterministic streaming Provider. The workload manifest and
generator are part of the independently reviewed E1 evidence; any change
invalidates all samples and returns to this scope lock.

Cap evidence has two ordered stages. First, candidate-specific packaged builds
with fixed caps 2, 4 and 8 are built first and sealed with their source/archive
SHA-256 values and the workload-manifest SHA-256 in a candidate index. They then
run in ascending order, three isolated fresh-profile repetitions each. A higher
candidate runs only if every lower candidate passed; the first failure stops
candidate expansion, and candidate 2 failing stops E1. Every repetition retains
its raw structured result and SHA-256 in the evidence manifest. Each pass
requires no cross-Thread event or terminal contamination, exactly one terminal
per Run, Main routine segments `<16.667 ms`, Renderer heartbeat/stream gap
`<=50 ms`, Stop additional latency `<=50 ms`, and whole-process peak working-set
delta `<=192 MiB`; invalid or missing samples are not PASS.

Second, the largest contiguous passing candidate becomes the one fixed cap in
the final source/archive. Before its runs, a final index seals its exact
source/archive SHA-256 values and the same workload-manifest SHA-256. That exact
final packaged artifact reruns three fresh repetitions at every legal level
among 2, 4 and 8 up to the cap and must pass the same lines. It also verifies
`cap + 1` rejection before the Draft-to-pending Worker command, preserving the
complete Main-acked Draft and creating no Runtime, Provider call, pending Turn
or hidden queue. Any final-artifact failure stops E1; pre-final candidate
evidence cannot substitute for it. The product does not expose a tuning setting.

Required automated checks are:

```text
pnpm --dir apps/desktop exec vitest run electron/preload/index.test.ts electron/main/index.test.ts electron/main/chat/session.test.ts electron/main/chat/session-runtime-chat-state.integration.test.ts electron/main/thread-library/coordinator.test.ts electron/main/thread-library/client.test.ts electron/main/thread-library/service.test.ts electron/main/thread-library/shutdown.test.ts src/ui/chat/use-chat-session.test.ts src/ui/chat/components/ChatWorkspace.test.ts src/ui/chat/components/ChatMessage.test.tsx
pnpm --dir apps/desktop test
mise run desktop:build
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run runtime:chat-state:check
git diff --check
```

The automated matrix must cover same-Thread rejection; A/B independent
prepare/stream/Stop/Retry/terminal ordering; exact cancel isolation; per-Run
Runtime creation/close and Runtime/Provider/storage failure isolation; capacity
rejection before pending commit; background events ignored until exact hydrate;
Renderer teardown/reopen; no sender-owned Run; settlement Retry with zero
second Provider/Runtime call; stable failure-set revision/order; and shutdown
fence idempotence. Draft tests cover last-keystroke immediate Close/Cmd-Q,
materialize/save conflict and failure, Stay, repeated Retry, explicit Discard of
text/attachments/target, empty shell, no-window state and stale lifecycle
replies. Result tests cover 1 and 3 failures, dirty Draft plus failures, same
title/time disambiguation, partial Retry, new failure before/after fence,
explicit exact-set loss, valid close reply plus exit, missing close reply plus
matching terminated exit, injected terminate rejection, injected missing exit
through the fixed 5,000 ms observation boundary, repeated quit and Interrupted
restart. The two injected faults must prove the fence and real-quit prohibition;
their expected fail-closed result is not itself an E1 Stop. DOM tests cover focus
trap, initial focus, Escape, Retry focus, stable copy/VoiceOver order and reuse
of an already-open full-image dialog.

OS-temp and packaged acceptance must bind the versioned candidate evidence and
one exact final source manifest/archive. Dev, production-build and packaged runs
use temporary profiles and the frozen local deterministic Provider, never the
real user root or credentials. The candidate packages and final packaged `.app`
record `app.isPackaged=true`, exact `app.asar`, static Worker and harness
identities. The final artifact executes every legal 2/4/8 level and `cap + 1`
refusal, streams two targets concurrently, stops/retries one without changing
the other, closes and reopens the Renderer while a Run continues, and exercises
every Draft/result/fence/no-window/full-image path above. Failure injection may
use existing dependency seams and OS-temp harness control only; no product test
hook, raw-Electron archive hybrid, relaxed line or generated tracked fixture is
allowed.

E1 stops and returns to this scope lock if implementation needs a file outside
the inventory; changes schema/Worker protocol/sidecar bytes or public bridge
method sets; cannot keep one authoritative ActiveRun owner; needs a queue,
daemon, durable Run, second Worker/connection/Main queue or sender-owned Run;
cannot reject over-capacity before Draft consumption; cannot preserve a dirty
Draft or exact complete result through close/quit failure; cannot identify every
loss confirmation; allows a stale confirmation across a failure-set revision;
writes Cancelled for `app_exit`; closes the Worker while an unconfirmed result
exists; cannot observe exact Worker exit before quit; adds `postStopAction`
before L1; observes terminate rejection or a missing matching Worker exit in a
non-injected OS-temp or packaged acceptance run; stacks DOM modals; weakens
image security/memory behavior; or changes OCaml/runtime protocol,
U1/L1/Q1/P1 behavior or any existing stop line.

Before E1 implementation may be committed, the exact allowed bytes, all
automated checks, the complete OS-temp and packaged evidence, allowed/forbidden
surface scans and an independent strict code review bound to the final artifact
must pass. E1 completion does not authorize U1 without U1's own reviewed scope
lock.

### multi-thread-library/E1-evidence-classification-amendment

Type: documentation-only corrective control step.

Status: complete at `12930fb` after independent strict review
`NYX-MTL-E1-EVIDENCE-AMEND-20260814-01`; `3b3c83a` repaired only the rendered
verdict wording. The later sealed cap-2 `candidate-v4-cap-2-rep-1` was valid and
failed the existing performance lines: Main `265.765833 ms` and whole-process
RSS delta `318064 KiB`. The first-failure rule stopped E1 before cap 4/8.

This amendment depends on scope-lock commit `786cd50` and changes only:

```text
docs/next/agent-workbench-task-slices.md
```

It changes no product scope, file inventory, candidate cap, workload, fixture,
threshold, Stop line or acceptance burden. It repairs only the evidence order
and classification exposed by the first cap-2 attempt. That attempt and its raw
result remain historical `INVALID` evidence and cannot count as PASS, FAIL or
Stop evidence.

The corrected harness must use one raw structured result as the primary truth,
with two independent fields: `validity` is `VALID` or `INVALID`, and `outcome`
is `PASS`, `FAIL` or `NOT_EVALUATED`. A summary may only copy or mechanically
derive those fields; it cannot upgrade an `INVALID` raw result.

For every fresh attempt, the harness must attempt and record all of these before
classifying the outcome:

- exact candidate index, source/archive, `app.asar`, static Worker, harness and
  workload-manifest identity checks;
- proof that the user-data root did not exist before launch, the exact launched
  profile and application generation, and the complete measured process set;
- every frozen workload byte/length/hash check and every required timing/RSS
  metric that remains observable, or the exact recorded product failure that
  made a later metric unavailable;
- exact Provider request/chunk/terminal observations and the complete
  cross-Thread event/terminal contamination audit; and
- one compact canonical audit of both Threads, ordered Turns/items, terminal
  states and resource identities, plus presence/open results and, for every
  present Thread Library database and Thread-owned sidecar file used by the
  sample after application exit, exact byte length and SHA-256.

Running an audit and recording a product mismatch is complete evidence; it is
not an evidence error. Once pre-Start artifact, fresh-profile and workload
identity are proven and the external observer has proven that it delivered the
sealed orchestration, any threshold, terminal, content, isolation or other
product acceptance violation is `VALID` + `FAIL`. Product crash, deadlock,
timeout, missing terminal, failure to exit, or a missing/corrupt database or
sidecar is also `VALID` + `FAIL`, even when it prevents a later metric or normal
post-exit read. The audit records the observed absence, corrupt bytes or open
error; every present database/sidecar still records exact byte length and
SHA-256.

The corrected harness must collect every still-observable metric and audit
instead of throwing or returning at the first product violation. If the product
does not exit, the exact timeout already sealed in the reviewed harness,
including E1's fixed 5,000 ms Worker-exit boundary where applicable, first
records the product failure and full observed process state. The harness may
then terminate only that exact application process tree for evidence cleanup,
recording its PIDs, signal, time and resulting exits before the canonical/file
audit. Forced evidence cleanup can never be reported as a normal product exit.

`VALID` + `PASS` requires every product line and normal exit to pass. The pair
`INVALID` + `NOT_EVALUATED` is reserved for an unproven pre-Start identity,
non-fresh/contaminated profile, workload mismatch, an external observer that
cannot prove delivery or collect an otherwise observable metric/audit, failed
external cleanup, harness/auditor/hash exception, or missing/corrupt raw
evidence. A metric or audit made unavailable by an already-observed product
failure remains a product FAIL, not an evidence error. No other field or
after-the-fact summary may override this classification.

The harness writes the final raw result only after normal application exit or
recorded product failure plus exact external cleanup, and after every
still-possible canonical/file audit. It then records the result's byte length
and SHA-256 in the evidence manifest. Preflight and shakedown attempts never
count. After this amendment enters HEAD, the corrected harness and its new
workload manifest and candidate index must be sealed and independently reviewed
before a fresh cap-2 attempt.
The candidate packages may retain identical bytes only if their source,
archive, `app.asar` and static Worker hashes are recomputed and still match;
the new index must bind the corrected harness and workload-manifest hashes.

The fresh run uses a new absent-before-launch profile. If cap 2 produces
`VALID` + `FAIL`, the first-failure rule stops candidate expansion and E1; no
second repetition is required. An `INVALID` attempt does not count and may be
repeated only with another fresh profile. Any later change to the sealed
harness, workload, fixtures, audit rules, manifest or candidate index returns
to this amendment for exact-byte review before another counted sample.

### multi-thread-library/E1R-incremental-performance-amendment

Type: documentation-only corrective scope and direction gate.

Status: this amendment self-completes without a follow-up status edit only when
an independent strict review accepts these exact bytes and the same bytes enter
HEAD. It is derived from accepted plan `E1R-PERF-PLAN-session-v9`, SHA-256
`79627d88706f254fb50b28b1273679afb5a67a92e5cfe33690b4c299aaf46835`,
review `NYX-E1R-PERF-V9-FINAL-01`. Until completion no E1R gate may run. After
completion only the OS-temp G0 below is executable; no tracked product byte is
authorized.

This amendment changes only:

```text
docs/next/agent-workbench-task-slices.md
```

The prior formal cap-2 evidence remains the historical baseline. Its primary
result is 112153 bytes at SHA-256
`49ec9f262bd70d1244b35e8a856b4f7bce1b1d147f5b519c4e99ddb1355da1b7`;
the stop summary, evidence manifest and harness SHA-256 values are respectively
`29467c6343373acbcffed77fcd4a95099f55d691157726565d3e6d7f81cd6730`,
`a2e8ae7ceddc3073df2f8ea24ce83694dafe8e1ca92c5c4878c1fdd77f746bbc`,
and `37f4a78374a15e1a96bdcd4662594a968a00324c13a070036f4ca3cb20ba6d95`.
Mutable root summaries are not evidence.

The decision is incremental, not a waiver. Main `<16.667 ms` and whole-process
RSS delta `<=192 MiB` remain the final E1 completion and capacity-selection
targets. G0 and the first later product slice need only prove safety,
correctness and paired non-regression; exceeding either final target is recorded
but does not alone fail that direction gate. Public behavior, request bytes,
credentials, ownership, Stop/Retry/settlement/shutdown semantics and every
security or cleanup line remain hard gates.

G0 uses a sealed OS-temp harness and temporary profiles with the exact existing
cap-2 workload. It changes no tracked file and does not run cap 4/8 or the full
E1 matrix. Each of three paired repetitions runs baseline and streaming
candidate in separate fresh processes against the same Electron build, inputs,
local receiver/proxy, routes and fault points; pairs 1/3 run baseline first and
pair 2 runs candidate first. Each repetition covers one Chat Completions Run and
one Responses Run. Only candidate evidence can prove the new direction.

The candidate uses one Session-owned, Run-scoped immutable spool lease. Main
creates a mode-`0700` Run directory and an exclusive mode-`0600` empty spool,
unlinks its pathname before opening or reading the source, then opens the source
on macOS with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`. The opened fd must be a
regular file whose size equals the sealed expected length and stays within the
existing 8 MiB per-image limit. Copy uses 64 KiB chunks, checks abort per chunk,
stops at expected length, reads one extra byte to require exact EOF, and requires
stable before/after `fstat`, byte count and SHA-256. FIFO/non-regular inputs must
fail closed within 1 second. The source closes before Runtime or Provider
effects; the retained spool handle is the only sending source and the existing
outer Session `finally` closes the lease exactly once on every exit path.

Each protocol gets one small feature-local emitter; no general serializer or
transport subsystem is introduced. Native `JSON.stringify` still emits ordinary
fragments. Incremental Base64 retains only 0-2 remainder bytes and pads once at
EOF; Content-Length is computed from exact UTF-8 fragment lengths plus
`4 * ceil(rawLength / 3)`. Read chunk is 64 KiB, stream high-water mark is one
chunk, and observable produced-minus-receiver-consumed bytes may never exceed
1 MiB per request. Slow receiver pause/resume must visibly stop and resume
source pulls. No full image, Base64 string or image-bearing body may be retained
in JS.

On success, baseline and candidate must match method, effective headers,
redirect result, final URL, complete receiver body and public terminal/error
classification for both protocols. Abort, early response and socket close may
produce different-length valid body prefixes, but no corrupted prefix,
post-terminal send, public classification drift, cleanup failure or process
leak is allowed. The same comparisons cover the current proxy and existing
301/302/307/308 behavior; needing a redirect engine stops G0.

Each pair records Main routine segments, whole-process RSS, produced/consumed/
queued bytes, exact body length, spool copy/hash, upload completion, abort,
handle/process exit, and two latency intervals measured from common external
boundaries: materialization entry to receiver first body byte, and Provider send
entry to first response byte or upload/transport terminal. For each interval,
candidate median increase over baseline may not exceed `max(5 ms, 10%)`, and no
single pair increase may exceed `max(15 ms, 25%)`. Candidate Main-max median and
RSS-delta median may not exceed their paired baseline medians.

G0 passes only if all three pairs, both protocols, exact-body success cases,
bounded-memory/backpressure proof, latency/Main/RSS comparisons, fault matrix,
cleanup and exit pass. Native full-body buffering, any semantic/security/user
behavior regression, unbounded source or queue, 307/308 incompatibility,
resource leak, invalid evidence or a required tracked product change is STOP.
An INVALID run may be repeated only with a fresh profile; a valid failure stops
the direction. G0 evidence must receive independent exact review and its status
must enter HEAD before any `multi-thread-library/E1R-P1-scope-lock` is drafted.

The performance stages called P1/P2 in the planning artifact are materialized
here only as `E1R-P1` and `E1R-P2`. Unqualified `P1` continues to mean Permanent
delete and remains blocked by G2R and M1.

`E1R-P1`, `E1R-P2` and all E1/E1R product work remain conditional and
non-executable. A later `multi-thread-library/E1R-P1-scope-lock` must freeze an
exact inventory and preserve Main ownership, Session lease ownership, both
public bridges, Renderer/OCaml boundaries and the text/document-only path.
Persisted image length/SHA-256 may be added only from the exact bytes that passed
full canonical validation, using the same rule for import and publication,
atomically with the image row in one Worker mutation, and immutable thereafter.
An outcome-unknown mutation must be canonically reread before any prepared
sidecar rollback. `E1R-P1` must also rerun the sealed G0 transport matrix through
the real product emitters for both protocols, including per-hop method/body,
sensitive-header retention or removal, final URL, public error, stop-producing
and exact-once cleanup. It does not add a Worker, queue, manager, upload path,
Asset service, public IPC, migration/dual-read, redirect engine, provider state
outside Main or any OCaml/runtime protocol.

### Global Stop conditions

Stop if an active slice requires product code before its gate/scope lock;
Main `DatabaseSync`; raw-SQL RPC, Worker pool or automatic mutation replay;
weaker image security/support/memory guarantees; two durable truths,
dual-read/write or silent migration fallback; Provider effects before pending
Turn commit; missing single-instance ownership; shutdown fencing before Draft
save/confirmation or exact handling of every unsaved complete result;
destructive Library/Thread recovery; rollback of an
outcome-unknown sidecar; ambiguous Run identity; unacknowledged Draft loss;
whole-Thread failure for a degradable resource; ambiguous deep-page selection,
title-hit focus stolen by pagination, silent Search truncation, an illegal
capacity fixture, duplicate simultaneous generic fallback titles, survivor
renumbering, Draft save/discard before the Running decision, an unidentified
result-loss confirmation, unbounded/blank/silently truncated manual titles, or
another
unbounded/inaccessible collection/Search state; premature bridge methods; Trash/Purge content
leakage; a forensics claim; automatic Trash expiry; a new runtime protocol/Run
platform/queue/project model; or a file outside the active inventory.
