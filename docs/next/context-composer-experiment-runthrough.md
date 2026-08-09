# Context Composer Experiment Runthrough

Status: E0 through E0E stopped; E0F passed bounded independent review; the v3.0
implementation plan passed `RC-V3-PLAN-03`. E1 is executable; E2-E5 remain
blocked by ordered prerequisites.

The v1.8 Worker/JPEG/allowlist design and every capacity value below are failed
historical candidate material, non-operative, and not implementation permission.
No capacity limit or product ICC allowlist is frozen. E0C proved an exact ICC
candidate but failed the full-image visible-DOM memory line. E0D proved the
preview-only grid, then failed the same line on its temporary full-open data
path. E0E then failed its sealed exact-route security rule before memory
measurement. E0F then proved the bounded canonical request/native-cache
direction in OS temp. This is feasibility evidence, not product implementation
permission or a frozen product protocol/capacity. The later reviewed v3.0 plan,
not E0F by itself, selects the product constants and protocol for E1-E5.

Probe date: 2026-08-09

E0C plan baseline: `d25ea7a`

E0D plan baseline: `cef901b`

E0E plan baseline: `dba1a14`

E0F plan baseline: `03d6e5b`

Plan: [context-composer-experiment-technical-plan.md](./context-composer-experiment-technical-plan.md)

Baseline commit: `2a1074b`

## Evidence boundary

E0 answers only two questions:

1. Does at least one configured OpenAI-compatible Chat Completions target accept
   an inline image data URL and semantically use the image?
2. Can the current Electron/Apple Silicon development environment meet the
   technical plan's synchronous processing, IPC, hydration, request-build, and
   memory stop lines without adding a worker, thumbnail layer, lazy asset IPC,
   or general Asset service?

The provider probe used a generated 96×64 PNG with a red left half and blue
right half. The prompt requested a strict left/right color pattern without
including the expected colors. The original performance probes used generated
pattern images and bounded byte payloads. A later ratchet probe added
deterministic high-entropy PNG fixtures because the first 25 MP fixture was too
compressible to represent the accepted upper boundary. No probe read personal
images or production current-thread data.

No token, encrypted secret, full base URL, local path, image Base64, raw request
body, raw response body, or upstream error body was retained in this document.
The harnesses behind the earlier evidence below were removed. The sanitized
E0B harness and synthetic fixtures existed only in OS temp through independent
review, were never committed, and were deleted after that review.

## Environment

| Item           | Value               |
| -------------- | ------------------- |
| Platform       | macOS 26.6.1, arm64 |
| Electron       | 41.7.2              |
| Chromium       | 146.0.7680.216      |
| Electron Node  | 24.15.0             |
| Workspace Node | 24.16.0             |
| electron-vite  | 5.0.0               |
| Vite           | 8.0.16              |
| Nyx baseline   | `2a1074b`           |

## Real target result

Request shape:

- existing OpenAI-compatible Chat Completions URL construction
- `stream: true`
- one user content array with one text entry followed by one
  `image_url` data-URL entry
- generated PNG only

| Configured target | HTTP | Semantic check                   | Result                     |
| ----------------- | ---: | -------------------------------- | -------------------------- |
| `Target A`        |  400 | not run                          | rejected the image request |
| `Target B`        |  200 | identified left red / right blue | pass                       |

The real-target part of E0 passes because Target B accepted the inline shape the
experiment intends to implement and returned content matching the generated
image. The first target's 400 also validates the product assumption that a
configured target may remain capability `unknown` and reject an image at
runtime; E3/E5 must preserve the planned safe rejection and switch-target Retry
path instead of guessing support from provider or model names.

## Performance result

Thresholds are development stop lines, not product KPIs.

### Initial 25 MP canonicalization fixture

Generated PNG: 5000×5000, 0.7 MiB source, 0.1 MiB canonical output.

| Metric                      |      Result |       Limit | Status   |
| --------------------------- | ----------: | ----------: | -------- |
| Decode                      |       39 ms |           — | evidence |
| PNG encode                  |      188 ms |           — | evidence |
| Total                       |      227 ms |           — | evidence |
| Longest synchronous segment |      188 ms |     ≤250 ms | pass     |
| RSS increase                |    97.7 MiB |    ≤192 MiB | pass     |
| Source/canonical file size  | both ≤8 MiB | ≤8 MiB each | pass     |

This fixture proves 25 MP decode cost, but it does not prove the accepted
high-entropy boundary: 0.7 MiB source and 0.1 MiB canonical output are far below
the 8 MiB limits. Treating this row alone as the upper-bound gate was incorrect.

