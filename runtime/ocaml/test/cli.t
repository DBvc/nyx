CLI ping writes stdout only.

  $ ../bin/main.exe ping >stdout.log 2>stderr.log
  $ cat stdout.log
  pong
  $ cat stderr.log

Protocol ping writes one NDJSON response on stdout and leaves stderr empty.

  $ printf '{"type":"ping","id":"req_1"}\n' | ../bin/main.exe protocol >stdout.log 2>stderr.log
  $ cat stdout.log
  {"type":"pong","id":"req_1"}
  $ cat stderr.log

Protocol chat reducer action writes the state snapshot on stdout and leaves stderr empty.

  $ printf '{"type":"chat_reducer_action","id":"proto_1","action":"submit_user_message","turn_request_id":"turn-1","user_message_id":"user-1","assistant_message_id":"assistant-1","content":"Hello"}\n' | ../bin/main.exe protocol >stdout.log 2>stderr.log
  $ cat stdout.log
  {"type":"chat_reducer_state","id":"proto_1","state":{"transcript":[{"id":"user-1","role":"user","content":"Hello"}],"current_turn":{"type":"active","turn_request_id":"turn-1","user_message_id":"user-1","assistant_message_id":"assistant-1","draft":"","phase":"submitted"}}}
  $ cat stderr.log

Invalid protocol input writes stderr only and exits nonzero.

  $ printf '{"type":"ping"}\n' | ../bin/main.exe protocol >stdout.log 2>stderr.log
  [1]
  $ cat stdout.log
  $ cat stderr.log
  nyx-runtime protocol error: missing id
