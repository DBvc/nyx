# Composer Target Selection Runthrough

Acceptance date: 2026-08-07

Status: required automated verification passed; interactive provider and
restart acceptance remains pending.

## Scope And Evidence Boundary

This runthrough covers the bounded D1-D4 Composer target-selection
implementation. It does not broaden Nyx into automatic routing, a general model
picker, provider-specific policy, persistent thread history, or a new runtime
provider boundary.

The acceptance session had a configured local `.env` fallback and could launch
the Electron app. Launch restored the existing current thread and displayed the
safe Composer selector, but no controlled interactive channel was available for
the full provider matrix. No new provider request was sent during this
runthrough. Earlier C4 provider evidence remains baseline compatibility evidence
only; it is not counted as D5 target-selection acceptance.

The exploratory launch command was:

```sh
env NODE_USE_ENV_PROXY=1 mise run desktop:dev
```

It exercised application launch and safe snapshot/catalog presentation only;
it did not exercise a Send, Retry, target switch, provider failure, or controlled
before/after restart path.

Credential values, full base URLs, authorization headers, raw provider
configuration, raw reasoning, and raw provider payloads were neither printed nor
copied into this document.

## Automated Verification

The required commands passed on 2026-08-07:

| Command                  | Result | Evidence                                                                                                                                                                                        |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mise run desktop:check` | Pass   | 31 desktop test files passed and 5 skipped; 344 tests passed and 16 skipped. The runtime-backed chat-state integration passed 8/8, followed by both typechecks, lint, and the production build. |
| `mise run check`         | Pass   | Desktop native and compatibility typechecks, desktop lint, runtime checks, and the runtime-backed chat-state integration passed.                                                                |
| `mise run format-check`  | Pass   | Desktop formatting and OCaml `@fmt` checks passed.                                                                                                                                              |
| `git diff --check`       | Pass   | No whitespace errors.                                                                                                                                                                           |

A focused regression command also passed 75/75 tests across the Current Thread
store, Current Thread session coordinator, and chat session:

```sh
pnpm --dir apps/desktop test \
  electron/main/current-thread/store.test.ts \
  electron/main/current-thread/session-coordinator.test.ts \
  electron/main/chat/session.test.ts
```

The focused coverage proves that an ordinary completed, cancelled, or failed
turn cannot settle before its safe target attribution is durably bound. The only
unresolved settlement is an empty retryable `target_unavailable` failure from
main-owned target resolution.

## Demonstrated Implementation Evidence

| Area                               | Result                                 | Evidence                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safe target catalog                | Pass (automated and source inspection) | The existing Connections overview exposes provider/model ids and labels plus an optional `.env` model id. Catalog tests exclude disabled or unusable targets and sensitive configuration.                                                                                                                      |
| Explicit request target            | Pass (automated)                       | Every Send and Retry request requires one safe selection. Electron main validates and resolves it without silently choosing another target.                                                                                                                                                                    |
| Durable binding and attribution    | Pass (automated)                       | Current Thread version 2 persists the submitted selection, binds main-confirmed attribution exactly once before runtime/provider work, and projects safe attribution into snapshots and renderer state.                                                                                                        |
| Failed target resolution           | Pass (automated)                       | A missing, disabled, unconfigured, or otherwise unusable selected target settles as retryable `target_unavailable` with null attribution and no fallback.                                                                                                                                                      |
| Draft and active-request lifecycle | Pass (automated)                       | Snapshot/catalog arrival order, catalog refresh, active-generation draft changes, Retry identity, New thread reseeding, and unavailable committed selections have deterministic reducer/session coverage.                                                                                                      |
| Version and compatibility behavior | Pass (automated)                       | Stable version-1 records are not rewritten, real mutation/recovery upgrades lazily to version 2, unknown versions fail closed, runtime replay ignores target metadata, and generic/Ark/GLM fixture regressions pass.                                                                                           |
| D-added security boundary          | Pass (source inspection and automated) | Target catalog, chat selection/events, snapshot, and durable target binding contain only safe ids, labels, effective `.env` model id, and fixed safe errors. The Connections Settings provider-detail contract remains the only renderer-visible full base URL contract; credentials stay Electron-main-owned. |

The D implementation changed no `runtime/ocaml` file and did not migrate the
Connections version-1 persisted schema.

## Interactive Verification Status

The following D5 cases are still pending. Automated coverage exists for their
state transitions, but it is not a substitute for the required interactive
evidence.

| Required case                                                                                      | Status  | Evidence boundary                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Send through two configured provider/model targets and confirm actual assistant attribution        | Not run | The app launched with local configuration, but no D5 provider request was sent.                            |
| Change the draft while streaming; active response stays bound and the next turn uses the new draft | Not run | Automated reducer/session coverage only.                                                                   |
| Trigger a retryable provider failure, choose another target, and Retry with stable message ids     | Not run | Automated session and reducer coverage only.                                                               |
| Make the committed target unavailable, prove no fallback, then recover through Retry               | Not run | Automated resolver/session/reducer coverage only.                                                          |
| Restart with a committed selection and attribution while discarding an unsent draft                | Not run | Launch restored an existing thread and selector, but the complete before/after D5 setup was not exercised. |
| New thread reseeds the current global default or `.env` without mutating the default               | Not run | Automated reducer/session coverage only.                                                                   |
| Stop, interrupted recovery, generic streaming, Ark text, and GLM reasoning through the D selector  | Not run | C4 evidence predates D and is not reused as D5 proof.                                                      |

D5 must remain pending until these rows have real evidence. When they are run,
record the safe target labels or redacted target kinds exercised, the exact
restart/failure path, and the observed attribution without copying credentials
or raw provider data.

## Ownership And Compatibility

Renderer owns only the in-memory unsent selection draft, safe catalog
projection, and safe attribution display. The version-2 Current Thread record
owns the latest committed selection and per-turn safe attribution. Electron main
alone resolves base URLs, credentials, protocols, and effective provider/model
execution.

Current Thread version 2 is forward-only. A binary that understands only
version 1 may fail closed when it encounters a version-2 record. This workstream
does not downgrade, rewrite, or guess historical target identity for older
records.
