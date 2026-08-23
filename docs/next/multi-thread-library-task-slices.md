# Multi-Thread Library Task Slices

<!-- nyx-workstream-status-owner: multi-thread-library -->

## Current Status

The prospective `NYX-MTL-E1R-NF1-COMPAT-14` and
`NYX-MTL-E1R-NF1-14` gates were retired by explicit user decision on
2026-08-18 to unblock the documentation ownership migration. They did not
run and do not have PASS or `VALID_STOP` results.

The new bounded `E1S` direction completed at product commit `19c90ef` under
contract `NYX-MTL-E1S-SCOPE-20260818-01`. Its independently reviewed scope lock
entered HEAD at `4433dc8`; the product commit stayed within the locked file
inventory and passed every required check. E1S permits at most two process-wide
Runs and at most one attachment-bearing Run, while Thread switching and New
detach the selected projection without cancelling background work.

The bounded `E1S-R1` correctness repair completed at product commit `6566b93`
under contract `NYX-MTL-E1S-R1-SCOPE-20260819-01`. Its independently reviewed
scope lock entered HEAD at `b00bc27`. The final 13-file product diff had
SHA-256 `554d00b9d0f925c1aab1411a2a52e85b44ef2a742733b95f1416bed904d52e42`.
Its scope and final product review receipts, bounded repair result and required
checks are recorded in
[multi-thread-library-runthrough.md](./multi-thread-library-runthrough.md).

On 2026-08-20 the user explicitly requested the bounded `CP1` direction:
Available collection pagination plus Pinned/Recent projection. CP1 completed at
product head `0247c69` under contract `NYX-MTL-CP1-SCOPE-20260820-01`; its
scope lock entered HEAD at `1131cfe`. The final 17-file diff from the frozen
baseline through that product head had SHA-256
`daffe2db1174f7567309269db9c1e17423393551f4b273f9f874243d311aaada`.
Independent final review `NYX-MTL-CP1-FINAL-REVIEW-20260821-01` returned
`accept` with no findings, and all required checks passed. The implementation,
repair, review and validation evidence is recorded in
[multi-thread-library-runthrough.md](./multi-thread-library-runthrough.md).

On 2026-08-21 the user explicitly narrowed CP1 to pagination and the
Pinned/Recent projection. Custom roving keyboard navigation, automatic focus
movement, live loading announcements and manual VoiceOver evidence are removed
from CP1. Ordinary button behavior, selected state and existing accessible
labels remain. This narrower decision supersedes the broader CP1 focus and
VoiceOver mechanics in the technical plan.

On 2026-08-21 the user explicitly requested the bounded `PIN1` direction:
Pin, Unpin and deterministic movement inside the existing Pinned collection.
PIN1 completed at product head `4b77390` under contract
`NYX-MTL-PIN1-SCOPE-20260820-01`; its scope lock entered HEAD at `ddfc0cd`.
The exact 21-file product diff from that scope-lock head through the product
head had SHA-256
`6ce8c5c10597623177a9ea84244661bf0777aa7ce17d5a5f46911b3300b49afe`.
Independent final review `NYX-MTL-PIN1-FINAL-REVIEW-20260822-02` returned
`accept` with no findings, and all required checks passed. The implementation,
repair, review and validation evidence is recorded in
[multi-thread-library-runthrough.md](./multi-thread-library-runthrough.md).

On 2026-08-22 the user explicitly authorized the bounded reversible lifecycle
sequence described by the current amendment in
[multi-thread-library-technical-plan.md](./multi-thread-library-technical-plan.md):
Rename, then Archive/Unarchive, then Trash/Restore. This authorization removes
the earlier product-code hold after the exact current slice is recorded here.
Rename completed at product head `2b4c393` under contract
`NYX-MTL-RENAME-SCOPE-20260822-01`; its scope lock entered HEAD at `cf74d4b`.
Archive/Unarchive completed at product head `7e661d0` under contract
`NYX-MTL-ARCHIVE-SCOPE-20260822-01`; its scope lock entered HEAD at `bc79920`.
Trash/Restore completed at product head `d29249e` under contract
`NYX-MTL-TRASH-SCOPE-20260822-01`; its scope lock entered HEAD at `0b9b9ab`.
The authorized reversible lifecycle sequence is complete and grants no ordinary
continuation.

On 2026-08-23 the user explicitly requested a bounded correctness repair for
the landed reversible lifecycle. Contract
`NYX-MTL-LIFECYCLE-R1-SCOPE-20260823-01` below is the only candidate execution
scope. Until its exact bytes receive independent review and this docs-only
change enters HEAD, product work remains non-executable.

E1S-R1 has no remaining executable product work and grants no follow-up slice.
CP1 is not a continuation or revival of old U1/L1. PIN1 has no remaining
executable product work and grants no follow-up slice. Neither CP1, PIN1 nor an
older plan or review grants further product permission.

Old E1/E1R product slices and native-fetch gates remain non-executable.
`E1S` does not revive an old candidate, restore an old gate, or inherit an old
PASS, `VALID_STOP`, plan version, artifact, reviewer conclusion, or execution
permission.

The migrated source blocks below preserve the pre-retirement contract and
status history for traceability. This Current Status section is authoritative.

## multi-thread-library/Lifecycle-R1-scope-lock: Reversible lifecycle correctness repair

Contract id: `NYX-MTL-LIFECYCLE-R1-SCOPE-20260823-01`.

This is a bounded repair of the landed Rename, Archive/Unarchive and
Trash/Restore behavior at product head
`d29249efcab7e7f0aea595b4a5cbf4366d9accf5`. It does not reopen or redo CP1,
PIN1 or the completed lifecycle sequence. If the exact bytes of this section
receive independent scope review and this docs-only change enters HEAD, the
user's explicit implementation request authorizes only the product work below.

Lifecycle-R1 closes three correctness defects without changing the accepted
product model:

- Worker empty-shell discard must require the Thread to still be Available in
  the same conditional delete that checks the exact empty-shell state. A queued
  Archive or Trash that commits before discard must therefore preserve the
  Thread and all of its data;
- Archived and Trash are read-only even when their collection is empty or no
  Thread is selected. Composer, attachment mutation, Draft materialization,
  Send and Retry must be unavailable from both visible UI and direct Renderer
  action entry points. Entering a read-only mode also cancels stale inline
  Rename state, and failed messages there do not expose Retry;
- every Archive, Unarchive, Trash and Restore holds the existing Renderer
  navigation barrier from preflight through matching canonical hydration or
  failure. New, mode changes and Thread selection cannot race that interval.
  The action may use its captured selected state only while that barrier proves
  selection cannot change. Pin and Rename retain their accepted PIN1/lifecycle
  behavior and do not gain a global navigation lock.

Main remains the final guard for Archive and Trash. Focused service tests must
prove that `accepted`, `streaming`, durable pending Turn and
`settlement_failed` states reject those actions without a Worker mutation.

The Lifecycle-R1 product step may change exactly:

- `apps/desktop/electron/main/thread-library/worker.ts`;
- `apps/desktop/electron/main/thread-library/worker.test.ts`;
- `apps/desktop/electron/main/thread-library/service.test.ts`;
- `apps/desktop/src/ui/chat/chat-reducer.ts`;
- `apps/desktop/src/ui/chat/chat-reducer.test.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.test.ts`;
- `apps/desktop/src/ui/chat/components/ChatSidebar.tsx`;
- `apps/desktop/src/ui/chat/components/ChatSidebar.test.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts`;
- `docs/next/multi-thread-library-runthrough.md` for final evidence only; and
- this status owner for the final reviewed completion record only.

