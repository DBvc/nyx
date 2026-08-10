# Document Attachments: Local Baseline + Native PDF Plan

Status: draft v2.4 after scoped repair `RC-DOC-HYBRID-REV-04`. The earlier
inline Chat Completions `file_data` candidate ended in `VALID_STOP` and passed
`RC-DOC-G0-EVIDENCE-02`. No document-attachment product slice is executable
until this plan passes strict review and the docs-only scope gate below is
merged.

## Conclusion

Build the useful path first:

1. Existing OpenAI-compatible Chat Completions targets receive bounded,
   locally extracted document text in the user message.
2. Electron main durably owns both the original document and the exact text
   projection accepted for that turn, so restart, later turns, target changes,
   and Retry do not parse the file again.
3. A Provider-native PDF path is a later independent vertical slice. It is
   added only for one explicitly configured and live-tested protocol; it is
   never inferred from a hostname or model name.

The first product slice supports `.txt`, `.md`, `.csv`, text-bearing `.pdf`,
and `.docx` only if the bounded extractor gate passes. It does not add OCR,
page-image fallback, RAG, remote file ids, capability matrices, or automatic
Provider fallback.

## Why The Previous Direction Stopped

The G0 probe sent the planned inline Chat Completions `file_data` shape to the
two configured targets. `deepseek-v4-flash` and `k3-256k` both rejected the PDF
and UTF-8 text fixtures before streaming. All four failures were safely
classified as `content_rejected`.

That evidence rejects only inline files on those compatible gateways. It does
not reject local extraction or Provider-native PDF endpoints. The new plan
therefore never retries that wire shape on the current protocol.

## Evidence Boundary

Confirmed repository facts:

- Chat currently has one Provider protocol:
  `openai-chat-completions`.
- Electron main owns target resolution, Provider requests, durable current
  thread state, attachment file IO, Retry, reconciliation, and safe errors.
- The existing image flow already has a production Renderer Worker, retains a
  failed draft for Retry, transfers prepared bytes to main, writes files before
  the pending turn, and clears the draft only after `chat:accepted`.
- Current-thread record v3 is image-aware; every image owner has explicit
  version checks that a v4 change must update.
- The desktop package has no direct PDF, DOCX, or ZIP parsing dependency.
- Connections persistence is v1 and both the resolver and connection test are
  fixed to Chat Completions.

Confirmed external facts:

- PDF.js accepts in-memory PDF data and exposes document/page APIs suitable for
  text extraction.
- Mammoth exposes browser `extractRawText({ arrayBuffer })`, warns that
  pathological documents can consume high CPU or memory, and recommends
  isolation with a timeout for untrusted input.
- fflate exposes streaming ZIP decompression whose output can be counted and
  terminated, instead of trusting only archive-declared sizes.
- OpenAI Responses, Anthropic, and Gemini have Provider-specific native PDF
  inputs; their non-PDF behavior is not a universal attachment protocol.

Unknown until the extractor gate:

- whether the selected PDF.js, Mammoth, and fflate builds meet Nyx's parser
  correctness and resource bounds;
- whether streaming DOCX preflight can reject actual expansion before Mammoth
  receives dangerous input;
- the measured latency of the conservative first-slice limits.

Not run by this planning pass:

- no dependency was installed;
- no product code, build, parser, Provider, or package smoke was run;
- no native Provider target is currently available for acceptance.

## User Experience

1. The existing attach button and drag/drop accept images and supported
   documents. Clipboard paste remains image-only.
2. A document draft card shows name, type, size, preparation state, failure,
   Retry, and remove.
3. Send is enabled only when every draft is ready. Text, images, and one
   document may be combined in one turn.
4. The draft remains intact until main has durably accepted the turn. A
   preparation or pre-accept failure never clears it.
5. Sent and hydrated user messages show a compact document card. This slice
   does not preview or open the document.
6. A PDF with no extractable text, an encrypted PDF, an over-limit document,
   or an unsafe DOCX fails in the draft with a direct local explanation. The
   user is not charged for a Provider request.
