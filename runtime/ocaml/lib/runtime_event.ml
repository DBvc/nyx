type t =
  | Runtime_started
  | User_message_received of Message.t
  | Assistant_delta of {
      request_id : string;
      delta : string;
      snapshot : string;
    }
  | Turn_completed of { request_id : string }
  | Runtime_error of { message : string }