No other file is allowed. In particular Lifecycle-R1 does not add or change a
public bridge method, shared contract, Worker protocol, schema, migration,
database owner, Main collection mutation barrier or Renderer collection action
token. It does not add a location preflight, general reconciliation framework,
mutation replay, Search, Undo, Permanent delete, Empty Trash, automatic
unarchive, Stop-and-move, custom focus system, or CP1/PIN1 cleanup.

Required focused evidence:

- delayed empty-shell discard after Archive and after Trash preserves the
  moved Thread; ordinary exact Available empty-shell discard still succeeds;
- empty and selected Archived/Trash modes cannot materialize a Thread, save a
  Draft, attach, Send or Retry; Available behavior remains unchanged;
- changing mode cancels inline Rename, and Trash never renders a Rename input
  or a failed-message Retry action;
- selected and unselected location mutations reject concurrent New, mode
  changes and Thread selection until canonical hydration settles; success keeps
  the intended selection/mode, while failure preserves the old projection and
  dirty overlay;
- Archive and Trash reject every non-idle activity boundary and settlement
  failure without dispatching a Worker mutation; and
- existing Pin, Rename, pagination, Draft-save and reversible location tests
  remain green.

Before final evidence, run:

```text
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run desktop:test
mise run desktop:build
mise run runtime:chat-state:check
mise run docs:check
mise run format-check
git diff --check
```

Lifecycle-R1 stops and returns to planning if implementation needs a file
outside the inventory above; a schema, protocol or shared-contract change; a
second Main barrier or Renderer token; response-owned projection writes; a
location preflight; or any product behavior beyond closing the listed defects.
One successful repair grants no further lifecycle slice.

## multi-thread-library/Rename-scope-lock: Manual Thread rename

Contract id: `NYX-MTL-RENAME-SCOPE-20260822-01`.

Status: complete at product head `2b4c39386d3ef7f90c2c7e46684353d413fd2719`
by explicit user authorization on 2026-08-22. Baseline:
`0f1bedd65acd236cb81da7ce583937ec90900076`, containing completed CP1 and PIN1.
The exact 21-file product diff from scope-lock head
`cf74d4bce0186e2211bb88d8fba44946846ede52` through the product head had
SHA-256 `05bf1da38357cecb048955e33c5a1f52c7f5212f864ca55f0f28889efbd2da22`.

This slice implements only manual Rename over landed CP1/PIN1 behavior. It does
not implement Archive, Unarchive, Trash or Restore, and does not reopen or redo
CP1/PIN1. It first performs the minimum behavior-preserving internal
generalization needed to keep one Main collection mutation barrier and one
Renderer collection action token, then adds Rename through that existing path.

Rename is allowed for Available and Archived Threads and absent for Trash.
Main revalidates trim plus 1–48 Unicode code points; duplicates are allowed and
invalid input performs no write. A successful auto-title Rename writes the
manual title, clears fallback identity and increments `thread_revision` once.
An already-manual identical title is a successful no-op. Rename preserves
`last_user_activity_at`, Pin, location, Draft, Turns, resources, result state and
collection order. It may update `updated_at`, which does not order Available or
Archived collections.

The public bridge adds only typed `threads.rename(input)`, carrying `threadId`,
`title` and `expectedThreadRevision`, and returning canonical public detail plus
the existing Thread clock. Worker protocol adds only semantic `rename`; no
schema or migration changes. Main serializes Rename with Pin and empty-shell
discard. A known commit uses the normal changed event. An unknown outcome is
never replayed: after one replacement Worker, Main performs one existing
`readThread` and accepts only the canonical intended manual state at the
expected revision/no-op boundary or expected revision plus one.

Renderer generalizes the one existing PIN1 action token into a discriminated
Pin/Rename/location-capable token, but this slice exposes only Pin and Rename.
The token records Thread identity, dispatch epoch/projection generation and the
loaded page budget. Pin and Rename block each other until matching bounded
collection hydration or whole-Library failure owns the surface. The response
never writes title or Pin directly into Renderer projection. Inline Rename uses
Enter to submit, Escape to cancel, preserves invalid input and focus, and does
not appear for unavailable or Trash rows.

The Rename product step may change exactly:

- `apps/desktop/shared/threads/types.ts`;
- new `apps/desktop/shared/threads/title.ts` and its near-source test if needed;
- `apps/desktop/shared/threads/ipc.ts`;
- `apps/desktop/shared/contracts/desktop.ts`;
- `apps/desktop/electron/preload/index.ts` and its test;
- `apps/desktop/electron/main/index.ts` and its test;
- `apps/desktop/electron/main/thread-library/protocol.ts`;
- `apps/desktop/electron/main/thread-library/worker.ts` and its test;
- `apps/desktop/electron/main/thread-library/client.ts` and its test;
- `apps/desktop/electron/main/thread-library/service.ts` and its test;
- `apps/desktop/src/ui/chat/use-chat-session.ts` and its test;
- `apps/desktop/src/ui/chat/components/ChatSidebar.tsx` and its test;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx` and its test when
  needed only to carry the existing hook action; and
- this status owner, the linked technical plan and
  `multi-thread-library-runthrough.md` for scope/completion evidence only.

Required validation:

```text
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run desktop:test
mise run desktop:build
mise run runtime:chat-state:check
mise run docs:check
mise run format-check
git diff --check
```

Stop if Rename needs a schema change, a second collection mutation barrier or
Renderer action token, direct response-owned projection writes, mutation replay,
another database owner, or any CP1/PIN1 product behavior change.

## multi-thread-library/Archive-Unarchive-scope-lock: Reversible Archive location

Contract id: `NYX-MTL-ARCHIVE-SCOPE-20260822-01`.

Status: complete at product head `7e661d0064296dff70298bee2b2cb1c846299b87`
by the user's bounded lifecycle authorization on 2026-08-22. Baseline:
`2b4c39386d3ef7f90c2c7e46684353d413fd2719`, containing completed Rename. The
exact 21-file product diff from scope-lock head
`bc799200692bf76aa9b34f7d8de8c9b40734a74a` through the product head had
SHA-256 `39e66136c40016d26b18af695d5489b149e842e77669b32d1c05ccf1f297fe54`.

This slice implements only `Available → Archived` and `Archived → Available`.
It does not implement Trash, Restore, Search, Undo, automatic unarchive on Send,
Stop-and-move or permanent deletion. It reuses the existing SQLite location
columns, semantic location-aware `listPage`, one Main collection mutation
barrier and one Renderer collection action token. No schema or migration is
allowed.

The public bridge adds one typed semantic `threads.updateLocation(input)` with
`archive | unarchive`, `threadId` and `expectedThreadRevision`. Archive requires
Available, clears Pin and closes the remaining Pin order atomically. Unarchive
requires Archived and returns to unpinned Available/Recent. Both increment
`thread_revision` exactly once, may update `updated_at`, preserve
`last_user_activity_at`, Draft, Turns, resources and result state, and reject a
stale revision or wrong source location without a write. Active Run, durable
pending Turn and settlement failure reject Archive. Archived Draft, Send and
Retry mutations are rejected in Main/Worker; reading, Rename and Unarchive stay
available.

Main serializes location mutation with Pin, Rename and empty-shell discard.
Known commits use the normal changed event. Unknown outcomes are never replayed:
after one replacement Worker, Main performs one Worker-only `locationState`
read transaction that validates the complete Pin order and returns only
`pinnedCount + detail`. The client accepts only the exact intended post-location
at expected revision plus one, treats the exact pre-location at expected
revision as definitely not committed, and fails closed for every third state.

Renderer generalizes the existing Available collection projection to one active
`available | archived` mode while preserving the same 50-row explicit paging,
loaded-page budget, selection, epoch and bounded recovery rules. Archived and
Back to threads are ordinary buttons; no custom focus system or announcements
are added. Available shows Archive; Archived shows Rename and Unarchive but no
Pin or Composer. A selected Archive/Unarchive first holds the existing
navigation-save barrier and flushes the current Draft; failure stays in the old
mode/location. A successful selected move switches to the target mode and keeps
that Thread selected. Moving an unselected row keeps the current mode and
selection. Mutation responses never write location or Pin directly into the
Renderer projection; the shared action token remains held until matching
canonical hydration or whole-Library failure.

The Archive/Unarchive product step may change exactly:

- `apps/desktop/shared/threads/types.ts`;
- `apps/desktop/shared/threads/ipc.ts`;
- `apps/desktop/shared/contracts/desktop.ts`;
- `apps/desktop/electron/preload/index.ts` and its test;
- `apps/desktop/electron/main/index.ts` and its test;
- `apps/desktop/electron/main/thread-library/protocol.ts`;
- `apps/desktop/electron/main/thread-library/worker.ts` and its test;
- `apps/desktop/electron/main/thread-library/client.ts` and its test;
- `apps/desktop/electron/main/thread-library/service.ts` and its test;
- `apps/desktop/src/ui/chat/thread-collection.ts` and its test;
- `apps/desktop/src/ui/chat/use-chat-session.ts` and its test;
- `apps/desktop/src/ui/chat/components/ChatSidebar.tsx` and its test;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx` and its test only for
  carrying the existing hook mode/actions and hiding the Archived Composer; and