7. Provider rejection after durable acceptance keeps the document available
   for target change and Retry.

## Candidate First-Slice Limits

These are independent limits because raw storage and prompt size are different
risks. G1 may freeze or lower them; raising one requires a new user decision.

```text
documents per turn:                    1
documents in the current thread:       8
source bytes per document:             8 MiB
extracted UTF-8 bytes per document:    128 KiB
extracted UTF-8 bytes/current thread:  256 KiB
PDF pages:                              50
DOCX ZIP entries:                       256
DOCX declared uncompressed bytes:       32 MiB
extraction wall-clock timeout:          10 seconds
```

Canonical image bytes plus document source bytes retain one shared 32 MiB
current-thread attachment budget. `CurrentThreadSessionCoordinator.prepare` is
the only cross-store budget owner: while the existing single active-session
rule holds, it counts both stores before either one writes. This adds the
combined check; it removes no image invariant. `CurrentThreadImageFiles` keeps
its existing per-turn canonical-byte, thread image-count, thread pixel,
canonical-byte, preview-byte, format, and per-item checks. The document owner
keeps its document-specific limits. Document text has the separate 256 KiB
thread budget above. Limits are enforced before accepting a new turn; text is
never silently truncated.

Accepted media types:

| Extension | Media type                                                                | First representation          |
| --------- | ------------------------------------------------------------------------- | ----------------------------- |
| `.txt`    | `text/plain`                                                              | strict UTF-8                  |
| `.md`     | `text/markdown`                                                           | strict UTF-8                  |
| `.csv`    | `text/csv`                                                                | strict UTF-8, no table parser |
| `.pdf`    | `application/pdf`                                                         | page-separated extracted text |
| `.docx`   | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | raw text if G1 passes         |

Audio, video, legacy `.doc`, spreadsheets, presentations, archives, folders,
and arbitrary MIME types remain unsupported.

## Ownership And Data Model

### Renderer draft and extraction

- A document-specific Renderer Worker prepares one document at a time. It does
  not share the image Worker and does not create a generic asset pipeline.
- The source `File` is retained while preparing or after failure. The Worker
  receives that immutable Blob and returns one UTF-8 text buffer plus a digest
  of the source it read. After success, Renderer reads the still-live File once
  for persistence; main requires its own source digest to match the Worker
  result. The plan does not depend on PDF.js returning an undetached input
  buffer.
- A ready draft owns only source bytes, extracted text bytes, and safe
  metadata. It owns no parsed PDF object, DOM, canvas, Provider route, or local
  path.
- A 10-second controller timeout terminates the Worker. Remove, successful New
  thread, and component disposal also terminate outstanding work and release
  references.
- TXT/MD/CSV use `TextDecoder('utf-8', { fatal: true })`. PDF uses page text
  only. DOCX uses raw-text extraction; no HTML from Mammoth is rendered or
  persisted.

Extracted text is user-supplied message content, not trusted metadata. A
compromised Renderer can already alter user text; main still validates every
byte, id, name, format, capacity, and durable transition before it affects the
thread.

### Shared request contract

Add document-specific types, not a future-shaped asset union:

```ts
type NyxChatDocumentMediaType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/plain'
  | 'text/markdown'
  | 'text/csv'

interface NyxChatDocumentRef {
  documentId: string
  name: string
  mediaType: NyxChatDocumentMediaType
  byteLength: number
  extractedByteLength: number
}

interface NyxChatNewDocument {
  documentId: string
  sourceBytes: Uint8Array
  extractedTextBytes: Uint8Array
  extractedFromSha256: string
}
```

Extend only the existing request and snapshot surfaces:

- `NyxChatTurnUserMessage.documentRefs?`
- `NyxChatRequest.newDocuments?`
- `NyxChatMessage.documents?`, with `available` in the safe snapshot
- the existing retryable turn's `turnUserMessage`

