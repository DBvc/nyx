# Multi-Thread Library E1R Contract History

This file owns only preserved E1R contract text. It does not own
Multi-Thread Library current status. Follow
[multi-thread-library-task-slices.md](./multi-thread-library-task-slices.md).

The native-fetch gates described below are retired and non-executable. The
text remains available for history and future evidence review only.

## Migrated Source Block: multi-thread-library/status-summary-at-migration

<!-- nyx-contract-start: multi-thread-library/status-summary-at-migration sha256:0b0e232982fb74b26fffef18f466616327709069ae0e3a563a8526842b7589c1 -->

Historical snapshot only. It records the state immediately before the
2026-08-18 retirement decision. Any present-tense or conditional wording below
is preserved history and grants no current execution permission.

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
performance sample. The docs-only E1R amendment completed at `24e6c07`. Its
OS-temp G0 direction gate then reached independently reviewed `VALID_STOP` on
the first pair under `NYX-MTL-E1R-G0-EVIDENCE-20260814-02`. On 2026-08-16
the user approved the complete `NYX-E1R-NF1-DECISION-A-v1` native-fetch
recovery packet after its final full review found no remaining S0-S3 issue.
The original documentation-only NF1 amendment completed at `67bfb8e` after
independent review `NYX-MTL-E1R-NF1-SCOPE-20260816-02`. One uncounted
pre-Start OS-temp seam shakedown then exposed its malformed Responses fixture;
that shakedown is superseded and is not gate evidence. The docs-only T1R
fixture/correlation/pre-hop-owner/ratchet repair completed at `197aaced`
after independent review `NYX-MTL-E1R-NF1-REPAIR-20260817-10`. Its first
post-T1R pre-run then stopped as `INVALID + NOT_EVALUATED` because the
transparent tap inherited paused-parser backpressure; the missing observer
terminal proves no product failure, full `NF1-11`/`COMPAT-11` never started,
and that temp derivation is permanently excluded. Plan v37 was rejected by
`NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R24` F-001, prospective source review
`NYX-MTL-E1R-NF1-REPAIR-20260817-11` never ran, and the prospective `-12`
gate identities retired before execution. The docs-only T1S terminal-observer/
identity ratchet completed at `2de9d415066823a8fa335badb3ba9846ed1eb73a`
after independent review `NYX-MTL-E1R-NF1-REPAIR-20260817-12`. Its first T2
preparation then stopped before sealed Start after focused review
`NYX-E1R-NF1-T2-PUBLIC-EVENT-FOCUSED-01` found an S1 public-event projection
leak; neither `NF1-13` nor `COMPAT-13` received a gate result, and every
pre-Start derivative is excluded. The user authorized only the narrow repair,
which completed at `d1a15356c1990b6fec831d4fc3ff98ab7695051b`, tree
`0e5967782cb36e636ae4f7916ad88993feea0a5a`, and passed independent code review
`NYX-E1R-DONE-IPC-REPAIR-CODE-01`. At migration, the docs-only T1P public-event/
identity ratchet was derived from accepted plan v40, SHA-256
`4d6388d57d725720b5070a6396e2c9858080071c339eaf0d550c036f9f74c7f5`,
convergence receipt `NYX-E1R-NATIVE-FETCH-CONVERGENCE-38-R38-SCOPED-01`, and
strict review `NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R26`. The pre-retirement contract
required prospective source review `NYX-MTL-E1R-NF1-REPAIR-20260817-13` and
entry into HEAD before any new T2 build, shakedown, Start, or counted sample.
It stated that T1P completion would have authorized only the OS-temp
`NYX-MTL-E1R-NF1-COMPAT-14` preflight followed by the
`NYX-MTL-E1R-NF1-14` direction gate. Both gates were later retired before
execution. Neither may run, and this snapshot grants no current execution
permission or product scope.
<!-- nyx-contract-end: multi-thread-library/status-summary-at-migration -->

## Migrated Source Block: multi-thread-library/e1r-contracts

<!-- nyx-contract-start: multi-thread-library/e1r-contracts sha256:fefc44011dd64551cd5fc7b0fa0ebabfc325427641848bbfa890a17b6b400e56 -->

### multi-thread-library/E1R-incremental-performance-amendment

Type: documentation-only corrective scope and direction gate.

Status: complete at `24e6c07` after independent strict review
`NYX-MTL-E1R-S0-FINAL-20260814-03`. It is derived from accepted plan
`E1R-PERF-PLAN-session-v9`, SHA-256
`79627d88706f254fb50b28b1273679afb5a67a92e5cfe33690b4c299aaf46835`,
review `NYX-E1R-PERF-V9-FINAL-01`. The OS-temp G0 below later reached
independently reviewed `VALID_STOP`; G0 remains stopped and every E1/E1R product
slice remains non-executable. The later user-approved native-fetch direction
does not reopen G0; after completed T1R/T1S history and the independently
reviewed T1P amendment below enter HEAD, it authorizes only
`NYX-MTL-E1R-NF1-COMPAT-14` followed by `NYX-MTL-E1R-NF1-14`.

G0 status: independently reviewed `VALID_STOP` under
`NYX-MTL-E1R-G0-EVIDENCE-20260814-02`. Formal attempt 3 stopped after the first
valid pair, so pairs 2/3 did not run. The primary result is 5296390 bytes at
SHA-256
`90c3482aa22c789d22f5a7b9f560d90d10f405f8b05871c63eda6bd5719bac72`;
the summary, evidence manifest and accepted candidate-9 harness SHA-256 values
are respectively
`008a1c28f357012c58450f5a4c4d37252e528d48c40cbbffd9c7e20e77678913`,
`85f15138b9d6adc2b83a66dba9e169f7d68945ddaa251dc46c1f72d966799503`,
and `3d7b17b43c6a4dff05d69ee989bff004d48a62e90bfcaf36527b07d1eccf4ec3`.
The reliable hard failures were:

- both protocols failed all 301/302/307/308 redirects after a complete first
  hop, while baseline completed all eight;
- candidate success outstanding bytes were 5578982 and 4731813, above the
  fixed 1048576-byte limit; and
- abort, early-response and socket-close paths produced bytes after terminal;
  socket-close continued by about 41 MiB.

Early-response proxy prefix/status diagnostics are not independent failure
evidence and do not contribute to this Stop. Fresh-profile, external delivery,
exact success bodies, normal process exit, CONNECT cleanup and the evidence
manifest all passed review. G0 did not achieve reviewed PASS. `E1R-P1`,
`E1R-P2`, a new E1 scope and all E1/E1R product work remain non-executable
unless `NYX-MTL-E1R-NF1-14 reviewed PASS` is recorded and a later exact product
scope lock enters HEAD.

This amendment changes only:

```text
docs/next/multi-thread-library-e1r-contracts.md
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

### multi-thread-library/E1R-native-fetch-recovery-amendment

Type: documentation-only direction amendment and OS-temp gate scope lock.

Status: the complete decision packet below was explicitly approved by the user
on 2026-08-16 after the final full review reported no remaining S0-S3 finding.
The original T1 amendment entered HEAD at `67bfb8e` after review
`NYX-MTL-E1R-NF1-SCOPE-20260816-02`. One uncounted OS-temp seam shakedown
before COMPAT Start proved that amendment's Responses fixture malformed; it
produced no gate result and is now
`NYX-MTL-E1R-NF1-SHAKEDOWN-01-SUPERSEDED`. The first T1R fixture source
candidate was rejected before landing under
`NYX-MTL-E1R-NF1-FIXTURE-20260816-01`; the planned
`NYX-MTL-E1R-NF1-FIXTURE-20260816-02` review never ran because plan v25 failed
full review. A later repair source candidate was rejected under
`NYX-MTL-E1R-NF1-REPAIR-20260817-01`; prospective REPAIR reviews `-02` through
`-05` never ran because plans v28 through v31 failed review. The 5787-line
source candidate at SHA-256
`12fdf2f0ae788a6ded713879fa2ac535bfc5134466e1b3d450d0f924e9629025` was
rejected under `NYX-MTL-E1R-NF1-REPAIR-20260817-06`. Prospective REPAIR `-07`,
`-08`, and `-09` never ran because plans v33, v34, and v35 respectively failed
convergence, full review, and convergence. T1R was derived from
`Nyx Multi-Thread Library E1R Native-Fetch Recovery Plan` v36, SHA-256
`e180e19cd1b507f04d16479b24ece139ccbedd072e8844cd50a2c6407382cdce`, and
plan review `NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R23`. Its exact 5,807-line source
bytes at SHA-256
`5111e74876e1008a898707090334f67341144dfc22373f005abf355b759383a5`
passed independent review `NYX-MTL-E1R-NF1-REPAIR-20260817-10` and entered HEAD
at `197aaced`, completing T1R.

The first post-T1R pre-run used only the baseline role before stopping. Its raw
artifact is 1,173 lines at SHA-256
`6fdaaf94b5f317cef4ad5a29ce3a2fef58bfa9addbdc6f2529455bd9b092ff40`
and is permanently `INVALID + NOT_EVALUATED`: the endpoint consumed and paused
at exactly `65,536` bytes, and the role returned its abort receipt and safe
cancelled result, but the continuously transparent tap inherited paused-parser
backpressure and could not observe a later raw terminal. The missing terminal
proves no native-fetch product failure. Full `NF1-11` and `COMPAT-11` never
started; no source, archive, observer, build, app, profile, trace, result, or
partial baseline case from that temp root may be reused or enter evidence.

Plan v37, 3,864 lines at SHA-256
`0f5af771f706289222c4da7b6e39b1c08ee5f84095d7c57f21b96624182b3f96`,
was rejected by full review `NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R24` F-001 because
draining after role receipt but before product quiescence could change the
measured connection. Prospective source review
`NYX-MTL-E1R-NF1-REPAIR-20260817-11` never ran, and prospective
`NF1-12`/`COMPAT-12` retired unstarted with no source amendment, artifact,
build, Start, raw result, pair, aggregate, or evidence.

The T1S terminal-observer/identity ratchet was derived from
`Nyx Multi-Thread Library E1R Native-Fetch Recovery Plan` v38, SHA-256
`5f28a1f7ea9cf7368c156353e207f610eefea2da529000e05ca7981dd6783b98`,
revision contract `RC-NYX-E1R-NF-R36`, scoped convergence
`NYX-E1R-NATIVE-FETCH-CONVERGENCE-36-R36-SCOPED-01`, and fresh full strict
review `NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R25`. Its exact 6,097-line source bytes
at SHA-256 `ba4ec63d1fe11e01797eebab3f8a6547405912bd33aec59a2bbb0b9e921546e6`
passed independent review `NYX-MTL-E1R-NF1-REPAIR-20260817-12` and entered HEAD
at `2de9d415066823a8fa335badb3ba9846ed1eb73a`, completing T1S.

The first T2 preparation after T1S then stopped before sealed Start. Focused
review `NYX-E1R-NF1-T2-PUBLIC-EVENT-FOCUSED-01` found that Session `chat:done`
spread private `PreparedThreadTurn` fields across public IPC. This is an S1
`STOP before Start`, not INVALID, FAIL, PASS, `VALID_STOP`, or gate evidence.
Neither `NF1-13` nor `COMPAT-13` started, and every source, overlay, build, app,
profile, trace, result draft, or manifest derivative created during that
pre-Start preparation is permanently excluded.

The user explicitly authorized only the narrow public-event repair. Commit
`d1a15356c1990b6fec831d4fc3ff98ab7695051b`, tree
`0e5967782cb36e636ae4f7916ad88993feea0a5a`, passed independent code review
`NYX-E1R-DONE-IPC-REPAIR-CODE-01`. The current docs-only T1P public-event/
identity ratchet is derived from `Nyx Multi-Thread Library E1R Native-Fetch
Recovery Plan` v40, 4,290 lines at SHA-256
`4d6388d57d725720b5070a6396e2c9858080071c339eaf0d550c036f9f74c7f5`,
revision contract `RC-NYX-E1R-NF-R38`, scoped convergence
`NYX-E1R-NATIVE-FETCH-CONVERGENCE-38-R38-SCOPED-01`, and fresh full strict
review `NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R26`. Its exact formatted source bytes
require independent review `NYX-MTL-E1R-NF1-REPAIR-20260817-13` and entry into
HEAD before any new T2 build, shakedown, Start, or counted sample. Afterward,
only the fresh OS-temp preflight and direction gate defined here are executable;
no product slice is authorized.

The approval record is `NYX-E1R-NF1-DECISION-A-v1`. Immediately after receiving
the complete six-item packet and the clean final-review result, the user
instructed that if the plan had no problem execution should begin. The satisfied
condition records approval of all six items as one decision:

1. Option A uses native `fetch`, manual redirects and one immutable spool,
   creating a fresh body producer for every replayable hop.
2. `8,388,608` bytes is the empirical candidate measurement line. It is not
   production backpressure enforcement or a final product guarantee.
3. `faultPrefixBytes` is exactly `65,536`, and every counted request must satisfy
   `65,536 < completeBodyBytes`.
4. The five independent lifecycle lines below are each exactly `5,000 ms`.
5. Candidate acknowledgement quanta are exactly `1,048,576` and `4,194,304`
   bytes. They are evidence schedules and never product flow control.
6. Primary evidence uses the exact `validity + outcome` contract below:
   causal product failure remains `VALID + FAIL`; independent evidence failure
   remains `INVALID + NOT_EVALUATED`; the first valid failure stops; only one
   clean-process retry of a whole repetition is allowed for pre-Start INVALID;
   post-Start INVALID has no same-gate retry.

Approval of this packet does not waive any redirect, credential, ownership,
consumer, settlement, cleanup, compatibility or final E1 performance rule. It
does not approve `E1R-P1`, restore the archived product candidate, or permit a
tracked product edit.

#### Direction and immutable boundaries

The new gate id is `NYX-MTL-E1R-NF1-14`; it is not a rerun or repair of G0 and
is not a continuation of either earlier shakedown or the stopped pre-Start
`-13` preparation. The planned but unstarted
`NYX-MTL-E1R-NF1-02` through `-10` and
`NYX-MTL-E1R-NF1-COMPAT-02` through `-10` identities are retired and have no
sealed artifact, Start, raw result, pair, aggregate or evidence. Full `NF1-11`
and `COMPAT-11` are retired unstarted. Their sole descendant,
`NYX-MTL-E1R-NF1-11-PRE-RUN`, is the frozen post-Start
`INVALID + NOT_EVALUATED` artifact above; none of its temp source, archive,
observer, build, app, profile, trace, result, or partial baseline case may enter
`-14`. Prospective `NF1-12`/`COMPAT-12` retired unstarted with rejected v37 and
likewise have no source amendment, artifact, build, Start, raw result, pair,
aggregate or evidence. T1S then named `NF1-13`/`COMPAT-13`, but the candidate-
only pre-run stopped before either identity received a sealed Start. They are
retired unstarted and have no raw result, pair, aggregate, or gate evidence.
Every source, overlay, build, app, profile, trace, result draft, or manifest
derivative created while investigating that pre-Start issue is excluded from
`-14`; the focused S1 review and accepted repair review are history, not gate
evidence. The new candidate-only prerequisite is
`NYX-MTL-E1R-NF1-COMPAT-14`, with its own process, profile, manifest and result
and no B/C membership. No source/archive/build, fixture, manifest, trace, result
or evidence byte from `NYX-MTL-E1R-NF1-SHAKEDOWN-01-SUPERSEDED` may enter
either `-14` identity, a raw result, pair or aggregate. Only after the exact
reviewed T1P bytes enter HEAD may T2 create fresh source/archive/build
identities. Old G0 remains immutable independently reviewed `VALID_STOP`
evidence and neither its raw evidence nor its stopped pairs are rerun.

NF1 answers one question: can the smallest native-fetch/manual-redirect
candidate preserve exact current behavior and stay within the approved empirical
line? It does not select a product inventory. The accepted Main `<16.667 ms`
and whole-process RSS delta `<=192 MiB` final E1 targets remain unchanged. NF1
also preserves the existing paired direction-gate limits: for each accepted
latency interval, candidate median increase over matching baseline is at most
`max(5 ms, 10%)`, each individual increase is at most
`max(15 ms, 25%)`, and candidate Main-max median and RSS-delta median may not
exceed their matching baseline medians.

The prior amendment's Main-authorized source, mode-`0700` Run directory,
exclusive mode-`0600` unlinked immutable spool, regular-file/size/hash/stable-
`fstat` checks, `64 KiB` source chunks, exact EOF, abort checks, exact-once
Session lease cleanup and prohibition on JS-owned full image/Base64/request
body remain in force. A redirect only opens a fresh read handle over that one
immutable spool; it never rereads the original source or reuses a consumed
stream.

NF1 may use only a fresh OS-temp directory, temporary profiles, a read-only
exact-HEAD source mirror, manifest-listed temp overlay files, and the existing
deterministic provider/proxy workload. It must not touch a tracked product file,
real user root, real credential, old G0 evidence, cap 4/8, Renderer, shared/IPC
contracts, OCaml, or full E1 UI/concurrency/shutdown. It must not introduce a
general redirect/transport abstraction.

#### Preparation, Run owner and terminal linearization

The existing `activeSession` plus its `AbortSignal` owns preparation. The
candidate must not invent a pending assistant identity:

```text
activeSessionInstalled
  -> prepareTurnPending
  -> optional preparationCancelLatched(existing signal only)

prepareTurnFulfilled(PreparedThreadTurn exactIdentity)
  -> preparedIdentityRecorded
  -> RunControlInstalled(copy sticky abort)
  -> PreHopOwner(accepted_event)
  -> unchanged accepted event
  -> TerminalOwner(none, cancelled) if already aborted
     or PreHopOwner(resolve_target) -> resolveTarget

prepareTurnRejected
  -> no RunControl
  -> no settlement or Runtime terminal
  -> unchanged safe error
