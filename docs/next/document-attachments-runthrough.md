# Document Attachments Runthrough

Status: `document-attachments/S0` passed review and landed at `43a2020`.
`document-attachments/G1` then reached `PASS_VALID_STOP` under
`RC-DOC-G1-EVIDENCE-01`: the tested DOCX candidate accepted a valid ZIP64
archive even though the sealed policy required rejection before Mammoth. That
first candidate left G1 incomplete. The user approved option A: defer DOCX and
continue only strict text plus text-bearing PDF. The reduced v2.5 amendment passed
`RC-DOC-V25-PLAN-01`. The reduced OS-temp G1 gate then passed
`RC-DOC-G1-REDUCED-EVIDENCE-01`. D1 completed at `42e4ade` and passed
`RC-DOC-D1-CODE-03`. D2 completed at `bde0021`. The D3 real-target and
packaged-product matrix passed. Final review found one bounded same-length
sidecar-integrity gap; `RC-DOC-D3-F001-R1` repaired it and scoped
`RC-DOC-D3-FINAL-CODE-01` passed. The local baseline is complete. DOCX and
native PDF remain deferred and no document-attachments slice is executable.

## Bound Artifacts

| Artifact                                                   | Identity                                                                         | Status                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Repository baseline                                        | `bde0021892d589ade81655decd688694df2b3595`                                       | D2 implementation commit                 |
| [technical plan](./document-attachments-technical-plan.md) | v2.5, SHA-256 `38714f5888a17438848e37ca27be629114a7e2fe9f2c08a05e9b5b3006c50f4c` | `RC-DOC-V25-PLAN-01` PASS                |
| [active task slices](./agent-workbench-task-slices.md)     | `document-attachments/D3`                                                        | local baseline complete                  |
| v2.5 five-document plan artifact                           | SHA-256 `185964a27ded914f4d71c92da3ded94fe6ca6383a9ddf0b5beb24b628b05b70b`       | `RC-DOC-V25-PLAN-01`, independent accept |
| G1 OS-temp artifact                                        | `document-g1-stop-v1.1`                                                          | `RC-DOC-G1-EVIDENCE-01`                  |
| Reduced G1 OS-temp artifact                                | `document-g1-reduced-v1.2`                                                       | `RC-DOC-G1-REDUCED-EVIDENCE-01` PASS     |
| D1 reviewed artifact                                       | SHA-256 `f83e2b87b2ea1225bd6c290ec69c7c0eeae20962f7c2e99c85a674ea5b4aa348`       | `RC-DOC-D1-CODE-03` PASS                 |
| D3 OS-temp acceptance summary v1.1                         | SHA-256 `2cb67e1dc0018ebae63bb4fa1b1d2758e240997a6eb076f6eb711daac2a5a12b`       | semantic, lifecycle, repair PASS         |

The earlier inline Chat Completions `file_data` result remains
`PASS_VALID_STOP` under `RC-DOC-G0-EVIDENCE-02`. It rejects only that tested
wire shape on the two configured compatible targets. It is not evidence against
local text extraction or a future independently gated native PDF protocol.

## S0 Result

S0 changes only the five tracked documentation files authorized by the sealed
task. It records:

- the exact `S0 -> G1 -> D1 -> D2 -> D3` local-baseline order;
- G1 as the only possible next executable slice after S0 review;
- the candidate storage, extraction, parser, timeout, and resource limits;
- exact allowed tracked files for every local slice;
- Electron-main ownership, accepted-only draft clearing, durable source/text
  projection, unchanged text/image behavior, and no-fetch failure boundaries;
- explicit Stops for scope, security, durability, protocol, and limit changes;
- native PDF N0/N1 as deferred and non-executable.

S0 does not change product code, tests, dependencies, schema, IPC, persisted
data, or any Context Composer E status.

## S0 Review Receipt