New user messages require exact ordered ref/payload identity. Retry forbids
`newDocuments` and reuses the durable refs.

### Electron main and durable v4

Main is authoritative for acceptance:

- validate UUID, sanitized basename, allowlisted extension/media pair, exact
  byte lengths, count, and both capacity budgets;
- validate PDF signature; validate text as strict UTF-8 with no NUL; validate
  DOCX ZIP signature and bounded source size. DOCX decompression and XML
  handling never run in main;
- hash source and extracted bytes with main's standard crypto implementation;
- require the Worker-reported source digest to match main's source digest;
- write both sidecars before committing the pending record;
- roll back both document sidecars and any new image files if any mixed-turn
  write or record commit fails;
- propagate the active `AbortSignal` through document persistence and check it
  before source write, between source/text and image/document writes, and at a
  final pre-commit boundary. Cancellation observed before that boundary rolls
  back every new file and emits no record, acceptance, or Provider fetch. Once
  the atomic record write begins, commit is the linearization point: if Stop
  then wins the race, retain the record and sidecars, emit `chat:accepted`,
  persist the turn as cancelled, and never resolve a target or fetch.

Current-thread record v4 stores safe document metadata plus main-computed
source/text hashes. It never stores paths, raw bytes, extracted text, Provider
protocol, capability, or remote ids. Every v4 turn contains ordered
`imageRefs` and `documentRefs` arrays.

Version rules:

- text-only new thread remains v2;
- first image without a document remains v3;
- first document upgrades v1/v2/v3 to v4;
- v4 never downgrades, and reads never rewrite historical records;
- upgrading v3 preserves every image ref. A historical v3 image-specific
  `content_rejected` record remains byte-stable on read; only a v4 mutation
  translates it to the new fixed attachment-neutral message required by the
  v4 safe-error schema;
- a user turn must contain text, an image, or a document.

Use one document-specific sibling directory:

```text
threads/current-thread-documents/<documentId>.source
threads/current-thread-documents/<documentId>.text
```

`CurrentThreadDocumentFiles` reuses the current file adapter's no-follow bounded
reads, `0600` temp writes, atomic rename, rollback, reconciliation, and reset.
It does not generalize `CurrentThreadImageFiles`. Retry and hydration require
no-follow source/text metadata with exact stored sizes. The local Provider path
then reads and hashes only `.text`; full source reading and hashing occur at
acceptance and, later, only when a native protocol actually sends the source.
Same-size source corruption is therefore detected by a native read, not paid
for on every local turn.

Snapshot projection exposes only safe metadata and `available`. Renderer never
receives the durable path, hashes, source bytes, or extracted text after
restart.

### Runtime compatibility

The OCaml protocol stays unchanged. A document-only user turn remains an empty
user string in the compatibility projection, matching the accepted image-only
precedent. Renderer request history must retain that empty user entry whenever
the message has images or documents.

## Local Provider Representation

For the existing `openai-chat-completions` protocol, main materializes each
document's verified `.text` sidecar as ordinary text inside the same user
message. The deterministic order is user text, images, then documents in stored
order.

Each document uses a fixed envelope containing a JSON-escaped filename and an
explicit statement that the body is locally extracted user-provided content.
The envelope is a presentation convention, not a security boundary. It is
never inserted into the system message.

Historical document text is materialized again on later stateless requests,
within the durable 256 KiB thread budget. Existing text-only and image-only
request bodies remain byte-for-byte unchanged.

If local bytes are missing, changed, invalid, or empty, fail before Provider
fetch with a fixed safe attachment error. If an attachment-bearing request
returns 400, 413, or 415, map it to the existing safe `content_rejected` class
using attachment-neutral copy; do not expose the raw Provider body.

## Provider-Native PDF: Later Slice, Not A First-Slice Dependency

Native PDF is intentionally not implemented alongside the local baseline.
When one real target is available, add exactly one protocol vertical slice,
starting with OpenAI Responses if that is the configured target:

1. Migrate Connections v1 to v2 so the connection's persisted wire protocol
   is explicit. Historical v1 reads as `openai-chat-completions`; the first
   mutation writes v2. `.env` remains Chat Completions.
2. Add only implemented values, initially
   `openai-chat-completions | openai-responses`. Do not add Anthropic or Gemini
   placeholders.
3. The protocol choice is shown only in Connections settings. Composer target
   catalogs, requests, snapshots, and attribution do not expose it.
4. Extend the existing main switch and normalized stream with exact Responses
   URL, auth, request, event, error, connection-test, and model-refresh logic.
   Do not introduce an adapter registry or SDK for two branches.
5. Responses sends verified original PDF bytes natively; TXT/MD/CSV/DOCX still
   use the durable local text projection. Its image mapping must also be tested
   in the same slice.
6. A native rejection never triggers a hidden second Provider request. The
   user changes target and explicitly retries.

Do not persist `supportsFiles`, infer behavior from host/model names, or create
a model capability matrix. Add a per-model PDF mode only after real evidence
shows two models on the same implemented protocol require different behavior.

Anthropic Messages and Gemini are separate future slices, each requiring a
configured target, official fixtures, its own stream mapping, and acceptance.

## Execution Slices

### S0 — Docs-only scope lock

After this plan passes strict review:

- add one named `document-attachments` workstream to the active task-slices
  source of truth;
- update root and desktop `AGENTS.md` boundaries and current status;
- bind this plan version, allowed files, invariants, limits, slice order, and
  Stop conditions;
- preserve every stopped Context Composer statement;
- mark G1 as the only executable slice.

This change is docs-only and requires independent review.

### G1 — Bounded extractor gate

Use an OS-temp Electron Worker harness and exact candidate direct dependencies
(`pdfjs-dist`, `mammoth`, and `fflate`). It imports no production UI and
changes no tracked product file. fflate is the sole owner of the untrusted ZIP:
it streams and counts actual emitted bytes for every entry, rejects unsafe or
colliding normalized names, and rebuilds the accepted bounded entries as a new
canonical ZIP. Mammoth receives only that reconstructed ZIP, never the
original. Do not handwrite a general ZIP parser or ask two ZIP readers to
interpret the same untrusted archive.

Pass requires:

- strict TXT/MD/CSV decode and output-limit rejection;
- exact normalized UTF-8 output (or its SHA) from a small multi-page text PDF
  with page boundaries;
- safe `no_text`, encrypted, malformed, page-limit, cancellation, and timeout
  outcomes;
- exact normalized raw-text output (or its SHA) from a small DOCX;
- rejection of malformed, encrypted, ZIP64, path-traversal, entry-count,
  declared-expansion, actual-expansion, declaration-mismatch/data-descriptor,
  central-directory/local-header disagreement, duplicate or Unicode-normalized
  name collision, output-limit, cancellation, and timeout DOCX cases before
  unsafe work;
- the reconstructed DOCX contains only unique normalized entries accepted by
  the bounded fflate pass, and exact Mammoth output is derived from that ZIP;
- a source digest that still matches the separately reread persistence bytes;
- no paths or fixture contents in logs and Worker termination after
  success/failure;
- near-limit ordinary and adversarial fixtures keep Renderer heartbeat gaps at
  or below 50 ms, keep any Electron-main synchronous validation segment at or
  below 250 ms, and remain at or below the existing +192 MiB whole-process
  peak-memory Stop line.

The recorded evidence binds harness source, dependency versions, commands,
fixtures, exact results, measurements, and environment. Delete the harness
after independent review. Production build and `app.asar` are intentionally
tested once, against the real D2 Worker rather than this temporary harness.

PDF failure stops the workstream for user decision. DOCX failure stops for a
user decision between a PDF/text-only first release and another bounded DOCX
candidate; it does not silently shrink scope.

### D1 — Contract, v4 durability, and document files