```

The successful prepare reaction above has no `await` or yield. `RunControl`
exists only after exact `PreparedThreadTurn`; before that point cancel touches
only the existing Session signal. After installation, its monotonic
`runAbortRequested` latch and exactly one tagged current owner span the whole
Run. `currentOwner === null` before the intended public terminal or existing
safe notice returns, the conditional spool close finishes, and the owner is
released is `VALID + FAIL`:

```text
PreHopOwner(stage, generation, containerLineageId?) |
HopOwner | FinalResponseOwner |
AlreadyAbortedFulfillmentCleanupOwner |
TerminalOwner(required | none)
```

The candidate-only pre-hop state is exactly:

```text
PreHopOwner {
  stage: accepted_event | resolve_target | bind_target |
    materialize_spool_sources | materialize_provider_history |
    runtime_factory | runtime_replay_container |
    runtime_replay_command(commandIndex) | runtime_submit_or_retry |
    runtime_start_assistant | post_runtime_checkpoint | start_event,
  abortCheckpoint: observe_after_stage | carry_to_exact_next_stage,
  phase: before_invoke | pending | reaction,
  outcome: pending | fulfilled | rejected,
  stageResources: exact manifest-bound handles created by this stage,
  generation: integer,
  containerLineageId: string | null
}
```

The exact pre-hop order is:

```text
accepted_event -> resolve_target -> bind_target ->
materialize_spool_sources -> materialize_provider_history ->
runtime_factory -> runtime_replay_container {
  runtime_replay_command(commandIndex)*
} -> runtime_submit_or_retry -> runtime_start_assistant ->
post_runtime_checkpoint -> start_event -> first HopOwner
```

Runtime-disabled mode skips the Runtime stages and reaches the existing post-
materialization abort checkpoint. A `PreHopOwner` is installed before each
synchronous action or Promise invocation and records its phase, exact outcome,
created/adopted resources, strictly increasing generation and optional stable
`containerLineageId`. An ordinary Promise keeps the same owner/generation while
pending or internally settled until its product reaction runs. A Run abort only
sets the sticky latch and records the current-owner abort fact; it does not
retire that owner, start a later stage or freeze a terminal ahead of the
reaction. The reaction first records the exact outcome and adopts every side
effect/handle, then performs one no-`await` next-owner handoff. A stale ordinary
generation may record evidence only and must make zero ownership, terminal or
later-call mutation.

Runtime replay has separate nested rules. `runtimeReplayContainerInvoked`
allocates one immutable `containerLineageId` for the unchanged coordinator
Promise. Before every real Runtime command, the temporary Runtime proxy replaces
the latest container generation with one indexed child owner in that lineage.
Child fulfillment, rejection or synchronous throw keeps the child generation
through its reaction, records the exact command outcome, restores a fresh
container generation in the same lineage and returns or rethrows unchanged. A
child never inspects abort to choose a terminal and never installs
`TerminalOwner`, current submit/retry, `startAssistant` or Provider work. Only
the outer replay reaction, under the latest container generation in the same
lineage, may continue to current-turn Runtime calls or map an outer rejection to
the sole `TerminalOwner`. Wrong lineage, non-latest outer generation or stale
child generation is `VALID + FAIL` and mutates nothing. The unique rejection
chain is:

```text
child reject/throw -> latest same-lineage container restored ->
outer replay reject -> sole TerminalOwner
```

No current submit/retry, `startAssistant` or Provider call follows that outer
rejection, and this overlay invents no Runtime cancellation.

The exact HEAD abort checkpoints remain after target resolution, target
binding, Runtime-disabled provider-history materialization, and the complete
Runtime replay/current-turn start block. At other fulfilled stages the sticky
latch is carried into the exact next owner before its real call. The only call-
order exception is the approved candidate spool-source preparation before
Provider-history materialization. It checks abort every `65,536` source bytes
and registers every full or partial lease before a yield/rejection; only a
genuinely pending copy may stop early. If that Promise already fulfilled, its
full lease is adopted or absence recorded and Provider-history materialization
still runs. With Runtime enabled, fulfilled Provider-history materialization
under a sticky abort still runs the synchronous Runtime factory, full replay,
current submit/retry and `startAssistant` before the post-Runtime cancelled
checkpoint. Runtime-disabled mode cancels at its existing checkpoint. No
resolver, binder, materializer, Worker, sidecar or Runtime cancellation is
invented. A synchronous Runtime factory or accepted/start publication throw
uses the exact existing abort/error catch precedence.

`PreHopOwner(start_event)` rechecks the latch. If set, it installs
`TerminalOwner(none, cancelled)` and emits no start. Otherwise it emits the
unchanged synchronous start event and installs the first `HopOwner` in the same
turn before producer creation or native `fetch`. Fetch fulfillment keeps the old
owner until one no-yield block checks generation and prior abort state, then
installs the next owner. A late fulfillment after an already-issued pending-
fetch abort installs `AlreadyAbortedFulfillmentCleanupOwner`, performs cleanup
without a second abort/cancel/reader or ordinary classification, records
`VALID + FAIL`, then hands off to `TerminalOwner(none, cancelled)`.

An un-aborted final fulfillment installs `FinalResponseOwner` before response
body action or yield. A Run abort while it waits records `finalAbortPending`
without touching the fulfilled response. After product-only
`localHopSettled`, one no-yield block classifies the unchanged consumer boundary,
installs `TerminalOwner(required|none)`, rechecks the Run latch and, only for
required mode, issues the sole `CONSUMER_RUN_ABORT` before the first read or
against the active real consumer. None mode performs zero response read,
reader, cancel, source or invented consumer action.

Every ordinary pre-hop or outer replay-container rejection/cancellation and
every no-response terminal installs `TerminalOwner(none)` before any terminal
mapper or await. `runtime_replay_command` is explicitly excluded: it only
restores its container and propagates unchanged. Both terminal modes remain
installed across the real consumer when required, mapper awaits, settlement,
canonical reread, rollback/failure-record decision, Runtime projection or
containment, and the synchronous `publish()` call and return. Public publication
has no synthetic async hook.

After mapper preparation, one no-`await` block performs the final Run-latch
recheck, records `publicTerminalFrozen(exactInput)`, and invokes
`settleTurn(exactInput)` exactly once. Invocation freezes selection but is not
durable proof. A post-freeze abort may set the latch but cannot alter the input,
transport, consumer, settlement count, rollback, retained record, Retry
availability, Runtime/public result or later command.

The original Run has exactly three coordinator-final dispositions:

```text
direct accepted reply or complete exact canonical match
  -> durableTerminalCommitted
  -> matching Runtime terminal projection settled/contained/absent
  -> intended public terminal
  -> adopted full/partial spool lease close fulfilled exactly once
     or explicit absence with zero close calls
  -> owner release

non-durable and exact failure record retained
  -> no Runtime or intended terminal
  -> unchanged safe settlement-failure notice
  -> adopted full/partial spool lease close fulfilled exactly once
     or explicit absence with zero close calls
  -> owner release
  -> later Retry(threadId, requestId)
  -> retained lookup recovers exact input/ref
  -> Worker settlement only; no Provider/Runtime rerun
  -> same three-way disposition

complete exact comparison finds a different non-pending terminal
  -> final not_pending
  -> required sidecar rollback fulfilled or absent
  -> failure record cleared
  -> no Runtime or intended terminal
  -> unchanged safe settlement-failure notice
  -> adopted full/partial spool lease close fulfilled exactly once
     or explicit absence with zero close calls
  -> owner release
  -> later Retry(threadId, requestId)
  -> missing lookup rejected before Worker
  -> zero Provider/Runtime/intended-terminal calls
