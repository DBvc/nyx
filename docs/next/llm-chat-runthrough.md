# LLM Chat Runthrough

Date: 2026-06-27

## Scope

This runthrough verifies the current Electron desktop `v1 min chat` path with an
OpenAI-compatible provider. The OCaml runtime is still not connected to the
desktop chat path.

## Provider

- Provider host: `ark.cn-beijing.volces.com`
- Model: `glm-5.2`
- Credential handling: provider token stayed in local environment only
- Redaction: this document does not include token values, the full provider URL,
  authorization headers, request logs, or screenshots

## Cases

| Case            | Result | Evidence                                                                                                                                              |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing config  | Pass   | Starting desktop without exported provider env showed the provider setup state listing `NYX_API_BASE_URL`, `NYX_API_TOKEN`, and `NYX_MODEL optional`. |
| Provider setup  | Pass   | After exporting the local `.env`, provider setup no longer blocked the chat surface.                                                                  |
| Basic streaming | Pass   | A normal prompt produced a streamed assistant response in the desktop UI.                                                                             |
| Stop            | Pass   | Stopping an active response ended the stream and left the chat usable.                                                                                |
| Retry           | Pass   | Retry was exercised from the desktop UI and completed without a regression.                                                                           |
| New chat        | Pass   | `New chat` cleared the in-memory conversation and returned the UI to the empty chat state.                                                            |

## Notes

- The first auth attempt used an incorrect local API key and returned an
  authentication error. The key was corrected locally before the passing
  runthrough.
- The local `.env` file is intentionally not committed.