Implement document types/limits, exact IPC parsing, v4 schema and immutable
transitions, document sidecars, mixed rollback, reconciliation, Retry reads,
snapshot availability, reset, and every v4-aware image path. Provider and UI
behavior remain unchanged.

D1 is not a deployable document feature. A production fail-closed guard rejects
any request containing `documentRefs` or `newDocuments` before sidecar IO,
record mutation, `chat:accepted`, or Provider fetch. Internal unit tests may
exercise the new storage/coordinator contracts directly. D2 removes this guard
in the same change that adds Provider materialization and the Renderer flow.

Gate tests cover v1-v3 stable reads, first-document upgrade, no downgrade,
document identity/uniqueness, write-before-record, mixed rollback, orphan
cleanup, missing/corrupt/hash-mismatch Retry failure, shared raw capacity,
thread text capacity, v4 image retention/authorization, safe snapshots, and
document-only runtime compatibility. One exact migration test reads a v3 image
`content_rejected` record byte-stably, then adds a document and proves that the
v4 mutation changes only the fixed message while preserving the error code,
retryable value, image refs, and every other turn field.

The D1 gate also proves:

- cancellation before and between every source/text/mixed-write boundary and
  at the final pre-commit barrier rolls back all new files and emits no record
  or acceptance;
- a deterministic Stop race immediately after the commit barrier retains the
  record and sidecars, emits acceptance, persists cancelled, and performs no
  target resolution or Provider fetch;
- startup recovery converts a v4 pending turn to the existing safe failed state
  without changing version, image refs, document refs, hashes, or user fields;
- an unknown future version or malformed record causes no rewrite, Provider
  call, image reconciliation/deletion, or document reconciliation/deletion;
- the production D1 guard produces no sidecar, record, acceptance, or fetch.

### D2 — Local vertical slice

Add the document Worker, picker/drop draft flow, cards, accepted-only clearing,
main local-text materialization, and safe attachment errors. Add all three
parser/ZIP packages as direct runtime dependencies at the versions proven by
G1.

Gate tests cover picker/drop, prepare/Retry/remove/timeout, double-send and
remove races, mixed image/document submission, pre-accept retention,
post-accept clearing, failed New thread retention, restart hydration,
document-only send, later-turn replay, target-switch Retry, exact local
envelopes, unchanged text/image request bodies, real production Worker loading,
and the real product build from `app.asar`.

D2 repeats the two deterministic Stop races through the real Renderer flow:
before the commit barrier the document draft remains and no turn is accepted;
after the barrier the accepted draft clears, the durable turn becomes
cancelled, and no Provider request occurs.

The packaged D2 gate reuses G1's near-limit ordinary fixture and worst
adversarial fixture through the real picker/drop → Worker → second source read
→ IPC → main validation/write → pending record → `chat:accepted` lifecycle in a
fresh process. It binds source/build/`app.asar` hashes and the same measurement
definitions. Each result must satisfy Renderer heartbeat ≤50 ms, every main
synchronous validation segment ≤250 ms, and whole-process peak delta ≤192 MiB;
the first failure stops D2.

### D3 — Product acceptance and status

Run ordinary checks, then dev and packaged real-product smoke with synthetic
non-private TXT, CSV, multi-page PDF, and DOCX fixtures:

- record a semantic result for every configured current Chat Completions
  target;
- document-only and mixed text/image/document turns;
- later turn, restart, target switch + Retry, and New thread cleanup;
- rejected/empty/corrupt/over-limit files never fetch;
- existing text-only and image-only sends remain unchanged.

At least one configured target must semantically pass TXT, PDF, and DOCX. A
failure on another target is recorded but does not block the local slice and
must not be described as support for that target. CSV is recorded separately.
After independent code review, update the active status documents. Claims
remain limited to tested targets and formats.

### N0/N1 — One native PDF protocol, when evidence exists

N0 first proves one configured target semantically accepts the exact native PDF
shape and images on its real endpoint. Only then may N1 implement the bounded
Connections v2 + one-protocol slice described above. N0/N1 are not executable
as part of the local workstream and do not block D1-D3.