`RC-DOC-S0-RATCHET-01` binds the initial five-document artifact fingerprint
`e855c232a379d3b585b10280dc53d300237512c1294c4ce4a4535cccc1233d57`.
Independent standard diff review found no blocker. Independent strict review
accepted two bounded S2 wording repairs: remove cross-workstream `D1`-`D3`
ambiguity and require both review PASS and a landed scope-lock commit before G1.
Scoped re-review closed both findings against final artifact fingerprint
`9b63553cde9e707f41f4a2e9521d41db11b53e618373900c178b91483d5c5c3e`
without a direct regression. The reviewed scope lock landed at `43a2020`, so S0
passed before G1 ran.

## G1 Evidence Ledger

The candidate ran entirely in one OS-temp directory and changed no tracked
product code, dependency, lockfile, or current-thread data. The counted run used
`fflate 0.8.3`, `mammoth 1.12.1`, and `pdfjs-dist 6.2.108` with Electron
`41.7.2`, Chromium `146.0.7680.216`, Electron Node `24.15.0`, Vite `8.0.16`,
and macOS `26.6.1` build `25G76` on arm64.

The reproducible redacted command shape was:

```sh
G1_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/nyx-document-g1.XXXXXX")"
REPO_ROOT="<repository>"
pnpm --dir "$G1_ROOT" install --ignore-workspace
node "$G1_ROOT/generate-fixtures.mjs"
(cd "$G1_ROOT" && "$REPO_ROOT/apps/desktop/node_modules/.bin/vite" build --config vite.config.mjs)
"$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$G1_ROOT"
```

The source receipt covers exactly these relative files, in this order:

```text
generate-fixtures.mjs
main.cjs
package.json
pnpm-lock.yaml
preload.cjs
src/extractor.worker.js
src/index.html
src/renderer.js
vite.config.mjs
```

Hashing each with `shasum -a 256` in that order and hashing the emitted lines
produces source fingerprint
`804204385ec796b662a36cbdfb8ff5981d767cbd698f07952c6db29d68257d97`.
The counted result SHA-256 is
`0c5fcdb1a932f47949b3db7ab48451b0e5b8176fa01efc80066aa07b4eb15d4a`.
The earlier unbound `2a38d6...` value is excluded from provenance.
The built index, Worker, and Renderer SHA-256 values are respectively
`d74a50dab421af41ab4019c23fa14ceb84153e3fbc44b0f75c5ebf1d64398439`,
`e1856825b8b53455070109e0f1f9cb53ff85ff1e2152f73991fe5abaf7adb637`,
and `d2a54c8b0690d385c8ad70deff7952db1087e9383ca839473ff40a4bd4e7ee45`.
The counted Electron command exited `2` after writing `passed: false` with Stop
reason `zip64_was_accepted`.

The ordinary three-entry DOCX was 951 bytes with SHA-256
`1627fe08a1d1c0cb6c72743c2b8dbc46de5bbe53fe76e5e24cc6b4bb9dc4487c`.
It produced the exact 27-byte expected output with SHA-256
`bec9e8a01e7a697d222c8decd8292162a95b5c6d33f4b580360a5820c2adcaa0`.
The forced ZIP64 form was 1111 bytes with SHA-256
`e4465901487ae0f0ef5085e45c329e4313c926bccce710e97f77cb4ec7e15795`.
Independent review verified its ZIP64 EOCD, locator, entry sentinels, ZIP64
extras, offsets, sizes, and CRC-valid contents. The candidate nevertheless
returned success and the same output hash. This violated the mandatory ZIP64
rejection rule and stopped the run immediately.

| Gate                                  | Counted result                                       |
| ------------------------------------- | ---------------------------------------------------- |
| Canonicalized ordinary DOCX           | pass: exact source and output digests                |
| ZIP64 DOCX rejection                  | **Stop: candidate accepted the valid ZIP64 archive** |
| Source digest parity                  | pass for the two counted fixtures                    |
| Heartbeat `<= 50 ms`                  | pass: `11.3 ms` ordinary; `11.1 ms` ZIP64            |
| Main sync `<= 250 ms`                 | pass: `0.224333 ms` ordinary; `0.020583 ms` ZIP64    |
| Whole-process peak delta `<= 192 MiB` | pass: `+18.375 MiB` ordinary; `+3.53125 MiB` ZIP64   |
| Worker terminated after result        | pass for both counted fixtures                       |
| Strict TXT/MD/CSV                     | not run after first valid Stop                       |
| Multi-page text PDF and PDF failures  | not run after first valid Stop                       |
| Remaining DOCX/security matrix        | not run after first valid Stop                       |
| Cancellation, timeout, near-limit     | not run after first valid Stop                       |
| Independent evidence review           | `PASS_VALID_STOP`, `RC-DOC-G1-EVIDENCE-01`           |