- this status owner plus `multi-thread-library-runthrough.md` for completion
  evidence only.

Required validation is the same ten-command matrix frozen for Rename above.

Stop if this step needs a schema change, a second Main mutation barrier, a
second Renderer collection token, direct response-owned projection writes,
mutation replay, a new database owner, Trash/Restore behavior or CP1/PIN1
reimplementation.

## multi-thread-library/Trash-Restore-scope-lock: Reversible Trash location

Contract id: `NYX-MTL-TRASH-SCOPE-20260822-01`.

Status: complete at product head `d29249efcab7e7f0aea595b4a5cbf4366d9accf5`
by the user's bounded lifecycle authorization on 2026-08-22. Baseline:
`7e661d0064296dff70298bee2b2cb1c846299b87`, containing completed Rename and
Archive/Unarchive. The exact 15-file product diff from scope-lock head
`0b9b9ab105a43d4ef032e24a403fd57194585078` through the product head had
SHA-256 `7813cb105d067d6b48556247406c98cde046513eef73e3c551a6dd2f6f2f3e40`.

This slice implements only reversible Trash and Restore. Trash accepts an
Available or Archived Thread, records `trashed_from_location`, records the
existing Pin position only for a Pinned Available source, removes any Pin and
enters Trash. Restore returns to that saved location; a saved Available Pin is
inserted at its saved position clamped to the current Pinned boundary, while
all other restores are unpinned. Both operations clear or establish the Trash
metadata atomically, increment `thread_revision` exactly once, preserve
`last_user_activity_at`, Draft, Turns, resources and result state, and reject a
stale revision or wrong source location without a write. Entering Trash may
update `updated_at` for deterministic Trash ordering. No schema or migration is
allowed.

The existing typed semantic `threads.updateLocation(input)` action union gains
only `trash | restore`; it does not add another bridge method. Trash requires
the same Draft-save, navigation, Active Run, durable pending Turn and
`settlement_failed` protections as Archive. Trash content is read-only: Draft,
Send and Retry are rejected, while Restore remains available. Restore does not
make an Archived origin writable until it has canonically returned to
Available.

Main reuses the one collection mutation barrier and never replays an unknown
location write. The existing Worker-only `locationState` read transaction is
extended only as needed to validate complete Pin order plus canonical Trash
metadata. The client accepts only the semantic post-state at expected revision
plus one, treats the exact pre-state at expected revision as definitely not
committed, and fails closed for every third state.

Renderer extends the one active collection mode to `available | archived |
trash` and reuses the same paging, selection, epoch, navigation-save barrier and
collection action token. Available and Archived rows expose Trash; Trash rows
expose only Restore and no Rename or Pin. A selected Trash first saves the
current Draft and then hydrates canonical Trash. A selected Restore chooses its
target mode from the successful canonical response detail, then hydrates that
mode without directly writing Thread location or Pin into Renderer projection.
Moving an unselected row keeps the current mode and selection. Trash has no
Composer and is read-only.

The Trash/Restore product step may change exactly:

- `apps/desktop/shared/threads/types.ts`;
- `apps/desktop/shared/threads/ipc.ts`;
- `apps/desktop/shared/contracts/desktop.ts`;
- `apps/desktop/electron/preload/index.ts` and its test;
- `apps/desktop/electron/main/index.ts` and its test;
- `apps/desktop/electron/main/thread-library/protocol.ts`;
- `apps/desktop/electron/main/thread-library/worker.ts` and its test;
- `apps/desktop/electron/main/thread-library/client.ts` and its test;
- `apps/desktop/electron/main/thread-library/service.ts` and its test;
- `apps/desktop/src/ui/chat/thread-collection.ts` and its test;
- `apps/desktop/src/ui/chat/use-chat-session.ts` and its test;
- `apps/desktop/src/ui/chat/components/ChatSidebar.tsx` and its test;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx` and its test only for
  carrying the existing mode/actions and hiding the Trash Composer; and
- this status owner plus `multi-thread-library-runthrough.md` for completion
  evidence only.

Required validation is the same ten-command matrix frozen for Rename above.

Stop if this step needs a schema change, another bridge method, a second Main
mutation barrier, a second Renderer collection token, direct response-owned
projection writes beyond choosing Restore's canonical target mode, mutation
replay, a new database owner, Permanent delete, Empty Trash, Undo, Search,
Stop-and-move or CP1/PIN1 reimplementation.

## multi-thread-library/CP1-scope-lock: Available pagination and Pinned/Recent projection

Contract id: `NYX-MTL-CP1-SCOPE-20260820-01`.

Independent review binding:
`NYX-MTL-CP1-SCOPE-REVIEW-20260820-02`.

Status: complete at product head `0247c69`. The independent scope review
accepted the exact scope candidate under the binding above, and the Plan-First
scope-lock commit entered HEAD at `1131cfe`. The 2026-08-21 user decision
narrowed the accepted scope at `98caec8`; independent final review
`NYX-MTL-CP1-FINAL-REVIEW-20260821-01` accepted the resulting implementation
with no findings.

CP1 is a fresh bounded projection slice over landed C1, E1S and E1S-R1
behavior. It uses the existing SQLite schema, Worker-owned Available ordering,
typed `listPage` bridge and exact `get` path. It does not revive historical U1,
L1, E1, E1R, NF1, COMPAT, v40, R2 or either retired native-fetch gate. It does
not authorize PIN1 or any Thread lifecycle mutation.

The pre-scope-lock baseline is commit
`823228705e518218df0fb55de1ad0265ea2d0ee6`, which contains E1S-R1 product
commit `6566b93` and its accepted evidence record. Scope-lock commit `1131cfe`
has that baseline in its ancestry.

CP1 freezes these user-visible behaviors:

- the Available collection loads at most 50 canonical summaries per explicit
  page. Initial hydration shows `Loading threads`; a next page is requested only
  from the `Load more threads` control. Loading more preserves
  existing rows and shows `Loading more`. Exhausting the one permitted bounded
  candidate rebuild during initial load shows `Couldn't load threads` plus a
  local page Retry. The same bounded failure during a later load preserves rows,
  selection and detail, and shows `Couldn't load more` plus local page Retry;
