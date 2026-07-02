type chat_reducer_action =
  | Submit_user_message of {
      turn_request_id : string;
      user_message_id : string;
      assistant_message_id : string;
      content : string;
    }
  | Start_assistant of {
      turn_request_id : string;
      assistant_message_id : string;
    }
  | Append_delta of {
      turn_request_id : string;
      assistant_message_id : string;
      snapshot : string;
    }
  | Complete of {
      turn_request_id : string;
      assistant_message_id : string;
      final_content : string;
    }
  | Cancel of {
      turn_request_id : string;
      assistant_message_id : string;
      final_content : string;
    }
  | Fail of {
      turn_request_id : string;
      assistant_message_id : string;
      error_message : string;
    }
  | Retry_failed of { turn_request_id : string }
  | Clear

type request =
  | Ping of { id : string }
  | Chat_reducer_action of { id : string; action : chat_reducer_action }

type response =
  | Pong of { id : string }
  | Chat_reducer_state of { id : string; state : Chat.state }

type error =
  | Invalid_json of string
  | Missing_type
  | Invalid_type
  | Unknown_type of string
  | Missing_id
  | Invalid_id
  | Missing_action
  | Invalid_action
  | Unknown_action of string
  | Missing_field of string
  | Invalid_field of string
  | Stateful_request_requires_session

let string_field fields name ~missing ~invalid =
  match List.assoc_opt name fields with
  | None -> Error missing
  | Some (`String value) when value <> "" -> Ok value
  | Some (`String _) -> Error invalid
  | Some _ -> Error invalid

let text_field fields name =
  match List.assoc_opt name fields with
  | None -> Error (Missing_field name)
  | Some (`String value) -> Ok value
  | Some _ -> Error (Invalid_field name)

let object_field fields name =
  match List.assoc_opt name fields with
  | None -> Error (Missing_field name)
  | Some (`Assoc fields) -> Ok fields
  | Some _ -> Error (Invalid_field name)

let non_empty_text_field fields name =
  match text_field fields name with
  | Ok value when value <> "" -> Ok value
  | Ok _ -> Error (Invalid_field name)
  | Error error -> Error error

let decode_error_message fields =
  match object_field fields "error" with
  | Error error -> Error error
  | Ok error_fields -> text_field error_fields "message"

let decode_chat_reducer_action fields = function
  | "submit_user_message" -> (
      match
        ( non_empty_text_field fields "turn_request_id",
          non_empty_text_field fields "user_message_id",
          non_empty_text_field fields "assistant_message_id",
          text_field fields "content" )
      with
      | ( Ok turn_request_id,
          Ok user_message_id,
          Ok assistant_message_id,
          Ok content ) ->
          Ok
            (Submit_user_message
               {
                 turn_request_id;
                 user_message_id;
                 assistant_message_id;
                 content;
               })
      | Error error, _, _, _
      | _, Error error, _, _
      | _, _, Error error, _
      | _, _, _, Error error ->
          Error error)
  | "start_assistant" -> (
      match
        ( non_empty_text_field fields "turn_request_id",
          non_empty_text_field fields "assistant_message_id" )
      with
      | Ok turn_request_id, Ok assistant_message_id ->
          Ok (Start_assistant { turn_request_id; assistant_message_id })
      | Error error, _ | _, Error error -> Error error)
  | "append_delta" -> (
      match
        ( non_empty_text_field fields "turn_request_id",
          non_empty_text_field fields "assistant_message_id",
          text_field fields "snapshot" )
      with
      | Ok turn_request_id, Ok assistant_message_id, Ok snapshot ->
          Ok (Append_delta { turn_request_id; assistant_message_id; snapshot })
      | Error error, _, _ | _, Error error, _ | _, _, Error error -> Error error
      )
  | "complete" -> (
      match
        ( non_empty_text_field fields "turn_request_id",
          non_empty_text_field fields "assistant_message_id",
          text_field fields "final_content" )
      with
      | Ok turn_request_id, Ok assistant_message_id, Ok final_content ->
          Ok (Complete { turn_request_id; assistant_message_id; final_content })
      | Error error, _, _ | _, Error error, _ | _, _, Error error -> Error error
      )
  | "cancel" -> (
      match
        ( non_empty_text_field fields "turn_request_id",
          non_empty_text_field fields "assistant_message_id",
          text_field fields "final_content" )
      with
      | Ok turn_request_id, Ok assistant_message_id, Ok final_content ->
          Ok (Cancel { turn_request_id; assistant_message_id; final_content })
      | Error error, _, _ | _, Error error, _ | _, _, Error error -> Error error
      )
  | "fail" -> (
      match
        ( non_empty_text_field fields "turn_request_id",
          non_empty_text_field fields "assistant_message_id",
          decode_error_message fields )
      with
      | Ok turn_request_id, Ok assistant_message_id, Ok error_message ->
          Ok (Fail { turn_request_id; assistant_message_id; error_message })
      | Error error, _, _ | _, Error error, _ | _, _, Error error -> Error error
      )
  | "retry_failed" -> (
      match non_empty_text_field fields "turn_request_id" with
      | Ok turn_request_id -> Ok (Retry_failed { turn_request_id })
      | Error error -> Error error)
  | "clear" -> Ok Clear
  | action -> Error (Unknown_action action)

