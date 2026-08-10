# Document Attachments Runthrough

Status: `document-attachments/S0` docs-only scope lock is under review contract
`RC-DOC-S0-RATCHET-01`. The receipt is valid only when independent scoped
re-review passes the current five-document artifact. No extractor or product
implementation was run. G1 becomes the only executable slice only after that
receipt passes and the reviewed scope-lock commit is present in current HEAD.

## Bound Artifacts

| Artifact                                                   | Identity                                                                         | Status                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| Repository baseline                                        | `11f22353f1a7677d1ee9381f2d71f8993df58e43`                                       | recorded before S0                     |
| [technical plan](./document-attachments-technical-plan.md) | v2.4, SHA-256 `619b570f2c673166691b4d9cb6e43e9ff138c3615a0b8ea084fa9bf97e326abc` | independent full `plan_strict` PASS    |
| [active task slices](./agent-workbench-task-slices.md)     | `document-attachments/S0`                                                        | review contract `RC-DOC-S0-RATCHET-01` |

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
The receipt becomes PASS only when scoped re-review closes those two findings
against the current artifact without a direct regression.

## G1 Evidence Ledger

G1 has not run. Its future evidence must bind the exact harness source,
dependency versions, synthetic fixture hashes, commands, normalized outputs,
failure results, cancellation/timeout results, Renderer heartbeat, main
synchronous segments, whole-process peak working set, Electron/Chromium/Vite/OS
environment, and independent-review result.

The G1 harness must stay in one OS-temp directory, import no production UI, and
change no tracked product or dependency file. Delete it only after its evidence
passes independent review.

| Gate                                  | Result  |
| ------------------------------------- | ------- |
| Strict TXT/MD/CSV                     | not run |
| Multi-page text PDF                   | not run |
| PDF failure matrix                    | not run |
| Canonicalized DOCX                    | not run |
| DOCX failure matrix                   | not run |
| Source digest parity                  | not run |
| Cancellation and timeout              | not run |
| Heartbeat `<= 50 ms`                  | not run |
| Main sync `<= 250 ms`                 | not run |
| Whole-process peak delta `<= 192 MiB` | not run |
| Independent evidence review           | not run |

Do not fill later rows by inference. Record only commands and results actually
observed.