The result proves only that this fflate/Mammoth candidate cannot satisfy the
sealed ZIP64 rejection rule through its allowed public metadata path. It does
not prove PDF extraction, TXT/MD/CSV decoding, all DOCX extraction, or the
unrun matrices impossible. The user approved option A on 2026-08-10: the first
local slice omits DOCX and resumes only the strict-text/PDF G1 remainder after
the v2.5 amendment passes independent review. At that point D1-D3 remained
blocked.

## G1 Reduced Remainder

The reduced gate uses only the platform `TextDecoder` and the exact
`pdfjs-dist` candidate. It must prove strict TXT/MD/CSV, exact page-separated
PDF output, malformed/encrypted/no-text/page/output bounds, cancellation,
timeout, source parity, Worker termination, and the unchanged heartbeat,
main-sync, and whole-process memory lines. No DOCX parser or second candidate
is allowed.

## D1 Result

D1 landed at `42e4ade` and passed independent review
`RC-DOC-D1-CODE-03`. It added the v4 current-thread contract, main-owned source
and extracted-text sidecars, shared raw attachment preflight, rollback,
reconciliation, Retry, reset, safe snapshot metadata, and a production
fail-closed guard.

Verification passed: desktop typecheck, compatibility typecheck, lint,
format-check, build, and 440 tests with 17 skipped; runtime chat-state check
passed 9 tests; `git diff --check` passed. D1 added no document UI, Provider
materialization, DOCX support, native protocol, or new product dependency.

### Reduced G1 result

The final counted artifact used only `pdfjs-dist 6.2.108` as the candidate
dependency. Platform `TextDecoder` handled TXT/MD/CSV. Bundled `pypdf 6.10.0`
was used only to generate the synthetic encrypted fixture; it is not a product
or extraction dependency.

The redacted command shape was:

```sh
G1_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/nyx-document-g1-reduced.XXXXXX")"
REPO_ROOT="<repository>"
pnpm --dir "$G1_ROOT" install --ignore-workspace
node "$G1_ROOT/generate-fixtures.mjs"
"<bundled-python>" "$G1_ROOT/encrypt_fixture.py"
(cd "$G1_ROOT" && "$REPO_ROOT/apps/desktop/node_modules/.bin/vite" build --config vite.config.mjs)
"$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$G1_ROOT"
```

The source receipt covers these relative files in order:

```text
generate-fixtures.mjs
encrypt_fixture.py
main.cjs
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
preload.cjs
src/extractor.worker.js
src/index.html
src/renderer.js
vite.config.mjs
```

Hashing each source line with `shasum -a 256` in that order and hashing the
emitted lines produces
`f23d8febaeabf27c61db7e7a4885c27ecf502e8808f2cc871b54d59dba23b268`.
The final result SHA-256 is
`cb11e897609f2079b92fea0bd08bbafaf938ae8c9112be0659c12aa2c661ec89`;
the fixture manifest SHA-256 is
`40741589826ed559ac9fba7f1c0c2214ca592a5ea3acb553fc7d0f92133467a1`.

Production-shape Vite build hashes were:

| Build artifact          | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| index HTML              | `c52f47e456f18b5ade28910a3160d50595be135dbc36211953ac59de5fcdda1b` |
| outer extraction Worker | `d5f17c147dfc4f2f06b1f6a9e062aa9d5d1f485df3ff03a787725b0e546b0b05` |
| PDF.js Worker           | `b4e582882f5e811f4d1b7b511f68d9a0c3209141e6f68856f01408c5cc155131` |
| Renderer                | `aa864cc51634cc556983f1f86c87fa6beeff883cdc52a5e34e3d4ee21d2c0c42` |

