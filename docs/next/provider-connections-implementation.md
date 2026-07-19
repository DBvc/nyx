# Provider Connections Implementation Plan

Status: Implementation plan for the first agent-workbench workstream.

This document applies only when executing the explicit agent-workbench task
slices in [agent-workbench-task-slices.md](./agent-workbench-task-slices.md).
For ordinary work, the active product scope remains
[v1-min-chat-implementation-plan.md](../v1-min-chat-implementation-plan.md).

The first workstream deliberately implements one bounded
`openai-compatible` transport path. The follow-up architecture for explicit
provider identity, capability profiles, and main-only adapters is documented in
[provider-adapter-direction.md](./provider-adapter-direction.md). That direction
document is not permission to implement the follow-up work before it is split
into separately approved task slices.

## Outcome

Users can configure provider access inside Nyx instead of editing `.env`:

- open Settings
- add an OpenAI-compatible provider
- save base URL, API key, and one or more model ids
- set a default provider/model target
- return to the main thread
- send a message through the saved provider

The existing `.env` provider path remains a development fallback when there is
no persisted default target.

## Ownership

`apps/desktop/electron/main` owns:

- provider profile persistence
- encrypted secret persistence
- provider target resolution
- provider calls
- provider test/model refresh network requests
- normalized errors sent to renderer

`apps/desktop/electron/preload` owns:

- narrow typed wrappers for fixed IPC channels
- no generic `invoke`
- no raw Electron API exposure

`apps/desktop/src` owns:

- Settings form state
- Connections UI presentation
- non-secret provider profile editing through Settings only
- redacted connection status presentation

`runtime/ocaml` is out of scope.

## Storage Model

Use Electron-main-owned JSON files under `app.getPath('userData')`:

```text
<userData>/settings/connections.json
<userData>/settings/secrets.json
```

`connections.json` stores non-secret provider and model metadata.
`secrets.json` stores encrypted secret payloads only.

Rules:

- Never persist plaintext API keys.
- Never return stored secrets through renderer-facing APIs.
- File missing means an empty store.
- Malformed JSON or schema-invalid persisted data must fail closed.
- Do not silently replace malformed persisted files with defaults.
- Do not auto-import `.env` tokens into settings.

## Shared Domain

Add shared domain types under:

```text
apps/desktop/shared/connections/types.ts
apps/desktop/shared/connections/ipc.ts
```

Initial shared types cover:

- provider kind: `openai-compatible`
- provider profile summary/detail
- model profile
- connection target
- overview
- save provider input
- default target input
- provider test result
- refresh models result
- Connections-specific safe error/result shape

Do not add `connections` as a required field on `NyxDesktopApi` until the
preload and main handlers are implemented in the typed bridge slice.

No output type may contain:

- API key
- bearer token
- Authorization header
- raw secret
- raw request body

Settings-facing detail output may include non-secret provider metadata such as
display name, provider kind, base URL, enabled state, model ids, and default
target. Those details must be reachable only through Connections Settings APIs.
Non-settings surfaces must use redacted status summaries.

## Resolver Model

Chat execution should resolve the effective provider config in Electron main:

```text
1. Future explicit target if present and valid.
2. Persisted default target if configured.
3. Env fallback: NYX_API_BASE_URL, NYX_API_TOKEN, NYX_MODEL.
4. Safe config_missing error.
```

The resolver must be lazy. Importing a module must not call:

- `app.getPath`
- `safeStorage`
- provider network
- OCaml runtime
- child process startup

## Error Model

Do not add public chat error codes in this workstream. Chat path failures map to
the existing `NyxChatErrorCode` set.

Chat path mapping:

| Condition                                           | Chat error                       |
| --------------------------------------------------- | -------------------------------- |
| no persisted default and env missing                | `config_missing`, non-retryable  |
| invalid env base URL                                | `config_missing`, non-retryable  |
| persisted default points to disabled provider/model | `config_missing`, non-retryable  |
| persisted provider missing secret                   | `config_missing`, non-retryable  |
| secret decrypt failure                              | `config_missing`, non-retryable  |
| malformed persisted settings/secrets                | `config_missing`, non-retryable  |
| future explicit target missing/invalid              | `invalid_request`, non-retryable |
| upstream 401/403                                    | `auth_failed`                    |
| upstream 429                                        | `rate_limited`                   |
| provider network failure                            | `network_error`                  |

Connections IPC should use its own safe error/result contract. It should not
reuse `NyxChatError` as the long-term Settings API error model.

Renderer-facing errors must not expose:

- local secret file paths
- token values
- Authorization headers
- full request bodies
- raw secret payloads
- full private provider URLs in non-settings surfaces

## Provider Test And Model Refresh

`Test connection` is implemented only when it can perform a real tiny
non-streaming OpenAI-compatible chat completion through Electron main.

This first-workstream test proves endpoint reachability, authentication, and
basic request acceptance. It does not certify full streaming compatibility,
reasoning-field handling, tool calling, or every model capability. A later
adapter-aware test must report those capabilities separately instead of
overloading one success state.

`Refresh models` is implemented only when it can call `/v1/models` and merge
discovered models without deleting manual models.

Before that implementation exists, the renderer must not show fake working
buttons for these actions.

Provider utility tests must cover:

- HTTP 2xx success
- 401/403 authentication failure
- 429 rate limit
- timeout or network error
- `/v1/models` unsupported/failure
- manual models preserved
- no secret leakage in error details

## Verification

Focused desktop checks:

```sh
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:test
```

Resolver/chat-session changes also require:

```sh
mise run runtime:chat-state:check
```

Final workstream validation:

```sh
mise run check
```

## Stop Conditions

Stop and re-plan if:

- secret storage cannot encrypt and the only fallback would be plaintext
- renderer would need to read stored secrets or raw provider config
- provider resolver initialization must run before Electron app readiness
- malformed persisted settings would be silently overwritten
- runtime-backed chat state behavior breaks
- the slice requires tools, shell execution, artifacts, history, or OCaml
  provider integration