- `library_unavailable` never enters either page-error state. It discards the
  page candidate and enters the existing whole-Library fail-closed hydration:
  Thread detail, New, mutation and Provider start remain unavailable, the
  surface shows `Couldn't open Thread Library`, and Retry uses
  `retryOpen({ scope: 'library' })` rather than replaying `listPage`.
  `thread_unavailable` remains the existing safe row/detail state when identity,
  location and order metadata are independently valid;
- an explicit successful load appends the next bounded page. The final explicit
  load removes the control. There is no automatic infinite load, virtual list
  or around-page request;
- the Renderer displays every loaded Available summary exactly once. A safely
  projected positive `pinPosition` places a row in Pinned; `null` places it in
  Recent. Each group preserves the Worker-returned combined canonical order,
  Pinned never repeats in Recent, and an empty group has no synthetic row;
- a selected canonical Thread outside the loaded prefix remains a separate
  `Current thread` row and retains Main detail. It is never inserted into,
  sorted with or counted in the canonical prefix. Once its canonical row loads,
  the separate row disappears without changing selection;
- Thread rows and `Load more threads` remain ordinary buttons. Selected state
  uses `aria-current`; full titles and existing safe status remain available.
  CP1 adds no custom roving Tab state, Arrow/Home/End navigation, automatic
  focus movement or live announcement state; and
- if a valid selected Thread is missing from the loaded prefix and initial
  settle or an explicit page reaches `nextCursor=null`, the existing exact
  `get(threadId)` revalidates once: an invalid target uses the existing
  deterministic fallback; a still-valid missing target performs one replacement
  full hydration. A second miss exposes the bounded load error and Retry instead
  of dropping selection, inventing a row or looping.

CP1 freezes these contract and state boundaries:

- SQLite remains the only durable order source. `pin_position` and the existing
  Available keyset order do not change. CP1 adds no table, index, migration,
  mutation command or second database owner;
- the public summary projection adds only `pinPosition: number | null` to the
  safe Available and Thread-unavailable list variants. Worker protocol parsing
  must preserve a safely parsed Pin group for an unavailable row. If id,
  location or Pin grouping cannot be validated, the operation fails closed as
  Library unavailable instead of guessing a group or order;
- the Worker opaque `nextCursor` remains an opaque keyset token. Renderer never
  decodes it. The Main-exposed `includedThroughCursor` remains a public event
  boundary. Renderer may initialize its local `publicEventCursor` only from a
  complete first-page/detail hydration and may advance it only with accepted
  Main events. A page candidate boundary cannot initialize, advance, consume or
  overwrite that cursor;
- follow-up pages and list-only rebuilds ignore the page response's capacity.
  Run capacity is initialized only by full hydration and then changed only by
  accepted `chat:capacity` events, preserving E1S-R1 ownership;
- Renderer owns only `loadedPageCount`, opaque page tokens, one atomic candidate
  prefix and loading/error state. A candidate rebuild reads no more than
  the current page budget. A stale Worker cursor discards the whole candidate
  and permits one fresh bounded rebuild for that action; a second conflict
  exposes the relevant Retry state. Epoch mismatch or a relevant event during
  the rebuild discards the candidate and uses one in-flight plus one dirty
  coalescing marker, never a tight retry loop. Committed rows are not partially
  appended or locally reordered; and
- a public event cursor gap or epoch replacement still triggers full hydration.
  A page-only conflict rebuilds only the bounded local candidate and never
  fabricates, skips or consumes a Main event.

The CP1 product step may change exactly:

- `apps/desktop/shared/threads/types.ts`;
- `apps/desktop/electron/main/thread-library/protocol.ts`;
- `apps/desktop/electron/main/thread-library/worker.ts`;
- `apps/desktop/electron/main/thread-library/worker.test.ts`;
- `apps/desktop/electron/main/thread-library/service.ts`;
- `apps/desktop/electron/main/thread-library/service.test.ts`;
- new `apps/desktop/src/ui/chat/thread-collection.ts`;
- new `apps/desktop/src/ui/chat/thread-collection.test.ts`;
- `apps/desktop/src/ui/chat/chat-reducer.ts`;
- `apps/desktop/src/ui/chat/chat-reducer.test.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.test.ts`;
- `apps/desktop/src/ui/chat/components/ChatSidebar.tsx`;
- new `apps/desktop/src/ui/chat/components/ChatSidebar.test.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts`;
- `docs/next/multi-thread-library-runthrough.md` for final evidence only; and
- this status owner for the final reviewed completion record only.

No other file is allowed. New Renderer files are owned by the existing chat
feature because they are a rebuildable sidebar projection and its near-source
tests; they are not shared contracts or a global state layer. CP1 adds no new
IPC channel or preload/Main handler, Pin write method, raw-SQL RPC, synchronous
Main SQLite fallback, cache/store, Runtime/Provider/Responses/attachment
change, OCaml Thread reducer, Search, Rename, Archive, Trash, Restore,
Permanent delete, Projects, Folders, Tags, drag ordering or visual redesign.

Required focused evidence:

- 137 Available Threads load as 50, 50 and 37 rows; exact page boundaries,
  duplicate ids, stale cursors and late page replies cannot create duplicates,
  omissions, mixed candidates or a row count beyond the explicit page budget;
- at least 50 Pinned plus 100 Recent rows preserve the Worker order and group
  boundary across pages, including Thread-unavailable safe summaries, with no
  Pinned duplicate in Recent;
- Worker exit, database/open/validation failure and unsafe Pin grouping return
  the existing Library-unavailable surface and `retryOpen` path; they never
  preserve an editable detail as `Couldn't load more`. Thread-unavailable rows
  remain isolated, while bounded local candidate conflicts use only the page
  error and Retry states;
- full hydration, later explicit pages, list-only refresh, capacity events,
  relevant Thread events, cursor gaps and epoch replacement prove that page
  candidates never advance `publicEventCursor` or overwrite Run capacity;
- selected Threads on the second and third pages cover Current-thread fallback,
  target appearance, target invalidation, load failure/Retry, end-of-list exact
  revalidation, one replacement hydration and bounded final failure without
  automatic looping; and
- initial/loading-more/error/retry UI, final Load-more removal, initial
  `nextCursor=null` revalidation and Current-thread de-duplication have
  component/hook coverage.

Final evidence ran:

```text
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run desktop:test
mise run desktop:build
mise run runtime:chat-state:check
mise run docs:check
mise run format-check
git diff --check
```

CP1 stops and returns to planning if implementation needs another file; a new
IPC/preload method, schema/index or Pin mutation; Renderer-owned durable or
full-library state; an around-page API, virtual list or automatic unbounded
load; page-derived event/capacity ownership; unsafe unavailable-row grouping;
or cannot preserve selection and pagination consistency within the bounded
candidate model. A Stop unlocks neither PIN1 nor any historical slice.

## multi-thread-library/PIN1-scope-lock: Bounded Pin lifecycle

Contract id: `NYX-MTL-PIN1-SCOPE-20260820-01`.

Independent review binding:
`NYX-MTL-PIN1-SCOPE-REVIEW-20260821-01`.

Status: complete at product head `4b77390`. Independent scope review
`NYX-MTL-PIN1-SCOPE-REVIEW-20260821-01` accepted the exact candidate, and the
Plan-First scope-lock commit entered HEAD at `ddfc0cd`. The canonical
transaction landed at `a83dfc3`, ordinary controls at `f08bf6a`, and the final
bounded pagination-recovery repair at `4b77390`. Independent final review
`NYX-MTL-PIN1-FINAL-REVIEW-20260822-02` accepted the exact 21-file product diff
with no findings.