The counted environment was Electron `41.7.2`, Chromium `146.0.7680.216`,
Electron Node `24.15.0`, Vite `8.0.16`, and macOS `26.6.1` build `25G76` on
arm64.

| Reduced gate                                  | Counted result                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TXT/MD/CSV exact output                       | pass                                                                                       |
| invalid UTF-8, NUL, empty, `128 KiB + 1` text | pass: safe rejection                                                                       |
| two-page PDF exact output                     | pass: 26 bytes, SHA-256 `b91e9cb1fe1d1520d36800782a711eddad7f3e6ae05e24066aab3fce7b20508a` |
| encrypted, no-text, malformed, 51-page PDF    | pass: exact safe rejection                                                                 |
| extractable PDF output over 128 KiB           | pass: `output_limit`                                                                       |
| near-limit ordinary PDF                       | pass: 7,472,670 source bytes, 50 pages, 107,377 output bytes                               |
| source parity                                 | pass: initial read, Worker digest, post-Worker main reread, and manifest agree             |
| cancellation                                  | pass after `getTextContent()` started; no final delivery; Worker terminated                |
| 10-second timeout                             | pass after `getTextContent()` started; no final delivery; Worker terminated                |
| Renderer heartbeat                            | pass: maximum `13.300001 ms` (`<= 50 ms`)                                                  |
| Electron-main synchronous work                | pass: maximum `3.311334 ms` (`<= 250 ms`)                                                  |
| whole-process peak delta                      | pass: maximum `+48.03125 MiB` (`<= 192 MiB`)                                               |

The outer controller Worker explicitly owns the static PDF.js Worker port.
Every ordinary case terminates the outer Worker after a result; cancellation
and timeout enter the real PDF text path before the shared controller/finally
termination path. Main independently rereads source bytes after Worker
completion, and that second read remains inside the heartbeat and memory
session.

Early runs exposed only harness plumbing or invalid-fixture issues: missing
PDF.js Worker binding, an internal ready message escaping the outer Worker,
void cleanup treated as a Promise, and off-page single-line output fixtures.
They were not accepted as candidate evidence. The final v1.2 artifact fixed
those issues, passed all reduced cases, and passed independent scoped review.

This result proves only the reviewed local strict-text and text-bearing-PDF
candidate in the recorded environment. It does not prove scanned-PDF, OCR,
page-image, DOCX, native Provider PDF, or packaged product behavior. The
unchanged first-slice limits are now frozen; raising one still requires a new
user decision.

## D2 Result

D2 landed at `bde0021`. It adds one Composer document draft, bounded
feature-local extraction, main-owned source/text sidecars, local text
materialization for existing Chat Completions targets, restart/Retry hydration,
safe attachment failures, and compact document cards. It supports strict UTF-8
TXT, Markdown, CSV, and text-bearing PDF only.

The final automated run passed 467 desktop tests with 17 skipped, 9 runtime
chat-state tests, both TypeScript checkers, lint, format-check, build, and
`git diff --check`. The clean `bde0021` rebuild produced the same `app.asar` as
the counted semantic acceptance run.

| Build artifact                      | SHA-256                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| semantic-run `app.asar`             | `de48dcf82b8cdc3adf6b216fd0dbd98abc542150e76625009c907f3ee88a0a4e` |
| semantic-run Electron main          | `4910024b690c4a41bdd2928343aa717a38fa5cc767345706b5b97e7ec0ae59a7` |
| final repaired `app.asar`           | `551006e1bcd35ad8151f31904b21cdee94dcbe5a12d68fe68aed2fbbfac72437` |
| final repaired Electron main        | `2ff16da5be9aebfb112be8dfc1c09afc8fe7ef68a2445a9ad863a8996c398401` |
| unchanged preload                   | `7c306517dfc38780ad0b8eed62711507e41395b76cda3324f8bca7a85d901a2f` |
| unchanged document extractor Worker | `52a4d181bd2a9ee407a460d948c446d6aac1d7bf6fa56ce1a65593e7cb9e4f86` |
| unchanged PDF.js Worker             | `1a7607f28cfbc63f0e4e0a41927c89f991e353e4f3fb4565ecfd621ac5975089` |

