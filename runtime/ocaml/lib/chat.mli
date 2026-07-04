module Request_id : sig
  type t
  type error = Empty

  val of_string : string -> (t, error) result

  (* Test fixture helper. Production code should use [of_string]. *)
  val unsafe_of_string_for_tests : string -> t
  val to_string : t -> string
  val equal : t -> t -> bool
end

module Message_id : sig
  type t
  type error = Empty

  val of_string : string -> (t, error) result

  (* Test fixture helper. Production code should use [of_string]. *)
  val unsafe_of_string_for_tests : string -> t
  val to_string : t -> string
  val equal : t -> t -> bool
end

module Runtime_error : sig
  type t = { message : string }
end

module Message : sig
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
type state
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
      (* Full assistant draft snapshot, not an incremental text fragment. *)
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

val initial : state
val view : state -> view

(* Invalid, stale, or out-of-phase actions are ignored and return the unchanged
   state. *)
val reduce : state -> action -> state
