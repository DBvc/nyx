module Protocol = Nyx_runtime.Runtime_protocol

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

let check_session_line expected session line =
  match Protocol.handle_session_line session line with
  | Ok (session, actual) ->
      Alcotest.(check string) "session response line" expected actual;
      session
  | Error error -> Alcotest.fail (Protocol.error_to_string error)

let check_session_error expected session line =
  match Protocol.handle_session_line session line with
  | Ok (_, response) ->
      Alcotest.fail ("expected error, got response: " ^ response)
  | Error actual ->
      Alcotest.(check string)
        "session error message" expected
        (Protocol.error_to_string actual)

let submit_user_message_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_action\",\"id\":\"%s\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}"
    id

let start_assistant_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_action\",\"id\":\"%s\",\"action\":\"start_assistant\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\"}"
    id

let append_delta_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_action\",\"id\":\"%s\",\"action\":\"append_delta\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"snapshot\":\"Partial\"}"
    id

let complete_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_action\",\"id\":\"%s\",\"action\":\"complete\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"final_content\":\"Done\"}"
    id

let fail_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_action\",\"id\":\"%s\",\"action\":\"fail\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"error\":{\"message\":\"Network \
     failed\"}}"
    id

let second_submit_user_message_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_action\",\"id\":\"%s\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-2\",\"user_message_id\":\"user-2\",\"assistant_message_id\":\"assistant-2\",\"content\":\"Fresh \
     prompt\"}"
    id

let submitted_state_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_state\",\"id\":\"%s\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"submitted\"}}}"
    id

let streaming_state_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_state\",\"id\":\"%s\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"streaming\"}}}"
    id

let partial_streaming_state_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_state\",\"id\":\"%s\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"Partial\",\"phase\":\"streaming\"}}}"
    id

let completed_state_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_state\",\"id\":\"%s\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"},{\"id\":\"assistant-1\",\"role\":\"assistant\",\"content\":\"Done\"}],\"current_turn\":{\"type\":\"no_turn\"}}}"
    id

let failed_state_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_state\",\"id\":\"%s\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"failed\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"Partial\",\"error\":{\"message\":\"Network \
     failed\"}}}}"
    id

let failed_recovery_submitted_state_line id =
  Printf.sprintf
    "{\"type\":\"chat_reducer_state\",\"id\":\"%s\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"},{\"id\":\"user-2\",\"role\":\"user\",\"content\":\"Fresh \
     prompt\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-2\",\"user_message_id\":\"user-2\",\"assistant_message_id\":\"assistant-2\",\"draft\":\"\",\"phase\":\"submitted\"}}}"
    id

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

let test_chat_reducer_action_rejects_empty_domain_ids () =
  let cases =
    [
      ( "invalid field: turn_request_id",
        "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}"
      );
      ( "invalid field: user_message_id",
        "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}"
      );
      ( "invalid field: assistant_message_id",
        "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"\",\"content\":\"Hello\"}"
      );
    ]
  in
  List.iter (fun (expected, line) -> check_error expected line) cases

let test_unknown_chat_reducer_action_is_rejected () =
  check_error "unknown action: start_turn"
    "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"start_turn\",\"turn_request_id\":\"turn-1\"}"

let test_chat_reducer_request_requires_session_handler () =
  check_error "stateful request requires session"
    "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"clear\"}"

let test_chat_reducer_state_encodes_completed_transcript_and_no_turn () =
  let session =
    check_session_line
      (submitted_state_line "proto_1")
      Protocol.initial_session
      (submit_user_message_line "proto_1")
  in
  let (_ : Protocol.session) =
    check_session_line
      (completed_state_line "proto_2")
      session (complete_line "proto_2")
  in
  ()

let test_chat_reducer_state_encodes_active_turn () =
  let session =
    check_session_line
      (submitted_state_line "proto_1")
      Protocol.initial_session
      (submit_user_message_line "proto_1")
  in
  let (_ : Protocol.session) =
    check_session_line
      (streaming_state_line "proto_2")
      session
      (start_assistant_line "proto_2")
  in
  ()

let test_chat_reducer_state_encodes_failed_turn () =
  let session =
    check_session_line
      (submitted_state_line "proto_1")
      Protocol.initial_session
      (submit_user_message_line "proto_1")
  in
  let session =
    check_session_line
      (partial_streaming_state_line "proto_2")
      session
      (append_delta_line "proto_2")
  in
  let (_ : Protocol.session) =
    check_session_line
      (failed_state_line "proto_3")
      session (fail_line "proto_3")
  in
  ()

let test_session_handler_accepts_new_user_message_after_failed_turn () =
  let session =
    check_session_line
      (submitted_state_line "proto_1")
      Protocol.initial_session
      (submit_user_message_line "proto_1")
  in
  let session =
    check_session_line
      (partial_streaming_state_line "proto_2")
      session
      (append_delta_line "proto_2")
  in
  let session =
    check_session_line
      (failed_state_line "proto_3")
      session (fail_line "proto_3")
  in
  let (_ : Protocol.session) =
    check_session_line
      (failed_recovery_submitted_state_line "proto_4")
      session
      (second_submit_user_message_line "proto_4")
  in
  ()

let test_session_handler_advances_chat_state () =
  let session =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_1\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"submitted\"}}}"
      Protocol.initial_session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}"
  in
  let session =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_2\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"streaming\"}}}"
      session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_2\",\"action\":\"start_assistant\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\"}"
  in
  let session =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_3\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"Partial\",\"phase\":\"streaming\"}}}"
      session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_3\",\"action\":\"append_delta\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"snapshot\":\"Partial\"}"
  in
  let (_ : Protocol.session) =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_4\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"},{\"id\":\"assistant-1\",\"role\":\"assistant\",\"content\":\"Done\"}],\"current_turn\":{\"type\":\"no_turn\"}}}"
      session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_4\",\"action\":\"complete\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\",\"final_content\":\"Done\"}"
  in
  ()

