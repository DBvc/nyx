# Context Composer Experiment Runthrough

Status: E0 and E0B stopped; E1-E5 blocked; a new user decision is required.

The v1.8 Worker/JPEG/allowlist design and every capacity value below are failed
historical candidate material, non-operative, and not implementation permission.
No capacity limit of any kind is frozen. A revised user-approved gate may change
input types, canonicalization executor, metadata policy, capacities, and
slice/file details.

Probe date: 2026-08-09

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
- E1-E5 remain blocked; continuing requires a user-approved revised gate, which
  may change input types, canonicalization executor, metadata policy,
  capacities, and slice/file details
