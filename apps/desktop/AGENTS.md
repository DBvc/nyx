# apps/desktop/AGENTS.md

This directory contains the Nyx Electron desktop app.

The desktop app is currently the only user-facing product surface. Its default
scope remains `v1 min chat`.

Connections settings, thread-first UI work, current-thread durability, provider
compatibility core, Composer target selection, and the bounded Context Composer
experiment, document-attachments, and Responses protocol workstreams are
allowed only when the user explicitly asks to execute the corresponding gated
agent-workbench workstream or a named slice from
`../../docs/next/agent-workbench-task-slices.md`.

The explicitly requested `multi-thread-library` workstream follows the same
gate. Its reviewed source is
`../../docs/next/multi-thread-library-technical-plan.md`; it may supersede the
single-current-thread, history, Thread IPC, SQLite, and unsent-safe-target
persistence prohibitions only inside its currently executable qualified slice.

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
  Inside an active `multi-thread-library` product slice, Electron main instead
  owns the local Thread Library and Renderer still receives only safe typed
  projections plus its current dirty Draft overlay.
- Inside a qualified `multi-thread-library` product slice, acquire Electron's
  native single-instance lock before importer, Worker, sidecar, image
  authorization, or legacy-root initialization. A secondary process must touch
  none of them.
- Do not import from `runtime/ocaml`.
- Do not use the OCaml runtime outside explicit Electron-main runtime boundary code.
- The runtime-backed chat state path is default-on inside Electron main; `NYX_RUNTIME_CHAT_STATE=0` is only a diagnostic disable.
- Do not expand runtime use into renderer, preload, provider credentials, provider calls, or packaged distribution unless explicitly requested.
- Do not add product features outside `v1 min chat` unless explicitly requested.
- For explicit agent-workbench slices, keep the slice narrow and follow
  `../../docs/next/agent-workbench-task-slices.md`. Do not treat that workstream
  as blanket permission for tools, agents, artifacts, history, browser
  automation, terminal execution, or broader runtime integration.
- The active qualified `multi-thread-library` slice is the sole exception for
  real Thread history. It still does not authorize tools, agents, Projects,
  Folders, Tags, cloud sync, a third workspace region, or broader runtime
  integration.
- Current-thread durability slices may replay only the existing runtime chat
  reducer protocol. They must not add a Thread reducer, new runtime protocol
  messages, runtime startup during snapshot load, or renderer/runtime contact.
- Provider compatibility slices must keep target identity, credentials, raw
  provider payloads, and reasoning activity inside Electron main. They must not
  add shared/preload/renderer contracts or infer runtime behavior from hostnames
  or model names.
- The named `responses-protocol` workstream may supersede the completed
  compatibility-core schema, native-protocol, and opaque-reasoning-state
  prohibitions only inside its active slice. Follow
  `../../docs/next/responses-protocol-technical-plan.md`: protocol configuration
  belongs to each model target; complete Responses continuation items stay in
  integrity-checked Electron-main-only sidecars; Renderer snapshots and OCaml
  remain provider-state-free; no legacy schema readers or silent fallback are
  allowed.
- Composer target-selection slices may expose only safe provider/model selection
  ids, current display labels, availability, and safe attribution through typed
  shared contracts. Electron main must still own resolved targets, base URLs,
  credentials, protocols, provider calls, and fail-closed validation.