### Four-image Renderer → main → Renderer roundtrip

Four generated 2880×1800 Retina-style images were loaded into Renderer-owned
typed arrays, sent to main, decoded/re-encoded sequentially with an event-loop
yield between images, and returned as accepted canonical typed arrays.

| Metric                      |           Result |    Limit | Status   |
| --------------------------- | ---------------: | -------: | -------- |
| Renderer observed total     |           183 ms |   ≤1.5 s | pass     |
| Main processing total       |           181 ms |        — | evidence |
| Longest synchronous segment |            39 ms |  ≤250 ms | pass     |
| Returned images             | 4 / 90,328 bytes |        4 | pass     |
| Main RSS increase           |         22.2 MiB | ≤192 MiB | pass     |

### 32 MiB snapshot hydration

The hidden Renderer received four bounded 8 MiB typed-array payloads after main
read them sequentially.

| Metric                  |             Result |    Limit | Status   |
| ----------------------- | -----------------: | -------: | -------- |
| Renderer observed total |              51 ms |     ≤1 s | pass     |
| Main bounded read       |              15 ms |        — | evidence |
| Payload                 | 32 MiB / 4 entries |   32 MiB | pass     |
| Main RSS increase       |           57.3 MiB | ≤192 MiB | pass     |

### 32 MiB historical request construction

Four bounded 8 MiB payloads were read, converted to data URLs, placed in
image-bearing history messages, and serialized as a complete request body.

| Metric                      |    Result |                     Limit | Status   |
| --------------------------- | --------: | ------------------------: | -------- |
| Read + Base64 + JSON total  |     67 ms |                      ≤1 s | pass     |
| Longest synchronous segment |     48 ms |                   ≤250 ms | pass     |
| Serialized request          |  42.7 MiB | expected Base64 expansion | evidence |
| Peak RSS increase           | 154.1 MiB |                  ≤192 MiB | pass     |

The roundtrip and hydration probes wrote their complete metrics before the
temporary hidden-window harness kept its Electron process alive; the probe
process was then stopped manually. This was a harness shutdown defect, not a
failure or timeout in the measured IPC/data path, and the harness is not being
promoted into the product.

### High-entropy synchronous main re-encoding

The ratchet generated deterministic block-pattern PNGs below both the pixel and
8 MiB byte limits, then measured the synchronous
`nativeImage.createFromBuffer → toPNG` path in a fresh Electron process.

| Fixture                    | Source / canonical | Decode |  Encode | Longest sync | RSS increase | Result |
| -------------------------- | -----------------: | -----: | ------: | -----------: | -----------: | ------ |
| 25 MP, high entropy        |    7.78 / 7.78 MiB | 152 ms | 1014 ms |      1014 ms |    115.6 MiB | fail   |
| 8 MP minimum, high entropy |    7.67 / 7.67 MiB |  60 ms | 1046 ms |      1046 ms |     48.6 MiB | fail   |

Both fixtures exceed the 250 ms event-loop stop line. Lowering only the 25 MP
cap cannot repair the direction because the minimum accepted 8 MP / 8 MiB class
also freezes Electron main for about one second.

### E0B native off-main candidate

A second temporary harness used the product's `sandbox: true`,
`contextIsolation: true`, and `nodeIntegration: false` settings. A plain Web
Worker received owned image bytes, decoded with `createImageBitmap`, drew into
`OffscreenCanvas`, and encoded with `convertToBlob`. Main only decoded and
checked the returned canonical bytes; it did not re-encode.

This initial harness created the Worker from a Blob URL and measured
working-set delta after completion, so it is candidate evidence only. E0B must
repeat it with Vite's production Worker shape and measure peak working set.

| Fixture                |   Source | Canonical | Worker total | Renderer observed | Max UI heartbeat gap | Main validation | App working-set delta | Result |
| ---------------------- | -------: | --------: | -----------: | ----------------: | -------------------: | --------------: | --------------------: | ------ |
| 8 MP high entropy      | 7.67 MiB |  7.90 MiB |       282 ms |            288 ms |                12 ms |           38 ms |             173.8 MiB | pass   |
| 3840×2160 high entropy | 7.53 MiB |  7.75 MiB |       218 ms |            225 ms |                12 ms |           37 ms |             175.7 MiB | pass   |
| 25 MP high entropy     | 7.78 MiB |  8.19 MiB |       427 ms |            433 ms |                13 ms |           55 ms |             371.5 MiB | reject |