```

A rejected required rollback leaves the exact record retained. Neither an
outcome enum nor rollback alone decides retention. Every original Run returns
its intended public terminal or existing safe notice before the sole outer
lease close. `TerminalOwner` remains installed through that close and releases
only after exact fulfillment or explicit absence. A close rejection is
`VALID + FAIL`: it retains the owner, cannot PASS and permits no later Retry
command. The original no-retained Run contains no Retry request or rejection.
Only after the old owner releases may a separate Retry command run. It carries
only `threadId`/`requestId`; exact input/ref exists only after retained lookup.
A missing lookup rejects before Worker with zero Worker/Provider/Runtime/
intended-terminal calls. A retained lookup reaches Worker settlement, reruns no
Provider/Runtime work and re-enters the same three dispositions under the new
command, never the old owner. The safe notice, its `retryable` field, UI behavior
and ordinary Provider Retry remain unchanged. Complete exact canonical equality
covers request id, terminal status, content, safe error, settled time and the
complete provider-state-ref identity when present; raw `not_pending` is never
durable proof.

#### Manual redirect and per-hop request contract

The feature-local loop owns one evolving state:

```text
RedirectState {
  currentUrl,
  method,
  bodyMode: replayable | none,
  sanitizedHeaders,
  redirectCount
}
```

Each hop resolves an HTTP(S) URL, installs its `HopOwner`, creates one hop
`AbortController`, and calls native `fetch` with `redirect: 'manual'`. Run abort
is routed through the owner; the outer Session signal is not passed directly to
the hop. Each replayable hop receives a new stream over the immutable spool and
exact `Content-Length` with `duplex: 'half'`. A none hop omits body, `duplex`,
`Content-Length` and all Fetch request-body headers and records
`producerAbsent` before fetch.

| `bodyMode`   | Required                                                                                                                           | Forbidden                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `replayable` | retained method, fresh body, exact `Content-Length`, `duplex: 'half'`, `redirect: 'manual'`, hop signal, current sanitized headers | reused stream, automatic redirect, direct Run signal              |
| `none`       | rewritten GET/HEAD, `redirect: 'manual'`, hop signal, current sanitized non-body headers                                           | body, `duplex`, `Content-Length`, every Fetch request-body header |

Redirect behavior must match an exact-build automatic-follow baseline oracle:

- resolve `Location` relative to the current response URL and inherit the
  current fragment when `Location` omits one;
- missing `Location` returns that response as final; invalid or non-HTTP(S)
  location maps to the exact existing safe failure;
- same-origin and cross-origin credentialed targets are separate controls. The
  candidate never synthesizes Basic/`Authorization`, exposes URL credentials,
  or applies one blanket result. If safe baseline parity cannot be represented,
  the case is `VALID + FAIL`;
- 301/302 after POST and 303 after any non-GET/HEAD rewrite to GET, set
  `bodyMode: none`, and permanently remove explicit `Content-Length` plus
  `Content-Encoding`, `Content-Language`, `Content-Location` and
  `Content-Type`;
- 307/308 retain method/body mode and create a fresh producer;
- origin is scheme, host and effective port. The first cross-origin transition
  permanently removes `Authorization`, including a later return to the original
  origin;
- at most 20 redirects are followed. A redirect after hop 20 maps to the exact
  baseline safe failure without hop 21;
- small controls cover relative/fragment-only, missing/invalid/non-HTTP(S),
  same-/cross-origin credentialed, 301/302/303/307/308, body-header stripping,
  20-hop success/next-hop failure and A-B-B/A-B-A transitions through direct
  and existing proxy routes.

An un-aborted redirect disposes its response exactly once:

- none or completed upload: exact `body === null`, or sole awaited
  `response.body.cancel(REDIRECT_DISCARD)`;
- incomplete replayable upload: acquire one default reader without reading,
  latch the request-source terminal, issue the sole hop abort, require
  `reader.closed` rejection with exact `HOP_ABORT_STOP`, and release the lock in
  `finally`. It must not also call response cancel.

There is no unbounded drain, abort-then-cancel, second reader or quiet-time
settlement. Redirect replay may begin only after product-only
`localHopSettled`; receiver acknowledgement never controls replay.

#### Producer terminal, twelve base rows and final overlay

Only an incomplete replayable source uses the first-winner arbiter.
`ownerTerminalObserved(reason)` or underlying-source
`requestBodyCancelObserved(reason)` writes exactly one immutable
`cancellationLatched(firstCause)` in the same no-yield turn. A later input is
audit-only. The producer checks the latch and hop signal before and after each
read and before enqueue. An in-flight read may finish only to discard bytes and
close its handle.

`producerStopped` means no later read/enqueue is possible, the winner is
immutable and all hop read handles are closed. Complete order is exactly:

```text
lastEnqueue < requestBodyCloseIssued < upload_complete < producerStopped
```

Incomplete paths emit no close or upload-complete. `producerAbsent` is
exclusive to none mode and forbids every producer/controller/source event.
`requestBodyCloseIssued`, `requestBodyReadableToErrored`,
`requestBodyCancelObserved`, `hopAbortIssued` and actual fetch fulfillment or
rejection are exact once-only observations; controller close/error and abort
must return `undefined`. `hopAbortIssued(reason)` is recorded only after
`signal.aborted === true` and `signal.reason === reason`; an exact pending-fetch
abort rejection means `error === HOP_ABORT_STOP`. Private reasons
`HOP_ABORT_STOP`, `EARLY_FINAL_UPLOAD_STOP`, `CONSUMER_RUN_ABORT` and
`REDIRECT_DISCARD` are distinct and never cross IPC or logs.

For an incomplete final response, exact packaged preflight binds one branch:

- owner-error wins only from a proven readable state with no earlier cancel.
  It latches first, calls controller error exactly once, observes exact
  `desiredSizeAfter === null` and records the readable-to-errored transition;
- native cancel wins when callback entry latches first with the exact-build safe
  reason. The later owner event cannot relatch or call controller error.

Neither branch may close the source, abort/cancel the fulfilled response, add a
reader or invalidate its current normalized consumer. Failure to bind one
stable branch stops the direction.

`localHopSettled` combines one mode fact—`producerStopped` or
`producerAbsent`—with exactly one of these base rows, using only direct native
Promise handlers and synchronous candidate state:

| Body mode/result                              | Required candidate-local order/facts                                                                                                                                                                                                                                                                                                                                    | Native outcome                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| replayable complete redirect                  | complete order; `fetchFulfilled(redirect) < ownerTerminalObserved < cancellationLatched(owner_redirect)`; no source error or hop abort                                                                                                                                                                                                                                  | non-null body has one fulfilled `cancel(REDIRECT_DISCARD)`; otherwise exact null body              |
| replayable incomplete redirect                | preflight binds owner-first (`fetchFulfilled < ownerTerminalObserved < latch`) or native-cancel-first (`requestBodyCancelObserved < latch`, later owner is audit-only); non-reading reader acquisition precedes sole abort; `hopAbortIssued` and `producerStopped` follow the latch without a false callback-return ordering; no close/error-transition/upload-complete | reader `closed` rejects with exact `HOP_ABORT_STOP`, then lock releases; response cancel forbidden |
| replayable complete final                     | complete order; `fetchFulfilled(final) < FinalResponseOwnerInstalled`; no terminal/source-error/hop-abort event                                                                                                                                                                                                                                                         | response stays unread until terminal overlay                                                       |
| replayable incomplete final                   | fulfillment installs final owner; preflight binds owner-error (`ownerTerminalObserved < latch(owner_error) < readable-to-errored < producerStopped`) or native-cancel-first (`requestBodyCancelObserved < latch(native_cancel)`, later owner audit-only, then producer stopped); no close/upload-complete/hop-abort                                                     | same fulfilled response stays unread until terminal overlay; response cancel forbidden             |
| replayable incomplete pending-fetch Run abort | owner-first `ownerTerminalObserved(run_abort) < latch(owner_abort)`; sole abort begins after latch; callback is second cause; abort-issued, producer-stopped and fetch rejection all exist without false callback-return ordering; no close/error-transition/upload-complete                                                                                            | fetch rejects exactly once with `HOP_ABORT_STOP`                                                   |
| replayable incomplete spontaneous fetch error | native rejection is handled by owner; preflight binds owner-first or native-cancel-first; sole latch precedes later owner abort; abort-issued and producer-stopped exist without false callback-return ordering; no close/error-transition/upload-complete                                                                                                              | rejection has exact baseline-safe classification                                                   |
| replayable complete pending-fetch Run abort   | complete order; `ownerTerminalObserved < latch(owner_abort) < hopAbortIssued < fetchRejected`; no source terminal event                                                                                                                                                                                                                                                 | fetch rejects exactly once with `HOP_ABORT_STOP`                                                   |
| replayable complete spontaneous fetch error   | complete order; `fetchRejected < ownerTerminalObserved < latch(owner_error) < hopAbortIssued`; no source terminal event                                                                                                                                                                                                                                                 | rejection has exact baseline-safe classification                                                   |
| none redirect                                 | `producerAbsent < fetchFulfilled(redirect) < ownerTerminalObserved < latch(owner_redirect)`; no producer/controller event                                                                                                                                                                                                                                               | non-null body has one fulfilled `cancel(REDIRECT_DISCARD)`; otherwise exact null body              |
| none final                                    | `producerAbsent < fetchFulfilled(final) < FinalResponseOwnerInstalled`; no terminal/producer/hop-abort event                                                                                                                                                                                                                                                            | response stays unread until terminal overlay                                                       |
| none pending-fetch Run abort                  | `producerAbsent < ownerTerminalObserved < latch(owner_abort) < hopAbortIssued < fetchRejected`                                                                                                                                                                                                                                                                          | fetch rejects exactly once with `HOP_ABORT_STOP`                                                   |
| none spontaneous fetch error                  | `producerAbsent`; `fetchRejected < ownerTerminalObserved < latch(owner_error) < hopAbortIssued`                                                                                                                                                                                                                                                                         | rejection has exact baseline-safe classification                                                   |

Final response handling is a separate terminal-owner overlay and adds no native
fetch or local-settlement fact:

| Terminal source                               | Atomic owner handoff                                                                        | Mode/provisional result                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| successful final with body                    | final owner to terminal owner after local settlement and synchronous body check             | required/pending real SSE consumer                                                     |
| non-attachment non-2xx                        | final owner to terminal owner after local settlement and status/attachment check            | required/pending real JSON consumer                                                    |
| attachment-bearing non-2xx                    | final owner to terminal owner after local settlement and status/attachment check            | none/400, 413 or 415 maps `content_rejected`; other statuses keep current safe failure |
| successful final without body                 | final owner to terminal owner after local settlement and body check                         | none/current safe no-body failure                                                      |
| pending-fetch Run-abort rejection             | hop owner to terminal owner after rejection row and local settlement                        | none/cancelled                                                                         |
| spontaneous fetch rejection                   | hop owner to terminal owner after rejection row and local settlement                        | none/current safe failure                                                              |
| terminal redirect policy/classification error | hop owner to terminal owner after exact response disposition and local settlement           | none/baseline-safe failure                                                             |
| ordinary pre-hop or outer replay rejection    | named pre-hop owner to terminal owner after exact outcome/effects; replay child is excluded | none/baseline-safe failure                                                             |
| pre-hop or pre-fetch Run abort                | named pre-hop owner to terminal owner only at the frozen checkpoint; no later action/hop    | none/cancelled                                                                         |
| redirect-handoff Run abort                    | old hop owner to terminal owner after old local settlement in the same handoff block        | none/cancelled; no next hop                                                            |
| late fulfilled already-aborted response       | cleanup owner to terminal owner after exact cleanup                                         | none/cancelled while the pending-fetch row remains `VALID + FAIL`                      |

A pre-freeze Run abort selects cancelled. None mode invents no transport or
consumer action and emits no consumer events. Required mode uses the sole
consumer abort and requires the unchanged real Promise to settle before freeze.
Attachment/no-body rows perform zero body read, reader or cancel and never use
deadline 3.

#### Real consumer and exact fixture boundaries

The candidate may install an adapter seam around the exact unchanged current
Chat and Responses consumers. It may not copy, edit or reimplement either
consumer, coordinator, Worker, Runtime state machine or shared type. If that
exact-HEAD seam cannot be installed in the temp overlay, T2 stops before
COMPAT Start and produces no COMPAT `validity + outcome`.

The early-final bodies are canonical UTF-8 strings with LF separators and the
final two LF bytes included:

- Chat Completions escaped bytes:
  `data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`;
  length `143`; SHA-256
  `36c10cc77a3b79a5bf98e5d797dc39cfd52f437c12231a07aa373c636597d99d`.
- Responses escaped bytes:
  `data: {"type":"response.output_text.delta","delta":"Hello"}\n\ndata: {"type":"response.completed","response":{"status":"completed","reasoning":{"context":null},"output":[{"type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Hello","annotations":[]}]}]}}\n\ndata: [DONE]\n\n`;
  length `312`; SHA-256
  `910035adf9450f9f245c2cb1384ff49a9349022d57c1d100704ea084e177b9ce`.

Both normalize to visible text `Hello` and completed terminal. Chat's current
consumer obligation ends at its first finish return; endpoint evidence may
record the later `[DONE]`, but the gate must not claim Chat consumed it.
Responses must observe one matching completed response, accept only `[DONE]`
after terminal, reach endpoint EOF, match streamed and completed content, and
return its bounded provider state. Endpoint send completion never substitutes
for either normalized return.

Candidate-only error controls bind:

- non-attachment status `429`, exact body
  `{"error":{"message":"sealed-rate-limit"}}`, length `41`, SHA-256
  `5b3f0947f1848b7cb162aace0a15695cfb466402a4dd2f9a31b4d8fcf9518fe0`.
  The real `response.json()` is paused after an incomplete fragment, then Run
  abort must settle that Promise and freeze public cancelled without a second
  reader/cancel;
- attachment-bearing status `413`, exact body
  `sealed-content-rejected-body`, length `28`, SHA-256
  `e6d72579267a720074b6451613fa50a781451f4ab1948a1c06e1d7f3099e8f2c`.
  The unchanged `content_rejected` mapping must read zero bytes, use no
  reader/cancel or deadline 3, and still clean up response/socket/process.

Exact source tracing binds other attachment non-2xx and successful no-body
responses to none mode without adding fixtures. Required-mode controls cover
completed/incomplete/no-body final hooks before consumer install, active Chat
after one text delta, active Responses after one output-text delta, delayed JSON,
and the post-consumer/pre-freeze hook. They require exact normalized abort
outcomes, no later delta/finish/completed/continuation/public success and no
harness reader or parser repair.

#### Observer, deadlines and capacity evidence

Each role has one OS-temp `ReceiverObserver` process owning the existing proxy,
all origin listeners and one global monotonic `receiverSeq`. Its HTTP/1.1
plaintext tap has exactly two one-way phases. In `parser_forwarding`, each raw
plaintext segment is at most `65,536` bytes and reaches the sealed incremental
shadow framer first and the real Node parser second with ordinary parser
backpressure. It records connection id, plaintext offset, request-line start,
header end and remaining `Content-Length`. Observer-owned retained JS state,
including partial framing, counters and hash state, is at most `131,072` bytes;
it never retains a complete body. Pre-Start controls prove plain/TLS,
direct/proxy, no-body and same-callback connection reuse. CONNECT, TLS
handshake, encrypted bytes, Node request/data callback time and cross-process
clocks are not request-byte proof.

The optional second phase is `terminal_drain`. It is observer-only and may begin
only after the exact route prerequisites and one black-box
`roleProductSettled(caseId, productSnapshotHash)` event. That barrier may be
emitted only after the normalized result and every applicable public result are
immutable; all source pull/read/enqueue, native request/fetch, redirect,
response-consumer, owner, role-local client request-connection disposition,
resource-lifetime and spool-close product actions are complete or explicitly
absent; and paired latency, application Main/RSS, produced-final and capacity-
peak snapshots are frozen. Paired roles record explicit absence for Session,
public and spool fields outside paired scope; candidate-only COMPAT proves the
real exact-HEAD Run/public/lease facts. Terminal packet/acknowledgement
reconciliation, residual, recorder finalization, `liveHopIds` removal and
ReceiverObserver endpoint/proxy cleanup are later evidence-only work and do not
delay the barrier.

No product promise, branch, owner, producer, fetch, consumer, redirect, public
mapper, connection disposition, resource/spool lifetime, local timeout or
paired performance/capacity peak may read, await or change because of the
barrier, drain activation, drain bytes, terminal packet, acknowledgement or
recorder finalization. The role emits the barrier without awaiting observer
receipt. After it, only bounded recorder/finalization state may change; any
product event or changed frozen snapshot is `VALID + FAIL`. A role that needs
drain, parser EOF/destroy, observer acknowledgement or any observer wait to
reach the barrier has an existing product timeout/deadlock/non-exit
`VALID + FAIL`; deadline 4 cannot rescue it. Receipt, response commit/finish,
fetch fulfillment, ordinary public return or quiet time alone cannot substitute
for the barrier, and it adds no sixth deadline.

The workload manifest assigns each expected hop exactly one
`(logicalRequestId, hopId, destinationOrigin, opaquePathToken,
orderedOccurrence)` entry. `orderedOccurrence` is the one-based count in
global `receiverSeq` request-line-completion order for that exact destination
and token; it never resets on connection reuse. Each token maps to one logical
request. Ordinary redirects use a new token when the HTTP request-target changes; fragment-only `Location` preserves
the current token because no fragment is transmitted and advances only the
occurrence. Baseline, C1 and C4 use identical route bytes and occurrence tables.

After request-line completion, the shadow framer extracts the token, increments
its destination-local occurrence and binds the earlier start to the one exact
manifest hop. The real parser independently checks the same tuple. Missing,
extra, duplicate, out-of-order or multiply matched tuples are not repaired by
parser time or controller state; no candidate-only correlation header is added.
The candidate-only `NYX-MTL-E1R-NF1-COMPAT-14` preflight runs the plain/TLS by
direct/proxy same-request-target matrix. Two consecutive identical opaque
request-targets must bind occurrences `1` and `2` to different expected hop
ids, and the shadow framer and real parser must agree. Its events, result,
timing, capacity values and verdict cannot enter a B/C pair, result or aggregate.
The shared paired topology controls use only their actual request tuples.

`receiverRequestStart` is the first request-line octet at the destination
plaintext tap. `receiverRequestTerminal` is the complete positive-length body's
last octet, the final header octet for zero/no body, or the first irreversible
socket terminal for an incomplete request. For a followed redirect, the only
required order is:

```text
receiverRequestTerminal(old).receiverSeq <
receiverRequestStart(next).receiverSeq
```

It proves selected-tap processing order only, not NIC/kernel/send causality.
Parser completion, acknowledgements, quiet intervals or incomparable clocks
cannot substitute. In the fragment-only case, the exact request-target token
must remain unchanged while the next one-based occurrence binds the next
expected hop. A changed target or tuple mismatch is `VALID + FAIL` under
healthy evidence; independent observer inability is INVALID.

`receiverFaultPrefixPaused` is recorded on the ReceiverObserver clock only
after the endpoint application consumed exactly `65,536` request-body bytes,
the shadow framer proved the request incomplete, and the business
`IncomingMessage` was paused. It precedes an external-abort controller command
and is the deadline-4 start only when a real raw terminal arrives naturally
before drain activation; otherwise the later activation starts that line. A role
receipt or other cross-process timestamp cannot replace either observer-clock
start.

`terminalDrainActivated(trigger)` is permitted exactly once only for
`external_abort`, `incomplete_early_final`, or
`incomplete_early_redirect`, and only while no real
`receiverRequestTerminal` has already been recorded. External abort requires
`receiverFaultPrefixPaused -> controller command -> role receipt ->
roleProductSettled -> terminalDrainActivated`. An early final or redirect
requires the exact prefix, endpoint actuation, complete response body/hash and
real response writable `finish`, then `roleProductSettled`, then activation.
Socket-close never drains and accepts only real raw FIN/RST. A natural raw
terminal before the barrier forbids later activation. No post-settlement drain
may be backdated or reordered to make an old-hop terminal precede an already-
recorded next-hop start.

Activation atomically freezes plaintext/raw/parser-forwarded/endpoint-consumed
offsets and incremental hash state, changes the connection one way from
`parser_forwarding` to `terminal_drain`, keeps endpoint consumption and the
business `IncomingMessage` paused at exactly `65,536`, and resumes only the
lower plaintext source. Each later `raw.read()` result is at most `65,536`
bytes and reaches only the same shadow framer plus bounded counter/hash state;
zero later bytes reach the Node parser. A complete-body final octet records the
terminal and packet without synthesizing parser EOF, ending/destroying the
socket, or ending/destroying the response writable. A real FIN/RST first records
the terminal and packet in the same lower-source turn, then naturally propagates
that same real terminal exactly once. Receipt, response commit/finish, barrier,
quiet time, deadline expiry, process exit and tagged cleanup destroy are never
terminal substitutes.

The five independent `5,000 ms` lines are:

1. fault actuation or Run-command receipt to the first
   `cancellationLatched`;
2. candidate response disposition/terminal selection to
   `localHopSettled`;
3. `consumerAbortAccepted` to
   `publicTerminalFrozen(cancelled)`, with
   `consumerAbortIssued` strictly after the start and the real consumer Promise
   settled before the end; none mode has no deadline 3;
4. on a no-drain branch, observer-local endpoint actuation, completed-request
   marker, or exact external-abort `receiverFaultPrefixPaused` to
   `receiverRequestTerminal`; on an eligible still-terminal-missing drain branch,
   exact `terminalDrainActivated` to `receiverRequestTerminal`, after the route
   prerequisites and barrier above;
5. `terminalPacketEmitted(packetId)` to
   `terminalFinalizationEvidenceReceived(packetId)` on the same
   ReceiverObserver/evidence clock.

Line 5 includes candidate receipt, count/hash reconciliation,
`recorderFinalized`, `liveHopIds` removal and one fixed-size finalization proof
in that order. Candidate control, replay, public return and resource lifetime
must not await that evidence. Lines 4/5 have distinct starts; no deadline starts
on packet receipt, and no line restarts, satisfies or extends another. A later
barrier/drain cannot restart or extend lines 1-3. A healthy drain that observes
no raw terminal by exactly `5,000 ms` freezes `VALID + FAIL`; drain has no
active timeout action. An independent tap/framer/channel failure freezes
`INVALID + NOT_EVALUATED` and stops this gate without same-gate retry.

`receiverRequestTerminal` is only the exact positive-length body-final octet,
the final header octet for zero/no body, or the first irreversible raw socket
terminal after which an incomplete request can receive no later plaintext. In
the same ReceiverObserver turn it emits exactly one non-coalescible immutable
`terminalPacketEmitted(packetId)` bound to request/hop identity, terminal
`receiverSeq`, cumulative bytes, counts and hash. The candidate handler records
`terminalPacketReceived(packetId)` first, reconciles counts/residual, freezes the
record, records `recorderFinalized(packetId)`, removes that hop from
`liveHopIds`, and issues one fixed-size
`terminalFinalizationEvidenceIssued(packetId)` without awaiting its return. The
observer's matching `terminalFinalizationEvidenceReceived(packetId)` ends line
5 and seals only evidence. Duplicate, malformed, wrong-hop/wrong-hash packets,
later receiver bytes or candidate-caused channel closure are `VALID + FAIL`
under a healthy observer; an independent channel fault follows the INVALID
classifier.

The shared incomplete-fault protocol reads exactly `65,536` request-body bytes,
reports ready, pauses endpoint consumption and actuates exactly one early
response, socket close or black-box role abort. Early response uses the exact
non-empty protocol fixture, completes its real response writable, and never
resumes request consumption. Socket close closes that socket and remains the
no-drain real-terminal branch. Abort validity requires controller command, role
receipt and prefix-ready/paused proof; early response/socket close require
endpoint actuation acknowledgement. Upload completion after the incomplete
fault is forbidden.

Active evidence cleanup may destroy a socket only after
`roleProductSettled`, the immutable line-4 verdict, and every applicable
immutable line-5 verdict. It is separately tagged and cannot create
`receiverRequestTerminal`, satisfy a deadline, synthesize parser EOF, alter
normal connection cleanup evidence, or turn a failed product/observer result
into PASS.

Capacity is computed only by one candidate-local recorder and sequence:

```text
hopOutstanding = producedHop - ackSeenHop
logicalOutstanding =
  sum(max(0, producedHop - ackSeenHop)) over liveHopIds