PIN1 is a fresh bounded mutation slice over completed CP1. Its scope-lock
baseline is `113b139f60695b80e6dcc96512c5c097e41ed4dd`, which contains CP1
product head `0247c69`, accepted final review
`NYX-MTL-CP1-FINAL-REVIEW-20260821-01` and the complete CP1 evidence record.
The eventual PIN1 scope-lock commit must have that baseline in its ancestry;
otherwise PIN1 stops for a fresh scope review. PIN1 reuses the existing SQLite
`pin_position`, Worker ownership, typed bridge, Main events and Renderer
collection projection. It adds no schema or second state owner and does not
revive U1, L1 or any lifecycle work outside Pin.

PIN1 freezes exactly six semantic actions:

- `pin` requires canonical `pin_position=null` and inserts the target at
  position 1. Existing Pinned rows retain their relative order and shift down;
- `unpin` requires a positive canonical Pin position, removes the target from
  Pinned and closes the remaining positions. The target returns to Recent at
  its existing canonical activity order;
- `move_up` and `move_down` move a Pinned target by one position;
- `move_top` and `move_bottom` move a Pinned target to the first or last Pin
  position; and
- an action already at its boundary is a successful no-op. Every successful
  mutation leaves Pinned positions unique and continuous from 1 through the
  current Pinned count. Pin state survives Worker and application restart.

All six successful actions preserve the selected Thread and its detail. Pin
movement does not change `last_user_activity_at`, Recent tie-break fields,
title, Draft, Turn, resource, result or seen-result state. It also does not
increment `thread_revision` or change `created_at`/`updated_at`; the transaction
writes only the affected `pin_position` values. An unavailable summary has no
Pin controls. A mutation target must still be an Available Thread that can
produce a safe canonical detail; otherwise the action fails without a write.

The existing empty-shell cleanup is the only already-landed non-PIN1 operation
that can delete an Available Pinned row. PIN1 extends that same
`discardEmptyShell` Worker transaction, without a new public action: deleting a
Pinned shell also closes every following Pin position through the same checked
collision-free rewrite before commit. The existing removal acknowledgement and
collection refresh remain authoritative. Surviving rows keep their activity,
revision and timestamp fields, and an unknown discard outcome keeps its existing
no-replay replacement-generation reconciliation.

PIN1 freezes this public contract:

- shared types add `NyxThreadPinAction`, `NyxThreadUpdatePinInput` and
  `NyxThreadUpdatePinResult`. The input contains only `threadId`, one of the six
  actions and `expectedPinPosition: number | null`. The result contains the
  canonical target detail plus the existing public Thread clock;
- the only new public method is `threads.updatePin(input)`, carried by the one
  typed IPC channel `nyx:threads:update-pin` through shared, preload and Main.
  It exposes neither SQL, a caller-chosen absolute destination, the full Pinned
  order nor Worker/database diagnostics;
- `expectedPinPosition` is an exact compare-and-set guard. `pin` accepts only
  `null`; the other actions accept only a positive safe integer equal to the
  target's current canonical value. A stale value returns the existing public
  `conflict` error and performs no write. Invalid shape, missing target,
  unavailable target or Library failure use only the existing safe public error
  set; and
- the Worker protocol adds only the semantic `updatePin` mutation and one
  Worker-only `pinState` reconciliation read. `pinState` makes one Worker-local
  pass that validates the complete continuous order, but returns only the fixed
  size `pinnedCount`, target `pinPosition` and exact target `readThread` detail
  from one read transaction. Ordered Pin ids never cross into Main, preload or
  Renderer;
- the fixed-size pre-state plus the action determines the only valid target
  position and Pinned count after commit. The single Worker owner, atomic
  reorder and collection-wide Renderer action gate below exclude a second Pin
  mutation from changing an unseen neighbor while that proof is live. No
  persisted operation id, schema revision or probabilistic order hash is added.

The Worker owns one atomic Pin transaction:

- `BEGIN IMMEDIATE` reads the target and current ordered Pinned set, validates
  Available identity, safe detail, exact guard, positive safe integer positions
  and a unique continuous `1..N` pre-state before computing the semantic result;
- the transaction derives the final ordered ids from the action. A changed
  order first moves affected rows into a checked collision-free positive
  temporary range above the current maximum, then writes final continuous
  positions, so the existing partial unique index is never transiently
  violated. The temporary range and final positions must remain safe integers;
- a boundary no-op reports `actualMutation=false`, advances no Worker mutation
  cursor and publishes no changed event. A real change reports one logical
  mutation even when several rows shift; and
- every validation, statement or commit failure rolls back the entire reorder.
  Invalid or non-continuous stored Pin metadata fails closed as Library
  unavailable; PIN1 never repairs, guesses or partially normalizes it; and
- `discardEmptyShell` applies the same pre-state validation and two-phase
  collision-free rewrite when its target has a Pin position. The delete and
  position closure are one logical mutation and roll back together.

The Main client serializes each PIN1 mutation together with its reconciliation
barrier. The existing `discardEmptyShell` operation joins the same barrier
because it can now change Pin order; no Pin preflight/mutation/reconciliation
may interleave with that delete. Before sending the mutation Main captures the
Worker-only `pinState` pre-state as fixed-size target position/count/detail; the
preflight first applies the same action shape and exact `expectedPinPosition`
guard as the mutation. A mismatch returns public `conflict` without sending the
write. The Worker transaction still repeats every guard and full-order invariant
check. A known committed mutation follows the existing acknowledgement path:
Main publishes the target's canonical `threads:changed` event, and the Renderer
rebuilds its bounded collection from `listPage` rather than locally moving rows.

Renderer holds one collection-wide PIN1 action gate from command dispatch until
one authoritative bounded collection rebuild for that action commits. Every Pin
control is disabled while the gate is held, so a second action cannot use an old
neighbor after the first canonical reorder. A successful response requests or
joins exactly one coalesced bounded rebuild; the changed event for a real
mutation may satisfy the same rebuild, while a boundary no-op performs the one
explicit read without inventing an event or cursor. Only the committed rebuild
clears the gate and earlier row error. This gate is Renderer-local transient
state, not another order owner, and it does not block unrelated chat activity.

If transport or commit acknowledgement makes the outcome unknown, Main must not
replay the mutation. It invalidates the failed generation, opens one replacement
generation and performs one atomic Worker-only `pinState` read containing the
same-generation target position/count/detail. Main computes the exact expected
target position and Pinned count from the captured pre-state and semantic action:

- an independently validated continuous state with the exact expected target
  position and count returns canonical success;
- the exact pre-state returns the public target-level `conflict` error, except
  that an intended boundary no-op is canonical success only when the captured
  pre-state position exactly matched the caller's `expectedPinPosition` and the
  semantic action computed identical pre/post position and count; and
- any missing, unsafe, non-continuous or third state remains outcome unknown and
  returns Library unavailable.

The replacement epoch triggers one complete Renderer hydration for all three
results. Main does not fabricate an event in the failed epoch, emit a partial
shift set or convert uncertainty into another write. A second replacement/read
failure remains failed and bounded. The originating Renderer action records its
local projection generation. If the replacement epoch arrives before the action
response, that response cannot write a row error into the newer generation; if
the response arrives first, the later epoch hydration replaces it. Tests must
cover both orders, and the PIN1 gate clears only after the replacement hydration
commits or the whole-Library failure state takes ownership.

PIN1 UI is deliberately ordinary:

- an Available Recent row has a plain Pin button. An Available Pinned row has
  plain Unpin, Move up, Move down, Move to top and Move to bottom buttons. Each
  sends only the row's semantic action, `threadId` and current projected
  `pinPosition`; boundary controls may be disabled when the boundary is known,
  while the Worker no-op remains authoritative. All Pin controls share the
  transient collection-wide action gate above;