- Context Composer E0 stopped on synchronous main-thread encoding. E0B then
  stopped because Chromium's native JPEG output violated the failed v1.8
  candidate's sealed metadata allowlist. The user approved only E0C, which then
  stopped because visible 12×1080p and 8×1080p DOM grids exceeded the fixed
  whole-process memory stop line. E0D later proved the preview-only grid but
  stopped because its temporary fresh-byte/Blob/object-URL full-open path
  exceeded the same line. This does not prove derived previews generally
  infeasible. The user approved only E0E: an OS-temp feasibility gate for one
  stable, main-authorized, opaque local image URL that streams a canonical file
  without sending JS-owned full bytes or paths through preload/IPC. E0E then
  stopped because Chromium removed a non-default explicit port before the
  standard custom-protocol handler, so the sealed exact-route authorization
  rule could not reject it. E0F then passed its independently reviewed OS-temp
  canonical-identity, native-cache, revocation, security, memory, and `app.asar`
  gate. This is feasibility evidence, not selection of a product protocol by
  itself. The later v3.0 plan passed `RC-V3-PLAN-03`. E1 completed at `1bf91cf`
  and passed `RC-E1-CODE-02`; E2 completed at `36e32e6` and passed
  `RC-E2-CODE-03`; E3 completed at `7677868` and passed `RC-E3-CODE-02`. E4 is
  complete at `b13d3b8` and passed `RC-E4-CODE-02`. `RC-E5-EVIDENCE-01` stopped
  the first packaged run because Chromium erased credentials before the handler.
  The user-approved v3.1 amendment passed `RC-E5-PLAN-A-02`; E5 then stopped at
  the fresh-process 4K memory gate. `RC-E5-4K-MEMORY-01` returned `VALID_STOP`.
  The user approved only bounded option A: one E4M Worker live-set repair
  candidate. Its v3.2 amendment passed `RC-E4M-PLAN-02`, then E4M stopped at
  `RC-E4M-EVIDENCE-01` when the first valid 4K repetition still measured
  +299.828 MiB. The uncommitted Worker change was reversed. The user then
  approved one bounded E4R review candidate: decoder-time proportional resize
  of new images above a 2048-pixel long edge, without cropping or changing
  historical-image reads. The revised plan passed `RC-E4R-PLAN-03`, but E4R
  stopped at its oversized EXIF-orientation gate: the source decoded as portrait
  while the product persisted landscape full and preview output. The ordinary
  matrix was not run and the uncommitted product diff was reversed. No E slice
  was executable until the user approved one bounded E4L fallback: reject new
  imports above 4,194,304 pixels before Worker decode, enforce the same limit on
  new main-owned writes, and preserve historical reads. E4L completed at
  `5ed2b06` and passed `RC-E4L-CODE-02`; packaged picker, paste, drop, and
  oversized preflight acceptance passed. E4R, E4M, and E5 remain stopped, and
  no E slice is executable pending a new user decision.
  Electron main must remain authoritative
  for validation, metadata policy, file IO, durable state, Provider mapping, and
  errors. OCaml remains a text-only projection. No scope expansion is authorized.

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
- model routing or picker UI beyond the bounded Composer target selector
- Recent, thread switching, or persistent multi-thread history
- markdown rendering
- tool UI
- agent UI
- plugin UI
- artifact UI
- multimodal behavior outside an explicit active Context Composer or
  document-attachments slice

This is the ordinary-task default. The named `multi-thread-library` workstream
may add only the real Thread Library behavior owned by its active qualified
slice and reviewed dependency chain.

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

Explicit `multi-thread-library` workstream status:

- S0 is complete. G1/G2 both reached independently reviewed `VALID_STOP`; no
  product behavior was changed.
- The v5.3 landing candidate self-completes when its recorded exact-byte reviews
  pass and those bytes enter HEAD; no follow-up status edit is required. After
  that, G1W/G2R are OS-temp gates only and may not wire product code.
- After G1W passes, later qualified slices may replace the one current-thread
  store with a Main-authorized SQLite Thread Library whose single
  `DatabaseSync` connection runs only in one application Node Worker, plus
  Thread-owned sidecars; add `window.nyx.threads`; retain and thread-scope
  `window.nyx.chat`; and support New/switch/Pinned/Recent/Rename/Archive/
  Unarchive/Trash/Restore/Search.
- Main may never fall back to synchronous SQLite. Do not add raw-SQL RPC,
  Worker-per-Thread, a Worker pool, `utilityProcess`, ORM, repository interface,
  a second database connection, or automatic mutation replay.
- A materialized Thread Draft may persist only its safe target selection id.
  Resolved targets, base URLs, raw configs, protocols, and credentials stay in
  Electron main, and the Composer selection never mutates the global default.
- Renderer owns only lightweight summaries, the selected Thread projection,
  one current dirty Draft overlay, and local selection/reading state. It must
  not become a second durable history owner or cache all Thread details.
- Each Thread may have at most one active Run; cross-Thread concurrency is
  bounded and Electron-main-owned. Renderer/window destruction does not cancel
  a Run; app quit first saves/confirms the current Draft, then exact-retries or
  explicitly confirms loss of every process-wide `settlement_failed` complete
  result. A new result-save failure during drain blocks Worker close/exit again.
  Only then may shutdown fence complete. OCaml remains a rebuildable text
  projection with no new Thread protocol.