The 25 MP candidate exceeds both the 8 MiB canonical limit and the original
192 MiB memory stop line. The native Worker direction is promising at 4K, but
E0B is not complete: packaged Vite Worker loading, JPEG quality/orientation,
strict APP0/metadata fixtures, cancellation, four-image sequencing, decoded
visible-DOM grid display, and peak-memory measurement still need explicit
evidence.

### E0B OS-temp production-shape Vite Worker harness failure record

The bounded run used an OS-temp production-shape Vite Worker harness with the
installed Electron/Vite toolchain. It imported no production Renderer component
and used the required static Worker expression. The observations in this
section are limited to Electron 41.7.2 / Chromium 146.0.7680.216 / macOS 26.6.1
arm64 and the synthetic fixtures recorded below.

These are the executed redacted command shapes. They preserve what was run but
are not a self-contained reproduction because the reviewed harness was deleted:

```sh
E0B_ROOT="<OS temp>/nyx-context-composer-exp-01"
REPO_ROOT="<repo>"
"$REPO_ROOT/apps/desktop/node_modules/.bin/electron-vite" build "$E0B_ROOT" -c "$E0B_ROOT/electron.vite.config.ts"
E0B_RUN_MODE=smoke "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0B_ROOT"
(cd "$E0B_ROOT" && E0B_RUN_MODE=smoke "$REPO_ROOT/apps/desktop/node_modules/.bin/electron-vite" -c "$E0B_ROOT/electron.vite.config.ts")
mkdir -p "$E0B_ROOT/package-stage"
cp -R "$REPO_ROOT/apps/desktop/node_modules/electron/dist/Electron.app" "$E0B_ROOT/NyxE0B.app"
cp "$E0B_ROOT/package.json" "$E0B_ROOT/package-stage/package.json"
cp -R "$E0B_ROOT/out" "$E0B_ROOT/package-stage/out"
node "$REPO_ROOT/node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar/bin/asar.js" pack "$E0B_ROOT/package-stage" "$E0B_ROOT/NyxE0B.app/Contents/Resources/app.asar"
E0B_RUN_MODE=smoke "$E0B_ROOT/NyxE0B.app/Contents/MacOS/Electron"
E0B_RUN_MODE=jpeg "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0B_ROOT"
```

The same Vite Worker loaded in all three required paths:

| Path     | Observed Worker URL shape                                                  | Result |
| -------- | -------------------------------------------------------------------------- | ------ |
| dev      | `http://localhost:5173/image-worker.ts?worker_file&type=module`            | pass   |
| build    | `file://<OS temp>/out/renderer/assets/image-worker-<hash>.js`              | pass   |
| packaged | `file://<OS temp>/.../app.asar/out/renderer/assets/image-worker-<hash>.js` | pass   |

The full fixture matrix then stopped at the first mandatory JPEG trust-boundary
failure. Chromium 146.0.7680.216's
`OffscreenCanvas.convertToBlob({ type: "image/jpeg", quality: 0.95 })` emitted
an APP2 segment in the full run and two bounded JPEG-only reproductions. Main
correctly rejected it under the failed v1.8 candidate rule that canonical JPEGs
contain no APP1-APP15 or COM segments.

| Evidence                | Value                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Fixture                 | synthetic 120×80 red/blue split JPEG                                                  |
| Seed                    | `0x5eedc0de`                                                                          |
| Dedicated reproductions | 2, in addition to the full-matrix failure                                             |
| Source                  | 995 bytes; SHA-256 `71cd7beb383f2b74c4519a577771da8f8af0f527cb6136b69d337e2cdf68122d` |
| Worker canonical output | 990 bytes; SHA-256 `4c5b2dce324f2206321b0c64a2bedd558df36526b042883916dba161efb50e42` |
| Rejected marker         | `FFE2`; 470-byte payload beginning `ICC_PROFILE`                                      |
| Main result             | fail closed: `JPEG metadata marker not allowed`                                       |

APP2 carries the encoder's ICC color profile. It is not EXIF/GPS, but accepting
it would have relaxed the failed candidate's sealed main allowlist. The run
therefore stopped before lifecycle, visible-DOM peak, or current-thread
count/pixel evidence could be accepted. Partial PNG timings are not promoted
into a PASS, and no direction choice or capacity limit is inferred from them.

### E0C exact-ICC and visible-grid failure record

