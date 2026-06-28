module Request_id = struct
  type t = Request_id of string

  let of_string value = Request_id value
  let to_string (Request_id value) = value
  let equal (Request_id left) (Request_id right) = String.equal left right
end

module Message_id = struct
  type t = Message_id of string

  let of_string value = Message_id value
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
type state = { transcript : Message.t list; current_turn : current_turn }

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

let initial = { transcript = []; current_turn = No_turn }
