# Document Attachments Runthrough

Status: `document-attachments/S0` passed review and landed at `43a2020`.
`document-attachments/G1` then reached `PASS_VALID_STOP` under
`RC-DOC-G1-EVIDENCE-01`: the tested DOCX candidate accepted a valid ZIP64
archive even though the sealed policy required rejection before Mammoth. That
first candidate left G1 incomplete. The user approved option A: defer DOCX and
continue only strict text plus text-bearing PDF. The reduced v2.5 amendment passed
`RC-DOC-V25-PLAN-01`. The reduced OS-temp G1 gate then passed
`RC-DOC-G1-REDUCED-EVIDENCE-01`; only D1 is now executable. D2-D3 remain
blocked, and DOCX remains deferred.

## Bound Artifacts

| Artifact                                                   | Identity                                                                         | Status                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Repository baseline                                        | `43a202029a6b1efde8a8308ffac06102aaa78851`                                       | reviewed S0 commit and G1 run HEAD       |
| [technical plan](./document-attachments-technical-plan.md) | v2.5, SHA-256 `38714f5888a17438848e37ca27be629114a7e2fe9f2c08a05e9b5b3006c50f4c` | `RC-DOC-V25-PLAN-01` PASS                |
| [active task slices](./agent-workbench-task-slices.md)     | `document-attachments/D1`                                                        | only executable local slice              |
| v2.5 five-document plan artifact                           | SHA-256 `185964a27ded914f4d71c92da3ded94fe6ca6383a9ddf0b5beb24b628b05b70b`       | `RC-DOC-V25-PLAN-01`, independent accept |
| G1 OS-temp artifact                                        | `document-g1-stop-v1.1`                                                          | `RC-DOC-G1-EVIDENCE-01`                  |
| Reduced G1 OS-temp artifact                                | `document-g1-reduced-v1.2`                                                       | `RC-DOC-G1-REDUCED-EVIDENCE-01` PASS     |

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
the v2.5 amendment passes independent review. D1-D3 remain blocked.

## G1 Reduced Remainder

The reduced gate uses only the platform `TextDecoder` and the exact
`pdfjs-dist` candidate. It must prove strict TXT/MD/CSV, exact page-separated
PDF output, malformed/encrypted/no-text/page/output bounds, cancellation,
timeout, source parity, Worker termination, and the unchanged heartbeat,
main-sync, and whole-process memory lines. No DOCX parser or second candidate
is allowed.

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
user decision. D1 may begin, while D2 must repeat the real packaged Worker and
resource gate before product behavior is enabled.
