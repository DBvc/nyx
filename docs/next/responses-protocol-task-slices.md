# Responses Protocol Task Slices

<!-- nyx-workstream-status-owner: responses-protocol -->

This file is the canonical current-status and contract owner for this
workstream. Historical review and commit identities remain inside the
migrated blocks; they are not permission to rerun completed slices.

## Migrated Source Block: responses-protocol/status-summary

<!-- nyx-contract-start: responses-protocol/status-summary sha256:237f94298b6bd88a581698f29539b5598f9b9b77534bf731a9847eed244cc3c5 -->

- The explicitly requested `responses-protocol` workstream is complete. Its
implementation source is
[responses-protocol-technical-plan.md](./responses-protocol-technical-plan.md).
S0, G0, the atomic C1+P1 cutover, D1, I1, and A1 are complete. I1 landed at
`0b8a542`; A1 repaired one terminal-message compatibility defect at
`89e012e`, then passed its real-provider and packaged-product matrix. No
`responses-protocol` slice is executable.
<!-- nyx-contract-end: responses-protocol/status-summary -->

## Migrated Source Block: responses-protocol/contracts

<!-- nyx-contract-start: responses-protocol/contracts sha256:97cd4c5a1f43c50323c06f49253398199b3c3c00b3c18c36b7ec2f66c3218564 -->

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
docs/next/responses-protocol-task-slices.md
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

<!-- nyx-contract-end: responses-protocol/contracts -->