User decision A authorized one bounded OS-temp run. The harness used the same
sandbox/context-isolation flags, one static Vite module Worker, transferable/
typed buffers, synthetic fixtures, main `nativeImage` decode, and Node 24's
standard-library `zlib.crc32`. It imported no production Renderer component and
changed no product code, dependency, IPC contract, persisted state, or OCaml
protocol.

Executed redacted command shapes:

```sh
E0C_ROOT="<OS temp>/nyx-context-composer-exp-01"
REPO_ROOT="<repo>"
"$REPO_ROOT/apps/desktop/node_modules/.bin/electron-vite" build "$E0C_ROOT" -c "$E0C_ROOT/electron.vite.config.ts"
E0C_RUN_MODE=full "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0C_ROOT" --user-data-dir="$E0C_ROOT/user-data-full-<run>"
```

The production build emitted a separate static `image-worker-<hash>.js` chunk.
E0C stopped before rerunning dev and `app.asar`; their earlier E0B loading result
remains historical evidence only.

Exact JPEG result, reproduced in the ICC-only run and every full run:

| Evidence             | Value                                                                     |
| -------------------- | ------------------------------------------------------------------------- |
| Repetitions per run  | 3 identical canonical outputs                                             |
| Canonical bytes/hash | 1038 / `f699c04d6b8c309403f2c69c9c58c2eddd2b4e7e4f5aa64851dc177ef0258d8f` |
| Marker sequence      | `APP0,APP2,DQT,DQT,SOF0,DHT,DHT,DHT,DHT,SOS,EOI`                          |
| Exact APP0 payload   | `4a46494600010100000100010000`                                            |
| APP2                 | index 1; 470 bytes; sequence 1; count 1                                   |
| APP2 payload hash    | `c3bb12de30d7357252ec3a5ec781bd2f8a6dd8c69dd7d3de97bbac262d9e1fd4`        |
| ICC bytes/hash       | 456 / `12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc`  |
| ICC header           | size 456; `mntr`; `RGB `; `XYZ `; `acsp`                                  |

Main accepted the exact output and rejected ten direct canonical variants:
single-byte mutation, missing byte, extra byte, sequence mutation, count
mutation, repeated APP2, additional APP2, split APP2, reordered APP2, and
truncated JPEG.

The bounded metadata probe reached the grid gate after checking JPEG visual
orientation and canonical removal of synthetic EXIF orientation, GPS/device,
XMP, COM, PNG text, and PNG eXIf inputs. The timing/lifecycle harness also
reached the grid gate after its embedded stop checks. These are probe coverage,
not production lifecycle validation or a complete direct-injection rejection
matrix.

Two visible real-`<img>` grid candidates failed:

| Candidate      | Cumulative pixels | Baseline working set | Peak working set |        Delta | Result |
| -------------- | ----------------: | -------------------: | ---------------: | -----------: | ------ |
| 12 × 1920×1080 |        24,883,200 |          831.016 MiB |     1090.047 MiB | +259.031 MiB | fail   |
| 8 × 1920×1080  |        16,588,800 |          838.141 MiB |     1107.594 MiB | +269.453 MiB | fail   |

Each source buffer existed before the baseline. The candidate then created
distinct Blobs/object URLs and real `<img>` elements, mounted them in a visible
grid, awaited `img.decode()`, two animation frames, and 100 ms while main sampled
main+Renderer+Worker/GPU process working set every 20 ms. Both deltas exceed the
fixed +192 MiB stop line. The lower count did not justify further capacity
search; E0C stopped as bounded.

The sanitized source-tree fingerprint was
`6e12136f051cf8ecb9cc74945391eb1076100c87cda2fd4c0a1399fe4e39768c`.
An independent strict review bound that fingerprint and returned `VALID_STOP`
with high confidence. It found the memory failure valid and warned that the
lifecycle/metadata results must remain probe-scoped. The reviewed OS-temp
harness and synthetic outputs were then deleted.

### E0D derived-preview and full-open failure record

The bounded OS-temp harness used the current sandbox/context-isolation settings,
one static Vite module Worker, no production Renderer imports, no new dependency,
and synthetic data. One Worker decode emitted the same-MIME full canonical and
one aspect-preserving PNG preview. Main validated and owned both; the message
grid received previews only. Preparation and display ran in separate processes;
each display process loaded main-owned pairs before its 500 ms baseline, and
main sampled main+Renderer+Worker/GPU working set every 20 ms.

Executed redacted command shapes:

```sh
E0D_ROOT="<OS temp>/nyx-context-composer-exp-01"
REPO_ROOT="<repo>"
"$REPO_ROOT/apps/desktop/node_modules/.bin/electron-vite" build "$E0D_ROOT" -c "$E0D_ROOT/electron.vite.config.ts"
E0D_RUN_MODE=smoke "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0D_ROOT"
E0D_RUN_MODE=prepare "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0D_ROOT"
E0D_RUN_MODE=grid E0D_REPETITION="<1..3>" "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0D_ROOT"
E0D_RUN_MODE=full E0D_REPETITION=1 "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0D_ROOT"
```

The production build emitted a separate static `image-worker-<hash>.js` chunk.
The valid Stop occurred before `app.asar` loading was rerun, so no packaged E0D
loading result is claimed.

Import and trust-boundary checks passed:

| Evidence          | Result                                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| JPEG visual       | full+preview left red / right blue                                         |
| EXIF orientation  | full 800×1200; preview 341×512                                             |
| PNG alpha         | preserved in full and preview                                              |
| Four daily images | 246.0 / 248.0 / 252.4 ms total; heartbeat ≤11.9 ms; peak delta ≤60.453 MiB |
| One 4K image      | 315.2-326.3 ms; heartbeat ≤11.5 ms; peak delta ≤150.797 MiB                |
| 4K pair           | full 8,366,208 bytes; preview 231,638 bytes; 3840×2160 → 512×288           |

The exact E0C ICC candidate continued to validate. Preview PNGs stayed within
the sealed chunk, byte, edge, and pixel rules.

Three fresh preview-grid processes passed with 12 distinct 1920×1080 images
(24,883,200 full pixels, 2,679,826 preview bytes total):

| Repetition |    Ready | Heartbeat |    Baseline |        Peak |       Delta | Full DOM images |
| ---------: | -------: | --------: | ----------: | ----------: | ----------: | --------------: |
|          1 | 131.4 ms |   11.1 ms | 434.172 MiB | 463.828 MiB | +29.656 MiB |               0 |
|          2 | 131.5 ms |   11.0 ms | 426.250 MiB | 471.281 MiB | +45.031 MiB |               0 |
|          3 | 131.0 ms |   11.1 ms | 425.859 MiB | 471.672 MiB | +45.813 MiB |               0 |

The first fresh full-open process then hit the fixed Stop. Its preview grid was
mounted before baseline. Each cycle fetched a fresh main-owned 8,366,208-byte
typed array, created a Blob/object URL, decoded one 3840×2160 image, then removed
the node and revoked the URL; DOM full-image count returned to zero after each
close.

| Open cycle |   Ready | Main copy | Live full images |
| ---------: | ------: | --------: | ---------------: |
|          1 | 82.8 ms |  0.737 ms |                1 |
|          2 | 77.5 ms |  0.818 ms |                1 |
|          3 | 78.1 ms |  0.751 ms |                1 |

Heartbeat peaked at 12.2 ms, but whole-process working set rose from
496.438 MiB to 767.484 MiB: **+271.047 MiB**, above the fixed +192 MiB line.
The remaining two fresh full-open repetitions were correctly not run after this
valid Stop.

The sanitized source-tree fingerprint was
`d08f54374b7d93eccce1784413374a73d47c2049c4c5f395b7d289d3a036c879`.
Independent strict review recomputed the fingerprint and returned `VALID_STOP`
with high confidence. It found no baseline, sampling, release, or harness defect
that could be repaired within E0D. Its boundary warning is important: this
rejects only the sealed fresh-byte/Blob/object-URL temporary path; it does not
show that derived previews are generally infeasible or choose a product
full-image transport.

The reviewed OS-temp harness and synthetic outputs were then deleted.

E0D result: **STOP**. At this gate's conclusion no count, cumulative-pixel,
preview, product ICC, or transport value was frozen, and E1-E5 remained blocked.
Later E0F/v3.0 evidence and review supersede only the current execution status.

### E0E stable-asset URL security failure record

E0E reopened only E0D's full-open transport/lifetime assumption. A probe-only
standard+secure custom scheme maps one stable opaque URL to one main-authorized
immutable local file. Renderer receives display metadata and URLs only; it must
not receive a JS-owned full typed array, Buffer, local path, raw file error,
Blob, or object URL through preload/IPC.

