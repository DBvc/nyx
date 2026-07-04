(* Local NDJSON protocol scaffold for runtime verification only. Electron process
   lifecycle, renderer communication, provider calls, and persistence stay out of
   this module until an explicit boundary task introduces them. *)

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

type session

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

val decode_request_line : string -> (request, error) result
val initial_session : session
val handle_session_line : session -> string -> (session * string, error) result
val handle_request_line : string -> (string, error) result
val error_to_string : error -> string