The packaged product excluded PDF.js's unused optional Node canvas packages.
The D2 package gate also passed malformed-PDF no-fetch rejection and both
deterministic Stop races: pre-commit Stop retained the draft without a Provider
request; post-commit Stop cleared the accepted draft and persisted a cancelled
turn without a Provider request.

## D3 Acceptance Evidence

The counted run used only synthetic non-private fixtures in OS temp. Their
SHA-256 values were:

| Fixture        | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| strict TXT     | `a6a2099a3b43e94e82d4eecd361d6e9353d6726c8d97e49af614a15037229b4e` |
| CSV            | `49e8e582adb43a1ab12fcae91193f992f3ddad9418f1976baa9893fff42ac09b` |
| two-page PDF   | `815d32fe958ac820d7ca171ffaf1bdec1812c3da5c61f3b9356a4b2229b9fdd3` |
| four-color PNG | `9d580819bed1c8e7d744e20278936336f09bcb10d5046b849828755617aa2917` |

Every configured current target ran the same document-only TXT, later-turn,
CSV, and two-page PDF semantic checks in both dev and the counted `app.asar`:

| Configured target            | Dev TXT/later/CSV/PDF     | Packaged TXT/later/CSV/PDF |
| ---------------------------- | ------------------------- | -------------------------- |
| deepseek / deepseek-v4-flash | pass / pass / pass / pass | pass / pass / pass / pass  |
| 测试 / k3-256k               | pass / pass / pass / pass | pass / pass / pass / pass  |

The packaged lifecycle checks also passed:

- a mixed image/document turn on `k3-256k` returned both the document token and
  the four image colors;
- restart restored both attachment cards, and a no-attachment follow-up reused
  the prior document text;
- a copied-profile target forced to an unreachable local endpoint failed, then
  switching to `deepseek-v4-flash` and pressing Retry reused the durable
  document and passed semantically;
- New thread removed the record and both image/document sidecars and returned
  the Composer to an empty ready state;
- malformed PDF remained local and disabled Send without a Provider request;
- existing text/image regression tests and the real mixed turn passed.

The run recorded target labels, pass/fail results, fixture/build identities,
and safe model replies only. It did not record credentials, full endpoints,
raw requests, Base64, private documents, or binary evidence. These results prove
only local extracted-text behavior for the two named configured targets. They
do not prove DOCX, scanned PDF, OCR, Provider-native files, other targets,
audio, or video.

### Final review and integrity repair

Full independent review `RC-DOC-D3-FINAL-CODE-01` found one blocking S2: the
durable document record stored source/text hashes, but snapshot availability
and Retry accepted a same-length changed source. Revision contract
`RC-DOC-D3-F001-R1` changed only the main-owned document verifier and its two
near-source tests. Snapshot availability, Retry, and Provider materialization
now share one bounded read that verifies both sidecars' length, SHA-256, source
format, and UTF-8 text.

The repair diff SHA-256 is
`63d41902bceedbe7d8c756e95af1f47b56a8cc6448d232679ec3e635c77f8220`.
Scoped `RC-DOC-D3-FINAL-CODE-01` re-review passed with no direct regression,
scope expansion, or owner drift. Focused tests passed 27/27, and the full
automated matrix remained 467 desktop tests plus 9 runtime chat-state tests.
The final repaired `app.asar` then loaded a copied profile whose raw source had
been changed without changing its length; hydration marked the document
unavailable and made no Provider request.

The real-target semantic matrix was not repeated after this repair. Its
Renderer extraction, Provider envelope, target selection, and Workers were
unchanged; the independent scoped review and final packaged corruption gate
cover the only modified main-side verification path.