## Validation Commands

During D slices:

```sh
mise run desktop:test
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:format-check
mise run runtime:chat-state:check
```

Final local-slice gate:

```sh
mise run check
```

No separate memory program is planned. G1 records Renderer heartbeat, main
synchronous work, and whole-process peak memory while running its ordinary and
adversarial parser fixtures; D2 then tests the real packaged Worker once.
Failure of the existing heartbeat ≤50 ms, main sync ≤250 ms, or whole-process
peak delta ≤192 MiB lines stops the candidate instead of raising a limit.

## Stop Conditions

Stop and request user direction if implementation requires:

- synchronous PDF/DOCX parsing on Electron main;
- accepting before source bytes, extracted text, and the pending turn are
  durable;
- silent text truncation;
- trusting a transitive parser/ZIP dependency without declaring it directly;
- weakening image durability, validation, Retry, or safe-error behavior;
- a generic Asset service, generic content-part registry, new IPC namespace,
  or OCaml protocol change;
- remote Provider file ids or cleanup;
- automatic target routing, hidden fallback requests, hostname/model
  inference, or a capability matrix;
- more than one native Provider protocol in the same slice;
- changing Connections before a live native target gate passes.

## Explicit Non-goals

- OCR or PDF page-image fallback
- rich document preview, HTML, Markdown, code-block, or generated-UI rendering
- citations, search, RAG, embeddings, or cross-document retrieval
- remote uploads, Provider file reuse, or a shared attachment library
- audio, video, legacy Office, spreadsheets, presentations, or archives
- multi-thread history
- native Anthropic/Gemini implementation in this workstream

## Review Handoff

Strict review should try to disprove:

1. whether Renderer extraction plus main validation/persistence preserves the
   actual trust and durability boundary;
2. whether persisting the accepted text projection is simpler and more stable
   than reparsing every historical attachment on Retry/later turns;
3. v1-v3 compatibility and every v4 image hard-code;
4. mixed write/rollback/reconcile/Retry ordering;
5. whether raw, extracted, expansion, page, time, and thread-wide prompt limits
   are independently bounded;
6. whether the future native slice is explicit enough without prematurely
   adding Provider abstraction or capability state.

## Revision Record

- v1.1 recorded `RC-DOC-G0-EVIDENCE-02`: both configured Chat Completions
  targets rejected inline PDF and text file parts.
- v2.0 replaces native-first Chat Completions with the user-approved hybrid
  direction: local extraction is the existing-target baseline; one explicit
  Provider-native PDF protocol is a later evidence-gated slice.
- v2.0 removes automatic file sending, capability inference, and the assumption
  that an 8 MiB source limit also bounds prompt size.
- v2.1 applies `RC-DOC-HYBRID-REV-01`: it assigns the combined budget to the
  coordinator, removes reliance on a returned PDF input buffer, makes fflate a
  direct bounded-DOCX dependency, binds parser resource lines and exact output,
  avoids rereading source bytes on local turns, moves packaged Worker proof to
  D2, preserves v3 error reads, and unifies D3 acceptance.
- v2.2 applies scoped repair `RC-DOC-HYBRID-REV-02`: it restores the distinct
  heartbeat and main-sync lines and adds the exact v3-to-v4 error migration
  regression gate. No direction, owner, dependency, or slice changed.
- v2.3 applies `RC-DOC-HYBRID-REV-03`: fflate reconstructs the only ZIP Mammoth
  may read; D2 binds real packaged resource lines; D1 stays production
  fail-closed; all existing image limits remain; and v4 cancellation, pending
  recovery, and unknown-version no-write/no-GC behavior gain explicit gates.
- v2.4 applies `RC-DOC-HYBRID-REV-04`: record commit is the explicit Stop-race
  linearization point, with deterministic pre-commit rollback and post-commit
  accepted-then-cancelled tests in D1 and the real D2 flow.
