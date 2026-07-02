module Protocol = Nyx_runtime.Runtime_protocol
module Chat = Nyx_runtime.Chat

let turn_1 = Chat.Request_id.of_string "turn-1"
let user_1 = Chat.Message_id.of_string "user-1"
let assistant_1 = Chat.Message_id.of_string "assistant-1"
let system_1 = Chat.Message_id.of_string "system-1"
let assistant_done_1 = Chat.Message_id.of_string "assistant-done-1"

let runtime_error message =
  let open Chat.Runtime_error in
  { message }

let reduce action state = Chat.reduce state action

let check_response_line expected line =
  match Protocol.handle_request_line line with
  | Ok actual -> Alcotest.(check string) "response line" expected actual
  | Error error -> Alcotest.fail (Protocol.error_to_string error)

let check_error expected line =
  match Protocol.handle_request_line line with
  | Ok response -> Alcotest.fail ("expected error, got response: " ^ response)
  | Error actual ->
      Alcotest.(check string)
        "error message" expected
        (Protocol.error_to_string actual)

let test_valid_ping_returns_matching_pong () =
  check_response_line "{\"type\":\"pong\",\"id\":\"req_1\"}"
    "{\"type\":\"ping\",\"id\":\"req_1\"}"

let test_multiple_ping_lines_are_independent () =
  let lines =
    [
      ( "{\"type\":\"ping\",\"id\":\"req_1\"}",
        "{\"type\":\"pong\",\"id\":\"req_1\"}" );
      ( "{\"type\":\"ping\",\"id\":\"req_2\"}",
        "{\"type\":\"pong\",\"id\":\"req_2\"}" );
    ]
  in
  List.iter (fun (line, expected) -> check_response_line expected line) lines

let test_bad_json_is_rejected () =
  match Protocol.handle_request_line "{\"type\":\"ping\"" with
  | Ok response -> Alcotest.fail ("expected bad JSON, got response: " ^ response)
  | Error (Protocol.Invalid_json _) -> ()
  | Error error -> Alcotest.fail (Protocol.error_to_string error)

let test_missing_id_is_rejected () =
  check_error "missing id" "{\"type\":\"ping\"}"

let test_unknown_type_is_rejected () =
  check_error "unknown type: start_turn"
    "{\"type\":\"start_turn\",\"id\":\"req_1\"}"

let check_chat_action expected line =
  match Protocol.decode_request_line line with
  | Ok (Protocol.Chat_reducer_action { id; action }) ->
      Alcotest.(check string) "protocol id" "proto_1" id;
      Alcotest.(check bool) "chat reducer action" true (action = expected)
  | Ok (Ping _) -> Alcotest.fail "expected chat reducer action, got ping"
  | Error error -> Alcotest.fail (Protocol.error_to_string error)

let test_chat_reducer_action_contract_is_decoded () =
  let cases =
    [
      ( "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}",
        Protocol.Submit_user_message
          {
            turn_request_id = "turn-1";
            user_message_id = "user-1";
            assistant_message_id = "assistant-1";
            content = "Hello";
          } );
      ( "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"start_assistant\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\"}",
        Start_assistant
          { turn_request_id = "turn-1"; assistant_message_id = "assistant-1" }
      );
      ( "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"append_delta\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"snapshot\":\"Partial\"}",
        Append_delta
          {
            turn_request_id = "turn-1";
            assistant_message_id = "assistant-1";
            snapshot = "Partial";
          } );
      ( "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"complete\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"final_content\":\"Done\"}",
        Complete
          {
            turn_request_id = "turn-1";
            assistant_message_id = "assistant-1";
            final_content = "Done";
          } );
      ( "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"cancel\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"final_content\":\"\"}",
        Cancel
          {
            turn_request_id = "turn-1";
            assistant_message_id = "assistant-1";
            final_content = "";
          } );
      ( "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"fail\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"error\":{\"message\":\"Network \
         failed\"}}",
        Fail
          {
            turn_request_id = "turn-1";
            assistant_message_id = "assistant-1";
            error_message = "Network failed";
          } );
      ( "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"retry_failed\",\"turn_request_id\":\"turn-1\"}",
        Retry_failed { turn_request_id = "turn-1" } );
      ( "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"clear\"}",
        Clear );
    ]
  in
  List.iter (fun (line, expected) -> check_chat_action expected line) cases

let test_chat_reducer_action_uses_turn_request_id () =
  check_error "missing field: turn_request_id"
    "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"retry_failed\",\"request_id\":\"turn-1\"}"

