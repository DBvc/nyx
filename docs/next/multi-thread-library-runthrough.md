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

## E1S-R1 — Bounded Run Correctness Repair

Result: complete.

- Scope contract: `NYX-MTL-E1S-R1-SCOPE-20260819-01`, committed at `b00bc27`.
- Scope review receipt: `NYX-E1S-R1-SCOPE-REVIEW-20260819-01`, judgment
  `accept`, reviewed artifact SHA-256
  `e73cea71a9e5e1c2a41f16092e8c7a4caf87326765e3a7d2bfa62af4cc6ec998`.
- Product commit: `6566b93`.
- Exact product diff SHA-256:
  `554d00b9d0f925c1aab1411a2a52e85b44ef2a742733b95f1416bed904d52e42`.
- Electron Main publishes process-wide Run capacity from the existing exact
  active-Run owner. Full hydration captures that projection at the list event
  boundary, while later capacity events advance independently from selected
  detail hydration.
- Renderer replaces the canonical first Available page from Main instead of
  locally inserting, sorting or mutating rows. A selected Thread outside that
  page remains a separate Current thread row with live Running and Saving
  failed state.
- Clean Draft saves are no-ops. Immediate Select or New after Send shares the
  existing FIFO without a second Draft revision, while dirty saves, failures
  and empty-shell discard keep their previous behavior.
- Retry capacity classification uses the retried canonical history and ignores
  unrelated current Draft attachments. Main remains the final pre-mutation
  enforcement owner.
- The code ratchet found two projection defects before acceptance: one event
  watermark could suppress list-level updates, and one off-page Current row
  could lose live status. One bounded repair fixed both. A fresh independent
  `dbx-diff-review` receipt at Codex task `e1s_r1_ratchet_rereview`, bound to
  the exact product diff SHA-256
  above, returned PASS with no S0-S3 findings.
