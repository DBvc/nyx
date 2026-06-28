module Chat = Nyx_runtime.Chat

let request_1 = Chat.Request_id.of_string "request-1"
let request_2 = Chat.Request_id.of_string "request-2"
let stale_request = Chat.Request_id.of_string "request-stale"
let user_1 = Chat.Message_id.of_string "user-1"
let user_2 = Chat.Message_id.of_string "user-2"
let assistant_1 = Chat.Message_id.of_string "assistant-1"
let assistant_stale = Chat.Message_id.of_string "assistant-stale"

let pp_role formatter role =
  Format.pp_print_string formatter
    (match role with
    | Chat.Message.System -> "System"
    | User -> "User"
    | Assistant -> "Assistant")

let role = Alcotest.testable pp_role ( = )

let runtime_error message =
  let open Chat.Runtime_error in
  { message }

let submit ?(request_id = request_1) ?(user_message_id = user_1)
    ?(assistant_message_id = assistant_1) ?(content = "Hello Nyx") state =
  Chat.reduce state
    (Chat.Submit_user_message
       { request_id; user_message_id; assistant_message_id; content })

let start ?(request_id = request_1) ?(assistant_message_id = assistant_1) state
    =
  Chat.reduce state (Chat.Start_assistant { request_id; assistant_message_id })

let delta ?(request_id = request_1) ?(assistant_message_id = assistant_1)
    ?(snapshot = "Partial response") state =
  Chat.reduce state
    (Chat.Append_delta { request_id; assistant_message_id; snapshot })

let complete ?(request_id = request_1) ?(assistant_message_id = assistant_1)
    ?(final_content = "Final response") state =
  Chat.reduce state
    (Chat.Complete { request_id; assistant_message_id; final_content })

let cancel ?(request_id = request_1) ?(assistant_message_id = assistant_1)
    ?(final_content = "Partial response") state =
  Chat.reduce state
    (Chat.Cancel { request_id; assistant_message_id; final_content })

let fail ?(request_id = request_1) ?(assistant_message_id = assistant_1)
    ?(error = runtime_error "Network failed.") state =
  Chat.reduce state (Chat.Fail { request_id; assistant_message_id; error })

let retry ?(request_id = request_2) state =
  Chat.reduce state (Chat.Retry_failed { request_id })

let clear state = Chat.reduce state Chat.Clear
let submitted_state () = submit Chat.initial
let streaming_state () = submitted_state () |> start

let active_with_draft () =
  streaming_state () |> delta ~snapshot:"Partial response"

let transcript state =
  let open Chat in
  state.transcript

let current_turn state =
  let open Chat in
  state.current_turn

let transcript_summary state =
  List.map
    (fun (message : Chat.Message.t) ->
      let open Chat.Message in
      (message.role, message.content))
    (transcript state)

let check_transcript expected state =
  Alcotest.(check (list (pair role string)))
    "transcript" expected (transcript_summary state)

let check_no_turn state =
  match current_turn state with
  | Chat.No_turn -> ()
  | Active _ -> Alcotest.fail "expected no current turn, got active turn"
  | Failed _ -> Alcotest.fail "expected no current turn, got failed turn"

let check_active ?(request_id = request_1) ?(user_message_id = user_1)
    ?(assistant_message_id = assistant_1) ?(phase = Chat.Submitted)
    ?(draft = "") state =
  match current_turn state with
  | Chat.Active turn ->
      let open Chat in
      Alcotest.(check bool)
        "request id" true
        (Request_id.equal request_id turn.request_id);
      Alcotest.(check bool)
        "user message id" true
        (Message_id.equal user_message_id turn.user_message_id);
      Alcotest.(check bool)
        "assistant message id" true
        (Message_id.equal assistant_message_id turn.assistant_message_id);
      Alcotest.(check bool) "phase" true (turn.phase = phase);
      Alcotest.(check string) "draft" draft turn.draft
  | No_turn -> Alcotest.fail "expected active turn, got no turn"
  | Failed _ -> Alcotest.fail "expected active turn, got failed turn"

let check_failed ?(request_id = request_1) ?(user_message_id = user_1)
    ?(assistant_message_id = assistant_1) ?(draft = "Partial response")
    ?(error_message = "Network failed.") state =
  match current_turn state with
  | Chat.Failed turn ->
      let open Chat in
      Alcotest.(check bool)
        "request id" true
        (Request_id.equal request_id turn.request_id);
      Alcotest.(check bool)
        "user message id" true
        (Message_id.equal user_message_id turn.user_message_id);
      Alcotest.(check bool)
        "assistant message id" true
        (Message_id.equal assistant_message_id turn.assistant_message_id);
      Alcotest.(check string) "draft" draft turn.draft;
      let open Runtime_error in
      Alcotest.(check string) "error message" error_message turn.error.message
  | No_turn -> Alcotest.fail "expected failed turn, got no turn"
  | Active _ -> Alcotest.fail "expected failed turn, got active turn"

let check_no_op label state action =
  Alcotest.(check bool) label true (Chat.reduce state action = state)

let test_submit_creates_single_active_turn () =
  let state = submitted_state () in
  check_transcript [ (Chat.Message.User, "Hello Nyx") ] state;
  check_active state;

  let second_submit =
    Chat.Submit_user_message
      {
        request_id = request_2;
        user_message_id = user_2;
        assistant_message_id = assistant_stale;
        content = "Second message";
      }
  in
  check_no_op "second submit while active" state second_submit

let test_stream_and_complete () =
  let state = active_with_draft () in
  check_active ~phase:Chat.Streaming ~draft:"Partial response" state;

  let state = complete ~final_content:"Final response" state in
  check_transcript
    [ (Chat.Message.User, "Hello Nyx"); (Assistant, "Final response") ]
    state;
  check_no_turn state