The protocol keeps Fetch API, CORS, CSP bypass, Service Workers, extensions, and
media streaming privileges disabled. Security evidence must prove authorized
`<img>` loading while Renderer cannot read bytes through any JS API. At minimum,
`fetch` and `XMLHttpRequest` must fail and canvas readback must be cross-origin
blocked; any success stops the gate. Exact GET/host/single-id routes pass and
unknown id, query, credentials/port, wrong host, encoded traversal, and non-GET
shapes fail closed without a path leak. The handler must stream
`net.fetch(file:)` into `Response.body` without a userland full-file read or
buffer.

The measured maximum-image dataset remains one 3840×2160 near-boundary 7.5-8
MiB canonical plus eight distinct 1920×1080 images, with one max-edge 512 PNG
preview each. Three fresh production-build processes mount nine stable preview
URLs before a 500 ms baseline, then open/close the same stable 4K URL three times
with one full DOM node at most and 500 ms post-close waits. Each post-close value
is the median over the final 200 ms. Main samples the whole process group every
20 ms.

Each open must be ≤500 ms, heartbeat ≤50 ms, main sync ≤250 ms, and each
fresh-process peak delta ≤192 MiB. Third post-close working set may be no more
than 16 MiB above first post-close, second may be no more than 16 MiB above
first, and third may be no more than 8 MiB above second. These plateau allowances
are strictly below one 4K RGBA frame. Security failure, path/full-byte exposure,
memory failure, or need for a service/cache/token manager/product code, IPC, or
dependency stops E0E. Production build is required; `app.asar` smoke runs only
if the earlier gates pass. No capacity, ICC, preview, scheme, or transport value
is frozen before the full matrix and independent review pass.

Executed redacted command shapes:

```sh
E0E_ROOT="<OS temp>/nyx-context-composer-exp-01"
REPO_ROOT="<repo>"
"$REPO_ROOT/apps/desktop/node_modules/.bin/electron-vite" build "$E0E_ROOT" -c "$E0E_ROOT/electron.vite.config.ts"
E0E_ROOT="$E0E_ROOT" E0E_RUN_MODE=prepare E0E_REPETITION=1 "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0E_ROOT" --user-data-dir="$E0E_ROOT/user-data-prepare"
E0E_ROOT="$E0E_ROOT" E0E_RUN_MODE=security E0E_REPETITION=1 "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0E_ROOT" --user-data-dir="$E0E_ROOT/user-data-security"
E0E_ROOT="$E0E_ROOT" E0E_RUN_MODE=security E0E_REPETITION=2 "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0E_ROOT" --user-data-dir="$E0E_ROOT/user-data-security-2"
```

The OS-temp production build passed. Synthetic preparation created nine image
pairs in 666.3 ms. The maximum pair was a 3840×2160 JPEG of 8,009,319 bytes and
a 512×288 PNG preview of 500,603 bytes. The remaining eight distinct
1920×1080 full JPEGs were 1,376,705-1,377,688 bytes each and their previews were
501,437-501,555 bytes.

Security observations:

| Check                                               | Result                   |
| --------------------------------------------------- | ------------------------ |
| Authorized `<img>`                                  | 3840×2160 loaded         |
| Renderer `fetch`                                    | blocked; `TypeError`     |
| Renderer XHR                                        | blocked; error event     |
| Canvas readback                                     | blocked; `SecurityError` |
| Valid GET                                           | 200                      |
| Unknown id / query / wrong host / encoded traversal | 404                      |
| Credentials                                         | rejected before handler  |
| Non-GET                                             | 405                      |
| Safe-surface local path                             | absent                   |
| Longest observed handler sync segment               | 1.841 ms                 |

The first explicit-port fixture used `:443` and returned 200. Because that could
be confused with default-port normalization, the only bounded harness repair
changed the fixture to non-default `:444` and recorded every request received by
the handler. The retry also returned 200. Its handler record contained only the
canonical no-port URL: Chromium had removed `:444` before `protocol.handle`.
Consequently the handler's exact `url.port` rejection could not run.

The sanitized source-tree fingerprint was
`7e11f7d0c9c87f7fd809d9a51c8aa1330687f3a5bcd136d1a6d8070d0a27053d`.
Independent strict review recomputed the fingerprint and returned `VALID_STOP`
with high confidence. It found that changing the standard scheme/URL shape or
relaxing explicit-port rejection would cross E0E's non-goals. The other security
passes remain probe-scoped.

The reviewed OS-temp harness and synthetic outputs were then deleted.