let test_session_handler_ping_does_not_change_chat_state () =
  let session =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_1\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"submitted\"}}}"
      Protocol.initial_session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}"
  in
  let session =
    check_session_line "{\"type\":\"pong\",\"id\":\"ping_1\"}" session
      "{\"type\":\"ping\",\"id\":\"ping_1\"}"
  in
  let (_ : Protocol.session) =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_2\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"streaming\"}}}"
      session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_2\",\"action\":\"start_assistant\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\"}"
  in
  ()

let test_session_handler_stale_action_returns_unchanged_snapshot () =
  let session =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_1\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"submitted\"}}}"
      Protocol.initial_session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}"
  in
  let (_ : Protocol.session) =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_2\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"submitted\"}}}"
      session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_2\",\"action\":\"append_delta\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-stale\",\"snapshot\":\"Ignored\"}"
  in
  ()

let test_session_handler_clear_resets_state () =
  let session =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_1\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"submitted\"}}}"
      Protocol.initial_session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}"
  in
  let (_ : Protocol.session) =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_2\",\"state\":{\"transcript\":[],\"current_turn\":{\"type\":\"no_turn\"}}}"
      session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_2\",\"action\":\"clear\"}"
  in
  ()

let test_session_handler_errors_do_not_advance_state () =
  let session =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_1\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"submitted\"}}}"
      Protocol.initial_session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_1\",\"action\":\"submit_user_message\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"content\":\"Hello\"}"
  in
  check_session_error "unknown action: unknown_action" session
    "{\"type\":\"chat_reducer_action\",\"id\":\"bad_1\",\"action\":\"unknown_action\",\"turn_request_id\":\"turn-1\"}";
  let (_ : Protocol.session) =
    check_session_line
      "{\"type\":\"chat_reducer_state\",\"id\":\"proto_2\",\"state\":{\"transcript\":[{\"id\":\"user-1\",\"role\":\"user\",\"content\":\"Hello\"}],\"current_turn\":{\"type\":\"active\",\"turn_request_id\":\"turn-1\",\"user_message_id\":\"user-1\",\"assistant_message_id\":\"assistant-1\",\"draft\":\"\",\"phase\":\"streaming\"}}}"
      session
      "{\"type\":\"chat_reducer_action\",\"id\":\"proto_2\",\"action\":\"start_assistant\",\"turn_request_id\":\"turn-1\",\"assistant_message_id\":\"assistant-1\"}"
  in
  ()

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
    Alcotest.test_case "chat reducer action rejects empty domain ids" `Quick
      test_chat_reducer_action_rejects_empty_domain_ids;
    Alcotest.test_case "unknown chat reducer action is rejected" `Quick
      test_unknown_chat_reducer_action_is_rejected;
    Alcotest.test_case "chat reducer request requires session handler" `Quick
      test_chat_reducer_request_requires_session_handler;
    Alcotest.test_case
      "chat reducer state encodes completed transcript and no turn" `Quick
      test_chat_reducer_state_encodes_completed_transcript_and_no_turn;
    Alcotest.test_case "chat reducer state encodes active turn" `Quick
      test_chat_reducer_state_encodes_active_turn;
    Alcotest.test_case "chat reducer state encodes failed turn" `Quick
      test_chat_reducer_state_encodes_failed_turn;
    Alcotest.test_case
      "session handler accepts new user message after failed turn" `Quick
      test_session_handler_accepts_new_user_message_after_failed_turn;
    Alcotest.test_case "session handler advances chat state" `Quick
      test_session_handler_advances_chat_state;
    Alcotest.test_case "session handler ping does not change chat state" `Quick
      test_session_handler_ping_does_not_change_chat_state;
    Alcotest.test_case "session handler stale action returns unchanged snapshot"
      `Quick test_session_handler_stale_action_returns_unchanged_snapshot;
    Alcotest.test_case "session handler clear resets state" `Quick
      test_session_handler_clear_resets_state;
    Alcotest.test_case "session handler errors do not advance state" `Quick
      test_session_handler_errors_do_not_advance_state;
  ]
