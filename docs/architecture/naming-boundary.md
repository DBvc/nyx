# Nyx Naming Boundary

Status: Draft.

This document defines where TypeScript names in the desktop app should keep the
`Nyx` product prefix. The rule is intentionally narrow: use `Nyx` for product,
cross-process, IPC, and environment boundaries. Do not use `Nyx` as an ordinary
module ownership marker inside Electron main or renderer implementation code.

The current product scope remains v1 min chat. This naming cleanup must not
connect Electron to the OCaml runtime, change provider streaming, or change
desktop chat behavior.

## Rule

`Nyx` is a boundary marker, not a locality marker.

- Keep `Nyx` when the name is part of a product-level typed contract, preload
  contract, `window.nyx` surface, IPC channel constant, environment variable
  name, or user/product-facing brand string.
- Remove `Nyx` from implementation-local symbols where the file path and module
  already provide ownership.
- If a candidate in the rename list is found to be part of shared, preload,
  `window.nyx`, IPC, or environment contract, stop and re-plan that symbol
  before changing it.

## Keep Nyx

| Boundary                         | Keep                                                                                                                                                                                                                                               | Reason                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared chat contract             | `NyxChatRequest`, `NyxChatCancellationRequest`, `NyxChatEvent`, `NyxChatError`, `NyxChatMessage`, `NyxChatInputMessage`, `NyxChatRunStatus`, `NyxChatTurnIntent`, other exported `NyxChat*` contract types, and shared `nyxChat*` contract helpers | These are typed contracts shared by Electron main, preload, and renderer. The product prefix distinguishes the app-level chat protocol from local implementation types. |
| Desktop preload/window contract  | `NyxDesktopApi`, `NyxDesktopChatApi`, `NyxDesktopProviderApi`, and the `window.nyx` surface                                                                                                                                                        | These names define the narrow renderer bridge. They are not internal renderer state.                                                                                    |
| Shared provider contract         | `NyxProviderStatus`, `NyxProviderMissingEnv`                                                                                                                                                                                                       | Provider status crosses from Electron main to renderer without exposing secrets.                                                                                        |
| IPC channel constants            | `NYX_CHAT_IPC_CHANNELS`, `NYX_PROVIDER_IPC_CHANNELS`                                                                                                                                                                                               | These are app IPC boundary constants. Do not rename channel constants or channel string values in this cleanup.                                                         |
| Environment variable names       | `NYX_API_BASE_URL`, `NYX_API_TOKEN`, `NYX_MODEL`, `NYX_RUNTIME_PATH`, `NYX_RUNTIME_PATH_ENV`                                                                                                                                                       | These names are external process configuration boundaries. Do not rename env strings or the env-name constant.                                                          |
| Product copy and diagnostic text | Product title, UI labels, provider notices, test fixture content, and diagnostic messages that intentionally say `Nyx`                                                                                                                             | Brand and message text are not implementation symbol ownership. This issue does not change UI copy or error semantics.                                                  |

## Rename