```

Produced bytes are counted synchronously after every successful enqueue and
include all fragments and Base64 bytes. `ackSeenHop` advances only when the
candidate receives a cumulative endpoint watermark, so delayed telemetry can
only preserve or inflate outstanding. The producer, redirect loop, owner,
consumer, public result, local timeout and spool lifetime have no read/await/
branch edge to acknowledgement or finalization evidence.

On an eligible drain branch, endpoint-accepted bytes include drain-only
plaintext while `endpointConsumedBytes` remains exactly `65,536`. The barrier
freezes produced-final and the candidate-local capacity peak before drain;
later drain acknowledgements may reconcile only final residual and live-hop
evidence. They cannot recompute or lower that peak or enter paired latency,
application Main or application RSS. Any later producer pull/enqueue, candidate
Promise, owner transition, replay, consumer/public event, connection-
disposition change, resource/spool action or frozen-metric change is
`VALID + FAIL`. No fault-tail acknowledgement may erase an earlier peak.

Counted C1 emits the highest crossed cumulative watermark for each
`1,048,576` bytes and one exact terminal packet; C4 changes only that manifest
value to `4,194,304`. Cumulative nonterminal watermarks may coalesce, terminal
packets may not. Endpoint and producer never wait for telemetry. The maximum
hop and logical peak across all valid C1/C4 roles is at most `8,388,608`; a pass
available only under one cadence, semantic/callback-cadence drift, full-body
buffering, counter regression, negative value, sequence gap/duplicate or byte
mismatch is a Stop.

A hop enters `liveHopIds` before its first producer/fetch action and leaves only
after its mode fact, endpoint request terminal and matching terminal packet are
candidate-seen and reconciled. Delayed old-hop evidence therefore leaves its
residual in the live sum across replay. A none hop records exact zero values but
remains live through terminal reconciliation. A later evidence pass may verify
but never repair historical membership or peaks. Drain-branch finalization must
match the capacity peak already frozen by `roleProductSettled`; a natural-
terminal branch finalized earlier must be copied unchanged into that later
snapshot. Residual is retained as measured and is never rewritten as
acknowledged.

#### COMPAT and paired evidence separation

`NYX-MTL-E1R-NF1-COMPAT-14` runs first with its own process, fresh profile,
manifest and result. It binds exact HEAD commit/tree, overlay manifest and
before/after path hashes; exact unchanged shared types, Chat/Responses
consumers, Thread Library client/coordinator/Worker and Runtime client; packaged
build; preparation transfer; every pre-hop stage/generation and exact HEAD call
matrix; spool-before-history exception; Runtime factory, stable replay-container
lineage, indexed non-terminal child return/rethrow and sole outer terminal;
every later owner and first-winner branch; real consumer and no-read behavior;
exact settlement dispositions, common public/notice-then-close-then-release tail
and later Retry; Runtime/public source order; observer-independent cleanup; and
its own `validity + outcome`; and the candidate-only same-request-target matrix
defined above. It must PASS before any paired role starts.

The paired schema contains only common black-box command, endpoint, wire,
redirect/auth/method/header/body, normalized consumer return, response/
connection cleanup, process exit, latency/Main/RSS and observer facts. C1/C4
add only produced/ack-seen capacity counters. It rejects every `chat:*` or
public-terminal, settlement/`settleTurn`, Runtime, owner, producer-branch,
pre-fetch/handoff or final-owner field. Candidate-only cleanup drift is COMPAT,
not paired evidence. No COMPAT field, case or metric may enter a pair or
aggregate.

The fragment-only paired row requires the identical exact HTTP request-target
before and after the redirect and binds the next one-based occurrence to the
next expected hop id using only that real request's tuple/correlation evidence;
it does not run or consume the synthetic same-request-target COMPAT matrix. A
changed target, missing/extra/duplicate/out-of-order
occurrence or parser/framer disagreement is `VALID + FAIL` under healthy
evidence; controller state cannot repair it.

After COMPAT PASS, at most three paired repetitions run separate fresh normal-
exit role processes:

| Role | Transport                                               | Ack quantum | Pair membership                           |
| ---- | ------------------------------------------------------- | ----------- | ----------------------------------------- |
| `B`  | sealed exact current full-body baseline                 | none        | baseline for C1 and C4 in that repetition |
| `C1` | exact reviewed native-fetch candidate                   | `1,048,576` | paired only with matching B               |
| `C4` | byte-identical candidate; manifest cadence only differs | `4,194,304` | paired only with matching B               |

Order is the fixed Latin square: `B -> C1 -> C4`,
`C1 -> C4 -> B`, then `C4 -> B -> C1`. Each role occupies each process
position once. Every role runs the exact shared case intersection and protocol
order. C1 and C4 are never pooled into an easier median. Pair ids bind
repetition, attempt, protocol and schedule against the matching B from one
complete valid attempt. Candidate process work stays inside application
latency/Main/RSS; observer process CPU/RSS is identity/leak evidence only.

#### Primary classification, retry and Stop rules

Every primary role result has independent fields:

```text
validity: VALID | INVALID
outcome: PASS | FAIL | NOT_EVALUATED
```

Pre-Start identity binds gate/process/profile/attempt, exact candidate/source/
archive/Electron/app/app.asar/harness/workload/fixture hashes, process set,
observer/tap/framer/ALPN/channel self-test and applicable fault-delivery proof.
After that identity and orchestration are proven, any semantic, security,
capacity, deadline, owner, native Promise, consumer, settlement, Runtime/public,
counter, selected-tap order, cleanup, crash, deadlock or abnormal-exit violation
is `VALID + FAIL`. A product-caused loss of evidence remains product failure.
A baseline semantic/fixture/cleanup/exit failure is also `VALID + FAIL` because
no valid oracle pair exists. The first valid failure stops every later role and
repetition.

The frozen `NF1-11-PRE-RUN` raw result is the classifier example for an
unhealthy selected tap: paused-parser backpressure prevented independent raw
terminal evidence, so the result is `INVALID + NOT_EVALUATED`, never a product
FAIL. Under `NF1-14`, a drain-branch terminal miss is `VALID + FAIL` only when
healthy evidence proves route actuation, response writable `finish` where
applicable, the complete product barrier, zero pre-barrier drain read, exact
activation, unchanged product snapshots, uninterrupted lower-level collection,
bounded retained state, zero parser forwarding, no framer/channel error and the
full observer-clock `5,000 ms` expiry before cleanup. A no-drain branch instead
requires its preflight-proven pause-independent raw-terminal watcher. Any
independently missing evidence part is INVALID and stops without same-gate
retry. A proven role that cannot reach `roleProductSettled` without drain or
later moves product state is `VALID + FAIL`; observer drain cannot repair it.

A pre-barrier drain read, response-path activation before writable `finish`,
drain after an already-recorded terminal, any socket-close drain, any post-
activation parser byte, body-sized retained buffer, synthesized parser EOF/
destroy, duplicate propagation of a real terminal, post-barrier product event
or snapshot change, early-redirect sequence backfill, or cleanup-created
terminal/deadline/normal-cleanup evidence is also `VALID + FAIL` when the
observer remains healthy.

`INVALID + NOT_EVALUATED` is reserved for unproven identity, contaminated
profile, workload mismatch, independent observer/tap/framer/channel/auditor/
hash/evidence failure without already-proven product causality, or failed
external cleanup. Ambiguous causality cannot be upgraded to product FAIL.

INVALID handling is repetition-atomic. No role from that attempt enters a pair
or aggregate. Only pre-Start INVALID may retry the whole repetition once after
the external controller proves the prior process tree, sockets, ports, profiles
and handles are clean; the retry uses three new profiles, a new attempt id and
identical exact bytes/order. Post-Start INVALID, failed external cleanup or a
second pre-Start INVALID ends NF1 without same-gate retry. Any harness, workload,
fixture, overlay or candidate-byte fix returns to exact T2 review under a new
gate identity.

Forced evidence cleanup after timeout records process tree, signal, time and
resulting exits. It never becomes normal product exit and never downgrades a
valid failure.

#### Executable slices and ratchet

Original T1 completed at `67bfb8e` after exact review
`NYX-MTL-E1R-NF1-SCOPE-20260816-02`. It remains the completed direction,
decision, numeric, owner, classification and scope-lock history, but its
malformed Responses fixture does not satisfy the current T2 dependency.

T1R completed at `197aaced` and changed this file only. Its historical allowed
delta was limited to the corrected Responses
fixture bytes/length/SHA-256; the exact
`(logicalRequestId, hopId, destinationOrigin, opaquePathToken,
orderedOccurrence)` observer correlation contract and same-request-target
pre-Start matrix; replacement of the active-Run pre-hop `null` interval with the
exact `PreHopOwner` stages/generations, sticky-abort checkpoint/carry matrix,
spool-before-history exception, Runtime factory/stable replay-container lineage/
non-terminal indexed child/sole outer terminal, stage resources and call counts;
the common public-or-notice then fulfilled-or-absent close then owner-release
tail; plan v36 at SHA-256
`e180e19cd1b507f04d16479b24ece139ccbedd072e8844cd50a2c6407382cdce` and fresh
`NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R23` binding; the
then-operational `NYX-MTL-E1R-NF1-11` /
`NYX-MTL-E1R-NF1-COMPAT-11` identities;
the `NYX-MTL-E1R-NF1-REPAIR-20260817-10` source review; separate FIXTURE and
REPAIR histories, including rejected REPAIR `-01`/`-06` and never-run REPAIR
`-02` through `-05` plus `-07` through `-09`; superseded-shakedown and retired
gate `-02` through `-10` exclusions; static-only T1R validation; candidate-only
COMPAT ownership of every dynamic owner/Runtime/call-count/lease-close control
and the same-request-target network matrix; and directly affected status,
dependency and ratchet text. Its historical graph was
`T1 completed -> T1R -> NF1-COMPAT-11 -> NF1-11`. Those two gate identities are
now retired unstarted, and this historical graph authorizes no new artifact,
Start, evidence or product work. Every other
direction, numeric line, fixture, owner outside this exact pre-hop/common-tail
repair, redirect, credential, RequestInit, consumer, settlement/rollback/Retry,
observer behavior outside this exact correlation repair, deadline, capacity,
performance, validity/Stop and product boundary is unchanged.

T1R validation was:

```sh
git diff --check
shasum -a 256 docs/next/multi-thread-library-e1r-contracts.md
pnpm exec oxfmt --check --config apps/desktop/.oxfmtrc.json docs/next/multi-thread-library-e1r-contracts.md
```

Validation also mechanically extracts both escaped fixtures, reconstructs their
LF bytes and verifies each declared length/SHA-256; parses the Responses
`response.completed` JSON with one complete `output` array; and runs the
Responses bytes through the unchanged exact-HEAD consumer. That consumer must
return final content `Hello`, provider state version `1`, protocol
`openai-responses`, null effective reasoning context and the exact one
completed assistant message item. The malformed fixture SHA and unversioned
operational NF1/COMPAT identities must be absent. Both repeated status blocks
must keep FIXTURE and REPAIR identities separate, record REPAIR `-01` and `-06`
as rejected, record REPAIR `-02` through `-05` plus `-07` through `-09` as never
run, and bound REPAIR `-10` as that completed repair's authority. The superseded shakedown must be
mechanically ineligible for every new source/archive/build identity, manifest,
raw result, pair and aggregate. Retired gate identities `-02` through `-10`
must have no sealed artifact, Start, raw result, pair, aggregate or evidence.
Its former `NYX-MTL-E1R-NF1-11 reviewed PASS` downstream clause never fired and
is superseded by the T1P exact `-14` clause below.

T1R statically checks that every expected hop has one exact manifest tuple and
that fragment-only redirects preserve the HTTP request-target token while
`orderedOccurrence` advances. The source contract must assign the plain/TLS by
direct/proxy same-request-target network matrix solely to the then-candidate-only
`NYX-MTL-E1R-NF1-COMPAT-11`, require shadow-framer/real-parser agreement there,
and forbid that matrix's events, result, timing, capacity values and verdict from
every B/C pair, result and aggregate. T1R does not execute the network matrix or
record a dynamic PASS.

T1R also statically maps every documented Runtime-enabled and disabled pre-hop
stage and exact HEAD next-call edge to exact HEAD source. It checks that the
ordinary-Promise, replay-child, latest same-lineage container, sole outer
terminal, three-way settlement and common public-or-notice/conditional-close/
owner-release contracts are complete and internally consistent. It performs no
rejection, abort, settled-before-reaction, wrong-generation, Runtime child/
container, call-count or lease-close injection. The source contract assigns all
of those dynamic cases and their unchanged outcomes solely to the later T2
candidate-only COMPAT preflight.

The exact formatted T1R bytes required independent strict review
`NYX-MTL-E1R-NF1-REPAIR-20260817-10`. Review checks the fixture extraction,
hash, JSON and unchanged consumer result; static route/occurrence contract and
candidate-only same-target assignment; v36/R23 identity; historical `-11` gate identities;
rejected/never-run source-review history; retired `-02` through `-10` and
superseded-shakedown exclusion; static exact-HEAD pre-hop lineage/call-matrix/
common-tail mapping and T2 ownership of every dynamic control; all direct
regressions; and the
unchanged user decision, 8 MiB evidence-only meaning, fault prefix, five
deadlines, both telemetry schedules, redirect/credential/body/duplex rules,
preparation and gapless owner, twelve rows and final overlay, real consumers,
plaintext tap, capacity/live-hop math, disjoint COMPAT/paired schemas, Latin
square, settlement/rollback/Retry and exact validity/Stop rules. Entry of those
exact accepted bytes into HEAD completes T1R without a later status-only edit.

T1S changed this file only. It completed at
`2de9d415066823a8fa335badb3ba9846ed1eb73a` with exact 6,097-line source bytes
at SHA-256 `ba4ec63d1fe11e01797eebab3f8a6547405912bd33aec59a2bbb0b9e921546e6`
after independent review `NYX-MTL-E1R-NF1-REPAIR-20260817-12`. Its dependencies
were completed T1R at `197aaced` and the exact accepted v38 plan identity above.
Its historical delta was limited to:

1. recording `NF1-11-PRE-RUN` as the exact frozen
   `INVALID + NOT_EVALUATED` raw artifact and excluding its entire temp
   derivation without inferring product failure;
2. replacing the continuously transparent tap with the exact one-way
   `parser_forwarding -> roleProductSettled -> terminal_drain` evidence
   contract, route prerequisites, frozen product/measurement snapshot,
   bounded-state/read rules, deadline-4 start, socket-close no-drain branch,
   parser/writable terminal order, classifier and post-verdict cleanup above;
3. binding v38, its exact SHA-256, convergence receipt and full strict review;
4. preserving all earlier FIXTURE and REPAIR accepted/rejected/never-run
   history, retaining REPAIR `-10` as completed T1R history, recording REPAIR
   `-11` as never run, and binding the exact formatted T1S bytes only to
   `NYX-MTL-E1R-NF1-REPAIR-20260817-12`;
5. retiring full `NF1-11`/`COMPAT-11` and prospective
   `NF1-12`/`COMPAT-12` as unstarted while recording, as T1S historical intent,
   `NYX-MTL-E1R-NF1-13` and `NYX-MTL-E1R-NF1-COMPAT-13` as the then-sole gate
   identities; and
6. recording the then-canonical historical graph as
   `T1 completed -> T1R completed -> T1S -> NF1-COMPAT-13 -> NF1-13` and the
   then-downstream product unlock with exact
   `NYX-MTL-E1R-NF1-13 reviewed PASS`.

Those `-13` selections are preserved only as T1S historical intent. T1P below
retired both gate identities before sealed Start and superseded every
operational or downstream use.

T1S changed no fixture, redirect, credential, RequestInit, owner, consumer,
settlement, rollback, Retry, Runtime, capacity/performance line or membership,
numeric deadline, acknowledgement schedule, paired/COMPAT membership, product
inventory or authorization. Its validation was:

```sh
git diff --check
shasum -a 256 docs/next/multi-thread-library-e1r-contracts.md
pnpm exec oxfmt --check --config apps/desktop/.oxfmtrc.json docs/next/multi-thread-library-e1r-contracts.md
```

Validation also reconstructs the unchanged Chat fixture to 143 bytes and
SHA-256
`36c10cc77a3b79a5bf98e5d797dc39cfd52f437c12231a07aa373c636597d99d`,
and the unchanged Responses fixture to 312 bytes and SHA-256
`910035adf9450f9f245c2cb1384ff49a9349022d57c1d100704ea084e177b9ce`.
The Responses completed JSON retained its one complete `output` array, and
the exact-HEAD unchanged consumer still returned content `Hello`, provider
state version `1`, protocol `openai-responses`, null reasoning context and the
one exact completed assistant item. Static scans required both repeated status
blocks to bind v38/R25/REPAIR-12, preserve every earlier identity disposition,
and classify every `-11`/`-12` occurrence as completed, rejected, never-run,
invalid or retired history that cannot enter a new manifest, raw result, pair,
aggregate or unlock. Every operational gate, dependency and downstream unlock
at T1S landing named only `-13`.

The source contract also stated zero pre-barrier drain and zero post-
activation parser forwarding; exact `65,536` endpoint consumption; every raw
read at most `65,536`; observer-owned retained state at most `131,072`; route-
specific receipt/actuation and response writable `finish`; a complete black-box
product/connection/resource/spool/performance/capacity freeze before drain;
socket-close no-drain and real terminal only; complete-body no synthetic parser
EOF/destroy; real FIN/RST single propagation; deadline-4/5 separation; no
observer-to-product edge; early-redirect no backfill; and active cleanup only
after all applicable immutable verdicts. Static exact-HEAD owner/call/
settlement/consumer mappings remain unchanged outside this observer/identity
delta.

The exact formatted T1S bytes passed independent strict review
`NYX-MTL-E1R-NF1-REPAIR-20260817-12` and entered HEAD without a later status-
only edit. Its pre-T2 Stop conditions were: any role needs drain/parser EOF/
destroy/observer acknowledgement to reach the product barrier; a response
writable cannot finish while request parsing stays paused; early redirect needs
post-settlement drain to invent the selected-tap order; cleanup cannot be
mechanically separated from terminal/deadline/normal-cleanup evidence; a frozen
non-observer contract changes; or any tracked product/harness file is required.

T1P changes this file only. Its dependencies are completed T1S at
`2de9d415066823a8fa335badb3ba9846ed1eb73a`; focused review
`NYX-E1R-NF1-T2-PUBLIC-EVENT-FOCUSED-01`, which stopped T2 before sealed Start;
the user's explicit authorization of the narrow repair; repair commit
`d1a15356c1990b6fec831d4fc3ff98ab7695051b`, tree
`0e5967782cb36e636ae4f7916ad88993feea0a5a`; accepted code review
`NYX-E1R-DONE-IPC-REPAIR-CODE-01`; and exact accepted v40 plan identity above.
Its delta is limited to:

1. preserving T1S/v38/FINAL-R25/REPAIR-12 as completed history;
2. recording the focused S1 as `STOP before Start`, never INVALID, FAIL, PASS,
   `VALID_STOP`, or COMPAT/NF1 gate evidence;
3. recording the authorized repair commit/tree and accepted code review;
4. freezing Session `chat:done` to exactly `type`, `threadId`, `requestId`,
   `assistantMessageId`, `status`, and `finalContent`, while the existing Thread
   service adds only `eventEpoch` and `cursor` to the final IPC envelope;
5. retiring never-started `NF1-13`/`COMPAT-13`, excluding every pre-Start `-13`
   derivative from future artifacts and evidence, and making
   `NYX-MTL-E1R-NF1-14`/`NYX-MTL-E1R-NF1-COMPAT-14` the sole operational gate
   identities; and
6. requiring exact `NYX-MTL-E1R-NF1-14 reviewed PASS` for any later product
   scope-lock draft.

The repair retains the shared `NyxChatDoneEvent` contract. Session may not send
`detail`, `runtimeReplayDetail`, `targetSelection`, `documentBearing`,
`userMessageId`, or any other `PreparedThreadTurn`-only field. The accepted path
hashes are:

| Exact HEAD path                                             | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/desktop/electron/main/chat/session.ts`                | `54c1e9eb3f149f19d0329629c0e40bf035b9fb4718a8c3a36441ac2ece10879d` |
| `apps/desktop/electron/main/chat/session.test.ts`           | `2fe0488a128d7a8a7d324337851280ccd435885ff286029ef375febf51f43240` |
| `apps/desktop/electron/main/thread-library/service.test.ts` | `1cf4430df62fe239260398c1796cacbb61f8089411474da13544a91830e5270e` |
| `apps/desktop/electron/main/thread-library/service.ts`      | `1b1726f33955970988b6387fb6cb4257ea6a4feec5f34f8ede77d00ceee7297d` |
| `apps/desktop/shared/chat/events.ts`                        | `073d7657a5b68bb903bbccf5d21c1bed2a97ec73ea2ce1a1f12ab769ef0e132b` |

