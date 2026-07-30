# LLM Chat Runthrough

Original runthrough: 2026-06-27

Last updated: 2026-07-30

## Scope

This runthrough verifies the current Electron desktop `v1 min chat` path with an
OpenAI-compatible provider.

At the time of this 2026-06-27 provider runthrough, the OCaml runtime had not
yet been connected to the desktop chat path. As of 2026-07-07, Electron main uses
runtime-backed chat state by default. This runthrough remains provider/UI
evidence; runtime-backed chat state is covered by `mise run runtime:chat-state:check`.

## Provider

- Provider host: `ark.cn-beijing.volces.com`
- Model: `glm-5.2`
- Credential handling: provider token stayed in local environment only
- Redaction: this document does not include token values, the full provider URL,
  authorization headers, request logs, or screenshots

## Cases

| Case            | Result | Evidence                                                                                                                                                  |
| --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing config  | Pass   | Starting desktop without a configured local `.env` showed the provider setup state listing `NYX_API_BASE_URL`, `NYX_API_TOKEN`, and `NYX_MODEL optional`. |
| Provider setup  | Pass   | After configuring the local `.env` and launching with `mise run desktop:dev`, provider setup no longer blocked the chat surface.                          |
| Basic streaming | Pass   | A normal prompt produced a streamed assistant response in the desktop UI.                                                                                 |
| Stop            | Pass   | Stopping an active response ended the stream and left the chat usable.                                                                                    |
| Retry           | Pass   | Retry was exercised from the desktop UI and completed without a regression.                                                                               |
| New chat        | Pass   | `New chat` cleared the in-memory conversation and returned the UI to the empty chat state.                                                                |

## Notes

- The first auth attempt used an incorrect local API key and returned an
  authentication error. The key was corrected locally before the passing
  runthrough.
- The local `.env` file is intentionally not committed.

## Provider Compatibility C4 Acceptance

Date: 2026-07-30

### Evidence Boundary

The live path used the existing saved version-1 Volcano Ark connection and its
configured `glm-5.2` model. Credentials remained in Electron main and were not
written to this document, screenshots, fixtures, or command output.

The acceptance machine required its configured network proxy. The first direct
Electron fetch failed safely and restored with Retry after restart. Relaunching
with Node environment-proxy support enabled allowed that same Retry to complete.
This was an acceptance-environment adjustment, not an application code change
or a compatibility-core capability claim.

A content-free stream probe against the same live target counted non-empty
`reasoning_content` and final `content` events and observed `finish_reason=stop`;
it did not print or persist either text stream. Terminal states that could not
be induced reliably on the live service used an isolated temporary user data
directory and a local OpenAI-compatible SSE fixture.

### Acceptance Results

| Case                                 | Result | Evidence                                                                                                                                                                                               |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generic OpenAI-compatible streaming  | Pass   | The isolated `.env` fallback path combined two `delta.content` chunks and completed normally. The live saved target also completed through the same generic request mapping.                           |
| Ark-compatible text path             | Pass   | The saved Ark target completed `C4 generic stream OK` without provider-specific request fields.                                                                                                        |
| GLM reasoning followed by final text | Pass   | The live field-count probe observed both reasoning and final-text events with `finish_reason=stop`; the desktop showed only final answer text.                                                         |
| Stop during live reasoning           | Pass   | While the UI showed `Thinking...` and `Waiting for response`, Stop produced `Response stopped` with no reasoning text. The cancelled state restored after a full restart.                              |
| Stop during live text streaming      | Pass   | Stop after the first visible text delta preserved the partial draft and `Response stopped`; both restored after a full restart.                                                                        |
| Reasoning-only terminal response     | Pass   | The isolated fixture produced a retryable failed turn stating that reasoning finished without an answer. It did not create an empty completed message or display fixture reasoning.                    |
| `length` without partial text        | Pass   | The isolated fixture produced the approved retryable output-limit failure and offered Retry.                                                                                                           |
| `length` after partial text          | Pass   | `Fixture partial answer` remained visible as a failed durable draft with Retry, restored after restart, and stayed one stable turn after Retry.                                                        |
| Provider failure and Retry identity  | Pass   | A live network failure restored with Retry after restart; retry completed without duplicating the user turn.                                                                                           |
| Unsupported model refresh            | Pass   | Refresh on an existing no-key test connection failed safely while its manual `glm-5.2` model remained present.                                                                                         |
| Existing version-1 Connections       | Pass   | The saved version-1 file loaded as the live default target and retained its 2026-07-19 modification time; C0-C4 did not rewrite it.                                                                    |
| Renderer security boundary           | Pass   | Connections exposed only `Key stored`; the live reasoning run showed activity/final text but no raw reasoning, token, or provider payload. Automated bridge and session tests cover the same boundary. |

### Automated Verification

The required C4 checks passed on 2026-07-30:

- `mise run desktop:check` — 253 desktop tests passed, 16 skipped; 8
  runtime-backed chat-state integration tests passed; typecheck, compatibility
  typecheck, lint, and build passed
- `mise run check`
- `mise run format-check`
- `git diff --check`

### Interpretation

The completed workstream is a compatibility core, not provider-specific request
optimization. It preserves one generic OpenAI Chat Completions request shape,
recognizes the proven response differences, and applies deterministic terminal
policy in Electron main.

It handles reasoning-only and output-budget exhaustion safely, but it does not
prevent a provider from exhausting its output budget. Adapter registries,
capability profiles, Connections migrations, provider-specific request
parameters, new Settings/model-picker UI, tools, persistent history, and native
protocol adapters remain out of scope.