- Required checks passed: desktop TypeScript checks with both compilers, lint,
  format check, all 50 desktop test files (`583` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, and
  `git diff --check`.

E1S-R1 changes no fetch transport, redirect or backpressure behavior, Base64
attachment mapping, SQLite schema, Worker protocol/count or OCaml protocol. It
does not revive E1, E1R, NF1, COMPAT, v40, R2 or any retired gate.

## CP1 — Available Pagination and Pinned/Recent Projection

Result: complete.

- Scope contract: `NYX-MTL-CP1-SCOPE-20260820-01`, independently accepted and
  committed at `1131cfe`. The user-narrowed contract entered HEAD at `98caec8`
  and removed custom roving keyboard navigation, automatic focus movement,
  live loading announcements and manual VoiceOver evidence from CP1.
- Product commits: `51d0e25`, `ceef5d2` and `44d5008`; final bounded repairs:
  `36575c6` and `0247c69`.
- The exact 17-file diff from baseline
  `823228705e518218df0fb55de1ad0265ea2d0ee6` through product head
  `0247c696a24f8b7add0d79573bbba8162eced14c` had SHA-256
  `daffe2db1174f7567309269db9c1e17423393551f4b273f9f874243d311aaada`.
- Automated coverage loads 137 Available rows as 50, 50 and 37 and preserves
  50 Pinned plus 100 Recent rows in Worker order across page boundaries. It
  rejects duplicates, mixed group order, malformed pages, stale cursors and
  candidates beyond the explicit page budget.
- Worker projection validates identity, location, Pin grouping and only the
  actual keyset fields for each location. Corrupt ordering metadata in a page
  row, anchor or lookahead fails closed as Library unavailable, while unrelated
  damaged content remains isolated as Thread unavailable.
- Renderer keeps the opaque page cursor separate from the public event cursor
  and Run capacity. Page conflicts permit one bounded candidate rebuild; cursor
  gaps and epoch replacement use full hydration, and late pages cannot replace
  a newer projection.
- A selected Thread outside the loaded prefix remains one separate Current
  thread row. Exact `get`, one replacement hydration and the second-miss page
  error form a bounded recovery path without dropping selection, fabricating a
  row or looping. Component coverage includes loading, loading-more, initial and
  later Retry, group order, Current-thread de-duplication and final Load-more
  removal.
- Independent final review `NYX-MTL-CP1-FINAL-REVIEW-20260821-01` recomputed the
  exact diff fingerprint, inspected all 17 allowed files, ran 142 focused tests
  and returned `accept` with no S0-S3 findings. Reviewer provider:
  `dbx-linus-review`; capability: `strict_pragmatic_diff_review`; independence:
  `independent`.
- Required checks passed on 2026-08-21: both desktop TypeScript checks, lint,
  format check, all 52 desktop test files (`625` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, documentation check,
  workspace format check and `git diff --check`.

CP1 adds no Pin mutation, schema/index, IPC/preload method, second database
owner, full-library Renderer cache, automatic infinite loading, around-page API,
Runtime/Provider/attachment change or historical U1/L1 behavior.

## PIN1 — Bounded Pin Lifecycle

Result: complete.

- Scope contract: `NYX-MTL-PIN1-SCOPE-20260820-01`, independently accepted
  under review binding `NYX-MTL-PIN1-SCOPE-REVIEW-20260821-01` and committed at
  `ddfc0cd`.
- Product commits: canonical transaction `a83dfc3`, ordinary controls
  `f08bf6a`, and final bounded pagination-recovery repair `4b77390`.
- The exact 21-file product diff from scope-lock head
  `ddfc0cd27b9f5065d351a5d6d618cd51e6855366` through product head
  `4b77390732d2c3190f4542295906913e86d8b5d3` had SHA-256
  `6ce8c5c10597623177a9ea84244661bf0777aa7ce17d5a5f46911b3300b49afe`.
- The public boundary adds one semantic `threads.updatePin` method and one
  `nyx:threads:update-pin` channel. It exposes no SQL, caller-selected absolute
  position, complete Pin order or Worker diagnostics.
- Worker coverage proves all six actions, new Pin at the top, stable relative
  order, continuous unique positions, boundary no-ops, stale guards,
  collision-free two-phase rewrites, full rollback and restart persistence.
  Pinned empty-shell removal closes positions in the same atomic transaction.
- Main keeps only fixed-size pre-state, serializes Pin and empty-shell writes
  behind one barrier, and never replays an unknown mutation. One replacement
  generation plus one `pinState` read distinguishes exact pre-state conflict,
  expected post-state success and fail-closed third states.
- Renderer uses ordinary buttons, performs no optimistic reorder and holds one
  collection-wide action gate through the authoritative bounded rebuild. Known
  changes, boundary no-ops, target failures and replacement event/response
  ordering preserve safe row errors, selection and the loaded-page budget.
- The first final review found that unknown-outcome replacement hydration could
  collapse a two-page projection to one page. Repair `4b77390` made the action
  capture and preserve its loaded-page budget and added event-first and
  response-first 100-row conflict regressions with exact bounded reads.
- Independent final review `NYX-MTL-PIN1-FINAL-REVIEW-20260822-02` recomputed
  the exact diff fingerprint, inspected all 21 allowed files, ran 215 focused
  PIN1 tests and returned `accept` with no S0-S3 findings. Reviewer provider:
  `codex-subagent-pin1-final-20260822-02`; capability:
  `strict_pragmatic_diff_review`; independence: `independent`.
- Required checks passed on 2026-08-22: both desktop TypeScript checks, lint,
  format check, all 52 desktop test files (`663` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, documentation check,
  workspace format check and `git diff --check`.

PIN1 adds no schema/index, second database or durable Renderer owner, raw-order
IPC, replay of an unknown mutation, optimistic persistence, custom
keyboard/focus/live-announcement behavior, Search, Archive or other lifecycle
work, or Runtime/Provider/Responses/attachment change. It grants no follow-up
slice.

## Rename — Manual Thread Title

Result: complete.

- Scope contract: `NYX-MTL-RENAME-SCOPE-20260822-01`, committed at `cf74d4b` by
  the user's explicit bounded lifecycle authorization.
- Product commit: `2b4c39386d3ef7f90c2c7e46684353d413fd2719`.
- The exact 21-file diff from scope-lock head
  `cf74d4bce0186e2211bb88d8fba44946846ede52` through product head had SHA-256
  `05bf1da38357cecb048955e33c5a1f52c7f5212f864ca55f0f28889efbd2da22`.
- One shared validator trims titles, accepts 1–48 Unicode code points and
  rejects invalid input before any write. Worker tests cover Available and
  Archived Rename, duplicates, stale revision, Trash rejection, manual no-op,
  fallback-identity clearing and unchanged activity ordering.
- Main adds one typed Rename IPC path, serializes it with Pin and empty-shell
  discard, and never replays an unknown write. Unknown reconciliation performs
  one replacement plus one existing exact Thread read.
- Renderer uses inline Enter/Escape Rename and shares the existing collection
  action gate with Pin. It performs no optimistic title write and waits for the
  canonical bounded collection refresh.
- Required checks passed on 2026-08-22: both desktop TypeScript checks, lint,
  format check, all 53 desktop test files (`671` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, documentation check,
  workspace format check and `git diff --check`.

Rename adds no schema/index, second database owner, second mutation barrier or
Renderer action token, write replay, direct response-owned projection update,
Archive/Trash behavior, or Runtime/Provider/Responses/attachment change.

## Archive / Unarchive — Reversible Archived collection

Result: complete.

- Scope contract: `NYX-MTL-ARCHIVE-SCOPE-20260822-01`, committed at `bc79920`
  by the user's explicit bounded lifecycle authorization.
- Product commit: `7e661d0064296dff70298bee2b2cb1c846299b87`.
- The exact 21-file diff from scope-lock head
  `bc799200692bf76aa9b34f7d8de8c9b40734a74a` through product head had SHA-256
  `39e66136c40016d26b18af695d5489b149e842e77669b32d1c05ccf1f297fe54`.
- Worker transactions enforce Available to Archived and Archived to unpinned
  Available, close Pin order atomically, preserve user-activity ordering, and
  reject stale, wrong-source and pending-Turn mutations.
- Main adds one typed location path, reuses the existing mutation barrier and
  never replays an unknown write. One replacement Worker and one validated
  `locationState` read distinguish the exact post-state, exact pre-state and
  every unsafe third state.
- Renderer reuses one collection action token and the existing Draft-save and
  navigation gate. Archived uses canonical paging, remains read-only, exposes
  Rename and Unarchive, and has no Pin controls or Composer.
- Required checks passed on 2026-08-22: both desktop TypeScript checks, lint,
  format check, all 53 desktop test files (`683` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, documentation check,
  workspace format check and `git diff --check`.

Archive/Unarchive adds no schema/index, second database owner, second mutation
barrier or Renderer action token, mutation replay, direct response-owned
projection update, Trash/Restore behavior, custom focus system, or
Runtime/Provider/Responses/attachment change.

## Trash / Restore — Reversible Trash collection

Result: complete.

- Scope contract: `NYX-MTL-TRASH-SCOPE-20260822-01`, committed at `0b9b9ab` by
  the user's explicit bounded lifecycle authorization.
- Product commit: `d29249efcab7e7f0aea595b4a5cbf4366d9accf5`.
- The exact 15-file diff from scope-lock head
  `0b9b9ab105a43d4ef032e24a403fd57194585078` through product head had SHA-256
  `7813cb105d067d6b48556247406c98cde046513eef73e3c551a6dd2f6f2f3e40`.
- Worker transactions save the Available or Archived origin, save and close an
  Available Pin position, restore it at the current bounded Pin edge, preserve
  user-activity ordering and clear Trash metadata atomically on Restore.
- Main extends the existing semantic location action with Trash/Restore,
  rejects active or failed-settlement Trash, keeps Trash Draft/Send/Retry
  read-only and never replays an unknown write.
- Renderer adds one Trash collection mode to the existing bounded reader and
  shared action token. Selected Trash saves an editable Draft first; Restore
  obtains its Available or Archived destination from canonical Main detail.
  Trash rows expose Restore only and have no Rename, Pin or Composer.
- Required checks passed on 2026-08-22: both desktop TypeScript checks, lint,
  format check, all 53 desktop test files (`694` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, documentation check,
  workspace format check and `git diff --check`.

Trash/Restore adds no schema/index, second database owner, second mutation
barrier or Renderer action token, another bridge method, mutation replay,
Permanent delete, Empty Trash, Undo, Search, Stop-and-move, custom focus system,
or Runtime/Provider/Responses/attachment change. The authorized Rename,
Archive/Unarchive and Trash/Restore sequence is complete.

## Lifecycle-R1 — Reversible lifecycle correctness repair

Result: complete.

- Scope contract: `NYX-MTL-LIFECYCLE-R1-SCOPE-20260823-01`. The initial scope
  lock entered HEAD at `b8bfff9d82940bbbebb0ac1a79da1a743e8f5bdb`; reviewed
  inventory corrections entered at
  `ec3bb1824693e40af654b7f2262d758fd401be8a` and
  `5a2ea3c56635aef7e3965e56bf0293920037270b`.
- Product commits: `cb6c5ad7d0b4c6edef8102a8e86ea8b18f07c9c9`,
  `04b91cabdd0a182dba56ffb17239eb4cfbc13b55`,
  `87200213880bdd7505c02a68af8d640e1d9ba2b5` and
  `28731f548f1af5729b5ef031c054b5434a827635`.
- The exact 11-file `apps/desktop` product diff from the initial scope-lock
  head through product head had SHA-256
  `430eb845dbd3ec98506f648450f9345b729de3648914e4dc81a6b3d3a6057e35`.
- Worker discard now deletes only an exact empty Available shell. A delayed
  discard cannot delete a Thread after Archive or Trash commits.
- Archived and Trash remain read-only with or without a selected Thread:
  direct Draft, attachment, Send and Retry actions are rejected; Composer and
  failed-message Retry stay hidden; mode changes cancel inline Rename; and
  Trash never renders stale Rename state.
- Archive, Unarchive, Trash and Restore hold the existing Renderer navigation
  barrier through canonical hydration or failure. Selected and unselected
  moves preserve the intended projection, including a dirty New placeholder
  whose selection is `null`.
- Focused Main and Worker tests cover all non-idle activity boundaries,
  failed settlement and delayed empty-shell movement without adding a schema,
  protocol, bridge method, second mutation barrier or second Renderer token.
- Independent final review
  `NYX-MTL-LIFECYCLE-R1-FINAL-REVIEW-20260823-01` reviewed that exact product
  diff and returned `accept` with no S0-S2 findings.
- Required checks passed on 2026-08-23: both desktop TypeScript checks, lint,
  format check, all 53 desktop test files (`708` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, documentation check,
  workspace format check and `git diff --check`.

Lifecycle-R1 did not reopen or redo CP1, PIN1 or the accepted lifecycle model,
and grants no follow-up product work.

## Lifecycle-R2 — Autosave and location race repair

Result: complete.

- Scope contract: `NYX-MTL-LIFECYCLE-R2-SCOPE-20260823-01`, committed at
  `d38114ec42316d47eafaee44cde38b95c034107b` by the user's explicit repair
  request.
- Product commit: `1e2d216b24dbc0b53585005d17a73504a225d63f`.
- The exact two-file `apps/desktop` diff from scope-lock head through product
  head had SHA-256
  `c3510498be7c5a3d4c30bb47f7a65841564223fe5c8596535b4db15d88e545f5`.
- Autosave now observes the existing navigation state before scheduling and
  again before entering the save queue. Navigation release reschedules an
  unchanged dirty Draft through the ordinary effect path.
- Draft save start updates the existing synchronous state projection before
  its first await. A location action therefore cannot dispatch while Draft
  save or New materialization is already in flight.
- Parameterized Archive/Trash coverage proves the queued-timer ordering,
  replacement hydration, dirty New preservation and post-navigation autosave;
  separate coverage proves an in-flight materialization blocks location
  dispatch and keeps the materialized Thread selected.
- Independent reviews `NYX-MTL-LIFECYCLE-R2-DIFF-REVIEW-20260823-01` and
  `NYX-MTL-LIFECYCLE-R2-PRAGMATIC-REVIEW-20260823-01` both returned `accept`
  with no findings against the exact product diff.
- Required checks passed on 2026-08-23: both desktop TypeScript checks, lint,
  format check, all 53 desktop test files (`711` passed, `14` skipped), desktop
  production build, six runtime-backed chat-state checks, documentation check,
  workspace format check and `git diff --check`.

Lifecycle-R2 reused the existing navigation lock, save status and save queue.
It added no protocol, schema, shared contract, state owner, action token or
general reconciliation machinery, and grants no follow-up product work.

## Actions-UI-R1 — Thread row action presentation

Result: complete.

- Scope contract: `NYX-MTL-ACTIONS-UI-R1-SCOPE-20260823-01`, committed at
  `7cbbb6a898e36140b65eb009950a61a34bdd4511` by the user's explicit repair
  request.
- Product commit: `7d98a888d577238fa77e1ffc8d742bdcea832bac`.
- The exact three-file product diff from the scope-lock head through product
  head had SHA-256
  `baa146f9029862cc610d4d9ac047c9817d871e6c38c2969fd053820f3838a307`.
- Available and Archived rows now keep selection separate from a native
  Popover actions trigger. The selected row always shows the trigger; other
  rows reveal it on hover or keyboard focus. The surface uses ordinary buttons
  with dialog-like semantics and keeps the accepted action sets unchanged.
- Trash rows keep a direct, always-visible Restore control. Move to Trash is
  visually separated as the destructive action, and pinned movement keeps its
  accepted boundary-disabled behavior.
- Component coverage proves sibling controls, exact action sets, direct Trash
  Restore, pending/error behavior and movement boundaries. Existing selection,
  Rename, Pin, pagination and reversible lifecycle coverage remains green.
- Manual inspection in the existing development profile confirmed clean
  default rows, anchored and unclipped Popovers near both list boundaries,
  mouse access, first-action focus on keyboard open, Escape close and trigger
  focus return. The profile had no Trash rows, so direct Restore was verified
  by focused component coverage rather than a populated manual sample.
- Required checks passed on 2026-08-23: all 53 desktop test files (`712` passed,
  `14` skipped), both desktop TypeScript checks, lint, format check, desktop
  production build, documentation check and `git diff --check`.

Actions-UI-R1 added no dependency, Portal, global menu state, custom keyboard
system, shared contract, IPC, schema, runtime or lifecycle change. It does not
reopen CP1, PIN1 or any completed lifecycle slice and grants no follow-up
product work.

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
