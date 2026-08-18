# Multi-Thread Library Runthrough

This file records durable evidence for the gated Multi-Thread Library workstream.
It does not authorize product implementation; executable status remains in
[multi-thread-library-task-slices.md](./multi-thread-library-task-slices.md).

## NF1 Retirement Decision

The prospective `NYX-MTL-E1R-NF1-COMPAT-14` and
`NYX-MTL-E1R-NF1-14` gates were retired by explicit user decision on
2026-08-18. Neither gate ran, so this decision records no PASS or `VALID_STOP`
result and unlocks no product slice.

The pre-retirement contracts and evidence remain available in
[multi-thread-library-e1r-contracts.md](./multi-thread-library-e1r-contracts.md).
Any future native-fetch work requires a new explicitly requested and
independently reviewed scope contract.

## E1S — Bounded Multi-Thread Runs

Result: complete.

- Scope contract: `NYX-MTL-E1S-SCOPE-20260818-01`, independently accepted and
  committed at `4433dc8`.
- Product commit: `19c90ef`.
- Electron Main now owns one exact per-Thread Run map. It admits no more than
  two Runs process-wide and no more than one attachment-bearing Run. Both
  limits are checked before Draft-to-Turn mutation.
- Thread selection and New save the departing Draft and detach the Renderer
  projection without cancelling accepted background work. The bounded sidebar
  page exposes `Running` and `Saving failed` state and rebuilds selected detail
  from Main-owned state.
- Exact Stop affects only its `threadId + requestId`. Terminal completion,
  failure, cancellation and explicit settlement Retry keep the existing
  Thread Library ownership and transaction path.
- Focused coverage proves two concurrent text Runs, third-Run rejection and
  later admission, attachment serialization, exact cancellation, preflight
  Stop without Draft mutation, background switching without per-delta Library
  hydration, and reachable settlement failure.
- Required checks passed: desktop TypeScript checks with both compilers, lint,
  format check, all 50 desktop test files (`573` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, and
  `git diff --check`.

E1S does not revive or extend E1, E1R, NF1, COMPAT, v40 or R2. It changes no
fetch transport, redirect behavior, backpressure, Base64 attachment mapping,
SQLite schema, Worker count or OCaml protocol. The accepted baseline still
allows one attachment-bearing Provider history materialization at a time.

## G1 — SQLite on Electron Main

Result: `VALID_STOP`.

- Evidence SHA-256: `08344163b01574bf1327e33151d982d55871151dd382dca15a82868996d62f0a`
- Harness source aggregate SHA-256: `fe982fb4cba8f3a235f7039a6bd29a0524c5426e93db22c07a9e9eb222b04467`
- Environment: macOS 26.6.1 arm64, Electron 41.7.2, Node 24.15.0, SQLite 3.51.3.
- Correctness passed in dev and production build: STRICT, foreign keys,
  rollback, close/reopen, DELETE journal, quick check, 0700/0600 permissions,
  committed and uncommitted real SIGKILL recovery.
- The final batched dev candidate stayed within the line: routine maximum
  `4.208 ms`, stream gap `6.996 ms`, Renderer heartbeat `5.0 ms`, Stop
  additional latency `3 ms`.
- The same source in production build had one individually durable Draft update
  of `19.623 ms`, above the fixed `16.667 ms` Main routine line. The simultaneous
  stream gap was `19.956 ms`; Renderer heartbeat stayed at `5.1 ms` and Stop
  additional latency at `15 ms`.
- The first valid over-line sample ended the gate. `app.asar` and packaged runs
  were not started and remain unproven.

Conclusion: SQLite remains selected, but no product `DatabaseSync` call may run
on the Electron Main event loop. G1W must prove one whole-DB Node Worker before
D1 can begin.

Independent evidence review `NYX-MTL-GATES-EVIDENCE-20260812-01` accepted this
Stop with one non-blocking audit advisory: future gates must retain each raw
structured result, not only the exact-hash report and sources.

## G2 — Same-process image revocation

Result: `VALID_STOP`.

- Evidence SHA-256: `86143ad9ebf80ffb6957b354e509633432c5b7c8b71df87b27bb5f44dd5ec8ae`
- Harness source aggregate SHA-256: `0ae46ace8ed906c9a3b2f5a1ffba306868669f18fbfb01ae98bcff9a99fe27e5`
- Environment: macOS 26.6.1 arm64, Electron 41.7.2, Chromium 146.0.7680.216.
- `no-cache` failed: retained and new preview/full images remained visible from
  warmed native cache after authorization was revoked.
- `no-store` passed revocation, reload/restart and Renderer byte/path isolation,
  but its first valid 4K + 9-preview repetition ended with post-close medians
  `432.000 → 452.141 → 469.453 MiB`, exceeding the frozen `16/8 MiB` plateau
  allowances. Peak delta remained below the separate `192 MiB` line.
- Existing immutable caching plus `session.clearCache()` failed: retained/new
  preview/full images and a same-process reload still used the warmed resource.
- The first valid Stop ended the gate. `app.asar`, packaged runs and later
  memory repetitions were not run because they could not repair an earlier
  candidate failure.

Conclusion: Permanent delete remains absent. Reversible Archive, Trash and
Restore are unaffected. G2R may test only the native `webFrame.clearCache()`
directions frozen by the v5.3 plan; it may not weaken security, image support or
memory lines.

Independent evidence review `NYX-MTL-GATES-EVIDENCE-20260812-01` accepted this
Stop and did not claim that every future revocation design is impossible.