- Renderer performs no optimistic Pin, Unpin, reorder or durable write. A known
  real mutation uses the Main changed event and coalesced bounded collection
  refresh; replacement reconciliation uses the epoch hydration. A boundary
  no-op uses one explicit bounded refresh without a changed event. Target-level
  `invalid_request`, `conflict`, `not_found` or `thread_unavailable` failures
  perform no local reorder, preserve the current projection while exposing the
  safe error next to the originating row actions, and keep the loaded-page
  budget. Conflict, missing-target and target-unavailable failures also request
  the existing bounded collection rebuild and CP1 exact selected-target
  revalidation so stale state is replaced atomically. The collection-wide gate
  remains held until that recovery commits; `invalid_request` may release it
  immediately because no canonical read is stale; and
- `library_unavailable` is never a row-local PIN1 error. Unsafe or
  non-continuous Pin metadata, an unknown third state, replacement/read failure
  or any other Library failure discards the page candidate and enters the
  accepted CP1 whole-Library fail-closed hydration. Thread detail, New, all
  mutation and Provider start remain unavailable, and Retry uses
  `retryOpen({ scope: 'library' })`; and
- if a selected row moves outside the loaded prefix, the accepted CP1 `Current
thread` fallback keeps it visible until canonical pagination contains it
  again. PIN1 adds no custom keyboard navigation, roving Tab state, context
  menu, automatic focus movement, focus restoration, live announcement,
  VoiceOver evidence, drag-and-drop, batch operation or visual redesign.

The PIN1 canonical transaction step may change exactly:

- `apps/desktop/shared/threads/types.ts`;
- `apps/desktop/shared/threads/ipc.ts`;
- `apps/desktop/shared/contracts/desktop.ts`;
- `apps/desktop/electron/preload/index.ts`;
- `apps/desktop/electron/preload/index.test.ts`;
- `apps/desktop/electron/main/index.ts`;
- `apps/desktop/electron/main/index.test.ts`;
- `apps/desktop/electron/main/thread-library/protocol.ts`;
- `apps/desktop/electron/main/thread-library/client.ts`;
- `apps/desktop/electron/main/thread-library/client.test.ts`;
- `apps/desktop/electron/main/thread-library/worker.ts`;
- `apps/desktop/electron/main/thread-library/worker.test.ts`;
- `apps/desktop/electron/main/thread-library/service.ts`; and
- `apps/desktop/electron/main/thread-library/service.test.ts`.

The later PIN1 controls step may change exactly:

- `apps/desktop/src/ui/chat/thread-collection.ts`;
- `apps/desktop/src/ui/chat/thread-collection.test.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.test.ts`;
- `apps/desktop/src/ui/chat/components/ChatSidebar.tsx`;
- `apps/desktop/src/ui/chat/components/ChatSidebar.test.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx`; and
- `apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts`.

The two product steps are ordered: canonical transaction first, ordinary
controls second. Each step may also update only this status owner and
[multi-thread-library-runthrough.md](./multi-thread-library-runthrough.md) for
its final reviewed evidence; evidence-only edits do not grant additional code
scope. No other file is allowed.

Required focused evidence:

- Worker tests cover all six actions, new-Pin-at-top, relative-order stability,
  boundary no-ops, stale guards, duplicate/gapped/unsafe pre-state rejection,
  collision-free reorder, full rollback and restart persistence. They also Pin
  an eligible empty shell between other Pinned rows, discard it through the
  existing operation, prove continuous survivors/restart state and inject a
  rollback failure across delete plus position closure;
- client/service tests cover known acknowledgement, fixed-size pre-state
  capture with no ordered-id transfer, one-pass continuity validation,
  process-wide Pin serialization including non-interleaving empty-shell delete,
  commit-unknown and transport-unknown exact reconciliation,
  definitely-not-committed, third-state failure, replacement failure and proof
  that no unknown mutation is replayed. They also prove stale-to-boundary
  preflight returns `conflict` without sending a mutation, while a guard-matched
  boundary no-op with a lost reply reconciles to canonical success;
- shared/preload/Main tests prove the single exact method/channel, strict input,
  safe error mapping, canonical result clock and absence of raw order/SQL; and
- Renderer tests cover ordinary action controls, known boundaries, no optimistic
  reorder, collection-wide disabling from dispatch through committed canonical
  refresh, rapid adjacent actions against a stale row, changed-event refresh,
  boundary no-op explicit refresh, replacement hydration in both event/response
  orders, target-level failure preservation and rebuild, safe row error,
  Library-unavailable fail-closed routing and selected off-prefix Current-thread
  fallback.

Final PIN1 evidence must run:

```text
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run desktop:test
mise run desktop:build
mise run runtime:chat-state:check
mise run docs:check
mise run format-check
git diff --check
```

PIN1 stops and returns to planning if implementation needs a schema/index or
file outside the inventories above; another public method; raw SQL, arbitrary
position or full-order IPC; a synchronous Main SQLite fallback; a second
database or durable Renderer owner; replay of an unknown mutation; unbounded or
non-atomic reconciliation retry, full ordered-id transfer across the Worker
boundary or more than one replacement read; optimistic persistence; custom
keyboard/focus/live announcement behavior; Search, Rename, Archive, Trash,
Restore, delete beyond the already-landed empty-shell invariant closure, or any
other lifecycle action; Runtime/Provider/Responses/attachment change; or cannot
prove exact continuous order and full collection refresh within the existing
Worker/Main/Renderer boundaries. One finite Worker-local continuity scan per
preflight, transaction or replacement read is permitted; it does not authorize
paging/retry loops or a Main-owned order copy. A Stop revives no historical
slice.

## multi-thread-library/E1S-R1-scope-lock: Minimal correctness repair

Contract id: `NYX-MTL-E1S-R1-SCOPE-20260819-01`.

This is a bounded repair of landed E1S behavior. It is not a continuation or
revival of E1, E1R, NF1, COMPAT, v40, R2 or any retired candidate. Those
materials remain historical evidence only. If the exact bytes of this section
receive independent scope review and this docs-only change enters HEAD, the
user's explicit implementation request authorizes only the product work below.

Status: complete at `6566b93`. The scope lock entered HEAD at `b00bc27`; the
final product artifact and required evidence passed independent re-review.
This subsection remains the governing repair contract and no longer authorizes
another E1S-R1 edit.

E1S-R1 preserves the existing Main-owned concurrency model and removes three
Renderer correctness defects:

- `ChatSessionManager.activeSessions` remains the only Run and capacity owner.
  Main publishes a process-wide `chat:capacity` projection on the existing chat
  event channel when a Run occupies a slot, classification occupies the
  attachment slot, or exact cleanup releases capacity. The event contains the
  existing event clock plus only `activeRuns` and `attachmentRunActive`; it does
  not carry or invent Thread or request identity and is never published for a
  delta;
- `ThreadLibraryService` may cache only the last published capacity projection
  for hydration. A first-page response captures capacity at its event boundary.
  Renderer initializes capacity from full hydration and then changes it only
  from `chat:capacity`; a list-only refresh may replace rows but never capacity;
- an unchanged Draft save is a no-op. It returns the current Thread id and Draft
  revision without another Worker mutation. A Send save and immediately queued
  Select/New therefore share the existing FIFO: the later navigation observes
  the acknowledged clean Draft and does not advance its revision again. A dirty
  Draft still must save successfully before leaving, and an eligible empty shell
  still reaches the existing discard path;