let test_unknown_chat_reducer_action_is_rejected () =
  check_error "unknown action: start_turn"
    "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"start_turn\",\"turn_request_id\":\"turn-1\"}"

let test_chat_reducer_request_requires_session_handler () =
  check_error "stateful request requires session"
    "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"clear\"}"

let test_chat_reducer_state_encodes_transcript_roles_and_no_turn () =
  let message id role content =
    let open Chat.Message in
    { id; role; content }
  in
  let state =
    {
      Chat.transcript =
        [
          message system_1 System "System rules";
          message user_1 User "Hello";
          message assistant_done_1 Assistant "Done";
        ];
      current_turn = No_turn;
    }
  in
  let actual =
    Protocol.encode_response
      (Protocol.Chat_reducer_state { id = "proto_1"; state })
  in
  Alcotest.(check string)
    "chat reducer state"
    "{\"type\":\"chat_reducer_state\",\"id\":\"proto_1\",\"state\":{\"transcript\":[{\"id\":\"system-1\",\"role\":\"system\",\"content\":\"System \
     rules\"},{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"},{\"id\":\"assistant-done-1\",\"role\":\"assistant\",\"content\":\"Done\"}],\"current_turn\":{\"type\":\"no_turn\"}}}"
    actual

let test_chat_reducer_state_encodes_active_turn () =
  let state =
    Chat.initial
    |> reduce
         (Chat.Submit_user_message
            {
              request_id = turn_1;
              user_message_id = user_1;
              assistant_message_id = assistant_1;
              content = "Hello";
            })
    |> reduce
         (Chat.Start_assistant
            { request_id = turn_1; assistant_message_id = assistant_1 })
  in
  let actual =
    Protocol.encode_response
      (Protocol.Chat_reducer_state { id = "proto_1"; state })
  in
  Alcotest.(check string)
    "active turn state"
    "{\"type\":\"chat_reducer_state\",\"id\":\"proto_1\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"streaming\"}}}"
    actual

let test_chat_reducer_state_encodes_failed_turn () =
  let state =
    Chat.initial
    |> reduce
         (Chat.Submit_user_message
            {
              request_id = turn_1;
              user_message_id = user_1;
              assistant_message_id = assistant_1;
              content = "Hello";
            })
    |> reduce
         (Chat.Append_delta
            {
              request_id = turn_1;
              assistant_message_id = assistant_1;
              snapshot = "Partial";
            })
    |> reduce
         (Chat.Fail
            {
              request_id = turn_1;
              assistant_message_id = assistant_1;
              error = runtime_error "Network failed";
            })
  in
  let actual =
    Protocol.encode_response
      (Protocol.Chat_reducer_state { id = "proto_1"; state })
  in
  Alcotest.(check string)
    "failed turn state"
    "{\"type\":\"chat_reducer_state\",\"id\":\"proto_1\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"failed\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"Partial\",\"error\":{\"message\":\"Network \
     failed\"}}}}"
    actual

let cases =
  [
    Alcotest.test_case "valid ping returns matching pong" `Quick
      test_valid_ping_returns_matching_pong;
    Alcotest.test_case "multiple ping lines are independent" `Quick
      test_multiple_ping_lines_are_independent;
    Alcotest.test_case "bad JSON is rejected" `Quick test_bad_json_is_rejected;
    Alcotest.test_case "missing id is rejected" `Quick
      test_missing_id_is_rejected;
    Alcotest.test_case "unknown type is rejected" `Quick
      test_unknown_type_is_rejected;
    Alcotest.test_case "chat reducer action contract is decoded" `Quick
      test_chat_reducer_action_contract_is_decoded;
    Alcotest.test_case "chat reducer action uses turn_request_id" `Quick
      test_chat_reducer_action_uses_turn_request_id;
    Alcotest.test_case "unknown chat reducer action is rejected" `Quick
      test_unknown_chat_reducer_action_is_rejected;
    Alcotest.test_case "chat reducer request requires session handler" `Quick
      test_chat_reducer_request_requires_session_handler;
    Alcotest.test_case "chat reducer state encodes transcript roles and no turn"
      `Quick test_chat_reducer_state_encodes_transcript_roles_and_no_turn;
    Alcotest.test_case "chat reducer state encodes active turn" `Quick
      test_chat_reducer_state_encodes_active_turn;
    Alcotest.test_case "chat reducer state encodes failed turn" `Quick
      test_chat_reducer_state_encodes_failed_turn;
  ]