let decode_chat_reducer_request fields id =
  match
    string_field fields "action" ~missing:Missing_action ~invalid:Invalid_action
  with
  | Error error -> Error error
  | Ok action -> (
      match decode_chat_reducer_action fields action with
      | Ok action -> Ok (Chat_reducer_action { id; action })
      | Error error -> Error error)

let decode_request_json = function
  | `Assoc fields -> (
      match
        string_field fields "type" ~missing:Missing_type ~invalid:Invalid_type
      with
      | Error error -> Error error
      | Ok "ping" -> (
          match
            string_field fields "id" ~missing:Missing_id ~invalid:Invalid_id
          with
          | Ok id -> Ok (Ping { id })
          | Error error -> Error error)
      | Ok "chat_reducer_action" -> (
          match
            string_field fields "id" ~missing:Missing_id ~invalid:Invalid_id
          with
          | Ok id -> decode_chat_reducer_request fields id
          | Error error -> Error error)
      | Ok message_type -> Error (Unknown_type message_type))
  | _ -> Error (Invalid_json "expected JSON object")

let decode_request_line line =
  try Yojson.Basic.from_string line |> decode_request_json
  with Yojson.Json_error message -> Error (Invalid_json message)

let encode_role = function
  | Chat.Message.System -> "system"
  | User -> "user"
  | Assistant -> "assistant"

let encode_phase = function
  | Chat.Submitted -> "submitted"
  | Streaming -> "streaming"

let encode_message (message : Chat.Message.t) =
  let open Chat.Message in
  `Assoc
    [
      ("id", `String (Chat.Message_id.to_string message.id));
      ("role", `String (encode_role message.role));
      ("content", `String message.content);
    ]

let encode_current_turn = function
  | Chat.No_turn -> `Assoc [ ("type", `String "no_turn") ]
  | Active turn ->
      `Assoc
        [
          ("type", `String "active");
          ( "turn_request_id",
            `String (Chat.Request_id.to_string turn.request_id) );
          ( "user_message_id",
            `String (Chat.Message_id.to_string turn.user_message_id) );
          ( "assistant_message_id",
            `String (Chat.Message_id.to_string turn.assistant_message_id) );
          ("draft", `String turn.draft);
          ("phase", `String (encode_phase turn.phase));
        ]
  | Failed turn ->
      `Assoc
        [
          ("type", `String "failed");
          ( "turn_request_id",
            `String (Chat.Request_id.to_string turn.request_id) );
          ( "user_message_id",
            `String (Chat.Message_id.to_string turn.user_message_id) );
          ( "assistant_message_id",
            `String (Chat.Message_id.to_string turn.assistant_message_id) );
          ("draft", `String turn.draft);
          ( "error",
            `Assoc
              [ ("message", `String turn.error.Chat.Runtime_error.message) ] );
        ]

let encode_chat_state (state : Chat.state) =
  `Assoc
    [
      ("transcript", `List (List.map encode_message state.transcript));
      ("current_turn", encode_current_turn state.current_turn);
    ]

let encode_response = function
  | Pong { id } ->
      `Assoc [ ("type", `String "pong"); ("id", `String id) ]
      |> Yojson.Basic.to_string
  | Chat_reducer_state { id; state } ->
      `Assoc
        [
          ("type", `String "chat_reducer_state");
          ("id", `String id);
          ("state", encode_chat_state state);
        ]
      |> Yojson.Basic.to_string

let response_for_request = function
  | Ping { id } -> Ok (Pong { id })
  | Chat_reducer_action _ -> Error Stateful_request_requires_session

let handle_request_line line =
  match decode_request_line line with
  | Ok request -> (
      match response_for_request request with
      | Ok response -> Ok (encode_response response)
      | Error error -> Error error)
  | Error error -> Error error

let error_to_string = function
  | Invalid_json message -> "invalid JSON: " ^ message
  | Missing_type -> "missing type"
  | Invalid_type -> "invalid type"
  | Unknown_type message_type -> "unknown type: " ^ message_type
  | Missing_id -> "missing id"
  | Invalid_id -> "invalid id"
  | Missing_action -> "missing action"
  | Invalid_action -> "invalid action"
  | Unknown_action action -> "unknown action: " ^ action
  | Missing_field name -> "missing field: " ^ name
  | Invalid_field name -> "invalid field: " ^ name
  | Stateful_request_requires_session -> "stateful request requires session"