- Renderer never inserts, sorts, trims or locally updates the canonical bounded
  Available page. Relevant Thread changes and accepted/terminal chat lifecycle
  events coalesce into a list-only first-page refresh. Each refresh captures the
  current hydration generation and event epoch and may replace rows only when
  both still match, hydration is complete and no relevant event arrived while
  the request was in flight. `chat:start` and `chat:delta` never refresh the
  page;
- a selected Thread outside the first page appears as a separate `Current
thread` row. It is not inserted into the canonical page and does not
  participate in capacity calculation; and
- New-message UI classification includes canonical history plus the current
  Draft attachments. Retry UI classification includes canonical Turn history
  only and excludes unrelated current Draft attachments. Main remains the final
  classifier and rejects conflicts before Draft-to-Turn mutation.

The E1S-R1 product step may change exactly:

- `apps/desktop/shared/chat/events.ts`;
- `apps/desktop/shared/threads/types.ts`;
- `apps/desktop/electron/main/chat/session.ts`;
- `apps/desktop/electron/main/chat/session.test.ts`;
- `apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts`;
- `apps/desktop/electron/main/thread-library/service.ts`;
- `apps/desktop/electron/main/thread-library/service.test.ts`;
- `apps/desktop/electron/main/index.test.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.test.ts`;
- `apps/desktop/src/ui/chat/components/ChatSidebar.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts`;
- `docs/next/multi-thread-library-runthrough.md` for final evidence only; and
- this status owner for the final reviewed completion record only.

No other file is allowed. In particular E1S-R1 does not add another IPC
namespace, preflight RPC, Renderer pending-Run or activity Map, cursor ledger,
queue, daemon, durable Run, SQLite or Worker protocol change, pagination UI,
full-detail cache, Provider transport change, redirect/backpressure change,
attachment upload/file id, Base64 rewrite or OCaml protocol/domain change.

Required focused evidence:

- zero, one and two active Runs publish exact capacity; classifying occupies a
  process-wide slot; attachment classification occupies the attachment slot;
  rejection, Stop, completion, failure and storage failure release only the
  matching Run through exact cleanup;
- full hydration receives a capacity snapshot aligned with its event boundary,
  and a buffered later `chat:capacity` event wins over that initial snapshot;
- a list-only response that returns after navigation, newer full hydration or
  epoch replacement cannot apply; a capacity event received during list refresh
  cannot be overwritten by that response;
- delaying the first Draft save and immediately selecting another Thread or New
  performs one Draft mutation, starts the original Run with the acknowledged
  revision, navigates successfully and leaves that Run active in background;
- autosaved Send performs no redundant Draft write; a truly dirty Draft, save
  failure and empty-shell discard retain their existing behavior;
- first-page reorder and removal replacement preserve Main order and the 50-row
  bound; selected off-page remains visibly current; background deltas perform
  zero `listPage` calls; settlement failure remains reachable; and
- Retry with an unrelated current Draft attachment follows canonical history
  classification and matches Main enforcement.

Before final evidence, run:

```text
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run desktop:test
mise run desktop:build
mise run runtime:chat-state:check
git diff --check
```

E1S-R1 stops and returns to this scope lock if implementation needs another
file, introduces another Run or capacity owner, needs a preflight RPC or local
activity ledger, blocks navigation until `chat:accepted`, applies capacity from
a list-only refresh, permits a stale page to cross hydration generation or
epoch, refreshes per delta, changes transport/schema/protocol behavior, or
cannot preserve exact Main rejection before Draft-to-Turn mutation.

## Migrated Source Block: multi-thread-library/contracts-core

<!-- nyx-contract-start: multi-thread-library/contracts-core sha256:187a1dce9391ff956ed3ec5be7b383d9bf0bb7b725a89b31d85588da237002cf -->

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
that implementation attempt. The E1R amendment completed at `24e6c07` after
review `NYX-MTL-E1R-S0-FINAL-20260814-03`. E1R/G0 then reached independently
reviewed `VALID_STOP`. The user approved the complete
`NYX-E1R-NF1-DECISION-A-v1` packet on 2026-08-16. The original docs-only NF1
amendment completed at `67bfb8e` after review
`NYX-MTL-E1R-NF1-SCOPE-20260816-02`. Its one uncounted pre-Start seam
shakedown is superseded after exposing the malformed Responses fixture and
cannot enter new evidence. The first T1R fixture source candidate was rejected
before landing under `NYX-MTL-E1R-NF1-FIXTURE-20260816-01`; its planned
`NYX-MTL-E1R-NF1-FIXTURE-20260816-02` review never ran because plan v25 failed
full review. A later repair source candidate was rejected under
`NYX-MTL-E1R-NF1-REPAIR-20260817-01`; prospective REPAIR reviews `-02` through
`-05` never ran because plans v28 through v31 failed review. The 5787-line
source candidate at SHA-256
`12fdf2f0ae788a6ded713879fa2ac535bfc5134466e1b3d450d0f924e9629025` was
rejected under `NYX-MTL-E1R-NF1-REPAIR-20260817-06`. Prospective REPAIR `-07`,
`-08`, and `-09` never ran because plans v33, v34, and v35 respectively failed
convergence, full review, and convergence. The T1R fixture/correlation/pre-hop-
owner/ratchet repair completed at `197aaced` after independent review
`NYX-MTL-E1R-NF1-REPAIR-20260817-10`. The exact first post-T1R pre-run raw
artifact at SHA-256
`6fdaaf94b5f317cef4ad5a29ce3a2fef58bfa9addbdc6f2529455bd9b092ff40`
is frozen as `INVALID + NOT_EVALUATED`: a paused parser blocked the transparent
tap from observing a raw terminal, so it proves no product failure and none of
its temp derivation may be reused. Full `NF1-11`/`COMPAT-11` never started.
Plan v37 was rejected by `NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R24` F-001;
prospective source review `NYX-MTL-E1R-NF1-REPAIR-20260817-11` never ran, and
unstarted `NF1-12`/`COMPAT-12` are retired. The T1S terminal-observer/identity
ratchet was derived from plan v38 at SHA-256
`5f28a1f7ea9cf7368c156353e207f610eefea2da529000e05ca7981dd6783b98`,
scoped convergence
`NYX-E1R-NATIVE-FETCH-CONVERGENCE-36-R36-SCOPED-01`, and strict review
`NYX-E1R-NATIVE-FETCH-PLAN-FINAL-R25`. Its exact 6,097-line source bytes at
SHA-256 `ba4ec63d1fe11e01797eebab3f8a6547405912bd33aec59a2bbb0b9e921546e6`
passed `NYX-MTL-E1R-NF1-REPAIR-20260817-12` and entered HEAD at
`2de9d415066823a8fa335badb3ba9846ed1eb73a`. A focused S1 review then stopped
T2 before sealed Start because `chat:done` projected private prepared-turn
fields. Full `NF1-13`/`COMPAT-13` never started and are retired without a gate
result; every pre-Start derivative is excluded. The user-authorized narrow
repair completed at `d1a15356c1990b6fec831d4fc3ff98ab7695051b`, tree
`0e5967782cb36e636ae4f7916ad88993feea0a5a`, and passed review
`NYX-E1R-DONE-IPC-REPAIR-CODE-01`. The subsequent T1P documentation ratchet
entered HEAD at `1464fc3`. Before either prospective native-fetch gate ran, the
user explicitly retired both gates on 2026-08-18. Neither gate has a result,
and neither authorizes later work. No E1/E1R product slice or native-fetch gate
is executable. Reopening that direction requires a new explicit user request
and an independently reviewed scope contract.

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
├─ G1 [VALID_STOP] → v5.3 → G1W → D1 → D2 → C1 scope → v5.4 title amendment → C1 code → E1 scope → E1 cap-2 [VALID+FAIL → STOP] → E1R amendment → G0 [VALID+FAIL → STOP] → T1 NF1 direction amendment [completed] → T1R fixture/correlation/pre-hop-owner/ratchet repair [completed] → T1S terminal-observer/identity ratchet [completed] → T1P public-event/identity ratchet [completed] → native-fetch continuation [retired before execution]
└─ G2 [VALID_STOP] → v5.3 → G2R