T1P changes no further product, test, harness, shared contract, preload,
Renderer, Runtime, coordinator, Worker, consumer, fixture, transport, observer,
classifier, capacity/performance, deadline, acknowledgement, product inventory,
or authorization contract. Its validation is:

```sh
git diff --check
shasum -a 256 docs/next/multi-thread-library-e1r-contracts.md
pnpm exec oxfmt --check --config apps/desktop/.oxfmtrc.json docs/next/multi-thread-library-e1r-contracts.md
```

Validation also reconstructs the unchanged Chat fixture to 143 bytes and
SHA-256
`36c10cc77a3b79a5bf98e5d797dc39cfd52f437c12231a07aa373c636597d99d`,
and the unchanged Responses fixture to 312 bytes and SHA-256
`910035adf9450f9f245c2cb1384ff49a9349022d57c1d100704ea084e177b9ce`.
The Responses completed JSON retains one complete `output` array, and the
unchanged exact-HEAD consumer returns content `Hello`, provider state version
`1`, protocol `openai-responses`, null reasoning context, and the one exact
completed assistant item. Mechanical exact-HEAD checks confirm the six Session
event fields, the two existing service clock fields, absence of every private
prepared-turn field, the five path hashes above, and that `git show d1a1535`
contains only one production projection plus two regression-test files.