- A Thread Library Worker/open/schema/pragma/quick-check/permission failure is
  fail-closed: preserve DB, journals, sidecars, staging and the legacy root;
  expose Retry only and never New thread, Start fresh, reset, Provider start,
  Thread detail/Search, or image authorization.
- A safely identifiable Thread whose canonical content cannot be rebuilt
  remains visible, stable and Retry-only. Image/document failures retain the
  existing per-resource unavailable behavior; corrupt Responses refs use exact
  controlled repair before whole-Thread failure. A Worker mutation with unknown
  commit outcome must be reread by exact identity; never delete a prepared
  Responses sidecar merely because the reply was lost.
- Product code is allowed only after the exact slice dependencies and
  allowed-file inventory in `../../docs/next/agent-workbench-task-slices.md`
  pass independent review.
- Reversible A1 is independent of Permanent delete; legacy-root cleanup M1 runs
  only after A1. Purge schema/IPC/UI and even a disabled Permanent delete
  affordance remain absent until G2R, M1, and P1's own scope lock pass.

Completed third `provider-compatibility-core` workstream additions:

- preserve provider identity in one Electron-main-only resolved chat target
- extract the current generic request mapping without changing its wire shape
- normalize only text, reasoning activity, finish, and provider error events
- make output-limit and empty-final behavior explicit and retryable where
  approved

Still not allowed after that third workstream:

- provider-specific request parameters or automatic host/model detection
- adapter registries, capability profiles, or Connections store migrations
- Settings UI, model picker UI, or new shared/preload/renderer APIs
- raw reasoning display, persistence, or reuse as assistant content
- tools, usage, sources, files, structured output, or native protocol adapters
- provider calls, credentials, or adapter execution in OCaml

Explicit `responses-protocol` workstream additions, only inside its named
active slice:

- strict Connections v2 and secret-store v2 with explicit per-model protocol
  configuration
- one main-only OpenAI Responses request and semantic-stream path
- strict current-thread v5 with completed-turn continuation sidecar refs
- exact-target replay of bounded complete Responses output items
- durable settlement before runtime projection update

Still not allowed in this workstream:

- legacy v1/v4 readers, schema migrations, protocol detection, silent fallback,
  or duplicate provider requests
- tools, usage, sources, structured output, remote file ids, reasoning text
  display, or unrelated model tuning
- adapter/capability registries, new IPC/runtime protocols, multi-thread
  history, or Provider state in Renderer/preload/OCaml

Implemented D1-D4 `composer-target-selection` workstream additions:

- a redacted selectable-target catalog on the existing Connections overview
- a renderer-local, unsent Composer target draft
- an explicit safe target selection on each chat request
- Electron-main validation, resolution, and durable target binding before
  runtime or provider side effects
- a version-2 current-thread record with safe selection and attribution
  metadata
- a compact Composer target selector and compact assistant attribution
- deterministic hydration, New thread, Retry, unavailable-target, and `.env`
  fallback behavior

The required automated D5 acceptance passes. Interactive two-target provider,
streaming-switch, failure/recovery, and restart acceptance remains pending in
`../../docs/next/composer-target-selection-runthrough.md`.

Still not allowed in that fourth workstream:

- full base URLs, credentials, raw provider configuration, or provider calls in
  D-added Composer, target-catalog, chat, snapshot, or attribution surfaces;
  the existing typed Connections Settings provider-detail editing contract is
  unchanged
- changing the Connections persisted schema or global default as a side effect
  of Composer selection
- provider-specific request parameters, hostname/model inference, adapter
  registries, or capability profiles
- attempt history, Recent, thread switching, or persistent multi-thread history
- a new chat/thread IPC namespace or new OCaml runtime protocol messages
- tools, usage, sources, files, structured output, or native protocol adapters

Stopped E0 `context-composer-experiment` scope gate:

- the real-target and ordinary performance checks passed
- a 25 MP / 7.78 MiB high-entropy PNG blocked Electron main for about 1 second
- the minimum 8 MP / 8 MiB class fixture also blocked Electron main for about 1
  second
- synchronous main-owned canonicalization was rejected; E1-E5 were blocked at E0

Stopped E0B feasibility gate:

- in the recorded environment, the OS-temp production-shape Vite Worker
  harness loaded its static Worker in dev, build, and `app.asar`; this was not
  production Renderer integration
- Chromium's same-MIME JPEG output contained an ICC APP2 segment
- main rejected that segment under the failed v1.8 candidate's sealed
  APP1-APP15 deny rule
- no capacity limit of any kind is frozen; the candidate-limit table in
  `../../docs/next/context-composer-experiment-runthrough.md` is the status
  reference

The old v1.8 Worker/JPEG/allowlist design, every numeric limit, and its E1-E5
slice and file lists are historical candidate material only. They are non-operative
and are not implementation permission. E0C proved one stable exact Chromium ICC
candidate but failed its visible-grid memory gate, so it did not freeze an
implementation allowlist or any capacity. E0D also stopped without freezing a
capacity or choosing a product full-image transport. E0E also stopped without
freezing a scheme, URL shape, or transport. E0F passed its bounded OS-temp
feasibility gate, but it does not by itself select a product protocol or freeze
a product capacity. The later v3.0 plan passed `RC-V3-PLAN-03`; E1 completed at
`1bf91cf` and passed `RC-E1-CODE-02`; E2 completed at `36e32e6` and passed
`RC-E2-CODE-03`; E3 completed at `7677868` and passed `RC-E3-CODE-02`. E4 is
complete at `b13d3b8` and passed `RC-E4-CODE-02`. The v3.1 amendment passed
`RC-E5-PLAN-A-02`; E5 then stopped at `RC-E5-4K-MEMORY-01`. The user-approved
E4M candidate passed plan review as `RC-E4M-PLAN-02`, then stopped at
`RC-E4M-EVIDENCE-01`. The user-approved E4R 2048-edge proportional-resize plan
passed `RC-E4R-PLAN-03`, then stopped at its oversized EXIF-orientation gate;
its uncommitted product diff was reversed. The user-approved E4L 4-MiPixel
new-import limit completed at `5ed2b06` and passed `RC-E4L-CODE-02`. E4R, E4M,
and E5 remain stopped; no E slice is executable pending a new user decision.
Main authority and durable ownership remain active E boundaries; no
scope expansion is authorized.

E0 through E0F evidence is recorded in
`../../docs/next/context-composer-experiment-runthrough.md`. E4R, E4M, and E5
are stopped; E4L is complete and no E slice is executable.

Still not allowed in this fifth workstream:

- PDF, document, audio, video, HEIC, SVG, GIF, or WebP input
- remote upload/file ids, a general Asset service, database, hash deduplication,
  reference counting, or cross-thread sharing
- capability inference/registry, provider-specific policy, or Connections
  schema/default changes
- rich-text Composer, assistant image/rich output, Markdown, HTML, Artifact, or
  Generative UI rendering
- a new chat/thread IPC namespace, new OCaml actions/protocol messages,
  multi-thread history, tools, or agents

Explicit `document-attachments` workstream status:

- the v2.5 amendment records the user-approved option A after the reviewed v2.4
  baseline and is bound at SHA-256
  `38714f5888a17438848e37ca27be629114a7e2fe9f2c08a05e9b5b3006c50f4c`
- the docs-only `document-attachments/S0` scope lock is bound to review contract
  `RC-DOC-S0-RATCHET-01` and landed at `43a2020`
- the OS-temp `document-attachments/G1` extractor gate stopped under
  `RC-DOC-G1-EVIDENCE-01` because the reviewed candidate accepted a valid ZIP64
  DOCX; DOCX is deferred; the reduced strict-text/PDF v2.5 amendment passed
  `RC-DOC-V25-PLAN-01`, and the reduced OS-temp G1 gate passed
  `RC-DOC-G1-REDUCED-EVIDENCE-01`
- `document-attachments/D1` completed at `42e4ade` and passed
  `RC-DOC-D1-CODE-03`; it remains fail-closed and does not enable product
  document input
- `document-attachments/D2` completed at `bde0021`; the D3 real-target and
  packaged-product matrix passed; `RC-DOC-D3-F001-R1` repaired the sole
  final-review finding, scoped `RC-DOC-D3-FINAL-CODE-01` passed, and the local
  baseline is complete; no document-attachments slice is executable; native
  PDF `N0/N1` remains non-executable
- this status does not reopen E4R, E4M, or E5

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