let test_illegal_state_and_id_mismatch_are_no_op () =
  let active = active_with_draft () in
  let stale_actions =
    [
      Chat.Start_assistant
        { request_id = stale_request; assistant_message_id = assistant_1 };
      Start_assistant
        { request_id = request_1; assistant_message_id = assistant_stale };
      Start_assistant
        { request_id = request_1; assistant_message_id = assistant_1 };
      Append_delta
        {
          request_id = stale_request;
          assistant_message_id = assistant_1;
          snapshot = "stale";
        };
      Append_delta
        {
          request_id = request_1;
          assistant_message_id = assistant_stale;
          snapshot = "wrong assistant";
        };
      Complete
        {
          request_id = stale_request;
          assistant_message_id = assistant_1;
          final_content = "stale";
        };
      Complete
        {
          request_id = request_1;
          assistant_message_id = assistant_stale;
          final_content = "wrong assistant";
        };
      Cancel
        {
          request_id = stale_request;
          assistant_message_id = assistant_1;
          final_content = "stale";
        };
      Cancel
        {
          request_id = request_1;
          assistant_message_id = assistant_stale;
          final_content = "wrong assistant";
        };
      Fail
        {
          request_id = stale_request;
          assistant_message_id = assistant_1;
          error = runtime_error "stale";
        };
      Fail
        {
          request_id = request_1;
          assistant_message_id = assistant_stale;
          error = runtime_error "wrong assistant";
        };
      Retry_failed { request_id = request_2 };
    ]
  in
  List.iteri
    (fun index action ->
      check_no_op ("active mismatch no-op " ^ string_of_int index) active action)
    stale_actions;

  let no_turn_actions =
    [
      Chat.Start_assistant
        { request_id = request_1; assistant_message_id = assistant_1 };
      Append_delta
        {
          request_id = request_1;
          assistant_message_id = assistant_1;
          snapshot = "no turn";
        };
      Complete
        {
          request_id = request_1;
          assistant_message_id = assistant_1;
          final_content = "no turn";
        };
      Cancel
        {
          request_id = request_1;
          assistant_message_id = assistant_1;
          final_content = "no turn";
        };
      Fail
        {
          request_id = request_1;
          assistant_message_id = assistant_1;
          error = runtime_error "no turn";
        };
      Retry_failed { request_id = request_2 };
    ]
  in
  List.iteri
    (fun index action ->
      check_no_op
        ("no current turn no-op " ^ string_of_int index)
        Chat.initial action)
    no_turn_actions;

  let failed = active |> fail in
  let failed_actions =
    [
      Chat.Submit_user_message
        {
          request_id = request_2;
          user_message_id = user_2;
          assistant_message_id = assistant_stale;
          content = "Second message";
        };
      Start_assistant
        { request_id = request_1; assistant_message_id = assistant_1 };
      Append_delta
        {
          request_id = request_1;
          assistant_message_id = assistant_1;
          snapshot = "after failure";
        };
      Complete
        {
          request_id = request_1;
          assistant_message_id = assistant_1;
          final_content = "after failure";
        };
      Cancel
        {
          request_id = request_1;
          assistant_message_id = assistant_1;
          final_content = "after failure";
        };
      Fail
        {
          request_id = request_1;
          assistant_message_id = assistant_1;
          error = runtime_error "second failure";
        };
    ]
  in
  List.iteri
    (fun index action ->
      check_no_op ("failed turn no-op " ^ string_of_int index) failed action)
    failed_actions

let test_cancel_empty_does_not_append_assistant () =
  let state = active_with_draft () |> cancel ~final_content:"" in
  check_transcript [ (Chat.Message.User, "Hello Nyx") ] state;
  check_no_turn state

let test_cancel_partial_appends_assistant () =
  let state =
    active_with_draft () |> cancel ~final_content:"Partial response"
  in
  check_transcript
    [ (Chat.Message.User, "Hello Nyx"); (Assistant, "Partial response") ]
    state;
  check_no_turn state

let test_fail_keeps_draft_out_of_transcript () =
  let state = active_with_draft () |> fail in
  check_transcript [ (Chat.Message.User, "Hello Nyx") ] state;
  check_failed state

let test_retry_failed_turn_does_not_duplicate_user_message () =
  let state = active_with_draft () |> fail |> retry ~request_id:request_2 in
  check_transcript [ (Chat.Message.User, "Hello Nyx") ] state;
  check_active ~request_id:request_2 ~phase:Chat.Submitted ~draft:"" state

let test_clear_resets_state () =
  let state = active_with_draft () |> clear in
  Alcotest.(check bool) "initial state" true (state = Chat.initial)

let cases =
  [
    Alcotest.test_case "submit creates one active turn" `Quick
      test_submit_creates_single_active_turn;
    Alcotest.test_case "stream and complete" `Quick test_stream_and_complete;
    Alcotest.test_case "illegal states and id mismatches are no-op" `Quick
      test_illegal_state_and_id_mismatch_are_no_op;
    Alcotest.test_case "cancel empty does not append assistant" `Quick
      test_cancel_empty_does_not_append_assistant;
    Alcotest.test_case "cancel partial appends assistant" `Quick
      test_cancel_partial_appends_assistant;
    Alcotest.test_case "fail keeps draft out of transcript" `Quick
      test_fail_keeps_draft_out_of_transcript;
    Alcotest.test_case "retry failed turn does not duplicate user message"
      `Quick test_retry_failed_turn_does_not_duplicate_user_message;
    Alcotest.test_case "clear resets state" `Quick test_clear_resets_state;
  ]
