# Document Attachments Task Slices

<!-- nyx-workstream-status-owner: document-attachments -->

This file is the canonical current-status and contract owner for this
workstream. Historical review and commit identities remain inside the
migrated blocks; they are not permission to rerun completed slices.

## Migrated Source Block: document-attachments/status-summary

<!-- nyx-contract-start: document-attachments/status-summary sha256:de7be56acacd96f9b00c0a13e4c66b2cce04746bddb286886d0c687bb53d59fd -->

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
<!-- nyx-contract-end: document-attachments/status-summary -->

## Migrated Source Block: document-attachments/contracts

<!-- nyx-contract-start: document-attachments/contracts sha256:6e97617d76008362bd36656c1bac3ba742ce35d07fa041e244458f49c33b0bdb -->

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
docs/next/document-attachments-task-slices.md
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

<!-- nyx-contract-end: document-attachments/contracts -->