| Area                                    | Rename                                                                                                                                                                                                 | Target rule                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron main runtime path internals    | `NyxRuntimePathSource`, `NyxRuntimePathUnavailableReason`, `NyxRuntimePathAvailable`, `NyxRuntimePathUnavailable`, `NyxRuntimePathResolution`, `ResolveNyxRuntimePathOptions`, `resolveNyxRuntimePath` | Use `RuntimePathSource`, `RuntimePathUnavailableReason`, `RuntimePathAvailable`, `RuntimePathUnavailable`, `RuntimePathResolution`, `ResolveRuntimePathOptions`, `resolveRuntimePath`. Keep `NYX_RUNTIME_PATH_ENV` and the `NYX_RUNTIME_PATH` string unchanged. |
| Electron main runtime ping internals    | `NyxRuntimePingErrorCode`, `NyxRuntimePingError`, `PingNyxRuntimeOptions`, `PingNyxRuntimeResult`, `pingNyxRuntimeOnce`                                                                                | Use `RuntimePingErrorCode`, `RuntimePingError`, `PingRuntimeOptions`, `PingRuntimeResult`, `pingRuntimeOnce`. Diagnostic messages may still refer to the Nyx runtime.                                                                                           |
| Electron main runtime health internals  | `NyxRuntimeHealthErrorCode`, `NyxRuntimeHealthSuccess`, `NyxRuntimeHealthUnavailable`, `NyxRuntimeHealthError`, `NyxRuntimeHealthResult`, `CheckNyxRuntimeHealthOptions`, `checkNyxRuntimeHealth`      | Use `RuntimeHealthErrorCode`, `RuntimeHealthSuccess`, `RuntimeHealthUnavailable`, `RuntimeHealthError`, `RuntimeHealthResult`, `CheckRuntimeHealthOptions`, `checkRuntimeHealth`. The health result remains Electron-main internal.                             |
| Electron main chat session internals    | `NyxChatSessionManager`, `validateNyxChatRequest`                                                                                                                                                      | Use `ChatSessionManager`, `validateChatRequest`. Keep parameter and payload types such as `NyxChatRequest` because those are shared contracts.                                                                                                                  |
| Electron main provider config internals | `NyxChatRuntimeConfig`, `readNyxProviderStatus`, `readNyxChatRuntimeConfig`                                                                                                                            | Use `ChatProviderConfig`, `readProviderStatus`, `readChatProviderConfig`. The new name should not imply OCaml runtime ownership; this is current provider configuration in Electron main.                                                                       |
| Electron main chat error internals      | `NyxChatBridgeError`, `createNyxChatBridgeError`, `toNyxChatError`                                                                                                                                     | Use `ChatBridgeError`, `createChatBridgeError`, `toChatError`. Keep the shared return type `NyxChatError`.                                                                                                                                                      |
| Renderer local chat state               | `NyxChatState`, `NyxChatTurnRequest`, `NyxRetryableChatTurn`, `initialNyxChatState`                                                                                                                    | Use `ChatState`, `ChatTurnRequest`, `RetryableChatTurn`, `initialChatState`. Keep imported shared `NyxChat*` types unchanged.                                                                                                                                   |
| Renderer local chat reducer             | `NyxChatAction`, `nyxChatReducer`                                                                                                                                                                      | Use `ChatAction`, `chatReducer`. Action strings and reducer behavior must remain unchanged.                                                                                                                                                                     |

Do not keep compatibility aliases for renamed implementation-local symbols. An
alias would create two accepted names for the same local concept and weaken this
boundary.

## Do not touch

| Surface                     | Do not change                                                                                                                      | Reason                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Shared contracts            | Shape, field names, event names, status values, error codes, exported `NyxChat*` / `NyxProvider*` / `NyxDesktop*` boundary names   | These are cross-process typed contracts and are outside this implementation-local rename. |
| Preload and renderer bridge | `window.nyx` shape, `NyxDesktopApi` shape, preload API methods, typed subscribe/start/cancel/reset surface                         | This issue does not redesign the desktop bridge.                                          |
| IPC                         | `NYX_CHAT_IPC_CHANNELS`, `NYX_PROVIDER_IPC_CHANNELS`, channel string values, handler behavior                                      | IPC compatibility and behavior must remain stable.                                        |
| Environment and secrets     | `NYX_API_BASE_URL`, `NYX_API_TOKEN`, `NYX_MODEL`, `NYX_RUNTIME_PATH`, `NYX_RUNTIME_PATH_ENV`, env-read behavior, secret ownership  | Electron main continues to own env and provider credentials; renderer must not read them. |
| Provider behavior           | Provider request shape, streaming semantics, cancellation, retry, New chat/reset behavior, default model behavior, error semantics | This naming issue is behavior-preserving.                                                 |
| Runtime behavior            | `runtime/ocaml`, runtime protocol semantics, runtime artifact resolver behavior, resolver candidate list, child-process lifecycle  | This issue does not connect or extend the OCaml runtime.                                  |
| UI and product scope        | UI copy, layout, visual state, interaction behavior, v1 min chat scope                                                             | Product behavior remains plain text chat with streaming, stop, retry, and new chat.       |

## Review Guidance

Use targeted symbol checks, not a global "remove every Nyx" rule. After the
rename tasks, `Nyx` should still appear in shared contracts, IPC/env constants,
product copy, diagnostics, and tests. It should not remain as a prefix for the
implementation-local symbols listed in the `Rename` table unless a specific
symbol has been re-planned as a boundary name.
