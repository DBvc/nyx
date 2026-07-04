module Chat = Nyx_runtime.Chat
module Protocol = Nyx_runtime.Runtime_protocol

let request_id value =
  match Chat.Request_id.of_string value with
  | Ok request_id -> request_id
  | Error Empty -> invalid_arg "expected non-empty request id"

let message_id value =
  match Chat.Message_id.of_string value with
  | Ok message_id -> message_id
  | Error Empty -> invalid_arg "expected non-empty message id"

let id_constructors_round_trip =
  QCheck.Test.make ~count:200
    ~name:"chat id constructors reject only empty strings" QCheck.string
    (fun value ->
      let request_result =
        match Chat.Request_id.of_string value with
        | Ok request_id ->
            (not (String.equal value ""))
            && String.equal value (Chat.Request_id.to_string request_id)
        | Error Empty -> String.equal value ""
      in
      let message_result =
        match Chat.Message_id.of_string value with
        | Ok message_id ->
            (not (String.equal value ""))
            && String.equal value (Chat.Message_id.to_string message_id)
        | Error Empty -> String.equal value ""
      in
      request_result && message_result)

let submit_complete_has_closed_transcript =
  QCheck.Test.make ~count:200
    ~name:"submit then complete closes turn and preserves transcript order"
    QCheck.(pair string string)
    (fun (user_content, assistant_content) ->
      let request_id = request_id "request-property" in
      let user_message_id = message_id "user-property" in
      let assistant_message_id = message_id "assistant-property" in
      let submitted =
        Chat.reduce Chat.initial
          (Chat.Submit_user_message
             {
               request_id;
               user_message_id;
               assistant_message_id;
               content = user_content;
             })
      in
      let state =
        Chat.reduce submitted
          (Chat.Complete
             {
               request_id;
               assistant_message_id;
               final_content = assistant_content;
             })
      in
      let view = Chat.view state in
      match (view.current_turn, view.transcript) with
      | No_turn, [ user_message; assistant_message ] ->
          Chat.Message_id.equal user_message.id user_message_id
          && user_message.role = User
          && String.equal user_message.content user_content
          && Chat.Message_id.equal assistant_message.id assistant_message_id
          && assistant_message.role = Assistant
          && String.equal assistant_message.content assistant_content
      | _ -> false)

let protocol_ping_round_trips_non_empty_id =
  QCheck.Test.make ~count:200
    ~name:"protocol ping round trips non-empty request ids" QCheck.string
    (fun suffix ->
      let id = "protocol-property:" ^ suffix in
      let request_line =
        Yojson.Basic.to_string
          (`Assoc [ ("type", `String "ping"); ("id", `String id) ])
      in
      match Protocol.handle_request_line request_line with
      | Ok response_line ->
          String.equal response_line
            (Yojson.Basic.to_string
               (`Assoc [ ("type", `String "pong"); ("id", `String id) ]))
      | Error _ -> false)

let cases =
  List.map QCheck_alcotest.to_alcotest
    [
      id_constructors_round_trip;
      submit_complete_has_closed_transcript;
      protocol_ping_round_trips_non_empty_id;
    ]
