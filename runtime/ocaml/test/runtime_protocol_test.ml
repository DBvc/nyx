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
  ]