E0E result: **STOP**. Memory repetitions and `app.asar` were correctly not run.
No capacity, ICC, preview, scheme, URL, or transport value is frozen. This
rejects only E0E's sealed standard-scheme exact-route model; it does not prove
all stable local URL directions infeasible. At that point E1-E5 remained blocked
pending a new user-approved feasibility gate and review; the current status is
at the top of this document.

### E0F passed evidence record

E0F policy A changes only the authorization identity. Main validates the
canonical `Request` received by `protocol.handle`: `GET`, exact scheme, exact
host, and one main-known opaque id. Raw spelling erased by Chromium before that
boundary, including the observed `:444` alias, is the same resource identity.
Observable query, wrong host, unknown id, encoded traversal, and non-GET remain
unauthorized; credentials remain rejected before handling.

Identity and every memory repetition use unique initially empty user-data
profiles. One fresh identity/security phase must start its full-id handler
counter at 0, then load canonical → `:444` alias → canonical with removal and
500 ms settle between loads. All three must map to the same main asset id and
identical handler-observed canonical URL; the counter must be `0→1→1→1`. DOM
`src`/`currentSrc` may retain author spelling.

After the warmed identity process exits, a second process must reuse the same
profile and scheme while main omits the target id and temporarily moves its file
outside the served set. Without `clearCache`, the old URL must fail to load.
This prevents disk cache from outliving process-lifetime main authorization.
Fetch, XHR, and canvas readback also remain blocked; no JS bytes or local path
may surface.

Only after identity/security pass do three fresh production-build memory
processes mount nine previews, take a 500 ms baseline, and open/close the same
canonical 4K URL three times. Each process must have exactly one full handler
hit from a phase-scoped `0→1→1→1` counter, open ≤500 ms, heartbeat ≤50 ms,
main sync ≤250 ms, and peak delta ≤192 MiB. Post-close plateau remains
second/third ≤first+16 MiB and third ≤second+8 MiB. `app.asar` smoke runs only
after all earlier gates pass.

Any second handler hit after the first full load, cached load after main
revocation, identity divergence, JS/path exposure, security/memory failure, or
need for manual cache/token service/new URL shape/non-standard scheme/product
code or dependency stops E0F.

Executed redacted command shapes:

```sh
E0F_ROOT="<OS temp>/nyx-context-composer-exp-01"
REPO_ROOT="<repo>"
"$REPO_ROOT/apps/desktop/node_modules/.bin/electron-vite" build "$E0F_ROOT" -c "$E0F_ROOT/electron.vite.config.ts"
E0F_RUN_MODE=prepare "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0F_ROOT" --user-data-dir="$E0F_ROOT/user-data-prepare"
E0F_RUN_MODE=identity "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0F_ROOT" --user-data-dir="$E0F_ROOT/user-data-identity"
E0F_RUN_MODE=revocation "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0F_ROOT" --user-data-dir="$E0F_ROOT/user-data-identity"
E0F_RUN_MODE=memory E0F_REPETITION=<1..3> "$REPO_ROOT/apps/desktop/node_modules/.bin/electron" "$E0F_ROOT" --user-data-dir="$E0F_ROOT/user-data-memory-<1..3>"
mkdir -p "$E0F_ROOT/package-stage"
cp -R "$REPO_ROOT/apps/desktop/node_modules/electron/dist/Electron.app" "$E0F_ROOT/NyxE0F.app"
cp "$E0F_ROOT/package.json" "$E0F_ROOT/package-stage/package.json"
cp -R "$E0F_ROOT/out" "$E0F_ROOT/package-stage/out"
node "$REPO_ROOT/node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar/bin/asar.js" pack "$E0F_ROOT/package-stage" "$E0F_ROOT/NyxE0F.app/Contents/Resources/app.asar"
E0F_RUN_MODE=smoke "$E0F_ROOT/NyxE0F.app/Contents/MacOS/Electron" --user-data-dir="$E0F_ROOT/user-data-packaged"
```

Environment: Electron 41.7.2, Chromium 146.0.7680.216, Node 24.15.0,
macOS 26.6.1 arm64, electron-vite 5.0.0, and Vite 8.0.16. The synthetic
dataset contained one 3840×2160 / 8,009,319-byte JPEG plus eight distinct
1920×1080 JPEGs, each with a max-edge 512 PNG preview.

| Identity/security check                           | Result                              |
| ------------------------------------------------- | ----------------------------------- |
| Canonical → `:444` alias → canonical              | 3840×2160; hits `0→1→1→1`           |
| Handler-observed full request                     | one canonical URL and opaque id     |
| Renderer fetch / XHR / canvas                     | blocked / blocked / `SecurityError` |
| Unknown/query/wrong-host/traversal/non-GET routes | 404 / 404 / 404 / 404 / 405         |
| Credentials                                       | rejected before handler             |
| Local path exposure                               | none                                |
| Same-profile restart after id/file revocation     | load failed; no `clearCache`        |