Both repeated status blocks must preserve every earlier identity disposition
and bind v40, its convergence/full reviews, the focused Stop, repair commit/tree,
and accepted code review without claiming any of them as gate evidence. Every
operational gate, dependency, manifest, and downstream unlock must name only
`-14`. Every `NF1-13`/`COMPAT-13` gate occurrence is explicit stopped/retired
history. `NYX-MTL-E1R-NF1-REPAIR-20260817-13` is the sole current prospective
`-13` source-review identity and is not a gate id. Chat/Responses fixtures, the
two-phase observer, manual redirects, credential handling, five deadlines,
capacity/performance lines, owner/settlement/Runtime order, COMPAT/paired
membership, classifier, and Stop rules remain unchanged outside these repair/
identity paragraphs.

The exact formatted T1P bytes require independent strict review
`NYX-MTL-E1R-NF1-REPAIR-20260817-13`. Entry of those exact accepted bytes into
HEAD completes T1P without a later status-only edit. Stop before T2 if this edit
hides the S1 or old derived bytes; treats `NF1-13` or `COMPAT-13` as a gate
result; changes a frozen contract; needs another tracked product/harness edit;
leaves any operational `-13` unlock; or cannot enter HEAD as the exact reviewed
bytes.

Only after T1P completes may T2 build two newly sealed reviewed OS-temp
artifacts:

1. the common B/C1/C4 transport harness; and
2. one candidate-only exact-HEAD COMPAT overlay.

T1S alone, T1R, the original T1 landing, the superseded first shakedown,
`NF1-11-PRE-RUN`, the focused S1 review, and the accepted repair code review do
not satisfy the T2 dependency. T2 uses a fresh OS-temp root and may not copy any
source, overlay, build, app, profile, trace, result draft, or manifest from a
pre-Start `-13` derivative. Before execution it seals exact source/archive/
build/app.asar/workload/fixture/overlay hashes and the unchanged-module manifest,
proves dev/build/app.asar/
packaged identity, runs small streaming POST direct/proxy RequestInit controls,
proves the two-phase pre-parser observer/channel topology and static no-control
dependency, including plain/TLS by direct/proxy external-abort, incomplete-
early-final and incomplete-early-redirect phase/order/bounds controls plus a
separate socket-close no-drain control before any role Start, and executes every
frozen dynamic preparation/pre-hop owner/Runtime generation,
rejection/abort/race, lineage/call-count, native/consumer/settlement/common-close
control. Candidate-only COMPAT also executes the plain/TLS by direct/proxy
same-request-target matrix; none of its evidence may enter B/C. The manifest
binds the exact T1P landing HEAD/tree and the five repaired exact-HEAD path
hashes above. Candidate-only COMPAT exercises completed, cancelled, and
retained-settlement-Retry `chat:done` paths through the real Session publish
call: before the Thread service clock, the event has exactly the six frozen
fields; final `sender.send` adds exactly `eventEpoch` and `cursor`. Any private
prepared-turn field in either payload is `VALID + FAIL`; the temp seam may
observe but may not filter, rebuild, or repair that call. If the
unchanged real-consumer seam cannot be installed, a tracked/product change is
needed, an overlay path is unmanifested, or exact redirect behavior cannot be
expressed, T2 stops. Exact T2 bytes need a new independent pre-run review id
before Start.

T3 first runs `NYX-MTL-E1R-NF1-COMPAT-14`. Only its PASS under the sealed
classifier permits `NYX-MTL-E1R-NF1-14` paired roles; T4 later reviews both
evidence sets independently. NF1-14 records all raw B/C1/C4 results, the frozen
`NF1-11-PRE-RUN` INVALID artifact only as excluded history, every superseded
INVALID attempt under the new identity, exact cleanup/
retry proof and a mechanical pair/aggregate index. It follows first-valid-
failure Stop and the INVALID rules above.

T4 independently reviews only `NYX-MTL-E1R-NF1-COMPAT-14` and
`NYX-MTL-E1R-NF1-14` paired evidence, exact identities,
classification and aggregate membership. Paired review binds every black-box
product-settled snapshot and frozen latency/Main/RSS/capacity peak; every
eligible parser-forwarding-to-terminal-drain transition and response writable
`finish`; endpoint/parser/drain/raw-byte reconciliation; the natural-terminal
no-activation branch; socket-close no-drain/real-FIN-RST evidence; retained-
state bounds; complete-body no-EOF/destroy and real-terminal single propagation;
unchanged post-barrier product snapshots; line-4/line-5 results; post-verdict-
only cleanup; and early-redirect no-backfill order. It separately proves no role
used drain/parser EOF/destroy/observer acknowledgement to reach the barrier and
that the frozen pre-run artifact and every pre-Start `-13` derivative contributed
nothing. It then updates only this
source-of-truth status to reviewed PASS or `VALID_STOP`. It may not reinterpret
INVALID, rerun after a valid failure or authorize product code on Stop.

A recorded `NYX-MTL-E1R-NF1-14 reviewed PASS` permits only drafting a separate
`multi-thread-library/E1R-P1-scope-lock`. That later scope lock needs its own
exact product inventory, checks and independent review in HEAD. It is not
authorized by this amendment. Full E1 cross-Thread concurrency, shutdown barrier
and UI remain outside NF1.

<!-- nyx-contract-end: multi-thread-library/e1r-contracts -->
