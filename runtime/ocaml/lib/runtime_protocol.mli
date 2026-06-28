type request = Ping of { id : string }
type response = Pong of { id : string }

type error =
  | Invalid_json of string
  | Missing_type
  | Invalid_type
  | Unknown_type of string
  | Missing_id
  | Invalid_id

val decode_request_line : string -> (request, error) result
val encode_response : response -> string
val response_for_request : request -> response
val handle_request_line : string -> (string, error) result
val error_to_string : error -> string
