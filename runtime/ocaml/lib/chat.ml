module Request_id = struct
  type t = Request_id of string
  type error = Empty

  let of_string value =
    if String.equal value "" then Error Empty else Ok (Request_id value)

  let unsafe_of_string_for_tests value = Request_id value
  let to_string (Request_id value) = value
  let equal (Request_id left) (Request_id right) = String.equal left right
end

module Message_id = struct
  type t = Message_id of string
  type error = Empty

  let of_string value =
    if String.equal value "" then Error Empty else Ok (Message_id value)

  let unsafe_of_string_for_tests value = Message_id value
  let to_string (Message_id value) = value
  let equal (Message_id left) (Message_id right) = String.equal left right
end

module Runtime_error = struct
  type t = { message : string }
end

module Message = struct
  type role = System | User | Assistant
  type t = { id : Message_id.t; role : role; content : string }
end

type active_phase = Submitted | Streaming

type active_turn = {
  request_id : Request_id.t;
  user_message_id : Message_id.t;
  assistant_message_id : Message_id.t;
  draft : string;
  phase : active_phase;
}

type failed_turn = {
  request_id : Request_id.t;
  user_message_id : Message_id.t;
  assistant_message_id : Message_id.t;
  draft : string;
  error : Runtime_error.t;
}

type current_turn = No_turn | Active of active_turn | Failed of failed_turn
type state = { transcript_ : Message.t list; current_turn_ : current_turn }
type view = { transcript : Message.t list; current_turn : current_turn }

type action =
  | Submit_user_message of {
      request_id : Request_id.t;
      user_message_id : Message_id.t;
      assistant_message_id : Message_id.t;
      content : string;
    }
  | Start_assistant of {
      request_id : Request_id.t;
      assistant_message_id : Message_id.t;
    }
  | Append_delta of {
      request_id : Request_id.t;
      assistant_message_id : Message_id.t;
      snapshot : string;
    }
  | Complete of {
      request_id : Request_id.t;
      assistant_message_id : Message_id.t;
      final_content : string;
    }
  | Cancel of {
      request_id : Request_id.t;
      assistant_message_id : Message_id.t;
      final_content : string;
    }
  | Fail of {
      request_id : Request_id.t;
      assistant_message_id : Message_id.t;
      error : Runtime_error.t;
    }
  | Retry_failed of { request_id : Request_id.t }
  | Clear

let initial = { transcript_ = []; current_turn_ = No_turn }

let view state =
  { transcript = state.transcript_; current_turn = state.current_turn_ }

let active_turn_matches (turn : active_turn) request_id assistant_message_id =
  Request_id.equal turn.request_id request_id
  && Message_id.equal turn.assistant_message_id assistant_message_id

let append_message state message =
  { state with transcript_ = state.transcript_ @ [ message ] }

let user_message id content =
  let open Message in
  { id; role = User; content }

let assistant_message id content =
  let open Message in
  { id; role = Assistant; content }

let reduce state action =
  match action with
  | Submit_user_message
      { request_id; user_message_id; assistant_message_id; content } -> (
      match state.current_turn_ with
      | No_turn ->
          let transcript =
            state.transcript_ @ [ user_message user_message_id content ]
          in
          {
            transcript_ = transcript;
            current_turn_ =
              Active
                {
                  request_id;
                  user_message_id;
                  assistant_message_id;
                  draft = "";
                  phase = Submitted;
                };
          }
      | Active _ | Failed _ -> state)
  | Start_assistant { request_id; assistant_message_id } -> (
      match state.current_turn_ with
      | Active ({ phase = Submitted; _ } as turn)
        when active_turn_matches turn request_id assistant_message_id ->
          { state with current_turn_ = Active { turn with phase = Streaming } }
      | No_turn | Active _ | Failed _ -> state)
  | Append_delta { request_id; assistant_message_id; snapshot } -> (
      match state.current_turn_ with
      | Active turn
        when active_turn_matches turn request_id assistant_message_id ->
          {
            state with
            current_turn_ =
              Active { turn with draft = snapshot; phase = Streaming };
          }
      | No_turn | Active _ | Failed _ -> state)
  | Complete { request_id; assistant_message_id; final_content } -> (
      match state.current_turn_ with
      | Active turn
        when active_turn_matches turn request_id assistant_message_id ->
          let state =
            append_message state
              (assistant_message turn.assistant_message_id final_content)
          in
          { state with current_turn_ = No_turn }
      | No_turn | Active _ | Failed _ -> state)
  | Cancel { request_id; assistant_message_id; final_content } -> (
      match state.current_turn_ with
      | Active turn
        when active_turn_matches turn request_id assistant_message_id ->
          let state =
            if String.equal final_content "" then state
            else
              append_message state
                (assistant_message turn.assistant_message_id final_content)
          in
          { state with current_turn_ = No_turn }
      | No_turn | Active _ | Failed _ -> state)
  | Fail { request_id; assistant_message_id; error } -> (
      match state.current_turn_ with
      | Active turn
        when active_turn_matches turn request_id assistant_message_id ->
          {
            state with
            current_turn_ =
              Failed
                {
                  request_id = turn.request_id;
                  user_message_id = turn.user_message_id;
                  assistant_message_id = turn.assistant_message_id;
                  draft = turn.draft;
                  error;
                };
          }
      | No_turn | Active _ | Failed _ -> state)
  | Retry_failed { request_id } -> (
      match state.current_turn_ with
      | Failed turn ->
          {
            state with
            current_turn_ =
              Active
                {
                  request_id;
                  user_message_id = turn.user_message_id;
                  assistant_message_id = turn.assistant_message_id;
                  draft = "";
                  phase = Submitted;
                };
          }
      | No_turn | Active _ -> state)
  | Clear -> initial