| Run | Baseline MiB | Peak MiB | Delta MiB | Open ms           | Post-close MiB              | Heartbeat ms | Main sync ms | Hits      |
| --: | -----------: | -------: | --------: | ----------------- | --------------------------- | -----------: | -----------: | --------- |
|   1 |      420.063 |  525.359 |   105.297 | 89.6 / 6.0 / 5.4  | 522.281 / 522.578 / 518.406 |         12.3 |        1.684 | `0→1→1→1` |
|   2 |      422.414 |  525.969 |   103.555 | 89.6 / 6.3 / 8.4  | 525.391 / 525.609 / 522.469 |         11.4 |        1.667 | `0→1→1→1` |
|   3 |      423.188 |  528.031 |   104.844 | 89.6 / 5.8 / 11.1 | 526.047 / 526.359 / 524.516 |         12.9 |        1.949 | `0→1→1→1` |

All fixed identity, revocation, JS isolation, open, heartbeat, main-sync,
whole-process peak, and post-close plateau lines passed. No Renderer Blob URL
or measured-path userland full read occurred.

The first strict review bound source fingerprint
`14637395415f46fa6697af6917b08b143e9e81890690bd7e1210850eff2a6961` and accepted
every gate except packaged runtime provenance. The evidence-only repair added
`app.isPackaged`, `app.getAppPath()`, and `process.execPath` to the smoke result.
The rerun recorded `appPath` inside `NyxE0F.app/Contents/Resources/app.asar`, the
matching App executable, a 3840×2160 load, and one handler hit. `app.isPackaged`
was false because the harness copied Electron.app rather than building a signed
product bundle; the sealed gate required `app.asar` loading, not product
packaging. Scoped review bound source fingerprint
`d6d41f4f8b52626e0ecd873f134791f7fec2b553f2cb5f900285f478ec8642fc`, verified
the `app.asar` contents against the production build, and returned PASS.

The reviewed OS-temp harness, generated images, profiles, and App bundle were
then deleted. E0F result: **PASS**. This proves only the bounded feasibility
direction in the recorded environment. E0F itself did not freeze product
protocol, shared/IPC contracts, capacity, or ICC policy; the later v3.0 plan made
those choices and passed `RC-V3-PLAN-03`.

## Historical v1.8 candidate limits (status reference)

This is the status reference for v1.8's historical candidate values. No
capacity limit of any kind is frozen, and none of these values is implementation
permission:

| Limit                       | Candidate value |
| --------------------------- | --------------: |
| Types                       |       PNG, JPEG |
| Images per turn             |               4 |
| Draft source bytes/image    |           8 MiB |
| Canonical bytes/image       |           8 MiB |
| New canonical bytes/turn    |          16 MiB |
| Current-thread image bytes  |          32 MiB |
| Current-thread image count  |         pending |
| Current-thread total pixels |         pending |
| Maximum edge                |         8192 px |
| Maximum pixels              |       8,294,400 |

Under the failed v1.8 candidate, Renderer would have owned the draft-source check
for early feedback while main remained authoritative for canonical bytes, MIME,
dimensions, metadata absence, and capacity checks. The active invariant that
survives the failed candidate is main authority and durable ownership, not these
specific checks or values.

## Gate decision

E0B result: **STOP**.

- E0 had already rejected synchronous main canonicalization
- E0B proved the static Worker loads in dev, build, and `app.asar`
- the native JPEG encoder emits an ICC APP2 segment that v1.8 requires main to
  reject, so the no-dependency same-MIME Worker candidate fails its metadata gate
- no capacity limit of any kind is frozen
- policy A then authorized the bounded E0C evidence run recorded above; E0B
  itself remained stopped

E0C result: **STOP**.

- the exact ICC hypothesis passed, but it is not frozen for product use
- both bounded visible-grid candidates exceeded the fixed whole-process memory
  stop line
- independent strict review returned `VALID_STOP`; no local harness repair or
  third capacity candidate is authorized
- no capacity limit is frozen; Plan-First `review-ready` was not run
- later E0F passed its bounded canonical-request/native-cache feasibility gate;
  the reviewed v3.0 plan now makes E1 executable while E2-E5 remain ordered