G2R + M1 → P1
```

This graph preserves dependency history; it does not grant current execution
permission. The retired continuation unlocks no later slice. Every arrow into
a tracked product slice also requires
`multi-thread-library/<slice>-scope-lock`: a one-file update to this document
that freezes exact allowed files, checks, review binding, and status. The
product slice begins only after that independent scope review is in HEAD and an
explicit user request names it. G1/G2/G1W/G2R must leave the tracked worktree
clean.

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
docs/next/multi-thread-library-task-slices.md
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
docs/next/multi-thread-library-task-slices.md
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
docs/next/multi-thread-library-task-slices.md
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
docs/next/multi-thread-library-task-slices.md
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
docs/next/multi-thread-library-task-slices.md
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
docs/next/multi-thread-library-task-slices.md
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
docs/next/multi-thread-library-task-slices.md
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
docs/next/multi-thread-library-task-slices.md
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

<!-- nyx-contract-end: multi-thread-library/contracts-core -->

### multi-thread-library/E1S-scope-lock: Bounded multi-Thread Runs

Contract id: `NYX-MTL-E1S-SCOPE-20260818-01`.

This is a new solution to the original multi-Thread execution problem. It is
not a continuation of E1, E1R, NF1, COMPAT, v40, R2, or any temporary candidate.
Those materials are historical evidence only. If the exact bytes of this
subsection receive independent scope review and the docs-only commit enters
HEAD, the user's current explicit request authorizes E1S product work within
this subsection and nothing else.

E1S makes ordinary multi-Thread use work with a deliberately small resource
policy:

- switching Thread or starting New thread saves the current Draft, detaches the
  selected Renderer projection, and never cancels another Thread's accepted
  Run;
- a background Run continues receiving Provider output and settles its exact
  terminal result through the existing Thread Library transaction;
- Electron Main owns one `Map<threadId, ActiveRun>`, with at most one Run per
  Thread, at most two Runs process-wide, and at most one attachment-bearing Run;
- an attachment-bearing Run is any Run whose canonical Provider history or
  pending/retried Turn contains an image or document, because old attachments
  are materialized again as part of that history;
- classification and both capacity checks happen before Draft-to-pending
  mutation. A rejected request preserves the Draft and creates no Turn,
  Provider call, Runtime client, queue entry, or hidden retry;
- every classifying, preparing, or streaming request occupies one of the two
  process-wide slots. Once classification identifies an attachment-bearing
  request, it occupies the sole attachment slot until exact terminal handling
  finishes. Exact `finally` cleanup releases only the matching Run;
- Stop addresses exact `threadId + requestId`. Before Draft-to-pending mutation
  it preserves the Draft and creates no Turn; after acceptance it settles the
  exact Turn as Cancelled without changing another Run;
- the sidebar lists the existing bounded Available page, supports selecting a
  Thread, and shows `Running` or `Saving failed` for background work. Selecting
  a row rebuilds the projection from Main-owned canonical state; the Renderer
  never becomes the durable owner;
- the send button is disabled when two Runs are active, or when the selected
  Thread is attachment-bearing while another attachment-bearing Run is active.
  The UI explains the applicable limit, and Main enforces the same rules so
  quick clicks cannot bypass them;
- ordinary terminal completion/failure/cancellation remains automatically
  saved. The existing exact settlement Retry performs no second Provider or
  Runtime call. A background settlement failure remains reachable through its
  `Saving failed` Thread row and selected detail;
- the existing ordinary JSON `fetch`, automatic redirect behavior, Provider
  mapping, semantic stream normalization, attachment limits, Base64 image
  materialization, SQLite schema, single Worker, and OCaml protocol remain
  unchanged.

This scope accepts the current single attachment-Run performance as the product
baseline. It removes the rejected old absolute Main/RSS gates. Its performance
claim is only structural: no more than one attachment-bearing Run can
materialize Provider history at a time, text concurrency is capped at two, and
background deltas do not trigger full Library hydration. Existing responsiveness
checks must remain green; E1S does not claim that Base64 is cheap or eliminate
future Provider file-upload work.

The E1S product step may change exactly:

- `apps/desktop/shared/chat/events.ts`;
- `apps/desktop/shared/threads/types.ts`;
- `apps/desktop/electron/main/chat/session.ts`;
- `apps/desktop/electron/main/chat/session.test.ts`;
- `apps/desktop/electron/main/chat/session-runtime-chat-state.integration.test.ts`;
- `apps/desktop/electron/main/thread-library/coordinator.ts`;
- `apps/desktop/electron/main/thread-library/coordinator.test.ts`;
- `apps/desktop/electron/main/thread-library/service.ts`;
- `apps/desktop/electron/main/thread-library/service.test.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.ts`;
- `apps/desktop/src/ui/chat/use-chat-session.test.ts`;
- `apps/desktop/src/ui/chat/components/ChatSidebar.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx`;
- `apps/desktop/src/ui/chat/components/ChatWorkspace.test.ts`;
- `docs/next/multi-thread-library-runthrough.md` for final evidence only; and
- this status owner for the final reviewed completion record only.

No other file is allowed. In particular E1S does not add request-body streaming,
manual redirect handling, custom backpressure, native fetch bindings, Provider
uploads/file ids, a queue, daemon, durable Run/journal, new SQLite table or
column, another Worker/connection, synchronous Main fallback, a general Asset
service, process-quit redesign, Archive/Trash/Pin/Search, pagination UI, or an
OCaml Thread/Run domain.

Required focused evidence:

- two text Runs stream and settle concurrently; a third request is rejected
  before Draft mutation and can be sent after one slot releases;
- one attachment-bearing Run and one text Run may overlap; a second
  attachment-bearing request is rejected before Draft mutation with its Draft
  unchanged, and no test observes two concurrent attachment materializations;
- stopping, completing, failing, or encountering storage failure in one Thread
  does not cancel, overwrite, or mis-settle the other Thread;
- New/select while A runs leaves A running, saves the departing Draft, allows B
  to run when capacity permits, keeps A's row current without per-delta full
  hydration, and reconstructs A correctly when selected again;
- the disabled send states and their explanations match Main enforcement;
- a background settlement failure is visible, selectable, and Retry saving
  settles the retained result without a second Provider or Runtime call; and
- existing single-Run, image, document, Responses, Runtime replay, Thread
  recovery, and compatibility tests remain green.

Before the product commit, run:

```text
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run desktop:test
mise run desktop:build
mise run runtime:chat-state:check
git diff --check
```

E1S stops and returns to this scope lock if implementation needs another file,
cannot reject capacity before Draft mutation, cannot keep a single exact Main
Run owner, makes background navigation cancel a Run, loses reachability of a
settlement failure, changes transport/redirect/backpressure behavior, requires
schema/protocol expansion, or makes one attachment-bearing Provider history
materialization overlap another.

## Migrated Source Block: multi-thread-library/contracts-global-stop

<!-- nyx-contract-start: multi-thread-library/contracts-global-stop sha256:d135adc768a394e752dbd22a36f9945984ae10a80e2988978bc7f9b9d78b0776 -->

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

<!-- nyx-contract-end: multi-thread-library/contracts-global-stop -->
